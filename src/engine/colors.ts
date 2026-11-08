import type { GemColor, NoteColor, RayColor, SpecialPieceKind } from './types';

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

export const SPECIAL_COLOR_LABELS: Record<SpecialPieceKind, string> = {
  'clear-diamond': 'Diamant',
  'black-body': 'Corps noir',
};

/** Réponse publique d’un scan de case sur une gemme spéciale. */
export const SPECIAL_ANSWER_LABELS: Record<SpecialPieceKind, string> = {
  'clear-diamond': 'Diamant',
  'black-body': 'Le signal a été absorbé',
};

/** Couleurs de rendu des gemmes, y compris les deux gemmes spéciales. */
export const GEM_COLOR_SWATCHES: Record<GemColor, string> = {
  red: '#ef4444',
  yellow: '#facc15',
  blue: '#3b82f6',
  white: '#e2e8f0',
};

export const SPECIAL_COLOR_SWATCHES: Record<SpecialPieceKind, string> = {
  'clear-diamond': '#22d3ee',
  'black-body': '#0b0b0f',
};

/** Palette des notes privées : gemmes de base et gemmes spéciales. */
export const NOTE_COLORS: NoteColor[] = [
  'red',
  'yellow',
  'blue',
  'white',
  'clear-diamond',
  'black-body',
];

export const NOTE_COLOR_LABELS: Record<NoteColor, string> = {
  ...GEM_COLOR_LABELS,
  ...SPECIAL_COLOR_LABELS,
};

export const NOTE_COLOR_SWATCHES: Record<NoteColor, string> = {
  ...GEM_COLOR_SWATCHES,
  ...SPECIAL_COLOR_SWATCHES,
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

const COLOR_TO_MASK: Record<RayColor, number> = Object.fromEntries(
  Object.entries(MASK_TO_COLOR).map(([mask, color]) => [color, Number(mask)]),
) as Record<RayColor, number>;

/** Couleurs de gemmes qui composent une couleur de rayon. */
export function gemColorsForRayColor(color: RayColor): GemColor[] {
  const mask = COLOR_TO_MASK[color] ?? 0;
  return GEM_COLORS.filter((gem) => (mask & GEM_COLOR_BITS[gem]) !== 0);
}

/** Libellé d’un vrai mélange (« rouge + jaune »), `null` pour une couleur de base. */
export function rayMixLabel(color: RayColor): string | null {
  const colors = gemColorsForRayColor(color);
  if (colors.length < 2) return null;
  return colors.map((gem) => GEM_COLOR_LABELS[gem].toLowerCase()).join(' + ');
}

export function isRayColor(value: string): value is RayColor {
  return value in RAY_COLOR_LABELS;
}

export function isGemColor(value: string): value is GemColor {
  return value in GEM_COLOR_LABELS;
}

export function isSpecialColor(value: string): value is SpecialPieceKind {
  return value in SPECIAL_COLOR_LABELS;
}

export function isNoteColor(value: string): value is NoteColor {
  return value in NOTE_COLOR_LABELS;
}
