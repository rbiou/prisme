import { useState } from 'react';
import { PrismMark } from '../components/AppHeader';
import { fr } from '../i18n/fr';
import { formatRoomCode, normalizeRoomCode } from '../net/roomCode';

export interface HomeScreenProps {
  initialName: string;
  resumeLabel?: string | null;
  onResume: () => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}

export function HomeScreen({
  initialName,
  resumeLabel = null,
  onResume,
  onCreate,
  onJoin,
}: HomeScreenProps) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const cleanName = name.trim() || 'Joueur';

  function changeCode(value: string) {
    setCode(value.replace(/\D/g, '').slice(0, 6));
    setJoinError(null);
  }

  function join() {
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setJoinError('Entrez le code à six chiffres affiché chez votre adversaire.');
      return;
    }
    setJoinError(null);
    onJoin(cleanName, normalized);
  }

  return (
    <div className="screen home-screen">
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">{fr.home.kicker}</p>
          <h1>{fr.home.title}</h1>
          <p className="lead">{fr.home.intro}</p>
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

      {resumeLabel ? (
        <section className="resume-card">
          <div>
            <p className="kicker">Partie en cours</p>
            <h2>{resumeLabel}</h2>
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
      </div>

      <div className="home-grid">
        <article className="card card--create">
          <div className="card-icon" aria-hidden="true">
            ◈
          </div>
          <h2>Créer une partie</h2>
          <p>Ouvrez un salon et partagez le code à six chiffres avec votre adversaire.</p>
          <button
            type="button"
            className="btn btn--primary btn--wide"
            onClick={() => onCreate(cleanName)}
          >
            {fr.home.create}
          </button>
        </article>

        <article className="card card--join">
          <div className="card-icon card-icon--alt" aria-hidden="true">
            ⬡
          </div>
          <h2>Rejoindre une partie</h2>
          <label className="field">
            <span>{fr.home.joinTitle}</span>
            <input
              className="code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formatRoomCode(code)}
              onChange={(event) => changeCode(event.target.value)}
              placeholder={fr.home.joinPlaceholder}
              autoComplete="one-time-code"
              spellCheck={false}
              maxLength={7}
              aria-describedby={joinError ? 'join-code-error' : undefined}
            />
          </label>
          {joinError ? (
            <p className="inline-alert" role="alert" id="join-code-error">
              {joinError}
            </p>
          ) : null}
          <button type="button" className="btn btn--secondary btn--wide" onClick={join}>
            {fr.home.joinAction}
          </button>
        </article>
      </div>
    </div>
  );
}
