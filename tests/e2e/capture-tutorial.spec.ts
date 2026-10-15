// Tour footage capture (tutorial teammate). Plays one scripted game against a private test server
// and records short clips of REAL gameplay for the pre-sign-in tour (apps/client/src/ui/intro).
//
//   CT_AGENT=tutorial scripts/remote.sh pnpm capture:tutorial
//   CT_AGENT=tutorial scripts/pull.sh apps/client/public/tutorial
//
// Cast: the Storyteller and two players ("Ada", "Bram") are real browsers (3 contexts, GPU WebGL);
// five more villagers are protocol bots (tests/support/bot.ts) that walk with valid moves, chat,
// nominate and raise hands. Every frame is the real client rendering real server state: the script
// only stages WHERE things happen (Storyteller teleports between scenes, which are cut out).
//
// Recording: CDP screencast (JPEG frames + timestamps) per camera page, written under
// test-results/tutorial-raw/. Encoding (ffmpeg): each clip = 1-3 timed segments with short fades ->
// VP9 WebM + H.264 MP4 (muted, size-capped) + a poster, plus manifest.json in
// apps/client/public/tutorial/. CT_TUTORIAL_ENCODE_ONLY=1 re-encodes the last raw capture without
// replaying the game. ffmpeg: $CT_FFMPEG, else `ffmpeg` on PATH, else the static npm build in
// ~/clocktower/audio-scratch (docs/audio.md).
//
// The game script is layout-agnostic (positions come from townLayout: square, clock tower, homes,
// tavern), so the same command re-records the footage after the art/town overhaul.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { FrameTap, geo, inject, installSocketTap, signUp, type GamePlayer } from './helpers';
import { Bot } from '../support/bot.js';
import { fakeClientIp } from '../support/ip.js';
import { segmentSafe } from '../../apps/server/src/world/path.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'test-results/tutorial-raw');
const OUT = path.join(ROOT, 'apps/client/public/tutorial');
const ENCODE_ONLY = process.env.CT_TUTORIAL_ENCODE_ONLY === '1';
const OUT_W = 960;
const OUT_H = 540;
const FPS = 24;
/** Per-clip byte caps (the client downloads ONE of the two formats). */
const WEBM_MAX = Number(process.env.CT_TUTORIAL_WEBM_MAX ?? 330_000);
const MP4_MAX = Number(process.env.CT_TUTORIAL_MP4_MAX ?? 400_000);
const PLAYER_VP = { width: OUT_W, height: OUT_H };
/** Storyteller: a tall window, so the panel shows its tab content; the clip pans a 480x270 window
 * over the panel, pixel-doubled to 960x540 (the CDP screencast delivers CSS-pixel frames). */
const ST_VP = { width: 1180, height: 1060 };
const ST_DPR = 1;

test.skip(!process.env.CT_CAPTURE_TUTORIAL, 'footage capture: run with `pnpm capture:tutorial` (sets CT_CAPTURE_TUTORIAL=1)');

type Pt = { x: number; y: number };
interface Segment {
  cam: string;
  from: number;
  to: number;
  /** Optional pan: a 16:9 window (frame px) that slides from y0 to y1 over the segment. */
  crop?: { x: number; y0: number; y1: number; w: number; h: number };
}
const clips: Record<string, Segment[]> = {};
const log: string[] = [];
const say = (s: string) => {
  const line = `[capture ${new Date().toISOString().slice(11, 19)}] ${s}`;
  log.push(line);
  console.log(line);
};
const now = () => Date.now() / 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------ recording

class Cam {
  frames: { t: number; file: string }[] = [];
  private cdp: CDPSession | null = null;
  private n = 0;
  private writes: Promise<unknown>[] = [];
  readonly dir: string;
  constructor(
    readonly name: string,
    readonly page: Page,
  ) {
    this.dir = path.join(RAW, name);
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
  }
  get on() {
    return this.cdp !== null;
  }
  async start() {
    if (this.cdp) return;
    const cdp = await this.page.context().newCDPSession(this.page);
    this.cdp = cdp;
    cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      const file = path.join(this.dir, `${String(this.n++).padStart(6, '0')}.jpg`);
      this.frames.push({ t: f.metadata.timestamp ?? now(), file });
      this.writes.push(writeFile(file, Buffer.from(f.data, 'base64')));
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
    });
    const vp = this.page.viewportSize()!;
    const dpr = await this.page.evaluate(() => window.devicePixelRatio);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: vp.width * dpr, maxHeight: vp.height * dpr, everyNthFrame: 1 });
  }
  async stop() {
    const cdp = this.cdp;
    if (!cdp) return;
    this.cdp = null;
    await cdp.send('Page.stopScreencast').catch(() => undefined);
    await sleep(200);
    await cdp.detach().catch(() => undefined);
    await Promise.all(this.writes);
    writeFileSync(path.join(this.dir, 'frames.json'), JSON.stringify(this.frames));
  }
}

function addSegment(clip: string, cam: string, from: number, to: number, crop?: Segment['crop']) {
  (clips[clip] ??= []).push({ cam, from, to, ...(crop ? { crop } : {}) });
  say(`clip ${clip}: + ${cam} ${(to - from).toFixed(1)} s`);
}

// ------------------------------------------------------------------------------------ the town

const gv = (p: GamePlayer) => p.tap.last('game:view');
const lv = (p: GamePlayer) => p.tap.last('lobby:view');
const pidOf = (p: GamePlayer): string => lv(p)?.youPid;
const seatOf = (p: GamePlayer): number => gv(p)?.you?.seat;
const botSeat = (b: Bot): number => (b.gameView as { you?: { seat: number } } | undefined)?.you?.seat ?? -1;

/** The page's own avatar: the newest of (a move it sent = its local prediction) / a teleport / a snapshot. */
function posOf(p: GamePlayer): (Pt & { location: string }) | null {
  const pid = pidOf(p);
  let loc: string | null = null;
  for (let i = p.tap.frames.length - 1; i >= 0; i--) {
    const f = p.tap.frames[i]!;
    if (f.dir === 'out' && f.type === 'move') {
      loc ??= locFromSnap(p, pid);
      return { x: f.payload.x, y: f.payload.y, location: loc ?? 'outdoors' };
    }
    if (f.dir === 'in' && f.type === 'world:teleport') return { x: f.payload.x, y: f.payload.y, location: f.payload.location };
    if (f.dir === 'in' && f.type === 'world:snapshot') {
      const e = f.payload.entities?.find((x: { id: string }) => x.id === pid);
      if (e) return { x: e.x, y: e.y, location: e.location };
    }
  }
  return null;
}
function locFromSnap(p: GamePlayer, pid: string): string | null {
  return p.tap.last('world:snapshot')?.entities?.find((x: { id: string }) => x.id === pid)?.location ?? null;
}

const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' } as const;

/**
 * Walk a browser player with the real keyboard, smoothly: keys stay held and only change when the
 * direction to the next waypoint (server A*, string-pulled) changes, so the avatar never stutters.
 */
async function kbWalk(p: GamePlayer, goal: Pt, budgetMs = 45_000, tol = 7): Promise<boolean> {
  const g = await geo();
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const start = posOf(p);
  if (!start) return false;
  let pts = g.findPath(g.L, start, goal, start.location as never);
  if (!pts?.length) {
    say(`${p.name}: no path from ${Math.round(start.x)},${Math.round(start.y)} (${start.location}) to ${Math.round(goal.x)},${Math.round(goal.y)}`);
    return false;
  }
  const held = new Set<string>();
  let pressedAt = 0;
  const set = async (want: string[]) => {
    for (const k of [...held]) if (!want.includes(k)) (held.delete(k), await p.page.keyboard.up(k));
    for (const k of want) if (!held.has(k)) (held.add(k), await p.page.keyboard.down(k));
    // Input on another page can blur this window, which clears the game's key set: re-assert the
    // held keys every few frames (a repeat keydown is harmless).
    if (Date.now() - pressedAt > 120) {
      pressedAt = Date.now();
      for (const k of held) await p.page.keyboard.down(k);
    }
  };
  const until = Date.now() + budgetMs;
  let i = 0;
  let prev: Pt = start;
  let lastMoveAt = Date.now();
  let last = start;
  let replans = 0;
  // 8 directions, screen coordinates (y down): 0 = right, 2 = down, 4 = left, 6 = up
  const OCT: string[][] = [[KEYS.right], [KEYS.right, KEYS.down], [KEYS.down], [KEYS.left, KEYS.down], [KEYS.left], [KEYS.left, KEYS.up], [KEYS.up], [KEYS.right, KEYS.up]];
  try {
    while (i < pts.length && Date.now() < until) {
      await sleep(20);
      const c = posOf(p);
      if (!c) continue;
      if (Math.hypot(c.x - last.x, c.y - last.y) > 0.5) {
        lastMoveAt = Date.now();
        last = c;
      }
      const wp = pts[i]!;
      const final = i === pts.length - 1;
      const d = Math.hypot(wp.x - c.x, wp.y - c.y);
      // pure pursuit along the segment prev -> wp (keeps the avatar on the planned line)
      const sx = wp.x - prev.x;
      const sy = wp.y - prev.y;
      const segLen = Math.max(1, Math.hypot(sx, sy));
      const u = ((c.x - prev.x) * sx + (c.y - prev.y) * sy) / (segLen * segLen);
      if (d <= (final ? tol : 8) || (!final && u >= 1)) {
        prev = wp;
        i++;
        continue;
      }
      if (final && u >= 1.05 && d <= tol * 2) break;
      if (Date.now() - lastMoveAt > 1500 && replans < 8) {
        replans++;
        await set([]);
        const re = g.findPath(g.L, c, goal, c.location as never);
        if (re?.length) ((pts = re), (i = 0), (prev = c));
        lastMoveAt = Date.now();
        continue;
      }
      // short look-ahead: any cross-track error of a couple of px turns into a diagonal back onto the line
      const look = final && d < 18 ? 1 : Math.min(1, Math.max(0, u) + 7 / segLen);
      const tx = prev.x + sx * look;
      const ty = prev.y + sy * look;
      const ang = Math.atan2(ty - c.y, tx - c.x);
      let oct = (((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8) as number;
      // pinned on a corner for a moment: slide along it (the next diagonal either way)
      const pinned = Date.now() - lastMoveAt;
      if (pinned > 300) oct = (oct + (Math.floor(pinned / 300) % 2 ? 1 : 7)) % 8;
      await set(OCT[oct]!);
    }
  } finally {
    await set([]);
  }
  const end = posOf(p);
  const ok = !!end && Math.hypot(end.x - goal.x, end.y - goal.y) < 20;
  if (!ok) {
    const since = Date.now() - budgetMs - 1000;
    say(
      `${p.name}: walk to ${Math.round(goal.x)},${Math.round(goal.y)} ended at ${Math.round(end?.x ?? -1)},${Math.round(end?.y ?? -1)} ${end?.location} ` +
        `(from ${Math.round(start.x)},${Math.round(start.y)} ${start.location}; waypoint ${i}/${pts.length}; replans ${replans}; moves sent ${p.tap.sent('move', since).length}; ` +
        `you=${JSON.stringify(p.tap.last('world:snapshot')?.you ?? null)}; phase ${gv(p)?.phase}; focus ${await p.page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className)})`,
    );
    await p.page.screenshot({ path: path.join(RAW, `walk-${p.name}-${Date.now()}.png`) }).catch(() => undefined);
  }
  return ok;
}

/** Turn in place (a bare tap is a one-frame step; that is fine). */
async function face(p: GamePlayer, dir: keyof typeof KEYS) {
  await p.page.keyboard.down(KEYS[dir]);
  await sleep(40);
  await p.page.keyboard.up(KEYS[dir]);
}

/** Press E until the server moves us through the door. */
async function useDoor(p: GamePlayer, expectLocation: string, timeoutMs = 12_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await p.page.keyboard.press('KeyE');
    for (let k = 0; k < 15; k++) {
      await sleep(100);
      if (posOf(p)?.location === expectLocation) return true;
    }
  }
  return false;
}

// Bots: valid move frames at walking speed along the server's own paths.
function syncBot(b: Bot) {
  const s = b.latest['world:snapshot'] as { entities?: { id: string; x: number; y: number; location: string }[] } | undefined;
  const e = s?.entities?.find((x) => x.id === b.pid);
  if (e) {
    b.pos = { x: e.x, y: e.y };
    b.location = e.location;
  }
}
function botMove(b: Bot, x: number, y: number, facing: string, moving: boolean) {
  const anyB = b as unknown as { seq: number };
  try {
    b.send('move', { seq: anyB.seq++, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, facing, moving });
  } catch {
    /* socket closing */
  }
}
async function botWalk(b: Bot, goal: Pt, speed = 0.92, finalFacing?: string): Promise<boolean> {
  const g = await geo();
  syncBot(b);
  if (!b.pos) return false;
  const pts = g.findPath(g.L, b.pos, goal, b.location as never);
  if (!pts) return false;
  let facing = 'down';
  const dt = 0.05;
  for (const wp of pts) {
    for (;;) {
      if (!b.room || !b.pos) return false;
      const dx: number = wp.x - b.pos.x;
      const dy: number = wp.y - b.pos.y;
      const d = Math.hypot(dx, dy);
      const step = 72 * speed * dt;
      if (d > 0.01) facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (d <= step) {
        b.pos = { x: wp.x, y: wp.y };
        botMove(b, wp.x, wp.y, facing, true);
        await sleep(dt * 1000);
        break;
      }
      b.pos = { x: b.pos.x + (dx / d) * step, y: b.pos.y + (dy / d) * step };
      botMove(b, b.pos.x, b.pos.y, facing, true);
      await sleep(dt * 1000);
    }
  }
  botMove(b, b.pos!.x, b.pos!.y, finalFacing ?? facing, false);
  return true;
}
function botFace(b: Bot, facing: string) {
  syncBot(b);
  if (b.pos) botMove(b, b.pos.x, b.pos.y, facing, false);
}
async function botDoor(b: Bot, buildingId: string, expect: string): Promise<boolean> {
  for (let k = 0; k < 6; k++) {
    try {
      b.send('world:useDoor', { buildingId });
    } catch {
      return false;
    }
    await sleep(700);
    syncBot(b);
    if (b.location === expect) return true;
  }
  return false;
}
/** Facing from a to b. */
function facingTo(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

// ------------------------------------------------------------------------------------ the script

test('record the pre-sign-in tour footage', async ({ browser, baseURL }) => {
  test.setTimeout(1_800_000);
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  if (!ENCODE_ONLY) await play(browser, baseURL!);
  else {
    const saved = JSON.parse(readFileSync(path.join(RAW, 'clips.json'), 'utf8')) as { clips: Record<string, Segment[]> };
    Object.assign(clips, saved.clips);
  }
  const results = encodeAll();
  writeFileSync(path.join(RAW, 'capture-log.txt'), log.join('\n'));
  expect(Object.keys(results).length, 'clips encoded').toBeGreaterThanOrEqual(5);
});

async function play(browser: import('@playwright/test').Browser, base: string) {
  const g = await geo();
  const L = g.L;
  const free = (x: number, y: number, loc = 'outdoors') => !g.isBlockedPx(L, x, y) && g.locationAt(L, x, y) === loc;
  const nearFree = (p: Pt, r = 40, loc = 'outdoors'): Pt | null => {
    for (let rad = 0; rad <= r; rad += 3)
      for (let a = 0; a < 360; a += rad ? 20 : 360) {
        const x = p.x + Math.cos((a * Math.PI) / 180) * rad;
        const y = p.y + Math.sin((a * Math.PI) / 180) * rad;
        if (free(x, y, loc)) return { x, y };
      }
    return null;
  };
  const pathLen = (pts: Pt[] | null, from: Pt) => (pts ? pts.reduce((acc, p, i) => acc + Math.hypot(p.x - (i ? pts[i - 1]!.x : from.x), p.y - (i ? pts[i - 1]!.y : from.y)), 0) : Infinity);
  /** An outdoor start point ~`len` px of walking from `dest`, on a nearly straight path, outside `avoid`. */
  /** A straight corridor (body box + 4 px either side) from a to b. */
  const corridor = (a: Pt, b: Pt) => {
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const nx = (-(b.y - a.y) / d) * 4;
    const ny = ((b.x - a.x) / d) * 4;
    return [0, 1, -1].every((k) => segmentSafe(L, a.x + nx * k, a.y + ny * k, b.x + nx * k, b.y + ny * k));
  };
  const approach = (dest: Pt, len: number, avoid?: { cx: number; cy: number; r: number }): Pt => {
    // Best: a straight walk along one of the 8 key directions (no corners, no zigzag).
    for (const f of [1, 0.9, 1.1, 0.8, 0.7, 1.2])
      for (let a = 0; a < 360; a += 45) {
        const c = { x: dest.x - Math.cos((a * Math.PI) / 180) * len * f, y: dest.y - Math.sin((a * Math.PI) / 180) * len * f };
        if (!free(c.x, c.y) || (avoid && Math.hypot(c.x - avoid.cx, c.y - avoid.cy) < avoid.r)) continue;
        if (corridor(c, dest)) return c;
      }
    let best: { p: Pt; score: number } | null = null;
    for (let a = 0; a < 360; a += 10) {
      for (const f of [0.85, 0.95, 1.05]) {
        const c = nearFree({ x: dest.x + Math.cos((a * Math.PI) / 180) * len * f, y: dest.y + Math.sin((a * Math.PI) / 180) * len * f }, 24);
        if (!c) continue;
        if (avoid && Math.hypot(c.x - avoid.cx, c.y - avoid.cy) < avoid.r) continue;
        const pts = g.findPath(L, c, dest, 'outdoors');
        const l = pathLen(pts, c);
        if (!Number.isFinite(l)) continue;
        const straight = l / Math.max(1, Math.hypot(dest.x - c.x, dest.y - c.y));
        const score = Math.abs(l - len) + 300 * (straight - 1);
        if (!best || score < best.score) best = { p: c, score };
      }
    }
    if (!best) throw new Error(`no approach to ${dest.x},${dest.y}`);
    return best.p;
  };

  const sq = L.square;
  const tower = L.buildings.find((b) => b.kind === 'clocktower');
  const tavern = L.buildings.find((b) => b.kind === 'tavern') ?? L.buildings.find((b) => b.houseIndex === null && b.kind !== 'clocktower')!;
  const tileC = (t: Pt) => g.tileCenterPx(L, t);
  say(`town ${L.widthTiles}x${L.heightTiles}, square r=${sq.r} at ${sq.cx},${sq.cy}; tower ${tower?.id ?? '-'}; tavern ${tavern.id}`);

  // ---------------------------------------------------------------- cast
  const st = await signUpHiDpi(browser, 'Mira', ST_VP, ST_DPR);
  const A = await signUp(browser, 'Ada', { viewport: PLAYER_VP, villagerIndex: 3 });
  const B = await signUp(browser, 'Bram', { viewport: PLAYER_VP, villagerIndex: 6 });
  const renderer = await A.page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
  });
  say(`WebGL renderer: ${renderer}`);
  writeFileSync(path.join(RAW, 'renderer.txt'), renderer);
  if (/swiftshader|llvmpipe|software/i.test(renderer) && !process.env.CT_TUTORIAL_ALLOW_SOFTWARE)
    throw new Error(`software WebGL (${renderer}): footage would be ~1 fps. Run on hshi-u1 (RTX 3060) or set CT_TUTORIAL_ALLOW_SOFTWARE=1`);

  await st.page.getByRole('button', { name: /create lobby/i }).first().click();
  const dialog = st.page.getByRole('dialog', { name: 'Create lobby' });
  await dialog.getByLabel('Lobby name').fill('Ravenswood Bluff');
  await dialog.getByLabel(/storyteller seat/i).check();
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await st.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
  const lobbyId = new URL(st.page.url()).pathname.split('/').pop()!;
  for (const p of [A, B]) {
    await p.page.goto(`/lobby/${lobbyId}`);
    await p.page.getByRole('button', { name: "I'm ready" }).click({ timeout: 60_000 });
  }
  const wsUrl = base.replace(/^http/, 'ws');
  const BOT_NAMES = ['Cora', 'Dov', 'Esme', 'Finn', 'Gwen'];
  const bots: Bot[] = [];
  for (const [i, n] of BOT_NAMES.entries()) {
    const b = new Bot(n, base, wsUrl, { record: false, headers: { 'X-Forwarded-For': fakeClientIp() } });
    b.autoRespondEnabled = false;
    await b.signUp();
    await b.join(lobbyId);
    await b.waitFor('lobby:view', () => true, 10_000).catch(() => undefined);
    const preset = g.presets[(i * 2 + 1) % g.presets.length]?.id ?? null;
    if (preset) b.send('lobby:cosmetics', { cosmetics: { skin: 'fair', hair: 'short', hairColor: 'brown', outfit: 'peasant', palette: 'forest', accessory: 'none', ghost: 'wisp', preset } });
    b.send('lobby:ready', { ready: true });
    bots.push(b);
  }
  const byName = (n: string) => bots.find((b) => b.name === n)!;
  await st.tap.until(() => lv(st)?.canStart, 30_000, 'canStart');
  await st.page.getByRole('button', { name: 'Start game' }).click();
  await st.tap.until(() => gv(st)?.kind === 'storyteller', 30_000, 'game started');
  for (const p of [A, B]) await p.tap.until(() => typeof seatOf(p) === 'number', 20_000, 'seat');
  for (const b of bots) await expect.poll(() => botSeat(b), { timeout: 20_000 }).toBeGreaterThanOrEqual(0);
  const seatA = seatOf(A);
  const seatB = seatOf(B);
  const cast = ['washerwoman', 'chef', 'monk', 'poisoner', 'imp'];
  const assignments = [
    { seat: seatA, character: 'fortune_teller' },
    { seat: seatB, character: 'empath' },
    ...bots.map((b, i) => ({ seat: botSeat(b), character: cast[i]! })),
  ];
  await inject(st.page, 'st:command', { type: 'assign_characters', assignments, demonBluffs: ['virgin', 'slayer', 'mayor'], redHerringSeat: botSeat(byName('Dov')) });
  await st.tap.until(() => gv(st)?.charactersAssigned, 15_000, 'characters assigned');
  const homeOf = (seat: number) => L.buildings.find((b) => b.houseIndex === seat)!;
  const cmd = (c: Record<string, unknown>) => inject(st.page, 'st:command', c);
  const teleport = async (seats: number[], p: Pt) => cmd({ type: 'teleport', who: seats, to: { kind: 'point', x: Math.round(p.x), y: Math.round(p.y) } });
  say(`seats: Ada ${seatA + 1}, Bram ${seatB + 1}, ${bots.map((b) => `${b.name} ${botSeat(b) + 1}`).join(', ')}`);

  const camA = new Cam('ada', A.page);
  const camB = new Cam('bram', B.page);
  const camST = new Cam('storyteller', st.page);
  const only = process.env.CT_TUTORIAL_SCENES?.split(',').filter(Boolean);
  const scene = async (name: string, fn: () => Promise<void>) => {
    if (only && !only.includes(name)) return say(`scene ${name}: skipped (CT_TUTORIAL_SCENES)`);
    const t0 = Date.now();
    try {
      await fn();
      say(`scene ${name}: ok (${Math.round((Date.now() - t0) / 1000)} s)`);
    } catch (e) {
      say(`scene ${name}: FAILED ${(e as Error).message.split('\n')[0]}`);
      await A.page.screenshot({ path: path.join(RAW, `fail-${name}-ada.png`) }).catch(() => undefined);
      await st.page.screenshot({ path: path.join(RAW, `fail-${name}-st.png`) }).catch(() => undefined);
    }
  };

  let wandering = false;
  try {
    // ============================================================ (d) bedtime -> walk home -> night
    await scene('night', async () => {
      const home = homeOf(seatA);
      const door = tileC(home.door);
      // Ada starts a few seconds' walk from her door (staged by the Storyteller before the bell).
      const startA = approach(door, 330);
      await teleport([seatA], startA);
      // two neighbours are out too, so the bell sends a few people hurrying home
      const nb = ['Cora', 'Dov'].map(byName);
      for (const [k, b] of nb.entries()) {
        const p = nearFree({ x: startA.x + (k ? -40 : 46), y: startA.y + (k ? 30 : -26) }, 30);
        if (p) await teleport([botSeat(b)], p);
      }
      await sleep(2500);
      await camA.start();
      await sleep(600);
      const bellAt = now();
      await expect(st.page.locator('.cts-now-btn')).toContainText(/bell/i);
      await st.page.locator('.cts-now-btn').click();
      await A.tap.until(() => gv(A)?.phase === 'bedtime', 15_000, 'bedtime');
      await cmd({ type: 'bedtime_timer', action: 'pause' });
      // the bots head home too
      const botsHome = bots.map(async (b) => {
        const h = homeOf(botSeat(b));
        if (await botWalk(b, tileC(h.door))) await botDoor(b, h.id, `bld:${h.id}`);
      });
      await sleep(1200);
      const walkFrom = now();
      await kbWalk(A, door);
      await useDoor(A, `bld:${home.id}`);
      await sleep(1300);
      addSegment('night', 'ada', Math.max(bellAt + 0.4, walkFrom - 1.0), now());
      // the Storyteller shortens the countdown; Bram is walked home; night falls when all are in
      await cmd({ type: 'set_bedtime_seconds', seconds: 10 });
      await cmd({ type: 'bedtime_timer', action: 'restart' });
      await cmd({ type: 'bedtime_timer', action: 'resume' });
      await Promise.race([Promise.all(botsHome), sleep(60_000)]);
      await A.tap.until(() => gv(A)?.phase === 'first_night', 240_000, 'first night');
      const nightAt = now();
      await sleep(2600);
      addSegment('night', 'ada', nightAt - 0.6, now());
      await camA.stop();
    });

    // ============================================================ (e) night visit + (h) ST panel
    await scene('visit', async () => {
      if (gv(st)?.phase !== 'first_night') throw new Error(`phase ${gv(st)?.phase}`);
      await A.tap.until(() => gv(A)?.you?.role, 15_000, 'role');
      await sleep(1500);
      const queue = () => (gv(st).nightQueue ?? []) as { id: string; seat: number | null; status: string; prompt?: unknown }[];
      const step = queue().find((s) => s.seat === seatA);
      // the Stage controls fold away so the tab content (night order, seat circle, Grimoire) has room
      const fold = st.page.locator('.cts-stage-head .cts-icon[aria-expanded="true"]');
      if (await fold.count()) await fold.first().click();
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Night order' }).click();
      /** A 480x270 window over the panel that pans from its top down to `focus`. */
      const pan = async (focus: string | import('@playwright/test').Locator) => {
        const box = (await st.page.locator('.cts').first().boundingBox())!;
        const loc = typeof focus === 'string' ? st.page.locator(focus).first() : focus;
        const f = await loc.boundingBox().catch(() => null);
        const w = 480;
        const h = 270;
        const x = Math.max(0, box.x - 24);
        const y0 = Math.max(0, box.y - 6);
        const y1 = f ? Math.max(y0, Math.min(f.y + Math.min(f.height, h - 20) / 2 - h / 2, box.y + box.height - h + 6)) : y0;
        return { x: x * ST_DPR, y0: y0 * ST_DPR, y1: y1 * ST_DPR, w: w * ST_DPR, h: h * ST_DPR };
      };
      const row = () => st.page.locator('.cts-steps > li').nth(queue().findIndex((s) => s.id === step?.id));
      if (step) await row().scrollIntoViewIfNeeded().catch(() => undefined);
      await camA.start();
      await camST.start();
      await sleep(1200);
      const t0 = now();
      if (step) await row().getByRole('button', { name: 'Visit', exact: true }).click();
      else await cmd({ type: 'visit_home', seat: seatA });
      await A.tap.until(() => gv(A)?.storytellerVisitingYou === true, 15_000, 'visited');
      const visitedAt = now();
      await sleep(2600);
      if (step?.prompt) await row().getByRole('button', { name: /^(Re-)?[Pp]rompt$/ }).click();
      else
        await cmd({
          type: 'prompt_player',
          seat: seatA,
          prompt: { kind: 'choose_players', title: 'Fortune Teller: choose 2 players', body: 'Is one of them the Demon?', minTargets: 2, maxTargets: 2, allowSelf: true },
        });
      const pr = await A.tap.until(() => gv(A)?.prompts?.[0], 15_000, 'prompt');
      const card = A.page.getByRole('dialog', { name: pr.title });
      await expect(card).toBeVisible();
      await sleep(1400);
      const choices = card.locator('.cth-choices button');
      await choices.nth(1).click();
      await sleep(500);
      await choices.nth(3).click();
      await sleep(600);
      await card.getByRole('button', { name: 'Confirm' }).click();
      await sleep(1500);
      addSegment('visit', 'ada', visitedAt - 1.6, now());
      await camA.stop();
      // (h) the Storyteller's view of the same moment, then a short pan over the panel
      addSegment('storyteller', 'storyteller', t0 - 0.6, visitedAt + 2.4, await pan(step ? row() : '.cts-steps'));
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Stage' }).click();
      await sleep(250);
      const s1 = now();
      await sleep(2600);
      addSegment('storyteller', 'storyteller', s1, now(), await pan('.cts-circle'));
      await st.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
      await sleep(250);
      const s2 = now();
      await sleep(2600);
      addSegment('storyteller', 'storyteller', s2, now(), await pan('.cts-grim'));
      await camST.stop();
      // finish the night off camera
      await cmd({ type: 'leave_home' });
      for (const s of queue()) if (!['resolved', 'skipped'].includes(s.status)) await cmd({ type: 'skip_step', stepId: s.id });
      await sleep(800);
      await cmd({ type: 'advance_phase', to: 'dawn' });
      await st.tap.until(() => gv(st).phase === 'dawn', 15_000, 'dawn');
      await cmd({ type: 'advance_phase', to: 'day' });
      await A.tap.until(() => gv(A)?.phase === 'day', 15_000, 'day');
    });
    if (gv(st)?.phase !== 'day') {
      await cmd({ type: 'force_phase', to: 'day' });
      await A.tap.until(() => gv(A)?.phase === 'day', 15_000, 'day (forced)');
    }

    // ============================================================ (a) a town to wander
    const groupAt = nearFree({ x: sq.cx - sq.r * 0.42, y: sq.cy + sq.r * 0.32 }) ?? nearFree({ x: sq.cx, y: sq.cy + sq.r * 0.4 })!;
    const meetA = nearFree({ x: groupAt.x + 34, y: groupAt.y + 6 })!;
    const group = ['Cora', 'Dov', 'Esme'].map(byName);
    const ring = [
      { x: groupAt.x - 18, y: groupAt.y - 14 },
      { x: groupAt.x + 4, y: groupAt.y - 22 },
      { x: groupAt.x - 22, y: groupAt.y + 12 },
    ].map((p) => nearFree(p, 16) ?? groupAt);
    wandering = true;
    const wander = async (b: Bot, pts: Pt[]) => {
      for (let k = 0; wandering; k++) {
        await botWalk(b, pts[k % pts.length]!, 0.8);
        await sleep(600 + Math.random() * 1200);
      }
    };
    await scene('town', async () => {
      // everyone out of their homes, staged around the square (off camera)
      for (const [i, b] of group.entries()) await teleport([botSeat(b)], ring[i]!);
      const loopPts = [0, 1, 2, 3].map((k) => nearFree({ x: sq.cx + Math.cos(k * 1.7) * sq.r * 0.55, y: sq.cy + Math.sin(k * 1.7) * sq.r * 0.5 }) ?? { x: sq.cx, y: sq.cy + 30 });
      await teleport([botSeat(byName('Finn'))], loopPts[0]!);
      await teleport([botSeat(byName('Gwen'))], loopPts[2]!);
      const startA = approach(meetA, 470, { cx: sq.cx, cy: sq.cy, r: sq.r * 0.9 });
      const dl = Math.max(1, Math.hypot(meetA.x - startA.x, meetA.y - startA.y));
      const dir = { x: (meetA.x - startA.x) / dl, y: (meetA.y - startA.y) / dl };
      // Bram walks the same straight line a step behind Ada and stops just short of her
      const startB = { x: startA.x - dir.x * 24, y: startA.y - dir.y * 24 };
      const goalB = { x: meetA.x - dir.x * 22, y: meetA.y - dir.y * 22 };
      await teleport([seatA], startA);
      await teleport([seatB], free(startB.x, startB.y) ? startB : startA);
      await sleep(1500);
      for (const [i, b] of group.entries()) {
        syncBot(b);
        await botWalk(b, ring[i]!, 0.9, facingTo(ring[i]!, groupAt));
      }
      void wander(byName('Finn'), loopPts);
      void wander(byName('Gwen'), [loopPts[2]!, loopPts[3]!, loopPts[0]!, loopPts[1]!]);
      await sleep(3500); // teleport hints fade
      await camA.start();
      await sleep(400);
      const t0 = now();
      const walkB = (async () => {
        await sleep(350);
        await kbWalk(B, free(goalB.x, goalB.y) ? goalB : meetA, 12_000);
        await face(B, 'left');
      })();
      await kbWalk(A, meetA, 20_000);
      await face(A, 'left');
      await sleep(900);
      const t1 = now();
      addSegment('town', 'ada', Math.max(t0, t1 - 7.4), t1);
      await walkB;
    });

    // ============================================================ (b) the square hears everyone; a pair in the street
    await scene('talk', async () => {
      await A.page.locator('.ct-chat-toggle').click().catch(() => undefined);
      await A.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await sleep(1200);
      if (!camA.on) await camA.start();
      const t0 = now();
      const lines: [string, string][] = [
        ['Cora', 'I learned that one of Dov and Finn is the Chef.'],
        ['Dov', "That's me! And I got a 0: no evil pairs."],
        ['Esme', 'Bram has been very quiet this morning…'],
      ];
      await sleep(700);
      for (const [n, text] of lines) {
        byName(n).send('chat:send', { text });
        await sleep(1300);
      }
      await sleep(700);
      addSegment('talk', 'ada', t0, now());
      // a word in private: Ada and Bram step into a side street (cut)
      const street = approach(meetA, 300, { cx: sq.cx, cy: sq.cy, r: sq.r + 90 });
      await teleport([seatA], street);
      await teleport([seatB], { x: street.x + 22, y: street.y });
      await sleep(2200);
      await face(A, 'right');
      await sleep(900);
      const t1 = now();
      await sleep(400);
      byName('Cora').send('chat:send', { text: 'Where did Ada and Bram go?' }); // the square: Ada cannot hear it
      await inject(B.page, 'chat:send', { text: 'Psst, Ada. I think Cora is lying.' });
      await sleep(1600);
      await inject(A.page, 'chat:send', { text: 'Tavern. Now.' });
      await sleep(1600);
      addSegment('talk', 'ada', t1, now());
    });

    // ============================================================ (c) step inside for a private word
    await scene('inside', async () => {
      const door = tileC(tavern.door);
      const startA = approach(door, 230);
      await teleport([seatA], startA);
      const startB = nearFree({ x: (startA.x + door.x * 2) / 3, y: (startA.y + door.y * 2) / 3 }) ?? startA;
      await teleport([seatB], startB);
      await sleep(2500);
      if (!camA.on) await camA.start();
      const t0 = now();
      const inside = tileC(tavern.interiorDoor);
      const inLoc = `bld:${tavern.id}`;
      const room = (dx: number, dy: number) => nearFree({ x: inside.x + dx, y: inside.y + dy }, 14, inLoc);
      const spotB = [room(-26, -36), room(26, -36), room(0, -44)].find(Boolean) ?? inside;
      const spotA = [room(16, -18), room(-16, -18), room(0, -22)].find((p) => p && Math.hypot(p.x - spotB.x, p.y - spotB.y) > 14) ?? inside;
      say(`tavern: Bram -> ${Math.round(spotB.x)},${Math.round(spotB.y)}, Ada -> ${Math.round(spotA.x)},${Math.round(spotA.y)} (door ${Math.round(inside.x)},${Math.round(inside.y)})`);
      const inB = (async () => {
        await kbWalk(B, door);
        await useDoor(B, `bld:${tavern.id}`);
        await sleep(300);
        await kbWalk(B, spotB, 6_000);
        await face(B, spotA.x > spotB.x ? 'right' : 'left');
      })();
      await sleep(600);
      await kbWalk(A, door);
      await inB;
      await sleep(900); // the door tag shows who is inside
      await useDoor(A, `bld:${tavern.id}`);
      await sleep(250);
      await kbWalk(A, spotA, 6_000);
      await face(A, spotB.x > spotA.x ? 'right' : 'left');
      await sleep(400);
      await inject(B.page, 'chat:send', { text: 'In here, nobody outside can hear us.' });
      await sleep(2000);
      addSegment('inside', 'ada', Math.max(t0, now() - 8.5), now());
    });

    // ============================================================ (f) gather, nominate, vote + (g) ghost
    await scene('vote', async () => {
      wandering = false;
      await cmd({ type: 'set_setting', settings: { voteSeconds: 1.2 } });
      await cmd({ type: 'gather', on: true });
      await sleep(800);
      await cmd({ type: 'teleport', who: 'all', to: { kind: 'seat' } });
      await cmd({ type: 'set_nominations_open', open: true });
      await A.page.locator('.ct-chat-min').click().catch(() => undefined);
      await sleep(3500);
      if (!camA.on) await camA.start();
      await camB.start();
      const t0 = now();
      byName('Cora').send('game:nominate', { nomineeSeat: seatB });
      const nom = await A.tap.until(() => gv(A)?.day?.nominations?.[0], 10_000, 'nomination');
      await sleep(1300);
      await A.page.getByRole('button', { name: /^Raise hand/ }).first().click({ timeout: 10_000 });
      for (const n of ['Cora', 'Dov', 'Esme']) byName(n).send('game:vote', { nominationId: nom.id, vote: true });
      await sleep(1300);
      addSegment('vote', 'ada', t0 - 0.3, now());
      await cmd({ type: 'start_vote', nominationId: nom.id });
      await A.page.getByText(/your vote counted/i).first().waitFor({ timeout: 30_000 });
      const counted = now();
      await st.tap.until(() => gv(st).day?.nominations?.[0]?.status === 'tallied', 30_000, 'tallied');
      await sleep(1200);
      addSegment('vote', 'ada', Math.max(counted - 3.0, t0 + 3), now());
      await camA.stop();
      // (g) Bram is executed: a ghost who still talks and keeps one ghost vote
      const ex = now();
      await cmd({ type: 'execute', seat: seatB });
      await B.tap.until(() => gv(B)?.you?.alive === false, 15_000, 'Bram dead');
      await sleep(3200);
      addSegment('vote', 'bram', ex - 0.3, now());
      await cmd({ type: 'set_nominations_open', open: true });
      byName('Dov').send('game:nominate', { nomineeSeat: botSeat(byName('Gwen')) });
      let nom2 = await B.tap.until(() => gv(B)?.day?.nominations?.[1], 3_000, 'nomination 2').catch(() => null);
      if (!nom2) {
        say(`Dov's nomination was refused (${JSON.stringify(byName('Dov').latest['error'] ?? null)}); the Storyteller records it`);
        await cmd({ type: 'create_nomination', nominatorSeat: botSeat(byName('Dov')), nomineeSeat: botSeat(byName('Gwen')) });
        nom2 = await B.tap.until(() => gv(B)?.day?.nominations?.[1], 10_000, 'nomination 2 (ST)');
      }
      await sleep(1000);
      const r0 = now();
      await B.page.getByRole('button', { name: /Raise hand/ }).first().click({ timeout: 10_000 });
      await cmd({ type: 'start_vote', nominationId: nom2.id });
      await B.page.getByText(/your vote counted/i).first().waitFor({ timeout: 30_000 });
      await sleep(1600);
      addSegment('ghost', 'bram', r0 - 0.8, now());
      await camB.stop();
    });
  } finally {
    wandering = false;
    for (const c of [camA, camB, camST]) await c.stop().catch(() => undefined);
    writeFileSync(path.join(RAW, 'clips.json'), JSON.stringify({ renderer, clips }, null, 2));
    for (const b of bots) await b.leave().catch(() => undefined);
    for (const p of [st, A, B]) await p.ctx.close().catch(() => undefined);
  }
}

/** helpers.signUp with a device pixel ratio (the Storyteller camera records at 2x). */
async function signUpHiDpi(browser: import('@playwright/test').Browser, name: string, viewport: { width: number; height: number }, dpr: number): Promise<GamePlayer> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, extraHTTPHeaders: { 'X-Forwarded-For': fakeClientIp() } });
  await installSocketTap(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => void d.accept());
  const tap = new FrameTap(name, page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Your passphrase')).toBeVisible();
  await page.getByLabel('I have saved my passphrase somewhere safe').check();
  await page.getByRole('button', { name: 'Enter the town' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
  return { name, ctx, page, tap, villager: null, presetId: null, console: [] };
}

// ------------------------------------------------------------------------------------ encoding

function findFfmpeg(): string {
  const cands = [process.env.CT_FFMPEG, 'ffmpeg', path.join(os.homedir(), 'clocktower/audio-scratch/tools/node_modules/@ffmpeg-installer/linux-x64/ffmpeg')].filter(Boolean) as string[];
  for (const c of cands) if (spawnSync(c, ['-version'], { stdio: 'ignore' }).status === 0) return c;
  throw new Error('ffmpeg not found: set CT_FFMPEG (see docs/tutorial.md)');
}

function ff(bin: string, args: string[]) {
  const r = spawnSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ').slice(0, 200)}…\n${r.stderr.slice(-1500)}`);
}

interface ClipResult {
  webm: string;
  mp4: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
  bytes: { webm: number; mp4: number; poster: number };
  captureFps: number;
}

/** Which raw clips make each tour clip (the vote card ends on the ghost). */
const OUTPUT: Record<string, string[]> = {
  town: ['town'],
  talk: ['talk'],
  inside: ['inside'],
  night: ['night'],
  visit: ['visit'],
  vote: ['vote'],
  storyteller: ['storyteller'],
};
/** Cap per tour clip (seconds) after trimming. */
const MAX_LEN = 8.5;
const MAX_LEN_BY_CLIP: Record<string, number> = { night: 9.5 };

function encodeAll(): Record<string, ClipResult> {
  const bin = findFfmpeg();
  const hasWebp = execFileSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' }).includes('libwebp');
  const work = path.join(RAW, 'work');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const frames: Record<string, { t: number; file: string }[]> = {};
  for (const cam of ['ada', 'bram', 'storyteller']) {
    const f = path.join(RAW, cam, 'frames.json');
    if (existsSync(f)) frames[cam] = JSON.parse(readFileSync(f, 'utf8'));
  }
  const results: Record<string, ClipResult> = {};
  for (const [id, parts] of Object.entries(OUTPUT)) {
    let segs = parts.flatMap((p) => clips[p] ?? []).filter((s) => frames[s.cam]?.length && s.to - s.from > 0.8);
    if (!segs.length) {
      say(`encode ${id}: no footage, skipped`);
      continue;
    }
    // trim to MAX_LEN: shorten the longest segments from their start
    let total = segs.reduce((a, s) => a + (s.to - s.from), 0);
    const maxLen = MAX_LEN_BY_CLIP[id] ?? MAX_LEN;
    while (total > maxLen + 0.01) {
      const longest = segs.reduce((m, s) => (s.to - s.from > m.to - m.from ? s : m));
      const cut = Math.min(total - maxLen, longest.to - longest.from - 1.5);
      if (cut <= 0.01) break;
      longest.from += cut;
      total -= cut;
    }
    segs = segs.map((s) => ({ ...s }));
    try {
      const segFiles: string[] = [];
      let rawFrames = 0;
      for (const [k, s] of segs.entries()) {
        const all = frames[s.cam]!;
        let i0 = all.findIndex((f) => f.t >= s.from);
        if (i0 < 0) continue;
        if (i0 > 0) i0--;
        const pick = all.slice(i0).filter((f) => f.t < s.to);
        if (pick.length < 2) continue;
        rawFrames += pick.length;
        const lines = ['ffconcat version 1.0'];
        for (let j = 0; j < pick.length; j++) {
          const a = Math.max(pick[j]!.t, s.from);
          const b = j + 1 < pick.length ? Math.max(pick[j + 1]!.t, s.from) : s.to;
          if (b - a <= 0) continue;
          lines.push(`file '${pick[j]!.file}'`, `duration ${(b - a).toFixed(4)}`);
        }
        lines.push(`file '${pick.at(-1)!.file}'`);
        const list = path.join(work, `${id}-${k}.txt`);
        writeFileSync(list, lines.join('\n'));
        const dur = s.to - s.from;
        const fd = 0.22;
        const out = path.join(work, `${id}-${k}.mp4`);
        ff(bin, [
          '-f', 'concat', '-safe', '0', '-i', list,
          '-vf', `fps=${FPS},${cropFilter(s, dur)}scale=${OUT_W}:${OUT_H}:flags=${s.crop ? 'neighbor' : 'lanczos'},fade=t=in:st=0:d=${fd},fade=t=out:st=${(dur - fd).toFixed(3)}:d=${fd},format=yuv420p`,
          '-t', dur.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '8', '-an', out,
        ]);
        segFiles.push(out);
      }
      if (!segFiles.length) throw new Error('no frames in range');
      const joinList = path.join(work, `${id}-join.txt`);
      writeFileSync(joinList, ['ffconcat version 1.0', ...segFiles.map((f) => `file '${f}'`)].join('\n'));
      const joined = path.join(work, `${id}.mp4`);
      ff(bin, ['-f', 'concat', '-safe', '0', '-i', joinList, '-c', 'copy', joined]);
      const duration = segs.reduce((a, s) => a + (s.to - s.from), 0);
      // VP9 WebM, size-capped
      const webm = path.join(OUT, `${id}.webm`);
      for (const crf of [34, 38, 42, 46, 50, 54]) {
        ff(bin, ['-i', joined, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-tile-columns', '1', '-g', '240', '-auto-alt-ref', '1', '-lag-in-frames', '25', '-pix_fmt', 'yuv420p', '-an', webm]);
        if (statSync(webm).size <= WEBM_MAX) break;
      }
      // H.264 MP4 (Safari), size-capped
      const mp4 = path.join(OUT, `${id}.mp4`);
      for (const crf of [25, 28, 31, 34, 37]) {
        ff(bin, ['-i', joined, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', String(crf), '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
        if (statSync(mp4).size <= MP4_MAX) break;
      }
      // poster: a frame ~40% in (first segment middle)
      const posterExt = hasWebp ? 'webp' : 'jpg';
      for (const old of ['webp', 'jpg']) rmSync(path.join(OUT, `${id}.${old}`), { force: true });
      const poster = path.join(OUT, `${id}.${posterExt}`);
      const at = Math.min(duration * 0.4, Math.max(0.5, (segs[0]!.to - segs[0]!.from) / 2));
      ff(bin, ['-ss', at.toFixed(2), '-i', joined, '-frames:v', '1', ...(hasWebp ? ['-c:v', 'libwebp', '-quality', '72'] : ['-q:v', '6']), poster]);
      // verification frames (not shipped): beginning, middle, end
      const vdir = path.join(RAW, 'verify');
      mkdirSync(vdir, { recursive: true });
      for (const [n, t] of [[1, 0.6], [2, duration / 2], [3, duration - 0.6]] as const)
        ff(bin, ['-ss', t.toFixed(2), '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(vdir, `${id}-${n}.jpg`)]);
      const res: ClipResult = {
        webm: `${id}.webm`,
        mp4: `${id}.mp4`,
        poster: `${id}.${posterExt}`,
        width: OUT_W,
        height: OUT_H,
        duration: Math.round(duration * 10) / 10,
        bytes: { webm: statSync(webm).size, mp4: statSync(mp4).size, poster: statSync(poster).size },
        captureFps: Math.round((rawFrames / duration) * 10) / 10,
      };
      results[id] = res;
      say(`encode ${id}: ${res.duration} s, captured at ${res.captureFps} fps; webm ${kb(res.bytes.webm)}, mp4 ${kb(res.bytes.mp4)}, poster ${kb(res.bytes.poster)}`);
    } catch (e) {
      say(`encode ${id}: FAILED ${(e as Error).message.split('\n').slice(0, 3).join(' | ')}`);
    }
  }
  // drop stale files from clips that were not produced this time
  const keep = new Set(Object.values(results).flatMap((r) => [r.webm, r.mp4, r.poster]).concat('manifest.json'));
  for (const f of readdirSync(OUT)) if (!keep.has(f)) rmSync(path.join(OUT, f), { force: true });
  const renderer = existsSync(path.join(RAW, 'renderer.txt')) ? readFileSync(path.join(RAW, 'renderer.txt'), 'utf8') : 'unknown';
  const total = Object.values(results).reduce((a, r) => a + r.bytes.webm + r.bytes.mp4 + r.bytes.poster, 0);
  const manifest = { version: 1, generatedAt: new Date().toISOString(), renderer, fps: FPS, totalBytes: total, clips: results };
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  say(`manifest: ${Object.keys(results).length} clips, ${kb(total)} total (webm + mp4 + posters)`);
  return results;
}

/** A slow eased vertical pan of a fixed window (the Storyteller panel tour). */
function cropFilter(s: Segment, dur: number): string {
  const c = s.crop;
  if (!c) return '';
  const r = (n: number) => Math.max(0, Math.round(n / 2) * 2);
  const p = `min(1,max(0,(t-0.5)/${Math.max(0.5, dur - 1.2).toFixed(2)}))`;
  return `crop=${r(c.w)}:${r(c.h)}:${r(c.x)}:'${r(c.y0)}+(${r(c.y1) - r(c.y0)})*(1-cos(PI*${p}))/2',`;
}

const kb = (n: number) => `${Math.round(n / 1024)} KB`;
