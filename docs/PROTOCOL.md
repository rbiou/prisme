# Protocole pair-à-pair — Prisme

## 1. Principes

- Rendez-vous : un code à six chiffres identifie le salon auprès du courtier
  public PeerJS. L'identifiant réservé est `prisme-v1-<code>`.
- Transport des données : un seul `RTCDataChannel` fiable et ordonné, label
  `prisme`, une fois la connexion WebRTC directe établie.
- Encodage : JSON UTF-8.
- Version : `protocol: 3` dans chaque message.
- Les messages sont validés avant application. Un message invalide est ignoré
  et journalisé.
- Les deux clients maintiennent le même état public. La mine et les notes ne
  circulent jamais avant `reveal`.
- Les identifiants de messages sont des chaînes aléatoires (16 octets hex).
- Les actions sont idempotentes : un message déjà appliqué est ignoré.

## 2. Rôles

- `host` : rôle logique du créateur. Il réserve le code au départ, ouvre le salon
  et lance la partie.
- `guest` : rôle logique du joueur qui rejoint avec le code.
- Le rôle logique ne change jamais. En revanche, le **détenteur du code** peut
  changer : si l'hôte disparaît, l'invité réserve `prisme-v1-<code>` pour garder
  le salon joignable. L'hôte qui revient se connecte alors au code comme un
  client, tout en conservant son rôle logique.
- Le premier joueur est calculé à partir des nonces :
  `starter = (BigInt('0x' + hostNonce) ^ BigInt('0x' + guestNonce)) % 2n === 0n ? 'host' : 'guest'`.

## 3. Types de base

```ts
type PlayerId = 'host' | 'guest';
type EntryLabel = '1'..'10' | '11'..'18' | 'A'..'H' | 'I'..'R';
type GemColor = 'red' | 'yellow' | 'blue' | 'white';
type RayColor =
  | 'transparent' | 'white' | 'red' | 'yellow' | 'blue'
  | 'orange' | 'violet' | 'green' | 'black'
  | 'pink' | 'light-yellow' | 'light-blue'
  | 'light-orange' | 'light-violet' | 'light-green' | 'gray';

interface Cell { col: number; row: number; }

type SerializedMine = {
  version: 1;
  pieces: Array<{
    kind: PieceKind;
    rotation: 0 | 1 | 2 | 3;
    x: number;
    y: number;
  }>;
};
```

## 4. Messages

### 4.1 Présentation et salon

```ts
{ protocol: 3, type: 'hello', from: PlayerId, name: string, nonce: string }
```

- `name` : nom affiché, court, facultatif (chaîne vide acceptée).
- `nonce` : 32 caractères hexadécimaux, généré au début de la session.

Chaque client envoie `hello` dès l'ouverture du canal. La réception du `hello`
distant fait passer la session en phase `lobby` et résout la connexion de
l'invité.

```ts
{ protocol: 3, type: 'lobby-start', id: string, from: 'host' }
```

L'hôte envoie ce message quand il clique **Lancer la partie**. Les deux clients
passent en phase `placing` et affichent l'écran de composition de la mine.

```ts
{ protocol: 3, type: 'commit', id: string, from: PlayerId, mineHash: string }
```

Chaque joueur envoie l'engagement SHA-256 de sa mine après l'avoir verrouillée.
`mineHash` fait 64 caractères hexadécimaux.

```ts
{ protocol: 3, type: 'start', from: 'host', starter: PlayerId,
  hostNonce: string, guestNonce: string,
  hostHash: string, guestHash: string }
```

L'hôte envoie `start` quand il possède son propre engagement et celui de
l'invité. L'invité vérifie les nonces, les deux hashes et le calcul du premier
joueur. Les deux clients initialisent alors le même état de partie.

### 4.2 Scans

```ts
{ protocol: 3, type: 'scan', id: string, from: PlayerId,
  kind: 'wave', entry: EntryLabel }

{ protocol: 3, type: 'scan', id: string, from: PlayerId,
  kind: 'cell', cell: Cell }
```

Le prospecteur envoie un scan. Le défenseur calcule la réponse localement.

```ts
{ protocol: 3, type: 'answer', id: string, from: PlayerId,
  scanId: string, kind: 'wave', exit: EntryLabel, color: RayColor }

{ protocol: 3, type: 'answer', id: string, from: PlayerId,
  scanId: string, kind: 'cell', color: GemColor | null }
```

Le défenseur confirme puis envoie la réponse. Aucune trajectoire n'est incluse.
Les deux clients ajoutent la réponse au journal et passent le tour.

```ts
{ protocol: 3, type: 'cancel-scan', id: string, from: PlayerId,
  scanId: string }
```

Le défenseur annule une demande (par exemple après avoir constaté une anomalie).
Le tour ne change pas.

### 4.3 Confirmation gratuite

```ts
{ protocol: 3, type: 'confirm-request', id: string, from: PlayerId,
  answerId: string }

{ protocol: 3, type: 'confirm-result', id: string, from: PlayerId,
  answerId: string, kind: 'wave', exit: EntryLabel, color: RayColor }

{ protocol: 3, type: 'confirm-result', id: string, from: PlayerId,
  answerId: string, kind: 'cell', color: GemColor | null }
```

La confirmation ne change ni le tour ni la phase. Elle est ajoutée au journal
comme entrée distincte.

### 4.4 Proposition

```ts
{ protocol: 3, type: 'submit', id: string, from: PlayerId,
  candidate: SerializedMine }

{ protocol: 3, type: 'submit-result', id: string, from: PlayerId,
  submissionId: string, correct: boolean }
```

Le défenseur compare la proposition à sa mine et envoie le résultat. Les deux
clients appliquent la machine à états de fin de partie. Une proposition
incorrecte termine immédiatement la partie.

### 4.5 Révélation

```ts
{ protocol: 3, type: 'reveal', id: string, from: PlayerId,
  mine: SerializedMine, salt: string }
```

Envoyé après la fin de partie. Le destinataire vérifie :
`SHA-256(canonicalMine + ':' + salt) === mineHash` reçu dans `commit` et
`start`. Il peut ensuite rejouer les scans et comparer les réponses.

### 4.6 Reprise

```ts
{ protocol: 3, type: 'sync', id: string, from: PlayerId,
  round: number,
  mineHash: string | null,
  starter: PlayerId | null,
  game: GameState | null,
  reveals: Array<{ from: PlayerId, mine: SerializedMine, salt: string }> }
```

Échangé dès la réouverture du canal, après une coupure ou une reprise de
l'application. Chaque client envoie son état public et les révélations déjà
reçues. `round` vaut le nombre de scans et de propositions appliqués. Le client
qui a le `round` le plus faible adopte l'état de l'autre ; à égalité, les états
sont considérés identiques. `mineHash` est l'engagement du joueur qui envoie le
message. La mine secrète n'est jamais incluse.

### 4.7 Contrôle

```ts
{ protocol: 3, type: 'ping', id: string, from: PlayerId }
{ protocol: 3, type: 'pong', id: string, from: PlayerId, replyTo: string }
```

`ping` toutes les 15 secondes. Une absence de message pendant 30 secondes
affiche un avertissement. Après 45 secondes de silence, le client force une
reprise de la connexion. Le ping ne modifie pas l'état du jeu.

## 5. Flux de connexion

```text
Hôte                                      Invité
 |-- réserve prisme-v1-123456 auprès du courtier PeerJS
 |-- affiche le code 123 456
 |                                         |-- saisit 123 456
 |                                         |-- se connecte à prisme-v1-123456
 |<=========== canal WebRTC direct =========>|
 |-- hello ------------------------------->|
 |<------------------------------ hello ---|
 |   (salon : adversaire connecté)          |
 |-- lobby-start ------------------------->|
 |   (placement des deux mines)             |
 |-- commit ------------------------------>|
 |<----------------------------- commit ---|
 |-- start ------------------------------->|
 |<=============== partie =================>|
```

Détails :

1. L'hôte réserve le code. Si l'identifiant est déjà pris, il retire un nouveau
   code, jusqu'à huit tentatives.
2. L'invité ouvre un pair anonyme, puis se connecte à `prisme-v1-<code>`.
3. À l'ouverture du canal, chacun envoie `hello`. L'hôte attend le `hello` de
   l'invité avant d'afficher le bouton de lancement.
4. L'hôte envoie `lobby-start`. Les deux joueurs placent leur mine.
5. Chaque joueur envoie `commit` après verrouillage.
6. Quand l'hôte a les deux engagements, il envoie `start`. La partie commence.
7. Délais : 15 s pour l'enregistrement PeerJS, 20 s pour rejoindre le salon ou
   terminer la poignée de main. Un échec affiche un message clair et invite à
   réessayer sur un autre réseau.

### 5.1 Coupure et reprise

Si le canal direct se ferme alors que le salon ou la partie est actif :

1. Chaque client garde son état local et passe en phase `reconnecting`.
2. Chacun tente de réserver `prisme-v1-<code>`. Le premier y parvient et attend ;
   l'autre obtient `unavailable-id` puis se connecte au code.
3. À l'ouverture du nouveau canal, les deux renvoient `hello`, `commit` si
   nécessaire, puis `sync`.
4. L'état public le plus avancé est adopté. La partie reprend sans nouvelle mine
   ni nouvelle proposition.

Après un redémarrage de l'application, le client relit une sauvegarde locale
(code, rôle, nonce, mine verrouillée et état public), rejoint le code et refait
la même poignée de main. Si personne ne détient plus le code, il le réserve et
attend le retour de l'autre joueur. Une tentative de reprise dure jusqu'à deux
minutes ; ensuite un bouton **Réessayer la connexion** reste disponible.

La sauvegarde locale est effacée quand la partie se termine ou quand le joueur
quitte volontairement.

## 6. Flux d'un tour

```text
Prospecteur                  Défenseur
 |-- scan (wave/cell) -------->|
 |                            |-- calcule localement
 |                            |-- affiche la confirmation
 |                            |-- confirme
 |<-------------- answer -----|
 |-- applique le journal       |
 |-- tour suivant ------------>|
```

- Le défenseur ne peut pas modifier sa mine après le verrouillage.
- La confirmation est obligatoire, même si le calcul est automatique.
- La trajectoire reste sur l'écran du défenseur.
- En cas de refus, `cancel-scan` remet le prospecteur en position de choisir.

## 7. Flux de fin de partie

```text
Prospecteur                  Défenseur
 |-- submit ------------------>|
 |                            |-- compare avec sa mine
 |<------------- submit-result|
 |-- applique la fin de partie|
 |-- reveal ----------------->|
 |<------------------ reveal --|
 |-- vérifie les engagements  |
 |-- rejoue les scans         |
```

## 8. Règles de validation

- `protocol` doit valoir `3`.
- `type` doit être connu.
- `from` doit être le rôle distant attendu.
- Les identifiants doivent être des chaînes non vides, de longueur ≤ 64.
- `entry` doit être une étiquette valide.
- `cell.col` ∈ [0, 9], `cell.row` ∈ [0, 7].
- `color` doit appartenir à l'union `RayColor` ou `GemColor | null` selon le
  type.
- `candidate` doit contenir exactement les cinq types de pièces, une fois
  chacun, avec des coordonnées entières et des rotations 0–3.
- `nonce` doit faire 32 caractères hexadécimaux ; `mineHash` 64 ; `salt` 32.
- Un `sync` doit contenir un `round` entier positif et un `game` structurellement
  valide (phases, tours, scans, propositions, gagnant).
- Un message dont le `id` a déjà été vu est ignoré.
- Un message qui n'entre pas dans la phase courante est ignoré et journalisé.

## 9. Gestion des erreurs

| Situation                         | Comportement                                              |
| --------------------------------- | --------------------------------------------------------- |
| Message JSON invalide             | Ignoré, avertissement local.                              |
| Version inconnue                  | Message ignoré.                                           |
| Code de salon inconnu             | « Aucune partie ne porte ce code », retour à l'accueil.   |
| Code déjà réservé                 | Nouveau code tiré automatiquement.                        |
| Scan hors tour                    | Ignoré ; le prospecteur reçoit un avertissement.          |
| Réponse pour un scan inconnu      | Ignorée.                                                  |
| Proposition en dehors de la phase | Ignorée.                                                  |
| Échec ICE                         | Écran « Connexion impossible », conseils, réessai.        |
| Canal fermé en cours de partie    | Reprise automatique ; nouvel essai manuel si elle échoue. |
| Hôte absent                       | L'invité garde le code et attend le retour de l'hôte.     |
| Révélation incohérente            | Avertissement d'intégrité, résultat conservé.             |

Les messages sont journalisés côté client ; aucun serveur ne conserve l'état.

## 10. Sécurité et vie privée

- Le canal est chiffré par DTLS (WebRTC).
- Le courtier public PeerJS ne sert qu'au rendez-vous : il voit l'identifiant
  `prisme-v1-<code>` et les métadonnées de connexion, jamais la mine ni les
  réponses.
- Le code à six chiffres n'est pas un secret fort. L'hôte voit le nom du joueur
  avant de lancer la partie.
- La mine n'est jamais envoyée avant `reveal`.
- La reprise après redémarrage conserve localement la mine verrouillée, son sel
  et son engagement dans `localStorage`. Ces données ne quittent jamais
  l'appareil et sont effacées à la fin de la partie ou lors d'un départ
  volontaire.
- L'engagement SHA-256 empêche un changement de mine après le début.
- La vérification finale ne protège pas contre un mensonge pendant la partie ;
  elle le rend détectable.
- Aucun secret durable n'est stocké côté serveur, puisqu'il n'y a pas de
  backend propre.
