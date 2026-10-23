import { describe, expect, it } from 'vitest';
import { createPiece } from './pieces';
import { validateMine, validatePartialMine, validatePieces } from './placement';
import type { Mine, PieceKind, Rotation } from './types';

function piece(kind: PieceKind, rotation: Rotation, x: number, y: number) {
  return createPiece(kind, rotation, x, y);
}

function mineOf(pieces: ReturnType<typeof piece>[]): Mine {
  return { version: 1, pieces };
}

export const VALID_PIECES = [
  piece('red-parallelogram', 0, 1, 1),
  piece('yellow-triangle', 0, 6, 1),
  piece('blue-triangle', 0, 1, 5),
  piece('white-triangle', 0, 6, 4),
  piece('white-diamond', 0, 4, 3),
];

describe('validation du placement', () => {
  it('accepte une mine complète valide', () => {
    const result = validateMine(mineOf(VALID_PIECES));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('refuse une mine incomplète', () => {
    const result = validateMine(mineOf(VALID_PIECES.slice(0, 4)));
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'invalid-piece-count')).toBe(true);
  });

  it('refuse une pièce hors du plateau', () => {
    const result = validatePartialMine([
      piece('red-parallelogram', 0, 1, 1),
      piece('blue-triangle', 0, 8, 0),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'out-of-bounds')).toBe(true);
  });

  it('refuse un sommet hors grille', () => {
    const result = validatePartialMine([piece('red-parallelogram', 0, 1.5, 1)]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'not-on-grid')).toBe(true);
  });

  it('refuse un chevauchement', () => {
    const result = validatePartialMine([
      piece('red-parallelogram', 0, 1, 1),
      piece('white-diamond', 0, 2, 1),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'overlap')).toBe(true);
  });

  it('refuse un contact bord à bord', () => {
    const result = validatePartialMine([
      piece('red-parallelogram', 0, 1, 1),
      piece('yellow-triangle', 0, 2, 2),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'edge-contact')).toBe(true);
  });

  it('autorise un contact par un coin', () => {
    const result = validatePartialMine([
      piece('red-parallelogram', 0, 1, 1),
      piece('white-diamond', 0, 4, 1),
    ]);
    expect(result.errors.some((error) => error.code === 'edge-contact')).toBe(false);
    expect(result.errors.some((error) => error.code === 'overlap')).toBe(false);
  });

  it('refuse une gemme invisible pour tous les rayons', () => {
    const pieces = [
      piece('blue-triangle', 1, 1, 2),
      piece('white-triangle', 3, 7, 1),
      piece('yellow-triangle', 2, 4, 0),
      piece('red-parallelogram', 0, 4, 5),
      piece('white-diamond', 0, 4, 3),
    ];
    const result = validateMine(mineOf(pieces));
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'hidden-gem')).toBe(true);
  });

  it('applique la règle optionnelle de symétrie des gemmes blanches', () => {
    const whites = [piece('white-triangle', 0, 3, 1), piece('white-diamond', 0, 4, 3)];
    const withRule = validatePieces(whites, {
      requireAll: false,
      requireReachable: false,
      enforceWhiteSymmetry: true,
    });
    const withoutRule = validatePieces(whites, {
      requireAll: false,
      requireReachable: false,
      enforceWhiteSymmetry: false,
    });
    expect(withRule.errors.some((error) => error.code === 'white-symmetry')).toBe(true);
    expect(withoutRule.errors.some((error) => error.code === 'white-symmetry')).toBe(false);
  });

  it('rejette une mine qui produit une boucle', () => {
    const result = validateMine(mineOf(VALID_PIECES), { maxReflections: 0 });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === 'ray-loop')).toBe(true);
  });

  it('refuse une structure de mine invalide', () => {
    expect(validateMine({ version: 2, pieces: [] } as unknown as Mine).ok).toBe(false);
    expect(validateMine(null as unknown as Mine).ok).toBe(false);
  });
});
