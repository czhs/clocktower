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
};
let geoCache: Geo | null = null;
export async function geo(): Promise<Geo> {
  if (!geoCache) {
    const a = await import('../../packages/assets/src/index.js');
    const pr = await import('../../packages/protocol/src/index.js');
    geoCache = { L: a.townLayout, presets: a.CHARACTER_PRESETS, isBlockedPx: pr.isBlockedPx, locationAt: pr.locationAt, tileCenterPx: pr.tileCenterPx };
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
    const W = window as unknown as { __e2e?: { sockets: WebSocket[]; inject(b: number[]): boolean } };
    const Orig = window.WebSocket;
    const sockets: WebSocket[] = [];
    class TapWS extends Orig {
      constructor(u: string | URL, p?: string | string[]) {
        super(u, p);
        if (String(u).includes(location.host)) sockets.push(this);
      }
    }
    window.WebSocket = TapWS as typeof WebSocket;
    W.__e2e = {
      sockets,
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
export async function confirmYes(page: Page): Promise<void> {
  await page.locator('.cts-confirm').getByRole('button', { name: 'Yes', exact: true }).first().click();
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
export async function tilePath(from: { x: number; y: number }, to: { x: number; y: number }, location: string): Promise<{ x: number; y: number }[]> {
  const { L, isBlockedPx, locationAt, tileCenterPx } = await geo();
  const ok = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= L.widthTiles || ty >= L.heightTiles) return false;
    const c = tileCenterPx(L, { x: tx, y: ty });
    return !isBlockedPx(L, c.x, c.y) && locationAt(L, c.x, c.y) === location;
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
  if (!prev.has(key(to.x, to.y))) throw new Error(`no ${location} path from ${from.x},${from.y} to ${to.x},${to.y}`);
  const path: { x: number; y: number }[] = [];
  for (let k = key(to.x, to.y); k !== -1; k = prev.get(k)!) path.unshift({ x: k % L.widthTiles, y: Math.floor(k / L.widthTiles) });
  return path.filter((p, i) => i === 0 || i === path.length - 1 || !((path[i - 1]!.x === p.x && path[i + 1]!.x === p.x) || (path[i - 1]!.y === p.y && path[i + 1]!.y === p.y)));
}

/** Hold an arrow key until the server position reaches `target` on one axis (closed loop, real keyboard). */
export async function walkAxis(p: Player, pid: string, axis: 'x' | 'y', target: number, budgetMs = 90_000): Promise<void> {
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const until = Date.now() + budgetMs;
  const trail: number[] = [];
  for (let i = 0; Date.now() < until; i++) {
    await p.page.waitForTimeout(350);
    const pos = selfEntity(p, pid);
    if (!pos) continue;
    const d = target - pos[axis];
    trail.push(Math.round(pos[axis]));
    if (Math.abs(d) <= 5) return;
    const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : d > 0 ? 'ArrowDown' : 'ArrowUp';
    await p.page.keyboard.down(key);
    await p.page.waitForTimeout(Math.min(2500, Math.max(60, (Math.abs(d) / 72) * 1000 * (Math.abs(d) > 24 ? 0.8 : 0.6))));
    await p.page.keyboard.up(key);
  }
  const pos = selfEntity(p, pid);
  throw new Error(`${p.name}: could not reach ${axis}=${target} (at ${pos?.x},${pos?.y}; trail ${trail.slice(-12).join(',')})`);
}

/** Walk with the real keyboard to a tile of the current location along a collision-free path. */
export async function walkToTile(p: Player, pid: string, to: { x: number; y: number }): Promise<void> {
  const me = selfEntity(p, pid);
  if (!me) throw new Error(`${p.name}: no own entity`);
  const TILE = (await geo()).L.tileSize;
  const start = { x: Math.floor(me.x / TILE), y: Math.floor(me.y / TILE) };
  const path = await tilePath(start, to, me.location);
  // centre on the start tile first (we may stand off-centre), then follow the corners
  const c0 = await tilePx(path[0]!);
  await walkAxis(p, pid, 'x', c0.x);
  await walkAxis(p, pid, 'y', c0.y);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const cb = await tilePx(b);
    if (a.x === b.x) await walkAxis(p, pid, 'y', cb.y);
    else await walkAxis(p, pid, 'x', cb.x);
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
