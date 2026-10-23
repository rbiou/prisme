import { GEM_COLOR_LABELS, RAY_COLOR_LABELS, RAY_COLOR_SWATCHES } from '../engine/colors';
import type { GemColor, RayColor } from '../engine/types';

export interface ColorChipProps {
  color: RayColor | GemColor | null;
  label?: string;
  size?: 'small' | 'medium';
}

function labelFor(colour: RayColor | GemColor | null): string {
  if (colour === null) return 'Rien';
  if (colour in GEM_COLOR_LABELS) return GEM_COLOR_LABELS[colour as GemColor];
  return RAY_COLOR_LABELS[colour as RayColor];
}

export function ColorChip({ color, label, size = 'medium' }: ColorChipProps) {
  const swatch = color ? RAY_COLOR_SWATCHES[color] : '#334155';
  return (
    <span className={`color-chip color-chip--${size}${color === null ? ' color-chip--empty' : ''}`}>
      <span className="color-chip__swatch" style={{ backgroundColor: swatch }} aria-hidden="true" />
      <span className="color-chip__label">{label ?? labelFor(color)}</span>
    </span>
  );
}
