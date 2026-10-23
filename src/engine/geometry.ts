import type { Cell, Point } from './types';

export const EPS = 1e-9;
export const AREA_EPS = 1e-7;

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface SegmentHit {
  t: number;
  u: number;
  point: Point;
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(a: Point, factor: number): Point {
  return { x: a.x * factor, y: a.y * factor };
}

export function almostEqual(a: number, b: number, epsilon = EPS): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function pointsEqual(a: Point, b: Point, epsilon = EPS): boolean {
  return almostEqual(a.x, b.x, epsilon) && almostEqual(a.y, b.y, epsilon);
}

export function signedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(signedArea(points));
}

export function ensureCounterClockwise(points: Point[]): Point[] {
  return signedArea(points) >= 0 ? points : [...points].reverse();
}

export function boundingBox(points: Point[]): BBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function normalizePolygon(points: Point[]): Point[] {
  const box = boundingBox(points);
  return points.map((point) => ({
    x: point.x - box.minX,
    y: point.y - box.minY,
  }));
}

export function translatePolygon(points: Point[], dx: number, dy: number): Point[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

/** Rotation de 90° dans le sens horaire autour de l'origine. */
export function rotatePoint90Clockwise(point: Point): Point {
  return { x: point.y, y: -point.x };
}

export function rotatePolygon90Clockwise(points: Point[]): Point[] {
  return points.map(rotatePoint90Clockwise);
}

export function rotatePolygon(points: Point[], quarterTurns: number): Point[] {
  let result = points;
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i += 1) {
    result = rotatePolygon90Clockwise(result);
  }
  return normalizePolygon(result);
}

export function pointOnSegment(point: Point, start: Point, end: Point, epsilon = EPS): boolean {
  const segment = subtract(end, start);
  const relative = subtract(point, start);
  if (Math.abs(cross(segment, relative)) > epsilon) return false;
  const projection = dot(relative, segment);
  const lengthSquared = dot(segment, segment);
  return projection >= -epsilon && projection <= lengthSquared + epsilon;
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  for (let i = 0; i < polygon.length; i += 1) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    if (!start || !end) continue;
    if (pointOnSegment(point, start, end)) return true;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function lineIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const directionA = subtract(a2, a1);
  const directionB = subtract(b2, b1);
  const denominator = cross(directionA, directionB);
  if (Math.abs(denominator) < EPS) return null;
  const t = cross(subtract(b1, a1), directionB) / denominator;
  return { x: a1.x + directionA.x * t, y: a1.y + directionA.y * t };
}

export function clipPolygon(subject: Point[], clip: Point[]): Point[] {
  if (subject.length < 3 || clip.length < 3) return [];
  const clipPolygonPoints = ensureCounterClockwise(clip);
  let output = ensureCounterClockwise(subject);

  for (let i = 0; i < clipPolygonPoints.length; i += 1) {
    const edgeStart = clipPolygonPoints[i];
    const edgeEnd = clipPolygonPoints[(i + 1) % clipPolygonPoints.length];
    if (!edgeStart || !edgeEnd) continue;
    const input = output;
    output = [];
    if (input.length === 0) break;

    const isInside = (point: Point) =>
      cross(subtract(edgeEnd, edgeStart), subtract(point, edgeStart)) >= -EPS;

    let previous = input[input.length - 1];
    if (!previous) continue;
    let previousInside = isInside(previous);

    for (const current of input) {
      const currentInside = isInside(current);
      if (currentInside) {
        if (!previousInside) {
          const intersection = lineIntersection(previous, current, edgeStart, edgeEnd);
          if (intersection) output.push(intersection);
        }
        output.push(current);
      } else if (previousInside) {
        const intersection = lineIntersection(previous, current, edgeStart, edgeEnd);
        if (intersection) output.push(intersection);
      }
      previous = current;
      previousInside = currentInside;
    }
  }

  return deduplicatePoints(output);
}

export function deduplicatePoints(points: Point[], epsilon = EPS): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last || !pointsEqual(last, point, epsilon)) {
      result.push(point);
    }
  }
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (first && last && pointsEqual(first, last, epsilon)) result.pop();
  }
  return result;
}

export function polygonIntersectionArea(a: Point[], b: Point[]): number {
  const clipped = clipPolygon(a, b);
  if (clipped.length < 3) return 0;
  return polygonArea(clipped);
}

export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  return polygonIntersectionArea(a, b) > AREA_EPS;
}

function collinearOverlapLength(a1: Point, a2: Point, b1: Point, b2: Point): number {
  const direction = subtract(a2, a1);
  const length = Math.hypot(direction.x, direction.y);
  if (length < EPS) return 0;
  const unit = { x: direction.x / length, y: direction.y / length };

  if (Math.abs(cross(direction, subtract(b1, a1))) > 1e-6) return 0;
  if (Math.abs(cross(direction, subtract(b2, a1))) > 1e-6) return 0;

  const project = (point: Point) => dot(subtract(point, a1), unit);
  const aMin = 0;
  const aMax = length;
  const bMin = Math.min(project(b1), project(b2));
  const bMax = Math.max(project(b1), project(b2));
  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
  return overlap > EPS ? overlap : 0;
}

export function sharedBoundaryLength(a: Point[], b: Point[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    if (!a1 || !a2) continue;
    for (let j = 0; j < b.length; j += 1) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if (!b1 || !b2) continue;
      total += collinearOverlapLength(a1, a2, b1, b2);
    }
  }
  return total;
}

export function snapDirection(direction: Point): Point {
  const x = Math.abs(direction.x) >= Math.abs(direction.y) ? Math.sign(direction.x) : 0;
  const y = x === 0 ? Math.sign(direction.y) : 0;
  return { x, y };
}

export function reflectDirection(direction: Point, edgeStart: Point, edgeEnd: Point): Point {
  const edge = subtract(edgeEnd, edgeStart);
  const length = Math.hypot(edge.x, edge.y);
  if (length < EPS) return direction;
  const unit = { x: edge.x / length, y: edge.y / length };
  const projection = dot(direction, unit);
  return snapDirection({
    x: 2 * projection * unit.x - direction.x,
    y: 2 * projection * unit.y - direction.y,
  });
}

export function raySegmentIntersection(
  origin: Point,
  direction: Point,
  segmentStart: Point,
  segmentEnd: Point,
  minT = EPS,
): SegmentHit | null {
  const segment = subtract(segmentEnd, segmentStart);
  const denominator = cross(direction, segment);
  if (Math.abs(denominator) < EPS) return null;

  const relative = subtract(segmentStart, origin);
  const t = cross(relative, segment) / denominator;
  const u = cross(relative, direction) / denominator;

  if (t <= minT) return null;
  if (u < -EPS || u > 1 + EPS) return null;

  return {
    t,
    u,
    point: { x: origin.x + direction.x * t, y: origin.y + direction.y * t },
  };
}

export interface BoundaryHit {
  t: number;
  point: Point;
  side: 'top' | 'right' | 'bottom' | 'left';
}

export function boardBoundaryHit(
  origin: Point,
  direction: Point,
  width: number,
  height: number,
): BoundaryHit {
  if (direction.x > 0) {
    const t = Math.max(0, width - origin.x);
    return { t, point: { x: width, y: origin.y }, side: 'right' };
  }
  if (direction.x < 0) {
    const t = Math.max(0, origin.x);
    return { t, point: { x: 0, y: origin.y }, side: 'left' };
  }
  if (direction.y > 0) {
    const t = Math.max(0, height - origin.y);
    return { t, point: { x: origin.x, y: height }, side: 'bottom' };
  }
  const t = Math.max(0, origin.y);
  return { t, point: { x: origin.x, y: 0 }, side: 'top' };
}

export function cellPolygon(cell: Cell): Point[] {
  return [
    { x: cell.col, y: cell.row },
    { x: cell.col + 1, y: cell.row },
    { x: cell.col + 1, y: cell.row + 1 },
    { x: cell.col, y: cell.row + 1 },
  ];
}

export function cellCenter(cell: Cell): Point {
  return { x: cell.col + 0.5, y: cell.row + 0.5 };
}

export function roundPoint(point: Point, decimals = 6): Point {
  const factor = 10 ** decimals;
  return {
    x: Math.round(point.x * factor) / factor,
    y: Math.round(point.y * factor) / factor,
  };
}

export function polygonKey(points: Point[]): string {
  return points
    .map(roundPoint)
    .map((point) => `${point.x},${point.y}`)
    .sort()
    .join('|');
}

export function polygonsEqual(a: Point[], b: Point[], epsilon = 1e-6): boolean {
  if (a.length !== b.length) return false;
  const used = new Array<boolean>(b.length).fill(false);
  for (const pointA of a) {
    let found = false;
    for (let i = 0; i < b.length; i += 1) {
      const pointB = b[i];
      if (!pointB || used[i]) continue;
      if (pointsEqual(pointA, pointB, epsilon)) {
        used[i] = true;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}
