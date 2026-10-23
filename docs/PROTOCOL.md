# Protocole pair-à-pair — Prisme

## 1. Principes

- Transport : un seul `RTCDataChannel` fiable et ordonné, label `prisme`.
- Encodage : JSON UTF-8.
- Version : `protocol: 1` dans chaque message.
- Les messages sont validés avant application. Un message invalide est ignoré.
- Les deux clients maintiennent le même état public. La mine et les notes ne
  circulent jamais avant `reveal`.
- Les identifiants de messages sont des chaînes aléatoires (16 octets hex).
- Les actions sont idempotentes : un message déjà appliqué est ignoré.

## 2. Rôles

- `host` : crée l'offre WebRTC et le canal de données.
- `guest` : ouvre le lien, crée la réponse, reçoit le canal.
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

### 4.1 Poignée de main

```ts
{ protocol: 1, type: 'hello', from: PlayerId, name: string,
  nonce: string, mineHash: string }
```

- `name` : nom affiché, court, facultatif (chaîne vide acceptée).
- `nonce` : 32 caractères hexadécimaux.
- `mineHash` : SHA-256 hex de `canonicalMine + ':' + salt`.

```ts
{ protocol: 1, type: 'start', from: 'host', starter: PlayerId,
  hostNonce: string, guestNonce: string }
```

L'hôte envoie `start` après avoir reçu le `hello` de l'invité. Le calcul du
premier joueur est vérifié par l'invité.

### 4.2 Scans

```ts
{ protocol: 1, type: 'scan', id: string, from: PlayerId,
  kind: 'wave', entry: EntryLabel }

{ protocol: 1, type: 'scan', id: string, from: PlayerId,
  kind: 'cell', cell: Cell }
```

Le prospecteur envoie un scan. Le défenseur calcule la réponse localement.

```ts
{ protocol: 1, type: 'answer', id: string, from: PlayerId,
  scanId: string, kind: 'wave', exit: EntryLabel, color: RayColor }

{ protocol: 1, type: 'answer', id: string, from: PlayerId,
  scanId: string, kind: 'cell', color: GemColor | null }
```

Le défenseur confirme puis envoie la réponse. Aucune trajectoire n'est incluse.
Les deux clients ajoutent la réponse au journal et passent le tour.

```ts
{ protocol: 1, type: 'cancel-scan', id: string, from: PlayerId,
  scanId: string }
```

Le défenseur annule une demande (par exemple après avoir constaté une anomalie).
Le tour ne change pas.

### 4.3 Confirmation gratuite

```ts
{ protocol: 1, type: 'confirm-request', id: string, from: PlayerId,
  answerId: string }

{ protocol: 1, type: 'confirm-result', id: string, from: PlayerId,
  answerId: string, kind: 'wave', exit: EntryLabel, color: RayColor }

{ protocol: 1, type: 'confirm-result', id: string, from: PlayerId,
  answerId: string, kind: 'cell', color: GemColor | null }
```

La confirmation ne change ni le tour ni la phase. Elle est ajoutée au journal
comme entrée distincte.

### 4.4 Proposition

```ts
{ protocol: 1, type: 'submit', id: string, from: PlayerId,
  candidate: SerializedMine }

{ protocol: 1, type: 'submit-result', id: string, from: PlayerId,
  submissionId: string, correct: boolean }
```

Le défenseur compare la proposition à sa mine et envoie le résultat. Les deux
clients appliquent la machine à états de fin de partie. Une proposition
incorrecte termine immédiatement la partie.

### 4.5 Révélation

```ts
{ protocol: 1, type: 'reveal', id: string, from: PlayerId,
  mine: SerializedMine, salt: string }
```

Envoyé après la fin de partie. Le destinataire vérifie :
`SHA-256(canonicalMine + ':' + salt) === mineHash` reçu dans `hello`.
Il peut ensuite rejouer les scans et comparer les réponses.

### 4.6 Contrôle

```ts
{ protocol: 1, type: 'ping', id: string, from: PlayerId }
{ protocol: 1, type: 'pong', id: string, from: PlayerId, replyTo: string }
```

`ping` toutes les 15 secondes. Une absence de `pong` pendant 45 secondes affiche
un avertissement de connexion instable. Le ping ne modifie pas l'état du jeu.

## 5. Flux de connexion

```text
Hôte                         Invité
 |-- crée offre ------------->|
 |   lien #/invite/<code>     |
 |                            |-- place sa mine
 |                            |-- crée réponse
 |<--------- code réponse ----|
 |-- setRemoteDescription ----|
 |<======== data channel =====>|
 |-- hello ------------------>|
 |<------------------ hello --|
 |-- start ------------------>|
 |<================ partie ===>|
```

Détails :

1. L'hôte verrouille sa mine avant de créer l'offre.
2. L'invité ouvre le lien, verrouille sa mine, puis crée la réponse.
3. L'hôte colle le code de réponse et connecte.
4. Les deux clients attendent `icegatheringstate === 'complete'` (ou 8 s) avant
   de compresser leur description.
5. À l'ouverture du canal, chacun envoie `hello`.
6. L'hôte envoie `start`. La partie commence.
7. Après avoir accepté la réponse, l'hôte déclenche un délai de 30 s. Si le
   canal n'est pas prêt et que la partie n'a pas démarré, la session échoue avec
   un message réseau et propose de réessayer sur un autre réseau.

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

- `protocol` doit valoir `1`.
- `type` doit être connu.
- `from` doit être le rôle distant attendu.
- Les identifiants doivent être des chaînes non vides, de longueur ≤ 64.
- `entry` doit être une étiquette valide.
- `cell.col` ∈ [0, 9], `cell.row` ∈ [0, 7].
- `color` doit appartenir à l'union `RayColor` ou `GemColor | null` selon le
  type.
- `candidate` doit contenir exactement les cinq types de pièces, une fois
  chacun, avec des coordonnées entières et des rotations 0–3.
- `mineHash` et `salt` doivent être des chaînes hexadécimales de longueur
  attendue.
- Un message dont le `id` a déjà été vu est ignoré.
- Un message qui n'entre pas dans la phase courante est ignoré et journalisé.

## 9. Gestion des erreurs

| Situation                         | Comportement                                                   |
| --------------------------------- | -------------------------------------------------------------- |
| Message JSON invalide             | Ignoré, console + compteur local.                              |
| Version inconnue                  | Connexion refusée avec message clair.                          |
| Scan hors tour                    | Ignoré ; le prospecteur reçoit un `error` informatif.          |
| Réponse pour un scan inconnu      | Ignorée.                                                       |
| Proposition en dehors de la phase | Ignorée.                                                       |
| Échec ICE                         | Écran « Connexion impossible », conseils, réessai.             |
| Canal fermé                       | Partie en pause ; impossible de reprendre sans nouvelle offre. |
| Révélation incohérente            | Avertissement d'intégrité, résultat conservé.                  |

Les `error` informatifs sont facultatifs dans le MVP ; les messages sont
journalisés côté client.

## 10. Sécurité

- Le canal est chiffré par DTLS (WebRTC).
- Les codes de signalisation contiennent des candidats ICE et ne doivent pas
  être publics.
- La mine n'est jamais envoyée avant `reveal`.
- L'engagement SHA-256 empêche un changement de mine après le début.
- La vérification finale ne protège pas contre un mensonge pendant la partie ;
  elle le rend détectable.
- Aucun secret durable n'est stocké côté serveur, puisqu'il n'y a pas de serveur.
