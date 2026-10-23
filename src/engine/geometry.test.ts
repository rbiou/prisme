import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  cellCenter,
  cellPolygon,
  clipPolygon,
  pointInPolygon,
  polygonArea,
  polygonIntersectionArea,
  polygonsEqual,
  polygonsOverlap,
  reflectDirection,
  rotatePolygon,
  sharedBoundaryLength,
} from './geometry';

describe('géométrie', () => {
  it('calcule une aire par la formule du lacet', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).toBe(1);
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 2 },
      ]),
    ).toBe(2);
  });

  it('détecte les points intérieurs et les bords', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(pointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 1 }, square)).toBe(true);
    expect(pointInPolygon({ x: 2.0001, y: 1 }, square)).toBe(false);
  });

  it('découpe un polygone et calcule l’aire d’intersection', () => {
    const cell = cellPolygon({ col: 0, row: 0 });
    const diamond = [
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
    ];
    const halfDiamond = [
      { x: 0.5, y: 0 },
      { x: 1.5, y: 1 },
      { x: 0.5, y: 2 },
      { x: -0.5, y: 1 },
    ];
    expect(polygonIntersectionArea(cell, diamond)).toBeCloseTo(0.5, 9);
    expect(polygonIntersectionArea(cell, halfDiamond)).toBeCloseTo(0.75, 9);
    expect(clipPolygon(cell, diamond).length).toBeGreaterThanOrEqual(3);
  });

  it('distingue chevauchement et contact de bord', () => {
    const left = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const right = left.map((point) => ({ x: point.x + 1, y: point.y }));
    const overlap = left.map((point) => ({ x: point.x + 0.5, y: point.y }));
    expect(sharedBoundaryLength(left, right)).toBeCloseTo(1, 9);
    expect(sharedBoundaryLength(left, overlap)).toBeCloseTo(1, 9);
    expect(polygonsOverlap(left, right)).toBe(false);
    expect(polygonsOverlap(left, overlap)).toBe(true);
    expect(polygonsEqual(left, [...right].reverse())).toBe(false);
  });

  it('tourne un polygone de 90° et normalise dans le premier quadrant', () => {
    const shape = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 1, y: 1 },
    ];
    const rotated = rotatePolygon(shape, 1);
    const box = boundingBox(rotated);
    expect(box.width).toBeCloseTo(1, 9);
    expect(box.height).toBeCloseTo(3, 9);
    expect(polygonArea(rotated)).toBeCloseTo(1.5, 9);
  });

  it('réfléchit une direction sur une arête à 45° et sur une arête perpendiculaire', () => {
    expect(reflectDirection({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: -1 })).toEqual({
      x: 0,
      y: -1,
    });
    expect(reflectDirection({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toEqual({
      x: -1,
      y: 0,
    });
    expect(reflectDirection({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toEqual({
      x: 1,
      y: 0,
    });
  });

  it('centre les cases à demi-entier', () => {
    expect(cellCenter({ col: 4, row: 3 })).toEqual({ x: 4.5, y: 3.5 });
  });
});
