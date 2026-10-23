import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeScreen } from './HomeScreen';

afterEach(cleanup);

function renderHome(overrides: Partial<Parameters<typeof HomeScreen>[0]> = {}) {
  const props: Parameters<typeof HomeScreen>[0] = {
    initialName: '',
    onResume: vi.fn(),
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    ...overrides,
  };
  render(<HomeScreen {...props} />);
  return props;
}

describe('HomeScreen', () => {
  it('affiche l’accueil et transmet le nom nettoyé à la création', () => {
    const props = renderHome();

    expect(screen.getByRole('heading', { name: 'Sondez la mine adverse.' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Votre nom'), {
      target: { value: '  Camille  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer une partie' }));

    expect(props.onCreate).toHaveBeenCalledWith('Camille');
  });

  it('refuse un code de partie vide ou incomplet', () => {
    const props = renderHome();

    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Entrez le code à six chiffres affiché chez votre adversaire.',
    );
    expect(props.onJoin).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Code à six chiffres'), {
      target: { value: '12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));

    expect(props.onJoin).not.toHaveBeenCalled();
  });

  it('rejoint une partie avec un code à six chiffres', () => {
    const props = renderHome({ initialName: 'Léa' });

    fireEvent.change(screen.getByLabelText('Code à six chiffres'), {
      target: { value: '123 456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));

    expect(props.onJoin).toHaveBeenCalledWith('Léa', '123456');
  });
});
