-- PODIUM CLAIR — couleur de fond par campagne + visuel de la campagne de Noël (image du site). Additive et rejouable.
alter table public.campaigns add column if not exists bg_color text check (bg_color is null or bg_color ~ '^#[0-9a-fA-F]{6}$');
-- media_path peut désigner une image du site (chemin commençant par « / ») ou un fichier importé dans l'administration
alter table public.campaigns drop constraint if exists campaigns_media_path_check;
alter table public.campaigns add constraint campaigns_media_path_check check (media_path is null or (char_length(media_path) <= 200 and media_path !~ '[ <>"]' and media_path !~ '^//'));
update public.campaigns set media_path = '/img/podium-noel-2026.webp' where name = 'Offre de Noël 2026' and media_path is null;
