-- ESPACE JOUEUR — lot 1 : profil complet. Additive, nécessite 001 à 006.
alter table public.profiles add column if not exists dominant_hand text check (dominant_hand in ('right', 'left'));
alter table public.profiles add column if not exists preferred_side text check (preferred_side in ('right', 'left', 'both'));
alter table public.profiles add column if not exists fft_ranking int check (fft_ranking is null or fft_ranking between 1 and 999999);
alter table public.profiles add column if not exists ranking_source text not null default 'declared' check (ranking_source in ('declared', 'verified'));
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists notify_prefs jsonb not null default '{"booking": true, "reports": true, "tournaments": true}'::jsonb;

-- Un joueur ne peut pas se déclarer « vérifié » : seul le coach le fait.
create or replace function public.profiles_guard() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if new.ranking_source = 'verified' and (tg_op = 'INSERT' or old.ranking_source is distinct from 'verified' or new.fft_ranking is distinct from old.fft_ranking) then
      new.ranking_source := 'declared';
    end if;
    if tg_op = 'UPDATE' and old.ranking_source = 'verified' and new.fft_ranking is distinct from old.fft_ranking then new.ranking_source := 'declared'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before insert or update on public.profiles for each row execute function public.profiles_guard();

-- Photos de profil : stockage privé (accès par URL signée générée côté serveur)
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict (id) do nothing;
