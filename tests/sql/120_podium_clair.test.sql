\echo '== 120 podium clair =='
do $t$
declare ok boolean;
begin
  perform public.t_assert((select media_path = '/img/podium-noel-2026.webp' from public.campaigns where name = 'Offre de Noël 2026'), 'campagne de Noël : visuel du site associé');
  insert into public.campaigns (name, title, bg_color, media_path) values ('Couleur', 'T', '#F0EDE6', 'abc.webp');
  perform public.t_assert(true, 'couleur et fichier importé acceptés');
  begin insert into public.campaigns (name, title, bg_color) values ('x', 'y', 'red'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'couleur invalide refusée');
  begin insert into public.campaigns (name, title, bg_color) values ('x', 'y', '#F0EDE6;}'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'injection CSS refusée');
  begin insert into public.campaigns (name, title, media_path) values ('x', 'y', '//evil.example/a.jpg'); ok := false; exception when check_violation then ok := true; end;
  perform public.t_assert(ok, 'image externe « // » refusée');
end $t$;
