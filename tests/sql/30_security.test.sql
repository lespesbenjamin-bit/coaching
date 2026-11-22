-- Sécurité : visiteur et joueur connecté non administrateur
do $t$
declare u uuid := gen_random_uuid(); n int;
begin
  insert into auth.users (id, email) values (u, 'joueur@sec.fr');
  foreach n in array array[1] loop null; end loop;
  -- visiteur
  set local role anon;
  perform public.t_assert((select count(*) from public.groups) = 0 and (select count(*) from public.credit_transactions) = 0 and (select count(*) from public.makeup_entitlements) = 0, 'sécurité : un visiteur ne voit aucune donnée de back-office');
  begin perform public.grant_pack(gen_random_uuid(), gen_random_uuid(), null, null); raise exception 'devrait échouer'; exception when insufficient_privilege then null; end;
  begin perform public.set_attendance(gen_random_uuid(), 'present', null, null); raise exception 'devrait échouer'; exception when insufficient_privilege then null; end;
  reset role;
  perform public.t_assert(true, 'sécurité : un visiteur ne peut appeler aucune fonction de gestion');
  -- joueur connecté (non admin)
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
  perform public.t_assert((select count(*) from public.groups) = 0 and (select count(*) from public.player_pack_allocations) = 0 and (select count(*) from public.attendance_records) = 0 and (select count(*) from public.app_settings) = 0, 'sécurité : un joueur ne voit ni groupes, ni packs, ni présences, ni paramètres');
  begin insert into public.groups (name) values ('pirate'); raise exception 'devrait échouer'; exception when insufficient_privilege or sqlstate '42501' then null; end;
  begin perform public.adjust_credits(gen_random_uuid(), gen_random_uuid(), 50, 'x', null); raise exception 'devrait échouer'; exception when insufficient_privilege then null; end;
  begin update public.app_settings set value = '0' where key = 'cancel_deadline_hours'; if found then raise exception 'modifié !'; end if; end;
  reset role;
  perform public.t_assert((select value from public.app_settings where key = 'cancel_deadline_hours') = '24', 'sécurité : un joueur ne peut modifier ni créer rien (paramètres intacts)');
end $t$;
do $t$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (u, 'joueur2@sec.fr');
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
  begin perform public.validate_session(gen_random_uuid(), null, null); raise exception 'devrait échouer'; exception when insufficient_privilege then null; end;
  begin perform public.renew_cycle(gen_random_uuid(), current_date, 1, null, null, null, null, null, null); raise exception 'devrait échouer'; exception when insufficient_privilege then null; end;
  begin perform public.record_attendance(gen_random_uuid(), 'present', 'consume', null, null); raise exception 'devrait échouer'; exception when insufficient_privilege then null; end;
  perform public.t_assert((select count(*) from public.session_revisions) = 0 and (select count(*) from public.operation_requests) = 0, 'sécurité : un joueur ne voit ni révisions ni opérations');
  reset role;
  perform public.t_assert(true, 'sécurité : un joueur ne peut ni valider, ni renouveler, ni corriger une présence');
end $t$;
