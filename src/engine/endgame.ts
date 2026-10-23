import type {
  EndReason,
  Entry,
  GameActionResult,
  GameState,
  PendingScan,
  PendingSubmission,
  PlayerId,
  RayColor,
  ScanRecord,
  SerializedMine,
} from './types';

export type ScanRequest =
  | { id: string; by: PlayerId; kind: 'wave'; entry: Entry }
  | { id: string; by: PlayerId; kind: 'cell'; cell: { col: number; row: number } };

export type ScanAnswer =
  | { kind: 'wave'; exit: Entry; color: RayColor }
  | { kind: 'cell'; color: 'red' | 'yellow' | 'blue' | 'white' | null };

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 'host' ? 'guest' : 'host';
}

export function createGame(starter: PlayerId): GameState {
  return {
    phase: 'playing',
    starter,
    turn: starter,
    scans: [],
    submissions: [],
  };
}

function fail(state: GameState, error: string): GameActionResult {
  return { ok: false, state, error };
}

function succeed(state: GameState): GameActionResult {
  return { ok: true, state };
}

export function requestScan(state: GameState, request: ScanRequest): GameActionResult {
  if (state.phase !== 'playing') {
    return fail(state, 'Un scan ne peut être demandé que pendant la phase de jeu.');
  }
  if (state.turn !== request.by) {
    return fail(state, 'Ce n’est pas votre tour.');
  }
  if (state.pendingConfirmation) {
    return fail(state, 'Une confirmation est déjà en attente.');
  }

  const pending: PendingScan =
    request.kind === 'wave'
      ? { id: request.id, by: request.by, kind: 'wave', entry: request.entry }
      : { id: request.id, by: request.by, kind: 'cell', cell: request.cell };

  return succeed({ ...state, phase: 'awaiting-answer', pendingScan: pending });
}

export function cancelScan(state: GameState, cancelledBy: PlayerId): GameActionResult {
  if (state.phase !== 'awaiting-answer' || !state.pendingScan) {
    return fail(state, 'Aucun scan n’est en attente.');
  }
  if (state.pendingScan.by === cancelledBy) {
    return fail(state, 'Seul le maître de la mine peut annuler la demande.');
  }
  return succeed({ ...state, phase: 'playing', pendingScan: undefined });
}

export function answerScan(
  state: GameState,
  scanId: string,
  answer: ScanAnswer,
  now = Date.now(),
): GameActionResult {
  if (state.phase !== 'awaiting-answer' || !state.pendingScan) {
    return fail(state, 'Aucun scan n’est en attente.');
  }
  if (state.pendingScan.id !== scanId) {
    return fail(state, 'Cet identifiant de scan ne correspond pas à la demande en attente.');
  }
  if (state.pendingScan.kind !== answer.kind) {
    return fail(state, 'Le type de réponse ne correspond pas au type de scan.');
  }

  const pending = state.pendingScan;
  const record: ScanRecord = {
    id: pending.id,
    by: pending.by,
    kind: pending.kind,
    entry: pending.entry,
    cell: pending.cell,
    answer,
    createdAt: now,
  };

  return succeed({
    ...state,
    phase: 'playing',
    turn: otherPlayer(pending.by),
    pendingScan: undefined,
    scans: [...state.scans, record],
  });
}

export function requestConfirmation(
  state: GameState,
  request: { id: string; by: PlayerId; answerId: string },
): GameActionResult {
  if (state.phase !== 'playing') {
    return fail(state, 'Une confirmation gratuite n’est possible que pendant la phase de jeu.');
  }
  if (state.turn !== request.by) {
    return fail(state, 'Seul le prospecteur dont c’est le tour peut demander une confirmation.');
  }
  const answer = state.scans.find((scan) => scan.id === request.answerId);
  if (!answer) {
    return fail(state, 'Cette réponse n’existe pas.');
  }
  if (state.pendingConfirmation) {
    return fail(state, 'Une confirmation est déjà en attente.');
  }
  return succeed({
    ...state,
    pendingConfirmation: {
      id: request.id,
      by: request.by,
      answerId: request.answerId,
    },
  });
}

export function resolveConfirmation(
  state: GameState,
  answer: ScanAnswer,
  now = Date.now(),
): GameActionResult {
  if (!state.pendingConfirmation) {
    return fail(state, 'Aucune confirmation n’est en attente.');
  }
  const pending = state.pendingConfirmation;
  const original = state.scans.find((scan) => scan.id === pending.answerId);
  if (!original) {
    return fail(state, 'La réponse d’origine est introuvable.');
  }
  if (original.kind !== answer.kind) {
    return fail(state, 'Le type de la confirmation ne correspond pas à la réponse d’origine.');
  }

  const record: ScanRecord = {
    id: pending.id,
    by: pending.by,
    kind: original.kind,
    entry: original.entry,
    cell: original.cell,
    answer,
    confirmationOf: pending.answerId,
    createdAt: now,
  };

  return succeed({
    ...state,
    pendingConfirmation: undefined,
    scans: [...state.scans, record],
  });
}

export function beginSubmission(
  state: GameState,
  submission: { id: string; by: PlayerId; candidate: SerializedMine },
): GameActionResult {
  if (state.phase !== 'playing' && state.phase !== 'final-turn') {
    return fail(state, 'Une proposition ne peut pas être soumise maintenant.');
  }
  if (state.turn !== submission.by) {
    return fail(state, 'Ce n’est pas votre tour.');
  }
  if (state.pendingScan || state.pendingConfirmation) {
    return fail(state, 'Une action est déjà en attente.');
  }

  const pending: PendingSubmission = {
    id: submission.id,
    by: submission.by,
    candidate: submission.candidate,
  };

  return succeed({ ...state, phase: 'awaiting-verification', pendingSubmission: pending });
}

export function resolveSubmission(
  state: GameState,
  correct: boolean,
  now = Date.now(),
): GameActionResult {
  if (state.phase !== 'awaiting-verification' || !state.pendingSubmission) {
    return fail(state, 'Aucune proposition n’est en attente de vérification.');
  }

  const pending = state.pendingSubmission;
  const isFinalTurn = state.finalTurnFor === pending.by;
  const submissions = [
    ...state.submissions,
    {
      id: pending.id,
      by: pending.by,
      candidate: pending.candidate,
      correct,
      createdAt: now,
    },
  ];

  const base: GameState = {
    ...state,
    pendingSubmission: undefined,
    submissions,
  };

  if (!correct) {
    if (isFinalTurn) {
      return succeed({
        ...base,
        phase: 'ended',
        winner: state.starter,
        endReason: 'starter-correct-opponent-wrong',
      });
    }
    return succeed({
      ...base,
      phase: 'ended',
      winner: otherPlayer(pending.by),
      endReason: 'wrong-submission',
    });
  }

  if (isFinalTurn) {
    return succeed({
      ...base,
      phase: 'ended',
      winner: 'draw',
      endReason: 'starter-correct-opponent-correct',
    });
  }

  if (pending.by !== state.starter) {
    return succeed({
      ...base,
      phase: 'ended',
      winner: pending.by,
      endReason: 'non-starter-correct',
    });
  }

  return succeed({
    ...base,
    phase: 'final-turn',
    turn: otherPlayer(pending.by),
    finalTurnFor: otherPlayer(pending.by),
  });
}

export function forfeit(state: GameState, player: PlayerId): GameActionResult {
  if (state.phase === 'ended') {
    return fail(state, 'La partie est déjà terminée.');
  }
  return succeed({
    ...state,
    phase: 'ended',
    winner: otherPlayer(player),
    endReason: 'forfeit',
  });
}

export function canScan(state: GameState, player: PlayerId): boolean {
  return state.phase === 'playing' && state.turn === player && !state.pendingConfirmation;
}

export function canSubmit(state: GameState, player: PlayerId): boolean {
  return (
    (state.phase === 'playing' || state.phase === 'final-turn') &&
    state.turn === player &&
    !state.pendingScan &&
    !state.pendingConfirmation
  );
}

export function endReasonLabel(reason: EndReason | undefined): string {
  switch (reason) {
    case 'non-starter-correct':
      return 'Proposition correcte du joueur non-débutant.';
    case 'starter-correct-opponent-wrong':
      return 'Le débutant a trouvé la mine ; son adversaire a échoué sur le dernier tour.';
    case 'starter-correct-opponent-correct':
      return 'Les deux joueurs ont trouvé la mine : égalité.';
    case 'wrong-submission':
      return 'Proposition incorrecte : défaite immédiate.';
    case 'forfeit':
      return 'Forfait.';
    default:
      return '';
  }
}
