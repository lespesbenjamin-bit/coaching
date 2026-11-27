\echo '== 120 podium clair =='
do $t$
declare ok boolean;
begin
  -- la campagne de Noël est recréée ici (le test 110 supprime l'originale) puis les mises à jour des migrations 012 et 013 sont rejouées
  insert into public.campaigns (name, title) values ('Offre de Noël 2026', 'Cette année, offrez du padel.');
  update public.campaigns set media_path = '/img/podium-noel-2026.webp' where name = 'Offre de Noël 2026' and media_path is null;
  update public.campaigns set show_formulas = true where name = 'Offre de Noël 2026';
  perform public.t_assert((select media_path = '/img/podium-noel-2026.webp' and show_formulas from public.campaigns where name = 'Offre de Noël 2026'), 'campagne de Noël : visuel du site associé et formules affichées');
  perform public.t_assert((select not show_formulas from public.campaigns where name <> 'Offre de Noël 2026' limit 1), 'formules masquées par défaut');
  insert into public.campaigns (name, title, bg_color, media_path) values ('Couleur', 'T', '#F0EDE6', 'abc.webp');
  perform public.t_assert(true, 'couleur et fichier importé acceptés');
  begin insert into public.campaigns (name, title, bg_color) values ('x', 'y', 'red'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'couleur invalide refusée');
  begin insert into public.campaigns (name, title, bg_color) values ('x', 'y', '#F0EDE6;}'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'injection CSS refusée');
  begin insert into public.campaigns (name, title, media_path) values ('x', 'y', '//evil.example/a.jpg'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'image externe « // » refusée');
end $t$;
