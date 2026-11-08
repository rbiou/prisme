import { useMemo } from 'react';
import { Board } from '../components/Board';
import { ColorChip } from '../components/ColorChip';
import { PrismMark } from '../components/AppHeader';
import { otherPlayer, endReasonLabel } from '../engine/endgame';
import { SPECIAL_ANSWER_LABELS, rayMixLabel } from '../engine/colors';
import { deserializeMine, deserializeNote } from '../engine/mine';
import type { GameState, Mine, PlayerId } from '../engine/types';
import { fr } from '../i18n/fr';
import type { RevealMarks } from '../net/protocol';
import type { RevealRecord } from '../state/matchReducer';

export interface ResultScreenProps {
  role: PlayerId;
  game: GameState;
  myMine: Mine;
  myNotes: Mine;
  myMarks: RevealMarks;
  opponentName: string;
  reveals: Partial<Record<PlayerId, RevealRecord>>;
  onNewGame: () => void;
  onHome: () => void;
}

export function ResultScreen({
  role,
  game,
  myMine,
  myNotes,
  myMarks,
  opponentName,
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
  const outcome: 'win' | 'loss' | 'draw' =
    game.winner === 'draw' ? 'draw' : game.winner === role ? 'win' : 'loss';

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
        <div className="result-actions">
          <button
            type="button"
            className="btn btn--primary btn--replay"
            onClick={onNewGame}
            autoFocus
          >
            {fr.result.newGame}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onHome}>
            {fr.common.home}
          </button>
        </div>
      </section>

      <p className="hint result-pairing">
        Chaque proposition est placée à côté de la mine qu’elle cherchait à reconstituer.
      </p>

      <div className="result-mines">
        <section className="card card--plain result-mine">
          <div className="panel-heading">
            <div>
              <p className="kicker">Révélée</p>
              <h2>{fr.game.ownMine}</h2>
            </div>
            <span className="badge badge--success">Révélée</span>
          </div>
          <div className="board-frame board-frame--compact">
            <Board mine={myMine} ariaLabel="Votre mine révélée" />
          </div>
        </section>

        <section className="card card--plain result-mine">
          <div className="panel-heading">
            <div>
              <p className="kicker">Proposition adverse</p>
              <h2>Proposition de {opponentName}</h2>
            </div>
            {remoteSubmission ? (
              <span
                className={`badge ${remoteSubmission.correct ? 'badge--success' : 'badge--danger'}`}
              >
                {remoteSubmission.correct ? 'Correcte' : 'Incorrecte'}
              </span>
            ) : (
              <span className="badge badge--soft">Aucune</span>
            )}
          </div>
          {remoteSubmission ? (
            <div className="board-frame board-frame--compact">
              <Board
                mine={deserializeMine(remoteSubmission.candidate)}
                ariaLabel={`Proposition de ${opponentName} sur votre mine`}
              />
            </div>
          ) : (
            <p className="empty-state">Aucune proposition soumise.</p>
          )}
        </section>

        <section className="card card--plain result-mine">
          <div className="panel-heading">
            <div>
              <p className="kicker">{remoteReveal ? 'Révélée' : 'En attente'}</p>
              <h2>Mine de {opponentName}</h2>
            </div>
            {remoteReveal ? (
              <span className="badge badge--success">Révélée</span>
            ) : (
              <span className="badge badge--soft">Révélation attendue</span>
            )}
          </div>
          {remoteReveal && remoteMine ? (
            <div className="board-frame board-frame--compact">
              <Board mine={remoteMine} ariaLabel={`Mine révélée de ${opponentName}`} />
            </div>
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

        <section className="card card--plain result-mine">
          <div className="panel-heading">
            <div>
              <p className="kicker">Votre proposition</p>
              <h2>Votre proposition</h2>
            </div>
            {mySubmission ? (
              <span
                className={`badge ${mySubmission.correct ? 'badge--success' : 'badge--danger'}`}
              >
                {mySubmission.correct ? 'Correcte' : 'Incorrecte'}
              </span>
            ) : (
              <span className="badge badge--soft">Aucune</span>
            )}
          </div>
          {mySubmission ? (
            <div className="board-frame board-frame--compact">
              <Board
                mine={deserializeMine(mySubmission.candidate)}
                ariaLabel={`Votre proposition sur la mine de ${opponentName}`}
              />
            </div>
          ) : (
            <p className="empty-state">Aucune proposition soumise.</p>
          )}
        </section>
      </div>

      <section className="result-reasoning">
        <div className="panel-heading">
          <div>
            <p className="kicker">Après la partie</p>
            <h2>Notes finales</h2>
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
          </article>
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
                    ? `entrée ${scan.entry.label}`
                    : scan.cell
                      ? `case ${String.fromCharCode(65 + scan.cell.row)}${scan.cell.col + 1}`
                      : 'question'}
                </span>
                <span>
                  {scan.answer.kind === 'wave' ? (
                    scan.answer.absorbed === true ? (
                      'Signal absorbé'
                    ) : (
                      <>
                        sortie {scan.answer.exit.label} ·{' '}
                        <ColorChip color={scan.answer.color} size="small" />
                        {rayMixLabel(scan.answer.color) ? (
                          <span className="journal-mix">
                            {' '}
                            {rayMixLabel(scan.answer.color)}
                          </span>
                        ) : null}
                      </>
                    )
                  ) : scan.answer.special ? (
                    <span className="journal-special">
                      {SPECIAL_ANSWER_LABELS[scan.answer.special]}
                    </span>
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
    </div>
  );
}
