import { describe, expect, it } from 'vitest';
import { colorMarkAt, isColorMark, upsertColorMark } from './colorMarks';

const CELL = { col: 3, row: 2 };

describe('colorMarks', () => {
  it('pose un rond coloré', () => {
    expect(upsertColorMark([], CELL, 'yellow')).toEqual([{ cell: CELL, color: 'yellow' }]);
  });

  it('retire le rond avec la même couleur', () => {
    const marks = upsertColorMark(upsertColorMark([], CELL, 'yellow'), CELL, 'yellow');
    expect(marks).toEqual([]);
  });

  it('recolore le rond existant sans doublon', () => {
    const marks = upsertColorMark(upsertColorMark([], CELL, 'yellow'), CELL, 'blue');
    expect(marks).toEqual([{ cell: CELL, color: 'blue' }]);
    expect(colorMarkAt(marks, CELL)).toEqual({ cell: CELL, color: 'blue' });
  });

  it('conserve un seul rond par case', () => {
    const marks = upsertColorMark([{ cell: CELL, color: 'red' }], CELL, 'white');
    expect(marks).toHaveLength(1);
  });

  it('valide les ronds stockés', () => {
    expect(isColorMark({ cell: CELL, color: 'white' })).toBe(true);
    expect(isColorMark({ cell: { col: 10, row: 2 }, color: 'white' })).toBe(false);
    expect(isColorMark({ cell: CELL, color: 'orange' })).toBe(false);
    expect(isColorMark(null)).toBe(false);
  });
});
