# Prisme

Jeu de déduction à deux joueurs, en français, jouable sur mobile. Chaque joueur
cache une mine de cinq gemmes, puis tente de reconstituer celle de l'adversaire
en tirant des rayons et en interrogeant des cases. Application 100 % frontend,
pair-à-pair, sans backend propre : un courtier public PeerJS sert uniquement de
rendez-vous pour le code à six chiffres, puis les données passent en WebRTC
direct entre les deux navigateurs.

**Jouer :** [https://rbiou.github.io/prisme/](https://rbiou.github.io/prisme/)

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir l'URL affichée. Pour tester une partie à deux, ouvrir deux navigateurs
(ou deux appareils) : l'hôte crée un salon et partage le code à six chiffres,
l'invité saisit ce code sur l'accueil.

## Scripts

| Commande            | Rôle                    |
| ------------------- | ----------------------- |
| `npm run dev`       | Développement Vite      |
| `npm run build`     | Build de production     |
| `npm run preview`   | Prévisualiser le build  |
| `npm run lint`      | ESLint                  |
| `npm run typecheck` | Vérification TypeScript |
| `npm run test`      | Tests Vitest en watch   |
| `npm run test:run`  | Tests Vitest une fois   |
| `npm run format`    | Prettier                |

## Documentation

- [`AGENTS.md`](AGENTS.md) — conventions pour les contributeurs et agents.
- [`docs/GAME_RULES.md`](docs/GAME_RULES.md) — règles complètes et hypothèses.
- [`docs/SPECS.md`](docs/SPECS.md) — spécifications produit et parcours.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture technique.
- [`docs/PROTOCOL.md`](docs/PROTOCOL.md) — protocole pair-à-pair.

## Principes techniques

- Vite + React + TypeScript.
- Moteur pur dans `src/engine/`, testé avec Vitest.
- WebRTC via un canal de données fiable ; STUN public uniquement, pas de TURN.
- Rendez-vous par code à six chiffres : PeerJS et son courtier public
  `0.peerjs.com` réservent l'identifiant du salon. Dès que le canal est ouvert,
  les échanges de jeu passent directement entre les navigateurs.
- La mine secrète reste locale. Seuls le point de sortie et la couleur d'un
  rayon sont échangés.
- Une coupure est reprise automatiquement : le joueur restant garde le code,
  puis les deux clients resynchronisent l'état public. Après fermeture de
  l'application, un bouton permet de reprendre depuis une sauvegarde locale.
- PWA installable, mises à jour proposées et jamais imposées pendant une partie.
- Déploiement statique sur GitHub Pages, URLs en hash, assets relatifs.

## Limites connues

- Certains réseaux mobiles ou NAT symétriques ne permettent pas la connexion
  sans TURN. Un message clair invite à réessayer sur un autre réseau.
- Le courtier public PeerJS doit être joignable au moment du rendez-vous. Il ne
  voit pas les données de jeu, qui restent en WebRTC direct.
- La reprise après fermeture dépend du stockage local du navigateur. Si les
  données du site sont effacées, la partie ne peut pas être restaurée.
- Le pair-à-pair repose sur la confiance ; un engagement SHA-256 et une
  vérification a posteriori permettent de détecter certaines incohérences.
- Le code à six chiffres n'est pas un secret fort : un tiers peut théoriquement
  deviner un salon. L'hôte voit le nom du joueur avant de lancer la partie.
- Le MVP couvre uniquement la boîte de base à deux joueurs.

## Déploiement

Le workflow `.github/workflows/deploy.yml` exécute lint, typecheck, tests et
build, puis publie `dist/` sur GitHub Pages. Le build utilise `base: './'` pour
fonctionner à la racine comme dans un sous-répertoire.

## Licence

Projet de démonstration. Les règles sont une reformulation originale ; aucun
texte, visuel ou nom commercial du jeu d'origine n'est reproduit.
