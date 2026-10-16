import { describe, expect, it } from 'vitest';
import {
  SNAP_DELTA,
  SNAP_KEY,
  SNAP_KEEPALIVE_MS,
  SNAP_KEYFRAME_MS,
  SNAP_RESET,
  SNAP_TABLE_MAX,
  SnapshotDecoder,
  SnapshotEncoder,
  snapCapable,
  FACINGS,
  type EntityState,
  type Snap2Frame,
  type WorldSnapshot,
} from '../src/index.js';

// (v2.2, WP4) The compact snapshot codec must reproduce the server's per-viewer WorldSnapshot
// exactly, never confuse "unchanged" with "removed", and never carry anything the viewer's own
// snapshots did not contain.

const STEP = 1000 / 12;

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ent = (id: string, x: number, y: number, extra: Partial<EntityState> = {}): EntityState => ({ id, x, y, facing: 'down', moving: false, location: 'outdoors', ...extra });

/** Over the wire the frame goes through msgpack; JSON is an equivalent lossless check for these values. */
const wire = (f: Snap2Frame | null) => (f ? (JSON.parse(JSON.stringify(f)) as Snap2Frame) : null);

/** A server-side snapshot as snapshotFor builds it (field order included). */
function snap(t: number, ackSeq: number, entities: EntityState[], extra: Partial<WorldSnapshot> = {}): WorldSnapshot {
  const s: WorldSnapshot = { t, ackSeq, entities };
  if (extra.you) s.you = extra.you;
  if (extra.doors) s.doors = extra.doors;
  if (extra.doorTags) s.doorTags = extra.doorTags;
  if (extra.pins) s.pins = extra.pins;
  return s;
}

/** Random walk of one viewer's snapshots: people come and go, walk, stop, turn, change rooms. */
function scenario(seed: number, steps: number): WorldSnapshot[] {
  const rnd = mulberry(seed);
  const ids = ['me', 'p_a1', 'p_b2', 'p_c3', 'p_d4', 'st_x'];
  const locs = ['outdoors', 'bld:house-1', 'bld:tavern'] as const;
  const state = new Map(ids.map((id, i) => [id, ent(id, 100 + i * 17.3, 200 - i * 3.1)]));
  let visible = new Set(ids.slice(0, 4));
  let ack = 0;
  let t = 1_760_000_000_000;
  const out: WorldSnapshot[] = [];
  let doors: Record<string, boolean> | undefined;
  let pins: WorldSnapshot['pins'];
  let you: WorldSnapshot['you'];
  for (let i = 0; i < steps; i++) {
    t += Math.round(STEP + (rnd() - 0.5) * 6);
    if (rnd() < 0.05) visible = new Set(ids.filter(() => rnd() < 0.6));
    visible.add('me');
    for (const id of ids) {
      const e = state.get(id)!;
      const r = rnd();
      if (r < 0.35) {
        const x = Math.round((e.x + (rnd() - 0.5) * 25) * 10) / 10;
        const y = Math.round((e.y + (rnd() - 0.5) * 25) * 10) / 10;
        state.set(id, { ...e, x, y, moving: true, facing: FACINGS[Math.floor(rnd() * 4)]! });
      } else if (r < 0.45) state.set(id, { ...e, moving: false });
      else if (r < 0.48) state.set(id, { ...e, location: locs[Math.floor(rnd() * locs.length)]! });
    }
    if (rnd() < 0.5 && i % 3 === 0) ack++;
    if (rnd() < 0.03) doors = rnd() < 0.5 ? undefined : { tavern: rnd() < 0.5 };
    if (rnd() < 0.03) pins = rnd() < 0.5 ? undefined : [{ id: `pin${i}`, by: 'p_a1', character: 'chef', color: 'gold', target: { kind: 'place', x: 10, y: 20 }, at: t }];
    if (rnd() < 0.03) you = rnd() < 0.5 ? undefined : { mode: 'auto', goal: 'home', path: [{ x: 1.5, y: 2 }] };
    // still stretches: nobody moves for a while
    if (i % 40 > 25) for (const id of ids) state.set(id, { ...state.get(id)!, moving: false });
    const list = ids.filter((id) => visible.has(id)).map((id) => ({ ...state.get(id)! }));
    if (i % 40 > 25) for (const e of list) Object.assign(e, out.at(-1)?.entities.find((x) => x.id === e.id) ?? e);
    out.push(snap(t, ack, list, { you, doors, pins }));
  }
  return out;
}

describe('snapshot codec (world:snap2)', () => {
  it('decodes every frame to exactly the snapshot the server computed; skipped frames equal the held state', () => {
    for (const seed of [1, 2, 3, 42, 777]) {
      const enc = new SnapshotEncoder();
      const dec = new SnapshotDecoder();
      let frames = 0;
      let skipped = 0;
      for (const s of scenario(seed, 600)) {
        const f = wire(enc.encode(s));
        if (f) {
          frames++;
          expect(JSON.stringify(dec.decode(f)), `seed ${seed} t ${s.t}`).toBe(JSON.stringify(s));
        } else {
          skipped++;
          expect(JSON.stringify(dec.current(s.t)), `seed ${seed} held t ${s.t}`).toBe(JSON.stringify(s));
        }
      }
      expect(frames).toBeGreaterThan(100);
      expect(skipped).toBeGreaterThan(10); // the still stretches
    }
  });

  it('quantises to 0.1 px losslessly (server positions are already rounded to 0.1 px), incl. negative and large values', () => {
    const xs = [0, 0.1, 0.3, 0.7, 12.3, 99.9, 1535.9, 6553.5, 6553.6, 9999.9, -0.1, -12.3];
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    const s = snap(5, 0, xs.map((x, i) => ent(`p${i}`, x, Math.round((x * 3 + 0.1) * 10) / 10)));
    const f = wire(enc.encode(s))!;
    expect(f[0]).toBe(SNAP_RESET);
    expect(dec.decode(f)).toEqual(s);
    for (const n of f[3]!) expect(Number.isInteger(n)).toBe(true); // msgpack ints: town coords fit uint16
  });

  it('keyframe every second, 2 Hz keepalive while nothing changes, nothing in between', () => {
    const enc = new SnapshotEncoder();
    const ents = [ent('me', 10, 10), ent('p_a', 20, 20)];
    const kinds: (number | null)[] = [];
    for (let i = 0; i < 37; i++) kinds.push(enc.encode(snap(1000 + Math.round(i * STEP), 3, ents))?.[0] ?? null);
    const at = (k: number) => kinds.flatMap((x, i) => (x === k ? [i] : []));
    expect(at(SNAP_RESET)).toEqual([0]);
    expect(at(SNAP_KEY)).toEqual([12, 24, 36]); // every 12th frame = 1 s at 12 Hz
    expect(at(SNAP_DELTA)).toEqual([6, 18, 30]); // keepalives
    expect(SNAP_KEYFRAME_MS).toBeLessThanOrEqual(1000);
    expect(SNAP_KEEPALIVE_MS).toBeLessThanOrEqual(500);
    const ka = enc.encode(snap(1000 + Math.round(42 * STEP), 3, ents));
    expect(ka).toEqual([SNAP_DELTA, Math.round(42 * STEP) - Math.round(36 * STEP), 3]); // [kind, dt, ackSeq] only
  });

  it('a changed ackSeq goes out at once (reconciliation), even with no entity change', () => {
    const enc = new SnapshotEncoder();
    const ents = [ent('me', 10, 10)];
    enc.encode(snap(0, 1, ents));
    expect(enc.encode(snap(83, 1, ents))).toBeNull();
    expect(enc.encode(snap(166, 2, ents))).toEqual([SNAP_DELTA, 166, 2]);
  });

  it('a reloaded client (fresh decoder) learns the server ackSeq from its first frame and from keepalives', () => {
    // (v2.2.1, Isaac's cafb858) TownScene adopts max(seq, snapshot.ackSeq) after a reload, so the
    // decoded snap2 snapshot must carry the server's last accepted move seq, not 0.
    const enc = new SnapshotEncoder();
    const ents = [ent('me', 10, 10)];
    const dec = new SnapshotDecoder();
    expect(dec.decode(wire(enc.encode(snap(0, 1000, ents)))!)!.ackSeq).toBe(1000);
    const ka = wire(enc.encode(snap(83, 1001, ents)))!;
    expect(ka).toEqual([SNAP_DELTA, 83, 1001]);
    expect(dec.decode(ka)!.ackSeq).toBe(1001);
  });

  it('omitted-because-unchanged is never confused with removed', () => {
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    const a = ent('p_a', 10, 10);
    const b = ent('p_b', 50, 50);
    dec.decode(wire(enc.encode(snap(0, 0, [a, b])))!);
    // b stands still: the delta carries only a, b is still there after decoding
    const f1 = wire(enc.encode(snap(83, 0, [{ ...a, x: 11, moving: true }, b])))!;
    expect(f1[0]).toBe(SNAP_DELTA);
    expect((f1[3] as number[]).length).toBe(5);
    expect(dec.decode(f1)!.entities.map((e) => e.id)).toEqual(['p_a', 'p_b']);
    // b goes inside / out of sight: a keyframe at once, without b
    const f2 = wire(enc.encode(snap(166, 0, [{ ...a, x: 11, moving: true }])))!;
    expect(f2[0]).toBe(SNAP_KEY);
    expect(dec.decode(f2)!.entities.map((e) => e.id)).toEqual(['p_a']);
    // b comes back unchanged: listed again in full (keyframe), never resurrected silently
    const f3 = wire(enc.encode(snap(250, 0, [{ ...a, x: 11, moving: true }, b])))!;
    expect(f3[0]).toBe(SNAP_KEY);
    expect(dec.decode(f3)!.entities).toEqual([{ ...a, x: 11, moving: true }, b]);
    // same set in another order -> keyframe (output order is the server's)
    const f4 = wire(enc.encode(snap(333, 0, [b, { ...a, x: 11, moving: true }])))!;
    expect(f4[0]).toBe(SNAP_KEY);
    expect(dec.decode(f4)!.entities.map((e) => e.id)).toEqual(['p_b', 'p_a']);
  });

  it('per-viewer fields: you/doors/doorTags/pins appear, change and clear (null) exactly', () => {
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    const e = [ent('me', 1, 1)];
    const seq: WorldSnapshot[] = [
      snap(0, 0, e),
      snap(83, 0, e, { you: { mode: 'frozen' } }),
      snap(166, 0, e, { you: { mode: 'auto', goal: 'seat', path: [{ x: 1, y: 2 }] }, pins: [{ id: 'q', by: 'me', character: 'imp', color: 'crimson', target: { kind: 'person', pid: 'me' }, at: 3 }] }),
      snap(250, 0, e, { pins: [{ id: 'q', by: 'me', character: 'imp', color: 'crimson', target: { kind: 'person', pid: 'me' }, at: 3 }], doorTags: { tavern: [{ pid: 'me', ghost: false }] } }),
      snap(333, 0, e, { doors: { tavern: true } }),
      snap(416, 0, e),
    ];
    for (const s of seq) expect(JSON.stringify(dec.decode(wire(enc.encode(s))!))).toBe(JSON.stringify(s));
    expect(enc.encode(snap(500, 0, e))).toBeNull(); // nothing changed since: no frame
  });

  it('a new connection starts over: SNAP_RESET first, and a delta before any keyframe is refused', () => {
    const s0 = snap(0, 0, [ent('me', 1, 1), ent('p_a', 2, 2)]);
    const enc1 = new SnapshotEncoder();
    enc1.encode(s0);
    const delta = wire(enc1.encode(snap(83, 1, [ent('me', 1.5, 1), ent('p_a', 2, 2)])))!;
    expect(delta[0]).toBe(SNAP_DELTA);
    expect(new SnapshotDecoder().decode(delta)).toBeNull();
    // reconnect: a fresh encoder + decoder pair, table rebuilt from scratch
    const enc2 = new SnapshotEncoder();
    const dec2 = new SnapshotDecoder();
    const f = wire(enc2.encode(snap(166, 1, [ent('me', 1.5, 1), ent('p_a', 2, 2)])))!;
    expect(f[0]).toBe(SNAP_RESET);
    expect(f[4]).toEqual(['outdoors', 'me', 'p_a']);
    expect(dec2.decode(f)!.entities.map((e) => e.x)).toEqual([1.5, 2]);
  });

  it('secrecy: frames are a pure function of the viewer’s own snapshots; strings are indexed lazily on first send', () => {
    const seq = scenario(9, 400);
    const run = () => {
      const enc = new SnapshotEncoder();
      return seq.map((s) => JSON.stringify(enc.encode(s)));
    };
    expect(run()).toEqual(run());
    const enc = new SnapshotEncoder();
    const seen = new Set<string>();
    let table: string[] = [];
    for (const s of seq) {
      for (const e of s.entities) seen.add(e.id).add(e.location);
      const f = enc.encode(s);
      if (!f) continue;
      if (f[0] === SNAP_RESET) table = [];
      const defs = (f[4] as string[] | null | undefined) ?? [];
      // every new string is an id/location of an entity in THIS snapshot, used by this frame
      const here = new Set(s.entities.flatMap((e) => [e.id, e.location]));
      const used = new Set<number>();
      const ents = (f[3] as number[] | null | undefined) ?? [];
      for (let i = 0; i < ents.length; i += 5) used.add(ents[i]!).add(ents[i + 4]!);
      defs.forEach((d, k) => {
        expect(here.has(d), d).toBe(true);
        expect(used.has(table.length + k), d).toBe(true);
      });
      table.push(...defs);
      for (const d of table) expect(seen.has(d)).toBe(true);
    }
  });

  it('restarts the string table when it grows too large (bounded per-connection state)', () => {
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    let resets = 0;
    for (let i = 0; i < SNAP_TABLE_MAX + 40; i++) {
      const s = snap(i * 100, 0, [ent('me', 1, 1), ent(`p_${i}`, 2, 2)]);
      const f = wire(enc.encode(s))!;
      if (f[0] === SNAP_RESET) resets++;
      expect(dec.decode(f)).toEqual(s);
    }
    expect(resets).toBe(2);
  });

  it('capability flag: only the exact value enables the compact stream', () => {
    expect(snapCapable({ ticket: 'x', snap: 2 })).toBe(true);
    for (const o of [undefined, null, 'snap', { ticket: 'x' }, { snap: '2' }, { snap: 3 }, { snap: true }]) expect(snapCapable(o)).toBe(false);
  });
});
