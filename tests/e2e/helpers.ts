// Shared Playwright helpers (qa-deploy): UI account creation and a WebSocket frame tap that decodes
// every Colyseus ROOM_DATA frame a page sends/receives, so specs can assert on exactly what each
// browser was sent (secrecy) without reaching into app internals.
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { unpack } from '@colyseus/msgpackr';

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
      const handle = (dir: 'in' | 'out') => (data: { payload: string | Buffer }) => {
        if (typeof data.payload === 'string') return;
        try {
          const d = decodeRoomData(data.payload);
          if (d) this.frames.push({ at: Date.now(), dir, type: d.type, payload: d.payload });
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
  presets: typeof import('../../packages/assets/src/index.js').CHARACTER_PRESETS;
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
    geoCache = { L: a.townLayout, presets: a.CHARACTER_PRESETS, isBlockedPx: pr.isBlockedPx, locationAt: pr.locationAt, tileCenterPx: pr.tileCenterPx, findPath: path.findPath };
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
  /** Name of the villager picked at sign-up. */
  villager: string | null;
  /** Preset id saved on the account (from /api/me). */
  presetId: string | null;
  console: string[];
}

/**
 * Sign up through the UI like a first-time player: Create account -> display name -> pick a villager
 * from the gallery -> passphrase reveal -> "saved" -> Enter the town. Installs the socket tap.
 */
export async function signUp(
  browser: Browser,
  name: string,
  opts: { viewport?: { width: number; height: number }; villagerIndex?: number; consoleSink?: string[] } = {},
): Promise<GamePlayer> {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': fakeIp() } });
  await installSocketTap(ctx);
  const page = await ctx.newPage();
  const sink = opts.consoleSink ?? [];
  watchConsole(page, name, sink);
  page.on('dialog', (d) => void d.accept());
  const tap = new FrameTap(name, page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(name);
  let villager: string | null = null;
  const gallery = page.getByRole('radiogroup', { name: 'Choose a villager' });
  if (await gallery.count()) {
    const radios = gallery.getByRole('radio');
    const n = await radios.count();
    if (n > 0) {
      const pick = radios.nth((opts.villagerIndex ?? 0) % n);
      await pick.click();
      await expect(pick).toHaveAttribute('aria-checked', 'true');
      villager = await pick.getAttribute('aria-label');
    }
  }
  await page.getByRole('button', { name: 'Create account' }).click();
  const pass = page.getByLabel('Your passphrase');
  await expect(pass).toBeVisible();
  await page.getByLabel('I have saved my passphrase somewhere safe').check();
  await page.getByRole('button', { name: 'Enter the town' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
  const meRes = await page.request.get('/api/me');
  const presetId = ((await meRes.json()) as { cosmetics?: { preset?: string | null } }).cosmetics?.preset ?? null;
  return { name, ctx, page, tap, villager, presetId, console: sink };
}

/** Preset id for a villager display name (sign-up gallery label). */
export async function presetIdByName(name: string | null): Promise<string | null> {
  const { presets } = await geo();
  return (name && presets.find((p) => p.name === name)?.id) || null;
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
    if (Math.abs(d) > 28) await p.page.waitForTimeout(Math.min(2500, (Math.abs(d) / 72) * 1000 * 0.75));
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
      continue;
    }
    still = prev && Math.hypot(pos.x - prev.x, pos.y - prev.y) < 1 ? still + 1 : 0;
    prev = { x: pos.x, y: pos.y };
    // stuck off the planned line (furniture / corners): re-plan from where we actually stand
    if ((still >= 4 || flips >= 4) && replans < 20) {
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
    for (const k of keys) await p.page.keyboard.down(k);
    if (d > 24 && gain > 0.1) await p.page.waitForTimeout(Math.min(3000, (d / 72) * 1000 * gain));
    for (const k of keys) await p.page.keyboard.up(k);
  }
}

/** Press E at a door (the door prompt must be showing) and wait until the server moved us through it. */
export async function useDoorKey(p: Player, pid: string, expectLocation: string, timeoutMs = 20_000): Promise<void> {
  await expect(p.page.locator('.ct-game-prompt')).toBeVisible({ timeout: 10_000 });
  const t0 = Date.now();
  for (;;) {
    await p.page.keyboard.press('KeyE');
    const ok = await expect
      .poll(() => selfEntity(p, pid)?.location, { timeout: 4000 })
      .toBe(expectLocation)
      .then(
        () => true,
        () => false,
      );
    if (ok) return;
    if (Date.now() - t0 > timeoutMs) throw new Error(`${p.name}: door did not take us to ${expectLocation} (at ${selfEntity(p, pid)?.location})`);
  }
}
