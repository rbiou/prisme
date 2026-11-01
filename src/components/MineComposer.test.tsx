import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { NoteEdgeMark } from '../engine/noteEdges';
import { createPiece } from '../engine/pieces';
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

describe('MineComposer — placement fluide des gemmes', () => {
  it('pose une gemme centrée sous le doigt', () => {
    const onChange = vi.fn();
    render(<MineComposer mine={EMPTY_MINE} onChange={onChange} />);

    const cell = boardCells()[4 * 10 + 5] as Element;
    fireEvent.pointerDown(cell, { pointerId: 1 });
    fireEvent.pointerUp(cell, { pointerId: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Mine;
    expect(next.pieces[0]).toMatchObject({
      kind: 'red-parallelogram',
      rotation: 0,
      x: 4,
      y: 4,
    });
  });

  it('déplace une gemme en la faisant glisser', () => {
    const onChange = vi.fn();
    const mine: Mine = {
      version: 1,
      pieces: [createPiece('red-parallelogram', 0, 4, 4)],
    };
    render(<MineComposer mine={mine} onChange={onChange} />);

    const gem = document.querySelector('.board-gem polygon') as Element;
    const target = boardCells()[2 * 10 + 2] as Element;
    fireEvent.pointerDown(gem, { pointerId: 2 });
    fireEvent.pointerMove(target, { pointerId: 2 });
    fireEvent.pointerUp(target, { pointerId: 2 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Mine;
    expect(next.pieces[0]).toMatchObject({ kind: 'red-parallelogram', x: 2, y: 2 });
  });

  it('ne déplace pas une gemme sur un simple appui', () => {
    const onChange = vi.fn();
    const mine: Mine = {
      version: 1,
      pieces: [createPiece('red-parallelogram', 0, 4, 4)],
    };
    render(<MineComposer mine={mine} onChange={onChange} />);

    const gem = document.querySelector('.board-gem polygon') as Element;
    fireEvent.pointerDown(gem, { pointerId: 3 });
    fireEvent.pointerUp(gem, { pointerId: 3 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('retire les croix recouvertes par la gemme posée', () => {
    const onChange = vi.fn();
    const onCrossesChange = vi.fn();
    render(
      <MineComposer
        mine={EMPTY_MINE}
        onChange={onChange}
        crosses={[{ col: 5, row: 4 }]}
        onCrossesChange={onCrossesChange}
      />,
    );

    const cell = boardCells()[4 * 10 + 5] as Element;
    fireEvent.pointerDown(cell, { pointerId: 4 });
    fireEvent.pointerUp(cell, { pointerId: 4 });

    expect(onCrossesChange).toHaveBeenCalledWith([]);
  });

  it('ne pose qu’une gemme malgré le clic qui suit l’appui', () => {
    const onChange = vi.fn();
    render(<MineComposer mine={EMPTY_MINE} onChange={onChange} />);

    const cell = boardCells()[4 * 10 + 5] as Element;
    fireEvent.pointerDown(cell, { pointerId: 5 });
    fireEvent.pointerUp(cell, { pointerId: 5 });
    fireEvent.click(cell, { detail: 1 });

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

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

describe('MineComposer — prospection et ronds de couleur', () => {
  it('sonde une case en mode Sonder sans modifier les notes', () => {
    const onChange = vi.fn();
    const onScanCell = vi.fn();
    render(
      <MineComposer mine={EMPTY_MINE} onChange={onChange} onScanCell={onScanCell} scanEnabled />,
    );

    expect(screen.getByRole('button', { name: 'Sonder' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(boardCells()[0] as Element);

    expect(onScanCell).toHaveBeenCalledWith({ col: 0, row: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pose un rond de la couleur choisie', () => {
    const onColorMarksChange = vi.fn();
    render(
      <MineComposer
        mine={EMPTY_MINE}
        onChange={vi.fn()}
        colorMarks={[]}
        onColorMarksChange={onColorMarksChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ronds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jaune' }));
    fireEvent.click(boardCells()[0] as Element);

    expect(onColorMarksChange).toHaveBeenCalledWith([
      { cell: { col: 0, row: 0 }, color: 'yellow' },
    ]);
  });

  it('affiche les ronds et permet de les effacer', () => {
    const onColorMarksChange = vi.fn();
    render(
      <MineComposer
        mine={EMPTY_MINE}
        onChange={vi.fn()}
        colorMarks={[{ cell: { col: 2, row: 1 }, color: 'blue' }]}
        onColorMarksChange={onColorMarksChange}
      />,
    );

    expect(document.querySelectorAll('.board-color-marks circle')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Ronds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les ronds' }));

    expect(onColorMarksChange).toHaveBeenCalledWith([]);
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
