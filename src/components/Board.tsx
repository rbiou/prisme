import type { CSSProperties, KeyboardEvent } from 'react';
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
import { RAY_COLOR_SWATCHES } from '../engine/colors';
import { edgeSegment, type NoteEdgeMark } from '../engine/noteEdges';
import { labelForKind, piecePolygon } from '../engine/pieces';
import type { Cell, GemColor, Mine, Point, RayColor } from '../engine/types';

const GEM_FILL: Record<GemColor, string> = {
  red: '#ef4444',
  yellow: '#facc15',
  blue: '#3b82f6',
  white: '#e2e8f0',
};

export interface BoardProps {
  mine?: Mine;
  notes?: Mine;
  crosses?: Cell[] | null;
  edgeMarks?: NoteEdgeMark[] | null;
  /** Étiquettes de bord déjà utilisées dans le journal public. */
  askedEntries?: ReadonlySet<string> | null;
  onCellAction?: (cell: Cell) => void;
  onEntryAction?: (label: string) => void;
  interactiveCells?: boolean;
  interactiveEntries?: boolean;
  highlightCell?: Cell | null;
  path?: Point[] | null;
  pathColor?: RayColor;
  className?: string;
  ariaLabel?: string;
  showNotes?: boolean;
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
      <filter id="gem-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="0.08" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

export function Board({
  mine,
  notes,
  crosses = null,
  edgeMarks = null,
  askedEntries = null,
  onCellAction,
  onEntryAction,
  interactiveCells = false,
  interactiveEntries = false,
  highlightCell = null,
  path = null,
  pathColor = 'white',
  className,
  ariaLabel = 'Plateau de mine, 10 colonnes sur 8 lignes',
  showNotes = true,
}: BoardProps) {
  const cellAction = interactiveCells && onCellAction ? onCellAction : null;
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
      className={`board-svg${cellAction ? ' board-svg--cells' : ''}${className ? ` ${className}` : ''}`}
      viewBox="-1.15 -0.95 12.3 10.1"
      role="group"
      aria-label={ariaLabel}
      style={style}
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

      {cellAction ? (
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
                onClick={() => cellAction({ col, row })}
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
        <g key={piece.id} className="board-gem" filter="url(#gem-glow)">
          <polygon
            points={polygonPoints(piecePolygon(piece))}
            fill={`url(#gem-${piece.color})`}
            stroke={piece.color === 'white' ? '#f8fafc' : '#0b1220'}
            strokeWidth="0.045"
            strokeLinejoin="round"
          >
            <title>{`${labelForKind(piece.kind)} — ${piece.color === 'white' ? 'blanc' : piece.color}`}</title>
          </polygon>
        </g>
      ))}

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
                  stroke={RAY_COLOR_SWATCHES[mark.color]}
                  className="board-edge-line"
                />
              </g>
            );
          })}
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
