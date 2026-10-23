import { useMemo, useState } from 'react';
import { fr } from '../i18n/fr';
import { extractSignalCode } from '../net/signaling';
import { PrismMark } from '../components/AppHeader';
import type { PlayerId } from '../engine/types';

export interface HomeScreenProps {
  initialName: string;
  inviteCode?: string | null;
  resumeLabel?: string | null;
  role?: PlayerId | null;
  onResume: () => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onNavigate: (path: string) => void;
}

export function HomeScreen({
  initialName,
  inviteCode = null,
  resumeLabel = null,
  role = null,
  onResume,
  onCreate,
  onJoin,
  onNavigate,
}: HomeScreenProps) {
  const [name, setName] = useState(initialName);
  const [joinValue, setJoinValue] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const invitation = useMemo(
    () => (inviteCode ? extractSignalCode(`#/invite/${inviteCode}`) : null),
    [inviteCode],
  );
  const cleanName = name.trim() || 'Joueur';

  function join() {
    const code = invitation ?? extractSignalCode(joinValue);
    if (!code) {
      setJoinError(
        'Ce lien ou ce code ne semble pas valide. Demandez à votre adversaire de partager de nouveau son invitation.',
      );
      return;
    }
    setJoinError(null);
    onJoin(cleanName, code);
  }

  return (
    <div className="screen home-screen">
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">{fr.home.kicker}</p>
          <h1>{fr.home.title}</h1>
          <p className="lead">{fr.home.intro}</p>
          <div className="hero-badges" aria-label="Points clés">
            <span>2 joueurs</span>
            <span>Sans serveur</span>
            <span>10 × 8</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-prism">
            <PrismMark />
          </div>
          <div className="hero-orbit hero-orbit--one" />
          <div className="hero-orbit hero-orbit--two" />
          <span className="hero-gem hero-gem--red" />
          <span className="hero-gem hero-gem--blue" />
          <span className="hero-gem hero-gem--amber" />
        </div>
      </section>

      {invitation ? (
        <section className="invite-banner" role="status">
          <div>
            <strong>Invitation reçue</strong>
            <p>
              Un adversaire vous invite à rejoindre sa mine. Choisissez votre nom, puis composez
              votre propre mine.
            </p>
          </div>
          <span className="badge badge--prism">Lien privé</span>
        </section>
      ) : null}

      {resumeLabel ? (
        <section className="resume-card">
          <div>
            <p className="kicker">Partie en cours</p>
            <h2>{resumeLabel}</h2>
            {role ? (
              <p className="muted">Vous jouez en tant que {role === 'host' ? 'hôte' : 'invité'}.</p>
            ) : null}
          </div>
          <button type="button" className="btn btn--primary" onClick={onResume}>
            Reprendre
          </button>
        </section>
      ) : null}

      <div className="name-card card">
        <label className="field">
          <span>{fr.home.nameLabel}</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 40))}
            placeholder={fr.home.namePlaceholder}
            autoComplete="nickname"
            maxLength={40}
          />
        </label>
        <p className="hint">Ce nom reste sur cet appareil et n’est jamais publié.</p>
      </div>

      <div className="home-grid">
        <article className="card card--create">
          <div className="card-icon" aria-hidden="true">
            ◈
          </div>
          <h2>Créer une partie</h2>
          <p>
            Composez votre mine secrète, puis partagez un lien. Aucun compte, aucun serveur : la
            connexion se fait directement entre les navigateurs.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--wide"
            onClick={() => onCreate(cleanName)}
          >
            {fr.home.create}
          </button>
          <p className="fine-print">
            Vous commencerez par placer vos cinq gemmes. Rien ne sera envoyé avant la fin de la
            partie.
          </p>
        </article>

        <article className="card card--join">
          <div className="card-icon card-icon--alt" aria-hidden="true">
            ⬡
          </div>
          <h2>{fr.home.join}</h2>
          <p>
            Collez le lien reçu, ou seulement son code. Vous placerez votre mine avant de renvoyer
            votre réponse.
          </p>
          {invitation ? (
            <div className="invite-code-preview">
              <span className="mono">{`#/invite/${invitation}`}</span>
            </div>
          ) : (
            <label className="field">
              <span>{fr.home.joinTitle}</span>
              <textarea
                value={joinValue}
                onChange={(event) => setJoinValue(event.target.value)}
                placeholder={fr.home.joinPlaceholder}
                rows={3}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
          {joinError ? (
            <p className="inline-alert" role="alert">
              {joinError}
            </p>
          ) : null}
          <button type="button" className="btn btn--secondary btn--wide" onClick={join}>
            {invitation ? 'Rejoindre cette partie' : fr.home.joinAction}
          </button>
        </article>
      </div>

      <section className="privacy-note">
        <PrismMark className="prism-mark prism-mark--small" />
        <div>
          <strong>Votre mine reste privée.</strong>
          <p>{fr.home.privacy}</p>
        </div>
      </section>

      <p className="home-footnote">
        {fr.home.noServer}{' '}
        <button type="button" className="text-link" onClick={() => onNavigate('regles')}>
          Lire les règles
        </button>
      </p>
    </div>
  );
}
