-- BACK-OFFICE (Sprint 2) — migration 003 : additive, non destructive. Nécessite 001 et 002.

-- ============ Paramètres ============
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('cancel_deadline_hours', '24'),
  ('late_cancel_consumes_credit', 'true'),
  ('unjustified_absence_consumes_credit', 'true'),
  ('hold_credit_on_booking', 'true')
on conflict (key) do nothing;

create or replace function public.setting_int(k text, d int) returns int language sql stable as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = k), d) $$;
create or replace function public.setting_bool(k text, d boolean) returns boolean language sql stable as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = k), d) $$;

-- ============ Groupes ============
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  level text,
  capacity int not null default 4 check (capacity >= 1),
  weekday smallint check (weekday between 1 and 7),
  start_time time,
  duration_min int not null default 90 check (duration_min > 0),
  price_per_person_cents int not null default 2500 check (price_per_person_cents >= 0),
  course_type_id uuid references public.course_types(id),
  court_id uuid references public.courts(id),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  status text not null default 'active' check (status in ('active', 'archived', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_groups_updated before update on public.groups for each row execute function public.set_updated_at();

create table if not exists public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
create unique index if not exists group_memberships_active_uniq on public.group_memberships (group_id, customer_id) where status = 'active';

create table if not exists public.group_membership_events (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  event text not null check (event in ('joined', 'left')),
  at timestamptz not null default now()
);
create or replace function public.log_membership_event() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.group_membership_events (group_id, customer_id, event) values (new.group_id, new.customer_id, 'joined');
  elsif old.status = 'active' and new.status = 'left' then
    insert into public.group_membership_events (group_id, customer_id, event) values (new.group_id, new.customer_id, 'left');
  end if;
  return new;
end $$;
create trigger trg_membership_log after insert or update on public.group_memberships for each row execute function public.log_membership_event();

-- ============ Cycles ============
create table if not exists public.training_cycles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  label text,
  sessions_count int not null check (sessions_count between 1 and 60),
  start_date date not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  duration_min int not null check (duration_min > 0),
  excluded_dates date[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'suspended', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ============ Séances (table sessions existante, étendue) ============
alter table public.sessions add column if not exists cycle_id uuid references public.training_cycles(id) on delete set null;
alter table public.sessions add column if not exists cycle_index int;
alter table public.sessions add column if not exists title text;
alter table public.sessions add column if not exists visibility text not null default 'public';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_visibility_check') then
    alter table public.sessions add constraint sessions_visibility_check check (visibility in ('public', 'group_only'));
  end if;
  alter table public.sessions drop constraint if exists sessions_status_check;
  alter table public.sessions add constraint sessions_status_check check (status in ('open', 'blocked', 'cancelled', 'done', 'suspended'));
  if not exists (select 1 from pg_constraint where conname = 'sessions_group_fk') then
    alter table public.sessions add constraint sessions_group_fk foreign key (group_id) references public.groups(id) on delete set null;
  end if;
end $$;
create unique index if not exists sessions_cycle_idx_uniq on public.sessions (cycle_id, cycle_index) where cycle_id is not null;

-- Les séances de groupe privé n'apparaissent pas dans la réservation publique
create or replace view public.public_slots as
select s.id, ct.code as course_code, ct.label as course_label,
       s.starts_at, s.ends_at, s.booking_mode, s.court_secured,
       s.capacity, s.capacity - public.seats_taken(s.id) as seats_left,
       s.price_per_person_cents
from public.sessions s
join public.course_types ct on ct.id = s.course_type_id
where s.status = 'open' and s.visibility = 'public' and s.starts_at > now() and ct.active;

-- ============ Réservations : origine, annulation ============
alter table public.bookings add column if not exists source text not null default 'online';
alter table public.bookings add column if not exists cancelled_late boolean not null default false;
alter table public.bookings add column if not exists cancelled_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_source_check') then
    alter table public.bookings add constraint bookings_source_check check (source in ('online', 'group', 'manual', 'makeup'));
  end if;
  if exists (select 1 from public.bookings where status in ('pending', 'confirmed') group by session_id, customer_id having count(*) > 1) then
    raise notice 'Doublons de réservation existants : index d''unicité non créé';
  else
    create unique index if not exists bookings_active_uniq on public.bookings (session_id, customer_id) where status in ('pending', 'confirmed');
  end if;
end $$;

-- ============ Packs et crédits ============
create table if not exists public.pack_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credits int not null check (credits > 0),
  price_cents int not null default 0 check (price_cents >= 0),
  eligible_course_codes text[] not null default '{individuel,duo,collectif}',
  validity_days int check (validity_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.player_pack_allocations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  pack_id uuid references public.pack_definitions(id),
  name text not null,
  credits_granted int not null check (credits_granted > 0),
  price_cents int not null default 0,
  eligible_course_codes text[] not null default '{individuel,duo,collectif}',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  note text,
  created_by uuid
);
create index if not exists allocations_customer_idx on public.player_pack_allocations (customer_id);

-- Journal des mouvements : en ajout seul, le solde est la somme des mouvements
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  allocation_id uuid references public.player_pack_allocations(id),
  booking_id uuid references public.bookings(id),
  kind text not null check (kind in ('grant', 'hold', 'release', 'consume', 'reverse_consume', 'expire', 'adjust')),
  d_available int not null default 0,
  d_reserved int not null default 0,
  d_consumed int not null default 0,
  d_expired int not null default 0,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint adjust_needs_reason check (kind <> 'adjust' or coalesce(btrim(reason), '') <> '')
);
create index if not exists credit_tx_customer_idx on public.credit_transactions (customer_id);
create index if not exists credit_tx_booking_idx on public.credit_transactions (booking_id);
create index if not exists credit_tx_alloc_idx on public.credit_transactions (allocation_id);

create or replace function public.ledger_append_only() returns trigger language plpgsql as $$
begin raise exception 'Le journal des crédits est en ajout seul : corrigez par un nouveau mouvement' using errcode = 'P0021'; end $$;
create trigger trg_ledger_no_update before update or delete on public.credit_transactions for each row execute function public.ledger_append_only();

create or replace function public.ledger_guard() returns trigger language plpgsql as $$
declare a int; r int;
begin
  perform pg_advisory_xact_lock(hashtext(new.customer_id::text));
  select coalesce(sum(d_available), 0), coalesce(sum(d_reserved), 0) into a, r from public.credit_transactions where customer_id = new.customer_id;
  if a < 0 or r < 0 then raise exception 'Solde de crédits négatif refusé' using errcode = 'P0020'; end if;
  return new;
end $$;
create trigger trg_ledger_guard after insert on public.credit_transactions for each row execute function public.ledger_guard();

create or replace view public.v_credit_balance with (security_invoker = true) as
select customer_id,
       coalesce(sum(d_available), 0)::int as available,
       coalesce(sum(d_reserved), 0)::int as reserved,
       coalesce(sum(d_consumed), 0)::int as consumed,
       coalesce(sum(d_expired), 0)::int as expired,
       coalesce(sum(case when kind = 'grant' then d_available else 0 end), 0)::int as granted
from public.credit_transactions group by customer_id;

-- ============ Présences et rattrapages ============
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  status text not null check (status in ('present', 'absent_justified', 'absent_unjustified', 'cancelled', 'to_makeup')),
  note text,
  marked_by uuid,
  marked_at timestamptz not null default now()
);

create table if not exists public.makeup_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  origin_booking_id uuid not null unique references public.bookings(id),
  status text not null default 'open' check (status in ('open', 'booked', 'done', 'cancelled')),
  makeup_booking_id uuid references public.bookings(id),
  note text,
  created_at timestamptz not null default now()
);

-- ============ Fonctions : crédits ============
create or replace function public.allocation_available(p_alloc uuid) returns int language sql stable as $$
  select coalesce(sum(d_available), 0)::int from public.credit_transactions where allocation_id = p_alloc $$;

create or replace function public.booking_credit_state(p_booking uuid) returns text language sql stable as $$
  select case when coalesce(sum(d_consumed), 0) > 0 then 'consumed'
              when coalesce(sum(d_reserved), 0) > 0 then 'held' else 'none' end
  from public.credit_transactions where booking_id = p_booking $$;

create or replace function public.booking_desired_credit(p_booking uuid) returns text language plpgsql stable as $$
declare b public.bookings%rowtype; s public.sessions%rowtype; a public.attendance_records%rowtype;
begin
  select * into b from public.bookings where id = p_booking;
  select * into s from public.sessions where id = b.session_id;
  select * into a from public.attendance_records where booking_id = b.id;
  if s.status = 'cancelled' then return 'none'; end if;                 -- séance annulée par le coach : jamais consommée
  if a.id is not null then
    return case a.status
      when 'present' then 'consumed'
      when 'absent_unjustified' then case when public.setting_bool('unjustified_absence_consumes_credit', true) then 'consumed' else 'none' end
      else 'none' end;                                                   -- absent justifié, annulé, à rattraper
  end if;
  if b.status = 'confirmed' then return case when public.setting_bool('hold_credit_on_booking', true) then 'held' else 'none' end; end if;
  if b.status = 'completed' then return 'consumed'; end if;
  if b.status = 'cancelled' then return case when b.cancelled_late and public.setting_bool('late_cancel_consumes_credit', true) then 'consumed' else 'none' end; end if;
  return 'none';
end $$;

-- Recalcule l'état du crédit d'une réservation. Idempotent : un deuxième appel n'écrit rien.
create or replace function public.sync_booking_credit(p_booking uuid) returns text language plpgsql as $$
declare b public.bookings%rowtype; s public.sessions%rowtype; code text; cur text; want text; alloc uuid;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then return 'none'; end if;
  perform pg_advisory_xact_lock(hashtext(b.customer_id::text));
  select * into s from public.sessions where id = b.session_id;
  select ct.code into code from public.course_types ct where ct.id = s.course_type_id;
  cur := public.booking_credit_state(b.id);
  want := public.booking_desired_credit(b.id);
  if cur = want then return cur; end if;

  select allocation_id into alloc from public.credit_transactions where booking_id = b.id and allocation_id is not null order by created_at desc, id desc limit 1;

  if cur = 'consumed' then
    insert into public.credit_transactions (customer_id, allocation_id, booking_id, kind, d_available, d_consumed, reason)
    values (b.customer_id, alloc, b.id, 'reverse_consume', 1, -1, 'recalcul');
    cur := 'none';
  elsif cur = 'held' then
    if want = 'consumed' then
      insert into public.credit_transactions (customer_id, allocation_id, booking_id, kind, d_reserved, d_consumed, reason)
      values (b.customer_id, alloc, b.id, 'consume', -1, 1, 'séance réalisée');
      return 'consumed';
    end if;
    insert into public.credit_transactions (customer_id, allocation_id, booking_id, kind, d_available, d_reserved, reason)
    values (b.customer_id, alloc, b.id, 'release', 1, -1, 'libération');
    cur := 'none';
  end if;

  if want = 'none' then return 'none'; end if;

  select a.id into alloc from public.player_pack_allocations a
   where a.customer_id = b.customer_id and a.status = 'active'
     and (a.expires_at is null or a.expires_at >= s.starts_at)
     and code = any (a.eligible_course_codes)
     and public.allocation_available(a.id) > 0
   order by a.expires_at nulls last, a.granted_at limit 1;
  if alloc is null then return 'none'; end if;                           -- aucun crédit disponible : réservation sans crédit

  if want = 'held' then
    insert into public.credit_transactions (customer_id, allocation_id, booking_id, kind, d_available, d_reserved, reason)
    values (b.customer_id, alloc, b.id, 'hold', -1, 1, 'réservation confirmée');
    return 'held';
  end if;
  insert into public.credit_transactions (customer_id, allocation_id, booking_id, kind, d_available, d_consumed, reason)
  values (b.customer_id, alloc, b.id, 'consume', -1, 1, 'séance réalisée');
  return 'consumed';
end $$;

create or replace function public.grant_pack(p_customer uuid, p_pack uuid, p_note text, p_by uuid) returns uuid language plpgsql as $$
declare pk public.pack_definitions%rowtype; v_alloc uuid;
begin
  select * into pk from public.pack_definitions where id = p_pack;
  if not found or not pk.active then raise exception 'Pack inconnu ou inactif' using errcode = 'P0040'; end if;
  perform pg_advisory_xact_lock(hashtext(p_customer::text));
  insert into public.player_pack_allocations (customer_id, pack_id, name, credits_granted, price_cents, eligible_course_codes, expires_at, note, created_by)
  values (p_customer, pk.id, pk.name, pk.credits, pk.price_cents, pk.eligible_course_codes,
          case when pk.validity_days is null then null else now() + make_interval(days => pk.validity_days) end, p_note, p_by)
  returning id into v_alloc;
  insert into public.credit_transactions (customer_id, allocation_id, kind, d_available, reason, created_by)
  values (p_customer, v_alloc, 'grant', pk.credits, coalesce(p_note, 'attribution de pack'), p_by);
  return v_alloc;
end $$;

create or replace function public.adjust_credits(p_customer uuid, p_alloc uuid, p_delta int, p_reason text, p_by uuid) returns void language plpgsql as $$
begin
  if p_alloc is null then raise exception 'Pack à corriger obligatoire' using errcode = 'P0041'; end if;
  perform pg_advisory_xact_lock(hashtext(p_customer::text));
  insert into public.credit_transactions (customer_id, allocation_id, kind, d_available, reason, created_by)
  values (p_customer, p_alloc, 'adjust', p_delta, p_reason, p_by);
end $$;

create or replace function public.expire_credits() returns int language plpgsql as $$
declare r record; v int; n int := 0;
begin
  for r in select id, customer_id from public.player_pack_allocations where status = 'active' and expires_at < now() loop
    perform pg_advisory_xact_lock(hashtext(r.customer_id::text));
    v := public.allocation_available(r.id);
    if v > 0 then
      insert into public.credit_transactions (customer_id, allocation_id, kind, d_available, d_expired, reason)
      values (r.customer_id, r.id, 'expire', -v, v, 'pack expiré');
      n := n + v;
    end if;
  end loop;
  return n;
end $$;

-- ============ Fonctions : groupes, cycles, séances ============
create or replace function public.cycle_dates(p_start date, p_weekday int, p_count int, p_excluded date[])
returns table (idx int, d date) language plpgsql immutable as $$
declare cur date := p_start + ((p_weekday - extract(isodow from p_start)::int + 7) % 7); i int := 0;
begin
  while i < p_count loop
    if not (cur = any (p_excluded)) then i := i + 1; idx := i; d := cur; return next; end if;
    cur := cur + 7;
  end loop;
end $$;

create or replace function public.enroll_member_in_session(p_session uuid, p_customer uuid) returns boolean language plpgsql as $$
declare s public.sessions%rowtype; v_id uuid;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found or s.status not in ('open', 'suspended') then return false; end if;
  if public.seats_taken(s.id) + 1 > s.capacity then return false; end if;
  insert into public.bookings (session_id, customer_id, participants, status, price_total_cents, idempotency_key, source)
  values (s.id, p_customer, 1, 'confirmed', s.price_per_person_cents, 'grp:' || s.id || ':' || p_customer, 'group')
  on conflict do nothing returning id into v_id;
  if v_id is null then return false; end if;
  perform public.sync_booking_credit(v_id);
  return true;
end $$;

create or replace function public.enroll_group_members_in_session(p_session uuid) returns int language plpgsql as $$
declare s public.sessions%rowtype; m record; n int := 0;
begin
  select * into s from public.sessions where id = p_session;
  for m in select customer_id from public.group_memberships where group_id = s.group_id and status = 'active' order by joined_at loop
    if public.enroll_member_in_session(p_session, m.customer_id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.generate_cycle_sessions(p_cycle uuid) returns jsonb language plpgsql as $$
declare c public.training_cycles%rowtype; g public.groups%rowtype; r record; v_start timestamptz; v_sid uuid;
        v_created int := 0; v_existing int := 0; v_conf jsonb := '[]'::jsonb; v_type uuid;
begin
  select * into c from public.training_cycles where id = p_cycle for update;
  if not found then raise exception 'Cycle introuvable' using errcode = 'P0050'; end if;
  select * into g from public.groups where id = c.group_id;
  v_type := coalesce(g.course_type_id, (select id from public.course_types where code = 'collectif'));
  for r in select * from public.cycle_dates(c.start_date, c.weekday, c.sessions_count, c.excluded_dates) loop
    if exists (select 1 from public.sessions where cycle_id = c.id and cycle_index = r.idx) then v_existing := v_existing + 1; continue; end if;
    v_start := (r.d + c.start_time) at time zone 'Europe/Paris';
    begin
      insert into public.sessions (course_type_id, starts_at, ends_at, booking_mode, court_secured, court_id, capacity,
                                   price_per_person_cents, status, group_id, cycle_id, cycle_index, visibility, title)
      values (v_type, v_start, v_start + make_interval(mins => c.duration_min), 'manual', false, g.court_id, g.capacity,
              g.price_per_person_cents, case when c.status = 'suspended' then 'suspended' else 'open' end, g.id, c.id, r.idx,
              case when g.visibility = 'public' then 'public' else 'group_only' end, g.name)
      returning id into v_sid;
      perform public.enroll_group_members_in_session(v_sid);
      v_created := v_created + 1;
    exception when exclusion_violation then
      v_conf := v_conf || to_jsonb(r.d);                                  -- conflit horaire : signalé, jamais perdu en silence
    end;
  end loop;
  return jsonb_build_object('created', v_created, 'existing', v_existing, 'conflicts', v_conf);
end $$;

create or replace function public.extend_cycle(p_cycle uuid, p_extra int) returns jsonb language plpgsql as $$
begin
  update public.training_cycles set sessions_count = least(60, sessions_count + p_extra) where id = p_cycle;
  return public.generate_cycle_sessions(p_cycle);
end $$;

create or replace function public.set_cycle_suspended(p_cycle uuid, p_suspend boolean) returns int language plpgsql as $$
declare n int;
begin
  update public.training_cycles set status = case when p_suspend then 'suspended' else 'active' end where id = p_cycle and status in ('active', 'suspended');
  update public.sessions set status = case when p_suspend then 'suspended' else 'open' end
   where cycle_id = p_cycle and starts_at > now() and status = case when p_suspend then 'open' else 'suspended' end;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.add_group_member(p_group uuid, p_customer uuid) returns jsonb language plpgsql as $$
declare g public.groups%rowtype; s record; n int := 0; full_n int := 0;
begin
  select * into g from public.groups where id = p_group for update;
  if not found then raise exception 'Groupe introuvable' using errcode = 'P0050'; end if;
  if g.status <> 'active' then raise exception 'Groupe inactif' using errcode = 'P0010'; end if;
  if exists (select 1 from public.group_memberships where group_id = p_group and customer_id = p_customer and status = 'active') then
    return jsonb_build_object('already', true);
  end if;
  if (select count(*) from public.group_memberships where group_id = p_group and status = 'active') >= g.capacity then
    raise exception 'Groupe complet' using errcode = 'P0011';
  end if;
  insert into public.group_memberships (group_id, customer_id) values (p_group, p_customer);
  for s in select id from public.sessions where group_id = p_group and starts_at > now() and status in ('open', 'suspended') order by starts_at loop
    if public.enroll_member_in_session(s.id, p_customer) then n := n + 1; else full_n := full_n + 1; end if;
  end loop;
  return jsonb_build_object('already', false, 'enrolled', n, 'not_enrolled', full_n);
end $$;

create or replace function public.remove_group_member(p_group uuid, p_customer uuid) returns int language plpgsql as $$
declare b record; n int := 0;
begin
  update public.group_memberships set status = 'left', left_at = now() where group_id = p_group and customer_id = p_customer and status = 'active';
  for b in select bk.id from public.bookings bk join public.sessions s on s.id = bk.session_id
            where s.group_id = p_group and bk.customer_id = p_customer and bk.source = 'group'
              and bk.status in ('pending', 'confirmed') and s.starts_at > now() loop
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_late = false where id = b.id;
    perform public.sync_booking_credit(b.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.cancel_session(p_session uuid) returns int language plpgsql as $$
declare b record; n int := 0;
begin
  update public.sessions set status = 'cancelled' where id = p_session and status <> 'cancelled';
  for b in select id from public.bookings where session_id = p_session and status in ('pending', 'confirmed') loop
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_late = false where id = b.id;
    perform public.sync_booking_credit(b.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.reschedule_session(p_session uuid, p_start timestamptz, p_duration_min int) returns void language plpgsql as $$
declare s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Séance introuvable' using errcode = 'P0050'; end if;
  update public.sessions set starts_at = p_start,
         ends_at = p_start + make_interval(mins => coalesce(p_duration_min, round(extract(epoch from (s.ends_at - s.starts_at)) / 60)::int))
   where id = p_session;                                                  -- mêmes inscriptions, aucune séance dupliquée
end $$;

create or replace function public.cancel_booking(p_booking uuid, p_force_late boolean default null) returns jsonb language plpgsql as $$
declare b public.bookings%rowtype; s public.sessions%rowtype; v_late boolean;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Réservation introuvable' using errcode = 'P0050'; end if;
  if b.status = 'completed' then raise exception 'Séance déjà réalisée' using errcode = 'P0051'; end if;
  if b.status in ('cancelled', 'refused') then return jsonb_build_object('already', true, 'credit', public.booking_credit_state(b.id)); end if;
  select * into s from public.sessions where id = b.session_id;
  v_late := coalesce(p_force_late, (s.starts_at - now()) < make_interval(hours => public.setting_int('cancel_deadline_hours', 24)));
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_late = v_late where id = b.id;
  return jsonb_build_object('already', false, 'late', v_late, 'credit', public.sync_booking_credit(b.id));
end $$;

-- ============ Fonctions : présences et rattrapages ============
create or replace function public.set_attendance(p_booking uuid, p_status text, p_note text, p_by uuid) returns jsonb language plpgsql as $$
declare b public.bookings%rowtype; e public.makeup_entitlements%rowtype;
begin
  if p_status not in ('present', 'absent_justified', 'absent_unjustified', 'cancelled', 'to_makeup') then
    raise exception 'Statut de présence invalide' using errcode = 'P0052';
  end if;
  select * into b from public.bookings where id = p_booking for update;
  if not found then raise exception 'Réservation introuvable' using errcode = 'P0050'; end if;
  if b.status in ('pending', 'refused') then raise exception 'Réservation non confirmée' using errcode = 'P0053'; end if;

  insert into public.attendance_records (booking_id, status, note, marked_by) values (p_booking, p_status, p_note, p_by)
  on conflict (booking_id) do update set status = excluded.status, note = excluded.note, marked_by = excluded.marked_by, marked_at = now();

  if p_status = 'present' then
    update public.bookings set status = 'completed' where id = p_booking and status = 'confirmed';
  elsif p_status = 'cancelled' then
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_late = false where id = p_booking;
  elsif b.status = 'completed' then
    update public.bookings set status = 'confirmed' where id = p_booking;
  end if;

  if p_status = 'to_makeup' then
    insert into public.makeup_entitlements (customer_id, origin_booking_id) values (b.customer_id, b.id) on conflict (origin_booking_id) do nothing;
  else
    update public.makeup_entitlements set status = 'cancelled' where origin_booking_id = b.id and status = 'open';
  end if;
  if b.source = 'makeup' and p_status = 'present' then
    update public.makeup_entitlements set status = 'done' where makeup_booking_id = b.id and status = 'booked';
  end if;

  return jsonb_build_object('status', p_status, 'credit', public.sync_booking_credit(p_booking));
end $$;

create or replace function public.mark_session_present(p_session uuid, p_by uuid) returns int language plpgsql as $$
declare b record; n int := 0;
begin
  for b in select bk.id from public.bookings bk left join public.attendance_records a on a.booking_id = bk.id
            where bk.session_id = p_session and bk.status = 'confirmed' and a.id is null loop
    perform public.set_attendance(b.id, 'present', null, p_by);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.book_makeup(p_entitlement uuid, p_session uuid) returns uuid language plpgsql as $$
declare e public.makeup_entitlements%rowtype; s public.sessions%rowtype; origin_type uuid; v_id uuid;
begin
  select * into e from public.makeup_entitlements where id = p_entitlement for update;
  if not found or e.status <> 'open' then raise exception 'Rattrapage non disponible' using errcode = 'P0030'; end if;
  select * into s from public.sessions where id = p_session for update;
  if not found or s.status <> 'open' or s.starts_at <= now() then raise exception 'Séance indisponible' using errcode = 'P0031'; end if;
  select se.course_type_id into origin_type from public.bookings bk join public.sessions se on se.id = bk.session_id where bk.id = e.origin_booking_id;
  if s.course_type_id <> origin_type then raise exception 'Type de cours non compatible' using errcode = 'P0032'; end if;
  if public.seats_taken(s.id) + 1 > s.capacity then raise exception 'Séance complète' using errcode = 'P0033'; end if;
  begin
    insert into public.bookings (session_id, customer_id, participants, status, price_total_cents, idempotency_key, source)
    values (s.id, e.customer_id, 1, 'confirmed', 0, 'mk:' || e.id, 'makeup') returning id into v_id;
  exception when unique_violation then
    raise exception 'Joueur déjà inscrit à cette séance' using errcode = 'P0034';
  end;
  update public.makeup_entitlements set status = 'booked', makeup_booking_id = v_id where id = e.id;
  perform public.sync_booking_credit(v_id);
  return v_id;
end $$;

-- ============ Sécurité ============
alter table public.app_settings            enable row level security;
alter table public.groups                  enable row level security;
alter table public.group_memberships       enable row level security;
alter table public.group_membership_events enable row level security;
alter table public.training_cycles         enable row level security;
alter table public.pack_definitions        enable row level security;
alter table public.player_pack_allocations enable row level security;
alter table public.credit_transactions     enable row level security;
alter table public.attendance_records      enable row level security;
alter table public.makeup_entitlements     enable row level security;

do $$ declare t text; begin
  foreach t in array array['app_settings','groups','group_memberships','group_membership_events','training_cycles','pack_definitions',
                           'player_pack_allocations','credit_transactions','attendance_records','makeup_entitlements'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  -- les fonctions de gestion ne sont appelables que par le serveur (service_role)
  for t in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('sync_booking_credit','grant_pack','adjust_credits','expire_credits','cycle_dates',
              'enroll_member_in_session','enroll_group_members_in_session','generate_cycle_sessions','extend_cycle','set_cycle_suspended',
              'add_group_member','remove_group_member','cancel_session','reschedule_session','cancel_booking','set_attendance',
              'mark_session_present','book_makeup','booking_desired_credit','booking_credit_state','allocation_available') loop
    execute format('revoke all on function %s from public, anon, authenticated', t);
    execute format('grant execute on function %s to service_role', t);
  end loop;
end $$;
