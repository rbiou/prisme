import type { PlayerId } from '../engine/types';
import { isHex } from './integrity';
import {
  PrismePeer,
  type PeerHandlers,
  type PeerOptions,
  type PeerRole,
  type PeerStatus,
} from './peer';
import {
  chooseStarter,
  createHello,
  createStart,
  isNetworkMessage,
  parseNetworkMessage,
  type NetworkMessage,
  type StartMessage,
} from './protocol';
import { decodeSignal, encodeSignal } from './signaling';

export interface SessionIdentity {
  name: string;
  nonce: string;
  mineHash: string;
}

export type SessionPhase =
  | 'idle'
  | 'creating-invitation'
  | 'awaiting-answer'
  | 'awaiting-host'
  | 'connecting'
  | 'handshaking'
  | 'ready'
  | 'closed'
  | 'failed';

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
  onMessage?: (message: NetworkMessage) => void;
  onReady?: (context: ReadyContext) => void;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
}

export interface PeerLike {
  createOffer(): Promise<string>;
  acceptOffer(offerSdp: string): Promise<string>;
  acceptAnswer(answerSdp: string): Promise<void>;
  send(message: unknown): boolean;
  close(): void;
}

export type PeerFactory = (
  role: PeerRole,
  handlers: PeerHandlers,
  options?: PeerOptions,
) => PeerLike;

export interface MatchSessionOptions {
  peerFactory?: PeerFactory;
  peerOptions?: PeerOptions;
  /** Délai après lequel une connexion qui n’aboutit pas est signalée. */
  connectionTimeoutMs?: number;
}

function defaultPeerFactory(
  role: PeerRole,
  handlers: PeerHandlers,
  options?: PeerOptions,
): PeerLike {
  return new PrismePeer(role, handlers, options);
}

export class MatchSession {
  readonly role: PeerRole;
  readonly identity: SessionIdentity;
  private readonly handlers: SessionHandlers;
  private readonly options: MatchSessionOptions;
  private peer: PeerLike | null = null;
  private currentPhase: SessionPhase = 'idle';
  private remoteHello: { name: string; nonce: string; mineHash: string } | null = null;
  private start: StartMessage | null = null;
  private channelOpen = false;
  private helloExpired = false;
  private readyEmitted = false;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly seenIds = new Set<string>();

  constructor(
    role: PeerRole,
    identity: SessionIdentity,
    handlers: SessionHandlers = {},
    options: MatchSessionOptions = {},
  ) {
    if (!isHex(identity.nonce, 32)) {
      throw new Error('Le nonce local doit contenir 32 caractères hexadécimaux.');
    }
    if (!isHex(identity.mineHash, 64)) {
      throw new Error('L’engagement de mine doit être un SHA-256 hexadécimal.');
    }
    this.role = role;
    this.identity = identity;
    this.handlers = handlers;
    this.options = options;
  }

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  private setPhase(phase: SessionPhase, detail?: string): void {
    if (this.currentPhase === phase) return;
    this.currentPhase = phase;
    this.handlers.onPhase?.(phase, detail);
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer === null) return;
    clearTimeout(this.connectionTimer);
    this.connectionTimer = null;
  }

  private armConnectionTimer(): void {
    this.clearConnectionTimer();
    const timeoutMs = this.options.connectionTimeoutMs ?? 30_000;
    if (timeoutMs <= 0) return;
    this.connectionTimer = setTimeout(() => {
      this.connectionTimer = null;
      if (
        this.currentPhase === 'ready' ||
        this.currentPhase === 'failed' ||
        this.currentPhase === 'closed'
      ) {
        return;
      }
      this.setPhase('failed', 'La connexion n’a pas abouti à temps.');
      this.handlers.onError?.(
        'La connexion n’a pas abouti. Vérifiez le réseau, essayez le Wi-Fi, puis créez une nouvelle invitation.',
      );
      this.peer?.close();
    }, timeoutMs);
  }

  private warn(message: string): void {
    this.handlers.onWarning?.(message);
  }

  private ensurePeer(): PeerLike {
    if (this.peer) return this.peer;
    const handlers: PeerHandlers = {
      onOpen: () => {
        this.channelOpen = true;
        this.setPhase('handshaking', 'Échange des engagements…');
        this.sendHello();
        if (this.role === 'host' && this.remoteHello) {
          this.startAsHost();
        }
      },
      onMessage: (data) => {
        this.handleRawMessage(data);
      },
      onStatus: (status, detail) => {
        this.handlers.onTransportStatus?.(status, detail);
        if (status === 'failed') {
          this.clearConnectionTimer();
          this.setPhase('failed', detail);
        }
        if (status === 'closed' && this.currentPhase !== 'failed') {
          this.setPhase('closed');
        }
      },
      onError: (message) => {
        this.handlers.onError?.(message);
      },
    };
    const factory = this.options.peerFactory ?? defaultPeerFactory;
    this.peer = factory(this.role, handlers, this.options.peerOptions);
    return this.peer;
  }

  private sendHello(): void {
    if (this.helloExpired) return;
    const peer = this.peer;
    if (!peer) return;
    const hello = createHello(
      this.role,
      this.identity.name,
      this.identity.nonce,
      this.identity.mineHash,
    );
    if (!peer.send(hello)) {
      this.warn('L’engagement n’a pas pu être envoyé : le canal n’est pas encore ouvert.');
      return;
    }
    this.helloExpired = true;
  }

  async createInvitation(): Promise<string> {
    if (this.role !== 'host') throw new Error('Seul l’hôte peut créer une invitation.');
    this.setPhase('creating-invitation', 'Création de l’offre WebRTC…');
    const peer = this.ensurePeer();
    const sdp = await peer.createOffer();
    this.setPhase('awaiting-answer', 'Partagez le lien, puis collez le code de réponse.');
    return encodeSignal({ v: 1, type: 'offer', sdp });
  }

  async acceptInvitation(offerCode: string): Promise<string> {
    if (this.role !== 'guest') throw new Error('Seul l’invité peut accepter une invitation.');
    const offer = decodeSignal(offerCode);
    if (!offer || offer.type !== 'offer') {
      throw new Error('Le lien d’invitation est incomplet ou endommagé.');
    }
    this.setPhase('connecting', 'Préparation de la réponse…');
    const peer = this.ensurePeer();
    const sdp = await peer.acceptOffer(offer.sdp);
    this.setPhase('awaiting-host', 'Renvoyez le code de réponse à l’hôte.');
    return encodeSignal({ v: 1, type: 'answer', sdp });
  }

  async acceptAnswer(answerCode: string): Promise<void> {
    if (this.role !== 'host') throw new Error('Seul l’hôte peut connecter une réponse.');
    const answer = decodeSignal(answerCode);
    if (!answer || answer.type !== 'answer') {
      throw new Error('Le code de réponse est incomplet ou endommagé.');
    }
    const peer = this.ensurePeer();
    this.setPhase('connecting', 'Connexion à l’invité…');
    await peer.acceptAnswer(answer.sdp);
    this.armConnectionTimer();
  }

  private handleRawMessage(raw: string): void {
    const message = parseNetworkMessage(raw);
    if (!message) {
      this.warn('Un message réseau invalide a été ignoré.');
      return;
    }
    this.handleMessage(message);
  }

  private handleMessage(message: NetworkMessage): void {
    if (message.type === 'hello') {
      if (message.from === this.role) {
        this.warn('Un engagement provenant de votre propre rôle a été ignoré.');
        return;
      }
      if (this.remoteHello) {
        if (
          this.remoteHello.nonce !== message.nonce ||
          this.remoteHello.mineHash !== message.mineHash
        ) {
          this.warn('Un second engagement différent a été ignoré.');
        }
        return;
      }
      this.remoteHello = {
        name: message.name,
        nonce: message.nonce,
        mineHash: message.mineHash,
      };
      if (this.role === 'host' && this.channelOpen) {
        this.startAsHost();
      }
      return;
    }

    if (message.type === 'start') {
      if (this.role === 'host') {
        this.warn('L’hôte ne doit pas recevoir de message de démarrage.');
        return;
      }
      this.handleStart(message);
      return;
    }

    if (!this.readyEmitted) {
      this.warn('Un message de jeu a été reçu avant le démarrage de la partie.');
      return;
    }

    if (message.from === this.role) {
      this.warn('Un message provenant de votre propre rôle a été ignoré.');
      return;
    }

    if ('id' in message) {
      if (this.seenIds.has(message.id)) {
        this.warn('Un message déjà traité a été ignoré.');
        return;
      }
      this.seenIds.add(message.id);
    }

    this.handlers.onMessage?.(message);
  }

  private handleStart(message: StartMessage): void {
    if (this.start) return;
    if (!this.remoteHello) {
      this.warn('Le démarrage est arrivé avant l’engagement de l’hôte.');
      return;
    }
    if (message.hostNonce !== this.remoteHello.nonce) {
      this.warn('Le nonce de l’hôte ne correspond pas à son engagement.');
      return;
    }
    if (message.guestNonce !== this.identity.nonce) {
      this.warn('Le nonce de l’invité ne correspond pas à votre engagement local.');
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

  private startAsHost(): void {
    if (!this.remoteHello || this.start) return;
    const start = createStart(this.identity.nonce, this.remoteHello.nonce);
    if (!start) {
      this.handlers.onError?.('Impossible de calculer le premier joueur.');
      return;
    }
    const peer = this.peer;
    if (!peer || !peer.send(start)) {
      this.warn('Le démarrage n’a pas pu être envoyé.');
      return;
    }
    this.start = start;
    this.emitReady(start);
  }

  private emitReady(start: StartMessage): void {
    if (this.readyEmitted || !this.remoteHello) return;
    this.readyEmitted = true;
    this.clearConnectionTimer();
    this.setPhase('ready');
    this.handlers.onReady?.({
      starter: start.starter,
      remoteName: this.remoteHello.name || 'Adversaire',
      remoteNonce: this.remoteHello.nonce,
      remoteMineHash: this.remoteHello.mineHash,
      start,
    });
  }

  send(message: NetworkMessage): boolean {
    if (!isNetworkMessage(message)) {
      this.warn('Le message local est invalide et n’a pas été envoyé.');
      return false;
    }
    const peer = this.peer;
    if (!peer) return false;
    return peer.send(message);
  }

  sendRaw(value: unknown): boolean {
    const peer = this.peer;
    if (!peer) return false;
    return peer.send(value);
  }

  close(): void {
    this.clearConnectionTimer();
    this.peer?.close();
    this.setPhase('closed');
  }
}
