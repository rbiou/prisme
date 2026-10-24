import { cellLabel, entryForLabel, sideLabel } from '../engine/board';
import { GEM_COLOR_LABELS, RAY_COLOR_LABELS } from '../engine/colors';
import {
  answerScan,
  beginSubmission,
  cancelScan,
  createGame,
  requestConfirmation,
  requestScan,
  resolveConfirmation,
  resolveSubmission,
  type ScanAnswer,
  type ScanRequest,
} from '../engine/endgame';
import type {
  Cell,
  GameState,
  PlayerId,
  ScanRecord,
  SerializedMine,
  SerializedNote,
} from '../engine/types';
import type { NetworkMessage, RevealMarks } from '../net/protocol';
import { PROTOCOL_VERSION } from '../net/protocol';
import type { LobbyContext, ReadyContext, SessionPhase } from '../net/session';
import type { PeerStatus } from '../net/peer';

export interface LockedMine {
  mine: import('../engine/types').Mine;
  salt: string;
  hash: string;
}

export interface RevealRecord {
  mine: SerializedMine;
  salt: string;
  receivedAt: number;
  notes: SerializedNote | null;
  marks: RevealMarks | null;
}

/** Notification éphémère affichée en surimpression de l’écran de partie. */
export interface MatchNotice {
  id: string;
  title: string;
  body: string;
}

export interface MatchState {
  role: PlayerId | null;
  playerName: string;
  roomCode: string | null;
  sessionPhase: SessionPhase;
  sessionDetail: string | null;
  transportStatus: PeerStatus;
  warning: string | null;
  error: string | null;
  notice: MatchNotice | null;
  locked: LockedMine | null;
  starter: PlayerId | null;
  opponentName: string;
  opponentNonce: string | null;
  opponentHash: string | null;
  game: GameState | null;
  reveals: Partial<Record<PlayerId, RevealRecord>>;
  readyAt: number | null;
}

export const initialMatchState: MatchState = {
  role: null,
  playerName: '',
  roomCode: null,
  sessionPhase: 'idle',
  sessionDetail: null,
  transportStatus: 'idle',
  warning: null,
  error: null,
  notice: null,
  locked: null,
  starter: null,
  opponentName: 'Adversaire',
  opponentNonce: null,
  opponentHash: null,
  game: null,
  reveals: {},
  readyAt: null,
};

/** État minimal conservé pour reprendre une partie après une coupure. */
export interface ResumeData {
  role: PlayerId;
  playerName: string;
  roomCode: string;
  sessionPhase: SessionPhase;
  locked: LockedMine | null;
  starter: PlayerId | null;
  opponentName: string;
  opponentNonce: string | null;
  opponentHash: string | null;
  game: GameState | null;
  reveals: Partial<Record<PlayerId, RevealRecord>>;
  readyAt: number | null;
}

export type MatchAction =
  | { type: 'begin'; role: PlayerId; playerName: string }
  | { type: 'hydrate'; data: ResumeData }
  | {
      type: 'adopt';
      game: GameState | null;
      starter: PlayerId | null;
      opponentHash: string | null;
      reveals: Partial<Record<PlayerId, RevealRecord>>;
    }
  | { type: 'merge-reveals'; reveals: Partial<Record<PlayerId, RevealRecord>> }
  | { type: 'reset'; keepName?: boolean }
  | { type: 'phase'; phase: SessionPhase; detail?: string | null }
  | { type: 'transport'; status: PeerStatus; detail?: string | null }
  | { type: 'warning'; message: string }
  | { type: 'clear-warning' }
  | { type: 'error'; message: string }
  | { type: 'clear-error' }
  | { type: 'notice'; notice: MatchNotice }
  | { type: 'clear-notice'; id: string }
  | { type: 'mine-locked'; locked: LockedMine }
  | { type: 'room-code'; code: string }
  | { type: 'lobby'; context: LobbyContext }
  | { type: 'ready'; context: ReadyContext; now: number }
  | { type: 'request-scan'; request: ScanRequest }
  | { type: 'apply-answer'; scanId: string; answer: ScanAnswer; now: number }
  | { type: 'request-confirmation'; request: { id: string; by: PlayerId; answerId: string } }
  | { type: 'apply-confirmation'; answer: ScanAnswer; now: number }
  | {
      type: 'begin-submission';
      submission: { id: string; by: PlayerId; candidate: SerializedMine };
    }
  | { type: 'resolve-submission'; correct: boolean; now: number }
  | { type: 'cancel-incoming'; by: PlayerId }
  | { type: 'reveal'; from: PlayerId; mine: SerializedMine; salt: string; now: number }
  | { type: 'message'; message: NetworkMessage; now: number };

function gameWarning(state: MatchState, message: string | undefined): MatchState {
  return {
    ...state,
    warning: message ?? 'Cette action n’est pas possible dans l’état actuel de la partie.',
  };
}

function applyGameResult(
  state: MatchState,
  result: { ok: boolean; state: GameState; error?: string },
): MatchState {
  if (!result.ok) return gameWarning(state, result.error);
  return { ...state, game: result.state, warning: null };
}

function findOriginal(state: MatchState, answerId: string): ScanRecord | undefined {
  return state.game?.scans.find((scan) => scan.id === answerId);
}

function describeQuestion(question: {
  kind: 'wave' | 'cell';
  entryLabel?: string;
  cell?: Cell;
}): string {
  if (question.kind === 'wave' && question.entryLabel) {
    const entry = entryForLabel(question.entryLabel);
    return `Rayon ${question.entryLabel}${entry ? ` · côté ${sideLabel(entry.side)}` : ''}`;
  }
  if (question.cell) return `Case ${cellLabel(question.cell)}`;
  return 'Votre question';
}

function describeAnswer(answer: ScanAnswer): string {
  if (answer.kind === 'wave') {
    return `sortie ${answer.exit.label} · ${RAY_COLOR_LABELS[answer.color]}`;
  }
  return answer.color ? GEM_COLOR_LABELS[answer.color] : 'aucune gemme';
}

function answerNotice(
  id: string,
  title: string,
  question: string,
  answer: ScanAnswer,
): MatchNotice {
  return { id, title, body: `${question} : ${describeAnswer(answer)}.` };
}

function handleMessage(state: MatchState, message: NetworkMessage, now: number): MatchState {
  if (!state.game) {
    return { ...state, warning: 'Un message de jeu est arrivé avant le démarrage.' };
  }

  switch (message.type) {
    case 'scan': {
      const request: ScanRequest =
        message.kind === 'wave'
          ? {
              id: message.id,
              by: message.from,
              kind: 'wave',
              entry: entryForLabel(message.entry) ?? {
                side: 'top',
                index: 0,
                label: message.entry,
              },
            }
          : {
              id: message.id,
              by: message.from,
              kind: 'cell',
              cell: message.cell,
            };
      return applyGameResult(state, requestScan(state.game, request));
    }
    case 'answer': {
      const answer: ScanAnswer =
        message.kind === 'wave'
          ? {
              kind: 'wave',
              exit: entryForLabel(message.exit) ?? {
                side: 'top',
                index: 0,
                label: message.exit,
              },
              color: message.color,
            }
          : { kind: 'cell', color: message.color };
      const pending = state.game.pendingScan;
      const answered = applyGameResult(state, answerScan(state.game, message.scanId, answer, now));
      if (!answered.game || answered.warning) return answered;
      return {
        ...answered,
        notice: answerNotice(
          message.id,
          'Réponse reçue',
          describeQuestion({
            kind: pending?.kind ?? message.kind,
            entryLabel: pending?.entry?.label,
            cell: pending?.cell,
          }),
          answer,
        ),
      };
    }
    case 'cancel-scan':
      return applyGameResult(state, cancelScan(state.game, message.from));
    case 'confirm-request':
      return applyGameResult(
        state,
        requestConfirmation(state.game, {
          id: message.id,
          by: message.from,
          answerId: message.answerId,
        }),
      );
    case 'confirm-result': {
      if (state.game.pendingConfirmation?.answerId !== message.answerId) {
        return {
          ...state,
          warning: 'Une confirmation ne correspond pas à la demande en attente.',
        };
      }
      const answer: ScanAnswer =
        message.kind === 'wave'
          ? {
              kind: 'wave',
              exit: entryForLabel(message.exit) ?? {
                side: 'top',
                index: 0,
                label: message.exit,
              },
              color: message.color,
            }
          : { kind: 'cell', color: message.color };
      const original = findOriginal(state, message.answerId);
      const resolved = applyGameResult(state, resolveConfirmation(state.game, answer, now));
      if (!resolved.game || resolved.warning || !original) return resolved;
      return {
        ...resolved,
        notice: answerNotice(
          message.id,
          'Confirmation reçue',
          describeQuestion({
            kind: original.kind,
            entryLabel: original.entry?.label,
            cell: original.cell,
          }),
          answer,
        ),
      };
    }
    case 'submit':
      return applyGameResult(
        state,
        beginSubmission(state.game, {
          id: message.id,
          by: message.from,
          candidate: message.candidate,
        }),
      );
    case 'submit-result': {
      if (state.game.pendingSubmission?.id !== message.submissionId) {
        return {
          ...state,
          warning: 'Un résultat de proposition ne correspond pas à la proposition en attente.',
        };
      }
      return applyGameResult(state, resolveSubmission(state.game, message.correct, now));
    }
    case 'reveal': {
      if (state.game.phase !== 'ended') {
        return {
          ...state,
          warning: 'Une révélation a été ignorée : la partie n’est pas terminée.',
        };
      }
      const existing = state.reveals[message.from];
      if (existing) {
        const same =
          JSON.stringify(existing.mine) === JSON.stringify(message.mine) &&
          existing.salt === message.salt;
        if (same) {
          if ((existing.notes || !message.notes) && (existing.marks || !message.marks))
            return state;
          return {
            ...state,
            reveals: {
              ...state.reveals,
              [message.from]: {
                ...existing,
                notes: existing.notes ?? message.notes ?? null,
                marks: existing.marks ?? message.marks ?? null,
              },
            },
          };
        }
        return {
          ...state,
          warning: 'Une seconde révélation différente a été ignorée.',
        };
      }
      return {
        ...state,
        reveals: {
          ...state.reveals,
          [message.from]: {
            mine: message.mine,
            salt: message.salt,
            receivedAt: now,
            notes: message.notes ?? null,
            marks: message.marks ?? null,
          },
        },
      };
    }
    case 'ping':
    case 'pong':
      return state;
    case 'hello':
    case 'commit':
    case 'lobby-start':
    case 'start':
      return state;
    default:
      return state;
  }
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'begin':
      return {
        ...initialMatchState,
        role: action.role,
        playerName: action.playerName,
      };
    case 'hydrate':
      return {
        ...initialMatchState,
        role: action.data.role,
        playerName: action.data.playerName,
        roomCode: action.data.roomCode,
        sessionPhase: 'reconnecting',
        sessionDetail: 'Reprise de la partie…',
        transportStatus: 'opening',
        locked: action.data.locked,
        starter: action.data.starter,
        opponentName: action.data.opponentName || 'Adversaire',
        opponentNonce: action.data.opponentNonce,
        opponentHash: action.data.opponentHash,
        game: action.data.game,
        reveals: action.data.reveals,
        readyAt: action.data.readyAt,
      };
    case 'adopt':
      return {
        ...state,
        game: action.game ?? state.game,
        starter: action.starter ?? state.starter,
        opponentHash: action.opponentHash ?? state.opponentHash,
        reveals: { ...state.reveals, ...action.reveals },
        sessionPhase: 'ready',
        sessionDetail: null,
        warning: null,
      };
    case 'merge-reveals':
      return {
        ...state,
        reveals: { ...state.reveals, ...action.reveals },
      };
    case 'reset':
      return {
        ...initialMatchState,
        playerName: action.keepName === false ? '' : state.playerName,
      };
    case 'phase':
      return {
        ...state,
        sessionPhase: action.phase,
        sessionDetail: action.detail ?? null,
      };
    case 'transport':
      return {
        ...state,
        transportStatus: action.status,
        sessionDetail: action.detail ?? state.sessionDetail,
      };
    case 'warning':
      return { ...state, warning: action.message };
    case 'clear-warning':
      return { ...state, warning: null };
    case 'error':
      return { ...state, error: action.message };
    case 'clear-error':
      return { ...state, error: null };
    case 'notice':
      return { ...state, notice: action.notice };
    case 'clear-notice':
      if (state.notice?.id !== action.id) return state;
      return { ...state, notice: null };
    case 'mine-locked':
      return { ...state, locked: action.locked };
    case 'room-code':
      return { ...state, roomCode: action.code };
    case 'lobby':
      return {
        ...state,
        opponentName: action.context.remoteName || 'Adversaire',
        opponentNonce: action.context.remoteNonce,
        warning: null,
        error: null,
      };
    case 'ready':
      if (state.game) return state;
      return {
        ...state,
        starter: action.context.starter,
        opponentName: action.context.remoteName || 'Adversaire',
        opponentNonce: action.context.remoteNonce,
        opponentHash: action.context.remoteMineHash,
        game: createGame(action.context.starter),
        sessionPhase: 'ready',
        sessionDetail: null,
        readyAt: action.now,
      };
    case 'request-scan':
      if (!state.game) return state;
      return applyGameResult(state, requestScan(state.game, action.request));
    case 'apply-answer':
      if (!state.game) return state;
      return applyGameResult(
        state,
        answerScan(state.game, action.scanId, action.answer, action.now),
      );
    case 'request-confirmation':
      if (!state.game) return state;
      return applyGameResult(state, requestConfirmation(state.game, action.request));
    case 'apply-confirmation':
      if (!state.game) return state;
      return applyGameResult(state, resolveConfirmation(state.game, action.answer, action.now));
    case 'begin-submission':
      if (!state.game) return state;
      return applyGameResult(state, beginSubmission(state.game, action.submission));
    case 'resolve-submission':
      if (!state.game) return state;
      return applyGameResult(state, resolveSubmission(state.game, action.correct, action.now));
    case 'cancel-incoming':
      if (!state.game) return state;
      return applyGameResult(state, cancelScan(state.game, action.by));
    case 'reveal':
      return handleMessage(
        state,
        {
          protocol: PROTOCOL_VERSION,
          type: 'reveal',
          id: `local-reveal-${action.from}`,
          from: action.from,
          mine: action.mine,
          salt: action.salt,
        },
        action.now,
      );
    case 'message':
      return handleMessage(state, action.message, action.now);
    default:
      return state;
  }
}

export function findAnswerForConfirmation(
  state: MatchState,
  answerId: string | undefined,
): ScanRecord | undefined {
  if (!answerId) return undefined;
  return findOriginal(state, answerId);
}
