// house-4 interior: Mossbank Cottage (owner: interiors builder, houses 0-4; lore pass 2026-10-16). docs/INTERIORS.md,
// docs/LORE.md row 4.
// An old gardener who writes letters to a daughter who never came back. A LOW earth-sheltered cabin (2.35 m) with
// the back corners CUT AWAY into the bank - earthen daub over a fieldstone footing, a beaten-earth floor with stepping
// flags, two low beams running front-to-back, ROOTS breaking through the back wall and creeping over the floor, ivy
// round two small deep windows that let in green light. The hearth sits in the left cut corner. Story props:
//   - the GRANDFATHER CLOCK, stopped at 11:55, its pendulum hanging still; beside it the calendar with THE CIRCLED
//     DATE and, above, a frame of pressed nightshade
//   - the SEED JARS on their shelves, every one labelled (a villager's name each); one jar lies tipped over, empty
//   - the table: a tall stack of UNSENT LETTERS tied with red string, one more half-written, ink, a candle and a
//     small portrait of a girl
//   - the rocking chair by the hearth (it rocks, stepped), seedlings on the sill, a watering can, the lantern
// Ambiance: green-filtered light - the sun only reaches the room DAPPLED through an ivy canopy (a shadow-only mask with
// leaf-shaped holes), the two windows throw a green fill, the daub is moss-stained; the warm hearth; pollen drifting;
// earthy browns; tender, melancholy.
import * as THREE from 'three';
import { Builder } from '../kit.js';
import { rng } from '../../core/noise.js';
import { bareShell, polyWalls, polyFloor, blockOutside, inPoly, onSeg, segPoint, motes, at, sunMask, ditherCanvas, ditherWall, flatQuad } from './house-0.js';

/** Room size / walls (index.js reads ROOM before build): a low, wide, earth-sheltered room. */
export const ROOM = {
  w: 8.6, d: 6.0, h: 2.35, wall: 'stone', pal: 4, floor: 'flags',
  // the demo's room night look (docs/DEMO.md 4.3, once index.js passes it through): earthy browns in the fill, a
  // green cast on the lit faces (moonlight through the ivy), little mist
  nightAmbient: { lit: '#B8D490', sh: '#8E7C5C', k: 0.55, litK: 0.4, gain: 1.15, mist: 0.3 },
};

export default function build(room, ctx) {
  const { FURNITURE: F, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp, POTIONS } = ctx;
  const W = room.W, D = room.D, H = room.H, T = room.T;
  const X = W / 2, Z = D / 2, CX = 2.3, CZ = -1.0;            // the cut corners: back wall x in [-CX, CX], sides from CZ
  const DAUB = paintRamp('#6e744a', { lightness: 0.5 });     // moss-stained daub
  const EARTH = paintRamp('#6e5640', { lightness: 0.42 });
  const RED = paintRamp(TP.flowerRed, { lightness: 0.5 });
  const NIGHTSHADE = paintRamp('#5a3a7a', { lightness: 0.4 });
  const IVYLIGHT = '#A8DC88';
  bareShell(room);

  // ---- the room: hearth corner (left), back wall (window), window corner (right), right, front (door), left
  const V = [
    [-X, CZ],
    [-CX, -Z, { windows: [{ u: 0.55, y: 1.05, w: 0.68, h: 0.72, panes: [2, 2], frame: 'timber', sill: 'plank' }] }],
    [CX, -Z, { windows: [{ u: 0.05, y: 1.0, w: 0.62, h: 0.75, panes: [2, 2], frame: 'timber', sill: 'plank' }] }],
    [X, CZ], [X, Z], [-X, Z],
  ];
  const poly = V.map((p) => [p[0], p[1]]);
  const segs = polyWalls(room, V, {
    dado: 0.85, upper: { tones: DAUB, pattern: 'plaster' }, lower: { tones: 'stone', pattern: 'rubble', scale: 0.85 },
    railTones: null, windowGlow: IVYLIGHT,
  });
  polyFloor(room, poly, { tones: EARTH, pattern: 'rubble', scale: 2.2, lip: 1.1 });
  blockOutside(room, (x, z) => inPoly(poly, x, z));
  const hearthS = segs[0], back = segs[1], winS = segs[2];

  // ---- the hearth in the left cut corner: a fieldstone surround, peat fire, a pot-crane, jars on the mantel
  onSeg(room, hearthS, 0, 0, (b, g) => {
    const w = 1.5, dep = 0.5;
    for (const s of [-1, 1]) b.box(0.38, 1.05, dep, { at: [s * (w / 2 - 0.19), 0, dep / 2], tones: 'stone', pattern: 'rubble', scale: 0.7 });
    b.box(w, 0.26, dep, { at: [0, 0.88, dep / 2], tones: 'stone', pattern: 'rubble', scale: 0.7, tint: 1.03 });
    b.box(w + 0.2, 0.1, dep + 0.14, { at: [0, 1.14, dep / 2 + 0.05], tones: 'timber', pattern: 'none' });
    b.box(w - 0.3, H - 1.24, dep - 0.12, { at: [0, 1.24, (dep - 0.12) / 2], tones: 'stone', pattern: 'rubble', scale: 0.7, tint: 0.96 });
    b.box(w - 0.76, 0.88, 0.06, { at: [0, 0, 0.04], tones: 'crow' });
    b.box(w + 0.4, 0.05, 0.55, { at: [0, 0, dep + 0.26], tones: 'ashlar', pattern: 'ashlar', scale: 0.8 });
    for (let k = 0; k < 4; k++) b.box(0.22, 0.1, 0.14, { at: [-0.18 + (k % 2) * 0.2, 0.04 + Math.floor(k / 2) * 0.1, dep * 0.5], ry: k * 0.3, tones: EARTH });   // peats
    g.box(0.5, 0.05, 0.28, { at: [0, 0.03, dep * 0.5], tones: 'glass', layer: 'glass', glow: GLOW.ember, glowKind: 2 });
    for (const [fx, fh, c] of [[-0.12, 0.26, GLOW.fire], [0.04, 0.34, GLOW.fire], [0.15, 0.22, GLOW.flame], [-0.02, 0.18, GLOW.flame]]) {
      g.box(0.1, fh, 0.09, { at: [fx, 0.12, dep * 0.5 + (c === GLOW.flame ? 0.05 : 0)], tones: 'glass', layer: 'glass', glow: c, glowKind: 2 });
    }
    b.box(0.04, 0.6, 0.04, { at: [0.36, 0.3, dep * 0.6], tones: 'iron' });                    // pot-crane
    b.box(0.36, 0.04, 0.04, { at: [0.2, 0.88, dep * 0.6], tones: 'iron' });
    b.cylinder(0.12, 0.15, 0.18, { at: [0.05, 0.5, dep * 0.6], tones: 'iron', segments: 8 });
    // the mantel: honey jars, a candle, a jug of dried flowers
    for (const [mx, k] of [[-0.55, 'honey'], [-0.3, 'honey'], [0.35, 'jug'], [0.6, 'candle']]) {
      if (k === 'honey') { b.cylinder(0.06, 0.06, 0.13, { at: [mx, 1.24, dep / 2 + 0.06], tones: CLOTH.gold, segments: 8 }); b.box(0.13, 0.03, 0.13, { at: [mx, 1.37, dep / 2 + 0.06], tones: CLOTH.red }); }
      if (k === 'jug') { b.cylinder(0.07, 0.09, 0.18, { at: [mx, 1.24, dep / 2 + 0.06], tones: 'cream', segments: 8 }); for (let q = 0; q < 3; q++) b.box(0.05, 0.2, 0.05, { at: [mx - 0.05 + q * 0.05, 1.42, dep / 2 + 0.06], rz: (q - 1) * 0.3, tones: q === 1 ? NIGHTSHADE : CLOTH.gold }); }
      if (k === 'candle') { b.box(0.05, 0.14, 0.05, { at: [mx, 1.24, dep / 2 + 0.06], tones: 'cream', pattern: 'none' }); g.box(0.05, 0.06, 0.05, { at: [mx, 1.38, dep / 2 + 0.06], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 }); }
    }
  });
  { const c = segPoint(hearthS, 0, 0, 0.45); room.solidAt(c[0], c[2], 1.3, 1.3, 0, 'fireplace'); }
  const fl = segPoint(hearthS, 0, 0.55, 0.55);
  room.light({ pos: segPoint(hearthS, 0, 0.3, 0.95), color: GLOW.fire, r: 1.4, kind: 'fire', intensity: 1.15 });

  // ---- the back wall: the grandfather clock (11:55), the calendar (circled date), pressed nightshade; seed-jar shelves
  const ux = (x) => x - back.mid[0];
  onSeg(room, back, ux(-1.45), 0, (b) => {
    // the case: plinth, waist with a glass door (the still pendulum behind it), hood with the face
    b.box(0.6, 0.32, 0.38, { at: [0, 0, 0.19], tones: 'timber', pattern: 'none' });
    b.box(0.46, 1.08, 0.3, { at: [0, 0.32, 0.17], tones: 'timber', pattern: 'vboards', scale: 0.6 });
    b.box(0.26, 0.82, 0.02, { at: [0, 0.45, 0.33], tones: 'glass' });
    b.box(0.015, 0.6, 0.012, { at: [0, 0.62, 0.345], tones: 'brass' });                       // the rod, hanging plumb
    b.cylinder(0.08, 0.08, 0.02, { at: [0, 0.6, 0.35], tones: 'brass', segments: 12 });        //   the bob, still
    b.box(0.6, 0.52, 0.38, { at: [0, 1.4, 0.19], tones: 'timber', pattern: 'none', tint: 1.03 });
    b.box(0.66, 0.08, 0.42, { at: [0, 1.92, 0.21], tones: 'timber', pattern: 'none' });
    b.prism([[-0.3, 0], [0.3, 0], [0.12, 0.14], [-0.12, 0.14]], 0.36, { at: [0, 2.0, 0.19], tones: 'timber' });
    b.cylinder(0.025, 0.025, 0.1, { at: [0, 2.12, 0.19], tones: 'brass', segments: 8 });
    b.push({ at: [0, 1.66, 0.38], rx: Math.PI / 2 });
    b.cylinder(0.215, 0.215, 0.02, { at: [0, 0, 0], tones: 'brass', segments: 16 });
    b.cylinder(0.19, 0.19, 0.02, { at: [0, 0.015, 0], tones: 'cream', segments: 16 });
    b.pop();
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; b.box(0.02, 0.03, 0.01, { at: [Math.sin(a) * 0.155, 1.66 + Math.cos(a) * 0.155 - 0.015, 0.41], tones: 'timber' }); }
    // hands: the hour hand a hair before twelve, the minute hand on the eleven (11:55)
    b.box(0.03, 0.11, 0.012, { at: [-0.003, 1.66, 0.418], rz: 0.04, tones: 'crow' });
    b.box(0.022, 0.16, 0.012, { at: [0, 1.66, 0.42], rz: Math.PI / 6, tones: 'crow' });
    b.box(0.035, 0.035, 0.015, { at: [0, 1.645, 0.42], tones: 'brass' });
    // the circled date on a calendar (right of the clock) and the pressed nightshade above it
    b.box(0.36, 0.46, 0.012, { at: [0.6, 0.98, 0.012], tones: 'cream', pattern: 'none' });
    b.box(0.36, 0.08, 0.016, { at: [0.6, 1.38, 0.014], tones: RED });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) flatQuad(b, 0.47 + i * 0.065, 1.055 + j * 0.075, 0.019, 0.035, 0.03, { tones: 'timber' });
    for (let q = 0; q < 10; q++) { const a = (q / 10) * Math.PI * 2; flatQuad(b, 0.6 + 0.065 + Math.cos(a) * 0.045, 1.115 + Math.sin(a) * 0.04, 0.021, 0.028, 0.012, { rz: a + Math.PI / 2, tones: RED }); }
    b.box(0.02, 0.02, 0.03, { at: [0.6, 1.46, 0.02], tones: 'iron' });
    b.box(0.44, 0.54, 0.04, { at: [0.6, 1.52, 0.02], tones: 'plank', pattern: 'none' });
    b.box(0.36, 0.46, 0.012, { at: [0.6, 1.56, 0.042], tones: 'cream', pattern: 'none', tint: 0.96 });
    b.box(0.015, 0.34, 0.01, { at: [0.6, 1.6, 0.05], rz: 0.1, tones: 'leaf' });
    for (const [lx, ly] of [[-0.08, 0.15], [0.07, 0.22], [-0.06, 0.3], [0.06, 0.08]]) b.box(0.08, 0.04, 0.01, { at: [0.6 + lx, 1.6 + ly, 0.052], rz: lx * 5, tones: 'leaf', pattern: 'none' });
    for (const [bx2, by] of [[0.02, 0.36], [0.06, 0.32], [-0.02, 0.33], [0.1, 0.38]]) b.box(0.035, 0.035, 0.01, { at: [0.6 + bx2, 1.6 + by, 0.056], tones: NIGHTSHADE, pattern: 'none' });
  });
  room.solidAt(-1.45, -Z + 0.2, 0.65, 0.42, 0, 'clock');
  // the seed-jar shelves (right of the window): three shelves of labelled jars; one jar tipped over, empty
  onSeg(room, back, ux(1.55), 0.55, (b) => {
    const jr = rng(4040);
    for (let s = 0; s < 3; s++) {
      const y = s * 0.42;
      b.box(1.02, 0.04, 0.26, { at: [0, y, 0.13], tones: 'plank', pattern: 'none' });
      for (const sx of [-1, 1]) b.box(0.04, 0.42, 0.24, { at: [sx * 0.49, y - (s ? 0 : 0.55), 0.12], tones: 'timber', pattern: 'none' });
      for (let k = 0; k < 5; k++) {
        const x = -0.38 + k * 0.19;
        if (s === 1 && k === 3) {            // the empty jar on its side
          b.push({ at: [x, y + 0.1, 0.13], rz: Math.PI / 2 }); b.cylinder(0.06, 0.06, 0.15, { at: [0, -0.075, 0], tones: 'glass', segments: 8 }); b.pop();
          b.box(0.06, 0.04, 0.012, { at: [x, y + 0.08, 0.2], tones: 'crow', pattern: 'none' });
          continue;
        }
        const seed = [EARTH, CLOTH.gold, 'dirt', 'thatch', 'crow', RED][Math.floor(jr() * 6)];
        b.cylinder(0.062, 0.062, 0.2, { at: [x, y + 0.04, 0.13], tones: 'glass', segments: 8 });
        flatQuad(b, x, y + 0.085, 0.194, 0.08, 0.07, { tones: seed });                                   // the seeds behind the glass
        b.box(0.13, 0.035, 0.13, { at: [x, y + 0.24, 0.13], tones: 'plank' });
        flatQuad(b, x, y + 0.165, 0.195, 0.09, 0.05, { tones: 'cream' });                                // the name label
        flatQuad(b, x, y + 0.165, 0.196, 0.06, 0.01, { tones: 'timber' });
      }
    }
  });
  // seedlings on the back windowsill, a watering can below
  onSeg(room, back, ux(0.55), 1.05, (b) => {
    for (let k = 0; k < 4; k++) {
      b.box(0.13, 0.08, 0.13, { at: [-0.24 + k * 0.16, 0, 0.1], tones: 'brick' });
      b.box(0.06, 0.08 + (k % 2) * 0.04, 0.06, { at: [-0.24 + k * 0.16, 0.08, 0.1], ry: k, tones: 'mossTuft' });
    }
  });
  at(room, { x: 0.15, z: -Z + 0.3 }, (b) => {
    b.cylinder(0.13, 0.15, 0.26, { at: [0, 0, 0], tones: 'copper', segments: 8 });
    b.box(0.32, 0.04, 0.04, { at: [0.2, 0.18, 0], rz: 0.6, tones: 'copper' });
    b.box(0.04, 0.12, 0.2, { at: [0, 0.3, 0], tones: 'copper' });
  });

  // ---- ROOTS breaking through the back wall and the left corner, creeping down and over the floor; ivy at the windows
  const rr = rng(4141);
  const root = (pts, r0, r1) => {
    // subdivide the polyline (3 per span) with a little jitter: knobbly, tapering, never a straight plank
    const P = [];
    for (let k = 0; k < pts.length - 1; k++) for (let q = 0; q < 3; q++) {
      const f = q / 3, [ax, ay, az] = pts[k], [bx, by, bz] = pts[k + 1], j = k + q ? 0.035 : 0;
      P.push([ax + (bx - ax) * f + (rr() - 0.5) * j * 2, ay + (by - ay) * f, az + (bz - az) * f + (rr() - 0.5) * j]);
    }
    P.push(pts[pts.length - 1]);
    for (let k = 0; k < P.length - 1; k++) {
      const [ax, ay, az] = P[k], [bx, by, bz] = P[k + 1];
      const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz), r = r0 + ((r1 - r0) * k) / (P.length - 1);
      const ry = Math.atan2(dx, dz), rx = Math.atan2(Math.hypot(dx, dz), dy);
      room.b.push({ at: [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], ry, rx });
      room.b.box(r, L + r * 0.5, r * 0.8, { at: [0, 0, 0], ry: k * 0.7, tones: 'trunk', origin: 'center', tint: [1.03, 0.96, 1.0][k % 3] });
      room.b.pop();
    }
  };
  const BZ = -Z + 0.04;
  // the breach: crumbled daub round where the big roots come through, dark earth behind
  onSeg(room, back, ux(-0.6), H - 0.75, (b) => {
    b.prism([[-0.35, 0], [0.3, 0.05], [0.42, 0.45], [0.1, 0.62], [-0.3, 0.55], [-0.45, 0.25]], 0.012, { at: [0, 0, 0.006], tones: EARTH, tint: 0.94 });
    for (const [x, y] of [[-0.42, -0.05], [0.38, 0.0], [0.2, -0.12]]) b.box(0.12, 0.08, 0.05, { at: [x, y, 0.03], ry: x, tones: 'stone' });
  });
  root([[-0.62, H - 0.25, BZ - 0.02], [-0.7, 1.7, BZ + 0.05], [-0.58, 1.1, BZ + 0.07], [-0.66, 0.5, BZ + 0.09], [-0.5, 0.06, BZ + 0.22], [-0.1, 0.04, BZ + 0.5], [0.3, 0.03, BZ + 0.62]], 0.12, 0.05);
  root([[-0.5, H - 0.3, BZ - 0.02], [-0.42, 1.8, BZ + 0.04], [-0.32, 1.3, BZ + 0.05], [-0.36, 0.8, BZ + 0.06]], 0.08, 0.03);
  root([[-0.66, 0.5, BZ + 0.09], [-0.9, 0.25, BZ + 0.15], [-1.05, 0.04, BZ + 0.45], [-0.95, 0.03, BZ + 0.85]], 0.07, 0.035);
  root([[-0.75, H - 0.4, BZ - 0.02], [-0.95, 1.6, BZ + 0.04], [-1.0, 1.25, BZ + 0.05]], 0.06, 0.03);
  root([[2.2, H - 0.12, BZ - 0.02], [2.08, 1.7, BZ + 0.05], [2.16, 1.2, BZ + 0.06]], 0.07, 0.03);
  root([[-X + 0.02, H - 0.12, CZ + 0.4], [-X + 0.06, 1.5, CZ + 0.55], [-X + 0.06, 0.8, CZ + 0.7], [-X + 0.15, 0.04, CZ + 0.95], [-X + 0.6, 0.03, CZ + 1.3]], 0.08, 0.04);
  // rootlets dangling from the top of the walls
  for (const [x, z, l] of [[0.1, BZ + 0.04, 0.35], [1.0, BZ + 0.04, 0.25], [-1.95, BZ + 0.6, 0.3], [3.2, -1.6, 0.4], [-X + 0.06, 1.2, 0.3]]) {
    room.b.box(0.04, l, 0.04, { at: [x, H - 0.06 - l, z], tones: 'trunk', rz: 0.15 });
  }
  room.solid(-0.85, BZ, 0.0, BZ + 0.45, 'roots');
  // ivy round the windows (leaf clusters creeping in over the reveals) and along the top of the back wall
  const ivy = (s, u, y, w) => onSeg(room, s, u, y, (b) => {
    const ir = rng(Math.round(u * 100) + 7);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, rx2 = w / 2 + 0.12 + ir() * 0.1, ry2 = 0.5 + ir() * 0.12;
      if (Math.sin(a) < -0.3) continue;
      b.box(0.13, 0.1, 0.06, { at: [Math.cos(a) * rx2, 0.38 + Math.sin(a) * ry2, 0.04 + ir() * 0.04], ry: ir(), rz: ir(), tones: ir() < 0.5 ? 'leaf' : 'mossTuft' });
    }
  });
  ivy(back, ux(0.55), 1.05, 0.68);
  ivy(winS, 0.05, 1.0, 0.62);
  onSeg(room, back, 0, H - 0.25, (b) => {
    for (let k = 0; k < 22; k++) b.box(0.15, 0.11, 0.06, { at: [-2.2 + k * 0.21, (k % 3) * -0.04, 0.05], ry: k, tones: k % 3 ? 'leaf' : 'mossTuft' });
  });
  // (night pass: no green point lights - the two window lights painted hard green discs over the walls and the floor
  // day and night; the green comes from the ivy panes, the leafy sun dapples by day and the dithered green streaks
  // from each sill at night, see the night layer below)

  // ---- the lantern on its chain
  // dried flowers hung from the top of the back wall, left of the clock
  onSeg(room, back, ux(-0.45), H - 0.32, (b) => {
    b.box(0.7, 0.04, 0.05, { at: [0, 0, 0.03], tones: 'timber' });
    [CLOTH.gold, NIGHTSHADE, 'leaf', CLOTH.gold].forEach((c, k) => { b.box(0.02, 0.08, 0.02, { at: [-0.27 + k * 0.18, -0.08, 0.06], tones: TP.thatch }); b.box(0.11, 0.22, 0.09, { at: [-0.27 + k * 0.18, -0.3, 0.08], tones: c }); });
  });
  F.hangingLantern(room, { x: 1.75, z: 1.15, y: 1.45, r: 1.5, intensity: 0.7 });

  // ---- the letters table: the stack of unsent letters tied with red string, one half-written, ink, candle, portrait
  const tx = 0.35, tz = 0.55;
  F.rug(room, { x: tx, z: tz, w: 2.6, d: 1.9, oval: true, tones: paintRamp('#6a7a4a', { lightness: 0.44 }), border: paintRamp('#a8703a', { lightness: 0.5 }) });
  F.table(room, {
    x: tx, z: tz, w: 1.4, d: 0.8, items: false,
    extra: (b, g, top) => {
      const lr = rng(77);
      for (let k = 0; k < 11; k++) b.box(0.3, 0.028, 0.19, { at: [-0.38 + (lr() - 0.5) * 0.03, top + k * 0.028, -0.08], ry: (lr() - 0.5) * 0.18, tones: 'cream', pattern: 'none', tint: k % 2 ? 0.96 : 1.02 });
      b.box(0.03, 0.32, 0.2, { at: [-0.38, top - 0.005, -0.08], tones: RED });                     // the string
      b.box(0.31, 0.012, 0.03, { at: [-0.38, top + 0.31, -0.08], tones: RED });
      b.box(0.34, 0.012, 0.24, { at: [0.08, top, 0.06], ry: 0.12, tones: 'cream', pattern: 'none' });   // the half-written one
      for (let r = 0; r < 5; r++) b.box(0.24 - (r === 4 ? 0.12 : 0), 0.004, 0.012, { at: [0.06 - (r === 4 ? 0.06 : 0), top + 0.013, -0.02 + r * 0.04], ry: 0.12, tones: 'timber', pattern: 'none' });
      b.box(0.06, 0.07, 0.06, { at: [0.3, top, -0.18], tones: 'crow' });
      b.box(0.012, 0.012, 0.3, { at: [0.3, top + 0.1, -0.1], rx: -0.9, ry: 0.4, tones: 'cream' });
      b.box(0.17, 0.22, 0.03, { at: [0.48, top, -0.2], rx: -0.25, tones: 'brass' });                 // the portrait of the girl
      b.box(0.13, 0.17, 0.01, { at: [0.48, top + 0.03, -0.18], rx: -0.25, tones: CLOTH.blue });
      b.box(0.05, 0.06, 0.01, { at: [0.48, top + 0.1, -0.165], rx: -0.25, tones: 'cream' });
      b.box(0.07, 0.04, 0.01, { at: [0.48, top + 0.14, -0.172], rx: -0.25, tones: 'autumn' });
      b.cylinder(0.07, 0.07, 0.025, { at: [0.55, top, 0.2], tones: 'brass', segments: 8 });
      b.box(0.05, 0.12, 0.05, { at: [0.55, top + 0.025, 0.2], tones: 'cream', pattern: 'none' });
      g.box(0.06, 0.07, 0.06, { at: [0.55, top + 0.145, 0.2], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
      g.box(0.035, 0.05, 0.035, { at: [0.55, top + 0.215, 0.2], tones: 'glass', layer: 'glass', glow: GLOW.flame, glowKind: 2 });
    },
  });
  room.light({ pos: [tx + 0.55, 1.05, tz + 0.2], color: GLOW.candle, r: 1.2, kind: 'lantern', intensity: 0.7 });
  F.chair(room, { x: tx, z: tz - 0.68, ry: 0 });

  // ---- the bed against the right wall (head to the wall) under an ochre quilt, a sheepskin; a dresser corner
  const bx = X - 1.02, bz = 0.75;
  const bed = F.bed(room, { x: bx, z: bz, ry: -Math.PI / 2, quilt: paintRamp('#b08a3a', { lightness: 0.5 }), frame: 'plank' });
  room.b.box(0.9, 0.04, 0.6, { at: [bx - 0.1, 0.002, bz + 0.85], ry: 0.15, tones: 'cream', pattern: 'thatch', scale: 0.4, layer: 'soft' });
  F.nightstand(room, { x: X - 0.3, z: bz - 0.85, light: false });
  F.chest(room, { x: X - 0.3, z: 2.35, ry: -Math.PI / 2 });
  F.plant(room, { x: -X + 0.4, z: 2.5 });
  F.sacks(room, { x: -X + 0.45, z: 1.55, n: 2, ry: Math.PI / 2 });
  F.doormat(room, { x: 0, z: Z - 0.4 });

  // ---- the rocking chair by the hearth (rocks in stepped beats), a knitted blanket over its back
  const rcx = -2.3, rcz = -0.6, rcy = Math.atan2(fl[0] - rcx, fl[2] - rcz);
  const rock = new Builder(room.engine, { name: 'house-4-rocker' });
  for (const sx of [-1, 1]) {
    rock.hexa([new THREE.Vector3(sx * 0.2 - 0.025, 0.06, -0.4), new THREE.Vector3(sx * 0.2 + 0.025, 0.06, -0.4), new THREE.Vector3(sx * 0.2 - 0.025, 0.1, -0.4), new THREE.Vector3(sx * 0.2 + 0.025, 0.1, -0.4),
      new THREE.Vector3(sx * 0.2 - 0.025, 0.06, 0.4), new THREE.Vector3(sx * 0.2 + 0.025, 0.06, 0.4), new THREE.Vector3(sx * 0.2 - 0.025, 0.1, 0.4), new THREE.Vector3(sx * 0.2 + 0.025, 0.1, 0.4)], { tones: 'timber' });
    rock.box(0.05, 0.03, 0.2, { at: [sx * 0.2, 0.0, -0.3], tones: 'timber' });
    rock.box(0.05, 0.03, 0.2, { at: [sx * 0.2, 0.0, 0.3], tones: 'timber' });
    for (const sz of [-0.17, 0.17]) rock.box(0.05, 0.36, 0.05, { at: [sx * 0.18, 0.08, sz], tones: 'timber', pattern: 'none' });
    rock.box(0.05, 0.62, 0.05, { at: [sx * 0.18, 0.44, -0.2], rx: -0.15, tones: 'timber', pattern: 'none' });
  }
  rock.box(0.44, 0.05, 0.42, { at: [0, 0.44, 0], tones: 'plank' });
  for (let k = 0; k < 3; k++) rock.box(0.38, 0.06, 0.04, { at: [0, 0.62 + k * 0.17, -0.22 - k * 0.025], rx: -0.15, tones: 'plank' });
  rock.box(0.48, 0.42, 0.05, { at: [0, 0.6, -0.27], rx: -0.15, tones: RED, pattern: 'vboards', scale: 0.3 });   // the blanket
  rock.box(0.5, 0.06, 0.07, { at: [0, 1.0, -0.33], rx: -0.15, tones: RED, tint: 0.94 });
  const rockG = rock.build({ name: 'house-4-rocker' });
  const rockPivot = new THREE.Group();
  rockPivot.position.set(rcx, 0, rcz);
  rockPivot.rotation.y = rcy;
  rockPivot.add(rockG);
  room.solidAt(rcx, rcz, 0.7, 0.7, 0, 'rocker');

  // ---- the ivy canopy over the room: the sun falls through it in leafy dapples (shadow-only, follows the sun)
  const leafy = (x, z) => Math.sin(x * 4.4 + Math.sin(z * 3.1) * 1.6) + Math.sin(z * 5.2 + x * 1.5 + Math.cos(x * 2.2) * 1.2) * 0.9 + Math.sin((x - z) * 7.1) * 0.35;
  // (at night it slides 7 m so only its closed margin covers the room: no grey moon dapples on the floor)
  const canopy = sunMask(room, { name: 'house-4-ivy', cell: 0.25, margin: 10, nightShift: [0, 7], open: (x, z) => Math.abs(x) < X && Math.abs(z) < Z && leafy(x, z) > 0.95 });

  // ---- pollen drifting in the green window light
  // ...and at night, in the same mesh: the peat fire's low red-gold pool before the hearth, the ivy windows' green
  // moonlight (the panes pale green, a streak from each sill across the earth floor), the letter-candle's pool on the
  // rug and the lantern's on the floor - warm hearth against cool leaf-green, the rest left in tender dark
  const inside = (u, w) => inPoly(poly, u, w);
  const pollen = motes(room, {
    n: 26, seed: 44, box: { x0: -1.0, x1: 3.6, y0: 0.4, y1: 2.1, z0: -2.7, z1: 0.6 }, size: 0.035, glow: '#F2E68E', mode: 'drift', speed: 0.14, sway: 0.18, name: 'pollen',
    night: (b) => {
      for (const [sg, u, y, w, h] of [[back, ux(0.55), 1.05, 0.68, 0.72], [winS, 0.05, 1.0, 0.62, 0.75]]) {
        b.push({ at: [sg.mid[0], 0, sg.mid[1]], ry: sg.ry });
        b.box(w, h, 0.004, { at: [u, y, -T * 0.55 + 0.016], tones: 'glass', layer: 'glass', glow: '#4E7A52', glowKind: 1 });
        b.pop();
      }
      const fl = ditherCanvas({ plane: 'floor' });
      const hf = segPoint(hearthS, 0, 0, 0.95);
      fl.pool({ x: hf[0], v: hf[2], r: 1.35, r2: 1.05, color: '#9A5A3A', inner: '#D4844A', peak: 0.48, power: 1.2, clip: inside });   // the hearth
      for (const [p0, p1] of [[segPoint(back, ux(0.55), 0, 0.35), segPoint(back, ux(0.75), 0, 1.75)], [segPoint(winS, 0.05, 0, 0.35), segPoint(winS, -0.3, 0, 1.7)]]) {
        for (let q = 0; q < 4; q++) {
          const f = q / 3;
          fl.pool({ x: p0[0] + (p1[0] - p0[0]) * f, v: p0[2] + (p1[2] - p0[2]) * f, r: 0.34 + f * 0.06, r2: 0.36, color: '#4E7A54', inner: '#7EB070', peak: 0.55 - f * 0.28, power: 1.0, clip: inside });
        }
      }
      fl.pool({ x: 1.75, v: 1.3, r: 0.8, r2: 0.6, color: '#A08054', inner: '#D0A462', peak: 0.3, clip: (u, w) => inside(u, w) && ((u - tx) / 1.3) ** 2 + ((w - tz) / 0.95) ** 2 > 1 });   // the lantern
      fl.draw(b);
      ditherCanvas({ plane: 'floor', y: 0.042 }).pool({ x: tx + 0.45, v: tz + 0.35, r: 0.9, r2: 0.7, color: '#A08054', inner: '#D0A462', peak: 0.36, clip: (u, w) => ((u - tx) / 1.28) ** 2 + ((w - tz) / 0.93) ** 2 < 1 }).draw(b);   // the letter-candle on the rug
    },
  });

  room.spot('hearth', -1.85, -1.35, -Math.PI / 2);
  room.spot('clock', -1.45, -1.9, Math.PI);
  room.spot('table', tx, tz + 0.95, Math.PI);

  return {
    bed: { x: bx + 0.6, z: bz, y: 0.55, facing: -Math.PI / 2 },
    visit: { x: bx - 0.25, z: bz - 0.95, facing: 0 },
    extras: [rockPivot, pollen.group, canopy.group],
    update(t) {
      const k = Math.floor(t * 6);
      rockG.rotation.x = [0, 0.05, 0.08, 0.05, 0, -0.05, -0.08, -0.05][k % 8];
      pollen.update(t);
      canopy.update();
    },
    bedRect: bed.rect,
  };
}
