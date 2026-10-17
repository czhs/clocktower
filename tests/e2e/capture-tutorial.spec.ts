// Tour footage capture (tutorial teammate). Plays one scripted v2 game against a private test server
// and records short clips of REAL gameplay for the pre-sign-in tour (apps/client/src/ui/intro).
//
//   CT_AGENT=tutorial scripts/remote.sh pnpm capture:tutorial
//   CT_AGENT=tutorial scripts/pull.sh apps/client/public/tutorial
//
// Cast: the Storyteller and two players ("Ada", "Bram") are real browsers (3 contexts, GPU WebGL);
// seven more villagers are protocol bots (tests/support/bot.ts) that the Storyteller's own stage
// command walks around (walk_to: server-driven walking at normal speed, in and out of doors), and that
// nominate and raise hands. Ada and Bram play with the real client: Ada walks with the keyboard, taps
// cottages to go in, presses Leave, right-clicks to point, F to pin, N for her notebook, answers the
// Storyteller's prompt; the Storyteller rings the bell from the stage-script panel, clicks the map to
// teleport and "Go" to visit. Every frame is the real client rendering real server state; the script
// only stages WHERE things start (Storyteller teleports between scenes, which are cut out).
//
// Recording: CDP screencast (JPEG frames + timestamps) per camera page, written under
// test-results/tutorial-raw/. Encoding (ffmpeg): each clip = 1-3 timed segments with short fades ->
// VP9 WebM + H.264 MP4 (muted, size-capped) + a poster, plus manifest.json in
// apps/client/public/tutorial/. CT_TUTORIAL_ENCODE_ONLY=1 re-encodes the last raw capture without
// replaying the game. ffmpeg: $CT_FFMPEG, else `ffmpeg` on PATH, else the static npm build in
// ~/clocktower/audio-scratch (docs/audio.md).
//
// The script is layout-driven (positions come from townLayout / PLAZA: the square, the homes), so the
// same command re-records the footage after art or layout changes.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { canvasBox, geo, inject, leaveByButton, outdoorCamera, selfEntity, signUp, tapCottage, type GamePlayer } from './helpers';
import { Bot } from '../support/bot.js';
import { fakeClientIp } from '../support/ip.js';

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
/** The Storyteller: 16:9 but larger, so the stage-script panel leaves most of the town visible; the
 * clip is scaled down to 960x540. */
const ST_VP = { width: 1280, height: 720 };

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
/** Absolute capture time (s) of the poster frame per clip (optional; else ~40% into the first segment). */
const posters: Record<string, number> = {};
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
const locOf = (p: GamePlayer): string | undefined => selfEntity(p, pidOf(p))?.location;

/** First-visit hints, the tour and the How to play dialog stay closed in the footage; the camera test hook is on. */
const QUIET = () => {
  try {
    for (const k of ['ct.intro.seen.v1', 'ct.intro.seen', 'ct.hint.move.v1', 'ct.hint.social.v1', 'ct.help.seen.v1', 'ct.debug.camera']) localStorage.setItem(k, '1');
  } catch {
    /* storage blocked */
  }
};

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
 * Outdoors only (v2: a movement key inside a cottage walks you out).
 */
async function kbWalk(p: GamePlayer, goal: Pt, budgetMs = 30_000, tol = 7): Promise<boolean> {
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
      await sleep(15);
      const c = posOf(p);
      if (!c) continue;
      if (c.location !== start.location) break; // walked through a door by accident
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
      if (d <= (final ? tol : 10) || (!final && u >= 1)) {
        prev = wp;
        i++;
        continue;
      }
      if (final && u >= 1.05 && d <= tol * 2) break;
      if (Date.now() - lastMoveAt > 1200 && replans < 8) {
        replans++;
        await set([]);
        const re = g.findPath(g.L, c, goal, c.location as never);
        if (re?.length) ((pts = re), (i = 0), (prev = c));
        lastMoveAt = Date.now();
        continue;
      }
      // short look-ahead: any cross-track error of a couple of px turns into a diagonal back onto the line
      const look = final && d < 24 ? 1 : Math.min(1, Math.max(0, u) + 10 / segLen);
      const tx = prev.x + sx * look;
      const ty = prev.y + sy * look;
      const ang = Math.atan2(ty - c.y, tx - c.x);
      let oct = (((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8) as number;
      // pinned on a corner for a moment: slide along it (the next diagonal either way)
      const pinned = Date.now() - lastMoveAt;
      if (pinned > 250) oct = (oct + (Math.floor(pinned / 250) % 2 ? 1 : 7)) % 8;
      await set(OCT[oct]!);
    }
  } finally {
    await set([]);
  }
  const end = posOf(p);
  const ok = !!end && Math.hypot(end.x - goal.x, end.y - goal.y) < 20;
  if (!ok) {
    say(
      `${p.name}: walk to ${Math.round(goal.x)},${Math.round(goal.y)} ended at ${Math.round(end?.x ?? -1)},${Math.round(end?.y ?? -1)} ${end?.location} ` +
        `(from ${Math.round(start.x)},${Math.round(start.y)} ${start.location}; waypoint ${i}/${pts.length}; replans ${replans}; phase ${gv(p)?.phase})`,
    );
    await p.page.screenshot({ path: path.join(RAW, `walk-${p.name}-${Date.now()}.png`) }).catch(() => undefined);
  }
  return ok;
}

/** Turn in place outdoors (a bare tap is a one-frame step; that is fine). */
async function face(p: GamePlayer, dir: keyof typeof KEYS) {
  if (locOf(p) !== 'outdoors') return;
  await p.page.keyboard.down(KEYS[dir]);
  await sleep(30);
  await p.page.keyboard.up(KEYS[dir]);
}
const faceToward = (a: Pt, b: Pt): keyof typeof KEYS => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
};

/** Page coordinates of a world point on this browser's screen (the client's opt-in camera hook,
 * localStorage ct.debug.camera; fallback: helpers.outdoorCamera), and whether the canvas gets a click there. */
async function screenOf(p: GamePlayer, w: Pt): Promise<Pt & { ok: boolean }> {
  let pt = await p.page.evaluate(([x, y]) => (window as unknown as { __ctCamera?: { worldToScreen(x: number, y: number): { x: number; y: number } } }).__ctCamera?.worldToScreen(x!, y!) ?? null, [w.x, w.y]);
  if (!pt) {
    const box = await canvasBox(p.page);
    const me = selfEntity(p, pidOf(p));
    if (!me) throw new Error(`${p.name}: no own entity`);
    const cam = await outdoorCamera(box, me);
    pt = { x: box.x + (w.x - cam.cx) * cam.zoom + box.w / 2, y: box.y + (w.y - cam.cy) * cam.zoom + box.h / 2 };
  }
  const ok = await p.page.evaluate(([sx, sy]) => {
    const el = document.elementFromPoint(sx!, sy!);
    return !!el && el.tagName === 'CANVAS' && !!el.closest('.ct-game-canvas');
  }, [pt.x, pt.y]);
  return { ...pt, ok };
}

/** A 1.5x close-up (640x360 window of the 960x540 frame) centred on these world points. */
async function zoomOn(p: GamePlayer, pts: Pt[]): Promise<Segment['crop']> {
  const c = { x: pts.reduce((a, q) => a + q.x, 0) / pts.length, y: pts.reduce((a, q) => a + q.y, 0) / pts.length };
  const s = await screenOf(p, c);
  const w = 640;
  const h = 360;
  const x = Math.max(0, Math.min(OUT_W - w, s.x - w / 2));
  const y = Math.max(0, Math.min(OUT_H - h, s.y - h / 2));
  return { x, y0: y, y1: y, w, h };
}

// ------------------------------------------------------------------------------------ the script

test('record the pre-sign-in tour footage', async ({ browser, baseURL }) => {
  test.setTimeout(1_800_000);
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  if (!ENCODE_ONLY) await play(browser, baseURL!);
  else {
    const saved = JSON.parse(readFileSync(path.join(RAW, 'clips.json'), 'utf8')) as { clips: Record<string, Segment[]>; posters?: Record<string, number> };
    Object.assign(clips, saved.clips);
    Object.assign(posters, saved.posters ?? {});
  }
  const results = encodeAll();
  writeFileSync(path.join(RAW, 'capture-log.txt'), log.join('\n'));
  expect(Object.keys(results).length, 'clips encoded').toBeGreaterThanOrEqual(6);
});

async function play(browser: import('@playwright/test').Browser, base: string) {
  const g = await geo();
  const L = g.L;
  const P = g.PLAZA;
  const free = (x: number, y: number, loc = 'outdoors') => !g.isBlockedPx(L, x, y) && g.locationAt(L, x, y) === loc;
  const nearFree = (p: Pt, r = 40, loc = 'outdoors'): Pt | null => {
    for (let rad = 0; rad <= r; rad += 3)
      for (let a = 0; a < 360; a += rad ? 20 : 360) {
        const x = p.x + Math.cos((a * Math.PI) / 180) * rad;
        const y = p.y + Math.sin((a * Math.PI) / 180) * rad;
        // the body box is ~12 px wide: keep a little room around the feet
        if (free(x, y, loc) && free(x - 7, y, loc) && free(x + 7, y, loc) && free(x, y - 6, loc)) return { x: Math.round(x), y: Math.round(y) };
      }
    return null;
  };
  /** A point on the square: angle (rad, 0 = right, y down) and fraction of the radius. */
  const onSquare = (ang: number, f: number): Pt => nearFree({ x: P.cx + Math.cos(ang) * P.rx * f, y: P.cy + Math.sin(ang) * P.ry * f }) ?? { x: P.cx, y: P.cy + 20 };
  const tileC = (t: Pt) => g.tileCenterPx(L, t);
  const homeOf = (seat: number) => L.buildings.find((b) => b.houseIndex === seat)!;
  say(`town ${L.widthTiles}x${L.heightTiles}, plaza r=${P.rx} at ${P.cx},${P.cy}; ${L.buildings.length} buildings`);

  // ---------------------------------------------------------------- cast
  const st = await signUp(browser, 'Mira', { viewport: ST_VP, characterIndex: 20 });
  const A = await signUp(browser, 'Ada', { viewport: PLAYER_VP, characterIndex: 2 });
  const B = await signUp(browser, 'Bram', { viewport: PLAYER_VP, characterIndex: 3 });
  for (const p of [st, A, B]) {
    await p.ctx.addInitScript(QUIET);
    await p.page.evaluate(QUIET);
  }
  say(`Ada is ${A.character}, Bram is ${B.character}`);
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

  const lr = await st.page.request.post('/api/lobbies', { data: { name: 'Ravenswood Bluff', maxPlayers: 15, takeStoryteller: true } });
  expect(lr.status(), await lr.text()).toBeLessThan(300);
  const lobbyId = ((await lr.json()) as { lobby: { id: string } }).lobby.id;
  await st.page.goto(`/lobby/${lobbyId}`);
  for (const p of [A, B]) {
    await p.page.goto(`/lobby/${lobbyId}`);
    await expect(p.page.getByRole('button', { name: "I'm ready" })).toBeEnabled({ timeout: 60_000 });
    await p.page.getByRole('button', { name: "I'm ready" }).click();
  }
  const wsUrl = base.replace(/^http/, 'ws');
  const BOT_NAMES = ['Cora', 'Dov', 'Esme', 'Finn', 'Gwen', 'Hugo', 'Iris'];
  const LOOKS = ['rabbit', 'frog', 'moth', 'polly', 'goat', 'clarabelle', 'mushroom', 'mole', 'requin', 'theo-rem', 'snail'];
  const playable = new Set(g.playable.map((c) => c.id));
  const looks = LOOKS.filter((id) => playable.has(id) && id !== A.character && id !== B.character);
  const bots: Bot[] = [];
  for (const [i, n] of BOT_NAMES.entries()) {
    const b = new Bot(n, base, wsUrl, { record: false, headers: { 'X-Forwarded-For': fakeClientIp() } });
    b.autoRespondEnabled = false;
    await b.signUp();
    await b.join(lobbyId);
    await b.waitFor('lobby:view', () => true, 10_000).catch(() => undefined);
    const preset = looks[i % looks.length] ?? null;
    b.send('lobby:cosmetics', { cosmetics: { skin: 'fair', hair: 'short', hairColor: 'brown', outfit: 'peasant', palette: 'forest', accessory: 'none', ghost: 'wisp', preset } });
    b.send('lobby:ready', { ready: true });
    bots.push(b);
  }
  const byName = (n: string) => bots.find((b) => b.name === n)!;
  await expect(st.page.getByRole('button', { name: 'Start game' })).toBeEnabled({ timeout: 30_000 });
  await st.page.getByRole('button', { name: 'Start game' }).click();
  await st.tap.until(() => gv(st)?.kind === 'storyteller', 30_000, 'game started');
  for (const p of [A, B]) await p.tap.until(() => typeof seatOf(p) === 'number', 20_000, 'seat');
  for (const b of bots) await expect.poll(() => botSeat(b), { timeout: 20_000 }).toBeGreaterThanOrEqual(0);
  const seatA = seatOf(A);
  const seatB = seatOf(B);
  const pidA = pidOf(A);
  const pidB = pidOf(B);
  const pidST = pidOf(st);
  const cast = ['washerwoman', 'chef', 'monk', 'butler', 'saint', 'poisoner', 'imp'];
  const assignments = [
    { seat: seatA, character: 'fortune_teller' },
    { seat: seatB, character: 'empath' },
    ...bots.map((b, i) => ({ seat: botSeat(b), character: cast[i]! })),
  ];
  await inject(st.page, 'st:command', { type: 'assign_characters', assignments, demonBluffs: ['virgin', 'slayer', 'mayor'], redHerringSeat: botSeat(byName('Dov')) });
  await st.tap.until(() => gv(st)?.charactersAssigned, 15_000, 'characters assigned');
  const cmd = (c: Record<string, unknown>) => inject(st.page, 'st:command', c);
  const teleport = async (seats: number[], p: Pt) => cmd({ type: 'teleport', who: seats, to: { kind: 'point', x: Math.round(p.x), y: Math.round(p.y) } });
  const walkTo = async (seats: number[], to: Record<string, unknown>) => cmd({ type: 'walk_to', who: seats, to });
  const walkBot = (b: Bot, p: Pt) => walkTo([botSeat(b)], { kind: 'point', x: Math.round(p.x), y: Math.round(p.y) });
  const stTo = async (p: Pt) => cmd({ type: 'teleport_self', to: { kind: 'point', x: Math.round(p.x), y: Math.round(p.y) } });
  const homeA = homeOf(seatA);
  const homeB = homeOf(seatB);
  say(`seats: Ada ${seatA + 1} (${homeA.name}), Bram ${seatB + 1} (${homeB.name}), ${bots.map((b) => `${b.name} ${botSeat(b) + 1}`).join(', ')}`);

  const camA = new Cam('ada', A.page);
  const camB = new Cam('bram', B.page);
  const camST = new Cam('storyteller', st.page);
  const stopCams = async () => {
    for (const c of [camA, camB, camST]) await c.stop().catch(() => undefined);
  };
  const only = process.env.CT_TUTORIAL_SCENES?.split(',').filter(Boolean);
  const scene = async (name: string, fn: () => Promise<void>) => {
    if (only && !only.includes(name)) return say(`scene ${name}: skipped (CT_TUTORIAL_SCENES)`);
    const t0 = Date.now();
    try {
      await fn();
      say(`scene ${name}: ok (${Math.round((Date.now() - t0) / 1000)} s)`);
    } catch (e) {
      say(`scene ${name}: FAILED ${(e as Error).message.split('\n')[0]}`);
      await stopCams();
      await A.page.screenshot({ path: path.join(RAW, `fail-${name}-ada.png`) }).catch(() => undefined);
      await st.page.screenshot({ path: path.join(RAW, `fail-${name}-st.png`) }).catch(() => undefined);
    }
  };

  // Ada's side of the square: from the middle toward her own door.
  const doorA = tileC(homeA.door);
  const toA = Math.atan2(doorA.y - P.cy, doorA.x - P.cx);
  const tower = L.buildings.find((b) => b.kind === 'clocktower');
  /** Where the Storyteller waits by day: by the clock tower, out of the way. */
  const stSpot = nearFree(tower ? { x: tileC(tower.door).x + 34, y: tileC(tower.door).y + 14 } : { x: P.cx, y: P.cy - P.ry * 0.9 }, 40) ?? onSquare(-Math.PI / 2, 0.85);

  let wandering = false;
  try {
    // ============================================================ (night) the bell -> walk home -> night falls
    await scene('night', async () => {
      // Everyone is out on the square before the first night (staged off camera): Ada across the
      // square from her cottage, friends chatting in small groups.
      const startA = onSquare(toA + Math.PI, 0.3);
      await teleport([seatA], startA);
      await teleport([seatB], nearFree({ x: startA.x - 26, y: startA.y + 14 }, 20) ?? startA);
      for (const [i, b] of bots.entries()) await teleport([botSeat(b)], onSquare(toA + Math.PI / 2 + (i * Math.PI * 1.9) / bots.length, 0.42 + (i % 3) * 0.16));
      await stTo(stSpot);
      await sleep(3500); // teleport notices fade
      await camA.start();
      await sleep(1100);
      const bellAt = now();
      await st.page.locator('.cts-cue[data-cue="bedtime"]').click();
      await A.tap.until(() => gv(A)?.phase === 'bedtime', 15_000, 'bedtime');
      await cmd({ type: 'bedtime_timer', action: 'pause' });
      // everyone heads home at once (server-walked), Ada taps her own cottage; Iris dawdles, so
      // night cannot fall before the Storyteller's camera is rolling
      const late = byName('Iris');
      for (const b of bots) if (b !== late) await walkTo([botSeat(b)], { kind: 'home' });
      await walkTo([seatB], { kind: 'home' });
      await sleep(500);
      say(`Ada taps her cottage: ${(await tapCottage(A, pidA, homeA.id, { timeoutMs: 40_000 })).join(' | ')}`);
      await sleep(1700); // "You are home — safe for the night"
      addSegment('night', 'ada', bellAt - 0.4, now());
      await camA.stop();
      // the Storyteller watches night fall over the square (panel folded away)
      await st.page.getByRole('button', { name: 'Collapse the panel' }).click();
      await stTo(onSquare(Math.PI / 2, 0.2));
      await sleep(1500);
      await camST.start();
      await sleep(600);
      await walkTo([botSeat(late)], { kind: 'home' });
      await cmd({ type: 'bedtime_timer', action: 'resume' });
      const fell = await st.tap.until(() => gv(st)?.phase === 'first_night', 45_000, 'night falls (everyone home)').catch(() => null);
      if (!fell) {
        say('night did not fall by itself: the Storyteller forces it');
        await cmd({ type: 'force_phase', to: 'first_night' });
        await st.tap.until(() => gv(st)?.phase === 'first_night', 15_000, 'first night (forced)');
      }
      const nightAt = now();
      await sleep(3600);
      addSegment('night', 'storyteller', nightAt - 0.8, now());
      posters.night = nightAt + 2.5;
      await camST.stop();
      await st.page.locator('.cts-slim-open').click();
    });
    if (gv(st)?.phase !== 'first_night') {
      await cmd({ type: 'force_phase', to: 'first_night' });
      await st.tap.until(() => gv(st)?.phase === 'first_night', 15_000, 'first night (forced)');
    }

    // ============================================================ (visit + storyteller) the night visit
    await scene('visit', async () => {
      await A.tap.until(() => gv(A)?.you?.role, 15_000, 'role');
      await A.tap.until(() => locOf(A) === `bld:${homeA.id}`, 15_000, 'Ada at home');
      if (await st.page.locator('.cts-slim-open').count()) await st.page.locator('.cts-slim-open').click();
      await expect(st.page.locator('.cts-visits')).toBeVisible({ timeout: 15_000 });
      // Ada's own row (other rows may mention her, e.g. the Washerwoman's info)
      const row = st.page.locator('.cts-visits > li').filter({ has: st.page.locator('.cts-visit-name', { hasText: /^Ada$/ }) }).first();
      await expect(row).toBeVisible();
      await row.scrollIntoViewIfNeeded();
      await sleep(1200);
      await camST.start();
      await camA.start();
      await sleep(1200);
      // 1. the Storyteller clicks the map: poof, they are across the square
      const me = selfEntity(st, pidST)!;
      const want = [0.55, 0.4, 0.7].map((f) => nearFree({ x: P.cx + (doorA.x - P.cx) * f, y: P.cy + (doorA.y - P.cy) * f }, 24)).filter(Boolean) as Pt[];
      let clicked = false;
      const c0 = now();
      for (const w of want) {
        if (Math.hypot(w.x - me.x, w.y - me.y) < 40) continue;
        const s = await screenOf(st, w);
        if (!s.ok) continue;
        const since = Date.now();
        await st.page.mouse.click(s.x, s.y);
        await st.tap.until(() => st.tap.sent('st:command', since).some((c: { type: string }) => c.type === 'teleport_self'), 5_000, 'click-to-teleport').catch(() => undefined);
        clicked = true;
        break;
      }
      if (!clicked) say('storyteller: no clickable spot for the click-to-teleport shot');
      await sleep(1900);
      addSegment('storyteller', 'storyteller', c0 - 1.0, now());
      // 2. "Go" on Ada's visit: poof, inside her cottage
      const g0 = now();
      await row.locator('.cts-go').click();
      await A.tap.until(() => gv(A)?.storytellerVisitingYou === true || (selfEntity(A, pidST)?.location === `bld:${homeA.id}`), 15_000, 'visited');
      const visitedAt = now();
      await sleep(1500);
      const here = st.page.locator('.cts-visit.here').first();
      await here.getByRole('button', { name: /^Ask:/ }).click({ timeout: 10_000 });
      const pr = await A.tap.until(() => gv(A)?.prompts?.[0], 15_000, 'prompt');
      await sleep(600);
      addSegment('storyteller', 'storyteller', g0 - 0.8, now());
      posters.storyteller = visitedAt + 1.3;
      const card = A.page.getByRole('dialog', { name: pr.title });
      await expect(card).toBeVisible();
      await sleep(1300);
      const choices = card.locator('.cth-choices button');
      await choices.nth(1).click();
      await sleep(450);
      await choices.nth(4).click();
      await sleep(500);
      await card.getByRole('button', { name: 'Confirm' }).click();
      const answeredAt = now();
      await expect(here.locator('.cts-resp')).toBeVisible({ timeout: 10_000 });
      await sleep(700);
      const tell = here.locator('.cts-tell button[type=submit]');
      if (await tell.count()) await tell.click();
      await sleep(2000);
      addSegment('visit', 'ada', visitedAt - 1.3, now());
      posters.visit = visitedAt + 2.2;
      addSegment('storyteller', 'storyteller', answeredAt - 0.3, now() - 0.4);
      await camA.stop();
      await camST.stop();
      // finish the night off camera
      const done = here.locator('.cts-done');
      if (await done.count()) await done.click().catch(() => undefined);
      await cmd({ type: 'leave_home' });
      const queue = (gv(st).nightQueue ?? []) as { id: string; status: string }[];
      for (const s of queue) if (!['resolved', 'skipped'].includes(s.status)) await cmd({ type: 'skip_step', stepId: s.id });
      await sleep(800);
    });
    for (const to of ['dawn', 'day'] as const) {
      await cmd({ type: 'force_phase', to });
      await st.tap.until(() => gv(st)?.phase === to, 15_000, to);
      await sleep(600);
    }
    await A.tap.until(() => gv(A)?.phase === 'day', 15_000, 'day');
    await stTo(stSpot);
    await sleep(7000); // the dawn announcement fades

    // ============================================================ (town) morning: out of the cottages, onto the square
    const groupAt = onSquare(toA, 0.08);
    const perp = toA + Math.PI / 2;
    const ux = Math.cos(toA);
    const uy = Math.sin(toA);
    const groupSpots = [
      nearFree({ x: groupAt.x + Math.cos(perp) * 30, y: groupAt.y + Math.sin(perp) * 30 }, 16),
      nearFree({ x: groupAt.x - Math.cos(perp) * 30, y: groupAt.y - Math.sin(perp) * 30 }, 16),
      nearFree({ x: groupAt.x - ux * 30, y: groupAt.y - uy * 30 }, 16),
    ].map((p) => p ?? groupAt);
    const meetA = nearFree({ x: groupAt.x + ux * 36, y: groupAt.y + uy * 36 }, 20) ?? groupAt;
    const meetB = nearFree({ x: meetA.x + Math.cos(perp) * 28, y: meetA.y + Math.sin(perp) * 28 }, 20) ?? meetA;
    const group = ['Cora', 'Dov', 'Esme'].map(byName);
    const others = ['Finn', 'Gwen', 'Hugo', 'Iris'].map(byName);
    const roam = (k: number) => onSquare(toA + Math.PI + (k * 1.3) + Math.random() * 0.6, 0.35 + Math.random() * 0.45);
    const wander = async (b: Bot, k: number) => {
      for (let n = 0; wandering; n++) {
        await walkBot(b, roam(k + n));
        await sleep(3500 + Math.random() * 3000);
      }
    };
    await scene('town', async () => {
      if (locOf(A) !== `bld:${homeA.id}`) await cmd({ type: 'teleport', who: [seatA], to: { kind: 'home' } });
      await sleep(1500);
      await camA.start();
      await sleep(900);
      const t0 = now();
      // Ada steps out first; then the town wakes around her: everyone comes out of their cottage
      // and onto the square
      await leaveByButton(A, pidA);
      await sleep(300);
      for (const [i, b] of group.entries()) await walkBot(b, groupSpots[i]!);
      await walkTo([seatB], { kind: 'point', x: meetB.x, y: meetB.y });
      for (const [k, b] of others.entries()) await walkBot(b, roam(k * 2));
      await sleep(500);
      await kbWalk(A, meetA, 15_000);
      await face(A, faceToward(meetA, groupAt));
      await sleep(2200);
      addSegment('town', 'ada', t0, now());
      posters.town = now() - 0.6;
      wandering = true;
      void wander(byName('Finn'), 0);
      void wander(byName('Gwen'), 3);
      await camA.stop();
    });

    // ============================================================ (inside) tap a cottage: a private room for two
    await scene('inside', async () => {
      if (locOf(A) !== 'outdoors' || locOf(B) !== 'outdoors') throw new Error(`Ada ${locOf(A)}, Bram ${locOf(B)}`);
      await sleep(1200);
      await camA.start();
      await sleep(700);
      const t0 = now();
      // Bram taps his own cottage and walks in; Ada follows a moment later
      const inB = tapCottage(B, pidB, homeB.id, { timeoutMs: 40_000 });
      await sleep(1300);
      say(`Ada taps ${homeB.name}: ${(await tapCottage(A, pidA, homeB.id, { timeoutMs: 40_000 })).join(' | ')}`);
      await inB;
      const inAt = now();
      await expect(A.page.locator('.ct-inside')).toContainText(/only you two can hear each other/, { timeout: 10_000 });
      await sleep(2600);
      addSegment('inside', 'ada', Math.max(t0, inAt - 5.6), now());
      posters.inside = now() - 0.8;
      await camA.stop();
    });

    // ============================================================ (point) point at people, pin them
    await scene('point', async () => {
      // the group on the square (staged off camera): Ada, Bram, Dov and Esme near each other
      const c = onSquare(toA + Math.PI, 0.12);
      const spots = { A: c, B: nearFree({ x: c.x - 40, y: c.y + 22 }, 16)!, Dov: nearFree({ x: c.x + 64, y: c.y - 6 }, 16)!, Esme: nearFree({ x: c.x + 26, y: c.y - 58 }, 16)!, Cora: nearFree({ x: c.x - 22, y: c.y - 52 }, 16)! };
      await teleport([seatA], spots.A);
      await teleport([seatB], spots.B);
      for (const n of ['Dov', 'Esme', 'Cora'] as const) await teleport([botSeat(byName(n))], spots[n]);
      await sleep(3800);
      await face(A, 'right');
      await camA.start();
      await sleep(900);
      const t0 = now();
      const ent = (n: string) => (A.tap.last('world:snapshot')?.entities ?? []).find((e: { id: string }) => e.id === byName(n).pid) as Pt | undefined;
      // right-click Dov: Ada points at him
      const dov = ent('Dov') ?? spots.Dov;
      let s = await screenOf(A, { x: dov.x, y: dov.y - 14 });
      await A.page.mouse.click(s.x, s.y, { button: 'right' });
      await sleep(1700);
      // F over Esme: a pin with Ada's face
      const esme = ent('Esme') ?? spots.Esme;
      s = await screenOf(A, { x: esme.x, y: esme.y - 14 });
      await A.page.mouse.move(s.x, s.y);
      await A.page.keyboard.press('KeyF');
      await sleep(1100);
      // and one on Dov
      s = await screenOf(A, { x: dov.x, y: dov.y - 14 });
      await A.page.mouse.move(s.x, s.y);
      await A.page.keyboard.press('KeyF');
      await sleep(900);
      // Bram pins Esme as well: two pins, two faces
      const esmeB = (B.tap.last('world:snapshot')?.entities ?? []).find((e: { id: string }) => e.id === byName('Esme').pid) as Pt | undefined;
      const sb = await screenOf(B, { x: (esmeB ?? esme).x, y: (esmeB ?? esme).y - 14 });
      await B.page.mouse.move(sb.x, sb.y);
      await B.page.keyboard.press('KeyF');
      await A.page.mouse.move(8, 8);
      await sleep(1800);
      addSegment('point', 'ada', t0 - 0.2, now(), await zoomOn(A, [spots.A, dov, esme, spots.B]));
      posters.point = now() - 0.5;
      await camA.stop();
    });

    // ============================================================ (notebook) a private notebook
    await scene('notebook', async () => {
      await A.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await sleep(600);
      await camA.start();
      await sleep(800);
      const t0 = now();
      await A.page.keyboard.press('KeyN');
      const nb = A.page.locator('.ctn');
      await expect(nb.locator('.ctn-body')).toBeVisible({ timeout: 15_000 });
      await sleep(900);
      await nb.getByRole('group', { name: 'Trust marker for Cora' }).getByRole('button', { name: 'Trust' }).click();
      await sleep(500);
      const note = nb.getByLabel('Note about Dov');
      await note.click();
      await A.page.keyboard.type('Says Chef: 0 pairs. Believe him?', { delay: 38 });
      await sleep(500);
      await nb.getByRole('group', { name: 'Trust marker for Esme' }).getByRole('button', { name: 'Suspect' }).click();
      await sleep(400);
      await nb.getByLabel('Note about Esme').click();
      await A.page.keyboard.type('Quiet. Pinned her.', { delay: 38 });
      await sleep(1600);
      addSegment('notebook', 'ada', t0 - 0.2, now());
      posters.notebook = now() - 0.6;
      await camA.stop();
      await nb.getByRole('button', { name: 'Close notebook' }).click();
    });

    // ============================================================ (vote) gather, nominate, vote; a ghost with a halo
    await scene('vote', async () => {
      wandering = false;
      await cmd({ type: 'set_setting', settings: { voteSeconds: 0.7 } });
      await st.page.getByRole('button', { name: /Gather the circle/ }).click({ timeout: 5_000 }).catch(() => cmd({ type: 'gather', on: true }));
      await st.tap.until(() => gv(st)?.gathering, 10_000, 'gathered');
      await sleep(600);
      await cmd({ type: 'teleport', who: 'all', to: { kind: 'seat' } });
      await cmd({ type: 'set_nominations_open', open: true });
      await sleep(3800);
      await camA.start();
      await camB.start();
      await sleep(500);
      const t0 = now();
      byName('Cora').send('game:nominate', { nomineeSeat: seatB });
      let nom = await A.tap.until(() => gv(A)?.day?.nominations?.[0], 6_000, 'nomination').catch(() => null);
      if (!nom) {
        await cmd({ type: 'create_nomination', nominatorSeat: botSeat(byName('Cora')), nomineeSeat: seatB });
        nom = await A.tap.until(() => gv(A)?.day?.nominations?.[0], 10_000, 'nomination (ST)');
      }
      await sleep(1300);
      await A.page.getByRole('button', { name: /^Raise hand/ }).first().click({ timeout: 10_000 });
      for (const n of ['Cora', 'Dov', 'Esme', 'Hugo']) byName(n).send('game:vote', { nominationId: nom.id, vote: true });
      await sleep(1300);
      addSegment('vote', 'ada', t0 - 0.3, now());
      await cmd({ type: 'start_vote', nominationId: nom.id });
      const v0 = now();
      await A.page.getByText(/your vote counted/i).first().waitFor({ timeout: 30_000 });
      const counted = now();
      await st.tap.until(() => gv(st).day?.nominations?.[0]?.status === 'tallied', 30_000, 'tallied');
      await sleep(1300);
      addSegment('vote', 'ada', Math.max(v0 + 0.3, counted - 2.6), now());
      posters.vote = counted - 1.0;
      await camA.stop();
      // Bram is executed: a ghost with a halo (his ghost vote, still unspent)
      const ex = now();
      await cmd({ type: 'execute', seat: seatB });
      const dead = await B.tap.until(() => gv(B)?.you?.alive === false, 8_000, 'Bram dead').catch(() => null);
      if (!dead) {
        await cmd({ type: 'force_execute', seat: seatB });
        await B.tap.until(() => gv(B)?.you?.alive === false, 15_000, 'Bram dead (forced)');
      }
      await sleep(3300);
      const bram = selfEntity(B, pidB);
      addSegment('vote', 'bram', ex - 0.2, now(), bram ? await zoomOn(B, [{ x: bram.x, y: bram.y + 45 }]) : undefined);
      await camB.stop();
    });
  } finally {
    wandering = false;
    await stopCams();
    writeFileSync(path.join(RAW, 'clips.json'), JSON.stringify({ renderer, clips, posters }, null, 2));
    for (const b of bots) await b.leave().catch(() => undefined);
    for (const p of [st, A, B]) await p.ctx.close().catch(() => undefined);
  }
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

/** Which raw clips make each tour clip (in tour order). */
const OUTPUT: Record<string, string[]> = {
  town: ['town'],
  inside: ['inside'],
  point: ['point'],
  notebook: ['notebook'],
  night: ['night'],
  visit: ['visit'],
  vote: ['vote'],
  storyteller: ['storyteller'],
};
/** Cap per tour clip (seconds) after trimming. */
const MAX_LEN = 8.5;
const MAX_LEN_BY_CLIP: Record<string, number> = { night: 9.5, visit: 9.5, vote: 9.5, storyteller: 9.5, notebook: 9.5 };

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
          '-vf', `fps=${FPS},${cropFilter(s, dur)}scale=${OUT_W}:${OUT_H}:flags=${s.crop && OUT_W % s.crop.w === 0 ? 'neighbor' : 'lanczos'},fade=t=in:st=0:d=${fd},fade=t=out:st=${(dur - fd).toFixed(3)}:d=${fd},format=yuv420p`,
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
      // poster: the moment the script marked (posters[id]), else ~40% in (first segment middle)
      const posterExt = hasWebp ? 'webp' : 'jpg';
      for (const old of ['webp', 'jpg']) rmSync(path.join(OUT, `${id}.${old}`), { force: true });
      const poster = path.join(OUT, `${id}.${posterExt}`);
      let at = Math.min(duration * 0.4, Math.max(0.5, (segs[0]!.to - segs[0]!.from) / 2));
      const mark = posters[id];
      if (mark !== undefined) {
        let acc = 0;
        for (const s of segs) {
          if (mark >= s.from && mark <= s.to) {
            at = Math.min(duration - 0.3, Math.max(0.3, acc + mark - s.from));
            break;
          }
          acc += s.to - s.from;
        }
      }
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
