# Coach OS — Module Académie Tournois et suivi de compétition
Architecture, schéma de données, matrice fonctionnelle et plan de développement (version 1 — avant tout code)

Ce document s'ajoute au cahier des charges principal. Il ne supprime aucune fonctionnalité existante : agenda, réservation, espace joueur, groupes, cycles, packs et crédits, indisponibilités restent inchangés.

## 1. Principes
1. **Un seul référentiel de joueurs** : la fiche `customers` (utilisée par groupes, crédits, présences). Un compte `profiles` est lié à une fiche par `customers.user_id`. Aucune table « joueurs » nouvelle.
2. **Un seul catalogue de tournois**, commun au coach et aux joueurs. Chaque tournoi porte son origine : `manual` (saisi), `imported` (import fichier), `verified` (source officielle ou autorisée). Jamais de scraping, jamais d'API inventée.
3. **Déclaré ≠ vérifié**, à tous les niveaux : statut d'inscription, résultats, statistiques. Une déclaration du joueur n'est pas une inscription officielle.
4. **Écritures sensibles côté serveur** (service_role + contrôle admin), lectures et saisies joueur protégées par RLS (own rows only).
5. **Rien de simulé en production** : aucune donnée de démonstration ; un écran vide affiche un état vide.
6. **Migrations additives** : l'ancienne table `tournaments` (migration 002) n'est pas supprimée ; ses lignes sont recopiées dans le nouveau modèle, puis la table reste en lecture seule jusqu'à validation.

## 2. Schéma de données (migration 005)
| Table | Rôle | Points clés |
|---|---|---|
| `tournament_categories` | Catégories configurables (P25…P2000, évolutions fédérales) | code, libellé, ordre, actif ; pré-remplie avec les 8 catégories |
| `tournament_formats` | Épreuves : hommes, dames, mixte, jeunes… | code, libellé, actif (configurable) |
| `clubs` | Clubs organisateurs | nom, ville, adresse, latitude/longitude facultatives (filtre distance futur) |
| `tournaments` | Catalogue commun | nom, club, adresse, ville, dates début/fin, catégorie, épreuve, infos et date limite d'inscription, lien officiel, commentaire coach, `source` (manual/imported/verified), `source_ref`, `external_id`, `dedupe_key` unique (nom normalisé + date + club), `status` (prévu/annulé/terminé), `created_by` |
| `tournament_favorites` | Favoris | (tournoi, compte) unique |
| `tournament_participations` | Une participation d'un joueur à un tournoi | `customer_id` (référentiel), `tournament_id`, `status` (6 statuts), `partner_customer_id` ou `partner_name`, `declared_by` (joueur/coach), `confirmation_source` (obligatoire pour « confirmée »), unique (tournoi, joueur) |
| `participation_status_history` | Historique des changements de statut | ancien, nouveau, auteur, date |
| `competition_plans` | Avant le tournoi (une par participation) | objectifs techniques, tactiques, mentaux, vigilance, préparation prévue, notes privées coach |
| `competition_results` | Résultat global | résultat final, matchs, victoires, défaites, observations, points forts, difficultés, `entered_by_role`, `verified` (booléen + source) |
| `competition_matches` | Détail des matchs | tour, adversaires, scores par set, victoire/défaite |
| `result_edit_history` | Corrections tracées (ajout seul) | table, champ, ancienne et nouvelle valeur, auteur, date |
| `coach_analyses` | Analyse du coach | texte, points forts, difficultés, axes de progression, `published` (le joueur ne lit que le publié) |
| `training_focus` | Axes de progression repris en entraînement | joueur, texte, origine (participation/analyse), statut ouvert/travaillé, séance cible facultative → lien avec les objectifs (`goals`) et la préparation de séance |
| `tournament_import_batches` / `tournament_import_rows` | Import | fichier, mapping de colonnes, ligne par ligne : valide/erreur/doublon/mise à jour, rapport |
| `tournament_sources` | Sources de données futures | code, nom, type, statut (désactivée par défaut), licence/autorisation à renseigner ; aucune source n'est activée à ce stade |

Vues de statistiques (sans calcul si données insuffisantes) : `v_competition_stats` par joueur (tournois, matchs, victoires, défaites, taux de victoire, meilleur résultat, fréquence, répartition par catégorie), avec colonnes séparées « déclaré » et « vérifié ». Un indicateur n'est affiché qu'à partir de seuils (par exemple taux de victoire dès 5 matchs).

## 3. Sécurité
- Joueur : lit le catalogue ; gère ses favoris et ses participations ; saisit ses résultats et matchs (marqués « déclarés ») ; lit les analyses **publiées** et ses axes. Ne voit jamais les notes privées du coach ni les données d'un autre joueur ; ne peut pas marquer un résultat « vérifié » ni passer une participation en « confirmée ».
- Coach : toutes les opérations, via le serveur, avec historique des corrections.
- Catalogue modifiable par le coach seulement (le joueur peut proposer un tournoi manquant : il est créé en brouillon « à valider »).
- Protection des données : mêmes règles que le reste du site (RLS, pas d'information personnelle dans les URL, suppression du compte en cascade).

## 4. Intégration pédagogique
Parcours cible : le joueur ajoute un tournoi → le coach voit la participation (tableau de bord et fiche joueur) → le coach définit les objectifs de compétition → résultats saisis → analyse du coach publiée → axes de progression ajoutés à la fiche joueur et créés comme objectifs → axes visibles dans la préparation de la prochaine séance (fiche séance et fiche joueur). Liens directs : fiche joueur ↔ participation ↔ groupe ↔ séance ↔ objectifs.

## 5. Matrice fonctionnelle
| # | Fonction | Coach | Joueur | Phase |
|---|---|---|---|---|
| 1 | Calendrier mensuel, hebdomadaire, liste | oui | oui | A |
| 2 | Recherche et filtres (date, catégorie, lieu, club, épreuve, statut, joueurs participants) | oui | oui (sans filtre « joueurs ») | A |
| 3 | Filtre distance | — | — | futur (champs géographiques prêts) |
| 4 | Fiche détaillée d'un tournoi | oui | oui | A |
| 5 | Ajout manuel d'un tournoi | oui | proposition | A |
| 6 | Favoris | — | oui | A |
| 7 | 6 statuts de participation, historique | oui | oui (déclaratifs) | A |
| 8 | Partenaire | oui | oui | A |
| 9 | Vue coach « tournois de mes élèves » (calendrier + tableau, filtre groupe, joueurs engagés) | oui | — | A |
| 10 | Fiche de compétition avant tournoi | oui | lecture des objectifs | B |
| 11 | Résultats, matchs, scores avec historique des corrections | oui | saisie déclarée | B |
| 12 | Analyse du coach, publication | oui | lecture du publié | B |
| 13 | Axes de progression → objectifs et préparation de séance | oui | lecture | B |
| 14 | Statistiques (déclaré / vérifié, seuils) | comparaison entre joueurs | siennes | B |
| 15 | Import CSV : aperçu, correspondance, validation, doublons, rapport, mise à jour | oui | — | C |
| 16 | Import Excel (.xlsx) | oui | — | C (si validé) |
| 17 | Architecture de synchronisation externe (interface `TournamentSource`, sources désactivées) | configuration | — | C |
| 18 | Navigation et indicateurs du tableau de bord (tournois à 14 jours, résultats à saisir, analyses à publier, joueurs engagés) | oui | onglet « Mes tournois » | A puis B |
| 19 | Migration des tournois existants (table 002) | automatique | — | A |

## 6. Plan de développement
- **Phase A — Catalogue et participations** : migration 005 (catalogue, clubs, catégories, favoris, participations, historique), migration des données existantes, calendrier (mois, semaine, liste), filtres, fiche tournoi, ajout manuel, vue coach, onglet « Mes tournois », navigation et tableau de bord. Tests SQL (RLS, statuts, doublons).
- **Phase B — Compétition et pédagogie** : fiche avant/après, matchs, résultats avec historique, analyses publiées, axes de progression liés aux objectifs et aux séances, statistiques.
- **Phase C — Import et sources** : import CSV (et Excel si validé) avec aperçu, mapping, doublons, rapport ; interface de sources externes, aucune source activée.
- Chaque phase : tests (SQL et unitaires), rapport (terminé / partiel / non développé / configuration / vérifications avant production), aucune mise en production sans votre accord.

## 7. Décisions à valider avant de coder
1. **Compte sans fiche** : un joueur qui a un compte mais jamais réservé n'a pas de fiche `customers`. Proposition : la fiche est créée et liée automatiquement à la fin de l'inscription (nom, e-mail, téléphone du profil), pour que tout passe par un seul référentiel.
2. **Design** : le cahier demande Inter ou Manrope et une navigation latérale ; le site actuel utilise le style « Mixte » (Archivo Expanded + Hanken Grotesk, onglets). Proposition : garder le style actuel pour ne pas avoir deux interfaces.
3. **Livraison** : en trois phases (A, B, C) plutôt qu'en une seule.
4. **Excel** : import CSV d'abord, Excel (.xlsx) en option dans la phase C.
