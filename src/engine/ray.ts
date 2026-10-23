import { BOARD_HEIGHT, BOARD_WIDTH, ALL_ENTRIES, entryRay, exitEntryForPoint } from './board';
import { mixColors } from './colors';
import {
  boardBoundaryHit,
  pointOnSegment,
  raySegmentIntersection,
  reflectDirection,
  roundPoint,
} from './geometry';
import { piecePolygon } from './pieces';
import type {
  Entry,
  GemColor,
  Mine,
  PieceKind,
  PlacedPiece,
  Point,
  RayHit,
  RayResult,
} from './types';

export interface RayOptions {
  maxReflections?: number;
}

interface EdgeRef {
  piece: PlacedPiece;
  start: Point;
  end: Point;
}

interface NearestHit {
  t: number;
  point: Point;
  edge: EdgeRef;
}

function edgesOf(piece: PlacedPiece): EdgeRef[] {
  const polygon = piecePolygon(piece);
  const edges: EdgeRef[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (!start || !end) continue;
    edges.push({ piece, start, end });
  }
  return edges;
}

function findStartEdge(mine: Mine, point: Point): EdgeRef | null {
  for (const piece of mine.pieces) {
    for (const edge of edgesOf(piece)) {
      if (pointOnSegment(point, edge.start, edge.end, 1e-7)) {
        return edge;
      }
    }
  }
  return null;
}

function findNearestHit(
  mine: Mine,
  origin: Point,
  direction: Point,
  boundaryT: number,
): NearestHit | null {
  let nearest: NearestHit | null = null;
  for (const piece of mine.pieces) {
    for (const edge of edgesOf(piece)) {
      const hit = raySegmentIntersection(origin, direction, edge.start, edge.end);
      if (!hit) continue;
      if (hit.t > boundaryT + 1e-7) continue;
      if (!nearest || hit.t < nearest.t - 1e-9) {
        nearest = { t: hit.t, point: hit.point, edge };
      }
    }
  }
  return nearest;
}

function stateKey(position: Point, direction: Point): string {
  const rounded = roundPoint(position, 9);
  return `${rounded.x}:${rounded.y}:${direction.x}:${direction.y}`;
}

function addHit(hits: RayHit[], colors: Set<GemColor>, piece: PlacedPiece, point: Point): void {
  colors.add(piece.color);
  hits.push({ pieceId: piece.id, color: piece.color, point });
}

export function simulateRay(mine: Mine, entry: Entry, options: RayOptions = {}): RayResult {
  const maxReflections = options.maxReflections ?? 512;
  const { origin, direction: initialDirection } = entryRay(entry);
  const path: Point[] = [origin];
  const hits: RayHit[] = [];
  const colors = new Set<GemColor>();
  let position = origin;
  let direction = initialDirection;
  let steps = 0;

  const startEdge = findStartEdge(mine, position);
  if (startEdge) {
    addHit(hits, colors, startEdge.piece, position);
    direction = reflectDirection(direction, startEdge.start, startEdge.end);
    steps += 1;
    path.push(position);
    const boundary = boardBoundaryHit(position, direction, BOARD_WIDTH, BOARD_HEIGHT);
    path.push(boundary.point);
    return {
      status: 'exit',
      entry,
      exit: exitEntryForPoint(boundary.point, boundary.side),
      color: mixColors(colors),
      hits,
      path,
      steps,
    };
  }

  const visited = new Set<string>([stateKey(position, direction)]);

  for (let iteration = 0; iteration < maxReflections + 1; iteration += 1) {
    const boundary = boardBoundaryHit(position, direction, BOARD_WIDTH, BOARD_HEIGHT);
    const nearest = findNearestHit(mine, position, direction, boundary.t);

    if (!nearest) {
      position = boundary.point;
      path.push(position);
      return {
        status: 'exit',
        entry,
        exit: exitEntryForPoint(boundary.point, boundary.side),
        color: mixColors(colors),
        hits,
        path,
        steps,
      };
    }

    position = nearest.point;
    path.push(position);
    addHit(hits, colors, nearest.edge.piece, position);
    direction = reflectDirection(direction, nearest.edge.start, nearest.edge.end);
    steps += 1;

    if (steps > maxReflections) {
      return {
        status: 'loop',
        entry,
        color: mixColors(colors),
        hits,
        path,
        steps,
      };
    }

    const key = stateKey(position, direction);
    if (visited.has(key)) {
      return {
        status: 'loop',
        entry,
        color: mixColors(colors),
        hits,
        path,
        steps,
      };
    }
    visited.add(key);
  }

  return {
    status: 'loop',
    entry,
    color: mixColors(colors),
    hits,
    path,
    steps,
  };
}

export function simulateAllRays(mine: Mine, options: RayOptions = {}): RayResult[] {
  return ALL_ENTRIES.map((entry) => simulateRay(mine, entry, options));
}

export function hitPieceIds(results: RayResult[]): Set<PieceKind> {
  const hit = new Set<PieceKind>();
  for (const result of results) {
    for (const item of result.hits) {
      hit.add(item.pieceId);
    }
  }
  return hit;
}

export function raySummary(result: RayResult): string {
  if (result.status === 'loop') {
    return `Boucle depuis ${result.entry.label}`;
  }
  const exit = result.exit?.label ?? '?';
  return `${result.entry.label} → ${exit}`;
}
