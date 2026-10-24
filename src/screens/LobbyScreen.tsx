import { useState } from 'react';
import { Dialog } from '../components/Dialog';
import { useShare } from '../hooks/useShare';
import type { PlayerId } from '../engine/types';
import { fr } from '../i18n/fr';
import { formatRoomCode } from '../net/roomCode';
import type { SessionPhase } from '../net/session';

export interface LobbyScreenProps {
  role: PlayerId;
  playerName: string;
  roomCode: string | null;
  phase: SessionPhase;
  opponentName: string;
  detail: string | null;
  error: string | null;
  canResume?: boolean;
  onStart: () => boolean;
  onResume?: () => void;
  onLeave: () => void;
  onHome: () => void;
}

function statusLabel(
  role: PlayerId,
  phase: SessionPhase,
  opponentName: string,
): { title: string; text: string } {
  const host = role === 'host';
  switch (phase) {
    case 'opening':
      return {
        title: 'Préparation du salon…',
        text: 'Le service de mise en relation réserve votre code.',
      };
    case 'waiting':
      return {
        title: fr.lobby.waitingHost,
        text: 'Le bouton de lancement apparaîtra dès que votre adversaire aura rejoint le salon.',
      };
    case 'connecting':
      return {
        title: host ? 'Un adversaire se connecte…' : 'Connexion au salon…',
        text: host
          ? 'La connexion directe est en cours d’établissement.'
          : 'Recherche de la partie et ouverture de la connexion directe.',
      };
    case 'lobby':
      return host
        ? {
            title: `${fr.lobby.connectedWith} : ${opponentName}`,
            text: 'Tout le monde est là. Vous pouvez lancer le placement des mines.',
          }
        : {
            title: `${fr.lobby.connected} avec ${opponentName}`,
            text: fr.lobby.guestWaiting,
          };
    case 'placing':
    case 'awaiting-opponent':
    case 'ready':
      return {
        title: 'La partie est lancée.',
        text: 'Placement des mines en cours…',
      };
    case 'reconnecting':
      return {
        title: fr.lobby.reconnecting,
        text: fr.lobby.reconnectingHint,
      };
    case 'failed':
    case 'closed':
      return {
        title: fr.lobby.failedTitle,
        text: 'Le salon est fermé ou la connexion n’a pas abouti.',
      };
    default:
      return {
        title: fr.lobby.kicker,
        text: 'Préparation de la connexion.',
      };
  }
}

export function LobbyScreen({
  role,
  playerName,
  roomCode,
  phase,
  opponentName,
  detail,
  error,
  canResume = false,
  onStart,
  onResume,
  onLeave,
  onHome,
}: LobbyScreenProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const share = useShare();
  const host = role === 'host';
  const connected =
    phase === 'lobby' || phase === 'placing' || phase === 'awaiting-opponent' || phase === 'ready';
  const failed = phase === 'failed' || phase === 'closed';
  const displayCode = roomCode ? formatRoomCode(roomCode) : fr.lobby.codePlaceholder;
  const status = statusLabel(role, phase, opponentName);
  const shareText = roomCode
    ? `${fr.lobby.shareText} : ${formatRoomCode(roomCode)}`
    : fr.lobby.shareText;

  return (
    <div className="screen lobby-screen">
      <div className="screen-heading">
        <div>
          <p className="kicker">
            {fr.lobby.kicker} · {host ? 'Hôte' : 'Invité'}
          </p>
          <h1>{host ? (failed ? 'Salon fermé' : fr.lobby.title) : fr.lobby.guestTitle}</h1>
          <p className="lead">{host ? fr.lobby.hostIntro : fr.lobby.guestIntro}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => setConfirmLeave(true)}>
          {fr.lobby.leaving}
        </button>
      </div>

      <div className={`connection-status connection-status--${phase}`} role="status">
        <span className="connection-pulse" aria-hidden="true" />
        <div>
          <strong>{status.title}</strong>
          <p>{detail ?? status.text}</p>
        </div>
      </div>

      {failed ? (
        <section className="status-panel status-panel--danger">
          <h2>{fr.lobby.failedTitle}</h2>
          <p>{error ?? fr.lobby.failedBody}</p>
          <div className="button-row">
            {canResume && onResume ? (
              <>
                <button type="button" className="btn btn--primary" onClick={onResume}>
                  Réessayer la connexion
                </button>
                <button type="button" className="btn btn--ghost" onClick={onHome}>
                  {fr.lobby.retryHome}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--primary" onClick={onHome}>
                {fr.lobby.retryHome}
              </button>
            )}
          </div>
        </section>
      ) : (
        <div className="lobby-grid">
          {host ? (
            <section className="card card--plain lobby-code-card">
              <p className="kicker">{fr.lobby.codeLabel}</p>
              <output
                className="lobby-code"
                aria-live="polite"
                aria-label={`${fr.lobby.codeLabel} : ${displayCode}`}
              >
                {displayCode}
              </output>
              <p>{fr.lobby.codeHint}</p>
              <div className="button-row">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!roomCode}
                  onClick={() =>
                    void share.share({
                      title: 'Invitation à une partie de Prisme',
                      text: shareText,
                    })
                  }
                >
                  {share.canShare ? fr.common.share : fr.common.copy}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={!roomCode}
                  onClick={() => void share.copy(displayCode)}
                >
                  {share.copied ? fr.common.copied : 'Copier le code'}
                </button>
              </div>
            </section>
          ) : (
            <section className="card card--plain lobby-code-card lobby-code-card--guest">
              <p className="kicker">{fr.lobby.kicker}</p>
              <output className="lobby-code" aria-label={`${fr.lobby.kicker} ${displayCode}`}>
                {displayCode}
              </output>
              <p>
                Vous jouez en tant que <strong>{playerName || 'Joueur'}</strong>.
              </p>
            </section>
          )}

          <section className="waiting-card">
            <div className="waiting-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>{connected ? fr.lobby.connected : status.title}</h2>
            <p>
              {connected
                ? status.text
                : 'Le salon reste ouvert pendant que la connexion s’établit.'}
            </p>
            {host && phase === 'lobby' ? (
              <button type="button" className="btn btn--primary lobby-start" onClick={onStart}>
                {fr.lobby.start}
              </button>
            ) : null}
            {!host && phase === 'lobby' ? (
              <p className="lobby-waiting">{fr.lobby.waitingGuest}</p>
            ) : null}
          </section>
        </div>
      )}

      <Dialog
        open={confirmLeave}
        title={fr.lobby.leaveTitle}
        tone="warning"
        onClose={() => setConfirmLeave(false)}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmLeave(false)}>
              {fr.common.cancel}
            </button>
            <button type="button" className="btn btn--danger" onClick={onLeave}>
              {fr.lobby.leaving}
            </button>
          </>
        }
      >
        <p>{fr.lobby.leaveBody}</p>
      </Dialog>
    </div>
  );
}
