import { useState } from 'react';
import { parseCellLabel } from '../engine/board';
import { GEM_COLOR_LABELS } from '../engine/colors';
import {
  BASE_PIECE_KINDS,
  PIECE_ORDER,
  colorForKind,
  createPiece,
  labelForKind,
  pieceBoundingBox,
  shapeFor,
} from '../engine/pieces';
import { removePiece, upsertPiece } from '../engine/mine';
import type { Cell, Mine, PieceKind, Point, RayColor, Rotation } from '../engine/types';
import { Board } from './Board';
import { fr } from '../i18n/fr';

const GEM_FILL: Record<string, string> = {
  red: '#ef4444',
  yellow: '#facc15',
  blue: '#3b82f6',
  white: '#e2e8f0',
};

export function GemPreview({
  kind,
  rotation = 0,
  className,
}: {
  kind: PieceKind;
  rotation?: Rotation;
  className?: string;
}) {
  const shape = shapeFor(kind, rotation);
  const maxX = Math.max(...shape.map((point) => point.x));
  const maxY = Math.max(...shape.map((point) => point.y));
  const fill = GEM_FILL[colorForKind(kind)] ?? '#e2e8f0';
  return (
    <svg
      viewBox={`-0.25 -0.25 ${maxX + 0.5} ${maxY + 0.5}`}
      className={`gem-preview${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <polygon
        points={shape.map((point) => `${point.x},${point.y}`).join(' ')}
        fill={fill}
        fillOpacity="0.9"
        stroke="#0b1220"
        strokeWidth="0.08"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface MineComposerProps {
  mine: Mine;
  onChange: (mine: Mine) => void;
  disabled?: boolean;
  boardAriaLabel?: string;
  selectedKind?: PieceKind;
  onSelectedKindChange?: (kind: PieceKind) => void;
  path?: Point[] | null;
  pathColor?: RayColor;
  /** Cases marquées comme vides dans les notes privées. */
  crosses?: Cell[];
  onCrossesChange?: (cells: Cell[]) => void;
}

export function MineComposer({
  mine,
  onChange,
  disabled = false,
  boardAriaLabel,
  selectedKind,
  onSelectedKindChange,
  path = null,
  pathColor = 'white',
  crosses = [],
  onCrossesChange,
}: MineComposerProps) {
  const [internalKind, setInternalKind] = useState<PieceKind>('red-parallelogram');
  const [rotation, setRotation] = useState<Rotation>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [coordinate, setCoordinate] = useState('');
  const [tool, setTool] = useState<'piece' | 'cross'>('piece');

  const activeKind = selectedKind ?? internalKind;
  const placed = mine.pieces.find((piece) => piece.kind === activeKind);
  const crossMode = Boolean(onCrossesChange) && tool === 'cross';

  function selectKind(kind: PieceKind) {
    if (disabled) return;
    setInternalKind(kind);
    onSelectedKindChange?.(kind);
    const existing = mine.pieces.find((piece) => piece.kind === kind);
    setRotation(existing?.rotation ?? 0);
    setMessage(null);
  }

  function placeAt(cell: Cell) {
    if (disabled) return;
    const candidate = createPiece(activeKind, rotation, cell.col, cell.row);
    const box = pieceBoundingBox(candidate);
    if (box.minX < 0 || box.minY < 0 || box.maxX > 10 || box.maxY > 8) {
      setMessage('La pièce dépasse du plateau depuis cette position.');
      return;
    }
    onChange(upsertPiece(mine, candidate));
    // La case n’est plus vide : une croix éventuelle n’a plus de sens.
    if (onCrossesChange && crosses.some((item) => item.col === cell.col && item.row === cell.row)) {
      onCrossesChange(crosses.filter((item) => !(item.col === cell.col && item.row === cell.row)));
    }
    setMessage(null);
  }

  function toggleCross(cell: Cell) {
    if (disabled || !onCrossesChange) return;
    const exists = crosses.some((item) => item.col === cell.col && item.row === cell.row);
    onCrossesChange(
      exists
        ? crosses.filter((item) => !(item.col === cell.col && item.row === cell.row))
        : [...crosses, cell],
    );
    setMessage(null);
  }

  function handleCell(cell: Cell) {
    if (crossMode) {
      toggleCross(cell);
      return;
    }
    placeAt(cell);
  }

  function rotate() {
    if (disabled) return;
    const next = ((rotation + 1) % 4) as Rotation;
    setRotation(next);
    if (placed) {
      onChange(upsertPiece(mine, { ...placed, rotation: next }));
    }
  }

  function remove() {
    if (disabled) return;
    if (placed) onChange(removePiece(mine, activeKind));
    setMessage(null);
  }

  function clear() {
    if (disabled) return;
    onChange({ version: 1, pieces: [] });
    onCrossesChange?.([]);
    setRotation(0);
    setMessage(null);
  }

  function placeFromCoordinate() {
    const cell = parseCellLabel(coordinate);
    if (!cell) {
      setMessage('Coordonnées invalides. Exemple : E4.');
      return;
    }
    placeAt(cell);
    setCoordinate('');
  }

  return (
    <div className="mine-composer">
      <div className="palette" role="group" aria-label={fr.placement.palette}>
        {PIECE_ORDER.map((kind) => {
          const isPlaced = mine.pieces.some((piece) => piece.kind === kind);
          return (
            <button
              key={kind}
              type="button"
              className={`palette-item${activeKind === kind ? ' is-active' : ''}${isPlaced ? ' is-placed' : ''}`}
              onClick={() => selectKind(kind)}
              disabled={disabled}
              aria-pressed={activeKind === kind}
            >
              <GemPreview kind={kind} rotation={activeKind === kind ? rotation : 0} />
              <span className="palette-label">{labelForKind(kind)}</span>
              <span className="palette-meta">
                {isPlaced ? 'placée' : GEM_COLOR_LABELS[colorForKind(kind)]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="composer-toolbar">
        <div className="composer-selected">
          <GemPreview kind={activeKind} rotation={rotation} className="gem-preview--small" />
          <div>
            <strong>{labelForKind(activeKind)}</strong>
            <span>Rotation {rotation * 90}°</span>
          </div>
        </div>
        <div className="composer-actions">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={rotate}
            disabled={disabled}
          >
            {fr.common.rotate}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={remove}
            disabled={disabled || !placed}
          >
            {fr.common.remove}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={clear}
            disabled={disabled || mine.pieces.length === 0}
          >
            {fr.placement.clear}
          </button>
        </div>
      </div>

      {onCrossesChange ? (
        <div className="composer-tools">
          <div className="mode-switch" role="group" aria-label={fr.placement.notesTool}>
            <button
              type="button"
              className={`mode-button${tool === 'piece' ? ' is-active' : ''}`}
              aria-pressed={tool === 'piece'}
              onClick={() => setTool('piece')}
              disabled={disabled}
            >
              {fr.placement.pieceTool}
            </button>
            <button
              type="button"
              className={`mode-button${tool === 'cross' ? ' is-active' : ''}`}
              aria-pressed={tool === 'cross'}
              onClick={() => setTool('cross')}
              disabled={disabled}
            >
              {fr.placement.crossTool}
            </button>
          </div>
          {crosses.length > 0 ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onCrossesChange([])}
              disabled={disabled}
            >
              {fr.placement.clearCrosses}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="board-frame">
        <Board
          mine={mine}
          crosses={crosses}
          onCellAction={disabled ? undefined : handleCell}
          interactiveCells={!disabled}
          ariaLabel={boardAriaLabel ?? fr.placement.board}
          path={path}
          pathColor={pathColor}
        />
      </div>

      <div className="coordinate-row">
        <label className="field field--inline">
          <span>{fr.placement.coordinateLabel}</span>
          <input
            type="text"
            value={coordinate}
            onChange={(event) => setCoordinate(event.target.value)}
            placeholder={fr.placement.coordinatePlaceholder}
            autoComplete="off"
            autoCapitalize="characters"
            inputMode="text"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                placeFromCoordinate();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={placeFromCoordinate}
          disabled={disabled}
        >
          {fr.placement.placeAt}
        </button>
      </div>

      <p className="hint">{crossMode ? fr.placement.crossHint : fr.placement.placeHint}</p>
      {message ? (
        <p className="inline-alert" role="status">
          {message}
        </p>
      ) : null}
      <p className="visually-hidden">
        {BASE_PIECE_KINDS.length} gemmes : rouge, jaune, bleue, triangle blanc et losange blanc.
      </p>
    </div>
  );
}
