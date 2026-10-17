// house-2 interior: The Weaver's House (owner: interiors builder, houses 0-4; lore pass 2026-10-16). docs/INTERIORS.md,
// docs/LORE.md row 2.
// A weaver weaving a tapestry of the whole town. The brightest room in Hollowmere: TALL (3.9 m), pale limewash between
// timber posts over a madder-red dado, pale scrubbed boards, a glazed BAY pushed out of the back wall (three tall
// windows) with the great floor loom silhouetted in it, and a MEZZANINE LOFT over the left third (wool bales and
// rolled cloth up there, a ladder, a box-bed tucked under it). Story props:
//   - THE TOWN TAPESTRY on the back wall: the square and the clock tower, the ring of 15 cottages in their roof
//     colours - and ONE cottage woven in black, its threads cut and hanging loose below the hem
//   - skeins of red yarn drying on a rack (more red than anything else), a basket of red balls by the spinning wheel
//   - the spinning wheel (it turns, stepped), the cutting table with an indigo bolt, shears and a pattern book
//   - the Lantern-maker's lantern hung by the loft
// Ambiance: soft warm daylight through the bay (a warm-white key light at the loom lamp), lint floating in it;
// colourful threads everywhere; patient, watchful.
import * as THREE from 'three';
import { Builder } from '../kit.js';
import { bareShell, polyWalls, polyFloor, blockOutside, inPoly, onSeg, motes, at, ditherCanvas, ditherWall, sunMask, flatQuad } from './house-0.js';

/** Room size / walls (index.js reads ROOM before build): the tall shop floor; the bay is part of the depth. */
export const ROOM = {
  w: 9, d: 6.4, h: 3.9, wall: 'timber', pal: 2,
  // the demo's room night look (docs/DEMO.md 4.3, once index.js passes it through): silver moonlight from the bay,
  // creamy lamp light, the colours kept (a light tint)
  nightAmbient: { lit: '#D8DCEC', sh: '#9CA0BC', k: 0.35, litK: 0.35, gain: 1.2, mist: 0.3 },
};

export default function build(room, ctx) {
  const { FURNITURE: F, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp } = ctx;
  const W = room.W, D = room.D, H = room.H, T = room.T;
  const X = W / 2, Z = D / 2, BZ = -2.5;                    // the main back wall; the bay goes back to -Z
  const MADDER = paintRamp('#8a3a34', { lightness: 0.42 });
  const FLOOR = paintRamp('#b09068', { lightness: 0.6 });
  const OCHRE = paintRamp('#b08a3a', { lightness: 0.52 });
  const INDIGO = paintRamp('#2e3a7a', { lightness: 0.36 });
  bareShell(room);

  // ---- room: the main back wall (a high loft window + the tapestry), the glazed bay, right, front (door), left
  const bayWin = { y: 0.55, h: 2.35, frame: 'timber', panes: [2, 6], arch: 'round', glowColor: '#FFF4DE' };
  const V = [
    [-X, BZ, { ext: [T, 0], windows: [{ u: -1.25, y: 2.45, w: 0.62, h: 0.75, panes: [2, 2], frame: 'timber' }] }],
    // (the bay's cheeks are splayed wide enough to count as BACK wall: their windows share the back wall's glow mesh,
    // so the side walls need none - 16 draw calls)
    [0.75, BZ, { ext: [0, T], windows: [{ u: 0, ...bayWin, w: 0.5, h: 2.0, y: 0.7 }] }],
    [1.55, -Z, { windows: [{ u: -0.47, ...bayWin, w: 0.76 }, { u: 0.47, ...bayWin, w: 0.76 }] }],
    [3.45, -Z, { ext: [T, 0], windows: [{ u: 0, ...bayWin, w: 0.5, h: 2.0, y: 0.7 }] }],
    [4.25, BZ, { ext: [0, T] }],
    [X, BZ], [X, Z], [-X, Z],
  ];
  const poly = V.map((p) => [p[0], p[1]]);
  const segs = polyWalls(room, V, {
    dado: 0.95, upper: { tones: 'plaster', pattern: 'plaster' }, lower: { tones: MADDER, pattern: 'vboards', scale: 0.8 },
    posts: 1.5, windowGlow: '#FFF4DE',
  });
  polyFloor(room, poly, { tones: FLOOR, pattern: 'planks', lip: [[-X - 0.45, BZ - 0.45], [0.95, BZ - 0.45], [1.65, -Z - 0.45], [3.35, -Z - 0.45], [4.05, BZ - 0.45], [X + 0.45, BZ - 0.45], [X + 0.45, Z + 0.45], [-X - 0.45, Z + 0.45]] });
  blockOutside(room, (x, z) => inPoly(poly, x, z));
  const back = segs[0];   // u = x - (-X + 2.75)  (mid x = -1.75)

  // ---- THE TOWN TAPESTRY (2.3 x 2.25 m) on the back wall between the loft and the bay
  const tu = -0.3 - back.mid[0];        // x = -0.3
  onSeg(room, back, tu, 1.1, (b) => {
    const tw = 2.15, th = 2.25;
    b.box(tw + 0.2, 0.08, 0.08, { at: [0, th + 0.02, 0.06], tones: 'timber', pattern: 'none' });                 // the hanging pole
    for (const s of [-1, 1]) b.box(0.06, 0.08, 0.1, { at: [s * (tw / 2 + 0.12), th, 0.06], tones: 'brass' });
    b.box(tw, th, 0.03, { at: [0, 0, 0.03], tones: CLOTH.gold });                                   // border
    b.box(tw - 0.16, th - 0.16, 0.035, { at: [0, 0.08, 0.035], tones: CLOTH.green, pattern: 'vboards', scale: 0.2 });
    const cx = 0, cy = th / 2 + 0.02;
    // the square: a cream ring of cobbles and the clock tower in the middle
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; flatQuad(b, cx + Math.cos(a) * 0.4, cy + Math.sin(a) * 0.4, 0.061, 0.09, 0.035, { rz: a + Math.PI / 2, tones: 'cream' }); }
    b.box(0.14, 0.42, 0.012, { at: [cx, cy - 0.24, 0.058], tones: 'plank' });
    b.prism([[-0.1, 0], [0.1, 0], [0, 0.14]], 0.012, { at: [cx, cy + 0.18, 0.058], tones: 'slate' });
    b.box(0.09, 0.09, 0.012, { at: [cx, cy + 0.0, 0.064], tones: 'cream', origin: 'center' });
    b.box(0.012, 0.04, 0.008, { at: [cx, cy + 0.015, 0.072], tones: 'crow', origin: 'center' });
    // the ring of 15 cottages; number 6 (lower right) woven black, its threads cut and hanging below the hem
    const roofs = [CLOTH.red, CLOTH.blue, OCHRE, CLOTH.purple, 'slate', CLOTH.red, 'thatch', CLOTH.blue, 'moss', OCHRE, CLOTH.purple, 'red', 'slate', 'thatch', CLOTH.blue];
    const BLACK = 6;
    for (let k = 0; k < 15; k++) {
      const a = Math.PI / 2 - (k / 15) * Math.PI * 2, r = 0.82;
      const hx = cx + Math.cos(a) * r, hy = cy + Math.sin(a) * r * 0.92;
      const black = k === BLACK;
      b.box(0.15, 0.12, 0.012, { at: [hx, hy - 0.08, 0.058], tones: black ? 'crow' : 'cream' });
      b.prism([[-0.1, 0], [0.1, 0], [0, 0.1]], 0.012, { at: [hx, hy + 0.04, 0.058], tones: black ? 'crow' : roofs[k] });
      if (!black) b.box(0.04, 0.04, 0.01, { at: [hx, hy - 0.06, 0.066], tones: CLOTH.gold });
      else {
        // the cut threads: black strands from the house down past the hem
        for (let q = 0; q < 5; q++) {                     // a splayed fan of loose black threads, frayed at the ends
          const len = hy - 0.08 + 0.06 + ((q * 37) % 7) * 0.04, a = (q - 2) * 0.11, x0 = hx - 0.06 + q * 0.03, y0 = hy - 0.08;
          b.box(0.016, len, 0.01, { at: [x0 + Math.sin(a) * len / 2, y0 - Math.cos(a) * len / 2, 0.062], rz: a, tones: 'crow', origin: 'center' });
          b.box(0.028, 0.03, 0.01, { at: [x0 + Math.sin(a) * len, y0 - Math.cos(a) * len, 0.062], rz: a * 2, tones: 'crow', origin: 'center' });
        }
      }
    }
    // lanes between the houses and the square (cream threads)
    for (let k = 0; k < 5; k++) { const a = Math.PI / 2 - (k / 5) * Math.PI * 2 - 0.2; flatQuad(b, cx + Math.cos(a) * 0.56, cy + Math.sin(a) * 0.56 - 0.16, 0.064, 0.02, 0.32, { rz: a - Math.PI / 2, tones: 'cream' }); }
    // a fringe of tassels on the hem
    for (let q = 0; q < 14; q++) b.box(0.03, 0.12, 0.02, { at: [-tw / 2 + 0.1 + (q * (tw - 0.2)) / 13, -0.12, 0.04], tones: CLOTH.gold });
  });

  // ---- the MEZZANINE LOFT over the left third: deck, joists, posts, railing; bales and rolled cloth up there
  const LX1 = -1.55, LZ1 = 0.45, LY = 2.05;
  room.b.box(X + LX1, 0.14, LZ1 - BZ, { at: [(-X + LX1) / 2, LY, (BZ + LZ1) / 2], tones: 'plank', pattern: 'planks' });
  room.b.box(X + LX1 + 0.1, 0.18, 0.16, { at: [(-X + LX1) / 2, LY - 0.18, LZ1 - 0.06], tones: 'timber', pattern: 'none' });   // front beam
  room.b.box(0.16, 0.18, LZ1 - BZ, { at: [LX1 - 0.06, LY - 0.18, (BZ + LZ1) / 2], tones: 'timber', pattern: 'none' });
  for (let k = 0; k < 4; k++) room.b.box(0.1, 0.12, 0.12, { at: [-X + 0.4 + k * 0.85, LY - 0.13, LZ1 + 0.02], tones: 'timber', pattern: 'none' });  // joist ends
  for (const [px, pz] of [[LX1 - 0.06, LZ1 - 0.06], [-X + 1.5, LZ1 - 0.06], [LX1 - 0.06, -1.0]]) {
    room.b.box(0.14, LY - 0.18, 0.14, { at: [px, 0, pz], tones: 'timber', pattern: 'none' });
    room.solidAt(px, pz, 0.2, 0.2, 0, 'post');
  }
  // railing: posts + a rail along the front and the right edge (the ladder comes up at the right edge)
  for (let k = 0; k <= 5; k++) room.b.box(0.05, 0.62, 0.05, { at: [-X + 0.1 + k * ((X + LX1 - 0.2) / 5), LY + 0.14, LZ1 - 0.04], tones: 'timber', pattern: 'none' });
  room.b.box(X + LX1, 0.06, 0.07, { at: [(-X + LX1) / 2, LY + 0.74, LZ1 - 0.04], tones: 'plank', pattern: 'none' });
  for (const pz of [-2.2, -1.65]) room.b.box(0.05, 0.62, 0.05, { at: [LX1 - 0.04, LY + 0.14, pz], tones: 'timber', pattern: 'none' });
  room.b.box(0.07, 0.06, 0.7, { at: [LX1 - 0.04, LY + 0.74, -1.95], tones: 'plank', pattern: 'none' });
  // up on the loft: wool bales, rolled bolts in the town's colours, a basket of fleece
  at(room, { x: 0, y: LY + 0.14, z: 0 }, (b) => {
    for (const [x, z, s] of [[-3.95, -1.9, 1], [-3.3, -1.95, 0.9], [-3.6, -1.95, 0.95]]) {
      b.box(0.62 * s, 0.5 * s, 0.5, { at: [x, x === -3.6 ? 0.5 : 0, z], tones: 'cream', pattern: 'thatch', scale: 0.4, layer: 'soft', tint: x === -3.3 ? 1.03 : 0.98 });
      b.box(0.04, 0.51 * s, 0.52, { at: [x - 0.12, x === -3.6 ? 0.5 : 0, z], tones: 'plank' });
    }
    [CLOTH.red, CLOTH.blue, OCHRE, CLOTH.green, CLOTH.purple].forEach((tones, i) => {
      b.push({ at: [-2.75 + (i % 3) * 0.04, 0.12 + Math.floor(i / 3) * 0.2 + (i % 3) * 0.2 * 0, -1.15 + i * 0.12], rz: Math.PI / 2 });
      b.cylinder(0.1, 0.1, 1.1, { at: [0, -0.55, 0], tones, segments: 8, layer: 'soft' });
      b.pop();
    });
    b.cylinder(0.25, 0.3, 0.3, { at: [-2.1, 0, -0.1], tones: 'thatch', pattern: 'thatch', scale: 0.5, segments: 10 });
    b.cylinder(0.24, 0.24, 0.12, { at: [-2.1, 0.28, -0.1], tones: 'cream', layer: 'soft', segments: 10 });
  });
  // the ladder up to the loft (leans on the loft's right edge)
  {
    const lz = -0.35, x0 = -0.75, x1 = LX1 + 0.04;
    for (const s of [-1, 1]) room.b.hexa([
      new THREE.Vector3(x0 - 0.03, 0, lz + s * 0.24 - 0.03), new THREE.Vector3(x0 + 0.03, 0, lz + s * 0.24 - 0.03), new THREE.Vector3(x1 - 0.03, LY + 0.7, lz + s * 0.24 - 0.03), new THREE.Vector3(x1 + 0.03, LY + 0.7, lz + s * 0.24 - 0.03),
      new THREE.Vector3(x0 - 0.03, 0, lz + s * 0.24 + 0.03), new THREE.Vector3(x0 + 0.03, 0, lz + s * 0.24 + 0.03), new THREE.Vector3(x1 - 0.03, LY + 0.7, lz + s * 0.24 + 0.03), new THREE.Vector3(x1 + 0.03, LY + 0.7, lz + s * 0.24 + 0.03)], { tones: 'plank' });
    for (let k = 1; k < 9; k++) { const f = k / 9; room.b.box(0.05, 0.04, 0.5, { at: [x0 + (x1 - x0) * f, (LY + 0.7) * f, lz], tones: 'plank', tint: 0.96 }); }
    room.solid(x0 - 0.1, lz - 0.3, x1, lz + 0.3, 'ladder');
  }

  // ---- the box-bed under the loft (headboard to the back wall), a valance from the loft beam, a quilt in red + gold
  const bx = -X + 0.72, bz = BZ + 1.05;
  const bed = F.bed(room, { x: bx, z: bz, quilt: 'red', frame: 'timber', wide: false });
  for (let k = 0; k < 5; k++) room.b.box(0.32, 0.36, 0.05, { at: [-X + 0.25 + k * 0.34, LY - 0.52, LZ1 - 0.2], tones: k % 2 ? CLOTH.gold : CLOTH.red, layer: 'soft', tint: k % 2 ? 1 : 0.96 });
  F.nightstand(room, { x: -X + 1.6, z: BZ + 0.24, light: false });
  // wool bales and a dye vat under the loft's front
  F.sacks(room, { x: -2.0, z: -2.05, n: 2 });
  at(room, { x: -2.05, z: -0.15 }, (b) => {
    b.cylinder(0.36, 0.36, 0.5, { at: [0, 0, 0], tones: 'plank', pattern: 'vboards', scale: 0.5, segments: 10 });
    for (const y of [0.1, 0.4]) b.cylinder(0.37, 0.37, 0.04, { at: [0, y, 0], tones: 'iron', segments: 10 });
    b.cylinder(0.31, 0.31, 0.02, { at: [0, 0.47, 0], tones: INDIGO, segments: 10 });
    b.box(0.04, 0.04, 0.8, { at: [0.1, 0.5, 0.05], rx: -0.6, ry: 0.4, tones: 'plank', origin: 'center' });
  });
  room.solidAt(-2.05, -0.15, 0.8, 0.8);

  // ---- the LOOM in the bay, its lamp on the beam: the warm key light of the room
  F.loom(room, { x: 2.5, z: -2.3, cloth: 'red' });
  at(room, { x: 2.5, z: -2.3 }, (b, g) => {
    // the warp's coloured bands and the lamp on the breast beam
    for (let k = 0; k < 6; k++) b.box(0.16, 0.012, 0.36, { at: [-0.45 + k * 0.18, 0.995, 0.12], tones: [CLOTH.red, OCHRE, CLOTH.red, CLOTH.blue, CLOTH.red, CLOTH.gold][k], layer: 'soft' });
    b.box(0.12, 0.05, 0.12, { at: [0.55, 1.7, -0.32], tones: 'brass' });
    g.box(0.08, 0.1, 0.08, { at: [0.55, 1.75, -0.32], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
  });
  room.light({ pos: [3.0, 1.3, -1.6], color: '#FFE6BE', r: 1.6, kind: 'fire', intensity: 0.95 });

  // ---- the spinning wheel (turns) with a basket of red yarn balls
  const swx = -0.45, swz = 1.25;
  at(room, { x: swx, z: swz }, (b) => {
    b.box(0.9, 0.08, 0.2, { at: [0, 0.32, 0], tones: 'plank', pattern: 'none' });
    for (const [x, z] of [[-0.38, -0.08], [-0.38, 0.08], [0.36, 0]]) b.box(0.05, 0.34, 0.05, { at: [x, 0, z], tones: 'timber', pattern: 'none' });
    for (const s of [-1, 1]) b.box(0.04, 0.6, 0.04, { at: [0.12, 0.4, s * 0.07], tones: 'timber', pattern: 'none' });
    b.box(0.05, 0.45, 0.05, { at: [-0.32, 0.4, 0], tones: 'timber', pattern: 'none' });
    b.box(0.12, 0.06, 0.06, { at: [-0.32, 0.85, 0], tones: 'plank' });
    b.cylinder(0.035, 0.035, 0.12, { at: [-0.32, 0.9, 0], tones: CLOTH.red, segments: 8 });
  });
  room.solidAt(swx, swz, 1.0, 0.45);
  const wheel = new Builder(room.engine, { name: 'house-2-wheel' });
  const wr = 0.42;
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; wheel.box(0.18, 0.04, 0.04, { at: [Math.cos(a) * wr, Math.sin(a) * wr, 0], rz: a + Math.PI / 2, tones: 'plank', origin: 'center' }); }
  for (let k = 0; k < 4; k++) wheel.box(wr * 2, 0.025, 0.025, { at: [0, 0, 0], rz: (k / 4) * Math.PI, tones: 'timber', origin: 'center' });
  wheel.box(0.08, 0.08, 0.1, { at: [0, 0, 0], tones: 'timber', origin: 'center' });
  const wheelG = wheel.build({ name: 'house-2-wheel' });
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(swx + 0.12, 0.95, swz);
  wheelPivot.add(wheelG);
  at(room, { x: swx - 0.75, z: swz + 0.35 }, (b) => {
    b.cylinder(0.24, 0.28, 0.24, { at: [0, 0, 0], tones: 'thatch', pattern: 'thatch', scale: 0.5, segments: 10 });
    for (const [x, z, y] of [[-0.08, -0.05, 0.24], [0.1, 0.04, 0.24], [0.0, 0.1, 0.25], [0.02, -0.02, 0.36]]) b.box(0.15, 0.13, 0.15, { at: [x, y, z], ry: x * 9, tones: CLOTH.red, layer: 'soft', tint: y > 0.3 ? 1.05 : 1 });
  });
  room.solidAt(swx - 0.75, swz + 0.35, 0.56, 0.56);

  // ---- the cutting table: an unrolled indigo bolt, shears, a pattern book, pins, a candle
  F.table(room, {
    x: 1.35, z: 0.55, w: 1.75, d: 0.85, items: false,
    extra: (b, g, top) => {
      b.cylinder(0.11, 0.11, 0.7, { at: [-0.62, top + 0.11, 0], tones: INDIGO, segments: 8 });
      b.box(1.1, 0.015, 0.62, { at: [0.0, top, 0.0], tones: INDIGO, layer: 'soft' });
      b.box(0.06, 0.012, 0.22, { at: [0.25, top + 0.016, 0.05], ry: 0.4, tones: 'iron' });
      b.box(0.06, 0.012, 0.22, { at: [0.28, top + 0.016, 0.05], ry: -0.2, tones: 'iron' });
      b.box(0.34, 0.05, 0.26, { at: [0.6, top, -0.18], tones: CLOTH.red, ry: -0.2 });
      for (let k = 0; k < 6; k++) b.box(0.03, 0.02, 0.03, { at: [-0.2 + k * 0.08, top + 0.016, 0.22], tones: [CLOTH.gold, 'cream', CLOTH.red][k % 3] });
      b.cylinder(0.06, 0.06, 0.02, { at: [0.7, top, 0.25], tones: 'brass', segments: 8 });
      b.box(0.05, 0.15, 0.05, { at: [0.7, top + 0.02, 0.25], tones: 'cream', pattern: 'none' });
      g.box(0.06, 0.07, 0.06, { at: [0.7, top + 0.17, 0.25], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    },
  });
  room.light({ pos: [2.05, 1.15, 0.8], color: GLOW.candle, r: 1.3, kind: 'lantern', intensity: 1.0 });
  F.stool(room, { x: 1.35, z: 1.3 });

  // ---- the skein rack: red skeins drying (and a few indigo / ochre / gold), front right
  at(room, { x: 3.45, z: 1.75 }, (b) => {
    for (const s of [-1, 1]) { b.box(0.08, 1.75, 0.08, { at: [s * 0.72, 0, 0], tones: 'timber', pattern: 'none' }); b.box(0.12, 0.05, 0.5, { at: [s * 0.72, 0, 0], tones: 'timber', pattern: 'none' }); }
    b.box(1.56, 0.06, 0.06, { at: [0, 1.7, 0], tones: 'plank', pattern: 'none' });
    const cols = [CLOTH.red, CLOTH.red, INDIGO, CLOTH.red, OCHRE, CLOTH.red, CLOTH.gold, CLOTH.red];
    cols.forEach((tones, k) => {
      const x = -0.6 + k * 0.17, len = 0.55 + (k % 3) * 0.08;
      b.box(0.11, len, 0.07, { at: [x, 1.7 - len, 0], tones, layer: 'soft', pattern: 'vboards', scale: 0.2 });
      b.box(0.08, 0.06, 0.08, { at: [x, 1.66 - len, 0], tones, tint: 0.94, layer: 'soft' });
    });
  });
  room.solidAt(3.45, 1.75, 1.6, 0.5);
  F.hangingLantern(room, { x: -2.85, z: 0.8, y: 1.35, r: 1.6, intensity: 1.0 });
  F.chest(room, { x: X - 0.3, z: -0.6, ry: -Math.PI / 2 });
  F.plant(room, { x: X - 0.4, z: -1.85 });
  F.rug(room, { x: 0.35, z: 0.9, w: 3.4, d: 2.2, tones: 'green', border: 'gold', pattern: 'stripes' });
  F.doormat(room, { x: 0, z: Z - 0.4 });

  // ---- the weaver's candle-stand before the tapestry: she works on it by night (its light picks the town out)
  at(room, { x: -1.0, z: BZ + 0.75 }, (b, g) => {
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; b.box(0.04, 0.04, 0.28, { at: [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], ry: -a + Math.PI / 2, tones: 'iron' }); }
    b.box(0.04, 1.25, 0.04, { at: [0, 0, 0], tones: 'iron' });
    b.cylinder(0.11, 0.09, 0.04, { at: [0, 1.25, 0], tones: 'brass', segments: 8 });
    b.box(0.06, 0.2, 0.06, { at: [0, 1.29, 0], tones: 'cream', pattern: 'none' });
    g.box(0.065, 0.08, 0.065, { at: [0, 1.49, 0], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
  });
  room.solidAt(-1.0, BZ + 0.75, 0.3, 0.3);

  // ---- lint floating in the bay light; at night the moon through the bay: the panes pale, three long silver window
  // patches dithered across the boards, the loom lamp's cream pool, the candles' small warm pools
  const inside = (u, w) => inPoly(poly, u, w);
  const lint = motes(room, {
    n: 30, seed: 22, box: { x0: 0.6, x1: 4.2, y0: 0.4, y1: 3.0, z0: -3.0, z1: 0.6 }, size: 0.04, glow: '#FFF6E2', mode: 'drift', speed: 0.12, sway: 0.2, name: 'lint',
    night: (b) => {
      // the moonlit glazing (the panes alone go navy): an overlay just inside each bay pane, with its round head
      for (const [k, u, w, h, y] of [[1, 0, 0.5, 2.0, 0.7], [2, -0.47, 0.76, 2.35, 0.55], [2, 0.47, 0.76, 2.35, 0.55], [3, 0, 0.5, 2.0, 0.7]]) {
        const sg = segs[k], gz = -T * 0.55 + 0.016;
        b.push({ at: [sg.mid[0], 0, sg.mid[1]], ry: sg.ry });
        b.box(w, h, 0.004, { at: [u, y, gz], tones: 'glass', layer: 'glass', glow: '#56689E', glowKind: 1 });
        b.prism(Array.from({ length: 9 }, (_, q) => { const a = (q / 8) * Math.PI; return [Math.cos(a) * w / 2, Math.sin(a) * w / 2]; }), 0.004, { at: [u, y + h + 0.06, 0.02], tones: 'glass', layer: 'glass', glow: '#62749E', glowKind: 1 });
        b.pop();
      }
      const fl = ditherCanvas({ plane: 'floor' });
      // each window throws a long silver streak from its sill into the room (densest at the sill, thinning out)
      for (const [x0, z0, dx] of [[1.2, -2.75, -0.2], [2.03, -3.0, -0.12], [2.97, -3.0, 0.12], [3.8, -2.75, 0.2]]) {
        for (let q = 0; q < 3; q++) {
          const f = q / 2, w = x0 === 2.03 || x0 === 2.97 ? 0.34 : 0.24;
          fl.pool({ x: x0 + dx * q * 1.4, v: z0 + 0.35 + q * 0.55, r: w + f * 0.08, r2: 0.5, color: '#7080B0', inner: '#A8B8E0', peak: 0.55 - f * 0.25, power: 1.0, clip: inside });
        }
      }
      fl.pool({ x: 3.05, v: -1.75, r: 1.0, r2: 0.75, color: '#A89070', inner: '#DCC092', peak: 0.38, clip: inside });   // the loom lamp
      fl.pool({ x: -2.85, v: 0.95, r: 0.9, r2: 0.7, color: '#A88456', inner: '#D8A866', peak: 0.36, clip: inside });   // the lantern
      fl.pool({ x: -0.75, v: BZ + 1.05, r: 0.85, r2: 0.6, color: '#A88456', inner: '#D8A866', peak: 0.34, clip: inside });   // the candle-stand
      fl.pool({ x: 2.25, v: 0.95, r: 0.7, r2: 0.55, color: '#A88456', inner: '#D8A866', peak: 0.32, clip: (u, w) => inside(u, w) && !(u < 2.05 && w > -0.2 && w < 2.0) });   // the table candle (floor)
      fl.draw(b);
      ditherCanvas({ plane: 'floor', y: 0.03 }).pool({ x: 2.1, v: 0.95, r: 0.7, r2: 0.55, color: '#A88456', inner: '#D8A866', peak: 0.32, clip: (u, w) => u < 2.05 && w > -0.2 && w < 2.0 }).draw(b);
      // the candle-stand's glow on the tapestry's lower left corner and the dado under it (in front of the cloth)
      ditherWall(b, back, [{ x: -1.0 - back.mid[0], v: 1.45, r: 0.75, r2: 0.6, color: '#9C8058', inner: '#D0A868', peak: 0.3 }], { z: 0.075 });
    },
  });

  // ---- at night the moon reaches the floor ONLY through the bay: a shadow-only lid (night only) with four window-shaped
  // holes, so the moonlight falls as long silver panes across the boards (and on the loom) while the rest of the
  // workshop is left to the lamp and the candles. (The tapestry is in the solid layer: 16 draw calls with the lid.)
  const panes = [[1.15, 0.5, -2.85], [2.03, 0.76, -3.15], [2.97, 0.76, -3.15], [3.85, 0.5, -2.85]];
  const lid = sunMask(room, { name: 'house-2-lid', cell: 0.1, margin: 8, nightOnly: true, open: (x, z) => panes.some(([xc, w, z0]) => Math.abs(x - xc) < w / 2 + 0.04 && z > z0 && z < z0 + 1.55) });

  room.spot('loom', 2.5, -1.25, Math.PI);
  room.spot('tapestry', -0.3, -1.2, Math.PI);
  room.spot('wheel', swx, swz + 0.75, Math.PI);

  return {
    bed: { x: bx, z: bz - 0.6, y: 0.55, facing: 0 },
    visit: { x: bx + 0.95, z: bz + 0.45, facing: -Math.PI / 2 },
    extras: [wheelPivot, lint.group, lid.group],
    update(t) {
      const k = Math.floor(t * 8) / 8;
      wheelG.rotation.z = -k * 1.4;
      lint.update(t);
      lid.update();
    },
    bedRect: bed.rect,
  };
}
