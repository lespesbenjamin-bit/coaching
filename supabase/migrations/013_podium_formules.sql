-- PODIUM : afficher (ou non) les formules de bons cadeaux sous le bouton. Additive et rejouable.
alter table public.campaigns add column if not exists show_formulas boolean not null default false;
update public.campaigns set show_formulas = true where name = 'Offre de Noël 2026';
