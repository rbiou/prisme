# Spécifications produit — Prisme

## 1. Résumé

Prisme est une PWA de déduction pour deux joueurs. Chacun cache une mine de
cinq gemmes et interroge les rayons de la mine adverse pour en déduire la
disposition exacte. La partie se joue à distance, sans serveur : la connexion
est établie en pair-à-pair par WebRTC, avec une signalisation manuelle par lien
et code de réponse.

## 2. Public et contexte

- Deux joueurs équipés d'un smartphone ou d'une tablette, sur le même réseau ou
  sur des réseaux différents.
- Sessions courtes (10 à 20 minutes), en portrait, avec une seule main
  disponible.
- Le jeu doit rester jouable hors ligne pour l'interface, mais la connexion
  pair-à-pair nécessite un réseau.

## 3. Objectifs

1. Permettre de placer et valider une mine secrète sans jamais la révéler avant
   la fin.
2. Proposer une prospection fluide : tir de rayon, scan de case, notes locales,
   simulation sur les hypothèses, journal des réponses.
3. Établir une connexion pair-à-pair sans backend, avec des codes faciles à
   partager.
4. Être installable comme PWA sur l'écran d'accueil et se mettre à jour sans
   interrompre une partie.
5. Fonctionner sur GitHub Pages, y compris dans un sous-répertoire.

## 4. Non-objectifs du MVP

- Trois joueurs et plus.
- Extensions Diamant et Corps noir.
- Appariement automatique, comptes, classement, chat.
- Serveur de signalisation, TURN, stockage cloud.
- QR code de signalisation (prévu plus tard).
- Mode hors ligne complet avec reprise d'une connexion WebRTC.
- Anti-triche fort : la confiance reste nécessaire, avec vérification a
  posteriori.

## 5. Parcours utilisateur

### 5.1 Accueil

- Bouton **Créer une partie**.
- Bouton **Rejoindre une invitation** (coller un lien ou un code).
- Accès aux **Règles** et aux **Réglages** (règle de symétrie 2025, réduction
  des animations).
- Bandeau discret si une mise à jour PWA est disponible.

### 5.2 Création d'une partie (hôte)

1. Placer les cinq gemmes sur le plateau **Ma mine**.
2. Le panneau de validation indique en temps réel les contraintes restantes.
3. Une fois la mine valide, **Verrouiller ma mine**.
4. Le client crée une offre WebRTC et affiche :
   - un lien d'invitation ;
   - un bouton **Partager** (Web Share API) et **Copier** ;
   - un champ pour coller le code de réponse de l'adversaire ;
   - l'état de la connexion.
5. L'hôte partage le lien, attend le code de réponse, le colle, puis
   **Connecter**.
6. Une fois le canal ouvert et les deux joueurs prêts, la partie démarre.

### 5.3 Rejoindre une partie (invité)

1. Ouvrir le lien d'invitation : l'écran de placement s'affiche avec un bandeau
   « Invitation reçue ».
2. Placer et verrouiller sa mine.
3. **Générer ma réponse** : le client crée la réponse WebRTC et affiche un code
   à renvoyer à l'hôte, avec **Partager** et **Copier**.
4. Attendre que l'hôte connecte. Une fois le canal ouvert, la partie démarre.

### 5.4 Partie

Deux onglets principaux :

- **Prospection** : plateau adverse, notes privées, journal des réponses,
  contrôles de scan, bouton de proposition.
- **Ma mine** : mine secrète verrouillée, visualisation, et fenêtre de
  confirmation lorsqu'une question de l'adversaire arrive.

Bandeau de tour permanent : « À vous de prospecter », « Au tour de
l'adversaire », « Réponse en attente de confirmation », « Dernier tour ».

#### Tir de rayon

- Le prospecteur touche une étiquette de bord (`1`–`18`, `A`–`R`).
- Une demande est envoyée. Le défenseur voit une fenêtre privée :
  - trajectoire animée sur sa mine ;
  - point de sortie et couleur calculés ;
  - boutons **Confirmer** et **Annuler**.
- Après confirmation, seul le résultat (sortie + couleur) est envoyé et
  ajouté au journal. Le tour passe.

#### Scan de case

- Le prospecteur touche une case ou saisit ses coordonnées.
- Le défenseur voit la case surlignée et la réponse calculée (couleur ou
  « Rien »), puis confirme.
- Le résultat est ajouté au journal et le tour passe.

#### Notes et simulation

- Palette des cinq pièces candidates.
- Placement, rotation, déplacement et suppression sur un calque privé.
- Les notes peuvent être incomplètes ; la simulation n'est proposée que
  lorsqu'elles forment une mine valide.
- **Simuler un rayon** : choisir une entrée, voir la trajectoire et le résultat
  calculés sur les notes. Comparer avec les réponses enregistrées ; les
  incohérences sont signalées.
- Les notes ne sont jamais transmises.

#### Proposition

- Le prospecteur construit une mine candidate complète dans les notes, puis
  **Soumettre la proposition**.
- Une confirmation rappelle que toute erreur est éliminatoire.
- Le défenseur vérifie automatiquement et annonce le résultat.
- La fin de partie suit les règles (voir `GAME_RULES.md`).

#### Confirmation gratuite

- Chaque réponse du journal possède une action **Confirmer à nouveau**.
- La demande ne change pas le tour ; le défenseur recalcule et confirme.
- Le journal distingue une confirmation gratuite d'un nouveau scan.

### 5.5 Fin de partie

- Écran de résultat : victoire, défaite ou égalité, avec la raison.
- Révélation des deux mines côte à côte (empilées sur mobile).
- Vérification de l'engagement SHA-256 et, sur demande, rejeu des réponses.
- Boutons **Rejouer** (si la connexion est encore active) et **Accueil**.
- En cas de doute sur l'intégrité, un avertissement explicite est affiché.

## 6. Exigences fonctionnelles

| ID  | Exigence                                                                                           |
| --- | -------------------------------------------------------------------------------------------------- |
| F01 | Placer les cinq gemmes avec rotations de 90°, sur la grille, sans chevauchement.                   |
| F02 | Valider en temps réel les contraintes de placement et de rayons.                                   |
| F03 | Verrouiller la mine avant l'échange de signalisation.                                              |
| F04 | Créer une offre WebRTC compressée dans un lien partageable.                                        |
| F05 | Créer une réponse WebRTC compressée dans un code partageable.                                      |
| F06 | Établir un canal de données fiable et ordonné.                                                     |
| F07 | Échanger les engagements de mine et choisir le premier joueur.                                     |
| F08 | Tirer un rayon, calculer localement la réponse, la faire confirmer, envoyer seulement le résultat. |
| F09 | Scanner une case avec une règle déterministe.                                                      |
| F10 | Tenir un journal public des scans et confirmations.                                                |
| F11 | Permettre des notes privées avec pièces candidates et simulation.                                  |
| F12 | Soumettre une mine candidate et appliquer la machine à états de fin de partie.                     |
| F13 | Révéler les mines et vérifier l'engagement à la fin.                                               |
| F14 | Installer la PWA, cacher l'interface, proposer les mises à jour.                                   |
| F15 | Fonctionner sur GitHub Pages avec des URLs en hash.                                                |
| F16 | Afficher des messages clairs en cas d'échec de connexion (NAT, STUN).                              |

## 7. Exigences non fonctionnelles

- **Mobile d'abord** : lisible à partir de 360 px de large, zones tactiles de
  44 px minimum, portrait.
- **Performance** : calcul d'un rayon < 5 ms sur un téléphone milieu de gamme ;
  validation complète < 100 ms.
- **Accessibilité** : navigation clavier, focus visible, contrastes AA, libellés
  textuels pour les couleurs, respect de `prefers-reduced-motion`.
- **Robustesse** : messages réseau validés, état idempotent, aucune mine
  envoyée avant la fin.
- **Confidentialité** : pas de compte, pas d'analytics, pas de cookie, pas de
  stockage serveur. Les codes de signalisation contiennent des candidats ICE.
- **Hors ligne** : l'interface et les règles sont disponibles hors ligne ; une
  partie en cours nécessite la connexion pair-à-pair.

## 8. Critères d'acceptation du MVP

1. Un joueur peut placer les cinq pièces, tourner, déplacer, supprimer et voir
   les erreurs de validation.
2. Une mine valide peut être verrouillée et produit un engagement SHA-256.
3. Deux navigateurs peuvent se connecter via un lien d'invitation et un code de
   réponse, sans serveur.
4. Un tir de rayon produit le bon point de sortie et la bonne couleur pour les
   16 combinaisons, avec réflexions et détection de boucle.
5. Un scan de case produit une réponse déterministe.
6. Le journal, le tour et les rôles restent synchronisés entre les deux clients.
7. Une proposition correcte ou incorrecte applique la bonne fin de partie.
8. Les deux mines sont révélées et l'engagement est vérifié.
9. `npm run lint`, `npm run typecheck`, `npm run test:run` et `npm run build`
   passent.
10. Le build est installable en PWA et fonctionne sous un chemin GitHub Pages.

## 9. Décisions d'interface

- **Portrait d'abord**, avec zoom/pan et saisie de coordonnées pour compenser
  la petite taille du plateau.
- **Deux onglets** seulement : Prospection et Ma mine. Les règles et réglages
  sont accessibles depuis l'accueil ou un menu.
- **Pas de révélation de trajectoire** au prospecteur : seul le résultat est
  public.
- **Confirmation obligatoire** côté défenseur pour éviter les réponses
  accidentelles.
- **Notes privées** clairement identifiées comme locales, avec un badge
  « Privé ».
- **Couleurs + formes + libellés** pour ne pas dépendre uniquement de la
  couleur.
- **Mises à jour PWA différées** pendant une partie.

## 10. Risques et parades

| Risque                      | Parade                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------- |
| NAT strict, pas de TURN     | STUN public, message d'erreur, conseil Wi-Fi, réessai, nouvelle invitation.           |
| Lien d'invitation trop long | Compression, Web Share, copie, indication de coller le code complet.                  |
| Perte de connexion          | Écran explicite, partie non reprise automatiquement, nouvelle invitation.             |
| Triche du défenseur         | Engagement de mine, révélation finale, rejeu des réponses, avertissement d'intégrité. |
| Ambiguïté de scan de case   | Règle de plus grande surface, documentée et testée.                                   |
| Boucle de rayon             | Rejet de la mine et message avec l'entrée fautive.                                    |
| Dépassement du plateau      | Validation en temps réel et surbrillance.                                             |
| Rechargement accidentel     | Brouillon de mine en session, avertissement avant de quitter une partie.              |

## 11. Roadmap envisagée

1. QR code pour la signalisation.
2. Mode entraînement contre une mine générée localement.
3. Extensions Diamant et Corps noir.
4. Trois joueurs et plus.
5. Rejouer sur la même connexion.
6. Statistiques locales et historique.
7. Internationalisation (français puis anglais).
