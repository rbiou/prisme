import { RAY_COLOR_LABELS } from '../engine/colors';
import type { RayColor } from '../engine/types';
import { ColorChip } from './ColorChip';

const MIXES: Array<{ colors: RayColor[]; result: RayColor }> = [
  { colors: [], result: 'transparent' },
  { colors: ['white'], result: 'white' },
  { colors: ['red'], result: 'red' },
  { colors: ['yellow'], result: 'yellow' },
  { colors: ['blue'], result: 'blue' },
  { colors: ['red', 'yellow'], result: 'orange' },
  { colors: ['red', 'blue'], result: 'violet' },
  { colors: ['yellow', 'blue'], result: 'green' },
  { colors: ['red', 'yellow', 'blue'], result: 'black' },
  { colors: ['white', 'red'], result: 'pink' },
  { colors: ['white', 'yellow'], result: 'light-yellow' },
  { colors: ['white', 'blue'], result: 'light-blue' },
  { colors: ['white', 'red', 'yellow'], result: 'light-orange' },
  { colors: ['white', 'red', 'blue'], result: 'light-violet' },
  { colors: ['white', 'yellow', 'blue'], result: 'light-green' },
  { colors: ['white', 'red', 'yellow', 'blue'], result: 'gray' },
];

/** Table des seize mélanges de couleurs, partagée par les règles et la partie. */
export function ColorMixLegend() {
  return (
    <div className="mix-grid" aria-label="Table des seize mélanges">
      {MIXES.map((mix) => (
        <div key={`${mix.colors.join('-')}-${mix.result}`} className="mix-item">
          <div className="mix-colors">
            {mix.colors.length === 0 ? (
              <span className="muted">Aucune</span>
            ) : (
              mix.colors.map((color) => (
                <ColorChip key={color} color={color} label={RAY_COLOR_LABELS[color]} size="small" />
              ))
            )}
          </div>
          <span className="mix-arrow" aria-hidden="true">
            →
          </span>
          <ColorChip color={mix.result} size="small" />
        </div>
      ))}
    </div>
  );
}
