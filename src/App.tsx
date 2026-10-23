import { useEffect, useRef, type ReactNode } from 'react';
import { AppHeader } from './components/AppHeader';
import { PwaBanner } from './components/PwaBanner';
import { useHashRoute } from './hooks/useHashRoute';
import { usePersistentState } from './hooks/usePersistentState';
import { usePwaUpdate } from './hooks/usePwaUpdate';
import { fr } from './i18n/fr';
import { ConnectScreen } from './screens/ConnectScreen';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { RulesScreen } from './screens/RulesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useSettings } from './state/settings';
import { useMatch } from './state/useMatch';

function GuardScreen({ onHome }: { onHome: () => void }) {
  return (
    <div className="screen">
      <section className="status-panel status-panel--warning">
        <h2>Cette partie n’est pas disponible</h2>
        <p>
          L’état de la partie n’est pas présent dans cet onglet. Créez une partie ou ouvrez de
          nouveau le lien d’invitation reçu.
        </p>
        <button type="button" className="btn btn--primary" onClick={onHome}>
          {fr.common.home}
        </button>
      </section>
    </div>
  );
}

export default function App() {
  const { settings, updateSettings } = useSettings();
  const match = useMatch(settings);
  const { state, configure } = match;
  const { parsed, navigate } = useHashRoute();
  const [storedName, setStoredName] = usePersistentState('player-name', '');
  const readyRef = useRef(false);

  const gameActive = Boolean(state.game && state.game.phase !== 'ended');
  const shouldBlockUpdate = Boolean(state.locked && state.game?.phase !== 'ended');
  const pwa = usePwaUpdate(shouldBlockUpdate);

  useEffect(() => {
    if (state.game && !readyRef.current) {
      readyRef.current = true;
      navigate('partie');
    }
    if (!state.game) readyRef.current = false;
  }, [navigate, state.game]);

  useEffect(() => {
    if (!state.locked || state.game?.phase === 'ended') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.game?.phase, state.locked]);

  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Prisme — déduction cristalline',
      invite: 'Invitation — Prisme',
      rules: 'Règles — Prisme',
      settings: 'Réglages — Prisme',
      placement: 'Composez votre mine — Prisme',
      connect: 'Connexion — Prisme',
      game: 'Partie — Prisme',
    };
    document.title = titles[parsed.name] ?? 'Prisme';
  }, [parsed.name]);

  const initialName = state.playerName || storedName;

  function goHome() {
    navigate('');
  }

  function createGame(name: string) {
    setStoredName(name);
    configure('host', name);
    navigate('placer');
  }

  function joinGame(name: string, code: string) {
    setStoredName(name);
    configure('guest', name, code);
    navigate('placer');
  }

  function resume() {
    if (state.game) navigate('partie');
    else if (state.locked) navigate('connexion');
    else if (state.role) navigate('placer');
    else navigate('');
  }

  function leaveMatch() {
    match.resetMatch();
    navigate('');
  }

  const resumeLabel = state.game
    ? state.game.phase === 'ended'
      ? 'Voir le résultat de la partie'
      : 'Reprendre la partie en cours'
    : state.locked
      ? 'Continuer la connexion'
      : state.role
        ? 'Reprendre le placement de votre mine'
        : null;

  const headerCurrent =
    parsed.name === 'rules'
      ? 'rules'
      : parsed.name === 'settings'
        ? 'settings'
        : parsed.name === 'home' || parsed.name === 'invite'
          ? 'home'
          : 'other';

  let content: ReactNode;
  switch (parsed.name) {
    case 'rules':
      content = <RulesScreen onBack={goHome} />;
      break;
    case 'settings':
      content = <SettingsScreen settings={settings} onChange={updateSettings} onBack={goHome} />;
      break;
    case 'invite':
      content = (
        <HomeScreen
          initialName={initialName}
          inviteCode={parsed.code}
          resumeLabel={resumeLabel}
          role={state.role}
          onResume={resume}
          onCreate={createGame}
          onJoin={joinGame}
          onNavigate={navigate}
        />
      );
      break;
    case 'placement':
      content = state.role ? (
        <PlacementScreen
          role={state.role}
          playerName={state.playerName}
          inviteCode={state.inviteCode}
          locked={state.locked}
          settings={settings}
          error={state.error}
          onLock={match.lockMine}
          onContinue={() => navigate('connexion')}
          onBack={goHome}
        />
      ) : (
        <GuardScreen onHome={goHome} />
      );
      break;
    case 'connect':
      content =
        state.role && state.locked ? (
          <ConnectScreen
            role={state.role}
            playerName={state.playerName}
            inviteCode={state.inviteCode}
            offerCode={state.offerCode}
            answerCode={state.answerCode}
            phase={state.sessionPhase}
            detail={state.sessionDetail}
            error={state.error}
            onConnect={match.connectAnswer}
            onLeave={leaveMatch}
            onRetry={leaveMatch}
          />
        ) : (
          <GuardScreen onHome={goHome} />
        );
      break;
    case 'game':
      content =
        state.game && state.role && state.locked ? (
          <GameScreen
            state={state}
            settings={settings}
            onWave={match.sendWave}
            onCell={match.sendCell}
            onAnswer={match.answerIncoming}
            onCancelIncoming={match.cancelIncoming}
            onConfirmIncoming={match.confirmIncoming}
            onRequestConfirmation={match.requestConfirmationOf}
            onVerifySubmission={match.verifyIncomingSubmission}
            onSubmit={match.submitCandidate}
            onLeave={leaveMatch}
            onNewGame={leaveMatch}
            onHome={goHome}
          />
        ) : (
          <GuardScreen onHome={goHome} />
        );
      break;
    case 'home':
    default:
      content = (
        <HomeScreen
          initialName={initialName}
          resumeLabel={resumeLabel}
          role={state.role}
          onResume={resume}
          onCreate={createGame}
          onJoin={joinGame}
          onNavigate={navigate}
        />
      );
      break;
  }

  return (
    <div
      className={`app${gameActive ? ' app--game' : ''}${
        settings.reducedMotion ? ' app--reduced-motion' : ''
      }`}
    >
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      {!gameActive ? (
        <AppHeader onNavigate={navigate} onHome={goHome} current={headerCurrent} />
      ) : null}
      <PwaBanner pwa={pwa} />
      <main id="contenu" className="app-main" tabIndex={-1}>
        {content}
      </main>
      {!gameActive ? (
        <footer className="app-footer">
          <span>Prisme</span>
          <span>Deux mines. Cinq gemmes. Aucun serveur.</span>
          <button type="button" className="text-link" onClick={() => navigate('reglages')}>
            Réglages
          </button>
        </footer>
      ) : null}

      <div className="toast-stack" aria-live="polite">
        {state.warning ? (
          <div className="toast toast--warning" role="status">
            <span>{state.warning}</span>
            <button
              type="button"
              className="icon-button"
              onClick={match.clearWarning}
              aria-label="Masquer l’avertissement"
            >
              ×
            </button>
          </div>
        ) : null}
        {state.error ? (
          <div className="toast toast--error" role="alert">
            <span>{state.error}</span>
            <button
              type="button"
              className="icon-button"
              onClick={match.clearError}
              aria-label="Masquer l’erreur"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
