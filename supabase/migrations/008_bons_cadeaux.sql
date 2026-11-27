-- BONS CADEAUX — migration 008, additive. Nécessite 003 (crédits et packs).
create table if not exists public.voucher_products (
  code text primary key,
  label text not null,
  description text,
  credits int not null check (credits > 0),
  price_cents int not null check (price_cents > 0),
  eligible_course_codes text[] not null default '{individuel}',
  voucher_validity_days int not null default 365 check (voucher_validity_days > 0),   -- durée pendant laquelle le bon peut être utilisé
  active boolean not null default true,
  sort int not null default 0
);
insert into public.voucher_products (code, label, description, credits, price_cents, sort) values
  ('single',    '1 cours individuel',                '1 cours individuel de padel avec Benjamin Lespes', 1, 4500, 1),
  ('technique', '3 cours — travail d''un geste technique', '3 cours individuels pour travailler un geste technique précis', 3, 13500, 2),
  ('pack5',     'Pack de 5 cours — offre de Noël',   '5 cours individuels, offre de Noël', 5, 20000, 3)
on conflict (code) do nothing;

create table if not exists public.gift_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{10}$'),
  product_code text not null references public.voucher_products(code),
  label text not null,                       -- copie figée au moment de l'achat
  credits int not null check (credits > 0),
  amount_cents int not null check (amount_cents > 0),
  eligible_course_codes text[] not null default '{individuel}',
  status text not null default 'pending' check (status in ('pending', 'paid', 'redeemed', 'cancelled', 'refunded')),
  source text not null default 'online' check (source in ('online', 'manual')),
  buyer_name text not null,
  buyer_email text not null,
  recipient_name text,
  message text check (message is null or char_length(message) <= 400),
  stripe_session_id text unique,
  stripe_payment_intent text,
  paid_at timestamptz,
  expires_at timestamptz,
  validity_days int not null default 365,
  email_sent_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references public.customers(id),
  allocation_id uuid references public.player_pack_allocations(id),
  refunded_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now()
);
create index if not exists gift_vouchers_status_idx on public.gift_vouchers (status, created_at desc);
create index if not exists gift_vouchers_pi_idx on public.gift_vouchers (stripe_payment_intent);

create or replace function public.create_voucher(p_product text, p_code text, p_buyer_name text, p_buyer_email text, p_recipient text, p_message text, p_manual boolean)
returns uuid language plpgsql as $$
declare pr public.voucher_products%rowtype; v_id uuid;
begin
  select * into pr from public.voucher_products where code = p_product and active;
  if not found then raise exception 'Formule inconnue ou indisponible' using errcode = 'P0090'; end if;
  insert into public.gift_vouchers (code, product_code, label, credits, amount_cents, eligible_course_codes, validity_days, buyer_name, buyer_email, recipient_name, message, source, status, paid_at, expires_at)
  values (p_code, pr.code, pr.label, pr.credits, pr.price_cents, pr.eligible_course_codes, pr.voucher_validity_days, btrim(p_buyer_name), lower(btrim(p_buyer_email)), nullif(btrim(p_recipient), ''), nullif(btrim(p_message), ''),
          case when p_manual then 'manual' else 'online' end,
          case when p_manual then 'paid' else 'pending' end,
          case when p_manual then now() end, case when p_manual then now() + make_interval(days => pr.voucher_validity_days) end)
  returning id into v_id;
  return v_id;
end $$;

-- Paiement confirmé par Stripe : idempotent (un rejeu ne crée rien de plus), contrôle du montant payé
create or replace function public.mark_voucher_paid(p_session text, p_payment_intent text, p_amount int) returns jsonb language plpgsql as $$
declare v public.gift_vouchers%rowtype;
begin
  select * into v from public.gift_vouchers where stripe_session_id = p_session for update;
  if not found then raise exception 'Bon introuvable pour cette session de paiement' using errcode = 'P0050'; end if;
  if v.status <> 'pending' then return jsonb_build_object('id', v.id, 'newly_paid', false, 'status', v.status); end if;
  if p_amount is distinct from v.amount_cents then raise exception 'Montant payé différent du prix du bon' using errcode = 'P0095'; end if;
  update public.gift_vouchers set status = 'paid', paid_at = now(), expires_at = now() + make_interval(days => v.validity_days), stripe_payment_intent = p_payment_intent where id = v.id;
  return jsonb_build_object('id', v.id, 'newly_paid', true, 'status', 'paid');
end $$;

create or replace function public.redeem_voucher(p_code text, p_customer uuid, p_by uuid) returns jsonb language plpgsql as $$
declare v public.gift_vouchers%rowtype; v_alloc uuid; k text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into v from public.gift_vouchers where code = k for update;
  if not found then raise exception 'Code de bon inconnu' using errcode = 'P0091'; end if;
  if v.status = 'redeemed' then raise exception 'Ce bon a déjà été utilisé' using errcode = 'P0092'; end if;
  if v.status <> 'paid' then raise exception 'Ce bon n''est pas utilisable' using errcode = 'P0093'; end if;
  if v.expires_at < now() then raise exception 'Ce bon a expiré' using errcode = 'P0094'; end if;
  perform pg_advisory_xact_lock(hashtext(p_customer::text));
  insert into public.player_pack_allocations (customer_id, pack_id, name, credits_granted, price_cents, eligible_course_codes, expires_at, note, created_by)
  values (p_customer, null, 'Bon cadeau — ' || v.label, v.credits, v.amount_cents, v.eligible_course_codes, null, 'Bon cadeau ' || v.code, p_by) returning id into v_alloc;
  insert into public.credit_transactions (customer_id, allocation_id, kind, d_available, reason, created_by)
  values (p_customer, v_alloc, 'grant', v.credits, 'Bon cadeau ' || v.code, p_by);
  update public.gift_vouchers set status = 'redeemed', redeemed_at = now(), redeemed_by = p_customer, allocation_id = v_alloc where id = v.id;
  return jsonb_build_object('credits', v.credits, 'label', v.label, 'allocation', v_alloc);
end $$;

create or replace function public.cancel_voucher(p_id uuid, p_reason text) returns void language plpgsql as $$
declare v public.gift_vouchers%rowtype;
begin
  select * into v from public.gift_vouchers where id = p_id for update;
  if not found then raise exception 'Bon introuvable' using errcode = 'P0050'; end if;
  if v.status = 'redeemed' then raise exception 'Ce bon a déjà été utilisé' using errcode = 'P0092'; end if;
  update public.gift_vouchers set status = 'cancelled', cancel_reason = nullif(btrim(p_reason), '') where id = p_id;
end $$;

-- Remboursement Stripe : un bon non utilisé devient inutilisable ; un bon déjà utilisé est seulement signalé (le coach tranche)
create or replace function public.mark_voucher_refunded(p_payment_intent text) returns jsonb language plpgsql as $$
declare v public.gift_vouchers%rowtype;
begin
  select * into v from public.gift_vouchers where stripe_payment_intent = p_payment_intent for update;
  if not found then return jsonb_build_object('found', false); end if;
  update public.gift_vouchers set refunded_at = coalesce(refunded_at, now()), status = case when status = 'paid' then 'refunded' else status end where id = v.id;
  return jsonb_build_object('found', true, 'id', v.id, 'was_redeemed', v.status = 'redeemed');
end $$;

alter table public.voucher_products enable row level security;
alter table public.gift_vouchers enable row level security;
drop policy if exists admin_all on public.voucher_products;
create policy admin_all on public.voucher_products for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.gift_vouchers;
create policy admin_all on public.gift_vouchers for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists products_read on public.voucher_products;
create policy products_read on public.voucher_products for select to anon, authenticated using (active);
do $$ declare t text; begin
  for t in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('create_voucher', 'mark_voucher_paid', 'redeem_voucher', 'cancel_voucher', 'mark_voucher_refunded') loop
    execute format('revoke all on function %s from public, anon, authenticated', t);
    execute format('grant execute on function %s to service_role', t);
  end loop;
end $$;
