export type PeerRole = 'host' | 'guest';

export type PeerStatus =
  'idle' | 'awaiting-answer' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface PeerHandlers {
  onOpen?: () => void;
  onMessage?: (data: string) => void;
  onStatus?: (status: PeerStatus, detail?: string) => void;
  onError?: (message: string) => void;
}

export interface PeerOptions {
  iceServers?: RTCIceServer[];
  iceGatherTimeoutMs?: number;
  rtcFactory?: (configuration: RTCConfiguration) => RTCPeerConnection;
}

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export const CHANNEL_LABEL = 'prisme';

export class PrismePeer {
  readonly role: PeerRole;
  private readonly handlers: PeerHandlers;
  private readonly pc: RTCPeerConnection;
  private readonly channel: RTCDataChannel | null;
  private currentStatus: PeerStatus = 'idle';
  private readonly iceGatherTimeoutMs: number;

  constructor(role: PeerRole, handlers: PeerHandlers = {}, options: PeerOptions = {}) {
    this.role = role;
    this.handlers = handlers;
    this.iceGatherTimeoutMs = options.iceGatherTimeoutMs ?? 8000;

    const factory =
      options.rtcFactory ??
      ((configuration: RTCConfiguration) => {
        if (typeof RTCPeerConnection === 'undefined') {
          throw new Error(
            'WebRTC n’est pas disponible dans ce navigateur. Essayez une version récente de Safari, Chrome ou Firefox.',
          );
        }
        return new RTCPeerConnection(configuration);
      });

    this.pc = factory({
      iceServers: options.iceServers ?? STUN_SERVERS,
      iceCandidatePoolSize: 2,
    });

    this.pc.onconnectionstatechange = () => {
      this.applyConnectionState(this.pc.connectionState);
    };
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === 'failed') {
        this.setStatus('failed', 'La connexion pair-à-pair a échoué.');
        this.handlers.onError?.(
          'Connexion impossible. Un réseau mobile restrictif ou un NAT symétrique peut bloquer WebRTC. Essayez le Wi-Fi ou une autre invitation.',
        );
      }
    };

    if (role === 'host') {
      this.channel = this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
      this.attachChannel(this.channel);
    } else {
      this.channel = null;
      this.pc.ondatachannel = (event) => {
        this.attachChannel(event.channel);
      };
    }
  }

  get status(): PeerStatus {
    return this.currentStatus;
  }

  private setStatus(status: PeerStatus, detail?: string): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.handlers.onStatus?.(status, detail);
  }

  private applyConnectionState(state: RTCPeerConnectionState): void {
    switch (state) {
      case 'connected':
        this.setStatus('connected');
        break;
      case 'connecting':
        this.setStatus('connecting');
        break;
      case 'disconnected':
        this.setStatus('disconnected', 'La connexion est interrompue.');
        break;
      case 'failed':
        this.setStatus('failed', 'La connexion a échoué.');
        this.handlers.onError?.(
          'Connexion impossible. Vérifiez le réseau, puis créez une nouvelle invitation.',
        );
        break;
      case 'closed':
        this.setStatus('closed');
        break;
      default:
        break;
    }
  }

  private attachChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.setStatus('connected');
      this.handlers.onOpen?.();
    };
    channel.onclose = () => {
      if (this.currentStatus !== 'closed') {
        this.setStatus('disconnected', 'Le canal de jeu est fermé.');
      }
    };
    channel.onerror = () => {
      this.handlers.onError?.('Le canal de jeu a rencontré une erreur.');
    };
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.handlers.onMessage?.(event.data);
      }
    };
  }

  private async waitForIceGathering(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        this.pc.removeEventListener('icegatheringstatechange', onChange);
        this.pc.removeEventListener('icecandidate', onCandidate);
        resolve();
      };
      const onChange = () => {
        if (this.pc.iceGatheringState === 'complete') finish();
      };
      const onCandidate = (event: RTCPeerConnectionIceEvent) => {
        if (!event.candidate) finish();
      };
      const timer = globalThis.setTimeout(finish, this.iceGatherTimeoutMs);
      this.pc.addEventListener('icegatheringstatechange', onChange);
      this.pc.addEventListener('icecandidate', onCandidate);
    });
  }

  async createOffer(): Promise<string> {
    if (this.role !== 'host') {
      throw new Error('Seul l’hôte peut créer une offre.');
    }
    this.setStatus('connecting', 'Création de l’invitation…');
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.waitForIceGathering();
    const description = this.pc.localDescription;
    if (!description) {
      throw new Error('L’offre WebRTC n’a pas pu être créée.');
    }
    this.setStatus('awaiting-answer', 'En attente du code de réponse.');
    return description.sdp;
  }

  async acceptOffer(offerSdp: string): Promise<string> {
    if (this.role !== 'guest') {
      throw new Error('Seul l’invité peut accepter une offre.');
    }
    this.setStatus('connecting', 'Préparation de la réponse…');
    await this.pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.waitForIceGathering();
    const description = this.pc.localDescription;
    if (!description) {
      throw new Error('La réponse WebRTC n’a pas pu être créée.');
    }
    this.setStatus('connecting', 'En attente de l’hôte.');
    return description.sdp;
  }

  async acceptAnswer(answerSdp: string): Promise<void> {
    if (this.role !== 'host') {
      throw new Error('Seul l’hôte peut recevoir un code de réponse.');
    }
    this.setStatus('connecting', 'Connexion…');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  send(message: unknown): boolean {
    if (this.channel?.readyState !== 'open') return false;
    try {
      this.channel.send(JSON.stringify(message));
      return true;
    } catch {
      this.handlers.onError?.('Le message n’a pas pu être envoyé.');
      return false;
    }
  }

  close(): void {
    try {
      this.channel?.close();
    } catch {
      // Le canal peut déjà être fermé.
    }
    this.pc.close();
    this.setStatus('closed');
  }
}
