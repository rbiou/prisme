import { ColorMixLegend } from '../components/ColorMixLegend';
import { fr } from '../i18n/fr';

export function RulesScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen rules-screen">
      <div className="screen-heading">
        <div>
          <p className="kicker">Référence</p>
          <h1>{fr.rules.title}</h1>
          <p className="lead">{fr.rules.intro}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          {fr.common.back}
        </button>
      </div>

      <nav className="rules-toc" aria-label="Sommaire des règles">
        <a href="#regles-but">But</a>
        <a href="#regles-materiel">Matériel</a>
        <a href="#regles-placement">Placement</a>
        <a href="#regles-rayons">Rayons</a>
        <a href="#regles-tour">Tour</a>
        <a href="#regles-fin">Fin de partie</a>
        <a href="#regles-integrite">Intégrité</a>
      </nav>

      <article className="rules-content">
        <section id="regles-but">
          <h2>1. But du jeu</h2>
          <p>
            Chaque joueur cache une mine de cinq gemmes. À tour de rôle, vous sondez la mine adverse
            avec des rayons ou des scans de case, puis vous reconstituéz sa disposition exacte. Le
            premier à soumettre la bonne mine gagne, selon la procédure de fin de partie.
          </p>
        </section>

        <section id="regles-materiel">
          <h2>2. Matériel</h2>
          <ul>
            <li>
              Un plateau de <strong>10 colonnes × 8 lignes</strong>.
            </li>
            <li>
              Cinq gemmes : une rouge en parallélogramme, une jaune en petit triangle rectangle, une
              bleue en grand triangle isocèle rectangle, une blanche en grand triangle et une
              blanche en losange.
            </li>
            <li>
              Les bords sont étiquetés : <strong>1 à 10</strong> en haut, <strong>11 à 18</strong> à
              droite, <strong>A à H</strong> à gauche et <strong>I à R</strong> en bas.
            </li>
          </ul>
          <p>
            Une étiquette désigne le milieu d’une case sur le bord. La case <strong>E4</strong>{' '}
            désigne la colonne 4, ligne E (la cinquième rangée).
          </p>
        </section>

        <section id="regles-placement">
          <h2>3. Placement secret</h2>
          <ol>
            <li>Les sommets de chaque gemme doivent tomber sur des intersections entières.</li>
            <li>La gemme reste entièrement dans le plateau.</li>
            <li>Les gemmes ne se chevauchent jamais.</li>
            <li>
              Deux gemmes ne peuvent pas partager un segment de bord. Un contact par un coin, ou un
              coin contre un bord, est autorisé.
            </li>
            <li>Chaque gemme doit être touchée par au moins un des 36 rayons.</li>
            <li>Une disposition qui produit une boucle de rayon est refusée.</li>
          </ol>
          <p>
            Les gemmes tournent uniquement par pas de 90°. Elles ne se retournent jamais : le
            parallélogramme rouge est chiral.
          </p>
          <details>
            <summary>Règle optionnelle : symétrie des gemmes blanches</summary>
            <p>
              L’application applique par défaut la clarification 2025 : les deux gemmes blanches ne
              doivent pas former un ensemble parfaitement symétrique par rapport à l’axe vertical ou
              horizontal médian du plateau. Cette option peut être désactivée dans les réglages pour
              suivre strictement le livret fourni.
            </p>
          </details>
        </section>

        <section id="regles-rayons">
          <h2>4. Rayons</h2>
          <p>
            Un rayon part du milieu d’une case du bord et avance sur la ligne médiane de la rangée
            ou de la colonne. Il ne traverse jamais une gemme.
          </p>
          <ul>
            <li>Une arête à 45° fait tourner le rayon de 90°.</li>
            <li>Une arête perpendiculaire le renvoie exactement en arrière.</li>
            <li>Une arête parallèle n’est jamais rencontrée dans une mine valide.</li>
            <li>Le rayon sort dès qu’il atteint un bord ; on annonce son étiquette.</li>
          </ul>
          <p>
            Le rayon part incolore. Chaque couleur de gemme touchée est ajoutée une seule fois, quel
            que soit le nombre de contacts. Le résultat ne dépend donc que de l’ensemble des
            couleurs rencontrées.
          </p>
          <ColorMixLegend />
        </section>

        <section id="regles-tour">
          <h2>5. Déroulement d’un tour</h2>
          <p>À votre tour, choisissez une seule action :</p>
          <ul>
            <li>tirer un rayon depuis une étiquette de bord ;</li>
            <li>interroger une case (« Qu’y a-t-il en E4 ? ») ;</li>
            <li>soumettre une mine complète.</li>
          </ul>
          <p>
            Le maître de la mine calcule la réponse localement, la vérifie, puis la confirme. Seuls
            le point de sortie et la couleur, ou la couleur de la case, sont envoyés. La trajectoire
            reste privée. Après une réponse confirmée, le tour passe à l’autre joueur.
          </p>
          <h3>Scan de case</h3>
          <p>
            Une case peut être partiellement couverte par plusieurs gemmes. La réponse retient la
            gemme qui couvre la plus grande surface. En cas d’égalité, le centre de la case tranche
            ; sinon l’ordre fixe rouge, jaune, bleu, blanc est appliqué. Sans gemme, la réponse est
            « Rien ».
          </p>
          <h3>Confirmation gratuite</h3>
          <p>
            Pendant votre tour, vous pouvez demander la confirmation d’une réponse déjà donnée.
            Cette demande ne consomme pas votre tour et ne change pas le tour.
          </p>
        </section>

        <section id="regles-fin">
          <h2>6. Fin de partie</h2>
          <ul>
            <li>Une proposition incorrecte fait perdre immédiatement son auteur.</li>
            <li>Une proposition correcte du joueur non-débutant gagne immédiatement.</li>
            <li>
              Une proposition correcte du débutant donne un dernier tour à l’adversaire, uniquement
              pour soumettre une proposition.
            </li>
            <li>
              Si l’adversaire trouve la mine, la partie est une égalité ; s’il échoue, le débutant
              gagne.
            </li>
            <li>Si l’adversaire ne soumet rien, le débutant gagne par forfait.</li>
          </ul>
        </section>

        <section id="regles-integrite">
          <h2>7. Révélation et intégrité</h2>
          <p>
            Au début, chaque joueur engage sa mine avec un SHA-256 et un sel aléatoire. À la fin,
            les deux mines et les sels sont révélés. Chaque client vérifie l’engagement, puis peut
            rejouer tous les scans enregistrés contre la mine révélée. Une incohérence est signalée,
            mais la confiance reste nécessaire pendant la partie : le pair-à-pair ne permet pas une
            preuve forte en temps réel.
          </p>
          <p className="fine-print">
            Aucun backend propre, aucun compte, aucun cookie. Le code à six chiffres sert de
            rendez-vous via un courtier public ; la connexion et les données de jeu passent ensuite
            directement entre les deux navigateurs.
          </p>
        </section>
      </article>
    </div>
  );
}
