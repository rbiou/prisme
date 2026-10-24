import { BOARD_HEIGHT, BOARD_WIDTH, isCell } from './board';
import { polygonsEqual } from './geometry';
import {
  BASE_PIECE_KINDS,
  canonicalRotation,
  colorForKind,
  isPieceKind,
  isRotation,
  PIECE_ORDER,
  piecePolygon,
} from './pieces';
import { validatePieces } from './placement';
import type {
  Mine,
  PieceKind,
  PlacedPiece,
  SerializedMine,
  SerializedNote,
  SerializedPiece,
} from './types';

export function createEmptyMine(): Mine {
  return { version: 1, pieces: [] };
}

export function sortMinePieces(pieces: PlacedPiece[]): PlacedPiece[] {
  return [...pieces].sort((a, b) => PIECE_ORDER.indexOf(a.kind) - PIECE_ORDER.indexOf(b.kind));
}

export function upsertPiece(mine: Mine, piece: PlacedPiece): Mine {
  const existing = mine.pieces.filter((candidate) => candidate.kind !== piece.kind);
  return { version: 1, pieces: sortMinePieces([...existing, piece]) };
}

export function removePiece(mine: Mine, kind: PieceKind): Mine {
  return {
    version: 1,
    pieces: mine.pieces.filter((piece) => piece.kind !== kind),
  };
}

export function getPiece(mine: Mine, kind: PieceKind): PlacedPiece | undefined {
  return mine.pieces.find((piece) => piece.kind === kind);
}

export function isCompleteMine(mine: Mine): boolean {
  if (mine.pieces.length !== BASE_PIECE_KINDS.length) return false;
  const kinds = new Set(mine.pieces.map((piece) => piece.kind));
  return BASE_PIECE_KINDS.every((kind) => kinds.has(kind));
}

export function serializeMine(mine: Mine): SerializedMine {
  const pieces: SerializedPiece[] = sortMinePieces(mine.pieces).map((piece) => ({
    kind: piece.kind,
    rotation: canonicalRotation(piece.kind, piece.rotation),
    x: piece.x,
    y: piece.y,
  }));
  return { version: 1, pieces };
}

function isSerializedPieceValue(value: unknown, seen: Set<PieceKind>): boolean {
  if (!value || typeof value !== 'object') return false;
  const piece = value as Record<string, unknown>;
  if (
    typeof piece.kind !== 'string' ||
    !isPieceKind(piece.kind) ||
    typeof piece.rotation !== 'number' ||
    !isRotation(piece.rotation) ||
    typeof piece.x !== 'number' ||
    typeof piece.y !== 'number' ||
    !Number.isInteger(piece.x) ||
    !Number.isInteger(piece.y) ||
    piece.x < 0 ||
    piece.x >= BOARD_WIDTH ||
    piece.y < 0 ||
    piece.y >= BOARD_HEIGHT
  ) {
    return false;
  }
  if (seen.has(piece.kind)) return false;
  seen.add(piece.kind);
  return true;
}

export function isSerializedMine(value: unknown): value is SerializedMine {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { version?: unknown; pieces?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.pieces)) return false;
  if (candidate.pieces.length !== BASE_PIECE_KINDS.length) return false;

  const seen = new Set<PieceKind>();
  for (const item of candidate.pieces) {
    if (!isSerializedPieceValue(item, seen)) return false;
  }
  return BASE_PIECE_KINDS.every((kind) => seen.has(kind));
}

export function isSerializedNote(value: unknown): value is SerializedNote {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { version?: unknown; pieces?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.pieces)) return false;
  if (candidate.pieces.length > BASE_PIECE_KINDS.length) return false;
  const seen = new Set<PieceKind>();
  for (const item of candidate.pieces) {
    if (!isSerializedPieceValue(item, seen)) return false;
  }
  return true;
}

export function serializeNote(mine: Mine): SerializedNote {
  const pieces: SerializedPiece[] = sortMinePieces(mine.pieces).map((piece) => ({
    kind: piece.kind,
    rotation: canonicalRotation(piece.kind, piece.rotation),
    x: piece.x,
    y: piece.y,
  }));
  return { version: 1, pieces };
}

export function deserializeNote(note: SerializedNote): Mine {
  return {
    version: 1,
    pieces: sortMinePieces(
      note.pieces.map((piece) => ({
        id: piece.kind,
        kind: piece.kind,
        color: colorForKind(piece.kind),
        rotation: piece.rotation,
        x: piece.x,
        y: piece.y,
      })),
    ),
  };
}

export function deserializeMine(serialized: SerializedMine): Mine {
  return deserializeNote(serialized);
}

export function canonicalMineJson(mine: Mine): string {
  const serialized = serializeMine(mine);
  return JSON.stringify({
    version: 1,
    pieces: serialized.pieces.map((piece) => ({
      kind: piece.kind,
      rotation: piece.rotation,
      x: piece.x,
      y: piece.y,
    })),
  });
}

export function minePolygons(mine: Mine): Map<PieceKind, ReturnType<typeof piecePolygon>> {
  const result = new Map<PieceKind, ReturnType<typeof piecePolygon>>();
  for (const piece of mine.pieces) {
    result.set(piece.kind, piecePolygon(piece));
  }
  return result;
}

export function mineEquals(a: Mine, b: Mine): boolean {
  if (a.pieces.length !== b.pieces.length) return false;
  const polygonsA = minePolygons(a);
  const polygonsB = minePolygons(b);
  for (const [kind, polygonA] of polygonsA) {
    const polygonB = polygonsB.get(kind);
    if (!polygonB || !polygonsEqual(polygonA, polygonB)) return false;
  }
  return true;
}

export interface SolutionCheck {
  correct: boolean;
  reason?: string;
}

export function checkSolution(candidate: SerializedMine, mine: Mine): SolutionCheck {
  if (!isSerializedMine(candidate)) {
    return { correct: false, reason: 'La proposition est incomplète ou mal formée.' };
  }
  const candidateMine = deserializeMine(candidate);
  const validation = validatePieces(candidateMine.pieces, {
    requireAll: true,
    requireReachable: false,
    rejectLoops: false,
    enforceWhiteSymmetry: false,
  });
  if (!validation.ok) {
    return {
      correct: false,
      reason: validation.errors[0]?.message ?? 'La proposition est invalide.',
    };
  }
  return mineEquals(candidateMine, mine)
    ? { correct: true }
    : { correct: false, reason: 'La disposition ne correspond pas à la mine.' };
}

export function isCellCoordinate(value: unknown): value is { col: number; row: number } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { col?: unknown; row?: unknown };
  return (
    typeof candidate.col === 'number' &&
    typeof candidate.row === 'number' &&
    isCell({ col: candidate.col, row: candidate.row })
  );
}
