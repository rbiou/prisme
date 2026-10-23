import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useShare } from '../hooks/useShare';
import { fr } from '../i18n/fr';
import type { PlayerId } from '../engine/types';
import type { SessionPhase } from '../net/session';
import { buildInviteLink } from '../net/signaling';

export interface ConnectScreenProps {
  role: PlayerId;
  playerName: string;
  inviteCode: string | null;
  offerCode: string | null;
  answerCode: string | null;
  phase: SessionPhase;
  detail: string | null;
  error: string | null;
  onConnect: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onLeave: () => void;
  onRetry: () => void;
}

function phaseLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'creating-invitation':
      return fr.connect.generating;
    case 'awaiting-answer':
      return 'En attente du code de réponse.';
    case 'awaiting-host':
      return 'En attente de l’hôte.';
    case 'connecting':
      return 'Connexion en cours…';
    case 'handshaking':
      return 'Échange des engagements…';
    case 'ready':
      return 'Connexion établie.';
    case 'failed':
      return 'La connexion a échoué.';
    case 'closed':
      return 'La connexion est fermée.';
    default:
      return fr.connect.waiting;
  }
}

export function ConnectScreen({
  role,
  playerName,
  inviteCode,
  offerCode,
  answerCode,
  phase,
  detail,
  error,
  onConnect,
  onLeave,
  onRetry,
}: ConnectScreenProps) {
  const [answerInput, setAnswerInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const linkShare = useShare();
  const answerShare = useShare();

  const inviteLink = useMemo(() => {
    if (!offerCode || typeof window === 'undefined') return '';
    return buildInviteLink(offerCode, {
      origin: window.location.origin,
      pathname: window.location.pathname,
    });
  }, [offerCode]);

  const connecting = phase === 'connecting' || phase === 'handshaking' || phase === 'ready';
  const failed = phase === 'failed' || phase === 'closed';

  async function connect() {
    if (busy) return;
    setBusy(true);
    setLocalError(null);
    const result = await onConnect(answerInput);
    setBusy(false);
    if (!result.ok) {
      setLocalError(result.error ?? 'Le code de réponse n’a pas pu être connecté.');
    }
  }

  return (
    <div className="screen connect-screen">
      <div className="screen-heading">
        <div>
          <p className="kicker">Étape 2 · {role === 'host' ? 'Hôte' : 'Invité'}</p>
          <h1>{role === 'host' ? fr.connect.hostTitle : fr.connect.guestTitle}</h1>
          <p className="lead">{role === 'host' ? fr.connect.hostIntro : fr.connect.guestIntro}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => setConfirmLeave(true)}>
          {fr.connect.cancel}
        </button>
      </div>

      <div className={`connection-status connection-status--${phase}`} role="status">
        <span className="connection-pulse" aria-hidden="true" />
        <div>
          <strong>{phaseLabel(phase)}</strong>
          {detail ? <p>{detail}</p> : null}
        </div>
      </div>

      {role === 'host' ? (
        <div className="connect-grid">
          <section className="card card--plain share-card">
            <div className="step-number" aria-hidden="true">
              1
            </div>
            <h2>{fr.connect.linkLabel}</h2>
            <p>
              Partagez ce lien avec votre adversaire. Il contient les informations nécessaires pour
              établir la connexion directe.
            </p>
            <textarea
              className="code-area mono"
              value={inviteLink}
              readOnly
              rows={5}
              onFocus={(event) => event.currentTarget.select()}
              aria-label={fr.connect.linkLabel}
            />
            <div className="button-row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() =>
                  void linkShare.share({
                    title: 'Invitation à une partie de Prisme',
                    text: fr.connect.shareText,
                    url: inviteLink,
                  })
                }
              >
                {linkShare.canShare ? fr.common.share : fr.common.copy}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void linkShare.copy(inviteLink)}
              >
                {linkShare.copied ? fr.common.copied : fr.common.copy}
              </button>
            </div>
            <p className="fine-print">{fr.connect.security}</p>
          </section>

          <section className="card card--plain share-card">
            <div className="step-number" aria-hidden="true">
              2
            </div>
            <h2>{fr.connect.answerLabel}</h2>
            <p>
              Votre adversaire vous renverra un code après avoir placé sa mine. Collez-le ici pour
              terminer la connexion.
            </p>
            <label className="field">
              <span>{fr.connect.answerLabel}</span>
              <textarea
                value={answerInput}
                onChange={(event) => setAnswerInput(event.target.value)}
                placeholder={fr.connect.answerPlaceholder}
                rows={5}
                className="mono"
                autoComplete="off"
                spellCheck={false}
                disabled={connecting || failed}
              />
            </label>
            <button
              type="button"
              className="btn btn--primary btn--wide"
              onClick={() => void connect()}
              disabled={!answerInput.trim() || busy || connecting || failed}
            >
              {busy || phase === 'connecting' ? fr.connect.generating : fr.connect.connect}
            </button>
            {localError || error ? (
              <p className="inline-alert" role="alert">
                {localError ?? error}
              </p>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="connect-grid connect-grid--single">
          <section className="card card--plain share-card">
            <div className="step-number" aria-hidden="true">
              2
            </div>
            <h2>{fr.connect.answerLabel}</h2>
            <p>
              Renvoyez ce code à l’hôte par le moyen de votre choix. Gardez cette page ouverte : la
              partie démarrera dès que la connexion sera établie.
            </p>
            {answerCode ? (
              <>
                <textarea
                  className="code-area mono"
                  value={answerCode}
                  readOnly
                  rows={6}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label={fr.connect.answerLabel}
                />
                <div className="button-row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() =>
                      void answerShare.share({
                        title: 'Réponse à une invitation Prisme',
                        text: `${fr.connect.answerShareText}\n\n${answerCode}`,
                      })
                    }
                  >
                    {answerShare.canShare ? fr.common.share : fr.common.copy}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void answerShare.copy(answerCode)}
                  >
                    {answerShare.copied ? fr.common.copied : fr.common.copy}
                  </button>
                </div>
              </>
            ) : (
              <div className="skeleton-block" aria-hidden="true" />
            )}
            <p className="fine-print">
              Le code de réponse contient aussi des adresses réseau temporaires. Ne le partagez
              qu’avec l’hôte de la partie.
            </p>
          </section>

          <section className="waiting-card">
            <div className="waiting-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>{connecting ? 'Connexion en cours' : fr.connect.waiting}</h2>
            <p>
              {connecting
                ? 'Les deux navigateurs échangent leurs engagements. La partie va commencer.'
                : 'L’hôte doit coller votre code de réponse, puis la partie démarrera automatiquement.'}
            </p>
            {inviteCode ? (
              <p className="fine-print">
                Invitation d’origine : <span className="mono">{inviteCode.slice(0, 12)}…</span>
              </p>
            ) : null}
          </section>
        </div>
      )}

      {failed ? (
        <section className="status-panel status-panel--danger">
          <h2>{fr.connect.connectionError}</h2>
          <p>{fr.connect.iceHint}</p>
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              {fr.common.retry}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onLeave}>
              {fr.common.home}
            </button>
          </div>
        </section>
      ) : null}

      <p className="connect-footnote">
        Vous jouez en tant que <strong>{playerName || 'Joueur'}</strong>. La connexion pair-à-pair
        peut échouer sur certains réseaux mobiles : essayez le Wi-Fi en cas de blocage.
      </p>

      <Dialog
        open={confirmLeave}
        title="Quitter la connexion ?"
        tone="warning"
        onClose={() => setConfirmLeave(false)}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmLeave(false)}>
              {fr.common.cancel}
            </button>
            <button type="button" className="btn btn--danger" onClick={onLeave}>
              Quitter
            </button>
          </>
        }
      >
        <p>
          La mine verrouillée et les codes de signalisation seront perdus. Vous devrez recréer une
          partie.
        </p>
      </Dialog>
    </div>
  );
}
