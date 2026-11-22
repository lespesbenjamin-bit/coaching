# coachpadeltoulouse.fr

Site vitrine statique (dans `public/`, URL inchangées) + module de réservation Next.js (`src/`).

## Routes
- `/` et `/*.html` : site vitrine statique (réécriture de `/` vers `/index.html` dans `next.config.mjs`)
- `/reservation` : réservation publique (cours individuel, duo, collectif)
- `/admin/login`, `/admin/agenda` : espace coach (protégé côté serveur + RLS)
- `/api/slots`, `/api/bookings` : API publique ; `/api/admin/*` : API admin

## Mise en route
1. Supabase : exécuter `supabase/migrations/001_agenda.sql` (éditeur SQL).
2. Créer l'utilisateur admin (Authentication > Users), puis :
   `insert into public.admin_profiles (user_id, display_name) values ('<UUID>', 'Benjamin');`
3. Variables d'environnement Vercel (voir `.env.example`) :
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secrète, serveur uniquement),
   `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`.
4. Vercel > Settings > Build : Framework Preset = **Next.js** (pour la branche de prévisualisation d'abord).

## Règles
- Confirmation automatique uniquement si créneau en mode `auto` ET « terrain sécurisé » coché.
- Une demande en attente bloque ses places ; refus/annulation les libèrent.
- Aucune intégration Coins : `src/lib/courts/CourtProvider.ts` n'est qu'une interface.

## Développement
`npm install` · `npm run dev` · `npm test` · `npm run build`

## Sprint 2 — back-office (groupes, cycles, packs, crédits)

- Migration `supabase/migrations/003_backoffice.sql` (additive, à exécuter après 001 et 002).
- Pages admin : `/admin` (tableau de bord), `/admin/agenda`, `/admin/groupes`, `/admin/seances/[id]`, `/admin/joueurs` (+ `fiche/[id]`), `/admin/packs`, `/admin/parametres`.
- Crédits : journal en ajout seul `credit_transactions` ; solde = somme des mouvements (`v_credit_balance`). Règles (délai d'annulation 24 h par défaut, absence non justifiée, réservation immédiate du crédit) dans `app_settings`.
- Tests SQL (PostgreSQL jetable, jamais la production) : `tests/sql/run.sh` — 71 vérifications (groupes, cycles, crédits, présences, rattrapages, sécurité, non-régression Sprint 1).
