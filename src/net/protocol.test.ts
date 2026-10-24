import { describe, expect, it } from 'vitest';
import type { SerializedMine } from '../engine/types';
import { createGame } from '../engine/endgame';
import {
  chooseStarter,
  createCommit,
  createHello,
  createLobbyStart,
  createStart,
  createSync,
  isNetworkMessage,
  newMessageId,
  parseNetworkMessage,
  PROTOCOL_VERSION,
  type NetworkMessage,
} from './protocol';

const NONCE_A = '0123456789abcdef0123456789abcdef';
const NONCE_B = 'fedcba9876543210fedcba987654321f';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const SALT = 'b'.repeat(32);

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

function parse(value: unknown): NetworkMessage | null {
  return parseNetworkMessage(JSON.stringify(value));
}

describe('protocole réseau', () => {
  it('accepte les messages de présentation et de salon', () => {
    expect(parse(createHello('host', 'René', NONCE_A))).toEqual({
      protocol: PROTOCOL_VERSION,
      type: 'hello',
      from: 'host',
      name: 'René',
      nonce: NONCE_A,
    });
    expect(parse(createCommit('guest', HASH_B, 'commit-1'))).toEqual({
      protocol: PROTOCOL_VERSION,
      type: 'commit',
      id: 'commit-1',
      from: 'guest',
      mineHash: HASH_B,
    });
    expect(parse(createLobbyStart('start-1'))).toEqual({
      protocol: PROTOCOL_VERSION,
      type: 'lobby-start',
      id: 'start-1',
      from: 'host',
    });
    expect(parse(createStart(NONCE_A, NONCE_B, HASH_A, HASH_B))).toMatchObject({
      type: 'start',
      from: 'host',
      starter: 'host',
      hostNonce: NONCE_A,
      guestNonce: NONCE_B,
      hostHash: HASH_A,
      guestHash: HASH_B,
    });
  });

  it('refuse une présentation ou un engagement mal formé', () => {
    expect(parse({ ...createHello('host', 'X', NONCE_A), nonce: 'abc' })).toBeNull();
    expect(parse({ ...createHello('host', 'X', NONCE_A), from: 'autre' })).toBeNull();
    expect(parse({ ...createHello('host', 'X', NONCE_A), name: 'x'.repeat(41) })).toBeNull();
    expect(parse({ ...createCommit('host', HASH_A), mineHash: 'zz' })).toBeNull();
    expect(parse({ ...createCommit('host', HASH_A), id: '' })).toBeNull();
    expect(parse({ ...createLobbyStart(), from: 'guest' })).toBeNull();
  });

  it('refuse un démarrage incohérent', () => {
    const start = createStart(NONCE_A, NONCE_B, HASH_A, HASH_B)!;
    expect(parse({ ...start, from: 'guest' })).toBeNull();
    expect(parse({ ...start, starter: 'autre' })).toBeNull();
    expect(parse({ ...start, hostHash: 'court' })).toBeNull();
    expect(parse({ ...start, guestHash: undefined })).toBeNull();
  });

  it('accepte un état de partie synchronisé', () => {
    const sync = createSync('host', {
      round: 3,
      mineHash: HASH_A,
      starter: 'host',
      game: createGame('host'),
      reveals: [{ from: 'guest', mine: CANDIDATE, salt: SALT }],
    });
    expect(parse(sync)).toMatchObject({
      type: 'sync',
      from: 'host',
      round: 3,
      mineHash: HASH_A,
      starter: 'host',
      reveals: [{ from: 'guest', mine: CANDIDATE, salt: SALT }],
    });
    expect(parse({ ...sync, round: -1 })).toBeNull();
    expect(parse({ ...sync, mineHash: 'court' })).toBeNull();
    expect(parse({ ...sync, starter: 'autre' })).toBeNull();
    expect(parse({ ...sync, reveals: [{ from: 'guest', mine: CANDIDATE, salt: 'x' }] })).toBeNull();
  });

  it('refuse un état de partie mal formé', () => {
    const sync = createSync('host', {
      round: 1,
      mineHash: HASH_A,
      starter: 'host',
      game: createGame('host'),
      reveals: [],
    });
    expect(parse({ ...sync, game: { ...createGame('host'), phase: 'inconnue' } })).toBeNull();
    expect(parse({ ...sync, game: { ...createGame('host'), starter: 'autre' } })).toBeNull();
    expect(parse({ ...sync, game: { ...createGame('host'), scans: [{}] } })).toBeNull();
  });

  it('accepte les scans de rayon et de case', () => {
    const wave = {
      protocol: PROTOCOL_VERSION,
      type: 'scan',
      id: 'scan-1',
      from: 'host',
      kind: 'wave',
      entry: '10',
    };
    const cell = {
      protocol: PROTOCOL_VERSION,
      type: 'scan',
      id: 'scan-2',
      from: 'guest',
      kind: 'cell',
      cell: { col: 9, row: 7 },
    };
    expect(parse(wave)).toEqual(wave);
    expect(parse(cell)).toEqual(cell);
    expect(parse({ ...wave, entry: 'S' })).toBeNull();
    expect(parse({ ...cell, cell: { col: 10, row: 0 } })).toBeNull();
    expect(parse({ ...wave, id: '' })).toBeNull();
    expect(parse({ ...wave, from: 'autre' })).toBeNull();
  });

  it('accepte les réponses avec la bonne couleur selon le type', () => {
    const wave = {
      protocol: PROTOCOL_VERSION,
      type: 'answer',
      id: 'answer-1',
      from: 'guest',
      scanId: 'scan-1',
      kind: 'wave',
      exit: 'I',
      color: 'light-violet',
    };
    const cell = {
      protocol: PROTOCOL_VERSION,
      type: 'answer',
      id: 'answer-2',
      from: 'guest',
      scanId: 'scan-2',
      kind: 'cell',
      color: 'white',
    };
    expect(parse(wave)).toEqual(wave);
    expect(parse(cell)).toEqual(cell);
    expect(parse({ ...wave, color: 'transparent' })).not.toBeNull();
    expect(parse({ ...wave, color: 'mauve' })).toBeNull();
    expect(parse({ ...cell, color: 'transparent' })).toBeNull();
    expect(parse({ ...cell, color: null })).not.toBeNull();
    expect(parse({ ...wave, exit: 'Z' })).toBeNull();
  });

  it('accepte les confirmations, annulations et pings', () => {
    const messages = [
      {
        protocol: PROTOCOL_VERSION,
        type: 'cancel-scan',
        id: 'c1',
        from: 'guest',
        scanId: 'scan-1',
      },
      {
        protocol: PROTOCOL_VERSION,
        type: 'confirm-request',
        id: 'c2',
        from: 'host',
        answerId: 'answer-1',
      },
      {
        protocol: PROTOCOL_VERSION,
        type: 'confirm-result',
        id: 'c3',
        from: 'guest',
        answerId: 'answer-1',
        kind: 'cell',
        color: null,
      },
      {
        protocol: PROTOCOL_VERSION,
        type: 'ping',
        id: 'p1',
        from: 'host',
      },
      {
        protocol: PROTOCOL_VERSION,
        type: 'pong',
        id: 'p2',
        from: 'guest',
        replyTo: 'p1',
      },
    ];
    for (const message of messages) {
      expect(parse(message)).toEqual(message);
    }
  });

  it('accepte une proposition complète et un résultat', () => {
    const submit = {
      protocol: PROTOCOL_VERSION,
      type: 'submit',
      id: 's1',
      from: 'host',
      candidate: CANDIDATE,
    };
    const result = {
      protocol: PROTOCOL_VERSION,
      type: 'submit-result',
      id: 's2',
      from: 'guest',
      submissionId: 's1',
      correct: true,
    };
    expect(parse(submit)).toEqual(submit);
    expect(parse(result)).toEqual(result);
    expect(parse({ ...submit, candidate: { ...CANDIDATE, pieces: [] } })).toBeNull();
    expect(parse({ ...result, correct: 'oui' })).toBeNull();
  });

  it('accepte une révélation avec sel et mine', () => {
    const reveal = {
      protocol: PROTOCOL_VERSION,
      type: 'reveal',
      id: 'r1',
      from: 'guest',
      mine: CANDIDATE,
      salt: SALT,
    };
    expect(parse(reveal)).toEqual(reveal);
    expect(parse({ ...reveal, salt: 'abc' })).toBeNull();
    expect(parse({ ...reveal, mine: { version: 1, pieces: [] } })).toBeNull();
  });

  it('ignore les messages inconnus, mal formés ou d’une autre version', () => {
    expect(parseNetworkMessage('{')).toBeNull();
    expect(parseNetworkMessage('null')).toBeNull();
    expect(parse({ protocol: 1, type: 'ping', id: 'p', from: 'host' })).toBeNull();
    expect(parse({ protocol: PROTOCOL_VERSION, type: 'inconnu' })).toBeNull();
    expect(isNetworkMessage({ protocol: PROTOCOL_VERSION, type: 'scan' })).toBe(false);
  });

  it('calcule un premier joueur déterministe et symétrique', () => {
    expect(chooseStarter(NONCE_A, NONCE_B)).toBe('host');
    expect(chooseStarter(NONCE_B, NONCE_A)).toBe('host');
    expect(chooseStarter(NONCE_A, NONCE_A)).toBe('host');
    const odd = '0'.repeat(31) + '1';
    expect(chooseStarter(odd, '0'.repeat(32))).toBe('guest');
    expect(chooseStarter('x', NONCE_B)).toBeNull();
    expect(createStart('x', NONCE_B, HASH_A, HASH_B)).toBeNull();
    expect(createStart(NONCE_A, NONCE_B, 'x', HASH_B)).toBeNull();
  });

  it('génère des identifiants de message courts et uniques', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newMessageId()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});
