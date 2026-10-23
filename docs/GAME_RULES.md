# Règles de Prisme

Cette page est la référence fonctionnelle du jeu. Elle reformule les règles de
la boîte de base pour deux joueurs et précise les choix d'adaptation propres à
l'application. Les schémas et libellés sont originaux.

## 1. Matériel

- Un plateau de mine de **10 colonnes × 8 lignes**.
- Cinq gemmes par joueur :
  - une gemme **rouge** en forme de parallélogramme ;
  - une gemme **jaune** en forme de petit triangle rectangle ;
  - une gemme **bleue** en forme de grand triangle isocèle rectangle ;
  - une gemme **blanche** en forme de grand triangle isocèle rectangle ;
  - une gemme **blanche** en forme de losange.
- Une grille de prospection pour noter les hypothèses.
- Un moyen de tirer des rayons depuis le bord du plateau.

Les proportions des pièces sont définies en unités de case dans
`src/engine/pieces.ts`. Une case vaut 1 × 1.

## 2. But

Chaque joueur cache une mine. Les deux joueurs sont à la fois **maître de la
mine** de l'adversaire et **prospecteur** de leur propre mine. Le premier qui
reconstitue exactement la mine adverse gagne, selon la procédure de fin de
partie décrite plus bas.

## 3. Coordonnées

Le plateau est bordé d'étiquettes :

- en haut : `1` à `10`, de gauche à droite ;
- à droite : `11` à `18`, de haut en bas ;
- en bas : `I` à `R`, de gauche à droite ;
- à gauche : `A` à `H`, de haut en bas.

Une étiquette désigne le **milieu d'une case** sur le bord correspondant :

- `1` à `10` : colonnes 0 à 9, entrée par le haut ;
- `I` à `R` : colonnes 0 à 9, entrée par le bas ;
- `A` à `H` : lignes 0 à 7, entrée par la gauche ;
- `11` à `18` : lignes 0 à 7, entrée par la droite.

Une case peut aussi être désignée par sa colonne et sa ligne, par exemple
`E4`. Dans l'application, les coordonnées de case sont affichées avec la lettre
de ligne puis le numéro de colonne, comme sur la feuille de solution.

## 4. Formes et orientations

Les gemmes sont des polygones dont tous les sommets tombent sur des
intersections de la grille.

| Gemme            | Forme                                                  | Boîte englobante | Aire    |
| ---------------- | ------------------------------------------------------ | ---------------- | ------- |
| Rouge            | parallélogramme 2 × 1 à extrémités à 45°               | 3 × 1            | 2 cases |
| Jaune            | triangle rectangle isocèle, côtés de l'angle droit = 2 | 2 × 2            | 2 cases |
| Bleue            | triangle isocèle rectangle, base = 4, hauteur = 2      | 4 × 2            | 4 cases |
| Blanche triangle | même forme que la bleue                                | 4 × 2            | 4 cases |
| Blanche losange  | carré tourné à 45°, diagonales 2 × 2                   | 2 × 2            | 2 cases |

Les pièces peuvent être tournées par pas de **90°**. Elles ne peuvent pas être
retournées. Le parallélogramme rouge est chiral dans le plan : le retourner
donnerait une orientation impossible à obtenir par rotation.

## 5. Placement secret

Chaque joueur place ses cinq gemmes dans sa mine, à l'abri du regard de
l'adversaire, en respectant toutes les contraintes suivantes.

1. **Grille** : chaque sommet d'une gemme coïncide avec une intersection de la
   grille. Les arêtes sont horizontales, verticales ou à 45°.
2. **Plateau** : la gemme est entièrement contenue dans le plateau. Elle peut
   toucher le bord, mais pas le dépasser.
3. **Pas de chevauchement** : les intérieurs de deux gemmes ne se recouvrent
   jamais.
4. **Pas de contact bord à bord** : deux gemmes ne peuvent pas partager un
   segment de bord de longueur positive. Elles peuvent se toucher par un coin,
   ou par le coin d'une gemme contre le bord d'une autre.
5. **Pas de gemme entièrement cachée** : chaque gemme doit être touchée par au
   moins un des 36 rayons possibles, en tenant compte des réflexions et des
   autres gemmes. Autrement dit, aucune gemme n'est invisible pour tous les
   tirs.
6. **Pas de boucle de rayon** : une disposition qui provoque une boucle infinie
   pour au moins un des 36 rayons est refusée. Le moteur détecte les cycles et
   explique quel point d'entrée pose problème.
7. **Symétrie des gemmes blanches (option)** : la règle de clarification 2025
   interdit que les deux gemmes blanches forment un ensemble parfaitement
   symétrique par rapport à l'axe vertical ou horizontal médian du plateau.
   Le livret français fourni ne contient pas cette phrase. L'application
   l'applique par défaut, avec une option pour revenir strictement au livret.
   Interprétation retenue : l'ensemble des deux polygones blancs ne doit pas
   être invariant par la réflexion d'axe `x = 5` ou `y = 4`.

Le marquage central en `X` visible sur certains plateaux ou critiques vidéo
n'est pas une règle du livret français. Il n'est **pas** appliqué : une gemme
peut couvrir le centre du plateau. Les annotations `X`/`O` du schéma de
placement servent seulement à illustrer l'alignement des sommets.

## 6. Rayons

### 6.1 Départ et trajet

Le prospecteur choisit une étiquette de bord. Le rayon part du milieu de la
case correspondante, à l'extérieur du plateau, et avance perpendiculairement au
bord, sur la ligne médiane de la rangée ou de la colonne.

Le rayon se déplace en ligne droite jusqu'à rencontrer une arête de gemme. Il ne
traverse jamais une gemme.

### 6.2 Réflexion

- Une arête **à 45°** renvoie le rayon à angle droit : le rayon tourne de 90°,
  vers la gauche ou la droite selon l'inclinaison de l'arête et le sens
  d'arrivée.
- Une arête **perpendiculaire** au rayon (bord vertical pour un rayon
  horizontal, bord horizontal pour un rayon vertical) renvoie le rayon en
  arrière, exactement sur son trajet d'arrivée.
- Une arête **parallèle** au rayon ne le coupe pas. Dans une mine valide, ce cas
  ne se produit pas : les sommets des gemmes sont sur des intersections
  entières et les rayons circulent sur des lignes à demi-entiers.

Le rayon sort du plateau dès qu'il atteint un bord. Le point de sortie est
annoncé avec son étiquette (`1`–`10`, `11`–`18`, `A`–`H` ou `I`–`R`).

### 6.3 Couleur

Le rayon part **incolore**. Chaque gemme touchée ajoute sa couleur à l'ensemble
des couleurs rencontrées. Une couleur déjà rencontrée ne compte qu'une fois,
même si le rayon touche plusieurs gemmes de cette couleur.

| Couleurs rencontrées         | Couleur annoncée |
| ---------------------------- | ---------------- |
| aucune                       | incolore         |
| blanc                        | blanc            |
| rouge                        | rouge            |
| jaune                        | jaune            |
| bleu                         | bleu             |
| rouge + jaune                | orange           |
| rouge + bleu                 | violet           |
| jaune + bleu                 | vert             |
| rouge + jaune + bleu         | noir             |
| blanc + rouge                | rose             |
| blanc + jaune                | jaune clair      |
| blanc + bleu                 | bleu clair       |
| blanc + rouge + jaune        | orange clair     |
| blanc + rouge + bleu         | violet clair     |
| blanc + jaune + bleu         | vert clair       |
| blanc + rouge + jaune + bleu | gris             |

La couleur finale ne dépend pas de l'ordre des contacts, seulement de
l'ensemble des couleurs.

### 6.4 Boucles

Un rayon peut être renvoyé indefiniment entre plusieurs gemmes. Une mine qui
produit une boucle n'est pas valide. Le moteur limite aussi le nombre de
réflexions par sécurité et signale toute anomalie.

## 7. Déroulement d'une partie

### 7.1 Mise en place

1. L'hôte crée un salon et partage le code à six chiffres.
2. L'invité rejoint la partie avec ce code ; la connexion directe s'établit.
3. L'hôte lance la partie. Les deux joueurs placent alors leur mine secrète et
   la valident.
4. Les deux joueurs échangent un engagement SHA-256 de leur mine et un nonce.
5. Le premier joueur est désigné par un tirage équitable à partir des deux
   nonces. Le joueur désigné commence comme prospecteur.

### 7.2 Tour de jeu

À son tour, le prospecteur effectue **une** action :

- **Tirer un rayon** depuis une étiquette de bord ;
- **Interroger une case** (« Qu'y a-t-il en E4 ? ») ;
- **Soumettre une proposition** de mine complète.

Le maître de la mine (l'adversaire) répond. Dans l'application, sa réponse est
calculée localement, puis il la confirme avant qu'elle ne soit envoyée. Seuls
le point de sortie et la couleur (ou la couleur de la case) sont transmis. La
trajectoire reste privée.

Après une réponse confirmée, les rôles s'inversent : c'est à l'autre joueur de
prospecter.

### 7.3 Confirmation gratuite

Le prospecteur peut demander la confirmation d'une réponse déjà donnée. Cette
demande ne consomme pas son tour. Le maître de la mine recalcule la réponse et
la confirme. La confirmation est ajoutée au journal public.

### 7.4 Scan de case

Le maître de la mine annonce :

- « Rien » si la case ne contient aucune gemme ;
- « Une gemme rouge », « Une gemme blanche », etc. sinon.

Une case peut être partiellement couverte par plusieurs gemmes. Pour rendre la
réponse déterministe, l'application retient la gemme qui couvre la **plus
grande surface** de la case. En cas d'égalité, elle regarde le centre de la
case ; si le centre est encore ambigu, elle applique l'ordre fixe rouge, jaune,
bleu, blanc. Ce choix est une adaptation explicite : le livret ne tranche pas
les cas de recouvrement partiel multiple.

### 7.5 Proposition de mine

Le prospecteur place ses cinq pièces candidates sur la grille de solution,
puis soumet la disposition complète : formes, orientations et positions. La
proposition est comparée à la mine secrète par le maître de la mine.

Une proposition doit contenir exactement les cinq gemmes de la base, chacune
une fois. Une proposition incomplète ou invalide est considérée comme
incorrecte.

## 8. Fin de partie

La fin de partie suit le livret physique, et non la variante à deux chances de
certaines adaptations en ligne.

- **Proposition incorrecte** : le joueur qui soumet une proposition incorrecte
  perd immédiatement. L'adversaire gagne.
- **Proposition correcte du joueur non-débutant** : il gagne immédiatement.
- **Proposition correcte du joueur débutant** : l'adversaire dispose d'un
  dernier tour, uniquement pour soumettre une proposition.
  - Si l'adversaire soumet une proposition correcte : égalité.
  - Si l'adversaire soumet une proposition incorrecte : le débutant gagne.
  - Si l'adversaire ne soumet rien : le débutant gagne par forfait.
- **Égalité** : rejouer une partie pour désigner un vainqueur. L'application
  affiche l'égalité et propose une nouvelle partie.

Le dernier tour est un tour de proposition : les scans et les confirmations
gratuites n'y sont pas proposés dans l'interface, afin que la partie puisse se
conclure.

## 9. Révélation et intégrité

À la fin, les deux mines sont révélées. Chaque client vérifie l'engagement
SHA-256 reçu au début. Il peut aussi rejouer tous les rayons et tous les scans
enregistrés contre la mine révélée. Si une réponse ne correspond pas, l'écran
signale une incohérence d'intégrité. Cette vérification est une detection a
posteriori : elle ne remplace pas la confiance nécessaire entre les deux
joueurs, mais elle décourage la modification de mine en cours de partie.

## 10. Variantes et extensions

- **Règles révisées 2025** : symétrie parfaite des deux gemmes blanches
  interdite. Option activée par défaut, désactivable pour suivre strictement le
  livret fourni.
- **Extension Diamant** : une gemme transparente qui ne change pas la couleur.
  Non incluse dans le MVP.
- **Extension Corps noir** : une gemme qui absorbe le rayon. Non incluse dans le
  MVP.
- **Trois joueurs et plus** : un maître de la mine unique, plusieurs
  prospecteurs. Non incluse dans le MVP.

## 11. Hypothèses documentées

1. Le livret français fourni ne mentionne pas la règle de symétrie des gemmes
   blanches de 2025 ; elle est proposée comme option, activée par défaut.
2. Le livret ne tranche pas le scan d'une case partiellement couverte par
   plusieurs gemmes ; la plus grande surface couverte est retenue.
3. Le livret ne mentionne pas de marque centrale `X` ; aucune interdiction
   centrale n'est appliquée.
4. Le livret ne décrit pas de limite de réflexions ; le moteur rejette les
   boucles et plafonne les calculs.
5. Les responsabilités de maître de la mine et de prospecteur sont réunies dans
   la même application ; la réponse est calculée localement et confirmée.
6. La couleur d'un rayon n'ayant touché que du blanc est annoncée « blanc »,
   conformément à la phrase « blanc pour blanc » du livret.
7. Les pièces ne sont jamais retournées ; seules les rotations de 90° sont
   autorisées.
