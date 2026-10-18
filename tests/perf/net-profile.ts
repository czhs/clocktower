// (v3 perf recon, front "net", CT_AGENT=v3-perf-net) Wire profile of ONE lobby per world: what each client
// receives / sends per message type in a v2 vs a v3 (Hollowmere) lobby, what permessage-deflate would save, and
// what a reconnect costs. New file; does not change server-profile.ts (that one stays the budget's source).
//
//   CT_AGENT=v3-perf-net scripts/remote.sh sh -c 'flock $HOME/clocktower/v3-heavy.lock \
//     pnpm exec tsx tests/perf/net-profile.ts --world v3 --players 15 --ports 3496-3497 --out /tmp/ct-v3net/v3'
//
// Options: --world v2|v3 (default v2) · --players N (15) · --phases lobby,walk,chat,social,vote,reconnect ·
//          --secs S seconds per walk-like phase (25) · --reconnects K (4) · --ports A-B (3496-3497) ·
//          --mode source|dist (source) · --deflate yes|no (yes) · --out DIR (/tmp/ct-netprof-<world>)
//
// Phases (all clients join with the compact 'world:snap2' capability, like the real client):
//   lobby      waiting room, everyone wanders (players walk the town before the game)
//   walk       day, everyone wanders outdoors at 10 Hz (the budget's "A day-walk")
//   chat       day walk + every player chats about once per 8 s (lobby chat fan-out)
//   social     day walk + every player points (emote) about once per 5 s and drops / lifts a pin per 12 s
//   vote       nomination + vote with N-1 hands (game:view churn)
//   reconnect  K players, one after the other: abrupt drop, then Colyseus reconnect by token (as net/room.ts
//              does first); the bytes the reconnecting client gets in its first 3 s, the time to its first
//              lobby:view / game:view / snapshot, and the extra bytes every OTHER client gets meanwhile.
//
// Walking uses the lobby's OWN layout (v2 townLayout or townLayoutV3) for path planning, so v3 bots never walk
// into v3 walls (tests/support/bot.ts plans on the v2 layout only; that is WP7's to change, not this tool's).
//
// Deflate what-if: every raw S2C WebSocket frame of every client goes through a per-connection raw-deflate
// estimate with a 32 KiB sliding dictionary of that connection's previous frames (≈ permessage-deflate with
// context takeover, zlib level 1 and 6) and without (no_context_takeover), at the ws thresholds 0 / 128 / 1024 B
// (ws's default threshold is 1024: smaller frames are sent uncompressed). Compression CPU is the time of those
// estimates (an upper bound: dictionary priming per call), reported per second for the WHOLE lobby (server side).
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pack } from '@colyseus/msgpackr';
import { isBlockedPx, PLAYER_SPEED, tileCenterPx, type PlayerGameView, type TownLayout, type WorldTeleport } from '../../packages/protocol/src/index.js';
import { townLayout } from '../../packages/assets/src/index.js';
import { townLayoutV3 } from '../../packages/assets/src/hollowmere/layoutV3.js';
import { makeBots, type Bot } from '../support/bot.js';
import { nominateAndVote, safeNominee, setupGame, toDay, until, type Game } from '../support/game.js';
import { pickPort, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : d;
};
const WORLD = arg('world', 'v2') === 'v3' ? 'v3' : 'v2';
const PLAYERS = Number(arg('players', '15'));
const SECS = Number(arg('secs', '25'));
const RECONNECTS = Number(arg('reconnects', '4'));
const PHASES = new Set(arg('phases', 'lobby,walk,chat,social,vote,reconnect').split(','));
const MODE = arg('mode', 'source') === 'dist' ? 'dist' : 'source';
const [PORT_MIN, PORT_MAX] = arg('ports', '3496-3497').split('-').map(Number) as [number, number];
const OUT = path.resolve(arg('out', `/tmp/ct-netprof-${WORLD}`));
const LAYOUT: TownLayout = WORLD === 'v3' ? townLayoutV3 : townLayout;
mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[net ${WORLD} ${new Date().toISOString().slice(11, 19)}]`, ...a);
const r1 = (v: number) => Math.round(v * 10) / 10;
const rand = (n: number) => Math.floor(Math.random() * n);

// ---- server CPU (/proc) ---------------------------------------------------------------------------------
const CLK = Number(execSync('getconf CLK_TCK').toString().trim()) || 100;
const ticks = (pid: number) => {
  const f = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const a = f.slice(f.lastIndexOf(')') + 2).split(' ');
  return Number(a[11]) + Number(a[12]);
};

// ---- layout-aware walking -------------------------------------------------------------------------------
const walkCache = new Map<number, boolean>();
function walkable(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= LAYOUT.widthTiles || ty >= LAYOUT.heightTiles) return false;
  const k = ty * LAYOUT.widthTiles + tx;
  let v = walkCache.get(k);
  if (v === undefined) {
    const c = tileCenterPx(LAYOUT, { x: tx, y: ty });
    v = !isBlockedPx(LAYOUT, c.x, c.y);
    walkCache.set(k, v);
  }
  return v;
}
function nearbyGoal(pos: { x: number; y: number }, outdoorsOnly: boolean): { x: number; y: number } | null {
  const ts = LAYOUT.tileSize;
  const tb = LAYOUT.townBounds;
  for (let i = 0; i < 40; i++) {
    const tx = Math.floor(pos.x / ts) + rand(21) - 10;
    const ty = Math.floor(pos.y / ts) + rand(21) - 10;
    if (outdoorsOnly && (tx < tb.x || ty < tb.y || tx >= tb.x + tb.w || ty >= tb.y + tb.h)) continue;
    if (walkable(tx, ty)) return { x: tx, y: ty };
  }
  return null;
}
function planPath(from: { x: number; y: number }, goal: { x: number; y: number }, maxNodes = 8000): { x: number; y: number }[] | null {
  const ts = LAYOUT.tileSize;
  const W = LAYOUT.widthTiles;
  const sx = Math.floor(from.x / ts);
  const sy = Math.floor(from.y / ts);
  if (!walkable(goal.x, goal.y)) return null;
  const start = sy * W + sx;
  const target = goal.y * W + goal.x;
  const prev = new Map<number, number>([[start, -1]]);
  const q = [start];
  for (let qi = 0; qi < q.length && qi < maxNodes; qi++) {
    const cur = q[qi]!;
    if (cur === target) break;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      const k = ny * W + nx;
      if (prev.has(k) || !walkable(nx, ny)) continue;
      prev.set(k, cur);
      q.push(k);
    }
  }
  if (!prev.has(target)) return null;
  const out: { x: number; y: number }[] = [];
  for (let k = target; k !== -1 && k !== start; k = prev.get(k)!) out.push(tileCenterPx(LAYOUT, { x: k % W, y: Math.floor(k / W) }));
  out.push(tileCenterPx(LAYOUT, { x: sx, y: sy }));
  return out.reverse();
}

/** Same behaviour as Bot.startWandering (+ exitBuildings), on the lobby's own layout; own move seq. */
class Walker {
  pos: { x: number; y: number } | null = null;
  private path: { x: number; y: number }[] = [];
  private seq = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private off: (() => void) | null = null;
  teleports = 0;
  moves = 0;
  constructor(
    readonly bot: Bot,
    readonly speedMult = 0.9,
  ) {}
  start(hz = 10) {
    this.stop();
    this.pos = this.bot.pos ? { ...this.bot.pos } : tileCenterPx(LAYOUT, LAYOUT.playerSpawn);
    this.off = this.bot.recorder.onMessage((m) => {
      if (m.type !== 'world:teleport') return;
      const tp = m.payload as WorldTeleport;
      this.pos = { x: tp.x, y: tp.y };
      this.path = [];
      this.seq = Math.max(this.seq, tp.seq + 1);
      this.teleports++;
    });
    let pause = 0;
    let doorWait = 0;
    const dt = 1 / hz;
    let facing: 'down' | 'up' | 'left' | 'right' = 'down';
    this.timer = setInterval(() => {
      const b = this.bot;
      if (!b.room || !this.pos) return;
      if (pause > 0) {
        pause -= dt;
        return;
      }
      if (doorWait > 0) doorWait -= dt;
      let moving = false;
      if (!this.path.length) {
        const inside = b.location.startsWith('bld:') ? LAYOUT.buildings.find((x) => `bld:${x.id}` === b.location) : undefined;
        const phase = (b.latest['game:view'] as { phase?: string } | undefined)?.phase;
        const locked = phase === 'first_night' || phase === 'night' || phase === 'dawn';
        if (inside && !locked) {
          const door = tileCenterPx(LAYOUT, inside.interiorDoor);
          if (Math.hypot(door.x - this.pos.x, door.y - this.pos.y) < 12) {
            if (doorWait <= 0) {
              b.room.send('world:useDoor', { buildingId: inside.id });
              doorWait = 1;
            }
          } else this.path = planPath(this.pos, inside.interiorDoor) ?? [];
        } else if (!inside) {
          for (let i = 0; i < 10 && !this.path.length; i++) {
            const g = nearbyGoal(this.pos, true);
            if (g) this.path = planPath(this.pos, g) ?? [];
          }
          if (this.path.length && Math.random() < 0.3) pause = 0.5 + Math.random() * 2;
        }
      }
      const wp = this.path[0];
      if (wp) {
        const dx = wp.x - this.pos.x;
        const dy = wp.y - this.pos.y;
        const dist = Math.hypot(dx, dy);
        const budget = PLAYER_SPEED * this.speedMult * dt;
        let nx = this.pos.x;
        let ny = this.pos.y;
        if (dist <= budget) {
          nx = wp.x;
          ny = wp.y;
          this.path.shift();
        } else {
          nx += (dx / dist) * budget;
          ny += (dy / dist) * budget;
        }
        if (isBlockedPx(LAYOUT, nx, ny)) this.path = [];
        else {
          if (dist > 0.01) facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          this.pos = { x: nx, y: ny };
          moving = true;
        }
      }
      try {
        b.room.send('move', { seq: this.seq++, x: Math.round(this.pos.x * 10) / 10, y: Math.round(this.pos.y * 10) / 10, facing, moving });
        this.moves++;
      } catch {
        /* closing */
      }
    }, 1000 / hz);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.off?.();
    this.off = null;
  }
}

// ---- per-connection wire tap + deflate what-if -----------------------------------------------------------
const THRESHOLDS = [0, 128, 1024] as const;
type Deflate = { ctx1: number[]; ctx6: number[]; noctx6: number[]; cpuNs: number };
interface Tap {
  bytes: number;
  frames: number;
  hist: number[]; // frame size buckets: <64, <128, <256, <512, <1024, <4096, >=4096
  window: Buffer; // last 32 KiB of this connection's S2C payloads (deflate context)
  defl: Deflate;
}
const BUCKETS = [64, 128, 256, 512, 1024, 4096];
const newTap = (): Tap => ({ bytes: 0, frames: 0, hist: new Array(BUCKETS.length + 1).fill(0), window: Buffer.alloc(0), defl: { ctx1: [0, 0, 0], ctx6: [0, 0, 0], noctx6: [0, 0, 0], cpuNs: 0 } });
const taps = new Map<Bot, Tap>();
let deflateOn = arg('deflate', 'yes') !== 'no';

function onFrame(t: Tap, data: ArrayBuffer | Buffer) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
  const n = buf.length;
  t.bytes += n;
  t.frames++;
  let bi = BUCKETS.findIndex((b) => n < b);
  if (bi < 0) bi = BUCKETS.length;
  t.hist[bi]!++;
  if (!deflateOn) return;
  const t0 = process.hrtime.bigint();
  // RFC 7692: a compressed message = deflate output minus the trailing 00 00 ff ff; + 0 header bytes here
  // (the WS frame header is the same size either way for these frame sizes).
  const c1 = zlib.deflateRawSync(buf, { level: 1, dictionary: t.window.length ? t.window : undefined }).length;
  const c6 = zlib.deflateRawSync(buf, { level: 6, dictionary: t.window.length ? t.window : undefined }).length;
  const n6 = zlib.deflateRawSync(buf, { level: 6 }).length;
  t.defl.cpuNs += Number(process.hrtime.bigint() - t0) / 3; // ≈ one compression per frame
  THRESHOLDS.forEach((th, i) => {
    const small = n < th;
    t.defl.ctx1[i]! += small ? n : Math.min(n, c1 + 1);
    t.defl.ctx6[i]! += small ? n : Math.min(n, c6 + 1);
    t.defl.noctx6[i]! += small ? n : Math.min(n, n6 + 1);
  });
  t.window = t.window.length + n > 32768 ? Buffer.concat([t.window, buf]).subarray(-32768) : Buffer.concat([t.window, buf]);
}

/** (Re)install the raw tap on the bot's current socket (after every join / reconnect). */
function tap(b: Bot) {
  const t = taps.get(b) ?? newTap();
  taps.set(b, t);
  t.window = Buffer.alloc(0); // a new connection = a new deflate context
  const ws = (b.room as unknown as { connection?: { transport?: { ws?: { onmessage: ((ev: { data: ArrayBuffer }) => void) | null } } } } | null)?.connection?.transport?.ws;
  if (!ws || typeof ws.onmessage !== 'function') throw new Error(`${b.name}: no raw socket to tap`);
  const orig = ws.onmessage;
  ws.onmessage = (ev) => {
    onFrame(t, ev.data);
    orig.call(ws, ev);
  };
}

// ---- per-type accounting (payload msgpack sizes, as server-profile.ts) ----------------------------------
type TypeStat = { n: number; mp: number; maxMp: number };
/** Which parts of a re-sent view changed (depth 2: `key` or `key.sub` / `key[]` for arrays). */
function changedPaths(prev: unknown, next: unknown, prefix = '', depth = 0, out: string[] = []): string[] {
  if (JSON.stringify(prev) === JSON.stringify(next)) return out;
  if (depth >= 2 || !prev || !next || typeof prev !== 'object' || typeof next !== 'object') {
    out.push(prefix || '(root)');
    return out;
  }
  if (Array.isArray(prev) || Array.isArray(next)) {
    out.push(`${prefix}[]`);
    return out;
  }
  const keys = new Set([...Object.keys(prev as object), ...Object.keys(next as object)]);
  for (const k of keys) changedPaths((prev as Record<string, unknown>)[k], (next as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k, depth + 1, out);
  return out;
}
const VIEW_TYPES = new Set(['game:view', 'lobby:view']);
function meter(b: Bot) {
  const by: Record<string, TypeStat> = {};
  const diffs: Record<string, Record<string, number>> = {};
  const last: Record<string, unknown> = {};
  b.recorder.onMessage((m) => {
    const s = (by[m.type] ??= { n: 0, mp: 0, maxMp: 0 });
    const mp = pack(m.payload).length + m.type.length + 2;
    s.n++;
    s.mp += mp;
    s.maxMp = Math.max(s.maxMp, mp);
    if (VIEW_TYPES.has(m.type)) {
      if (last[m.type] !== undefined) {
        const d = (diffs[m.type] ??= {});
        for (const p of changedPaths(last[m.type], m.payload)) d[p] = (d[p] ?? 0) + 1;
      }
      last[m.type] = JSON.parse(m.json || 'null');
    }
  });
  return {
    by,
    diffs,
    reset() {
      for (const k of Object.keys(by)) delete by[k];
      for (const k of Object.keys(diffs)) delete diffs[k];
    },
  };
}

function snapTap(t: Tap) {
  return { bytes: t.bytes, frames: t.frames, hist: [...t.hist], ctx1: [...t.defl.ctx1], ctx6: [...t.defl.ctx6], noctx6: [...t.defl.noctx6], cpuNs: t.defl.cpuNs };
}

async function measure(label: string, bots: Bot[], meters: ReturnType<typeof meter>[], pid: number, run: () => Promise<void>) {
  for (const m of meters) m.reset();
  const t0s = bots.map((b) => snapTap(taps.get(b)!));
  const tx0 = bots.map((b) => ({ bytes: b.recorder.txBytes, frames: b.recorder.txFrames }));
  const load0 = os.loadavg();
  const c0 = ticks(pid);
  const t0 = performance.now();
  await run();
  const secs = (performance.now() - t0) / 1000;
  const cpu = ((ticks(pid) - c0) / CLK / secs) * 100;
  const load1 = os.loadavg();
  const d = bots.map((b, i) => {
    const a = t0s[i]!;
    const z = snapTap(taps.get(b)!);
    return {
      bytes: z.bytes - a.bytes,
      frames: z.frames - a.frames,
      hist: z.hist.map((v, k) => v - a.hist[k]!),
      ctx1: z.ctx1.map((v, k) => v - a.ctx1[k]!),
      ctx6: z.ctx6.map((v, k) => v - a.ctx6[k]!),
      noctx6: z.noctx6.map((v, k) => v - a.noctx6[k]!),
      cpuNs: z.cpuNs - a.cpuNs,
      txBytes: b.recorder.txBytes - tx0[i]!.bytes,
      txFrames: b.recorder.txFrames - tx0[i]!.frames,
    };
  });
  const avg = (f: (x: (typeof d)[number]) => number) => d.reduce((s, x) => s + f(x), 0) / d.length;
  const total = (f: (x: (typeof d)[number]) => number) => d.reduce((s, x) => s + f(x), 0);
  const raw = total((x) => x.bytes);
  const pct = (v: number) => (raw ? r1((1 - v / raw) * 100) : 0);
  const hist: [string, number][] = BUCKETS.map((b, i): [string, number] => [`<${b}`, total((x) => x.hist[i]!)]);
  hist.push([`>=${BUCKETS[BUCKETS.length - 1]}`, total((x) => x.hist[BUCKETS.length]!)]);
  const res = {
    label,
    world: WORLD,
    secs: r1(secs),
    loadAvg1: { before: r1(load0[0]!), after: r1(load1[0]!) },
    serverCpuPct: r1(cpu),
    s2cBytesPerSecPerClient: { avg: Math.round(avg((x) => x.bytes) / secs), max: Math.round(Math.max(...d.map((x) => x.bytes)) / secs), st: Math.round(d[0]!.bytes / secs) },
    s2cFramesPerSecPerClient: r1(avg((x) => x.frames) / secs),
    c2sBytesPerSecPerClient: Math.round(avg((x) => x.txBytes) / secs),
    c2sFramesPerSecPerClient: r1(avg((x) => x.txFrames) / secs),
    frameSizeHistogram: Object.fromEntries(hist),
    deflateWhatIf: deflateOn
      ? {
          note: 'saving vs raw S2C bytes, all clients; thresholds = ws perMessageDeflate.threshold',
          ...Object.fromEntries(
            THRESHOLDS.map((th, i) => [
              `threshold${th}`,
              { ctxLevel1SavedPct: pct(total((x) => x.ctx1[i]!)), ctxLevel6SavedPct: pct(total((x) => x.ctx6[i]!)), noCtxLevel6SavedPct: pct(total((x) => x.noctx6[i]!)) },
            ]),
          ),
          estServerCompressCpuPctOfCore: r1((total((x) => x.cpuNs) / 1e9 / secs) * 100),
        }
      : null,
    perType: Object.fromEntries(
      (['st', 'player'] as const).map((who, i) => [
        who,
        Object.fromEntries(
          Object.entries(meters[i]!.by)
            .sort((a, b) => b[1].mp - a[1].mp)
            .map(([t, s]) => [t, { perSec: r1(s.n / secs), avgB: Math.round(s.mp / s.n), maxB: s.maxMp, Bps: Math.round(s.mp / secs) }]),
        ),
      ]),
    ),
    /** Re-sent views: which paths changed between consecutive copies (count per path). */
    viewChurn: Object.fromEntries((['st', 'player'] as const).map((who, i) => [who, structuredClone(meters[i]!.diffs)])),
  };
  log(label, JSON.stringify(res));
  return res;
}

// ---- scenario --------------------------------------------------------------------------------------------
async function startGame(g: Game) {
  const { st, players } = g;
  st.send('lobby:start', {});
  await st.waitFor<{ kind?: string }>('game:view', (v) => v?.kind === 'storyteller', 8000);
  g.cmd({ type: 'random_setup' });
  await until(() => (g.stView()?.grimoire?.length ?? 0) === players.length, 8000, 'grimoire');
  g.grimoire = g.stView()!.grimoire;
  g.cmd({ type: 'begin_first_night' });
  await until(() => g.stView()?.phase === 'first_night', 8000, 'first_night');
  await until(() => players.every((p) => (p.gameView as PlayerGameView | undefined)?.you?.role), 8000, 'roles');
  for (const p of players) g.seatOf.set(p, (p.gameView as PlayerGameView).you.seat);
  await toDay(g);
}

const WORDS = ['who', 'did', 'you', 'see', 'last', 'night', 'i', 'think', 'the', 'baker', 'is', 'lying', 'meet', 'me', 'at', 'the', 'well', 'vote', 'no', 'on', 'this', 'one', 'trust', 'seat', 'three'];
const chatLine = (i: number) => `${Array.from({ length: 4 + rand(8) }, () => WORDS[rand(WORDS.length)]).join(' ')} ${i}`;

async function main() {
  const port = await pickPort(PORT_MIN, PORT_MAX);
  const server = await startServer({ mode: MODE, port, env: { LOBBY_IDLE_TIMEOUT_SEC: '120' } });
  log('server', server.url, 'pid', server.pid, 'layout', `${LAYOUT.widthTiles}x${LAYOUT.heightTiles}`, 'load', os.loadavg().map(r1).join(' '));
  const results: unknown[] = [];
  const recon: unknown[] = [];
  try {
    const bots = await makeBots(PLAYERS + 1, `nt${WORLD}${Math.random().toString(36).slice(2, 5)}-`, server.url, server.wsUrl, { record: false, snap2: true });
    const [st] = bots as [Bot];
    // setupGame() creates a v2 lobby; route the creation through the API with the world (protocol: world?: 'v2'|'v3').
    st.createLobby = async (name: string, maxPlayers = 15, takeStoryteller = false) => {
      const r = await st.api.req<{ lobby: { id: string; world?: string } }>('POST', '/api/lobbies', { name, maxPlayers, takeStoryteller, world: WORLD });
      if (r.status !== 201 && r.status !== 200) throw new Error(`createLobby ${r.status}: ${r.text.slice(0, 200)}`);
      if ((r.body.lobby.world ?? 'v2') !== WORLD) throw new Error(`server created world ${r.body.lobby.world}, wanted ${WORLD}`);
      return r.body.lobby.id;
    };
    const g = await setupGame(server.url, server.wsUrl, { players: PLAYERS, bots, maxPlayers: PLAYERS, noStart: true });
    if (!g) throw new Error('lobby setup failed');
    for (const b of bots) tap(b);
    const meters = [meter(bots[0]!), meter(bots[1]!)];
    if (g.st.lobbyView?.world !== WORLD && !(WORLD === 'v2' && g.st.lobbyView?.world === undefined)) throw new Error(`lobby:view world ${g.st.lobbyView?.world}`);
    const walkers = bots.map((b, i) => new Walker(b, i === 0 ? 1.5 : 0.9));
    for (const b of bots) b.startPinging(1000);
    const wanderAll = () => walkers.forEach((w) => w.start(10));
    const stopAll = () => walkers.forEach((w) => w.stop());

    if (PHASES.has('lobby')) {
      wanderAll();
      await sleep(3000);
      results.push(await measure('lobby: waiting room, everyone wandering 10 Hz', bots, meters, server.pid, () => sleep(SECS * 1000)));
      stopAll();
    }
    await startGame(g);
    log('day reached; seats', g.players.length);
    wanderAll();
    await until(() => bots.filter((b) => b.location === 'outdoors').length >= bots.length * 0.9, 45_000, 'bots outdoors').catch(() => log('warn: not all outdoors', bots.filter((b) => b.location !== 'outdoors').map((b) => b.location)));
    if (PHASES.has('walk')) results.push(await measure('walk: day, everyone wandering 10 Hz', bots, meters, server.pid, () => sleep(SECS * 1000)));
    if (PHASES.has('chat')) {
      let n = 0;
      const timers = g.players.map((p) => setInterval(() => p.room?.send('chat:send', { text: chatLine(n++) }), 6000 + rand(4000)));
      results.push(await measure('chat: day walk + 1 chat line / 8 s / player', bots, meters, server.pid, () => sleep(SECS * 1000)));
      timers.forEach(clearInterval);
    }
    if (PHASES.has('social')) {
      const colors = ['gold', 'crimson', 'violet', 'teal'];
      const pins = new Map<Bot, string | null>();
      const timers = g.players.flatMap((p, i) => [
        setInterval(() => {
          const w = walkers[i + 1]!;
          if (!w.pos) return;
          p.room?.send('social:emote', { kind: 'point', x: Math.round(w.pos.x + rand(64) - 32), y: Math.round(w.pos.y + rand(64) - 32) });
        }, 4000 + rand(2000)),
        setInterval(() => {
          const w = walkers[i + 1]!;
          const mine = pins.get(p);
          if (mine) {
            p.room?.send('social:unpin', { id: mine });
            pins.set(p, null);
          } else if (w.pos) p.room?.send('social:pin', { target: { kind: 'place', x: Math.round(w.pos.x), y: Math.round(w.pos.y + 24) }, color: colors[i % colors.length] });
        }, 10_000 + rand(4000)),
      ]);
      const offs = g.players.map((p) =>
        p.recorder.onMessage((m) => {
          if (m.type !== 'world:snapshot' && m.type !== 'world:snap2') return;
          const snap = p.latest['world:snapshot'] as { pins?: { id: string; by: string }[] } | undefined;
          const own = snap?.pins?.find((x) => x.by === p.pid);
          if (own && !pins.get(p)) pins.set(p, own.id);
        }),
      );
      results.push(await measure('social: day walk + point / 5 s + pin drop/lift / 12 s per player', bots, meters, server.pid, () => sleep(SECS * 1000)));
      timers.forEach(clearInterval);
      offs.forEach((o) => o());
    }
    if (PHASES.has('vote')) {
      results.push(
        await measure('vote: nomination + vote with N-1 hands, still wandering', bots, meters, server.pid, async () => {
          const { nominator, entry, nominee } = safeNominee(g);
          await Promise.race([nominateAndVote(g, nominator, entry.seat, g.players.filter((p) => p !== nominee)).catch((e) => log('vote:', (e as Error).message.slice(0, 160))), sleep(45_000)]);
        }),
      );
    }
    // One full sample of each big message (sizes only).
    const sizes = {
      lobbyViewMsgpackB: pack(g.st.lobbyView).length,
      lobbyViewJsonB: JSON.stringify(g.st.lobbyView).length,
      stGameViewMsgpackB: pack(g.st.gameView).length,
      playerGameViewMsgpackB: pack(g.players[0]!.gameView).length,
      snapshotDecodedMsgpackB: pack(g.players[0]!.latest['world:snapshot']).length,
      lastSnap2FrameMsgpackB: pack(g.players[0]!.latest['world:snap2']).length,
      snapshotEntities: (g.players[0]!.latest['world:snapshot'] as { entities?: unknown[] } | undefined)?.entities?.length ?? null,
      walkerTeleports: walkers.reduce((s, w) => s + w.teleports, 0),
      walkerMoves: walkers.reduce((s, w) => s + w.moves, 0),
    };
    log('sizes', JSON.stringify(sizes));
    results.push({ sizes });

    if (PHASES.has('reconnect')) {
      const others = (b: Bot) => bots.filter((x) => x !== b);
      for (let k = 0; k < RECONNECTS; k++) {
        const b = g.players[(k * 3) % g.players.length]!;
        const w = walkers[bots.indexOf(b)]!;
        w.stop();
        // baseline rate of the others just before (2 s)
        const base0 = others(b).map((o) => taps.get(o)!.bytes);
        await sleep(2000);
        const baseRate = others(b).map((o, i) => (taps.get(o)!.bytes - base0[i]!) / 2);
        await b.drop();
        await sleep(1500);
        const o0 = others(b).map((o) => taps.get(o)!.bytes);
        const c0 = ticks(server.pid);
        const tStart = performance.now();
        const firsts: Record<string, number> = {};
        const types: Record<string, { n: number; mp: number }> = {};
        const off = b.recorder.onMessage((m) => {
          firsts[m.type] ??= Math.round(performance.now() - tStart);
          const s = (types[m.type] ??= { n: 0, mp: 0 });
          s.n++;
          s.mp += pack(m.payload).length + m.type.length + 2;
        });
        const rx0 = b.recorder.rxBytes; // the bot's own socket counter sees the connection from its first frame
        let mode = 'token';
        try {
          await b.reconnect();
        } catch (e) {
          mode = `ticket (token failed: ${(e as Error).message.slice(0, 60)})`;
          await b.join(g.lobbyId, 'reconnect');
        }
        const joinMs = Math.round(performance.now() - tStart);
        tap(b);
        await sleep(3000);
        off();
        const secs = (performance.now() - tStart) / 1000;
        const cpuMs = ((ticks(server.pid) - c0) / CLK) * 1000;
        const otherExtra = others(b).map((o, i) => taps.get(o)!.bytes - o0[i]! - baseRate[i]! * secs);
        const rec = {
          bot: b.name,
          mode,
          joinMs,
          firstMsMs: firsts,
          bytesFirst3s: b.recorder.rxBytes - rx0,
          perType: types,
          serverCpuMsDuringWindow: Math.round(cpuMs),
          otherClientsExtraBytesAvg: Math.round(otherExtra.reduce((s, v) => s + v, 0) / otherExtra.length),
        };
        log('reconnect', JSON.stringify(rec));
        recon.push(rec);
        b.startPinging(1000);
        w.start(10);
        await sleep(1500);
      }
    }
    stopAll();
    for (const b of bots) b.stopActivity();
    await Promise.all(bots.map((b) => b.leave().catch(() => undefined)));
  } finally {
    await server.stop();
  }
  const out = { world: WORLD, players: PLAYERS, secs: SECS, mode: MODE, layout: { w: LAYOUT.widthTiles, h: LAYOUT.heightTiles }, host: { cpus: os.cpus().length }, results, reconnects: recon };
  writeFileSync(path.join(OUT, 'net-profile.json'), JSON.stringify(out, null, 1));
  log('wrote', path.join(OUT, 'net-profile.json'));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
