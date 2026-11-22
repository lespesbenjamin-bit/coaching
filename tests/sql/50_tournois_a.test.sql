do $t$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); ua uuid := gen_random_uuid();
        c1 uuid; c2 uuid; ev uuid; ev2 uuid; p1 uuid; n int;
begin
  insert into auth.users (id, email) values (u1, 'p1@tour.fr'), (u2, 'p2@tour.fr'), (ua, 'coach@tour.fr');
  insert into public.profiles (user_id, first_name, last_name) values (u1, 'Alice', 'Un'), (u2, 'Bob', 'Deux') on conflict do nothing;
  insert into public.admin_profiles (user_id) values (ua);
  c1 := public.ensure_customer_for_user(u1); c2 := public.ensure_customer_for_user(u2);
  perform public.t_assert(c1 is not null and c1 = public.ensure_customer_for_user(u1), 'référentiel : fiche créée une seule fois pour un compte');
  insert into public.customers (first_name, last_name, email, phone) values ('Carl', 'Existant', 'carl@tour.fr', '0600000001');
  insert into auth.users (id, email) values (gen_random_uuid(), 'CARL@tour.fr') returning id into u1;
  perform public.t_assert(public.ensure_customer_for_user(u1) = (select id from public.customers where email = 'carl@tour.fr'), 'référentiel : un compte se rattache à la fiche existante (e-mail identique)');
  select id into u1 from auth.users where email = 'p1@tour.fr';

  insert into public.tournament_events (name, start_date, category_code, publication) values ('Open de Colomiers P250', '2027-03-14', 'P250', 'published') returning id into ev;
  begin insert into public.tournament_events (name, start_date) values ('OPEN de colomiers p250!', '2027-03-14'); raise exception 'devrait échouer'; exception when unique_violation then null; end;
  perform public.t_assert(true, 'catalogue : doublon (nom normalisé + date) refusé');
  insert into public.tournament_events (name, start_date, publication) values ('Brouillon', '2027-04-01', 'proposed') returning id into ev2;
  insert into public.tournament_participations (tournament_id, customer_id, status) values (ev, c1, 'planned') returning id into p1;
  perform public.t_assert((select count(*) from public.participation_status_history where participation_id = p1) = 1, 'participation : historique de statut enregistré');
  update public.tournament_participations set status = 'declared' where id = p1;
  perform public.t_assert((select count(*) from public.participation_status_history where participation_id = p1) = 2, 'participation : changement de statut tracé');
  begin update public.tournament_participations set status = 'confirmed' where id = p1; raise exception 'devrait échouer'; exception when check_violation then null; end;
  perform public.t_assert(true, 'participation : « confirmée » exige une source');

  -- joueur 1
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  perform public.t_assert((select count(*) from public.tournament_events) = 1, 'joueur : voit les tournois publiés, pas les propositions des autres');
  perform public.t_assert((select count(*) from public.tournament_participations) = 1, 'joueur : voit sa participation');
  begin update public.tournament_participations set status = 'confirmed', confirmation_source = 'ma parole' where id = p1; raise exception 'devrait échouer'; exception when sqlstate 'P0060' then null; end;
  perform public.t_assert(true, 'joueur : ne peut pas confirmer une inscription');
  begin update public.tournament_participations set coach_comment = 'hack' where id = p1; raise exception 'devrait échouer'; exception when sqlstate 'P0061' then null; end;
  perform public.t_assert(true, 'joueur : ne peut pas écrire le commentaire du coach');
  update public.tournament_participations set partner_name = 'Dupont', status = 'planned' where id = p1;
  perform public.t_assert((select partner_name from public.tournament_participations where id = p1) = 'Dupont', 'joueur : renseigne son partenaire et son statut');
  insert into public.tournament_events (name, start_date, publication, source, created_by) values ('Tournoi proposé', '2027-05-01', 'proposed', 'manual', u1);
  perform public.t_assert((select count(*) from public.tournament_events) = 2, 'joueur : voit sa propre proposition');
  begin insert into public.tournament_events (name, start_date, publication, source, created_by) values ('Faux vérifié', '2027-05-02', 'published', 'verified', u1); raise exception 'devrait échouer'; exception when insufficient_privilege or sqlstate '42501' then null; end;
  perform public.t_assert(true, 'joueur : ne peut pas publier ni marquer « vérifié »');
  insert into public.tournament_favorites (tournament_id, user_id) values (ev, u1);
  begin insert into public.tournament_favorites (tournament_id, user_id) values (ev, u2); raise exception 'devrait échouer'; exception when insufficient_privilege or sqlstate '42501' then null; end;
  perform public.t_assert(true, 'joueur : favoris limités à son propre compte');
  begin insert into public.tournament_participations (tournament_id, customer_id, status) values (ev, c2, 'planned'); raise exception 'devrait échouer'; exception when insufficient_privilege or sqlstate '42501' then null; end;
  perform public.t_assert(true, 'joueur : ne peut pas inscrire un autre joueur');
  reset role;

  -- joueur 2
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  perform public.t_assert((select count(*) from public.tournament_participations) = 0 and (select count(*) from public.tournament_favorites) = 0 and (select count(*) from public.participation_status_history) = 0, 'joueur 2 : ne voit ni participations, ni favoris, ni historique du joueur 1');
  update public.tournament_participations set partner_name = 'pirate' where id = p1;
  reset role;
  perform public.t_assert((select partner_name from public.tournament_participations where id = p1) = 'Dupont', 'joueur 2 : ne peut pas modifier la participation du joueur 1');

  -- coach
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  update public.tournament_participations set status = 'confirmed', confirmation_source = 'liste officielle Ten''Up' where id = p1;
  perform public.t_assert((select status from public.tournament_participations where id = p1) = 'confirmed', 'coach : confirme une inscription avec sa source');
  perform public.t_assert((select count(*) from public.tournament_events) = 3, 'coach : voit tout le catalogue (publié et proposé)');
  reset role;
end $t$;
