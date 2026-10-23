import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '../state/settings';
import { PlacementScreen } from './PlacementScreen';

afterEach(cleanup);

function renderPlacement() {
  const onLock = vi.fn(async () => ({ ok: true as const }));
  const utils = render(
    <PlacementScreen
      role="host"
      playerName="Camille"
      opponentName="Alex"
      locked={null}
      settings={DEFAULT_SETTINGS}
      error={null}
      onLock={onLock}
    />,
  );
  return { ...utils, onLock };
}

describe('PlacementScreen', () => {
  it('affiche une mine vide comme invalide et bloque le verrouillage', () => {
    renderPlacement();

    expect(screen.getByRole('heading', { name: 'Composez votre mine' })).toBeInTheDocument();
    expect(screen.getByText('Mine incomplète ou invalide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verrouiller ma mine' })).toBeDisabled();
  });

  it('place une gemme en touchant une case du plateau', () => {
    const { container } = renderPlacement();

    expect(screen.queryByText('Mine incomplète ou invalide')).toBeInTheDocument();

    const cells = container.querySelectorAll('.board-cell-hit');
    expect(cells.length).toBe(80);

    // Parallélogramme rouge ancré en B2 : sa boîte 3 × 1 tient dans le plateau.
    fireEvent.click(cells[11] as Element);

    expect(screen.getAllByText('placée')).toHaveLength(1);
    expect(screen.queryByText('Mine incomplète ou invalide')).toBeInTheDocument();
  });
});
