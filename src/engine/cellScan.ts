import { cellCenter, cellPolygon, pointInPolygon, polygonIntersectionArea } from './geometry';
import { isSpecialPieceKind, PIECE_ORDER, piecePolygon } from './pieces';
import type {
  Cell,
  CellScanArea,
  CellScanResult,
  Mine,
  PieceKind,
  SpecialPieceKind,
} from './types';

function priority(kind: PieceKind): number {
  return PIECE_ORDER.indexOf(kind);
}

function specialForKind(kind: PieceKind): SpecialPieceKind | null {
  return isSpecialPieceKind(kind) ? kind : null;
}

export function scanCell(mine: Mine, cell: Cell): CellScanResult {
  const cellShape = cellPolygon(cell);
  const center = cellCenter(cell);
  const areas: CellScanArea[] = [];

  for (const piece of mine.pieces) {
    const polygon = piecePolygon(piece);
    const area = polygonIntersectionArea(cellShape, polygon);
    if (area > 1e-7) {
      areas.push({
        pieceId: piece.id,
        color: piece.color,
        special: specialForKind(piece.kind),
        area,
      });
    }
  }

  areas.sort((a, b) => {
    if (Math.abs(b.area - a.area) > 1e-7) return b.area - a.area;
    return priority(a.pieceId) - priority(b.pieceId);
  });

  const best = areas[0];
  if (!best) {
    return { cell, color: null, special: null, pieceId: null, areas: [] };
  }

  const tied = areas.filter((entry) => Math.abs(entry.area - best.area) <= 1e-7);
  let chosen = best;

  if (tied.length > 1) {
    const containing = tied.filter((entry) => {
      const piece = mine.pieces.find((candidate) => candidate.id === entry.pieceId);
      if (!piece) return false;
      const polygon = piecePolygon(piece);
      return pointInPolygon(center, polygon);
    });
    if (containing.length > 0) {
      chosen = containing[0] ?? best;
    }
  }

  return {
    cell,
    color: chosen.color,
    special: chosen.special,
    pieceId: chosen.pieceId,
    areas,
  };
}
