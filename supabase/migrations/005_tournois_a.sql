-- MODULE TOURNOIS — phase A : catalogue, clubs, favoris, participations. Migration 005, additive. Nécessite 001 à 004.
-- Les tournois saisis par les joueurs (table "tournaments", migration 002) sont recopiés ici ; l'ancienne table n'est pas supprimée.

-- ============ Référentiels configurables ============
create table if not exists public.tournament_categories (
  code text primary key, label text not null, sort_order int not null default 0, active boolean not null default true
);
insert into public.tournament_categories (code, label, sort_order) values
  ('P25','P25',1),('P50','P50',2),('P100','P100',3),('P250','P250',4),('P500','P500',5),('P1000','P1000',6),('P1500','P1500',7),('P2000','P2000',8)
on conflict (code) do nothing;

create table if not exists public.tournament_formats (
  code text primary key, label text not null, sort_order int not null default 0, active boolean not null default true
);
insert into public.tournament_formats (code, label, sort_order) values
  ('hommes','Messieurs',1),('dames','Dames',2),('mixte','Mixte',3),('jeunes','Jeunes',4),('veterans','Vétérans',5)
on conflict (code) do nothing;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text, address text,
  latitude numeric(9,6), longitude numeric(9,6),           -- facultatifs : filtre « distance » futur
  created_at timestamptz not null default now()
);
create unique index if not exists clubs_name_city_uniq on public.clubs (lower(name), lower(coalesce(city, '')));

-- ============ Catalogue commun ============
create table if not exists public.tournament_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  club_id uuid references public.clubs(id),
  address text, city text,
  start_date date not null,
  end_date date,
  category_code text references public.tournament_categories(code),
  format_code text references public.tournament_formats(code),
  registration_info text,
  registration_deadline date,
  official_url text,
  coach_comment text,
  source text not null default 'manual' check (source in ('manual', 'imported', 'verified')),
  source_ref text,                                          -- fichier d'import, nom de la source autorisée…
  external_id text,
  publication text not null default 'published' check (publication in ('published', 'proposed')),   -- proposed = suggéré par un joueur, à valider
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'finished')),
  dedupe_key text generated always as (lower(regexp_replace(name, '[^A-Za-z0-9]', '', 'g')) || '|' || (start_date - date '2000-01-01')::text) stored,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create unique index if not exists tournament_events_dedupe_uniq on public.tournament_events (dedupe_key, coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists tournament_events_date_idx on public.tournament_events (start_date);
create trigger trg_tournament_events_updated before update on public.tournament_events for each row execute function public.set_updated_at();

create table if not exists public.tournament_favorites (
  tournament_id uuid not null references public.tournament_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

-- ============ Participations (référentiel joueurs = customers) ============
create table if not exists public.tournament_participations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournament_events(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  status text not null default 'interested' check (status in ('interested', 'planned', 'declared', 'confirmed', 'finished', 'cancelled')),
  partner_customer_id uuid references public.customers(id),
  partner_name text,
  declared_by text not null default 'player' check (declared_by in ('player', 'coach')),
  confirmation_source text,                                 -- obligatoire pour « confirmée »
  player_objective text,                                    -- repris de l'ancien module (objectif saisi par le joueur)
  result_text text,
  player_feedback text,
  coach_comment text,                                       -- réservé au coach
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, customer_id),
  constraint confirmed_needs_source check (status <> 'confirmed' or coalesce(btrim(confirmation_source), '') <> '')
);
create index if not exists participations_customer_idx on public.tournament_participations (customer_id);
create trigger trg_participations_updated before update on public.tournament_participations for each row execute function public.set_updated_at();

create table if not exists public.participation_status_history (
  id bigint generated always as identity primary key,
  participation_id uuid not null references public.tournament_participations(id) on delete cascade,
  old_status text, new_status text not null,
  changed_by uuid, changed_at timestamptz not null default now()
);
create or replace function public.log_participation_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.participation_status_history (participation_id, old_status, new_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_participation_log after insert or update on public.tournament_participations for each row execute function public.log_participation_status();

-- Un joueur ne peut ni confirmer une inscription, ni écrire la source de confirmation, ni modifier la note du coach
create or replace function public.participation_guard() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if new.status = 'confirmed' then raise exception 'Seule une source fiable peut confirmer une inscription' using errcode = 'P0060'; end if;
    if tg_op = 'INSERT' then
      if new.coach_comment is not null or new.confirmation_source is not null then raise exception 'Champ réservé au coach' using errcode = 'P0061'; end if;
      new.declared_by := 'player';
    else
      if new.coach_comment is distinct from old.coach_comment or new.confirmation_source is distinct from old.confirmation_source
         or new.customer_id <> old.customer_id or new.tournament_id <> old.tournament_id then
        raise exception 'Champ réservé au coach' using errcode = 'P0061';
      end if;
      if old.status = 'confirmed' and new.status <> 'confirmed' and new.status not in ('cancelled', 'finished') then
        raise exception 'Inscription confirmée : contactez votre coach pour la modifier' using errcode = 'P0062';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_participation_guard before insert or update on public.tournament_participations for each row execute function public.participation_guard();

-- ============ Rattachement compte ⇄ fiche (un seul référentiel) ============
create or replace function public.ensure_customer_for_user(p_user uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text; p public.profiles%rowtype;
begin
  select id into v_id from public.customers where user_id = p_user limit 1;
  if v_id is not null then return v_id; end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then return null; end if;
  select * into p from public.profiles where user_id = p_user;
  update public.customers set user_id = p_user where lower(email) = v_email and user_id is null returning id into v_id;
  if v_id is not null then return v_id; end if;
  insert into public.customers (user_id, first_name, last_name, email, phone, level)
  values (p_user, coalesce(nullif(p.first_name, ''), 'Joueur'), coalesce(nullif(p.last_name, ''), '—'), v_email, coalesce(p.phone, ''), p.level)
  on conflict (email) do nothing returning id into v_id;
  return v_id;
end $$;

-- ============ Reprise des tournois saisis par les joueurs (table 002) ============
do $$ declare r record; v_cust uuid; v_ev uuid; v_status text; begin
  if to_regclass('public.tournaments') is not null then
    for r in select * from public.tournaments loop
      v_cust := public.ensure_customer_for_user(r.player_id);
      continue when v_cust is null;
      insert into public.tournament_events (name, start_date, city, category_code, source, source_ref, publication, created_by)
      values (r.name, r.tournament_date, r.city, (select code from public.tournament_categories where code = upper(btrim(r.category))), 'manual', 'reprise module 002', 'published', r.player_id)
      on conflict do nothing;
      select id into v_ev from public.tournament_events
       where dedupe_key = lower(regexp_replace(r.name, '[^A-Za-z0-9]', '', 'g')) || '|' || (r.tournament_date - date '2000-01-01')::text order by (club_id is null) desc limit 1;
      continue when v_ev is null;
      v_status := case when r.tournament_date < current_date then 'finished' else 'planned' end;
      insert into public.tournament_participations (tournament_id, customer_id, status, partner_name, player_objective, result_text, player_feedback, coach_comment)
      values (v_ev, v_cust, v_status, r.partner, r.objective, r.result, r.feedback, r.coach_comment)
      on conflict (tournament_id, customer_id) do nothing;
    end loop;
  end if;
end $$;

-- ============ Sécurité ============
alter table public.tournament_categories         enable row level security;
alter table public.tournament_formats            enable row level security;
alter table public.clubs                         enable row level security;
alter table public.tournament_events             enable row level security;
alter table public.tournament_favorites          enable row level security;
alter table public.tournament_participations     enable row level security;
alter table public.participation_status_history  enable row level security;

create policy admin_all on public.tournament_categories        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.tournament_formats           for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.clubs                        for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.tournament_events            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.tournament_favorites         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.tournament_participations    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.participation_status_history for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy player_read on public.tournament_categories for select to authenticated using (true);
create policy player_read on public.tournament_formats    for select to authenticated using (true);
create policy player_read on public.clubs                 for select to authenticated using (true);
create policy player_read on public.tournament_events    for select to authenticated using (publication = 'published' or created_by = auth.uid());
create policy player_propose on public.tournament_events for insert to authenticated with check (publication = 'proposed' and source = 'manual' and created_by = auth.uid());

create policy own_all on public.tournament_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_read   on public.tournament_participations for select to authenticated using (customer_id in (select id from public.customers where user_id = auth.uid()));
create policy own_insert on public.tournament_participations for insert to authenticated with check (customer_id in (select id from public.customers where user_id = auth.uid()) and declared_by = 'player');
create policy own_update on public.tournament_participations for update to authenticated using (customer_id in (select id from public.customers where user_id = auth.uid())) with check (customer_id in (select id from public.customers where user_id = auth.uid()));
create policy own_hist   on public.participation_status_history for select to authenticated using (participation_id in (select p.id from public.tournament_participations p join public.customers c on c.id = p.customer_id where c.user_id = auth.uid()));

revoke all on function public.ensure_customer_for_user(uuid) from public, anon, authenticated;
grant execute on function public.ensure_customer_for_user(uuid) to service_role;
