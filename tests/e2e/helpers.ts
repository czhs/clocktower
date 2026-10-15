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
      }, { timeout: timeoutMs, message: `${this.label}: ${what}` })
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
