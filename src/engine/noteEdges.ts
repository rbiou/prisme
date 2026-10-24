import { isGemColor } from './colors';
import type { Cell, GemColor } from './types';

/** Type d’arête notée sur le plateau privé. */
export type NoteEdgeKind = 'horizontal' | 'vertical' | 'diagonal-down' | 'diagonal-up';

/** Côté d’une case que l’on peut désigner dans l’interface. */
export type CellEdgeSide = 'top' | 'right' | 'bottom' | 'left' | 'diagonal-down' | 'diagonal-up';

export interface NoteEdgeMark {
  kind: NoteEdgeKind;
  col: number;
  row: number;
  color: GemColor;
}

export interface EdgeSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Une arête est identifiée par sa position canonique, pas par la case d’où on la dessine. */
export interface CanonicalEdge {
  kind: NoteEdgeKind;
  col: number;
  row: number;
}

const BOUNDS: Record<NoteEdgeKind, { maxCol: number; maxRow: number }> = {
  horizontal: { maxCol: 9, maxRow: 8 },
  vertical: { maxCol: 10, maxRow: 7 },
  'diagonal-down': { maxCol: 9, maxRow: 7 },
  'diagonal-up': { maxCol: 9, maxRow: 7 },
};

function isIntegerInRange(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

/**
 * Convertit « le côté haut de la case E4 » en arête canonique : une arête
 * partagée par deux cases n’existe qu’une seule fois dans les notes.
 */
export function edgeForCellSide(cell: Cell, side: CellEdgeSide): CanonicalEdge {
  switch (side) {
    case 'top':
      return { kind: 'horizontal', col: cell.col, row: cell.row };
    case 'bottom':
      return { kind: 'horizontal', col: cell.col, row: cell.row + 1 };
    case 'left':
      return { kind: 'vertical', col: cell.col, row: cell.row };
    case 'right':
      return { kind: 'vertical', col: cell.col + 1, row: cell.row };
    case 'diagonal-down':
      return { kind: 'diagonal-down', col: cell.col, row: cell.row };
    case 'diagonal-up':
      return { kind: 'diagonal-up', col: cell.col, row: cell.row };
  }
}

export function sameEdge(a: CanonicalEdge, b: CanonicalEdge): boolean {
  return a.kind === b.kind && a.col === b.col && a.row === b.row;
}

/**
 * Ajoute, recolore ou retire une arête. Toucher la même arête avec la même
 * couleur la retire ; avec une autre couleur, elle est recolorée.
 */
export function upsertNoteEdge(
  marks: NoteEdgeMark[],
  cell: Cell,
  side: CellEdgeSide,
  color: GemColor,
): NoteEdgeMark[] {
  const edge = edgeForCellSide(cell, side);
  const existing = marks.find((mark) => sameEdge(mark, edge));
  if (existing && existing.color === color) {
    return marks.filter((mark) => mark !== existing);
  }
  if (existing) {
    return marks.map((mark) => (mark === existing ? { ...edge, color } : mark));
  }
  return [...marks, { ...edge, color }];
}

export function edgeSegment(mark: CanonicalEdge): EdgeSegment {
  switch (mark.kind) {
    case 'horizontal':
      return { x1: mark.col, y1: mark.row, x2: mark.col + 1, y2: mark.row };
    case 'vertical':
      return { x1: mark.col, y1: mark.row, x2: mark.col, y2: mark.row + 1 };
    case 'diagonal-down':
      return { x1: mark.col, y1: mark.row, x2: mark.col + 1, y2: mark.row + 1 };
    case 'diagonal-up':
      return { x1: mark.col + 1, y1: mark.row, x2: mark.col, y2: mark.row + 1 };
  }
}

export function isNoteEdgeMark(value: unknown): value is NoteEdgeMark {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    kind?: unknown;
    col?: unknown;
    row?: unknown;
    color?: unknown;
  };
  if (typeof candidate.kind !== 'string') return false;
  const bounds = BOUNDS[candidate.kind as NoteEdgeKind];
  if (!bounds) return false;
  if (!isIntegerInRange(candidate.col, bounds.maxCol)) return false;
  if (!isIntegerInRange(candidate.row, bounds.maxRow)) return false;
  return typeof candidate.color === 'string' && isGemColor(candidate.color);
}
