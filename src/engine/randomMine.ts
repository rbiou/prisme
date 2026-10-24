import { BOARD_HEIGHT, BOARD_WIDTH } from './board';
import { sortMinePieces } from './mine';
import { PIECE_ORDER, createPiece, pieceBoundingBox } from './pieces';
import { validateMine, validatePartialMine } from './placement';
import type { Mine, PieceKind, PlacedPiece } from './types';

export interface RandomMineOptions {
  enforceWhiteSymmetry?: boolean;
  /** Budget de nœuds pour éviter une recherche sans fin. */
  maxNodes?: number;
  random?: () => number;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

function candidatesFor(kind: PieceKind, random: () => number): PlacedPiece[] {
  const candidates: PlacedPiece[] = [];
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const shape = createPiece(kind, rotation as 0 | 1 | 2 | 3, 0, 0);
    const box = pieceBoundingBox(shape);
    const maxX = Math.floor(BOARD_WIDTH - box.width);
    const maxY = Math.floor(BOARD_HEIGHT - box.height);
    for (let y = 0; y <= maxY; y += 1) {
      for (let x = 0; x <= maxX; x += 1) {
        candidates.push(createPiece(kind, rotation as 0 | 1 | 2 | 3, x, y));
      }
    }
  }
  return shuffled(candidates, random);
}

/**
 * Cherche une mine complète et valide par tirage aléatoire avec retour arrière.
 * Utilisé par le bouton « Placer au hasard » ; renvoie null si le budget est
 * épuisé.
 */
export function generateRandomMine(options: RandomMineOptions = {}): Mine | null {
  const random = options.random ?? Math.random;
  const maxNodes = options.maxNodes ?? 30_000;
  const pools = PIECE_ORDER.map((kind) => candidatesFor(kind, random));
  const placed: PlacedPiece[] = [];
  let nodes = 0;

  function search(index: number): Mine | null {
    if (nodes > maxNodes) return null;
    if (index >= PIECE_ORDER.length) {
      const mine = { version: 1 as const, pieces: sortMinePieces(placed) };
      return validateMine(mine, {
        enforceWhiteSymmetry: options.enforceWhiteSymmetry ?? true,
      }).ok
        ? mine
        : null;
    }

    const pool = pools[index];
    if (!pool) return null;
    for (const candidate of pool) {
      nodes += 1;
      if (nodes > maxNodes) return null;
      const next = [...placed, candidate];
      if (!validatePartialMine(next).ok) continue;
      placed.push(candidate);
      const found = search(index + 1);
      if (found) return found;
      placed.pop();
    }
    return null;
  }

  return search(0);
}
