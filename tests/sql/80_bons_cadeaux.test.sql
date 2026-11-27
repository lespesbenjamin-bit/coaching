\echo '== 80 bons cadeaux =='
do $t$
declare c1 uuid := public.t_cust('V1'); c2 uuid := public.t_cust('V2'); v1 uuid; v2 uuid; v3 uuid; v4 uuid; r jsonb; ok boolean; st text;
begin
  perform public.t_assert((select count(*) from public.voucher_products where active) = 3, '3 formules actives');
  perform public.t_assert((select price_cents from public.voucher_products where code = 'technique') = 13500, 'prix 3 cours = 135 €');
  v1 := public.create_voucher('pack5', 'ABCDE23456', 'Marie Acheteuse', 'MARIE@Test.fr', 'Paul', 'Joyeux Noël', false);
  perform public.t_assert((select status from public.gift_vouchers where id = v1) = 'pending', 'bon en ligne : en attente de paiement');
  perform public.t_assert((select amount_cents from public.gift_vouchers where id = v1) = 20000, 'montant figé par le serveur (200 €)');
  begin perform public.redeem_voucher('ABCDE23456', c1, null); ok := false; exception when sqlstate 'P0093' then ok := true; end;
  perform public.t_assert(ok, 'un bon non payé est inutilisable');
  update public.gift_vouchers set stripe_session_id = 'cs_test_1' where id = v1;
  begin perform public.mark_voucher_paid('cs_test_1', 'pi_1', 19999); ok := false; exception when sqlstate 'P0095' then ok := true; end;
  perform public.t_assert(ok, 'montant payé incorrect refusé');
  r := public.mark_voucher_paid('cs_test_1', 'pi_1', 20000);
  perform public.t_assert((r->>'newly_paid')::boolean, 'paiement confirmé');
  r := public.mark_voucher_paid('cs_test_1', 'pi_1', 20000);
  perform public.t_assert(not (r->>'newly_paid')::boolean, 'rejeu du webhook : sans effet');
  perform public.t_assert((select expires_at > now() + interval '360 days' from public.gift_vouchers where id = v1), 'validité 12 mois');
  begin perform public.redeem_voucher('XXXXXXXXXX', c1, null); ok := false; exception when sqlstate 'P0091' then ok := true; end;
  perform public.t_assert(ok, 'code inconnu refusé');
  r := public.redeem_voucher('abcde-23456', c1, null);
  perform public.t_assert(public.t_bal(c1) = '5/0/0/0', 'utilisation : 5 crédits attribués (code saisi en minuscules avec tiret)');
  begin perform public.redeem_voucher('ABCDE23456', c2, null); ok := false; exception when sqlstate 'P0092' then ok := true; end;
  perform public.t_assert(ok, 'double utilisation refusée');
  perform public.t_assert(public.t_bal(c2) = '0/0/0/0' and public.t_inv(c1), 'aucun crédit en double, journal cohérent');
  -- manuel
  v2 := public.create_voucher('single', 'FGHJK78923', 'Coach', 'coach@test.fr', null, null, true);
  perform public.t_assert((select status from public.gift_vouchers where id = v2) = 'paid', 'bon manuel : payé hors ligne');
  perform public.redeem_voucher('FGHJK78923', c2, null);
  perform public.t_assert(public.t_bal(c2) = '1/0/0/0', 'bon manuel utilisé : 1 crédit');
  -- expiré / annulé / remboursé
  v3 := public.create_voucher('single', 'MNPQR45678', 'A', 'a@test.fr', null, null, true);
  update public.gift_vouchers set expires_at = now() - interval '1 day' where id = v3;
  begin perform public.redeem_voucher('MNPQR45678', c1, null); ok := false; exception when sqlstate 'P0094' then ok := true; end;
  perform public.t_assert(ok, 'bon expiré refusé');
  v4 := public.create_voucher('technique', 'STUVW23499', 'B', 'b@test.fr', null, null, true);
  perform public.cancel_voucher(v4, 'erreur');
  begin perform public.redeem_voucher('STUVW23499', c1, null); ok := false; exception when sqlstate 'P0093' then ok := true; end;
  perform public.t_assert(ok, 'bon annulé inutilisable');
  begin perform public.cancel_voucher(v1, 'x'); ok := false; exception when sqlstate 'P0092' then ok := true; end;
  perform public.t_assert(ok, 'un bon utilisé ne peut pas être annulé');
  begin perform public.create_voucher('inconnu', 'ZZZZZ22222', 'A', 'a@test.fr', null, null, false); ok := false; exception when sqlstate 'P0090' then ok := true; end;
  perform public.t_assert(ok, 'formule inconnue refusée');
  begin insert into public.gift_vouchers (code, product_code, label, credits, amount_cents, buyer_name, buyer_email) values ('abc', 'single', 'x', 1, 1, 'a', 'a@a.fr'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'format de code contrôlé');
end $t$;
