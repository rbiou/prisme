import type { PwaUpdateState } from '../hooks/usePwaUpdate';
import { fr } from '../i18n/fr';

export function PwaBanner({ pwa }: { pwa: PwaUpdateState }) {
  if (!pwa.needRefresh && !pwa.offlineReady) return null;

  return (
    <div className="pwa-banner" role="status" aria-live="polite">
      <div className="pwa-banner__text">
        {pwa.needRefresh ? (
          pwa.blocked ? (
            <span>
              Une mise à jour est disponible. Elle sera proposée après la partie en cours.
            </span>
          ) : (
            <span>Une nouvelle version de Prisme est disponible.</span>
          )
        ) : (
          <span>L’interface est prête à fonctionner hors ligne.</span>
        )}
      </div>
      <div className="pwa-banner__actions">
        {pwa.needRefresh && !pwa.blocked ? (
          <button type="button" className="btn btn--small btn--primary" onClick={pwa.applyUpdate}>
            Mettre à jour
          </button>
        ) : null}
        <button type="button" className="btn btn--small btn--ghost" onClick={pwa.dismiss}>
          {pwa.needRefresh && pwa.blocked ? 'Masquer' : fr.common.close}
        </button>
      </div>
    </div>
  );
}
