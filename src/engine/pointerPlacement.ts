import { BOARD_HEIGHT, BOARD_WIDTH } from './board';
import {
  AREA_EPS,
  boundingBox,
  cellPolygon,
  polygonIntersectionArea,
  polygonsOverlap,
  sharedBoundaryLength,
  type BBox,
} from './geometry';
import { createPiece, piecePolygon, shapeFor } from './pieces';
import type { Cell, Mine, PieceKind, PlacedPiece, Point, Rotation } from './types';

export interface PieceOrigin {
  x: number;
  y: number;
}

function shapeBox(kind: PieceKind, rotation: Rotation): BBox {
  return boundingBox(shapeFor(kind, rotation));
}

/** Position entière la plus proche du point, avec la gemme centrée sous le doigt. */
export function originForPoint(kind: PieceKind, rotation: Rotation, point: Point): PieceOrigin {
  const box = shapeBox(kind, rotation);
  return clampOrigin(
    kind,
    rotation,
    Math.round(point.x - box.width / 2),
    Math.round(point.y - box.height / 2),
  );
}

/** Ramène l’ancre dans le plateau sans jamais couper la gemme. */
export function clampOrigin(
  kind: PieceKind,
  rotation: Rotation,
  x: number,
  y: number,
): PieceOrigin {
  const box = shapeBox(kind, rotation);
  const width = Math.round(box.width);
  const height = Math.round(box.height);
  const maxX = Math.max(0, BOARD_WIDTH - width);
  const maxY = Math.max(0, BOARD_HEIGHT - height);
  return {
    x: Math.min(Math.max(0, Number.isFinite(x) ? Math.round(x) : 0), maxX),
    y: Math.min(Math.max(0, Number.isFinite(y) ? Math.round(y) : 0), maxY),
  };
}

/**
 * Vérifie qu’une gemme peut être posée sans chevauchement ni contact bord à bord.
 * La gemme de même type déjà présente est ignorée : elle sera remplacée.
 */
export function canPlacePiece(mine: Mine, piece: PlacedPiece): boolean {
  const polygon = piecePolygon(piece);
  const box = boundingBox(polygon);
  if (
    box.minX < -1e-9 ||
    box.minY < -1e-9 ||
    box.maxX > BOARD_WIDTH + 1e-9 ||
    box.maxY > BOARD_HEIGHT + 1e-9
  ) {
    return false;
  }

  for (const other of mine.pieces) {
    if (other.kind === piece.kind) continue;
    const otherPolygon = piecePolygon(other);
    if (polygonsOverlap(polygon, otherPolygon)) return false;
    if (sharedBoundaryLength(polygon, otherPolygon) > 1e-6) return false;
  }
  return true;
}

/**
 * Cherche l’ancre valide la plus proche de la position souhaitée. Si aucune
 * position proche ne convient, renvoie la position souhaitée pour que le
 * fantôme reste visible en rouge.
 */
export function nearestValidOrigin(
  mine: Mine,
  kind: PieceKind,
  rotation: Rotation,
  desired: PieceOrigin,
  flipped = false,
  maxRadius = 3,
): PieceOrigin {
  const base = clampOrigin(kind, rotation, desired.x, desired.y);
  const fits = (origin: PieceOrigin) =>
    canPlacePiece(mine, createPiece(kind, rotation, origin.x, origin.y, flipped));
  if (fits(base)) return base;

  const candidates: Array<PieceOrigin & { distance: number }> = [];
  const seen = new Set<string>();
  for (let dy = -maxRadius; dy <= maxRadius; dy += 1) {
    for (let dx = -maxRadius; dx <= maxRadius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const origin = clampOrigin(kind, rotation, base.x + dx, base.y + dy);
      const key = `${origin.x},${origin.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ...origin, distance: dx * dx + dy * dy });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  for (const candidate of candidates) {
    if (fits(candidate)) return { x: candidate.x, y: candidate.y };
  }
  return base;
}

/** Cases réellement recouvertes par le polygone d’une gemme. */
export function cellsTouchedByPiece(piece: PlacedPiece): Cell[] {
  const polygon = piecePolygon(piece);
  const box = boundingBox(polygon);
  const cells: Cell[] = [];
  const minCol = Math.max(0, Math.floor(box.minX));
  const maxCol = Math.min(BOARD_WIDTH - 1, Math.ceil(box.maxX) - 1);
  const minRow = Math.max(0, Math.floor(box.minY));
  const maxRow = Math.min(BOARD_HEIGHT - 1, Math.ceil(box.maxY) - 1);
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const cell = { col, row };
      if (polygonIntersectionArea(polygon, cellPolygon(cell)) > AREA_EPS) {
        cells.push(cell);
      }
    }
  }
  return cells;
}
