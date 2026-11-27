-- ACTUALITÉS DU SITE (vitrine événementielle) — migration 009, additive.
create table if not exists public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  kicker text check (kicker is null or char_length(kicker) <= 30),
  title text not null check (char_length(title) between 1 and 80),
  body text check (body is null or char_length(body) <= 240),
  price_label text check (price_label is null or char_length(price_label) <= 40),
  cta_label text check (cta_label is null or char_length(cta_label) <= 30),
  cta_url text check (cta_url is null or cta_url ~ '^(https://|/)[^\s]*$'),
  theme text not null default 'volt' check (theme in ('volt', 'dark', 'paper')),
  starts_on date,
  ends_on date,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check ((cta_label is null) = (cta_url is null))
);
create index if not exists site_announcements_idx on public.site_announcements (active, sort);
alter table public.site_announcements enable row level security;
create policy admin_all on public.site_announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Lecture publique : uniquement les actualités actives dans leur période (dates en heure de Paris)
create policy public_read on public.site_announcements for select to anon, authenticated using (
  active and (starts_on is null or starts_on <= (now() at time zone 'Europe/Paris')::date) and (ends_on is null or ends_on >= (now() at time zone 'Europe/Paris')::date));
