\echo '== 110 campagnes =='
do $t$
declare c uuid; v uuid; ok boolean;
begin
  perform public.t_assert((select count(*) from public.campaigns) = 1 and (select status from public.campaigns limit 1) = 'draft', 'campagne de Noël créée en brouillon');
  c := (select id from public.campaigns limit 1);
  perform public.track_campaign(c, 'impression');
  perform public.t_assert((select count(*) from public.campaign_stats) = 0, 'brouillon : aucun suivi enregistré');
  update public.campaigns set status = 'published' where id = c;
  perform public.track_campaign(c, 'impression'); perform public.track_campaign(c, 'impression'); perform public.track_campaign(c, 'click');
  perform public.t_assert((select impressions = 2 and clicks = 1 from public.campaign_stats where campaign_id = c), 'compteurs du jour : 2 affichages, 1 clic');
  perform public.t_assert((select count(*) from public.campaign_stats where campaign_id = c) = 1, 'une seule ligne par jour');
  begin perform public.track_campaign(c, 'autre'); ok := false; exception when sqlstate 'P0100' then ok := true; end;
  perform public.t_assert(ok, 'type d''événement invalide refusé');
  begin insert into public.campaigns (name, title, cta_url) values ('x', 'y', '//evil.example'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'lien « // » refusé (redirection externe)');
  begin insert into public.campaigns (name, title, cta_url) values ('x', 'y', 'javascript:alert(1)'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'lien javascript: refusé');
  begin insert into public.campaigns (name, title, cta_url) values ('x', 'y', 'http://non-securise.example'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'lien http non sécurisé refusé');
  begin insert into public.campaigns (name, title, starts_on, ends_on) values ('x', 'y', date '2026-12-10', date '2026-12-01'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'fin avant début refusée');
  begin insert into public.campaigns (name, title, status) values ('x', 'y', 'inconnu'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'statut inconnu refusé');
  insert into public.campaigns (name, title, cta_url) values ('Interne', 'Titre', '/bon-cadeau?offre=pack5#configurateur');
  perform public.t_assert((select count(*) from public.campaigns) = 2, 'lien interne avec paramètres accepté');
  -- attribution d'un achat, sans toucher au prix
  v := public.create_voucher('pack5', 'WXYZA23456', 'Marie', 'm@test.fr', null, null, false);
  update public.gift_vouchers set campaign_id = c where id = v;
  perform public.t_assert((select amount_cents = 20000 and campaign_id = c from public.gift_vouchers where id = v), 'achat rattaché à la campagne, prix serveur inchangé (200 €)');
  delete from public.campaigns where id = c;
  perform public.t_assert((select campaign_id is null from public.gift_vouchers where id = v) and (select count(*) from public.campaign_stats) = 0, 'suppression de campagne : le bon reste, les compteurs partent');
end $t$;
