// life (owner: life agent): Hollowmere's animation layer - the town must feel alive and playful.
//
// DESIGN NOTE
//  What it must read as at 640x360: a lived-in village at the hour the bell strikes. Smoke curls from every chimney
//  and leans with one shared breeze; crows sit on the clocktower's pinnacles and peck on the square's setts, and the
//  bell sends them up in a black spiral to the roofs; a ginger tabby (the v1 cat) watches from a ridge; villagers walk
//  the lanes and their doors swing open for them (a latch rattle, a swing with overshoot, a slam on closing); the old
//  lamplighter comes out of the tower at dusk and lights the lamps one by one while the windows wake in order; at night
//  fireflies over the grass and moths round the lamps; on the dais the town takes its seats, the braziers flare and the
//  brass hand sweeps the vote.
//  Signature shapes: the crow (a dark comma / V), the smoke puff (a 3-7 texel ball, lit upper-left, 1-px dark rim
//  lower-right, dissolving in dither), the cat's pear-and-ears, the stepped door swing.
//  Palette rows (docs/TOWN.md §3): crows iron; beak cream sh; cats paintRamp(v1 FUR #c07a3e) + cream bib/socks, grey =
//  stone, eyes flowerYellow; smoke cream mid / stone hi (young puffs stone hi / mid); water cream hi / holyGlow /
//  glass hi; moths cream hi / glow hi (emissive); embers glow / fireGlow; glints glow hi / brass hi; villagers'
//  clothes: red, plaster, timber, thatch, slate, plank ramps; leaves = leaf + autumn; fireflies = flowerYellow / leaf hi.
//  Animation rules: everything is a pure function of t; drawings held on stepped clocks (doors / wings / moths 8 fps,
//  smoke 6, cat trot 6, tail flicks 3-pose); positions snapped to whole texels (snapLocal / the Character runtime);
//  facings in 45-degree stops; static solids never change.
//
// Systems (files): sprites.js (one texel-exact point-sprite system: smoke, water, moths, sparks), fx.js (closed-form
// emitters), critters.js (crows + cats as instanced pose meshes with a build-time schedule), walkers.js (Characters on
// A* lane routes, door visits, the lamplighter), doors.js (anticipation / overshoot door curves), cycle.js (lights on /
// off in order: day / dusk / night / dawn), ceremony.js (the dais vote demo).
//
// Round-2 fixes: smoke columns (rise > drift, cream / emissive-slate at night), seated townsfolk + raised hands
// (folk.js), V-wing crows that roost at night, a brown town hound, outward door swings + walk-through-the-plate,
// moths / fireflies as own sprites, dais banner flutter (wind.js), sprite centres snapped in world texel space.
// Round-3 (art-director) fixes: smoke = 3-4 seeded puffs per chimney (own rate / life / phase / lean), growing 4 -> 9-10
// texels as they rise, bending downwind, cream-mid / stone-hi / stone-mid (never brighter than plaster), 3 dither
// steps; ambient townsfolk on deterministic loops in the day timeline (a keeper at each market stall, someone hauling
// at the well - all three come out of their cottage doors and go home on a loop -, a sitter on each bench, a child
// chasing a sandy cat round the north green); ceremony seats already filling at t 0; crows in iron / dark-violet with
// an amber beak + cream eye, a 4 fps head-bob / peck, profile-only perched facings, V-only wing drawings.
//   ?lifeOff=ambient disables the day townsfolk (A/B).
// Demos (?demo=, default 'day'; scenes/town-life.js frames them): day | dusk | night | ceremony.  ?t=<s> offsets the
// life clock (scrub), ?hold=1 freezes it at ?t. ?lifeOff=smoke,crows,cats,walkers,doors,bugs,fountain,leaves,cycle,folk,wind
// disables systems (A/B). Budget (docs/TOWN.md §6): <= 30 calls / 30k tris.
import * as THREE from 'three';
import { createParticles } from '../../world/particles.js';
import { TOWN_PALETTE as PAL } from '../palette.js';
import { createSprites, SHAPE } from './sprites.js';
import { smoke, smokeNight, smokeStyle, fountain, moths, fireflies, embers, glints, FX_COLORS } from './fx.js';
import { createFolk, createBenchFolk } from './folk.js';
import { createBannerFlutter } from './wind.js';
import { createCrows, createCats } from './critters.js';
import { compileRoute, spawnWalker } from './walkers.js';
import { doorF, makeDoorDriver } from './doors.js';
import { createCycle, litAt } from './cycle.js';
import { createCeremony, CEREMONY } from './ceremony.js';
import { hash, step, TAU, scanVertices } from './util.js';
import keeperSpec, { attachLantern } from '../../../characters/keeper.js';
import houndBase from '../../../characters/hound.js';
import { make as makeMannequin } from '../../../characters/mannequin.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the hound re-dressed for the town (its source palette is a mossy stone familiar: mint back, orange leaf ears):
// a brown village dog - plank-brown body, a dark timber saddle + ears, cream socks and muzzle, eyes kept
// (the moss cap's rim band is baked as a literal moss-tone array in its parts: re-pointed at the timber saddle too)
const houndSpec = { ...houndBase, name: 'town-hound',
  palette: { ...houndBase.palette, stone: PAL.plank, moss: PAL.timber, lichen: PAL.timber, basalt: PAL.cream },
  parts: houndBase.parts.map((p) => (Array.isArray(p.color) && p.color.some((c) => /^#(3CBC98|94FCCE|3E5C7A)$/i.test(c)) ? { ...p, color: [PAL.timber[1], PAL.timber[1], PAL.timber[2]] } : p)) };

// villager one-shot clips (pose triples [fwd, twist, out], 30 Hz grid; upperArm fwd + = arm swung forward,
// forearm fwd + = elbow bent forward): 'haul' = two pulls on the well rope / windlass, 'offer' = a hand held out
// over the stall counter, then back. Shared by every villager spec.
const ARMS = (u, f, o = 8) => ({ upperArmL: [u, 0, o], upperArmR: [u, 0, o], forearmL: [f, 0, 0], forearmR: [f, 0, 0] });
const VILLAGER_CLIPS = {
  haul: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { spine: [6, 0, 0], ...ARMS(62, 46) } }, { f: 7, pose: { spine: [12, 0, 0], ...ARMS(30, 62) } },
    { f: 14, pose: { spine: [6, 0, 0], ...ARMS(62, 46) } }, { f: 21, pose: { spine: [12, 0, 0], ...ARMS(30, 62) } },
    { f: 28, pose: { spine: [3, 0, 0], ...ARMS(10, 20) } }, { f: 34, pose: {} },
  ] },
  offer: { fps: 30, loop: false, interp: 'step', keys: [
    { f: 0, pose: { spine: [4, 0, 0], upperArmR: [30, 0, 6], forearmR: [40, 0, 0] } },
    { f: 6, pose: { spine: [8, 0, 0], upperArmR: [58, 0, 6], forearmR: [22, 0, 0], head: [6, 0, 0] } },
    { f: 30, pose: { spine: [4, 0, 0], upperArmR: [30, 0, 6], forearmR: [40, 0, 0] } }, { f: 36, pose: {} },
  ] },
};
const dress = (s, name, palette) => { s.name = name; s.palette = { skin: s.palette.skin, eye: s.palette.eye, ...palette }; s.clips = { ...VILLAGER_CLIPS }; return s; };
// the ambient townsfolk of the day timeline (stall keepers, the well, the child): one costume each, town ramps
function townsfolk(kind) {
  if (kind === 'grocer') return dress(makeMannequin({ height: 1.45, heads: 4.0 }), 'grocer', { cloth: PAL.brick, dark: PAL.timber, hair: PAL.timber });
  if (kind === 'chandler') return dress(makeMannequin({ height: 1.36, heads: 3.8 }), 'chandler', { cloth: PAL.plum, dark: PAL.slate, hair: PAL.cream });
  if (kind === 'drawer') return dress(makeMannequin({ height: 1.32, heads: 3.7 }), 'drawer', { cloth: PAL.blue, dark: PAL.plank, hair: PAL.brick });
  // the child: small, big head, a bright red tunic so it reads at 640x360 against the green
  return dress(makeMannequin({ height: 0.98, heads: 3.0 }), 'child', { cloth: PAL.red, dark: PAL.slate, hair: PAL.thatch });
}

// villagers: the mannequin base re-dressed in town ramps (5 slots + accent, character contract)
function villager(kind) {
  if (kind === 'weaver') {
    const s = makeMannequin({ height: 1.3, heads: 3.7 });
    s.name = 'weaver';
    s.palette = { skin: s.palette.skin, cloth: PAL.red, dark: PAL.timber, hair: PAL.thatch, eye: s.palette.eye };
    return s;
  }
  const s = makeMannequin({ height: 1.42, heads: 3.9 });
  s.name = 'baker';
  s.palette = { skin: s.palette.skin, cloth: PAL.plaster, dark: PAL.slate, hair: PAL.plank, eye: s.palette.eye };
  return s;
}

// ------------------------------------------------------------------------------------------------ demo scripts
function demoScript(demo, tod) {
  const night = tod === 'night';
  const base = {
    clock: night ? { start: 23 * 60 + 58, rate: 1 } : tod === 'golden' ? { start: 18 * 60 + 58, rate: 1 } : { start: 11 * 60 + 58, rate: 1 },
    cycle: night || tod === 'golden' ? 'night' : 'day',
    ceremony: null,
    routes: night ? 'night' : 'day',
  };
  if (demo === 'dusk') return { ...base, cycle: 'dusk', routes: 'dusk', clock: { start: 18 * 60 + 58, rate: 1 } };
  if (demo === 'night') return { ...base, cycle: 'night', routes: 'night' };
  if (demo === 'ceremony') return { ...base, ceremony: { t0: 0 }, routes: 'ceremony' };
  return base;
}

// ------------------------------------------------------------------------------------------------ build
export default function build(engine, ctx) {
  const t0build = performance.now();
  const group = new THREE.Group();
  group.name = 'life';
  const { registry, layout, params } = ctx;
  const P = (k, d) => params?.get?.(k) ?? d;
  const off = new Set((P('lifeOff', '') || '').split(',').filter(Boolean));
  const demo = P('demo', 'day');
  const tod = ctx.tod;
  const night = tod === 'night', dusky = tod === 'golden' || night;
  const S = demoScript(demo, tod);
  // life clock: ?t= offset, ?hold=1 freeze
  const tOff = Number(P('t', 0)) || 0, hold = P('hold', '0') === '1';
  const clockOf = (t) => (hold ? tOff : t + tOff);
  const toEngine = (tl) => tl - tOff;

  const records = Object.fromEntries([...layout.houses, layout.clocktower].map((r) => [r.id, r]));
  const doorAnchors = registry.anchors('doors');
  const doorOf = (id) => {
    const r = records[id];
    const ds = doorAnchors.filter((d) => d.piece === id && d.pivot);
    if (!ds.length || !r) return null;
    const dp = V(r.doorPoint.x, 0, r.doorPoint.z);
    const w = new THREE.Vector3();
    ds.sort((a, b) => a.pivot.getWorldPosition(w).distanceTo(dp) - b.pivot.getWorldPosition(w).distanceTo(dp));
    return ds[0];
  };
  const clockPiece = registry.get('clocktower');
  const clockApi = clockPiece?.api;
  const ctSpots = clockPiece?.anchors?.spots ?? {};
  const daisPiece = registry.get('dais');
  const daisSpots = daisPiece?.anchors?.spots ?? {};
  const { CIRCLE, PLAZA, seatPos } = layout;

  // ---------------------------------------------------------------------------------------------- clock + bell
  const H = 300;                                                           // schedule horizon (s)
  const minutesAt = (tl) => S.clock.start + Math.floor(Math.max(0, tl) * S.clock.rate);
  const strikes = [];                                                      // life times the bell strikes
  for (let m = S.clock.start + 1; m <= S.clock.start + H * S.clock.rate; m++) if (m % 60 === 0) strikes.push((m - S.clock.start) / S.clock.rate);
  const strikeAt = (tl) => { let s = null; for (const x of strikes) if (x <= tl) s = x; return s; };
  const bellHits = (ts) => Array.from({ length: 6 }, (_, k) => ts + 0.375 + k * 0.75);

  // ---------------------------------------------------------------------------------------------- walkers
  const walkers = [];
  const walkerSeats = {};                                                   // seat -> life time a walker stands on it
  const allDoorEvents = [], allLampEvents = [];
  const scares = [];
  const lampAnchors = registry.anchors('lights').filter((l) => l.piece === 'props' && l.kind === 'lamp');
  const lampNear = (x, z) => lampAnchors.reduce((b, l) => (!b || Math.hypot(l.pos.x - x, l.pos.z - z) < Math.hypot(b.pos.x - x, b.pos.z - z) ? l : b), null);
  const seatOut = (i, k = 0.75) => { const s = seatPos(i, 15); const dx = s.x - CIRCLE.cx, dz = s.z - CIRCLE.cz, d = Math.hypot(dx, dz); return [s.x + (dx / d) * k, s.z + (dz / d) * k]; };
  const seatAt = (i) => { const s = seatPos(i, 15); return [s.x, s.z]; };
  const seatFace = (i) => { const s = seatPos(i, 15); return Math.round(Math.atan2(CIRCLE.cx - s.x, CIRCLE.cz - s.z) / (TAU / 8)) * (TAU / 8); };
  const ct = records.clocktower;
  const towerInside = V(ct.doorPoint.x, 0, ct.doorPoint.z - 0.5), towerFront = V(ct.doorPoint.x, 0, ct.doorPoint.z + 0.6);
  // dais ground (the Storyteller steps up onto the octagon): tier heights from the dais spots / contract
  const floorY = daisSpots.center?.y ?? 0.38;
  const seatTopY = daisPiece?.anchors?.seats?.[0]?.y ?? 0.235;
  const seatXZ = Array.from({ length: 15 }, (_, i) => seatPos(i, 15));
  const daisGround = { heightAt: (x, z) => {
    const r = Math.hypot(x - CIRCLE.cx, z - CIRCLE.cz);
    if (r < 1.5) return floorY; if (r < 1.8) return 0.24; if (r < 2.2) return 0.12;
    for (const s of seatXZ) if (Math.hypot(x - s.x, z - s.z) < 0.34) return seatTopY - 0.035 + Number(P('seatDy', -0.011));   // up on a seat stone (feet 1 cm in: crawl A/B 4 px -> 0)
    return 0;
  } };
  const keeperOut = (w) => [{ wait: w, hidden: true, face: 0, towerExit: true }, { to: [towerFront.x, towerFront.z], direct: true }];
  const lampA = (x, z, hold = 2.8) => { const l = lampNear(x, z); return l ? { lamp: l, hold } : { wait: 0.1 }; };
  const R = {
    day: {
      keeper: { start: towerInside, speed: 0.6, actions: [...keeperOut(4.6), { to: [22.5, 12.4] }, { wait: 3.5, face: 0 }, { to: [27.5, 13.2] }, { to: [32.5, 13.7] }, { wait: 6, face: Math.PI }, { to: [30.5, 18.6] }, { wait: 60 }] },
      weaver: { start: V(16.5, 0, 9.5), speed: 1.15, actions: [{ to: [21, 9.6] }, { to: [28.5, 9.5] }, { visit: 'house-2', stay: 5.5 }, { to: [26.4, 12.6] }, { to: [16.2, 13.6] }, { to: [16.5, 9.5] }, { visit: 'house-1', stay: 7 }, { to: [12, 13.5] }, { wait: 60 }] },
      baker: { start: V(39.5, 0, 18.5), speed: 1.25, actions: [{ to: [31.5, 18.6] }, { to: [14.2, 18.4] }, { to: [10.5, 17.55] }, { wait: 4.5, face: Math.PI }, { to: [5.5, 13.5] }, { visit: 'house-14', stay: 6 }, { to: [8.5, 18.5] }, { to: [5.5, 18.5] }, { visit: 'house-13', stay: 8 }, { wait: 60 }] },
      hound: { start: V(25.5, 0, 27.6), speed: 1.0, actions: [{ to: [21.5, 27.4] }, { wait: 1.2, face: -2.4, action: 'sniff', at: 0.1 }, { to: [17.6, 23.5], speed: 3.2 }, { to: [16.9, 16.6], speed: 3.2 }, { wait: 2.2, face: 0.2, action: 'bark', at: 0.05 }, { to: [15.6, 13.8] }, { wait: 1.5, action: 'sniff', at: 0.2 }, { to: [21.5, 13.4] }, { wait: 3, face: 0 }, { to: [23.6, 12.6] }, { wait: 60, face: Math.PI }] },
    },
    dusk: {
      keeper: { start: towerInside, speed: 0.6, actions: [...keeperOut(0.6), lampA(13, 10), lampA(7, 21), lampA(12, 27), { to: [16.5, 26.5] }, { wait: 60 }] },
      weaver: { start: V(28.5, 0, 12.5), speed: 1.15, actions: [{ wait: 3 }, { to: [28.5, 9.5] }, { visit: 'house-2', stay: 60 }] },
      baker: { start: V(30.5, 0, 24.5), speed: 1.25, actions: [{ wait: 6 }, { to: [38.5, 24.5] }, { visit: 'house-6', stay: 60 }] },
    },
    night: {
      keeper: { start: V(16.6, 0, 24.6), speed: 0.6, actions: [{ to: [19.5, 26.2] }, { to: [26.0, 26.0] }, { to: [29.0, 22.6] }, { wait: 4, face: Math.PI / 2 }, { to: [29.6, 15.6] }, { wait: 60 }] },
      weaver: { start: V(9.5, 0, 24.5), speed: 1.15, actions: [{ to: [14.5, 24.4] }, { to: [16.5, 13.5] }, { to: [16.5, 9.5] }, { visit: 'house-1', stay: 60 }] },
    },
    ceremony: {
      keeper: { start: V(22.5, 0, 12.0), speed: 0.6, actions: [{ to: [22.5, 15.2] }, { to: [CIRCLE.cx, CIRCLE.cz + 0.3], direct: true }, { wait: 120, face: 0, action: 'raise', at: CEREMONY.nominate - 7 }] },
      // the two villagers walk in and step up onto their own seat stones (13 and 5, non-voters), facing the dais
      weaver: { start: V(16.5, 0, 12.5), speed: 1.15, actions: [{ to: seatOut(13, 0.9) }, { to: seatAt(13), direct: true }, { wait: 120, face: seatFace(13) }], seat: 13 },
      baker: { start: V(31.5, 0, 18.5), speed: 1.25, actions: [{ to: seatOut(5, 0.9) }, { to: seatAt(5), direct: true }, { wait: 120, face: seatFace(5) }], seat: 5 },
      hound: { start: V(26.5, 0, 27.4), speed: 1.0, actions: [{ to: seatOut(9, 1.2) }, { wait: 120, face: Math.PI, action: 'sniff', at: 3 }] },
    },
  }[S.routes];
  const specs = { keeper: keeperSpec, weaver: villager('weaver'), baker: villager('baker'), hound: houndSpec };
  if (!off.has('walkers') && R) {
    for (const [name, r] of Object.entries(R)) {
      const spec = specs[name];
      const sp = Math.min(r.speed, spec.locomotion?.walkSpeed ?? r.speed);
      const route = compileRoute(r.start, r.actions, { layout, records, doorOf, speed: sp });
      if (r.actions[0]?.towerExit) {                                       // the keeper lives in the tower: its door opens for him
        const d = doorOf('clocktower');
        if (d) route.doorEvents.push({ door: d, t: r.actions[0].wait - 0.8, kind: 'open' }, { door: d, t: r.actions[0].wait + 1.9, kind: 'close' });
      }
      const w = spawnWalker(engine, group, spec, route, { clock: clockOf, name: `life-${name}` });
      if (S.routes === 'ceremony') w.ch.opts.ground = daisGround;
      if (name === 'keeper' && dusky) attachLantern(engine, w.ch, { color: PAL.lampGlow, intensity: 2.2, distance: 2.8 });   // warm town lamp tone, not the ruin keeper's red
      walkers.push(w);
      if (r.seat !== undefined) { const [sx, sz] = seatAt(r.seat); const sg = route.segs.find((q) => Math.hypot(q.b.x - sx, q.b.z - sz) < 1e-3); if (sg) walkerSeats[r.seat] = sg.t1 + 0.1; }
      allDoorEvents.push(...route.doorEvents);
      allLampEvents.push(...route.lampEvents);
      // the hound's bark scares the ground crows
      if (name === 'hound') for (const s of route.segs) if (s.action === 'bark') scares.push({ t: s.actionAt + 0.15, pos: s.a.clone(), r: 6, ground: true, kind: 'bark' });
    }
  }
  // ---------------------------------------------------------------------------------------------- ambient townsfolk
  // (art-director round) the square must look inhabited by day: a keeper behind each market stall, someone at the
  // well, a child chasing a cat across the green north of the square, a sitter on each bench (folk.js, below). The
  // walkers live in a cottage: they come OUT of its door (registry door anchor: the door swings for them), walk to
  // their station, idle there (with an occasional one-shot: offer / haul), and go home for a while, on a deterministic
  // loop (unrolled over the horizon: pure f(t)). Phased so that at t = 0 everyone is already at work. Never on the circle.
  const ambient = [];
  const propsP = registry.get('props');
  const pSpots = propsP?.anchors?.spots ?? {};
  const isDay = S.routes === 'day' && !off.has('ambient');
  if (isDay && !off.has('walkers')) {
    const stallAt = (k, fb) => (pSpots[k] ? [pSpots[k].x, pSpots[k].z - 1.55] : fb);
    const [rx, rz] = stallAt('stallRed', [10.5, 16]), [gx, gz] = stallAt('stallGold', [34.5, 16]);
    const well = pSpots.well ?? V(16, 0, 13.2);
    // station: [x, z], face, the side approach (a free tile beside it), home cottage, idle beats (s) + their action
    const AMB = [
      // keepers stand OUT FRONT at a counter corner (red: the west one, the noticeboard hides the east one), facing the
      // customers (behind the counter the
      // awning hides a 1.4 m figure completely from the 30-degree gameplay camera)
      { name: 'grocer', home: 'house-12', st: [rx - 1.0, rz + 1.25], side: null, face: Math.PI / 8, beat: 3.1, act: 'offer', every: 3, idle: 46, stay: 7, phase: 0.08 },
      { name: 'chandler', home: 'house-5', st: [gx - 1.05, gz + 1.22], side: null, face: -Math.PI / 4, beat: 2.9, act: 'offer', every: 4, idle: 52, stay: 6, phase: 0.31 },
      // the well: stands at the front of the curb facing it (north), hauls the rope every other beat
      { name: 'drawer', home: 'house-0', st: [well.x - 0.05, well.z + 0.08], side: null, face: Math.PI, beat: 2.6, act: 'haul', every: 2, idle: 30, stay: 9, phase: 0.12 },
    ];
    for (const a of AMB) {
      const spec = townsfolk(a.name);
      const sp = Math.min(1.15, spec.locomotion.walkSpeed);
      const st = V(a.st[0], 0, a.st[1]);
      const goStation = () => [...(a.side ? [{ to: a.side }, { to: a.st, direct: true }] : [{ to: a.st }])];
      const idleBeats = (dur, k0) => {
        const out = [];
        for (let k = 0, tt = 0; tt < dur - 0.01; k++) {
          const d = Math.min(a.beat * (0.85 + 0.3 * hash(k0 + k, a.name.length, 5)), dur - tt);
          out.push({ wait: d, face: a.face, ...(k % a.every === a.every - 1 && d > 1.4 ? { action: a.act, at: 0.25 } : {}) });
          tt += d;
        }
        return out;
      };
      const loopActs = (k) => [...(a.side ? [{ to: a.side }] : []), { visit: a.home, stay: a.stay }, ...goStation(), ...idleBeats(a.idle, k * 50)];
      // t = 0 mid-way through an idle stretch (phase), then whole loops to the horizon
      const actions = [...idleBeats(a.idle * (1 - a.phase), 999)];
      for (let k = 0; k < 8; k++) actions.push(...loopActs(k));
      const route = compileRoute(st, actions, { layout, records, doorOf, speed: sp });
      const w = spawnWalker(engine, group, spec, route, { clock: clockOf, name: `life-${a.name}` });
      walkers.push(w); ambient.push(a.name);
      allDoorEvents.push(...route.doorEvents);
    }
  }
  // the child chasing a cat round the green strip between the north lane and the square (x 13.6-21.2, z 9.5-10.6):
  // the child jogs a closed loop at a constant pace, the cat keeps ahead of it on the same loop, sits and looks back
  // at the two hairpins until the child is ~0.8 m away, then bolts (pure f(t) of the loop arc length)
  let chase = null;
  if (isDay && !off.has('cats')) {
    const L = [[14.0, 10.62], [20.5, 10.62], [21.15, 10.05], [20.45, 9.52], [14.25, 9.52], [13.55, 10.08]].map(([x, z]) => V(x, 0, z));
    const segs = []; let tot = 0;
    for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], d = a.distanceTo(b); segs.push({ a, b, s0: tot, d }); tot += d; }
    const at = (s, out = V(0, 0, 0)) => {
      s = ((s % tot) + tot) % tot;
      const q = segs.find((g) => s < g.s0 + g.d) ?? segs[segs.length - 1];
      out.lerpVectors(q.a, q.b, (s - q.s0) / q.d);
      return { pos: out, yaw: Math.atan2(q.b.x - q.a.x, q.b.z - q.a.z) };
    };
    const v = 1.35, G0 = 2.5, G1 = 0.85, half = tot / 2, Th = half / v;   // child pace, cat gap (max / min), half-loop
    const s0 = (segs[2].s0 + 0.2) - G0;                                    // the first pause just past the east hairpin
    const tPause = (G0 - G1) / v, tDash = 1.3;
    const catS = (t) => {
      const k = Math.floor(t / Th), u = t - k * Th, sc = s0 + v * t;
      let g;
      if (u < tPause) g = G0 - v * u;                                       // sitting: the child closes in
      else if (u < tPause + tDash) g = G1 + (G0 - G1) * ((u - tPause) / tDash);   // the bolt
      else g = G0;
      return { s: sc + g, sitting: u < tPause, u };
    };
    // the child's route: a constant-pace lap (unrolled over the horizon)
    const childSpec = townsfolk('child');
    const start = at(s0).pos.clone();
    const acts = [];
    let iSeg = segs.findIndex((g) => s0 < g.s0 + g.d);
    for (let lap = 0; lap < Math.ceil((H * v) / tot) + 1; lap++) for (let j = 1; j <= L.length; j++) {
      const q = segs[(iSeg + j) % L.length];
      acts.push({ to: [q.a.x, q.a.z], direct: true, speed: v });
    }
    const route = compileRoute(start, acts, { layout, records, doorOf, speed: v });
    const w = spawnWalker(engine, group, childSpec, route, { clock: clockOf, name: 'life-child' });
    walkers.push(w); ambient.push('child');
    chase = { at, catS, tot, v };
  }
  const FAR = V(-99, 0, -99);
  const walkerAt = (tl) => walkers.map((w) => (w.route.segs.some((s) => s.hidden && tl >= s.t0 && tl < s.t1) ? FAR : w.at(tl)));

  // ---------------------------------------------------------------------------------------------- doors
  const doorDrivers = [];
  if (!off.has('doors') && !params?.has?.('doors')) {
    const byDoor = new Map();
    for (const e of allDoorEvents) { if (!byDoor.has(e.door)) byDoor.set(e.door, []); byDoor.get(e.door).push(e); }
    for (const [door, evs] of byDoor) { evs.sort((a, b) => a.t - b.t); doorDrivers.push({ drv: makeDoorDriver(door, registry.get(door.piece)?.group), evs }); }
  }

  // ---------------------------------------------------------------------------------------------- crows
  for (const ts of strikes) scares.push({ t: ts + 0.2, pos: ctSpots.bell ?? V(22.5, 9, 7), r: 13, circle: true, kind: 'bell' });
  if (S.ceremony) scares.push({ t: S.ceremony.t0 + CEREMONY.execute + 0.3, pos: V(CIRCLE.cx, 1, CIRCLE.cz), r: 8.5, circle: true, kind: 'execute' });
  scares.sort((a, b) => a.t - b.t);
  const perchList = [];
  for (const p of registry.anchors('perches')) {
    if (p.pos.y > 13.5 || p.pos.y < 1.6) continue;
    if (p.pos.x < 1 || p.pos.x > 44 || p.pos.z < 2 || p.pos.z > 36) continue;
    perchList.push({ pos: p.pos.clone(), tag: p.piece });
  }
  // ground forage spots on the square's setts (between the dial ring and the kerb)
  if (!night) for (const [deg, r] of [[-130, 7.7], [-100, 7.9], [150, 7.6], [110, 7.8], [30, 7.7], [60, 8.0], [180, 7.5], [-160, 7.8]]) {
    const a = (deg * Math.PI) / 180;
    perchList.push({ pos: V(PLAZA.cx + Math.sin(a) * r, 0, PLAZA.cz - Math.cos(a) * r), ground: true, tag: 'ground' });
  }
  const idx = (fn) => perchList.map((p, i) => [p, i]).filter(([p]) => fn(p)).map(([, i]) => i);
  const towerIdx = idx((p) => p.tag === 'clocktower'), groundIdx = idx((p) => p.ground);
  const otherIdx = idx((p) => p.tag !== 'clocktower' && !p.ground);
  // night: the crows ROOST (tower pinnacles + roof perches, no ground foragers, no restless hops between perches);
  // only the bell (or the execution) still sends them up
  const startAt = (night
    ? [...towerIdx.slice(0, 5), otherIdx[0], otherIdx[Math.floor(otherIdx.length / 3)], otherIdx[Math.floor((2 * otherIdx.length) / 3)]]
    : [...towerIdx.slice(0, 4), groundIdx[0], groundIdx[1], groundIdx[3], groundIdx[5], otherIdx[0], otherIdx[Math.floor(otherIdx.length / 2)]]).filter((i) => i !== undefined);
  const crows = off.has('crows') ? null : createCrows(engine, group, perchList, scares, { count: startAt.length, seed: 11, horizon: H, startAt, walkerAt, restless: !night });

  // ---------------------------------------------------------------------------------------------- cats
  let cats = null;
  const quantYaw = (dx, dz) => Math.round(Math.atan2(dx, dz) / (TAU / 8)) * (TAU / 8);
  if (!off.has('cats')) {
    const perches = registry.anchors('perches');
    const seats = registry.anchors('seats').filter((s) => s.piece === 'props');
    const sq = V(PLAZA.cx, 0, PLAZA.cz);
    // ginger tabby: on the clocktower's front steps, beside the door the keeper comes out of (top of the gameplay view)
    const door = ctSpots.door;
    const list = [];
    if (door) list.push({ fur: 'ginger', seed: 3, script: [{ t: 0, pose: 'sit', at: V(door.x + 1.05, door.y, door.z - 0.05), yaw: 0, look: true }] });
    const bx = seats[0] ? seats[0].pos.clone() : V(9.9, 0.45, 21.5);
    // by day a sitter takes the bench's left seat (folk.createBenchFolk): the grey cat loafs on the right one
    const benchSeat = V(bx.x + (isDay ? 0.86 : 0.45), bx.y + 0.02, bx.z);
    const floorA = V(bx.x + 0.9, 0, bx.z + 0.75), floorB = V(bx.x + 2.4, 0, bx.z + 0.7), floorC = V(bx.x + 2.7, 0, bx.z - 0.9);
    list.push({ fur: 'grey', seed: 8, script: [
      { t: 0, pose: 'loaf', at: benchSeat, yaw: 0 },
      { t: 14, pose: 'sit', at: benchSeat, yaw: TAU / 8, look: true },
      { t: 24, walk: [V(benchSeat.x + 0.2, 0, benchSeat.z + 0.5), floorA] },
      { t: 24.6, walk: [floorA, floorB] },
      { t: 26.4, walk: [floorB, floorC] },
      { t: 28.4, pose: 'sit', at: floorC, yaw: Math.PI / 2, look: true },
      { t: 45, pose: 'groom', at: floorC, yaw: Math.PI / 2 },
      { t: 49, pose: 'sit', at: floorC, yaw: Math.PI / 2, look: true },
    ] });
    // the chased cat (sandy): sits facing back at the child at each hairpin, then bolts round the loop (stepped 8 fps,
    // 2-drawing trot at 8 fps), facing the path in 45-degree stops
    if (chase) {
      const tmpC = V(0, 0, 0);
      list.push({ fur: 'sandy', seed: 5, fn: (t) => {
        const c = chase.catS(step(Math.max(0, t), 8));
        const p = chase.at(c.s, tmpC);
        if (c.sitting) return { pose: c.u < 0.35 ? 'sitB' : 'sitA', pos: p.pos, yaw: quantYaw(-Math.sin(p.yaw), -Math.cos(p.yaw)) };
        return { pose: Math.floor(t * 8) % 2 ? 'walkA' : 'walkB', pos: p.pos, yaw: quantYaw(Math.sin(p.yaw), Math.cos(p.yaw)) };
      }, script: [{ t: 0, at: chase.at(0).pos.clone() }] });
    }
    cats = createCats(engine, group, list);
    cats.list = list;
  }

  // ---------------------------------------------------------------------------------------------- sprites + particles
  const sp = createSprites(engine, { max: 1600 });
  group.add(sp.points);
  const unlitP = P('unlit', null);
  const chimneys = off.has('smoke') ? [] : registry.anchors('chimneys').filter((c) => !(unlitP === 'all' || unlitP?.split(',').includes(c.piece)));
  const smokeStyles = chimneys.map((c, i) => smokeStyle(100 + i * 17, { night }));
  // the fountain: find the spout top and the basin rim in the props geometry
  let ftn = null;
  const fObj = layout.objects.find((o) => o.kind === 'fountain');
  const props = registry.get('props');
  // the props owner's fountain already runs its own water (a 'water-fountain' pass + falling streams): only add our
  // jets when the fountain is a dry stub
  const ownWater = engine.pipeline.passes?.some((q) => q.name?.startsWith('water-fountain'));
  if (fObj && props?.group && !off.has('fountain') && !ownWater) {
    const fx = fObj.center.x, fz = fObj.center.z;
    let spoutY = -1, rimY = -1, basinR = 0;
    scanVertices(props.group, (v) => {
      const d = Math.hypot(v.x - fx, v.z - fz);
      if (d < 0.32) spoutY = Math.max(spoutY, v.y);
      else if (d < 1.7 && v.y < 1.2 && v.y >= rimY - 0.02) { rimY = Math.max(rimY, v.y); basinR = Math.max(basinR, d); }
    });
    if (spoutY > 0.3 && rimY > 0.1) ftn = { x: fx, z: fz, spoutY: spoutY + 0.02, waterY: rimY - 0.08, basinR: Math.min(1.5, Math.max(0.9, basinR)) };
  }
  // night bugs and leaves (createParticles: 1 call each)
  const parts = [];
  const flyBoxes = [];
  if (dusky && !off.has('bugs')) {
    for (const b of [{ x0: 1.5, x1: 13, z0: 10, z1: 26 }, { x0: 31.5, x1: 43.5, z0: 13, z1: 27 }, { x0: 12, x1: 33, z0: 2.5, z1: 4.5 }, { x0: 10, x1: 35, z0: 9.6, z1: 12.4 }, { x0: 11.5, x1: 15, z0: 22, z1: 29 }, { x0: 30, x1: 33.5, z0: 22, z1: 29 }]) {
      flyBoxes.push({ ...b, y0: 0.3, y1: 1.4, n: night ? 34 : 16 });   // own sprites: 2-texel blink clusters
    }
  }
  if (!off.has('leaves')) {
    const p = createParticles(engine, { kind: 'leaves', bounds: { x0: 12, x1: 34, y0: 0.0, y1: 5.5, z0: 8, z1: 31 }, count: 16, seed: 21, speed: 0.35,
      colors: [PAL.autumn[0], PAL.leaf[0], PAL.leaf[2], PAL.autumn[1]], add: false });
    group.add(p.points); parts.push(p);
  }

  // ---------------------------------------------------------------------------------------------- cycle + ceremony
  const cycle = off.has('cycle') ? null : createCycle(engine, registry, { mode: S.cycle, t0: 0.5, spacing: 0.9, lampEvents: allLampEvents });
  const ceremony = S.ceremony ? createCeremony(registry, { t0: S.ceremony.t0, toEngine, seatTimes: walkerSeats }) : null;
  // the townsfolk on the seat stones (instanced seated figures; seats held by walking villagers are skipped)
  const COST = ['red', 'slate', 'plaster'];
  const folk = ceremony && daisPiece?.anchors?.seats && !off.has('folk') ? createFolk(engine, group, daisPiece.anchors.seats, CIRCLE, (i, t) => {
    if (walkerSeats[i] !== undefined) return null;
    const since = ceremony.seatTime.get(i);
    if (t < since) return null;
    const st = ceremony.seatState(i, t);
    if (st === 'empty') return null;
    if (st.dead) return { costume: 'ghost', since: i === CEREMONY.nominee ? since - 9 : since };
    const C = CEREMONY;
    const hand = C.voters.includes(i) && t >= ceremony.reachTime(i) - 0.25 && t < ceremony.t0 + C.execute + 1.5;
    return { costume: COST[(i * 7) % 3], hand, since };
  }, P('folkNudge') ? { nudge: P('folkNudge').split(',').map(Number) } : {}) : null;
  // bench sitters by day (left seat of the west bench, right seat of the east bench)
  const pSeats = registry.anchors('seats').filter((q) => q.piece === 'props').map((q) => q.pos);
  const benchFolk = isDay && !off.has('folk') && pSeats.length >= 4 ? createBenchFolk(engine, group, [
    { pos: pSeats[0].clone(), costume: 'granny', poses: ['sit', 'chin'], beat: 4.2 },
    { pos: pSeats[3].clone(), costume: 'farmer', poses: ['sit', 'pipe'], beat: 5.1 },
  ]) : null;
  // A/B only: ?folkShadow=1 the rotated figures themselves cast, ?folkShadow=0 no folk shadow (default: the proxy)
  if (folk && P('folkShadow') === '1') for (const m of Object.values(folk.set.meshes)) m.castShadow = true;
  if (folk && (P('folkShadow') === '0' || P('folkShadow') === '1')) for (const m of Object.values(folk.proxy.meshes)) m.castShadow = false;
  const banners = !off.has('wind') ? createBannerFlutter(daisPiece) : null;
  // night smoke: emissive slate tones, lighter than the setts (fx.smokeNight)
  let smokeCols = null;
  const seatsXYZ = daisPiece?.anchors?.seats ?? [];
  const brazierTops = Object.entries(daisSpots).filter(([k]) => k.startsWith('brazier')).map(([, v]) => v);
  const mothLights = registry.anchors('lights').filter((l) => (l.kind === 'lamp' || l.kind === 'lantern') && l.pos.y > 1.2);

  // ---------------------------------------------------------------------------------------------- update (pure f(t))
  const rootOff = new THREE.Vector3();
  let shownMin = null, frames = 0, lastTl = 0;
  // (perf) per-frame constants hoisted out of update: each moth light's cycle key, the emitter option objects
  const mothKeys = mothLights.map((l) => (l.piece === 'props' ? cycle?.lamps.find((q) => q.pos === l.pos) : l.piece));
  const mothOpts = mothLights.map((l, i) => ({ seed: i * 13 + 1, n: l.kind === 'lamp' ? 5 : 3 }));
  const flyOpts = flyBoxes.map((b, k) => ({ seed: 300 + k, n: b.n }));
  function update(t) {
    const warm = frames++ === 0;
    const tl = clockOf(t);
    if (group.parent) rootOff.copy(group.parent.position);
    // clock + bell (re-run the tower update so the strike shows in this frame, with OUR ring time)
    if (clockApi?.setTime) {
      const m = minutesAt(tl);
      if (m !== shownMin) { shownMin = m; clockApi.setTime(Math.floor(m / 60) % 24, m % 60); }
      const ts = strikeAt(tl);
      if (ts !== null && clockApi.ring) { clockPiece.update?.(t); clockApi.ring(toEngine(ts)); clockPiece.update?.(t); }
    }
    ceremony?.update(tl, t);
    for (const d of doorDrivers) d.drv.set(doorF(d.evs, tl));
    for (const w of walkers) w.update(tl);
    lastTl = tl;                     // stats.at is computed on read (it allocated ~8 arrays + strings per frame)
    cycle?.update(tl);
    crows?.update(tl, rootOff, warm);
    cats?.update(tl, rootOff, warm);
    folk?.update(tl, rootOff, warm);
    benchFolk?.update(tl, rootOff, warm);
    banners?.update(tl);

    if (!smokeCols) smokeCols = night ? smokeNight(Number(P('smokeK', 1))) : null;
    sp.begin(rootOff);
    for (let i = 0; i < chimneys.length; i++) {
      const lit = cycle && S.cycle === 'dusk' ? cycle.stateOf(chimneys[i].piece, tl) : 1;
      smoke(sp, tl, chimneys[i].pos, { seed: 100 + i * 17, style: smokeStyles[i], strength: lit ? 1 : 0.8, colors: smokeCols });
    }
    if (ftn) fountain(sp, tl, ftn, { night });
    if (dusky && !off.has('bugs')) {
      const tgt = engine.camera.target;
      stats.mothLamps = 0;
      for (let i = 0; i < mothLights.length; i++) {
        const l = mothLights[i];
        if (Math.hypot(l.pos.x - tgt.x, l.pos.z - tgt.z) > 18) continue;
        const key = mothKeys[i];
        if (!cycle || !key || cycle.stateOf(key, tl) > 0.5) { moths(sp, tl, l.pos, mothOpts[i]); stats.mothLamps++; }
      }
      for (let k = 0; k < flyBoxes.length; k++) fireflies(sp, tl, flyBoxes[k], flyOpts[k]);
    }
    // bell "ding" glints
    const ts = strikeAt(tl);
    if (ts !== null && ctSpots.bell) glints(sp, tl, ctSpots.bell, bellHits(ts));
    // the lamplighter's spark when a lamp catches
    for (const e of allLampEvents) {
      const a = tl - e.t;
      if (a >= 0 && a < 0.6) for (let k = 0; k < 4; k++) {
        const ang = k * (TAU / 4) + TAU / 8, r = 0.18 + step(a, 8) * 0.5;
        sp.push(e.light.pos.x + Math.cos(ang) * r, e.light.pos.y + Math.sin(ang) * r * 0.8, e.light.pos.z + 0.2, 3, SHAPE.SPARK, a > 0.35 ? 1 : 0, true, FX_COLORS.glint, FX_COLORS.glintB);
      }
    }
    // ceremony: seats catching (a spark pop on the candle), brazier embers at every flare
    if (ceremony) {
      for (const [i, ts2] of ceremony.seatTime) {
        const a = tl - ts2, s = seatsXYZ[i];
        if (!s || a < 0 || a > 0.5) continue;
        sp.push(s.x, s.y + 0.55, s.z, 3, SHAPE.SPARK, a > 0.25 ? 1 : 0, true, FX_COLORS.ember, FX_COLORS.emberB);
      }
      for (const [k, b] of brazierTops.entries()) for (const [j, tf] of ceremony.flares.entries()) embers(sp, tl, b, tf, { seed: k * 7 + j, n: 12, life: 1.6 });
    }
    sp.end();
    stats.sprites = sp.count;
  }

  const stats = {
    walkers: walkers.length, doors: doorDrivers.length, chimneys: chimneys.length, crows: crows?.crows.length ?? 0,
    perches: perchList.length, fountain: ftn ? [ftn.x, ftn.z, +ftn.spoutY.toFixed(2), +ftn.waterY.toFixed(2), +ftn.basinR.toFixed(2)] : 0,
    cats: cats?.list?.map((c) => [c.fur, ...c.script[0].at.toArray().map((v) => +v.toFixed(2))]),
    strikes: strikes.length, walkerSeats, folk: !!folk, ambient, benchFolk: !!benchFolk, banners: banners?.count ?? 0, doorPivots: doorDrivers.map((d) => [d.drv.piece, d.drv.moved]),
    doorEv: allDoorEvents.map((e) => [e.door.piece, e.kind, +e.t.toFixed(2)]),
    bell: ctSpots.bell ? ctSpots.bell.toArray().map((v) => +v.toFixed(2)) : null, lifeBuildMs: Math.round(performance.now() - t0build),
  };
  Object.defineProperty(stats, 'at', { enumerable: true, configurable: true,
    get: () => walkers.map((w) => [w.name, ...w.at(lastTl).toArray().map((v) => +v.toFixed(2))]) });
  engine.stats.life = stats;
  return {
    group,
    update,
    anchors: {},
    api: {
      demo, script: S, clock: clockOf,
      /** The day-cycle helper: switch the town's lights for a phase ('day'|'dusk'|'night'|'dawn') from life time t0. */
      setTimeOfDay: (mode, t0 = 0, spacing = 0.9) => createCycle(engine, registry, { mode, t0, spacing, lampEvents: allLampEvents }),
      walkers, crows, cats, cycle, ceremony, strikes, litAt,
      /** where a demo wants the camera (scenes/town-life.js). */
      focus: { day: [22.5, 15.5], dusk: [17.5, 17.5], night: [21.5, 19.5], ceremony: [22.5, 19.5] }[demo] ?? null,
    },
    stats,
  };
}
