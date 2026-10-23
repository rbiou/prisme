import { entryForLabel } from '../engine/board';
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
import type { GameState, PlayerId, ScanRecord, SerializedMine } from '../engine/types';
import type { NetworkMessage } from '../net/protocol';
import type { SessionPhase } from '../net/session';
import type { PeerStatus } from '../net/peer';
import type { ReadyContext } from '../net/session';

export interface LockedMine {
  mine: import('../engine/types').Mine;
  salt: string;
  hash: string;
}

export interface RevealRecord {
  mine: SerializedMine;
  salt: string;
  receivedAt: number;
}

export interface MatchState {
  role: PlayerId | null;
  playerName: string;
  inviteCode: string | null;
  sessionPhase: SessionPhase;
  sessionDetail: string | null;
  transportStatus: PeerStatus;
  warning: string | null;
  error: string | null;
  locked: LockedMine | null;
  offerCode: string | null;
  answerCode: string | null;
  starter: PlayerId | null;
  opponentName: string;
  opponentHash: string | null;
  game: GameState | null;
  reveals: Partial<Record<PlayerId, RevealRecord>>;
  readyAt: number | null;
}

export const initialMatchState: MatchState = {
  role: null,
  playerName: '',
  inviteCode: null,
  sessionPhase: 'idle',
  sessionDetail: null,
  transportStatus: 'idle',
  warning: null,
  error: null,
  locked: null,
  offerCode: null,
  answerCode: null,
  starter: null,
  opponentName: 'Adversaire',
  opponentHash: null,
  game: null,
  reveals: {},
  readyAt: null,
};

export type MatchAction =
  | { type: 'begin'; role: PlayerId; playerName: string; inviteCode?: string | null }
  | { type: 'reset'; keepName?: boolean }
  | { type: 'phase'; phase: SessionPhase; detail?: string | null }
  | { type: 'transport'; status: PeerStatus; detail?: string | null }
  | { type: 'warning'; message: string }
  | { type: 'clear-warning' }
  | { type: 'error'; message: string }
  | { type: 'clear-error' }
  | { type: 'mine-locked'; locked: LockedMine }
  | { type: 'offer-code'; code: string }
  | { type: 'answer-code'; code: string }
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
      return applyGameResult(state, answerScan(state.game, message.scanId, answer, now));
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
      return applyGameResult(state, resolveConfirmation(state.game, answer, now));
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
        return same
          ? state
          : {
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
          },
        },
      };
    }
    case 'ping':
    case 'pong':
      return state;
    case 'hello':
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
        inviteCode: action.inviteCode ?? null,
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
    case 'mine-locked':
      return { ...state, locked: action.locked };
    case 'offer-code':
      return { ...state, offerCode: action.code };
    case 'answer-code':
      return { ...state, answerCode: action.code };
    case 'ready':
      if (state.game) return state;
      return {
        ...state,
        starter: action.context.starter,
        opponentName: action.context.remoteName || 'Adversaire',
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
          protocol: 1,
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
