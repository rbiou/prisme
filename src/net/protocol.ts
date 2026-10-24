import { isCell, isValidEntryLabel } from '../engine/board';
import { isColorMark, type ColorMark } from '../engine/colorMarks';
import { isGemColor, isRayColor } from '../engine/colors';
import { isGameState } from '../engine/endgame';
import { isSerializedMine, isSerializedNote } from '../engine/mine';
import { isNoteEdgeMark, type NoteEdgeMark } from '../engine/noteEdges';
import type {
  Cell,
  GemColor,
  GameState,
  PlayerId,
  RayColor,
  SerializedMine,
  SerializedNote,
} from '../engine/types';
import { isHex, randomHex } from './integrity';

export const PROTOCOL_VERSION = 3;
export const MAX_NAME_LENGTH = 40;
export const MAX_ID_LENGTH = 64;

interface MessageBase {
  protocol: typeof PROTOCOL_VERSION;
}

export interface HelloMessage extends MessageBase {
  type: 'hello';
  from: PlayerId;
  name: string;
  nonce: string;
}

export interface CommitMessage extends MessageBase {
  type: 'commit';
  id: string;
  from: PlayerId;
  mineHash: string;
}

export interface LobbyStartMessage extends MessageBase {
  type: 'lobby-start';
  id: string;
  from: 'host';
}

export interface StartMessage extends MessageBase {
  type: 'start';
  from: 'host';
  starter: PlayerId;
  hostNonce: string;
  guestNonce: string;
  hostHash: string;
  guestHash: string;
}

export interface SyncReveal {
  from: PlayerId;
  mine: SerializedMine;
  salt: string;
  notes: SerializedNote | null;
  marks: RevealMarks | null;
}

/** Échange d’état public après une reconnexion ou une reprise de partie. */
export interface SyncMessage extends MessageBase {
  type: 'sync';
  id: string;
  from: PlayerId;
  round: number;
  mineHash: string | null;
  starter: PlayerId | null;
  game: GameState | null;
  reveals: SyncReveal[];
}

export interface ScanWaveMessage extends MessageBase {
  type: 'scan';
  id: string;
  from: PlayerId;
  kind: 'wave';
  entry: string;
}

export interface ScanCellMessage extends MessageBase {
  type: 'scan';
  id: string;
  from: PlayerId;
  kind: 'cell';
  cell: Cell;
}

export type ScanMessage = ScanWaveMessage | ScanCellMessage;

export interface AnswerWaveMessage extends MessageBase {
  type: 'answer';
  id: string;
  from: PlayerId;
  scanId: string;
  kind: 'wave';
  exit: string;
  color: RayColor;
}

export interface AnswerCellMessage extends MessageBase {
  type: 'answer';
  id: string;
  from: PlayerId;
  scanId: string;
  kind: 'cell';
  color: GemColor | null;
}

export type AnswerMessage = AnswerWaveMessage | AnswerCellMessage;

export interface CancelScanMessage extends MessageBase {
  type: 'cancel-scan';
  id: string;
  from: PlayerId;
  scanId: string;
}

export interface ConfirmRequestMessage extends MessageBase {
  type: 'confirm-request';
  id: string;
  from: PlayerId;
  answerId: string;
}

export interface ConfirmResultWaveMessage extends MessageBase {
  type: 'confirm-result';
  id: string;
  from: PlayerId;
  answerId: string;
  kind: 'wave';
  exit: string;
  color: RayColor;
}

export interface ConfirmResultCellMessage extends MessageBase {
  type: 'confirm-result';
  id: string;
  from: PlayerId;
  answerId: string;
  kind: 'cell';
  color: GemColor | null;
}

export type ConfirmResultMessage = ConfirmResultWaveMessage | ConfirmResultCellMessage;

export interface SubmitMessage extends MessageBase {
  type: 'submit';
  id: string;
  from: PlayerId;
  candidate: SerializedMine;
}

export interface SubmitResultMessage extends MessageBase {
  type: 'submit-result';
  id: string;
  from: PlayerId;
  submissionId: string;
  correct: boolean;
}

export interface RevealMarks {
  crosses: Cell[];
  edges: NoteEdgeMark[];
  colors: ColorMark[];
}

export interface RevealMessage extends MessageBase {
  type: 'reveal';
  id: string;
  from: PlayerId;
  mine: SerializedMine;
  salt: string;
  /** Notes finales, partagées uniquement à la fin pour expliquer le raisonnement. */
  notes?: SerializedNote | null;
  marks?: RevealMarks | null;
}

export interface PingMessage extends MessageBase {
  type: 'ping';
  id: string;
  from: PlayerId;
}

export interface PongMessage extends MessageBase {
  type: 'pong';
  id: string;
  from: PlayerId;
  replyTo: string;
}

export type NetworkMessage =
  | HelloMessage
  | CommitMessage
  | LobbyStartMessage
  | StartMessage
  | SyncMessage
  | ScanMessage
  | AnswerMessage
  | CancelScanMessage
  | ConfirmRequestMessage
  | ConfirmResultMessage
  | SubmitMessage
  | SubmitResultMessage
  | RevealMessage
  | PingMessage
  | PongMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'host' || value === 'guest';
}

function isMessageId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isCellValue(value: unknown): value is Cell {
  if (!isRecord(value)) return false;
  return (
    typeof value.col === 'number' &&
    typeof value.row === 'number' &&
    isCell({ col: value.col, row: value.row })
  );
}

function isAnswerColor(kind: 'wave' | 'cell', value: unknown): boolean {
  if (kind === 'wave') return typeof value === 'string' && isRayColor(value);
  return value === null || (typeof value === 'string' && isGemColor(value));
}

export function isRevealMarks(value: unknown): value is RevealMarks {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.crosses) &&
    value.crosses.length <= 80 &&
    value.crosses.every((cell) => isCellValue(cell)) &&
    Array.isArray(value.edges) &&
    value.edges.length <= 480 &&
    value.edges.every((edge) => isNoteEdgeMark(edge)) &&
    Array.isArray(value.colors) &&
    value.colors.length <= 80 &&
    value.colors.every((mark) => isColorMark(mark))
  );
}

export function isNetworkMessage(value: unknown): value is NetworkMessage {
  if (!isRecord(value)) return false;
  if (value.protocol !== PROTOCOL_VERSION) return false;
  const type = value.type;
  if (typeof type !== 'string') return false;

  switch (type) {
    case 'hello':
      return (
        isPlayerId(value.from) &&
        typeof value.name === 'string' &&
        value.name.length <= MAX_NAME_LENGTH &&
        typeof value.nonce === 'string' &&
        isHex(value.nonce, 32)
      );
    case 'commit':
      return (
        isMessageId(value.id) &&
        isPlayerId(value.from) &&
        typeof value.mineHash === 'string' &&
        isHex(value.mineHash, 64)
      );
    case 'lobby-start':
      return isMessageId(value.id) && value.from === 'host';
    case 'start':
      return (
        value.from === 'host' &&
        isPlayerId(value.starter) &&
        typeof value.hostNonce === 'string' &&
        isHex(value.hostNonce, 32) &&
        typeof value.guestNonce === 'string' &&
        isHex(value.guestNonce, 32) &&
        typeof value.hostHash === 'string' &&
        isHex(value.hostHash, 64) &&
        typeof value.guestHash === 'string' &&
        isHex(value.guestHash, 64)
      );
    case 'sync':
      if (!isMessageId(value.id) || !isPlayerId(value.from)) return false;
      if (
        typeof value.round !== 'number' ||
        !Number.isInteger(value.round) ||
        value.round < 0 ||
        value.round > 100000
      ) {
        return false;
      }
      if (
        value.mineHash !== null &&
        !(typeof value.mineHash === 'string' && isHex(value.mineHash, 64))
      ) {
        return false;
      }
      if (value.starter !== null && !isPlayerId(value.starter)) return false;
      if (value.game !== null && value.starter === null) return false;
      if (value.game !== null && !isGameState(value.game)) return false;
      return (
        Array.isArray(value.reveals) &&
        value.reveals.length <= 2 &&
        value.reveals.every(
          (reveal) =>
            isRecord(reveal) &&
            isPlayerId(reveal.from) &&
            isSerializedMine(reveal.mine) &&
            typeof reveal.salt === 'string' &&
            isHex(reveal.salt, 32) &&
            (reveal.notes === undefined ||
              reveal.notes === null ||
              isSerializedNote(reveal.notes)) &&
            (reveal.marks === undefined || reveal.marks === null || isRevealMarks(reveal.marks)),
        )
      );
    case 'scan':
      if (!isMessageId(value.id) || !isPlayerId(value.from)) return false;
      if (value.kind === 'wave') {
        return typeof value.entry === 'string' && isValidEntryLabel(value.entry);
      }
      if (value.kind === 'cell') return isCellValue(value.cell);
      return false;
    case 'answer':
      if (!isMessageId(value.id) || !isMessageId(value.scanId) || !isPlayerId(value.from)) {
        return false;
      }
      if (value.kind === 'wave') {
        return (
          typeof value.exit === 'string' &&
          isValidEntryLabel(value.exit) &&
          typeof value.color === 'string' &&
          isRayColor(value.color)
        );
      }
      if (value.kind === 'cell') {
        return isAnswerColor('cell', value.color);
      }
      return false;
    case 'cancel-scan':
      return isMessageId(value.id) && isMessageId(value.scanId) && isPlayerId(value.from);
    case 'confirm-request':
      return isMessageId(value.id) && isMessageId(value.answerId) && isPlayerId(value.from);
    case 'confirm-result':
      if (!isMessageId(value.id) || !isMessageId(value.answerId) || !isPlayerId(value.from)) {
        return false;
      }
      if (value.kind === 'wave') {
        return (
          typeof value.exit === 'string' &&
          isValidEntryLabel(value.exit) &&
          typeof value.color === 'string' &&
          isRayColor(value.color)
        );
      }
      if (value.kind === 'cell') return isAnswerColor('cell', value.color);
      return false;
    case 'submit':
      return isMessageId(value.id) && isPlayerId(value.from) && isSerializedMine(value.candidate);
    case 'submit-result':
      return (
        isMessageId(value.id) &&
        isMessageId(value.submissionId) &&
        isPlayerId(value.from) &&
        typeof value.correct === 'boolean'
      );
    case 'reveal':
      return (
        isMessageId(value.id) &&
        isPlayerId(value.from) &&
        isSerializedMine(value.mine) &&
        typeof value.salt === 'string' &&
        isHex(value.salt, 32) &&
        (value.notes === undefined || value.notes === null || isSerializedNote(value.notes)) &&
        (value.marks === undefined || value.marks === null || isRevealMarks(value.marks))
      );
    case 'ping':
      return isMessageId(value.id) && isPlayerId(value.from);
    case 'pong':
      return isMessageId(value.id) && isMessageId(value.replyTo) && isPlayerId(value.from);
    default:
      return false;
  }
}

export function parseNetworkMessage(raw: string): NetworkMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isNetworkMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function newMessageId(): string {
  return randomHex(8);
}

export function chooseStarter(hostNonce: string, guestNonce: string): PlayerId | null {
  if (!isHex(hostNonce, 32) || !isHex(guestNonce, 32)) return null;
  const mixed = BigInt(`0x${hostNonce}`) ^ BigInt(`0x${guestNonce}`);
  return mixed % 2n === 0n ? 'host' : 'guest';
}

export function createHello(from: PlayerId, name: string, nonce: string): HelloMessage {
  return { protocol: PROTOCOL_VERSION, type: 'hello', from, name, nonce };
}

export function createCommit(from: PlayerId, mineHash: string, id = newMessageId()): CommitMessage {
  return { protocol: PROTOCOL_VERSION, type: 'commit', id, from, mineHash };
}

export function createLobbyStart(id = newMessageId()): LobbyStartMessage {
  return { protocol: PROTOCOL_VERSION, type: 'lobby-start', id, from: 'host' };
}

export function createSync(
  from: PlayerId,
  payload: Omit<SyncMessage, 'protocol' | 'type' | 'id' | 'from'>,
): SyncMessage {
  return { protocol: PROTOCOL_VERSION, type: 'sync', id: newMessageId(), from, ...payload };
}

export function createStart(
  hostNonce: string,
  guestNonce: string,
  hostHash: string,
  guestHash: string,
): StartMessage | null {
  const starter = chooseStarter(hostNonce, guestNonce);
  if (!starter || !isHex(hostHash, 64) || !isHex(guestHash, 64)) return null;
  return {
    protocol: PROTOCOL_VERSION,
    type: 'start',
    from: 'host',
    starter,
    hostNonce,
    guestNonce,
    hostHash,
    guestHash,
  };
}
