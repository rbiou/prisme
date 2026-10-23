import { describe, expect, it } from 'vitest';
import { polygonArea, boundingBox } from './geometry';
import {
  BASE_PIECE_KINDS,
  PIECE_DEFINITIONS,
  canonicalRotation,
  colorForKind,
  createPiece,
  labelForKind,
  pieceBoundingBox,
  piecePolygon,
  shapeFor,
} from './pieces';
import type { PieceKind } from './types';

const EXPECTED = {
  'red-parallelogram': { area: 2, width: 3, height: 1, color: 'red' },
  'yellow-triangle': { area: 2, width: 2, height: 2, color: 'yellow' },
  'blue-triangle': { area: 4, width: 4, height: 2, color: 'blue' },
  'white-triangle': { area: 4, width: 4, height: 2, color: 'white' },
  'white-diamond': { area: 2, width: 2, height: 2, color: 'white' },
} as const;

describe('pieces', () => {
  it('définit exactement les cinq gemmes de la boîte de base', () => {
    expect(BASE_PIECE_KINDS).toHaveLength(5);
    expect(new Set(BASE_PIECE_KINDS).size).toBe(5);
    expect([...BASE_PIECE_KINDS].sort()).toEqual(
      [
        'blue-triangle',
        'red-parallelogram',
        'white-diamond',
        'white-triangle',
        'yellow-triangle',
      ].sort(),
    );
  });

  it.each(Object.entries(EXPECTED) as Array<[PieceKind, (typeof EXPECTED)[PieceKind]]>)(
    'conserve l’aire et la boîte englobante de %s à chaque rotation',
    (kind, expected) => {
      expect(colorForKind(kind)).toBe(expected.color);
      expect(labelForKind(kind).length).toBeGreaterThan(3);

      for (const rotation of [0, 1, 2, 3] as const) {
        const polygon = shapeFor(kind, rotation);
        const box = boundingBox(polygon);
        expect(polygonArea(polygon)).toBeCloseTo(expected.area, 9);
        if (rotation % 2 === 0) {
          expect(box.width).toBeCloseTo(expected.width, 9);
          expect(box.height).toBeCloseTo(expected.height, 9);
        } else {
          expect(box.width).toBeCloseTo(expected.height, 9);
          expect(box.height).toBeCloseTo(expected.width, 9);
        }
        for (const point of polygon) {
          expect(Number.isInteger(point.x)).toBe(true);
          expect(Number.isInteger(point.y)).toBe(true);
        }
        expect(box.minX).toBeCloseTo(0, 9);
        expect(box.minY).toBeCloseTo(0, 9);
      }
    },
  );

  it('place une pièce sur la grille à partir de son ancre', () => {
    const piece = createPiece('white-diamond', 0, 4, 3);
    const polygon = piecePolygon(piece);
    expect(polygon).toEqual([
      { x: 5, y: 3 },
      { x: 6, y: 4 },
      { x: 5, y: 5 },
      { x: 4, y: 4 },
    ]);
    expect(pieceBoundingBox(piece)).toMatchObject({ width: 2, height: 2 });
    expect(piece.color).toBe('white');
    expect(piece.id).toBe(piece.kind);
  });

  it('normalise les rotations équivalentes', () => {
    expect(canonicalRotation('red-parallelogram', 2)).toBe(0);
    expect(canonicalRotation('white-diamond', 1)).toBe(0);
    expect(canonicalRotation('white-diamond', 3)).toBe(0);
    expect(canonicalRotation('yellow-triangle', 1)).toBe(1);
  });

  it('ne retourne jamais une pièce : les rotations sont seulement des quarts de tour', () => {
    const red = PIECE_DEFINITIONS['red-parallelogram'];
    const rotatedOnce = red.rotations[1]!;
    const mirrored = red.base.map((point) => ({ x: -point.x, y: point.y }));
    const normalize = (points: Array<{ x: number; y: number }>) => {
      const box = boundingBox(points);
      return points.map((point) => ({ x: point.x - box.minX, y: point.y - box.minY }));
    };
    expect(normalize(rotatedOnce)).not.toEqual(normalize(mirrored));
  });
});
