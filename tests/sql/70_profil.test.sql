-- Lot 1 espace joueur : profil, classement déclaré/vérifié
\echo '== 70 profil =='
do $t$ declare u uuid := gen_random_uuid(); r text; begin
  insert into auth.users (id) values (u) on conflict do nothing;
  insert into public.profiles (user_id) values (u) on conflict do nothing;
  update public.profiles set fft_ranking = 350, ranking_source = 'verified' where user_id = u;     -- exécuté comme postgres (coach/service) : accepté
  select ranking_source into r from public.profiles where user_id = u;
  perform public.t_assert(r = 'verified', 'classement vérifié posé par le service');
  perform public.t_assert((select (notify_prefs->>'booking')::boolean from public.profiles where user_id = u), 'préférences par défaut');
  perform public.t_assert(exists (select 1 from storage.buckets where id = 'avatars' and not public), 'bucket avatars privé');
end $t$;
