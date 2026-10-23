import { useCallback, useEffect, useReducer, useRef } from 'react';
import { entryForLabel } from '../engine/board';
import { scanCell } from '../engine/cellScan';
import { canScan, canSubmit, otherPlayer, type ScanAnswer } from '../engine/endgame';
import { checkSolution, serializeMine } from '../engine/mine';
import { simulateRay } from '../engine/ray';
import { validateMine } from '../engine/placement';
import type { Cell, Mine, PlayerId, SerializedMine } from '../engine/types';
import { createCommitment, randomHex } from '../net/integrity';
import { newMessageId, PROTOCOL_VERSION, type NetworkMessage } from '../net/protocol';
import { MatchSession, type ReadyContext } from '../net/session';
import { extractSignalCode } from '../net/signaling';
import type { Settings } from './settings';
import { initialMatchState, matchReducer, type MatchState } from './matchReducer';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface UseMatchResult {
  state: MatchState;
  configure: (role: PlayerId, playerName: string, inviteCode?: string | null) => void;
  resetMatch: (keepName?: boolean) => void;
  lockMine: (mine: Mine) => Promise<ActionResult>;
  connectAnswer: (code: string) => Promise<ActionResult>;
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

export function useMatch(settings: Settings): UseMatchResult {
  const [state, dispatch] = useReducer(matchReducer, initialMatchState);
  const sessionRef = useRef<MatchSession | null>(null);
  const revealSentRef = useRef(false);
  const lockingRef = useRef(false);
  const lastSeenRef = useRef(0);
  const stateRef = useRef(state);

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

  const configure = useCallback(
    (role: PlayerId, playerName: string, inviteCode: string | null = null) => {
      closeSession();
      revealSentRef.current = false;
      clearDraft();
      dispatch({ type: 'begin', role, playerName, inviteCode });
    },
    [closeSession],
  );

  const resetMatch = useCallback(
    (keepName = true) => {
      closeSession();
      revealSentRef.current = false;
      clearDraft();
      dispatch({ type: 'reset', keepName });
    },
    [closeSession],
  );

  const createSession = useCallback(
    (role: PlayerId, name: string, mineHash: string): MatchSession => {
      let session: MatchSession | null = null;
      session = new MatchSession(
        role,
        { name, nonce: randomHex(16), mineHash },
        {
          onPhase: (phase, detail) => {
            dispatch({ type: 'phase', phase, detail: detail ?? null });
          },
          onTransportStatus: (status, detail) => {
            dispatch({ type: 'transport', status, detail: detail ?? null });
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
            dispatch({ type: 'message', message, now: Date.now() });
          },
          onReady: (context: ReadyContext) => {
            revealSentRef.current = false;
            lastSeenRef.current = Date.now();
            dispatch({ type: 'ready', context, now: Date.now() });
          },
          onWarning: (message) => dispatch({ type: 'warning', message }),
          onError: (message) => dispatch({ type: 'error', message }),
        },
      );
      return session;
    },
    [],
  );

  const lockMine = useCallback(
    async (mine: Mine): Promise<ActionResult> => {
      const role = state.role;
      if (!role) {
        return { ok: false, error: 'Choisissez d’abord de créer ou de rejoindre une partie.' };
      }
      if (state.locked) return { ok: true };
      if (lockingRef.current) {
        return { ok: false, error: 'Le verrouillage est déjà en cours.' };
      }
      if (role === 'guest' && !state.inviteCode) {
        return { ok: false, error: 'L’invitation est absente. Ouvrez de nouveau le lien reçu.' };
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
      let session: MatchSession | null = null;
      try {
        const commitment = await createCommitment(mine);
        session = createSession(role, state.playerName.trim() || 'Joueur', commitment.hash);
        sessionRef.current = session;
        dispatch({
          type: 'mine-locked',
          locked: { mine, salt: commitment.salt, hash: commitment.hash },
        });

        if (role === 'host') {
          const offerCode = await session.createInvitation();
          dispatch({ type: 'offer-code', code: offerCode });
        } else {
          const answerCode = await session.acceptInvitation(state.inviteCode!);
          dispatch({ type: 'answer-code', code: answerCode });
        }
        clearDraft();
        return { ok: true };
      } catch (error) {
        const message = messageFor(error);
        if (session) {
          try {
            session.close();
          } catch {
            // Déjà fermée.
          }
        }
        if (sessionRef.current === session) sessionRef.current = null;
        dispatch({ type: 'error', message });
        return { ok: false, error: message };
      } finally {
        lockingRef.current = false;
      }
    },
    [
      createSession,
      settings.enforceWhiteSymmetry,
      state.inviteCode,
      state.locked,
      state.playerName,
      state.role,
    ],
  );

  const connectAnswer = useCallback(async (code: string): Promise<ActionResult> => {
    const session = sessionRef.current;
    if (!session) {
      return {
        ok: false,
        error: 'La session n’est pas prête. Revenez au placement et verrouillez votre mine.',
      };
    }
    const extracted = extractSignalCode(code) ?? code.trim();
    if (!extracted) {
      return { ok: false, error: 'Collez le code de réponse reçu.' };
    }
    dispatch({ type: 'clear-error' });
    try {
      await session.acceptAnswer(extracted);
      return { ok: true };
    } catch (error) {
      const message = messageFor(error);
      dispatch({ type: 'error', message });
      return { ok: false, error: message };
    }
  }, []);

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
  }, [state.game?.phase, state.locked, state.role]);

  // Battement de cœur : ping périodique et avertissement après 45 s de silence.
  useEffect(() => {
    if (!state.game || state.sessionPhase !== 'ready') return;
    const role = state.role;
    if (!role) return;
    lastSeenRef.current = Date.now();
    const timer = window.setInterval(() => {
      const session = sessionRef.current;
      if (!session) return;
      if (Date.now() - lastSeenRef.current > 45_000) {
        dispatch({
          type: 'warning',
          message: 'Aucun message reçu depuis 45 secondes. La connexion est peut-être instable.',
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

  return {
    state,
    configure,
    resetMatch,
    lockMine,
    connectAnswer,
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
  };
}

function resolveEntry(label: string): import('../engine/types').Entry | null {
  return entryForLabel(label) ?? null;
}

export { otherPlayer };
