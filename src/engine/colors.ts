import type { GemColor, RayColor } from './types';

export const GEM_COLOR_BITS: Record<GemColor, number> = {
  red: 1,
  yellow: 2,
  blue: 4,
  white: 8,
};

export const GEM_COLORS: GemColor[] = ['red', 'yellow', 'blue', 'white'];

export const GEM_COLOR_LABELS: Record<GemColor, string> = {
  red: 'Rouge',
  yellow: 'Jaune',
  blue: 'Bleu',
  white: 'Blanc',
};

export const RAY_COLOR_LABELS: Record<RayColor, string> = {
  transparent: 'Incolore',
  white: 'Blanc',
  red: 'Rouge',
  yellow: 'Jaune',
  blue: 'Bleu',
  orange: 'Orange',
  violet: 'Violet',
  green: 'Vert',
  black: 'Noir',
  pink: 'Rose',
  'light-yellow': 'Jaune clair',
  'light-blue': 'Bleu clair',
  'light-orange': 'Orange clair',
  'light-violet': 'Violet clair',
  'light-green': 'Vert clair',
  gray: 'Gris',
};

/** Couleurs de rendu, indépendantes du thème. */
export const RAY_COLOR_SWATCHES: Record<RayColor, string> = {
  transparent: '#cbd5e1',
  white: '#f8fafc',
  red: '#ef4444',
  yellow: '#facc15',
  blue: '#3b82f6',
  orange: '#fb923c',
  violet: '#a855f7',
  green: '#4ade80',
  black: '#111827',
  pink: '#f9a8d4',
  'light-yellow': '#fef08a',
  'light-blue': '#93c5fd',
  'light-orange': '#fdba74',
  'light-violet': '#d8b4fe',
  'light-green': '#86efac',
  gray: '#94a3b8',
};

const MASK_TO_COLOR: Record<number, RayColor> = {
  0: 'transparent',
  1: 'red',
  2: 'yellow',
  4: 'blue',
  8: 'white',
  3: 'orange',
  5: 'violet',
  6: 'green',
  7: 'black',
  9: 'pink',
  10: 'light-yellow',
  12: 'light-blue',
  11: 'light-orange',
  13: 'light-violet',
  14: 'light-green',
  15: 'gray',
};

export function colorMaskForGem(color: GemColor): number {
  return GEM_COLOR_BITS[color];
}

export function rayColorFromMask(mask: number): RayColor {
  return MASK_TO_COLOR[mask & 15] ?? 'transparent';
}

export function mixColors(colors: Iterable<GemColor>): RayColor {
  let mask = 0;
  for (const color of colors) {
    mask |= colorMaskForGem(color);
  }
  return rayColorFromMask(mask);
}

export function mixRayColorMasks(mask: number, color: GemColor): number {
  return mask | colorMaskForGem(color);
}

export function isRayColor(value: string): value is RayColor {
  return value in RAY_COLOR_LABELS;
}

export function isGemColor(value: string): value is GemColor {
  return value in GEM_COLOR_LABELS;
}
