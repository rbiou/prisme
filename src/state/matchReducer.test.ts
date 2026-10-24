import { describe, expect, it } from 'vitest';
import { entryForLabel } from '../engine/board';
import { createGame, requestScan } from '../engine/endgame';
import { PROTOCOL_VERSION } from '../net/protocol';
import { initialMatchState, matchReducer, type MatchState } from './matchReducer';

function stateWithPendingScan(): MatchState {
  const entry = entryForLabel('3');
  if (!entry) throw new Error('Entrée de test introuvable.');
  const requested = requestScan(createGame('host'), {
    id: 'scan-1',
    by: 'host',
    kind: 'wave',
    entry,
  });
  if (!requested.ok) throw new Error(requested.error);
  return {
    ...initialMatchState,
    role: 'host',
    playerName: 'Camille',
    opponentName: 'Alex',
    sessionPhase: 'ready',
    transportStatus: 'connected',
    game: requested.state,
  };
}

describe('matchReducer — reprise de partie', () => {
  it('adopte l’état public le plus avancé après une reconnexion', () => {
    const advanced: ReturnType<typeof createGame> = {
      ...createGame('host'),
      phase: 'final-turn',
      turn: 'guest',
      finalTurnFor: 'guest',
      scans: [
        {
          id: 'scan-1',
          by: 'host',
          kind: 'cell',
          cell: { col: 0, row: 0 },
          answer: { kind: 'cell', color: 'red' },
          createdAt: 1,
        },
      ],
    };
    const state: MatchState = {
      ...initialMatchState,
      role: 'host',
      sessionPhase: 'reconnecting',
      game: createGame('host'),
    };

    const next = matchReducer(state, {
      type: 'adopt',
      game: advanced,
      starter: 'host',
      opponentHash: 'a'.repeat(64),
      reveals: {},
    });

    expect(next.game).toEqual(advanced);
    expect(next.opponentHash).toBe('a'.repeat(64));
    expect(next.sessionPhase).toBe('ready');
  });
});

describe('matchReducer — notifications de réponse', () => {
  it('affiche une notification quand l’adversaire répond à notre rayon', () => {
    const next = matchReducer(stateWithPendingScan(), {
      type: 'message',
      now: 1,
      message: {
        protocol: PROTOCOL_VERSION,
        type: 'answer',
        id: 'answer-1',
        from: 'guest',
        scanId: 'scan-1',
        kind: 'wave',
        exit: '12',
        color: 'orange',
      },
    });

    expect(next.game?.scans).toHaveLength(1);
    expect(next.notice).toEqual({
      id: 'answer-1',
      title: 'Réponse reçue',
      body: 'Rayon 3 · côté haut : sortie 12 · Orange.',
    });
  });

  it('affiche une notification quand l’adversaire répond à notre question de case', () => {
    const requested = requestScan(createGame('host'), {
      id: 'scan-cell',
      by: 'host',
      kind: 'cell',
      cell: { col: 4, row: 3 },
    });
    if (!requested.ok) throw new Error(requested.error);
    const state: MatchState = {
      ...initialMatchState,
      role: 'host',
      sessionPhase: 'ready',
      transportStatus: 'connected',
      game: requested.state,
    };

    const next = matchReducer(state, {
      type: 'message',
      now: 1,
      message: {
        protocol: PROTOCOL_VERSION,
        type: 'answer',
        id: 'answer-cell',
        from: 'guest',
        scanId: 'scan-cell',
        kind: 'cell',
        color: 'blue',
      },
    });

    expect(next.notice?.body).toBe('Case D5 : Bleu.');
  });

  it('n’efface pas une notification plus récente avec un ancien identifiant', () => {
    const state: MatchState = {
      ...initialMatchState,
      notice: { id: 'recent', title: 'Réponse reçue', body: 'Case E4 : bleu.' },
    };

    const unchanged = matchReducer(state, { type: 'clear-notice', id: 'ancien' });
    expect(unchanged.notice?.id).toBe('recent');

    const cleared = matchReducer(unchanged, { type: 'clear-notice', id: 'recent' });
    expect(cleared.notice).toBeNull();
  });
});
