import { useCallback, useEffect, useState } from 'react';

export interface ParsedHash {
  name: 'home' | 'rules' | 'settings' | 'lobby' | 'placement' | 'game';
}

export function parseHash(hash: string): ParsedHash {
  const value = hash.replace(/^#\/?/, '');
  if (!value) return { name: 'home' };
  const [head] = value.split('/');
  switch (head) {
    case 'regles':
      return { name: 'rules' };
    case 'reglages':
      return { name: 'settings' };
    case 'salon':
      return { name: 'lobby' };
    case 'placer':
      return { name: 'placement' };
    case 'partie':
      return { name: 'game' };
    default:
      return { name: 'home' };
  }
}

export function useHashRoute(): {
  hash: string;
  parsed: ParsedHash;
  navigate: (path: string) => void;
} {
  const [hash, setHash] = useState<string>(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((path: string) => {
    const target = path.startsWith('#') ? path : `#/${path.replace(/^\/+/, '')}`;
    if (window.location.hash === target) {
      setHash(target);
      return;
    }
    window.location.hash = target;
  }, []);

  return { hash, parsed: parseHash(hash), navigate };
}
