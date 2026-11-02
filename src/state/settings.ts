import { useCallback } from 'react';
import { isGameMode } from '../engine/pieces';
import type { GameMode } from '../engine/types';
import { usePersistentState } from '../hooks/usePersistentState';

export interface Settings {
  gameMode: GameMode;
  enforceWhiteSymmetry: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  gameMode: 'base',
  enforceWhiteSymmetry: true,
  reducedMotion: false,
};

export function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const candidate = value as Partial<Settings>;
  return {
    gameMode: isGameMode(candidate.gameMode) ? candidate.gameMode : DEFAULT_SETTINGS.gameMode,
    enforceWhiteSymmetry:
      typeof candidate.enforceWhiteSymmetry === 'boolean'
        ? candidate.enforceWhiteSymmetry
        : DEFAULT_SETTINGS.enforceWhiteSymmetry,
    reducedMotion:
      typeof candidate.reducedMotion === 'boolean'
        ? candidate.reducedMotion
        : DEFAULT_SETTINGS.reducedMotion,
  };
}

export function useSettings(): {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
} {
  const [stored, setStored] = usePersistentState<Settings>('settings', DEFAULT_SETTINGS);
  const settings = normalizeSettings(stored);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setStored((current) => normalizeSettings({ ...normalizeSettings(current), ...patch }));
    },
    [setStored],
  );

  return { settings, updateSettings };
}
