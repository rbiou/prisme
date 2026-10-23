import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(`prisme:${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStored(key, initialValue));

  useEffect(() => {
    try {
      window.localStorage.setItem(`prisme:${key}`, JSON.stringify(value));
    } catch {
      // Le stockage local peut être désactivé : l’application reste utilisable.
    }
  }, [key, value]);

  return [value, setValue];
}

export function useTransientMessage(timeoutMs = 4000): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [message, timeoutMs]);

  return [message, setMessage];
}

export function useCopyToClipboard(): {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        return true;
      }
    } catch {
      // On tente la méthode de secours ci-dessous.
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      setCopied(ok);
      return ok;
    } catch {
      return false;
    }
  }, []);

  return { copied, copy };
}
