do $t$
declare ct uuid := (select id from public.course_types where code = 'duo'); s1 uuid; s2 uuid; ex uuid;
begin
  insert into public.sessions (course_type_id, starts_at, ends_at, capacity, price_per_person_cents) values (ct, '2027-06-07 08:00+00', '2027-06-07 09:00+00', 2, 3000) returning id into s1;
  insert into public.sessions (course_type_id, starts_at, ends_at, capacity, price_per_person_cents) values (ct, '2027-06-09 08:00+00', '2027-06-09 09:00+00', 2, 3000) returning id into s2;
  insert into public.calendar_exceptions (starts_at, ends_at, reason) values ('2027-06-07 00:00+00', '2027-06-08 00:00+00', 'vacances') returning id into ex;
  perform public.t_assert((select count(*) from public.public_slots where id = s1) = 0, 'indisponibilité : créneau existant masqué de la réservation publique');
  perform public.t_assert((select count(*) from public.public_slots where id = s2) = 1, 'indisponibilité : les autres créneaux restent visibles');
  begin insert into public.sessions (course_type_id, starts_at, ends_at, capacity, price_per_person_cents) values (ct, '2027-06-07 14:00+00', '2027-06-07 15:00+00', 2, 3000); raise exception 'devrait échouer'; exception when exclusion_violation then null; end;
  perform public.t_assert(true, 'indisponibilité : création d''un créneau pendant l''indisponibilité refusée');
  begin perform public.reschedule_session(s2, '2027-06-07 10:00+00', 60); raise exception 'devrait échouer'; exception when exclusion_violation then null; end;
  perform public.t_assert(true, 'indisponibilité : déplacement d''une séance dans l''indisponibilité refusé');
  perform public.t_assert((select status from public.sessions where id = s1) = 'open', 'indisponibilité : séance déjà existante non supprimée (le coach décide)');
  update public.sessions set status = 'cancelled' where id = s1;
  perform public.t_assert((select status from public.sessions where id = s1) = 'cancelled', 'indisponibilité : une séance en conflit peut toujours être annulée');
  delete from public.calendar_exceptions where id = ex;
  insert into public.sessions (course_type_id, starts_at, ends_at, capacity, price_per_person_cents) values (ct, '2027-06-07 14:00+00', '2027-06-07 15:00+00', 2, 3000);
  perform public.t_assert(true, 'indisponibilité : supprimée, les créneaux sont de nouveau possibles');
end $t$;
