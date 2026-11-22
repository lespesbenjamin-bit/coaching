do $t$
declare
  c1 uuid := public.t_cust('C1'); c2 uuid := public.t_cust('C2'); c3 uuid := public.t_cust('C3'); c4 uuid := public.t_cust('C4'); c5 uuid := public.t_cust('C5');
  g uuid; g2 uuid; g3 uuid; cyc uuid; cyc2 uuid; cyc3 uuid; pk10 uuid; pk5 uuid; a1 uuid; a2 uuid; a3 uuid;
  r jsonb; n int; n2 int; bk1 uuid; bk2 uuid; bk3 uuid; s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; smk uuid; snear uuid; ent uuid; mk uuid;
  v_type uuid := (select id from public.course_types where code = 'collectif');
begin
  -- ===== Groupes =====
  insert into public.groups (name, level, capacity, weekday, start_time, duration_min, visibility)
    values ('Collectif lundi 18h', 'P100', 4, 1, '18:00', 90, 'private') returning id into g;
  perform public.add_group_member(g, c1); perform public.add_group_member(g, c2); perform public.add_group_member(g, c3); perform public.add_group_member(g, c4);
  perform public.t_assert((select count(*) from public.group_memberships where group_id = g and status = 'active') = 4, 'groupe : 4 membres ajoutés');
  begin perform public.add_group_member(g, c5); raise exception 'devrait échouer'; exception when sqlstate 'P0011' then null; end;
  perform public.t_assert(true, 'groupe : 5e joueur refusé (groupe complet)');
  r := public.add_group_member(g, c1);
  perform public.t_assert((r->>'already')::boolean and (select count(*) from public.group_memberships where group_id = g and status = 'active') = 4, 'groupe : ré-ajout du même joueur sans doublon');
  perform public.t_assert((select count(*) from public.group_membership_events where group_id = g and event = 'joined') = 4, 'groupe : historique des arrivées enregistré');

  -- ===== Packs =====
  insert into public.pack_definitions (name, credits, price_cents) values ('Pack 10', 10, 22500) returning id into pk10;
  insert into public.pack_definitions (name, credits, price_cents) values ('Pack 5', 5, 12500) returning id into pk5;
  a1 := public.grant_pack(c1, pk10, 'test', null); a2 := public.grant_pack(c2, pk5, 'test', null);
  perform public.t_assert(public.t_bal(c1) = '10/0/0/0' and public.t_bal(c2) = '5/0/0/0', 'packs : crédits attribués (10 et 5)');

  -- ===== Cycle de 10 séances =====
  insert into public.training_cycles (group_id, sessions_count, start_date, weekday, start_time, duration_min, excluded_dates)
    values (g, 10, '2027-01-04', 1, '18:00', 90, array['2027-01-18', '2027-02-01']::date[]) returning id into cyc;
  r := public.generate_cycle_sessions(cyc);
  perform public.t_assert((r->>'created')::int = 10 and (r->>'existing')::int = 0 and jsonb_array_length(r->'conflicts') = 0, 'cycle : 10 séances générées sans conflit');
  perform public.t_assert((select starts_at from public.sessions where cycle_id = cyc and cycle_index = 1) = '2027-01-04 17:00:00+00', 'cycle : 1re séance lundi 4 janvier 18h Paris (17h UTC)');
  perform public.t_assert((select starts_at from public.sessions where cycle_id = cyc and cycle_index = 3) = '2027-01-25 17:00:00+00', 'cycle : dates exclues (18 janv., 1er fév.) sautées');
  perform public.t_assert((select starts_at from public.sessions where cycle_id = cyc and cycle_index = 10) = '2027-03-22 17:00:00+00', 'cycle : 10e séance le 22 mars');
  r := public.generate_cycle_sessions(cyc);
  perform public.t_assert((r->>'created')::int = 0 and (r->>'existing')::int = 10 and (select count(*) from public.sessions where cycle_id = cyc) = 10, 'cycle : relancer la génération ne crée aucun doublon');
  select id into s1 from public.sessions where cycle_id = cyc and cycle_index = 1;
  select id into s2 from public.sessions where cycle_id = cyc and cycle_index = 2;
  select id into s3 from public.sessions where cycle_id = cyc and cycle_index = 3;
  select id into s4 from public.sessions where cycle_id = cyc and cycle_index = 4;
  select id into s5 from public.sessions where cycle_id = cyc and cycle_index = 5;
  perform public.t_assert((select bool_and(public.seats_taken(id) = 4) from public.sessions where cycle_id = cyc), 'cycle : chaque séance liée aux 4 inscrits du groupe');
  perform public.t_assert((select count(*) from public.public_slots where id in (select id from public.sessions where cycle_id = cyc)) = 0, 'agenda : séances de groupe privé absentes de la réservation publique');

  -- ===== Crédits à l'inscription =====
  perform public.t_assert(public.t_bal(c1) = '0/10/0/0' and public.t_inv(c1), 'crédits : c1 immobilise 10 crédits (10 séances) — conservation OK');
  perform public.t_assert(public.t_bal(c2) = '0/5/0/0' and public.t_inv(c2), 'crédits : c2 (pack de 5) immobilise 5 crédits, pas plus');
  perform public.t_assert((select count(*) from public.credit_transactions where customer_id = c3) = 0, 'crédits : joueur sans pack = aucune écriture');
  select count(*) into n from public.credit_transactions;
  perform public.sync_booking_credit(b.id) from public.bookings b where b.customer_id in (c1, c2, c3);
  select count(*) into n2 from public.credit_transactions;
  perform public.t_assert(n = n2, 'crédits : recalcul répété = aucune nouvelle écriture (idempotent)');

  -- ===== Présences =====
  perform public.t_assert(public.mark_session_present(s1, null) = 4, 'présences : « tous présents » sur la 1re séance (4 joueurs)');
  perform public.t_assert(public.mark_session_present(s1, null) = 0, 'présences : « tous présents » rejoué = aucun effet');
  perform public.validate_session(s1, null, null);
  perform public.t_assert(public.t_bal(c1) = '0/9/1/0' and public.t_bal(c2) = '0/4/1/0', 'crédits : présence = 1 crédit consommé (c1 et c2)');
  select id into bk1 from public.bookings where session_id = s1 and customer_id = c1;
  perform public.record_attendance(bk1, 'present', null, null, null, 'test'); perform public.record_attendance(bk1, 'present', null, null, null, 'test');
  perform public.t_assert(public.t_bal(c1) = '0/9/1/0', 'crédits : présence enregistrée 2 fois = pas de double consommation');
  perform public.t_assert((select count(*) from public.credit_transactions where booking_id = bk1 and kind = 'consume') = 1, 'crédits : une seule écriture « consume » pour la séance');

  -- changement de présence : recalcul sans doublon
  perform public.record_attendance(bk1, 'absent_justified', 'free', 'malade', null, 'test');
  perform public.t_assert(public.t_bal(c1) = '1/9/0/0' and public.t_inv(c1), 'absence justifiée : crédit rendu (1 disponible), rien consommé');
  perform public.record_attendance(bk1, 'to_makeup', 'free', null, null, 'test');
  perform public.t_assert((select count(*) from public.makeup_entitlements where origin_booking_id = bk1 and status = 'open') = 1, 'rattrapage : droit créé pour la séance à rattraper');
  perform public.record_attendance(bk1, 'to_makeup', 'free', null, null, 'test');
  perform public.t_assert((select count(*) from public.makeup_entitlements where origin_booking_id = bk1) = 1, 'rattrapage : pas de doublon si marqué deux fois');

  -- ===== Rattrapage =====
  insert into public.sessions (course_type_id, starts_at, ends_at, booking_mode, court_secured, capacity, price_per_person_cents, visibility)
    values (v_type, '2027-01-06 17:00+00', '2027-01-06 18:30+00', 'auto', true, 4, 2500, 'public') returning id into smk;
  select id into ent from public.makeup_entitlements where origin_booking_id = bk1;
  mk := public.book_makeup(ent, smk);
  perform public.t_assert((select status from public.makeup_entitlements where id = ent) = 'booked' and public.t_bal(c1) = '0/10/0/0', 'rattrapage : inscrit sur une autre séance, crédit réservé de nouveau');
  perform public.t_assert((select sum(d_available) filter (where kind = 'grant') from public.credit_transactions where customer_id = c1) = 10 and public.t_inv(c1), 'rattrapage : n''augmente pas le nombre de séances achetées (10)');
  begin perform public.book_makeup(ent, smk); raise exception 'devrait échouer'; exception when sqlstate 'P0030' then null; end;
  perform public.t_assert(true, 'rattrapage : même droit utilisé deux fois = refusé');
  perform public.set_attendance(mk, 'present', null, null);
  perform public.t_assert((select status from public.makeup_entitlements where id = ent) = 'done' and public.t_bal(c1) = '0/9/1/0', 'rattrapage : validé après présence, crédit consommé');
  select id into bk2 from public.bookings where session_id = s2 and customer_id = c3;
  perform public.set_attendance(bk2, 'to_makeup', null, null);
  begin perform public.book_makeup((select id from public.makeup_entitlements where origin_booking_id = bk2), s3); raise exception 'devrait échouer'; exception when sqlstate 'P0033' then null; end;
  perform public.t_assert(true, 'rattrapage : séance complète refusée (pas de surbooking)');


  -- ===== Annulation par le coach =====
  perform public.t_assert(public.cancel_session(s3) = 4, 'annulation coach : 4 réservations annulées');
  perform public.t_assert(public.cancel_session(s3) = 0, 'annulation coach : rejouée = aucun effet');
  perform public.t_assert(public.t_bal(c1) = '1/8/1/0' and public.t_inv(c1), 'annulation coach : crédit rendu, rien consommé');

  -- ===== Annulation tardive / dans les délais =====
  a3 := public.grant_pack(c3, pk5, 'test', null);
  insert into public.sessions (course_type_id, starts_at, ends_at, booking_mode, court_secured, capacity, price_per_person_cents, visibility)
    values (v_type, now() + interval '2 hours', now() + interval '3 hours 30 minutes', 'auto', true, 4, 2500, 'public') returning id into snear;
  select booking_id into bk1 from public.create_booking(snear, 'C3', 'Test', 'c3@test.fr', '0600000000', null, null, 1, 'late-cancel-key-000000001');
  perform public.sync_booking_credit(bk1);
  perform public.t_assert(public.t_bal(c3) = '4/1/0/0', 'réservation en ligne confirmée : un crédit immobilisé');
  r := public.cancel_booking(bk1);
  perform public.t_assert((r->>'late')::boolean and public.t_bal(c3) = '4/0/1/0', 'annulation à moins de 24 h : crédit consommé');
  select booking_id into bk2 from public.create_booking(smk, 'C3', 'Test', 'c3@test.fr', '0600000000', null, null, 1, 'early-cancel-key-00000001');
  perform public.sync_booking_credit(bk2);
  r := public.cancel_booking(bk2);
  perform public.t_assert(not (r->>'late')::boolean and public.t_bal(c3) = '4/0/1/0' and public.t_inv(c3), 'annulation dans les délais : crédit rendu');
  r := public.cancel_booking(bk2);
  perform public.t_assert((r->>'already')::boolean and public.t_bal(c3) = '4/0/1/0', 'annulation rejouée : aucun effet');

  -- ===== Journal en ajout seul, solde jamais négatif =====
  begin update public.credit_transactions set d_available = 99; raise exception 'devrait échouer'; exception when sqlstate 'P0021' then null; end;
  begin delete from public.credit_transactions; raise exception 'devrait échouer'; exception when sqlstate 'P0021' then null; end;
  perform public.t_assert(true, 'journal : modification et suppression impossibles');
  begin perform public.adjust_credits(c2, a2, -100, 'test', null); raise exception 'devrait échouer'; exception when sqlstate 'P0020' then null; end;
  perform public.t_assert(true, 'journal : solde négatif refusé');
  begin perform public.adjust_credits(c2, a2, 1, '  ', null); raise exception 'devrait échouer'; exception when check_violation then null; end;
  perform public.t_assert(true, 'journal : correction manuelle sans motif refusée');
  perform public.adjust_credits(c2, a2, 2, 'geste commercial', null);
  perform public.t_assert(public.t_bal(c2) = '3/3/1/0' and public.t_inv(c2), 'journal : correction manuelle tracée (+2) et cohérente');

  -- ===== Retrait / ajout d'un joueur =====
  perform public.t_assert(public.remove_group_member(g, c4) = 8, 'groupe : retrait de c4, ses 8 séances à venir annulées');
  perform public.t_assert((select count(*) from public.group_membership_events where group_id = g and event = 'left') = 1, 'groupe : historique du départ enregistré');
  r := public.add_group_member(g, c5);
  perform public.t_assert((r->>'enrolled')::int = 8 and public.seats_taken(s5) = 4, 'groupe : c5 inscrit aux séances restantes, capacité respectée');

  -- ===== Expiration =====
  update public.player_pack_allocations set expires_at = now() - interval '1 day' where id = a3;
  n := public.expire_credits(); perform public.t_assert(n = 4 and public.t_bal(c3) = '0/0/1/4' and public.t_inv(c3), 'expiration : 4 crédits expirés, solde cohérent');
  perform public.t_assert(public.expire_credits() = 0, 'expiration : rejouée = aucun effet');

  -- ===== Modification d'horaire =====
  perform public.reschedule_session(s4, '2027-02-09 09:00+00', null);
  perform public.t_assert((select count(*) from public.sessions where cycle_id = cyc) = 10 and public.seats_taken(s4) = 4, 'séance reportée : mêmes inscrits, aucune séance dupliquée');
  begin perform public.reschedule_session(s4, (select starts_at from public.sessions where id = s5), null); raise exception 'devrait échouer'; exception when exclusion_violation then null; end;
  perform public.t_assert(true, 'séance : déplacement sur une autre séance refusé (conflit)');
  r := public.generate_cycle_sessions(cyc);
  perform public.t_assert((r->>'created')::int = 0 and (select count(*) from public.sessions where cycle_id = cyc) = 10, 'cycle : régénérer après un report ne crée pas de doublon');

  -- ===== Suspension / prolongation =====
  perform public.t_assert(public.set_cycle_suspended(cyc, true) = 8, 'cycle suspendu : 8 séances à venir ouvertes suspendues (la séance validée est intacte)');
  perform public.t_assert((select count(*) from public.sessions where cycle_id = cyc and status = 'suspended') = 8, 'cycle suspendu : statut des séances = suspended');
  perform public.t_assert(public.set_cycle_suspended(cyc, false) = 8, 'cycle repris : 8 séances rouvertes');
  r := public.extend_cycle(cyc, 2);
  perform public.t_assert((r->>'created')::int = 2 and (select count(*) from public.sessions where cycle_id = cyc) = 12, 'cycle prolongé de 2 séances');
  r := public.generate_cycle_sessions(cyc);
  perform public.t_assert((r->>'created')::int = 0, 'cycle prolongé : régénération sans doublon');

  -- ===== Heure d'été =====
  insert into public.groups (name, capacity, weekday, start_time, duration_min) values ('Collectif mardi', 4, 2, '18:00', 90) returning id into g2;
  insert into public.training_cycles (group_id, sessions_count, start_date, weekday, start_time, duration_min) values (g2, 2, '2027-03-23', 2, '18:00', 90) returning id into cyc2;
  perform public.generate_cycle_sessions(cyc2);
  perform public.t_assert((select starts_at from public.sessions where cycle_id = cyc2 and cycle_index = 1) = '2027-03-23 17:00:00+00', 'fuseau : mardi 23 mars 18h = 17h UTC (heure d''hiver)');
  perform public.t_assert((select starts_at from public.sessions where cycle_id = cyc2 and cycle_index = 2) = '2027-03-30 16:00:00+00', 'fuseau : mardi 30 mars 18h = 16h UTC (heure d''été)');

  -- ===== Conflits horaires signalés =====
  insert into public.groups (name, capacity, weekday, start_time, duration_min) values ('Autre groupe lundi', 4, 1, '18:00', 90) returning id into g3;
  insert into public.training_cycles (group_id, sessions_count, start_date, weekday, start_time, duration_min) values (g3, 3, '2027-01-04', 1, '18:00', 90) returning id into cyc3;
  r := public.generate_cycle_sessions(cyc3);
  perform public.t_assert((r->>'created')::int = 1 and jsonb_array_length(r->'conflicts') = 2, 'conflits : 2 dates en conflit signalées, la 3e (séance annulée) est libre');
end $t$;
