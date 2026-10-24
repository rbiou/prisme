import { useState } from 'react';
import { cellLabel, parseCellLabel } from '../engine/board';
import { colorMarkAt, upsertColorMark, type ColorMark } from '../engine/colorMarks';
import { GEM_COLORS, GEM_COLOR_LABELS } from '../engine/colors';
import { upsertNoteEdge, type CellEdgeSide, type NoteEdgeMark } from '../engine/noteEdges';
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
import type { Cell, GemColor, Mine, PieceKind, Point, RayColor, Rotation } from '../engine/types';
import { Board } from './Board';
import { fr } from '../i18n/fr';

const GEM_FILL: Record<string, string> = {
  red: '#ef4444',
  yellow: '#facc15',
  blue: '#3b82f6',
  white: '#e2e8f0',
};

const EDGE_SIDE_OPTIONS: Array<{ value: CellEdgeSide; label: string; name: string }> = [
  { value: 'top', label: fr.placement.edgeTop, name: fr.placement.edgeTop },
  { value: 'right', label: fr.placement.edgeRight, name: fr.placement.edgeRight },
  { value: 'bottom', label: fr.placement.edgeBottom, name: fr.placement.edgeBottom },
  { value: 'left', label: fr.placement.edgeLeft, name: fr.placement.edgeLeft },
  { value: 'diagonal-down', label: '↘', name: fr.placement.edgeDiagonalDown },
  { value: 'diagonal-up', label: '↗', name: fr.placement.edgeDiagonalUp },
];

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

export type NoteTool = 'scan' | 'piece' | 'cross' | 'edge' | 'dot';

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
  /** Arêtes de gemmes notées avec une couleur, sans révéler la mine réelle. */
  edgeMarks?: NoteEdgeMark[];
  onEdgeMarksChange?: (marks: NoteEdgeMark[]) => void;
  /** Ronds de couleur : gemme de couleur connue, forme inconnue. */
  colorMarks?: ColorMark[];
  onColorMarksChange?: (marks: ColorMark[]) => void;
  /** Outil courant, contrôlé par l’écran de partie. */
  tool?: NoteTool;
  onToolChange?: (tool: NoteTool) => void;
  /** Sonder une case ou un rayon directement depuis le plateau de notes. */
  scanEnabled?: boolean;
  onScanCell?: (cell: Cell) => void;
  onScanEntry?: (label: string) => void;
  askedEntries?: ReadonlySet<string> | null;
  showCoordinateInput?: boolean;
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
  edgeMarks = [],
  onEdgeMarksChange,
  colorMarks = [],
  onColorMarksChange,
  tool: controlledTool,
  onToolChange,
  scanEnabled = false,
  onScanCell,
  onScanEntry,
  askedEntries = null,
  showCoordinateInput = true,
}: MineComposerProps) {
  const [internalKind, setInternalKind] = useState<PieceKind>('red-parallelogram');
  const [rotation, setRotation] = useState<Rotation>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [coordinate, setCoordinate] = useState('');
  const [internalTool, setInternalTool] = useState<NoteTool>(onScanCell ? 'scan' : 'piece');
  const [edgeSide, setEdgeSide] = useState<CellEdgeSide>('top');
  const [markColor, setMarkColor] = useState<GemColor>('red');

  const tool = controlledTool ?? internalTool;
  function changeTool(next: NoteTool) {
    setInternalTool(next);
    onToolChange?.(next);
  }

  const activeKind = selectedKind ?? internalKind;
  const placed = mine.pieces.find((piece) => piece.kind === activeKind);
  const scanMode = tool === 'scan';
  const crossMode = Boolean(onCrossesChange) && tool === 'cross';
  const edgeMode = Boolean(onEdgeMarksChange) && tool === 'edge';
  const dotMode = Boolean(onColorMarksChange) && tool === 'dot';

  function selectKind(kind: PieceKind) {
    if (disabled) return;
    changeTool('piece');
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
    // La case n’est plus vide : une croix ou un rond éventuel n’a plus de sens.
    if (onCrossesChange && crosses.some((item) => item.col === cell.col && item.row === cell.row)) {
      onCrossesChange(crosses.filter((item) => !(item.col === cell.col && item.row === cell.row)));
    }
    if (onColorMarksChange && colorMarkAt(colorMarks, cell)) {
      onColorMarksChange(
        colorMarks.filter((mark) => !(mark.cell.col === cell.col && mark.cell.row === cell.row)),
      );
    }
    setMessage(null);
  }

  function toggleCross(cell: Cell) {
    if (disabled || !onCrossesChange) return;
    const exists = crosses.some((item) => item.col === cell.col && item.row === cell.row);
    if (exists) {
      onCrossesChange(crosses.filter((item) => !(item.col === cell.col && item.row === cell.row)));
    } else {
      onCrossesChange([...crosses, cell]);
      if (onColorMarksChange && colorMarkAt(colorMarks, cell)) {
        onColorMarksChange(
          colorMarks.filter((mark) => !(mark.cell.col === cell.col && mark.cell.row === cell.row)),
        );
      }
    }
    setMessage(null);
  }

  function placeEdge(cell: Cell) {
    if (disabled || !onEdgeMarksChange) return;
    const isDiagonal = edgeSide === 'diagonal-down' || edgeSide === 'diagonal-up';
    // Les deux diagonales d’une même case ne peuvent pas appartenir à une gemme.
    const base = isDiagonal
      ? edgeMarks.filter(
          (mark) =>
            !(
              (mark.kind === 'diagonal-down' || mark.kind === 'diagonal-up') &&
              mark.col === cell.col &&
              mark.row === cell.row &&
              mark.kind !== edgeSide
            ),
        )
      : edgeMarks;
    onEdgeMarksChange(upsertNoteEdge(base, cell, edgeSide, markColor));
    if (isDiagonal && onCrossesChange) {
      const remaining = crosses.filter((item) => !(item.col === cell.col && item.row === cell.row));
      if (remaining.length !== crosses.length) onCrossesChange(remaining);
    }
    setMessage(null);
  }

  function placeDot(cell: Cell) {
    if (disabled || !onColorMarksChange) return;
    const existing = colorMarkAt(colorMarks, cell);
    onColorMarksChange(upsertColorMark(colorMarks, cell, markColor));
    if (existing?.color !== markColor && onCrossesChange) {
      const remaining = crosses.filter((item) => !(item.col === cell.col && item.row === cell.row));
      if (remaining.length !== crosses.length) onCrossesChange(remaining);
    }
    setMessage(null);
  }

  function handleCell(cell: Cell) {
    if (scanMode) {
      if (scanEnabled) onScanCell?.(cell);
      return;
    }
    if (crossMode) {
      toggleCross(cell);
      return;
    }
    if (edgeMode) {
      placeEdge(cell);
      return;
    }
    if (dotMode) {
      placeDot(cell);
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
    onEdgeMarksChange?.([]);
    onColorMarksChange?.([]);
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
            disabled={
              disabled ||
              (mine.pieces.length === 0 &&
                crosses.length === 0 &&
                edgeMarks.length === 0 &&
                colorMarks.length === 0)
            }
          >
            {fr.placement.clear}
          </button>
        </div>
      </div>

      {onScanCell || onCrossesChange || onEdgeMarksChange || onColorMarksChange ? (
        <div className="composer-tools">
          <div className="mode-switch" role="group" aria-label={fr.placement.notesTool}>
            {onScanCell ? (
              <button
                type="button"
                className={`mode-button${tool === 'scan' ? ' is-active' : ''}`}
                aria-pressed={tool === 'scan'}
                onClick={() => changeTool('scan')}
                disabled={disabled}
              >
                {fr.placement.scanTool}
              </button>
            ) : null}
            <button
              type="button"
              className={`mode-button${tool === 'piece' ? ' is-active' : ''}`}
              aria-pressed={tool === 'piece'}
              onClick={() => changeTool('piece')}
              disabled={disabled}
            >
              {fr.placement.pieceTool}
            </button>
            {onCrossesChange ? (
              <button
                type="button"
                className={`mode-button${tool === 'cross' ? ' is-active' : ''}`}
                aria-pressed={tool === 'cross'}
                onClick={() => changeTool('cross')}
                disabled={disabled}
              >
                {fr.placement.crossTool}
              </button>
            ) : null}
            {onEdgeMarksChange ? (
              <button
                type="button"
                className={`mode-button${tool === 'edge' ? ' is-active' : ''}`}
                aria-pressed={tool === 'edge'}
                onClick={() => changeTool('edge')}
                disabled={disabled}
              >
                {fr.placement.edgeTool}
              </button>
            ) : null}
            {onColorMarksChange ? (
              <button
                type="button"
                className={`mode-button${tool === 'dot' ? ' is-active' : ''}`}
                aria-pressed={tool === 'dot'}
                onClick={() => changeTool('dot')}
                disabled={disabled}
              >
                {fr.placement.dotTool}
              </button>
            ) : null}
          </div>
          {tool === 'cross' && crosses.length > 0 ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onCrossesChange?.([])}
              disabled={disabled}
            >
              {fr.placement.clearCrosses}
            </button>
          ) : null}
          {tool === 'edge' && edgeMarks.length > 0 ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onEdgeMarksChange?.([])}
              disabled={disabled}
            >
              {fr.placement.clearEdges}
            </button>
          ) : null}
          {tool === 'dot' && colorMarks.length > 0 ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onColorMarksChange?.([])}
              disabled={disabled}
            >
              {fr.placement.clearDots}
            </button>
          ) : null}
        </div>
      ) : null}

      {edgeMode || dotMode ? (
        <div className="edge-tools">
          {edgeMode ? (
            <div className="edge-group">
              <span className="edge-group-label">{fr.placement.edgeSide}</span>
              <div className="edge-options" role="group" aria-label={fr.placement.edgeSide}>
                {EDGE_SIDE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`mode-button${edgeSide === option.value ? ' is-active' : ''}`}
                    aria-pressed={edgeSide === option.value}
                    aria-label={option.name}
                    title={option.name}
                    onClick={() => setEdgeSide(option.value)}
                    disabled={disabled}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="edge-group">
            <span className="edge-group-label">{fr.placement.edgeColor}</span>
            <div className="edge-options" role="group" aria-label={fr.placement.edgeColor}>
              {GEM_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`edge-color${markColor === color ? ' is-active' : ''}`}
                  aria-pressed={markColor === color}
                  onClick={() => setMarkColor(color)}
                  disabled={disabled}
                >
                  <span
                    className="edge-color-swatch"
                    style={{ backgroundColor: GEM_FILL[color] }}
                    aria-hidden="true"
                  />
                  <span>{GEM_COLOR_LABELS[color]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="board-frame">
        <Board
          mine={mine}
          crosses={crosses}
          edgeMarks={edgeMarks}
          colorMarks={colorMarks}
          askedEntries={askedEntries}
          interactiveEntries={Boolean(scanEnabled && onScanEntry)}
          onEntryAction={scanEnabled ? onScanEntry : undefined}
          onCellAction={disabled ? undefined : handleCell}
          interactiveCells={!disabled}
          ariaLabel={boardAriaLabel ?? fr.placement.board}
          path={path}
          pathColor={pathColor}
        />
      </div>

      {showCoordinateInput ? (
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
      ) : null}

      <p className="hint">
        {scanMode
          ? fr.placement.scanHint
          : dotMode
            ? fr.placement.dotHint
            : edgeMode
              ? fr.placement.edgeHint
              : crossMode
                ? fr.placement.crossHint
                : fr.placement.placeHint}
      </p>
      {message ? (
        <p className="inline-alert" role="status">
          {message}
        </p>
      ) : null}
      {colorMarks.length > 0 ? (
        <p className="visually-hidden">
          Ronds de couleur :{' '}
          {colorMarks
            .map((mark) => `${GEM_COLOR_LABELS[mark.color]} en ${cellLabel(mark.cell)}`)
            .join(' ; ')}
          .
        </p>
      ) : null}
      <p className="visually-hidden">
        {BASE_PIECE_KINDS.length} gemmes : rouge, jaune, bleue, triangle blanc et losange blanc.
      </p>
    </div>
  );
}
