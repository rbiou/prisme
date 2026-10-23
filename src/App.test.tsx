import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('App', () => {
  it('affiche l’accueil par défaut', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Sondez la mine adverse.' })).toBeInTheDocument();
  });

  it('affiche un garde-fou pour un salon sans partie', () => {
    window.location.hash = '#/salon';
    render(<App />);

    expect(screen.getByText('Cette partie n’est pas disponible')).toBeInTheDocument();
  });

  it('affiche la page des règles via le hash', () => {
    window.location.hash = '#/regles';
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Règles de Prisme' })).toBeInTheDocument();
    expect(screen.getByLabelText('Table des seize mélanges')).toBeInTheDocument();
  });
});
