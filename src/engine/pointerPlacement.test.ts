import { describe, expect, it } from 'vitest';
import { createPiece } from './pieces';
import {
  canPlacePiece,
  cellsTouchedByPiece,
  clampOrigin,
  nearestValidOrigin,
  originForPoint,
} from './pointerPlacement';
import type { Mine } from './types';

function mineWith(...pieces: ReturnType<typeof createPiece>[]): Mine {
  return { version: 1, pieces };
}

describe('pointerPlacement — ancrage sous le doigt', () => {
  it('centre le parallélogramme sous le point touché', () => {
    const origin = originForPoint('red-parallelogram', 0, { x: 5.5, y: 4.5 });
    expect(origin).toEqual({ x: 4, y: 4 });
  });

  it('ramène la gemme dans le plateau sans la couper', () => {
    expect(clampOrigin('red-parallelogram', 0, -4, -2)).toEqual({ x: 0, y: 0 });
    expect(clampOrigin('red-parallelogram', 0, 20, 20)).toEqual({ x: 7, y: 7 });
    expect(clampOrigin('blue-triangle', 0, 20, 20)).toEqual({ x: 6, y: 6 });
  });
});

describe('pointerPlacement — validité', () => {
  it('accepte une gemme seule', () => {
    const mine = mineWith();
    expect(canPlacePiece(mine, createPiece('red-parallelogram', 0, 2, 2))).toBe(true);
  });

  it('refuse un chevauchement', () => {
    const mine = mineWith(createPiece('red-parallelogram', 0, 0, 0));
    expect(canPlacePiece(mine, createPiece('yellow-triangle', 0, 0, 0))).toBe(false);
  });

  it('refuse un contact bord à bord', () => {
    const mine = mineWith(createPiece('red-parallelogram', 0, 0, 0));
    expect(canPlacePiece(mine, createPiece('yellow-triangle', 0, 1, 1))).toBe(false);
  });

  it('autorise un contact par un coin', () => {
    const mine = mineWith(createPiece('red-parallelogram', 0, 0, 0));
    expect(canPlacePiece(mine, createPiece('yellow-triangle', 0, 3, 1))).toBe(true);
  });

  it('ignore la gemme de même type qui sera remplacée', () => {
    const mine = mineWith(createPiece('red-parallelogram', 0, 0, 0));
    expect(canPlacePiece(mine, createPiece('red-parallelogram', 0, 5, 5))).toBe(true);
  });
});

describe('pointerPlacement — accroche', () => {
  it('trouve une position valide proche quand la cible est occupée', () => {
    const mine = mineWith(createPiece('red-parallelogram', 0, 0, 0));
    const origin = nearestValidOrigin(mine, 'yellow-triangle', 0, { x: 0, y: 0 });
    expect(canPlacePiece(mine, createPiece('yellow-triangle', 0, origin.x, origin.y))).toBe(true);
    expect(Math.hypot(origin.x, origin.y)).toBeLessThanOrEqual(3);
  });

  it('renvoie la cible quand aucun rayon de recherche ne convient', () => {
    const mine = mineWith(createPiece('red-parallelogram', 0, 0, 0));
    expect(nearestValidOrigin(mine, 'yellow-triangle', 0, { x: 0, y: 0 }, false, 0)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('liste les cases réellement recouvertes par la gemme', () => {
    const cells = cellsTouchedByPiece(createPiece('red-parallelogram', 0, 0, 0));
    expect(cells).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ]);
  });

  it('ignore les cases libres de la boîte englobante d’un triangle', () => {
    const triangle = cellsTouchedByPiece(createPiece('yellow-triangle', 0, 0, 0));
    expect(triangle).not.toContainEqual({ col: 1, row: 1 });
    expect(triangle).toEqual(
      expect.arrayContaining([
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 0, row: 1 },
      ]),
    );
  });
});
