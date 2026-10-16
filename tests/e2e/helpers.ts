// Shared Playwright helpers (qa-deploy): UI account creation and a WebSocket frame tap that decodes
// every Colyseus ROOM_DATA frame a page sends/receives, so specs can assert on exactly what each
// browser was sent (secrecy) without reaching into app internals.
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { unpack } from '@colyseus/msgpackr';
import { SnapshotDecoder, type Snap2Frame } from '../../packages/protocol/src/index.js';

const ROOM_DATA = 13; // colyseus Protocol.ROOM_DATA

export interface Frame {
  at: number;
  dir: 'in' | 'out';
  type: string;
  payload: any;
}

/** Decode a Colyseus ROOM_DATA frame: [13][type: msgpack str | number][msgpack payload]. */
export function decodeRoomData(buf: Buffer): { type: string; payload: unknown } | null {
  if (buf.length < 2 || buf[0] !== ROOM_DATA) return null;
  let off = 1;
  const prefix = buf[off]!;
  let type: string;
  let len: number | null = null;
  if (prefix > 0xa0 && prefix < 0xc0) {
    len = prefix & 0x1f;
    off += 1;
  } else if (prefix === 0xd9) {
    len = buf[off + 1]!;
    off += 2;
  } else if (prefix === 0xda) {
    len = buf.readUInt16LE(off + 1);
    off += 3;
  }
  if (len !== null) {
    type = buf.subarray(off, off + len).toString('utf8');
    off += len;
  } else if (prefix < 0x80) {
    type = String(prefix);
    off += 1;
  } else return null;
  const payload = off < buf.length ? unpack(buf.subarray(off)) : undefined;
  return { type, payload };
}

/** Records decoded room frames for one page. Attach BEFORE the page opens its room socket. */
export class FrameTap {
  readonly frames: Frame[] = [];
  constructor(
    readonly label: string,
    page: Page,
  ) {
    page.on('websocket', (ws) => {
      // (v2.2 WP4) compact 'world:snap2' frames are kept AND recorded as the 'world:snapshot' they
      // decode to (delta state is per socket, like the page's own decoder).
      const snaps = new SnapshotDecoder();
      const handle = (dir: 'in' | 'out') => (data: { payload: string | Buffer }) => {
        if (typeof data.payload === 'string') return;
        try {
          const d = decodeRoomData(data.payload);
          if (d) this.frames.push({ at: Date.now(), dir, type: d.type, payload: d.payload });
          const snap = d && dir === 'in' && d.type === 'world:snap2' ? snaps.decode(d.payload as Snap2Frame) : null;
          if (snap) this.frames.push({ at: Date.now(), dir, type: 'world:snapshot', payload: snap });
        } catch {
          /* non-room frame */
        }
      };
      ws.on('framereceived', handle('in'));
      ws.on('framesent', handle('out'));
    });
  }
  received(type: string, since = 0): any[] {
    return this.frames.filter((f) => f.dir === 'in' && f.type === type && f.at >= since).map((f) => f.payload);
  }
  sent(type: string, since = 0): any[] {
    return this.frames.filter((f) => f.dir === 'out' && f.type === type && f.at >= since).map((f) => f.payload);
  }
  typeCounts(): Record<string, number> {
    const c: Record<string, number> = {};
    for (const f of this.frames) c[`${f.dir}:${f.type}`] = (c[`${f.dir}:${f.type}`] ?? 0) + 1;
    return c;
  }
  last(type: string): any {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i]!.dir === 'in' && this.frames[i]!.type === type) return this.frames[i]!.payload;
    return undefined;
  }
  /** Poll until `fn(last game:view etc.)` is truthy. */
  async until<T>(fn: () => T | undefined | null | false, timeoutMs = 15_000, what = 'condition'): Promise<T> {
    let v: T | undefined | null | false;
    await expect
      .poll(() => {
        v = fn();
        return Boolean(v);
      }, { timeout: timeoutMs, message: `${this.label}: ${what} (frames seen: ${JSON.stringify(this.typeCounts())})` })
      .toBe(true);
    return v as T;
  }
}

export interface Player {
  name: string;
  ctx: BrowserContext;
  page: Page;
  tap: FrameTap;
}

let clientNo = 0;
/** Each browser context acts as a distinct client IP (as friends behind the tunnel are): the server
 * trusts X-Forwarded-For from loopback, and its per-IP sign-up/sign-in limits would otherwise
 * throttle six browsers on one machine. */
function fakeIp(): string {
  clientNo++;
  return `10.77.${(process.pid + clientNo) % 250}.${clientNo % 250}`;
}

export async function createAccount(browser: Browser, name: string, viewport = { width: 1280, height: 800 }): Promise<Player> {
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: { 'X-Forwarded-For': fakeIp() } });
  const page = await ctx.newPage();
  const tap = new FrameTap(name, page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: 'Create account' }).click();
  const pass = page.getByLabel('Your passphrase');
  await expect(pass).toBeVisible();
  const passphrase = (await pass.textContent())!.trim();
  expect(passphrase.split(/\s+/).length).toBeGreaterThanOrEqual(6);
  // The credential is not persisted client-side and the session cookie is HttpOnly.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toContain(passphrase);
  expect(stored).not.toContain('ct_session');
  await expect(page.getByRole('button', { name: 'Enter the town' })).toBeDisabled();
  await page.getByLabel('I have saved my passphrase somewhere safe').check();
  await page.getByRole('button', { name: 'Enter the town' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
  return { name, ctx, page, tap };
}

export async function lobbyCount(page: Page, id: string): Promise<number> {
  const r = await page.request.get(`/api/lobbies/${id}`);
  expect(r.status()).toBe(200);
  return ((await r.json()) as { lobby: { playerCount: number } }).lobby.playerCount;
}

// ------------------------------------------------------------------------------------------------
// (e2e teammate, additive) Helpers for the full-game specs (game-*.spec.ts): sign-up with a villager
// pick, a capture of the page's own Colyseus socket (message-level injection where the UI cannot be
// driven, e.g. a "modified client" vote), console/page-error collection, two-click confirms, and
// real-keyboard walking along collision-free tile paths (outdoors and inside buildings).
import { pack } from '@colyseus/msgpackr';

/** Town layout + collision helpers, loaded lazily (only the walking specs depend on the art package). */
type Geo = {
  L: typeof import('../../packages/assets/src/index.js').townLayout;
  /** v2 roster (packages/assets/src/cast.ts). */
  cast: typeof import('../../packages/assets/src/index.js').CAST;
  playable: typeof import('../../packages/assets/src/index.js').PLAYABLE;
  PLAZA: typeof import('../../packages/assets/src/index.js').PLAZA;
  /** Legacy v1 presets (capture-tutorial.spec.ts still reads them). */
  presets: typeof import('../../packages/assets/src/index.js').CHARACTER_PRESETS;
  speed: number;
  isBlockedPx: typeof import('../../packages/protocol/src/index.js').isBlockedPx;
  locationAt: typeof import('../../packages/protocol/src/index.js').locationAt;
  tileCenterPx: typeof import('../../packages/protocol/src/index.js').tileCenterPx;
  findPath: typeof import('../../apps/server/src/world/path.js').findPath;
};
let geoCache: Geo | null = null;
export async function geo(): Promise<Geo> {
  if (!geoCache) {
    const a = await import('../../packages/assets/src/index.js');
    const pr = await import('../../packages/protocol/src/index.js');
    const path = await import('../../apps/server/src/world/path.js');
    geoCache = {
      L: a.townLayout,
      cast: a.CAST,
      playable: a.PLAYABLE,
      PLAZA: a.PLAZA,
      presets: a.CHARACTER_PRESETS,
      speed: pr.PLAYER_SPEED,
      isBlockedPx: pr.isBlockedPx,
      locationAt: pr.locationAt,
      tileCenterPx: pr.tileCenterPx,
      findPath: path.findPath,
    };
  }
  return geoCache;
}

/** Colyseus ROOM_DATA frame [13][fixstr type][msgpack payload] (exactly what room.send() produces). */
export function roomFrame(type: string, payload: unknown): number[] {
  const t = Buffer.from(type, 'utf8');
  return [ROOM_DATA, 0xa0 | t.length, ...t, ...pack(payload)];
}

/** Remember every same-host WebSocket the page opens (window.__e2e.inject sends on the newest open one). */
export async function installSocketTap(ctx: BrowserContext): Promise<void> {
  // opt-in camera test hook (window.__ctCamera, see CAMERA_HOOK_KEY)
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.debug.camera', '1');
    } catch {}
  });
  await ctx.addInitScript(() => {
    const W = window as unknown as { __e2e?: { sockets: WebSocket[]; log: string[]; inject(b: number[]): boolean } };
    const Orig = window.WebSocket;
    const sockets: WebSocket[] = [];
    const log: string[] = [];
    const t0 = performance.now();
    const ts = () => `${Math.round(performance.now() - t0)}ms`;
    class TapWS extends Orig {
      constructor(u: string | URL, p?: string | string[]) {
        super(u, p);
        if (String(u).includes(location.host)) {
          const n = sockets.push(this);
          const path = String(u).replace(/^wss?:\/\/[^/]+/, '').replace(/(reconnectionToken|ticket)=[^&]+/g, '$1=…').slice(0, 80);
          log.push(`${ts()} #${n} new ${path}`);
          this.addEventListener('open', () => log.push(`${ts()} #${n} open`));
          // messages actually delivered to page JS (vs. frames the network layer read: FrameTap)
          let msgs = 0;
          let firstMsgAt = '';
          this.addEventListener('message', () => {
            if (!msgs++) firstMsgAt = ts();
            (W.__e2e as any).delivered = { ...((W.__e2e as any).delivered ?? {}), [n]: { msgs, firstMsgAt, lastMsgAt: ts() } };
          });
          this.addEventListener('close', (e) => log.push(`${ts()} #${n} close code=${(e as CloseEvent).code} reason=${(e as CloseEvent).reason.slice(0, 60)}`));
          this.addEventListener('error', () => log.push(`${ts()} #${n} error`));
        }
      }
    }
    window.WebSocket = TapWS as typeof WebSocket;
    W.__e2e = {
      sockets,
      log,
      inject(bytes: number[]) {
        const s = [...sockets].reverse().find((x) => x.readyState === 1);
        if (!s) return false;
        Orig.prototype.send.call(s, new Uint8Array(bytes));
        return true;
      },
    };
  });
}

/** Message-level: send one C2S room message from this page's own socket (a modified client). */
export async function inject(page: Page, type: string, payload: unknown): Promise<boolean> {
  const bytes = roomFrame(type, payload);
  return page.evaluate((b) => (window as unknown as { __e2e?: { inject(b: number[]): boolean } }).__e2e?.inject(b) ?? false, bytes);
}

/** Console errors / uncaught page errors, labelled per page. */
export function watchConsole(page: Page, label: string, sink: string[]): void {
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push(`${label}: console.error ${m.text().slice(0, 300)}`);
  });
  page.on('pageerror', (e) => sink.push(`${label}: pageerror ${e.message.slice(0, 300)}`));
}

export interface GamePlayer extends Player {
  /** Roster character id picked at sign-up (data-cast of the chosen tile), null if no picker. */
  character: string | null;
  /** Preset id saved on the account (from /api/me). */
  presetId: string | null;
  console: string[];
}

/** Phone contexts (v2 phone checks): portrait 390x844 and landscape 844x390, touch + mobile. */
export const PHONE_PORTRAIT = { width: 390, height: 844 };
export const PHONE_LANDSCAPE = { width: 844, height: 390 };

/**
 * Sign up through the UI like a first-time player: Create account -> display name -> pick a character
 * from the v2 roster ("Choose your character" radiogroup) -> passphrase reveal -> "saved" -> Enter the
 * town. Installs the socket tap. `characterIndex` picks the n-th playable tile (wraps).
 */
export async function signUp(
  browser: Browser,
  name: string,
  opts: { viewport?: { width: number; height: number }; characterIndex?: number; /** @deprecated v1 name */ villagerIndex?: number; consoleSink?: string[]; phone?: boolean } = {},
): Promise<GamePlayer> {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
    extraHTTPHeaders: { 'X-Forwarded-For': fakeIp() },
    // (DPR 1: the shared host renders every canvas in software; CSS layout is the same as on a DPR-3 phone)
    ...(opts.phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}),
  });
  await installSocketTap(ctx);
  const page = await ctx.newPage();
  const sink = opts.consoleSink ?? [];
  watchConsole(page, name, sink);
  page.on('dialog', (d) => void d.accept());
  const tap = new FrameTap(name, page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(name);
  let character: string | null = null;
  const picker = page.getByRole('radiogroup', { name: 'Choose your character' });
  await expect(picker, 'v2 character picker on the sign-up form').toBeVisible();
  const radios = picker.getByRole('radio');
  const n = await radios.count();
  expect(n, 'roster size').toBeGreaterThanOrEqual(13);
  // the old custom-character UI is gone
  await expect(page.getByText('Advanced customization')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Choose a villager' })).toHaveCount(0);
  const pick = radios.nth((opts.characterIndex ?? opts.villagerIndex ?? 0) % n);
  if ((await pick.getAttribute('aria-checked')) !== 'true') {
    if (opts.phone) await pick.tap();
    else await pick.click();
  }
  await expect(pick).toHaveAttribute('aria-checked', 'true');
  character = await pick.getAttribute('data-cast');
  await page.getByRole('button', { name: 'Create account' }).click();
  const pass = page.getByLabel('Your passphrase');
  await expect(pass).toBeVisible();
  await page.getByLabel('I have saved my passphrase somewhere safe').check();
  await page.getByRole('button', { name: 'Enter the town' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
  const meRes = await page.request.get('/api/me');
  const presetId = ((await meRes.json()) as { cosmetics?: { preset?: string | null } }).cosmetics?.preset ?? null;
  return { name, ctx, page, tap, character, presetId, console: sink };
}

/** Second click of a two-click ConfirmButton (the armed group shows Yes / No). */
export async function confirmYes(page: Page, timeout = 15_000): Promise<void> {
  await page.locator('.cts-confirm').getByRole('button', { name: 'Yes', exact: true }).first().click({ timeout });
}

/**
 * Arm a two-click ConfirmButton and press Yes. The armed state lasts 6 s; on a CPU-starved host the
 * second click can miss it, so re-arm (up to 4 times). Returns the number of attempts used.
 */
export async function armConfirm(page: Page, button: import('@playwright/test').Locator): Promise<number> {
  const label = ((await button.first().textContent({ timeout: 30_000 })) ?? '').trim();
  for (let i = 1; ; i++) {
    await button.first().click({ timeout: 20_000 });
    try {
      await confirmYes(page, 5_000);
      return i;
    } catch (e) {
      if (i >= 4) throw e;
      // Either the Yes click landed late (the action happened) or the armed state expired: wait for
      // the armed group to go away, then re-arm only if the very same button is back.
      await page.locator('.cts-confirm').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
      const again = (await button.count()) ? ((await button.first().textContent()) ?? '').trim() : null;
      if (again !== label) return i;
    }
  }
}

// ---------------------------------------------------------------------------- keyboard walking

export async function tilePx(t: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const g = await geo();
  return g.tileCenterPx(g.L, t);
}

export function selfEntity(p: Player, pid: string): { x: number; y: number; location: string } | undefined {
  return p.tap.last('world:snapshot')?.entities?.find((e: { id: string }) => e.id === pid);
}

/** 4-neighbour BFS over walkable tiles of one location (outdoors or one interior), compressed to corners. */
export async function tilePath(from: { x: number; y: number }, to: { x: number; y: number }, location: string, strict = true): Promise<{ x: number; y: number }[]> {
  const { L, isBlockedPx, locationAt, tileCenterPx } = await geo();
  const T = L.tileSize;
  // Collision is per pixel and keyboard positioning is only ~±8 px precise at a few fps, so prefer
  // tiles that are free over (almost) their whole area; the endpoints only need their feet spot.
  const clear = (tx: number, ty: number) => {
    for (let dy = 0; dy < T; dy += 3) for (let dx = 1; dx < T; dx += 2) if (isBlockedPx(L, tx * T + dx, ty * T + dy) || locationAt(L, tx * T + dx, ty * T + dy) !== location) return false;
    return true;
  };
  const ok = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= L.widthTiles || ty >= L.heightTiles) return false;
    const c = tileCenterPx(L, { x: tx, y: ty });
    if (isBlockedPx(L, c.x, c.y) || locationAt(L, c.x, c.y) !== location) return false;
    if (!strict || (tx === to.x && ty === to.y) || (tx === from.x && ty === from.y)) return true;
    return clear(tx, ty);
  };
  const key = (x: number, y: number) => y * L.widthTiles + x;
  const prev = new Map<number, number>([[key(from.x, from.y), -1]]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    if (c.x === to.x && c.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (prev.has(key(n.x, n.y)) || !ok(n.x, n.y)) continue;
      prev.set(key(n.x, n.y), key(c.x, c.y));
      q.push(n);
    }
  }
  if (!prev.has(key(to.x, to.y))) {
    if (strict) return tilePath(from, to, location, false);
    throw new Error(`no ${location} path from ${from.x},${from.y} to ${to.x},${to.y}`);
  }
  const path: { x: number; y: number }[] = [];
  for (let k = key(to.x, to.y); k !== -1; k = prev.get(k)!) path.unshift({ x: k % L.widthTiles, y: Math.floor(k / L.widthTiles) });
  return path.filter((p, i) => i === 0 || i === path.length - 1 || !((path[i - 1]!.x === p.x && path[i + 1]!.x === p.x) || (path[i - 1]!.y === p.y && path[i + 1]!.y === p.y)));
}

/** Hold an arrow key until the server position reaches `target` on one axis (closed loop, real keyboard).
 * `cross` = where we want to be on the other axis: when a hold makes no progress (pixel-level
 * obstacle next to an off-centre path) we nudge back toward it and retry. */
export async function walkAxis(p: Player, pid: string, axis: 'x' | 'y', target: number, budgetMs = 90_000, cross?: number): Promise<void> {
  const { speed } = await geo();
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const until = Date.now() + budgetMs;
  const trail: number[] = [];
  const other = axis === 'x' ? 'y' : 'x';
  let stuck = 0;
  let last: number | null = null;
  const tap = async (key: string, d: number) => {
    await p.page.keyboard.down(key);
    // Far: hold for most of the distance. Near: a bare tap (one or two rendered frames), since any
    // hold overshoots when Phaser renders only a few frames per second.
    if (Math.abs(d) > 28) await p.page.waitForTimeout(Math.min(2500, (Math.abs(d) / speed) * 1000 * 0.75));
    await p.page.keyboard.up(key);
  };
  for (let i = 0; Date.now() < until; i++) {
    await p.page.waitForTimeout(350);
    const pos = selfEntity(p, pid);
    if (!pos) continue;
    const d = target - pos[axis];
    trail.push(Math.round(pos[axis]));
    if (Math.abs(d) <= 8) return;
    stuck = last !== null && Math.abs(pos[axis] - last) < 1 ? stuck + 1 : 0;
    last = pos[axis];
    if (stuck >= 2 && cross !== undefined) {
      // blocked: re-centre on the other axis (alternate sides if already centred)
      const dc = cross - pos[other];
      const dir = Math.abs(dc) > 3 ? Math.sign(dc) : stuck % 2 ? 1 : -1;
      const key = other === 'x' ? (dir > 0 ? 'ArrowRight' : 'ArrowLeft') : dir > 0 ? 'ArrowDown' : 'ArrowUp';
      await tap(key, 0);
      continue;
    }
    const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : d > 0 ? 'ArrowDown' : 'ArrowUp';
    await tap(key, d);
  }
  const pos = selfEntity(p, pid);
  const since = until - budgetMs;
  const sent = p.tap.sent('move', since);
  const tps = p.tap.received('world:teleport', since).map((t: any) => `${t.reason}@${Math.round(t.x)},${Math.round(t.y)}`);
  const lastSent = sent.at(-1);
  const you = p.tap.last('world:snapshot')?.you;
  throw new Error(
    `${p.name}: could not reach ${axis}=${target} (at ${pos?.x},${pos?.y} ${pos?.location}; trail ${trail.slice(-12).join(',')}; ` +
      `move frames sent ${sent.length}, last ${sent.slice(-4).map((m: any) => `#${m.seq} ${m.x},${m.y}${m.moving ? 'm' : ''}`).join(' ')}; ackSeq ${p.tap.last('world:snapshot')?.ackSeq}; ` +
      `move errors ${JSON.stringify(p.tap.received('error', since).filter((e: any) => e.for === 'move').slice(-3))}; teleports ${tps.slice(-6).join(' ')}; you=${JSON.stringify(you ?? null)})`,
  );
}

/**
 * Walk with the real keyboard to a tile of the current location. Follows the server's own A*
 * waypoints (apps/server/src/world/path.ts: body-box aware, string-pulled) in a closed loop on the
 * server position, holding one or two arrow keys (diagonals) per leg.
 */
export async function walkToTile(p: Player, pid: string, to: { x: number; y: number }, budgetMs = 600_000): Promise<void> {
  const g = await geo();
  const me = selfEntity(p, pid);
  if (!me) throw new Error(`${p.name}: no own entity`);
  const goal = g.tileCenterPx(g.L, to);
  let pts = g.findPath(g.L, { x: me.x, y: me.y }, goal, me.location as never);
  if (!pts) throw new Error(`${p.name}: no path from ${me.x},${me.y} to ${goal.x},${goal.y}`);
  let replans = 0;
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const until = Date.now() + budgetMs;
  const since = Date.now();
  const trail: string[] = [];
  let i = 0;
  let still = 0;
  let flips = 0;
  let lastSign = 0;
  let lastSignY = 0;
  let gain = 0.9;
  let best = Infinity;
  let noProgress = 0;
  let prev: { x: number; y: number } | null = null;
  while (i < pts.length) {
    if (Date.now() > until) {
      const pos = selfEntity(p, pid);
      const sent = p.tap.sent('move', since);
      throw new Error(
        `${p.name}: keyboard walk to ${goal.x},${goal.y} stuck at ${pos?.x},${pos?.y} (replans ${replans}, waypoint ${i}/${pts.length} ${JSON.stringify(pts[i])}; trail ${trail.slice(-8).join(' ')}; ` +
          `moves sent ${sent.length} last ${sent.slice(-3).map((m: any) => `#${m.seq} ${m.x},${m.y}`).join(' ')}; ackSeq ${p.tap.last('world:snapshot')?.ackSeq}; ` +
          `teleports ${p.tap.received('world:teleport', since).map((t: any) => t.reason).join(',')})`,
      );
    }
    await p.page.waitForTimeout(300);
    const pos = selfEntity(p, pid);
    if (!pos) continue;
    // A door took us somewhere else (v2.2: e.g. the last push onto a cottage's doorstep already went
    // INTO the doorway, or a push down on an interior door spot walked out). Walking on toward a
    // waypoint in the old location could never succeed: stop and let the caller decide.
    if (pos.location !== me.location) return;
    trail.push(`${Math.round(pos.x)},${Math.round(pos.y)}`);
    const wp = pts[i]!;
    const dx = wp.x - pos.x;
    const dy = wp.y - pos.y;
    const d = Math.hypot(dx, dy);
    const last = i === pts.length - 1;
    // overshoot detector: frame rates swing between ~1 and ~16 fps, so a hold can overshoot by tens of
    // px; every reversal (on either axis) halves the hold time (down to bare taps)
    const sx = Math.abs(dx) > 4 ? Math.sign(dx) : 0;
    const sy = Math.abs(dy) > 4 ? Math.sign(dy) : 0;
    if ((lastSign !== 0 && sx !== 0 && sx !== lastSign) || (lastSignY !== 0 && sy !== 0 && sy !== lastSignY)) {
      flips++;
      gain *= 0.5;
    }
    lastSign = sx || lastSign;
    lastSignY = sy || lastSignY;
    if (d <= (last ? 6 : 10) || (flips >= 2 && d <= 18)) {
      i++;
      still = 0;
      flips = 0;
      lastSign = 0;
      lastSignY = 0;
      gain = 0.9;
      best = Infinity;
      noProgress = 0;
      continue;
    }
    still = prev && Math.hypot(pos.x - prev.x, pos.y - prev.y) < 1 ? still + 1 : 0;
    prev = { x: pos.x, y: pos.y };
    // no progress toward the waypoint for a while (pinned on furniture, or wiggling sideways)
    if (d < best - 2) {
      best = d;
      noProgress = 0;
    } else noProgress++;
    // stuck off the planned line (furniture / corners): re-plan from where we actually stand
    if ((still >= 4 || flips >= 4 || noProgress >= 6) && replans < 20) {
      best = Infinity;
      noProgress = 0;
      const re = g.findPath(g.L, { x: pos.x, y: pos.y }, goal, pos.location as never);
      if (re && re.length) {
        pts = re;
        i = 0;
        replans++;
        still = 0;
        flips = 0;
        lastSign = 0;
        lastSignY = 0;
        gain = 0.9;
        continue;
      }
    }
    const keys: string[] = [];
    // a component counts if it is a real part of the direction (or we are stuck: wiggle on it)
    if (Math.abs(dx) > Math.max(4, d * 0.25)) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(dy) > Math.max(4, d * 0.25)) keys.push(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    if (still >= 3 && keys.length === 1) {
      // blocked: add a sideways component toward the waypoint's other axis (or alternate)
      const side = keys[0]!.includes('Left') || keys[0]!.includes('Right') ? (still % 2 ? 'ArrowUp' : 'ArrowDown') : still % 2 ? 'ArrowLeft' : 'ArrowRight';
      keys.push(side);
    }
    if (d <= 48) {
      // Fine positioning (v2: 150 px/s): a Playwright key press on a CPU-starved page lasts several
      // rendered frames (75 px swings were measured), so near the target hold for an exact number of
      // the page's own frames instead (window key events — the same input path the on-screen
      // joystick uses). One frame moves at most PLAYER_SPEED x 0.1 s = 15 px.
      await holdFrames(p.page, keys, d < 16 ? 1 : Math.min(3, Math.floor(d / 15)));
      await p.page.waitForTimeout(250);
      continue;
    }
    for (const k of keys) await p.page.keyboard.down(k);
    if (d > 24 && gain > 0.1) await p.page.waitForTimeout(Math.min(3000, (d / g.speed) * 1000 * gain));
    for (const k of keys) await p.page.keyboard.up(k);
  }
}

/**
 * Hold `codes` (KeyboardEvent.code) for exactly `frames` game steps of this page: keydown on window,
 * wait frames+1 animation frames (so Phaser's step runs at least `frames` times while held), keyup.
 */
export async function holdFrames(page: Page, codes: string[], frames: number): Promise<void> {
  await page.evaluate(
    async ({ codes: cs, frames: n }) => {
      for (const c of cs) window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
      for (let i = 0; i <= n; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      for (const c of cs) window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true }));
    },
    { codes, frames },
  );
}


// ---------------------------------------------------------------------------- v2: doors, taps, camera
//
// v2 one-screen town: doors are automatic (walk INTO a doorway), a tap/click on a cottage walks
// there and goes in (client-side path). v2.2: inside you walk around the room like outdoors (arrow
// keys / joystick / tap); you leave with the "Inside …" panel's Leave button (from anywhere) or by
// walking DOWN through the doorway below the interior door spot (or tapping it). The Storyteller's
// click outdoors teleports (st:command teleport_self); inside a room the Storyteller walks too.
//
// Tapping needs canvas coordinates. The client exposes an opt-in, production-safe camera hook
// (TownScene.ts: localStorage 'ct.debug.camera' = '1' -> window.__ctCamera { worldToScreen(x, y) ->
// page CSS px, view() -> { x, y, width, height, zoom } (world px), me() }); installSocketTap turns it
// on for every test context. `outdoorCamera` below is only the fallback for a build without the hook
// (it mirrors TownScene.fitCamera/updateCamera as of v2.1). Every tap is still verified by its effect
// (the right building entered / the right frame sent).

export type Loc = { x: number; y: number; location: string };

/** Camera hook flag: set in every context that installs the socket tap (see installSocketTap). */
export const CAMERA_HOOK_KEY = 'ct.debug.camera';

/** The town camera's current world view, from the client hook (null if the build has none). */
export async function cameraView(page: Page): Promise<{ x: number; y: number; width: number; height: number; zoom: number } | null> {
  return page.evaluate(() => (window as unknown as { __ctCamera?: { view(): { x: number; y: number; width: number; height: number; zoom: number } } }).__ctCamera?.view() ?? null);
}

/** The canvas host (.ct-game-canvas) box in page CSS px; Phaser's camera size = its client size. */
export async function canvasBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  const b = await page.locator('.ct-game-canvas').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: Math.max(64, Math.floor((el as HTMLElement).clientWidth)), h: Math.max(64, Math.floor((el as HTMLElement).clientHeight)) };
  });
  return b;
}

/**
 * FALLBACK ONLY (no camera hook): outdoor camera (zoom + centre in world px) for a canvas of w x h with
 * the local player at `me`, as TownScene v2.1 computes it: zoom = min(w / SQUARE_VIEW.w, h / SQUARE_VIEW.h),
 * resting on SQUARE_VIEW's centre in the square, leaning 0.85 toward the player near the edge.
 */
export async function outdoorCamera(size: { w: number; h: number }, me: { x: number; y: number }): Promise<{ zoom: number; cx: number; cy: number }> {
  const { L, PLAZA } = await geo();
  const TS = L.tileSize;
  const TOWN = { x: L.townBounds.x * TS, y: L.townBounds.y * TS, w: L.townBounds.w * TS, h: L.townBounds.h * TS };
  const SQUARE_VIEW = { x: PLAZA.cx - 200, y: 56, w: 400, h: PLAZA.cy + PLAZA.ry + 18 - 56 };
  const zoom = Math.max(0.2, Math.min(size.w / SQUARE_VIEW.w, size.h / SQUARE_VIEW.h));
  const vw = size.w / zoom;
  const vh = size.h / zoom;
  let tx = SQUARE_VIEW.x + SQUARE_VIEW.w / 2;
  let ty = SQUARE_VIEW.y + SQUARE_VIEW.h / 2;
  const inSquare = Math.hypot((me.x - PLAZA.cx) / PLAZA.rx, (me.y - 8 - PLAZA.cy) / PLAZA.ry) <= 1.08;
  if (!inSquare) {
    tx = tx + (me.x - tx) * 0.85;
    ty = ty + (me.y - 10 - ty) * 0.85;
  }
  const clamp = (c: number, lo: number, sz: number, view: number) => (sz <= view ? lo + sz / 2 : Math.min(Math.max(c, lo + view / 2), lo + sz - view / 2));
  tx = clamp(tx, TOWN.x, TOWN.w, vw);
  ty = clamp(ty, TOWN.y, TOWN.h, vh);
  return { zoom, cx: Math.round(tx * zoom) / zoom, cy: Math.round(ty * zoom) / zoom };
}

/** What a tap at world (x, y) means to TownScene.tapTarget: a cottage id (sprite or doorstep) or null. */
export async function tapTargetAt(x: number, y: number): Promise<string | null> {
  const { L, tileCenterPx } = await geo();
  const TS = L.tileSize;
  for (const b of L.buildings) {
    const f = b.footprint;
    const at = tileCenterPx(L, b.door);
    const inSprite = x >= f.x * TS && x < (f.x + f.w) * TS && y >= (f.y - 1) * TS && y < (f.y + f.h) * TS;
    if (inSprite || Math.hypot(x - at.x, y - at.y) < 14) return b.id;
  }
  return null;
}

/**
 * Screen points (page CSS px) of world points for the current camera (the client hook's
 * worldToScreen; fallback: the mirrored maths). Keeps only points on the canvas that the canvas
 * itself receives (not covered by HUD panels).
 */
async function hittable(page: Page, me: Loc, world: { x: number; y: number }[]): Promise<{ sx: number; sy: number; wx: number; wy: number }[]> {
  if (!world.length) return [];
  const box = await canvasBox(page);
  const viaHook = await page.evaluate((ws) => {
    const cam = (window as unknown as { __ctCamera?: { worldToScreen(x: number, y: number): { x: number; y: number } } }).__ctCamera;
    return cam ? ws.map((w) => cam.worldToScreen(w.x, w.y)) : null;
  }, world);
  let screen: { x: number; y: number }[];
  if (viaHook) screen = viaHook;
  else {
    const cam = await outdoorCamera(box, me);
    screen = world.map((w) => ({ x: box.x + (w.x - cam.cx) * cam.zoom + box.w / 2, y: box.y + (w.y - cam.cy) * cam.zoom + box.h / 2 }));
  }
  const pts = world
    .map((w, i) => ({ wx: w.x, wy: w.y, sx: screen[i]!.x, sy: screen[i]!.y }))
    .filter((p) => p.sx >= box.x + 4 && p.sy >= box.y + 4 && p.sx <= box.x + box.w - 4 && p.sy <= box.y + box.h - 4);
  if (!pts.length) return [];
  const ok = await page.evaluate(
    (ps) =>
      ps.map((p) => {
        const el = document.elementFromPoint(p.sx, p.sy);
        return !!el && el.tagName === 'CANVAS' && !!el.closest('.ct-game-canvas');
      }),
    pts,
  );
  return pts.filter((_, i) => ok[i]);
}

/** Wait until our server position has been still for `ms` (camera smoothing settles ~1 s after). */
export async function settle(p: Player, pid: string, ms = 1200, timeoutMs = 60_000): Promise<Loc> {
  const t0 = Date.now();
  let last = selfEntity(p, pid);
  let since = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await p.page.waitForTimeout(250);
    const cur = selfEntity(p, pid);
    if (!cur) continue;
    if (!last || Math.hypot(cur.x - last.x, cur.y - last.y) > 0.5 || cur.location !== last.location) {
      last = cur;
      since = Date.now();
    } else if (Date.now() - since >= ms) {
      // camera lerp: with the hook, wait until the view stops moving; else a fixed pause
      let v0 = await cameraView(p.page);
      if (!v0) await p.page.waitForTimeout(900);
      else
        for (let k = 0; k < 20; k++) {
          await p.page.waitForTimeout(250);
          const v1 = await cameraView(p.page);
          if (!v1 || !v0 || (Math.abs(v1.x - v0.x) < 0.5 && Math.abs(v1.y - v0.y) < 0.5 && v1.zoom === v0.zoom)) break;
          v0 = v1;
        }
      return cur;
    }
  }
  return selfEntity(p, pid)!;
}

/** Tap (touch) or click (mouse) at page coordinates. */
async function press(p: Player, x: number, y: number, touch: boolean) {
  if (touch) await p.page.touchscreen.tap(x, y);
  else await p.page.mouse.click(x, y);
}

/**
 * Find where to tap a cottage on screen right now. Returns the screen point (on the canvas, not
 * under a panel) whose tap TownScene resolves to `buildingId`, or a ground spot toward the cottage
 * when it is off screen / covered (tapping it walks there — the Storyteller teleports there).
 */
export async function planCottageTap(p: Player, me: Loc, buildingId: string): Promise<{ kind: 'building' | 'ground'; sx: number; sy: number; wx: number; wy: number } | null> {
  const g = await geo();
  const { L } = g;
  const TS = L.tileSize;
  const b = L.buildings.find((x) => x.id === buildingId);
  if (!b) throw new Error(`no building ${buildingId}`);
  const f = b.footprint;
  const door = g.tileCenterPx(L, b.door);
  // candidates: a grid over the sprite rect + the doorstep, nearest the doorstep first
  const cand: { x: number; y: number }[] = [door];
  for (let j = 0; j <= 6; j++) for (let i = 0; i <= 6; i++) cand.push({ x: f.x * TS + 2 + ((f.w * TS - 4) * i) / 6, y: (f.y - 1) * TS + 2 + (((f.h + 1) * TS - 4) * j) / 6 });
  const mine: { x: number; y: number }[] = [];
  for (const c of cand) if ((await tapTargetAt(c.x, c.y)) === buildingId) mine.push(c);
  mine.sort((a, c) => Math.hypot(a.x - door.x, a.y - door.y) - Math.hypot(c.x - door.x, c.y - door.y));
  const hit = await hittable(p.page, me, mine);
  if (hit.length) return { kind: 'building', ...hit[0]! };
  // off screen or covered: the reachable, visible ground spot closest to the door
  const ground: { x: number; y: number }[] = [];
  const hv = await cameraView(p.page);
  const view = hv ?? (await (async () => {
    const box = await canvasBox(p.page);
    const c = await outdoorCamera(box, me);
    return { x: c.cx - box.w / c.zoom / 2, y: c.cy - box.h / c.zoom / 2, width: box.w / c.zoom, height: box.h / c.zoom, zoom: c.zoom };
  })());
  for (let sy = 0.06; sy < 0.95; sy += 0.06)
    for (let sx = 0.06; sx < 0.95; sx += 0.06) {
      const x = view.x + view.width * sx;
      const y = view.y + view.height * sy;
      if (x < 4 || y < 4 || x > L.townBounds.w * TS - 4 || y > L.townBounds.h * TS - 4) continue;
      if (g.isBlockedPx(L, x, y + 6) || g.locationAt(L, x, y) !== 'outdoors' || (await tapTargetAt(x, y)) !== null) continue;
      ground.push({ x, y });
    }
  ground.sort((a, c) => Math.hypot(a.x - door.x, a.y - door.y) - Math.hypot(c.x - door.x, c.y - door.y));
  const visible = await hittable(p.page, me, ground.slice(0, 40));
  for (const v of visible) {
    // must actually bring us closer and be reachable outdoors
    if (Math.hypot(v.wx - door.x, v.wy - door.y) >= Math.hypot(me.x - door.x, me.y - door.y) - 8) break;
    if (g.findPath(L, { x: me.x, y: me.y }, { x: v.wx, y: v.wy + 6 }, 'outdoors' as never)) return { kind: 'ground', ...v };
  }
  return null;
}

export interface TapLog {
  taps: string[];
}

/**
 * v2 "tap a cottage": tap/click the cottage on the canvas (walking toward it first by tapping the
 * ground if it is off screen), then wait until the server has us inside. Players walk there on the
 * client-side path and go in through the door (world:useDoor + a 'door' teleport); the Storyteller's
 * tap teleports them in (st:command teleport_self). Returns a short log of what was tapped.
 */
export async function tapCottage(p: Player, pid: string, buildingId: string, opts: { touch?: boolean; storyteller?: boolean; timeoutMs?: number } = {}): Promise<string[]> {
  const log: string[] = [];
  const want = `bld:${buildingId}`;
  const t0 = Date.now();
  const timeout = opts.timeoutMs ?? 180_000;
  for (let attempt = 1; Date.now() - t0 < timeout; attempt++) {
    const me = await settle(p, pid, 900, 60_000);
    if (me.location === want) return log;
    if (me.location !== 'outdoors') throw new Error(`${p.name}: tapCottage(${buildingId}) while inside ${me.location}`);
    let plan = await planCottageTap(p, me, buildingId);
    if (!plan && opts.storyteller) {
      // a cottage at the town's edge can sit under the docked Storyteller panel (the camera cannot
      // scroll past the town): dock the panel on the other side once and look again
      const dock = p.page.getByRole('button', { name: 'Move the panel to the other side' });
      if (await dock.count()) {
        await dock.first().click();
        await p.page.waitForTimeout(500);
        log.push('  (docked the Storyteller panel on the other side)');
        plan = await planCottageTap(p, me, buildingId);
      }
    }
    if (!plan) throw new Error(`${p.name}: no visible spot to tap toward ${buildingId} from ${Math.round(me.x)},${Math.round(me.y)} (log ${log.join(' | ')})`);
    const since = Date.now();
    await press(p, plan.sx, plan.sy, !!opts.touch);
    log.push(`#${attempt} ${plan.kind}@screen ${Math.round(plan.sx)},${Math.round(plan.sy)} world ${Math.round(plan.wx)},${Math.round(plan.wy)} from ${Math.round(me.x)},${Math.round(me.y)}${(await cameraView(p.page)) ? '' : ' [no camera hook: fallback maths]'}`);
    if (plan.kind === 'ground') {
      // a walk (or the ST's teleport) toward it; then look again
      await expect
        .poll(() => (opts.storyteller ? p.tap.sent('st:command', since).length : p.tap.sent('move', since).length), { timeout: 15_000, message: `${p.name}: ground tap produced no movement` })
        .toBeGreaterThan(0)
        .catch(() => log.push('  (no movement after the ground tap)'));
      continue;
    }
    // the cottage: wait until we are in (or an error / refusal arrives)
    const deadline = Date.now() + Math.max(20_000, timeout - (Date.now() - t0));
    while (Date.now() < deadline) {
      await p.page.waitForTimeout(300);
      const loc = selfEntity(p, pid)?.location;
      if (loc === want) {
        const sent = opts.storyteller ? p.tap.sent('st:command', since).filter((c: any) => c.type === 'teleport_self') : p.tap.sent('world:useDoor', since);
        const ok = opts.storyteller ? sent.some((c: any) => c.to?.kind === 'building' && c.to.buildingId === buildingId) : sent.some((c: any) => c.buildingId === buildingId);
        if (!ok) throw new Error(`${p.name}: inside ${want}, but not through our tap (sent ${JSON.stringify(sent)})`);
        log.push(`  in ${want} after ${Date.now() - since} ms`);
        return log;
      }
      if (loc && loc !== 'outdoors') throw new Error(`${p.name}: tap meant for ${buildingId} took us into ${loc} (log ${log.join(' | ')})`);
      const err = p.tap.received('error', since).find((e: any) => e.for === 'world:useDoor' || e.for === 'st:command');
      if (err) throw new Error(`${p.name}: entering ${buildingId} refused: ${err.message}`);
      // stopped walking without going in (route blocked / tap missed): try again
      const moves = p.tap.sent('move', since);
      if (!opts.storyteller && Date.now() - since > 6000 && (!moves.length || Date.now() - (p.tap.frames.filter((f) => f.dir === 'out' && f.type === 'move').at(-1)?.at ?? 0) > 3000)) {
        log.push(`  stopped outside (moves ${moves.length})`);
        break;
      }
      if (opts.storyteller && Date.now() - since > 10_000) break;
    }
  }
  throw new Error(`${p.name}: could not get into ${buildingId} by tapping within ${timeout} ms (log ${log.join(' | ')}; at ${JSON.stringify(selfEntity(p, pid))})`);
}

/** The "Inside … with …" panel (GameScreen InsidePanel). */
export const insidePanel = (page: Page) => page.locator('.ct-inside');
export const leaveButton = (page: Page) => page.locator('.ct-inside').getByRole('button');

/** Leave a cottage with the panel's Leave button (tap on touch devices); wait until outdoors. */
export async function leaveByButton(p: Player, pid: string, opts: { touch?: boolean } = {}): Promise<void> {
  const btn = leaveButton(p.page);
  await expect(btn).toHaveText('Leave', { timeout: 15_000 });
  await expect(btn).toBeEnabled();
  const since = Date.now();
  for (let k = 0; k < 3; k++) {
    if (opts.touch) await btn.tap();
    else await btn.click();
    const ok = await expect
      .poll(() => selfEntity(p, pid)?.location, { timeout: 8000 })
      .toBe('outdoors')
      .then(
        () => true,
        () => false,
      );
    if (ok) break;
  }
  expect(selfEntity(p, pid)?.location, `${p.name}: outdoors after Leave`).toBe('outdoors');
  const t = p.tap.received('world:teleport', since).find((x: any) => x.location === 'outdoors');
  expect(t?.reason, `${p.name}: left through the door`).toBe('door');
  await expect(insidePanel(p.page)).toHaveCount(0, { timeout: 10_000 });
}

/** (v2.2) Inside a cottage: walk (real arrow keys) to the interior door spot just above the doorway. No-op outdoors. */
export async function walkToInteriorDoor(p: Player, pid: string): Promise<void> {
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const loc = selfEntity(p, pid)?.location;
  if (!loc || loc === 'outdoors') return;
  const g = await geo();
  const b = g.L.buildings.find((x) => `bld:${x.id}` === loc);
  if (!b) return;
  const me = selfEntity(p, pid)!;
  const door = g.tileCenterPx(g.L, b.interiorDoor);
  if (Math.hypot(me.x - door.x, me.y - door.y) > 8)
    await walkToTile(p, pid, b.interiorDoor, 120_000); // (may walk out on arrival: pushing DOWN on the door spot)
}

/**
 * Leave a cottage by walking out (v2.2 walkable interiors): real arrow keys to the interior door spot
 * (just above the doorway), then hold DOWN into the doorway until the server has us outdoors.
 * `key` other than ArrowDown/KeyS cannot walk out (kept for the old signature).
 */
export async function leaveByKey(p: Player, pid: string, key = 'ArrowDown'): Promise<void> {
  await walkToInteriorDoor(p, pid);
  if (selfEntity(p, pid)?.location === 'outdoors') return;
  for (let k = 0; k < 3; k++) {
    await p.page.keyboard.down(key);
    await p.page.waitForTimeout(800); // a HELD push (>= EXIT_HOLD_MS, several frames even on a slow box)
    await p.page.keyboard.up(key);
    const ok = await expect
      .poll(() => selfEntity(p, pid)?.location, { timeout: 8000 })
      .toBe('outdoors')
      .then(
        () => true,
        () => false,
      );
    if (ok) return;
  }
  throw new Error(`${p.name}: ${key} inside did not walk us out (at ${selfEntity(p, pid)?.location})`);
}

/** Nudge (single game frames) until within 4 px of `to` on one axis; stops early on a location change. */
async function alignOn(p: Player, pid: string, to: { x: number; y: number }, axis: 'x' | 'y'): Promise<void> {
  const loc0 = selfEntity(p, pid)?.location;
  for (let n = 0; n < 16; n++) {
    const me = selfEntity(p, pid);
    if (!me || me.location !== loc0) return;
    const d = axis === 'x' ? to.x - me.x : to.y - me.y;
    if (Math.abs(d) <= 4) return;
    await holdFrames(p.page, [axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : d > 0 ? 'ArrowDown' : 'ArrowUp'], 1);
    await p.page.waitForTimeout(250);
  }
}

/**
 * Keyboard + automatic door: walk (real arrow keys) onto the cottage's door tile, then keep pushing
 * toward the door until the server has us inside. No E key in v2.
 */
export async function walkIntoDoor(p: Player, pid: string, buildingId: string, budgetMs = 600_000): Promise<void> {
  const g = await geo();
  const b = g.L.buildings.find((x) => x.id === buildingId)!;
  await walkToTile(p, pid, b.door, budgetMs);
  const want0 = `bld:${buildingId}`;
  if (selfEntity(p, pid)?.location === want0) return; // the final step onto the doorstep already went in
  const f = b.footprint;
  // TownScene.setupDoors: inward = up for a door below the footprint, left/right for side doors
  const key = b.door.y >= f.y + f.h ? 'ArrowUp' : b.door.x >= f.x + f.w ? 'ArrowLeft' : b.door.x < f.x ? 'ArrowRight' : 'ArrowUp';
  const want = `bld:${buildingId}`;
  const t0 = Date.now();
  const door = g.tileCenterPx(g.L, b.door);
  for (let k = 0; k < 8; k++) {
    // walkToTile may stop up to ~18 px off (overshoot damping); the door only opens within 11 px of
    // the doorstep and pushing past the footprint edge is blocked: line up across the push first
    await alignOn(p, pid, door, key === 'ArrowUp' ? 'x' : 'y');
    if (selfEntity(p, pid)?.location === want) return;
    await p.page.keyboard.down(key);
    await p.page.waitForTimeout(500);
    await p.page.keyboard.up(key);
    const ok = await expect
      .poll(() => selfEntity(p, pid)?.location, { timeout: 4000 })
      .toBe(want)
      .then(
        () => true,
        () => false,
      );
    if (ok) return;
    // drifted off the doorstep: step back onto it
    const me = selfEntity(p, pid);
    if (me && Math.hypot(me.x - door.x, me.y - door.y) > 9) await walkToTile(p, pid, b.door, 120_000);
  }
  const errs = p.tap.received('error', t0).filter((e: any) => e.for === 'world:useDoor');
  throw new Error(`${p.name}: pushing ${key} into the doorway of ${buildingId} did not enter (at ${JSON.stringify(selfEntity(p, pid))}; useDoor sent ${p.tap.sent('world:useDoor', t0).length}; errors ${JSON.stringify(errs)})`);
}

// ---------------------------------------------------------------------------- v2: voice zones

/**
 * The acoustic zone the SERVER currently grants this client ('square', 'bld:<id>', …) from the
 * decoded voice:grant / voice:revoke frames (purpose 'zone'); null after a revoke / before any grant.
 * Needs a voice-configured server (playwright.config.ts sets fake LiveKit creds: tokens are minted
 * locally, nobody connects).
 */
export function voiceZone(p: Player): string | null {
  for (let i = p.tap.frames.length - 1; i >= 0; i--) {
    const f = p.tap.frames[i]!;
    if (f.dir !== 'in') continue;
    if (f.type === 'voice:grant' && f.payload?.purpose === 'zone') return f.payload.zone;
    if (f.type === 'voice:revoke' && f.payload?.purpose === 'zone') return null;
  }
  return null;
}
/** Every zone ever granted to this client since `since`. */
export function zonesGranted(p: Player, since = 0): string[] {
  return p.tap.received('voice:grant', since).filter((g: any) => g.purpose === 'zone').map((g: any) => g.zone);
}

/**
 * Tap a cottage whose door is locked for us: we walk to its door, nothing is sent to the server
 * (no world:useDoor), we stay outdoors and the door prompt explains it. Returns the prompt text.
 */
export async function tapLockedCottage(p: Player, pid: string, buildingId: string, opts: { touch?: boolean } = {}): Promise<string> {
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 6; attempt++) {
    const me = await settle(p, pid, 900, 60_000);
    const plan = await planCottageTap(p, me, buildingId);
    if (!plan) throw new Error(`${p.name}: nothing to tap toward ${buildingId}`);
    await press(p, plan.sx, plan.sy, !!opts.touch);
    if (plan.kind === 'ground') {
      await p.page.waitForTimeout(1500);
      continue;
    }
    const prompt = p.page.locator('.ct-game-prompt.locked');
    await expect(prompt).toBeVisible({ timeout: 60_000 });
    const text = ((await prompt.textContent()) ?? '').trim();
    await p.page.waitForTimeout(800);
    expect(p.tap.sent('world:useDoor', t0).length, `${p.name}: no door request for a locked cottage`).toBe(0);
    expect(selfEntity(p, pid)?.location, `${p.name}: still outdoors`).toBe('outdoors');
    return text;
  }
  throw new Error(`${p.name}: could not reach ${buildingId} by tapping`);
}

/**
 * (st-ui) The Storyteller panel opens in the simple "script" mode by default; the classic Now strip
 * and tabs (.cts-now-btn, Stage / Grimoire / Night order / Day / Tools / Log) live behind
 * "☰ Grimoire & tools" (remembered per viewer: localStorage ct.st.tools = '1'). Start this
 * Storyteller in tools mode (every later navigation too).
 */
export async function storytellerToolsMode(p: Player): Promise<void> {
  await p.ctx.addInitScript(() => {
    try {
      localStorage.setItem('ct.st.tools', '1');
    } catch {}
  });
  await p.page.evaluate(() => {
    try {
      localStorage.setItem('ct.st.tools', '1');
    } catch {}
  });
}

/** Switch the Storyteller panel between the script and Grimoire & tools (no-op if already there). */
export async function stPanelMode(page: Page, mode: 'script' | 'tools'): Promise<void> {
  const btn = page.getByRole('button', { name: mode === 'script' ? /Back to the script/ : /Grimoire & tools/ });
  if (await btn.count()) await btn.first().click();
  if (mode === 'script') await expect(page.locator('.cts-script')).toBeVisible({ timeout: 15_000 });
  else await expect(page.locator('.cts-tabs')).toBeVisible({ timeout: 15_000 });
}
