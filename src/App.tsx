import { useEffect, useRef, type ReactNode } from 'react';
import { AppHeader } from './components/AppHeader';
import { PwaBanner } from './components/PwaBanner';
import { useHashRoute } from './hooks/useHashRoute';
import { usePersistentState } from './hooks/usePersistentState';
import { usePwaUpdate } from './hooks/usePwaUpdate';
import { fr } from './i18n/fr';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
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
        <p>Créez une partie ou rejoignez-en une avec un code à six chiffres.</p>
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
  const { state, hostGame, joinGame: joinRoom, startPlacement } = match;
  const { parsed, navigate } = useHashRoute();
  const [storedName, setStoredName] = usePersistentState('player-name', '');
  const previousPhaseRef = useRef(state.sessionPhase);
  const hadGameRef = useRef(false);

  const gameActive = Boolean(state.game && state.game.phase !== 'ended');
  const sessionActive = Boolean(
    state.role &&
    state.sessionPhase !== 'failed' &&
    state.sessionPhase !== 'closed' &&
    state.game?.phase !== 'ended',
  );
  const matchInProgress = sessionActive;
  const pwa = usePwaUpdate(matchInProgress);

  // Dès que l’hôte lance le placement, les deux joueurs passent à l’écran de
  // composition de leur mine.
  useEffect(() => {
    const phase = state.sessionPhase;
    const wasPlacing =
      previousPhaseRef.current === 'placing' || previousPhaseRef.current === 'awaiting-opponent';
    const isPlacing = phase === 'placing' || phase === 'awaiting-opponent';
    previousPhaseRef.current = phase;
    if (isPlacing && !wasPlacing && parsed.name !== 'game') {
      navigate('placer');
    }
  }, [navigate, parsed.name, state.sessionPhase]);

  // Quand les deux engagements sont échangés et la mine locale verrouillée,
  // la partie démarre.
  useEffect(() => {
    if (state.game && state.locked && !hadGameRef.current) {
      hadGameRef.current = true;
      navigate('partie');
    }
    if (!state.game) hadGameRef.current = false;
  }, [navigate, state.game, state.locked]);

  useEffect(() => {
    if (!sessionActive) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sessionActive]);

  // Une sauvegarde existe mais la session n'est pas encore restaurée : on
  // revient à l'accueil pour proposer la reprise au lieu d'afficher un écran vide.
  useEffect(() => {
    if (state.role || !match.resumable) return;
    if (parsed.name === 'game' || parsed.name === 'placement' || parsed.name === 'lobby') {
      navigate('');
    }
  }, [match.resumable, navigate, parsed.name, state.role]);

  useEffect(() => {
    const titles: Record<string, string> = {
      home: 'Prisme — déduction cristalline',
      rules: 'Règles — Prisme',
      settings: 'Réglages — Prisme',
      lobby: 'Salon — Prisme',
      placement: 'Composez votre mine — Prisme',
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
    void hostGame(name);
    navigate('salon');
  }

  function joinGame(name: string, code: string) {
    setStoredName(name);
    void joinRoom(name, code);
    navigate('salon');
  }

  function resume() {
    const recoverable =
      (!state.role && match.resumable) || (matchLost && Boolean(state.role && state.roomCode));
    if (recoverable) {
      const target = match.resumeTarget;
      void match.resumeGame();
      navigate(target === 'game' ? 'partie' : target === 'placement' ? 'placer' : 'salon');
      return;
    }
    if (state.game) {
      navigate('partie');
      return;
    }
    if (
      state.role &&
      (state.sessionPhase === 'placing' ||
        state.sessionPhase === 'awaiting-opponent' ||
        state.locked)
    ) {
      navigate('placer');
      return;
    }
    if (state.role) navigate('salon');
    else navigate('');
  }

  function leaveMatch() {
    match.resetMatch();
    navigate('');
  }

  const matchLost = state.sessionPhase === 'failed' || state.sessionPhase === 'closed';
  const resumeLabel = state.game
    ? state.game.phase === 'ended'
      ? 'Voir le résultat de la partie'
      : 'Reprendre la partie en cours'
    : matchLost
      ? (state.role && state.roomCode) || match.resumable
        ? 'Reprendre la partie interrompue'
        : null
      : !state.role
        ? match.resumable
          ? 'Reprendre la partie interrompue'
          : null
        : state.sessionPhase === 'placing' || state.sessionPhase === 'awaiting-opponent'
          ? 'Reprendre le placement de votre mine'
          : state.locked
            ? 'Reprendre la partie'
            : 'Revenir au salon';

  const headerCurrent =
    parsed.name === 'rules'
      ? 'rules'
      : parsed.name === 'settings'
        ? 'settings'
        : parsed.name === 'home'
          ? 'home'
          : 'other';

  const inPlacement =
    state.sessionPhase === 'placing' ||
    state.sessionPhase === 'awaiting-opponent' ||
    state.sessionPhase === 'ready' ||
    (state.sessionPhase === 'reconnecting' && !state.game);

  let content: ReactNode;
  switch (parsed.name) {
    case 'rules':
      content = <RulesScreen onBack={goHome} />;
      break;
    case 'settings':
      content = <SettingsScreen settings={settings} onChange={updateSettings} onBack={goHome} />;
      break;
    case 'lobby':
      content =
        state.role && !state.game ? (
          <LobbyScreen
            role={state.role}
            playerName={state.playerName}
            roomCode={state.roomCode}
            phase={state.sessionPhase}
            opponentName={state.opponentName}
            detail={state.sessionDetail}
            error={state.error}
            canResume={Boolean(state.role && state.roomCode) || match.resumable}
            onStart={startPlacement}
            onResume={() => void match.resumeGame()}
            onLeave={leaveMatch}
            onHome={leaveMatch}
          />
        ) : (
          <GuardScreen onHome={goHome} />
        );
      break;
    case 'placement':
      content =
        state.role && (inPlacement || state.locked) ? (
          <PlacementScreen
            role={state.role}
            playerName={state.playerName}
            opponentName={state.opponentName}
            locked={state.locked}
            settings={settings}
            error={state.error}
            reconnecting={state.sessionPhase === 'reconnecting'}
            connectionLost={state.sessionPhase === 'failed' || state.sessionPhase === 'closed'}
            onResume={() => void match.resumeGame()}
            onLock={match.lockMine}
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
            onResume={() => void match.resumeGame()}
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
          onResume={resume}
          onCreate={createGame}
          onJoin={joinGame}
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
          <span>Deux mines. Cinq gemmes. Une seule déduction.</span>
          <button type="button" className="text-link" onClick={() => navigate('reglages')}>
            Réglages
          </button>
        </footer>
      ) : null}

      <div className="toast-stack" aria-live="polite">
        {state.notice ? (
          <div className="toast toast--info" role="status">
            <div className="toast-body">
              <strong>{state.notice.title}</strong>
              <span>{state.notice.body}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={match.clearNotice}
              aria-label="Masquer la notification"
            >
              ×
            </button>
          </div>
        ) : null}
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
