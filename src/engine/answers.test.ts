import { describe, expect, it } from 'vitest';
import { waveAnswerFromResult } from './answers';
import { entryForLabel } from './board';
import { createPiece } from './pieces';
import { simulateRay } from './ray';
import type { Mine, RayResult } from './types';

function mineOf(pieces: ReturnType<typeof createPiece>[]): Mine {
  return { version: 1, pieces };
}

function entry(label: string) {
  const value = entryForLabel(label);
  if (!value) throw new Error(`Entrée inconnue : ${label}`);
  return value;
}

describe('réponses de rayon', () => {
  it('répond « absorbé » sans point de sortie ni couleur', () => {
    const result = simulateRay(mineOf([createPiece('black-body', 0, 4, 3)]), entry('D'));
    expect(result.status).toBe('absorbed');
    expect(waveAnswerFromResult(result)).toEqual({ kind: 'wave', absorbed: true });
  });

  it('transmet la sortie et la couleur d’un rayon réfléchi', () => {
    const result = simulateRay(mineOf([createPiece('clear-diamond', 0, 4, 3)]), entry('D'));
    const answer = waveAnswerFromResult(result);
    expect(answer).not.toBeNull();
    expect(answer).not.toHaveProperty('absorbed');
    expect(answer).toMatchObject({ kind: 'wave', color: 'transparent' });
  });

  it('refuse une boucle', () => {
    const loop: RayResult = {
      status: 'loop',
      entry: entry('D'),
      color: 'transparent',
      hits: [],
      path: [],
      steps: 0,
    };
    expect(waveAnswerFromResult(loop)).toBeNull();
  });
});
