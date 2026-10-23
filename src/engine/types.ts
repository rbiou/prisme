export type PlayerId = 'host' | 'guest';

export type GemColor = 'red' | 'yellow' | 'blue' | 'white';

export type PieceKind =
  'red-parallelogram' | 'yellow-triangle' | 'blue-triangle' | 'white-triangle' | 'white-diamond';

export type Rotation = 0 | 1 | 2 | 3;

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

export interface Cell {
  col: number;
  row: number;
}

export interface Entry {
  side: Side;
  index: number;
  label: string;
}

export interface PlacedPiece {
  id: PieceKind;
  kind: PieceKind;
  color: GemColor;
  rotation: Rotation;
  x: number;
  y: number;
}

export interface Mine {
  version: 1;
  pieces: PlacedPiece[];
}

export interface SerializedPiece {
  kind: PieceKind;
  rotation: Rotation;
  x: number;
  y: number;
}

export interface SerializedMine {
  version: 1;
  pieces: SerializedPiece[];
}

export type RayColor =
  | 'transparent'
  | 'white'
  | 'red'
  | 'yellow'
  | 'blue'
  | 'orange'
  | 'violet'
  | 'green'
  | 'black'
  | 'pink'
  | 'light-yellow'
  | 'light-blue'
  | 'light-orange'
  | 'light-violet'
  | 'light-green'
  | 'gray';

export interface RayHit {
  pieceId: PieceKind;
  color: GemColor;
  point: Point;
}

export type RayStatus = 'exit' | 'loop';

export interface RayResult {
  status: RayStatus;
  entry: Entry;
  exit?: Entry;
  color: RayColor;
  hits: RayHit[];
  path: Point[];
  steps: number;
}

export type ValidationErrorCode =
  | 'invalid-mine'
  | 'invalid-piece-count'
  | 'invalid-piece-kind'
  | 'duplicate-piece'
  | 'invalid-rotation'
  | 'not-on-grid'
  | 'out-of-bounds'
  | 'overlap'
  | 'edge-contact'
  | 'hidden-gem'
  | 'ray-loop'
  | 'white-symmetry';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  pieceId?: PieceKind;
  entry?: Entry;
  cell?: Cell;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface ValidationOptions {
  /** Interdit la symétrie parfaite des deux gemmes blanches (règle 2025). */
  enforceWhiteSymmetry?: boolean;
  /** Vérifie que chaque gemme est atteinte par au moins un rayon. */
  requireReachable?: boolean;
  /** Rejette les mines qui provoquent une boucle de rayon. */
  rejectLoops?: boolean;
  /** Nombre maximal de réflexions avant de considérer une boucle. */
  maxReflections?: number;
}

export interface CellScanArea {
  pieceId: PieceKind;
  color: GemColor;
  area: number;
}

export interface CellScanResult {
  cell: Cell;
  color: GemColor | null;
  pieceId: PieceKind | null;
  areas: CellScanArea[];
}

export type GamePhase =
  'playing' | 'awaiting-answer' | 'awaiting-verification' | 'final-turn' | 'ended';

export type EndReason =
  | 'non-starter-correct'
  | 'starter-correct-opponent-wrong'
  | 'starter-correct-opponent-correct'
  | 'wrong-submission'
  | 'forfeit';

export interface PendingScan {
  id: string;
  by: PlayerId;
  kind: 'wave' | 'cell';
  entry?: Entry;
  cell?: Cell;
}

export interface ScanRecord {
  id: string;
  by: PlayerId;
  kind: 'wave' | 'cell';
  entry?: Entry;
  cell?: Cell;
  answer: { kind: 'wave'; exit: Entry; color: RayColor } | { kind: 'cell'; color: GemColor | null };
  confirmationOf?: string;
  createdAt: number;
}

export interface PendingConfirmation {
  id: string;
  by: PlayerId;
  answerId: string;
}

export interface SubmissionRecord {
  id: string;
  by: PlayerId;
  candidate: SerializedMine;
  correct: boolean;
  createdAt: number;
}

export interface PendingSubmission {
  id: string;
  by: PlayerId;
  candidate: SerializedMine;
}

export interface GameState {
  phase: GamePhase;
  starter: PlayerId;
  turn: PlayerId;
  finalTurnFor?: PlayerId;
  pendingScan?: PendingScan;
  pendingConfirmation?: PendingConfirmation;
  pendingSubmission?: PendingSubmission;
  scans: ScanRecord[];
  submissions: SubmissionRecord[];
  winner?: PlayerId | 'draw';
  endReason?: EndReason;
}

export interface GameActionResult {
  ok: boolean;
  state: GameState;
  error?: string;
}
