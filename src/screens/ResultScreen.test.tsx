import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createGame } from '../engine/endgame';
import { serializeMine } from '../engine/mine';
import { createPiece } from '../engine/pieces';
import type { GameState, Mine } from '../engine/types';
import { ResultScreen } from './ResultScreen';

afterEach(cleanup);

const MY_MINE: Mine = {
  version: 1,
  pieces: [
    createPiece('red-parallelogram', 0, 1, 1),
    createPiece('yellow-triangle', 0, 6, 1),
    createPiece('blue-triangle', 0, 1, 5),
    createPiece('white-triangle', 0, 6, 4),
    createPiece('white-diamond', 0, 4, 3),
  ],
};

const REMOTE_MINE: Mine = {
  version: 1,
  pieces: [
    createPiece('red-parallelogram', 0, 2, 2),
    createPiece('yellow-triangle', 0, 7, 2),
    createPiece('blue-triangle', 0, 2, 5),
    createPiece('white-triangle', 0, 7, 5),
    createPiece('white-diamond', 0, 5, 3),
  ],
};

function endedGame(): GameState {
  return {
    ...createGame('host'),
    phase: 'ended',
    winner: 'host',
    endReason: 'non-starter-correct',
    submissions: [
      {
        id: 'submit-host',
        by: 'host',
        candidate: serializeMine(REMOTE_MINE),
        correct: false,
        createdAt: 1,
      },
      {
        id: 'submit-guest',
        by: 'guest',
        candidate: serializeMine(MY_MINE),
        correct: true,
        createdAt: 2,
      },
    ],
  };
}

describe('ResultScreen — comparaison des mines et propositions', () => {
  it('place chaque proposition à côté de la mine qu’elle devait reconstituer', () => {
    const { container } = render(
      <ResultScreen
        role="host"
        game={endedGame()}
        myMine={MY_MINE}
        myNotes={{ version: 1, pieces: [] }}
        myMarks={{ crosses: [], edges: [], colors: [] }}
        mySalt={'a'.repeat(32)}
        myHash={'a'.repeat(64)}
        opponentName="Alex"
        opponentHash={'b'.repeat(64)}
        reveals={{}}
        onNewGame={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    const cards = Array.from(container.querySelectorAll('.result-mines > .result-mine'));
    const headings = cards.map((card) => card.querySelector('h2')?.textContent);
    expect(headings.slice(0, 4)).toEqual([
      'Votre mine',
      'Proposition de Alex',
      'Mine de Alex',
      'Votre proposition',
    ]);
  });
});
