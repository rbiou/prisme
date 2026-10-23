import { describe, expect, it } from 'vitest';
import { entryForLabel } from './board';
import {
  answerScan,
  beginSubmission,
  canScan,
  canSubmit,
  cancelScan,
  createGame,
  endReasonLabel,
  forfeit,
  otherPlayer,
  requestConfirmation,
  requestScan,
  resolveConfirmation,
  resolveSubmission,
} from './endgame';
import { deserializeMine, serializeMine } from './mine';
import type { GameState, SerializedMine } from './types';

function entry(label: string) {
  const value = entryForLabel(label);
  if (!value) throw new Error(`Entrée inconnue : ${label}`);
  return value;
}

const CANDIDATE: SerializedMine = {
  version: 1,
  pieces: [
    { kind: 'red-parallelogram', rotation: 0, x: 1, y: 1 },
    { kind: 'yellow-triangle', rotation: 0, x: 6, y: 1 },
    { kind: 'blue-triangle', rotation: 0, x: 1, y: 5 },
    { kind: 'white-triangle', rotation: 0, x: 6, y: 4 },
    { kind: 'white-diamond', rotation: 0, x: 4, y: 3 },
  ],
};

function stateAtTurn(player: 'host' | 'guest', starter: 'host' | 'guest' = 'host'): GameState {
  let state = createGame(starter);
  if (state.turn === player) return state;
  const first = requestScan(state, {
    id: 'setup-1',
    by: state.turn,
    kind: 'wave',
    entry: entry('1'),
  });
  if (!first.ok) throw new Error(first.error);
  const answered = answerScan(first.state, 'setup-1', {
    kind: 'wave',
    exit: entry('I'),
    color: 'transparent',
  });
  if (!answered.ok) throw new Error(answered.error);
  state = answered.state;
  if (state.turn === player) return state;
  const second = requestScan(state, {
    id: 'setup-2',
    by: state.turn,
    kind: 'cell',
    cell: { col: 0, row: 0 },
  });
  if (!second.ok) throw new Error(second.error);
  const answeredSecond = answerScan(state, 'setup-2', { kind: 'cell', color: null }, 0);
  if (!answeredSecond.ok) throw new Error(answeredSecond.error);
  return answeredSecond.state;
}

describe('machine à états de fin de partie', () => {
  it('alterne les joueurs après une réponse confirmée', () => {
    let state = createGame('host');
    expect(state.turn).toBe('host');
    expect(canScan(state, 'host')).toBe(true);
    expect(canScan(state, 'guest')).toBe(false);

    const requested = requestScan(state, {
      id: 'scan-1',
      by: 'host',
      kind: 'wave',
      entry: entry('5'),
    });
    expect(requested.ok).toBe(true);
    state = requested.state;
    expect(state.phase).toBe('awaiting-answer');
    expect(state.pendingScan?.id).toBe('scan-1');

    const answered = answerScan(state, 'scan-1', {
      kind: 'wave',
      exit: entry('12'),
      color: 'blue',
    });
    expect(answered.ok).toBe(true);
    state = answered.state;
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe('guest');
    expect(state.scans[0]?.answer).toEqual({
      kind: 'wave',
      exit: entry('12'),
      color: 'blue',
    });
  });

  it('refuse un scan hors tour, une réponse inconnue et une annulation par le prospecteur', () => {
    const state = createGame('host');
    expect(
      requestScan(state, {
        id: 'x',
        by: 'guest',
        kind: 'wave',
        entry: entry('1'),
      }).ok,
    ).toBe(false);

    const requested = requestScan(state, {
      id: 'scan-1',
      by: 'host',
      kind: 'wave',
      entry: entry('1'),
    });
    const pending = requested.state;
    expect(
      answerScan(pending, 'autre', {
        kind: 'wave',
        exit: entry('I'),
        color: 'transparent',
      }).ok,
    ).toBe(false);
    expect(
      answerScan(pending, 'scan-1', {
        kind: 'cell',
        color: null,
      }).ok,
    ).toBe(false);
    expect(cancelScan(pending, 'host').ok).toBe(false);
    expect(cancelScan(pending, 'guest').ok).toBe(true);
  });

  it('confirme une réponse gratuitement sans changer le tour', () => {
    let state = createGame('host');
    state = requestScan(state, {
      id: 'scan-1',
      by: 'host',
      kind: 'cell',
      cell: { col: 3, row: 2 },
    }).state;
    state = answerScan(state, 'scan-1', { kind: 'cell', color: 'red' }, 0).state;
    expect(state.turn).toBe('guest');

    state = requestScan(state, {
      id: 'scan-2',
      by: 'guest',
      kind: 'wave',
      entry: entry('3'),
    }).state;
    state = answerScan(
      state,
      'scan-2',
      {
        kind: 'wave',
        exit: entry('Q'),
        color: 'green',
      },
      0,
    ).state;
    expect(state.turn).toBe('host');

    const confirmation = requestConfirmation(state, {
      id: 'confirm-1',
      by: 'host',
      answerId: 'scan-1',
    });
    expect(confirmation.ok).toBe(true);
    expect(confirmation.state.phase).toBe('playing');
    expect(confirmation.state.turn).toBe('host');

    const resolved = resolveConfirmation(confirmation.state, { kind: 'cell', color: 'red' }, 0);
    expect(resolved.ok).toBe(true);
    expect(resolved.state.turn).toBe('host');
    expect(resolved.state.phase).toBe('playing');
    expect(resolved.state.scans).toHaveLength(3);
    expect(resolved.state.scans[2]?.confirmationOf).toBe('scan-1');
  });

  it('refuse une confirmation demandée hors tour ou pour une réponse absente', () => {
    let state = createGame('host');
    state = requestScan(state, {
      id: 'scan-1',
      by: 'host',
      kind: 'wave',
      entry: entry('1'),
    }).state;
    state = answerScan(state, 'scan-1', {
      kind: 'wave',
      exit: entry('I'),
      color: 'transparent',
    }).state;
    expect(
      requestConfirmation(state, {
        id: 'confirm-1',
        by: 'host',
        answerId: 'scan-1',
      }).ok,
    ).toBe(false);
    expect(
      requestConfirmation(state, {
        id: 'confirm-2',
        by: 'guest',
        answerId: 'inconnu',
      }).ok,
    ).toBe(false);
  });

  it('termine immédiatement sur une proposition incorrecte', () => {
    let state = stateAtTurn('host');
    const submission = beginSubmission(state, {
      id: 'submit-1',
      by: 'host',
      candidate: CANDIDATE,
    });
    expect(submission.ok).toBe(true);
    state = submission.state;
    expect(state.phase).toBe('awaiting-verification');

    const resolved = resolveSubmission(state, false, 0);
    expect(resolved.ok).toBe(true);
    expect(resolved.state.phase).toBe('ended');
    expect(resolved.state.winner).toBe('guest');
    expect(resolved.state.endReason).toBe('wrong-submission');
    expect(endReasonLabel(resolved.state.endReason)).toBeTruthy();
  });

  it('fait gagner immédiatement le joueur non-débutant', () => {
    let state = stateAtTurn('guest');
    expect(state.starter).toBe('host');
    state = beginSubmission(state, {
      id: 'submit-1',
      by: 'guest',
      candidate: CANDIDATE,
    }).state;
    const resolved = resolveSubmission(state, true, 0);
    expect(resolved.state.phase).toBe('ended');
    expect(resolved.state.winner).toBe('guest');
    expect(resolved.state.endReason).toBe('non-starter-correct');
  });

  it('accorde un dernier tour au débutant puis une égalité si l’adversaire réussit', () => {
    let state = stateAtTurn('host');
    expect(state.starter).toBe('host');
    state = beginSubmission(state, {
      id: 'submit-1',
      by: 'host',
      candidate: CANDIDATE,
    }).state;
    const afterStarter = resolveSubmission(state, true, 0);
    expect(afterStarter.ok).toBe(true);
    state = afterStarter.state;
    expect(state.phase).toBe('final-turn');
    expect(state.turn).toBe('guest');
    expect(state.finalTurnFor).toBe('guest');
    expect(canSubmit(state, 'guest')).toBe(true);
    expect(canScan(state, 'guest')).toBe(false);

    state = beginSubmission(state, {
      id: 'submit-2',
      by: 'guest',
      candidate: CANDIDATE,
    }).state;
    const drawn = resolveSubmission(state, true, 0);
    expect(drawn.state.phase).toBe('ended');
    expect(drawn.state.winner).toBe('draw');
    expect(drawn.state.endReason).toBe('starter-correct-opponent-correct');
  });

  it('fait gagner le débutant si l’adversaire échoue au dernier tour', () => {
    let state = stateAtTurn('host');
    state = beginSubmission(state, {
      id: 'submit-1',
      by: 'host',
      candidate: CANDIDATE,
    }).state;
    state = resolveSubmission(state, true, 0).state;
    state = beginSubmission(state, {
      id: 'submit-2',
      by: 'guest',
      candidate: CANDIDATE,
    }).state;
    const resolved = resolveSubmission(state, false, 0);
    expect(resolved.state.phase).toBe('ended');
    expect(resolved.state.winner).toBe('host');
    expect(resolved.state.endReason).toBe('starter-correct-opponent-wrong');
  });

  it('refuse une proposition hors tour ou dans une phase incorrecte', () => {
    const state = createGame('host');
    expect(
      beginSubmission(state, {
        id: 'submit-1',
        by: 'guest',
        candidate: CANDIDATE,
      }).ok,
    ).toBe(false);
    expect(resolveSubmission(state, true).ok).toBe(false);
    expect(
      beginSubmission(
        { ...state, phase: 'ended' },
        {
          id: 'submit-2',
          by: 'host',
          candidate: CANDIDATE,
        },
      ).ok,
    ).toBe(false);
  });

  it('gère le forfait et les libellés', () => {
    const state = createGame('host');
    const result = forfeit(state, 'guest');
    expect(result.state.phase).toBe('ended');
    expect(result.state.winner).toBe('host');
    expect(result.state.endReason).toBe('forfeit');
    expect(forfeit(result.state, 'host').ok).toBe(false);
    expect(otherPlayer('host')).toBe('guest');
  });

  it('refuse de soumettre tant qu’une action est en attente', () => {
    let state = createGame('host');
    state = requestScan(state, {
      id: 'scan-1',
      by: 'host',
      kind: 'wave',
      entry: entry('1'),
    }).state;
    expect(
      beginSubmission(state, {
        id: 'submit-1',
        by: 'host',
        candidate: CANDIDATE,
      }).ok,
    ).toBe(false);
    expect(canSubmit(state, 'host')).toBe(false);
  });

  it('prépare une mine sérialisée de référence', () => {
    expect(deserializeMine(serializeMine(deserializeMine(CANDIDATE))).pieces).toHaveLength(5);
  });
});
