-- CAMPAGNES COMMERCIALES (podium événementiel de l'accueil) — migration 011, additive et rejouable.
-- Prérequis : 008 (bons cadeaux). Aucune donnée existante n'est modifiée.
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),                 -- nom interne de la campagne
  eyebrow text check (eyebrow is null or char_length(eyebrow) <= 40),                    -- ex. « Édition Noël 2026 »
  title text not null check (char_length(btrim(title)) between 1 and 90),
  highlight text check (highlight is null or char_length(highlight) <= 30),              -- mot du titre affiché en vert citron
  description text check (description is null or char_length(description) <= 240),
  voucher_product text references public.voucher_products(code) on delete set null,     -- formule présélectionnée ; son prix fait foi
  price_cents int check (price_cents is null or price_cents > 0),                        -- prix affiché si aucune formule n'est liée
  reference_price_cents int check (reference_price_cents is null or reference_price_cents > 0),
  show_reference boolean not null default false,                                         -- afficher le prix de référence barré (à n'activer que s'il est conforme)
  cta_label text not null default 'Offrir ce bon cadeau' check (char_length(btrim(cta_label)) between 1 and 40),
  cta_url text not null default '/bon-cadeau' check (cta_url ~ '^(https://[^ ]+|/([^/ ][^ ]*)?)$' and char_length(cta_url) <= 300),
  reassurance text check (reassurance is null or char_length(reassurance) <= 80),
  media_path text check (media_path is null or char_length(media_path) <= 200),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_on date,
  ends_on date,
  priority int not null default 0 check (priority between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists campaigns_status_idx on public.campaigns (status, priority desc);

create table if not exists public.campaign_stats (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  day date not null,
  impressions int not null default 0,
  clicks int not null default 0,
  primary key (campaign_id, day)
);

-- Attribution des achats : colonne facultative, renseignée seulement quand l'acheteur arrive depuis un podium
alter table public.gift_vouchers add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
create index if not exists gift_vouchers_campaign_idx on public.gift_vouchers (campaign_id) where campaign_id is not null;

-- Mesure d'audience anonyme et agrégée : un compteur par campagne et par jour, aucun identifiant, aucune IP, aucun cookie
create or replace function public.track_campaign(p_id uuid, p_kind text) returns void language plpgsql as $$
begin
  if p_kind not in ('impression', 'click') then raise exception 'Type d''événement invalide' using errcode = 'P0100'; end if;
  if not exists (select 1 from public.campaigns where id = p_id and status = 'published') then return; end if;
  insert into public.campaign_stats (campaign_id, day, impressions, clicks)
  values (p_id, (now() at time zone 'Europe/Paris')::date, (p_kind = 'impression')::int, (p_kind = 'click')::int)
  on conflict (campaign_id, day) do update
    set impressions = public.campaign_stats.impressions + excluded.impressions, clicks = public.campaign_stats.clicks + excluded.clicks;
end $$;

-- Images des campagnes : lecture publique (affichées sur l'accueil), écriture réservée au serveur
insert into storage.buckets (id, name, public) values ('campaign-media', 'campaign-media', true) on conflict (id) do nothing;

alter table public.campaigns enable row level security;
alter table public.campaign_stats enable row level security;
drop policy if exists admin_all on public.campaigns;
create policy admin_all on public.campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.campaign_stats;
create policy admin_all on public.campaign_stats for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on function public.track_campaign(uuid, text) from public, anon, authenticated;
grant execute on function public.track_campaign(uuid, text) to service_role;

-- Première campagne, en BROUILLON : rien n'apparaît sur le site tant qu'elle n'est pas publiée depuis l'administration
insert into public.campaigns (name, eyebrow, title, highlight, description, voucher_product, reference_price_cents, show_reference, cta_label, cta_url, reassurance, status, ends_on, priority)
select 'Offre de Noël 2026', 'Édition Noël 2026', 'Cette année, offrez du padel.', 'padel',
       'Un cadeau original, 5 cours individuels et une expérience sportive personnalisée.',
       'pack5', 22500, false, 'Offrir ce bon cadeau', '/bon-cadeau', 'Bon cadeau personnalisé en PDF', 'draft', date '2026-12-31', 10
where not exists (select 1 from public.campaigns) and exists (select 1 from public.voucher_products where code = 'pack5');
