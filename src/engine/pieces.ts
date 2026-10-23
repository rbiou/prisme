import { polygonKey, rotatePolygon, translatePolygon } from './geometry';
import type { GemColor, PieceKind, PlacedPiece, Point, Rotation } from './types';

export interface PieceDefinition {
  kind: PieceKind;
  color: GemColor;
  label: string;
  base: Point[];
  rotations: Point[][];
}

const BASE_SHAPES: Record<PieceKind, { color: GemColor; label: string; points: Point[] }> = {
  'red-parallelogram': {
    color: 'red',
    label: 'Parallélogramme rouge',
    points: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  'yellow-triangle': {
    color: 'yellow',
    label: 'Triangle jaune',
    points: [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ],
  },
  'blue-triangle': {
    color: 'blue',
    label: 'Grand triangle bleu',
    points: [
      { x: 0, y: 2 },
      { x: 2, y: 0 },
      { x: 4, y: 2 },
    ],
  },
  'white-triangle': {
    color: 'white',
    label: 'Grand triangle blanc',
    points: [
      { x: 0, y: 2 },
      { x: 2, y: 0 },
      { x: 4, y: 2 },
    ],
  },
  'white-diamond': {
    color: 'white',
    label: 'Losange blanc',
    points: [
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
    ],
  },
};

export const PIECE_ORDER: PieceKind[] = [
  'red-parallelogram',
  'yellow-triangle',
  'blue-triangle',
  'white-triangle',
  'white-diamond',
];

export const BASE_PIECE_KINDS: readonly PieceKind[] = PIECE_ORDER;

export const PIECE_DEFINITIONS: Record<PieceKind, PieceDefinition> = Object.fromEntries(
  PIECE_ORDER.map((kind) => {
    const shape = BASE_SHAPES[kind];
    const rotations = [0, 1, 2, 3].map((rotation) => rotatePolygon(shape.points, rotation));
    return [
      kind,
      {
        kind,
        color: shape.color,
        label: shape.label,
        base: shape.points,
        rotations,
      },
    ];
  }),
) as Record<PieceKind, PieceDefinition>;

export function isPieceKind(value: string): value is PieceKind {
  return (PIECE_ORDER as string[]).includes(value);
}

export function isRotation(value: number): value is Rotation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function colorForKind(kind: PieceKind): GemColor {
  return PIECE_DEFINITIONS[kind].color;
}

export function labelForKind(kind: PieceKind): string {
  return PIECE_DEFINITIONS[kind].label;
}

export function shapeFor(kind: PieceKind, rotation: Rotation): Point[] {
  return PIECE_DEFINITIONS[kind].rotations[rotation];
}

export function createPiece(
  kind: PieceKind,
  rotation: Rotation,
  x: number,
  y: number,
): PlacedPiece {
  return {
    id: kind,
    kind,
    color: colorForKind(kind),
    rotation,
    x,
    y,
  };
}

export function piecePolygon(piece: PlacedPiece): Point[] {
  const shape = shapeFor(piece.kind, piece.rotation);
  return translatePolygon(shape, piece.x, piece.y);
}

export function pieceBoundingBox(piece: PlacedPiece) {
  const polygon = piecePolygon(piece);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Certaines rotations produisent exactement le même polygone (parallélogramme
 * et losange). On normalise vers la plus petite rotation équivalente pour que
 * l'engagement et la comparaison de solution soient stables.
 */
export function canonicalRotation(kind: PieceKind, rotation: Rotation): Rotation {
  const target = polygonKey(shapeFor(kind, rotation));
  const rotations = PIECE_DEFINITIONS[kind].rotations;
  for (let candidate = 0; candidate < 4; candidate += 1) {
    const polygon = rotations[candidate];
    if (polygon && polygonKey(polygon) === target) {
      return candidate as Rotation;
    }
  }
  return rotation;
}

export function normalizePiece(piece: PlacedPiece): PlacedPiece {
  return {
    ...piece,
    rotation: canonicalRotation(piece.kind, piece.rotation),
  };
}
