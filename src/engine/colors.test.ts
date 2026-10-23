import { describe, expect, it } from 'vitest';
import {
  GEM_COLORS,
  RAY_COLOR_LABELS,
  isGemColor,
  isRayColor,
  mixColors,
  rayColorFromMask,
} from './colors';
import type { GemColor, RayColor } from './types';

const EXPECTED_BY_MASK: Record<number, RayColor> = {
  0: 'transparent',
  1: 'red',
  2: 'yellow',
  3: 'orange',
  4: 'blue',
  5: 'violet',
  6: 'green',
  7: 'black',
  8: 'white',
  9: 'pink',
  10: 'light-yellow',
  11: 'light-orange',
  12: 'light-blue',
  13: 'light-violet',
  14: 'light-green',
  15: 'gray',
};

function subsets<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let mask = 0; mask < 1 << items.length; mask += 1) {
    result.push(items.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return result;
}

describe('mélange des couleurs', () => {
  it('couvre les 16 combinaisons de la table', () => {
    const combos = subsets<GemColor>([...GEM_COLORS]);
    expect(combos).toHaveLength(16);
    for (const combo of combos) {
      const mask = combo.reduce((acc, color) => {
        const bits: Record<GemColor, number> = { red: 1, yellow: 2, blue: 4, white: 8 };
        return acc | bits[color];
      }, 0);
      expect(mixColors(combo)).toBe(EXPECTED_BY_MASK[mask]);
      expect(rayColorFromMask(mask)).toBe(EXPECTED_BY_MASK[mask]);
    }
  });

  it('ne dépend pas de l’ordre ni des répétitions', () => {
    expect(mixColors(['white', 'red', 'yellow'])).toBe('light-orange');
    expect(mixColors(['yellow', 'red', 'white'])).toBe('light-orange');
    expect(mixColors(['white', 'red', 'yellow', 'white', 'red'])).toBe('light-orange');
  });

  it('donne incolore sans contact et blanc avec du blanc seul', () => {
    expect(mixColors([])).toBe('transparent');
    expect(mixColors(['white'])).toBe('white');
    expect(mixColors(['white', 'white'])).toBe('white');
  });

  it('étiquette toutes les couleurs en français', () => {
    for (const rayColor of Object.values(EXPECTED_BY_MASK)) {
      expect(RAY_COLOR_LABELS[rayColor]).toBeTruthy();
      expect(isRayColor(rayColor)).toBe(true);
    }
    for (const color of GEM_COLORS) {
      expect(isGemColor(color)).toBe(true);
    }
    expect(isRayColor('mauve')).toBe(false);
    expect(isGemColor('black')).toBe(false);
  });
});
