import { describe, expect, it } from 'vitest';
import { ALL_ENTRIES, entryForLabel, entryRay } from './board';
import { createPiece } from './pieces';
import { simulateAllRays, simulateRay } from './ray';
import type { Mine, PieceKind, Rotation } from './types';

function mineOf(entries: Array<[PieceKind, Rotation, number, number]>): Mine {
  return {
    version: 1,
    pieces: entries.map(([kind, rotation, x, y]) => createPiece(kind, rotation, x, y)),
  };
}

function entry(label: string) {
  const value = entryForLabel(label);
  if (!value) throw new Error(`Entrée inconnue : ${label}`);
  return value;
}

describe('rayons', () => {
  it('traverse un plateau vide et sort en face, incolore', () => {
    const mine = mineOf([]);
    expect(simulateRay(mine, entry('1'))).toMatchObject({
      status: 'exit',
      color: 'transparent',
      hits: [],
    });
    expect(simulateRay(mine, entry('1')).exit?.label).toBe('I');
    expect(simulateRay(mine, entry('11')).exit?.label).toBe('A');
    expect(simulateRay(mine, entry('R')).exit?.label).toBe('10');
    expect(simulateRay(mine, entry('H')).exit?.label).toBe('18');
  });

  it('simule les 36 entrées sans boucle sur un plateau vide', () => {
    const results = simulateAllRays(mineOf([]));
    expect(results).toHaveLength(36);
    expect(new Set(results.map((result) => result.entry.label)).size).toBe(36);
    for (const result of results) {
      expect(result.status).toBe('exit');
      expect(result.color).toBe('transparent');
      expect(result.exit).toBeDefined();
    }
  });

  it('tourne le rayon de 90° sur une arête à 45°', () => {
    const mine = mineOf([['blue-triangle', 0, 3, 2]]);
    const result = simulateRay(mine, entry('6'));
    expect(result.status).toBe('exit');
    expect(result.exit?.label).toBe('13');
    expect(result.color).toBe('blue');
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.pieceId).toBe('blue-triangle');
    expect(result.steps).toBe(1);
  });

  it('renvoie le rayon en arrière sur une arête perpendiculaire', () => {
    const mine = mineOf([['blue-triangle', 0, 3, 2]]);
    const result = simulateRay(mine, entry('M'));
    expect(result.status).toBe('exit');
    expect(result.exit?.label).toBe('M');
    expect(result.color).toBe('blue');
    expect(result.steps).toBe(1);
  });

  it('reflète sur un losange et annonce blanc', () => {
    const mine = mineOf([['white-diamond', 0, 4, 3]]);
    const result = simulateRay(mine, entry('D'));
    expect(result.exit?.label).toBe('5');
    expect(result.color).toBe('white');
    expect(result.path[0]).toEqual({ x: 0, y: 3.5 });
    expect(result.path).toContainEqual({ x: 4.5, y: 3.5 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 4.5, y: 0 });
  });

  it('cumule les couleurs de plusieurs gemmes sans doublon', () => {
    const mine = mineOf([
      ['white-diamond', 0, 4, 3],
      ['yellow-triangle', 0, 3, 1],
      ['red-parallelogram', 0, 7, 1],
    ]);
    const result = simulateRay(mine, entry('D'));
    expect(result.status).toBe('exit');
    expect(result.hits.map((hit) => hit.pieceId)).toEqual([
      'white-diamond',
      'yellow-triangle',
      'red-parallelogram',
    ]);
    expect(result.color).toBe('light-orange');
    expect(result.exit?.label).toBe('P');
  });

  it('réfléchit un rayon qui démarre sur une arête du bord', () => {
    const mine = mineOf([['red-parallelogram', 0, 0, 0]]);
    const result = simulateRay(mine, entry('1'));
    expect(result.status).toBe('exit');
    expect(result.exit?.label).toBe('1');
    expect(result.color).toBe('red');
    expect(result.hits).toHaveLength(1);
  });

  it('signale une boucle lorsque le plafond de réflexions est atteint', () => {
    const mine = mineOf([['white-diamond', 0, 4, 3]]);
    const result = simulateRay(mine, entry('D'), { maxReflections: 0 });
    expect(result.status).toBe('loop');
    expect(result.exit).toBeUndefined();
    expect(result.color).toBe('white');
  });

  it('part du milieu de la case, pas de la ligne de grille', () => {
    expect(entryRay(entry('1')).origin).toEqual({ x: 0.5, y: 0 });
    expect(entryRay(entry('11')).origin).toEqual({ x: 10, y: 0.5 });
    expect(ALL_ENTRIES).toHaveLength(36);
  });
});
