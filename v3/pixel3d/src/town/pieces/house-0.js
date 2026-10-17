// house-0 — "Stargazer's Tower" (owner: house-0 agent). docs/TOWN.md §4 (API), §6 (scale), §10 (rubric).
//
// DESIGN NOTE (from pipgws packages/assets/scripts/houses/house-0.ts, the v1 identity):
//   Signature shape: a ROUND warm-rubble tower-house under a tall, flared, VIOLET fish-scale witch-hat cone, crowned
//   by a brass crescent-moon-and-star finial, a brass telescope poking up-right out of a little lucarne on the
//   cone. The tallest silhouette at the left end of the top row (ridge <= 8.5 m) - nothing else in town is a
//   round tower with a cone, so it reads at 25 % size. Low companions keep the v1 asymmetry: a stone lean-to
//   with a woodpile on the LEFT, a half-timbered chimney wing on the RIGHT (style hint: chimney right).
//   Palette rows (TOWN.md §3): walls = a paintRamp of the v1 WARM_RUBBLE hex (#736457, warm grey-brown, cool
//   slate shadow), ashlar (door surround, plinth, sills), daub + timber (wing), roofs plum (cone, v1
//   PURPLE_SLATE) + slate (wings, bay hood), brass (finial, telescope), iron (rod, lantern), leaf (ivy, box),
//   v1 door/shutter paint #2f4f63 as paintRamp (teal-blue arched door), flowers white / violet / red.
//   Key details: projecting stone entrance bay with a pointed-arch ashlar surround + keystone, a slate gablet
//   hood and a brass moon roundel; arched first-floor window, a stair slit, an oculus and the lucarne on the
//   cone; machicolated corbel crown under the eave; ivy on the lit (left) flank; woodpile; water butt; two door pots.
//   At 640x360 it must read as: "the round tower with the purple witch hat and the moon on top, with a telescope".
//   Animation: the telescope sweeps the sky in stepped poses (pure f(t), 4 fps transitions).
import * as THREE from 'three';
import * as kit from '../kit.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { toWorld } from '../api.js';

const { Builder, M } = kit;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------- dimensions (local)
// local frame = frameOf(record): footprint centre at the origin, +z = south (door side), x -2.5..2.5, z -2..2
const R = 1.45;                 // tower radius (16-gon vertex radius)
const SEG = 16;
const AP = R * Math.cos(Math.PI / SEG);   // apothem (flat face distance)
const CZ = -0.15;               // tower centre z (set back: leaves a 0.5 m vestibule behind the door)
const TH = 5.3;                 // tower wall top (tall drum: >= 2 m of stone shows above the wings)
const BZ = 1.88;                // entrance bay front face
const BAYW = 1.8;               // entrance bay width
const BAYH = 2.4;               // entrance bay eave
const DW = 0.94, DH = 2.05, HOLE_H = 2.12;   // door leaf / hole
const CONE_EAVE_R = 1.8, CONE_EAVE_Y = TH + 0.04, CONE_KNEE_R = 1.56, CONE_KNEE_Y = TH + 0.3, APEX = 7.55;
const HB = 1.33;                // vestibule back (hall) plane, just in front of the tower face

const STONE = paintRamp('#736457', { lightness: 0.5 });   // v1 WARM_RUBBLE, lifted (warm light, cool shadow)
const PAINT = paintRamp('#2f4f63');                         // v1 house-0 door + shutters (teal-blue)

/** Frame on the tower face whose outward normal has yaw a (0 = +z), at distance d from the tower axis. */
const onTower = (a, d = AP, y = 0) => M({ at: [Math.sin(a) * d, y, CZ + Math.cos(a) * d], ry: a });
/** Cone radius at height y (straight part). */
const coneR = (y) => CONE_KNEE_R * (APEX - y) / (APEX - CONE_KNEE_Y);
/** Current-frame position of a local point (resolved through the Builder's matrix stack). */
const localOf = (builder, v) => v.clone().applyMatrix4(builder.matrix);

export default function build(engine, ctx) {
  const rec = ctx.record, fr = kit.frameOf(rec);
  const rand = ctx.rng;
  const b = new Builder(engine, { name: rec.id });
  const windows = [];            // {pos (local), id}
  const lights = [];

  // ------------------------------------------------------------------------------------------ tower body
  b.cylinder(R + 0.08, R + 0.08, 0.42, { segments: SEG, at: [0, -0.08, CZ], tones: 'ashlar', pattern: 'ashlar', scale: 1.3 });   // plinth
  b.cylinder(R, R, TH, { segments: SEG, at: [0, 0, CZ], tones: STONE, pattern: 'ashlar' });
  b.cylinder(R + 0.05, R + 0.05, 0.1, { segments: SEG, at: [0, 3.15, CZ], tones: 'ashlar', pattern: 'none' });                  // string course
  // machicolation crown: a projecting stone parapet band on a ring of corbels (each casts a 1-texel shadow below)
  b.cylinder(R + 0.17, R + 0.17, 0.3, { segments: SEG, at: [0, TH - 0.26, CZ], tones: 'ashlar', pattern: 'none', tint: 0.98 });
  for (let i = 0; i < SEG; i++) {
    const a = (i * 2 * Math.PI) / SEG;
    b.push(onTower(a, AP, TH - 0.56)); b.box(0.15, 0.3, 0.17, { tones: 'ashlar', pattern: 'none', tint: 0.95, at: [0, 0, 0.085] }); b.pop();
  }

  // ------------------------------------------------------------------------------------------ the cone (stepped, flared)
  const coneOpt = { tones: 'plum', pattern: 'scales', scale: 1.15 };
  {                                                              // ONE lathe (kick + spire share their ring: no stray crease lines)
    const g = new THREE.LatheGeometry([new THREE.Vector2(CONE_EAVE_R, CONE_EAVE_Y), new THREE.Vector2(CONE_KNEE_R, CONE_KNEE_Y),
      new THREE.Vector2(0.001, APEX)], SEG, Math.PI / SEG);
    b.add(g, M({ at: [0, 0, CZ] }), coneOpt);
    g.dispose();
  }
  b.cylinder(CONE_EAVE_R, CONE_EAVE_R - 0.02, 0.08, { segments: SEG, at: [0, CONE_EAVE_Y - 0.08, CZ], tones: 'plum', tint: 0.94 });   // eave lip
  // finial: iron rod, brass knop, crescent moon + star (faces the square)
  // (sized to read at 640x360: crescent ~0.36 m radius, star ~0.2 m, 0.12 m deep so each gets a lit face + outline)
  const MOON_Y = APEX + 0.55;
  b.cylinder(0.04, 0.04, 0.3, { segments: 8, at: [0, APEX - 0.08, CZ], tones: 'iron' });
  b.add(new THREE.SphereGeometry(0.11, 8, 6), M({ at: [0, APEX + 0.2, CZ] }), { tones: 'brass' });                       // knop
  const moon = [];
  for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.3 + (1.4 * i) / 12); moon.push([Math.cos(a) * 0.36, Math.sin(a) * 0.36]); }
  for (let i = 12; i >= 0; i--) { const a = Math.PI * (0.42 + (1.16 * i) / 12); moon.push([0.15 + Math.cos(a) * 0.26, Math.sin(a) * 0.26]); }
  b.prism(moon, 0.12, { tones: 'brass', at: [-0.06, MOON_Y, CZ] });
  const star = [];
  for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 + Math.PI / 2, r = i % 2 ? 0.085 : 0.2; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
  b.prism(star, 0.12, { tones: 'brass', tint: 1.05, at: [0.25, MOON_Y + 0.02, CZ + 0.02] });

  // ------------------------------------------------------------------------------------------ lucarne + oculus on the cone
  const LUC_A = 0.62, LUC_Y = 6.0;                // front-right
  b.push(M({ at: [0, 0, CZ], ry: LUC_A }));
  const lf = coneR(LUC_Y) + 0.12;                // lucarne face distance from the axis
  b.box(0.62, 0.62, 0.9, { tones: STONE, pattern: 'none', at: [0, LUC_Y - 0.06, lf - 0.45] });
  kit.window_(b, { at: [0, LUC_Y + 0.26, lf], w: 0.32, h: 0.36, panes: [2, 1], sill: false, frame: 'timber' });
  windows.push({ id: 'lucarne', pos: localOf(b, V3(0, LUC_Y + 0.26, lf + 0.3)) });
  {                                              // its little gable roof: two clean slabs (no courses at this size)
    const ey = LUC_Y + 0.52, ry = LUC_Y + 0.92, zb = lf - 0.95, zf = lf + 0.1;
    b.prism([[-0.31, LUC_Y + 0.56], [0.31, LUC_Y + 0.56], [0, ry - 0.03]], 0.95, { tones: STONE, at: [0, 0, lf - 0.475] });
    for (const sd of [-1, 1]) {
      const c = [];
      for (let i = 0; i < 8; i++) c.push(V3((i & 4) ? 0 : sd * 0.43, ((i & 4) ? ry : ey) + ((i & 2) ? 0.07 : 0), (i & 1) ? zf : zb));
      b.hexa(c, { tones: 'plum', pattern: 'none', tint: sd < 0 ? 1.03 : 1 });
    }
  }
  const scopeAt = localOf(b, V3(0.04, LUC_Y + 0.2, lf + 0.02));
  b.box(0.08, 0.16, 0.14, { tones: 'iron', at: [0.04, LUC_Y - 0.08, lf + 0.02] });                // iron yoke on the sill
  b.box(0.2, 0.04, 0.18, { tones: 'iron', tint: 0.94, at: [0.04, LUC_Y - 0.1, lf + 0.02] });
  b.pop();
  const OC_A = -0.55, OC_Y = 5.82;               // oculus, front-left, low on the cone
  const of = coneR(OC_Y) + 0.1;
  b.push(M({ at: [Math.sin(OC_A) * of, OC_Y, CZ + Math.cos(OC_A) * of], ry: OC_A }));
  b.box(0.44, 0.42, 0.6, { tones: STONE, pattern: 'none', at: [0, -0.21, -0.3] });
  b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8), M({ at: [0, 0, 0.0], rx: Math.PI / 2 }), { tones: 'cream' });
  b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), M({ at: [0, 0, 0.02], rx: Math.PI / 2 }), { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1] });
  b.hexa([V3(-0.27, 0.2, -0.3), V3(0.27, 0.2, -0.3), V3(-0.27, 0.32, -0.3), V3(0.27, 0.32, -0.3),
    V3(-0.27, 0.16, 0.12), V3(0.27, 0.16, 0.12), V3(-0.27, 0.21, 0.12), V3(0.27, 0.21, 0.12)], { tones: 'plum', pattern: 'none' });
  windows.push({ id: 'oculus', pos: localOf(b, V3(0, 0, 0.3)) });
  b.pop();

  // ------------------------------------------------------------------------------------------ tower windows
  b.push(onTower(-Math.PI / 8));                 // tall arched first-floor window, front-left face
  kit.window_(b, { at: [0, 3.95, 0], w: 0.4, h: 0.82, panes: [2, 2], arch: true, frame: 'ashlar', sillTones: 'ashlar' });
  windows.push({ id: 'arch', pos: localOf(b, V3(0, 3.95, 0.3)) });
  b.pop();
  b.push(onTower(Math.PI / 8));                  // stair slit, front-right face, above the bay hood
  kit.window_(b, { at: [0.02, 3.55, 0], w: 0.1, h: 0.42, panes: [1, 1], frame: 'ashlar', bar: 0.05, sill: false });
  kit.window_(b, { at: [0.02, 4.4, 0], w: 0.1, h: 0.36, panes: [1, 1], frame: 'ashlar', bar: 0.05, sill: false });   // upper turn of the stair
  windows.push({ id: 'slit', pos: localOf(b, V3(0, 3.55, 0.3)) });
  b.pop();
  b.push(onTower(Math.PI));                      // back window (turntables)
  kit.window_(b, { at: [0, 3.5, 0], w: 0.4, h: 0.6, panes: [2, 2], frame: 'ashlar' });
  windows.push({ id: 'back', pos: localOf(b, V3(0, 3.5, 0.3)) });
  b.pop();
  b.push(onTower(-Math.PI / 2));                 // west window (lit flank, iso / turntables)
  kit.window_(b, { at: [0, 3.0, 0], w: 0.36, h: 0.5, panes: [1, 2], frame: 'ashlar' });
  b.pop();

  // ------------------------------------------------------------------------------------------ entrance bay
  const hx = BAYW / 2;
  const WT = BZ - HB;                            // front wall = the whole vestibule depth (deep reveals)
  b.box(BAYW, BAYH, HB - 0.45, { tones: STONE, pattern: 'ashlar', at: [0, 0, (0.45 + HB) / 2] });     // core
  kit.wallWithOpenings(b, { x0: -hx, x1: hx, y1: BAYH, z0: BZ, thick: WT, openings: [{ x: 0, y: 0, w: DW + 0.01, h: HOLE_H }], tones: STONE, pattern: 'ashlar' });
  b.box(BAYW + 0.12, 0.3, BZ - 0.45 + 0.06, { tones: 'ashlar', pattern: 'none', at: [0, -0.08, (0.45 + BZ + 0.06) / 2] });   // plinth
  // pointed-arch surround (horseshoe) + spandrels inside the hole + keystone
  const w2 = DW / 2, s = DH - 0.3 * DW, o = 0.15;
  const arch = (dx, dy) => [[-w2 - dx, s], [-0.3 * DW - dx * 0.85, DH - 0.08 * DW + dy * 0.7], [0, DH + dy], [0.3 * DW + dx * 0.85, DH - 0.08 * DW + dy * 0.7], [w2 + dx, s]];
  const outer = arch(o, o + 0.02), inner = arch(0, 0);
  b.prism([[-w2 - o, 0], ...outer, [w2 + o, 0], [w2, 0], ...inner.slice().reverse(), [-w2, 0]], 0.1, { tones: 'ashlar', pattern: 'none', at: [0, 0, BZ + 0.03] });
  b.prism([...inner, [w2 + 0.005, HOLE_H], [-w2 - 0.005, HOLE_H]], WT - 0.01, { tones: STONE, pattern: 'none', at: [0, 0, (BZ + HB) / 2] });
  b.box(0.16, 0.22, 0.14, { tones: 'ashlar', pattern: 'none', tint: 1.04, at: [0, DH + 0.06, BZ + 0.05] });
  b.box(DW + 0.02, DH + 0.1, 0.02, { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2, at: [0, 0, HB + 0.01] });   // dark hall
  b.box(DW + 0.2, 0.06, 0.3, { tones: 'ashlar', pattern: 'none', at: [0, 0, BZ - 0.1] });                                             // threshold
  // inside the open door: dark flags, the first two steps of the spiral stair (right), a pinned star chart (left)
  b.box(DW, 0.04, BZ - 0.25 - HB, { tones: '#3E3038', pattern: 'none', at: [0, 0, (HB + BZ - 0.25) / 2] });
  b.box(0.42, 0.2, 0.3, { tones: 'ashlar', pattern: 'none', tint: 0.9, at: [0.25, 0, HB + 0.15] });
  b.box(0.42, 0.2, 0.15, { tones: 'ashlar', pattern: 'none', tint: 0.86, at: [0.25, 0.2, HB + 0.085] });
  b.box(0.07, 1.85, 0.07, { tones: 'timber', pattern: 'none', at: [0.07, 0, HB + 0.3] });                                   // newel post
  b.box(0.28, 0.34, 0.02, { tones: 'cream', pattern: 'none', tint: 0.94, at: [-0.2, 1.05, HB + 0.03] });
  for (const [sx, sy] of [[-0.27, 1.32], [-0.16, 1.24], [-0.22, 1.14], [-0.11, 1.12]]) b.box(0.04, 0.04, 0.02, { tones: '#4A5A86', at: [sx, sy, HB + 0.045] });
  // gablet hood over the bay (the cross gable) + brass moon roundel in its gable
  kit.gableRoof(b, { x: 0, z: (0.4 + BZ) / 2, w: BZ - 0.4, d: BAYW, eave: BAYH, ridge: BAYH + 0.72, axis: 'z', kind: 'slate', overhang: 0.18,
    gableOverhang: 0.16, gable: STONE, gablePattern: 'none', seed: ctx.seed + 1 });
  b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 8), M({ at: [0, BAYH + 0.24, BZ + 0.02], rx: Math.PI / 2 }), { tones: PAINT });
  b.prism(moon.map(([x, y]) => [x * 0.55, y * 0.55]), 0.03, { tones: 'brass', at: [0, BAYH + 0.24, BZ + 0.055] });
  // doorstep + mat (door tile: z 2..2.4 max)
  kit.steps(b, { at: [0, 0, BZ], w: 1.25, count: 1, rise: 0.11, run: 0.3, tones: 'ashlar' });
  b.box(0.8, 0.02, 0.18, { tones: 'thatch', pattern: 'none', tint: 0.94, at: [0, 0, 2.28] });
  // wall lantern right of the door (bay face)
  lights.push(kit.lantern(b, { at: [0.727, 2.013, BZ] }));
  // door pots (persona: pots / twopots)
  for (const [px, c] of [[-0.78, TOWN_PALETTE.flowerViolet], [0.8, TOWN_PALETTE.flowerWhite]]) {
    b.cylinder(0.12, 0.15, 0.24, { segments: 8, at: [px, 0, BZ + 0.2], tones: 'brick' });
    b.box(0.22, 0.1, 0.22, { tones: 'leaf', layer: 'soft', at: [px, 0.22, BZ + 0.2] });
    b.box(0.08, 0.08, 0.08, { tones: c, layer: 'soft', at: [px - 0.04, 0.3, BZ + 0.24] });
    b.box(0.07, 0.07, 0.07, { tones: c, layer: 'soft', at: [px + 0.06, 0.28, BZ + 0.15] });
  }

  // ------------------------------------------------------------------------------------------ left lean-to (stone, woodpile)
  const LX0 = -2.42, LX1 = -0.95, LZ0 = -1.3, LZ1 = 1.0, LE = 1.7, LR = 2.42;
  b.box(LX1 - LX0 + 0.12, 0.3, LZ1 - LZ0 + 0.12, { tones: 'ashlar', pattern: 'none', at: [(LX0 + LX1) / 2, -0.08, (LZ0 + LZ1) / 2] });
  b.box(LX1 - LX0, LE, LZ1 - LZ0, { tones: STONE, pattern: 'rubble', at: [(LX0 + LX1) / 2, 0, (LZ0 + LZ1) / 2] });
  kit.gableRoof(b, { x: LX1, z: (LZ0 + LZ1) / 2, w: LZ1 - LZ0, d: 2 * (LX1 - LX0), eave: LE, ridge: LR, axis: 'z', sides: [-1], kind: 'slate',
    overhang: 0.2, gableOverhang: 0.16, gable: STONE, gablePattern: 'rubble', ridgeCap: false, seed: ctx.seed + 2 });
  kit.window_(b, { at: [-1.75, 1.15, LZ1], w: 0.42, h: 0.42, panes: [2, 2], shutters: PAINT, frame: 'cream' });
  windows.push({ id: 'leanto', pos: V3(-1.75, 1.15, LZ1 + 0.3), light: V3(-1.75, 0.85, LZ1 + 1.3) });
  // woodpile against the lean-to front: log ends facing the square + a chopping block with an axe
  const logR = 0.09;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) {
    const lx = -2.3 + row * 0.1 + i * 0.2, ly = logR + row * 0.17;
    if (lx > -1.2) continue;
    b.add(new THREE.CylinderGeometry(logR, logR, 0.4, 8), M({ at: [lx, ly, LZ1 + 0.21], rx: Math.PI / 2 }), { tones: 'plank', tint: [1, 0.96, 1.04][(i + row) % 3] });
    b.add(new THREE.CylinderGeometry(logR * 0.55, logR * 0.55, 0.42, 8), M({ at: [lx, ly, LZ1 + 0.21], rx: Math.PI / 2 }), { tones: 'thatch', tint: 0.96 });
  }
  b.cylinder(0.17, 0.18, 0.3, { segments: 8, at: [-1.0, 0, 1.55], tones: 'plank' });       // chopping block
  b.box(0.06, 0.06, 0.42, { tones: 'timber', at: [-0.98, 0.32, 1.48], rx: -0.6 });          // axe haft
  b.box(0.05, 0.14, 0.16, { tones: 'iron', at: [-0.98, 0.3, 1.62] });

  // ------------------------------------------------------------------------------------------ right wing (half-timbered, chimney)
  const WX0 = 0.95, WX1 = 2.42, WZ0 = -1.35, WZ1 = 1.45, WE = 2.1, WR = 3.0;
  b.box(WX1 - WX0 + 0.12, 0.3, WZ1 - WZ0 + 0.12, { tones: 'ashlar', pattern: 'none', at: [(WX0 + WX1) / 2, -0.08, (WZ0 + WZ1) / 2] });
  b.box(WX1 - WX0, WE, WZ1 - WZ0, { tones: 'daub', pattern: 'plaster', tint: 1.06, at: [(WX0 + WX1) / 2, 0, (WZ0 + WZ1) / 2] });
  kit.timbers(b, { x0: WX0, x1: WX1, y0: 0.237, y1: WE, z: WZ1, posts: [WX1 - 0.06, 1.12], rails: [0.34, 0.95, WE], braces: [[1.18, 0.95, 1.5, WE - 0.06]] });
  b.push(M({ at: [WX1, 0, (WZ0 + WZ1) / 2], ry: Math.PI / 2 }));       // east gable wall framing
  kit.timbers(b, { x0: -(WZ1 - WZ0) / 2, x1: (WZ1 - WZ0) / 2, y0: 0.237, y1: WE, z: 0, posts: [-(WZ1 - WZ0) / 2 + 0.06, 0, (WZ1 - WZ0) / 2 - 0.06], rails: [0.34, 1.1, WE],
    braces: [[0.08, 1.1, (WZ1 - WZ0) / 2 - 0.1, WE - 0.07], [0.08, 0.34, (WZ1 - WZ0) / 2 - 0.1, 1.1 - 0.07]] });
  kit.window_(b, { at: [-0.6, 1.45, 0], w: 0.4, h: 0.5, panes: [2, 2], frame: 'cream' });
  b.pop();
  b.push(M({ at: [(WX0 + WX1) / 2, 0, WZ0], ry: Math.PI }));          // back (north) wall: framing + a small window
  kit.timbers(b, { x0: -(WX1 - WX0) / 2, x1: (WX1 - WX0) / 2, y0: 0.237, y1: WE, z: 0, posts: [-(WX1 - WX0) / 2 + 0.06, (WX1 - WX0) / 2 - 0.25], rails: [0.34, WE] });
  kit.window_(b, { at: [-0.1, 1.55, 0], w: 0.4, h: 0.46, panes: [2, 2], frame: 'cream', shutters: PAINT });
  b.pop();
  kit.gableRoof(b, { x: (WX0 + WX1) / 2 - 0.1, z: (WZ0 + WZ1) / 2, w: WX1 - WX0 + 0.2, d: WZ1 - WZ0, eave: WE, ridge: WR, axis: 'x', kind: 'slate',
    overhang: 0.22, gableOverhang: 0.16, gable: 'daub', seed: ctx.seed + 4 });
  kit.window_(b, { at: [1.8, 1.413, WZ1], w: 0.5, h: 0.54, panes: [2, 2], shutters: PAINT, frame: 'cream' });
  windows.push({ id: 'wing', pos: V3(1.8, 1.4, WZ1 + 0.3), light: V3(1.8, 0.85, WZ1 + 1.3) });
  // a bundle of drying herbs hung under the wing eave, beside the door bay (soft layer: no cream rims)
  for (const [hx2, c] of [[1.1, 'leaf']]) {
    b.box(0.03, 0.14, 0.03, { tones: 'thatch', at: [hx2, WE - 0.16, WZ1 + 0.12] });
    b.box(0.13, 0.26, 0.1, { tones: c, layer: 'soft', tint: 0.96, at: [hx2, WE - 0.42, WZ1 + 0.12] });
    b.box(0.093, 0.085, 0.07, { tones: TOWN_PALETTE.flowerViolet, layer: 'soft', at: [hx2, WE - 0.487, WZ1 + 0.17] });
  }
  kit.flowerBox(b, { at: [1.8, 0.98, WZ1], w: 0.72, seed: ctx.seed, colors: [TOWN_PALETTE.flowerWhite, TOWN_PALETTE.flowerViolet, TOWN_PALETTE.flowerWhite, TOWN_PALETTE.flowerRed] });
  const smoke = kit.chimney(b, { at: [1.95, -0.75], base: WE - 0.2, top: 5.0, w: 0.55, d: 0.5, tones: STONE, pattern: 'ashlar', pots: 1 });
  // water butt at the wing corner
  b.cylinder(0.27, 0.27, 0.72, { segments: 8, at: [2.15, 0, 1.86], tones: 'plank', pattern: 'vboards', scale: 0.5 });
  for (const hy of [0.12, 0.56]) b.cylinder(0.31, 0.31, 0.05, { segments: 8, at: [2.15, hy, 1.86], tones: 'iron' });
  b.cylinder(0.25, 0.25, 0.02, { segments: 8, at: [2.15, 0.7, 1.86], tones: 'blue', tint: 0.94 });

  // ------------------------------------------------------------------------------------------ ivy on the lit (west) flank
  for (const [a, top] of [[-Math.PI * 0.375, 4.0], [-Math.PI * 0.25, 2.9], [-Math.PI * 0.5, 3.4]]) {
    b.push(onTower(a, AP + 0.02));
    for (let y = 0.3; y < top; y += 0.24) {          // few, big clusters (>= 6 texels) a texel proud of the wall
      const reach = 0.2 - (y / top) * 0.1;
      for (let k = 0; k < 2; k++) {
        if (rand() < 0.3 + y / (top * 3)) continue;
        const u = (rand() - 0.5) * 2 * reach - 0.06;
        b.box(0.23, 0.21, 0.08, { tones: 'leaf', layer: 'soft', tint: [0.97, 1.03][k], at: [u, y, 0.055] });
      }
    }
    b.pop();
  }

  // ------------------------------------------------------------------------------------------ emit
  const group = b.build();
  const dr = kit.door(engine, { w: DW, h: DH, kind: 'arched', tones: PAINT, hinge: 'left', name: `${rec.id}-door` });
  dr.pivot.position.set(-DW / 2, 0.06, BZ - 0.08);
  group.add(dr.pivot);
  // ~88 deg swing with the hinge stepping 2 texels off the jamb as it opens: the leaf's teal edge stays visible
  // against the left reveal instead of vanishing into the stone (kit.door swings 100 deg about the jamb line).
  const openDoor = (f) => {
    const k = Math.max(0, Math.min(1, f));
    dr.open(k * 0.88);
    dr.pivot.position.x = -DW / 2 + 0.07 * Math.min(1, k * 2.5);
  };

  // telescope (separate tiny mesh, stepped sweeps)
  const sb = new Builder(engine, { name: `${rec.id}-scope` });
  // tapered brass tube (r 0.09 eyepiece -> 0.12 objective), a mid band, a darker dew shield, iron eyepiece
  sb.add(new THREE.CylinderGeometry(0.12, 0.09, 0.9, 8), M({ at: [0.45, 0, 0], rz: -Math.PI / 2 }), { tones: 'brass' });
  sb.add(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 8), M({ at: [0.42, 0, 0], rz: -Math.PI / 2 }), { tones: 'brass', tint: 0.92 });
  sb.add(new THREE.CylinderGeometry(0.15, 0.15, 0.15, 8), M({ at: [0.96, 0, 0], rz: -Math.PI / 2 }), { tones: 'brass', tint: 0.9 });
  sb.add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), M({ at: [-0.05, 0, 0], rz: -Math.PI / 2 }), { tones: 'iron' });
  const scope = sb.build();
  const scopePivot = new THREE.Group(); scopePivot.name = `${rec.id}-scope-pivot`;
  scopePivot.position.copy(scopeAt);
  scopePivot.add(scope);
  group.add(scopePivot);
  const POSES = [[0.15, 0.5], [0.45, 0.62], [-0.1, 0.72], [0.3, 0.42], [0.6, 0.55]];   // [yaw, elevation]
  const pose = (yaw, el) => { scopePivot.rotation.set(0, LUC_A - 0.55 + yaw, el, 'YXZ'); };
  pose(...POSES[0]);
  const update = (t) => {
    const P = 7, n = POSES.length;                 // a new star every 7 s; the move takes 3 steps at 4 fps
    const i = Math.floor(t / P), ph = t - i * P;
    const a = POSES[((i % n) + n) % n], c = POSES[(((i + 1) % n) + n) % n];
    const step = ph < P - 0.75 ? 0 : Math.min(3, Math.floor((ph - (P - 0.75)) * 4) + 1);
    const f = step / 3;
    pose(a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f);
  };

  fr.apply(group);
  const W3 = (v) => toWorld(group, v);
  const glass = group.children.find((o) => o.userData.layer === 'glass');
  const wins = windows.map((w) => ({ id: `${rec.id}-${w.id}`, pos: W3(w.pos), mesh: glass }));
  // window lights sit ~0.7 m out from the ground-floor glass, low, short reach: they pool on the lane, never paint
  // discs on the drum or cone (upper windows and the lucarne rely on their emissive glass alone)
  return {
    group,
    update,
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot: dr.pivot, open: openDoor }],
      chimneys: [W3(smoke)],
      windows: wins,
      lights: [
        // the door lantern's light drops 0.45 m and steps 0.5 m out onto the path with a 1.9 m reach (kit default 3 m
        // painted a disc on the drum above the bay hood)
        ...lights.map((l) => ({ ...l, pos: W3(l.pos.clone().add(V3(0, -0.45, 0.5))), r: 1.9 })),
        ...windows.filter((w) => w.light).map((w) => ({ pos: W3(w.light), color: TOWN_PALETTE.glow[1], r: 1.2, kind: 'window' })),
      ],
      perches: [
        W3(V3(-0.06, MOON_Y + 0.37, CZ)),              // on the moon finial (the crow's favourite)
        W3(V3(1.95, 5.25, -0.75)),                      // chimney pot
        W3(V3(WX1 + 0.1, WR + 0.12, (WZ0 + WZ1) / 2)), // wing ridge end
        W3(V3(-2.2, LE + 0.2, 0)),                     // lean-to roof
      ],
      spots: { door: W3(V3(0, 0, 2.6)), woodpile: W3(V3(-1.8, 0, 1.7)), butt: W3(V3(2.15, 0, 2.3)) },
    },
    api: {
      setDoor: openDoor,
      setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && kit.setGlowLit(o, on)),
      setScope: (yaw, el) => pose(yaw, el),
    },
    stats: { scopePoses: POSES.length },
  };
}
