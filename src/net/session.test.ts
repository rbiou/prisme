import { describe, expect, it, vi } from 'vitest';
import type { PlayerId } from '../engine/types';
import type { PeerHandlers, PeerRole } from './peer';
import type { NetworkMessage, StartMessage } from './protocol';
import { createStart, PROTOCOL_VERSION } from './protocol';
import {
  MatchSession,
  type MatchSessionOptions,
  type PeerFactory,
  type PeerLike,
  type ReadyContext,
} from './session';

const HOST_NONCE = '0123456789abcdef0123456789abcdef';
const GUEST_NONCE = 'fedcba9876543210fedcba987654321f';
const HOST_HASH = 'a'.repeat(64);
const GUEST_HASH = 'b'.repeat(64);

class FakePeer implements PeerLike {
  readonly role: PeerRole;
  readonly handlers: PeerHandlers;
  readonly sent: unknown[] = [];
  readonly receivedAnswers: string[] = [];
  open = false;
  closed = false;
  offerCalls = 0;
  acceptOfferCalls = 0;

  constructor(role: PeerRole, handlers: PeerHandlers) {
    this.role = role;
    this.handlers = handlers;
  }

  async createOffer(): Promise<string> {
    this.offerCalls += 1;
    return `${this.role}-offer-sdp`;
  }

  async acceptOffer(offerSdp: string): Promise<string> {
    this.acceptOfferCalls += 1;
    if (!offerSdp) throw new Error('offre vide');
    return `${this.role}-answer-sdp`;
  }

  async acceptAnswer(answerSdp: string): Promise<void> {
    this.receivedAnswers.push(answerSdp);
  }

  send(message: unknown): boolean {
    if (!this.open) return false;
    this.sent.push(message);
    return true;
  }

  close(): void {
    this.closed = true;
  }

  triggerOpen(): void {
    this.open = true;
    this.handlers.onOpen?.();
  }

  receive(message: unknown): void {
    this.handlers.onMessage?.(JSON.stringify(message));
  }

  receiveRaw(data: string): void {
    this.handlers.onMessage?.(data);
  }
}

interface Harness {
  host: MatchSession;
  guest: MatchSession;
  hostPeer: FakePeer;
  guestPeer: FakePeer;
  hostReady: ReadyContext[];
  guestReady: ReadyContext[];
  hostMessages: NetworkMessage[];
  guestMessages: NetworkMessage[];
  hostWarnings: string[];
  guestWarnings: string[];
  hostErrors: string[];
  guestErrors: string[];
}

async function createHarness(): Promise<Harness> {
  const peers = new Map<PeerRole, FakePeer>();
  const factory: PeerFactory = (role, handlers) => {
    const peer = new FakePeer(role, handlers);
    peers.set(role, peer);
    return peer;
  };
  const hostReady: ReadyContext[] = [];
  const guestReady: ReadyContext[] = [];
  const hostMessages: NetworkMessage[] = [];
  const guestMessages: NetworkMessage[] = [];
  const hostWarnings: string[] = [];
  const guestWarnings: string[] = [];
  const hostErrors: string[] = [];
  const guestErrors: string[] = [];

  const options: MatchSessionOptions = { peerFactory: factory };
  const host = new MatchSession(
    'host',
    { name: 'Hôte', nonce: HOST_NONCE, mineHash: HOST_HASH },
    {
      onReady: (context) => hostReady.push(context),
      onMessage: (message) => hostMessages.push(message),
      onWarning: (message) => hostWarnings.push(message),
      onError: (message) => hostErrors.push(message),
    },
    options,
  );
  const guest = new MatchSession(
    'guest',
    { name: 'Invité', nonce: GUEST_NONCE, mineHash: GUEST_HASH },
    {
      onReady: (context) => guestReady.push(context),
      onMessage: (message) => guestMessages.push(message),
      onWarning: (message) => guestWarnings.push(message),
      onError: (message) => guestErrors.push(message),
    },
    options,
  );

  const offerCode = await host.createInvitation();
  const answerCode = await guest.acceptInvitation(offerCode);
  await host.acceptAnswer(answerCode);

  return {
    host,
    guest,
    hostPeer: peers.get('host')!,
    guestPeer: peers.get('guest')!,
    hostReady,
    guestReady,
    hostMessages,
    guestMessages,
    hostWarnings,
    guestWarnings,
    hostErrors,
    guestErrors,
  };
}

function finishHandshake(harness: Harness): StartMessage {
  harness.hostPeer.triggerOpen();
  harness.guestPeer.triggerOpen();
  harness.guestPeer.receive(harness.hostPeer.sent[0]);
  harness.hostPeer.receive(harness.guestPeer.sent[0]);
  const start = harness.hostPeer.sent[1] as StartMessage;
  harness.guestPeer.receive(start);
  return start;
}

describe('session pair-à-pair', () => {
  it('échange l’offre, la réponse, les engagements et le démarrage', async () => {
    const harness = await createHarness();
    expect(harness.hostPeer.offerCalls).toBe(1);
    expect(harness.guestPeer.acceptOfferCalls).toBe(1);
    expect(harness.hostPeer.receivedAnswers[0]).toBe('guest-answer-sdp');

    const start = finishHandshake(harness);
    expect(start.starter).toBe(chooseExpectedStarter());
    expect(harness.hostReady).toHaveLength(1);
    expect(harness.guestReady).toHaveLength(1);
    expect(harness.hostReady[0]).toMatchObject({
      starter: chooseExpectedStarter(),
      remoteName: 'Invité',
      remoteNonce: GUEST_NONCE,
      remoteMineHash: GUEST_HASH,
    });
    expect(harness.guestReady[0]).toMatchObject({
      starter: chooseExpectedStarter(),
      remoteName: 'Hôte',
      remoteNonce: HOST_NONCE,
      remoteMineHash: HOST_HASH,
    });
    expect(harness.host.phase).toBe('ready');
    expect(harness.guest.phase).toBe('ready');
  });

  it('achemine les messages de jeu et ignore les doublons', async () => {
    const harness = await createHarness();
    finishHandshake(harness);
    const scan = {
      protocol: PROTOCOL_VERSION,
      type: 'scan',
      id: 'scan-1',
      from: 'host',
      kind: 'wave',
      entry: '1',
    };
    harness.guestPeer.receive(scan);
    harness.guestPeer.receive({ ...scan, id: 'scan-2' });
    harness.guestPeer.receive(scan);
    expect(harness.guestMessages).toHaveLength(2);
    expect(harness.guestWarnings.some((message) => message.includes('déjà'))).toBe(true);
    harness.hostPeer.receive(scan);
    expect(harness.hostWarnings.some((message) => message.includes('propre rôle'))).toBe(true);
  });

  it('refuse un message de jeu avant le démarrage', async () => {
    const harness = await createHarness();
    harness.guestPeer.triggerOpen();
    harness.hostPeer.triggerOpen();
    harness.guestPeer.receive({
      protocol: PROTOCOL_VERSION,
      type: 'scan',
      id: 'scan-1',
      from: 'host',
      kind: 'cell',
      cell: { col: 0, row: 0 },
    });
    expect(harness.guestMessages).toHaveLength(0);
    expect(harness.guestWarnings.some((message) => message.includes('avant'))).toBe(true);
  });

  it('refuse un démarrage incohérent avec les nonces', async () => {
    const harness = await createHarness();
    harness.hostPeer.triggerOpen();
    harness.guestPeer.triggerOpen();
    harness.guestPeer.receive(harness.hostPeer.sent[0]);
    const valid = createStart(HOST_NONCE, GUEST_NONCE)!;
    const wrongStarter: StartMessage = {
      ...valid,
      starter: valid.starter === 'host' ? 'guest' : 'host',
    };
    harness.guestPeer.receive(wrongStarter);
    expect(harness.guestReady).toHaveLength(0);
    expect(harness.guestWarnings.some((message) => message.includes('premier joueur'))).toBe(true);

    const wrongGuestNonce: StartMessage = { ...valid, guestNonce: HOST_NONCE };
    harness.guestPeer.receive(wrongGuestNonce);
    expect(harness.guestReady).toHaveLength(0);
    expect(harness.guestWarnings.some((message) => message.includes('invité'))).toBe(true);
  });

  it('refuse les codes de signalisation invalides', async () => {
    const factory: PeerFactory = (role, handlers) => new FakePeer(role, handlers);
    const options: MatchSessionOptions = { peerFactory: factory };
    const guest = new MatchSession(
      'guest',
      { name: 'X', nonce: GUEST_NONCE, mineHash: GUEST_HASH },
      {},
      options,
    );
    await expect(guest.acceptInvitation('invalide')).rejects.toThrow();
    const host = new MatchSession(
      'host',
      { name: 'Y', nonce: HOST_NONCE, mineHash: HOST_HASH },
      {},
      options,
    );
    await expect(host.acceptAnswer('invalide')).rejects.toThrow();
  });

  it('valide les messages locaux avant envoi', async () => {
    const harness = await createHarness();
    finishHandshake(harness);
    expect(
      harness.guest.send({
        protocol: PROTOCOL_VERSION,
        type: 'scan',
        id: 'scan-local',
        from: 'host',
        kind: 'wave',
        entry: '1',
      }),
    ).toBe(true);
    expect(harness.guestPeer.sent.at(-1)).toMatchObject({ id: 'scan-local' });
    expect(
      harness.guest.send({
        protocol: PROTOCOL_VERSION,
        type: 'scan',
        id: 'scan-invalid',
        from: 'host',
        kind: 'wave',
        entry: 'ZZ',
      } as unknown as NetworkMessage),
    ).toBe(false);
  });

  it('signale un message brut illisible', async () => {
    const harness = await createHarness();
    finishHandshake(harness);
    harness.guestPeer.receiveRaw('{');
    expect(harness.guestWarnings.some((message) => message.includes('invalide'))).toBe(true);
  });

  it('échoue avec un message clair si la connexion n’aboutit pas', async () => {
    vi.useFakeTimers();
    try {
      const harness = await createHarness();
      expect(harness.host.phase).toBe('connecting');

      vi.advanceTimersByTime(30_000);

      expect(harness.host.phase).toBe('failed');
      expect(harness.hostErrors[0]).toContain('La connexion n’a pas abouti');
      expect(harness.hostPeer.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

function chooseExpectedStarter(): PlayerId {
  return createStart(HOST_NONCE, GUEST_NONCE)!.starter;
}
