import { describe, expect, it, vi } from 'vitest';
import type { PlayerId } from '../engine/types';
import {
  CodeUnavailableError,
  type DataConnectionLike,
  type PeerError,
  type PeerFactory,
  type PeerLike,
} from './peer';
import { createCommit, createStart, PROTOCOL_VERSION, type NetworkMessage } from './protocol';
import { MatchSession, type MatchSessionOptions, type ReadyContext } from './session';

const HOST_NONCE = '0123456789abcdef0123456789abcdef';
const GUEST_NONCE = 'fedcba9876543210fedcba987654321f';
const HOST_HASH = 'a'.repeat(64);
const GUEST_HASH = 'b'.repeat(64);

class FakeConnection implements DataConnectionLike {
  private openHandler: (() => void) | null = null;
  private dataHandler: ((data: unknown) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((message: string) => void) | null = null;
  remote: FakeConnection | null = null;
  closed = false;
  sent: string[] = [];

  constructor(readonly label: string) {}

  onOpen(handler: () => void): void {
    this.openHandler = handler;
  }

  onData(handler: (data: unknown) => void): void {
    this.dataHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  onError(handler: (message: string) => void): void {
    this.errorHandler = handler;
  }

  send(data: string): void {
    if (this.closed) throw new Error('connexion fermée');
    this.sent.push(data);
    this.remote?.dataHandler?.(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.closeHandler?.();
    this.remote?.closeFromRemote();
  }

  open(): void {
    if (!this.closed) this.openHandler?.();
  }

  fail(message: string): void {
    this.errorHandler?.(message);
  }

  private closeFromRemote(): void {
    if (this.closed) return;
    this.closed = true;
    this.closeHandler?.();
  }
}

class Network {
  readonly peers = new Map<string, FakePeer>();
  readonly pairs: Array<[FakeConnection, FakeConnection]> = [];
  private sequence = 0;

  readonly factory: PeerFactory = async (id?: string) => {
    if (id && this.peers.has(id)) throw new CodeUnavailableError(id);
    const peer = new FakePeer(id ?? `anon-${(this.sequence += 1)}`, this);
    this.peers.set(peer.id, peer);
    return peer;
  };

  link(host: FakePeer): FakeConnection {
    const guestConnection = new FakeConnection('guest');
    const hostConnection = new FakeConnection('host');
    guestConnection.remote = hostConnection;
    hostConnection.remote = guestConnection;
    host.triggerConnection(hostConnection);
    this.pairs.push([guestConnection, hostConnection]);
    return guestConnection;
  }

  openAll(): void {
    for (const [guest, host] of this.pairs) {
      guest.open();
      host.open();
    }
  }
}

class FakePeer implements PeerLike {
  private openHandler: (() => void) | null = null;
  private connectionHandler: ((connection: DataConnectionLike) => void) | null = null;
  private errorHandler: ((error: PeerError) => void) | null = null;
  private disconnectedHandler: (() => void) | null = null;
  destroyed = false;

  constructor(
    readonly id: string,
    private readonly network: Network,
  ) {}

  onOpen(handler: () => void): void {
    this.openHandler = handler;
  }

  onConnection(handler: (connection: DataConnectionLike) => void): void {
    this.connectionHandler = handler;
  }

  onError(handler: (error: PeerError) => void): void {
    this.errorHandler = handler;
  }

  onDisconnected(handler: () => void): void {
    this.disconnectedHandler = handler;
  }

  connect(id: string): DataConnectionLike {
    const target = this.network.peers.get(id);
    if (!target) {
      queueMicrotask(() =>
        this.errorHandler?.({
          type: 'peer-unavailable',
          message: `Le pair ${id} est introuvable.`,
        }),
      );
      return new FakeConnection('missing');
    }
    return this.network.link(target);
  }

  reconnect(): void {
    // Rien à faire dans le faux réseau.
  }

  destroy(): void {
    this.destroyed = true;
    if (this.network.peers.get(this.id) === this) this.network.peers.delete(this.id);
  }

  triggerOpen(): void {
    this.openHandler?.();
  }

  triggerConnection(connection: FakeConnection): void {
    this.connectionHandler?.(connection);
  }

  triggerError(error: PeerError): void {
    this.errorHandler?.(error);
  }

  triggerDisconnect(): void {
    this.disconnectedHandler?.();
  }
}

interface Harness {
  network: Network;
  host: MatchSession;
  guest: MatchSession;
  hostPeer: FakePeer;
  guestPeer: FakePeer;
  code: string;
  hostReady: ReadyContext[];
  guestReady: ReadyContext[];
  hostMessages: NetworkMessage[];
  guestMessages: NetworkMessage[];
  hostWarnings: string[];
  guestWarnings: string[];
  hostErrors: string[];
  guestErrors: string[];
  hostLobby: string[];
  guestLobby: string[];
  hostPlacement: number[];
  guestPlacement: number[];
}

async function createHarness(extra: MatchSessionOptions = {}): Promise<Harness> {
  const network = new Network();
  const hostReady: ReadyContext[] = [];
  const guestReady: ReadyContext[] = [];
  const hostMessages: NetworkMessage[] = [];
  const guestMessages: NetworkMessage[] = [];
  const hostWarnings: string[] = [];
  const guestWarnings: string[] = [];
  const hostErrors: string[] = [];
  const guestErrors: string[] = [];
  const hostLobby: string[] = [];
  const guestLobby: string[] = [];
  const hostPlacement: number[] = [];
  const guestPlacement: number[] = [];

  const options: MatchSessionOptions = { peerFactory: network.factory, ...extra };
  const host = new MatchSession(
    'host',
    { name: 'Hôte', nonce: HOST_NONCE },
    {
      onReady: (context) => hostReady.push(context),
      onMessage: (message) => hostMessages.push(message),
      onWarning: (message) => hostWarnings.push(message),
      onError: (message) => hostErrors.push(message),
      onLobby: (context) => hostLobby.push(context.remoteName),
      onPlacementStart: () => {
        hostPlacement.push(Date.now());
      },
    },
    options,
  );
  const guest = new MatchSession(
    'guest',
    { name: 'Invité', nonce: GUEST_NONCE },
    {
      onReady: (context) => guestReady.push(context),
      onMessage: (message) => guestMessages.push(message),
      onWarning: (message) => guestWarnings.push(message),
      onError: (message) => guestErrors.push(message),
      onLobby: (context) => guestLobby.push(context.remoteName),
      onPlacementStart: () => {
        guestPlacement.push(Date.now());
      },
    },
    options,
  );

  const code = await host.host();
  const joinPromise = guest.join(code);
  await flush();
  network.openAll();
  await joinPromise;

  const hostPeer = network.peers.get(`prisme-v1-${code}`);
  const guestPeer = [...network.peers.values()].find((peer) => peer.id.startsWith('anon-'));
  if (!hostPeer || !guestPeer) throw new Error('Le réseau de test est incomplet.');

  return {
    network,
    host,
    guest,
    hostPeer,
    guestPeer,
    code,
    hostReady,
    guestReady,
    hostMessages,
    guestMessages,
    hostWarnings,
    guestWarnings,
    hostErrors,
    guestErrors,
    hostLobby,
    guestLobby,
    hostPlacement,
    guestPlacement,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForReconnect(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  await flush();
}

function readyHarness(harness: Harness): void {
  expect(harness.host.beginPlacement()).toBe(true);
  expect(harness.host.commitMine(HOST_HASH)).toBe(true);
  expect(harness.guest.commitMine(GUEST_HASH)).toBe(true);
}

describe('session pair-à-pair', () => {
  it('réserve un code, accueille l’invité et échange les noms', async () => {
    const harness = await createHarness();

    expect(harness.code).toMatch(/^\d{6}$/);
    expect(harness.host.roomCode).toBe(harness.code);
    expect(harness.host.phase).toBe('lobby');
    expect(harness.guest.phase).toBe('lobby');
    expect(harness.hostLobby).toEqual(['Invité']);
    expect(harness.guestLobby).toEqual(['Hôte']);
  });

  it('lance le placement chez les deux joueurs', async () => {
    const harness = await createHarness();

    expect(harness.host.beginPlacement()).toBe(true);
    expect(harness.host.phase).toBe('placing');
    expect(harness.guest.phase).toBe('placing');
    expect(harness.hostPlacement).toHaveLength(1);
    expect(harness.guestPlacement).toHaveLength(1);
  });

  it('échange les engagements et démarre la partie', async () => {
    const harness = await createHarness();
    readyHarness(harness);

    expect(harness.host.phase).toBe('ready');
    expect(harness.guest.phase).toBe('ready');
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
    expect(harness.hostReady[0].start.hostHash).toBe(HOST_HASH);
    expect(harness.hostReady[0].start.guestHash).toBe(GUEST_HASH);
  });

  it('refuse un lancement par l’invité', async () => {
    const harness = await createHarness();
    expect(harness.guest.beginPlacement()).toBe(false);
    expect(harness.guestWarnings.some((message) => message.includes('Seul l’hôte'))).toBe(true);
  });

  it('achemine les messages de jeu et ignore les doublons', async () => {
    const harness = await createHarness();
    readyHarness(harness);
    const scan = {
      protocol: PROTOCOL_VERSION,
      type: 'scan',
      id: 'scan-1',
      from: 'host',
      kind: 'wave',
      entry: '1',
    };
    const hostSide = harness.network.pairs[0][1];
    hostSide.send(JSON.stringify(scan));
    hostSide.send(JSON.stringify({ ...scan, id: 'scan-2' }));
    hostSide.send(JSON.stringify(scan));
    expect(harness.guestMessages).toHaveLength(2);
    expect(harness.guestWarnings.some((message) => message.includes('déjà'))).toBe(true);

    harness.network.pairs[0][0].send(JSON.stringify({ ...scan, from: 'host' }));
    expect(harness.hostWarnings.some((message) => message.includes('propre rôle'))).toBe(true);
  });

  it('refuse un message de jeu avant le démarrage', async () => {
    const harness = await createHarness();
    harness.network.pairs[0][1].send(
      JSON.stringify({
        protocol: PROTOCOL_VERSION,
        type: 'scan',
        id: 'scan-1',
        from: 'host',
        kind: 'cell',
        cell: { col: 0, row: 0 },
      }),
    );
    expect(harness.guestMessages).toHaveLength(0);
    expect(harness.guestWarnings.some((message) => message.includes('avant'))).toBe(true);
  });

  it('refuse un démarrage incohérent avec les nonces', async () => {
    const harness = await createHarness();
    expect(harness.host.beginPlacement()).toBe(true);
    expect(harness.guest.commitMine(GUEST_HASH)).toBe(true);
    harness.network.pairs[0][1].send(JSON.stringify(createCommit('host', HOST_HASH)));

    const valid = createStart(HOST_NONCE, GUEST_NONCE, HOST_HASH, GUEST_HASH)!;
    const wrongStarter = {
      ...valid,
      starter: valid.starter === 'host' ? 'guest' : 'host',
    } as const;
    harness.network.pairs[0][1].send(JSON.stringify(wrongStarter));
    expect(harness.guestReady).toHaveLength(0);
    expect(harness.guestWarnings.some((message) => message.includes('premier joueur'))).toBe(true);

    harness.network.pairs[0][1].send(JSON.stringify({ ...valid, guestNonce: HOST_NONCE }));
    expect(harness.guestReady).toHaveLength(0);
    expect(harness.guestWarnings.some((message) => message.includes('invité'))).toBe(true);
  });

  it('refuse un code de partie invalide', async () => {
    const network = new Network();
    const guest = new MatchSession(
      'guest',
      { name: 'X', nonce: GUEST_NONCE },
      {},
      { peerFactory: network.factory },
    );
    await expect(guest.join('abc')).rejects.toThrow('six chiffres');
  });

  it('réessaie avec un autre code quand le premier est déjà pris', async () => {
    const network = new Network();
    let calls = 0;
    const factory: PeerFactory = async (id?: string) => {
      calls += 1;
      if (calls === 1) throw new CodeUnavailableError(id ?? '');
      return network.factory(id);
    };
    const digits = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2];
    let index = 0;
    const host = new MatchSession(
      'host',
      { name: 'Hôte', nonce: HOST_NONCE },
      {},
      {
        peerFactory: factory,
        randomInt: () => digits[index++] ?? 0,
      },
    );
    const code = await host.host();
    expect(calls).toBe(2);
    expect(code).toBe('222222');
  });

  it('valide les messages locaux avant envoi', async () => {
    const harness = await createHarness();
    readyHarness(harness);
    expect(
      harness.guest.send({
        protocol: PROTOCOL_VERSION,
        type: 'scan',
        id: 'scan-local',
        from: 'guest',
        kind: 'wave',
        entry: '1',
      }),
    ).toBe(true);
    expect(
      harness.guest.send({
        protocol: PROTOCOL_VERSION,
        type: 'scan',
        id: 'scan-invalid',
        from: 'host',
        kind: 'wave',
        entry: '1',
      }),
    ).toBe(false);
    expect(
      harness.guest.send({
        protocol: PROTOCOL_VERSION,
        type: 'scan',
        id: 'scan-invalid',
        from: 'guest',
        kind: 'wave',
        entry: 'ZZ',
      } as unknown as NetworkMessage),
    ).toBe(false);
  });

  it('signale un message brut illisible', async () => {
    const harness = await createHarness();
    harness.network.pairs[0][1].send('{');
    expect(harness.guestWarnings.some((message) => message.includes('invalide'))).toBe(true);
  });

  it('échoue avec un message clair si la connexion n’aboutit pas', async () => {
    vi.useFakeTimers();
    try {
      const network = new Network();
      const host = new MatchSession(
        'host',
        { name: 'Hôte', nonce: HOST_NONCE },
        {},
        { peerFactory: network.factory },
      );
      const code = await host.host();
      const errors: string[] = [];
      const guest = new MatchSession(
        'guest',
        { name: 'Invité', nonce: GUEST_NONCE },
        { onError: (message) => errors.push(message) },
        { peerFactory: network.factory, joinTimeoutMs: 1000 },
      );
      const joinPromise = guest.join(code);
      await flush();
      const assertion = expect(joinPromise).rejects.toThrow('La connexion au salon');
      vi.advanceTimersByTime(2000);
      await assertion;
      expect(guest.phase).toBe('failed');
      expect(errors[0]).toContain('La connexion au salon');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reste en attente si le courtier se déconnecte avant l’ouverture du canal', async () => {
    const network = new Network();
    const warnings: string[] = [];
    const host = new MatchSession(
      'host',
      { name: 'Hôte', nonce: HOST_NONCE },
      { onWarning: (message) => warnings.push(message) },
      { peerFactory: network.factory },
    );
    const code = await host.host();
    const hostPeer = network.peers.get(`prisme-v1-${code}`);
    hostPeer?.triggerDisconnect();

    expect(host.phase).toBe('waiting');
    expect(warnings).toHaveLength(0);
  });

  it('signale une coupure du courtier sans interrompre une connexion directe ouverte', async () => {
    const harness = await createHarness();
    harness.hostPeer.triggerDisconnect();

    expect(harness.host.phase).toBe('lobby');
    expect(harness.hostWarnings.some((message) => message.includes('connexion directe'))).toBe(
      true,
    );
  });

  it('ferme la session et libère le pair', async () => {
    const harness = await createHarness();
    harness.guest.close();
    expect(harness.guest.phase).toBe('closed');
    expect(harness.guestPeer.destroyed).toBe(true);
  });

  it('rétablit la connexion après une coupure et reprend la partie', async () => {
    const harness = await createHarness({ reconnectDelayMs: 0, reconnectTimeoutMs: 10_000 });
    readyHarness(harness);
    const beforeMessages = harness.guestMessages.length;

    // Le canal direct tombe : les deux camps reprennent sans perdre la partie.
    harness.network.pairs[0][1].close();
    expect(harness.host.phase).toBe('reconnecting');
    expect(harness.guest.phase).toBe('reconnecting');

    await waitForReconnect();
    harness.network.openAll();
    await waitForReconnect();

    expect(harness.host.phase).toBe('ready');
    expect(harness.guest.phase).toBe('ready');

    const lastPair = harness.network.pairs[harness.network.pairs.length - 1];
    lastPair[1].send(
      JSON.stringify({
        protocol: PROTOCOL_VERSION,
        type: 'scan',
        id: 'scan-after-reconnect',
        from: 'host',
        kind: 'wave',
        entry: '1',
      }),
    );
    expect(harness.guestMessages.length).toBe(beforeMessages + 1);
  });

  it('reprend le placement après une coupure', async () => {
    const harness = await createHarness({ reconnectDelayMs: 0, reconnectTimeoutMs: 10_000 });
    expect(harness.host.beginPlacement()).toBe(true);
    expect(harness.guest.phase).toBe('placing');

    harness.network.pairs[0][1].close();
    await waitForReconnect();
    harness.network.openAll();
    await waitForReconnect();

    expect(harness.host.phase).toBe('placing');
    expect(harness.guest.phase).toBe('placing');
  });

  it('reprend une partie après redémarrage grâce au code', async () => {
    const harness = await createHarness({ reconnectDelayMs: 0, reconnectTimeoutMs: 10_000 });
    readyHarness(harness);

    // L’hôte ferme son application ; l’invité garde le code.
    harness.host.close();
    await waitForReconnect();
    // L’invité garde le code ouvert en attendant le retour de l’hôte.
    expect(harness.guest.phase).toBe('reconnecting');

    const hostLobby: string[] = [];
    const hostReady: ReadyContext[] = [];
    const resumed = new MatchSession(
      'host',
      { name: 'Hôte', nonce: HOST_NONCE },
      {
        onLobby: (context) => hostLobby.push(context.remoteName),
        onReady: (context) => hostReady.push(context),
      },
      { peerFactory: harness.network.factory, reconnectDelayMs: 0, reconnectTimeoutMs: 10_000 },
    );
    const resumePromise = resumed.resume(harness.code, 'ready', HOST_HASH);
    await waitForReconnect();
    harness.network.openAll();
    await resumePromise;

    expect(resumed.phase).toBe('ready');
    expect(harness.guest.phase).toBe('ready');
    expect(hostLobby).toEqual(['Invité']);
    expect(resumed.roomCode).toBe(harness.code);
  });

  it('signale une erreur de pair introuvable', async () => {
    const network = new Network();
    const errors: string[] = [];
    const guest = new MatchSession(
      'guest',
      { name: 'Invité', nonce: GUEST_NONCE },
      { onError: (message) => errors.push(message) },
      { peerFactory: network.factory, joinTimeoutMs: 0 },
    );
    const joinPromise = guest.join('999999');
    const assertion = expect(joinPromise).rejects.toThrow('Aucune partie');
    await flush();
    await assertion;
    expect(errors[0]).toContain('Aucune partie');
  });
});

function chooseExpectedStarter(): PlayerId {
  return createStart(HOST_NONCE, GUEST_NONCE, HOST_HASH, GUEST_HASH)!.starter;
}
