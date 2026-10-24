# Spécifications produit — Prisme

## 1. Résumé

Prisme est une PWA de déduction pour deux joueurs. Chacun cache une mine de
cinq gemmes et interroge les rayons de la mine adverse pour en déduire la
disposition exacte. La partie se joue à distance, sans backend propre : un
courtier public PeerJS transforme un code à six chiffres en rendez-vous WebRTC,
puis les échanges passent directement entre les deux navigateurs.

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
3. Établir une connexion pair-à-pair sans backend propre, avec un code à six
   chiffres facile à partager.
4. Être installable comme PWA sur l'écran d'accueil et se mettre à jour sans
   interrompre une partie.
5. Fonctionner sur GitHub Pages, y compris dans un sous-répertoire.

## 4. Non-objectifs du MVP

- Trois joueurs et plus.
- Extensions Diamant et Corps noir.
- Appariement automatique, comptes, classement, chat.
- Courtier de rendez-vous auto-hébergé, TURN, stockage cloud.
- QR code du code de salon (prévu plus tard).
- Reprise d'une partie dont le stockage local a été effacé.
- Anti-triche fort : la confiance reste nécessaire, avec vérification a
  posteriori.

## 5. Parcours utilisateur

### 5.1 Accueil

- Champ **Votre nom**.
- Bouton **Créer une partie**.
- Bouton **Rejoindre une partie** avec un champ de code à six chiffres.
- Bouton **Reprendre la partie interrompue** si une sauvegarde locale existe
  (coupure, fermeture de l'application).
- Accès aux **Règles** et aux **Réglages** (règle de symétrie 2025, réduction
  des animations).
- Bandeau discret si une mise à jour PWA est disponible.

### 5.2 Création d'une partie (hôte)

1. Saisir son nom, puis **Créer une partie**.
2. Le client réserve un code à six chiffres auprès du courtier public et ouvre
   le **salon**. Le code est affiché en grand, avec **Partager** et
   **Copier**.
3. L'hôte attend que l'adversaire rejoigne. Le nom de l'invité apparaît dès que
   la connexion directe est établie.
4. L'hôte clique **Lancer la partie**.
5. Les deux joueurs placent alors leur mine. La partie démarre automatiquement
   quand les deux mines sont verrouillées et les engagements échangés.

### 5.3 Rejoindre une partie (invité)

1. Saisir son nom et le code à six chiffres, puis **Rejoindre**.
2. Le client se connecte au salon et affiche l'attente de l'hôte.
3. Quand l'hôte lance la partie, l'invité place et verrouille sa mine.
4. La partie démarre dès que les deux engagements sont échangés.

### 5.4 Placement des mines

Chaque joueur compose sa mine sur le plateau **Ma mine**. Le panneau de
validation indique en temps réel les contraintes restantes. Une fois la mine
valide, **Verrouiller ma mine** calcule l'engagement SHA-256 et l'envoie à
l'adversaire. L'écran d'attente affiche le nom de l'adversaire jusqu'au
démarrage.

### 5.5 Partie

Deux onglets principaux :

- **Prospection** : plateau adverse, notes privées, journal des réponses,
  contrôles de scan, bouton de proposition.
- **Ma mine** : mine secrète verrouillée, visualisation, et fenêtre de
  confirmation lorsqu'une question de l'adversaire arrive.

Bandeau de tour permanent : « À vous de prospecter », « Au tour de
l'adversaire », « Réponse en attente de confirmation », « Dernier tour ».

Quand l'adversaire répond à une question ou à une confirmation, une notification
discrète apparaît en surimpression de l'écran et disparaît seule après quelques
secondes. Elle rappelle la question et le résultat reçu sans interrompre le jeu.

Les étiquettes de bord déjà utilisées dans le journal public sont grisées sur le
plateau de prospection, pour éviter de rejouer un rayon déjà connu. Le panneau
**Repères de couleur** rappelle les seize mélanges, comme dans les règles
(rouge + bleu + jaune + blanc = gris, par exemple).

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
- Un outil **Croix** permet de marquer les cases dont on sait qu'elles sont
  vides. Ces marques restent locales et peuvent être effacées séparément.
- Un outil **Arêtes** permet de noter les bords de gemmes déjà déduits : un des
  quatre côtés d'une case ou l'une des deux diagonales, avec la couleur de la
  gemme concernée. C'est utile pour mémoriser l'arête qui a fait rebondir un
  rayon. Une arête partagée par deux cases n'est enregistrée qu'une fois ; la
  toucher à nouveau avec la même couleur la retire, avec une autre couleur la
  recolore. Ces notes restent locales.
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

### 5.6 Coupure et reprise

- Si la connexion directe tombe pendant le salon, le placement ou la partie,
  l'écran reste en place avec le message **Connexion interrompue — reprise en
  cours…**.
- La reprise est automatique : le joueur restant garde le code du salon, l'autre
  se reconnecte et les états publics sont resynchronisés.
- Les rôles logiques ne changent pas, mais le joueur restant devient le
  détenteur du code tant que l'autre est absent.
- Après fermeture de l'application, un bouton **Reprendre la partie interrompue**
  apparaît à l'accueil. La mine verrouillée et l'état public sont relus depuis
  une sauvegarde locale.
- Si la reprise automatique échoue, un bouton **Réessayer la connexion** reste
  disponible sans perdre la partie.
- La sauvegarde locale est effacée à la fin de la partie ou lors d'un départ
  volontaire.

### 5.7 Fin de partie

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
| F03 | Réserver un salon avec un code à six chiffres et attendre l'adversaire.                            |
| F04 | Rejoindre un salon à partir du code à six chiffres.                                                |
| F05 | Afficher le code du salon, le partager et voir l'adversaire connecté.                              |
| F06 | Établir un canal de données fiable et ordonné après le rendez-vous PeerJS.                         |
| F07 | Lancer le placement depuis le salon, puis échanger les engagements et choisir le premier joueur.   |
| F08 | Tirer un rayon, calculer localement la réponse, la faire confirmer, envoyer seulement le résultat. |
| F09 | Scanner une case avec une règle déterministe.                                                      |
| F10 | Tenir un journal public des scans et confirmations.                                                |
| F11 | Permettre des notes privées avec pièces candidates et simulation.                                  |
| F12 | Soumettre une mine candidate et appliquer la machine à états de fin de partie.                     |
| F13 | Révéler les mines et vérifier l'engagement à la fin.                                               |
| F14 | Installer la PWA, cacher l'interface, proposer les mises à jour.                                   |
| F15 | Fonctionner sur GitHub Pages avec des URLs en hash.                                                |
| F16 | Afficher des messages clairs en cas d'échec de connexion (NAT, STUN, courtier indisponible).       |
| F17 | Reprendre automatiquement une partie après une coupure, ou manuellement via le code.               |
| F18 | Griser les entrées déjà demandées et afficher la table des mélanges de couleurs en partie.         |

## 7. Exigences non fonctionnelles

- **Mobile d'abord** : lisible à partir de 360 px de large, zones tactiles de
  44 px minimum, portrait.
- **Performance** : calcul d'un rayon < 5 ms sur un téléphone milieu de gamme ;
  validation complète < 100 ms.
- **Accessibilité** : navigation clavier, focus visible, contrastes AA, libellés
  textuels pour les couleurs, respect de `prefers-reduced-motion`.
- **Robustesse** : messages réseau validés, état idempotent, aucune mine
  envoyée avant la fin, reprise automatique après une coupure.
- **Confidentialité** : pas de compte, pas d'analytics, pas de cookie, pas de
  stockage serveur. Le courtier public PeerJS ne reçoit que l'identifiant du
  salon et les métadonnées de connexion, jamais la mine ni les réponses. La
  sauvegarde de reprise reste sur l'appareil et ne quitte jamais le navigateur.
- **Hors ligne** : l'interface et les règles sont disponibles hors ligne ; une
  partie en cours nécessite la connexion pair-à-pair.

## 8. Critères d'acceptation du MVP

1. Un joueur peut placer les cinq pièces, tourner, déplacer, supprimer et voir
   les erreurs de validation.
2. Une mine valide peut être verrouillée et produit un engagement SHA-256.
3. Deux navigateurs peuvent se connecter via un code à six chiffres, sans
   backend propre, et échanger les données de jeu en WebRTC direct.
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

| Risque                       | Parade                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| NAT strict, pas de TURN      | STUN public, message d'erreur, conseil Wi-Fi, réessai, nouveau salon.                 |
| Courtier PeerJS indisponible | Message explicite, réessai, code régénéré si l'identifiant est déjà pris.             |
| Code à six chiffres deviné   | Salon visible par l'hôte avant lancement, code non secret fort, partie courte.        |
| Perte de connexion           | Reprise automatique, détenteur du code conservé, bouton de réessai et sauvegarde.     |
| Triche du défenseur          | Engagement de mine, révélation finale, rejeu des réponses, avertissement d'intégrité. |
| Ambiguïté de scan de case    | Règle de plus grande surface, documentée et testée.                                   |
| Boucle de rayon              | Rejet de la mine et message avec l'entrée fautive.                                    |
| Dépassement du plateau       | Validation en temps réel et surbrillance.                                             |
| Rechargement accidentel      | Brouillon de mine en session, avertissement avant de quitter une partie.              |

## 11. Roadmap envisagée

1. QR code pour partager le code de salon.
2. Mode entraînement contre une mine générée localement.
3. Extensions Diamant et Corps noir.
4. Trois joueurs et plus.
5. Rejouer sur la même connexion.
6. Statistiques locales et historique.
7. Internationalisation (français puis anglais).
