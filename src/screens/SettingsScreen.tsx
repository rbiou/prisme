import { fr } from '../i18n/fr';
import type { Settings } from '../state/settings';

export interface SettingsScreenProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
}

export function SettingsScreen({ settings, onChange, onBack }: SettingsScreenProps) {
  return (
    <div className="screen settings-screen">
      <div className="screen-heading">
        <div>
          <p className="kicker">Préférences locales</p>
          <h1>{fr.settings.title}</h1>
          <p className="lead">
            Ces réglages restent sur cet appareil et ne sont jamais transmis à l’adversaire.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          {fr.common.back}
        </button>
      </div>

      <div className="settings-grid">
        <section className="card card--plain setting-item">
          <div className="setting-copy">
            <h2>{fr.settings.whiteSymmetry}</h2>
            <p>{fr.settings.whiteSymmetryHint}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.enforceWhiteSymmetry}
              onChange={(event) => onChange({ enforceWhiteSymmetry: event.target.checked })}
            />
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span className="switch-label">
              {settings.enforceWhiteSymmetry ? 'Activée' : 'Désactivée'}
            </span>
          </label>
          <p className="fine-print">
            Modifier ce réglage ne change pas une mine déjà verrouillée. La vérification finale
            n’impose pas cette règle à la mine révélée.
          </p>
        </section>

        <section className="card card--plain setting-item">
          <div className="setting-copy">
            <h2>{fr.settings.reducedMotion}</h2>
            <p>{fr.settings.reducedMotionHint}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => onChange({ reducedMotion: event.target.checked })}
            />
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span className="switch-label">
              {settings.reducedMotion ? 'Activée' : 'Désactivée'}
            </span>
          </label>
          <p className="fine-print">
            Les animations de rayons, de pulsations et de transitions sont réduites. Le réglage
            système <code>prefers-reduced-motion</code> est aussi respecté.
          </p>
        </section>

        <section className="card card--plain setting-item">
          <div className="setting-copy">
            <h2>Données et vie privée</h2>
            <p>
              Aucun compte, aucun analytics, aucun cookie. Le nom, les réglages et le brouillon de
              mine restent dans le stockage local ou de session du navigateur.
            </p>
          </div>
          <span className="badge badge--success">Local uniquement</span>
        </section>

        <section className="card card--plain setting-item">
          <div className="setting-copy">
            <h2>Version de l’application</h2>
            <p>
              Prisme, MVP. Les mises à jour de la PWA sont proposées après la fin d’une partie et ne
              rechargent jamais l’application pendant le jeu.
            </p>
          </div>
          <span className="badge badge--soft">v0.1.0</span>
        </section>
      </div>
    </div>
  );
}
