export const ROOM_CODE_LENGTH = 6;
export const PEER_ID_PREFIX = 'prisme-v1-';

/**
 * Normalise un code saisi par l’utilisateur : espaces, tirets et collages
 * superflus sont ignorés. Le résultat doit contenir exactement six chiffres.
 */
export function normalizeRoomCode(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length === ROOM_CODE_LENGTH ? digits : null;
}

/** Affiche le code par groupes de trois chiffres : « 123 456 ». */
export function formatRoomCode(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/** Identifiant réservé auprès du service de mise en relation PeerJS. */
export function peerIdForCode(code: string): string {
  const normalized = normalizeRoomCode(code);
  if (!normalized) {
    throw new Error('Le code de partie doit contenir exactement six chiffres.');
  }
  return `${PEER_ID_PREFIX}${normalized}`;
}

/**
 * Tire un code à six chiffres. L’injecteur permet de rendre les tests
 * déterministes sans toucher au générateur cryptographique réel.
 */
export function generateRoomCode(randomInt: (max: number) => number = secureRandomInt): string {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += String(randomInt(10));
  }
  return code;
}

/** Entier uniforme dans [0, max) sans biais modulo. */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0x100000000) {
    throw new Error('La borne du tirage aléatoire est invalide.');
  }
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error('Le générateur aléatoire du navigateur est indisponible.');
  }
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}
