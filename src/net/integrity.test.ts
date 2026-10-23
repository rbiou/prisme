import { describe, expect, it } from 'vitest';
import { createPiece } from '../engine/pieces';
import {
  commitmentPayload,
  createCommitment,
  isHex,
  mineCommitment,
  randomHex,
  sha256Hex,
  verifyCommitment,
} from './integrity';

const MINE = {
  version: 1 as const,
  pieces: [
    createPiece('red-parallelogram', 0, 1, 1),
    createPiece('yellow-triangle', 0, 6, 1),
    createPiece('blue-triangle', 0, 1, 5),
    createPiece('white-triangle', 0, 6, 4),
    createPiece('white-diamond', 0, 4, 3),
  ],
};

const SALT = '00112233445566778899aabbccddeeff';

describe('intégrité', () => {
  it('produit des sels hexadécimaux de la bonne longueur', () => {
    const first = randomHex(16);
    const second = randomHex(16);
    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first).not.toBe(second);
    expect(isHex(first, 32)).toBe(true);
    expect(isHex('zz', 2)).toBe(false);
    expect(() => randomHex(0)).toThrow();
  });

  it('calcule un SHA-256 conforme', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('engage la mine canonique avec le sel', async () => {
    const hash = await mineCommitment(MINE, SALT);
    expect(hash).toHaveLength(64);
    expect(await verifyCommitment(MINE, SALT, hash)).toBe(true);
    expect(await verifyCommitment(MINE, SALT, '0'.repeat(64))).toBe(false);
    expect(await verifyCommitment(MINE, SALT, hash.toUpperCase())).toBe(true);
    expect(await verifyCommitment(MINE, 'pas-hex', hash)).toBe(false);
    expect(commitmentPayload(MINE, SALT)).toContain(SALT);
  });

  it('crée un engagement complet', async () => {
    const commitment = await createCommitment(MINE);
    expect(commitment.salt).toHaveLength(32);
    expect(commitment.hash).toHaveLength(64);
    expect(await verifyCommitment(MINE, commitment.salt, commitment.hash)).toBe(true);
  });
});
