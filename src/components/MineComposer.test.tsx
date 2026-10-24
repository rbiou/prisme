import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { NoteEdgeMark } from '../engine/noteEdges';
import type { Cell, Mine } from '../engine/types';
import { MineComposer } from './MineComposer';

afterEach(cleanup);

const EMPTY_MINE: Mine = { version: 1, pieces: [] };

function renderComposer(crosses: Cell[] = []) {
  const onChange = vi.fn();
  const onCrossesChange = vi.fn();
  render(
    <MineComposer
      mine={EMPTY_MINE}
      onChange={onChange}
      crosses={crosses}
      onCrossesChange={onCrossesChange}
    />,
  );
  return { onChange, onCrossesChange };
}

function renderEdgeComposer(edgeMarks: NoteEdgeMark[] = [], crosses: Cell[] = []) {
  const onChange = vi.fn();
  const onCrossesChange = vi.fn();
  const onEdgeMarksChange = vi.fn();
  render(
    <MineComposer
      mine={EMPTY_MINE}
      onChange={onChange}
      crosses={crosses}
      onCrossesChange={onCrossesChange}
      edgeMarks={edgeMarks}
      onEdgeMarksChange={onEdgeMarksChange}
    />,
  );
  return { onChange, onCrossesChange, onEdgeMarksChange };
}

function boardCells(): Element[] {
  return Array.from(document.querySelectorAll('.board-cell-hit'));
}

describe('MineComposer — croix des notes privées', () => {
  it('ajoute une croix dans la case touchée en mode croix', () => {
    const { onChange, onCrossesChange } = renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Croix' }));
    fireEvent.click(boardCells()[0] as Element);

    expect(onCrossesChange).toHaveBeenCalledWith([{ col: 0, row: 0 }]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('retire une croix déjà posée', () => {
    const { onCrossesChange } = renderComposer([{ col: 2, row: 1 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Croix' }));
    fireEvent.click(boardCells()[1 * 10 + 2] as Element);

    expect(onCrossesChange).toHaveBeenCalledWith([]);
  });

  it('affiche deux traits par croix et permet de tout effacer', () => {
    const { onCrossesChange } = renderComposer([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);

    expect(document.querySelectorAll('.board-crosses line')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Croix' }));
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les croix' }));
    expect(onCrossesChange).toHaveBeenCalledWith([]);
  });

  it('revient au placement de gemmes avec l’outil Gemmes', () => {
    const { onChange, onCrossesChange } = renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Croix' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gemmes' }));
    fireEvent.click(boardCells()[0] as Element);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onCrossesChange).not.toHaveBeenCalled();
  });
});

describe('MineComposer — arêtes colorées des notes privées', () => {
  it('pose le côté haut avec la couleur choisie', () => {
    const { onEdgeMarksChange } = renderEdgeComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Arêtes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bleu' }));
    fireEvent.click(boardCells()[0] as Element);

    expect(onEdgeMarksChange).toHaveBeenCalledWith([
      { kind: 'horizontal', col: 0, row: 0, color: 'blue' },
    ]);
  });

  it('pose une diagonale et retire la croix de la case', () => {
    const { onCrossesChange, onEdgeMarksChange } = renderEdgeComposer([], [{ col: 0, row: 0 }]);

    fireEvent.click(screen.getByRole('button', { name: 'Arêtes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Diagonale descendante' }));
    fireEvent.click(boardCells()[0] as Element);

    expect(onEdgeMarksChange).toHaveBeenCalledWith([
      { kind: 'diagonal-down', col: 0, row: 0, color: 'red' },
    ]);
    expect(onCrossesChange).toHaveBeenCalledWith([]);
  });

  it('affiche un liseré sombre et la couleur pour chaque arête', () => {
    renderEdgeComposer([{ kind: 'vertical', col: 2, row: 1, color: 'white' }]);

    expect(document.querySelectorAll('.board-edges line')).toHaveLength(2);
  });

  it('permet d’effacer toutes les arêtes', () => {
    const { onEdgeMarksChange } = renderEdgeComposer([
      { kind: 'horizontal', col: 0, row: 0, color: 'yellow' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Arêtes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les arêtes' }));

    expect(onEdgeMarksChange).toHaveBeenCalledWith([]);
  });
});
