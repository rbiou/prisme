import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Board } from '../components/Board';
import { ColorChip } from '../components/ColorChip';
import { ColorMixLegend } from '../components/ColorMixLegend';
import { Dialog } from '../components/Dialog';
import { MineComposer } from '../components/MineComposer';
import { ALL_ENTRIES, cellLabel, isCell, parseCellLabel, sideLabel } from '../engine/board';
import { scanCell } from '../engine/cellScan';
import { canScan, canSubmit } from '../engine/endgame';
import { checkSolution, deserializeMine, isSerializedMine, serializeMine } from '../engine/mine';
import { isNoteEdgeMark, type NoteEdgeMark } from '../engine/noteEdges';
import { validateMine } from '../engine/placement';
import { simulateRay } from '../engine/ray';
import { RAY_COLOR_LABELS } from '../engine/colors';
import type {
  Cell,
  Mine,
  PlayerId,
  RayColor,
  RayResult,
  ScanRecord,
  SerializedMine,
} from '../engine/types';
import { fr } from '../i18n/fr';
import type { MatchState } from '../state/matchReducer';
import type { Settings } from '../state/settings';
import { ResultScreen } from './ResultScreen';

export interface GameScreenProps {
  state: MatchState;
  settings: Settings;
  onWave: (label: string) => boolean;
  onCell: (cell: Cell) => boolean;
  onAnswer: () => boolean;
  onCancelIncoming: () => boolean;
  onConfirmIncoming: () => boolean;
  onRequestConfirmation: (answerId: string) => boolean;
  onVerifySubmission: () => boolean;
  onSubmit: (candidate: SerializedMine) => boolean;
  onResume: () => void;
  onLeave: () => void;
  onNewGame: () => void;
  onHome: () => void;
}

function loadNotes(key: string): Mine {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return { version: 1, pieces: [] };
    const parsed: unknown = JSON.parse(raw);
    return isSerializedMine(parsed) ? deserializeMine(parsed) : { version: 1, pieces: [] };
  } catch {
    return { version: 1, pieces: [] };
  }
}

function isStoredCell(value: unknown): value is Cell {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { col?: unknown; row?: unknown };
  return (
    typeof candidate.col === 'number' &&
    typeof candidate.row === 'number' &&
    isCell({ col: candidate.col, row: candidate.row })
  );
}

function loadCrosses(key: string): Cell[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredCell);
  } catch {
    return [];
  }
}

function loadEdgeMarks(key: string): NoteEdgeMark[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNoteEdgeMark);
  } catch {
    return [];
  }
}

function questionLabel(scan: Pick<ScanRecord, 'kind' | 'entry' | 'cell'>): string {
  if (scan.kind === 'wave' && scan.entry) {
    return `Rayon ${scan.entry.label} · côté ${sideLabel(scan.entry.side)}`;
  }
  if (scan.kind === 'cell' && scan.cell) {
    return `Case ${cellLabel(scan.cell)}`;
  }
  return 'Question inconnue';
}

function privateRayLabel(result: RayResult): string {
  if (result.status === 'loop') return 'Boucle de rayon';
  return `Sortie ${result.exit?.label ?? '?'}`;
}

interface JournalProps {
  scans: ScanRecord[];
  role: PlayerId;
  opponentName: string;
  canRequestConfirmation: boolean;
  onRequestConfirmation: (answerId: string) => void;
}

function GameJournal({
  scans,
  role,
  opponentName,
  canRequestConfirmation,
  onRequestConfirmation,
}: JournalProps) {
  if (scans.length === 0) {
    return <p className="empty-state">{fr.game.emptyJournal}</p>;
  }

  return (
    <ol className="journal" aria-live="polite">
      {scans.map((scan, index) => {
        const byMe = scan.by === role;
        const isConfirmation = Boolean(scan.confirmationOf);
        return (
          <li key={scan.id} className={`journal-entry${isConfirmation ? ' is-confirmation' : ''}`}>
            <div className="journal-index" aria-hidden="true">
              {index + 1}
            </div>
            <div className="journal-main">
              <div className="journal-meta">
                <span className={`journal-author${byMe ? ' is-me' : ''}`}>
                  {byMe ? 'Vous' : opponentName}
                </span>
                <span className="journal-question">{questionLabel(scan)}</span>
                {isConfirmation ? (
                  <span className="badge badge--soft">Confirmation gratuite</span>
                ) : null}
              </div>
              <div className="journal-answer">
                {scan.answer.kind === 'wave' ? (
                  <>
                    <span className="journal-exit">{scan.answer.exit.label}</span>
                    <ColorChip color={scan.answer.color} />
                  </>
                ) : (
                  <ColorChip
                    color={scan.answer.color}
                    label={scan.answer.color ? undefined : 'Rien'}
                  />
                )}
              </div>
              {byMe && !isConfirmation && canRequestConfirmation ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => onRequestConfirmation(scan.id)}
                >
                  {fr.game.confirmAgain}
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PrivateBoard({
  mine,
  path,
  pathColor,
  highlight,
}: {
  mine: Mine;
  path?: { x: number; y: number }[] | null;
  pathColor?: RayColor;
  highlight?: Cell | null;
}) {
  return (
    <div className="board-frame board-frame--compact">
      <Board
        mine={mine}
        path={path ?? null}
        pathColor={pathColor}
        highlightCell={highlight ?? null}
        ariaLabel="Votre mine secrète et la trajectoire privée du rayon"
      />
    </div>
  );
}

export function GameScreen({
  state,
  settings,
  onWave,
  onCell,
  onAnswer,
  onCancelIncoming,
  onConfirmIncoming,
  onRequestConfirmation,
  onVerifySubmission,
  onSubmit,
  onResume,
  onLeave,
  onNewGame,
  onHome,
}: GameScreenProps) {
  const game = state.game!;
  const role = state.role!;
  const locked = state.locked!;
  const myMine = locked.mine;
  const notesKey = `prisme:notes:${state.readyAt ?? 'local'}`;
  const crossesKey = `prisme:crosses:${state.readyAt ?? 'local'}`;
  const edgesKey = `prisme:edges:${state.readyAt ?? 'local'}`;
  const [tab, setTab] = useState<'prospection' | 'mine'>('prospection');
  const [mode, setMode] = useState<'scan' | 'notes'>('scan');
  const [notes, setNotes] = useState<Mine>(() => loadNotes(notesKey));
  const [crosses, setCrosses] = useState<Cell[]>(() => loadCrosses(crossesKey));
  const [edgeMarks, setEdgeMarks] = useState<NoteEdgeMark[]>(() => loadEdgeMarks(edgesKey));
  const [simulation, setSimulation] = useState<{ entryLabel: string; result: RayResult } | null>(
    null,
  );
  const [simEntry, setSimEntry] = useState('1');
  const [cellInput, setCellInput] = useState('');
  const [cellError, setCellError] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(notesKey, JSON.stringify(serializeMine(notes)));
    } catch {
      // Les notes restent en mémoire si le stockage est indisponible.
    }
  }, [notes, notesKey]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(crossesKey, JSON.stringify(crosses));
    } catch {
      // Les croix restent en mémoire si le stockage est indisponible.
    }
  }, [crosses, crossesKey]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(edgesKey, JSON.stringify(edgeMarks));
    } catch {
      // Les arêtes restent en mémoire si le stockage est indisponible.
    }
  }, [edgeMarks, edgesKey]);

  const notesSimulationValidation = useMemo(
    () => validateMine(notes, { enforceWhiteSymmetry: settings.enforceWhiteSymmetry }),
    [notes, settings.enforceWhiteSymmetry],
  );
  const notesStructureValidation = useMemo(
    () =>
      validateMine(notes, {
        enforceWhiteSymmetry: false,
        requireReachable: false,
        rejectLoops: false,
      }),
    [notes],
  );

  const isMyTurn = game.turn === role;
  const connected = state.sessionPhase === 'ready' && state.transportStatus === 'connected';
  const reconnecting =
    state.sessionPhase === 'reconnecting' ||
    (state.transportStatus === 'disconnected' &&
      state.sessionPhase !== 'failed' &&
      state.sessionPhase !== 'closed');
  const canScanNow = canScan(game, role) && connected;
  const canSubmitNow = canSubmit(game, role) && connected;
  const askedEntries = useMemo(
    () =>
      new Set(
        game.scans
          .map((scan) => scan.entry?.label)
          .filter((label): label is string => Boolean(label)),
      ),
    [game.scans],
  );
  const incomingScan = game.pendingScan && game.pendingScan.by !== role ? game.pendingScan : null;
  const incomingConfirmation =
    game.pendingConfirmation && game.pendingConfirmation.by !== role
      ? game.pendingConfirmation
      : null;
  const incomingSubmission =
    game.pendingSubmission && game.pendingSubmission.by !== role ? game.pendingSubmission : null;

  const incomingScanResult = useMemo(() => {
    if (!incomingScan) return null;
    if (incomingScan.kind === 'wave' && incomingScan.entry) {
      return { kind: 'wave' as const, result: simulateRay(myMine, incomingScan.entry) };
    }
    if (incomingScan.kind === 'cell' && incomingScan.cell) {
      return {
        kind: 'cell' as const,
        result: scanCell(myMine, incomingScan.cell),
        cell: incomingScan.cell,
      };
    }
    return null;
  }, [incomingScan, myMine]);

  const confirmationQuestion = useMemo(() => {
    if (!incomingConfirmation) return null;
    const original = game.scans.find((scan) => scan.id === incomingConfirmation.answerId);
    if (!original) return null;
    if (original.kind === 'wave' && original.entry) {
      return { original, kind: 'wave' as const, result: simulateRay(myMine, original.entry) };
    }
    if (original.kind === 'cell' && original.cell) {
      return {
        original,
        kind: 'cell' as const,
        result: scanCell(myMine, original.cell),
        cell: original.cell,
      };
    }
    return null;
  }, [game.scans, incomingConfirmation, myMine]);

  const incomingSubmissionMine = useMemo(
    () => (incomingSubmission ? deserializeMine(incomingSubmission.candidate) : null),
    [incomingSubmission],
  );
  const incomingSubmissionVerdict = useMemo(
    () => (incomingSubmission ? checkSolution(incomingSubmission.candidate, myMine) : null),
    [incomingSubmission, myMine],
  );

  const matchingAnswer = useMemo(() => {
    if (!simulation) return null;
    return (
      [...game.scans]
        .reverse()
        .find(
          (scan) =>
            scan.kind === 'wave' &&
            scan.entry?.label === simulation.entryLabel &&
            !scan.confirmationOf,
        ) ?? null
    );
  }, [game.scans, simulation]);

  const simulationMatches = useMemo(() => {
    if (!simulation || !matchingAnswer || matchingAnswer.answer.kind !== 'wave') return null;
    if (simulation.result.status === 'loop') return false;
    return (
      simulation.result.exit?.label === matchingAnswer.answer.exit.label &&
      simulation.result.color === matchingAnswer.answer.color
    );
  }, [matchingAnswer, simulation]);

  const turnLabel = (() => {
    if (game.phase === 'awaiting-verification') {
      return game.pendingSubmission?.by === role
        ? fr.game.awaitingVerification
        : fr.game.incomingSubmit;
    }
    if (game.pendingScan) {
      return game.pendingScan.by === role ? fr.game.awaitingAnswer : fr.game.incomingScan;
    }
    if (game.pendingConfirmation) {
      return game.pendingConfirmation.by === role
        ? 'Confirmation en attente…'
        : fr.game.incomingConfirm;
    }
    if (game.phase === 'final-turn') {
      return game.turn === role ? fr.game.finalTurnYou : fr.game.finalTurnOpponent;
    }
    return isMyTurn ? fr.game.turnYou : fr.game.turnOpponent;
  })();

  const turnTone = isMyTurn || game.phase === 'final-turn' ? 'is-mine' : 'is-theirs';

  function updateNotes(next: Mine) {
    setNotes(next);
    setSimulation(null);
    setSubmitError(null);
  }

  function submitCell(event: FormEvent) {
    event.preventDefault();
    const cell = parseCellLabel(cellInput);
    if (!cell) {
      setCellError('Coordonnées invalides. Exemple : E4.');
      return;
    }
    if (onCell(cell)) {
      setCellInput('');
      setCellError(null);
    } else {
      setCellError('La case n’a pas pu être sondée.');
    }
  }

  function runSimulation() {
    const entry = ALL_ENTRIES.find((candidate) => candidate.label === simEntry);
    if (!entry) return;
    setSimulation({ entryLabel: entry.label, result: simulateRay(notes, entry) });
  }

  function confirmSubmission() {
    const candidate = serializeMine(notes);
    if (!onSubmit(candidate)) {
      setSubmitError('La proposition n’a pas pu être envoyée.');
      return;
    }
    setSubmitOpen(false);
  }

  if (game.phase === 'ended') {
    return (
      <ResultScreen
        role={role}
        game={game}
        myMine={myMine}
        mySalt={locked.salt}
        myHash={locked.hash}
        opponentName={state.opponentName}
        opponentHash={state.opponentHash}
        reveals={state.reveals}
        onNewGame={onNewGame}
        onHome={onHome}
      />
    );
  }

  const connectionBroken =
    state.transportStatus === 'failed' ||
    state.transportStatus === 'closed' ||
    state.sessionPhase === 'failed' ||
    state.sessionPhase === 'closed';

  return (
    <div className="screen game-screen">
      <div className="game-topbar">
        <div className="game-identity">
          <span className="badge badge--prism">Vous</span>
          <span className="game-name">{state.playerName || 'Joueur'}</span>
          <span className="game-vs">contre</span>
          <span className="game-name">{state.opponentName}</span>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setLeaveOpen(true)}
        >
          Quitter
        </button>
      </div>

      <div className={`turn-banner turn-banner--${turnTone}`} role="status" aria-live="polite">
        <span className="turn-pulse" aria-hidden="true" />
        <strong>{turnLabel}</strong>
        <span className="turn-sub">
          {game.phase === 'final-turn'
            ? 'Seule une proposition est possible.'
            : canScanNow
              ? fr.game.scanHint
              : fr.game.waitingOpponent}
        </span>
      </div>

      {reconnecting && !connectionBroken ? (
        <section className="status-panel status-panel--warning" role="status" aria-live="polite">
          <h2>{fr.game.reconnecting}</h2>
          <p>{fr.game.reconnectingHint}</p>
          <div className="button-row">
            <button type="button" className="btn btn--ghost btn--small" onClick={onResume}>
              Relancer la tentative
            </button>
          </div>
        </section>
      ) : null}

      {connectionBroken ? (
        <section className="status-panel status-panel--warning" role="alert">
          <h2>{fr.game.connectionLost}</h2>
          <p>{fr.game.connectionLostHint}</p>
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={onResume}>
              Réessayer la connexion
            </button>
          </div>
        </section>
      ) : null}

      <div className="game-tabs" role="tablist" aria-label="Sections de la partie">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prospection'}
          className={`segmented${tab === 'prospection' ? ' is-active' : ''}`}
          onClick={() => setTab('prospection')}
        >
          {fr.game.prospection}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          className={`segmented${tab === 'mine' ? ' is-active' : ''}`}
          onClick={() => setTab('mine')}
        >
          {fr.game.myMine}
          <span className="lock-dot" aria-label={fr.game.lockedMine} />
        </button>
      </div>

      {tab === 'prospection' ? (
        <div className="prospection-layout">
          <section className="board-panel card card--plain">
            <div className="panel-heading">
              <div>
                <p className="kicker">Prospection</p>
                <h2>{mode === 'scan' ? 'Plateau adverse' : 'Vos notes privées'}</h2>
              </div>
              <div className="mode-switch" role="group" aria-label="Mode du plateau">
                <button
                  type="button"
                  className={`mode-button${mode === 'scan' ? ' is-active' : ''}`}
                  onClick={() => setMode('scan')}
                >
                  {fr.game.modeScan}
                </button>
                <button
                  type="button"
                  className={`mode-button${mode === 'notes' ? ' is-active' : ''}`}
                  onClick={() => setMode('notes')}
                >
                  {fr.game.modeNotes}
                  <span className="private-badge">Privé</span>
                </button>
              </div>
            </div>

            {mode === 'scan' ? (
              <>
                <div className="board-frame">
                  <Board
                    notes={notes}
                    askedEntries={askedEntries}
                    interactiveEntries={canScanNow}
                    interactiveCells={canScanNow}
                    onEntryAction={onWave}
                    onCellAction={onCell}
                    ariaLabel="Plateau adverse : touchez une étiquette de bord pour tirer un rayon, ou une case pour l’interroger"
                  />
                </div>
                <form className="coordinate-row" onSubmit={submitCell}>
                  <label className="field field--inline">
                    <span>{fr.game.cellLabel}</span>
                    <input
                      type="text"
                      value={cellInput}
                      onChange={(event) => {
                        setCellInput(event.target.value);
                        setCellError(null);
                      }}
                      placeholder={fr.game.cellPlaceholder}
                      autoComplete="off"
                      autoCapitalize="characters"
                      disabled={!canScanNow}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn--secondary"
                    disabled={!canScanNow || !cellInput.trim()}
                  >
                    {fr.game.scanCell}
                  </button>
                </form>
                {cellError ? (
                  <p className="inline-alert" role="alert">
                    {cellError}
                  </p>
                ) : null}
                <p className="hint">
                  {canScanNow
                    ? 'Les étiquettes tirent un rayon. Les cases répondent par une couleur ou « rien ».'
                    : 'Attendez la réponse ou la confirmation de l’adversaire pour agir.'}
                </p>
              </>
            ) : (
              <>
                <div className="notes-banner">
                  <span className="badge badge--soft">Notes privées</span>
                  <span>{fr.game.notesHint}</span>
                </div>
                <MineComposer
                  mine={notes}
                  onChange={updateNotes}
                  crosses={crosses}
                  onCrossesChange={setCrosses}
                  edgeMarks={edgeMarks}
                  onEdgeMarksChange={setEdgeMarks}
                  boardAriaLabel="Plateau de notes privées"
                  path={simulation?.result.path ?? null}
                  pathColor={simulation?.result.color ?? 'white'}
                />
                <div className="simulation-card">
                  <div className="simulation-heading">
                    <h3>{fr.game.simulate}</h3>
                    {simulation ? (
                      <span
                        className={`badge ${simulationMatches === false ? 'badge--danger' : 'badge--soft'}`}
                      >
                        {simulation.result.status === 'loop'
                          ? 'Boucle'
                          : `${privateRayLabel(simulation.result)} · ${RAY_COLOR_LABELS[simulation.result.color]}`}
                      </span>
                    ) : null}
                  </div>
                  <div className="simulation-controls">
                    <label className="field field--inline">
                      <span>{fr.game.rayLabel}</span>
                      <select
                        value={simEntry}
                        onChange={(event) => setSimEntry(event.target.value)}
                      >
                        <optgroup label="Haut">
                          {ALL_ENTRIES.filter((entry) => entry.side === 'top').map((entry) => (
                            <option key={entry.label} value={entry.label}>
                              {entry.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Droite">
                          {ALL_ENTRIES.filter((entry) => entry.side === 'right').map((entry) => (
                            <option key={entry.label} value={entry.label}>
                              {entry.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Bas">
                          {ALL_ENTRIES.filter((entry) => entry.side === 'bottom').map((entry) => (
                            <option key={entry.label} value={entry.label}>
                              {entry.label}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Gauche">
                          {ALL_ENTRIES.filter((entry) => entry.side === 'left').map((entry) => (
                            <option key={entry.label} value={entry.label}>
                              {entry.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={runSimulation}
                      disabled={!notesSimulationValidation.ok}
                    >
                      Simuler
                    </button>
                  </div>
                  {!notesSimulationValidation.ok ? (
                    <p className="hint">{fr.game.simulationIncomplete}</p>
                  ) : null}
                  {matchingAnswer && matchingAnswer.answer.kind === 'wave' ? (
                    <div
                      className={`simulation-compare${simulationMatches === false ? ' is-mismatch' : ''}`}
                    >
                      <span>
                        Réponse confirmée pour l’entrée {simulation?.entryLabel} : sortie{' '}
                        {matchingAnswer.answer.exit.label},{' '}
                        <ColorChip color={matchingAnswer.answer.color} size="small" />
                      </span>
                      {simulationMatches === false ? (
                        <strong>Votre simulation contredit cette réponse.</strong>
                      ) : (
                        <strong>Simulation cohérente avec le journal.</strong>
                      )}
                    </div>
                  ) : simulation ? (
                    <p className="hint">
                      Aucune réponse confirmée pour l’entrée {simulation.entryLabel}.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </section>

          <aside className="prospection-side">
            <section className="card card--plain action-card">
              <div className="panel-heading">
                <div>
                  <p className="kicker">Proposition</p>
                  <h2>Soumettre la mine</h2>
                </div>
              </div>
              <p>
                Votre proposition doit contenir les cinq gemmes, avec leurs formes, rotations et
                positions exactes.
              </p>
              {!notesStructureValidation.ok ? (
                <p className="hint">{fr.game.submitDisabled}</p>
              ) : null}
              <button
                type="button"
                className="btn btn--primary btn--wide"
                onClick={() => setSubmitOpen(true)}
                disabled={!canSubmitNow || !notesStructureValidation.ok}
              >
                {fr.game.submit}
              </button>
              {game.phase === 'final-turn' ? (
                <p className="callout callout--warning">
                  Dernier tour : une proposition correcte suffit pour l’égalité, une proposition
                  incorrecte fait perdre immédiatement.
                </p>
              ) : null}
              {submitError ? (
                <p className="inline-alert" role="alert">
                  {submitError}
                </p>
              ) : null}
            </section>

            <section className="card card--plain journal-card">
              <div className="panel-heading">
                <div>
                  <p className="kicker">Public</p>
                  <h2>{fr.game.journal}</h2>
                </div>
                <span className="badge badge--soft">{game.scans.length}</span>
              </div>
              <GameJournal
                scans={game.scans}
                role={role}
                opponentName={state.opponentName}
                canRequestConfirmation={canScanNow}
                onRequestConfirmation={(answerId) => {
                  onRequestConfirmation(answerId);
                }}
              />
            </section>

            <section className="card card--plain legend-card">
              <h2>Repères de couleur</h2>
              <p className="hint">
                Une couleur n’est jamais le seul indice : le nom est toujours écrit.
              </p>
              <div className="color-legend">
                {(
                  [
                    'transparent',
                    'red',
                    'yellow',
                    'blue',
                    'white',
                    'orange',
                    'violet',
                    'green',
                    'black',
                    'pink',
                    'light-yellow',
                    'light-blue',
                    'light-orange',
                    'light-violet',
                    'light-green',
                    'gray',
                  ] as RayColor[]
                ).map((color) => (
                  <ColorChip key={color} color={color} size="small" />
                ))}
              </div>
              <h3 className="legend-subtitle">Mélanges</h3>
              <ColorMixLegend />
            </section>
          </aside>
        </div>
      ) : (
        <div className="own-mine-layout">
          <section className="card card--plain board-panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">Privé</p>
                <h2>{fr.game.ownMine}</h2>
              </div>
              <span className="badge badge--success">{fr.game.lockedMine}</span>
            </div>
            <div className="board-frame">
              <Board mine={myMine} ariaLabel="Votre mine secrète verrouillée" showNotes={false} />
            </div>
            <p className="hint">{fr.game.noPeek}</p>
          </section>

          <aside className="own-mine-side">
            <section className="card card--plain">
              <h2>Engagement</h2>
              <p>
                Votre mine est engagée par un SHA-256. À la fin, vous révélerez la mine et le sel ;
                l’adversaire pourra vérifier qu’elle n’a pas changé.
              </p>
              <dl className="meta-list">
                <div>
                  <dt>{fr.game.hash}</dt>
                  <dd>
                    <code>{locked.hash}</code>
                  </dd>
                </div>
                <div>
                  <dt>Engagement adverse</dt>
                  <dd>
                    <code>{state.opponentHash ?? 'En attente'}</code>
                  </dd>
                </div>
              </dl>
            </section>
            <section className="card card--plain">
              <h2>Rappel</h2>
              <ul className="check-list">
                <li>La mine ne peut plus être modifiée.</li>
                <li>Chaque question est répondue sur cet appareil, puis confirmée.</li>
                <li>La trajectoire du rayon reste privée.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}

      {incomingScan ? (
        <Dialog
          open
          title={fr.game.incomingScan}
          onClose={undefined}
          actions={
            <>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  onCancelIncoming();
                }}
              >
                Refuser la demande
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  onAnswer();
                }}
                disabled={
                  !incomingScanResult ||
                  (incomingScanResult.kind === 'wave' &&
                    incomingScanResult.result.status === 'loop')
                }
              >
                {fr.game.confirmAnswer}
              </button>
            </>
          }
        >
          <p className="dialog-question">{questionLabel(incomingScan)}</p>
          {incomingScanResult?.kind === 'wave' ? (
            <>
              <PrivateBoard
                mine={myMine}
                path={incomingScanResult.result.path}
                pathColor={incomingScanResult.result.color}
              />
              <div className="answer-summary">
                <span>{privateRayLabel(incomingScanResult.result)}</span>
                <ColorChip color={incomingScanResult.result.color} />
              </div>
              {incomingScanResult.result.status === 'loop' ? (
                <p className="inline-alert">{fr.game.loopWarning}</p>
              ) : null}
            </>
          ) : incomingScanResult?.kind === 'cell' ? (
            <>
              <PrivateBoard mine={myMine} highlight={incomingScanResult.cell} />
              <div className="answer-summary">
                <span>{fr.game.yourAnswer}</span>
                <ColorChip
                  color={incomingScanResult.result.color}
                  label={incomingScanResult.result.color ?? 'Rien'}
                />
              </div>
            </>
          ) : null}
          <p className="fine-print">
            {fr.game.trajectory} · seul le résultat sera transmis à l’adversaire.
          </p>
        </Dialog>
      ) : null}

      {incomingConfirmation ? (
        <Dialog
          open
          title={fr.game.incomingConfirm}
          actions={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                onConfirmIncoming();
              }}
              disabled={!confirmationQuestion}
            >
              {fr.game.confirmAnswer}
            </button>
          }
        >
          {confirmationQuestion ? (
            <>
              <p className="dialog-question">{questionLabel(confirmationQuestion.original)}</p>
              {confirmationQuestion.kind === 'wave' ? (
                <>
                  <PrivateBoard
                    mine={myMine}
                    path={confirmationQuestion.result.path}
                    pathColor={confirmationQuestion.result.color}
                  />
                  <div className="answer-summary">
                    <span>{privateRayLabel(confirmationQuestion.result)}</span>
                    <ColorChip color={confirmationQuestion.result.color} />
                  </div>
                </>
              ) : (
                <>
                  <PrivateBoard mine={myMine} highlight={confirmationQuestion.cell} />
                  <div className="answer-summary">
                    <ColorChip
                      color={confirmationQuestion.result.color}
                      label={confirmationQuestion.result.color ?? 'Rien'}
                    />
                  </div>
                </>
              )}
              <p className="fine-print">{fr.game.freeConfirmation}</p>
            </>
          ) : (
            <p className="inline-alert">La réponse d’origine est introuvable.</p>
          )}
        </Dialog>
      ) : null}

      {incomingSubmission && incomingSubmissionMine ? (
        <Dialog
          open
          title={fr.game.incomingSubmit}
          tone={incomingSubmissionVerdict?.correct ? 'warning' : 'danger'}
          actions={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                onVerifySubmission();
              }}
            >
              Envoyer le résultat
            </button>
          }
        >
          <p>
            {state.opponentName} propose la mine ci-dessous. Vérifiez-la avant d’envoyer le
            résultat.
          </p>
          <div className="board-frame board-frame--compact">
            <Board mine={incomingSubmissionMine} ariaLabel="Mine proposée par l’adversaire" />
          </div>
          {incomingSubmissionVerdict ? (
            <div
              className={`verdict ${incomingSubmissionVerdict.correct ? 'verdict--ok' : 'verdict--bad'}`}
            >
              {incomingSubmissionVerdict.correct
                ? 'Cette proposition correspond exactement à votre mine.'
                : 'Cette proposition ne correspond pas à votre mine.'}
            </div>
          ) : null}
          <p className="fine-print">
            Un résultat incorrect termine immédiatement la partie. Le résultat est déterministe et
            sera appliqué par les deux clients.
          </p>
        </Dialog>
      ) : null}

      <Dialog
        open={submitOpen}
        title={fr.game.submitTitle}
        tone="warning"
        onClose={() => setSubmitOpen(false)}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setSubmitOpen(false)}>
              {fr.common.cancel}
            </button>
            <button type="button" className="btn btn--danger" onClick={confirmSubmission}>
              {fr.game.submitConfirm}
            </button>
          </>
        }
      >
        <p>{fr.game.submitWarning}</p>
        <div className="board-frame board-frame--compact">
          <Board mine={notes} ariaLabel="Mine candidate avant soumission" />
        </div>
      </Dialog>

      <Dialog
        open={leaveOpen}
        title="Quitter la partie ?"
        tone="warning"
        onClose={() => setLeaveOpen(false)}
        actions={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setLeaveOpen(false)}>
              {fr.common.cancel}
            </button>
            <button type="button" className="btn btn--danger" onClick={onLeave}>
              Quitter
            </button>
          </>
        }
      >
        <p>
          La connexion sera fermée et la sauvegarde de reprise sera effacée. Il faudra créer une
          nouvelle partie pour rejouer.
        </p>
      </Dialog>
    </div>
  );
}
