import { fr } from '../i18n/fr';

export function PrismMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className ?? 'prism-mark'}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="prism-mark-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="0.5" stopColor="#818cf8" />
          <stop offset="1" stopColor="#f0abfc" />
        </linearGradient>
      </defs>
      <polygon
        points="20,3 36,17 29,35 11,35 4,17"
        fill="url(#prism-mark-gradient)"
        fillOpacity="0.22"
        stroke="url(#prism-mark-gradient)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <polyline
        points="4,17 20,23 36,17"
        fill="none"
        stroke="url(#prism-mark-gradient)"
        strokeWidth="1.1"
        strokeOpacity="0.8"
      />
      <line
        x1="20"
        y1="3"
        x2="20"
        y2="23"
        stroke="url(#prism-mark-gradient)"
        strokeWidth="0.9"
        strokeOpacity="0.65"
      />
      <circle cx="20" cy="23" r="1.7" fill="#e0f2fe" />
    </svg>
  );
}

export interface AppHeaderProps {
  onNavigate: (path: string) => void;
  onHome: () => void;
  current: 'home' | 'rules' | 'settings' | 'other';
}

export function AppHeader({ onNavigate, onHome, current }: AppHeaderProps) {
  return (
    <header className="app-header">
      <button type="button" className="brand" onClick={onHome} aria-label="Prisme, accueil">
        <PrismMark />
        <span className="brand-name">{fr.appName}</span>
      </button>
      <nav className="app-nav" aria-label="Navigation principale">
        <button
          type="button"
          className={`nav-link${current === 'home' ? ' is-current' : ''}`}
          onClick={() => onNavigate('')}
        >
          {fr.common.home}
        </button>
        <button
          type="button"
          className={`nav-link${current === 'rules' ? ' is-current' : ''}`}
          onClick={() => onNavigate('regles')}
        >
          {fr.common.rules}
        </button>
        <button
          type="button"
          className={`nav-link${current === 'settings' ? ' is-current' : ''}`}
          onClick={() => onNavigate('reglages')}
        >
          {fr.common.settings}
        </button>
      </nav>
    </header>
  );
}
