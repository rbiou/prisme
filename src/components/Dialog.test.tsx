import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('s’affiche dans un portail et ferme avec Échap', () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Confirmer la réponse" onClose={onClose}>
        <p>Le rayon sort par l’entrée 12.</p>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Confirmer la réponse' })).toBeInTheDocument();
    expect(screen.getByText('Le rayon sort par l’entrée 12.')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ne rend rien quand il est fermé', () => {
    render(
      <Dialog open={false} title="Invisible">
        <p>Contenu</p>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Contenu')).not.toBeInTheDocument();
  });
});
