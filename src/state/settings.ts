import { useCallback } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';

export interface Settings {
  enforceWhiteSymmetry: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enforceWhiteSymmetry: true,
  reducedMotion: false,
};

export function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const candidate = value as Partial<Settings>;
  return {
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
