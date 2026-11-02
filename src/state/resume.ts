import { isGameState } from '../engine/endgame';
import { isHex } from '../net/integrity';
import { isSerializedMine, isSerializedNote } from '../engine/mine';
import { isGameMode } from '../engine/pieces';
import { normalizeRoomCode } from '../net/roomCode';
import { isRevealMarks, type RevealMarks } from '../net/protocol';
import type {
  GameMode,
  PlayerId,
  GameState,
  SerializedMine,
  SerializedNote,
} from '../engine/types';
import type { SessionPhase } from '../net/session';

const STORAGE_KEY = 'prisme:resume';
const RESUMABLE_PHASES: SessionPhase[] = ['lobby', 'placing', 'awaiting-opponent', 'ready'];

export interface StoredReveal {
  from: PlayerId;
  mine: SerializedMine;
  salt: string;
  receivedAt: number;
  notes: SerializedNote | null;
  marks: RevealMarks | null;
}

export interface StoredResume {
  version: 1;
  savedAt: number;
  role: PlayerId;
  playerName: string;
  roomCode: string;
  nonce: string;
  sessionPhase: SessionPhase;
  mode: GameMode;
  locked: { mine: SerializedMine; salt: string; hash: string } | null;
  starter: PlayerId | null;
  opponentName: string;
  opponentNonce: string | null;
  opponentHash: string | null;
  game: GameState | null;
  reveals: StoredReveal[];
  readyAt: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'host' || value === 'guest';
}

/** Les sauvegardes antérieures au mode spécial sont relues en mode de base. */
function normalizeLegacyResume(value: unknown): unknown {
  if (!isRecord(value) || value.version !== 1) return value;
  const mode = isGameMode(value.mode) ? value.mode : 'base';
  const next: Record<string, unknown> = { ...value, mode };
  if (isRecord(next.game) && !isGameMode(next.game.mode)) {
    next.game = { ...next.game, mode };
  }
  return next;
}

function isStoredResume(value: unknown): value is StoredResume {
  if (!isRecord(value) || value.version !== 1) return false;
  if (!isPlayerId(value.role) || typeof value.playerName !== 'string') return false;
  if (typeof value.roomCode !== 'string' || !normalizeRoomCode(value.roomCode)) return false;
  if (typeof value.nonce !== 'string' || !isHex(value.nonce, 32)) return false;
  if (
    typeof value.sessionPhase !== 'string' ||
    !RESUMABLE_PHASES.includes(value.sessionPhase as SessionPhase)
  ) {
    return false;
  }
  if (!isGameMode(value.mode)) return false;
  const mode = value.mode;
  if (value.locked !== null) {
    if (!isRecord(value.locked)) return false;
    if (!isSerializedMine(value.locked.mine, mode)) return false;
    if (typeof value.locked.salt !== 'string' || !isHex(value.locked.salt, 32)) return false;
    if (typeof value.locked.hash !== 'string' || !isHex(value.locked.hash, 64)) return false;
  }
  if (value.starter !== null && !isPlayerId(value.starter)) return false;
  if (typeof value.opponentName !== 'string') return false;
  if (value.opponentNonce !== null && typeof value.opponentNonce !== 'string') return false;
  if (value.opponentHash !== null && typeof value.opponentHash !== 'string') return false;
  if (value.game !== null && !isGameState(value.game)) return false;
  if (value.game !== null && value.game.mode !== mode) return false;
  if (!Array.isArray(value.reveals)) return false;
  if (
    !value.reveals.every(
      (reveal) =>
        isRecord(reveal) &&
        isPlayerId(reveal.from) &&
        isSerializedMine(reveal.mine, mode) &&
        typeof reveal.salt === 'string' &&
        typeof reveal.receivedAt === 'number' &&
        (reveal.notes === undefined || reveal.notes === null || isSerializedNote(reveal.notes)) &&
        (reveal.marks === undefined || reveal.marks === null || isRevealMarks(reveal.marks)),
    )
  ) {
    return false;
  }
  if (value.readyAt !== null && typeof value.readyAt !== 'number') return false;
  return typeof value.savedAt === 'number';
}

export function saveResume(data: StoredResume): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // La reprise est un confort : le stockage peut être indisponible.
  }
}

export function loadResume(): StoredResume | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = normalizeLegacyResume(JSON.parse(raw));
    return isStoredResume(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearResume(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien à faire.
  }
}
