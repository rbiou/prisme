import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { entryForLabel, isCell } from '../engine/board';
import { scanCell } from '../engine/cellScan';
import { isColorMark } from '../engine/colorMarks';
import { canScan, canSubmit, otherPlayer, type ScanAnswer } from '../engine/endgame';
import { checkSolution, deserializeMine, isSerializedNote, serializeMine } from '../engine/mine';
import { isNoteEdgeMark } from '../engine/noteEdges';
import { simulateRay } from '../engine/ray';
import { validateMine } from '../engine/placement';
import type {
  Cell,
  GameState,
  Mine,
  PlayerId,
  SerializedMine,
  SerializedNote,
} from '../engine/types';
import { createCommitment, randomHex } from '../net/integrity';
import {
  newMessageId,
  PROTOCOL_VERSION,
  type NetworkMessage,
  type RevealMarks,
  type SyncMessage,
} from '../net/protocol';
import { normalizeRoomCode } from '../net/roomCode';
import { MatchSession, type ReadyContext, type SessionPhase } from '../net/session';
import type { Settings } from './settings';
import {
  initialMatchState,
  matchReducer,
  type MatchState,
  type ResumeData,
  type RevealRecord,
} from './matchReducer';
import { clearResume, loadResume, saveResume, type StoredResume } from './resume';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export type ResumeTarget = 'game' | 'placement' | 'lobby';

export interface UseMatchResult {
  state: MatchState;
  resumable: boolean;
  resumeTarget: ResumeTarget;
  resumeGame: () => Promise<ActionResult>;
  hostGame: (playerName: string) => Promise<ActionResult>;
  joinGame: (playerName: string, code: string) => Promise<ActionResult>;
  startPlacement: () => boolean;
  resetMatch: (keepName?: boolean) => void;
  lockMine: (mine: Mine) => Promise<ActionResult>;
  sendWave: (label: string) => boolean;
  sendCell: (cell: Cell) => boolean;
  answerIncoming: () => boolean;
  cancelIncoming: () => boolean;
  confirmIncoming: () => boolean;
  requestConfirmationOf: (answerId: string) => boolean;
  verifyIncomingSubmission: () => boolean;
  submitCandidate: (candidate: SerializedMine) => boolean;
  clearWarning: () => void;
  clearError: () => void;
  clearNotice: () => void;
}

const DRAFT_KEY = 'prisme:mine-draft';

function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Le stockage de session est facultatif.
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

function publicRound(game: GameState | null): number {
  if (!game) return 0;
  return game.scans.length + game.submissions.length + (game.phase === 'ended' ? 1000 : 0);
}

function hasPendingAction(game: GameState | null): boolean {
  return Boolean(game?.pendingScan || game?.pendingConfirmation || game?.pendingSubmission);
}

function readJsonArray(key: string): unknown[] {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Croix, arêtes et ronds restent privés jusqu’à la révélation finale. */
function readMarksForReveal(readyAt: number | null): RevealMarks | null {
  if (readyAt === null) return null;
  const crosses = readJsonArray(`prisme:crosses:${readyAt}`).filter(
    (value): value is Cell =>
      typeof value === 'object' && value !== null && isCell(value as { col: number; row: number }),
  );
  const edges = readJsonArray(`prisme:edges:${readyAt}`).filter(isNoteEdgeMark);
  const colors = readJsonArray(`prisme:dots:${readyAt}`).filter(isColorMark);
  if (crosses.length === 0 && edges.length === 0 && colors.length === 0) return null;
  return { crosses, edges, colors };
}

/** Les notes finales sont conservées localement par l’écran de partie. */
function readNotesForReveal(readyAt: number | null): SerializedNote | null {
  if (readyAt === null) return null;
  try {
    const raw = window.sessionStorage.getItem(`prisme:notes:${readyAt}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSerializedNote(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function scanSignature(scan: GameState['scans'][number]): string {
  return JSON.stringify({
    id: scan.id,
    by: scan.by,
    kind: scan.kind,
    entry: scan.entry,
    cell: scan.cell,
    answer: scan.answer,
    confirmationOf: scan.confirmationOf,
  });
}

function submissionSignature(submission: GameState['submissions'][number]): string {
  return JSON.stringify({
    id: submission.id,
    by: submission.by,
    candidate: submission.candidate,
    correct: submission.correct,
  });
}

/** L’état distant doit contenir tout l’historique déjà connu localement. */
function historyCompatible(remote: GameState | null, local: GameState | null): boolean {
  if (!local) return true;
  if (!remote) return false;
  const remoteScans = new Map(remote.scans.map((scan) => [scan.id, scanSignature(scan)]));
  for (const scan of local.scans) {
    if (remoteScans.get(scan.id) !== scanSignature(scan)) return false;
  }
  const remoteSubmissions = new Map(
    remote.submissions.map((submission) => [submission.id, submissionSignature(submission)]),
  );
  for (const submission of local.submissions) {
    if (remoteSubmissions.get(submission.id) !== submissionSignature(submission)) return false;
  }
  return true;
}

function targetForResume(stored: StoredResume): ResumeTarget {
  if (stored.game && stored.locked) return 'game';
  if (
    stored.locked ||
    stored.sessionPhase === 'placing' ||
    stored.sessionPhase === 'awaiting-opponent'
  ) {
    return 'placement';
  }
  return 'lobby';
}

function snapshotFromState(
  state: MatchState,
  nonce: string,
  sessionPhase: SessionPhase,
): StoredResume | null {
  if (!state.role || !state.roomCode) return null;
  return {
    version: 1,
    savedAt: Date.now(),
    role: state.role,
    playerName: state.playerName,
    roomCode: state.roomCode,
    nonce,
    sessionPhase,
    locked: state.locked
      ? {
          mine: serializeMine(state.locked.mine),
          salt: state.locked.salt,
          hash: state.locked.hash,
        }
      : null,
    starter: state.starter,
    opponentName: state.opponentName,
    opponentNonce: state.opponentNonce,
    opponentHash: state.opponentHash,
    game: state.game,
    reveals: Object.entries(state.reveals).flatMap(([from, reveal]) =>
      reveal
        ? [
            {
              from: from as PlayerId,
              mine: reveal.mine,
              salt: reveal.salt,
              receivedAt: reveal.receivedAt,
              notes: reveal.notes,
              marks: reveal.marks,
            },
          ]
        : [],
    ),
    readyAt: state.readyAt,
  };
}

export function useMatch(settings: Settings): UseMatchResult {
  const [state, dispatch] = useReducer(matchReducer, initialMatchState);
  const sessionRef = useRef<MatchSession | null>(null);
  const revealSentRef = useRef(false);
  const lockingRef = useRef(false);
  const lastSeenRef = useRef(0);
  const stateRef = useRef(state);
  const nonceRef = useRef<string | null>(null);
  const [initialResume] = useState<StoredResume | null>(() => loadResume());
  const lastPhaseRef = useRef<SessionPhase>(initialResume?.sessionPhase ?? 'lobby');
  const resumeRef = useRef<StoredResume | null>(initialResume);
  const [resumable, setResumable] = useState(() => Boolean(initialResume));

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const closeSession = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    try {
      session.close();
    } catch {
      // La fermeture est au mieux.
    }
  }, []);

  const resetMatch = useCallback(
    (keepName = true) => {
      closeSession();
      revealSentRef.current = false;
      clearDraft();
      clearResume();
      resumeRef.current = null;
      setResumable(false);
      dispatch({ type: 'reset', keepName });
    },
    [closeSession],
  );

  const sendSyncState = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    const current = stateRef.current;
    const reveals = Object.entries(current.reveals).flatMap(([from, reveal]) =>
      reveal
        ? [
            {
              from: from as PlayerId,
              mine: reveal.mine,
              salt: reveal.salt,
              notes: reveal.notes,
              marks: reveal.marks,
            },
          ]
        : [],
    );
    if (current.role && current.locked && current.game?.phase === 'ended') {
      reveals.push({
        from: current.role,
        mine: serializeMine(current.locked.mine),
        salt: current.locked.salt,
        notes: readNotesForReveal(current.readyAt),
        marks: readMarksForReveal(current.readyAt),
      });
    }
    session.sendSync({
      round: publicRound(current.game),
      mineHash: current.locked?.hash ?? null,
      starter: current.starter,
      game: current.game,
      reveals,
    });
  }, []);

  const createSession = useCallback(
    (role: PlayerId, name: string, nonce: string = randomHex(16)): MatchSession => {
      nonceRef.current = nonce;
      let session: MatchSession | null = null;
      session = new MatchSession(
        role,
        { name, nonce },
        {
          onPhase: (phase, detail) => {
            dispatch({ type: 'phase', phase, detail: detail ?? null });
          },
          onTransportStatus: (status, detail) => {
            dispatch({ type: 'transport', status, detail: detail ?? null });
          },
          onLobby: (context) => {
            lastSeenRef.current = Date.now();
            dispatch({ type: 'lobby', context });
          },
          onMessage: (message) => {
            lastSeenRef.current = Date.now();
            if (message.type === 'ping') {
              session?.send({
                protocol: PROTOCOL_VERSION,
                type: 'pong',
                id: newMessageId(),
                from: role,
                replyTo: message.id,
              });
            }
            if (message.type === 'ping' || message.type === 'pong') return;
            dispatch({ type: 'message', message, now: Date.now() });
          },
          onReady: (context: ReadyContext) => {
            revealSentRef.current = false;
            lastSeenRef.current = Date.now();
            dispatch({ type: 'ready', context, now: Date.now() });
          },
          onWarning: (message) => dispatch({ type: 'warning', message }),
          onError: (message) => dispatch({ type: 'error', message }),
          onTransportReady: () => {
            sendSyncState();
            if (stateRef.current.game || stateRef.current.locked) {
              dispatch({
                type: 'notice',
                notice: {
                  id: `reconnect-${Date.now()}`,
                  title: 'Connexion rétablie',
                  body: 'La partie reprend là où elle s’était arrêtée.',
                },
              });
            }
          },
          onSync: (message: SyncMessage) => {
            lastSeenRef.current = Date.now();
            const current = stateRef.current;
            const localRound = publicRound(current.game);
            const remoteIsAhead = message.round > localRound;
            const pendingMismatch =
              message.round === localRound &&
              hasPendingAction(current.game) !== hasPendingAction(message.game);
            const reveals: Partial<Record<PlayerId, RevealRecord>> = {};
            for (const reveal of message.reveals) {
              reveals[reveal.from] = {
                mine: reveal.mine,
                salt: reveal.salt,
                receivedAt: Date.now(),
                notes: reveal.notes ?? null,
                marks: reveal.marks ?? null,
              };
            }
            const shouldAdopt =
              (remoteIsAhead || pendingMismatch) && historyCompatible(message.game, current.game);
            if (shouldAdopt) {
              dispatch({
                type: 'adopt',
                game: message.game,
                starter: message.starter,
                opponentHash: message.mineHash,
                reveals,
              });
              dispatch({
                type: 'notice',
                notice: {
                  id: `sync-${message.id}`,
                  title: 'Partie resynchronisée',
                  body: 'L’état de la partie a été rétabli.',
                },
              });
              return;
            }
            if (Object.keys(reveals).length > 0) {
              dispatch({ type: 'merge-reveals', reveals });
            }
          },
        },
      );
      return session;
    },
    [sendSyncState],
  );

  const hostGame = useCallback(
    async (playerName: string): Promise<ActionResult> => {
      closeSession();
      revealSentRef.current = false;
      clearDraft();
      clearResume();
      resumeRef.current = null;
      setResumable(false);
      const name = playerName.trim() || 'Joueur';
      dispatch({ type: 'begin', role: 'host', playerName: name });
      const session = createSession('host', name);
      sessionRef.current = session;
      try {
        const code = await session.host();
        dispatch({ type: 'room-code', code });
        return { ok: true };
      } catch (error) {
        const message = messageFor(error);
        dispatch({ type: 'error', message });
        return { ok: false, error: message };
      }
    },
    [closeSession, createSession],
  );

  const joinGame = useCallback(
    async (playerName: string, code: string): Promise<ActionResult> => {
      const normalized = normalizeRoomCode(code);
      if (!normalized) {
        const message = 'Entrez un code de partie à six chiffres.';
        dispatch({ type: 'error', message });
        return { ok: false, error: message };
      }
      closeSession();
      revealSentRef.current = false;
      clearDraft();
      clearResume();
      resumeRef.current = null;
      setResumable(false);
      const name = playerName.trim() || 'Joueur';
      dispatch({ type: 'begin', role: 'guest', playerName: name });
      dispatch({ type: 'room-code', code: normalized });
      const session = createSession('guest', name);
      sessionRef.current = session;
      try {
        await session.join(normalized);
        return { ok: true };
      } catch (error) {
        const message = messageFor(error);
        dispatch({ type: 'error', message });
        return { ok: false, error: message };
      }
    },
    [closeSession, createSession],
  );

  const resumeGame = useCallback(async (): Promise<ActionResult> => {
    const current = stateRef.current;
    const currentSnapshot = nonceRef.current
      ? snapshotFromState(current, nonceRef.current, lastPhaseRef.current)
      : null;
    const stored = currentSnapshot ?? resumeRef.current ?? loadResume();
    if (!stored) {
      const message = 'Aucune partie à reprendre.';
      dispatch({ type: 'error', message });
      return { ok: false, error: message };
    }
    closeSession();
    revealSentRef.current = false;
    const locked = stored.locked
      ? {
          mine: deserializeMine(stored.locked.mine),
          salt: stored.locked.salt,
          hash: stored.locked.hash,
        }
      : null;
    const reveals: Partial<Record<PlayerId, RevealRecord>> = {};
    for (const reveal of stored.reveals) {
      reveals[reveal.from] = {
        mine: reveal.mine,
        salt: reveal.salt,
        receivedAt: reveal.receivedAt,
        notes: reveal.notes ?? null,
        marks: reveal.marks ?? null,
      };
    }
    const data: ResumeData = {
      role: stored.role,
      playerName: stored.playerName,
      roomCode: stored.roomCode,
      sessionPhase: stored.sessionPhase,
      locked,
      starter: stored.starter,
      opponentName: stored.opponentName,
      opponentNonce: stored.opponentNonce,
      opponentHash: stored.opponentHash,
      game: stored.game,
      reveals,
      readyAt: stored.readyAt,
    };
    stateRef.current = matchReducer(initialMatchState, { type: 'hydrate', data });
    dispatch({ type: 'hydrate', data });
    const session = createSession(stored.role, stored.playerName, stored.nonce);
    sessionRef.current = session;
    resumeRef.current = stored;
    lastSeenRef.current = Date.now();
    try {
      const restorePhase: SessionPhase = stored.game ? 'ready' : stored.sessionPhase;
      await session.resume(stored.roomCode, restorePhase, locked?.hash ?? null);
      return { ok: true };
    } catch (error) {
      const message = messageFor(error);
      dispatch({ type: 'error', message });
      return { ok: false, error: message };
    }
  }, [closeSession, createSession]);

  const startPlacement = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return false;
    return session.beginPlacement();
  }, []);

  useEffect(() => () => closeSession(), [closeSession]);

  const lockMine = useCallback(
    async (mine: Mine): Promise<ActionResult> => {
      const current = stateRef.current;
      const role = current.role;
      const session = sessionRef.current;
      if (!role || !session) {
        return { ok: false, error: 'Choisissez d’abord de créer ou de rejoindre une partie.' };
      }
      if (current.locked) return { ok: true };
      if (lockingRef.current) {
        return { ok: false, error: 'Le verrouillage est déjà en cours.' };
      }
      if (current.sessionPhase !== 'placing' && current.sessionPhase !== 'awaiting-opponent') {
        return { ok: false, error: 'La partie n’a pas encore été lancée par l’hôte.' };
      }
      const validation = validateMine(mine, {
        enforceWhiteSymmetry: settings.enforceWhiteSymmetry,
      });
      if (!validation.ok) {
        return {
          ok: false,
          error: validation.errors[0]?.message ?? 'La mine n’est pas valide.',
        };
      }

      lockingRef.current = true;
      dispatch({ type: 'clear-error' });
      try {
        const commitment = await createCommitment(mine);
        if (!session.commitMine(commitment.hash)) {
          throw new Error('L’engagement de mine n’a pas pu être envoyé. Vérifiez la connexion.');
        }
        dispatch({
          type: 'mine-locked',
          locked: { mine, salt: commitment.salt, hash: commitment.hash },
        });
        clearDraft();
        return { ok: true };
      } catch (error) {
        const message = messageFor(error);
        dispatch({ type: 'error', message });
        return { ok: false, error: message };
      } finally {
        lockingRef.current = false;
      }
    },
    [settings.enforceWhiteSymmetry],
  );

  const sendScan = useCallback(
    (
      request:
        { id: string; kind: 'wave'; entry: string } | { id: string; kind: 'cell'; cell: Cell },
    ): boolean => {
      const current = stateRef.current;
      const role = current.role;
      const game = current.game;
      const session = sessionRef.current;
      if (!role || !game || !session) return false;
      if (!canScan(game, role)) {
        dispatch({ type: 'warning', message: 'Ce n’est pas le moment de sonder.' });
        return false;
      }

      const message: NetworkMessage =
        request.kind === 'wave'
          ? {
              protocol: PROTOCOL_VERSION,
              type: 'scan',
              id: request.id,
              from: role,
              kind: 'wave',
              entry: request.entry,
            }
          : {
              protocol: PROTOCOL_VERSION,
              type: 'scan',
              id: request.id,
              from: role,
              kind: 'cell',
              cell: request.cell,
            };

      if (!session.send(message)) {
        dispatch({
          type: 'error',
          message: 'Le scan n’a pas pu être envoyé : la connexion est fermée.',
        });
        return false;
      }

      if (request.kind === 'wave') {
        const entry = resolveEntry(request.entry);
        if (!entry) {
          dispatch({ type: 'warning', message: 'Cette entrée de rayon est inconnue.' });
          return false;
        }
        dispatch({
          type: 'request-scan',
          request: { id: request.id, by: role, kind: 'wave', entry },
        });
      } else {
        dispatch({
          type: 'request-scan',
          request: { id: request.id, by: role, kind: 'cell', cell: request.cell },
        });
      }
      return true;
    },
    [],
  );

  const sendWave = useCallback(
    (label: string): boolean => {
      const entry = resolveEntry(label);
      if (!entry) {
        dispatch({ type: 'warning', message: 'Cette entrée de rayon est inconnue.' });
        return false;
      }
      return sendScan({ id: newMessageId(), kind: 'wave', entry: label });
    },
    [sendScan],
  );

  const sendCell = useCallback(
    (cell: Cell): boolean => sendScan({ id: newMessageId(), kind: 'cell', cell }),
    [sendScan],
  );

  const answerIncoming = useCallback((): boolean => {
    const current = stateRef.current;
    const game = current.game;
    const role = current.role;
    const mine = current.locked?.mine;
    const session = sessionRef.current;
    const pending = game?.pendingScan;
    if (!game || !role || !mine || !session || !pending) return false;
    if (pending.by === role) return false;

    let answer: ScanAnswer;
    if (pending.kind === 'wave' && pending.entry) {
      const result = simulateRay(mine, pending.entry);
      if (!result.exit) {
        dispatch({
          type: 'error',
          message: 'Cette mine produit une boucle de rayon : répondez impossible.',
        });
        return false;
      }
      answer = { kind: 'wave', exit: result.exit, color: result.color };
    } else if (pending.kind === 'cell' && pending.cell) {
      const result = scanCell(mine, pending.cell);
      answer = { kind: 'cell', color: result.color };
    } else {
      return false;
    }

    const message: NetworkMessage =
      answer.kind === 'wave'
        ? {
            protocol: PROTOCOL_VERSION,
            type: 'answer',
            id: newMessageId(),
            from: role,
            scanId: pending.id,
            kind: 'wave',
            exit: answer.exit.label,
            color: answer.color,
          }
        : {
            protocol: PROTOCOL_VERSION,
            type: 'answer',
            id: newMessageId(),
            from: role,
            scanId: pending.id,
            kind: 'cell',
            color: answer.color,
          };

    if (!session.send(message)) {
      dispatch({ type: 'error', message: 'La réponse n’a pas pu être envoyée.' });
      return false;
    }
    dispatch({ type: 'apply-answer', scanId: pending.id, answer, now: Date.now() });
    return true;
  }, []);

  const cancelIncoming = useCallback((): boolean => {
    const current = stateRef.current;
    const pending = current.game?.pendingScan;
    const role = current.role;
    const session = sessionRef.current;
    if (!pending || !role || !session || pending.by === role) return false;
    const message: NetworkMessage = {
      protocol: PROTOCOL_VERSION,
      type: 'cancel-scan',
      id: newMessageId(),
      from: role,
      scanId: pending.id,
    };
    if (!session.send(message)) {
      dispatch({ type: 'error', message: 'L’annulation n’a pas pu être envoyée.' });
      return false;
    }
    dispatch({ type: 'cancel-incoming', by: role });
    return true;
  }, []);

  const confirmIncoming = useCallback((): boolean => {
    const current = stateRef.current;
    const game = current.game;
    const role = current.role;
    const mine = current.locked?.mine;
    const session = sessionRef.current;
    const pending = game?.pendingConfirmation;
    if (!game || !role || !mine || !session || !pending) return false;
    if (pending.by === role) return false;
    const original = game.scans.find((scan) => scan.id === pending.answerId);
    if (!original) {
      dispatch({ type: 'error', message: 'La réponse à confirmer est introuvable.' });
      return false;
    }

    let answer: ScanAnswer;
    if (original.kind === 'wave' && original.entry) {
      const result = simulateRay(mine, original.entry);
      if (!result.exit) {
        dispatch({
          type: 'error',
          message: 'Cette mine produit une boucle de rayon : confirmation impossible.',
        });
        return false;
      }
      answer = { kind: 'wave', exit: result.exit, color: result.color };
    } else if (original.kind === 'cell' && original.cell) {
      answer = { kind: 'cell', color: scanCell(mine, original.cell).color };
    } else {
      return false;
    }

    const message: NetworkMessage =
      answer.kind === 'wave'
        ? {
            protocol: PROTOCOL_VERSION,
            type: 'confirm-result',
            id: newMessageId(),
            from: role,
            answerId: original.id,
            kind: 'wave',
            exit: answer.exit.label,
            color: answer.color,
          }
        : {
            protocol: PROTOCOL_VERSION,
            type: 'confirm-result',
            id: newMessageId(),
            from: role,
            answerId: original.id,
            kind: 'cell',
            color: answer.color,
          };

    if (!session.send(message)) {
      dispatch({ type: 'error', message: 'La confirmation n’a pas pu être envoyée.' });
      return false;
    }
    dispatch({ type: 'apply-confirmation', answer, now: Date.now() });
    return true;
  }, []);

  const requestConfirmationOf = useCallback((answerId: string): boolean => {
    const current = stateRef.current;
    const game = current.game;
    const role = current.role;
    const session = sessionRef.current;
    if (!game || !role || !session) return false;
    if (!canScan(game, role)) {
      dispatch({
        type: 'warning',
        message: 'La confirmation gratuite doit être demandée pendant votre tour.',
      });
      return false;
    }
    const original = game.scans.find((scan) => scan.id === answerId);
    if (!original || original.by !== role) {
      dispatch({
        type: 'warning',
        message: 'Vous ne pouvez confirmer que les réponses à vos propres questions.',
      });
      return false;
    }
    const message: NetworkMessage = {
      protocol: PROTOCOL_VERSION,
      type: 'confirm-request',
      id: newMessageId(),
      from: role,
      answerId,
    };
    if (!session.send(message)) {
      dispatch({ type: 'error', message: 'La demande de confirmation n’a pas pu être envoyée.' });
      return false;
    }
    dispatch({
      type: 'request-confirmation',
      request: { id: message.id, by: role, answerId },
    });
    return true;
  }, []);

  const verifyIncomingSubmission = useCallback((): boolean => {
    const current = stateRef.current;
    const game = current.game;
    const role = current.role;
    const mine = current.locked?.mine;
    const session = sessionRef.current;
    const pending = current.game?.pendingSubmission;
    if (!game || !role || !mine || !session || !pending) return false;
    if (pending.by === role) return false;

    const correct = checkSolution(pending.candidate, mine).correct;
    const message: NetworkMessage = {
      protocol: PROTOCOL_VERSION,
      type: 'submit-result',
      id: newMessageId(),
      from: role,
      submissionId: pending.id,
      correct,
    };
    if (!session.send(message)) {
      dispatch({ type: 'error', message: 'Le résultat de la proposition n’a pas pu être envoyé.' });
      return false;
    }
    dispatch({ type: 'resolve-submission', correct, now: Date.now() });
    return true;
  }, []);

  const submitCandidate = useCallback((candidate: SerializedMine): boolean => {
    const current = stateRef.current;
    const game = current.game;
    const role = current.role;
    const session = sessionRef.current;
    if (!game || !role || !session) return false;
    if (!canSubmit(game, role)) {
      dispatch({
        type: 'warning',
        message: 'Une proposition ne peut pas être soumise maintenant.',
      });
      return false;
    }
    const id = newMessageId();
    const message: NetworkMessage = {
      protocol: PROTOCOL_VERSION,
      type: 'submit',
      id,
      from: role,
      candidate,
    };
    if (!session.send(message)) {
      dispatch({ type: 'error', message: 'La proposition n’a pas pu être envoyée.' });
      return false;
    }
    dispatch({
      type: 'begin-submission',
      submission: { id, by: role, candidate },
    });
    return true;
  }, []);

  const clearWarning = useCallback(() => dispatch({ type: 'clear-warning' }), []);
  const clearError = useCallback(() => dispatch({ type: 'clear-error' }), []);
  const clearNotice = useCallback(() => {
    const notice = stateRef.current.notice;
    if (!notice) return;
    dispatch({ type: 'clear-notice', id: notice.id });
  }, []);

  // Les notifications de réponse disparaissent seules, sans bloquer le jeu.
  useEffect(() => {
    const notice = state.notice;
    if (!notice) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'clear-notice', id: notice.id });
    }, 9_000);
    return () => window.clearTimeout(timer);
  }, [state.notice]);

  // Révélation automatique à la fin, avec quelques tentatives si le canal
  // n'est pas encore prêt.
  useEffect(() => {
    if (state.game?.phase !== 'ended' || !state.locked) return;
    const locked = state.locked;
    const role = state.role;
    if (!role) return;
    revealSentRef.current = false;
    let attempts = 0;
    let cancelled = false;

    const tryReveal = () => {
      if (cancelled || revealSentRef.current) return;
      const session = sessionRef.current;
      if (!session || attempts >= 20) return;
      attempts += 1;
      const message: NetworkMessage = {
        protocol: PROTOCOL_VERSION,
        type: 'reveal',
        id: newMessageId(),
        from: role,
        mine: serializeMine(locked.mine),
        salt: locked.salt,
        notes: readNotesForReveal(state.readyAt),
        marks: readMarksForReveal(state.readyAt),
      };
      if (session.send(message)) {
        revealSentRef.current = true;
      }
    };

    tryReveal();
    const timer = window.setInterval(tryReveal, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state.game?.phase, state.locked, state.readyAt, state.role]);

  // Sauvegarde locale pour reprendre après une fermeture de l’application.
  useEffect(() => {
    const { role, roomCode, sessionPhase } = state;
    if (!role || !roomCode || !nonceRef.current) return;
    if (sessionPhase === 'failed' || sessionPhase === 'closed') return;
    if (state.game?.phase === 'ended') {
      clearResume();
      resumeRef.current = null;
      return;
    }
    if (sessionPhase !== 'reconnecting') lastPhaseRef.current = sessionPhase;
    const allowed: SessionPhase[] = [
      'lobby',
      'placing',
      'awaiting-opponent',
      'ready',
      'reconnecting',
    ];
    if (!allowed.includes(sessionPhase)) return;
    const stored = snapshotFromState(state, nonceRef.current, lastPhaseRef.current);
    if (!stored) return;
    saveResume(stored);
    resumeRef.current = stored;
  }, [state]);

  // Battement de cœur : ping périodique et reprise après un silence prolongé.
  useEffect(() => {
    const role = state.role;
    if (!role) return;
    if (
      state.sessionPhase !== 'lobby' &&
      state.sessionPhase !== 'placing' &&
      state.sessionPhase !== 'awaiting-opponent' &&
      state.sessionPhase !== 'ready'
    ) {
      return;
    }
    lastSeenRef.current = Date.now();
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      if (Date.now() - lastSeenRef.current > 45_000) {
        session.restartConnection();
        return;
      }
      if (Date.now() - lastSeenRef.current > 30_000) {
        dispatch({
          type: 'warning',
          message: 'Aucun message reçu depuis 30 secondes. La connexion est peut-être instable.',
        });
      }
      session.send({
        protocol: PROTOCOL_VERSION,
        type: 'ping',
        id: newMessageId(),
        from: role,
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [state.game, state.role, state.sessionPhase]);

  const resumeTarget: ResumeTarget = state.role
    ? state.game && state.locked
      ? 'game'
      : state.locked ||
          state.sessionPhase === 'placing' ||
          state.sessionPhase === 'awaiting-opponent'
        ? 'placement'
        : 'lobby'
    : initialResume
      ? targetForResume(initialResume)
      : 'lobby';

  return {
    state,
    resumable,
    resumeTarget,
    resumeGame,
    hostGame,
    joinGame,
    startPlacement,
    resetMatch,
    lockMine,
    sendWave,
    sendCell,
    answerIncoming,
    cancelIncoming,
    confirmIncoming,
    requestConfirmationOf,
    verifyIncomingSubmission,
    submitCandidate,
    clearWarning,
    clearError,
    clearNotice,
  };
}

function resolveEntry(label: string): import('../engine/types').Entry | null {
  return entryForLabel(label) ?? null;
}

export { otherPlayer };
