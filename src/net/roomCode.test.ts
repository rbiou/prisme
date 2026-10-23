import { describe, expect, it } from 'vitest';
import {
  formatRoomCode,
  generateRoomCode,
  normalizeRoomCode,
  peerIdForCode,
  PEER_ID_PREFIX,
  ROOM_CODE_LENGTH,
} from './roomCode';

describe('code de partie', () => {
  it('normalise les espaces, tirets et collages', () => {
    expect(normalizeRoomCode('123456')).toBe('123456');
    expect(normalizeRoomCode(' 123 456 ')).toBe('123456');
    expect(normalizeRoomCode('123-456')).toBe('123456');
    expect(normalizeRoomCode('123 456\n')).toBe('123456');
    expect(normalizeRoomCode('12345')).toBeNull();
    expect(normalizeRoomCode('1234567')).toBeNull();
    expect(normalizeRoomCode('abc')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
  });

  it('affiche le code par groupes de trois chiffres', () => {
    expect(formatRoomCode('123456')).toBe('123 456');
    expect(formatRoomCode('12')).toBe('12');
    expect(formatRoomCode('1234')).toBe('123 4');
    expect(formatRoomCode('12 34 56')).toBe('123 456');
  });

  it('construit un identifiant PeerJS stable', () => {
    expect(peerIdForCode('123 456')).toBe(`${PEER_ID_PREFIX}123456`);
    expect(() => peerIdForCode('12345')).toThrow();
  });

  it('tire exactement six chiffres avec le générateur fourni', () => {
    const values = [1, 2, 3, 4, 5, 6];
    const code = generateRoomCode(() => values.shift() ?? 0);
    expect(code).toBe('123456');
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('produit des codes variés avec le générateur réel', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
    for (const code of codes) {
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});
