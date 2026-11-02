import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cellLabel, parseCellLabel } from '../engine/board';
import { colorMarkAt, upsertColorMark, type ColorMark } from '../engine/colorMarks';
import {
  GEM_COLOR_LABELS,
  NOTE_COLORS,
  NOTE_COLOR_LABELS,
  NOTE_COLOR_SWATCHES,
} from '../engine/colors';
import { upsertNoteEdge, type CellEdgeSide, type NoteEdgeMark } from '../engine/noteEdges';
import {
  canFlip,
  colorForKind,
  createPiece,
  isSpecialPieceKind,
  labelForKind,
  pieceKindsForMode,
  shapeFor,
} from '../engine/pieces';
import {
  canPlacePiece,
  cellsTouchedByPiece,
  clampOrigin,
  nearestValidOrigin,
  originForPoint,
  type PieceOrigin,
} from '../engine/pointerPlacement';
import { removePiece, upsertPiece } from '../engine/mine';
import type {
  Cell,
  GameMode,
  Mine,
  NoteColor,
  PieceKind,
  PlacedPiece,
  Point,
  RayColor,
  Rotation,
} from '../engine/types';
import { Board } from './Board';
import { fr } from '../i18n/fr';

const GEM_FILL: Record<string, string> = NOTE_COLOR_SWATCHES;

function kindColorLabel(kind: PieceKind): string {
  return isSpecialPieceKind(kind)
    ? 'Gemme spéciale'
    : GEM_COLOR_LABELS[colorForKind(kind) ?? 'white'];
}

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
  flipped = false,
  className,
}: {
  kind: PieceKind;
  rotation?: Rotation;
  flipped?: boolean;
  className?: string;
}) {
  const shape = shapeFor(kind, rotation, flipped);
  const maxX = Math.max(...shape.map((point) => point.x));
  const maxY = Math.max(...shape.map((point) => point.y));
  const color = colorForKind(kind);
  const fill = color ? GEM_FILL[color] : isSpecialPieceKind(kind) ? GEM_FILL[kind] : '#e2e8f0';
  const stroke = kind === 'clear-diamond' ? '#7dd3fc' : '#0b1220';
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
        fillOpacity={kind === 'black-body' ? '1' : '0.9'}
        stroke={stroke}
        strokeWidth="0.08"
        strokeLinejoin="round"
      />
      {kind === 'clear-diamond' ? (
        <polygon
          points={shape.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke="#e0f2fe"
          strokeOpacity="0.6"
          strokeWidth="0.18"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

export type NoteTool = 'scan' | 'piece' | 'cross' | 'edge' | 'dot';

interface DragState {
  kind: PieceKind;
  rotation: Rotation;
  flipped: boolean;
  origin: 'new' | 'existing';
  start: Point;
  anchor: PieceOrigin;
  grabOffset: Point;
  moved: boolean;
}

export interface MineComposerProps {
  mine: Mine;
  onChange: (mine: Mine) => void;
  /** Mode de la partie : cinq gemmes de base ou sept avec les spéciales. */
  mode?: GameMode;
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
  mode = 'base',
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
  const [flipped, setFlipped] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [coordinate, setCoordinate] = useState('');
  const [internalTool, setInternalTool] = useState<NoteTool>(onScanCell ? 'scan' : 'piece');
  const [edgeSide, setEdgeSide] = useState<CellEdgeSide>('top');
  const [markColor, setMarkColor] = useState<NoteColor>('red');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<PieceOrigin | null>(null);

  const tool = controlledTool ?? internalTool;
  function changeTool(next: NoteTool) {
    setDrag(null);
    setHover(null);
    setInternalTool(next);
    onToolChange?.(next);
  }

  const activeKind = selectedKind ?? internalKind;
  const paletteKinds = pieceKindsForMode(mode);
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
    setFlipped(existing?.flipped === true);
    setMessage(null);
  }

  function cellCoveredByPiece(cell: Cell): boolean {
    return mine.pieces.some((piece) =>
      cellsTouchedByPiece(piece).some(
        (covered) => covered.col === cell.col && covered.row === cell.row,
      ),
    );
  }

  function removeMarksUnder(piece: PlacedPiece) {
    const cells = cellsTouchedByPiece(piece);
    const touched = (cell: Cell) =>
      cells.some((item) => item.col === cell.col && item.row === cell.row);
    if (onCrossesChange) {
      const remaining = crosses.filter((cell) => !touched(cell));
      if (remaining.length !== crosses.length) onCrossesChange(remaining);
    }
    if (onColorMarksChange) {
      const remaining = colorMarks.filter((mark) => !touched(mark.cell));
      if (remaining.length !== colorMarks.length) onColorMarksChange(remaining);
    }
  }

  function commitPiece(candidate: PlacedPiece): boolean {
    if (!canPlacePiece(mine, candidate)) {
      setMessage('Cette position est occupée ou touche une autre gemme. Déplacez la gemme.');
      return false;
    }
    onChange(upsertPiece(mine, candidate));
    removeMarksUnder(candidate);
    setMessage(null);
    return true;
  }

  function placeAt(cell: Cell) {
    if (disabled) return;
    const desired = originForPoint(activeKind, rotation, {
      x: cell.col + 0.5,
      y: cell.row + 0.5,
    });
    const anchor = nearestValidOrigin(mine, activeKind, rotation, desired, flipped);
    commitPiece(createPiece(activeKind, rotation, anchor.x, anchor.y, flipped));
  }

  function beginNewDrag(point: Point) {
    const anchor = nearestValidOrigin(
      mine,
      activeKind,
      rotation,
      originForPoint(activeKind, rotation, point),
      flipped,
    );
    setHover(null);
    setDrag({
      kind: activeKind,
      rotation,
      flipped,
      origin: 'new',
      start: point,
      anchor,
      grabOffset: { x: 0, y: 0 },
      moved: false,
    });
    setMessage(null);
  }

  function beginExistingDrag(piece: PlacedPiece, point: Point) {
    setHover(null);
    setDrag({
      kind: piece.kind,
      rotation: piece.rotation,
      flipped: piece.flipped === true,
      origin: 'existing',
      start: point,
      anchor: { x: piece.x, y: piece.y },
      grabOffset: { x: piece.x - point.x, y: piece.y - point.y },
      moved: false,
    });
    setMessage(null);
  }

  function handleCellPointerDown(_cell: Cell, point: Point) {
    if (disabled || tool !== 'piece') return;
    beginNewDrag(point);
  }

  function handlePiecePointerDown(piece: PlacedPiece, point: Point) {
    if (disabled || tool !== 'piece') return;
    selectKind(piece.kind);
    beginExistingDrag(piece, point);
  }

  function handleCellPointerMove(
    cell: Cell | null,
    point: Point | null,
    event: ReactPointerEvent<SVGSVGElement>,
  ) {
    if (!point) return;
    if (drag) {
      const desired =
        drag.origin === 'new'
          ? originForPoint(drag.kind, drag.rotation, point)
          : clampOrigin(
              drag.kind,
              drag.rotation,
              point.x + drag.grabOffset.x,
              point.y + drag.grabOffset.y,
            );
      const anchor = nearestValidOrigin(mine, drag.kind, drag.rotation, desired, drag.flipped);
      const moved = drag.moved || Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 0.08;
      if (anchor.x !== drag.anchor.x || anchor.y !== drag.anchor.y || moved !== drag.moved) {
        setDrag({ ...drag, anchor, moved });
      }
      return;
    }
    if (tool === 'piece' && event.pointerType === 'mouse') {
      if (!cell) {
        setHover(null);
        return;
      }
      setHover(
        nearestValidOrigin(
          mine,
          activeKind,
          rotation,
          originForPoint(activeKind, rotation, point),
          flipped,
        ),
      );
    }
  }

  function handleCellPointerUp(cell: Cell | null) {
    if (!drag) return;
    const current = drag;
    setDrag(null);
    setHover(null);
    if (!cell) return;
    if (current.origin === 'existing' && !current.moved) return;
    commitPiece(
      createPiece(
        current.kind,
        current.rotation,
        current.anchor.x,
        current.anchor.y,
        current.flipped,
      ),
    );
  }

  function handleCellPointerCancel() {
    setDrag(null);
    setHover(null);
  }

  function handleCellPointerLeave() {
    if (!drag) setHover(null);
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

  function handleCell(cell: Cell, event?: ReactMouseEvent<SVGElement>) {
    // Un appui réel en mode Gemmes est déjà traité par les événements pointeur.
    if (tool === 'piece' && event && event.detail > 0) return;
    if (scanMode) {
      if (scanEnabled) onScanCell?.(cell);
      return;
    }
    if ((crossMode || edgeMode || dotMode) && cellCoveredByPiece(cell)) {
      setMessage('Cette case est déjà occupée par une gemme de vos notes.');
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

  const pieceTool = tool === 'piece';
  const displayedMine: Mine =
    drag?.origin === 'existing'
      ? { version: 1, pieces: mine.pieces.filter((piece) => piece.kind !== drag.kind) }
      : mine;
  const ghostPiece = drag
    ? createPiece(drag.kind, drag.rotation, drag.anchor.x, drag.anchor.y, drag.flipped)
    : hover
      ? createPiece(activeKind, rotation, hover.x, hover.y, flipped)
      : null;
  const ghostValid = ghostPiece ? canPlacePiece(mine, ghostPiece) : true;

  function rotate() {
    if (disabled) return;
    const next = ((rotation + 1) % 4) as Rotation;
    setRotation(next);
    if (placed) {
      onChange(upsertPiece(mine, { ...placed, rotation: next }));
    }
  }

  function flip() {
    if (disabled || !canFlip(activeKind)) return;
    const next = !flipped;
    setFlipped(next);
    if (placed) {
      onChange(upsertPiece(mine, { ...placed, flipped: next ? true : undefined }));
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
    setFlipped(false);
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
        {paletteKinds.map((kind) => {
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
              <GemPreview
                kind={kind}
                rotation={activeKind === kind ? rotation : 0}
                flipped={activeKind === kind ? flipped : false}
              />
              <span className="palette-label">{labelForKind(kind)}</span>
              <span className="palette-meta">{isPlaced ? 'placée' : kindColorLabel(kind)}</span>
            </button>
          );
        })}
      </div>

      <div className="composer-toolbar">
        <div className="composer-selected">
          <GemPreview
            kind={activeKind}
            rotation={rotation}
            flipped={flipped}
            className="gem-preview--small"
          />
          <div>
            <strong>{labelForKind(activeKind)}</strong>
            <span>
              Rotation {rotation * 90}°{flipped ? ' · miroir' : ''}
            </span>
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
          {canFlip(activeKind) ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={flip}
              disabled={disabled}
              aria-pressed={flipped}
            >
              {fr.common.flip}
            </button>
          ) : null}
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
              {NOTE_COLORS.map((color) => (
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
                    style={{ backgroundColor: NOTE_COLOR_SWATCHES[color] }}
                    aria-hidden="true"
                  />
                  <span>{NOTE_COLOR_LABELS[color]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="board-frame">
        <Board
          mine={displayedMine}
          crosses={crosses}
          edgeMarks={edgeMarks}
          colorMarks={colorMarks}
          askedEntries={askedEntries}
          interactiveEntries={Boolean(scanEnabled && onScanEntry)}
          onEntryAction={scanEnabled ? onScanEntry : undefined}
          onCellAction={disabled ? undefined : handleCell}
          onCellPointerDown={!disabled && pieceTool ? handleCellPointerDown : undefined}
          onCellPointerMove={disabled ? undefined : handleCellPointerMove}
          onCellPointerUp={disabled ? undefined : handleCellPointerUp}
          onCellPointerCancel={disabled ? undefined : handleCellPointerCancel}
          onCellPointerLeave={disabled ? undefined : handleCellPointerLeave}
          onPiecePointerDown={!disabled && pieceTool ? handlePiecePointerDown : undefined}
          interactiveCells={!disabled}
          piecesInteractive={!disabled && pieceTool}
          dragEnabled={!disabled && pieceTool}
          dragging={Boolean(drag)}
          ghostPiece={ghostPiece}
          ghostValid={ghostValid}
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
      <p className="visually-hidden">{fr.placement.dragHint}</p>
      {message ? (
        <p className="inline-alert" role="status">
          {message}
        </p>
      ) : null}
      {colorMarks.length > 0 ? (
        <p className="visually-hidden">
          Ronds de couleur :{' '}
          {colorMarks
            .map((mark) => `${NOTE_COLOR_LABELS[mark.color]} en ${cellLabel(mark.cell)}`)
            .join(' ; ')}
          .
        </p>
      ) : null}
      <p className="visually-hidden">
        {paletteKinds.length} gemmes :{' '}
        {paletteKinds.map((kind) => labelForKind(kind).toLowerCase()).join(', ')}.
      </p>
    </div>
  );
}
