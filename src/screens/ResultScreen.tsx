import { useEffect, useMemo, useState } from 'react';
import { Board } from '../components/Board';
import { ColorChip } from '../components/ColorChip';
import { PrismMark } from '../components/AppHeader';
import { otherPlayer, endReasonLabel } from '../engine/endgame';
import { deserializeMine, deserializeNote, serializeMine } from '../engine/mine';
import type { GameState, Mine, PlayerId } from '../engine/types';
import { fr } from '../i18n/fr';
import { verifyCommitment } from '../net/integrity';
import { verifyReveal } from '../state/integrityCheck';
import type { RevealMarks } from '../net/protocol';
import type { RevealRecord } from '../state/matchReducer';

export interface ResultScreenProps {
  role: PlayerId;
  game: GameState;
  myMine: Mine;
  myNotes: Mine;
  myMarks: RevealMarks;
  mySalt: string;
  myHash: string;
  opponentName: string;
  opponentHash: string | null;
  reveals: Partial<Record<PlayerId, RevealRecord>>;
  onNewGame: () => void;
  onHome: () => void;
}

interface VerificationState {
  key: string;
  status: 'waiting' | 'checking' | 'done';
  ownHashOk?: boolean;
  remoteHashOk?: boolean;
  ownReplayOk?: boolean;
  remoteReplayOk?: boolean;
  ownChecked: number;
  remoteChecked: number;
  problems: string[];
}

const EMPTY_VERIFICATION: VerificationState = {
  key: 'empty',
  status: 'waiting',
  ownChecked: 0,
  remoteChecked: 0,
  problems: [],
};

export function ResultScreen({
  role,
  game,
  myMine,
  myNotes,
  myMarks,
  mySalt,
  myHash,
  opponentName,
  opponentHash,
  reveals,
  onNewGame,
  onHome,
}: ResultScreenProps) {
  const other = otherPlayer(role);
  const remoteReveal = reveals[other];
  const remoteMine = useMemo(
    () => (remoteReveal ? deserializeMine(remoteReveal.mine) : null),
    [remoteReveal],
  );
  const remoteNotes = useMemo(
    () => (remoteReveal?.notes ? deserializeNote(remoteReveal.notes) : null),
    [remoteReveal],
  );
  const remoteMarks = remoteReveal?.marks ?? null;
  const localHasMarks = myMarks.crosses.length + myMarks.edges.length + myMarks.colors.length > 0;
  const remoteHasMarks = Boolean(
    remoteMarks &&
    remoteMarks.crosses.length + remoteMarks.edges.length + remoteMarks.colors.length > 0,
  );
  const mySubmission = useMemo(
    () => [...game.submissions].reverse().find((submission) => submission.by === role) ?? null,
    [game.submissions, role],
  );
  const remoteSubmission = useMemo(
    () => [...game.submissions].reverse().find((submission) => submission.by === other) ?? null,
    [game.submissions, other],
  );
  const [storedVerification, setVerification] = useState<VerificationState>(EMPTY_VERIFICATION);
  const [runId, setRunId] = useState(0);
  const verificationKey = `${runId}:${remoteReveal ? 'revealed' : 'pending'}:${opponentHash ?? ''}`;
  const verification: VerificationState =
    storedVerification.key === verificationKey
      ? storedVerification
      : {
          ...EMPTY_VERIFICATION,
          key: verificationKey,
          status: remoteReveal ? 'checking' : 'waiting',
        };

  const outcome: 'win' | 'loss' | 'draw' =
    game.winner === 'draw' ? 'draw' : game.winner === role ? 'win' : 'loss';

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const ownHashOk = await verifyCommitment(myMine, mySalt, myHash);
      if (cancelled) return;

      if (!remoteReveal || !remoteMine || !opponentHash) {
        setVerification({
          key: verificationKey,
          status: 'waiting',
          ownHashOk,
          ownChecked: 0,
          remoteChecked: 0,
          problems: [],
        });
        return;
      }

      const hostMine = role === 'host' ? myMine : remoteMine;
      const guestMine = role === 'guest' ? myMine : remoteMine;
      const [remoteCheck, ownCheck] = await Promise.all([
        verifyReveal({
          player: other,
          mine: remoteReveal.mine,
          salt: remoteReveal.salt,
          expectedHash: opponentHash,
          game,
          hostMine,
          guestMine,
        }),
        verifyReveal({
          player: role,
          mine: serializeMine(myMine),
          salt: mySalt,
          expectedHash: myHash,
          game,
          hostMine,
          guestMine,
        }),
      ]);

      if (cancelled) return;
      setVerification({
        key: verificationKey,
        status: 'done',
        ownHashOk,
        remoteHashOk: remoteCheck.hashOk,
        ownReplayOk: ownCheck.replayOk,
        remoteReplayOk: remoteCheck.replayOk,
        ownChecked: ownCheck.replayChecked,
        remoteChecked: remoteCheck.replayChecked,
        problems: [...remoteCheck.problems, ...ownCheck.problems],
      });
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [
    game,
    myHash,
    myMine,
    mySalt,
    opponentHash,
    other,
    remoteMine,
    remoteReveal,
    role,
    runId,
    verificationKey,
  ]);

  const checksComplete =
    verification.status === 'done' &&
    verification.ownHashOk === true &&
    verification.remoteHashOk === true &&
    verification.remoteReplayOk === true;
  const hasProblem =
    verification.status === 'done' &&
    (verification.ownHashOk === false ||
      verification.remoteHashOk === false ||
      verification.remoteReplayOk === false);

  return (
    <div className={`screen result-screen result-screen--${outcome}`}>
      <section className="result-hero">
        <div className="result-mark" aria-hidden="true">
          <PrismMark />
        </div>
        <p className="kicker">Partie terminée</p>
        <h1>
          {outcome === 'win' ? fr.result.win : outcome === 'loss' ? fr.result.loss : fr.result.draw}
        </h1>
        <p className="result-reason">{endReasonLabel(game.endReason)}</p>
        <div className="result-tags">
          <span className="badge badge--soft">
            {role === 'host' ? 'Hôte' : 'Invité'} ·{' '}
            {game.starter === role ? 'débutant' : 'non-débutant'}
          </span>
          <span className="badge badge--soft">{game.scans.length} réponses</span>
          <span className="badge badge--soft">{game.submissions.length} proposition(s)</span>
        </div>
      </section>

      <div className="result-mines">
        <section className="card card--plain result-mine">
          <div className="panel-heading">
            <div>
              <p className="kicker">Révélée</p>
              <h2>{fr.game.ownMine}</h2>
            </div>
            <span className={`badge ${verification.ownHashOk ? 'badge--success' : 'badge--soft'}`}>
              {verification.ownHashOk === false ? 'Engagement incohérent' : 'Votre engagement'}
            </span>
          </div>
          <div className="board-frame board-frame--compact">
            <Board mine={myMine} ariaLabel="Votre mine révélée" />
          </div>
          <p className="hash-line">
            <span>SHA-256</span>
            <code>{myHash}</code>
          </p>
        </section>

        <section className="card card--plain result-mine">
          <div className="panel-heading">
            <div>
              <p className="kicker">{remoteReveal ? 'Révélée' : 'En attente'}</p>
              <h2>Mine de {opponentName}</h2>
            </div>
            {remoteReveal ? (
              <span
                className={`badge ${
                  verification.remoteHashOk === false
                    ? 'badge--danger'
                    : verification.remoteHashOk
                      ? 'badge--success'
                      : 'badge--soft'
                }`}
              >
                {verification.remoteHashOk === false
                  ? 'Engagement incohérent'
                  : verification.remoteHashOk
                    ? 'Engagement vérifié'
                    : 'Vérification…'}
              </span>
            ) : (
              <span className="badge badge--soft">Révélation attendue</span>
            )}
          </div>
          {remoteReveal && remoteMine ? (
            <>
              <div className="board-frame board-frame--compact">
                <Board mine={remoteMine} ariaLabel={`Mine révélée de ${opponentName}`} />
              </div>
              <p className="hash-line">
                <span>SHA-256</span>
                <code>{opponentHash ?? 'inconnu'}</code>
              </p>
            </>
          ) : (
            <div className="reveal-waiting">
              <div className="waiting-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p>{fr.result.revealPending}</p>
              <p className="hint">
                La révélation peut arriver avec un léger retard. Si la connexion est fermée, elle ne
                pourra plus être reçue.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="result-reasoning">
        <div className="panel-heading">
          <div>
            <p className="kicker">Après la partie</p>
            <h2>Notes finales et propositions</h2>
          </div>
        </div>
        <div className="result-mines result-notes">
          <article className="card card--plain result-mine">
            <div className="panel-heading">
              <div>
                <p className="kicker">Votre raisonnement</p>
                <h3>Vos notes</h3>
              </div>
              <span className="badge badge--soft">
                {myNotes.pieces.length > 0
                  ? `${myNotes.pieces.length} gemme(s)`
                  : localHasMarks
                    ? 'Annotations'
                    : 'Vide'}
              </span>
            </div>
            {myNotes.pieces.length > 0 || localHasMarks ? (
              <div className="board-frame board-frame--compact">
                <Board
                  mine={myNotes}
                  crosses={myMarks.crosses}
                  edgeMarks={myMarks.edges}
                  colorMarks={myMarks.colors}
                  ariaLabel="Vos notes finales"
                />
              </div>
            ) : (
              <p className="empty-state">Aucune note conservée.</p>
            )}
            {mySubmission ? (
              <details className="reasoning-proposal">
                <summary>
                  Proposition soumise — {mySubmission.correct ? 'correcte' : 'incorrecte'}
                </summary>
                <div className="board-frame board-frame--compact">
                  <Board
                    mine={deserializeMine(mySubmission.candidate)}
                    ariaLabel="Votre proposition soumise"
                  />
                </div>
              </details>
            ) : (
              <p className="hint">Aucune proposition soumise.</p>
            )}
          </article>

          <article className="card card--plain result-mine">
            <div className="panel-heading">
              <div>
                <p className="kicker">Raisonnement adverse</p>
                <h3>Notes de {opponentName}</h3>
              </div>
              {remoteReveal ? (
                <span className="badge badge--soft">
                  {remoteNotes && remoteNotes.pieces.length > 0
                    ? `${remoteNotes.pieces.length} gemme(s)`
                    : remoteHasMarks
                      ? 'Annotations'
                      : 'Non transmises'}
                </span>
              ) : (
                <span className="badge badge--soft">En attente</span>
              )}
            </div>
            {remoteReveal ? (
              (remoteNotes && remoteNotes.pieces.length > 0) || remoteHasMarks ? (
                <div className="board-frame board-frame--compact">
                  <Board
                    mine={remoteNotes ?? { version: 1, pieces: [] }}
                    crosses={remoteMarks?.crosses ?? []}
                    edgeMarks={remoteMarks?.edges ?? []}
                    colorMarks={remoteMarks?.colors ?? []}
                    ariaLabel={`Notes finales de ${opponentName}`}
                  />
                </div>
              ) : (
                <p className="empty-state">Aucune note transmise.</p>
              )
            ) : (
              <p className="empty-state">{fr.result.revealPending}</p>
            )}
            {remoteSubmission ? (
              <details className="reasoning-proposal">
                <summary>
                  Proposition de {opponentName} —{' '}
                  {remoteSubmission.correct ? 'correcte' : 'incorrecte'}
                </summary>
                <div className="board-frame board-frame--compact">
                  <Board
                    mine={deserializeMine(remoteSubmission.candidate)}
                    ariaLabel={`Proposition de ${opponentName}`}
                  />
                </div>
              </details>
            ) : (
              <p className="hint">Aucune proposition soumise.</p>
            )}
          </article>
        </div>
      </section>

      <section
        className={`integrity-card${hasProblem ? ' integrity-card--bad' : checksComplete ? ' integrity-card--ok' : ''}`}
      >
        <div className="integrity-heading">
          <div>
            <p className="kicker">Contrôle a posteriori</p>
            <h2>{fr.result.integrity}</h2>
          </div>
          <span
            className={`badge ${
              hasProblem ? 'badge--danger' : checksComplete ? 'badge--success' : 'badge--soft'
            }`}
          >
            {hasProblem ? 'Anomalie' : checksComplete ? 'Tout est cohérent' : 'En cours'}
          </span>
        </div>

        <ul className="integrity-list">
          <li
            className={
              verification.ownHashOk === false ? 'is-bad' : verification.ownHashOk ? 'is-ok' : ''
            }
          >
            <span>Votre engagement SHA-256</span>
            <strong>
              {verification.ownHashOk === undefined
                ? 'En attente'
                : verification.ownHashOk
                  ? fr.result.commitmentOk
                  : fr.result.commitmentBad}
            </strong>
          </li>
          <li
            className={
              verification.remoteHashOk === false
                ? 'is-bad'
                : verification.remoteHashOk
                  ? 'is-ok'
                  : ''
            }
          >
            <span>Engagement de {opponentName}</span>
            <strong>
              {!remoteReveal
                ? 'En attente de la révélation'
                : verification.remoteHashOk === undefined
                  ? 'En attente'
                  : verification.remoteHashOk
                    ? fr.result.commitmentOk
                    : fr.result.commitmentBad}
            </strong>
          </li>
          <li
            className={
              verification.remoteReplayOk === false
                ? 'is-bad'
                : verification.remoteReplayOk
                  ? 'is-ok'
                  : ''
            }
          >
            <span>Rejeu des réponses de l’adversaire</span>
            <strong>
              {verification.status !== 'done' || !remoteReveal
                ? fr.result.replayPending
                : verification.remoteReplayOk
                  ? `${fr.result.replayOk} (${verification.remoteChecked})`
                  : fr.result.replayBad}
            </strong>
          </li>
          <li
            className={
              verification.ownReplayOk === false
                ? 'is-bad'
                : verification.ownReplayOk
                  ? 'is-ok'
                  : ''
            }
          >
            <span>Rejeu de vos propres réponses</span>
            <strong>
              {verification.status !== 'done'
                ? fr.result.replayPending
                : verification.ownReplayOk
                  ? `${fr.result.replayOk} (${verification.ownChecked})`
                  : fr.result.replayBad}
            </strong>
          </li>
        </ul>

        {hasProblem ? <p className="inline-alert">{fr.result.warning}</p> : null}

        {verification.problems.length > 0 ? (
          <details className="problem-details">
            <summary>Voir les incohérences détectées</summary>
            <ul>
              {verification.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="button-row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setRunId((value) => value + 1)}
            disabled={!remoteReveal}
          >
            Relancer la vérification
          </button>
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            {fr.common.home}
          </button>
          <button type="button" className="btn btn--primary" onClick={onNewGame}>
            {fr.result.newGame}
          </button>
        </div>
      </section>

      {game.scans.length > 0 ? (
        <section className="card card--plain result-journal">
          <h2>Journal final</h2>
          <div className="result-scans">
            {game.scans.map((scan) => (
              <div key={scan.id} className="result-scan">
                <span>
                  {scan.by === role ? 'Vous' : opponentName} ·{' '}
                  {scan.kind === 'wave' && scan.entry
                    ? `rayon ${scan.entry.label}`
                    : scan.cell
                      ? `case ${String.fromCharCode(65 + scan.cell.row)}${scan.cell.col + 1}`
                      : 'question'}
                </span>
                <span>
                  {scan.answer.kind === 'wave' ? (
                    <>
                      sortie {scan.answer.exit.label} ·{' '}
                      <ColorChip color={scan.answer.color} size="small" />
                    </>
                  ) : (
                    <ColorChip
                      color={scan.answer.color}
                      label={scan.answer.color ? undefined : 'Rien'}
                      size="small"
                    />
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="fine-print">
        La vérification est une détection a posteriori : elle ne remplace pas la confiance
        nécessaire entre les deux joueurs.
      </p>
    </div>
  );
}
