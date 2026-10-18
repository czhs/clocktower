// (B) The clock tower's interior (pass B; docs/DEMO.md §4.9): walk in through the great door like a cottage
// (interior.js conventions: the door prompt "Walk in: The Clocktower", the fade, a room far from the town with its own
// collision, the dollhouse camera, the time module's light pool aimed at the room's lanterns, walk out on the exit spot).
//   createTowerInterior(demo) -> { room (the normalized record once built), origin, enter(), leave(), update(), info() }
// Registered with the player's interiors (interior.js `register`, a pass-B hook) under the id 'clocktower'; player.js
// enters it once this module exists (its `enterable`), the store's location accepts 'clocktower', ?in=clocktower starts
// inside.
//
// THE ROOM (world origin O = (650, 20): past the 15 cottages' rooms at 200 + 30 i), 7 x 6 m of stone, 5 m tall, a
// cut-away front (knee-high stubs) like the cottages, side / back walls hidden when they face the camera (Q / E turn):
//   - the CLOCK LANDING: a raised stone platform along the back (top 1.2 m, plank deck, iron rail) reached by a timber
//     stair up the east wall (walkable: raw.heightAt gives the feet's height on the steps / the landing; the rail and
//     the balustrade are colliders);
//   - the BACK OF THE CLOCK FACE in the back wall above the landing (r 1.25 m, the north dial seen from inside: lit
//     cream glass, reversed hour marks) with the hands seen from behind, in sync with the tower outside: the countdown
//     (the wedge + the hand, mirrored: counter-clockwise from inside) while the timer runs, the time of day otherwise;
//   - the MOVEMENT: an iron cage with the going train (great wheel: one turn per game hour; second wheel; the brass
//     escape wheel ticking once a second, its anchor rocking with the pendulum) and the TIMER TRAIN (a brass drum wheel
//     with a crimson enamel boss: one turn per countdown, + its pinion: they turn only while the timer runs, stop when
//     paused, are back at zero after a reset), the FLY (the strike train's air brake) spinning while the bell strikes
//     at zero, a drive rod up to the dial's motion work;
//   - the PENDULUM: a 2.6 m rod + brass bob hanging in front of the landing from an iron gallows (a seconds pendulum:
//     period 2 s, swing drawn in stepped 12 fps poses);
//   - warm light: three lanterns (wall west, wall east over the stair, one on the movement) + the dial as a 'window'
//     (the time module aims its constant pool at them: no new lights, no new programs); the bell rope with a red sally
//     that jerks when the bell rings; a workbench with a spare wheel; ceiling beams; the ladder to the belfry hatch.
// Everything is kit Builder geometry (the town's shared solid / soft / glass materials: no shader program is added by
// entering) and every animation is a function of the demo clock (engine.time / the timer's state / the town hours).
import * as THREE from 'three';
import { Builder, M, lantern } from '../town/kit.js';
import { TOWN_PALETTE as PAL } from '../town/palette.js';
import { drawDialFace } from './towertimer.js';

const TAU = Math.PI * 2;
export const ORIGIN = { x: 200 + 30 * 15, z: 20 };
const W = 8, D = 5.5, H = 4.6, T = 0.3;             // floor x -4..4, z -2.75..2.75; wall height; wall thickness
const PLAT = { z1: -0.6, y: 1.1 };                  // the landing: z -2.75 .. -0.6, top 1.1
const STAIR = { x0: 2.7, x1: 3.95, z0: -0.6, z1: 1.9, steps: 8 };
const DIAL = { x: 0, y: 3.15, r: 1.1 };
const PEND = { x: -3.15, z: -0.3, y: 3.6, len: 2.75 };
const ROPE = { x: 1.95, z: -0.2 };
const HOUR = [[-0.055, -0.14], [0.055, -0.14], [0.06, 0.4], [0.12, 0.47], [0, 0.62], [-0.12, 0.47], [-0.06, 0.4]];
const MINUTE = [[-0.04, -0.26], [0.04, -0.26], [0.04, 0.84], [0.075, 0.88], [0, 1.0], [-0.075, 0.88], [-0.04, 0.84]];

/** A spur gear outline (n teeth, outer r, root r - depth), with `windows` spoke holes, extruded `thick` along +z. */
function gearGeometry(r, n, { depth = 0.06, thick = 0.06, windows = 4, hub = 0.22, pointed = false } = {}) {
  const pts = [];
  const r0 = r - depth;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, s = TAU / n;
    if (pointed) { pts.push([Math.sin(a) * r0, Math.cos(a) * r0], [Math.sin(a + s * 0.6) * r, Math.cos(a + s * 0.6) * r]); continue; }
    for (const [f, rr] of [[0, r0], [0.18, r], [0.5, r], [0.68, r0]]) { const b = a + s * f; pts.push([Math.sin(b) * rr, Math.cos(b) * rr]); }
  }
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  if (windows > 0 && r0 > 0.16) {
    const ri = r0 * 0.8, rh = Math.max(r0 * hub, 0.05);
    for (let k = 0; k < windows; k++) {
      const a0 = (k / windows) * TAU + 0.28, a1 = ((k + 1) / windows) * TAU - 0.28, seg = 5, hole = [];
      for (let j = 0; j <= seg; j++) { const a = a0 + ((a1 - a0) * j) / seg; hole.push(new THREE.Vector2(Math.sin(a) * ri, Math.cos(a) * ri)); }
      for (let j = seg; j >= 0; j--) { const a = a0 + ((a1 - a0) * j) / seg; hole.push(new THREE.Vector2(Math.sin(a) * rh * 1.6, Math.cos(a) * rh * 1.6)); }
      shape.holes.push(new THREE.Path(hole));
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** Build a pivot group with one kit mesh (the part drawn by fn(b) around the pivot origin). */
function part(engine, name, fn, opts = {}) {
  const b = new Builder(engine, { name });
  fn(b);
  const g = b.build({ name, castShadow: opts.castShadow ?? true });
  const pivot = new THREE.Group(); pivot.name = `${name}-pivot`;
  for (const m of [...g.children]) pivot.add(m);
  return pivot;
}

export function buildTowerRoom(engine, demo) {
  const O = ORIGIN;
  const root = new THREE.Group(); root.name = 'interior-clocktower';
  root.position.set(O.x, 0, O.z);
  const STONE = { tones: 'stone', pattern: 'ashlar' }, DRESS = { tones: 'ashlar', pattern: 'none' };
  const TIM = { tones: 'timber', pattern: 'none' }, PLANK = { tones: 'plank', pattern: 'planks' }, IRON = { tones: 'iron', pattern: 'none' }, BRASS = { tones: 'brass', pattern: 'none' };
  const lights = [];

  // ---- static: floor, landing, stair, rail, furniture (one builder: solid / soft / glass)
  const b = new Builder(engine, { name: 'interior-clocktower' });
  b.box(W + 2 * T, 0.22, D + T, { tones: 'dial', pattern: 'ashlar', scale: 1.4, tint: 0.95, at: [0, -0.2, -T / 2] });             // floor slab (warm sandstone flags)
  b.box(2.6, 0.025, 1.8, { tones: 'red', pattern: 'thatch', scale: 0.6, at: [0, 0.02, 1.15] });                                     // a worn red runner
  b.box(2.3, 0.03, 1.5, { tones: 'red', pattern: 'none', tint: 0.85, at: [0, 0.021, 1.15] });
  b.box(0.8, 0.035, 0.8, { tones: 'brass', pattern: 'none', tint: 0.95, ry: Math.PI / 4, at: [0, 0.022, 1.15] });                    // brass compass inlay
  // the landing: stone front (ashlar), plank deck, a dressed nosing, the iron rail with brass caps
  b.box(W, PLAT.y - 0.06, D / 2 + PLAT.z1, { tones: 'ashlar', pattern: 'ashlar', scale: 0.9, at: [0, 0, (-D / 2 + PLAT.z1) / 2] });
  b.box(W, 0.06, D / 2 + PLAT.z1, { ...PLANK, at: [0, PLAT.y - 0.06, (-D / 2 + PLAT.z1) / 2] });
  b.box(W, 0.08, 0.12, { ...DRESS, at: [0, PLAT.y - 0.08, PLAT.z1 + 0.02] });
  for (let x = -W / 2 + 0.2; x <= STAIR.x0 - 0.1; x += 0.95) { b.box(0.07, 0.8, 0.07, { ...IRON, at: [x, PLAT.y, PLAT.z1 + 0.06] }); b.box(0.11, 0.06, 0.11, { ...BRASS, at: [x, PLAT.y + 0.8, PLAT.z1 + 0.06] }); }
  b.box(STAIR.x0 + W / 2 - 0.05, 0.06, 0.08, { ...IRON, at: [(-W / 2 + STAIR.x0) / 2, PLAT.y + 0.76, PLAT.z1 + 0.06] });
  // the stair: 8 timber treads on a stone stringer, rising north along the east wall, balustrade on its open (west) side
  const sw = STAIR.x1 - STAIR.x0, run = (STAIR.z1 - STAIR.z0) / STAIR.steps, rise = PLAT.y / STAIR.steps;
  for (let i = 0; i < STAIR.steps; i++) {
    const z = STAIR.z1 - (i + 0.5) * run, y = (i + 1) * rise;
    b.box(sw, y, run, { ...STONE, scale: 0.8, tint: 0.9, at: [(STAIR.x0 + STAIR.x1) / 2, 0, z] });
    b.box(sw + 0.04, 0.05, run + 0.03, { ...TIM, tint: i % 2 ? 0.96 : 1.02, at: [(STAIR.x0 + STAIR.x1) / 2, y - 0.04, z + 0.01] });
  }
  for (let i = 0; i <= 4; i++) {
    const z = STAIR.z1 - 0.3 - i * ((STAIR.z1 - STAIR.z0 - 0.3) / 4), y = Math.max(0, ((STAIR.z1 - z) / (STAIR.z1 - STAIR.z0)) * PLAT.y);
    b.box(0.07, 0.9, 0.07, { ...TIM, at: [STAIR.x0 + 0.04, y, z] });
  }
  {
    const za = STAIR.z1 - 0.3, zb = STAIR.z0, ya = 0.9 + ((STAIR.z1 - za) / (STAIR.z1 - STAIR.z0)) * PLAT.y, yb = 0.9 + PLAT.y;
    b.box(0.07, 0.06, Math.hypot(za - zb, ya - yb), { ...TIM, tint: 1.04, origin: 'center', rx: Math.atan2(yb - ya, za - zb), at: [STAIR.x0 + 0.04, (ya + yb) / 2, (za + zb) / 2] });
  }
  // the movement's cage on the landing: two iron A-frames + rails (the wheels are separate pivots below)
  const CAGE = { x0: -2.8, x1: 2.0, z0: -2.25, z1: -1.35, y0: PLAT.y, y1: PLAT.y + 2.05 };
  for (const x of [CAGE.x0, CAGE.x1]) for (const z of [CAGE.z0, CAGE.z1]) b.box(0.08, CAGE.y1 - CAGE.y0, 0.08, { ...IRON, at: [x, CAGE.y0, z] });
  for (const z of [CAGE.z0, CAGE.z1]) for (const y of [CAGE.y0 + 0.12, CAGE.y1 - 0.06]) b.box(CAGE.x1 - CAGE.x0 + 0.08, 0.07, 0.07, { ...IRON, tint: 0.95, at: [(CAGE.x0 + CAGE.x1) / 2, y, z] });
  for (const x of [CAGE.x0, CAGE.x1]) b.box(0.07, 0.07, CAGE.z1 - CAGE.z0, { ...IRON, at: [x, CAGE.y1 - 0.06, (CAGE.z0 + CAGE.z1) / 2] });
  b.box(CAGE.x1 - CAGE.x0 + 0.3, 0.12, CAGE.z1 - CAGE.z0 + 0.3, { ...TIM, at: [(CAGE.x0 + CAGE.x1) / 2, PLAT.y, (CAGE.z0 + CAGE.z1) / 2] });   // the bed timber
  // the drive rod from the movement up to the dial's motion work + its bevel box
  b.box(0.06, Math.max(0.05, DIAL.y - (CAGE.y1 - 0.06)), 0.06, { ...IRON, at: [DIAL.x + 0.5, CAGE.y1 - 0.06, -2.45] });
  b.box(0.5, 0.06, 0.06, { ...IRON, at: [DIAL.x + 0.25, DIAL.y, -2.45] });
  b.box(0.2, 0.2, 0.2, { ...BRASS, origin: 'center', at: [DIAL.x, DIAL.y, -2.5] });
  // the pendulum's gallows (an iron post on the landing's front edge, the arm out over the floor)
  b.box(0.1, PEND.y + 0.2 - PLAT.y, 0.1, { ...IRON, at: [PEND.x - 0.35, PLAT.y, PLAT.z1 - 0.12] });
  b.box(0.5, 0.1, 0.1, { ...IRON, at: [PEND.x - 0.12, PEND.y + 0.12, PLAT.z1 - 0.12] });
  b.box(0.1, 0.1, PEND.z - PLAT.z1 + 0.25, { ...IRON, at: [PEND.x, PEND.y + 0.12, (PEND.z + PLAT.z1 - 0.12) / 2] });
  // the back of the clock face in the back wall: a deep stone reveal, the lit glass, reversed hour marks
  const dz = -D / 2 + 0.02;
  b.push(M({ at: [DIAL.x, DIAL.y, dz] }));
  {
    const ring = (r0, r1, z, thick, o) => {
      const s = new THREE.Shape(); const n = 32;
      for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; i ? s.lineTo(Math.cos(a) * r1, Math.sin(a) * r1) : s.moveTo(r1, 0); }
      const hole = new THREE.Path(); for (let i = 0; i <= n; i++) { const a = (i / n) * TAU; i ? hole.lineTo(Math.cos(a) * r0, Math.sin(a) * r0) : hole.moveTo(r0, 0); }
      s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 1 }); g.translate(0, 0, z); b.add(g, null, o); g.dispose();
    };
    ring(DIAL.r, DIAL.r + 0.3, 0.0, 0.16, DRESS);                      // stone reveal
    ring(DIAL.r - 0.05, DIAL.r + 0.04, 0.05, 0.08, IRON);              // the iron ring holding the glass
    const disc = new THREE.CircleGeometry(DIAL.r, 32); disc.translate(0, 0, 0.06);
    b.add(disc, null, { tones: 'cream', layer: 'glass', glow: '#FFE6A8', glowKind: 1 }); disc.dispose();
    for (let i = 0; i < 12; i++) {
      const q = i % 3 === 0;
      b.push(M({ at: [0, 0, 0.075], rz: (i / 12) * TAU })); b.box(q ? 0.11 : 0.07, q ? 0.3 : 0.17, 0.02, { ...IRON, tint: 0.85, at: [0, q ? 0.8 : 0.93, 0] }); b.pop();
    }
    // the glazing bars seen from behind: a cross of thin iron (the dial is a window from in here)
    b.box(DIAL.r * 2 - 0.1, 0.035, 0.02, { ...IRON, tint: 0.8, origin: 'center', at: [0, 0, 0.072] });
    b.box(0.035, DIAL.r * 2 - 0.1, 0.02, { ...IRON, tint: 0.8, origin: 'center', at: [0, 0, 0.072] });
  }
  b.pop();
  lights.push({ kind: 'window', pos: { x: O.x + DIAL.x, y: DIAL.y - 0.4, z: O.z + dz + 0.9 }, color: '#FFE6A8', r: 3.2, intensity: 1.1 });
  // lanterns: west wall, east wall over the stair (on side frames), one on the movement's bed
  b.push(M({ at: [-W / 2, 0, 0.6], ry: Math.PI / 2 })); const lw = lantern(b, { at: [0, 2.35, 0], r: 3 }); b.pop();
  lights.push({ ...lw, pos: { x: O.x - W / 2 + 0.24, y: 2.31, z: O.z + 0.6 }, kind: 'lantern' });
  b.push(M({ at: [W / 2, 0, -1.6], ry: -Math.PI / 2 })); lantern(b, { at: [0, 2.9, 0], r: 3 }); b.pop();
  lights.push({ kind: 'lantern', pos: { x: O.x + W / 2 - 0.24, y: 2.86, z: O.z - 1.6 }, color: PAL.lampGlow, r: 3 });
  {
    const lx = 1.75, lz = -1.25, y = PLAT.y + 0.12;
    b.box(0.22, 0.04, 0.22, { ...IRON, at: [lx, y, lz] });
    b.box(0.13, 0.22, 0.13, { tones: 'glass', layer: 'glass', glow: PAL.lampGlow, glowKind: 2, at: [lx, y + 0.04, lz] });
    b.box(0.2, 0.06, 0.2, { ...BRASS, at: [lx, y + 0.26, lz] });
    lights.push({ kind: 'candle', pos: { x: O.x + lx, y: y + 0.3, z: O.z + lz + 0.3 }, color: PAL.lampGlow, r: 2.4 });
  }
  // the workbench (west, ground floor) with a spare wheel leaning on it, an oil can, a coil of rope
  {
    const bx = -3.2, bz = 1.3;
    b.box(1.0, 0.08, 1.6, { ...PLANK, at: [bx, 0.8, bz] });
    for (const [dx, dz2] of [[-0.42, -0.7], [0.42, -0.7], [-0.42, 0.7], [0.42, 0.7]]) b.box(0.08, 0.8, 0.08, { ...TIM, at: [bx + dx, 0, bz + dz2] });
    b.box(0.86, 0.06, 1.4, { ...TIM, tint: 0.9, at: [bx, 0.2, bz] });
    b.cylinder(0.09, 0.07, 0.2, { tones: 'brass', at: [bx + 0.2, 0.88, bz - 0.4] });
    b.box(0.03, 0.1, 0.03, { ...BRASS, at: [bx + 0.27, 1.06, bz - 0.4] });
    b.box(0.34, 0.06, 0.22, { ...IRON, at: [bx - 0.1, 0.88, bz + 0.3] });          // a vice
    const spare = gearGeometry(0.42, 18, { thick: 0.05 });
    b.add(spare, M({ at: [bx + 0.55, 0.43, bz + 0.2], ry: Math.PI / 2, rx: -0.12 }), { tones: 'brass', pattern: 'none', tint: 0.92 }); spare.dispose();
  }
  // the ladder to the belfry hatch (north-east corner of the landing) + the hatch frame in the beams
  for (const sx of [-1, 1]) b.box(0.07, H - PLAT.y, 0.07, { ...TIM, at: [3.35 + sx * 0.22, PLAT.y, -2.4] });
  for (let y = PLAT.y + 0.35; y < H - 0.1; y += 0.32) b.box(0.44, 0.05, 0.05, { ...TIM, tint: 1.03, at: [3.35, y, -2.4] });
  // (no ceiling: the dollhouse view looks in from above, like the cottages) the belfry hatch's frame at the ladder's top
  b.box(0.7, 0.08, 0.08, { tones: 'timber', pattern: 'none', at: [3.35, H - 0.08, -2.4] });
  // the bell rope's ceiling pulley
  b.cylinder(0.12, 0.12, 0.06, { segments: 8, ...BRASS, at: [ROPE.x, H - 0.32, ROPE.z] });
  const stat = b.build({ name: 'interior-clocktower' });
  for (const m of [...stat.children]) root.add(m);

  // ---- walls (each its own mesh: hidden when it faces the camera)
  const walls = [];
  const wall = (name, n, fn) => { const w = new Builder(engine, { name }); fn(w); const g = w.build({ name }); const grp = new THREE.Group(); grp.name = name; for (const m of [...g.children]) grp.add(m); grp.userData.normal = n; root.add(grp); walls.push(grp); return grp; };
  wall('interior-clocktower-back', [0, -1], (w) => {
    // back wall with the dial opening (a square hole the reveal ring covers): 4 slabs around it
    const z = -D / 2 - T / 2, x0 = -W / 2 - T, x1 = W / 2 + T, o = DIAL.r + 0.25;
    w.box(x1 - x0, DIAL.y - o, T, { ...STONE, at: [0, 0, z] });
    w.box(x1 - x0, H - (DIAL.y + o), T, { ...STONE, at: [0, DIAL.y + o, z] });
    w.box(DIAL.x - o - x0, 2 * o, T, { ...STONE, at: [(x0 + DIAL.x - o) / 2, DIAL.y - o, z] });
    w.box(x1 - (DIAL.x + o), 2 * o, T, { ...STONE, at: [(x1 + DIAL.x + o) / 2, DIAL.y - o, z] });
    // dressed quoin pilasters at the corners + a string course at the landing's height
    for (const sx of [-1, 1]) w.box(0.36, H, 0.12, { ...DRESS, tint: 0.96, at: [sx * (W / 2 - 0.18), 0, -D / 2 + 0.06] });
    w.box(W, 0.14, 0.12, { ...DRESS, at: [0, PLAT.y + 2.0 - 0.3, -D / 2 + 0.06] });
  });
  const sideWall = (sx, name) => wall(name, [sx, 0], (w) => {
    const x = sx * (W / 2 + T / 2);
    w.box(T, H, D + T, { ...STONE, at: [x, 0, -T / 2] });
    // a lancet slit with blue glass (never glows: the night outside)
    w.push(M({ at: [sx * W / 2, 0, -0.4 * sx + 0.2], ry: -sx * Math.PI / 2 }));
    w.box(0.18, 0.8, 0.02, { tones: ['#7A86AE', '#4E5A84', '#2E3458'], layer: 'glass', glowKind: 0, at: [0, 2.9, 0.005] });
    for (const s2 of [-1, 1]) w.box(0.08, 0.9, 0.06, { ...DRESS, at: [s2 * 0.13, 2.85, 0.0] });
    w.box(0.34, 0.08, 0.07, { ...DRESS, at: [0, 3.72, 0.0] });
    w.pop();
  });
  sideWall(-1, 'interior-clocktower-west');
  sideWall(1, 'interior-clocktower-east');
  // the front: knee-high stubs either side of the doorway (the dollhouse cut), always shown
  {
    const f = new Builder(engine, { name: 'interior-clocktower-front' });
    for (const sx of [-1, 1]) f.box(W / 2 - 0.75, 0.4, T, { ...STONE, at: [sx * (W / 4 + 0.375), 0, D / 2 - T / 2 + 0.12] });
    for (const sx of [-1, 1]) f.box(0.3, 0.55, T + 0.06, { ...DRESS, at: [sx * 0.9, 0, D / 2 - T / 2 + 0.12] });
    const g = f.build({ name: 'interior-clocktower-front' });
    for (const m of [...g.children]) root.add(m);
  }

  // ---- moving parts
  const wheels = [];
  const wheel = (name, { x, y, z, r, n, tones = 'brass', thick = 0.06, pointed = false, windows = 4, boss = null }) => {
    const p = part(engine, name, (wb) => {
      const g = gearGeometry(r, n, { thick, pointed, windows });
      wb.add(g, null, { tones, pattern: 'none' }); g.dispose();
      wb.box(0.12, 0.12, thick + 0.08, { ...IRON, origin: 'center' });   // the hub
      if (boss) { const d2 = new THREE.CircleGeometry(r * 0.32, 12); d2.translate(0, 0, thick / 2 + 0.004); wb.add(d2, null, { tones: boss, pattern: 'none' }); d2.dispose(); }
    });
    // the arbor (axle) runs along z between the frames: a thin iron rod
    p.position.set(x, y, z);
    root.add(p);
    const arbor = part(engine, `${name}-arbor`, (ab) => ab.box(0.05, 0.05, CAGE.z1 - CAGE.z0, { ...IRON, origin: 'center' }));
    arbor.position.set(x, y, (CAGE.z0 + CAGE.z1) / 2); root.add(arbor);
    const w = { name, pivot: p, r, n };
    wheels.push(w);
    return w;
  };
  const zw = CAGE.z1 - 0.12;
  const great = wheel('tower-great-wheel', { x: -1.95, y: PLAT.y + 1.0, z: zw, r: 0.72, n: 30 });
  const second = wheel('tower-second-wheel', { x: -0.92, y: PLAT.y + 1.42, z: zw - 0.12, r: 0.38, n: 16, tones: 'iron' });
  const escape = wheel('tower-escape-wheel', { x: -0.36, y: PLAT.y + 1.74, z: zw, r: 0.25, n: 15, pointed: true, windows: 0 });
  const drum = wheel('tower-timer-wheel', { x: 1.02, y: PLAT.y + 0.95, z: zw, r: 0.66, n: 26, boss: ['#D8685A', '#B8463E', '#6A3040'] });
  const pinion = wheel('tower-timer-pinion', { x: 0.2, y: PLAT.y + 1.45, z: zw - 0.12, r: 0.22, n: 10, tones: 'iron', windows: 0 });
  // the escapement's anchor: an iron arc rocking over the escape wheel
  const anchor = part(engine, 'tower-anchor', (ab) => {
    ab.box(0.06, 0.32, 0.04, { ...IRON, origin: 'center', at: [0, 0.16, 0] });
    for (const sx of [-1, 1]) ab.box(0.06, 0.2, 0.04, { ...IRON, origin: 'center', rz: sx * 0.9, at: [sx * 0.13, -0.02, 0] });
  });
  anchor.position.set(-0.36, PLAT.y + 1.74 + 0.27, zw + 0.06); root.add(anchor);
  // the fly (the strike train's air brake): two vanes on a spindle above the drum
  const fly = part(engine, 'tower-fly', (fb) => {
    fb.box(0.04, 0.04, 0.04, { ...IRON, origin: 'center' });
    for (const sx of [-1, 1]) fb.box(0.26, 0.16, 0.02, { tones: 'brass', pattern: 'none', tint: 0.9, origin: 'center', at: [sx * 0.15, 0, 0] });
  });
  fly.position.set(1.62, PLAT.y + 1.85, zw); root.add(fly);
  // the pendulum: rod + bob, pivoting at the gallows arm
  const pend = part(engine, 'tower-pendulum', (pb) => {
    pb.box(0.05, PEND.len, 0.04, { ...IRON, at: [0, -PEND.len, 0] });
    const g = new THREE.CylinderGeometry(0.24, 0.24, 0.07, 16); g.rotateX(Math.PI / 2); g.translate(0, -PEND.len, 0);
    pb.add(g, null, { tones: 'brass', pattern: 'none' }); g.dispose();
    pb.box(0.12, 0.12, 0.09, { ...BRASS, tint: 0.9, origin: 'center', at: [0, -PEND.len + 0.36, 0] });   // the rating nut
  });
  pend.position.set(PEND.x, PEND.y, PEND.z); root.add(pend);
  // the bell rope with its red-and-cream sally
  const rope = part(engine, 'tower-bell-rope', (rb) => {
    rb.box(0.04, H - 0.4 - 1.0, 0.04, { tones: 'thatch', pattern: 'none', tint: 0.9, at: [0, 1.0, 0] });
    for (let k = 0; k < 4; k++) rb.box(0.09, 0.1, 0.09, { tones: k % 2 ? 'cream' : PAL.bannerRed, pattern: 'none', at: [0, 1.25 + k * 0.1, 0] });
    rb.box(0.03, 0.18, 0.03, { tones: 'thatch', pattern: 'none', at: [0, 0.84, 0] });
  });
  rope.position.set(ROPE.x, 0, ROPE.z); root.add(rope);
  // the hands on the back of the dial (rebuilt when they move)
  const handsGroup = new THREE.Group(); handsGroup.name = 'tower-dial-back-hands';
  handsGroup.position.set(DIAL.x, DIAL.y, dz + 0.02);
  root.add(handsGroup);
  const handMeshes = {};
  let handKey = '';
  const setHands = (key, draw) => {
    if (key === handKey) return;
    handKey = key;
    const hb = new Builder(engine, { name: 'tower-dial-back-hands' });
    draw(hb);
    const g = hb.build({ name: 'tower-dial-back-hands', castShadow: false });
    const got = new Set();
    for (const m of [...g.children]) {
      const L = m.userData.layer; got.add(L);
      if (!handMeshes[L]) { handMeshes[L] = m; handsGroup.add(m); } else { handMeshes[L].geometry.dispose(); handMeshes[L].geometry = m.geometry; handMeshes[L].visible = true; }
    }
    for (const [L, m] of Object.entries(handMeshes)) if (!got.has(L)) m.visible = false;
  };

  // ---- state -> motion (pure functions of the demo clock / the timer state / the town hours)
  const info = { great: 0, escape: 0, drum: 0, fly: 0, pend: 0, hands: '', ropeAt: null, walls: [] };
  let bellAt = -1e9;
  const offBell = demo.events?.on?.('bell', (e) => { bellAt = e?.t ?? demo.engine.time; });
  const stepQ = (a, n) => Math.round(a / (TAU / n)) * (TAU / n);
  function update(t) {
    const timer = demo.passB?.timer, st = timer?.state;
    const hours = demo.time?.hours ?? 12;
    // going train: the great wheel one turn per game hour (stepped per tooth), the second wheel x (24 / 14), the escape
    // wheel ticks one tooth per second on the pendulum's beat
    const ga = stepQ(-((hours % 1) * TAU), great.n * 2);
    great.pivot.rotation.z = ga;
    second.pivot.rotation.z = stepQ(-ga * (great.n / second.n), second.n * 2);
    const tick = Math.floor(t);
    escape.pivot.rotation.z = -(tick % escape.n) * (TAU / escape.n);
    // the pendulum: a seconds pendulum (period 2 s), 12 fps stepped poses; the anchor rocks with it
    const ph = Math.floor(t * 12) / 12;
    const pa = 0.15 * Math.sin(Math.PI * ph);
    pend.rotation.z = Math.round(pa / 0.02) * 0.02;
    anchor.rotation.z = -pend.rotation.z * 1.4;
    // the timer train: one drum turn per countdown (elapsed / duration), the pinion x (22 / 9); still when idle / paused
    let elapsedF = 0;
    if (st && st.mode !== 'idle' && st.duration > 0) elapsedF = st.mode === 'done' ? 1 : 1 - st.remaining / st.duration;
    const da = stepQ(-elapsedF * TAU, drum.n * 2);
    drum.pivot.rotation.z = da;
    pinion.pivot.rotation.z = stepQ(-da * (drum.n / pinion.n), pinion.n * 2);
    // the fly spins while the bell strikes (the done chime or any bell): 8 fps quarter turns for 6 s
    const since = t - bellAt;
    fly.rotation.z = since >= 0 && since < 6 ? (Math.floor(since * 8) % 4) * (Math.PI / 4) : 0;
    // the bell rope jerks with the bell: up 0.25 m, then settles in two steps
    rope.position.y = since >= 0 && since < 1.2 ? (since < 0.25 ? 0.25 : since < 0.6 ? 0.12 : 0.05) : 0;
    // the hands behind the dial: the countdown (mirrored) or the time of day (mirrored)
    if (st && st.mode !== 'idle') {
      const q = st.mode === 'done' ? 180 : Math.round(st.frac * 180);
      const flashOn = st.mode === 'done' && st.doneAt !== null && t - st.doneAt < 6 && Math.floor((t - st.doneAt) * 4) % 2 === 0;
      setHands(`timer|${st.mode}|${st.stage}|${q}|${flashOn}`, (hb) => drawDialFace(hb, { frac: q / 180, mode: st.mode, stage: st.stage, flashOn, k: DIAL.r / (1.12 * 0.86) * 0.86, mirror: true }));
    } else {
      const tot = Math.floor(((hours % 12) + 12) % 12 * 60);
      setHands(`tod|${tot}`, (hb) => {
        const k = DIAL.r / 1.12;
        hb.push(M({ at: [0, 0, 0.1], rz: (tot / 720) * TAU, s: k })); hb.prism(HOUR, 0.03, IRON); hb.pop();
        hb.push(M({ at: [0, 0, 0.135], rz: ((tot % 60) / 60) * TAU, s: k })); hb.prism(MINUTE, 0.025, IRON); hb.pop();
        hb.push(M({ at: [0, 0, 0.12], rx: Math.PI / 2 })); hb.cylinder(0.08 * k, 0.08 * k, 0.05, { segments: 8, tones: 'brass' }); hb.pop();
      });
    }
    // walls facing the camera hide (Q / E inside)
    const cam = demo.engine.camera, cx = Math.sin(cam.yaw), cz = Math.cos(cam.yaw);
    for (const w of walls) { const [nx, nz] = w.userData.normal; w.visible = nx * cx + nz * cz < 0.3; }
    info.great = +great.pivot.rotation.z.toFixed(3); info.escape = +escape.pivot.rotation.z.toFixed(3); info.drum = +drum.pivot.rotation.z.toFixed(3);
    info.fly = +fly.rotation.z.toFixed(3); info.pend = +pend.rotation.z.toFixed(3); info.hands = handKey; info.walls = walls.filter((w) => w.visible).map((w) => w.name.slice(21));
  }
  update(0);

  // ---- the walkable area: the stair + the landing have height (raw.heightAt, world x / z)
  const heightAt = (x, z) => {
    const lx = x - O.x, lz = z - O.z;
    if (lz < PLAT.z1 + 0.02) return PLAT.y;
    if (lx > STAIR.x0 - 0.05 && lz <= STAIR.z1) {
      const k = Math.min(STAIR.steps, Math.max(0, Math.floor(((STAIR.z1 - lz) / (STAIR.z1 - STAIR.z0)) * STAIR.steps + 0.5)));
      return (k / STAIR.steps) * PLAT.y;
    }
    return 0;
  };
  const wx = (x) => O.x + x, wz = (z) => O.z + z;
  const colliders = [
    // the landing's front (a 1.2 m drop / wall) from the west wall to the stair
    { x0: wx(-W / 2), z0: wz(PLAT.z1 - 0.06), x1: wx(STAIR.x0), z1: wz(PLAT.z1 + 0.1), tag: 'landing-rail' },
    // the stair's open side (balustrade), open at the bottom two steps
    { x0: wx(STAIR.x0 - 0.06), z0: wz(STAIR.z0), x1: wx(STAIR.x0 + 0.08), z1: wz(STAIR.z1 - 0.65), tag: 'balustrade' },
    // the movement's cage on the landing
    { x0: wx(CAGE.x0 - 0.1), z0: wz(CAGE.z0 - 0.1), x1: wx(CAGE.x1 + 0.1), z1: wz(CAGE.z1 + 0.15), tag: 'movement' },
    // the gallows post, the pendulum bob's swing, the bell rope, the workbench, the ladder
    { x: wx(PEND.x - 0.35), z: wz(PLAT.z1 - 0.12), r: 0.12, tag: 'gallows' },
    { x0: wx(PEND.x - 0.5), z0: wz(PEND.z - 0.2), x1: wx(PEND.x + 0.5), z1: wz(PEND.z + 0.2), tag: 'pendulum' },
    { x: wx(ROPE.x), z: wz(ROPE.z), r: 0.1, tag: 'bell-rope' },
    { cx: wx(-3.2), cz: wz(1.3), w: 1.0, d: 1.6, tag: 'workbench' },
    { cx: wx(3.35), cz: wz(-2.4), w: 0.6, d: 0.3, tag: 'ladder' },
  ];
  return {
    name: 'The Clocktower', group: root, space: 'world',
    floor: { x0: wx(-W / 2), z0: wz(-D / 2), x1: wx(W / 2), z1: wz(D / 2) },
    colliders,
    spawn: { x: wx(0), z: wz(1.8), facing: Math.PI },
    exit: { x: wx(0), z: wz(2.5), r: 0.45, normal: [0, 1] },
    camera: { target: [wx(0), 0, wz(-3.95)], viewHeight: 7.6, yaw: 0 },
    origin: { x: wx(0), z: wz(0) },
    visitPoint: { x: wx(0.5), z: wz(-1.4) },
    lights,
    nightAmbient: { lit: '#F0D4A0', sh: '#A08A74', k: 0.6, gain: 1.2, mist: 0.25, litK: 0.4 },
    heightAt,
    update: (t) => update(t),
    setTimeOfDay() {},
    parts: { great, second, escape, drum, pinion, anchor, fly, pend, rope, walls },
    info,
    dispose() { offBell?.(); },
  };
}

export async function createTowerInterior(demo) {
  const player = demo.player, interiors = player?.interiors;
  if (!interiors?.register) throw new Error('tower interior: the player has no interiors.register (interior.js pass-B hook)');
  let raw = null;
  interiors.register('clocktower', (engine) => (raw = buildTowerRoom(engine, demo)));
  // build it now (behind the loading screen: the geometry is ready before anyone walks in)
  const room = await interiors.get('clocktower');
  // the shader warm-up (main.js: the spawn view + the whole town at viewHeight 45) never sees x 650: the room stands on
  // the square (hidden by the loading screen) for those frames, so the first visit compiles nothing (a first cottage
  // visit compiled 1 unnamed + its own programs: docs/DEMO.md §4.9); back at its origin on 'ready'
  const home = room.group.position.clone();
  if (!demo.engine.capture && (demo.params?.get('in') ?? '') !== 'clocktower') {
    room.group.position.set(22.5 - 0, 0, 24);
    room.group.visible = true;
    room.group.updateMatrixWorld(true);
    demo.events.on('ready', () => { room.group.position.copy(home); room.group.visible = room.shown; room.group.updateMatrixWorld(true); });
  }
  // The sun's shadow map renders in the frame's FIRST renderer.render(): in town that is a preRender pass (lights not
  // set up: the characters' 'char-depth-snap' depth program is built with 0 lights), inside a room (the town parked)
  // it is the colour pass (1 dir + 12 point lights): a SECOND variant of that program, linked on the first visit of any
  // interior (house-8 too; measured: programs +1, an unnamed 'depth ... char-depth-snap'). One extra boot render
  // without the preRender passes builds it behind the loading screen: entering the tower compiles nothing.
  if (!demo.engine.capture) {
    const engine = demo.engine, pipe = engine.pipeline, r = engine.renderer;
    if (pipe?.rtScene) {
      const prevRT = r.getRenderTarget(), ac = r.autoClear;
      try {
        engine.camera.update(); engine._updateSun?.();
        r.shadowMap.needsUpdate = true;
        engine.uniforms.uPassMode.value = 0;
        r.setRenderTarget(pipe.rtScene); r.autoClear = false;
        r.render(engine.scene, engine.camera.cam);   // the colour pass alone, its shadow map first: the lit variant
      } catch (e) { console.warn('[passB] room shadow warm-up:', e); }
      finally { r.setRenderTarget(prevRT); r.autoClear = ac; }
    }
  }
  if ((demo.params?.get('in') ?? '') === 'clocktower') await player.enter('clocktower', { instant: true });
  // the landing has height: interior.js reads room.floorY for the floor of the room (the game UI's 'you are here' ring
  // and labels); here it is the height under the player (raw.heightAt), so they stand on the stair / the landing too
  Object.defineProperty(room, 'floorY', { configurable: true, get: () => (raw ? raw.heightAt(player.position.x, player.position.z) : 0) });
  const api = {
    room, origin: ORIGIN,
    get raw() { return raw; },
    get inside() { return player.location === 'clocktower'; },
    enter: (o) => player.enter('clocktower', o),
    leave: (o) => player.leave(o),
    info: () => ({ built: !!room, inside: player.location === 'clocktower', kit: room?.stub ? 'stub' : 'passB', lights: room?.lights?.length ?? 0, parts: raw?.info ?? null }),
  };
  return api;
}
