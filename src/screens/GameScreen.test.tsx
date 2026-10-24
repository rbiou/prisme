import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { entryForLabel } from '../engine/board';
import { createGame } from '../engine/endgame';
import type { GameState, Mine } from '../engine/types';
import type { MatchState } from '../state/matchReducer';
import { GameScreen } from './GameScreen';

afterEach(cleanup);

const EMPTY_MINE: Mine = { version: 1, pieces: [] };

function createState(game: GameState): MatchState {
  return {
    role: 'host',
    playerName: 'Camille',
    roomCode: '123456',
    sessionPhase: 'ready',
    sessionDetail: null,
    transportStatus: 'connected',
    warning: null,
    error: null,
    notice: null,
    locked: {
      mine: EMPTY_MINE,
      salt: '0'.repeat(32),
      hash: 'a'.repeat(64),
    },
    starter: 'host',
    opponentName: 'Alex',
    opponentNonce: 'c'.repeat(32),
    opponentHash: 'b'.repeat(64),
    game,
    reveals: {},
    readyAt: 1,
  };
}

function renderGame(game: GameState = createGame('host')) {
  const onWave = vi.fn(() => true);
  const onCell = vi.fn(() => true);
  const onAnswer = vi.fn(() => true);
  const onCancelIncoming = vi.fn(() => true);
  const onConfirmIncoming = vi.fn(() => true);
  const onRequestConfirmation = vi.fn(() => true);
  const onVerifySubmission = vi.fn(() => true);
  const onSubmit = vi.fn(() => true);
  const onResume = vi.fn();
  const onLeave = vi.fn();
  const onNewGame = vi.fn();
  const onHome = vi.fn();

  render(
    <GameScreen
      state={createState(game)}
      onWave={onWave}
      onCell={onCell}
      onAnswer={onAnswer}
      onCancelIncoming={onCancelIncoming}
      onConfirmIncoming={onConfirmIncoming}
      onRequestConfirmation={onRequestConfirmation}
      onVerifySubmission={onVerifySubmission}
      onSubmit={onSubmit}
      onResume={onResume}
      onLeave={onLeave}
      onNewGame={onNewGame}
      onHome={onHome}
    />,
  );

  return { onWave, onCell, onAnswer, onCancelIncoming };
}

describe('GameScreen', () => {
  it('affiche le tour, les onglets et le journal vide', () => {
    renderGame();

    expect(screen.getByText('À vous de prospecter')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Prospection' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Ma mine/ })).toBeInTheDocument();
    expect(screen.getByText(/Aucune réponse pour le moment/)).toBeInTheDocument();
  });

  it('affiche un journal confirmé et permet de tirer un rayon', () => {
    const game: GameState = {
      ...createGame('host'),
      scans: [
        {
          id: 'scan-1',
          by: 'host',
          kind: 'wave',
          entry: entryForLabel('3'),
          answer: {
            kind: 'wave',
            exit: entryForLabel('12') as NonNullable<ReturnType<typeof entryForLabel>>,
            color: 'orange',
          },
          createdAt: 1,
        },
      ],
    };
    const { onWave } = renderGame(game);

    expect(screen.getByText('Rayon 3 · côté haut')).toBeInTheDocument();
    const entry = screen.getByText('Rayon 3 · côté haut').closest('li');
    expect(entry).not.toBeNull();
    expect(within(entry as HTMLElement).getByText('12')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rayon depuis le haut, entrée 1' }));
    expect(onWave).toHaveBeenCalledWith('1');
  });

  it('grise les étiquettes de rayon déjà demandées', () => {
    const game: GameState = {
      ...createGame('host'),
      scans: [
        {
          id: 'scan-asked',
          by: 'host',
          kind: 'wave',
          entry: entryForLabel('3'),
          answer: {
            kind: 'wave',
            exit: entryForLabel('12') as NonNullable<ReturnType<typeof entryForLabel>>,
            color: 'orange',
          },
          createdAt: 1,
        },
        {
          id: 'scan-opponent',
          by: 'guest',
          kind: 'wave',
          entry: entryForLabel('5'),
          answer: {
            kind: 'wave',
            exit: entryForLabel('14') as NonNullable<ReturnType<typeof entryForLabel>>,
            color: 'green',
          },
          createdAt: 2,
        },
      ],
    };
    renderGame(game);

    const asked = document.querySelectorAll('.board-entry.is-asked');
    expect(asked).toHaveLength(1);
    expect(asked[0]?.textContent).toContain('3');
    expect(asked[0]?.textContent).not.toContain('5');
  });

  it('simule un rayon depuis une réponse du journal', () => {
    const game: GameState = {
      ...createGame('host'),
      scans: [
        {
          id: 'scan-sim',
          by: 'host',
          kind: 'wave',
          entry: entryForLabel('3'),
          answer: {
            kind: 'wave',
            exit: entryForLabel('12') as NonNullable<ReturnType<typeof entryForLabel>>,
            color: 'orange',
          },
          createdAt: 1,
        },
      ],
    };
    renderGame(game);

    fireEvent.click(screen.getByRole('button', { name: 'Simuler ce rayon' }));

    expect(screen.getByText('Contredit la réponse')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }));
    expect(screen.queryByText('Contredit la réponse')).not.toBeInTheDocument();
  });

  it('affiche la table des mélanges de couleurs', () => {
    renderGame();

    expect(screen.getByLabelText('Table des seize mélanges')).toBeInTheDocument();
    expect(screen.getByText('Mélanges')).toBeInTheDocument();
  });

  it('demande une confirmation privée avant de répondre à un scan adverse', () => {
    const game: GameState = {
      ...createGame('host'),
      pendingScan: {
        id: 'scan-incoming',
        by: 'guest',
        kind: 'wave',
        entry: entryForLabel('1'),
      },
    };
    const { onAnswer } = renderGame(game);

    const dialog = screen.getByRole('dialog', { name: 'Question de l’adversaire' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Rayon 1 · côté haut')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer et envoyer' }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
});
