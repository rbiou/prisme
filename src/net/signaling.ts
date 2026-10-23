import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

export const SIGNAL_VERSION = 1;

export type SignalType = 'offer' | 'answer';

export interface SignalPayload {
  v: typeof SIGNAL_VERSION;
  type: SignalType;
  sdp: string;
}

const MAX_CODE_LENGTH = 120_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeSignal(payload: SignalPayload): string {
  const json = JSON.stringify({
    v: SIGNAL_VERSION,
    type: payload.type,
    sdp: payload.sdp,
  });
  return toBase64Url(deflateSync(strToU8(json), { level: 9 }));
}

export function decodeSignal(code: string): SignalPayload | null {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > MAX_CODE_LENGTH) return null;
  try {
    const inflated = inflateSync(fromBase64Url(trimmed));
    const parsed: unknown = JSON.parse(strFromU8(inflated));
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<SignalPayload>;
    if (candidate.v !== SIGNAL_VERSION) return null;
    if (candidate.type !== 'offer' && candidate.type !== 'answer') return null;
    if (typeof candidate.sdp !== 'string' || candidate.sdp.length === 0) return null;
    return { v: SIGNAL_VERSION, type: candidate.type, sdp: candidate.sdp };
  } catch {
    return null;
  }
}

export interface LocationLike {
  origin: string;
  pathname: string;
}

export function buildInviteLink(code: string, location: LocationLike): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/invite/${code}`;
}

/** Accepte un code brut, un fragment `#/invite/...` ou un lien complet. */
export function extractSignalCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const marker = '#/invite/';
  const markerIndex = trimmed.indexOf(marker);
  const candidate = markerIndex >= 0 ? trimmed.slice(markerIndex + marker.length) : trimmed;
  const withoutQuery = candidate.split(/[?#\s]/)[0] ?? '';
  const cleaned = withoutQuery.trim();
  if (!cleaned || !/^[A-Za-z0-9_-]+$/.test(cleaned)) return null;
  return cleaned;
}
