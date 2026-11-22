-- INDISPONIBILITÉS du coach — migration 004 : additive. Nécessite 001 et 003.
-- Réutilise la table calendar_exceptions (créée en 001) : une ligne = une plage où le coach n'est pas disponible.

-- 1) Impossible de créer ou déplacer une séance sur une indisponibilité (code 23P01 : même traitement qu'un conflit d'horaire)
create or replace function public.sessions_block_unavailability() returns trigger language plpgsql as $$
begin
  if new.status <> 'cancelled' and exists (
    select 1 from public.calendar_exceptions e where tstzrange(e.starts_at, e.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'Créneau en conflit avec une indisponibilité' using errcode = '23P01';
  end if;
  return new;
end $$;
drop trigger if exists trg_sessions_unavailability on public.sessions;
create trigger trg_sessions_unavailability before insert or update of starts_at, ends_at on public.sessions
  for each row execute function public.sessions_block_unavailability();

-- 2) Les créneaux publics qui chevauchent une indisponibilité disparaissent de la réservation
create or replace view public.public_slots as
select s.id, ct.code as course_code, ct.label as course_label,
       s.starts_at, s.ends_at, s.booking_mode, s.court_secured,
       s.capacity, s.capacity - public.seats_taken(s.id) as seats_left,
       s.price_per_person_cents
from public.sessions s
join public.course_types ct on ct.id = s.course_type_id
where s.status = 'open' and s.visibility = 'public' and s.starts_at > now() and ct.active
  and not exists (select 1 from public.calendar_exceptions e where tstzrange(e.starts_at, e.ends_at) && tstzrange(s.starts_at, s.ends_at));
