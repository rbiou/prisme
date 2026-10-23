import { canonicalMineJson } from '../engine/mine';
import type { Mine } from '../engine/types';

const HEX_PATTERN = /^[0-9a-f]+$/i;

function bytesToHex(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, '0');
  }
  return result;
}

function getCrypto(): Crypto {
  const value = globalThis.crypto;
  if (!value) {
    throw new Error('La cryptographie Web n’est pas disponible dans ce navigateur.');
  }
  return value;
}

export function randomHex(byteLength = 16): string {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new Error('La longueur du sel doit être un entier positif.');
  }
  const bytes = new Uint8Array(byteLength);
  getCrypto().getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function isHex(value: string, expectedLength?: number): boolean {
  if (expectedLength !== undefined && value.length !== expectedLength) return false;
  return value.length > 0 && HEX_PATTERN.test(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = getCrypto().subtle;
  if (!subtle) {
    throw new Error(
      'Le calcul d’intégrité nécessite une connexion sécurisée (HTTPS ou localhost).',
    );
  }
  const data = new TextEncoder().encode(text);
  const digest = await subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

export function commitmentPayload(mine: Mine, salt: string): string {
  return `${canonicalMineJson(mine)}:${salt}`;
}

export async function mineCommitment(mine: Mine, salt: string): Promise<string> {
  return sha256Hex(commitmentPayload(mine, salt));
}

export async function verifyCommitment(
  mine: Mine,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  if (!isHex(salt) || !isHex(expectedHash, 64)) return false;
  const actual = await mineCommitment(mine, salt);
  return actual === expectedHash.toLowerCase();
}

export interface LocalCommitment {
  salt: string;
  hash: string;
}

export async function createCommitment(mine: Mine, salt = randomHex(16)): Promise<LocalCommitment> {
  return { salt, hash: await mineCommitment(mine, salt) };
}
