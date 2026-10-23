import { describe, expect, it } from 'vitest';
import { scanCell } from './cellScan';
import { createPiece } from './pieces';
import type { Mine } from './types';

function mineOf(pieces: ReturnType<typeof createPiece>[]): Mine {
  return { version: 1, pieces };
}

describe('scan de case', () => {
  it('répond « rien » sur une case vide', () => {
    const result = scanCell(mineOf([]), { col: 0, row: 0 });
    expect(result.color).toBeNull();
    expect(result.pieceId).toBeNull();
    expect(result.areas).toEqual([]);
  });

  it('détecte une gemme qui couvre toute la case', () => {
    const mine = mineOf([createPiece('red-parallelogram', 0, 1, 1)]);
    const result = scanCell(mine, { col: 2, row: 1 });
    expect(result.color).toBe('red');
    expect(result.pieceId).toBe('red-parallelogram');
    expect(result.areas[0]?.area).toBeCloseTo(1, 9);
  });

  it('mesure une couverture partielle', () => {
    const mine = mineOf([createPiece('white-diamond', 0, 0, 0)]);
    const result = scanCell(mine, { col: 0, row: 0 });
    expect(result.color).toBe('white');
    expect(result.areas[0]?.area).toBeCloseTo(0.5, 9);
  });

  it('trie les aires et tranche les égalités par l’ordre rouge, jaune, bleu, blanc', () => {
    const mine = mineOf([
      createPiece('yellow-triangle', 0, 2, 1),
      createPiece('red-parallelogram', 0, 1, 1),
    ]);
    const result = scanCell(mine, { col: 2, row: 1 });
    expect(result.areas).toHaveLength(2);
    expect(result.areas[0]?.area).toBeCloseTo(1, 9);
    expect(result.areas[1]?.area).toBeCloseTo(1, 9);
    expect(result.color).toBe('red');
    expect(result.pieceId).toBe('red-parallelogram');
  });

  it('choisit la plus grande surface lorsque deux gemmes se partagent une case', () => {
    const mine = mineOf([
      createPiece('white-diamond', 0, 0, 0),
      createPiece('yellow-triangle', 0, 0, 0),
    ]);
    const result = scanCell(mine, { col: 0, row: 0 });
    expect(result.areas).toHaveLength(2);
    expect(result.areas[0]?.pieceId).toBe('yellow-triangle');
    expect(result.areas[0]?.area).toBeCloseTo(1, 9);
    expect(result.areas[1]?.pieceId).toBe('white-diamond');
    expect(result.areas[1]?.area).toBeCloseTo(0.5, 9);
  });
});
