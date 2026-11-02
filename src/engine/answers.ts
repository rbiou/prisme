import type { RayResult, ScanAnswer } from './types';

/**
 * Traduit un résultat de rayon calculé localement en réponse publique.
 *
 * Un rayon absorbé par le Corps noir n’a ni point de sortie ni couleur : la
 * réponse porte uniquement la mention d’absorption. Un rayon en boucle ne peut
 * pas être annoncé et renvoie `null`.
 */
export function waveAnswerFromResult(result: RayResult): ScanAnswer | null {
  if (result.status === 'absorbed') return { kind: 'wave', absorbed: true };
  if (result.status === 'exit' && result.exit) {
    return { kind: 'wave', exit: result.exit, color: result.color };
  }
  return null;
}
