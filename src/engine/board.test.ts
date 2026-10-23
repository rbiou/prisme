import { describe, expect, it } from 'vitest';
import {
  ALL_ENTRIES,
  BOTTOM_LABELS,
  LEFT_LABELS,
  RIGHT_LABELS,
  TOP_LABELS,
  cellLabel,
  entryDirection,
  entryForLabel,
  entryOrigin,
  exitEntryForPoint,
  isValidEntryLabel,
  parseCellLabel,
} from './board';

describe('plateau et coordonnées', () => {
  it('nomme les 36 entrées du bord', () => {
    expect(TOP_LABELS).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(RIGHT_LABELS).toEqual(['11', '12', '13', '14', '15', '16', '17', '18']);
    expect(BOTTOM_LABELS).toEqual(['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R']);
    expect(LEFT_LABELS).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    expect(ALL_ENTRIES).toHaveLength(36);
    expect(isValidEntryLabel('10')).toBe(true);
    expect(isValidEntryLabel('S')).toBe(false);
  });

  it('positionne chaque entrée au milieu d’une case', () => {
    expect(entryOrigin(entryForLabel('1')!)).toEqual({ x: 0.5, y: 0 });
    expect(entryOrigin(entryForLabel('10')!)).toEqual({ x: 9.5, y: 0 });
    expect(entryOrigin(entryForLabel('11')!)).toEqual({ x: 10, y: 0.5 });
    expect(entryOrigin(entryForLabel('18')!)).toEqual({ x: 10, y: 7.5 });
    expect(entryOrigin(entryForLabel('I')!)).toEqual({ x: 0.5, y: 8 });
    expect(entryOrigin(entryForLabel('R')!)).toEqual({ x: 9.5, y: 8 });
    expect(entryOrigin(entryForLabel('A')!)).toEqual({ x: 0, y: 0.5 });
    expect(entryOrigin(entryForLabel('H')!)).toEqual({ x: 0, y: 7.5 });
  });

  it('oriente chaque entrée vers l’intérieur', () => {
    expect(entryDirection(entryForLabel('1')!)).toEqual({ x: 0, y: 1 });
    expect(entryDirection(entryForLabel('11')!)).toEqual({ x: -1, y: 0 });
    expect(entryDirection(entryForLabel('I')!)).toEqual({ x: 0, y: -1 });
    expect(entryDirection(entryForLabel('A')!)).toEqual({ x: 1, y: 0 });
  });

  it('retrouve l’étiquette de sortie à partir du point', () => {
    expect(exitEntryForPoint({ x: 0.5, y: 0 }).label).toBe('1');
    expect(exitEntryForPoint({ x: 10, y: 3.5 }).label).toBe('14');
    expect(exitEntryForPoint({ x: 7.5, y: 8 }).label).toBe('P');
    expect(exitEntryForPoint({ x: 0, y: 2.5 }).label).toBe('C');
  });

  it('affiche et analyse les coordonnées de case', () => {
    expect(cellLabel({ col: 0, row: 0 })).toBe('A1');
    expect(cellLabel({ col: 9, row: 7 })).toBe('H10');
    expect(parseCellLabel('A1')).toEqual({ col: 0, row: 0 });
    expect(parseCellLabel('h10')).toEqual({ col: 9, row: 7 });
    expect(parseCellLabel('A11')).toBeNull();
    expect(parseCellLabel('I1')).toBeNull();
    expect(parseCellLabel('')).toBeNull();
  });
});
