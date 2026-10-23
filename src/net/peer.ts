import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

export type PeerStatus = 'idle' | 'opening' | 'connected' | 'disconnected' | 'failed' | 'closed';

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export interface PeerError {
  type: string;
  message: string;
}

export interface DataConnectionLike {
  onOpen: (handler: () => void) => void;
  onData: (handler: (data: unknown) => void) => void;
  onClose: (handler: () => void) => void;
  onError: (handler: (message: string) => void) => void;
  send: (data: string) => void;
  close: () => void;
}

export interface PeerLike {
  onOpen: (handler: () => void) => void;
  onConnection: (handler: (connection: DataConnectionLike) => void) => void;
  onError: (handler: (error: PeerError) => void) => void;
  onDisconnected: (handler: () => void) => void;
  connect: (id: string) => DataConnectionLike;
  reconnect: () => void;
  destroy: () => void;
}

export type PeerFactory = (id?: string) => Promise<PeerLike>;

export class CodeUnavailableError extends Error {
  constructor(readonly peerId: string) {
    super(`Le code ${peerId} est déjà utilisé.`);
    this.name = 'CodeUnavailableError';
  }
}

export class SignalingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignalingError';
  }
}

const OPEN_TIMEOUT_MS = 15_000;

class BrowserConnection implements DataConnectionLike {
  constructor(private readonly connection: DataConnection) {}

  onOpen(handler: () => void): void {
    this.connection.on('open', handler);
  }

  onData(handler: (data: unknown) => void): void {
    this.connection.on('data', handler);
  }

  onClose(handler: () => void): void {
    this.connection.on('close', handler);
  }

  onError(handler: (message: string) => void): void {
    this.connection.on('error', (error) => handler(error.message));
  }

  send(data: string): void {
    this.connection.send(data);
  }

  close(): void {
    this.connection.close();
  }
}

class BrowserPeer implements PeerLike {
  constructor(private readonly peer: Peer) {}

  onOpen(handler: () => void): void {
    this.peer.on('open', () => handler());
  }

  onConnection(handler: (connection: DataConnectionLike) => void): void {
    this.peer.on('connection', (connection) => handler(new BrowserConnection(connection)));
  }

  onError(handler: (error: PeerError) => void): void {
    this.peer.on('error', (error) => handler({ type: error.type, message: error.message }));
  }

  onDisconnected(handler: () => void): void {
    this.peer.on('disconnected', () => handler());
  }

  connect(id: string): DataConnectionLike {
    return new BrowserConnection(this.peer.connect(id, { reliable: true, serialization: 'json' }));
  }

  reconnect(): void {
    if (!this.peer.destroyed && this.peer.disconnected) this.peer.reconnect();
  }

  destroy(): void {
    this.peer.destroy();
  }
}

/**
 * Ouvre un pair PeerJS et attend son enregistrement auprès du courtier public.
 *
 * Le courtier sert uniquement de rendez-vous : dès que le canal de données est
 * ouvert, les échanges de jeu passent directement entre les deux navigateurs.
 */
export async function openPeer(id?: string): Promise<PeerLike> {
  const { default: PeerConstructor } = await import('peerjs');
  const options = { debug: 0, config: { iceServers: STUN_SERVERS } };
  const peer = id ? new PeerConstructor(id, options) : new PeerConstructor(options);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      finish();
      peer.destroy();
      reject(
        new SignalingError(
          'Le service de mise en relation ne répond pas. Vérifiez votre connexion, puis réessayez.',
        ),
      );
    }, OPEN_TIMEOUT_MS);

    const finish = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      peer.off('open', onOpen);
      peer.off('error', onError);
    };

    const onOpen = () => {
      finish();
      resolve();
    };

    const onError = (error: { type?: string; message?: string }) => {
      finish();
      peer.destroy();
      if (error.type === 'unavailable-id') {
        reject(new CodeUnavailableError(id ?? ''));
        return;
      }
      reject(
        new SignalingError(
          error.message ??
            'Impossible de joindre le service de mise en relation. Vérifiez votre connexion.',
        ),
      );
    };

    peer.on('open', onOpen);
    peer.on('error', onError);
  });

  return new BrowserPeer(peer);
}
