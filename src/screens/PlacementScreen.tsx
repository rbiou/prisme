import { useEffect, useMemo, useState } from 'react';
import { MineComposer } from '../components/MineComposer';
import { validateMine } from '../engine/placement';
import { deserializeMine, isSerializedMine, serializeMine } from '../engine/mine';
import type { Mine, PlayerId } from '../engine/types';
import { fr } from '../i18n/fr';
import type { Settings } from '../state/settings';
import type { ActionResult } from '../state/useMatch';
import type { LockedMine } from '../state/matchReducer';

const DRAFT_KEY = 'prisme:mine-draft';

function loadDraft(): Mine {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return { version: 1, pieces: [] };
    const parsed: unknown = JSON.parse(raw);
    return isSerializedMine(parsed) ? deserializeMine(parsed) : { version: 1, pieces: [] };
  } catch {
    return { version: 1, pieces: [] };
  }
}

export interface PlacementScreenProps {
  role: PlayerId;
  playerName: string;
  inviteCode: string | null;
  locked: LockedMine | null;
  settings: Settings;
  error: string | null;
  onLock: (mine: Mine) => Promise<ActionResult>;
  onContinue: () => void;
  onBack: () => void;
}

export function PlacementScreen({
  role,
  playerName,
  inviteCode,
  locked,
  settings,
  error,
  onLock,
  onContinue,
  onBack,
}: PlacementScreenProps) {
  const [mine, setMine] = useState<Mine>(() => locked?.mine ?? loadDraft());
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (locked) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(serializeMine(mine)));
    } catch {
      // Le brouillon est facultatif.
    }
  }, [locked, mine]);

  const validation = useMemo(
    () =>
      validateMine(mine, {
        enforceWhiteSymmetry: settings.enforceWhiteSymmetry,
      }),
    [mine, settings.enforceWhiteSymmetry],
  );

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return validation.errors
      .map((item) => item.message)
      .filter((message) => {
        if (seen.has(message)) return false;
        seen.add(message);
        return true;
      })
      .slice(0, 8);
  }, [validation.errors]);

  async function lock() {
    if (busy || locked) return;
    setBusy(true);
    setLocalError(null);
    const result = await onLock(mine);
    setBusy(false);
    if (!result.ok) {
      setLocalError(result.error ?? 'La mine n’a pas pu être verrouillée.');
      return;
    }
    onContinue();
  }

  return (
    <div className="screen placement-screen">
      <div className="screen-heading">
        <div>
          <p className="kicker">{role === 'host' ? 'Étape 1 · Hôte' : 'Étape 1 · Invité'}</p>
          <h1>{fr.placement.title}</h1>
          <p className="lead">{fr.placement.intro}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          {fr.common.back}
        </button>
      </div>

      {role === 'guest' && inviteCode ? (
        <section className="invite-banner invite-banner--compact" role="status">
          <div>
            <strong>{fr.placement.invitationBanner}</strong>
            <p>Votre code de réponse sera généré après le verrouillage de la mine.</p>
          </div>
          <span className="badge badge--prism">Invité</span>
        </section>
      ) : null}

      {locked ? (
        <section className="locked-banner">
          <div>
            <p className="kicker">Mine verrouillée</p>
            <h2>Votre mine est prête pour {playerName || 'cette partie'}.</h2>
            <p>
              Elle ne peut plus être modifiée. La connexion peut maintenant être préparée avec
              l’adversaire.
            </p>
          </div>
          <button type="button" className="btn btn--primary" onClick={onContinue}>
            {fr.common.continue}
          </button>
        </section>
      ) : null}

      {!locked ? (
        <div className="placement-layout">
          <section className="placement-board card card--plain">
            <MineComposer
              mine={mine}
              onChange={setMine}
              boardAriaLabel={`Plateau de votre mine secrète, joueur ${playerName || 'sans nom'}`}
            />
          </section>

          <aside className="placement-side">
            <section className={`validation-card${validation.ok ? ' is-valid' : ''}`}>
              <div className="validation-heading">
                <span className="validation-dot" aria-hidden="true" />
                <h2>{validation.ok ? fr.placement.valid : fr.placement.invalid}</h2>
              </div>
              {validation.ok ? (
                <p>
                  Les cinq gemmes respectent la grille, les contacts et la visibilité par les
                  rayons.
                </p>
              ) : (
                <ul className="error-list">
                  {messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
              <p className="fine-print">{fr.placement.secret}</p>
            </section>

            <section className="card card--plain lock-card">
              <h2>{fr.placement.lock}</h2>
              <p>{fr.placement.lockedNote}</p>
              <button
                type="button"
                className="btn btn--primary btn--wide"
                onClick={() => void lock()}
                disabled={!validation.ok || busy}
              >
                {busy ? fr.placement.locking : fr.placement.lock}
              </button>
              {!validation.ok ? <p className="hint">{fr.placement.incomplete}</p> : null}
              {localError || error ? (
                <p className="inline-alert" role="alert">
                  {localError ?? error}
                </p>
              ) : null}
            </section>

            <section className="card card--plain tips-card">
              <h2>Repères de placement</h2>
              <ul className="check-list">
                <li>Rotations de 90° uniquement, jamais de retournement.</li>
                <li>Contacts par un coin autorisés, bords collés interdits.</li>
                <li>Chaque gemme doit être atteignable par au moins un rayon.</li>
                <li>Une boucle de rayon rend la mine invalide.</li>
              </ul>
            </section>
          </aside>
        </div>
      ) : (
        <section className="placement-preview card card--plain">
          <MineComposer
            mine={locked.mine}
            onChange={() => undefined}
            disabled
            boardAriaLabel="Votre mine verrouillée"
          />
        </section>
      )}
    </div>
  );
}
