import { BOARD_HEIGHT, BOARD_WIDTH } from './board';
import { boundingBox, polygonsEqual, polygonsOverlap, sharedBoundaryLength } from './geometry';
import {
  BASE_PIECE_KINDS,
  colorForKind,
  isPieceKind,
  isRotation,
  piecePolygon,
  PIECE_ORDER,
} from './pieces';
import { hitPieceIds, simulateAllRays } from './ray';
import type {
  Mine,
  PieceKind,
  PlacedPiece,
  Point,
  ValidationError,
  ValidationOptions,
  ValidationResult,
} from './types';

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  enforceWhiteSymmetry: true,
  requireReachable: true,
  rejectLoops: true,
  maxReflections: 512,
};

function isInteger(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-9;
}

function geometryErrors(piece: PlacedPiece): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!isPieceKind(piece.kind)) {
    return [
      {
        code: 'invalid-piece-kind',
        message: `Type de gemme inconnu : ${String(piece.kind)}.`,
        pieceId: piece.id,
      },
    ];
  }
  if (!isRotation(piece.rotation)) {
    errors.push({
      code: 'invalid-rotation',
      message: `Rotation invalide pour ${piece.kind}.`,
      pieceId: piece.id,
    });
  }
  if (piece.id !== piece.kind) {
    errors.push({
      code: 'invalid-piece-kind',
      message: `L'identifiant de la pièce doit correspondre à son type (${piece.kind}).`,
      pieceId: piece.id,
    });
  }
  if (piece.color !== colorForKind(piece.kind)) {
    errors.push({
      code: 'invalid-piece-kind',
      message: `Couleur incohérente pour ${piece.kind}.`,
      pieceId: piece.id,
    });
  }
  if (!isInteger(piece.x) || !isInteger(piece.y)) {
    errors.push({
      code: 'not-on-grid',
      message: `L'ancre de ${piece.kind} doit être sur une intersection entière.`,
      pieceId: piece.id,
    });
  }

  const polygon = piecePolygon(piece);
  for (const point of polygon) {
    if (!isInteger(point.x) || !isInteger(point.y)) {
      errors.push({
        code: 'not-on-grid',
        message: `Un sommet de ${piece.kind} n'est pas sur une intersection de la grille.`,
        pieceId: piece.id,
      });
      break;
    }
  }

  const box = boundingBox(polygon);
  if (
    box.minX < -1e-9 ||
    box.minY < -1e-9 ||
    box.maxX > BOARD_WIDTH + 1e-9 ||
    box.maxY > BOARD_HEIGHT + 1e-9
  ) {
    errors.push({
      code: 'out-of-bounds',
      message: `${piece.kind} dépasse du plateau.`,
      pieceId: piece.id,
    });
  }

  return errors;
}

function setErrors(pieces: PlacedPiece[], requireAll: boolean): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Set<PieceKind>();
  for (const piece of pieces) {
    if (seen.has(piece.kind)) {
      errors.push({
        code: 'duplicate-piece',
        message: `La gemme ${piece.kind} est présente plusieurs fois.`,
        pieceId: piece.id,
      });
    }
    seen.add(piece.kind);
  }

  if (requireAll) {
    for (const kind of BASE_PIECE_KINDS) {
      if (!seen.has(kind)) {
        errors.push({
          code: 'invalid-piece-count',
          message: `La mine doit contenir la gemme ${kind}.`,
          pieceId: kind,
        });
      }
    }
    if (pieces.length !== BASE_PIECE_KINDS.length) {
      errors.push({
        code: 'invalid-piece-count',
        message: `La mine doit contenir exactement ${BASE_PIECE_KINDS.length} gemmes.`,
      });
    }
  }

  for (const piece of pieces) {
    if (!isPieceKind(piece.kind)) {
      errors.push({
        code: 'invalid-piece-kind',
        message: `Type de gemme inconnu : ${String(piece.kind)}.`,
        pieceId: piece.id,
      });
    }
  }

  return errors;
}

function pairErrors(pieces: PlacedPiece[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (let i = 0; i < pieces.length; i += 1) {
    const first = pieces[i];
    if (!first) continue;
    const firstPolygon = piecePolygon(first);
    for (let j = i + 1; j < pieces.length; j += 1) {
      const second = pieces[j];
      if (!second) continue;
      const secondPolygon = piecePolygon(second);
      if (polygonsOverlap(firstPolygon, secondPolygon)) {
        errors.push({
          code: 'overlap',
          message: `${first.kind} et ${second.kind} se chevauchent.`,
          pieceId: first.id,
        });
        continue;
      }
      if (sharedBoundaryLength(firstPolygon, secondPolygon) > 1e-6) {
        errors.push({
          code: 'edge-contact',
          message: `${first.kind} et ${second.kind} se touchent bord à bord.`,
          pieceId: first.id,
        });
      }
    }
  }
  return errors;
}

export function reflectPolygon(polygon: Point[], axis: 'vertical' | 'horizontal'): Point[] {
  if (axis === 'vertical') {
    return polygon.map((point) => ({ x: BOARD_WIDTH - point.x, y: point.y }));
  }
  return polygon.map((point) => ({ x: point.x, y: BOARD_HEIGHT - point.y }));
}

function whiteSetIsSymmetric(pieces: PlacedPiece[]): boolean {
  const whites = pieces.filter((piece) => piece.color === 'white');
  if (whites.length !== 2) return false;
  const polygons = whites.map(piecePolygon);
  const first = polygons[0];
  const second = polygons[1];
  if (!first || !second) return false;

  for (const axis of ['vertical', 'horizontal'] as const) {
    const reflectedFirst = reflectPolygon(first, axis);
    const reflectedSecond = reflectPolygon(second, axis);
    const direct = polygonsEqual(reflectedFirst, first) && polygonsEqual(reflectedSecond, second);
    const swapped = polygonsEqual(reflectedFirst, second) && polygonsEqual(reflectedSecond, first);
    if (direct || swapped) return true;
  }
  return false;
}

function whiteSymmetryError(pieces: PlacedPiece[]): ValidationError | null {
  if (!whiteSetIsSymmetric(pieces)) return null;
  return {
    code: 'white-symmetry',
    message:
      'Les deux gemmes blanches sont parfaitement symétriques par rapport à un axe du plateau. Décalez ou tournez l’une d’elles.',
  };
}

export interface ValidatePiecesOptions extends ValidationOptions {
  requireAll?: boolean;
}

export function validatePieces(
  pieces: PlacedPiece[],
  options: ValidatePiecesOptions = {},
): ValidationResult {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const errors: ValidationError[] = [];

  errors.push(...setErrors(pieces, options.requireAll ?? true));
  for (const piece of pieces) {
    errors.push(...geometryErrors(piece));
  }
  errors.push(...pairErrors(pieces));

  if (resolved.enforceWhiteSymmetry) {
    const symmetryError = whiteSymmetryError(pieces);
    if (symmetryError) errors.push(symmetryError);
  }

  const structuralErrorCodes = new Set([
    'invalid-mine',
    'invalid-piece-count',
    'invalid-piece-kind',
    'duplicate-piece',
    'invalid-rotation',
    'not-on-grid',
    'out-of-bounds',
    'overlap',
    'edge-contact',
  ]);
  const hasStructuralError = errors.some((error) => structuralErrorCodes.has(error.code));

  if (!hasStructuralError && resolved.requireReachable) {
    const mine: Mine = { version: 1, pieces };
    const rays = simulateAllRays(mine, { maxReflections: resolved.maxReflections });
    if (resolved.rejectLoops) {
      for (const ray of rays) {
        if (ray.status === 'loop') {
          errors.push({
            code: 'ray-loop',
            message: `Le rayon entrant par ${ray.entry.label} boucle indéfiniment.`,
            entry: ray.entry,
          });
        }
      }
    }
    const reached = hitPieceIds(rays);
    for (const piece of pieces) {
      if (!reached.has(piece.kind)) {
        errors.push({
          code: 'hidden-gem',
          message: `${piece.kind} n’est atteinte par aucun rayon.`,
          pieceId: piece.id,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateMine(mine: Mine, options: ValidationOptions = {}): ValidationResult {
  if (!mine || mine.version !== 1 || !Array.isArray(mine.pieces)) {
    return {
      ok: false,
      errors: [{ code: 'invalid-mine', message: 'Structure de mine invalide.' }],
    };
  }
  return validatePieces(mine.pieces, { ...options, requireAll: true });
}

export function validatePartialMine(pieces: PlacedPiece[]): ValidationResult {
  return validatePieces(pieces, {
    requireAll: false,
    requireReachable: false,
    rejectLoops: false,
    enforceWhiteSymmetry: false,
  });
}

export function sortedPieces(pieces: PlacedPiece[]): PlacedPiece[] {
  return [...pieces].sort((a, b) => PIECE_ORDER.indexOf(a.kind) - PIECE_ORDER.indexOf(b.kind));
}
