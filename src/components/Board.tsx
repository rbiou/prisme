import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOTTOM_LABELS,
  LEFT_LABELS,
  RIGHT_LABELS,
  TOP_LABELS,
  entryForLabel,
  sideLabel,
} from '../engine/board';
import type { ColorMark } from '../engine/colorMarks';
import {
  NOTE_COLOR_SWATCHES,
  RAY_COLOR_SWATCHES,
  SPECIAL_COLOR_LABELS,
  SPECIAL_COLOR_SWATCHES,
} from '../engine/colors';
import { edgeSegment, type NoteEdgeMark } from '../engine/noteEdges';
import { isSpecialPieceKind, labelForKind, piecePolygon } from '../engine/pieces';
import type {
  Cell,
  GemColor,
  Mine,
  PlacedPiece,
  Point,
  RayColor,
  SpecialPieceKind,
} from '../engine/types';

const GEM_FILL: Record<GemColor, string> = {
  red: '#ef4444',
  yellow: '#facc15',
  blue: '#3b82f6',
  white: '#e2e8f0',
};

const SPECIAL_FILL: Record<SpecialPieceKind, string> = {
  'clear-diamond': '#f8fbff',
  'black-body': SPECIAL_COLOR_SWATCHES['black-body'],
};

function specialKindOf(piece: PlacedPiece): SpecialPieceKind | null {
  return isSpecialPieceKind(piece.kind) ? piece.kind : null;
}

function solidFillFor(piece: PlacedPiece): string {
  if (piece.color) return GEM_FILL[piece.color];
  const special = specialKindOf(piece);
  return special ? SPECIAL_FILL[special] : '#e2e8f0';
}

function patternFor(piece: PlacedPiece): string {
  if (piece.color) return `url(#gem-${piece.color})`;
  const special = specialKindOf(piece);
  return special ? `url(#gem-${special})` : 'none';
}

function pieceTitle(piece: PlacedPiece): string {
  const special = specialKindOf(piece);
  if (special) return `${labelForKind(piece.kind)} — ${SPECIAL_COLOR_LABELS[special]}`;
  return `${labelForKind(piece.kind)} — ${piece.color ?? 'incolore'}`;
}

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardProps {
  mine?: Mine;
  notes?: Mine;
  crosses?: Cell[] | null;
  edgeMarks?: NoteEdgeMark[] | null;
  colorMarks?: ColorMark[] | null;
  /** Étiquettes de bord déjà utilisées dans le journal public. */
  askedEntries?: ReadonlySet<string> | null;
  onCellAction?: (cell: Cell, event: ReactMouseEvent<SVGElement>) => void;
  onCellPointerDown?: (
    cell: Cell,
    point: BoardPoint,
    event: ReactPointerEvent<SVGRectElement>,
  ) => void;
  onCellPointerMove?: (
    cell: Cell | null,
    point: BoardPoint | null,
    event: ReactPointerEvent<SVGSVGElement>,
  ) => void;
  onCellPointerUp?: (
    cell: Cell | null,
    point: BoardPoint | null,
    event: ReactPointerEvent<SVGSVGElement>,
  ) => void;
  onCellPointerCancel?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onCellPointerLeave?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPiecePointerDown?: (
    piece: PlacedPiece,
    point: BoardPoint,
    event: ReactPointerEvent<SVGGElement>,
  ) => void;
  onEntryAction?: (label: string) => void;
  interactiveCells?: boolean;
  interactiveEntries?: boolean;
  piecesInteractive?: boolean;
  dragEnabled?: boolean;
  dragging?: boolean;
  ghostPiece?: PlacedPiece | null;
  ghostValid?: boolean;
  highlightCell?: Cell | null;
  path?: Point[] | null;
  pathColor?: RayColor;
  className?: string;
  ariaLabel?: string;
  showNotes?: boolean;
}

function viewBoxOf(
  svg: SVGSVGElement,
): { x: number; y: number; width: number; height: number } | null {
  const base = svg.viewBox?.baseVal;
  if (base && base.width > 0 && base.height > 0) {
    return { x: base.x, y: base.y, width: base.width, height: base.height };
  }
  const attribute = svg.getAttribute('viewBox');
  if (!attribute) return null;
  const [x, y, width, height] = attribute.split(/[\s,]+/).map(Number);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !width ||
    !height
  ) {
    return null;
  }
  return { x: x ?? 0, y: y ?? 0, width, height };
}

function boardPointFromClient(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): BoardPoint | null {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const viewBox = viewBoxOf(svg);
  if (!viewBox) return null;
  return {
    x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
    y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
  };
}

function capturePointer(element: Element | null, pointerId: number): void {
  try {
    element?.setPointerCapture(pointerId);
  } catch {
    // Le pointeur peut déjà être relâché ou la capture non prise en charge.
  }
}

function releasePointer(element: Element | null, pointerId: number): void {
  try {
    element?.releasePointerCapture(pointerId);
  } catch {
    // La capture a pu être perdue entre-temps.
  }
}

function cellForPoint(point: BoardPoint | null): Cell | null {
  if (!point) return null;
  if (point.x < 0 || point.x >= BOARD_WIDTH || point.y < 0 || point.y >= BOARD_HEIGHT) {
    return null;
  }
  return { col: Math.floor(point.x), row: Math.floor(point.y) };
}

function cellFromTarget(target: EventTarget | null): Cell | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest('[data-cell]');
  const value = element?.getAttribute('data-cell');
  if (!value) return null;
  const parts = value.split(',');
  const col = Number(parts[0]);
  const row = Number(parts[1]);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return { col, row };
}

function polygonPoints(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function handleKey(event: KeyboardEvent<SVGGElement>, action: () => void): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function PatternDefs() {
  return (
    <defs>
      {(Object.keys(GEM_FILL) as GemColor[]).map((color) => (
        <pattern
          key={color}
          id={`gem-${color}`}
          width="0.5"
          height="0.5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <rect width="0.5" height="0.5" fill={GEM_FILL[color]} />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="0.5"
            stroke="#0b1220"
            strokeOpacity="0.22"
            strokeWidth="0.06"
          />
        </pattern>
      ))}
      <radialGradient id="gem-clear-diamond" cx="38%" cy="32%" r="78%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#f0f9ff" />
        <stop offset="100%" stopColor="#bae6fd" />
      </radialGradient>
      <pattern
        id="gem-black-body"
        width="0.34"
        height="0.34"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="0.34" height="0.34" fill={SPECIAL_FILL['black-body']} />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="0.34"
          stroke="#64748b"
          strokeOpacity="0.45"
          strokeWidth="0.035"
        />
      </pattern>
    </defs>
  );
}

export function Board({
  mine,
  notes,
  crosses = null,
  edgeMarks = null,
  colorMarks = null,
  askedEntries = null,
  onCellAction,
  onCellPointerDown,
  onCellPointerMove,
  onCellPointerUp,
  onCellPointerCancel,
  onCellPointerLeave,
  onPiecePointerDown,
  onEntryAction,
  interactiveCells = false,
  interactiveEntries = false,
  piecesInteractive = false,
  dragEnabled = false,
  dragging = false,
  ghostPiece = null,
  ghostValid = true,
  highlightCell = null,
  path = null,
  pathColor = 'white',
  className,
  ariaLabel = 'Plateau de mine, 10 colonnes sur 8 lignes',
  showNotes = true,
}: BoardProps) {
  const cellAction = interactiveCells && onCellAction ? onCellAction : null;
  const cellPointerDown = interactiveCells && onCellPointerDown ? onCellPointerDown : null;
  const piecePointerDown = piecesInteractive && onPiecePointerDown ? onPiecePointerDown : null;
  const hasPointerHandlers = Boolean(
    onCellPointerDown || onCellPointerMove || onCellPointerUp || onCellPointerCancel,
  );
  const entryAction = interactiveEntries && onEntryAction ? onEntryAction : null;
  const pathStroke = RAY_COLOR_SWATCHES[pathColor];
  const style = { '--ray-color': pathStroke } as CSSProperties;
  const isAsked = (label: string) => Boolean(askedEntries?.has(label));
  const entryClass = (label: string) =>
    `board-entry${entryAction ? ' board-entry--active' : ''}${isAsked(label) ? ' is-asked' : ''}`;
  const entryAria = (side: string, label: string) =>
    entryAction
      ? `Rayon depuis ${side}, entrée ${label}${isAsked(label) ? ' (déjà demandé)' : ''}`
      : undefined;

  return (
    <svg
      className={`board-svg${cellAction || cellPointerDown ? ' board-svg--cells' : ''}${
        dragEnabled ? ' board-svg--drag' : ''
      }${dragging ? ' is-dragging' : ''}${className ? ` ${className}` : ''}`}
      viewBox="-1.15 -0.95 12.3 10.1"
      role="group"
      aria-label={ariaLabel}
      style={style}
      onPointerMove={
        onCellPointerMove
          ? (event) => {
              const point = boardPointFromClient(event.currentTarget, event.clientX, event.clientY);
              const cell = cellForPoint(point) ?? cellFromTarget(event.target);
              onCellPointerMove(
                cell,
                point ?? (cell ? { x: cell.col + 0.5, y: cell.row + 0.5 } : null),
                event,
              );
            }
          : undefined
      }
      onPointerUp={
        hasPointerHandlers
          ? (event) => {
              const point = boardPointFromClient(event.currentTarget, event.clientX, event.clientY);
              const cell = cellForPoint(point) ?? cellFromTarget(event.target);
              onCellPointerUp?.(
                cell,
                point ?? (cell ? { x: cell.col + 0.5, y: cell.row + 0.5 } : null),
                event,
              );
              releasePointer(event.currentTarget, event.pointerId);
            }
          : undefined
      }
      onPointerCancel={
        hasPointerHandlers
          ? (event) => {
              onCellPointerCancel?.(event);
              releasePointer(event.currentTarget, event.pointerId);
            }
          : undefined
      }
      onPointerLeave={onCellPointerLeave}
    >
      <PatternDefs />

      <rect x="0" y="0" width={BOARD_WIDTH} height={BOARD_HEIGHT} className="board-surface" />
      <g className="board-grid" aria-hidden="true">
        {Array.from({ length: BOARD_WIDTH + 1 }, (_, index) => (
          <line key={`v-${index}`} x1={index} y1="0" x2={index} y2={BOARD_HEIGHT} />
        ))}
        {Array.from({ length: BOARD_HEIGHT + 1 }, (_, index) => (
          <line key={`h-${index}`} x1="0" y1={index} x2={BOARD_WIDTH} y2={index} />
        ))}
      </g>

      {cellAction || cellPointerDown ? (
        <g className="board-cells">
          {Array.from({ length: BOARD_HEIGHT }, (_, row) =>
            Array.from({ length: BOARD_WIDTH }, (_, col) => (
              <rect
                key={`cell-${col}-${row}`}
                x={col}
                y={row}
                width="1"
                height="1"
                className="board-cell-hit"
                data-cell={`${col},${row}`}
                onClick={cellAction ? (event) => cellAction({ col, row }, event) : undefined}
                onPointerDown={
                  cellPointerDown
                    ? (event) => {
                        const svg = event.currentTarget.ownerSVGElement;
                        capturePointer(svg, event.pointerId);
                        const point = svg
                          ? boardPointFromClient(svg, event.clientX, event.clientY)
                          : null;
                        cellPointerDown(
                          { col, row },
                          point ?? { x: col + 0.5, y: row + 0.5 },
                          event,
                        );
                      }
                    : undefined
                }
              >
                <title>{`Case ${String.fromCharCode(65 + row)}${col + 1}`}</title>
              </rect>
            )),
          )}
        </g>
      ) : null}

      {highlightCell ? (
        <rect
          x={highlightCell.col}
          y={highlightCell.row}
          width="1"
          height="1"
          className="board-cell-highlight"
          aria-hidden="true"
        />
      ) : null}

      {showNotes && notes
        ? notes.pieces.map((piece) => (
            <polygon
              key={`note-${piece.id}`}
              points={polygonPoints(piecePolygon(piece))}
              className="board-note"
              aria-hidden="true"
            />
          ))
        : null}

      {crosses && crosses.length > 0 ? (
        <g className="board-crosses" aria-hidden="true">
          {crosses.map((cell) => (
            <g key={`cross-${cell.col}-${cell.row}`}>
              <line
                x1={cell.col + 0.24}
                y1={cell.row + 0.24}
                x2={cell.col + 0.76}
                y2={cell.row + 0.76}
              />
              <line
                x1={cell.col + 0.76}
                y1={cell.row + 0.24}
                x2={cell.col + 0.24}
                y2={cell.row + 0.76}
              />
            </g>
          ))}
        </g>
      ) : null}

      {mine?.pieces.map((piece) => (
        <g
          key={piece.id}
          className={`board-gem${piecePointerDown ? ' board-gem--movable' : ''}`}
          onPointerDown={
            piecePointerDown
              ? (event) => {
                  event.preventDefault();
                  const svg = event.currentTarget.ownerSVGElement;
                  capturePointer(svg, event.pointerId);
                  const point = svg
                    ? boardPointFromClient(svg, event.clientX, event.clientY)
                    : null;
                  piecePointerDown(piece, point ?? { x: piece.x + 0.5, y: piece.y + 0.5 }, event);
                }
              : undefined
          }
          onClick={
            !piecePointerDown && cellAction
              ? (event) => {
                  const svg = event.currentTarget.ownerSVGElement;
                  const point = svg
                    ? boardPointFromClient(svg, event.clientX, event.clientY)
                    : null;
                  const cell = cellForPoint(point) ?? {
                    col: Math.floor(piece.x + 0.5),
                    row: Math.floor(piece.y + 0.5),
                  };
                  cellAction(cell, event);
                }
              : undefined
          }
        >
          <polygon
            points={polygonPoints(piecePolygon(piece))}
            fill={solidFillFor(piece)}
            className={`board-gem-solid${specialKindOf(piece) ? ` board-gem-solid--${specialKindOf(piece)}` : ''}`}
          />
          <polygon
            points={polygonPoints(piecePolygon(piece))}
            fill={patternFor(piece)}
            stroke={
              specialKindOf(piece) === 'clear-diamond'
                ? '#7dd3fc'
                : piece.color === 'white'
                  ? '#f8fafc'
                  : '#0b1220'
            }
            strokeWidth={specialKindOf(piece) === 'clear-diamond' ? '0.06' : '0.045'}
            strokeLinejoin="round"
          >
            <title>{pieceTitle(piece)}</title>
          </polygon>
          {specialKindOf(piece) === 'clear-diamond' ? (
            <polygon
              points={polygonPoints(piecePolygon(piece))}
              fill="none"
              stroke="#e0f2fe"
              strokeOpacity="0.55"
              strokeWidth="0.16"
              strokeLinejoin="round"
              className="board-gem-aura"
              aria-hidden="true"
            />
          ) : null}
        </g>
      ))}

      {ghostPiece ? (
        <g className={`board-ghost${ghostValid ? ' is-valid' : ' is-invalid'}`} aria-hidden="true">
          <polygon
            points={polygonPoints(piecePolygon(ghostPiece))}
            fill={solidFillFor(ghostPiece)}
            className="board-ghost-solid"
          />
          <polygon
            points={polygonPoints(piecePolygon(ghostPiece))}
            fill={patternFor(ghostPiece)}
            className="board-ghost-pattern"
          />
        </g>
      ) : null}

      {edgeMarks && edgeMarks.length > 0 ? (
        <g className="board-edges" aria-hidden="true">
          {edgeMarks.map((mark) => {
            const segment = edgeSegment(mark);
            const key = `edge-${mark.kind}-${mark.col}-${mark.row}`;
            return (
              <g key={key}>
                <line {...segment} className="board-edge-casing" />
                <line
                  {...segment}
                  stroke={NOTE_COLOR_SWATCHES[mark.color]}
                  className="board-edge-line"
                />
              </g>
            );
          })}
        </g>
      ) : null}

      {colorMarks && colorMarks.length > 0 ? (
        <g className="board-color-marks" aria-hidden="true">
          {colorMarks.map((mark) => (
            <circle
              key={`color-${mark.cell.col}-${mark.cell.row}`}
              cx={mark.cell.col + 0.5}
              cy={mark.cell.row + 0.5}
              r="0.22"
              fill={NOTE_COLOR_SWATCHES[mark.color]}
            />
          ))}
        </g>
      ) : null}

      {path && path.length > 1 ? (
        <g className="board-ray" aria-hidden="true">
          <polyline
            points={polygonPoints(path)}
            fill="none"
            stroke={pathStroke}
            strokeWidth="0.09"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={path[path.length - 1]?.x}
            cy={path[path.length - 1]?.y}
            r="0.12"
            fill={pathStroke}
          />
        </g>
      ) : null}

      <g className="board-labels" aria-hidden={entryAction ? undefined : true}>
        {TOP_LABELS.map((label, index) => (
          <g
            key={`top-${label}`}
            className={entryClass(label)}
            role={entryAction ? 'button' : undefined}
            tabIndex={entryAction ? 0 : undefined}
            aria-label={entryAria('le haut', label)}
            onClick={entryAction ? () => entryAction(label) : undefined}
            onKeyDown={
              entryAction ? (event) => handleKey(event, () => entryAction(label)) : undefined
            }
          >
            {entryAction ? (
              <rect
                x={index + 0.08}
                y="-0.82"
                width="0.84"
                height="0.62"
                className="board-entry-hit"
              />
            ) : null}
            <text x={index + 0.5} y="-0.39" textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        {BOTTOM_LABELS.map((label, index) => (
          <g
            key={`bottom-${label}`}
            className={entryClass(label)}
            role={entryAction ? 'button' : undefined}
            tabIndex={entryAction ? 0 : undefined}
            aria-label={entryAria('le bas', label)}
            onClick={entryAction ? () => entryAction(label) : undefined}
            onKeyDown={
              entryAction ? (event) => handleKey(event, () => entryAction(label)) : undefined
            }
          >
            {entryAction ? (
              <rect
                x={index + 0.08}
                y="8.2"
                width="0.84"
                height="0.62"
                className="board-entry-hit"
              />
            ) : null}
            <text x={index + 0.5} y="8.64" textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        {LEFT_LABELS.map((label, index) => (
          <g
            key={`left-${label}`}
            className={entryClass(label)}
            role={entryAction ? 'button' : undefined}
            tabIndex={entryAction ? 0 : undefined}
            aria-label={entryAria('la gauche', label)}
            onClick={entryAction ? () => entryAction(label) : undefined}
            onKeyDown={
              entryAction ? (event) => handleKey(event, () => entryAction(label)) : undefined
            }
          >
            {entryAction ? (
              <rect
                x="-0.97"
                y={index + 0.08}
                width="0.62"
                height="0.84"
                className="board-entry-hit"
              />
            ) : null}
            <text x="-0.55" y={index + 0.62} textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
        {RIGHT_LABELS.map((label, index) => (
          <g
            key={`right-${label}`}
            className={entryClass(label)}
            role={entryAction ? 'button' : undefined}
            tabIndex={entryAction ? 0 : undefined}
            aria-label={entryAria('la droite', label)}
            onClick={entryAction ? () => entryAction(label) : undefined}
            onKeyDown={
              entryAction ? (event) => handleKey(event, () => entryAction(label)) : undefined
            }
          >
            {entryAction ? (
              <rect
                x="10.35"
                y={index + 0.08}
                width="0.62"
                height="0.84"
                className="board-entry-hit"
              />
            ) : null}
            <text x="10.62" y={index + 0.62} textAnchor="middle">
              {label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export function EntryLabel({ label }: { label: string }) {
  const entry = entryForLabel(label);
  return <span className="entry-label">{entry ? `${sideLabel(entry.side)} ${label}` : label}</span>;
}
