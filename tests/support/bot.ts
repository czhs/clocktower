// Synthetic player bot (qa-deploy): account -> lobby (create or ticket-join) -> Colyseus room ->
// random walk on walkable tiles -> answers prompts / votes -> pings. Every S2C message is
// recorded per bot for secrecy assertions (see recorder.ts).
import { Client, type Room } from 'colyseus.js';
import {
  isBlockedPx,
  PLAYER_SPEED,
  tileCenterPx,
  type JoinTicketResponse,
  type LobbyRoomView,
  type PlayerGameView,
  type StorytellerGameView,
  type TownLayout,
  type WorldSnapshot,
  type WorldTeleport,
} from '../../packages/protocol/src/index.js';
import { townLayout } from '../../packages/assets/src/index.js';
import { ApiClient } from './http.js';
import { Recorder } from './recorder.js';
import { fakeClientIp } from './ip.js';

export const layout: TownLayout = townLayout;

export interface BotOptions {
  /** Keep every message in memory (default true; the load test turns this off). */
  record?: boolean;
  /** Extra headers for HTTP calls (e.g. X-Forwarded-For to spread rate limits in load tests). */
  headers?: Record<string, string>;
}

export interface PingStats {
  sent: number;
  received: number;
  rtts: number[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (n: number) => Math.floor(Math.random() * n);

export class Bot {
  readonly api: ApiClient;
  readonly recorder: Recorder;
  readonly colyseus: Client;
  room: Room | null = null;
  accountId: string | null = null;
  passphrase: string | null = null;
  reconnectionToken: string | null = null;
  /** Every join ticket this bot was issued (for log/secret scans). */
  readonly tickets: string[] = [];
  lastCloseCode: number | null = null;
  errors: { code: number | string; message: string }[] = [];
  readonly ping: PingStats = { sent: 0, received: 0, rtts: [] };
  /** one-way snapshot delay samples (server t -> client receipt; same-host clocks only) */
  readonly snapshotDelays: number[] = [];
  /** Sum of entities over all received snapshots (avg = snapshotEntities / snapshotDelays.length). */
  snapshotEntities = 0;
  pos: { x: number; y: number } | null = null;
  /** Latest payload per S2C type on the current connection (kept even when not recording). */
  readonly latest: Record<string, unknown> = {};
  private seq = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private pingSent = new Map<number, number>();
  private answered = new Set<string>();

  constructor(
    readonly name: string,
    readonly baseUrl: string,
    readonly wsUrl: string,
    opts: BotOptions = {},
  ) {
    this.api = new ApiClient(baseUrl, opts.headers);
    this.recorder = new Recorder(name, opts.record ?? true);
    this.colyseus = new Client(wsUrl);
  }

  // ---- account / lobby (HTTP) ---------------------------------------------------------------
  async signUp(): Promise<this> {
    const r = await this.api.createAccount(this.name);
    if (r.status !== 200 && r.status !== 201) throw new Error(`createAccount ${r.status}: ${r.text.slice(0, 200)}`);
    this.accountId = r.body.account.id;
    this.passphrase = r.body.passphrase;
    return this;
  }

  async createLobby(name: string, maxPlayers = 15, takeStoryteller = false): Promise<string> {
    const r = await this.api.createLobby({ name, maxPlayers, takeStoryteller });
    if (r.status !== 200 && r.status !== 201) throw new Error(`createLobby ${r.status}: ${r.text.slice(0, 200)}`);
    return r.body.lobby.id;
  }

  async getTicket(lobbyId: string, intent: 'player' | 'storyteller' | 'reconnect' = 'player'): Promise<JoinTicketResponse> {
    const r = await this.api.ticket(lobbyId, intent);
    if (r.status !== 200) throw new Error(`ticket ${r.status}: ${r.text.slice(0, 200)}`);
    this.tickets.push(r.body.ticket);
    return r.body;
  }

  // ---- room (Colyseus) --------------------------------------------------------------------
  async join(lobbyId: string, intent: 'player' | 'storyteller' | 'reconnect' = 'player'): Promise<Room> {
    const t = await this.getTicket(lobbyId, intent);
    return this.joinWithTicket(t);
  }

  async joinWithTicket(t: Pick<JoinTicketResponse, 'roomId' | 'ticket'>): Promise<Room> {
    const room = await this.colyseus.joinById(t.roomId, { ticket: t.ticket });
    this.attach(room);
    return room;
  }

  /** Attach to a room obtained some other way (e.g. raw matchmaker in stub baseline mode). */
  attach(room: Room) {
    // A new connection starts with no server state: views must be re-sent by the server.
    for (const k of Object.keys(this.latest)) delete this.latest[k];
    this.room = room;
    this.lastCloseCode = null;
    this.reconnectionToken = room.reconnectionToken;
    // Byte/frame accounting on the raw socket.
    const conn = (room as any).connection;
    const ws = conn?.transport?.ws;
    if (ws && typeof ws.onmessage === 'function') {
      const orig = ws.onmessage;
      ws.onmessage = (ev: { data: ArrayBuffer }) => {
        this.recorder.rxBytes += ev.data?.byteLength ?? 0;
        this.recorder.rxFrames++;
        orig(ev);
      };
    }
    if (conn && typeof conn.send === 'function') {
      const origSend = conn.send.bind(conn);
      conn.send = (data: ArrayBuffer | Uint8Array) => {
        this.recorder.txBytes += (data as ArrayBuffer).byteLength ?? 0;
        this.recorder.txFrames++;
        origSend(data);
      };
    }
    room.onMessage('*', (type: string | number, payload: unknown) => this.onS2C(String(type), payload));
    room.onError((code, message) => this.errors.push({ code, message: message ?? '' }));
    room.onLeave((code) => {
      this.lastCloseCode = code;
      if (this.room === room) this.room = null;
    });
  }

  private onS2C(type: string, payload: unknown) {
    this.latest[type] = payload;
    this.recorder.record(type, payload);
    if (type === 'pong') {
      const t = (payload as { t?: number })?.t;
      let sentAt = typeof t === 'number' ? this.pingSent.get(t) : undefined;
      if (sentAt === undefined) {
        const first = this.pingSent.entries().next();
        if (!first.done) sentAt = first.value[1];
        if (!first.done) this.pingSent.delete(first.value[0]);
      } else this.pingSent.delete(t!);
      if (sentAt !== undefined) {
        this.ping.received++;
        this.ping.rtts.push(performance.now() - sentAt);
      }
    } else if (type === 'world:snapshot') {
      const s = payload as WorldSnapshot;
      if (typeof s.t === 'number') this.snapshotDelays.push(Date.now() - s.t);
      this.snapshotEntities += s.entities?.length ?? 0;
      const me = this.pid ? s.entities?.find((e) => e.id === this.pid) : undefined;
      if (me && !this.pos) this.pos = { x: me.x, y: me.y };
      if (me) this.location = me.location;
    } else if (type === 'world:teleport') {
      const tp = payload as WorldTeleport;
      this.pos = { x: tp.x, y: tp.y };
      this.location = tp.location;
      this.path = [];
      this.seq = Math.max(this.seq, tp.seq + 1);
    } else if (type === 'game:view') {
      this.autoRespond(payload as PlayerGameView | StorytellerGameView);
    }
  }

  get lobbyView(): LobbyRoomView | undefined {
    return this.latest['lobby:view'] as LobbyRoomView | undefined;
  }
  get pid(): string | undefined {
    return this.lobbyView?.youPid;
  }
  get gameView(): PlayerGameView | StorytellerGameView | undefined {
    return this.latest['game:view'] as PlayerGameView | StorytellerGameView | undefined;
  }

  send(type: string, payload: unknown) {
    if (!this.room) throw new Error(`${this.name}: not in a room`);
    this.room.send(type, payload);
  }

  /** Wait for the next (or an already received, if `since` is 0) message of `type` matching pred. */
  waitFor<T = unknown>(type: string, pred: (p: T) => boolean = () => true, timeoutMs = 5000, since = 0): Promise<T> {
    const hit = this.recorder.messages.find((m) => m.at >= since && m.type === type && pred(m.payload as T));
    if (hit) return Promise.resolve(hit.payload as T);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`${this.name}: timeout waiting for '${type}'`));
      }, timeoutMs);
      const off = this.recorder.onMessage((m) => {
        if (m.type === type && pred(m.payload as T)) {
          clearTimeout(timer);
          off();
          resolve(m.payload as T);
        }
      });
    });
  }

  /** Did any message of this type arrive within `ms`? (resolves false on silence) */
  async receives(type: string, ms: number, pred: (p: any) => boolean = () => true): Promise<boolean> {
    try {
      await this.waitFor(type, pred, ms, Date.now());
      return true;
    } catch {
      return false;
    }
  }

  async leave(consented = true): Promise<void> {
    this.stopActivity();
    const room = this.room;
    if (!room) return;
    if (consented) {
      try {
        room.send('lobby:leave', {});
      } catch {
        /* ignore */
      }
    }
    await Promise.race([room.leave(consented), sleep(3000)]);
    this.room = null;
  }

  /** Abrupt disconnect (no consent) — the server should hold the seat for reconnection. */
  async drop(): Promise<void> {
    this.stopActivity();
    const room = this.room;
    if (!room) return;
    this.reconnectionToken = room.reconnectionToken;
    await Promise.race([room.leave(false), sleep(3000)]);
    this.room = null;
  }

  async reconnect(): Promise<Room> {
    if (!this.reconnectionToken) throw new Error('no reconnection token');
    const room = await this.colyseus.reconnect(this.reconnectionToken);
    this.attach(room);
    return room;
  }

  // ---- behaviour -------------------------------------------------------------------------
  /** Current location as reported by the server ('outdoors' | 'bld:<id>'). */
  location = 'outdoors';
  /** When true the bot walks to its building's door and leaves whenever the phase allows it. */
  exitBuildings = false;
  private path: { x: number; y: number }[] = [];

  /**
   * Realistic walking: picks a random reachable tile within ~10 tiles, follows a BFS path over
   * walkable tiles (so every move is a valid, collision-free step the server accepts), sends
   * `move` at `hz` at ~0.9x walking speed, and pauses sometimes "to talk". With `exitBuildings`
   * it first walks to the interior door and uses it (e.g. leaving home after the first night).
   */
  startWandering(hz = 10, speedMult = 0.9) {
    if (!this.pos) this.pos = tileCenterPx(layout, layout.playerSpawn);
    let pause = 0;
    let doorWait = 0;
    const dt = 1 / hz;
    let facing: 'down' | 'up' | 'left' | 'right' = 'down';
    const timer = setInterval(() => {
      if (!this.room || !this.pos) return;
      if (pause > 0) {
        pause -= dt;
        return;
      }
      if (doorWait > 0) doorWait -= dt;
      let moving = false;
      if (!this.path.length) {
        const inside = this.location.startsWith('bld:') ? layout.buildings.find((b) => `bld:${b.id}` === this.location) : undefined;
        const phase = (this.latest['game:view'] as { phase?: string } | undefined)?.phase;
        const locked = phase === 'first_night' || phase === 'night' || phase === 'dawn';
        if (inside && this.exitBuildings && !locked) {
          const door = tileCenterPx(layout, inside.interiorDoor);
          if (Math.hypot(door.x - this.pos.x, door.y - this.pos.y) < 12) {
            if (doorWait <= 0) {
              this.room.send('world:useDoor', { buildingId: inside.id });
              doorWait = 1;
            }
          } else this.path = planPath(this.pos, inside.interiorDoor) ?? [];
        } else {
          for (let i = 0; i < 10 && !this.path.length; i++) {
            const goal = randomNearbyTile(this.pos);
            if (goal) this.path = planPath(this.pos, goal) ?? [];
          }
          if (this.path.length && Math.random() < 0.3) pause = 0.5 + Math.random() * 2; // people stop to talk
        }
      }
      const wp = this.path[0];
      if (wp) {
        const dx = wp.x - this.pos.x;
        const dy = wp.y - this.pos.y;
        const dist = Math.hypot(dx, dy);
        let budget = PLAYER_SPEED * speedMult * dt;
        let nx = this.pos.x;
        let ny = this.pos.y;
        if (dist <= budget) {
          nx = wp.x;
          ny = wp.y;
          this.path.shift();
          budget -= dist;
        } else {
          nx += (dx / dist) * budget;
          ny += (dy / dist) * budget;
        }
        if (isBlockedPx(layout, nx, ny)) this.path = [];
        else {
          if (dist > 0.01) facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          this.pos = { x: nx, y: ny };
          moving = true;
        }
      }
      try {
        this.room.send('move', { seq: this.seq++, x: Math.round(this.pos.x * 10) / 10, y: Math.round(this.pos.y * 10) / 10, facing, moving });
      } catch {
        /* socket closing */
      }
    }, 1000 / hz);
    this.timers.push(timer);
  }

  startPinging(intervalMs = 1000) {
    let n = 0;
    const timer = setInterval(() => {
      if (!this.room) return;
      const t = Date.now() * 1000 + (n++ % 1000);
      this.pingSent.set(t, performance.now());
      if (this.pingSent.size > 50) this.pingSent.delete(this.pingSent.keys().next().value!);
      this.ping.sent++;
      try {
        this.room.send('ping', { t });
      } catch {
        /* ignore */
      }
    }, intervalMs);
    this.timers.push(timer);
  }

  autoRespondEnabled = true;
  private autoRespond(view: PlayerGameView | StorytellerGameView) {
    if (!this.autoRespondEnabled || !this.room || view?.kind !== 'player') return;
    for (const p of view.prompts ?? []) {
      if (this.answered.has(p.id)) continue;
      this.answered.add(p.id);
      const seats = view.players.filter((pl) => (p.allowDead || pl.alive) && (p.allowSelf || pl.seat !== view.you.seat)).map((pl) => pl.seat);
      const n = Math.min(seats.length, Math.max(p.minTargets ?? 1, Math.min(p.maxTargets ?? 1, 1)));
      const resp: Record<string, unknown> = { promptId: p.id };
      if (p.kind === 'choose_players') resp.seats = seats.sort(() => Math.random() - 0.5).slice(0, n);
      else if (p.kind === 'choose_character' && p.characterOptions?.length) resp.character = p.characterOptions[rand(p.characterOptions.length)];
      else if (p.kind === 'yes_no') resp.yes = Math.random() < 0.5;
      setTimeout(() => this.room?.send('game:promptResponse', resp), 200 + rand(800));
    }
    for (const nom of view.day?.nominations ?? []) {
      const key = `vote:${nom.id}`;
      if (nom.status === 'voting' && nom.currentVoterSeat === view.you.seat && !this.answered.has(key)) {
        this.answered.add(key);
        setTimeout(() => this.room?.send('game:vote', { nominationId: nom.id, vote: Math.random() < 0.5 }), 100 + rand(400));
      }
    }
  }

  stopActivity() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}

/** Create N signed-up bots in parallel (small concurrency to stay under sign-up rate limits). */
export async function makeBots(n: number, prefix: string, baseUrl: string, wsUrl: string, opts: BotOptions = {}): Promise<Bot[]> {
  const bots: Bot[] = [];
  // Each simulated client gets its own X-Forwarded-For (as distinct friends behind Funnel would).
  for (let i = 0; i < n; i++)
    bots.push(new Bot(`${prefix}${i + 1}`, baseUrl, wsUrl, { ...opts, headers: { 'X-Forwarded-For': fakeClientIp(), ...opts.headers } }));
  for (let i = 0; i < bots.length; i += 4) await Promise.all(bots.slice(i, i + 4).map((b) => b.signUp()));
  return bots;
}

// ---- path planning ---------------------------------------------------------------------------
const walkableCache = new Map<number, boolean>();
function walkableTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= layout.widthTiles || ty >= layout.heightTiles) return false;
  const k = ty * layout.widthTiles + tx;
  let v = walkableCache.get(k);
  if (v === undefined) {
    const c = tileCenterPx(layout, { x: tx, y: ty });
    v = !isBlockedPx(layout, c.x, c.y);
    walkableCache.set(k, v);
  }
  return v;
}

function randomNearbyTile(pos: { x: number; y: number }): { x: number; y: number } | null {
  const ts = layout.tileSize;
  for (let i = 0; i < 40; i++) {
    const tx = Math.floor(pos.x / ts) + rand(21) - 10;
    const ty = Math.floor(pos.y / ts) + rand(21) - 10;
    if (walkableTile(tx, ty)) return { x: tx, y: ty };
  }
  return null;
}

/** BFS over 4-connected walkable tiles; returns tile-centre waypoints (excluding the start). */
export function planPath(from: { x: number; y: number }, goal: { x: number; y: number }, maxNodes = 6000): { x: number; y: number }[] | null {
  const ts = layout.tileSize;
  const W = layout.widthTiles;
  const sx = Math.floor(from.x / ts);
  const sy = Math.floor(from.y / ts);
  if (!walkableTile(goal.x, goal.y)) return null;
  const start = sy * W + sx;
  const target = goal.y * W + goal.x;
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let qi = 0; qi < queue.length && qi < maxNodes; qi++) {
    const cur = queue[qi]!;
    if (cur === target) break;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      const k = ny * W + nx;
      if (prev.has(k) || !walkableTile(nx, ny)) continue;
      prev.set(k, cur);
      queue.push(k);
    }
  }
  if (!prev.has(target)) return null;
  const out: { x: number; y: number }[] = [];
  // First waypoint: centre of the start tile (re-centres the bot before turning corners).
  for (let k = target; k !== -1 && k !== start; k = prev.get(k)!) out.push(tileCenterPx(layout, { x: k % W, y: Math.floor(k / W) }));
  out.push(tileCenterPx(layout, { x: sx, y: sy }));
  return out.reverse();
}
