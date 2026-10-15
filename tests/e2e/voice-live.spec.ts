// LIVE voice E2E (voice2): real Chromium browsers + the real LiveKit Cloud project.
//
// Never runs by default (needs VOICE_E2E=1, LiveKit credentials and an external test server).
// It must NOT point at the prod/dev services: start a throwaway server on 127.0.0.1:3340-3349
// with LIVEKIT_ROOM_PREFIX=voicetest and a temp DB, then on hshi-u1:
//
//   set -a; . ~/clocktower/env/prod.env; set +a; export LIVEKIT_ROOM_PREFIX=voicetest
//   VOICE_E2E=1 E2E_BASE_URL=http://127.0.0.1:3341 VOICE_ADMIN_COOKIE_FILE=… \
//     pnpm exec playwright test -c tests/e2e/playwright.config.ts voice-live
//
// Microphone: Chromium's fake capture device fed from a generated speech-like WAV
// (--use-file-for-fake-audio-capture). VOICE_FAKE_AUDIO=beep uses Chromium's built-in fake device
// instead (a 20 ms beep twice a second) — that is what the first prod probe used.
//
// Evidence comes from both sides:
//   server truth  RoomServiceClient.listParticipants(room) (who is in which LiveKit room, track mute)
//   client truth  voice panel DOM (participants, speaking), the panel's debug overlay (gains), and a
//                 WebAudio tap installed before the app loads: an AnalyserNode on every remote
//                 MediaStream the app feeds into its AudioContext (pre-gain, per participant) and one
//                 on everything the app connects to that context's destination (post-gain output).
// Quota: every LiveKit participant-minute is logged (artifacts/voice-*.json).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from '@colyseus/msgpackr';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { FrameTap } from './helpers';
import { livekitHttpUrl, roomNameFor, RoomServiceClient } from '../../packages/voice/src/index.js';
import { Bot } from '../support/bot.js';
import { townLayout } from '../../packages/assets/src/index.js';
import { isBlockedPx, locationAt, tileCenterPx } from '../../packages/protocol/src/index.js';

const BASE = process.env.E2E_BASE_URL ?? '';
const LK = { url: process.env.LIVEKIT_URL ?? '', key: process.env.LIVEKIT_API_KEY ?? '', secret: process.env.LIVEKIT_API_SECRET ?? '' };
const PREFIX = process.env.LIVEKIT_ROOM_PREFIX ?? '';
const ENABLED = process.env.VOICE_E2E === '1' && /^http:\/\/127\.0\.0\.1:33[4-9]\d$/.test(BASE) && Boolean(LK.url && LK.key && LK.secret) && PREFIX.startsWith('voicetest');
const BEEP = process.env.VOICE_FAKE_AUDIO === 'beep';
const ART = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts');
const SUFFIX = Math.random().toString(36).slice(2, 6);

test.skip(!ENABLED, 'live voice test: needs VOICE_E2E=1, LIVEKIT_* env, LIVEKIT_ROOM_PREFIX=voicetest* and E2E_BASE_URL=http://127.0.0.1:334x');

// --------------------------------------------------------------------------------------------
// Fake microphone: a looping, speech-like signal (voiced "syllables" with a moving pitch and
// formant-shaped harmonics, 240 ms on / 60 ms off), so WebRTC's noise suppression keeps it and
// LiveKit's active-speaker detector sees sustained voice activity.
function writeSpeechWav(file: string) {
  const sr = 48_000;
  const n = sr * 3;
  const f = new Float32Array(n);
  const f0s = [125, 150, 140, 175, 160, 130, 190, 145, 170, 135];
  let phase = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const seg = Math.floor(t / 0.3);
    const w = t - seg * 0.3;
    const env = w < 0.24 ? Math.max(0, Math.min(1, w / 0.02, (0.24 - w) / 0.03)) : 0;
    const f0 = f0s[seg % f0s.length]! * (1 + 0.04 * Math.sin(2 * Math.PI * 5 * t) + 0.08 * (w / 0.24));
    phase += (2 * Math.PI * f0) / sr;
    let s = 0;
    for (let k = 1; k <= 18; k++) {
      const fk = k * f0;
      const formant = Math.exp(-((fk - 650) ** 2) / (2 * 220 ** 2)) + 0.7 * Math.exp(-((fk - 1150) ** 2) / (2 * 260 ** 2)) + 0.35 * Math.exp(-((fk - 2450) ** 2) / (2 * 380 ** 2)) + 0.05;
      s += (formant * Math.sin(k * phase)) / Math.sqrt(k);
    }
    f[i] = s * env;
    peak = Math.max(peak, Math.abs(f[i]!));
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round((f[i]! / peak) * 0.7 * 32767), 44 + i * 2);
  writeFileSync(file, buf);
}

const WAV = path.join(os.tmpdir(), `ct-voice-speech-${process.pid}.wav`);
if (ENABLED && !BEEP) writeSpeechWav(WAV);

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(BEEP ? [] : [`--use-file-for-fake-audio-capture=${WAV}`]), '--autoplay-policy=user-gesture-required'],
  },
});

// --------------------------------------------------------------------------------------------
// Page instrumentation (installed before any app script runs).
function instrument() {
  const W = window as any;
  const T: any = (W.__ctv = { srcs: [], outs: [], sockets: [] });
  const origConnect = AudioNode.prototype.connect as any;
  const origCMSS = AudioContext.prototype.createMediaStreamSource;
  const voiceCtx = new WeakSet<BaseAudioContext>();
  AudioContext.prototype.createMediaStreamSource = function (this: AudioContext, stream: MediaStream) {
    const node = origCMSS.call(this, stream);
    try {
      voiceCtx.add(this);
      const an = this.createAnalyser();
      an.fftSize = 2048;
      origConnect.call(node, an);
      T.srcs.push({ ctx: this, an, stream });
    } catch {
      /* ignore */
    }
    return node;
  };
  (AudioNode.prototype as any).connect = function (this: AudioNode, dest: any, ...rest: any[]) {
    const r = origConnect.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode && voiceCtx.has(dest.context)) {
        let o = T.outs.find((x: any) => x.ctx === dest.context);
        if (!o) {
          const an = dest.context.createAnalyser();
          an.fftSize = 2048;
          o = { ctx: dest.context, an };
          T.outs.push(o);
        }
        origConnect.call(this, o.an);
      }
    } catch {
      /* ignore */
    }
    return r;
  };
  const rms = (an: AnalyserNode) => {
    const b = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(b);
    let s = 0;
    for (const v of b) s += v * v;
    return Math.sqrt(s / b.length);
  };
  T.levels = () => {
    const els = [...document.querySelectorAll('[data-ct-voice-audio] audio')] as HTMLAudioElement[];
    const pidOf = (stream: MediaStream) => els.find((e) => e.srcObject === stream)?.getAttribute('data-pid') ?? null;
    return {
      ctx: T.outs.map((o: any) => o.ctx.state),
      out: Math.max(0, ...T.outs.map((o: any) => rms(o.an))),
      srcs: T.srcs
        .filter((s: any) => s.stream.getAudioTracks()[0]?.readyState === 'live')
        .map((s: any) => ({ pid: pidOf(s.stream), rms: rms(s.an) }))
        .filter((s: any) => s.pid),
    };
  };
  T.sample = (pid: string, ms: number) =>
    new Promise((resolve) => {
      const src: number[] = [];
      const out: number[] = [];
      let ctx: string[] = [];
      const iv = setInterval(() => {
        const l = T.levels();
        ctx = l.ctx;
        src.push(Math.max(0, ...l.srcs.filter((s: any) => s.pid === pid).map((s: any) => s.rms)));
        out.push(l.out);
      }, 20);
      setTimeout(() => {
        clearInterval(iv);
        const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
        const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
        resolve({ srcMax: r4(Math.max(0, ...src)), srcMean: r4(mean(src)), outMax: r4(Math.max(0, ...out)), outMean: r4(mean(out)), n: src.length, ctx });
      }, ms);
    });
  // Recorder: every 20 ms [Date.now(), src rms of pid, output rms, street gain of `name` from the debug overlay].
  T.recStart = (pid: string, name: string | null) => {
    const rows: (number | null)[][] = [];
    const esc = name ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
    const re = esc ? new RegExp(`${esc}: gain ([0-9.]+)`) : null;
    const iv = setInterval(() => {
      const l = T.levels();
      let gain: number | null = null;
      if (re) {
        const m = document.querySelector('.ctv-debug')?.textContent?.match(re);
        gain = m ? Number(m[1]) : null;
      }
      const src = Math.max(0, ...l.srcs.filter((x: any) => x.pid === pid).map((x: any) => x.rms));
      rows.push([Date.now(), Math.round(src * 1e4) / 1e4, Math.round(l.out * 1e4) / 1e4, gain]);
    }, 20);
    T.rec = { iv, rows };
  };
  T.recStop = () => {
    const r = T.rec;
    if (!r) return [];
    clearInterval(r.iv);
    T.rec = null;
    return r.rows;
  };
  // WebRTC stats over every RTCPeerConnection the page created.
  T.pcs = [];
  const OrigPC = W.RTCPeerConnection;
  if (OrigPC) {
    W.RTCPeerConnection = class extends OrigPC {
      constructor(...a: any[]) {
        super(...a);
        T.pcs.push(this);
      }
    };
  }
  T.rtc = async () => {
    const r: any = { pcs: 0, inbound: 0, inboundFlowing: 0, packetsReceived: 0, packetsLost: 0, jitterMaxMs: 0, concealed: 0, concealmentEvents: 0, samples: 0, outbound: 0, rttMs: null };
    for (const pc of T.pcs) {
      if (pc.connectionState === 'closed') continue;
      r.pcs++;
      const st = await pc.getStats();
      st.forEach((x: any) => {
        if (x.type === 'inbound-rtp' && x.kind === 'audio') {
          r.inbound++;
          if ((x.packetsReceived ?? 0) > 0) r.inboundFlowing++;
          r.packetsReceived += x.packetsReceived ?? 0;
          r.packetsLost += Math.max(0, x.packetsLost ?? 0);
          r.jitterMaxMs = Math.max(r.jitterMaxMs, Math.round((x.jitter ?? 0) * 1000));
          r.concealed += x.concealedSamples ?? 0;
          r.concealmentEvents += x.concealmentEvents ?? 0;
          r.samples += x.totalSamplesReceived ?? 0;
        }
        if (x.type === 'outbound-rtp' && x.kind === 'audio') r.outbound++;
        if (x.type === 'candidate-pair' && x.nominated && x.currentRoundTripTime != null) r.rttMs = Math.round(x.currentRoundTripTime * 1000);
      });
    }
    return r;
  };
  // Capture the app's Colyseus socket (same host) so a test can inject a frame (modified client).
  const Orig = W.WebSocket;
  class TapWS extends Orig {
    constructor(u: string | URL, p?: string | string[]) {
      super(u, p);
      if (String(u).includes(location.host)) T.sockets.push(this);
    }
  }
  W.WebSocket = TapWS;
  T.inject = (bytes: number[]) => {
    const s = [...T.sockets].reverse().find((x: WebSocket) => x.readyState === 1);
    if (!s) return false;
    Orig.prototype.send.call(s, new Uint8Array(bytes));
    return true;
  };
}

/** Colyseus ROOM_DATA frame [13][fixstr type][msgpack payload] (what room.send() produces). */
function roomFrame(type: string, payload: unknown): number[] {
  const t = Buffer.from(type, 'utf8');
  return [13, 0xa0 | t.length, ...t, ...pack(payload)];
}

// --------------------------------------------------------------------------------------------
// Players, LiveKit truth, logging

interface P {
  name: string;
  ctx: BrowserContext;
  page: Page;
  tap: FrameTap;
  pid: () => string;
}

const log: { t: number; what: string; data?: unknown }[] = [];
const T0 = Date.now();
function note(what: string, data?: unknown) {
  // Never record LiveKit tokens (browser console errors include access_token=… URLs).
  if (data !== undefined) data = JSON.parse(JSON.stringify(data).replace(/(access_token=)[A-Za-z0-9._-]+/g, '$1<redacted>').replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g, '<jwt redacted>'));
  log.push({ t: Date.now() - T0, what, ...(data !== undefined ? { data } : {}) });
  console.log(`[voice ${((Date.now() - T0) / 1000).toFixed(1)}s] ${what}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`);
}

/** LiveKit participant-minutes used by this run: connected-interval per browser. */
const usage = new Map<string, { since: number | null; ms: number }>();
function lkConnected(name: string, on: boolean) {
  const u = usage.get(name) ?? { since: null, ms: 0 };
  if (on && u.since === null) u.since = Date.now();
  if (!on && u.since !== null) {
    u.ms += Date.now() - u.since;
    u.since = null;
  }
  usage.set(name, u);
}
function usedMinutes() {
  let ms = 0;
  for (const u of usage.values()) ms += u.ms + (u.since !== null ? Date.now() - u.since : 0);
  return Math.round((ms / 60_000) * 10) / 10;
}

let ipNo = 0;
const fakeIp = () => `10.88.${(process.pid + ++ipNo) % 250}.${ipNo % 250}`;

async function newPlayer(browser: Browser, name: string, opts: { permissions?: string[]; init?: () => void; viewport?: { width: number; height: number }; userAgent?: string } = {}): Promise<P> {
  const ctx = await browser.newContext({
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
    baseURL: BASE,
    viewport: opts.viewport ?? { width: 800, height: 600 }, // small canvas: the host is CPU-starved
    ...(opts.permissions ? (opts.permissions.length ? { permissions: opts.permissions } : {}) : { permissions: ['microphone'] }),
    extraHTTPHeaders: { 'X-Forwarded-For': fakeIp() },
  });
  await ctx.addInitScript(instrument);
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const tap = new FrameTap(name, page);
  const r = await page.request.post('/api/auth/create', { data: { displayName: name } });
  expect(r.status(), `create ${name}`).toBe(201);
  page.on('response', (r) => {
    if (r.status() >= 400) {
      const u = new URL(r.url());
      note(`${name} HTTP ${r.status()}`, `${u.origin}${u.pathname}`); // never the query (tokens)
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|ERR_ABORTED|DataChannel error|data channel '.*' closed/.test(m.text())) note(`${name} console.error`, m.text().slice(0, 200));
  });
  return { name, ctx, page, tap, pid: () => tap.last('lobby:view')?.youPid };
}

async function createLobby(p: P, title: string, maxPlayers = 8): Promise<string> {
  const r = await p.page.request.post('/api/lobbies', { data: { name: title, maxPlayers } });
  expect(r.status()).toBe(201);
  return (await r.json()).lobby.id as string;
}

async function enterLobby(p: P, lobbyId: string) {
  await p.page.goto(`/lobby/${lobbyId}`);
  await p.tap.until(() => p.pid() && p.tap.last('world:snapshot'), 20_000, 'lobby view + snapshot');
}

async function enableVoice(p: P, timeout = 20_000) {
  await p.page.getByRole('button', { name: 'Enable voice' }).click();
  await expect(p.page.locator('.ctv-dot-ok, .ctv-dot-live')).toBeVisible({ timeout });
  lkConnected(p.name, true);
  await expect(p.page.locator('.ctv-tx')).not.toHaveText(/Waiting for microphone/, { timeout: 10_000 });
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function closeAll(ps: P[]) {
  for (const p of ps) {
    lkConnected(p.name, false);
    await p.ctx.close().catch(() => undefined);
  }
}

const svc = ENABLED ? new RoomServiceClient(livekitHttpUrl(LK.url), LK.key, LK.secret) : (null as unknown as RoomServiceClient);
async function lkList(room: string) {
  try {
    const ps = await svc.listParticipants(room);
    return ps.map((p) => ({ identity: p.identity, state: p.state, tracks: p.tracks.map((t) => ({ source: t.source, muted: t.muted })) }));
  } catch {
    return [];
  }
}
async function lkIdentities(room: string) {
  return (await lkList(room)).map((p) => p.identity).sort();
}
const roomOf = (lobby: string, zone: string) => roomNameFor(PREFIX, lobby, zone as never);

/** Levels of `fromPid` as received by `p`, sampled in-page every 20 ms for `ms`. */
async function sample(p: P, fromPid: string, ms: number) {
  return p.page.evaluate(([pid, dur]) => (window as any).__ctv.sample(pid, dur), [fromPid, ms] as const);
}

const AUDIBLE = 0.01;
const SILENT = 0.002;

async function peopleNames(p: P): Promise<string[]> {
  // first text node only (the name), without the 'muted' / 'herald' tags
  return p.page.locator('.ctv-people li .ctv-name').evaluateAll((els) => els.map((e) => (e.firstChild?.textContent ?? '').trim()));
}
/** In-page watch: ms until `name` is shown speaking in p's panel (-1 on timeout). Start before acting. */
function speakingAfter(p: P, name: string, timeoutMs = 20_000): Promise<number> {
  return p.page.evaluate(
    ([n, to]) =>
      new Promise<number>((resolve) => {
        const t0 = performance.now();
        const iv = setInterval(() => {
          const hit = [...document.querySelectorAll('.ctv-people li.speaking .ctv-name')].some((e) => (e.firstChild?.textContent ?? '').trim() === n);
          if (hit || performance.now() - t0 > to) {
            clearInterval(iv);
            resolve(hit ? Math.round(performance.now() - t0) : -1);
          }
        }, 25);
      }),
    [name, timeoutMs] as const,
  );
}
const speakingLi = (p: P, name: string) => p.page.locator('.ctv-people li.speaking', { hasText: name });

async function myPos(p: P): Promise<{ x: number; y: number; location: string }> {
  const s = p.tap.last('world:snapshot');
  const e = s?.entities?.find((x: any) => x.id === p.pid());
  if (!e) throw new Error(`${p.name}: no own entity in snapshot`);
  return e;
}

/** Walk with the real keyboard along one axis to `target` (closed loop on the server snapshot). */
async function walkAxis(p: P, axis: 'x' | 'y', target: number) {
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const trail: number[] = [];
  // Time-budgeted: on a CPU-starved host Phaser may render ~1-2 fps (movement is capped at 0.1 s of
  // travel per frame), so progress per key hold is unpredictable.
  const until = Date.now() + 120_000;
  for (let i = 0; Date.now() < until; i++) {
    await p.page.waitForTimeout(500);
    const pos = await myPos(p);
    const d = target - pos[axis];
    trail.push(Math.round(pos[axis]));
    if (Math.abs(d) <= 12) return;
    const key = axis === 'x' ? (d > 0 ? 'ArrowRight' : 'ArrowLeft') : d > 0 ? 'ArrowDown' : 'ArrowUp';
    await p.page.keyboard.down(key);
    await p.page.waitForTimeout(Math.min(3000, Math.max(100, (Math.abs(d) / 72) * 1000 * (i === 0 ? 0.95 : 0.8))));
    await p.page.keyboard.up(key);
  }
  const pos = await myPos(p);
  if (Math.abs(target - pos[axis]) > 20) throw new Error(`${p.name}: could not reach ${axis}=${target} (at ${pos.x},${pos.y}; trail ${trail.slice(-12).join(',')})`);
}
const TS = 16;
const tileX = (tx: number) => tx * TS + TS / 2;
const tileY = (ty: number) => ty * TS + TS - 2;

/** Outdoor tile path (4-neighbour BFS on the real collision map), compressed to straight runs. */
function tilePath(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
  const L = townLayout;
  const ok = (tx: number, ty: number) => {
    const c = tileCenterPx(L, { x: tx, y: ty });
    return !isBlockedPx(L, c.x, c.y) && locationAt(L, c.x, c.y) === 'outdoors';
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
  if (!prev.has(key(to.x, to.y))) throw new Error(`no path to ${to.x},${to.y}`);
  const path: { x: number; y: number }[] = [];
  for (let k = key(to.x, to.y); k !== -1; k = prev.get(k)!) path.unshift({ x: k % L.widthTiles, y: Math.floor(k / L.widthTiles) });
  // keep corners only
  return path.filter((p, i) => i === 0 || i === path.length - 1 || !((path[i - 1]!.x === p.x && path[i + 1]!.x === p.x) || (path[i - 1]!.y === p.y && path[i + 1]!.y === p.y)));
}

/** Walk (real keyboard) to an outdoor tile along a collision-free path. */
async function walkTo(p: P, tx: number, ty: number) {
  const me = await myPos(p);
  const start = { x: Math.floor(me.x / TS), y: Math.floor((me.y - 1) / TS) };
  const path = tilePath(start, { x: tx, y: ty });
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (a.x === b.x) {
      await walkAxis(p, 'x', tileX(a.x));
      await walkAxis(p, 'y', tileY(b.y));
    } else {
      await walkAxis(p, 'y', tileY(a.y));
      await walkAxis(p, 'x', tileX(b.x));
    }
  }
}

// Exact server-side positioning (modified-client style): real 'move' frames injected into the
// page's own Colyseus socket, <= 60 px/s along straight open lines, then a deliberate invalid move so
// the server answers with a 'correction' teleport and the page's own predicted position re-syncs
// (street attenuation uses the listener's client-side position). Used because keyboard walking on
// the CPU-starved host (Phaser at ~1-2 fps) is not precise. After this the page's own keyboard
// moves carry stale seq numbers and are ignored, so a driven player stays driven.
const seqOf = new Map<P, number>();
async function drive(p: P, to: { x: number; y: number }, speed = 60) {
  let seq = seqOf.get(p) ?? Math.max(0, ...p.tap.sent('move').map((m: any) => m.seq ?? 0)) + 1;
  const cur = await myPos(p);
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - cur.x, to.y - cur.y) / (speed / 10)));
  for (let i = 1; i <= n; i++) {
    const t = Date.now();
    const q = { x: cur.x + ((to.x - cur.x) * i) / n, y: cur.y + ((to.y - cur.y) * i) / n };
    await p.page.evaluate((b) => (window as any).__ctv.inject(b), roomFrame('move', { seq: seq++, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100, facing: 'down', moving: i < n }));
    await new Promise((r) => setTimeout(r, Math.max(0, 100 - (Date.now() - t))));
  }
  // sync the page's predicted position to the server's
  const tSync = Date.now();
  await p.page.evaluate((b) => (window as any).__ctv.inject(b), roomFrame('move', { seq: seq++, x: to.x + 2000, y: to.y, facing: 'down', moving: false }));
  seqOf.set(p, seq);
  await p.tap.until(() => p.tap.received('world:teleport', tSync).some((t: any) => t.reason === 'correction'), 10_000, 'correction teleport');
  const at = await myPos(p);
  if (Math.hypot(at.x - to.x, at.y - to.y) > 2) throw new Error(`${p.name}: drive ended at ${at.x},${at.y} not ${to.x},${to.y}`);
}
async function useDoor(p: P, buildingId: string) {
  await p.page.evaluate((b) => (window as any).__ctv.inject(b), roomFrame('world:useDoor', { buildingId }));
}

function lastGrant(p: P, since = 0) {
  const g = p.tap.received('voice:grant', since).filter((x: any) => x.purpose === 'zone');
  return g.at(-1);
}

async function adminVoice(request: APIRequestContext) {
  const f = process.env.VOICE_ADMIN_COOKIE_FILE;
  if (!f) return null;
  const r = await request.get(`${BASE}/api/admin/status`, { headers: { Cookie: readFileSync(f, 'utf8').trim() } });
  if (r.status() !== 200) return { status: r.status() };
  return (await r.json()).voice;
}

// Raw LiveKit signalling join (what a modified client replaying a token would do; no media).
async function rawJoin(token: string): Promise<{ joined: boolean; close: () => void; closed: Promise<number> }> {
  const ws = new WebSocket(`${LK.url.replace(/\/$/, '')}/rtc?access_token=${encodeURIComponent(token)}&auto_subscribe=1&sdk=js&version=2.22.4&protocol=16&adaptive_stream=0`);
  ws.binaryType = 'arraybuffer';
  let resolveClosed!: (c: number) => void;
  const closed = new Promise<number>((r) => (resolveClosed = r));
  ws.onclose = (e) => resolveClosed(e.code);
  const joined = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 8000);
    ws.onmessage = () => {
      clearTimeout(t);
      resolve(true);
    };
    ws.onerror = () => {
      clearTimeout(t);
      resolve(false);
    };
  });
  return { joined, close: () => ws.close(), closed };
}
async function validateStatus(token: string): Promise<number> {
  const base = livekitHttpUrl(LK.url);
  for (const p of ['/rtc/validate', '/rtc/v1/validate']) {
    const res = await fetch(`${base}${p}?access_token=${encodeURIComponent(token)}`);
    if (res.status !== 404) return res.status;
  }
  return 404;
}
function forgeRoom(token: string, room: string): string {
  const [h, pl, s] = token.split('.') as [string, string, string];
  const payload = JSON.parse(Buffer.from(pl, 'base64url').toString('utf8'));
  payload.video.room = room;
  return `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
}

function saveEvidence(file: string, extra: Record<string, unknown>) {
  mkdirSync(ART, { recursive: true });
  writeFileSync(path.join(ART, file.replace(/\.json$/, `-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)), JSON.stringify({ participantMinutes: usedMinutes(), ...extra, log }, null, 2));
}


const STAGES = new Set((process.env.VOICE_STAGES ?? 'square,boundary,street,building,replay,access,crosslobby').split(','));
type Row = [number, number, number, number | null]; // [t, src, out, gain]

async function recStart(p: P, fromPid: string, gainOfName: string | null = null) {
  await p.page.evaluate(([pid, n]) => (window as any).__ctv.recStart(pid, n), [fromPid, gainOfName] as const);
}
async function recStop(p: P): Promise<Row[]> {
  return p.page.evaluate(() => (window as any).__ctv.recStop());
}
/** Silent runs (src < SILENT) longer than `minMs` inside [from, to] — the WAV's own gaps are 60 ms. */
function dropouts(rows: Row[], from: number, to: number, minMs = 150) {
  const r = rows.filter((x) => x[0] >= from && x[0] <= to);
  const gaps: number[] = [];
  let start: number | null = null;
  for (const [t, src] of r) {
    if (src < SILENT) start ??= t;
    else if (start !== null) {
      if (t - start >= minMs) gaps.push(t - start);
      start = null;
    }
  }
  if (start !== null && r.length && r.at(-1)![0] - start >= minMs) gaps.push(r.at(-1)![0] - start);
  return { samples: r.length, gaps: gaps.length, longestGapMs: gaps.length ? Math.max(...gaps) : 0 };
}
/** Ms between `ref` and the last audible sample after it (<=0: nothing audible after ref). */
function leakAfter(rows: Row[], ref: number) {
  const after = rows.filter((x) => x[0] >= ref && x[1] >= AUDIBLE);
  return after.length ? after.at(-1)![0] - ref : 0;
}
const frameAt = (p: P, type: string, pred: (x: any) => boolean, since = 0) => p.tap.frames.find((f) => f.dir === 'in' && f.type === type && f.at >= since && pred(f.payload))?.at ?? null;
async function openMic(p: P) {
  await p.page.getByRole('button', { name: 'Open mic' }).click();
  await expect(p.page.locator('.ctv-tx')).toHaveText('Transmitting');
  await p.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}
/** Poll two LiveKit rooms every ~250 ms; returns whether `pid` was ever listed in both at once. */
function watchRooms(rooms: string[], pid: string) {
  // per room: '' = absent, else `<state>/<mic muted?>` (state 0 joining, 1 joined, 2 active, 3 disconnected)
  const seen: { t: number; in: string[] }[] = [];
  let on = true;
  const done = (async () => {
    while (on) {
      const lists = await Promise.all(rooms.map((r) => lkList(r)));
      seen.push({
        t: Date.now(),
        in: lists.map((l) => {
          const me = l.find((x) => x.identity === pid);
          return me ? `${me.state}/${me.tracks[0] ? (me.tracks[0].muted ? 'muted' : 'live') : 'none'}` : '';
        }),
      });
      await new Promise((r) => setTimeout(r, 150));
    }
  })();
  return {
    async stop() {
      on = false;
      await done;
      const both = seen.filter((x) => x.in.every(Boolean));
      return {
        polls: seen.length,
        overlap: both.length,
        // listed in both rooms with a live (unmuted) mic in both
        overlapLive: both.filter((x) => x.in.every((v) => v.endsWith('/live'))).length,
        timeline: seen.map((x) => `${x.t % 100000}:${x.in.map((v) => v || '-').join('|')}`),
      };
    },
  };
}
const posOf = (p: P, pid: string) => p.tap.last('world:snapshot')?.entities?.find((e: any) => e.id === pid);
/** Distance between two pids as seen in p's snapshot stream at time t. */
function distAt(p: P, a: string, b: string, t: number): number {
  let best: any = null;
  for (const f of p.tap.frames) if (f.dir === 'in' && f.type === 'world:snapshot' && f.at <= t) best = f;
  const ea = best?.payload?.entities?.find((e: any) => e.id === a);
  const eb = best?.payload?.entities?.find((e: any) => e.id === b);
  return ea && eb ? Math.hypot(ea.x - eb.x, ea.y - eb.y) : -1;
}
async function twirp(method: string, token: string, body: unknown) {
  const res = await fetch(`${livekitHttpUrl(LK.url)}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.status;
}

// ============================================================================================
// 1. Core: square (open mic, PTT, mute, deafen, speaking) / boundary / street / buildings /
//    replay sweeps / access control / cross-lobby / quota. SIMULATED microphone (generated WAV).
test('voice core (SIMULATED mic)', async ({ browser, request }) => {
  test.setTimeout(900_000);
  const ps: P[] = [];
  const results: Record<string, string> = {};
  const quota: unknown[] = [];
  try {
    quota.push({ at: 'start', voice: await adminVoice(request) });
    const A = await newPlayer(browser, `VoxA ${SUFFIX}`);
    const B = await newPlayer(browser, `VoxB ${SUFFIX}`);
    ps.push(A, B);
    const lobby = await createLobby(A, `Voice ${SUFFIX}`);
    await enterLobby(A, lobby);
    await enterLobby(B, lobby);
    const square = roomOf(lobby, 'square');
    const streetRoom = roomOf(lobby, 'street');
    const bld = roomOf(lobby, 'bld:clocktower');
    note('lobby', { lobby, square, A: A.pid(), B: B.pid() });

    await enableVoice(A);
    await enableVoice(B);
    await expect.poll(() => peopleNames(B), { timeout: 15_000 }).toContain(A.name);
    await expect.poll(() => peopleNames(A), { timeout: 15_000 }).toContain(B.name);
    await expect.poll(() => lkIdentities(square), { timeout: 15_000 }).toEqual([A.pid(), B.pid()].sort());
    note('both in square (server)', await lkList(square));
    const aMuted = async () => (await lkList(square)).find((p) => p.identity === A.pid())?.tracks[0]?.muted;

    // ---------------------------------------------------------------- square
    if (STAGES.has('square')) {
      const base = await sample(B, A.pid(), 1500);
      note('B hears A while A is PTT-idle (expect silence)', base);
      expect(base.srcMax).toBeLessThan(SILENT);
      const speakingP = speakingAfter(B, A.name);
      await A.page.getByRole('button', { name: 'Open mic' }).click();
      await expect(A.page.locator('.ctv-tx')).toHaveText('Transmitting');
      await expect.poll(aMuted, { timeout: 25_000 }).toBe(false);
      const heard = await sample(B, A.pid(), 3000);
      note('B hears A (open mic)', heard);
      const speakingMs = await speakingP;
      note('B shows A speaking: ms after the Open-mic click', speakingMs);
      expect(speakingMs, 'B shows A speaking').toBeGreaterThan(0);
      await expect(A.page.locator('.ctv-tx.speaking')).toBeVisible({ timeout: 10_000 });
      expect(heard.srcMax, 'B receives non-silent audio from A').toBeGreaterThan(AUDIBLE);
      expect(heard.outMax, "B's output graph carries it").toBeGreaterThan(AUDIBLE);
      results.square_open_mic = `pass: srcMax ${heard.srcMax} outMax ${heard.outMax}, speaking shown ${speakingMs} ms after click`;

      await A.page.getByRole('button', { name: 'Mute' }).click();
      await expect.poll(aMuted, { timeout: 25_000 }).toBe(true);
      await expect(B.page.locator('.ctv-people li', { hasText: A.name }).locator('.ctv-tag', { hasText: 'muted' })).toBeVisible({ timeout: 10_000 });
      await B.page.waitForTimeout(500);
      const muted = await sample(B, A.pid(), 1500);
      note('A muted: B levels', muted);
      expect(muted.srcMax).toBeLessThan(SILENT);
      await expect(speakingLi(B, A.name)).toHaveCount(0, { timeout: 10_000 });
      await A.page.getByRole('button', { name: 'Unmute' }).click();
      await expect.poll(async () => (await sample(B, A.pid(), 600)).srcMax, { timeout: 10_000 }).toBeGreaterThan(AUDIBLE);
      results.mute = `pass: server muted=true, B srcMax ${muted.srcMax}; unmute restores audio`;

      await B.page.getByRole('button', { name: 'Deafen' }).click();
      await B.page.waitForTimeout(800);
      const deaf = await sample(B, A.pid(), 1500);
      note('B deafened: levels', deaf);
      expect(deaf.srcMax).toBeGreaterThan(AUDIBLE);
      expect(deaf.outMax).toBeLessThan(SILENT);
      await B.page.getByRole('button', { name: 'Undeafen' }).click();
      await B.page.waitForTimeout(800);
      const undeaf = await sample(B, A.pid(), 1500);
      note('B undeafened: levels', undeaf);
      expect(undeaf.outMax).toBeGreaterThan(AUDIBLE);
      results.deafen = `pass: deafened outMax ${deaf.outMax} (src ${deaf.srcMax}); undeafened outMax ${undeaf.outMax}`;

      await A.page.getByRole('button', { name: 'Push-to-talk' }).click();
      await A.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect.poll(aMuted, { timeout: 25_000 }).toBe(true);
      await B.page.waitForTimeout(500);
      const idle = await sample(B, A.pid(), 1200);
      const pttSpeakingP = speakingAfter(B, A.name);
      await A.page.keyboard.down('KeyV');
      await expect(A.page.locator('.ctv-tx')).toHaveText('Transmitting');
      const ptt = await sample(B, A.pid(), 2500);
      const pttSpeaking = await pttSpeakingP;
      await A.page.keyboard.up('KeyV');
      await B.page.waitForTimeout(600);
      const released = await sample(B, A.pid(), 1200);
      note('PTT idle / held / released', { idle, ptt, pttSpeakingAfterMs: pttSpeaking, released });
      expect(pttSpeaking, 'B shows A speaking while V is held').toBeGreaterThan(0);
      expect(idle.srcMax).toBeLessThan(SILENT);
      expect(ptt.srcMax).toBeGreaterThan(AUDIBLE);
      expect(released.srcMax).toBeLessThan(SILENT);
      results.ptt = `pass: idle ${idle.srcMax}, held ${ptt.srcMax} (speaking after ${pttSpeaking} ms), released ${released.srcMax}`;
    }
    if (!(await A.page.locator('.ctv-tx', { hasText: 'Transmitting' }).count())) await openMic(A);
    quota.push({ at: 'after square', voice: await adminVoice(request) });

    // ---------------------------------------------------------------- square boundary + jitter
    if (STAGES.has('boundary')) {
      const L = townLayout;
      const cx = L.square.cx;
      const edgeY = L.square.cy + L.square.r; // straight south of the centre, x = cx
      const leaveY = edgeY + 24; // hysteresis: leave only beyond r + 24 px
      const STEP_MS = 100;
      type Pt = { x: number; y: number };
      const line = (from: Pt, to: Pt, speed = 60): Pt[] => {
        const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / ((speed * STEP_MS) / 1000)));
        return Array.from({ length: n }, (_, i) => ({ x: from.x + ((to.x - from.x) * (i + 1)) / n, y: from.y + ((to.y - from.y) * (i + 1)) / n }));
      };
      const hold = (p: Pt, ms: number): Pt[] => Array.from({ length: Math.round(ms / STEP_MS) }, () => ({ ...p }));
      const jitter = (ms: number): Pt[] => Array.from({ length: ms / STEP_MS }, (_, i) => ({ x: cx, y: edgeY + 15 * Math.sin((2 * Math.PI * i * STEP_MS) / 1600) }));

      // (a) Zone switching with exact timing: a protocol bot K (colyseus.js from Node, no LiveKit)
      //     receives the same voice:grant / voice:revoke messages a browser would.
      const K = new Bot(`VoxK ${SUFFIX}`, BASE, BASE.replace(/^http/, 'ws'), { headers: { 'X-Forwarded-For': fakeIp() } });
      await K.signUp();
      await K.join(lobby);
      await expect.poll(() => K.pos, { timeout: 10_000 }).toBeTruthy();
      let kseq = 1;
      let kcur: Pt = { x: K.pos!.x, y: K.pos!.y };
      const kdrive = async (pts: Pt[]) => {
        for (const q of pts) {
          const t = Date.now();
          K.send('move', { seq: kseq++, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100, facing: 'down', moving: true });
          kcur = q;
          await new Promise((r) => setTimeout(r, Math.max(0, STEP_MS - (Date.now() - t))));
        }
      };
      await kdrive(line(kcur, { x: cx, y: kcur.y }));
      await kdrive(line(kcur, { x: cx, y: edgeY }));
      await new Promise((r) => setTimeout(r, 2000));
      const kSince = (a: number, b: number, type: string) => K.recorder.messages.filter((m) => m.type === type && m.at >= a && m.at < b + 1200).length;
      const kPhases: Record<string, { grants: number; revokes: number; ms: number }> = {};
      const kRun = async (name: string, pts: Pt[]) => {
        const a = Date.now();
        await kdrive(pts);
        const b = Date.now();
        await new Promise((r) => setTimeout(r, 1200));
        kPhases[name] = { grants: kSince(a, b, 'voice:grant'), revokes: kSince(a, b, 'voice:revoke'), ms: b - a };
      };
      await kRun('parked15s', hold(kcur, 15_000));
      await kRun('jitter30s', jitter(30_000));
      const dashes: Pt[] = [];
      let d0: Pt = { x: cx, y: edgeY };
      for (let i = 0; i < 5; i++) {
        const out = line(d0, { x: cx, y: edgeY + 40 }, 70);
        const back = line(out.at(-1)!, { x: cx, y: edgeY - 4 }, 70);
        dashes.push(...out, ...back, ...hold(back.at(-1)!, 1000));
        d0 = back.at(-1)!;
      }
      const beyondPerDash = (line({ x: cx, y: edgeY }, { x: cx, y: edgeY + 40 }, 70).filter((q) => q.y > leaveY).length + line({ x: cx, y: edgeY + 40 }, { x: cx, y: edgeY - 4 }, 70).filter((q) => q.y > leaveY).length) * STEP_MS;
      await kRun('dashes', dashes);
      const ctrlOut = line(d0, { x: cx, y: edgeY + 40 }, 70);
      await kRun('control1500ms', [...ctrlOut, ...hold(ctrlOut.at(-1)!, 1500), ...line(ctrlOut.at(-1)!, { x: cx, y: edgeY - 10 }, 70), ...hold({ x: cx, y: edgeY - 10 }, 1500)]);
      const kCorr = K.recorder.messages.filter((m) => m.type === 'world:teleport' && (m.payload as any)?.reason === 'correction').length;
      await K.leave().catch(() => undefined);
      note('boundary: zone switches (bot K, exact timing)', { phases: kPhases, nominalMsBeyondLeavePerDash: beyondPerDash, serverCorrections: kCorr });
      expect(kCorr).toBe(0);
      expect(kPhases.parked15s!.grants + kPhases.parked15s!.revokes).toBe(0);
      expect(kPhases.jitter30s!.grants + kPhases.jitter30s!.revokes).toBe(0);
      expect(kPhases.dashes!.grants + kPhases.dashes!.revokes).toBe(0);
      expect(kPhases.control1500ms!.revokes).toBeGreaterThanOrEqual(1);

      // (b) Audio continuity on the edge: browser J (transmitting) parked exactly on the edge and
      //     then jittering ±15 px across it (moves injected from Node, so timing is loose); B listens.
      const J = await newPlayer(browser, `VoxJ ${SUFFIX}`);
      ps.push(J);
      await enterLobby(J, lobby);
      await enableVoice(J);
      await openMic(J);
      await drive(B, { x: townLayout.square.cx, y: tileY(56) });
      let jseq = Math.max(0, ...J.tap.sent('move').map((m: any) => m.seq ?? 0)) + 1;
      let jcur: Pt = await myPos(J);
      const jdrive = async (pts: Pt[]) => {
        for (const q of pts) {
          const t = Date.now();
          await J.page.evaluate((b) => (window as any).__ctv.inject(b), roomFrame('move', { seq: jseq++, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100, facing: 'down', moving: true }));
          jcur = q;
          await new Promise((r) => setTimeout(r, Math.max(0, STEP_MS - (Date.now() - t))));
        }
      };
      await jdrive(line(jcur, { x: cx, y: jcur.y }));
      await jdrive(line(jcur, { x: cx, y: edgeY }));
      await J.page.waitForTimeout(2000);
      const stats0 = await B.page.evaluate(() => (window as any).__ctv.rtc());
      const listed: boolean[] = [];
      const onServer: boolean[] = [];
      let polling = true;
      const poller = (async () => {
        while (polling) {
          listed.push((await peopleNames(B)).includes(J.name));
          onServer.push((await lkIdentities(square)).includes(J.pid()!));
          await new Promise((r) => setTimeout(r, 1000));
        }
      })();
      const tj = Date.now();
      await J.page.waitForTimeout(15_000);
      await jdrive(jitter(20_000));
      const tj2 = Date.now();
      polling = false;
      await poller;
      const stats1 = await B.page.evaluate(() => (window as any).__ctv.rtc());
      const jys = J.tap.frames
        .filter((f) => f.dir === 'in' && f.type === 'world:snapshot' && f.at >= tj && f.at <= tj2)
        .map((f) => f.payload.entities.find((e: any) => e.id === J.pid())?.y)
        .filter((y: unknown): y is number => typeof y === 'number')
        .map((y: number) => Math.round(y - edgeY));
      const audio = {
        durationMs: tj2 - tj,
        offsetPx: [Math.min(...jys), Math.max(...jys)],
        jGrantsRevokes: J.tap.received('voice:grant', tj).length + J.tap.received('voice:revoke', tj).length,
        bListedJ: `${listed.filter(Boolean).length}/${listed.length}`,
        serverJInSquare: `${onServer.filter(Boolean).length}/${onServer.length}`,
        concealmentEvents: stats1.concealmentEvents - stats0.concealmentEvents,
        concealedMs: Math.round((stats1.concealed - stats0.concealed) / 48),
        receivedMs: Math.round((stats1.samples - stats0.samples) / 48),
        packetsLost: stats1.packetsLost - stats0.packetsLost,
      };
      note('boundary: audio continuity (browser J -> B)', audio);
      lkConnected(J.name, false);
      await J.ctx.close();
      ps.splice(ps.indexOf(J), 1);
      expect(audio.jGrantsRevokes).toBe(0);
      expect(listed.every(Boolean) && onServer.every(Boolean)).toBe(true);
      results.boundary = `pass: bot K (exact 100 ms steps): parked on the edge 15 s -> ${kPhases.parked15s!.grants}/${kPhases.parked15s!.revokes} grants/revokes; jitter ±15 px 30 s -> 0/0; 5 dashes to r+40 (~${beyondPerDash} ms beyond r+24 each) -> 0/0 (debounced); control 1.5 s beyond -> ${kPhases.control1500ms!.grants}/${kPhases.control1500ms!.revokes}. Browser J on the edge ${Math.round(audio.durationMs / 1000)} s (offset ${audio.offsetPx.join('..')} px): 0 switches, B listed J ${audio.bListedJ} polls, server ${audio.serverJInSquare}; B receive: ${audio.concealmentEvents} concealment events, ${audio.concealedMs} ms concealed of ${audio.receivedMs} ms, ${audio.packetsLost} packets lost`;
    }

    // ---------------------------------------------------------------- street attenuation
    if (STAGES.has('street')) {
      await B.page.locator('.ctv-icon[title="Voice debug overlay"]').click();
      // Open route: column 48 runs straight south from the square to the east-west street (row 66).
      const cx = townLayout.square.cx;
      await drive(B, { x: cx, y: tileY(62) });
      await drive(A, { x: cx, y: tileY(66) });
      await expect.poll(() => lkIdentities(streetRoom), { timeout: 20_000 }).toEqual([A.pid(), B.pid()].sort());
      await expect.poll(() => lkIdentities(square), { timeout: 15_000 }).toEqual([]);
      await expect(B.page.locator('.ctv-zone')).toHaveText('Streets');
      const bAt = await myPos(B);
      const dy = tileY(66) - bAt.y; // A stays on row 66; horizontal offset sets the distance
      note('both in street (server)', { street: await lkIdentities(streetRoom), B: bAt, verticalOffsetPx: dy });
      await recStart(B, A.pid(), A.name);
      const dwell: { tiles: number; from: number; to: number }[] = [];
      await A.page.waitForTimeout(2500);
      for (const tiles of [6, 8, 10, 12]) {
        await drive(A, { x: bAt.x + Math.sqrt((tiles * TS) ** 2 - dy * dy), y: tileY(66) });
        const from = Date.now();
        await A.page.waitForTimeout(4000);
        dwell.push({ tiles, from: from + 1500, to: Date.now() });
      }
      const tBack = Date.now();
      await drive(A, { x: bAt.x, y: tileY(66) }); // walk back to 4 tiles (straight below B)
      await A.page.waitForTimeout(3000);
      const rows = await recStop(B);
      const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]! : NaN);
      const atDist = dwell.map((d) => {
        const r = rows.filter((x) => x[0] >= d.from && x[0] <= d.to);
        return {
          nominalTiles: d.tiles,
          measuredTiles: Math.round((distAt(B, A.pid(), B.pid(), d.to) / TS) * 10) / 10,
          gain: med(r.map((x) => x[3]).filter((g): g is number => g !== null)),
          outMax: Math.max(0, ...r.map((x) => x[2])),
          srcMax: Math.max(0, ...r.map((x) => x[1])),
        };
      });
      // gain steps between overlay updates (250 ms) across the whole walk
      const g = rows.filter((x) => x[3] !== null);
      const changes: { dt: number; dg: number }[] = [];
      for (let i = 1; i < g.length; i++) if (g[i]![3] !== g[i - 1]![3]) changes.push({ dt: g[i]![0] - g[i - 1]![0], dg: Math.abs(g[i]![3]! - g[i - 1]![3]!) });
      const maxStep = Math.max(0, ...changes.map((c) => c.dg));
      const backRows = rows.filter((x) => x[0] >= tBack && x[3] !== null).map((x) => x[3]);
      const series = g.filter((_, i) => i % 5 === 0).map((x) => `${x[0] % 100000}:${x[3]}:${x[2]}`);
      note('street gain series (t:gain:out, every 100 ms)', series.join(' '));
      note('street attenuation by distance', { atDist, maxGainStepPer250ms: maxStep, walkBackGains: [...new Set(backRows)] });
      const at = (t: number) => atDist.find((d) => d.nominalTiles === t)!;
      expect(at(6).gain).toBeGreaterThan(0.05);
      expect(at(6).gain).toBeLessThan(0.95);
      expect(at(10).gain).toBeLessThan(0.02);
      expect(at(12).gain).toBe(0);
      expect(at(12).outMax).toBeLessThan(SILENT * 2);
      expect(maxStep, 'no gain jump > 0.35 between 250 ms overlay updates').toBeLessThan(0.35);
      results.street = `pass: ${atDist.map((d) => `${d.nominalTiles}t(${d.measuredTiles}) gain ${d.gain} out ${d.outMax}`).join('; ')}; max step ${maxStep.toFixed(2)}/250ms`;
      await B.page.locator('.ctv-icon[title="Voice debug overlay"]').click();
      await drive(B, { x: cx, y: tileY(55) });
      await drive(A, { x: cx, y: tileY(55) });
      await expect.poll(() => lkIdentities(square), { timeout: 20_000 }).toEqual([A.pid(), B.pid()].sort());
    }

    // ---------------------------------------------------------------- building isolation + transitions
    let tDoorA = 0;
    if (STAGES.has('building')) {
      // A walks (keyboard) to the clocktower door (48,49) and presses E; B stands right outside (48,50).
      const doorPt = tileCenterPx(townLayout, { x: 48, y: 49 });
      await drive(B, { x: doorPt.x, y: tileY(51) }); // B: 2 tiles below the door
      await drive(A, doorPt);
      await drive(B, { x: doorPt.x, y: tileY(50) }); // right outside, 1 tile from the door
      tDoorA = Date.now();
      const w1 = watchRooms([square, bld], A.pid());
      await useDoor(A, 'clocktower');
      await A.tap.until(() => lastGrant(A, tDoorA)?.zone === 'bld:clocktower', 10_000, 'grant bld:clocktower');
      const g = lastGrant(A, tDoorA);
      expect(A.tap.received('voice:revoke', tDoorA).some((r: any) => r.room === square)).toBe(true);
      await expect.poll(() => lkIdentities(square), { timeout: 15_000 }).toEqual([B.pid()]);
      await expect.poll(() => lkIdentities(bld), { timeout: 15_000 }).toEqual([A.pid()]);
      const enter = await w1.stop();
      await expect.poll(() => peopleNames(B), { timeout: 10_000 }).not.toContain(A.name);
      const bPos = await myPos(B);
      const doorPx = tileCenterPx(townLayout, { x: 48, y: 49 });
      const apart = await sample(B, A.pid(), 2500);
      note('A entered clocktower; B right outside the door', { grantRoom: g.room, bDistToDoorPx: Math.round(Math.hypot(bPos.x - doorPx.x, bPos.y - doorPx.y)), apart, roomPolls: enter });
      expect(apart.srcMax).toBe(0);
      expect(apart.outMax).toBeLessThan(SILENT);
      expect(enter.overlapLive, 'A never live in square and building at once').toBe(0);
      results.building_isolation = `pass: A grant ${g.room}; square=[B], bld=[A]; B ${Math.round(Math.hypot(bPos.x - doorPx.x, bPos.y - doorPx.y))}px from the door hears nothing (src ${apart.srcMax}, out ${apart.outMax}); server polls during the switch: ${enter.polls}, listed in both ${enter.overlap}, live mic in both ${enter.overlapLive}`;

      await drive(B, doorPt);
      const tB = Date.now();
      await useDoor(B, 'clocktower');
      await B.tap.until(() => lastGrant(B, tB)?.zone === 'bld:clocktower', 10_000, 'B grant bld:clocktower');
      await expect.poll(() => lkIdentities(bld), { timeout: 15_000 }).toEqual([A.pid(), B.pid()].sort());
      await expect(B.page.locator('.ctv-zone')).toHaveText('Indoors');
      await expect.poll(async () => (await sample(B, A.pid(), 800)).srcMax, { timeout: 15_000 }).toBeGreaterThan(AUDIBLE);
      const together = await sample(B, A.pid(), 2000);
      await expect(speakingLi(B, A.name)).toBeVisible({ timeout: 15_000 });
      note('both inside: B hears A', together);
      expect(together.outMax).toBeGreaterThan(AUDIBLE);
      results.building_together = `pass: bld=[A,B]; B srcMax ${together.srcMax} outMax ${together.outMax}, A shown speaking`;

      // A walks out while talking: how long does B (inside) still hear A after the server revoked A?
      const oldBldTokenA: string = lastGrant(A, tDoorA).token;
      await recStart(B, A.pid());
      const w2 = watchRooms([square, bld], A.pid());
      const tOut = Date.now();
      await useDoor(A, 'clocktower'); // A stands on the interior door tile
      await A.tap.until(() => A.tap.received('voice:revoke', tOut).some((r: any) => r.room === bld), 10_000, 'revoke bld');
      await expect.poll(() => lkIdentities(bld), { timeout: 15_000 }).toEqual([B.pid()]);
      await B.page.waitForTimeout(2000);
      const rows = await recStop(B);
      const exit = await w2.stop();
      const revokeAt = frameAt(A, 'voice:revoke', (r) => r.room === bld, tOut)!;
      const teleportAt = frameAt(A, 'world:teleport', (t) => t.reason === 'door', tOut);
      const leak = { afterRevokeMs: leakAfter(rows, revokeAt), afterTeleportMs: teleportAt ? leakAfter(rows, teleportAt) : null, overlapPolls: exit.overlap, polls: exit.polls, timeline: exit.timeline };
      note('A exits while talking: residual audio inside', leak);
      expect(exit.overlapLive, 'never live in both rooms (server view)').toBe(0);
      expect(leak.afterRevokeMs, 'audio stops < 1 s after the revoke').toBeLessThan(1000);
      results.exit_transition = `pass: B heard A for ${leak.afterRevokeMs} ms after A's revoke arrived (${leak.afterTeleportMs} ms after the door teleport); ${exit.polls} room polls: listed in both ${exit.overlap}, live mic in both ${exit.overlapLive}`;

      // ---------------------------------------------------------------- revoked-token replays
      if (STAGES.has('replay')) {
        // (a) private room: A replays its old clocktower token from outside.
        const replay = await rawJoin(oldBldTokenA);
        lkConnected('replay-bld', replay.joined);
        const tReplay = Date.now();
        note('A replays revoked clocktower token', { joined: replay.joined, bld: await lkIdentities(bld) });
        expect(replay.joined, 'LiveKit still admits a revoked-but-unexpired token (the sweep must catch it)').toBe(true);
        let sweptMs = -1;
        await expect.poll(async () => (await lkIdentities(bld)).includes(A.pid()), { timeout: 40_000, intervals: [1000] }).toBe(false).then(() => (sweptMs = Date.now() - tReplay));
        const code = await Promise.race([replay.closed, new Promise<number>((r) => setTimeout(() => r(-1), 5000))]);
        lkConnected('replay-bld', false);
        replay.close();
        // (b) public room: B (inside) replays its old square token.
        const oldSquareTokenB: string = B.tap.received('voice:grant').filter((x: any) => x.room === square).at(-1).token;
        const sqValidate = await validateStatus(oldSquareTokenB);
        const r2 = await rawJoin(oldSquareTokenB);
        const r2early = await Promise.race([r2.closed, new Promise<number>((r) => setTimeout(() => r(-1), 1500))]);
        lkConnected('replay-square', r2.joined);
        const t2 = Date.now();
        const listed = (await lkIdentities(square)).includes(B.pid());
        let swept2 = -1;
        await expect.poll(async () => (await lkIdentities(square)).includes(B.pid()), { timeout: 40_000, intervals: [1000] }).toBe(false).then(() => (swept2 = Date.now() - t2));
        lkConnected('replay-square', false);
        r2.close();
        note('replays swept', { privateMs: sweptMs, privateWsClose: code, publicTokenValidate: sqValidate, publicJoined: r2.joined, publicEarlyClose: r2early, publicListed: listed, publicMs: swept2 });
        expect(r2.joined && listed, 'square replay actually joined').toBe(true);
        results.revoked_replay = `pass: private room replay removed after ${sweptMs} ms (ws close ${code}); square replay (B inside a building) removed after ${swept2} ms`;
      }

      // ---------------------------------------------------------------- access control (modified client)
      if (STAGES.has('access')) {
        const tokB: string = lastGrant(B).token; // B: clocktower, A: square
        const checks = {
          listParticipantsOwnRoom: await twirp('ListParticipants', tokB, { room: bld }),
          listParticipantsOtherRoom: await twirp('ListParticipants', tokB, { room: square }),
          listRooms: await twirp('ListRooms', tokB, {}),
          removeParticipant: await twirp('RemoveParticipant', tokB, { room: bld, identity: A.pid() }),
        };
        // C2S: a player asks for an announcement (the only C2S voice message that leads to grants).
        const tAnn = Date.now();
        await B.page.evaluate((bytes) => (window as any).__ctv.inject(bytes), roomFrame('voice:announce', { active: true }));
        await B.page.waitForTimeout(1500);
        const annErr = B.tap.received('error', tAnn).find((e: any) => e.for === 'voice:announce');
        const annGrants = [A, B].flatMap((p) => p.tap.received('voice:grant', tAnn).filter((g: any) => g.purpose === 'announce'));
        // voice:status claiming another room: never yields a grant
        await B.page.evaluate((bytes) => (window as any).__ctv.inject(bytes), roomFrame('voice:status', { connected: true, publishing: true, room: square }));
        await B.page.waitForTimeout(1000);
        const statusGrants = B.tap.received('voice:grant', tAnn).length;
        note('access control', { twirpWithParticipantToken: checks, announceError: annErr, announceGrants: annGrants.length, grantsAfterForgedStatus: statusGrants });
        for (const v of Object.values(checks)) expect([401, 403]).toContain(v);
        expect(annErr?.code).toBe('forbidden');
        expect(annGrants.length).toBe(0);
        expect(statusGrants).toBe(0);
        results.access = `pass: participant token on RoomService API -> ${JSON.stringify(checks)}; player voice:announce -> ${annErr?.code}, 0 grants; forged voice:status -> 0 grants`;
      }
    }
    quota.push({ at: 'after building', voice: await adminVoice(request) });

    // ---------------------------------------------------------------- cross-lobby token
    if (STAGES.has('crosslobby')) {
      const C = await newPlayer(browser, `VoxC ${SUFFIX}`);
      ps.push(C);
      const lobby2 = await createLobby(C, `Voice2 ${SUFFIX}`);
      await enterLobby(C, lobby2);
      await enableVoice(C);
      const square2 = roomOf(lobby2, 'square');
      await expect.poll(() => lkIdentities(square2), { timeout: 15_000 }).toEqual([C.pid()]);
      const tokA: string = lastGrant(A).token;
      const roomA: string = lastGrant(A).room;
      lkConnected(A.name, false);
      await A.ctx.close();
      ps.splice(ps.indexOf(A), 1);
      const forged = await validateStatus(forgeRoom(tokA, square2));
      const genuine = await validateStatus(tokA);
      const j = await rawJoin(tokA);
      lkConnected('crossjoin', j.joined);
      await new Promise((r) => setTimeout(r, 1500));
      const inA = await lkIdentities(roomA);
      const in2 = await lkIdentities(square2);
      j.close();
      lkConnected('crossjoin', false);
      note('cross-lobby', { roomA, square2, forgedValidate: forged, genuineValidate: genuine, joined: j.joined, inRoomA: inA, inLobby2Square: in2 });
      expect(forged).toBe(401);
      expect(in2).toEqual([C.pid()]);
      expect(inA).toContain(A.pid());
      results.cross_lobby = `pass: lobby-1 token with room claim edited to lobby 2 -> HTTP ${forged}; unedited token joins only ${roomA}; lobby-2 square stays [C]`;
    }

    await new Promise((r) => setTimeout(r, 2000));
    quota.push({ at: 'end', voice: await adminVoice(request) });
    note('quota', quota);
    const first = (quota[0] as any)?.voice?.participantMinutes;
    const last = (quota.at(-1) as any)?.voice?.participantMinutes;
    if (typeof first === 'number' && typeof last === 'number') {
      expect(last).toBeGreaterThan(first);
      results.quota = `pass: participantMinutes ${first} -> ${last} (byEnv ${JSON.stringify((quota.at(-1) as any).voice.byEnv)}, active ${(quota[1] as any)?.voice?.activeParticipants})`;
    } else results.quota = 'skipped: no admin cookie';
  } finally {
    await closeAll(ps);
    note('results', results);
    note('participant-minutes used (browser connected time)', usedMinutes());
    saveEvidence('voice-core.json', { results, quota });
  }
});

// ============================================================================================
// 2. Night: homes, ST visit, ST moving house to house. SIMULATED mic.
test('voice night (SIMULATED mic)', async ({ browser }) => {
  test.skip(process.env.VOICE_NIGHT !== '1', 'set VOICE_NIGHT=1');
  test.setTimeout(420_000);
  const ps: P[] = [];
  const bots: Bot[] = [];
  const results: Record<string, string> = {};
  try {
    const ST = await newPlayer(browser, `VoxST ${SUFFIX}`);
    const P1 = await newPlayer(browser, `VoxP ${SUFFIX}`);
    const P2 = await newPlayer(browser, `VoxQ ${SUFFIX}`);
    ps.push(ST, P1, P2);
    await ST.page.goto('/');
    await ST.page.getByRole('button', { name: /create lobby/i }).first().click();
    const dialog = ST.page.getByRole('dialog', { name: 'Create lobby' });
    await dialog.getByLabel('Lobby name').fill(`Night ${SUFFIX}`);
    await dialog.getByLabel(/storyteller seat/i).check();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await ST.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
    const lobby = ST.page.url().split('/lobby/')[1]!;
    await ST.tap.until(() => ST.pid() && ST.tap.last('world:snapshot'), 20_000, 'ST in lobby');
    for (const p of [P1, P2]) {
      await enterLobby(p, lobby);
      for (let attempt = 1; ; attempt++) {
        await p.page.getByRole('button', { name: "I'm ready" }).click();
        if (await p.page.getByRole('button', { name: 'Not ready' }).waitFor({ timeout: 4000 }).then(() => true, () => false)) break;
        if (attempt >= 3) throw new Error(`${p.name}: ready not acknowledged`);
      }
    }
    for (let i = 0; i < 3; i++) {
      const b = new Bot(`Bot${i} ${SUFFIX}`, BASE, BASE.replace(/^http/, 'ws'), { headers: { 'X-Forwarded-For': fakeIp() } });
      await b.signUp();
      await b.join(lobby);
      b.send('lobby:ready', { ready: true });
      bots.push(b);
    }
    await ST.tap.until(() => {
      const v = ST.tap.last('lobby:view');
      return v && v.members.filter((m: any) => m.role === 'player' && m.ready).length === 5 && v.canStart;
    }, 20_000, '5 ready + canStart');

    for (const p of [ST, P1, P2]) await enableVoice(p);
    const square = roomOf(lobby, 'square');
    await expect.poll(() => lkIdentities(square), { timeout: 15_000 }).toEqual([ST.pid(), P1.pid(), P2.pid()].sort());
    for (const p of [ST, P1, P2]) await openMic(p);

    await ST.page.getByRole('button', { name: 'Start game' }).click();
    await ST.tap.until(() => ST.tap.last('game:view')?.phase === 'setup', 15_000, 'setup');
    await ST.page.getByRole('button', { name: 'Random setup' }).click();
    await ST.tap.until(() => ST.tap.last('game:view')?.grimoire?.length === 5, 10_000, 'grimoire');
    const tNight = Date.now();
    await ST.page.getByRole('button', { name: 'Begin first night' }).click();
    const seat = (p: P) => p.tap.last('game:view')?.you?.seat as number;
    for (const p of [P1, P2]) await p.tap.until(() => p.tap.last('game:view')?.phase === 'first_night' && seat(p) !== undefined, 15_000, 'first night');
    const h1 = roomOf(lobby, `bld:house-${seat(P1)}`);
    const h2 = roomOf(lobby, `bld:house-${seat(P2)}`);
    for (const [p, room] of [[P1, h1], [P2, h2]] as const) {
      await p.tap.until(() => lastGrant(p, tNight)?.room === room, 10_000, 'home grant');
      await expect.poll(() => lkIdentities(room), { timeout: 15_000 }).toEqual([p.pid()]);
    }
    await expect.poll(() => lkIdentities(square), { timeout: 15_000 }).toEqual([]);
    for (const p of [P1, P2]) await expect.poll(() => peopleNames(p), { timeout: 10_000 }).toEqual([]);
    const p1alone = await sample(P1, P2.pid(), 1500);
    note('night: homes', { seats: [seat(P1), seat(P2)], h1: await lkIdentities(h1), h2: await lkIdentities(h2), square: await lkIdentities(square), p1HearsP2: p1alone });
    results.night_alone = `pass: ${h1}=[P1], ${h2}=[P2] (seats ${seat(P1)}/${seat(P2)}), square empty, panels empty, P1 hears nothing from P2 (both open mic)`;

    const p2Seen: string[][] = [];
    let watching = true;
    const watch = (async () => {
      while (watching) {
        p2Seen.push(await peopleNames(P2));
        await P2.page.waitForTimeout(200);
      }
    })();
    const tVisit = Date.now();
    await ST.page.locator('.cts-tabs').getByRole('button', { name: 'Grimoire' }).click();
    await ST.page.locator('.cts-grim', { has: ST.page.locator('.cts-name', { hasText: P1.name }) }).getByRole('button', { name: 'Visit' }).click();
    await ST.tap.until(() => lastGrant(ST, tVisit)?.room === h1, 15_000, 'ST grant for visited home');
    await expect.poll(() => lkIdentities(h1), { timeout: 15_000 }).toEqual([ST.pid(), P1.pid()].sort());
    await expect.poll(() => peopleNames(P1), { timeout: 15_000 }).toContain(ST.name);
    await expect.poll(async () => (await sample(P1, ST.pid(), 800)).srcMax, { timeout: 15_000 }).toBeGreaterThan(AUDIBLE);
    const p1hearsST = await sample(P1, ST.pid(), 1500);
    const sthearsP1 = await sample(ST, P1.pid(), 1500);
    const h2During = await lkIdentities(h2);
    watching = false;
    await watch;
    note('visit P1', { h1: await lkIdentities(h1), h2: h2During, p1hearsST, sthearsP1, p2PanelSamples: p2Seen.length, p2EverListed: [...new Set(p2Seen.flat())] });
    expect(h2During).toEqual([P2.pid()]);
    expect(p2Seen.flat()).not.toContain(ST.name);
    expect(P2.tap.received('voice:grant', tVisit).length + P2.tap.received('voice:revoke', tVisit).length, 'P2 got no voice messages during the visit').toBe(0);
    expect(p1hearsST.outMax).toBeGreaterThan(AUDIBLE);
    expect(sthearsP1.srcMax).toBeGreaterThan(AUDIBLE);
    results.visit = `pass: ${h1}=[ST,P1] (P1 hears ST out ${p1hearsST.outMax}, ST hears P1 ${sthearsP1.srcMax}); ${h2}=[P2]; P2 panel never listed ST (${p2Seen.length} samples); P2 got 0 voice msgs`;

    // ST goes straight from P1's home to P2's home while talking: is the ST audible in P1's home after leaving?
    await recStart(P1, ST.pid());
    const w = watchRooms([h1, h2], ST.pid());
    const tMove = Date.now();
    await ST.page.locator('.cts-grim', { has: ST.page.locator('.cts-name', { hasText: P2.name }) }).getByRole('button', { name: 'Visit' }).click();
    await ST.tap.until(() => lastGrant(ST, tMove)?.room === h2, 15_000, 'ST grant for second home');
    await expect.poll(() => lkIdentities(h2), { timeout: 15_000 }).toEqual([ST.pid(), P2.pid()].sort());
    await expect.poll(() => lkIdentities(h1), { timeout: 15_000 }).toEqual([P1.pid()]);
    await P1.page.waitForTimeout(2000);
    const rows = await recStop(P1);
    const ov = await w.stop();
    const revokeAt = frameAt(ST, 'voice:revoke', (r) => r.room === h1, tMove)!;
    const tpAt = frameAt(ST, 'world:teleport', () => true, tMove);
    const leak = { afterRevokeMs: leakAfter(rows, revokeAt), afterTeleportMs: tpAt ? leakAfter(rows, tpAt) : null, overlapPolls: ov.overlap, overlapLive: ov.overlapLive, polls: ov.polls };
    note('ST moves P1 -> P2 home: residual ST audio in P1 home', { ...leak, timeline: ov.timeline });
    expect(ov.overlapLive).toBe(0);
    expect(leak.afterRevokeMs).toBeLessThan(1000);
    results.st_house_to_house = `pass: P1 heard the ST ${leak.afterRevokeMs} ms after the ST's revoke of P1's home arrived (${leak.afterTeleportMs} ms after the teleport); server polls ${ov.polls}: listed in both ${ov.overlap}, live mic in both ${ov.overlapLive}`;
  } finally {
    for (const b of bots) await b.leave().catch(() => undefined);
    await closeAll(ps);
    note('results', results);
    note('participant-minutes used (browser connected time)', usedMinutes());
    saveEvidence('voice-night.json', { results });
  }
});

// ============================================================================================
// 3. Robustness: device switch, reload, offline 5 s / 30 s, permission denied, no microphone.
test('voice robustness (SIMULATED mic / SIMULATED network loss)', async ({ browser, playwright }) => {
  test.skip(process.env.VOICE_ROBUST !== '1', 'set VOICE_ROBUST=1');
  test.setTimeout(600_000);
  const ps: P[] = [];
  const extraBrowsers: Browser[] = [];
  const results: Record<string, string> = {};
  try {
    const A = await newPlayer(browser, `RobA ${SUFFIX}`);
    const B = await newPlayer(browser, `RobB ${SUFFIX}`);
    ps.push(A, B);
    const lobby = await createLobby(A, `Robust ${SUFFIX}`);
    await enterLobby(A, lobby);
    await enterLobby(B, lobby);
    await enableVoice(A);
    await enableVoice(B);
    await openMic(A);
    await openMic(B);
    const hears = async (who: P, from: P, timeout = 30_000) => {
      const t = Date.now();
      await expect.poll(async () => (await sample(who, from.pid(), 600)).outMax, { timeout, intervals: [500] }).toBeGreaterThan(AUDIBLE);
      return Date.now() - t;
    };
    await hears(B, A);

    const only = process.env.VOICE_ROBUST_ONLY; // 'mic' = only the permission / no-mic parts
    if (only !== 'mic') {
    // device switch (A)
    const options = await A.page.locator('.ctv-device option').evaluateAll((os) => os.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent })));
    const target = options.find((o) => o.value && o.value !== 'default');
    if (target) {
      await A.page.locator('.ctv-device').selectOption(target.value);
      await A.page.waitForTimeout(1000);
      const ms = await hears(B, A);
      note('device switch', { options: options.map((o) => o.label), switchedTo: target.label, bHearsAfterMs: ms, lastError: await A.page.locator('.ctv-warn').allInnerTexts() });
      results.device_switch = `pass: switched to "${target.label}" (of ${options.length - 1} devices); B hears A again ${ms} ms later`;
    } else results.device_switch = `not run: only ${options.length - 1} input device(s) listed`;

    // reload B mid-conversation
    const tReload = Date.now();
    await B.page.reload();
    await B.tap.until(() => B.tap.received('lobby:view', tReload).length > 0, 20_000, 'lobby after reload');
    const autoEnabled = await B.page.getByRole('button', { name: 'Enable voice' }).count().then((n) => n === 0);
    await expect(B.page.locator('.ctv-dot-ok, .ctv-dot-live')).toBeVisible({ timeout: 30_000 });
    const blockedBtn = await B.page.getByRole('button', { name: 'Click to allow audio playback' }).isVisible();
    const ctxBefore = await B.page.evaluate(() => (window as any).__ctv.levels().ctx);
    await B.page.keyboard.press('Shift'); // any gesture
    const reloadMs = await hears(B, A);
    const aHearsB = await hears(A, B);
    note('reload', { autoEnabled, playbackBlockedButton: blockedBtn, ctxBeforeGesture: ctxBefore, bHearsAMsAfterGesture: reloadMs, aHearsBMs: aHearsB, totalMs: Date.now() - tReload });
    expect(autoEnabled).toBe(true);
    results.reload = `pass: voice re-enabled automatically after reload (no click on "Enable voice"); AudioContext before gesture ${JSON.stringify(ctxBefore)}${blockedBtn ? ', "allow audio" button shown' : ''}; B hears A after one key press; total ${Date.now() - tReload} ms`;

    // network loss (Playwright offline emulation: HTTP/WebSocket only; WebRTC UDP media is NOT cut)
    for (const secs of [5, 30]) {
      const states: string[] = [];
      let on = true;
      const watch = (async () => {
        while (on) {
          states.push((await B.page.locator('.ctv-dot').first().getAttribute('class').catch(() => '')) ?? '');
          await B.page.waitForTimeout(500);
        }
      })();
      await recStart(B, A.pid());
      const t0 = Date.now();
      await B.ctx.setOffline(true);
      await B.page.waitForTimeout(secs * 1000);
      await B.ctx.setOffline(false);
      const tOn = Date.now();
      await expect(B.page.locator('.ctv-dot-ok, .ctv-dot-live')).toBeVisible({ timeout: 60_000 });
      const recoverMs = await hears(B, A, 60_000);
      const aHears = await hears(A, B, 60_000);
      on = false;
      await watch;
      const rows = await recStop(B);
      const during = dropouts(rows, t0, tOn, 300);
      const dots = [...new Set(states.map((c) => c.replace(/.*ctv-dot-/, '')))];
      note(`offline ${secs}s`, { linkStates: dots, audioDuringOffline: during, bHearsAMsAfterOnline: Date.now() - tOn - aHears, aHearsBMs: aHears, recoverMs });
      results[`offline_${secs}s`] = `pass: link states ${dots.join('>')}; recovered (both directions) ${Date.now() - tOn} ms after going online; audio gaps >300 ms while offline: ${during.gaps} (longest ${during.longestGapMs} ms)`;
    }

    }
    // permission denied
    {
      // Chromium's own permission UI answering "Block" (--use-fake-ui-for-media-stream=deny).
      const br = await playwright.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream=deny'] });
      extraBrowsers.push(br);
      const D = await newPlayer(br, `RobDeny ${SUFFIX}`, { permissions: [] });
      ps.push(D);
      await enterLobby(D, lobby);
      await D.page.getByRole('button', { name: 'Enable voice' }).click();
      lkConnected(D.name, true);
      const msg = await D.page.locator('.ctv-warn').first().innerText({ timeout: 20_000 });
      await expect(D.page.locator('.ctv-dot-ok, .ctv-dot-live')).toBeVisible({ timeout: 20_000 });
      const ms = await hears(D, A);
      note('permission denied', { message: msg, tx: await D.page.locator('.ctv-tx').innerText(), hearsAMs: ms });
      expect(msg).toMatch(/denied/i);
      results.permission_denied = `pass (Chromium permission prompt auto-answered "Block"): "${msg.split('\n')[0]}"; listens: hears A after ${ms} ms`;
      await closeAll([D]);
    }
    // no microphone at all (SIMULATED: getUserMedia -> NotFoundError, no audioinput devices)
    {
      const N = await newPlayer(browser, `RobNoMic ${SUFFIX}`, {
        init: () => {
          const md = navigator.mediaDevices;
          md.getUserMedia = async (c?: MediaStreamConstraints) => {
            if (c?.audio) throw new DOMException('Requested device not found', 'NotFoundError');
            throw new DOMException('Requested device not found', 'NotFoundError');
          };
          const orig = md.enumerateDevices.bind(md);
          md.enumerateDevices = async () => (await orig()).filter((d) => d.kind !== 'audioinput');
        },
      });
      ps.push(N);
      await enterLobby(N, lobby);
      await N.page.getByRole('button', { name: 'Enable voice' }).click();
      lkConnected(N.name, true);
      const msg = await N.page.locator('.ctv-warn').first().innerText({ timeout: 20_000 });
      await expect(N.page.locator('.ctv-dot-ok, .ctv-dot-live')).toBeVisible({ timeout: 20_000 });
      const ms = await hears(N, A);
      // can still play: walk a few steps
      const before = await myPos(N);
      await walkAxis(N, 'x', before.x + 32);
      const after = await myPos(N);
      note('no microphone', { message: msg, hearsAMs: ms, moved: Math.round(after.x - before.x) });
      expect(msg).toMatch(/No microphone/i);
      results.no_microphone = `pass (SIMULATED NotFoundError): "${msg.split('\n')[0]}"; hears A after ${ms} ms; can still walk (${Math.round(after.x - before.x)} px)`;
    }
  } finally {
    await closeAll(ps);
    for (const b of extraBrowsers) await b.close().catch(() => undefined);
    note('results', results);
    note('participant-minutes used (browser connected time)', usedMinutes());
    saveEvidence('voice-robust.json', { results });
  }
});

// ============================================================================================
// 4. Token expiry: server started with VOICE_TOKEN_TTL_SEC=60. Stay connected past several
//    expiries, then lose the network for 30 s (rejoin needs a fresh token) and reload.
test('voice token expiry (SIMULATED mic)', async ({ browser }) => {
  test.skip(process.env.VOICE_TTL !== '1', 'set VOICE_TTL=1 and start the server with VOICE_TOKEN_TTL_SEC=60');
  test.setTimeout(480_000);
  const ps: P[] = [];
  const results: Record<string, string> = {};
  try {
    const A = await newPlayer(browser, `TtlA ${SUFFIX}`);
    const B = await newPlayer(browser, `TtlB ${SUFFIX}`);
    ps.push(A, B);
    const lobby = await createLobby(A, `Ttl ${SUFFIX}`);
    await enterLobby(A, lobby);
    await enterLobby(B, lobby);
    await enableVoice(A);
    await enableVoice(B);
    await openMic(A);
    const first = lastGrant(B);
    const ttl = Math.round((first.expiresAt - Date.now()) / 1000);
    expect(ttl).toBeLessThanOrEqual(65);
    await expect.poll(async () => (await sample(B, A.pid(), 600)).outMax, { timeout: 20_000 }).toBeGreaterThan(AUDIBLE);
    await B.page.waitForTimeout(150_000);
    const grants = B.tap.received('voice:grant').filter((g: any) => g.purpose === 'zone');
    const still = await sample(B, A.pid(), 1500);
    note('after 150 s', { ttlSec: ttl, grantsReceived: grants.length, firstExpiredAgoSec: Math.round((Date.now() - first.expiresAt) / 1000), bHearsA: still });
    expect(grants.length).toBeGreaterThanOrEqual(4);
    expect(still.outMax).toBeGreaterThan(AUDIBLE);
    await B.ctx.setOffline(true);
    await B.page.waitForTimeout(30_000);
    await B.ctx.setOffline(false);
    const tOn = Date.now();
    await expect(B.page.locator('.ctv-dot-ok, .ctv-dot-live')).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => (await sample(B, A.pid(), 600)).outMax, { timeout: 60_000 }).toBeGreaterThan(AUDIBLE);
    const offMs = Date.now() - tOn;
    const tR = Date.now();
    await B.page.reload();
    await expect(B.page.locator('.ctv-dot-ok, .ctv-dot-live')).toBeVisible({ timeout: 30_000 });
    await B.page.keyboard.press('Shift');
    await expect.poll(async () => (await sample(B, A.pid(), 600)).outMax, { timeout: 30_000 }).toBeGreaterThan(AUDIBLE);
    note('expiry recovery', { offline30sRecoverMs: offMs, reloadRecoverMs: Date.now() - tR });
    results.token_expiry = `pass: TTL ${ttl}s, ${grants.length} grants (refreshes) in 150 s, audio continuous; 30 s offline after the first token expired -> recovered in ${offMs} ms; reload -> ${Date.now() - tR} ms`;
  } finally {
    await closeAll(ps);
    note('results', results);
    note('participant-minutes used (browser connected time)', usedMinutes());
    saveEvidence('voice-ttl.json', { results });
  }
});

// ============================================================================================
// 5. Load: N clients in the square, all transmitting (SIMULATED mic) at once.
test('voice load (SIMULATED mic)', async ({ browser }) => {
  const N = Number(process.env.VOICE_LOAD_N ?? '0');
  test.skip(!(N >= 2 && N <= 15), 'set VOICE_LOAD_N=2..15');
  test.setTimeout(900_000);
  const ps: P[] = [];
  const results: Record<string, unknown> = {};
  try {
    const host = await newPlayer(browser, `Load0 ${SUFFIX}`, { viewport: { width: 800, height: 600 } });
    ps.push(host);
    const lobby = await createLobby(host, `Load ${SUFFIX}`, 15);
    // Shared host: never push it into OOM (other teams' processes live there too).
    const memAvailMB = () => Math.round(Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? 0) / 1024);
    const memLog: number[] = [memAvailMB()];
    for (let i = 1; i < N; i++) ps.push(await newPlayer(browser, `Load${i} ${SUFFIX}`, { viewport: { width: 800, height: 600 } }));
    for (let i = 0; i < ps.length; i++) {
      if (memAvailMB() < 1000) throw new Error(`aborting: host MemAvailable ${memAvailMB()} MB after ${i} clients`);
      await enterLobby(ps[i]!, lobby);
      memLog.push(memAvailMB());
    }
    note('load: MemAvailable MB while joining', memLog);
    const tJoin = Date.now();
    for (let i = 0; i < ps.length; i += 5) await Promise.all(ps.slice(i, i + 5).map((p) => enableVoice(p, 60_000)));
    if (memAvailMB() < 1000) throw new Error(`aborting: host MemAvailable ${memAvailMB()} MB`);
    note(`load: ${N} enabled`, { ms: Date.now() - tJoin });
    for (const p of ps) await openMic(p);
    for (const p of ps) await p.page.locator('.ctv-icon[title="Voice debug overlay"]').click();
    const square = roomOf(lobby, 'square');
    await expect.poll(async () => (await lkList(square)).filter((x) => x.tracks[0] && !x.tracks[0].muted).length, { timeout: 60_000 }).toBe(N);
    await ps[0]!.page.waitForTimeout(10_000);
    const cdp = await browser.newBrowserCDPSession();
    const proc = async () => ((await cdp.send('SystemInfo.getProcessInfo' as any)) as any).processInfo as { type: string; id: number; cpuTime: number }[];
    const p0 = await proc();
    const sessions = await Promise.all(ps.map(async (p) => {
      const s = await p.ctx.newCDPSession(p.page);
      await s.send('Performance.enable');
      return s;
    }));
    const m0 = await Promise.all(sessions.map((s) => s.send('Performance.getMetrics')));
    const t0 = Date.now();
    const per = await Promise.all(ps.map(async (p) => {
      const lv = await sample(p, '__none__', 100).then(() => p.page.evaluate(() => (window as any).__ctv.levels()));
      const speaking = await p.page.locator('.ctv-people li.speaking').count();
      const listed = (await peopleNames(p)).length;
      const loud = lv.srcs.filter((x: any) => x.rms > AUDIBLE).length;
      const levelsRows = await p.page.evaluate(() => (window as any).__ctv.sample('__none__', 10));
      void levelsRows;
      return { name: p.name, listed, speaking, srcStreams: lv.srcs.length, loudNow: loud, ctx: lv.ctx };
    }));
    // audible-per-subscriber over 3 s (max level per remote pid)
    const audible = await Promise.all(ps.map((p) => p.page.evaluate(() => new Promise((res) => {
      const max = new Map<string, number>();
      const iv = setInterval(() => {
        for (const s of (window as any).__ctv.levels().srcs) max.set(s.pid, Math.max(max.get(s.pid) ?? 0, s.rms));
      }, 20);
      setTimeout(() => {
        clearInterval(iv);
        res([...max.values()].filter((v) => v > 0.01).length);
      }, 3000);
    }))));
    await ps[0]!.page.waitForTimeout(Math.max(0, 20_000 - (Date.now() - t0)));
    const m1 = await Promise.all(sessions.map((s) => s.send('Performance.getMetrics')));
    const wall = (Date.now() - t0) / 1000;
    const p1 = await proc();
    const metric = (m: any, n: string) => m.metrics.find((x: any) => x.name === n)?.value ?? 0;
    const rtc = await Promise.all(ps.map((p) => p.page.evaluate(() => (window as any).__ctv.rtc())));
    const quality = await Promise.all(ps.map((p) => p.page.locator('.ctv-debug').innerText().then((t) => {
      const m = t.match(/net: (\w+)/);
      const remotes = [...t.matchAll(/· net (\w+)/g)].map((x) => x[1]);
      const counts: Record<string, number> = {};
      for (const q of remotes) counts[q!] = (counts[q!] ?? 0) + 1;
      return { local: m?.[1] ?? '?', remotes: counts };
    })));
    const rows = ps.map((p, i) => ({
      ...per[i],
      audibleRemotes3s: audible[i],
      mainThreadCpuPct: Math.round(((metric(m1[i], 'TaskDuration') - metric(m0[i], 'TaskDuration')) / wall) * 1000) / 10,
      jsHeapMB: Math.round(metric(m1[i], 'JSHeapUsedSize') / 1048576),
      rtc: rtc[i],
      lossPct: rtc[i].packetsReceived ? Math.round((rtc[i].packetsLost / (rtc[i].packetsReceived + rtc[i].packetsLost)) * 10000) / 100 : null,
      concealedPct: rtc[i].samples ? Math.round((rtc[i].concealed / rtc[i].samples) * 10000) / 100 : null,
      quality: quality[i],
    }));
    const cpuByType: Record<string, number> = {};
    for (const a of p1) {
      const b = p0.find((x) => x.id === a.id);
      if (b) cpuByType[a.type] = Math.round(((cpuByType[a.type] ?? 0) + ((a.cpuTime - b.cpuTime) / wall) * 100) * 10) / 10;
    }
    const counts: Record<string, number> = {};
    for (const a of p1) counts[a.type] = (counts[a.type] ?? 0) + 1;
    results.N = N;
    results.perClient = rows;
    results.processCpuPctByType = cpuByType;
    results.processCounts = counts;
    results.rendererCpuPctAvg = Math.round((cpuByType.renderer ?? 0) / N * 10) / 10;
    results.loadavg = os.loadavg().map((x) => Math.round(x * 10) / 10);
    results.memAvailableMB = memAvailMB();
    results.server = await lkList(square).then((l) => ({ participants: l.length, unmuted: l.filter((x) => x.tracks[0] && !x.tracks[0].muted).length }));
    note(`load N=${N}`, results);
    for (const r of rows) {
      expect(r.listed, `${r.name} lists everyone`).toBe(N - 1);
      expect(r.audibleRemotes3s, `${r.name} hears everyone`).toBe(N - 1);
    }
  } finally {
    await closeAll(ps);
    note('participant-minutes used (browser connected time)', usedMinutes());
    saveEvidence(`voice-load-${N}.json`, { results });
  }
});

// ============================================================================================
// 6. Cross-browser: B runs in Firefox or WebKit (Playwright builds; WebKit on Linux is NOT
//    Safari), A in Chromium (SIMULATED mic). Square + building.
test('voice cross-browser (SIMULATED mic)', async ({ browser, playwright }) => {
  const kind = process.env.VOICE_XBROWSER as 'firefox' | 'webkit' | undefined;
  test.skip(kind !== 'firefox' && kind !== 'webkit', 'set VOICE_XBROWSER=firefox|webkit');
  test.setTimeout(480_000);
  const ps: P[] = [];
  const results: Record<string, string> = {};
  let other: Browser | null = null;
  try {
    other =
      kind === 'firefox'
        ? await playwright.firefox.launch({
            firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true },
            // headless Firefox needs an audio server for WebAudio output: a private null-sink PulseAudio
            ...(process.env.VOICE_PULSE_SERVER ? { env: { ...process.env, PULSE_SERVER: process.env.VOICE_PULSE_SERVER } as Record<string, string> } : {}),
          })
        : await playwright.webkit.launch();
    // Playwright Test applies the project's Chrome user agent to every new context; restore a real
    // one (livekit-client picks code paths from the UA).
    const major = other.version().split('.')[0];
    const ua = kind === 'firefox' ? `Mozilla/5.0 (X11; Linux x86_64; rv:${major}.0) Gecko/20100101 Firefox/${major}.0` : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${major}.0 Safari/605.1.15`;
    const A = await newPlayer(browser, `XA ${SUFFIX}`);
    const B = await newPlayer(other, `X${kind === 'firefox' ? 'F' : 'W'} ${SUFFIX}`, { permissions: kind === 'webkit' ? ['microphone'] : [], userAgent: ua });
    ps.push(A, B);
    const lobby = await createLobby(A, `Cross ${SUFFIX}`);
    await enterLobby(A, lobby);
    await enterLobby(B, lobby);
    await enableVoice(A);
    await B.page.getByRole('button', { name: 'Enable voice' }).click();
    lkConnected(B.name, true);
    await expect(B.page.locator('.ctv-dot-ok, .ctv-dot-live, .ctv-dot-bad')).toBeVisible({ timeout: 30_000 });
    const bState = {
      ua: await B.page.evaluate(() => navigator.userAgent),
      tx: await B.page.locator('.ctv-tx').innerText(),
      warnings: await B.page.locator('.ctv-warn').allInnerTexts(),
      playbackBlocked: await B.page.getByRole('button', { name: 'Click to allow audio playback' }).isVisible(),
      ctx: await B.page.evaluate(() => (window as any).__ctv.levels().ctx),
    };
    note(`${kind}: after Enable voice`, bState);
    await openMic(A);
    await openMic(B);
    const square = roomOf(lobby, 'square');
    await expect.poll(() => lkIdentities(square), { timeout: 20_000 }).toEqual([A.pid(), B.pid()].sort());
    await expect.poll(async () => (await sample(B, A.pid(), 600)).outMax, { timeout: 20_000 }).toBeGreaterThan(AUDIBLE);
    const bHearsA = await sample(B, A.pid(), 2000);
    const aHearsB = await sample(A, B.pid(), 2000);
    const bSpeak = await speakingAfter(B, A.name, 15_000);
    const aSpeak = await speakingAfter(A, B.name, 15_000);
    note(`${kind}: square`, { bHearsA, aHearsB, bShowsASpeakingMs: bSpeak, aShowsBSpeakingMs: aSpeak, server: await lkList(square) });
    expect(bHearsA.outMax).toBeGreaterThan(AUDIBLE);
    results.square = `${bHearsA.outMax > AUDIBLE ? 'pass' : 'FAIL'}: ${kind} hears Chromium (out ${bHearsA.outMax}, speaking shown ${bSpeak} ms); Chromium hears ${kind} (src ${aHearsB.srcMax}, speaking ${aSpeak} ms)`;

    const bld = roomOf(lobby, 'bld:clocktower');
    const doorPt = tileCenterPx(townLayout, { x: 48, y: 49 });
    await drive(A, doorPt);
    const t = Date.now();
    await useDoor(A, 'clocktower');
    await A.tap.until(() => lastGrant(A, t)?.zone === 'bld:clocktower', 10_000, 'A grant bld');
    await expect.poll(() => lkIdentities(bld), { timeout: 15_000 }).toEqual([A.pid()]);
    await B.page.waitForTimeout(1500);
    const apart = await sample(B, A.pid(), 2000);
    await drive(B, doorPt);
    const tb = Date.now();
    await useDoor(B, 'clocktower');
    await B.tap.until(() => lastGrant(B, tb)?.zone === 'bld:clocktower', 10_000, 'B grant bld');
    await expect.poll(() => lkIdentities(bld), { timeout: 15_000 }).toEqual([A.pid(), B.pid()].sort());
    await expect.poll(async () => (await sample(B, A.pid(), 600)).outMax, { timeout: 20_000 }).toBeGreaterThan(AUDIBLE);
    const together = await sample(B, A.pid(), 1500);
    note(`${kind}: building`, { apart, together });
    expect(apart.srcMax).toBe(0);
    results.building = `pass: ${kind} outside hears nothing (src ${apart.srcMax}); inside together out ${together.outMax}`;
  } finally {
    await closeAll(ps);
    await other?.close().catch(() => undefined);
    note('results', results);
    note('participant-minutes used (browser connected time)', usedMinutes());
    saveEvidence(`voice-xbrowser-${kind}.json`, { results });
  }
});
