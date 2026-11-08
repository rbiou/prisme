import { describe, expect, it } from 'vitest';
import { entryForLabel } from '../engine/board';
import { createGame, requestScan } from '../engine/endgame';
import { createStart, PROTOCOL_VERSION } from '../net/protocol';
import { initialMatchState, matchReducer, type MatchState } from './matchReducer';

const HOST_NONCE = '0123456789abcdef0123456789abcdef';
const GUEST_NONCE = 'fedcba9876543210fedcba987654321f';
const HOST_HASH = 'a'.repeat(64);
const GUEST_HASH = 'b'.repeat(64);

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
  it('conserve le mode de l’hôte au démarrage', () => {
    const begun = matchReducer(initialMatchState, {
      type: 'begin',
      role: 'guest',
      playerName: 'Alex',
      mode: 'special',
    });
    expect(begun.mode).toBe('special');

    const lobbied = matchReducer(begun, {
      type: 'lobby',
      context: { remoteName: 'Hôte', remoteNonce: HOST_NONCE, mode: 'special' },
    });
    expect(lobbied.mode).toBe('special');

    const start = createStart(HOST_NONCE, GUEST_NONCE, HOST_HASH, GUEST_HASH, 'special');
    if (!start) throw new Error('Démarrage de test introuvable.');
    const ready = matchReducer(lobbied, {
      type: 'ready',
      now: 1,
      context: {
        starter: 'host',
        mode: 'special',
        remoteName: 'Hôte',
        remoteNonce: HOST_NONCE,
        remoteMineHash: HOST_HASH,
        start,
      },
    });
    expect(ready.mode).toBe('special');
    expect(ready.game?.mode).toBe('special');
  });

  it('ignore une révélation dont la mine ne correspond pas au mode', () => {
    const state: MatchState = {
      ...initialMatchState,
      role: 'host',
      mode: 'special',
      sessionPhase: 'ready',
      game: {
        ...createGame('host', 'special'),
        phase: 'ended',
        winner: 'host',
        endReason: 'forfeit',
      },
    };
    const next = matchReducer(state, {
      type: 'message',
      now: 1,
      message: {
        protocol: PROTOCOL_VERSION,
        type: 'reveal',
        id: 'reveal-1',
        from: 'guest',
        mine: {
          version: 1,
          pieces: [
            { kind: 'red-parallelogram', rotation: 0, x: 1, y: 1 },
            { kind: 'yellow-triangle', rotation: 0, x: 6, y: 1 },
            { kind: 'blue-triangle', rotation: 0, x: 1, y: 5 },
            { kind: 'white-triangle', rotation: 0, x: 6, y: 4 },
            { kind: 'white-diamond', rotation: 0, x: 4, y: 3 },
          ],
        },
        salt: 'b'.repeat(32),
      },
    });
    expect(next.reveals.guest).toBeUndefined();
    expect(next.warning).toContain('mode');
  });

  it('adopte le mode de l’état public après une reconnexion', () => {
    const special = createGame('host', 'special');
    const next = matchReducer(
      {
        ...initialMatchState,
        role: 'host',
        sessionPhase: 'reconnecting',
        game: createGame('host'),
      },
      { type: 'adopt', game: special, starter: 'host', opponentHash: null, reveals: {} },
    );
    expect(next.mode).toBe('special');
    expect(next.game?.mode).toBe('special');
  });

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
      body: 'Rayon 3 · côté haut : sortie 12 · Orange (rouge + jaune).',
      color: 'orange',
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
