import { afterEach, describe, expect, it } from 'vitest';
import { clearResume, loadResume, saveResume, type StoredResume } from './resume';

const VALID: StoredResume = {
  version: 1,
  savedAt: 1,
  role: 'host',
  playerName: 'Camille',
  roomCode: '123456',
  nonce: 'a'.repeat(32),
  sessionPhase: 'ready',
  locked: null,
  starter: 'host',
  opponentName: 'Alex',
  opponentNonce: 'b'.repeat(32),
  opponentHash: null,
  game: null,
  reveals: [],
  readyAt: 1,
};

afterEach(() => {
  clearResume();
  window.localStorage.clear();
});

describe('resume — sauvegarde locale', () => {
  it('relit une sauvegarde valide', () => {
    saveResume(VALID);
    expect(loadResume()).toEqual(VALID);
  });

  it('refuse une sauvegarde corrompue ou incomplète', () => {
    window.localStorage.setItem('prisme:resume', JSON.stringify({ ...VALID, roomCode: 'abc' }));
    expect(loadResume()).toBeNull();

    window.localStorage.setItem('prisme:resume', JSON.stringify({ ...VALID, nonce: 'court' }));
    expect(loadResume()).toBeNull();

    window.localStorage.setItem('prisme:resume', 'pas du json');
    expect(loadResume()).toBeNull();
  });

  it('efface la sauvegarde', () => {
    saveResume(VALID);
    clearResume();
    expect(loadResume()).toBeNull();
  });
});
