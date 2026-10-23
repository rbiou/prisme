import { useCallback, useEffect, useRef, useState } from 'react';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export interface PwaUpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  blocked: boolean;
  applyUpdate: () => void;
  dismiss: () => void;
}

export function usePwaUpdate(blocked = false): PwaUpdateState {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateRef = useRef<UpdateServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;

    void import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      updateRef.current = registerSW({
        immediate: true,
        onNeedRefresh() {
          setNeedRefresh(true);
        },
        onOfflineReady() {
          setOfflineReady(true);
        },
        onRegisterError() {
          // L’application reste jouable en ligne si le service worker échoue.
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (blocked || !updateRef.current) return;
    setNeedRefresh(false);
    void updateRef.current(true);
  }, [blocked]);

  const dismiss = useCallback(() => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, []);

  return { needRefresh, offlineReady, blocked, applyUpdate, dismiss };
}
