# Prisme

Jeu de déduction à deux joueurs, en français, jouable sur mobile. Chaque joueur
cache une mine de cinq gemmes, puis tente de reconstituer celle de l'adversaire
en tirant des rayons et en interrogeant des cases. Application 100 % frontend,
pair-à-pair, sans serveur.

**Jouer :** [https://rbiou.github.io/prisme/](https://rbiou.github.io/prisme/)

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir l'URL affichée. Pour tester une partie à deux, ouvrir deux navigateurs
(ou deux appareils) et utiliser le lien d'invitation.

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
- Signalisation manuelle : lien d'invitation + code de réponse, avec Web Share
  API et presse-papiers.
- La mine secrète reste locale. Seuls le point de sortie et la couleur d'un
  rayon sont échangés.
- PWA installable, mises à jour proposées et jamais imposées pendant une partie.
- Déploiement statique sur GitHub Pages, URLs en hash, assets relatifs.

## Limites connues

- Certains réseaux mobiles ou NAT symétriques ne permettent pas la connexion
  sans TURN. Un message clair invite à réessayer sur un autre réseau.
- Une connexion WebRTC ne survit pas au rechargement de la page.
- Le pair-à-pair repose sur la confiance ; un engagement SHA-256 et une
  vérification a posteriori permettent de détecter certaines incohérences.
- Le MVP couvre uniquement la boîte de base à deux joueurs.

## Déploiement

Le workflow `.github/workflows/deploy.yml` exécute lint, typecheck, tests et
build, puis publie `dist/` sur GitHub Pages. Le build utilise `base: './'` pour
fonctionner à la racine comme dans un sous-répertoire.

## Licence

Projet de démonstration. Les règles sont une reformulation originale ; aucun
texte, visuel ou nom commercial du jeu d'origine n'est reproduit.
