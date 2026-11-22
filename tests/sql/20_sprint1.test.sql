-- Régression du Sprint 1 : réservation publique, capacité, conflits, sécurité
do $t$
declare ct uuid := (select id from public.course_types where code = 'individuel'); sa uuid; sb uuid; sc uuid; sd uuid; r record; n int;
begin
  insert into public.sessions (course_type_id, starts_at, ends_at, booking_mode, court_secured, capacity, price_per_person_cents) values (ct, '2027-05-03 08:00+00', '2027-05-03 09:00+00', 'auto', true, 1, 4500) returning id into sa;
  insert into public.sessions (course_type_id, starts_at, ends_at, booking_mode, court_secured, capacity, price_per_person_cents) values (ct, '2027-05-04 08:00+00', '2027-05-04 09:00+00', 'auto', false, 1, 4500) returning id into sb;
  insert into public.sessions (course_type_id, starts_at, ends_at, booking_mode, court_secured, capacity, price_per_person_cents) values (ct, '2027-05-05 08:00+00', '2027-05-05 09:00+00', 'manual', true, 1, 4500) returning id into sc;
  select * into r from public.create_booking(sa, 'A', 'B', 'a@s1.fr', '0600000000', null, null, 1, 's1-key-auto-0000000001');
  perform public.t_assert(r.booking_status = 'confirmed', 'Sprint 1 : auto + terrain sécurisé = confirmée');
  select * into r from public.create_booking(sb, 'A', 'B', 'b@s1.fr', '0600000000', null, null, 1, 's1-key-auto-0000000002');
  perform public.t_assert(r.booking_status = 'pending', 'Sprint 1 : auto sans terrain sécurisé = en attente');
  select * into r from public.create_booking(sc, 'A', 'B', 'c@s1.fr', '0600000000', null, null, 1, 's1-key-auto-0000000003');
  perform public.t_assert(r.booking_status = 'pending', 'Sprint 1 : mode manuel = en attente');
  begin perform public.create_booking(sa, 'X', 'Y', 'x@s1.fr', '0600000000', null, null, 1, 's1-key-auto-0000000004'); raise exception 'devrait échouer'; exception when sqlstate 'P0003' then null; end;
  perform public.t_assert(true, 'Sprint 1 : créneau individuel déjà pris refusé');
  select * into r from public.create_booking(sa, 'A', 'B', 'a@s1.fr', '0600000000', null, null, 1, 's1-key-auto-0000000001');
  perform public.t_assert((select count(*) from public.bookings where session_id = sa) = 1, 'Sprint 1 : même clé = pas de doublon');
  begin insert into public.sessions (course_type_id, starts_at, ends_at, price_per_person_cents) values (ct, '2027-05-03 08:30+00', '2027-05-03 09:30+00', 1); raise exception 'devrait échouer'; exception when exclusion_violation then null; end;
  perform public.t_assert(true, 'Sprint 1 : créneaux qui se chevauchent refusés');
  perform public.t_assert((select count(*) from public.public_slots where id in (sa, sb, sc)) = 3 and (select min(seats_left) from public.public_slots where id in (sa, sb, sc)) = 0, 'Sprint 1 : public_slots expose les créneaux ouverts avec les places restantes (0 = complet)');
  set local role anon;
  begin perform * from public.create_booking(sb, 'Z', 'Z', 'z@s1.fr', '0600000000', null, null, 1, 's1-key-anon-000000001'); raise exception 'devrait échouer'; exception when insufficient_privilege then null; end;
  select count(*) into n from public.bookings;
  reset role;
  perform public.t_assert(n = 0, 'Sprint 1 : un visiteur ne peut ni réserver directement ni lire les réservations');
end $t$;
