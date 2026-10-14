// TEST-ONLY utilities for lobby-auth integration tests (apps/server/test/{auth,directory,room}*.test.ts).
// Not imported by the server entry point, so it is never bundled.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client, type Room } from 'colyseus.js';
import type {
  C2SPayload,
  C2SType,
  GamePhase,
  JoinTicketResponse,
  LobbySummary,
  PlayerGameView,
  S2CMessages,
  StorytellerGameView,
} from '@ct/protocol';
import type { AccountRecord } from '@ct/db';
import { loadConfig, type AppConfig } from '../config.js';
import type { ServiceOptions } from '../services.js';
import type { GameModule, GameOutcome, Logger, RoomEvent, RoomHost, VoiceModule, WorldModule } from './modules.js';
import { startAppServer, type RunningServer } from './bootstrap.js';

export function testConfig(port: number, env: Record<string, string> = {}): AppConfig {
  const dir = mkdtempSync(path.join(tmpdir(), 'ct-srv-'));
  return loadConfig({
    APP_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    APP_PUBLIC_ORIGIN: 'https://clocktower.example.test',
    DATABASE_URL: `file:${path.join(dir, 'test.db')}`,
    SESSION_SECRET: 's'.repeat(64),
    PASSPHRASE_PEPPER: 'p'.repeat(64),
    COOKIE_SECURE: 'auto',
    LOBBY_MAX_COUNT: '4',
    LOG_DIR: path.join(dir, 'logs'),
    ...env,
  });
}

export interface CapturingLogger extends Logger {
  lines: string[];
}

/** Records every log line (JSON) so tests can assert secrets never reach logs. */
export function captureLogger(echo = false): CapturingLogger {
  const lines: string[] = [];
  const write = (level: string) => (msg: string, data?: Record<string, unknown>) => {
    const line = JSON.stringify({ level, msg, ...data });
    lines.push(line);
    if (echo || (level === 'error' && process.env.CT_TEST_LOG)) process.stderr.write(line + '\n');
  };
  return { lines, debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
}

export async function startTestServer(port: number, opts: ServiceOptions & { env?: Record<string, string> } = {}) {
  const log = captureLogger();
  const { env, ...serviceOptions } = opts;
  const srv = await startAppServer(testConfig(port, env), log, { scryptN: 1 << 12, ...serviceOptions });
  return Object.assign(srv, { log });
}
export type TestServer = Awaited<ReturnType<typeof startTestServer>>;

export interface ApiResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export async function api<T = any>(
  srv: RunningServer,
  method: string,
  url: string,
  opts: { cookie?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body: string | undefined;
  if (opts.raw !== undefined) body = opts.raw;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['content-type'] ??= 'application/json';
  }
  const res = await fetch(srv.url + url, { method, headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }
  return { status: res.status, body: parsed as T, headers: res.headers };
}

/** Creates an account directly through the service (bypasses HTTP rate limits). */
export async function makeAccount(srv: RunningServer, name: string): Promise<{ account: AccountRecord; cookie: string; passphrase: string }> {
  const r = await srv.services.auth.createAccount(name);
  return { account: r.account, cookie: `${srv.services.config.cookieName}=${r.token}`, passphrase: r.passphrase };
}

export async function createLobby(
  srv: RunningServer,
  cookie: string,
  body: Partial<{ name: string; maxPlayers: number; description: string; takeStoryteller: boolean }> = {},
): Promise<LobbySummary> {
  const r = await api<{ lobby: LobbySummary }>(srv, 'POST', '/api/lobbies', {
    cookie,
    body: { name: 'Test Lobby', maxPlayers: 15, ...body },
  });
  if (r.status !== 201) throw new Error(`createLobby failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.lobby;
}

export async function getTicket(srv: RunningServer, cookie: string, lobbyId: string, intent: 'player' | 'storyteller' | 'reconnect' = 'player') {
  return api<JoinTicketResponse & { error?: string; message?: string }>(srv, 'POST', `/api/lobbies/${lobbyId}/ticket`, {
    cookie,
    body: { intent },
  });
}

export async function waitFor<T>(
  fn: () => T | undefined | null | false | Promise<T | undefined | null | false>,
  timeoutMs = 3000,
  what = 'condition',
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A colyseus.js client that records every S2C message it receives. */
export class TestClient {
  messages: { type: string; payload: any }[] = [];
  closeCode: number | null = null;
  private dropped = false;
  constructor(
    public room: Room,
    readonly name: string,
  ) {
    this.bind(room);
  }

  private bind(room: Room) {
    this.room = room;
    room.onMessage('*', (type, payload) => {
      this.messages.push({ type: String(type), payload });
    });
    room.onLeave((code) => {
      if (this.room === room) this.closeCode = code;
    });
  }

  static async join(srv: RunningServer, cookie: string, lobbyId: string, intent: 'player' | 'storyteller' | 'reconnect' = 'player', name = 'client') {
    const t = await getTicket(srv, cookie, lobbyId, intent);
    if (t.status !== 200) throw new Error(`ticket failed ${t.status} ${JSON.stringify(t.body)}`);
    return TestClient.joinWithTicket(srv, t.body, name);
  }

  static async joinWithTicket(srv: RunningServer, t: JoinTicketResponse, name = 'client', roomId = t.roomId) {
    const client = new Client(`ws://127.0.0.1:${srv.port}`);
    const room = await client.joinById(roomId, { ticket: t.ticket });
    return new TestClient(room, name);
  }

  /** Reconnect with the Colyseus reconnection token (same seat). */
  async reconnectWithToken(srv: RunningServer, token: string) {
    const client = new Client(`ws://127.0.0.1:${srv.port}`);
    const room = await client.reconnect(token);
    this.closeCode = null;
    this.dropped = false;
    this.bind(room);
  }

  send<T extends C2SType>(type: T, payload: C2SPayload<T>): void {
    this.room.send(type, payload);
  }

  sendRaw(type: string, payload: unknown): void {
    this.room.send(type, payload);
  }

  of<K extends keyof S2CMessages>(type: K): S2CMessages[K][] {
    return this.messages.filter((m) => m.type === type).map((m) => m.payload);
  }

  last<K extends keyof S2CMessages>(type: K): S2CMessages[K] | undefined {
    const all = this.of(type);
    return all[all.length - 1];
  }

  async waitMsg<K extends keyof S2CMessages>(type: K, pred: (p: S2CMessages[K]) => boolean = () => true, timeoutMs = 3000): Promise<S2CMessages[K]> {
    return waitFor(() => this.of(type).find(pred), timeoutMs, `${this.name}: ${String(type)}`);
  }

  /** Latest lobby view satisfying pred (waits for it). */
  async view(pred: (v: S2CMessages['lobby:view']) => boolean = () => true, timeoutMs = 3000) {
    return waitFor(
      () => {
        const v = this.last('lobby:view');
        return v && pred(v) ? v : undefined;
      },
      timeoutMs,
      `${this.name}: lobby:view`,
    );
  }

  get pid(): string | undefined {
    return this.last('lobby:view')?.youPid;
  }

  async leave(consented = true) {
    if (this.closeCode !== null || this.dropped) return;
    await Promise.race([this.room.leave(consented).catch(() => undefined), sleep(1000)]);
  }

  /** Abrupt network drop (no LEAVE_ROOM frame). */
  drop() {
    this.dropped = true;
    (this.room.connection as unknown as { close(): void }).close();
  }
}

// ---------------------------------------------------------------------------------------
// Fake gameplay modules (deterministic lifecycle tests, independent of other teams' WIP).

export class FakeGame implements GameModule {
  events: RoomEvent[] = [];
  started: { seats: { pid: string; seat: number; name: string }[]; storytellerPid: string } | null = null;
  playerCalls: { pid: string; type: string }[] = [];
  stCalls: { pid: string; cmd: unknown }[] = [];
  private result: GameOutcome | null = null;
  constructor(private host: RoomHost) {}
  onEvent(e: RoomEvent) {
    this.events.push(e);
  }
  start(seats: { pid: string; seat: number; name: string }[], storytellerPid: string) {
    this.started = { seats, storytellerPid };
    this.host.emit({ type: 'phase_changed', phase: 'day', prev: null, phaseEndsAt: null });
    this.host.markGameDirty();
  }
  handlePlayer(pid: string, type: string) {
    this.playerCalls.push({ pid, type });
  }
  handleStoryteller(pid: string, cmd: { type: string; winner?: 'good' | 'evil' }) {
    this.stCalls.push({ pid, cmd });
    if (cmd.type === 'declare_winner') this.finish(cmd.winner ?? 'good');
  }
  finish(winner: 'good' | 'evil') {
    if (!this.started) return;
    this.result = {
      winner,
      reason: 'test',
      startedAt: 1,
      endedAt: Date.now(),
      players: this.started.seats.map((s) => ({
        pid: s.pid,
        seat: s.seat,
        startingCharacter: s.seat === 0 ? 'imp' : 'chef',
        finalCharacter: s.seat === 0 ? 'imp' : 'chef',
        finalAlignment: s.seat === 0 ? 'evil' : 'good',
        alive: true,
        executed: false,
        died: false,
        nominationsMade: 1,
        ghostVoteUsed: false,
      })),
    };
    this.host.emit({ type: 'game_finished' });
    this.host.markGameDirty();
  }
  viewFor(pid: string): PlayerGameView | StorytellerGameView | null {
    if (!this.started) return null;
    const seat = this.started.seats.find((s) => s.pid === pid);
    if (pid === this.started.storytellerPid) return { kind: 'storyteller', phase: this.phase() } as unknown as StorytellerGameView;
    return { kind: 'player', phase: this.phase(), you: { pid, seat: seat?.seat ?? -1 } } as unknown as PlayerGameView;
  }
  phase(): GamePhase | null {
    return this.result ? 'finished' : this.started ? 'day' : null;
  }
  directoryPhase() {
    return this.result ? ('finished' as const) : this.started ? ('day' as const) : ('waiting' as const);
  }
  isAlive() {
    return true;
  }
  seatOf(pid: string) {
    return this.started?.seats.find((s) => s.pid === pid)?.seat ?? null;
  }
  tick() {}
  outcome() {
    return this.result;
  }
}

export interface FakeRegistry {
  games: Map<string, FakeGame>;
  /** lobbyId -> (pid -> audience). Default: nobody else hears you. */
  audience: Map<string, (pid: string) => string[]>;
  moves: { lobbyId: string; pid: string }[];
}

export function fakeModules(): { registry: FakeRegistry; factories: NonNullable<ServiceOptions['moduleFactories']> } {
  const registry: FakeRegistry = { games: new Map(), audience: new Map(), moves: [] };
  return {
    registry,
    factories: {
      game: (host) => {
        const g = new FakeGame(host);
        registry.games.set(host.lobbyId, g);
        return g;
      },
      world: (host): WorldModule => ({
        onEvent: () => undefined,
        handleMove: (pid) => {
          registry.moves.push({ lobbyId: host.lobbyId, pid });
        },
        handleUseDoor: () => undefined,
        locationOf: () => 'outdoors',
        positionOf: () => ({ x: 0, y: 0 }),
        snapshotFor: () => ({ t: Date.now(), ackSeq: 0, entities: [] }),
        sendHome: () => undefined,
        teleportToBuilding: () => undefined,
        exitBuilding: () => undefined,
        tick: () => undefined,
      }),
      voice: (host): VoiceModule => ({
        onEvent: () => undefined,
        handleStatus: () => undefined,
        handleAnnounce: () => undefined,
        audienceOf: (pid) => registry.audience.get(host.lobbyId)?.(pid) ?? [],
        tick: () => undefined,
        dispose: async () => undefined,
      }),
    },
  };
}
