import { describe, expect, it } from 'vitest';
import { validateMine } from './placement';
import { generateRandomMine } from './randomMine';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('generateRandomMine', () => {
  it('produit une mine complète et valide', () => {
    const mine = generateRandomMine({ random: seeded(42) });
    expect(mine).not.toBeNull();
    if (!mine) return;
    expect(mine.pieces).toHaveLength(5);
    expect(validateMine(mine).ok).toBe(true);
  });

  it('respecte le réglage de symétrie des gemmes blanches', () => {
    const mine = generateRandomMine({
      random: seeded(7),
      enforceWhiteSymmetry: false,
    });
    expect(mine).not.toBeNull();
    if (!mine) return;
    expect(validateMine(mine, { enforceWhiteSymmetry: false }).ok).toBe(true);
  });

  it('reste déterministe avec une graine fixe', () => {
    const first = generateRandomMine({ random: seeded(123) });
    const second = generateRandomMine({ random: seeded(123) });
    expect(first).toEqual(second);
  });
});
