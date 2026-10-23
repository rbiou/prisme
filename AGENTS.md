# AGENTS.md — Prisme

## Mission

Prisme est un jeu de déduction à deux joueurs, jouable sur mobile, sans serveur :
chaque joueur cache une mine de cinq gemmes et tente de reconstituer celle de
l'adversaire en interrogeant des rayons. L'application est une PWA statique,
déployée sur GitHub Pages. La communication entre les deux navigateurs se fait
en pair-à-pair via WebRTC.

## Langue et ton

- Toute la documentation, l'interface, les messages d'erreur et les libellés
  sont en français.
- Le code (variables, types, fonctions, fichiers) est en anglais.
- Ne jamais copier le texte, les illustrations, la mise en page ou le nom
  commercial du jeu d'origine. Les règles sont reformulées, les visuels sont
  des SVG originaux et le thème est « cristallin ».
- Utiliser un français clair, sans jargon inutile.

## Stack et commandes

- Vite + React + TypeScript, npm.
- `npm install` — installer.
- `npm run dev` — serveur de développement.
- `npm run build` — build de production.
- `npm run preview` — prévisualiser le build.
- `npm run lint` — ESLint.
- `npm run typecheck` — TypeScript sans émission.
- `npm run test` — Vitest en mode watch.
- `npm run test:run` — Vitest une fois.
- `npm run format` — Prettier.

Toujours lancer `npm run lint`, `npm run typecheck`, `npm run test:run` et
`npm run build` avant de considérer une tâche terminée.

## Architecture

```
src/
  engine/     moteur pur, sans React ni DOM
  net/        WebRTC, signalisation manuelle, protocole
  state/      état React, notes privées, réglages
  components/ composants réutilisables (plateau, gemmes, dialogues)
  screens/    écrans de l'application
  hooks/      hooks transverses
  i18n/       chaînes françaises
  styles/     CSS global et jetons de design
```

Règles d'architecture :

1. `engine/` ne doit importer ni React, ni DOM, ni `net/`. C'est du TypeScript
   pur, testable en Node.
2. Le moteur est la source de vérité pour la géométrie, les rayons, les
   couleurs, la validation et la machine à états de fin de partie.
3. Chaque client est seul autoritaire sur sa mine secrète. La mine n'est jamais
   envoyée pendant la partie, seulement un engagement SHA-256.
4. L'état public de la partie est répliqué à l'identique par les deux clients à
   partir des messages du canal de données. Les notes et la mine locale restent
   privées.
5. Aucun backend, aucun serveur de signalisation, aucun TURN. STUN public
   uniquement. La signalisation se fait par lien d'invitation et code de
   réponse copiés/collés ou partagés.
6. Pas de routing par historique : utiliser le hash (`#/...`) pour fonctionner
   sur GitHub Pages.

## Invariants du jeu

- Plateau : 10 colonnes × 8 lignes. Cases indexées de 0 à 9 et de 0 à 7.
- Coins des gemmes sur les intersections entières de la grille.
- Cinq gemmes de base : 1 rouge (parallélogramme), 1 jaune (petit triangle
  rectangle), 1 bleue (grand triangle isocèle rectangle), 1 blanche (même grand
  triangle), 1 blanche (losange).
- Rotations de 90° uniquement, jamais de retournement.
- Pas de chevauchement, pas de contact bord à bord. Les contacts par un coin ou
  un coin contre un bord sont autorisés.
- Chaque gemme doit être atteignable par au moins un des 36 rayons.
- Tout rayon qui boucle rend la mine invalide.
- Les rayons voyagent sur les lignes médianes des rangées et colonnes. Une arête
  à 45° fait tourner le rayon de 90° ; une arête perpendiculaire le renvoie en
  arrière. Les arêtes parallèles au rayon ne sont jamais rencontrées dans une
  mine valide (les sommets sont entiers, les rayons à demi-entiers).
- Une couleur déjà rencontrée ne compte qu'une fois. Table de mélange :
  rouge + bleu = violet ; rouge + jaune = orange ; bleu + jaune = vert ;
  rouge + jaune + bleu = noir ; blanc + rouge = rose ; blanc + jaune = jaune
  clair ; blanc + bleu = bleu clair ; blanc + rouge + jaune = orange clair ;
  blanc + rouge + bleu = violet clair ; blanc + jaune + bleu = vert clair ;
  les quatre = gris ; aucun contact = incolore ; blanc seul = blanc.
- Fin de partie : une proposition correcte du joueur non-débutant gagne
  immédiatement ; une proposition correcte du débutant lui vaut un dernier tour
  de l'adversaire (correct = égalité, incorrect = victoire du débutant) ; toute
  proposition incorrecte perd immédiatement.
- La confirmation d'une réponse déjà donnée est gratuite et ne consomme pas de
  tour.

## Conventions de code

- TypeScript strict. Pas de `any` non justifié. Préférer les unions discriminées.
- Composants React fonctionnels, hooks. Pas de classes sauf pour le pair-à-pair.
- Les fonctions du moteur sont pures et retournent des résultats explicites
  (`{ ok: true, ... } | { ok: false, error: ... }`) pour les cas métier.
- Ne pas muter les structures d'état : créer de nouveaux objets/tableaux.
- Utiliser des identifiants stables : `host`/`guest` pour les joueurs, le type
  de gemme pour l'identifiant de pièce.
- Les messages réseau sont validés avant d'être appliqués. Un message inconnu ou
  mal formé est ignoré et journalisé, jamais appliqué à moitié.
- Les couleurs ne doivent jamais être le seul vecteur d'information : ajouter
  une étiquette, une forme ou un motif.
- Accessibilité : boutons natifs, focus visible, `aria-live` pour les réponses et
  les changements de tour, libellés explicites pour les entrées de rayon.
- Pas de données personnelles, pas d'analytics, pas de cookies.

## Tests

- Chaque règle du moteur doit avoir un test Vitest.
- Couvrir au minimum : rotations et aires, mélange des 16 combinaisons, rayons
  (sortie, rebond, boucle), validation du placement (chevauchement, contact,
  hors plateau, gemme cachée), scan de case, machine à états de fin de partie,
  sérialisation et compression de la signalisation.
- Les tests doivent être déterministes ; pas de dépendance à l'ordre des objets
  ou au hasard non contrôlé.
- Un bug corrigé doit être accompagné d'un test de régression.

## Sécurité et vie privée

- La mine secrète reste en mémoire (et éventuellement en `sessionStorage` pour
  un brouillon). Elle n'est jamais envoyée avant la fin.
- Un engagement SHA-256 (mine + sel) est échangé au début. À la fin, chaque
  joueur révèle sa mine et son sel ; le client vérifie l'engagement et peut
  rejouer les réponses pour détecter une incohérence.
- Les codes de signalisation contiennent des adresses réseau (candidats ICE).
  Ne pas les publier au-delà de l'adversaire.
- Pas de TURN : certains réseaux mobiles ne pourront pas établir la connexion.
  Afficher un message clair, proposer de réessayer et expliquer que le Wi-Fi ou
  un autre réseau peut aider.
- Ne pas promettre une sécurité forte : le pair-à-pair est fondé sur la
  confiance et la vérification a posteriori.

## Déploiement

- GitHub Pages, build statique dans `dist/`.
- `base: './'` pour que les assets fonctionnent à la racine comme dans un
  sous-répertoire.
- Workflow `.github/workflows/deploy.yml` : lint, typecheck, tests, build, puis
  déploiement Pages.
- Les mises à jour PWA sont proposées, jamais imposées pendant une partie.

## Pièges connus

- Ne pas revenir à un plateau 7×6 de type « puissance 4 » : ce n'est pas le jeu.
- Ne pas utiliser `BrowserRouter` sans fallback : GitHub Pages renverrait 404.
- Ne pas oublier que les rayons partent des milieux de cases, pas des lignes de
  grille.
- Ne pas confondre la couleur d'une gemme et la couleur du rayon.
- Ne pas révéler la trajectoire à l'adversaire : seul le point de sortie et la
  couleur sortent du navigateur du défenseur.
- Ne pas auto-recharger la PWA pendant une partie.
- Ne pas supprimer ou écraser un fichier utilisateur sans l'avoir examiné.
