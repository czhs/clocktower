// Security v2.3, area 4 — HOSTILE-CLIENT harness (game secrecy vs modified clients).
//
// A modified client reads every byte it receives and sends arbitrary C2S messages. This suite drives
// real WebSocket clients against ONE throwaway server (127.0.0.1:3391, temp DB, random secrets) and,
// for EVERY type in the protocol `C2S` map (cases generated in ./hostile-cases.ts, so new types are
// covered automatically), sends malformed payloads, prototype keys, unicode tricks, oversized and raw
// frames, out-of-phase and unauthorised messages, replays and bursts. It asserts the server neither
// crashes nor changes state it should not, and that replies leak nothing hidden.
//
// `it.fails('SEC-n: …')` marks a KNOWN OPEN FINDING (docs/security-v2.3/04-game-secrecy.md): the body
// asserts the secure behaviour, which does not hold yet. When the fix lands vitest reports it — flip
// it to `it(...)`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { townLayout } from '../../packages/assets/src/index.js';
import {
  C2S,
  CLOSE_CODES,
  homeBuilding,
  type C2SType,
  type LobbyRoomView,
  type PinView,
  type PlayerGameView,
  type StorytellerGameView,
  type WorldSnapshot,
} from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { pending } from '../support/features.js';
import { setupGame, toNight, until, type Game } from '../support/game.js';
import { forbiddenKeysIn, nonPublicPlayerKeys, strayAlignments, strayCharacters } from '../support/secrecy.js';
import { sleep, suiteServer, uniq } from '../support/suite.js';
import {
  benignOddities,
  C2S_TYPES,
  catalogueGaps,
  DEFAULT_PACE_PER_SEC,
  garbagePayloads,
  hostileCases,
  numericFieldsAccepting,
  PACE_PER_SEC,
  passthroughTypes,
  validSamples,
  type HostileCase,
} from './hostile-cases.js';

// ---------------------------------------------------------------------------------------------
// Pure catalogue checks (no server)

describe('hostile C2S catalogue (generated from the protocol C2S map)', () => {
  it('every C2S type (and every StCommand variant) has valid samples and hostile cases', () => {
    expect(catalogueGaps()).toEqual([]);
    for (const type of C2S_TYPES) {
      const samples = validSamples(type);
      expect(samples.length, `${type}: no valid sample`).toBeGreaterThan(0);
      for (const s of samples) expect((C2S as any)[type].safeParse(s).success, `${type}: sample invalid`).toBe(true);
      expect(hostileCases(type).length, `${type}: no hostile cases`).toBeGreaterThan(5);
    }
    // every StCommand discriminated-union option is represented
    const stTypes = new Set(validSamples('st:command').map((s) => (s as { type: string }).type));
    const opts = ((C2S['st:command'] as any)._zod.def.options as any[]).map((o) => o._zod.def.shape.type._zod.def.values[0]);
    expect([...stTypes].sort()).toEqual([...opts].sort());
  });

  it('NaN, ±Infinity and numeric strings are rejected in every numeric field', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1'] as unknown[]) {
      expect(numericFieldsAccepting(v as number), String(v)).toEqual([]);
    }
  });

  it('unbounded numeric fields are exactly the reviewed list (a new unbounded field fails here)', () => {
    // Reviewed (Info, docs SEC-9): `move` coordinates are validated by the world module (speed budget,
    // collision, location). (`move.seq` is a Zod 4 int, i.e. a safe integer: 1e300 is refused.)
    expect(numericFieldsAccepting(1e300)).toEqual(['move.x', 'move.y']);
    expect(numericFieldsAccepting(-1e300)).toEqual(['move.x', 'move.y']);
  });

  it('oversized strings are rejected in every string field', () => {
    for (const type of C2S_TYPES) {
      for (const c of hostileCases(type).filter((c) => c.label.endsWith('=bad[11]'))) {
        expect((C2S as any)[type].safeParse(c.payload).success, `${type} ${c.label}`).toBe(false);
      }
    }
  });

  it('extra and prototype-pollution keys are stripped by every schema (never reach a handler)', () => {
    for (const type of C2S_TYPES) {
      for (const c of benignOddities(type)) {
        const r = (C2S as any)[type].safeParse(c.payload);
        expect(r.success).toBe(true);
        const keys = Object.keys(r.data ?? {});
        for (const k of ['isHost', 'role', 'accountId', '__proto__', 'constructor', 'polluted']) {
          if (type === 'ping') continue; // passthrough, reviewed below
          expect(keys, `${type} ${c.label}`).not.toContain(k);
        }
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Only 'ping' passes unknown keys through (its handler reads nothing from the payload).
    expect(passthroughTypes()).toEqual(['ping']);
  });
});

// ---------------------------------------------------------------------------------------------
// Live server (one per file; ad-hoc port of the sec-secrecy sandbox)

const { server, features } = await suiteServer({ port: 3391, env: { LOBBY_MAX_COUNT: '16' } });
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

const healthy = async () => (await fetch(`${server.url}/healthz`, { signal: AbortSignal.timeout(3000) })).status === 200;
const ALLOWED_CODES = ['invalid', 'forbidden', 'phase', 'rate_limited', 'not_found'];
type Err = { code: string; message: string; for?: string };
const errorsSince = (b: Bot, t: number) => b.recorder.messages.filter((m) => m.type === 'error' && m.at >= t).map((m) => m.payload as Err);

function trySend(b: Bot, type: string, payload: unknown) {
  try {
    b.send(type, payload);
  } catch {
    /* socket closed by the server: acceptable for a hostile client */
  }
}

/** Evenly spread `n` items of a list. */
const spread = <T>(xs: T[], n: number): T[] => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]!));

/**
 * Sends the cases round-robin over their types, each type paced under its room token bucket and the
 * whole stream paced under the per-connection budgets: sec-host's pre-decode frame budget (80
 * frames/s) and, for schema-INVALID cases, the SEC-7 violation score (burst 150, 10/s): the first
 * `burst` messages go at 50/s, the rest at `sustainedPerSec`. `budgetSec` bounds the run.
 */
async function paced(b: Bot, cases: HostileCase[], budgetSec: number, opts: { burst?: number; sustainedPerSec?: number } = {}) {
  const burst = opts.burst ?? 120;
  const sustained = opts.sustainedPerSec ?? 8;
  const total = burst + Math.floor(sustained * Math.max(0, budgetSec - burst / 50));
  const byType = new Map<C2SType, HostileCase[]>();
  for (const c of cases) byType.set(c.type, [...(byType.get(c.type) ?? []), c]);
  const perType = Math.max(2, Math.ceil(total / Math.max(1, byType.size)));
  const queues = [...byType].map(([type, list]) => ({ type, list: spread(list, perType), gap: 1000 / (PACE_PER_SEC[type] ?? DEFAULT_PACE_PER_SEC), last: -Infinity }));
  let sent = 0;
  while (queues.some((q) => q.list.length) && sent < total) {
    let any = false;
    for (const q of queues) {
      if (!q.list.length || performance.now() - q.last < q.gap) continue;
      trySend(b, q.type, q.list.shift()!.payload);
      q.last = performance.now();
      sent++;
      any = true;
      await sleep(sent <= burst ? 20 : 1000 / sustained);
      if (sent >= total) break;
    }
    if (!any) await sleep(20);
  }
}

async function pingRtt(b: Bot): Promise<number> {
  const t0 = performance.now();
  const since = Date.now();
  b.send('ping', {});
  await b.waitFor('pong', () => true, 5000, since);
  return performance.now() - t0;
}

/** Everything about a waiting lobby that a non-host player must not be able to change (others' state). */
function lobbyFingerprint(v: LobbyRoomView | undefined, attackerPid: string | undefined) {
  if (!v) return 'no view';
  const { name, description, maxPlayers, storytellerMode, autoTimings, storytellerName } = v.lobby;
  return JSON.stringify({
    lobby: { name, description, maxPlayers, storytellerMode, autoTimings, storytellerName },
    members: v.members.filter((m) => m.pid !== attackerPid).map((m) => [m.pid, m.role, m.isHost, m.ready, m.seat, m.cosmetics, m.displayName]),
    attacker: v.members.filter((m) => m.pid === attackerPid).map((m) => [m.role, m.isHost, m.seat]),
  });
}

/** Everything about a running game a player must not be able to change. */
function gameFingerprint(v: StorytellerGameView | undefined) {
  if (!v) return 'no view';
  return JSON.stringify({
    phase: v.phase,
    day: v.dayNumber,
    grimoire: v.grimoire.map((e) => [e.seat, e.character, e.believedCharacter, e.alignment, e.alive, e.publicAlive, e.poisoned, e.drunk, e.reminders, e.ghostVoteAvailable, e.isRedHerring]),
    noms: v.day?.nominations.map((n) => [n.id, n.status, n.voteCount]) ?? null,
    block: v.day?.onTheBlock ?? null,
    announcements: (v as any).announcements?.length ?? null,
    settings: (v as any).settings ?? null,
    doors: v.stage?.doors ?? null,
    frozen: v.stage?.players.map((p) => p.frozen) ?? null,
    pending: (v as any).pendingResult ?? null,
    visiting: (v as any).visitingSeat ?? null,
  });
}

function scanSecrecy(b: Bot, since = 0) {
  const msgs = b.recorder.messages.filter((m) => m.at >= since);
  return {
    forbiddenKeys: forbiddenKeysIn(msgs),
    nonPublicPlayerKeys: nonPublicPlayerKeys(msgs),
    strayCharacters: strayCharacters(msgs).filter((x) => x.type !== 'lobby:view'),
    strayAlignments: strayAlignments(msgs),
  };
}
const CLEAN = { forbiddenKeys: [], nonPublicPlayerKeys: [], strayCharacters: [], strayAlignments: [] };

// ---------------------------------------------------------------------------------------------

describe.skipIf(!features.rooms)(`hostile clients in the waiting room${pending(features.rooms, features.reasons.rooms)}`, () => {
  let host: Bot; // creator, seated Storyteller
  let witness: Bot;
  let attacker: Bot;
  let precise: Bot[];
  let L = '';

  beforeAll(async () => {
    [host, witness, attacker, ...precise] = (await makeBots(7, uniq('hw-'), server.url, server.wsUrl)) as [Bot, Bot, Bot, ...Bot[]];
    all.push(host, witness, attacker, ...precise);
    for (const b of [host, witness, attacker, ...precise]) b.autoRespondEnabled = false;
    L = await host.createLobby(uniq('Hostile '), 15, true);
    await host.join(L, 'storyteller');
    for (const b of [witness, attacker, ...precise]) await b.join(L);
    await until(() => host.lobbyView?.members.length === 7, 8000, '7 members');
  }, 60_000);

  it('a schema-invalid payload for EVERY C2S type is answered with error invalid (for = type) and nothing else', async () => {
    // One attacker per third of the types, paced at ~1/s (the room's error replies are limited to 1/s).
    const types = [...C2S_TYPES];
    const results = new Map<string, Err | null>();
    await Promise.all(
      precise.map(async (b, i) => {
        for (const type of types.filter((_, j) => j % precise.length === i)) {
          const cases = hostileCases(type);
          const c = cases.find((x) => !x.label.startsWith('garbage')) ?? cases[0]!;
          const t0 = Date.now();
          trySend(b, type, c.payload);
          const e = await b.waitFor<Err>('error', (x) => x.for === type, 2500, t0).catch(() => null);
          results.set(type, e);
          await sleep(1100 - Math.min(1100, Date.now() - t0));
        }
      }),
    );
    const bad = [...results].filter(([, e]) => !e || e.code !== 'invalid' || e.message !== 'Invalid message payload');
    expect(bad).toEqual([]);
    expect(results.size).toBe(C2S_TYPES.length);
    expect(await healthy()).toBe(true);
  }, 90_000);

  it('the whole mutation catalogue (wrong types, NaN/Infinity, huge strings/arrays, unicode, __proto__) for every type: no crash, no state change, only generic errors', async () => {
    const before = lobbyFingerprint(witness.lobbyView, attacker.pid);
    const t0 = Date.now();
    const cases = C2S_TYPES.flatMap((t) => hostileCases(t));
    await paced(attacker, cases, 20);
    await sleep(800);
    expect(await healthy()).toBe(true);
    expect(lobbyFingerprint(witness.lobbyView, attacker.pid)).toBe(before);
    expect(await pingRtt(witness)).toBeLessThan(2000);
    // the attacker is still served (nothing in the catalogue should get it disconnected)
    expect(attacker.room).not.toBeNull();
    expect(await pingRtt(attacker)).toBeLessThan(2000);
    const errs = errorsSince(attacker, t0);
    expect(errs.length).toBeGreaterThan(0);
    for (const e of errs) {
      expect(ALLOWED_CODES).toContain(e.code);
      // no internal errors and no echo of attacker input beyond the 40-char type
      expect(e.message.length).toBeLessThan(200);
    }
    expect(errs.filter((e) => e.code === 'invalid' && e.message !== 'Invalid message payload')).toEqual([]);
  }, 120_000);

  it('extra / prototype keys on valid payloads never grant anything (isHost, role, pid, accountId are ignored)', async () => {
    const before = lobbyFingerprint(witness.lobbyView, attacker.pid);
    const types: C2SType[] = ['lobby:settings', 'lobby:kick', 'lobby:transferHost', 'lobby:transferStoryteller', 'lobby:start', 'lobby:claimStoryteller', 'st:command', 'chat:send'];
    const cases = types.flatMap((t) => benignOddities(t)).map((c) => (c.type === 'lobby:kick' || c.type.startsWith('lobby:transfer') ? { ...c, payload: { ...(c.payload as object), pid: witness.pid } } : c));
    await paced(attacker, cases, 6);
    await sleep(600);
    expect(lobbyFingerprint(witness.lobbyView, attacker.pid)).toBe(before);
    expect(witness.room).not.toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  }, 60_000);

  it('schema-VALID but unauthorised / out-of-phase messages of every type from a plain player change nothing', async () => {
    const before = lobbyFingerprint(witness.lobbyView, attacker.pid);
    const t0 = Date.now();
    const real: Partial<Record<C2SType, unknown[]>> = {
      'lobby:kick': [{ pid: witness.pid }, { pid: host.pid }],
      'lobby:transferHost': [{ pid: attacker.pid }],
      'lobby:transferStoryteller': [{ pid: attacker.pid }],
      'lobby:settings': [{ name: 'pwned lobby', maxPlayers: 5, storytellerMode: 'auto' }],
    };
    const skip = new Set<C2SType>(['lobby:leave']);
    const cases: HostileCase[] = C2S_TYPES.filter((t) => !skip.has(t)).flatMap((t) => (real[t] ?? validSamples(t)).map((payload) => ({ type: t, label: 'valid', payload })));
    await paced(attacker, cases, 8);
    await sleep(800);
    expect(lobbyFingerprint(witness.lobbyView, attacker.pid)).toBe(before);
    const errs = errorsSince(attacker, t0);
    for (const e of errs) expect(ALLOWED_CODES).toContain(e.code);
    expect(errs.some((e) => e.code === 'forbidden' || e.code === 'phase')).toBe(true);
    expect(scanSecrecy(attacker, t0)).toEqual(CLEAN);
  }, 90_000);

  it('raw Colyseus frames (truncated, unknown protocol codes, bytes messages, malformed msgpack, raw __proto__ maps) never crash the server', async () => {
    const victim = precise[0]!;
    const ws = () => (victim.room as any)?.connection?.transport?.ws as { readyState: number; send(b: Uint8Array): void } | undefined;
    const str = (s: string) => {
      const b = Buffer.from(s);
      return Buffer.from([0xa0 | b.length, ...b]);
    };
    const frames: Buffer[] = [
      Buffer.from([]),
      Buffer.from([13]),
      Buffer.from([13, 0xdb, 0xff, 0xff, 0xff, 0xff]), // str32 type of 4 GiB
      Buffer.from([13, 0xcb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 0]), // NaN as message type
      Buffer.from([13, 0xcc, 0xff]),
      Buffer.from([99, 1, 2, 3]),
      Buffer.from([10, 0, 0]), // JOIN_ROOM after joining
      Buffer.concat([Buffer.from([13]), str('lobby:settings'), Buffer.from([0x81]), str('__proto__'), Buffer.from([0x81]), str('isHost'), Buffer.from([0xc3])]),
      ...C2S_TYPES.map((t) => Buffer.concat([Buffer.from([17]), str(t), Buffer.from('raw bytes \u0000ÿ')])),
      Buffer.concat([Buffer.from([13]), str('move'), Buffer.from([0xc1])]), // never-used msgpack byte (decoder throws -> client closed)
    ];
    const before = lobbyFingerprint(witness.lobbyView, victim.pid);
    for (const f of frames) {
      const s = ws();
      if (s?.readyState === 1) s.send(f);
      await sleep(30);
    }
    await sleep(800);
    expect(await healthy()).toBe(true);
    expect(lobbyFingerprint(witness.lobbyView, victim.pid)).toBe(before);
    expect(await pingRtt(witness)).toBeLessThan(2000);
    // A frame over maxPayload (24 KiB) closes only the sender.
    const sender = precise[3]!;
    const sws = (sender.room as any)?.connection?.transport?.ws as { readyState: number; send(b: Uint8Array): void } | undefined;
    if (sws?.readyState === 1) sws.send(Buffer.concat([Buffer.from([13]), str('chat:send'), Buffer.alloc(25 * 1024, 0x61)]));
    await sleep(800);
    expect(await healthy()).toBe(true);
    expect(await pingRtt(witness)).toBeLessThan(2000);
    console.info(`[raw frames] victim socket ${victim.room ? 'open' : `closed (${victim.lastCloseCode})`}; oversize sender ${sender.room ? 'open' : `closed (${sender.lastCloseCode})`}`);
  }, 60_000);

  it('replays: duplicate / old move seqs are ignored, a re-used pin id or double unpin changes nothing', async () => {
    const me = attacker;
    const snap = () => me.latest['world:snapshot'] as WorldSnapshot | undefined;
    await until(() => snap()?.entities.find((e) => e.id === me.pid), 5000, 'own entity');
    const pos = snap()!.entities.find((e) => e.id === me.pid)!;
    const seq = (snap()!.ackSeq ?? 0) + 1;
    trySend(me, 'move', { seq, x: pos.x + 4, y: pos.y, facing: 'right', moving: true });
    await sleep(300);
    // replay of an old seq that would teleport us back / elsewhere: must be ignored
    trySend(me, 'move', { seq, x: pos.x - 4, y: pos.y, facing: 'left', moving: true });
    trySend(me, 'move', { seq: seq - 1, x: pos.x, y: pos.y + 4, facing: 'down', moving: true });
    await sleep(400);
    const now = snap()!.entities.find((e) => e.id === me.pid)!;
    expect(now.x === pos.x + 4 || (me.recorder.last('world:teleport') as any)?.reason === 'correction').toBe(true);
    // pins: drop one, remove it twice, then remove an id that never existed: identical answers
    const t0 = Date.now();
    trySend(me, 'social:pin', { target: { kind: 'place', x: now.x, y: now.y }, color: 'gold' });
    const pins = await until(() => (snap()?.pins as PinView[] | undefined)?.filter((p) => p.by === me.pid), 3000, 'own pin');
    const id = pins[0]!.id;
    trySend(me, 'social:unpin', { id });
    await sleep(500);
    trySend(me, 'social:unpin', { id });
    await sleep(500);
    trySend(me, 'social:unpin', { id: 'neverexisted' });
    await sleep(500);
    const errs = errorsSince(me, t0).filter((e) => e.for === 'social:unpin');
    expect(errs.length).toBe(2);
    expect(errs[0]).toEqual(errs[1]);
  }, 30_000);

  it('bursts: 60 frames of every type at once are rate-limited and do not stall the other members', async () => {
    const b = precise[1]!;
    const t0 = Date.now();
    for (const type of C2S_TYPES) for (let i = 0; i < 60; i++) trySend(b, type, 'garbage');
    const rtt = await pingRtt(witness);
    await sleep(1000);
    expect(rtt).toBeLessThan(2000);
    expect(await healthy()).toBe(true);
    const errs = errorsSince(b, t0);
    expect(errs.some((e) => e.code === 'rate_limited' || e.code === 'invalid')).toBe(true);
  }, 30_000);

  it('SEC-7: a client that keeps sending invalid messages (under the frame budget) is closed with CLOSE_CODES.abuse', async () => {
    const b = precise[2]!;
    const t0 = Date.now();
    // 50 garbage frames/s: well under sec-host's pre-decode frame budget (80/s), so only the
    // message-level violation score (burst 150, 10/s) can close it — after ~4 s.
    for (let i = 0; i < 500 && b.room; i++) {
      trySend(b, C2S_TYPES[i % C2S_TYPES.length]!, 'garbage');
      await sleep(20);
    }
    await until(() => b.room === null, 5000, 'closed');
    expect(b.lastCloseCode).toBe(CLOSE_CODES.abuse);
    expect(Date.now() - t0).toBeGreaterThan(2500); // an honest burst is not punished
    expect(server.logs()).toContain('too many protocol violations');
    expect(await pingRtt(witness)).toBeLessThan(2000);
  }, 30_000);
});

// ---------------------------------------------------------------------------------------------

describe.skipIf(!features.rooms)(`hostile clients in a running human-Storyteller game${pending(features.rooms, features.reasons.rooms)}`, () => {
  let g: Game;
  let mallory: Bot;
  beforeAll(async () => {
    g = (await setupGame(server.url, server.wsUrl, { players: 5, prefix: uniq('hg-') }))!;
    all.push(g.st, ...g.players);
    mallory = g.players[0]!;
  }, 90_000);

  it('every StCommand variant (schema-valid) sent by a player is refused and changes nothing', async () => {
    const before = gameFingerprint(g.stView());
    const t0 = Date.now();
    await paced(mallory, validSamples('st:command').map((payload) => ({ type: 'st:command', label: 'valid', payload })), 7);
    await sleep(800);
    expect(gameFingerprint(g.stView())).toBe(before);
    const errs = errorsSince(mallory, t0).filter((e) => e.for === 'st:command');
    expect(errs.length).toBeGreaterThan(0);
    for (const e of errs) expect(['forbidden', 'rate_limited']).toContain(e.code);
  }, 60_000);

  it('lobby administration, story and Storyteller-only messages from a player mid-game change nothing', async () => {
    const before = gameFingerprint(g.stView());
    const lobbyBefore = lobbyFingerprint(g.st.lobbyView, mallory.pid);
    const t0 = Date.now();
    const victim = g.players[1]!;
    for (const [type, payload] of [
      ['lobby:kick', { pid: victim.pid }],
      ['lobby:transferHost', { pid: mallory.pid }],
      ['lobby:transferStoryteller', { pid: mallory.pid }],
      ['lobby:claimStoryteller', {}],
      ['lobby:settings', { name: 'pwned' }],
      ['lobby:start', {}],
      ['lobby:abort', {}],
      ['lobby:cosmetics', { cosmetics: (mallory.lobbyView?.members.find((m) => m.pid === victim.pid)?.cosmetics ?? {}) }],
      ['story:get', {}],
      ['story:release', { kind: 'final', digest: 'x' }],
      ['voice:announce', { active: true }],
      ['social:clearPins', { scope: 'all' }],
      ['clock:propose', { minutes: 5 }],
    ] as const) {
      trySend(mallory, type, payload);
      await sleep(150);
    }
    await sleep(800);
    expect(gameFingerprint(g.stView())).toBe(before);
    expect(lobbyFingerprint(g.st.lobbyView, mallory.pid)).toBe(lobbyBefore);
    expect(mallory.recorder.messages.filter((m) => m.at >= t0 && m.type === 'story:st')).toEqual([]);
    for (const e of errorsSince(mallory, t0)) expect(ALLOWED_CODES).toContain(e.code);
  }, 30_000);

  it('the mutation catalogue for every type mid-game: no state change, and nothing secret in any reply', async () => {
    const before = gameFingerprint(g.stView());
    const t0 = Date.now();
    await paced(mallory, C2S_TYPES.flatMap((t) => hostileCases(t)), 15);
    await sleep(800);
    expect(await healthy()).toBe(true);
    expect(gameFingerprint(g.stView())).toBe(before);
    expect(scanSecrecy(mallory, t0)).toEqual(CLEAN);
  }, 90_000);

  it("errors for pins / pointing at someone you cannot see equal those for a pid that doesn't exist", async () => {
    // Day 1: every player woke up in their own home, so nobody sees anybody else.
    const target = g.players[1]!;
    const ask = async (type: 'social:pin' | 'social:emote', payload: unknown) => {
      const t0 = Date.now();
      trySend(mallory, type, payload);
      return mallory.waitFor<Err>('error', (e) => e.for === type, 3000, t0);
    };
    const hidden = await ask('social:pin', { target: { kind: 'person', pid: target.pid }, color: 'gold' });
    await sleep(400);
    const ghost = await ask('social:pin', { target: { kind: 'person', pid: 'p_doesnotexist' }, color: 'gold' });
    await sleep(400);
    const hiddenE = await ask('social:emote', { kind: 'point', x: 100, y: 100, pid: target.pid });
    await sleep(400);
    const ghostE = await ask('social:emote', { kind: 'point', x: 100, y: 100, pid: 'p_doesnotexist' });
    expect(hidden).toEqual(ghost);
    expect(hiddenE).toEqual(ghostE);
  }, 30_000);

  it('at night: out-of-phase player actions are refused, and neither the replies nor the directory stream reveal the night', async () => {
    const outsider = (await makeBots(1, uniq('out-'), server.url, server.wsUrl))[0]!;
    all.push(outsider);
    const sse = await outsider.api.openDirectory();
    await toNight(g);
    await sleep(800);
    const n0 = sse.events.length;
    const t0 = Date.now();
    const home = homeBuilding(townLayout, (mallory.gameView as PlayerGameView).you.seat)!;
    const other = homeBuilding(townLayout, (g.players[1]!.gameView as PlayerGameView).you.seat)!;
    for (const [type, payload] of [
      ['game:nominate', { nomineeSeat: 1 }],
      ['game:vote', { nominationId: 'd1-nom1', vote: true }],
      ['game:slayerShot', { targetSeat: 1 }],
      ['game:promptResponse', { promptId: 'q1-1', seats: [1] }],
      ['world:useDoor', { buildingId: home.id }],
      ['world:useDoor', { buildingId: other.id }],
      ['clock:propose', { minutes: 2 }],
      ['social:emote', { kind: 'point', x: 10, y: 10, pid: g.players[1]!.pid }],
    ] as const) {
      trySend(mallory, type, payload);
      await sleep(250);
    }
    // the Storyteller works the night: a visit, a prompt, a silent kill, poison
    const victim = g.grimoire.find((e) => e.character !== 'imp' && e.seat !== (mallory.gameView as PlayerGameView).you.seat)!;
    g.cmd({ type: 'visit_home', seat: victim.seat });
    g.cmd({ type: 'set_status', seat: victim.seat, poisoned: true });
    g.cmd({ type: 'kill', seat: victim.seat, announce: false });
    await sleep(1000);
    g.cmd({ type: 'leave_home' });
    await sleep(1000);
    const errs = errorsSince(mallory, t0);
    for (const e of errs) expect(ALLOWED_CODES).toContain(e.code);
    expect(scanSecrecy(mallory, t0)).toEqual(CLEAN);
    expect(sse.events.slice(n0).filter((e) => e.type === 'upsert' && (e as any).lobby.id === g.lobbyId)).toEqual([]);
    sse.close();
    // undo the kill so later tests start from a living town
    g.cmd({ type: 'set_alive', seat: victim.seat, alive: true });
    g.cmd({ type: 'set_status', seat: victim.seat, poisoned: false });
    await sleep(500);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------
// Hidden-state oracles (open findings)

const EVIL_ROLES = new Set(['imp', 'poisoner', 'spy', 'scarlet_woman', 'baron']);

describe.skipIf(!features.rooms)(`hidden-state oracles${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('SEC-2: a pending (unconfirmed) game end cannot be detected by probing with a player action', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 5, prefix: uniq('rp-') }))!;
    all.push(g.st, ...g.players);
    await toNight(g);
    const imp = g.grimoire.find((e) => e.character === 'imp')!;
    const goods = g.grimoire.filter((e) => e.seat !== imp.seat);
    const survivor = g.players.find((p) => g.seatOf.get(p) === goods[0]!.seat)!;
    const probe = async () => {
      const t0 = Date.now();
      survivor.send('game:promptResponse', { promptId: 'q-probe' });
      const e = await survivor.waitFor<Err>('error', (x) => x.for === 'game:promptResponse', 3000, t0);
      await sleep(1100);
      return e;
    };
    const baseline = await probe();
    // The Demon's kills tonight leave two alive: the engine proposes "evil wins" and waits for the ST.
    for (const e of goods.slice(1)) g.cmd({ type: 'kill', seat: e.seat, announce: false });
    await until(() => (g.stView() as any)?.pendingResult, 5000, 'pending result');
    const during = await probe();
    console.info(`[SEC-2] baseline=${JSON.stringify(baseline)} while-pending=${JSON.stringify(during)}`);
    g.cmd({ type: 'override_result' });
    expect(during).toEqual(baseline);
  }, 90_000);

  it('SEC-3: a pin the Storyteller drops in a home at dawn does not survive into the day', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 5, prefix: uniq('dp-') }))!;
    all.push(g.st, ...g.players);
    const [x, y] = [g.players[1]!, g.players[2]!];
    const homeX = homeBuilding(townLayout, g.seatOf.get(x)!)!;
    await toNight(g);
    g.cmd({ type: 'force_phase', to: 'dawn' });
    await until(() => g.stView()?.phase === 'dawn', 5000, 'dawn');
    await sleep(300);
    const t0 = Date.now();
    g.cmd({ type: 'teleport_self', to: { kind: 'building', buildingId: homeX.id } });
    const tp = await g.st.waitFor<{ x: number; y: number; location: string }>('world:teleport', (t) => t.location === `bld:${homeX.id}`, 5000, t0);
    g.st.send('social:pin', { target: { kind: 'place', x: tp.x, y: tp.y + 4 }, color: 'crimson' });
    await until(() => ((g.st.latest['world:snapshot'] as WorldSnapshot | undefined)?.pins ?? []).some((p) => p.by === g.st.pid), 3000, 'ST pin');
    g.cmd({ type: 'advance_phase', to: 'day' });
    await until(() => g.stView()?.phase === 'day', 5000, 'day');
    // Another player walks into that cottage during the day (teleported here for brevity).
    g.cmd({ type: 'teleport', who: [g.seatOf.get(y)!], to: { kind: 'building', buildingId: homeX.id } });
    await until(() => y.location === `bld:${homeX.id}`, 5000, 'Y inside');
    await sleep(500);
    const pins = ((y.latest['world:snapshot'] as WorldSnapshot | undefined)?.pins ?? []) as PinView[];
    console.info(`[SEC-3] pins seen by a day visitor of ${homeX.id}: ${JSON.stringify(pins)}`);
    expect(pins.filter((p) => p.character === 'storyteller')).toEqual([]);
  }, 90_000);

  it('SEC-1: in an automatic game, when first-night info arrives does not depend on other players (night order / Poisoner)', async () => {
    const bots = await makeBots(10, uniq('au-'), server.url, server.wsUrl);
    all.push(...bots);
    for (const [i, b] of bots.entries()) b.autoRespondEnabled = i % 2 === 0; // half answer within ~1 s, half never (fate at the deadline)
    const [host, ...rest] = bots as [Bot, ...Bot[]];
    const r = await host.api.req<{ lobby: { id: string } }>('POST', '/api/lobbies', { name: uniq('Auto '), maxPlayers: 10, storytellerMode: 'auto' });
    expect(r.status).toBe(201);
    const id = r.body.lobby.id;
    await host.join(id);
    for (const b of rest) await b.join(id);
    await until(() => host.lobbyView?.members.length === 10, 10_000, '10 members');
    const nightSec = 20;
    host.send('lobby:settings', { autoTimings: { nightSec, bedtimeSec: 15 } });
    await sleep(500);
    for (const b of bots) b.send('lobby:ready', { ready: true });
    await until(() => host.lobbyView?.canStart, 8000, 'canStart');
    host.send('lobby:start', {});
    const firstNight = (b: Bot) => b.recorder.messages.find((m) => m.type === 'game:view' && (m.payload as PlayerGameView).phase === 'first_night')?.at;
    await until(() => bots.every(firstNight), 80_000, 'first night for everyone');
    await until(() => bots.some((b) => (b.gameView as PlayerGameView)?.phase === 'day'), 60_000, 'dawn');
    const delays = bots
      .map((b) => {
        const night = firstNight(b)!;
        const info = b.recorder.messages.find((m) => m.type === 'game:view' && m.at >= night && ((m.payload as PlayerGameView).info?.length ?? 0) > 0);
        return { bot: b.name, role: (b.gameView as PlayerGameView).you.role?.character, ms: info ? info.at - night : null };
      })
      // Evil-team info (Demon / Minion info) is due at nightfall for every evil player alike: not a signal.
      .filter((d) => d.ms !== null && !EVIL_ROLES.has(d.role ?? ''));
    console.info(`[SEC-1] first-night info delay after nightfall (night min ${nightSec}s): ${JSON.stringify(delays)}`);
    expect(delays.length).toBeGreaterThan(0);
    // Released together at nightfall + promptTimeout (15 s for a 20 s night), whatever anyone answered.
    for (const d of delays) expect(d.ms!, `${d.bot} (${d.role})`).toBeGreaterThanOrEqual(15_000 - 500);
    const ms = delays.map((d) => d.ms!);
    expect(Math.max(...ms) - Math.min(...ms)).toBeLessThan(400);
  }, 200_000);
});
