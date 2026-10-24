import { describe, expect, it } from 'vitest';
import {
  edgeForCellSide,
  edgeSegment,
  isNoteEdgeMark,
  upsertNoteEdge,
  type NoteEdgeMark,
} from './noteEdges';
import type { Cell } from './types';

const CELL: Cell = { col: 2, row: 3 };

describe('noteEdges — conversion des côtés de case', () => {
  it('convertit les quatre côtés en arêtes canoniques', () => {
    expect(edgeForCellSide(CELL, 'top')).toEqual({ kind: 'horizontal', col: 2, row: 3 });
    expect(edgeForCellSide(CELL, 'bottom')).toEqual({ kind: 'horizontal', col: 2, row: 4 });
    expect(edgeForCellSide(CELL, 'left')).toEqual({ kind: 'vertical', col: 2, row: 3 });
    expect(edgeForCellSide(CELL, 'right')).toEqual({ kind: 'vertical', col: 3, row: 3 });
  });

  it('convertit les deux diagonales', () => {
    expect(edgeForCellSide(CELL, 'diagonal-down')).toEqual({
      kind: 'diagonal-down',
      col: 2,
      row: 3,
    });
    expect(edgeForCellSide(CELL, 'diagonal-up')).toEqual({
      kind: 'diagonal-up',
      col: 2,
      row: 3,
    });
  });

  it('dessine les segments aux bonnes coordonnées', () => {
    expect(edgeSegment({ kind: 'horizontal', col: 2, row: 3 })).toEqual({
      x1: 2,
      y1: 3,
      x2: 3,
      y2: 3,
    });
    expect(edgeSegment({ kind: 'vertical', col: 2, row: 3 })).toEqual({
      x1: 2,
      y1: 3,
      x2: 2,
      y2: 4,
    });
    expect(edgeSegment({ kind: 'diagonal-down', col: 2, row: 3 })).toEqual({
      x1: 2,
      y1: 3,
      x2: 3,
      y2: 4,
    });
    expect(edgeSegment({ kind: 'diagonal-up', col: 2, row: 3 })).toEqual({
      x1: 3,
      y1: 3,
      x2: 2,
      y2: 4,
    });
  });
});

describe('noteEdges — ajout, recoloration et retrait', () => {
  it('ajoute une arête colorée', () => {
    const marks = upsertNoteEdge([], CELL, 'top', 'red');
    expect(marks).toEqual([{ kind: 'horizontal', col: 2, row: 3, color: 'red' }]);
  });

  it('retire l’arête lorsqu’on la touche à nouveau avec la même couleur', () => {
    const marks = upsertNoteEdge(upsertNoteEdge([], CELL, 'top', 'red'), CELL, 'top', 'red');
    expect(marks).toEqual([]);
  });

  it('recolore une arête existante sans créer de doublon', () => {
    const marks = upsertNoteEdge(upsertNoteEdge([], CELL, 'top', 'red'), CELL, 'top', 'blue');
    expect(marks).toEqual([{ kind: 'horizontal', col: 2, row: 3, color: 'blue' }]);
  });

  it('déduplique une arête partagée entre deux cases', () => {
    const fromLeft = upsertNoteEdge([], { col: 0, row: 0 }, 'right', 'red');
    const fromRight = upsertNoteEdge(fromLeft, { col: 1, row: 0 }, 'left', 'yellow');
    expect(fromRight).toEqual([{ kind: 'vertical', col: 1, row: 0, color: 'yellow' }]);
  });

  it('conserve les arêtes distinctes', () => {
    const marks = upsertNoteEdge(
      upsertNoteEdge([], CELL, 'top', 'red'),
      CELL,
      'diagonal-up',
      'blue',
    );
    expect(marks).toHaveLength(2);
  });
});

describe('noteEdges — validation du stockage', () => {
  it('accepte une arête valide', () => {
    const mark: NoteEdgeMark = { kind: 'vertical', col: 10, row: 7, color: 'white' };
    expect(isNoteEdgeMark(mark)).toBe(true);
  });

  it('refuse une arête hors plateau ou mal formée', () => {
    expect(isNoteEdgeMark({ kind: 'vertical', col: 11, row: 0, color: 'red' })).toBe(false);
    expect(isNoteEdgeMark({ kind: 'horizontal', col: 0, row: 9, color: 'red' })).toBe(false);
    expect(isNoteEdgeMark({ kind: 'diagonal-down', col: 0.5, row: 0, color: 'red' })).toBe(false);
    expect(isNoteEdgeMark({ kind: 'horizontal', col: 0, row: 0, color: 'orange' })).toBe(false);
    expect(isNoteEdgeMark(null)).toBe(false);
  });
});
