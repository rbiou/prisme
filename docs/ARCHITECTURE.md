# Architecture — Prisme

## 1. Vue d'ensemble

Prisme est une application statique composée de trois couches :

1. **Moteur** (`src/engine/`) : géométrie, pièces, rayons, couleurs, validation,
   scan de case, machine à états de fin de partie. TypeScript pur, sans React ni
   DOM, entièrement testable en Node.
2. **Réseau** (`src/net/`) : code de salon, adaptateur PeerJS, validation du
   protocole, session hôte/invité et gestion des engagements.
3. **Interface** (`src/state/`, `src/components/`, `src/screens/`) : React,
   état public de la partie, notes privées, plateau SVG, écrans.

Aucun backend propre n'existe. GitHub Pages ne sert que des fichiers statiques.
Le courtier public PeerJS sert uniquement de rendez-vous : il transforme le code
à six chiffres en connexion WebRTC directe, puis les données de jeu circulent
entre les deux navigateurs.

## 2. Stack

- Vite + React + TypeScript.
- CSS natif avec variables de design, pas de framework UI.
- SVG pour le plateau et les gemmes.
- `peerjs` pour le rendez-vous par code à six chiffres et le canal WebRTC.
- `vite-plugin-pwa` pour le manifeste, le service worker et l'invite de mise à
  jour.
- Vitest + Testing Library pour les tests.
- ESLint + Prettier.
- Déploiement GitHub Pages via GitHub Actions.

## 3. Arborescence

```
.
├── AGENTS.md
├── README.md
├── docs/
│   ├── SPECS.md
│   ├── GAME_RULES.md
│   ├── ARCHITECTURE.md
│   └── PROTOCOL.md
├── public/
│   ├── .nojekyll
│   ├── favicon.svg
│   ├── icon.svg
│   ├── maskable.svg
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   ├── pwa-maskable-512x512.png
│   ├── robots.txt
│   └── apple-touch-icon.png
├── src/
│   ├── engine/
│   │   ├── types.ts
│   │   ├── geometry.ts
│   │   ├── pieces.ts
│   │   ├── colors.ts
│   │   ├── board.ts
│   │   ├── ray.ts
│   │   ├── placement.ts
│   │   ├── cellScan.ts
│   │   ├── mine.ts
│   │   ├── endgame.ts
│   │   ├── noteEdges.ts
│   │   ├── colorMarks.ts
│   │   ├── randomMine.ts
│   │   └── index.ts
│   ├── net/
│   │   ├── roomCode.ts
│   │   ├── integrity.ts
│   │   ├── protocol.ts
│   │   ├── peer.ts
│   │   └── session.ts
│   ├── state/
│   │   ├── matchReducer.ts
│   │   ├── useMatch.ts
│   │   ├── integrityCheck.ts
│   │   ├── resume.ts
│   │   └── settings.ts
│   ├── hooks/
│   │   ├── useHashRoute.ts
│   │   ├── useShare.ts
│   │   ├── usePwaUpdate.ts
│   │   └── usePersistentState.ts
│   ├── components/
│   │   ├── AppHeader.tsx
│   │   ├── Board.tsx
│   │   ├── ColorChip.tsx
│   │   ├── ColorMixLegend.tsx
│   │   ├── Dialog.tsx
│   │   ├── MineComposer.tsx
│   │   └── PwaBanner.tsx
│   ├── screens/
│   ├── i18n/fr.ts
│   ├── styles/
│   ├── test/
│   ├── App.tsx
│   └── main.tsx
├── .github/workflows/deploy.yml
├── index.html
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig*.json
├── eslint.config.js
└── .prettierrc
```

## 4. Modèle du domaine

### 4.1 Coordonnées

- `Point = { x: number; y: number }` en unités de case.
- Les sommets des pièces sont des entiers.
- Les centres de case sont à `(col + 0.5, row + 0.5)`.
- `Cell = { col: number; row: number }` avec `0 ≤ col < 10`, `0 ≤ row < 8`.
- `Entry` : `{ side: 'top'|'right'|'bottom'|'left'; index: number; label: string }`.

### 4.2 Pièces

```ts
type GemColor = 'red' | 'yellow' | 'blue' | 'white';
type Rotation = 0 | 1 | 2 | 3;
type PieceKind =
  'red-parallelogram' | 'yellow-triangle' | 'blue-triangle' | 'white-triangle' | 'white-diamond';

interface PlacedPiece {
  id: PieceKind; // une seule pièce de chaque type dans la base
  kind: PieceKind;
  color: GemColor;
  rotation: Rotation;
  x: number;
  y: number;
}

interface Mine {
  version: 1;
  pieces: PlacedPiece[];
}
```

L'ancre `(x, y)` est le coin supérieur gauche de la boîte englobante de la pièce
après rotation. Les polygones canoniques et leurs quatre rotations sont définis
dans `pieces.ts`.

### 4.3 Rayons et couleurs

```ts
type RayColor =
  | 'transparent'
  | 'white'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'violet'
  | 'green'
  | 'black'
  | 'pink'
  | 'light-yellow'
  | 'light-blue'
  | 'light-orange'
  | 'light-violet'
  | 'light-green'
  | 'gray';

interface RayHit {
  pieceId: PieceKind;
  color: GemColor;
  point: Point;
}
interface RayResult {
  status: 'exit' | 'loop';
  entry: Entry;
  exit?: Entry;
  color: RayColor;
  hits: RayHit[];
  path: Point[];
  steps: number;
}
```

`simulateRay(mine, entry)` est déterministe et pur. Il renvoie `status: 'loop'`
si un état `(position, direction)` se répète ou si le nombre de réflexions
dépasse le plafond.

### 4.4 Validation

`validateMine(mine, options)` vérifie :

- composition exacte des cinq pièces ;
- rotation valide et sommets entiers ;
- pièce contenue dans le plateau ;
- pas de chevauchement ;
- pas de contact bord à bord ;
- chaque gemme atteinte par au moins un rayon ;
- aucun rayon en boucle ;
- option de symétrie des gemmes blanches.

Le résultat est une liste d'erreurs typées avec un code, un message français et
un contexte (pièce, entrée, case). L'interface affiche les messages et
surligne les pièces concernées.

### 4.5 Scan de case

`scanCell(mine, cell)` calcule l'aire d'intersection de chaque pièce avec la
case. La réponse est la pièce qui couvre la plus grande aire. En cas d'égalité,
le centre de la case est testé ; en dernier recours, un ordre fixe
(rouge, jaune, bleu, blanc) tranche. Le résultat inclut les aires pour les tests
et l'interface de débogage.

### 4.6 Fin de partie

La machine à états est indépendante des mines :

```ts
type PlayerId = 'host' | 'guest';
type Phase = 'playing' | 'awaiting-answer' | 'final-turn' | 'ended';
type EndReason =
  | 'non-starter-correct'
  | 'starter-correct-opponent-wrong'
  | 'starter-correct-opponent-correct'
  | 'wrong-submission'
  | 'forfeit';

interface GameState {
  phase: Phase;
  starter: PlayerId;
  turn: PlayerId;
  finalTurnFor?: PlayerId;
  winner?: PlayerId | 'draw';
  endReason?: EndReason;
  scans: ScanRecord[];
  submissions: SubmissionRecord[];
}
```

`resolveSubmission(state, player, correct)` est pure et couvre tous les cas.
Le défenseur est seul à vérifier la proposition ; le résultat est ensuite
répliqué.

## 5. Algorithme de rayon

1. Construire le point de départ et la direction à partir de l'étiquette.
2. Boucler :
   - trouver l'intersection la plus proche entre le rayon et toutes les arêtes
     des pièces, avec un paramètre `t > EPS` ;
   - s'il n'y en a pas avant le bord, calculer le point de sortie et l'étiquette,
     puis terminer ;
   - ajouter la couleur de la pièce touchée à l'ensemble ;
   - réfléchir la direction par rapport à la droite de l'arête ;
   - détecter une répétition de `(position, direction)` ou un dépassement du
     plafond.
3. La couleur finale est lue dans la table de mélange à partir du masque de
   couleurs.

Les intersections sont calculées avec des tolérances (`EPS = 1e-9`). Dans une
mine valide, un rayon ne passe jamais exactement par un sommet ni le long d'une
arête, ce qui évite les ambiguïtés.

## 6. État React

### 6.1 État public répliqué

`matchReducer` regroupe l'état public de la session et celui de la partie :

- rôle, nom, code de salon, phase de session, adversaire, nonce et engagement ;
- `GameState` : phase, tour, premier joueur, dernier tour ;
- journal des scans et confirmations ;
- propositions et résultat ;
- gagnant et raison.

Les deux clients appliquent les mêmes actions dans le même ordre. Les messages
du canal de données sont la source des actions distantes.

### 6.2 État privé local

- `localMine` : mine secrète verrouillée, sel, engagement.
- `notes` : pièces candidates, croix sur les cases vides, arêtes colorées
  (côtés ou diagonales) et ronds de couleur (gemme de couleur connue, forme
  inconnue), conservées dans `sessionStorage` et jamais transmises pendant la
  partie. Les arêtes sont stockées sous forme canonique pour qu'une arête
  partagée par deux cases ne soit enregistrée qu'une fois. Les notes finales
  (pièces, croix, arêtes et ronds) accompagnent le message `reveal` à la fin de
  la partie et servent à expliquer le raisonnement.
- `settings` : options de règles et d'accessibilité.
- `session` : rôle, code de salon, phase (salon, placement, attente, prête,
  reprise) et état de connexion.
- `resume` : dans `localStorage`, code, rôle, nonce, mine verrouillée (mine,
  sel, engagement) et dernier état public. Utilisé pour reprendre après une
  fermeture de l'application ; effacé à la fin de la partie ou au départ.

Les notes et la mine ne sont jamais incluses dans les messages publics avant la
révélation finale.

### 6.3 Composition de l'interface

Il n'y a pas de contexte global ni d'`AppProvider`. `App` est le point de
composition :

- `useMatch(settings)` possède la `MatchSession`, le `matchReducer` et les
  actions (créer, rejoindre, lancer le placement, verrouiller la mine, scans,
  confirmations, proposition, révélation) ;
- `useHashRoute()` expose la route courante et la navigation ;
- `usePersistentState('player-name')` mémorise le nom du joueur ;
- `usePwaUpdate(matchInProgress)` diffère les mises à jour pendant une partie.

`App` transmet aux écrans uniquement les données et les actions dont ils ont
besoin. Les notes privées restent locales à l'écran de prospection. La
navigation suit la session : accueil → salon → placement → partie.

## 7. Réseau et rendez-vous

### 7.1 Code de salon

- Six chiffres, affichés par groupes de trois : `123 456`.
- Normalisation : les espaces, tirets et caractères non numériques sont ignorés.
- Identifiant PeerJS réservé : `prisme-v1-<code>`.
- L'hôte tire un code cryptographique. Si l'identifiant est déjà pris, il en
  retire un autre, jusqu'à huit tentatives.
- Le code n'est affiché qu'une fois le pair réellement enregistré auprès du
  courtier.

### 7.2 WebRTC et PeerJS

- `peerjs` avec le courtier public `0.peerjs.com` sert uniquement au rendez-vous.
- `RTCPeerConnection` avec serveurs STUN publics uniquement, pas de TURN.
- Un seul canal de données fiable et ordonné, label `prisme`, sérialisation
  JSON.
- Au départ, l'hôte détient `prisme-v1-<code>` et écoute les connexions
  entrantes ; l'invité s'y connecte.
- Si le canal tombe, chaque client tente de reprendre le code. Le premier qui y
  parvient devient le détenteur du rendez-vous et accepte la connexion de
  l'autre. Les rôles logiques `host`/`guest` ne changent pas.
- À la réouverture du canal, les deux envoient `hello`, `commit` si nécessaire,
  puis `sync`. L'état public le plus avancé est adopté ; la mine locale reste
  privée.
- Pas de TURN. En cas d'échec, message explicite et proposition de réessayer sur
  un autre réseau.
- Délais : 15 s pour l'enregistrement PeerJS, 20 s pour rejoindre le salon ou
  terminer la poignée de main, 45 s de silence avant une reprise forcée.

### 7.3 Protocole

Voir `docs/PROTOCOL.md`. Les messages sont des objets JSON avec un champ `type`
et `protocol: 3`. Ils sont validés par des guards avant application. Les
messages inconnus ou mal formés sont ignorés. Le message `sync` transporte
l'état public et les révélations déjà reçues, jamais la mine secrète.

### 7.4 Démarrage

1. L'hôte réserve le code, ouvre le salon et attend.
2. L'invité rejoint avec le code. Les deux échangent `hello`.
3. L'hôte envoie `lobby-start` ; chaque joueur place sa mine.
4. Chaque joueur verrouille sa mine et calcule `SHA-256(canonicalMine + salt)`,
   puis envoie `commit`.
5. Quand l'hôte a les deux engagements, il envoie `start` avec les deux nonces,
   les deux hashes et le premier joueur calculé par XOR. Les deux clients
   initialisent le même état.
6. Le premier joueur agit.

## 8. Intégrité

- La mine canonique est sérialisée de façon stable (pièces triées par type,
  coordonnées entières, rotation normalisée).
- Le sel est aléatoire (16 octets) et reste local jusqu'à la révélation.
- À la fin, chaque client envoie `reveal` avec la mine et le sel.
- Le pair vérifie le SHA-256, puis peut rejouer tous les scans enregistrés. Une
  incohérence déclenche un avertissement, sans modifier le résultat déjà
  affiché.
- Limite assumée : un défenseur malveillant peut mentir pendant la partie. La
  vérification finale le détecte, mais ne l'empêche pas.

## 9. PWA et déploiement

- `vite-plugin-pwa`, `registerType: 'prompt'`.
- Manifeste : nom, icônes 192/512/maskable, `display: 'standalone'`,
  `orientation: 'portrait'`, `start_url: './'`, `scope: './'`.
- Service worker : précache de l'interface, pas de mise à jour forcée.
- Bandeau de mise à jour : « Mettre à jour » / « Plus tard ». Pendant une
  partie, le rechargement est différé.
- `base: './'` dans Vite pour GitHub Pages.
- Workflow : lint, typecheck, tests, build, upload artifact, deploy Pages.
- `.nojekyll` dans `public/`.

## 10. Tests

- **Moteur** : pièces, rotations, aires, mélange, rayons, boucles, validation,
  scan de case, fin de partie, sérialisation.
- **Réseau** : code de salon, validation des messages (dont `sync` et les notes
  finales), calcul du premier joueur, machine de session (hôte/invité) avec un
  faux pair PeerJS, engagement, démarrage, coupure et reprise.
- **Notes et génération** : arêtes canoniques, ronds de couleur, placement
  aléatoire valide, sérialisation des notes incomplètes.
- **Interface** : smoke tests des écrans, placement d'une pièce, affichage des
  erreurs, dialogue de confirmation.
- **Build** : `npm run build` doit produire un `dist/` sans erreur et avec des
  chemins relatifs.

## 11. Performance

- Le plateau est un SVG de 80 cases ; le rendu est négligeable.
- La validation complète effectue 36 rayons, chacun avec au plus quelques
  dizaines de réflexions. Complexité acceptable.
- Les notes et l'historique sont petits ; pas de virtualisation nécessaire.
- Les animations de rayon utilisent CSS/SVG et respectent
  `prefers-reduced-motion`.

## 12. Accessibilité

- Toutes les commandes sont des boutons ou des champs natifs.
- Les étiquettes de bord ont des noms accessibles (« Rayon depuis la case 5 »).
- Les réponses sont annoncées via `aria-live="polite"`.
- Les couleurs sont doublées par un libellé et une forme.
- Le zoom du plateau ne piège pas le focus ; la saisie de coordonnées reste
  disponible.
- Contraste AA, focus visible, taille de police relative.

## 13. Décisions et compromis

| Décision                 | Justification                                                     |
| ------------------------ | ----------------------------------------------------------------- |
| Pas de backend           | Contrainte du projet ; GitHub Pages statique.                     |
| Code à six chiffres      | Simple à dicter ; le courtier public PeerJS sert de rendez-vous.  |
| STUN seulement           | Pas d'infrastructure TURN ; limite acceptée et documentée.        |
| Mine autoritaire locale  | Chaque joueur calcule ses réponses ; la confiance est nécessaire. |
| Engagement + révélation  | Détection a posteriori des modifications de mine.                 |
| Notes privées            | Le plaisir de la déduction vient des hypothèses personnelles.     |
| Simulation sur les notes | Aide à la déduction sans révéler la mine réelle.                  |
| SVG                      | Précision géométrique, rayons, accessibilité, poids faible.       |
| Pas de router externe    | Hash routing simple, compatible GitHub Pages.                     |
| Règle 2025 optionnelle   | Fidélité au livret fourni + clarté compétitive.                   |
