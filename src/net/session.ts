import type { PlayerId } from '../engine/types';
import { isHex } from './integrity';
import {
  CodeUnavailableError,
  openPeer,
  type DataConnectionLike,
  type PeerError,
  type PeerFactory,
  type PeerLike,
  type PeerStatus,
} from './peer';
import {
  chooseStarter,
  createCommit,
  createHello,
  createLobbyStart,
  createStart,
  createSync,
  isNetworkMessage,
  parseNetworkMessage,
  type NetworkMessage,
  type StartMessage,
  type SyncMessage,
} from './protocol';
import { formatRoomCode, generateRoomCode, normalizeRoomCode, peerIdForCode } from './roomCode';

export interface SessionIdentity {
  name: string;
  nonce: string;
}

export type SessionPhase =
  | 'idle'
  | 'opening'
  | 'waiting'
  | 'connecting'
  | 'lobby'
  | 'placing'
  | 'awaiting-opponent'
  | 'ready'
  | 'reconnecting'
  | 'closed'
  | 'failed';

export interface LobbyContext {
  remoteName: string;
  remoteNonce: string;
}

export interface ReadyContext {
  starter: PlayerId;
  remoteName: string;
  remoteNonce: string;
  remoteMineHash: string;
  start: StartMessage;
}

export interface SessionHandlers {
  onPhase?: (phase: SessionPhase, detail?: string) => void;
  onTransportStatus?: (status: PeerStatus, detail?: string) => void;
  onLobby?: (context: LobbyContext) => void;
  onPlacementStart?: () => void;
  onReady?: (context: ReadyContext) => void;
  onMessage?: (message: NetworkMessage) => void;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
  /** Le canal vient de s’ouvrir : l’application peut pousser son état (sync). */
  onTransportReady?: () => void;
  onSync?: (message: SyncMessage) => void;
}

export interface MatchSessionOptions {
  peerFactory?: PeerFactory;
  joinTimeoutMs?: number;
  handshakeTimeoutMs?: number;
  reconnectTimeoutMs?: number;
  reconnectDelayMs?: number;
  randomInt?: (max: number) => number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RECONNECT_TIMEOUT_MS = 120_000;
const DEFAULT_RECONNECT_DELAY_MS = 800;
const MAX_CODE_ATTEMPTS = 8;

function defaultPeerFactory(id?: string): Promise<PeerLike> {
  return openPeer(id);
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur réseau inattendue est survenue.';
}

export class MatchSession {
  readonly role: PlayerId;
  readonly identity: SessionIdentity;
  private readonly handlers: SessionHandlers;
  private readonly options: MatchSessionOptions;
  private peer: PeerLike | null = null;
  private connection: DataConnectionLike | null = null;
  private currentPhase: SessionPhase = 'idle';
  private roomCodeValue: string | null = null;
  private remoteHello: { name: string; nonce: string } | null = null;
  private localHash: string | null = null;
  private remoteHash: string | null = null;
  private start: StartMessage | null = null;
  private pendingStart: StartMessage | null = null;
  private channelOpen = false;
  private readyEmitted = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private joinResolve: (() => void) | null = null;
  private joinReject: ((error: Error) => void) | null = null;
  private readonly seenIds = new Set<string>();
  private intentionalClose = false;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadline: ReturnType<typeof setTimeout> | null = null;
  private phaseBeforeDrop: SessionPhase = 'idle';
  private placementStarted = false;

  constructor(
    role: PlayerId,
    identity: SessionIdentity,
    handlers: SessionHandlers = {},
    options: MatchSessionOptions = {},
  ) {
    if (!isHex(identity.nonce, 32)) {
      throw new Error('Le nonce local doit contenir 32 caractères hexadécimaux.');
    }
    this.role = role;
    this.identity = {
      name: identity.name.trim().slice(0, 40) || 'Joueur',
      nonce: identity.nonce,
    };
    this.handlers = handlers;
    this.options = options;
  }

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  get roomCode(): string | null {
    return this.roomCodeValue;
  }

  private setPhase(phase: SessionPhase, detail?: string): void {
    if (this.currentPhase === phase && detail === undefined) return;
    this.currentPhase = phase;
    this.handlers.onPhase?.(phase, detail);
  }

  private setTransport(status: PeerStatus, detail?: string): void {
    this.handlers.onTransportStatus?.(status, detail);
  }

  private warn(message: string): void {
    this.handlers.onWarning?.(message);
  }

  private clearTimeout(): void {
    if (this.timeoutTimer === null) return;
    globalThis.clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
  }

  private armTimeout(message: string, duration = DEFAULT_TIMEOUT_MS): void {
    this.clearTimeout();
    if (duration <= 0) return;
    this.timeoutTimer = globalThis.setTimeout(() => {
      this.timeoutTimer = null;
      if (
        this.currentPhase === 'lobby' ||
        this.currentPhase === 'placing' ||
        this.currentPhase === 'awaiting-opponent' ||
        this.currentPhase === 'ready' ||
        this.currentPhase === 'failed' ||
        this.currentPhase === 'closed'
      ) {
        return;
      }
      this.fail(message);
    }, duration);
  }

  private resolveJoin(): void {
    const resolve = this.joinResolve;
    this.joinResolve = null;
    this.joinReject = null;
    resolve?.();
  }

  private rejectJoin(error: Error): void {
    const reject = this.joinReject;
    this.joinResolve = null;
    this.joinReject = null;
    reject?.(error);
  }

  private fail(message: string): void {
    if (this.currentPhase === 'failed' || this.currentPhase === 'closed') return;
    this.clearTimeout();
    this.clearReconnectTimers();
    this.reconnecting = false;
    this.setPhase('failed', message);
    this.setTransport('failed', message);
    this.handlers.onError?.(message);
    this.rejectJoin(new Error(message));
    this.destroyTransport();
  }

  private destroyTransport(): void {
    const connection = this.connection;
    this.connection = null;
    this.channelOpen = false;
    try {
      connection?.close();
    } catch {
      // La fermeture est au mieux.
    }
    try {
      this.peer?.destroy();
    } catch {
      // Le pair peut déjà être détruit.
    }
    this.peer = null;
  }

  private clearReconnectTimers(): void {
    if (this.reconnectTimer !== null) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.reconnectDeadline !== null) {
      globalThis.clearTimeout(this.reconnectDeadline);
      this.reconnectDeadline = null;
    }
  }

  private reconnectDelay(): number {
    const base = this.options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    return Math.min(base * Math.max(1, this.reconnectAttempts), Math.max(base, 4000));
  }

  /**
   * Le canal direct est tombé alors que la partie était en cours. On garde
   * l’état local et on tente de rétablir le rendez-vous : le premier côté qui
   * peut réserver le code l’occupe, l’autre s’y reconnecte.
   */
  private beginReconnect(): void {
    if (this.reconnecting || this.intentionalClose) return;
    if (!this.roomCodeValue) return;
    this.reconnecting = true;
    if (this.currentPhase !== 'reconnecting') this.phaseBeforeDrop = this.currentPhase;
    this.reconnectAttempts = 0;
    this.setPhase('reconnecting', 'Connexion interrompue. Reprise en cours…');
    this.setTransport('disconnected', 'Connexion interrompue. Reprise en cours…');
    this.destroyTransport();
    const timeout = this.options.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS;
    this.clearReconnectTimers();
    this.reconnectDeadline = globalThis.setTimeout(() => {
      this.reconnectDeadline = null;
      if (this.reconnecting) {
        this.fail(
          'La connexion n’a pas pu être rétablie. Réessayez la connexion ou revenez à l’accueil.',
        );
      }
    }, timeout);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.reconnecting || this.intentionalClose) return;
    if (this.reconnectTimer !== null) return;
    this.reconnectAttempts += 1;
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptReconnect();
    }, this.reconnectDelay());
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.reconnecting || this.intentionalClose) return;
    const code = this.roomCodeValue;
    if (!code) {
      this.fail('La partie ne peut pas être reprise.');
      return;
    }
    try {
      await this.ensureRoom(code);
    } catch {
      this.scheduleReconnect();
    }
  }

  /**
   * Tente de devenir le détenteur du code ; si le code est déjà réservé par
   * l’autre joueur, s’y connecte comme client.
   */
  private async ensureRoom(code: string): Promise<void> {
    const roomId = peerIdForCode(code);
    this.destroyTransport();
    try {
      const peer = await this.factory()(roomId);
      if (!this.reconnecting && !this.intentionalClose) {
        peer.destroy();
        return;
      }
      this.peer = peer;
      this.wirePeer();
      return;
    } catch (error) {
      if (!(error instanceof CodeUnavailableError)) throw error;
    }

    if (!this.reconnecting && !this.intentionalClose) return;
    const peer = await this.factory()();
    if (!this.reconnecting && !this.intentionalClose) {
      peer.destroy();
      return;
    }
    this.peer = peer;
    this.wirePeer();
    const connection = peer.connect(roomId);
    this.attachConnection(connection);
  }

  private factory(): PeerFactory {
    return this.options.peerFactory ?? defaultPeerFactory;
  }

  /**
   * Réserve un code à six chiffres auprès du courtier public. Le code n’est
   * rendu à l’interface qu’une fois le pair réellement enregistré : sinon,
   * l’hôte afficherait un code que personne ne pourrait joindre.
   */
  async host(): Promise<string> {
    if (this.role !== 'host') {
      throw new Error('Seul l’hôte peut créer un salon.');
    }
    this.setPhase('opening', 'Préparation du salon…');
    this.setTransport('opening');
    const tried = new Set<string>();

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateRoomCode(this.options.randomInt);
      if (tried.has(code)) continue;
      tried.add(code);

      let peer: PeerLike;
      try {
        peer = await this.factory()(peerIdForCode(code));
      } catch (error) {
        if (error instanceof CodeUnavailableError) continue;
        const message = messageFor(error);
        this.fail(message);
        throw new Error(message);
      }

      this.peer = peer;
      this.roomCodeValue = code;
      this.wirePeer();
      this.setPhase('waiting', 'Partagez le code avec votre adversaire.');
      return code;
    }

    const message =
      'Impossible de réserver un code de partie. Le service de mise en relation est peut-être saturé : réessayez dans un instant.';
    this.fail(message);
    throw new Error(message);
  }

  /** Rejoint le salon identifié par le code à six chiffres. */
  async join(code: string): Promise<void> {
    if (this.role !== 'guest') {
      throw new Error('Seul l’invité peut rejoindre un salon.');
    }
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      throw new Error('Le code de partie doit contenir exactement six chiffres.');
    }
    this.roomCodeValue = normalized;
    this.setPhase('connecting', `Connexion au salon ${formatRoomCode(normalized)}…`);
    this.setTransport('opening');

    let peer: PeerLike;
    try {
      peer = await this.factory()();
    } catch (error) {
      const message = messageFor(error);
      this.fail(message);
      throw new Error(message);
    }

    this.peer = peer;
    this.wirePeer();

    let connection: DataConnectionLike;
    try {
      connection = peer.connect(peerIdForCode(normalized));
    } catch (error) {
      const message = messageFor(error);
      this.fail(message);
      throw new Error(message);
    }

    this.attachConnection(connection);
    this.armTimeout(
      'La connexion au salon n’a pas abouti. Vérifiez le code, le réseau, puis réessayez.',
      this.options.joinTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    await new Promise<void>((resolve, reject) => {
      if (this.currentPhase === 'lobby') {
        resolve();
        return;
      }
      if (this.currentPhase === 'failed' || this.currentPhase === 'closed') {
        reject(new Error('La connexion au salon a échoué.'));
        return;
      }
      this.joinResolve = resolve;
      this.joinReject = reject;
    });
  }

  /**
   * Reprend une partie après une coupure ou un redémarrage : rejoint le code,
   * que l’adversaire en soit encore détenteur ou non.
   */
  async resume(
    code: string,
    restorePhase: SessionPhase = 'ready',
    localHash: string | null = null,
  ): Promise<void> {
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      throw new Error('Le code de partie doit contenir exactement six chiffres.');
    }
    this.roomCodeValue = normalized;
    this.phaseBeforeDrop = restorePhase === 'reconnecting' ? 'ready' : restorePhase;
    if (restorePhase === 'ready') this.readyEmitted = true;
    if (restorePhase === 'placing' || restorePhase === 'awaiting-opponent') {
      this.placementStarted = true;
    }
    if (localHash && isHex(localHash, 64)) this.localHash = localHash;
    this.reconnecting = true;
    this.setPhase('reconnecting', 'Reprise de la partie…');
    this.setTransport('opening');

    try {
      await this.ensureRoom(normalized);
    } catch (error) {
      const message = messageFor(error);
      this.fail(message);
      throw new Error(message);
    }

    this.clearTimeout();
    this.timeoutTimer = globalThis.setTimeout(() => {
      this.timeoutTimer = null;
      if (this.joinResolve) {
        this.fail(
          'La reprise de la partie n’a pas abouti. Vérifiez le code et le réseau, puis réessayez.',
        );
      }
    }, this.options.reconnectTimeoutMs ?? DEFAULT_RECONNECT_TIMEOUT_MS);

    await new Promise<void>((resolve, reject) => {
      if (this.channelOpen) {
        resolve();
        return;
      }
      if (this.currentPhase === 'failed' || this.currentPhase === 'closed') {
        reject(new Error('La reprise de la partie a échoué.'));
        return;
      }
      this.joinResolve = resolve;
      this.joinReject = reject;
    });

    this.reconnecting = false;
    this.clearReconnectTimers();
    this.restorePhaseAfterReconnect();
  }

  private restorePhaseAfterReconnect(): void {
    if (this.currentPhase === 'failed' || this.currentPhase === 'closed') return;
    const target: SessionPhase = this.readyEmitted ? 'ready' : this.phaseBeforeDrop;
    if (target === 'idle' || target === 'reconnecting') return;
    this.setPhase(target);
  }

  private wirePeer(): void {
    const peer = this.peer;
    if (!peer) return;

    peer.onConnection((connection) => {
      if (this.connection) {
        try {
          connection.close();
        } catch {
          // Une seconde connexion est ignorée.
        }
        return;
      }
      this.attachConnection(connection);
    });

    peer.onError((error) => this.handlePeerError(error));
    peer.onDisconnected(() => {
      if (this.currentPhase === 'failed' || this.currentPhase === 'closed') return;
      if (this.reconnecting) return;
      if (!this.channelOpen) {
        // Le rendez-vous n'est pas terminé. PeerJS peut rétablir son lien avec
        // le courtier ; le délai de connexion affichera un message explicite
        // si ce n'est pas le cas.
        peer.reconnect();
        return;
      }
      // Le canal direct reste ouvert : on ne dégrade pas l’état du transport.
      if (this.currentPhase === 'lobby') {
        this.warn(
          'Le service de mise en relation est interrompu. La connexion directe reste utilisable.',
        );
      }
      peer.reconnect();
    });
  }

  private attachConnection(connection: DataConnectionLike): void {
    this.connection = connection;

    connection.onOpen(() => {
      if (this.connection !== connection) return;
      this.channelOpen = true;
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.clearReconnectTimers();
      this.setTransport('connected');
      this.sendHello();
      if (
        this.role === 'host' &&
        this.placementStarted &&
        (this.phaseBeforeDrop === 'placing' || this.phaseBeforeDrop === 'awaiting-opponent')
      ) {
        this.sendRaw(createLobbyStart());
      }
      this.restorePhaseAfterReconnect();
      if (this.localHash) this.sendRaw(createCommit(this.role, this.localHash));
      this.handlers.onTransportReady?.();
      if (this.role === 'host' && this.localHash && this.remoteHash) this.maybeStartGame(true);
      if (this.role === 'host' && !this.readyEmitted) {
        this.armTimeout(
          'L’adversaire est connecté mais l’échange n’a pas abouti. Réessayez.',
          this.options.handshakeTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
      }
    });

    connection.onData((data) => this.handleRawMessage(data));

    connection.onClose(() => {
      if (this.connection !== connection) return;
      this.channelOpen = false;
      this.connection = null;
      this.clearTimeout();
      if (this.intentionalClose) return;
      if (this.currentPhase === 'failed' || this.currentPhase === 'closed') return;
      if (this.canReconnect()) {
        if (this.reconnecting) {
          this.destroyTransport();
          this.scheduleReconnect();
        } else {
          this.beginReconnect();
        }
        return;
      }
      this.setTransport('disconnected', 'La connexion directe est fermée.');
      this.setPhase('closed', 'La connexion avec l’adversaire est fermée.');
      this.rejectJoin(new Error('La connexion avec l’adversaire est fermée.'));
      this.handlers.onError?.(
        'La connexion avec l’adversaire est fermée. Revenez à l’accueil pour créer une nouvelle partie.',
      );
    });

    connection.onError((message) => {
      if (this.reconnecting) {
        this.destroyTransport();
        this.scheduleReconnect();
        return;
      }
      this.fail(message || 'Le canal de jeu a rencontré une erreur.');
    });
  }

  private canReconnect(): boolean {
    return (
      this.roomCodeValue !== null &&
      (this.readyEmitted ||
        this.localHash !== null ||
        this.currentPhase === 'lobby' ||
        this.currentPhase === 'placing' ||
        this.currentPhase === 'awaiting-opponent' ||
        this.currentPhase === 'ready' ||
        this.currentPhase === 'reconnecting')
    );
  }

  private sendHello(): void {
    this.sendRaw(createHello(this.role, this.identity.name, this.identity.nonce));
  }

  private sendRaw(value: unknown): boolean {
    const connection = this.connection;
    if (!connection || !this.channelOpen) return false;
    try {
      connection.send(JSON.stringify(value));
      return true;
    } catch {
      this.warn('Le message n’a pas pu être envoyé : la connexion est peut-être fermée.');
      return false;
    }
  }

  private handleRawMessage(raw: unknown): void {
    const message =
      typeof raw === 'string' ? parseNetworkMessage(raw) : isNetworkMessage(raw) ? raw : null;
    if (!message) {
      this.warn('Un message réseau invalide a été ignoré.');
      return;
    }
    this.handleMessage(message);
  }

  private handleMessage(message: NetworkMessage): void {
    if ('id' in message) {
      if (this.seenIds.has(message.id)) {
        this.warn('Un message déjà reçu a été ignoré.');
        return;
      }
      this.seenIds.add(message.id);
    }

    switch (message.type) {
      case 'hello':
        this.handleHello(message);
        return;
      case 'lobby-start':
        this.handleLobbyStart(message.from);
        return;
      case 'commit':
        this.handleCommit(message.from, message.mineHash);
        return;
      case 'start':
        this.handleStart(message);
        return;
      case 'sync':
        if (message.from === this.role) {
          this.warn('Un état de partie provenant de votre propre rôle a été ignoré.');
          return;
        }
        if (!this.remoteHello) {
          this.warn('Un état de partie est arrivé avant la présentation du pair.');
          return;
        }
        this.handlers.onSync?.(message);
        return;
      case 'ping':
      case 'pong':
        this.handlers.onMessage?.(message);
        return;
      default:
        if (!this.readyEmitted) {
          this.warn('Un message de jeu a été reçu avant le démarrage de la partie.');
          return;
        }
        if (message.from === this.role) {
          this.warn('Un message provenant de votre propre rôle a été ignoré.');
          return;
        }
        this.handlers.onMessage?.(message);
    }
  }

  private handleHello(message: { from: PlayerId; name: string; nonce: string }): void {
    if (message.from === this.role) {
      this.warn('Un message provenant de votre propre rôle a été ignoré.');
      return;
    }
    if (this.remoteHello && this.remoteHello.nonce !== message.nonce) {
      this.warn('Un second message de présentation différent a été ignoré.');
      return;
    }

    this.remoteHello = { name: message.name, nonce: message.nonce };
    this.clearTimeout();
    this.handlers.onLobby?.({
      remoteName: message.name || 'Adversaire',
      remoteNonce: message.nonce,
    });
    this.resolveJoin();
    if (
      this.currentPhase === 'idle' ||
      this.currentPhase === 'opening' ||
      this.currentPhase === 'waiting' ||
      this.currentPhase === 'connecting'
    ) {
      this.setPhase('lobby', 'Connexion établie.');
    }
  }

  private handleLobbyStart(from: PlayerId): void {
    if (this.role === 'host') {
      this.warn('L’hôte ne doit pas recevoir de demande de lancement.');
      return;
    }
    if (from !== 'host' || !this.remoteHello) {
      this.warn('La demande de lancement est arrivée trop tôt.');
      return;
    }
    if (
      this.currentPhase === 'placing' ||
      this.currentPhase === 'awaiting-opponent' ||
      this.currentPhase === 'ready'
    ) {
      return;
    }
    this.placementStarted = true;
    this.setPhase('placing', 'Placez votre mine secrète.');
    this.handlers.onPlacementStart?.();
  }

  private handleCommit(from: PlayerId, mineHash: string): void {
    if (from === this.role) {
      this.warn('Un engagement provenant de votre propre rôle a été ignoré.');
      return;
    }
    if (this.remoteHash) {
      if (this.remoteHash !== mineHash) {
        this.warn('Un second engagement différent a été ignoré.');
      }
      return;
    }

    this.remoteHash = mineHash;
    if (this.role === 'host') {
      this.maybeStartGame(this.readyEmitted);
    } else if (this.pendingStart) {
      const pending = this.pendingStart;
      this.pendingStart = null;
      this.handleStart(pending);
    }
  }

  private maybeStartGame(force = false): void {
    if (this.role !== 'host' || (this.readyEmitted && !force)) return;
    if (!this.remoteHello || !this.localHash || !this.remoteHash) return;

    const start = createStart(
      this.identity.nonce,
      this.remoteHello.nonce,
      this.localHash,
      this.remoteHash,
    );
    if (!start) {
      this.fail('Impossible de calculer le premier joueur.');
      return;
    }
    if (!this.sendRaw(start)) {
      this.warn('Le démarrage de la partie n’a pas pu être envoyé.');
      return;
    }
    if (this.readyEmitted) {
      this.start = start;
      return;
    }
    this.emitReady(start);
  }

  private handleStart(message: StartMessage): void {
    if (this.role === 'host') {
      this.warn('L’hôte ne doit pas recevoir de message de démarrage.');
      return;
    }
    if (this.start) return;
    if (!this.remoteHello) {
      this.warn('Le démarrage est arrivé avant la présentation de l’hôte.');
      return;
    }
    if (!this.localHash) {
      this.warn('Le démarrage est arrivé avant le verrouillage de votre mine.');
      return;
    }
    if (!this.remoteHash) {
      this.pendingStart = message;
      return;
    }
    if (message.hostNonce !== this.remoteHello.nonce) {
      this.warn('Le nonce de l’hôte ne correspond pas à sa présentation.');
      return;
    }
    if (message.guestNonce !== this.identity.nonce) {
      this.warn('Le nonce de l’invité ne correspond pas à votre engagement local.');
      return;
    }
    if (message.hostHash !== this.remoteHash) {
      this.warn('L’engagement de mine de l’hôte est incohérent.');
      return;
    }
    if (message.guestHash !== this.localHash) {
      this.warn('L’engagement de mine de l’invité est incohérent.');
      return;
    }
    const expected = chooseStarter(message.hostNonce, message.guestNonce);
    if (!expected || expected !== message.starter) {
      this.warn('Le premier joueur annoncé est incohérent avec les nonces.');
      return;
    }

    this.start = message;
    this.emitReady(message);
  }

  private emitReady(start: StartMessage): void {
    if (this.readyEmitted || !this.remoteHello || !this.remoteHash) return;
    this.readyEmitted = true;
    this.clearTimeout();
    this.setPhase('ready', 'La partie commence.');
    this.handlers.onReady?.({
      starter: start.starter,
      remoteName: this.remoteHello.name || 'Adversaire',
      remoteNonce: this.remoteHello.nonce,
      remoteMineHash: this.remoteHash,
      start,
    });
  }

  /** L’hôte lance le placement des deux mines. */
  beginPlacement(): boolean {
    if (this.role !== 'host') {
      this.warn('Seul l’hôte peut lancer la partie.');
      return false;
    }
    if (this.currentPhase !== 'lobby' || !this.connection) {
      this.warn('Attendez que votre adversaire soit connecté.');
      return false;
    }
    if (!this.sendRaw(createLobbyStart())) {
      this.warn('Le lancement n’a pas pu être envoyé.');
      return false;
    }
    this.placementStarted = true;
    this.setPhase('placing', 'Placez votre mine secrète.');
    this.handlers.onPlacementStart?.();
    return true;
  }

  /** Envoie l’engagement de mine et attend celui de l’adversaire. */
  commitMine(hash: string): boolean {
    if (!isHex(hash, 64)) {
      this.warn('L’engagement de mine est invalide.');
      return false;
    }
    if (this.localHash) return this.localHash === hash;
    if (this.currentPhase !== 'placing' && this.currentPhase !== 'awaiting-opponent') {
      this.warn('Le placement n’a pas encore commencé.');
      return false;
    }
    this.localHash = hash;
    this.setPhase('awaiting-opponent', 'En attente de la mine adverse…');
    if (!this.sendRaw(createCommit(this.role, hash))) {
      this.localHash = null;
      this.setPhase('placing', 'Placez votre mine secrète.');
      this.warn('L’engagement n’a pas pu être envoyé.');
      return false;
    }
    if (this.role === 'host') this.maybeStartGame();
    return true;
  }

  private handlePeerError(error: PeerError): void {
    if (this.reconnecting) {
      // Les erreurs d’un essai de reprise sont normales : on retente.
      this.destroyTransport();
      this.scheduleReconnect();
      return;
    }
    if (error.type === 'peer-unavailable') {
      if (this.role === 'guest') {
        this.fail('Aucune partie ne porte ce code. Vérifiez les six chiffres et réessayez.');
      } else {
        this.warn('Le pair distant est introuvable.');
      }
      return;
    }
    if (error.type === 'unavailable-id') {
      this.warn('Le code réservé est déjà utilisé. Revenez à l’accueil pour en créer un autre.');
      return;
    }
    if (error.type === 'browser-incompatible') {
      this.fail(
        'Ce navigateur ne prend pas en charge WebRTC. Essayez Safari, Chrome ou Firefox à jour.',
      );
      return;
    }
    if (
      error.type === 'network' ||
      error.type === 'server-error' ||
      error.type === 'socket-error' ||
      error.type === 'socket-closed'
    ) {
      if (
        this.currentPhase === 'lobby' ||
        this.currentPhase === 'placing' ||
        this.currentPhase === 'awaiting-opponent' ||
        this.currentPhase === 'ready'
      ) {
        this.warn(
          'Le service de mise en relation est instable. La connexion directe reste utilisable.',
        );
        return;
      }
      this.fail(
        'Le service de mise en relation est injoignable. Vérifiez votre connexion, puis réessayez.',
      );
      return;
    }
    this.warn(error.message || 'Une erreur de connexion a été signalée.');
  }

  send(message: NetworkMessage): boolean {
    if (!isNetworkMessage(message)) {
      this.warn('Le message local est invalide et n’a pas été envoyé.');
      return false;
    }
    if (message.from !== this.role) {
      this.warn('Un message local avec un rôle incohérent a été refusé.');
      return false;
    }
    return this.sendRaw(message);
  }

  /** Pousse l’état public de la partie après une reconnexion. */
  sendSync(payload: Omit<SyncMessage, 'protocol' | 'type' | 'id' | 'from'>): boolean {
    return this.sendRaw(createSync(this.role, payload));
  }

  /** Force une reprise lorsque le silence du pair laisse penser que le canal est mort. */
  restartConnection(): void {
    if (this.intentionalClose) return;
    if (
      this.currentPhase === 'failed' ||
      this.currentPhase === 'closed' ||
      this.currentPhase === 'reconnecting'
    ) {
      return;
    }
    if (!this.roomCodeValue) return;
    this.beginReconnect();
  }

  close(): void {
    this.intentionalClose = true;
    this.reconnecting = false;
    this.clearTimeout();
    this.clearReconnectTimers();
    this.rejectJoin(new Error('La session est fermée.'));
    if (this.currentPhase !== 'failed' && this.currentPhase !== 'closed') {
      this.setPhase('closed');
    }
    this.destroyTransport();
    this.setTransport('closed');
  }
}
