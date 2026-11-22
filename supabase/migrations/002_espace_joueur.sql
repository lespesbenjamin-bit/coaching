-- ESPACE JOUEUR — migration 002 (additive, non destructive ; nécessite la migration 001)

-- ---------- Profils joueurs ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  level text,                          -- ex. P100
  adult_confirmed_at timestamptz,      -- le joueur certifie avoir 18 ans ou plus
  consent_at timestamptz,              -- consentement au traitement des données de suivi
  consent_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription (Google ou e-mail)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
begin
  insert into public.profiles (user_id, first_name, last_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'first_name', nullif(split_part(v_name, ' ', 1), '')),
          coalesce(new.raw_user_meta_data->>'last_name', nullif(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), '')))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profils pour les comptes déjà existants (dont le tien)
insert into public.profiles (user_id) select id from auth.users on conflict (user_id) do nothing;

-- ---------- Comptes rendus de séance (rédigés par le coach) ----------
create table if not exists public.session_reports (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(user_id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  session_date date not null,
  title text not null,
  summary text,
  strengths text,
  to_work text,
  homework text,
  published boolean not null default false,   -- invisible pour le joueur tant que non publié
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists session_reports_player_idx on public.session_reports (player_id, session_date desc);
create trigger trg_session_reports_updated before update on public.session_reports
  for each row execute function public.set_updated_at();

-- ---------- Objectifs ----------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  status text not null default 'active' check (status in ('active','achieved','abandoned')),
  created_by_role text not null default 'coach' check (created_by_role in ('coach','player')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_player_idx on public.goals (player_id);
create trigger trg_goals_updated before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------- Progression (niveau dans le temps) ----------
create table if not exists public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(user_id) on delete cascade,
  entered_on date not null default current_date,
  level_label text,
  ranking_points int,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists progress_player_idx on public.progress_entries (player_id, entered_on desc);

-- ---------- Tournois (renseignés par le joueur) ----------
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(user_id) on delete cascade,
  name text not null,
  tournament_date date not null,
  category text,
  city text,
  partner text,
  objective text,
  result text,
  feedback text,
  coach_comment text,                  -- réservé au coach
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tournaments_player_idx on public.tournaments (player_id, tournament_date desc);
create trigger trg_tournaments_updated before update on public.tournaments
  for each row execute function public.set_updated_at();

-- Le joueur ne peut pas modifier le commentaire du coach
create or replace function public.protect_coach_comment()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.coach_comment := null; end if;
  elsif not public.is_admin() then
    new.coach_comment := old.coach_comment;
  end if;
  return new;
end $$;
create trigger trg_tournaments_protect before insert or update on public.tournaments
  for each row execute function public.protect_coach_comment();

-- Un joueur ne peut pas changer à qui appartient une ligne
create or replace function public.lock_player_id()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then new.player_id := old.player_id; end if;
  return new;
end $$;
create trigger trg_goals_lock before update on public.goals for each row execute function public.lock_player_id();
create trigger trg_tournaments_lock before update on public.tournaments for each row execute function public.lock_player_id();

-- ---------- Sécurité (RLS) ----------
alter table public.profiles         enable row level security;
alter table public.session_reports  enable row level security;
alter table public.goals            enable row level security;
alter table public.progress_entries enable row level security;
alter table public.tournaments      enable row level security;

-- Profils : chacun voit et modifie le sien ; le coach voit tout
create policy own_select on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy own_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy admin_all  on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Comptes rendus : le joueur lit seulement les siens ET publiés ; le coach gère tout
create policy own_read   on public.session_reports for select to authenticated using (player_id = auth.uid() and published);
create policy admin_all  on public.session_reports for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Progression : lecture seule pour le joueur
create policy own_read   on public.progress_entries for select to authenticated using (player_id = auth.uid());
create policy admin_all  on public.progress_entries for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Objectifs : le joueur lit tous les siens, gère seulement ceux qu'il a créés
create policy own_read   on public.goals for select to authenticated using (player_id = auth.uid());
create policy own_insert on public.goals for insert to authenticated with check (player_id = auth.uid() and created_by_role = 'player');
create policy own_update on public.goals for update to authenticated using (player_id = auth.uid() and created_by_role = 'player') with check (player_id = auth.uid() and created_by_role = 'player');
create policy own_delete on public.goals for delete to authenticated using (player_id = auth.uid() and created_by_role = 'player');
create policy admin_all  on public.goals for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Tournois : le joueur gère les siens
create policy own_all    on public.tournaments for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy admin_all  on public.tournaments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Un joueur connecté peut lire ses propres réservations (via son e-mail vérifié, lié par le serveur)
create policy own_read on public.customers for select to authenticated using (user_id = auth.uid());
create policy own_read on public.bookings  for select to authenticated using (customer_id in (select id from public.customers where user_id = auth.uid()));
