// life walkers (owner: life agent): villagers that follow the lanes, visit cottages (their doors open for them) and
// run errands (the lamplighter). Characters come from the character pipeline (src/chars, characters/*: read only).
//
// A walker is a ROUTE compiled at build into timed segments (walk a -> b at the character's walk speed, or hold);
// pos(t) / face(t) / action(t) / hidden(t) are lookups (pure f(t)), and the Character runtime turns them into a
// stepped gait (planted feet, quantised facing, held poses on the 30 Hz grid, root snapped to texels).
// Route actions:
//   {to: [x, z]}                       walk there along the tile grid (A* on layout.blocked, 8-neighbour, string-pulled)
//   {wait: s, face?: rad, action?: clip, at?: s}   stand (optionally play a one-shot clip `at` s into the wait)
//   {visit: 'house-3', stay: s}        walk to the door tile, the door opens, step in and vanish, stay, come back out
//   {lamp: {pos}, onLit?}              walk beside a lamp, raise the lantern, the lamp lights (an event for cycle.js)
// Every visit emits door events [{door, t, kind: 'open'|'close'}]; lamp actions emit [{t, light}] lamp events.
import * as THREE from 'three';
import { Character } from '../../chars/character.js';
import { clamp, TAU } from './util.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------------ paths
/** A* on the layout tile grid (8-neighbour, no corner cutting). Returns tile-centre points from a to b. */
export function findPath(layout, a, b) {
  const W = layout.TOWN_W, H = layout.TOWN_H;
  // the dais (braziers, lectern) is a stage, not a short cut: tiles within 2.9 m of the circle centre are walled off
  const C = layout.CIRCLE;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && !layout.blocked(x, z) && Math.hypot(x + 0.5 - C.cx, z + 0.5 - C.cz) > 2.9;
  const sx = Math.floor(a.x), sz = Math.floor(a.z), gx = Math.floor(b.x), gz = Math.floor(b.z);
  const key = (x, z) => z * W + x;
  const g = new Map([[key(sx, sz), 0]]), from = new Map(), open = [[0, sx, sz]];
  const hdist = (x, z) => Math.hypot(x - gx, z - gz);
  const closed = new Set();
  while (open.length) {
    open.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    const [, x, z] = open.shift();
    const k = key(x, z);
    if (closed.has(k)) continue;
    closed.add(k);
    if (x === gx && z === gz) break;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (!ok(nx, nz) && !(nx === gx && nz === gz)) continue;
      if (dx && dz && (!ok(x + dx, z) || !ok(x, z + dz))) continue;      // no corner cutting
      // prefer lanes / plaza (cobble) a little: villagers keep to the streets
      const code = layout.groundAt(nx, nz);
      const cost = (dx && dz ? Math.SQRT2 : 1) * (code === '=' || code === 'o' || code === 'O' || code === ':' ? 1 : 1.35);
      const ng = g.get(k) + cost;
      const nk = key(nx, nz);
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, k); open.push([ng + hdist(nx, nz), nx, nz]); }
    }
  }
  const out = [];
  let k = key(gx, gz);
  if (!from.has(k) && k !== key(sx, sz)) return [a.clone(), b.clone()];
  while (k !== undefined) { out.push(V((k % W) + 0.5, Math.floor(k / W) + 0.5)); k = from.get(k); }
  out.reverse();
  out[0] = a.clone(); out[out.length - 1] = b.clone();
  // string pulling: drop points while the straight line stays on walkable tiles
  const clear = (p, q) => {
    const n = Math.ceil(p.distanceTo(q) / 0.2);
    for (let i = 1; i < n; i++) {
      const x = p.x + (q.x - p.x) * (i / n), z = p.z + (q.z - p.z) * (i / n);
      for (const [ox, oz] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) if (!ok(Math.floor(x + ox), Math.floor(z + oz)) && !(Math.floor(x + ox) === gx && Math.floor(z + oz) === gz) && !(Math.floor(x + ox) === sx && Math.floor(z + oz) === sz)) return false;
    }
    return true;
  };
  const pts = [out[0]];
  let i = 0;
  while (i < out.length - 1) {
    let j = out.length - 1;
    while (j > i + 1 && !clear(out[i], out[j])) j--;
    pts.push(out[j]); i = j;
  }
  return pts;
}

// ------------------------------------------------------------------------------------------------ routes
/**
 * Compile a route into timed segments. ctx: {layout, houses: id -> record, doorOf(id) -> door anchor}.
 * Returns {segs, doorEvents, lampEvents, end}.
 */
export function compileRoute(start, actions, { layout, records, doorOf, speed = 1.2, t0 = 0 } = {}) {
  const segs = [], doorEvents = [], lampEvents = [];
  let t = t0, p = start.clone(), face = 0;
  const walk = (q, opts = {}) => {
    const pts = opts.direct ? [p.clone(), q.clone()] : findPath(layout, p, q);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = a.distanceTo(b);
      if (d < 1e-3) continue;
      const dur = d / (opts.speed ?? speed);
      segs.push({ t0: t, t1: t + dur, a: a.clone(), b: b.clone(), hidden: !!opts.hidden, face: opts.face });
      face = Math.atan2(b.x - a.x, b.z - a.z);
      t += dur;
    }
    p = q.clone();
  };
  const hold = (dur, opts = {}) => {
    segs.push({ t0: t, t1: t + dur, a: p.clone(), b: p.clone(), hidden: !!opts.hidden, face: opts.face ?? face, action: opts.action, actionAt: t + (opts.at ?? 0) });
    if (opts.face !== undefined) face = opts.face;
    t += dur;
  };
  for (const A of actions) {
    if (A.to) walk(V(A.to[0], A.to[1]), A);
    else if (A.wait !== undefined) hold(A.wait, A);
    else if (A.visit) {
      const r = records[A.visit];
      const door = doorOf(A.visit);
      if (!r) continue;
      const n = r.doorNormal;                                          // outward
      const tile = V(r.door.x + 0.5, r.door.z + 0.5);
      // stand 0.5 m in front of the door plane on the door's axis (side doors: the door is at the south end)
      const front = V(r.doorPoint.x + n[0] * 0.55, r.doorPoint.z + n[1] * 0.55);
      // inside: 0.95 m behind the door point, i.e. well past the doorway's dark interior plate (~0.28 m): the body is
      // cut by the plate as it crosses the threshold (2-3 stepped frames) and is fully hidden before it is removed
      const inside = V(r.doorPoint.x - n[0] * 0.95, r.doorPoint.z - n[1] * 0.95);
      const inFace = Math.atan2(-n[0], -n[1]), outFace = Math.atan2(n[0], n[1]);
      const sIn = speed * 0.8;
      walk(tile);
      walk(front, { direct: true });
      const tFront = t;
      // the latch rattles ~1 s before the walker reaches the step (about 1.1 m out): the swing, overshoot and settle
      // happen on camera while the walker approaches and pauses on the doorstep
      if (door) doorEvents.push({ door, t: Math.max(t0, tFront - 1.0), kind: 'open' });
      hold(0.5, { face: inFace });                                     // a beat on the doorstep: the door settles
      walk(inside, { direct: true, speed: sIn });
      if (door) doorEvents.push({ door, t: t + 0.15, kind: 'close' });
      hold(A.stay ?? 5, { hidden: true, face: outFace });
      if (door) doorEvents.push({ door, t: t - 1.3, kind: 'open' });
      walk(front, { direct: true, speed: sIn });
      walk(tile, { direct: true });
      if (door) doorEvents.push({ door, t: t + 0.3, kind: 'close' });
    } else if (A.lamp) {
      const L = A.lamp.pos;
      // stand on the walkable tile beside the lamp nearest the camera side (+z first)
      const tx = Math.floor(L.x), tz = Math.floor(L.z);
      const opts = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]];
      let spot = null;
      for (const [dx, dz] of opts) if (!layout.blocked(tx + dx, tz + dz)) { spot = V(tx + dx + 0.5 - dx * 0.25, tz + dz + 0.5 - dz * 0.25); break; }
      if (!spot) continue;
      walk(spot);
      const f = Math.atan2(L.x - spot.x, L.z - spot.z);
      hold(A.hold ?? 2.6, { face: f, action: A.action ?? 'raise', at: 0.25 });
      lampEvents.push({ t: t - (A.hold ?? 2.6) + 1.35, light: A.lamp });
    }
  }
  return { segs, doorEvents, lampEvents, end: t, last: p.clone(), face };
}

/** Lookup of a compiled route at t. */
export function routeAt(route, t, out = new THREE.Vector3()) {
  const S = route.segs;
  if (!S.length) return { pos: out.set(0, 0, 0), face: 0, hidden: false, seg: null };
  // the first segment with t < t1 (the last one past the end). (perf) The search starts from the previous lookup's
  // segment (time mostly moves forward a few ms per call; the ambient routes have hundreds of segments): the same
  // segment a linear scan from 0 finds, since the t1 are non-decreasing.
  const n = S.length;
  let s;
  if (t >= S[n - 1].t1) s = S[n - 1];
  else {
    let i = route._i ?? 0;
    if (i >= n) i = n - 1;
    while (i > 0 && t < S[i - 1].t1) i--;
    while (i < n - 1 && t >= S[i].t1) i++;
    route._i = i;
    s = S[i];
  }
  const u = s.t1 > s.t0 ? clamp((t - s.t0) / (s.t1 - s.t0)) : 1;
  out.lerpVectors(s.a, s.b, t < s.t0 ? 0 : u);
  const moving = s.a.distanceToSquared(s.b) > 1e-6;
  const face = s.face ?? (moving ? Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z) : undefined);
  return { pos: out, face, hidden: s.hidden && t >= s.t0, seg: s };
}

// ------------------------------------------------------------------------------------------------ characters
/**
 * Spawn a Character for a compiled route. clock(t) maps engine time to life time (scrubbing offset). Returns
 * {ch, route, at(t) -> Vector3 (life time), update(tl)}.
 */
export function spawnWalker(engine, group, spec, route, { clock = (t) => t, name = 'walker' } = {}) {
  const proxy = Object.create(engine);
  proxy.onUpdate = (fn) => engine.onUpdate((t, dt, e) => fn(clock(t), dt, e));
  const first = routeAt(route, 0);
  const ch = new Character(proxy, spec, { ground: { heightAt: () => 0 }, facingSteps: 8, snap: true, position: first.pos.clone(), face: first.face ?? 0 });
  ch.root.name = name;
  const tmp = new THREE.Vector3(), dpos = new THREE.Vector3();
  const d = { pos: dpos, face: undefined, action: null };
  // (perf) one reused sample object: the Character copies d.pos at once (character.js _sample clones it)
  ch.drive((t) => {
    const r = routeAt(route, t, tmp);
    const s = r.seg;
    d.pos.copy(r.pos); d.face = r.face;
    d.action = s?.action && t >= s.actionAt && t < s.actionAt + 0.05 ? s.action : null;
    return d;
  });
  group.add(ch.root);
  return {
    ch, route, name,
    at: (t) => routeAt(route, t, new THREE.Vector3()).pos,
    // hidden (indoors): scale 0 instead of visible = false, so the material stays compiled from frame 0 (constant programs)
    update(tl) { const h = routeAt(route, tl, tmp).hidden; ch.root.scale.setScalar(h ? 1e-4 : 1); ch.root.visible = true; },
  };
}

export { TAU };
