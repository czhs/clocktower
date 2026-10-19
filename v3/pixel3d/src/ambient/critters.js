// Ambient system "critters" (owner: critters). Small animals on the ground that live their own stepped little
// lives and ANSWER the people walking through: cats loafing on perches and doorsteps (tail flicks, heads that track
// a walker, a ground cat that crouches, bolts and leaps onto a perch), hens pecking that flutter-run away, ducks
// that waddle into the pond and swim, frogs that hop into the water with a splash and peek back out, mice that dart
// between hiding spots, and a dog that gets up and follows a walker for a few seconds, gives up and trots home.
// Contract: docs/AMBIENT.md. Drawings: ./critters/drawings.js. Everything is ONE instanced pose batch
// (+3 GL calls: colour, normal, shadow; +1 where a reflective pond re-renders it), deterministic in t (15 Hz replay Ticker), snapped to texels.
//
// ---- Unique-to-me sheet (docs/AMBIENT.md §9) -------------------------------------------------------------------
// extra animated parts: cat head (3 yaw stops) + tail tip flick; hen neck / wings; duck neck, body roll (waddle);
//   frog legs (leap), eyes at the waterline, splash column / ring / ripple; mouse tail; dog legs, tail wag / thump,
//   head (3 yaw stops: a lying dog tracks whoever is near).
// own gait / motion: cat = slow slink (7.5 fps legs) / 2-drawing gallop / a leap up the perch face (never through
//   the stone); a perched cat hops along its ridge to a perch BEHIND a close runner (scored from where they will be in 0.5 s)
//   and back when calm: gather 2 ticks, arched HOP drawing on a 0.35 m arc, gathered landing 2 ticks; hen = flutter-hop
//   then run, wings beating at 15 fps for the first 0.4 s; duck = side-to-side waddle (body rolls +-12 deg) then
//   sinks to the waterline and drifts; frog = 2 hops of 7 texels into the water; mouse = stop-go darts (sniff
//   pauses) between hides, vanishing under stones; dog = trot on the walker's trail 0.6 s behind.
// expressions in this style: alert = SILHOUETTE change (cat drops 6+ texels into a flat crouch with ears back and
//   tail straight out, hen / duck neck +3 texels, frog flattens), a fright = a 3-4 texel flutter-hop, a splash =
//   2 drawings + a ripple, nothing fades.
// readability at game speed: trigger radii include the 0.35 s approach lookahead, so a 5.8 m/s runner sets things
//   off >= 0.3 s before contact (ambientpack reaction_lead); ALERT beats 0.13-0.4 s; flees are 0.6-1.6 s, big
//   enough to read in the 1x GIF. Every drawing is held >= 2 frames at 30 Hz (pose clocks k >= 2, travel k = 1).
//
// opts (all optional; missing groups fall back to the anchors, groups without a place are skipped):
//   cats:     [{ pos: Vector3, yaw, perched: bool (on a wall / pillar top: never flees, sits up and watches),
//               coat: 'ginger'|'slate', safe: Vector3 (perch top a ground cat leaps onto when it bolts) }]
//   hens:     { center, count = 3, spread = 0.7 }
//   ducks:    { homes: [Vector3] }        (need water)
//   frogs:    { homes: [Vector3] }        (need water)
//   water:    { x, z, level }             pond centre + water level: in water <=> heightAt(x, z) < level - 0.02
//   mice:     { hides: [Vector3], count = 3 }
//   dog:      { home: Vector3, yaw }
// api: { agents, events, dog }
import * as THREE from 'three';
import {
  defineSystem, createReaction, createPoseBatch, Ticker, STATE, STATE_NAMES,
  gridTime, clockIndex, cycleFrame, quantYaw, hash, clamp, lerp, TAU, GRID_HZ,
} from './core.js';
import { catPoses, henPoses, duckPoses, frogPoses, fxPoses, mousePoses, dogPoses } from './critters/drawings.js';

const { IDLE, ALERT, FLEE, AWAY, RETURN } = STATE;
const DT = 1 / GRID_HZ;
const yawTo = (dx, dz) => Math.atan2(dx, dz);
const ease2 = (u) => 1 - (1 - u) * (1 - u);
const smoothF = (u) => u * u * (3 - 2 * u);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

export default defineSystem({
  name: 'critters', owner: 'critters', budget: { glCalls: 4 },   // 3 passes (colour, normal, shadow) + 1 when a reflective pond re-renders the batch (r3 measured: +3 with reflect=0, +4 with it)
  create(ctx, opts = {}) {
    const { engine, actors, anchors, heightAt } = ctx;
    const seed = ctx.seed;
    const spots = anchors.spots || {};
    const perches = (anchors.perches || []).map((p) => p.clone());
    const gY = (x, z) => heightAt(x, z) ?? 0;
    const water = opts.water ?? null;
    const wetAt = (x, z) => !!water && gY(x, z) < water.level - 0.02;
    const surfY = (x, z) => (wetAt(x, z) ? water.level : gY(x, z));
    // r3: resting yaws avoid the camera axis. A cat / duck / dog facing straight toward or away from the camera is a
    // 2-3 texel vertical stick at vh 10; a stop 45 deg off the axis (or more) shows the profile. Travel yaws keep
    // their real heading. The ground basis comes from camera.yaw (docs/AMBIENT.md: camera.right is built lazily).
    const camYaw = engine.camera.yaw ?? Math.PI / 4;
    const obl = (y) => {
      const q = quantYaw(y), d = angDiff(q, camYaw), off = Math.min(Math.abs(d), Math.PI - Math.abs(d));
      if (off > 0.3) return q;
      const s = angDiff(y, q) !== 0 ? Math.sign(angDiff(y, q)) : (d >= 0 ? 1 : -1);
      return quantYaw(q + s * Math.PI / 4);
    };

    // ------------------------------------------------------------------ layout (opts, else anchors)
    const catDefs = opts.cats ?? [
      ...(perches[3] ? [{ pos: perches[3], yaw: Math.PI * 0.75, perched: true, coat: 'slate' }] : []),
      ...(spots.pillarB ? [{ pos: spots.pillarB.clone().add(new THREE.Vector3(0.9, 0, 0.9)), yaw: Math.PI * 0.75, coat: 'ginger', safe: perches[1] }] : []),
    ];
    const henDef = opts.hens ?? (spots.flock ? { center: spots.flock } : null);
    const duckDefs = water ? (opts.ducks?.homes ?? []) : [];
    const frogDefs = water ? (opts.frogs?.homes ?? []) : [];
    const mouseDef = opts.mice ?? null;
    const dogDef = opts.dog ?? (spots.lantern ? { home: spots.lantern.clone().add(new THREE.Vector3(0.9, 0, 0.9)) } : null);

    // ------------------------------------------------------------------ drawings -> one pose batch
    const geos = [], idx = {};
    const addSet = (prefix, set) => { for (const [k, g] of Object.entries(set)) { idx[`${prefix}.${k}`] = geos.length; geos.push(g); } };
    const coats = new Set();
    for (const c of catDefs) coats.add(`${c.coat || 'ginger'}:${c.perched && !c.alts?.length ? 'p' : 'g'}`);   // a perch cat that can hop needs the run drawings
    const catSets = {};
    for (const key of coats) {
      const [coat, kind] = key.split(':');
      if (catSets[coat] === 'full') continue;
      const full = kind === 'g' || [...coats].includes(`${coat}:g`);
      addSet(`cat-${coat}`, catPoses(coat, { full }));
      catSets[coat] = full ? 'full' : 'perch';
    }
    const henCount = henDef ? (henDef.count ?? 3) : 0;
    if (henCount) { addSet('hen-white', henPoses('white')); addSet('hen-brown', henPoses('brown')); }
    if (duckDefs.length) { addSet('duck-drake', duckPoses('drake')); if (duckDefs.length > 1) addSet('duck-hen', duckPoses('hen')); }
    if (frogDefs.length) addSet('frog', frogPoses());
    if (frogDefs.length || duckDefs.length) addSet('fx', fxPoses());
    const mouseCount = mouseDef?.hides?.length >= 2 ? (mouseDef.count ?? 3) : 0;
    if (mouseCount) addSet('mouse', mousePoses());
    if (dogDef) addSet('dog', dogPoses());

    const nAgents = catDefs.length + henCount + duckDefs.length + frogDefs.length + mouseCount + (dogDef ? 1 : 0);
    const nFx = duckDefs.length + frogDefs.length;
    const max = Math.max(1, nAgents + nFx, opts.sheet ? geos.length : 0);
    const uEyeGlow = { value: 0 }, uEyeCol = { value: new THREE.Color('#E8F27A') };
    const batch = createPoseBatch(engine, {
      poses: geos.length ? geos : [new THREE.BoxGeometry(0.01, 0.01, 0.01)], max, name: 'ambient-critters', parent: ctx.root,
      material: {
        vertexHead: 'attribute float aPose; attribute float iPose; attribute vec2 aFx; varying vec2 vFx;',
        vertex: 'if (abs(aPose - iPose) > 0.5) transformed = vec3(0.0); vFx = aFx;',
        fragmentHead: 'varying vec2 vFx; uniform float uEyeGlow; uniform vec3 uEyeCol;',
        outlineFlag: '(vFx.y > 0.5 ? FLAG_NONE : FLAG_FULL)',
        outgoing: 'if (uEyeGlow > 0.5) { if (vFx.x > 0.75) outgoingLight = uEyeCol; else if (vFx.x > 0.25) outgoingLight *= 0.7; }',   // eyeshine; cream chests one step down at night
        uniforms: { uEyeGlow, uEyeCol },
      },
    });

    // ------------------------------------------------------------------ agents
    const agents = [];
    let slot = 0, fxSlot = nAgents;
    const events = [];       // flee log [{kind, i, t, d, speed, by}]
    const logFlee = (a, t, hit) => {
      if (events.length < 96) events.push({ kind: a.kind, i: a.slot, t: +t.toFixed(3), d: +(hit?.d ?? -1).toFixed(2), speed: +(hit?.speed ?? 0).toFixed(2), by: hit?.item?.kind ?? 'contagion' });
    };
    const mk = (kind, extra) => {
      const a = { kind, slot: slot++, k: agents.filter((o) => o.kind === kind).length, cur: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), yaw: 0, pending: -1, ...extra };
      agents.push(a);
      return a;
    };
    const RX = {
      cat: createReaction({ alertR: 4.4, fleeR: 2.7, alertHold: 0.27, fleeTime: 1.2, calmR: 5.0, calmTime: 1.6, awayMin: 2.2, returnTime: 3.4 }),
      hen: createReaction({ alertR: 3.6, fleeR: 2.4, alertHold: 0.27, fleeTime: 1.0, calmR: 3.8, calmTime: 1.0, awayMin: 1.4, returnTime: 2.2 }),
      duck: createReaction({ alertR: 3.8, fleeR: 2.6, alertHold: 0.27, fleeTime: 1.6, calmR: 4.6, calmTime: 1.6, awayMin: 2.4, returnTime: 3.2 }),
      frog: createReaction({ alertR: 3.2, fleeR: 2.4, alertHold: 0.2, fleeTime: 0.87, calmR: 4.2, calmTime: 1.8, awayMin: 2.6, returnTime: 1.47 }),
      mouse: createReaction({ alertR: 3.4, fleeR: 3.4, fleeTime: 0.6, calmR: 4.2, calmTime: 1.4, awayMin: 2.0, returnTime: 999 }),
    };

    for (const c of catDefs) {
      const coat = c.coat || 'ginger';
      const a = mk('cat', { home: c.pos.clone(), homeYaw: obl(c.yaw ?? 0), perched: !!c.perched, coat, safe: c.safe ? c.safe.clone() : null, P: `cat-${coat}`,
        head: 0, watch: false, watchT: 0, rec: RX.cat.init(seed + 11),
        alts: (c.alts || []).map((p) => p.clone()), base0: c.pos.clone(), hopT: -9, hopFrom: new THREE.Vector3(), hopTo: new THREE.Vector3(), perchYaw: null, hops: 0 });
      a.yaw = a.homeYaw; a.cur.copy(a.home);
      if (!a.perched) a.home.y = gY(a.home.x, a.home.z) + (c.lift ?? 0);
    }
    // hens: seeded spots around the patch, >= 0.45 m apart
    if (henCount) {
      const r = ctx.rng(2), homes = [];
      for (let tries = 0; homes.length < henCount && tries < 2000; tries++) {
        const an = r() * TAU, d = Math.sqrt(r()) * (henDef.spread ?? 0.7);
        const p = new THREE.Vector3(henDef.center.x + Math.cos(an) * d, 0, henDef.center.z + Math.sin(an) * d);
        if (homes.every((h) => h.distanceTo(p) > 0.45)) homes.push(p);
      }
      homes.forEach((h, k) => mk('hen', { home: h, P: k === 1 ? 'hen-brown' : 'hen-white', rec: RX.hen.init(seed + 100 + k) }));
    }
    const toWater = (p) => {
      // march from p toward the pond centre until the bed is under water; 0.25 m further in
      const dx = water.x - p.x, dz = water.z - p.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      for (let s = 0; s < L; s += 0.05) if (wetAt(p.x + ux * s, p.z + uz * s)) return { entry: new THREE.Vector3(p.x + ux * s, water.level, p.z + uz * s), ux, uz };
      return { entry: new THREE.Vector3(water.x, water.level, water.z), ux, uz };
    };
    duckDefs.forEach((h, k) => {
      const w = toWater(h);
      const swim = w.entry.clone().add(new THREE.Vector3(w.ux * 0.9 + w.uz * (k ? 0.35 : -0.35), 0, w.uz * 0.9 - w.ux * (k ? 0.35 : -0.35)));
      if (!wetAt(swim.x, swim.z)) swim.set(water.x, water.level, water.z);
      const a = mk('duck', { home: h.clone().setY(gY(h.x, h.z)), swim, P: k === 0 ? 'duck-drake' : 'duck-hen', rec: RX.duck.init(seed + 200 + k), fx: fxSlot++, splashT: -9, splashAt: new THREE.Vector3() });
      a.homeYaw = obl(yawTo(-w.ux, -w.uz) + (k ? 0.8 : -0.8));
    });
    frogDefs.forEach((h, k) => {
      const w = toWater(h);
      const home = h.clone().setY(gY(h.x, h.z));
      const dive = w.entry.clone().add(new THREE.Vector3(w.ux * 0.28, 0, w.uz * 0.28));
      const a = mk('frog', { home, dive, edge: w.entry.clone(), P: 'frog', rec: RX.frog.init(seed + 300 + k), fx: fxSlot++, splashT: -9, splashAt: new THREE.Vector3(), splashKind: 0 });
      a.homeYaw = quantYaw(yawTo(w.ux, w.uz) + Math.PI + (hash(k, 3, seed) - 0.5) * 1.6);   // facing away from the water
      a.peek = dive.clone().add(new THREE.Vector3((hash(k, 5, seed) - 0.5) * 0.5, 0, (hash(k, 6, seed) - 0.5) * 0.5));
      if (!wetAt(a.peek.x, a.peek.z)) a.peek.copy(dive);
    });
    const hides = (mouseDef?.hides ?? []).map((p) => p.clone().setY(gY(p.x, p.z)));
    // r3: the sniff / sit-up pause happens on OPEN light ground (opts.mice.pauses), not in the dark meadow between hides
    const pauses = (mouseDef?.pauses ?? []).map((p) => p.clone().setY(gY(p.x, p.z)));
    for (let k = 0; k < mouseCount; k++) mk('mouse', { P: 'mouse', rec: RX.mouse.init(seed + 400 + k), tf: -9, fleeDur: 0, hideK: 0 });
    let dog = null;
    if (dogDef) {
      dog = mk('dog', { P: 'dog', home: dogDef.home.clone().setY(gY(dogDef.home.x, dogDef.home.z)), homeYaw: obl(dogDef.yaw ?? Math.PI * 0.25),
        st: 'rest', t0: 0, cool: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), moved: 0, follow: null, trail: [], look: 0, watchD: Infinity });
    }
    const pose = (a, name) => idx[`${a.P}.${name}`] ?? -1;
    const fxPose = (name) => idx[`fx.${name}`] ?? -1;

    // ------------------------------------------------------------------ threats: the actors + the dog (to hens, ducks, frogs, mice)
    const dogHit = (x, z) => {
      if (!dog || (dog.st !== 'follow' && dog.st !== 'home')) return null;
      const dx = x - dog.pos.x, dz = z - dog.pos.z, d = Math.hypot(dx, dz);
      const ax = d > 1e-6 ? dx / d : 1, az = d > 1e-6 ? dz / d : 0;
      const sp = Math.hypot(dog.vel.x, dog.vel.z);
      return { item: { kind: 'dog', id: 'dog' }, d, ax, az, speed: sp, approach: dog.vel.x * ax + dog.vel.z * az };
    };
    const effD = (R, hit) => (!hit ? Infinity : hit.speed < R.opts.stillSpeed ? hit.d * R.opts.stillScale : hit.d - Math.max(0, hit.approach) * R.opts.lookahead);
    function threat(a, snap, R, x, z, fearDog = true) {
      const h1 = snap.nearest(x, z, R.range);
      const h2 = fearDog ? dogHit(x, z) : null;
      if (!h2 || h2.d > R.range) return h1;
      return !h1 || effD(R, h2) < effD(R, h1) ? h2 : h1;
    }

    // ------------------------------------------------------------------ idle schedules (pure f(t))
    // hen: pecks on a 7.5 fps clock, little 2-beat walks between seeded offsets near home
    const HP = 12;
    const henIsWalk = (i, p) => p % 5 === 0 || hash(i, p, seed) < 0.35;
    const henOff = (i, p) => { const an = hash(i, p, seed + 1) * TAU, d = 0.08 + 0.2 * hash(i, p, seed + 2); return [Math.cos(an) * d, Math.sin(an) * d]; };
    const henLast = (i, p) => { while (!henIsWalk(i, p)) p--; return p; };
    function henIdle(a, t, out) {
      const i = a.slot, ph = Math.floor(hash(i, 9, seed) * HP);
      const beat = clockIndex(t, 2, ph * 2), p = Math.floor(beat / HP), b = beat - p * HP;
      const h = henLast(i, p), h0 = henLast(i, h - 1), o1 = henOff(i, h), o0 = henOff(i, h0);
      const walking = h === p && b < 3;
      const f = walking ? (b + 1) / 4 : 1;
      out.pos.set(a.home.x + lerp(o0[0], o1[0], f), 0, a.home.z + lerp(o0[1], o1[1], f));
      out.pos.y = gY(out.pos.x, out.pos.z);
      out.yaw = obl(yawTo(o1[0] - o0[0], o1[1] - o0[1]) + (hash(i, p, 3) < 0.3 ? Math.PI / 2 : 0));
      const PECKS = [[5, 6, 8, 9], [4, 5, 7, 10], [6, 7, 10, 11]][Math.floor(hash(i, p, seed + 5) * 3)];
      out.pose = pose(a, walking ? (b % 2 ? 'WALK2' : 'WALK1') : PECKS.includes(b) ? 'PECK' : 'STAND');
      return out;
    }
    // duck on the bank: dabbles at the grass, turns now and then (beats of 0.4 s)
    function duckIdle(a, t, out) {
      const beat = clockIndex(t, 6, a.slot * 3), p = Math.floor(beat / 8), b = beat % 8;
      out.pos.copy(a.home);
      out.yaw = obl(a.homeYaw + (hash(a.slot, p, seed) < 0.4 ? (hash(a.slot, p, 7) < 0.5 ? -1 : 1) * Math.PI / 4 : 0));
      out.pose = pose(a, (b === 3 || b === 4 || (b === 6 && hash(a.slot, p, 9) < 0.5)) ? 'PECK' : 'STAND');
      return out;
    }
    // frog: sits; every few seconds a tiny turning hop (2 texels up, 1 beat)
    function frogIdle(a, t, out) {
      // periods of 14 beats (2.8 s); each period has its own yaw offset (0 or +-45 deg); a change of offset is made
      // with a tiny hop (2 texels up, 1 beat) at the start of the period
      const beat = clockIndex(t, 3, a.slot * 2), p = Math.floor(beat / 14), b = beat - p * 14;
      const off = (n) => (hash(a.slot, n, seed) < 0.5 ? 0 : (hash(a.slot, n, 2) < 0.5 ? -1 : 1) * (Math.PI / 4));
      const hop = b === 0 && off(p) !== off(p - 1);
      out.pos.copy(a.home);
      if (hop) out.pos.y += 0.055;
      out.yaw = quantYaw(a.homeYaw + off(p));
      out.pose = pose(a, hop ? 'LEAP' : 'SIT');
      return out;
    }
    // mouse: 6 s cycles  hidden at hide A -> dart to a pause spot (sniff) -> dart to hide B -> hidden
    const MCY = 90;   // ticks
    const pickHide = (k, c) => {
      const n = hides.length;
      let h = 0;
      for (let j = 0; j <= c; j++) h = j === 0 ? Math.floor(hash(k, 0, seed + 41) * n) : (h + 1 + Math.floor(hash(k, j, seed + 43) * (n - 1))) % n;
      return h;
    };
    const hideCache = new Map();
    const hideOf = (k, c) => { const key = k * 100003 + c; let v = hideCache.get(key); if (v === undefined) { v = pickHide(k, Math.max(0, c)); if (hideCache.size > 512) hideCache.clear(); hideCache.set(key, v); } return v; };
    function mousePlan(a, c) {
      const k = a.k, A = hides[hideOf(k, c)], Bh = hides[hideOf(k, c + 1)];
      const mx = (A.x + Bh.x) / 2, mz = (A.z + Bh.z) / 2, dx = Bh.x - A.x, dz = Bh.z - A.z;
      let M;
      if (pauses.length) {
        const Q = pauses[Math.floor(hash(k, c, seed + 51) * pauses.length)];
        M = new THREE.Vector3(Q.x + (hash(k, c, seed + 52) - 0.5) * 0.3, 0, Q.z + (hash(k, c, seed + 54) - 0.5) * 0.3);
      } else {
        const side = (hash(k, c, seed + 51) - 0.5) * 0.7;
        M = new THREE.Vector3(mx - dz * side, 0, mz + dx * side);
      }
      M.y = gY(M.x, M.z);
      // stop-go: a short hide, a dart, a LONG sniff / sit-up pause in the open (the readable part), a dart home
      const v = 2.6;
      const w0 = (10 + Math.floor(hash(k, c, seed + 53) * 18)) / GRID_HZ;
      const d1 = Math.max(4, Math.round(A.distanceTo(M) / v * GRID_HZ)) / GRID_HZ;
      const pz = (18 + Math.floor(hash(k, c, seed + 57) * 18)) / GRID_HZ;
      const d2 = Math.max(4, Math.round(M.distanceTo(Bh) / v * GRID_HZ)) / GRID_HZ;
      return { A, B: Bh, M, w0, d1, pz, d2 };
    }
    function mouseIdle(a, t, out) {
      const tick = gridIndex15(t) + a.k * 37;
      const c = Math.floor(tick / MCY), s = (tick - c * MCY) / GRID_HZ;
      const pl = mousePlan(a, c);
      out.hidden = false;
      if (s < pl.w0) { out.hidden = true; out.pos.copy(pl.A); return out; }
      let u = s - pl.w0;
      if (u < pl.d1) return mouseRun(a, pl.A, pl.M, u / pl.d1, t, out);
      u -= pl.d1;
      if (u < pl.pz) {
        out.pos.copy(pl.M);
        out.yaw = obl(yawTo(pl.B.x - pl.M.x, pl.B.z - pl.M.z) + (cycleFrame(t, 2, 4, a.k) ? 0.8 : -0.8) * (u > pl.pz * 0.5 ? 1 : 0));
        out.pose = pose(a, cycleFrame(t, 3, 3, a.k) === 1 ? 'SIT' : 'CROUCH');
        return out;
      }
      u -= pl.pz;
      if (u < pl.d2) return mouseRun(a, pl.M, pl.B, u / pl.d2, t, out);
      out.hidden = true; out.pos.copy(pl.B); return out;
    }
    function mouseRun(a, A, Bp, u, t, out) {
      out.pos.lerpVectors(A, Bp, clamp(u)); out.pos.y = gY(out.pos.x, out.pos.z);
      out.yaw = quantYaw(yawTo(Bp.x - A.x, Bp.z - A.z));
      out.pose = pose(a, cycleFrame(t, 2, 2, a.k) ? 'RUN2' : 'RUN1');
      out.hidden = false;
      return out;
    }
    const gridIndex15 = (t) => Math.floor(t * GRID_HZ + 1e-6);
    // cat idle: loaf / sit, head look-around schedule (3.75 fps clock), tail flicks
    function catHeadIdle(a, t) {
      const beat = clockIndex(t, 4, a.slot * 3), p = Math.floor(beat / 7);
      const h = hash(a.slot, p, seed + 61);
      return h < 0.55 ? 0 : h < 0.78 ? -1 : 1;
    }
    function catTail(a, t, agitated) {
      const beat = clockIndex(t, 2, a.slot), rate = agitated ? 0.3 : 0.07;
      const flick = (b) => hash(a.slot, b, seed + 67) < rate;
      return flick(beat) || flick(beat - 1) ? 1 : 0;
    }

    // ------------------------------------------------------------------ the 15 Hz replay simulation
    const tmp = { pos: new THREE.Vector3(), yaw: 0, pose: 0, hidden: false };
    const tmp2 = { pos: new THREE.Vector3(), yaw: 0, pose: 0, hidden: false };
    function reset() {
      for (const a of agents) {
        if (a.rec) a.rec = RX[a.kind].init(seed + a.slot * 13);
        a.pending = -1; a.splashT = -9; a.tf = -9; a.head = 0; a.watch = false; a.watchT = 0; a.onPerch = false;
        if (a.kind === 'cat' && a.perched) { a.home.copy(a.base0); a.hopT = -9; a.perchYaw = null; a.yaw = a.homeYaw; a.hops = 0; }
      }
      if (dog) { dog.st = 'rest'; dog.t0 = 0; dog.cool = 0; dog.pos.copy(dog.home); dog.vel.set(0, 0, 0); dog.moved = 0; dog.follow = null; dog.trail.length = 0; dog.yaw = dog.homeYaw; dog.look = 0; dog.watchD = Infinity; }
      events.length = 0;
    }

    function stepDog(t, n, snap) {
      const d = dog;
      // the trail of whoever it follows (or the nearest actor), one sample per tick: works for live actors too
      const nearest = snap.nearest(d.pos.x, d.pos.z, 30);
      const tgt = d.follow ? snap.items.find((it) => it.id === d.follow) : nearest?.item;
      if (tgt) { d.trail.push([tgt.x, tgt.z, t]); if (d.trail.length > 30) d.trail.shift(); }
      const age = t - d.t0;
      const hit = tgt ? snap.nearest(d.pos.x, d.pos.z, 30) : null;
      const dist = hit ? hit.d : Infinity;
      const eff = hit ? dist - Math.max(0, hit.approach) * 0.35 : Infinity;
      const set = (st) => { d.st = st; d.t0 = t; };
      const px = d.pos.x, pz = d.pos.z;
      const moveTo = (x, z, vmax, keep = 0) => {
        const dx = x - d.pos.x, dz = z - d.pos.z, L = Math.hypot(dx, dz);
        if (L <= keep + 1e-4) return L;
        const s = Math.min(L - keep, vmax * DT);
        d.pos.x += (dx / L) * s; d.pos.z += (dz / L) * s;
        d.yaw = quantYaw(yawTo(dx, dz));
        return L;
      };
      d.watchD = hit ? dist : Infinity;
      if (d.st === 'rest' && (n % 4) === 0) {
        if (hit && dist < 9) {
          const rel = angDiff(yawTo(-hit.ax, -hit.az), d.yaw);
          d.look = Math.abs(rel) > 2.0 ? d.look : rel > 0.4 ? 1 : rel < -0.4 ? -1 : 0;
        } else d.look = 0;
      }
      switch (d.st) {
        case 'rest':
          if (eff < 3.3 && t >= d.cool && hit) {
            d.follow = hit.item.id;
            d.yaw = obl(yawTo(-hit.ax, -hit.az));
            set(hit.speed < 0.3 ? 'greet' : 'notice');
          }
          break;
        case 'notice':
          if (hit) d.yaw = obl(yawTo(-hit.ax, -hit.az));
          if (age >= 0.33) set('follow');
          break;
        case 'follow': {
          const lag = 9;
          const s = d.trail[Math.max(0, d.trail.length - 1 - lag)];
          if (s) moveTo(s[0], s[1], 7.0, 1.0);
          if (hit && hit.speed < 0.3 && dist < 2.6) { set('greet'); break; }
          if (age > 3.2 || dist > 7.5 || !hit) set('giveup');
          break;
        }
        case 'greet':
          if (hit) d.yaw = obl(yawTo(-hit.ax, -hit.az));
          if (hit && hit.speed > 1.0 && dist > 2.0 && age > 0.6) {
            if (d.pos.distanceTo(d.home) < 4) set('follow'); else set('giveup');
          } else if (!hit || dist > 4.5) set(d.pos.distanceTo(d.home) > 0.1 ? 'giveup' : 'rest');
          break;
        case 'giveup':
          if (hit && dist < 9) d.yaw = obl(yawTo(-hit.ax, -hit.az));
          if (age >= 1.6) set('home');
          break;
        case 'home': {
          const L = moveTo(d.home.x, d.home.z, 2.4);
          if (L < 0.05) { d.pos.copy(d.home); d.yaw = d.homeYaw; set('rest'); d.cool = t + 3.0; d.follow = null; }
          break;
        }
      }
      d.pos.y = gY(d.pos.x, d.pos.z);
      d.vel.set((d.pos.x - px) / DT, 0, (d.pos.z - pz) / DT);
      d.moved = Math.hypot(d.pos.x - px, d.pos.z - pz);
    }

    function startFlee(a, t, hit) {
      const rec = a.rec;
      a.from.copy(a.cur);
      if (a.kind === 'hen') {
        const sp = (hash(a.slot, rec.changes, seed + 7) - 0.5) * 1.1, c = Math.cos(sp), s = Math.sin(sp);
        const ax = rec.ax * c - rec.az * s, az = rec.ax * s + rec.az * c;
        rec.ax = ax; rec.az = az;
        a.to.set(a.from.x + ax * 2.3, 0, a.from.z + az * 2.3); a.to.y = gY(a.to.x, a.to.z);
      } else if (a.kind === 'duck') {
        a.to.copy(a.swim);
        // entry point (for the splash) along the waddle
        a.uEnter = 1;
        for (let s = 0; s <= 40; s++) { const u = s / 40, x = lerp(a.from.x, a.to.x, u), z = lerp(a.from.z, a.to.z, u); if (wetAt(x, z)) { a.uEnter = u; break; } }
      } else if (a.kind === 'frog') {
        a.to.copy(a.dive);
      } else if (a.kind === 'mouse') {
        let best = 0, bs = Infinity;
        hides.forEach((h, k) => { const dx = h.x - a.from.x, dz = h.z - a.from.z, L = Math.hypot(dx, dz); const cos = L > 1e-3 ? (dx * rec.ax + dz * rec.az) / L : 1; const sc = L * (1.6 - cos); if (sc < bs) { bs = sc; best = k; } });
        a.to.copy(hides[best]); a.tf = t; a.fleeDur = Math.max(0.27, Math.ceil(a.from.distanceTo(a.to) / 3.6 * GRID_HZ) / GRID_HZ);
      } else if (a.kind === 'cat') {
        if (a.safe) {
          const dx = a.from.x - a.safe.x, dz = a.from.z - a.safe.z, L = Math.hypot(dx, dz) || 1;
          // outside the plinth: the leap goes up the face, not through it
          a.base = new THREE.Vector3(a.safe.x + dx / L * 0.9, 0, a.safe.z + dz / L * 0.9);
          a.base.y = gY(a.base.x, a.base.z);
          a.to.copy(a.safe);
        } else {
          a.base = null;
          a.to.set(a.from.x + rec.ax * 3, 0, a.from.z + rec.az * 3); a.to.y = gY(a.to.x, a.to.z);
        }
      }
      logFlee(a, t, hit);
    }
    function startReturn(a, t) {
      a.from.copy(a.cur);
      if (a.kind === 'hen') { henIdle(a, t + RX.hen.opts.returnTime, tmp2); a.to.copy(tmp2.pos); }
      else if (a.kind === 'duck') { a.to.copy(a.home); a.uExit = 0; for (let s = 0; s <= 40; s++) { const u = s / 40; if (!wetAt(lerp(a.from.x, a.to.x, u), lerp(a.from.z, a.to.z, u))) { a.uExit = u; break; } } }
      else if (a.kind === 'frog') { a.to.copy(a.home); }
      else if (a.kind === 'cat') {
        a.to.copy(a.home);
        if (a.onPerch) {
          const dx = a.home.x - a.from.x, dz = a.home.z - a.from.z, L = Math.hypot(dx, dz) || 1;
          a.base = new THREE.Vector3(a.from.x + dx / L * 0.9, 0, a.from.z + dz / L * 0.9); a.base.y = gY(a.base.x, a.base.z);
        } else a.base = null;
      }
    }

    const ticker = new Ticker({
      hz: GRID_HZ, reset,
      tick(t, dt, n) {
        const snap = actors.snapshot(t);
        if (dog) stepDog(t, n, snap);
        const fled = [];
        for (const a of agents) {
          if (a.kind === 'dog') continue;
          drawAt(a, t, tmp);                    // where it is drawn right now (before the reaction steps)
          a.cur.copy(tmp.pos);
          if (a.kind === 'cat') { stepCat(a, t, n, snap); continue; }
          const R = RX[a.kind], rec = a.rec, s0 = rec.s;
          if (a.kind === 'mouse') {
            if (s0 === IDLE && tmp.hidden) continue;            // under its stone: nothing to react to
            if (s0 === RETURN) {                               // wait in the hide until the schedule has it hidden too
              mouseIdle(a, t, tmp2);
              if (tmp2.hidden) R.force(rec, IDLE, t);
              continue;
            }
          }
          const hit = threat(a, snap, R, tmp.pos.x, tmp.pos.z);
          let forced = false;
          if (a.pending >= 0 && n >= a.pending && s0 !== IDLE && s0 !== ALERT) a.pending = -1;   // already fleeing on its own
          if (a.pending >= 0 && n >= a.pending && (s0 === IDLE || s0 === ALERT)) { a.pending = -1; forced = true; R.force(rec, FLEE, t); }
          else R.step(rec, t, hit, dt);
          if (rec.s === IDLE && s0 === ALERT && a.kind === 'hen') R.force(rec, RETURN, t);   // settle: walk back to the schedule
          if (rec.s === FLEE && s0 !== FLEE) { startFlee(a, t, forced ? null : hit); fled.push(a); }
          if (rec.s === RETURN && s0 !== RETURN) startReturn(a, t);
        }
        // contagion: hens / ducks within 1.8 m follow 1-3 ticks later, same away direction
        for (const f of fled) for (const o of agents) {
          if (o === f || o.kind !== f.kind || (o.kind !== 'hen' && o.kind !== 'duck' && o.kind !== 'frog') || o.pending >= 0) continue;
          if (o.rec.s !== IDLE && o.rec.s !== ALERT) continue;
          if (o.cur.distanceTo(f.cur) < 1.8) { o.pending = n + 1 + Math.floor(hash(o.slot, n, seed) * 3); o.rec.ax = f.rec.ax; o.rec.az = f.rec.az; }
        }
      },
    });

    function stepCat(a, t, n, snap) {
      const near = snap.nearest(a.cur.x, a.cur.z, 9);
      // watch state (sit up, tail agitated) with hysteresis; head stop updates on the 3.75 fps clock
      if (near && near.d < 3.4) { a.watch = true; a.watchT = t; }
      else if (a.watch && (!near || near.d > 4.6) && t - a.watchT > 1.0) a.watch = false;
      if ((n + a.slot) % 4 === 0) {
        if (near && near.d < 8) {
          const rel = angDiff(yawTo(-near.ax, -near.az), a.yaw);
          const want = rel > 0.45 ? 1 : rel < -0.45 ? -1 : 0;
          a.head = Math.abs(rel) > 2.2 ? a.head : want;   // behind it: keep the last stop
          a.tracking = true;
        } else a.tracking = false;
      }
      if (a.perched) { if (a.alts.length) stepPerchHop(a, t, near); return; }
      const R = RX.cat, rec = a.rec, s0 = rec.s;
      // a ground cat fears the dog too (a trotting dog sends it back up its perch); the dog does not chase it
      const hit = threat(a, snap, R, a.cur.x, a.cur.z);
      R.step(rec, t, hit, DT);
      if (rec.s === FLEE && s0 !== FLEE) startFlee(a, t, hit);
      if (rec.s === AWAY && s0 !== AWAY) { a.onPerch = !!a.safe; a.awayYaw = obl(yawTo(-rec.ax, -rec.az)); a.yaw = a.awayYaw; }
      if (rec.s === RETURN && s0 !== RETURN) startReturn(a, t);
      if (rec.s === IDLE && s0 === RETURN) { a.onPerch = false; a.yaw = a.homeYaw; }
    }

    // a perched cat does not bolt, but someone running past (< 2.0 m) makes it hop along the ridge AWAY from where they
    // are GOING: perches are scored from the walker's position 0.5 s ahead and must lie behind its direction of travel
    // (r2 picked the perch farthest from the CURRENT position, so a runner along the wall had the cat hop with them:
    // it read as running alongside). A hop must gain >= 0.5 m over staying put. Back home once all is calm for 3 s.
    // Hop = 8 ticks: gather 2 (RUN2) -> 4 travel ticks on a 0.35 m arc (RUN2, RUN1, RUN1, RUN2) -> gathered landing 2.
    const HOP = 8 / GRID_HZ;
    const HOP_M = [0.12, 0.38, 0.64, 0.88];
    function stepPerchHop(a, t, near) {
      if (t - a.hopT < HOP) return;
      const go = (to, yaw) => { a.hopFrom.copy(a.home); a.hopTo.copy(to); a.home.copy(to); a.hopT = t; a.perchYaw = yaw; a.yaw = yaw; a.hops++; };
      if (near && near.d < 2.0 && t - a.hopT > 1.0) {
        const it = near.item, vx = it.vx ?? 0, vz = it.vz ?? 0, moving = Math.hypot(vx, vz) > 0.3;
        const px = it.x + vx * 0.5, pz = it.z + vz * 0.5;
        const stay = Math.hypot(a.home.x - px, a.home.z - pz);
        let best = null, bd = -1;
        for (const p of [a.base0, ...a.alts]) {
          if (p.distanceTo(a.home) < 0.05) continue;
          if (moving && (p.x - it.x) * vx + (p.z - it.z) * vz >= 0) continue;   // ahead of the runner: never
          const d = Math.hypot(p.x - px, p.z - pz);
          if (d > bd) { bd = d; best = p; }
        }
        if (best && bd >= stay + 0.5) go(best, obl(yawTo(it.x - best.x, it.z - best.z)));   // lands facing the intruder (oblique stop)
      } else if (a.home.distanceTo(a.base0) > 0.05 && (!near || near.d > 4.5) && t - a.hopT > 3.0 && t - a.watchT > 2.0) go(a.base0, a.homeYaw);
    }

    // ------------------------------------------------------------------ drawing at time t (state = last tick <= t)
    function drawAt(a, t, out) {
      out.hidden = false;
      const tg = gridTime(t);
      switch (a.kind) {
        case 'cat': return drawCat(a, t, tg, out);
        case 'hen': return drawHen(a, t, tg, out);
        case 'duck': return drawDuck(a, t, tg, out);
        case 'frog': return drawFrog(a, t, tg, out);
        case 'mouse': return drawMouse(a, t, tg, out);
        case 'dog': return drawDog(a, t, tg, out);
      }
      return out;
    }
    function catRest(a, t, out, sit) {
      const head = a.tracking ? a.head : catHeadIdle(a, t);
      const tail = catTail(a, t, a.watch);
      out.pose = pose(a, `${sit ? 'SIT' : 'LOAF'}${head}${tail}`);
      return out;
    }
    function drawCat(a, t, tg, out) {
      if (a.perched) {
        const j = Math.round((tg - a.hopT) * GRID_HZ);
        if (j >= 0 && j < 8) {
          // gather (2 ticks, arched) -> 4 travel ticks on a 0.35 m arc, stretched only on the middle 2 -> gathered landing
          // (2 ticks). r2 held RUN1 for 60 % of the hop: a dark plank sliding along the ridge
          const m = j < 2 ? 0 : j < 6 ? HOP_M[j - 2] : 1;
          out.pos.lerpVectors(a.hopFrom, a.hopTo, m);
          out.pos.y += 0.35 * Math.sin(Math.PI * m);
          out.yaw = quantYaw(yawTo(a.hopTo.x - a.hopFrom.x, a.hopTo.z - a.hopFrom.z));
          out.pose = pose(a, j === 3 || j === 4 ? 'HOP' : 'RUN2');
          return out;
        }
        out.pos.copy(a.home); out.yaw = a.perchYaw ?? a.homeYaw; return catRest(a, t, out, a.watch);
      }
      const rec = a.rec, age = Math.max(0, tg - rec.t0);
      switch (rec.s) {
        case IDLE: out.pos.copy(a.home); out.yaw = a.homeYaw; a.yaw = a.homeYaw; return catRest(a, t, out, a.watch);
        case ALERT:
          out.pos.copy(a.home); out.yaw = obl(yawTo(-rec.ax, -rec.az)); out.pose = pose(a, 'CROUCH'); return out;
        case FLEE: {
          const u = clamp(age / RX.cat.opts.fleeTime), split = a.base ? 0.66 : 1;
          if (u < split) {
            const e = u / split, tgt = a.base ?? a.to;
            out.pos.lerpVectors(a.from, tgt, e < 0.12 ? 0 : (e - 0.12) / 0.88);
            // off a raised doorstep: keep the step height for the crouch, then drop with a little hop (not through the stone)
            const lift0 = a.from.y - gY(a.from.x, a.from.z), sd = clamp((e - 0.12) / 0.22);
            out.pos.y = gY(out.pos.x, out.pos.z) + (lift0 > 0.02 ? lift0 * (1 - sd) + 0.1 * Math.sin(Math.PI * sd) : 0);
            out.yaw = quantYaw(yawTo(tgt.x - a.from.x, tgt.z - a.from.z));
            out.pose = pose(a, e < 0.12 ? 'CROUCH' : cycleFrame(t, 2, 2, a.slot) ? 'RUN2' : 'RUN1');
            return out;
          }
          const s = (u - split) / (1 - split);
          // up the face first (horizontal waits), over the lip at the top
          out.pos.lerpVectors(a.base, a.to, smoothF(clamp((s - 0.35) / 0.65)));
          out.pos.y = a.base.y + (a.to.y - a.base.y) * Math.sin(Math.PI / 2 * clamp(s / 0.8)) + 0.12 * Math.sin(Math.PI * s);
          out.yaw = quantYaw(yawTo(a.to.x - a.base.x, a.to.z - a.base.z));
          out.pose = pose(a, s < 0.8 ? 'JUMP' : 'SIT00');
          return out;
        }
        case AWAY: {
          out.pos.copy(a.onPerch ? a.to : a.to); out.yaw = a.awayYaw ?? a.homeYaw; a.yaw = out.yaw;
          return catRest(a, t, out, true);
        }
        case RETURN: {
          const T = RX.cat.opts.returnTime, hop = a.base ? 0.53 : 0;
          if (age < hop) {
            const s = age / hop;   // off the top first, then down
            out.pos.lerpVectors(a.from, a.base, smoothF(clamp(s / 0.5)));
            out.pos.y = a.from.y + (a.base.y - a.from.y) * (1 - Math.cos(Math.PI / 2 * s)) + 0.08 * Math.sin(Math.PI * clamp(s / 0.5));
            out.yaw = quantYaw(yawTo(a.base.x - a.from.x, a.base.z - a.from.z)); out.pose = pose(a, s < 0.7 ? 'RUN1' : 'RUN2');
            return out;
          }
          const st = a.base ?? a.from, s = clamp((age - hop) / (T - hop - 0.27));
          out.pos.lerpVectors(st, a.to, s); out.pos.y = gY(out.pos.x, out.pos.z) + clamp((s - 0.86) / 0.14) * (a.home.y - gY(a.home.x, a.home.z));
          if (s >= 1) { out.yaw = a.homeYaw; out.pose = pose(a, 'SIT00'); return out; }
          out.yaw = quantYaw(yawTo(a.to.x - st.x, a.to.z - st.z));
          out.pose = pose(a, cycleFrame(t, 2, 3, a.slot) ? 'WALK2' : 'WALK1');
          return out;
        }
      }
      return out;
    }
    function drawHen(a, t, tg, out) {
      const rec = a.rec, age = Math.max(0, tg - rec.t0);
      switch (rec.s) {
        case IDLE: return henIdle(a, t, out);
        case ALERT: henIdle(a, rec.t0, out); out.pose = pose(a, 'ALERT'); out.yaw = obl(yawTo(-rec.ax, -rec.az)); return out;
        case FLEE: {
          const u = clamp(age / RX.hen.opts.fleeTime), e = ease2(u);
          out.pos.lerpVectors(a.from, a.to, e); out.pos.y = gY(out.pos.x, out.pos.z) + (u < 0.5 ? 0.11 * Math.sin(Math.PI * u * 2) : 0);
          out.yaw = quantYaw(yawTo(a.to.x - a.from.x, a.to.z - a.from.z));
          out.pose = pose(a, cycleFrame(t, 2, age < 0.4 ? 1 : 2, a.slot) ? 'RUN2' : 'RUN1');
          return out;
        }
        case AWAY: {
          out.pos.copy(a.to);
          const beat = clockIndex(t, 4, a.slot), look = Math.floor(beat / 3);
          out.yaw = obl(yawTo(-rec.ax, -rec.az) + (hash(a.slot, look, 5) - 0.5) * 1.6);
          out.pose = pose(a, hash(a.slot, look, 4) < 0.45 ? 'ALERT' : beat % 3 === 2 ? 'PECK' : 'STAND');
          return out;
        }
        case RETURN: {
          const u = clamp(age / RX.hen.opts.returnTime), e = u * u * (3 - 2 * u);
          out.pos.lerpVectors(a.from, a.to, e); out.pos.y = gY(out.pos.x, out.pos.z);
          const far = a.from.distanceTo(a.to) > 0.12;
          out.yaw = far ? quantYaw(yawTo(a.to.x - a.from.x, a.to.z - a.from.z)) : quantYaw(yawTo(-rec.ax, -rec.az));
          out.pose = pose(a, far && u < 0.95 ? (cycleFrame(t, 2, 2, a.slot) ? 'WALK2' : 'WALK1') : 'STAND');
          return out;
        }
      }
      return out;
    }
    function duckSwimAt(a, t, t0, out) {
      // drifting on the pond from the flee end: a slow wander on a 3.75 fps clock (starts at a.swim), dabbles
      const beat = clockIndex(t, 4, 0) - clockIndex(t0, 4, 0);
      const ph = beat * 0.07, sg = a.k ? -1 : 1;
      out.pos.set(a.swim.x + Math.sin(ph) * 0.32 * sg, water.level, a.swim.z + Math.sin(ph * 0.8) * 0.26);
      if (!wetAt(out.pos.x, out.pos.z)) out.pos.set(a.swim.x, water.level, a.swim.z);
      out.yaw = obl(yawTo(Math.cos(ph) * 0.32 * sg, Math.cos(ph * 0.8) * 0.21));
      const dip = Math.floor(beat / 6);
      out.pose = pose(a, beat > 6 && hash(a.slot, dip, seed + 3) < 0.3 && beat % 6 < 3 ? 'DIP' : 'SWIM');
      return out;
    }
    function drawDuck(a, t, tg, out) {
      const rec = a.rec, age = Math.max(0, tg - rec.t0);
      const walk = (A, Bp, u) => {
        out.pos.lerpVectors(A, Bp, u);
        const wet = wetAt(out.pos.x, out.pos.z);
        out.pos.y = wet ? water.level : gY(out.pos.x, out.pos.z);
        out.yaw = quantYaw(yawTo(Bp.x - A.x, Bp.z - A.z));
        out.pose = pose(a, wet ? 'SWIM' : cycleFrame(t, 2, 2, a.slot) ? 'WADDLE2' : 'WADDLE1');
      };
      switch (rec.s) {
        case IDLE: return duckIdle(a, t, out);
        case ALERT: duckIdle(a, rec.t0, out); out.pose = pose(a, 'ALERT'); out.yaw = obl(yawTo(-rec.ax, -rec.az)); return out;
        case FLEE: walk(a.from, a.to, clamp(age / RX.duck.opts.fleeTime)); return out;
        case AWAY: {
          duckSwimAt(a, t, rec.t0, out);
          return out;
        }
        case RETURN: {
          walk(a.from, a.to, clamp(age / RX.duck.opts.returnTime));
          if (age >= RX.duck.opts.returnTime - 0.2) { out.pose = pose(a, 'STAND'); out.yaw = a.homeYaw; }
          return out;
        }
      }
      return out;
    }
    function drawFrog(a, t, tg, out) {
      const rec = a.rec, age = Math.max(0, tg - rec.t0);
      const hop = (A, Bp, s, h = 0.2) => {
        out.pos.lerpVectors(A, Bp, s);
        out.pos.y = lerp(A.y, Bp.y, s) + h * Math.sin(Math.PI * s);
        out.yaw = quantYaw(yawTo(Bp.x - A.x, Bp.z - A.z));
        out.pose = pose(a, 'LEAP');
      };
      switch (rec.s) {
        case IDLE: return frogIdle(a, t, out);
        case ALERT: out.pos.copy(a.home); out.yaw = quantYaw(yawTo(a.edge.x - a.home.x, a.edge.z - a.home.z)); out.pose = pose(a, 'CROUCH'); return out;
        case FLEE: {
          // two hops (0.4 s each, 1 tick crouch between) -> into the water
          const T = RX.frog.opts.fleeTime, mid = new THREE.Vector3().lerpVectors(a.from, a.edge, 0.55); mid.y = gY(mid.x, mid.z);
          if (age < 0.33) { hop(a.from, mid, age / 0.33, 0.16); return out; }
          if (age < 0.4) { out.pos.copy(mid); out.yaw = quantYaw(yawTo(a.edge.x - a.from.x, a.edge.z - a.from.z)); out.pose = pose(a, 'CROUCH'); return out; }
          if (age < T - 0.07) { hop(mid, a.to, (age - 0.4) / (T - 0.47), 0.22); return out; }
          out.hidden = true; out.pos.copy(a.to); return out;
        }
        case AWAY: {
          out.pos.copy(a.peek);
          if (age < 1.2) { out.hidden = true; return out; }
          out.yaw = quantYaw(yawTo(a.home.x - a.peek.x, a.home.z - a.peek.z));
          out.pose = pose(a, 'HEADS'); out.pos.y = water.level;
          if (hash(a.slot, clockIndex(t, 5), seed + 9) < 0.15) out.hidden = true;   // ducks under now and then
          return out;
        }
        case RETURN: {
          const T = RX.frog.opts.returnTime;
          if (age < 0.4) { out.pos.lerpVectors(a.peek, a.edge, age / 0.4); out.pos.y = water.level; out.yaw = quantYaw(yawTo(a.edge.x - a.peek.x, a.edge.z - a.peek.z)); out.pose = pose(a, 'HEADS'); return out; }
          // out of the water in two short hops (0.27 s, a 0.2 s crouch between): one long slow hop read as floating
          const e = a.edge.clone(); e.y = water.level;
          const mid = new THREE.Vector3().lerpVectors(e, a.home, 0.5); mid.y = Math.max(water.level, gY(mid.x, mid.z));
          if (age < 0.67) { hop(e, mid, (age - 0.4) / 0.27, 0.13); return out; }
          if (age < 0.87) { out.pos.copy(mid); out.yaw = quantYaw(yawTo(a.home.x - e.x, a.home.z - e.z)); out.pose = pose(a, 'CROUCH'); return out; }
          if (age < 1.14) { hop(mid, a.home, (age - 0.87) / 0.27, 0.13); return out; }
          out.pos.copy(a.home); out.yaw = quantYaw(yawTo(a.home.x - a.edge.x, a.home.z - a.edge.z)); out.pose = pose(a, 'SIT'); return out;
        }
      }
      return out;
    }
    function drawMouse(a, t, tg, out) {
      const rec = a.rec;
      if (rec.s === IDLE) return mouseIdle(a, t, out);
      if (rec.s === ALERT) { mouseIdle(a, rec.t0, out); out.pose = pose(a, 'SIT'); return out; }
      const u = (tg - a.tf) / a.fleeDur;
      if ((rec.s === FLEE || rec.s === AWAY) && u < 1) return mouseRun(a, a.from, a.to, u, t, out);
      out.hidden = true; out.pos.copy(a.to); return out;
    }
    function drawDog(a, t, tg, out) {
      const d = a;
      out.pos.copy(d.pos); out.yaw = d.yaw;
      switch (d.st) {
        case 'rest': {
          if (d.watchD < 9) {   // someone around: head up, tracking on 3 stops; close by the tail thumps (7.5 fps)
            out.pose = pose(a, `${d.watchD < 5 && cycleFrame(t, 2, 2, 0) ? 'LIEW' : 'LIE'}${d.look}`);
            break;
          }
          // alone (r3): dozes curled, and every 5 s (15 beats of the 3 fps clock) raises its head for 1.3 s, glances one
          // way, thumps its tail once and settles back down, often into the other doze drawing (chin on the paws <-> head
          // tucked into the curl). r2 lay almost static for 8 s and read as a log
          const beat = clockIndex(t, 5, 1), p = Math.floor(beat / 15), b = beat - p * 15;
          const doze = (n) => (hash(n, 1, seed + 71) < 0.5 ? 'LIEDOWN' : 'LIEDOWN2');
          const g = hash(p, 5, seed + 73) < 0.5 ? -1 : 1;
          out.pose = pose(a, b < 10 ? doze(p) : b === 10 ? 'LIE0' : b < 13 ? `LIE${g}` : b === 13 ? 'LIEW0' : doze(p + 1));
          break;
        }
        case 'notice': out.pose = pose(a, 'STAND'); break;
        case 'follow': case 'home': out.pose = pose(a, d.moved > 0.01 ? (cycleFrame(t, 2, 2, 0) ? 'TROT2' : 'TROT1') : 'STAND'); break;
        case 'greet': out.pose = pose(a, cycleFrame(t, 2, 2, 0) ? 'SIT2' : 'SIT'); break;
        case 'giveup': out.pose = pose(a, 'SIT'); break;
      }
      return out;
    }
    function drawFx(a, t, tg) {
      // splash: frog dive / exit, duck entry. Two drawings (0.13 s, 0.27 s) then a ripple ring (0.4 s).
      let at = null, s = -1;
      const rec = a.rec, age = tg - rec.t0;
      if (a.kind === 'frog') {
        if (rec.s === FLEE && age >= RX.frog.opts.fleeTime - 0.07) { at = a.to; s = age - (RX.frog.opts.fleeTime - 0.07); }
        else if (rec.s === AWAY && age < 0.8) { at = a.to; s = age + 0.07; }
        else if (rec.s === RETURN && age >= 0.4 && age < 0.93) { at = a.edge; s = (age - 0.4) + 0.14; }
      } else if (a.kind === 'duck') {
        const T = RX.duck.opts.fleeTime, te = (a.uEnter ?? 1) * T;
        if (rec.s === FLEE && a.uEnter < 1 && age >= te) { at = new THREE.Vector3().lerpVectors(a.from, a.to, a.uEnter); s = age - te + 0.14; }
        else if (rec.s === AWAY && a.uEnter < 1 && age + T - te < 0.8) { at = new THREE.Vector3().lerpVectors(a.from, a.to, a.uEnter); s = age + T - te + 0.14; }
      }
      if (!at || s < 0 || s >= 0.8) { batch.hide(a.fx); return; }
      const name = s < 0.13 ? 'SPLASH1' : s < 0.4 ? 'SPLASH2' : 'RING';
      tmp2.pos.set(at.x, water.level, at.z);
      batch.set(a.fx, tmp2.pos, 0, fxPose(name), a.kind === 'duck' ? 1.3 : 1);
    }

    const SCALE = { frog: 1.6, mouse: 2.0 };   // r3: mice 2.0 (1.7 = 4-5 texel flecks at x1)
    const counts = new Array(STATE_NAMES.length).fill(0);
    let tod = ctx.tod;
    return {
      api: { agents, events, dog, idx },
      update(t) {
        if (opts.sheet) {   // look-dev: every drawing in rows along screen-right (no sim)
          const Rr = new THREE.Vector3(Math.cos(engine.camera.yaw), 0, -Math.sin(engine.camera.yaw));
          const Fw = new THREE.Vector3(-Math.sin(engine.camera.yaw), 0, -Math.cos(engine.camera.yaw));
          const c0 = opts.sheetCenter ?? new THREE.Vector3();
          const names = Object.keys(idx).filter((k) => !opts.sheetFilter || k.startsWith(opts.sheetFilter));
          for (let i = 0; i < max; i++) {
            if (i >= names.length) { batch.hide(i); continue; }
            const col = i % 10, row = Math.floor(i / 10);
            const p = c0.clone().addScaledVector(Rr, (col - 4.5) * 0.62).addScaledVector(Fw, -row * 1.3 + 2.0); p.y = gY(p.x, p.z);
            const sc = names[i].startsWith('frog') || names[i].startsWith('fx') ? 1.6 : names[i].startsWith('mouse') ? 2.0 : 1;
            batch.set(i, p, opts.sheetYaw ?? 0, idx[names[i]], sc);
          }
          batch.commit();
          return;
        }
        ticker.advance(t);
        counts.fill(0);
        const tg = gridTime(t);
        for (const a of agents) {
          if (a.rec) counts[a.rec.s]++;
          drawAt(a, t, tmp);
          if (tmp.hidden || tmp.pose < 0) batch.hide(a.slot);
          else batch.set(a.slot, tmp.pos, tmp.yaw, tmp.pose, SCALE[a.kind] ?? 1);
          if (a.fx !== undefined) drawFx(a, t, tg);
        }
        batch.commit();
      },
      setTimeOfDay(info) { tod = info; uEyeGlow.value = info?.name === 'night' ? 1 : 0; },
      stats() {
        const st = Object.fromEntries(STATE_NAMES.map((n, k) => [n, counts[k]]));
        const first = events.find((e) => e.by !== 'dog' && e.by !== 'contagion' && e.speed > 0.5);
        const kinds = {};
        for (const a of agents) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
        return {
          agents: agents.length, visible: batch.visible, ...st, calls: water ? 4 : 3, lights: 0, poses: geos.length,
          tris: Math.round(batch.tris * batch.visible), kinds: Object.entries(kinds).map(([k, v]) => `${k}${v}`).join(' '),
          dog: dog?.st ?? '', flees: events.length, catHops: agents.reduce((n, a) => n + (a.hops || 0), 0),
          fleeLog: events.slice(0, 24).map((e) => `${e.kind}${e.i}:${e.t}@${e.d}/${e.by}`).join(' '),
          firstFlee: first ? `${first.t}s@${first.d}m/${first.speed}mps` : '', firstKind: first?.kind ?? '',
          resets: ticker.resets, tod: tod?.name,
        };
      },
      debug() { return { events: events.slice(), states: agents.map((a) => `${a.kind}:${a.rec ? STATE_NAMES[a.rec.s] : a.st}`) }; },
      dispose() { batch.dispose(); },
    };
  },
});
