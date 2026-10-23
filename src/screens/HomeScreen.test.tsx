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
    onNavigate: vi.fn(),
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

  it('refuse un code d’invitation vide ou invalide', () => {
    const props = renderHome();

    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Ce lien ou ce code ne semble pas valide');
    expect(props.onJoin).not.toHaveBeenCalled();
  });

  it('rejoint directement une invitation reçue par lien', () => {
    const props = renderHome({ initialName: 'Léa', inviteCode: 'offer-123' });

    expect(screen.getByText('Invitation reçue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre cette partie' }));

    expect(props.onJoin).toHaveBeenCalledWith('Léa', 'offer-123');
  });
});
