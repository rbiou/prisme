import { isCell } from './board';
import { isGemColor } from './colors';
import type { Cell, GemColor } from './types';

/** Note « cette case contient une gemme de cette couleur, forme inconnue ». */
export interface ColorMark {
  cell: Cell;
  color: GemColor;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function colorMarkAt(marks: ColorMark[], cell: Cell): ColorMark | undefined {
  return marks.find((mark) => sameCell(mark.cell, cell));
}

/**
 * Pose, recolore ou retire un rond. Toucher la même case avec la même couleur
 * retire le rond ; avec une autre couleur, elle le recolore.
 */
export function upsertColorMark(marks: ColorMark[], cell: Cell, color: GemColor): ColorMark[] {
  const existing = colorMarkAt(marks, cell);
  if (existing && existing.color === color) {
    return marks.filter((mark) => mark !== existing);
  }
  if (existing) {
    return marks.map((mark) => (mark === existing ? { cell, color } : mark));
  }
  return [...marks, { cell, color }];
}

export function isColorMark(value: unknown): value is ColorMark {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { cell?: unknown; color?: unknown };
  if (!candidate.cell || typeof candidate.cell !== 'object') return false;
  const cell = candidate.cell as { col?: unknown; row?: unknown };
  if (typeof cell.col !== 'number' || typeof cell.row !== 'number') return false;
  if (!isCell({ col: cell.col, row: cell.row })) return false;
  return typeof candidate.color === 'string' && isGemColor(candidate.color);
}
