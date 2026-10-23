import { useCallback } from 'react';
import { useCopyToClipboard } from './usePersistentState';

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export function useShare(): {
  canShare: boolean;
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
  share: (payload: SharePayload) => Promise<boolean>;
} {
  const { copied, copy } = useCopyToClipboard();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const share = useCallback(
    async (payload: SharePayload) => {
      if (canShare) {
        try {
          await navigator.share(payload);
          return true;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return false;
        }
      }
      return copy(payload.url ?? payload.text ?? '');
    },
    [canShare, copy],
  );

  return { canShare, copied, copy, share };
}
