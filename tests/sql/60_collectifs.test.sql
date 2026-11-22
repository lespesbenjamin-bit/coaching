do $t$
declare
  lucas uuid := public.t_cust('Lucas'); thomas uuid := public.t_cust('Thomas'); hugo uuid := public.t_cust('Hugo'); maxime uuid := public.t_cust('Maxime'); extra uuid := public.t_cust('Extra');
  g uuid; g2 uuid; cyc uuid; cyc2 uuid; pk uuid; s1 uuid; s2 uuid; s3 uuid; sx uuid; r jsonb; n int; bl uuid; bt uuid; bh uuid; bm uuid; led int; tmp uuid;
begin
  insert into public.groups (name, level, capacity, weekday, start_time, duration_min, visibility) values ('Objectif P100', 'P100', 4, 3, '19:00', 90, 'private') returning id into g;
  insert into public.groups (name, capacity, weekday, start_time, visibility) values ('Petit groupe', 1, 4, '19:00', 'private') returning id into g2;
  insert into public.pack_definitions (name, credits) values ('Pack 10 collectif', 10) returning id into pk;
  perform public.grant_pack(c, pk, null, null) from unnest(array[lucas, thomas, hugo, maxime]) c;
  perform public.add_group_member(g, c) from unnest(array[lucas, thomas, hugo, maxime]) c;
  insert into public.training_cycles (group_id, sessions_count, start_date, weekday, start_time, duration_min, label) values (g, 10, '2027-02-03', 3, '19:00', 90, 'Cycle 1') returning id into cyc;
  r := public.generate_cycle_sessions(cyc);
  select id into s1 from public.sessions where cycle_id = cyc and cycle_index = 1;
  select id into s2 from public.sessions where cycle_id = cyc and cycle_index = 2;
  select id into s3 from public.sessions where cycle_id = cyc and cycle_index = 3;
  select id into bl from public.bookings where session_id = s1 and customer_id = lucas; select id into bt from public.bookings where session_id = s1 and customer_id = thomas;
  select id into bh from public.bookings where session_id = s1 and customer_id = hugo;  select id into bm from public.bookings where session_id = s1 and customer_id = maxime;

  perform public.t_assert((select total from public.v_cycle_progress where cycle_id = cyc) = 10 and (select validated from public.v_cycle_progress where cycle_id = cyc) = 0 and (select remaining from public.v_cycle_progress where cycle_id = cyc) = 10, 'cycle : 10 prévues, 0 validée, 10 restantes');

  -- validation impossible tant qu'un joueur est « non renseigné »
  perform public.record_attendance(bl, 'present', null, null, null);
  begin perform public.validate_session(s1, null, 'k1'); raise exception 'devrait échouer'; exception when sqlstate 'P0070' then null; end;
  perform public.t_assert((select status from public.sessions where id = s1) = 'open', 'validation : refusée tant qu''un joueur est non renseigné');
  perform public.t_assert(public.t_bal(lucas) = '9/1/0/0' or public.t_bal(lucas) = '0/10/0/0', 'crédit : une présence saisie mais non validée ne consomme rien');
  select count(*) into n from public.credit_transactions where customer_id = lucas and kind = 'consume'; perform public.t_assert(n = 0, 'crédit : aucune consommation avant validation');

  -- exemple du cahier : Lucas présent -1, Thomas absent -1 (décision), Hugo excusé 0, Maxime présent -1
  perform public.record_attendance(bt, 'absent_unjustified', 'consume', null, null);
  perform public.record_attendance(bh, 'absent_justified', 'free', null, null);
  perform public.record_attendance(bm, 'present', null, null, null);
  r := public.validate_session(s1, null, 'k1');
  perform public.t_assert((r->>'validated')::boolean and (r->>'credits_consumed')::int = 3, 'validation : 3 crédits consommés (Lucas, Thomas, Maxime), Hugo 0');
  perform public.t_assert(public.t_bal(lucas) like '%/1/0' or (select consumed from public.v_credit_balance where customer_id = lucas) = 1, 'crédit : Lucas 1 consommé');
  perform public.t_assert((select consumed from public.v_credit_balance where customer_id = thomas) = 1 and (select consumed from public.v_credit_balance where customer_id = hugo) = 0 and (select consumed from public.v_credit_balance where customer_id = maxime) = 1, 'crédit : Thomas 1, Hugo 0, Maxime 1');
  perform public.t_assert((select status from public.sessions where id = s1) = 'done' and (select validated from public.v_cycle_progress where cycle_id = cyc) = 1 and (select remaining from public.v_cycle_progress where cycle_id = cyc) = 9, 'cycle : séance marquée réalisée, compteurs 1 validée / 9 restantes');

  -- double validation : aucun double débit
  select count(*) into led from public.credit_transactions;
  r := public.validate_session(s1, null, 'k1'); perform public.t_assert((r->>'replayed')::boolean, 'double validation : même clé = résultat rejoué');
  r := public.validate_session(s1, null, 'k2'); perform public.t_assert((r->>'already')::boolean, 'double validation : séance déjà validée, rien ne change');
  perform public.t_assert((select count(*) from public.credit_transactions) = led, 'double validation : aucune écriture de crédit supplémentaire');

  -- correction tracée : motif obligatoire, mouvement compensatoire, historique conservé
  begin perform public.record_attendance(bt, 'absent_unjustified', 'free', null, null, '  '); raise exception 'devrait échouer'; exception when sqlstate 'P0074' then null; end;
  perform public.t_assert(true, 'correction : motif obligatoire');
  perform public.record_attendance(bt, 'absent_justified', 'free', 'certificat reçu', null, 'Absence justifiée a posteriori');
  perform public.t_assert((select consumed from public.v_credit_balance where customer_id = thomas) = 0 and public.t_inv(thomas), 'correction : crédit de Thomas rendu, solde cohérent');
  perform public.t_assert((select count(*) from public.credit_transactions where booking_id = bt and kind = 'consume') = 1 and (select count(*) from public.credit_transactions where booking_id = bt and kind = 'reverse_consume') = 1, 'correction : mouvement initial conservé + mouvement compensatoire');
  perform public.t_assert((select count(*) from public.session_revisions where session_id = s1) = 1, 'correction : révision enregistrée (ancien / nouveau / motif)');
  begin update public.session_revisions set reason = 'x'; raise exception 'devrait échouer'; exception when sqlstate 'P0021' then null; end;
  perform public.t_assert(true, 'correction : historique des révisions non modifiable');

  -- séance annulée : jamais comptée comme réalisée ; report : reste dans le cycle
  perform public.cancel_session(s2);
  perform public.t_assert((select validated from public.v_cycle_progress where cycle_id = cyc) = 1 and (select remaining from public.v_cycle_progress where cycle_id = cyc) = 9, 'cycle : une séance annulée ne compte pas comme réalisée');
  perform public.reschedule_session(s3, '2027-02-18 18:00+00', null);
  perform public.t_assert((select cycle_id from public.sessions where id = s3) = cyc and (select count(*) from public.sessions where cycle_id = cyc) = 10, 'report : la séance garde son cycle, aucune séance dupliquée');

  -- séance exceptionnelle : incluse ou non dans le cycle selon la décision du coach
  sx := public.add_cycle_session(g, cyc, '2027-12-01 18:00+00', 90, true, null);
  perform public.t_assert((select is_exceptional from public.sessions where id = sx) and public.seats_taken(sx) = 4, 'exceptionnelle : créée avec les membres du groupe');
  perform public.mark_session_present(sx, null); perform public.validate_session(sx, null, 'kx');
  perform public.t_assert((select validated from public.v_cycle_progress where cycle_id = cyc) = 2, 'exceptionnelle incluse : comptée dans le cycle');
  tmp := public.add_cycle_session(g, cyc, '2027-12-02 18:00+00', 90, false, null);
  perform public.mark_session_present(tmp, null); perform public.validate_session(tmp, null, 'kt');
  perform public.t_assert((select validated from public.v_cycle_progress where cycle_id = cyc) = 2, 'exceptionnelle non incluse : non comptée dans le cycle');

  -- récurrence future : horaire des séances à venir modifié, passé intact
  update public.sessions set starts_at = '2020-01-01 18:00+00', ends_at = '2020-01-01 19:30+00' where id = s1;  -- séance passée (déjà validée)
  n := public.shift_future_sessions(cyc, 4, null, '20:00', null);
  perform public.t_assert(n >= 6, 'récurrence : séances futures décalées (à partir de la n°4)');
  perform public.t_assert((select (starts_at at time zone 'Europe/Paris')::time from public.sessions where cycle_id = cyc and cycle_index = 5) = '20:00', 'récurrence : nouvelle heure appliquée (heure de Paris)');
  perform public.t_assert((select (starts_at at time zone 'Europe/Paris')::time from public.sessions where cycle_id = cyc and cycle_index = 3) = '19:00' or (select starts_at from public.sessions where id = s3) = '2027-02-18 18:00+00', 'récurrence : séances avant la n°4 inchangées');

  -- renouvellement : pas d'écrasement, pas de doublon
  r := public.renew_cycle(cyc, '2027-06-02', 10, null, null, null, 'Cycle 2', 'rn1', null);
  cyc2 := (r->>'cycle_id')::uuid;
  perform public.t_assert((r->>'created')::int = 10 and (select renewed_from from public.training_cycles where id = cyc2) = cyc, 'renouvellement : nouveau cycle de 10 séances rattaché au précédent');
  perform public.t_assert((select count(*) from public.sessions where cycle_id = cyc) >= 10 and (select label from public.training_cycles where id = cyc) = 'Cycle 1', 'renouvellement : historique du cycle précédent intact');
  r := public.renew_cycle(cyc, '2027-06-02', 10, null, null, null, 'Cycle 2', 'rn1', null);
  perform public.t_assert((r->>'replayed')::boolean and (select count(*) from public.training_cycles where renewed_from = cyc) = 1, 'renouvellement : même clé = pas de second cycle');
  begin perform public.renew_cycle(cyc, '2027-09-01', 10, null, null, null, 'Cycle 2 bis', 'rn2', null); raise exception 'devrait échouer'; exception when sqlstate 'P0071' then null; end;
  perform public.t_assert(true, 'renouvellement : second renouvellement du même cycle refusé');
  perform public.t_assert((select count(*) from public.group_memberships where group_id = g and status = 'active') = 4 and public.seats_taken((select id from public.sessions where cycle_id = cyc2 and cycle_index = 1)) = 4, 'renouvellement : composition conservée, joueurs inscrits aux nouvelles séances');

  -- déplacement de joueur
  perform public.add_group_member(g2, extra);
  begin perform public.move_group_member(g, g2, lucas); raise exception 'devrait échouer'; exception when sqlstate 'P0011' then null; end;
  perform public.t_assert((select count(*) from public.group_memberships where group_id = g and customer_id = lucas and status = 'active') = 1, 'déplacement : groupe d''arrivée complet = Lucas reste dans son groupe');
  update public.groups set capacity = 2 where id = g2; perform public.remove_group_member(g2, extra);
  r := public.move_group_member(g, g2, lucas);
  perform public.t_assert((select count(*) from public.group_memberships where group_id = g2 and customer_id = lucas and status = 'active') = 1 and (select count(*) from public.group_memberships where group_id = g and customer_id = lucas and status = 'active') = 0, 'déplacement : Lucas change de groupe');
  perform public.t_assert((select count(*) from public.bookings where session_id = s1 and customer_id = lucas) = 1 and (select status from public.sessions where id = s1) = 'done', 'déplacement : ses séances passées sont conservées');

  -- joueur temporaire et composition à une date
  n := public.add_temporary_player(g, extra, 2);
  perform public.t_assert(n = 2 and (select count(*) from public.group_memberships where group_id = g and customer_id = extra) = 0, 'joueur temporaire : inscrit à 2 séances sans devenir membre');
  perform public.t_assert((select count(*) from public.group_members_at(g, now() + interval '1 minute') x where x = lucas) = 0 and (select count(*) from public.group_members_at(g, now() + interval '1 minute') x where x = thomas) = 1, 'composition passée : Lucas n''est plus dans le groupe, Thomas y est');
  perform public.t_assert((select count(*) from public.group_members_at(g, '2000-01-01') x) = 0, 'composition passée : aucune avant la création du groupe');
end $t$;
