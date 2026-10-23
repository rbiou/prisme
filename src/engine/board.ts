import type { Cell, Entry, Point, Side } from './types';

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 8;

export const TOP_LABELS = Array.from({ length: BOARD_WIDTH }, (_, index) => String(index + 1));
export const BOTTOM_LABELS = Array.from({ length: BOARD_WIDTH }, (_, index) =>
  String.fromCharCode('I'.charCodeAt(0) + index),
);
export const LEFT_LABELS = Array.from({ length: BOARD_HEIGHT }, (_, index) =>
  String.fromCharCode('A'.charCodeAt(0) + index),
);
export const RIGHT_LABELS = Array.from({ length: BOARD_HEIGHT }, (_, index) => String(index + 11));

export const ALL_ENTRIES: Entry[] = [
  ...TOP_LABELS.map((label, index) => ({ side: 'top' as const, index, label })),
  ...RIGHT_LABELS.map((label, index) => ({ side: 'right' as const, index, label })),
  ...BOTTOM_LABELS.map((label, index) => ({ side: 'bottom' as const, index, label })),
  ...LEFT_LABELS.map((label, index) => ({ side: 'left' as const, index, label })),
];

const ENTRY_BY_LABEL = new Map<string, Entry>(ALL_ENTRIES.map((entry) => [entry.label, entry]));

export function entryForLabel(label: string): Entry | undefined {
  return ENTRY_BY_LABEL.get(label);
}

export function isValidEntryLabel(label: string): boolean {
  return ENTRY_BY_LABEL.has(label);
}

export function labelForSide(side: Side, index: number): string {
  switch (side) {
    case 'top':
      return TOP_LABELS[index] ?? '';
    case 'right':
      return RIGHT_LABELS[index] ?? '';
    case 'bottom':
      return BOTTOM_LABELS[index] ?? '';
    case 'left':
      return LEFT_LABELS[index] ?? '';
  }
}

export function entryOrigin(entry: Entry): Point {
  switch (entry.side) {
    case 'top':
      return { x: entry.index + 0.5, y: 0 };
    case 'right':
      return { x: BOARD_WIDTH, y: entry.index + 0.5 };
    case 'bottom':
      return { x: entry.index + 0.5, y: BOARD_HEIGHT };
    case 'left':
      return { x: 0, y: entry.index + 0.5 };
  }
}

export function entryDirection(entry: Entry): Point {
  switch (entry.side) {
    case 'top':
      return { x: 0, y: 1 };
    case 'right':
      return { x: -1, y: 0 };
    case 'bottom':
      return { x: 0, y: -1 };
    case 'left':
      return { x: 1, y: 0 };
  }
}

export function entryRay(entry: Entry): { origin: Point; direction: Point } {
  return { origin: entryOrigin(entry), direction: entryDirection(entry) };
}

export function sideAndIndexForExit(point: Point, side?: Side): { side: Side; index: number } {
  if (side) {
    const index = side === 'top' || side === 'bottom' ? Math.floor(point.x) : Math.floor(point.y);
    return { side, index };
  }

  const distances: Array<{ side: Side; distance: number }> = [
    { side: 'top', distance: Math.abs(point.y) },
    { side: 'right', distance: Math.abs(point.x - BOARD_WIDTH) },
    { side: 'bottom', distance: Math.abs(point.y - BOARD_HEIGHT) },
    { side: 'left', distance: Math.abs(point.x) },
  ];
  distances.sort((a, b) => a.distance - b.distance);
  const nearest = distances[0];
  const resolvedSide = nearest?.side ?? 'top';
  const index =
    resolvedSide === 'top' || resolvedSide === 'bottom' ? Math.floor(point.x) : Math.floor(point.y);
  return { side: resolvedSide, index };
}

export function exitEntryForPoint(point: Point, side?: Side): Entry {
  const resolved = sideAndIndexForExit(point, side);
  return {
    side: resolved.side,
    index: resolved.index,
    label: labelForSide(resolved.side, resolved.index),
  };
}

export function cellLabel(cell: Cell): string {
  const letter = String.fromCharCode('A'.charCodeAt(0) + cell.row);
  return `${letter}${cell.col + 1}`;
}

export function parseCellLabel(label: string): Cell | null {
  const match = /^([A-H])(10|[1-9])$/i.exec(label.trim());
  if (!match || !match[1] || !match[2]) return null;
  const row = match[1].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  const col = Number(match[2]) - 1;
  if (row < 0 || row >= BOARD_HEIGHT || col < 0 || col >= BOARD_WIDTH) return null;
  return { col, row };
}

export function isCell(value: { col: number; row: number }): boolean {
  return (
    Number.isInteger(value.col) &&
    Number.isInteger(value.row) &&
    value.col >= 0 &&
    value.col < BOARD_WIDTH &&
    value.row >= 0 &&
    value.row < BOARD_HEIGHT
  );
}

export function sideLabel(side: Side): string {
  switch (side) {
    case 'top':
      return 'haut';
    case 'right':
      return 'droite';
    case 'bottom':
      return 'bas';
    case 'left':
      return 'gauche';
  }
}
