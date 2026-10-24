import { describe, expect, it } from 'vitest';
import { createPiece } from './pieces';
import {
  canonicalMineJson,
  checkSolution,
  createEmptyMine,
  deserializeMine,
  deserializeNote,
  getPiece,
  isCellCoordinate,
  isCompleteMine,
  isSerializedMine,
  isSerializedNote,
  mineEquals,
  removePiece,
  serializeMine,
  serializeNote,
  upsertPiece,
} from './mine';
import type { Mine, SerializedMine } from './types';

const VALID_PIECES = [
  createPiece('red-parallelogram', 0, 1, 1),
  createPiece('yellow-triangle', 0, 6, 1),
  createPiece('blue-triangle', 0, 1, 5),
  createPiece('white-triangle', 0, 6, 4),
  createPiece('white-diamond', 0, 4, 3),
];

function validMine(): Mine {
  return { version: 1, pieces: VALID_PIECES.map((piece) => ({ ...piece })) };
}

describe('sérialisation et comparaison de mine', () => {
  it('sérialise les pièces dans un ordre stable et normalise les rotations', () => {
    const mine: Mine = {
      version: 1,
      pieces: [
        createPiece('white-diamond', 2, 4, 3),
        createPiece('red-parallelogram', 2, 1, 1),
        createPiece('yellow-triangle', 0, 6, 1),
        createPiece('blue-triangle', 0, 1, 5),
        createPiece('white-triangle', 0, 6, 4),
      ],
    };
    const serialized = serializeMine(mine);
    expect(serialized.pieces.map((piece) => piece.kind)).toEqual([
      'red-parallelogram',
      'yellow-triangle',
      'blue-triangle',
      'white-triangle',
      'white-diamond',
    ]);
    expect(serialized.pieces[0]?.rotation).toBe(0);
    expect(serialized.pieces[4]?.rotation).toBe(0);
    expect(canonicalMineJson(mine)).toBe(canonicalMineJson(validMine()));
  });

  it('fait un aller-retour de sérialisation', () => {
    const mine = validMine();
    const restored = deserializeMine(serializeMine(mine));
    expect(mineEquals(mine, restored)).toBe(true);
    expect(isCompleteMine(restored)).toBe(true);
  });

  it('compare les polygones et non les rotations brutes', () => {
    const a = validMine();
    const b = deserializeMine({
      version: 1,
      pieces: serializeMine(a).pieces.map((piece) =>
        piece.kind === 'red-parallelogram' || piece.kind === 'white-diamond'
          ? { ...piece, rotation: 2 as const }
          : piece,
      ),
    });
    expect(mineEquals(a, b)).toBe(true);
  });

  it('refuse une mine sérialisée mal formée', () => {
    const valid = serializeMine(validMine());
    expect(isSerializedMine(valid)).toBe(true);
    expect(isSerializedMine({ version: 1, pieces: valid.pieces.slice(0, 4) })).toBe(false);
    expect(
      isSerializedMine({
        version: 1,
        pieces: [valid.pieces[0], ...valid.pieces.slice(0, 4)],
      }),
    ).toBe(false);
    expect(
      isSerializedMine({
        version: 1,
        pieces: valid.pieces.map((piece, index) => (index === 0 ? { ...piece, x: 1.5 } : piece)),
      }),
    ).toBe(false);
    expect(isSerializedMine(null)).toBe(false);
  });

  it('vérifie une proposition correcte, incorrecte ou invalide', () => {
    const mine = validMine();
    const correct = serializeMine(mine);
    expect(checkSolution(correct, mine)).toEqual({ correct: true });

    const wrong: SerializedMine = {
      ...correct,
      pieces: correct.pieces.map((piece) =>
        piece.kind === 'red-parallelogram' ? { ...piece, x: 0 } : piece,
      ),
    };
    const wrongResult = checkSolution(wrong, mine);
    expect(wrongResult.correct).toBe(false);
    expect(wrongResult.reason).toBeTruthy();

    const invalid: SerializedMine = {
      ...correct,
      pieces: correct.pieces.map((piece) =>
        piece.kind === 'white-diamond' ? { ...piece, x: 2, y: 1 } : piece,
      ),
    };
    expect(checkSolution(invalid, mine).correct).toBe(false);
  });

  it('gère l’ajout, le remplacement et la suppression d’une pièce', () => {
    let mine = createEmptyMine();
    mine = upsertPiece(mine, createPiece('red-parallelogram', 0, 1, 1));
    expect(mine.pieces).toHaveLength(1);
    mine = upsertPiece(mine, createPiece('red-parallelogram', 0, 2, 2));
    expect(mine.pieces).toHaveLength(1);
    expect(getPiece(mine, 'red-parallelogram')?.x).toBe(2);
    mine = removePiece(mine, 'red-parallelogram');
    expect(getPiece(mine, 'red-parallelogram')).toBeUndefined();
    expect(isCompleteMine(mine)).toBe(false);
  });

  it('sérialise et relit des notes incomplètes', () => {
    const note = {
      version: 1 as const,
      pieces: serializeNote({ version: 1, pieces: VALID_PIECES.slice(0, 2) }).pieces,
    };
    expect(isSerializedNote(note)).toBe(true);
    expect(isSerializedMine(note)).toBe(false);
    expect(deserializeNote(note).pieces).toHaveLength(2);
    expect(isSerializedNote({ version: 1, pieces: [] })).toBe(true);
    expect(isSerializedNote({ version: 1, pieces: [...note.pieces, note.pieces[0]] })).toBe(false);
  });

  it('reconnaît des coordonnées de case valides', () => {
    expect(isCellCoordinate({ col: 0, row: 0 })).toBe(true);
    expect(isCellCoordinate({ col: 9, row: 7 })).toBe(true);
    expect(isCellCoordinate({ col: 10, row: 0 })).toBe(false);
    expect(isCellCoordinate({ col: 0, row: 8 })).toBe(false);
    expect(isCellCoordinate({ col: 1.5, row: 0 })).toBe(false);
    expect(isCellCoordinate(null)).toBe(false);
  });
});
