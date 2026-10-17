// house-8 interior: Hearthstone Cabin (owner: interiors 5-9 builder; LORE pass 2026-10-16). docs/INTERIORS.md, docs/LORE.md.
// A woodcutter / hunter who boarded up the window that faces the forest. Rugged, braced for night.
//   ROOM: a LOW LOG CABIN (2.35 m) of dark round-log walls, a heavy corner post, a dark plank
//   floor. A HUGE CORNER HEARTH fills the back-left corner on the diagonal (a fieldstone mass to the roof, a roaring fire,
//   antlers over the mantel beam, a pot on its crane), firewood stacked to the roof along the right wall, the bed in the
//   back-right under furs.
//   STORY: the BOARDED WINDOW on the back wall, with CLAW MARKS gouged pale across the boards and on into the logs; the
//   hunter's SKETCHES of "the beast of the Gloamwood" pinned beside it (a hunched shape with two red eyes, a paw print
//   far too big, a map of the wood with an X); a wolf pelt on the floor; the axe left in the chopping block; a hunting
//   knife stuck upright in the supper table; a sprung-open iron trap set by the door; the door bar leaning ready.
//   LIGHT: roaring orange firelight from one side (two fire anchors: the hearth mouth and its floor glow), deep shadow in
//   the far corner; one candle stub at the table and the Lantern-maker's lantern on its peg by the boarded window.
//   AMBIANCE: embers spiralling up out of the hearth mouth and grey ash drifting down (stepped 8 fps).
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 8.4, d: 5.6, h: 2.35, wall: 'planks', pal: 2, floor: 'boards' };

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** One mesh of n tiny glowing boxes whose centres follow pos(k, t) -> [x, y, z, scale] (room-local), stepped 8 fps. */
function motes(room, ctx, name, n, colorOf, size, pos) {
  const pb = new Builder(room.engine, { name });
  for (let k = 0; k < n; k++) pb.box(size, size, size, { at: [0, 0, 0], origin: 'center', tones: 'glass', layer: 'glass', glow: colorOf(k), glowKind: 1 });
  const grp = pb.build({ name, castShadow: false });
  const mesh = grp.children[0];
  mesh.material = ctx.kit.interiorGlowMaterial(room.engine);
  mesh.castShadow = false; mesh.frustumCulled = false;
  const pa = mesh.geometry.getAttribute('position'), base = Float32Array.from(pa.array), per = pa.count / n;
  let last = -1;
  const update = (t) => {
    const tq = Math.floor(t * 8) / 8;
    if (tq === last) return;
    last = tq;
    for (let k = 0; k < n; k++) {
      const [x, y, z, s = 1] = pos(k, tq);
      for (let v = k * per; v < (k + 1) * per; v++) {
        pa.array[v * 3] = base[v * 3] * s + x; pa.array[v * 3 + 1] = base[v * 3 + 1] * s + y; pa.array[v * 3 + 2] = base[v * 3 + 2] * s + z;
      }
    }
    pa.needsUpdate = true;
  };
  update(0);
  return { group: grp, update };
}
const hash = (k) => { const h = Math.sin(k * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };

export default function build(room, ctx) {
  const { FURNITURE: F, WALL: Wl, GLOW, TOWN_PALETTE: TP, paintRamp } = ctx;
  const W = room.W, D = room.D, H = room.H, BZ = -D / 2;
  const b = room.b, g = room.g;
  const LOG = paintRamp('#6e4630', { lightness: 0.38 });                // warm logs: the firelight reads orange on them
  const FUR = paintRamp('#6e6460', { lightness: 0.42 });
  const PELT = paintRamp('#8a827e', { lightness: 0.5 });
  const CUT = paintRamp('#c8a070', { lightness: 0.62 });               // fresh-cut wood / claw-gouge pale
  const glow = (bb, w, h, d, at, color, kind = 1, extra = {}) => bb.box(w, h, d, { at, tones: 'glass', layer: 'glass', glow: color, glowKind: kind, ...extra });

  // ---- shell: round-log walls, dark planks; the window on the back wall (it gets boarded up below)
  const WX = 1.35, WY = 0.95, WW = 1.0, WH = 1.0;
  room.shell({
    windows: [{ x: WX, y: WY, w: WW, h: WH, panes: [2, 2], curtains: null }],
    wallTones: { upper: { tones: LOG, pattern: 'logs' }, lower: { tones: LOG, pattern: 'logs' } },
    dado: 0, floorTones: paintRamp('#6e4a30', { lightness: 0.4 }), floorPattern: 'planks',
  });
  // a heavy corner post in the back-right corner
  b.box(0.22, H, 0.22, { at: [W / 2 - 0.11, 0, BZ + 0.11], tones: 'timber', pattern: 'none' });
  // ---- the HUGE CORNER HEARTH (back-left, on the diagonal): fieldstone to the roof, a roaring fire
  const FW = 2.3, ext = (FW / 2) * Math.SQRT1_2;
  const Fx = -W / 2 + ext, Fz = BZ + ext;                                  // centre of the hearth face
  const NX = Math.SQRT1_2, NZ = Math.SQRT1_2;                              // the face normal (into the room)
  // the stone mass filling the corner behind the face
  const LEG = 2 * ext - 0.55 * Math.SQRT2;                                   // (set back behind the firebox recess)
  b.prism([[-W / 2, -BZ], [-W / 2, -(BZ + LEG)], [-W / 2 + LEG, -BZ]], H + 0.12, { at: [0, (H + 0.12) / 2, 0], rx: -Math.PI / 2, tones: 'stone', pattern: 'rubble', scale: 0.8 });
  const hearth = (fn) => { b.push({ at: [Fx, 0, Fz], ry: Math.PI / 4 }); g.push({ at: [Fx, 0, Fz], ry: Math.PI / 4 }); try { fn(); } finally { b.pop(); g.pop(); } };
  hearth(() => {
    const OW = 1.3, OH = 1.05, DP = 0.55;                                  // opening, depth of the recess
    for (const s of [-1, 1]) b.box((FW - OW) / 2, OH, DP + 0.1, { at: [s * (OW / 2 + (FW - OW) / 4), 0, -DP / 2 + 0.05], tones: 'stone', pattern: 'rubble', scale: 0.7 });
    b.box(FW, 0.32, DP + 0.12, { at: [0, OH, -DP / 2 + 0.06], tones: 'stone', pattern: 'rubble', scale: 0.7, tint: 1.04 });
    b.box(FW + 0.2, 0.14, 0.32, { at: [0, OH + 0.32, 0.06], tones: 'timber', pattern: 'none' });          // the mantel beam
    b.box(FW - 0.1, H - OH - 0.46, DP, { at: [0, OH + 0.46, -DP / 2], tones: 'stone', pattern: 'rubble', scale: 0.7, tint: 0.96 });
    b.box(OW, OH, 0.06, { at: [0, 0, -DP + 0.03], tones: 'crow', pattern: 'none' });                     // sooty back
    b.box(OW, 0.04, DP, { at: [0, 0, -DP / 2], tones: 'crow', pattern: 'none' });
    b.box(FW + 0.5, 0.1, 0.85, { at: [0, 0, 0.42], tones: 'ashlar', pattern: 'ashlar', scale: 0.8, tint: 0.94 });   // raised hearth slab
    // logs + a roaring fire (embers, big tongues)
    for (const [x, y, rz, l] of [[0, 0.06, 0.1, 0.9], [-0.05, 0.17, -0.15, 0.8], [0.12, 0.27, 0.3, 0.6]]) b.box(l, 0.13, 0.14, { at: [x, y, -0.3], rz, tones: 'trunk', pattern: 'none' });
    glow(g, 1.0, 0.05, 0.4, [0, 0.04, -0.28], GLOW.ember, 2);
    const T = [[-0.42, 0.34, GLOW.fire], [-0.25, 0.58, GLOW.fire], [-0.06, 0.74, GLOW.fire], [0.12, 0.66, GLOW.fire], [0.3, 0.5, GLOW.fire], [0.44, 0.3, GLOW.fire],
      [-0.3, 0.3, GLOW.flame], [-0.08, 0.46, GLOW.flame], [0.15, 0.4, GLOW.flame], [0.32, 0.24, GLOW.flame], [0.0, 0.26, GLOW.candle]];
    for (const [x, h, c] of T) glow(g, c === GLOW.fire ? 0.15 : 0.1, h, 0.12, [x, 0.12, c === GLOW.fire ? -0.32 : -0.2], c, 2);
    // the crane and its pot, swung half out
    b.box(0.05, OH - 0.05, 0.05, { at: [-OW / 2 + 0.1, 0, -0.1], tones: 'iron' });
    b.box(0.5, 0.04, 0.04, { at: [-OW / 2 + 0.33, OH - 0.25, 0.02], ry: -0.5, tones: 'iron' });
    b.box(0.015, 0.2, 0.015, { at: [-0.32, OH - 0.45, 0.12], tones: 'iron' });
    b.cylinder(0.14, 0.18, 0.2, { at: [-0.32, OH - 0.7, 0.12], tones: 'iron', segments: 8 });
    // antlers over the mantel, a powder horn + a pair of boots drying on the slab
    for (const s of [-1, 1]) {
      b.box(0.05, 0.42, 0.05, { at: [s * 0.14, OH + 0.6, 0.02], rz: -s * 0.6, tones: 'cream', pattern: 'none' });
      b.box(0.04, 0.22, 0.04, { at: [s * 0.3, OH + 0.82, 0.02], rz: -s * 0.15, tones: 'cream', pattern: 'none' });
      b.box(0.04, 0.18, 0.04, { at: [s * 0.2, OH + 0.88, 0.02], rz: s * 0.3, tones: 'cream', pattern: 'none' });
    }
    b.box(0.2, 0.14, 0.12, { at: [0, OH + 0.52, 0.0], tones: 'cream', pattern: 'none' });
    b.box(0.22, 0.05, 0.05, { at: [0.6, OH + 0.46, 0.1], rz: 0.3, tones: TP.thatch });
    for (const s of [-1, 1]) {
      b.box(0.12, 0.26, 0.2, { at: [0.85 + s * 0.08, 0.1, 0.45], tones: 'timber', pattern: 'none' });
      b.box(0.12, 0.07, 0.26, { at: [0.85 + s * 0.08, 0.1, 0.5], tones: 'timber', pattern: 'none', tint: 0.94 });
    }
  });
  // collision for the hearth mass + slab (stepped rects along the diagonal)
  for (let i = 0; i < 4; i++) {
    const f = (i + 1) / 4;
    room.solid(-W / 2, BZ, -W / 2 + 2 * ext * f + 0.35, BZ + 2 * ext * (1 - f) + 0.6);
  }
  const fire = [Fx + NX * 0.1, 0.55, Fz + NZ * 0.1];
  // the hearth is THE key light: five fire anchors fanned out from the mouth (the pool reaches the middle of the room,
  // the back wall's sketches and the left wall); the far right (bed, woodpile) is left to the dark
  room.light({ pos: fire, color: '#FF7A2A', r: 6.6, kind: 'fire', intensity: 2.8 });
  room.light({ pos: [Fx + NX * 1.6, 0.9, Fz + NZ * 1.6], color: '#FF8A30', r: 4.4, kind: 'fire', intensity: 2.6 });
  room.light({ pos: [Fx + NX * 3.1, 1.3, Fz + NZ * 3.1], color: '#FF9A40', r: 3.6, kind: 'lantern', intensity: 2.0 });
  room.light({ pos: [Fx + 2.3, 1.2, BZ + 0.75], color: '#FF8A30', r: 3.4, kind: 'lantern', intensity: 2.1 });
  room.light({ pos: [-W / 2 + 0.75, 1.1, Fz + 2.6], color: '#FF8030', r: 3.2, kind: 'lantern', intensity: 2.0 });
  F.logs(room, { x: -1.55, z: BZ + 0.45, ry: 0.2 });

  // ---- the back wall: the BOARDED WINDOW with CLAW MARKS, the hunter's SKETCHES of the beast, the lantern
  room.wallFrame('back', ({ full, glow: wg }) => {
    // boards nailed across the window, slightly askew, with gaps the light comes through
    for (const [dy, rz, w] of [[0.06, 0.04, 1.35], [0.34, -0.05, 1.3], [0.6, 0.03, 1.4], [0.86, -0.02, 1.32]]) {
      full.box(w, 0.2, 0.05, { at: [WX, WY + dy - 0.06, 0.06], rz, tones: 'plank', pattern: 'none', tint: rz > 0 ? 1.03 : 0.95 });
      for (const s of [-1, 1]) full.box(0.03, 0.03, 0.02, { at: [WX + s * (w / 2 - 0.08), WY + dy + 0.03, 0.09], tones: 'iron' });
    }
    full.box(1.5, 0.16, 0.05, { at: [WX, WY + 0.45, 0.1], rz: 0.62, tones: 'plank', pattern: 'none', tint: 0.94 });   // the diagonal brace
    // the claw marks: three long pale gouges raking down across the boards and on into the logs
    for (let i = 0; i < 3; i++) {
      full.box(0.035, 1.25, 0.02, { at: [WX - 0.12 + i * 0.13, WY + 0.05 + i * 0.03, 0.13], rz: 0.42, tones: CUT, pattern: 'none' });
    }
    for (let i = 0; i < 3; i++) full.box(0.03, 0.55, 0.012, { at: [WX + 0.85 + i * 0.1, WY + 0.95 - i * 0.04, 0.02], rz: 0.35, tones: CUT, pattern: 'none' });
    // the sketches of the beast, nailed up between the hearth and the window
    const sheet = (x, y, w, h, rz) => { full.box(w, h, 0.012, { at: [x, y, 0.03], rz, tones: 'cream', pattern: 'none' }); full.box(0.025, 0.025, 0.02, { at: [x, y + h - 0.04, 0.04], tones: 'iron' }); };
    sheet(-0.95, 1.08, 0.62, 0.5, 0.04);                                       // the beast: a hunched shape, red eyes
    full.box(0.36, 0.18, 0.012, { at: [-0.95, 1.17, 0.04], rz: 0.1, tones: 'crow', pattern: 'none' });
    full.box(0.16, 0.16, 0.012, { at: [-0.75, 1.26, 0.041], rz: -0.2, tones: 'crow', pattern: 'none' });
    for (const s of [-1, 1]) full.box(0.03, 0.09, 0.012, { at: [-0.75 + s * 0.05, 1.4, 0.041], rz: s * 0.3, tones: 'crow', pattern: 'none' });   // ears
    for (const dx of [-1.12, -1.0, -0.86]) full.box(0.035, 0.12, 0.012, { at: [dx, 1.08, 0.041], tones: 'crow', pattern: 'none' });           // legs
    for (const dx of [-0.79, -0.71]) wg.box(0.03, 0.025, 0.01, { at: [dx, 1.33, 0.05], tones: 'glass', layer: 'glass', glow: '#FF3A2A', glowKind: 1 });
    sheet(-0.2, 1.24, 0.42, 0.42, -0.06);                                      // the paw print, far too big
    full.box(0.18, 0.15, 0.012, { at: [-0.2, 1.3, 0.04], tones: 'crow', pattern: 'none' });
    for (const [dx, dy] of [[-0.11, 0.48], [-0.04, 0.53], [0.04, 0.53], [0.11, 0.48]]) full.box(0.06, 0.07, 0.012, { at: [-0.2 + dx, 1.24 + dy - 0.04, 0.04], tones: 'crow', pattern: 'none' });
    sheet(-0.6, 1.65, 0.5, 0.36, -0.1);                                        // a map of the wood with an X
    for (let i = 0; i < 6; i++) full.box(0.05, 0.07, 0.012, { at: [-0.78 + (i % 3) * 0.12, 1.72 + Math.floor(i / 3) * 0.12, 0.04], tones: 'leaf', pattern: 'none' });
    for (const s of [-1, 1]) full.box(0.14, 0.025, 0.012, { at: [-0.42, 1.82, 0.042], rz: s * 0.8, origin: 'center', tones: TP.bannerRed, pattern: 'none' });
    // the bow and quiver, and a hung trap, right of the window
    for (let k = 0; k < 7; k++) { const a = -0.9 + (k / 6) * 1.8; full.box(0.04, 0.2, 0.03, { at: [2.6 + Math.cos(a) * 0.12, 1.45 + Math.sin(a) * 0.55, 0.04], rz: a, origin: 'center', tones: 'timber', pattern: 'none' }); }
    full.box(0.01, 1.08, 0.01, { at: [2.5, 0.92, 0.05], tones: 'cream', pattern: 'none' });
    full.box(0.14, 0.55, 0.1, { at: [2.95, 1.0, 0.06], rz: -0.15, tones: TP.thatch, pattern: 'none', tint: 0.94 });
    for (const dx of [-0.03, 0.02, 0.06]) full.box(0.02, 0.16, 0.02, { at: [2.92 + dx, 1.52, 0.07], tones: 'cream', pattern: 'none' });
  });
  Wl.sconce(room, { wall: 'back', x: 0.45, y: 1.85, r: 1.4 });
  // the bed in the back-right corner under furs; a stump beside it with a candle stub
  const BX = W / 2 - 0.62, BZc = BZ + 1.05;
  const bed = F.bed(room, { x: BX, z: BZc, quilt: FUR, frame: 'timber' });
  b.box(1.1, 0.05, 0.8, { at: [BX, 0.52, BZc + 0.4], ry: 0.1, tones: PELT, pattern: 'none' });
  b.cylinder(0.2, 0.22, 0.5, { at: [BX - 0.95, 0, BZ + 0.35], tones: 'trunk', segments: 8 });
  b.box(0.05, 0.07, 0.05, { at: [BX - 0.95, 0.5, BZ + 0.35], tones: 'cream', pattern: 'none' });
  room.solid(BX - 1.17, BZ + 0.12, BX - 0.73, BZ + 0.58);

  // ---- the firewood stacked to the roof along the right wall (cut ends toward the room)
  const PX0 = W / 2 - 0.72, PZ0 = -0.35, PZ1 = 1.9;
  b.box(0.7, 2.0, PZ1 - PZ0, { at: [PX0 + 0.35, 0, (PZ0 + PZ1) / 2], tones: 'trunk', pattern: 'logs' });
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
    const x = PX0 + 0.1 + c * 0.17 + (r % 2) * 0.04, y = 0.1 + r * 0.32;
    b.push({ at: [x, y, PZ1 + 0.02], rx: Math.PI / 2 });
    b.cylinder(0.085, 0.085, 0.04, { at: [0, 0, 0], tones: 'trunk', segments: 6 });
    b.cylinder(0.06, 0.06, 0.05, { at: [0, 0, 0], tones: CUT, segments: 6, tint: [1, 0.94, 1.05][(r + c) % 3] });
    b.pop();
  }
  room.solid(PX0, PZ0, W / 2, PZ1 + 0.06);

  // ---- the wolf pelt on the floor before the hearth
  const pelt = [[0, 0.62], [0.2, 0.5], [0.42, 0.62], [0.36, 0.3], [0.5, 0.0], [0.38, -0.36], [0.5, -0.64], [0.18, -0.48], [0, -0.7],
    [-0.18, -0.48], [-0.5, -0.64], [-0.38, -0.36], [-0.5, 0.0], [-0.36, 0.3], [-0.42, 0.62], [-0.2, 0.5]];
  b.prism(pelt, 0.02, { at: [-1.55, 0.012, -0.05], rx: -Math.PI / 2, ry: 0.9, tones: PELT });
  b.push({ at: [-1.55, 0, -0.05], ry: 0.9 });
  b.box(0.12, 0.024, 1.0, { at: [0, 0.012, 0], tones: FUR, pattern: 'none' });
  b.box(0.3, 0.1, 0.26, { at: [0, 0.01, -0.78], tones: PELT, pattern: 'none' });                     // the head
  for (const s of [-1, 1]) b.box(0.07, 0.08, 0.05, { at: [s * 0.1, 0.1, -0.84], tones: FUR, pattern: 'none' });
  b.box(0.12, 0.06, 0.12, { at: [0, 0.01, -0.95], tones: PELT, pattern: 'none', tint: 0.94 });
  b.pop();

  // ---- the supper table: a stew bowl, a candle stub, a cup, the hunting knife stuck upright; a bench
  const TX = 0.85, TZ = 0.55;
  F.table(room, {
    x: TX, z: TZ, w: 1.6, d: 0.8, items: false,
    extra: (bb, gg, top) => {
      bb.cylinder(0.13, 0.09, 0.07, { at: [-0.35, top, 0.05], tones: 'plank', segments: 8 });
      bb.cylinder(0.11, 0.11, 0.01, { at: [-0.35, top + 0.07, 0.05], tones: TP.pumpkin, segments: 8, tint: 0.94 });
      bb.box(0.02, 0.02, 0.2, { at: [-0.22, top + 0.06, 0.05], ry: 0.6, tones: 'plank' });
      bb.cylinder(0.05, 0.05, 0.11, { at: [0.0, top, -0.2], tones: 'iron', segments: 8 });
      bb.box(0.06, 0.06, 0.06, { at: [0.35, top, 0.15], tones: 'cream', pattern: 'none' });           // the candle stub
      gg.box(0.05, 0.06, 0.05, { at: [0.35, top + 0.06, 0.15], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
      bb.box(0.035, 0.24, 0.012, { at: [0.15, top, 0.05], rz: 0.12, tones: 'iron', tint: 1.06 });     // the knife, stuck upright
      bb.box(0.04, 0.12, 0.04, { at: [0.18, top + 0.24, 0.05], rz: 0.12, tones: 'timber' });
      bb.box(0.1, 0.03, 0.04, { at: [0.18, top + 0.24, 0.05], rz: 0.12, tones: 'brass' });
      bb.box(0.18, 0.04, 0.06, { at: [0.6, top, -0.18], ry: 0.3, tones: 'stone', pattern: 'none' });    // whetstone
    },
  });
  room.light({ pos: [TX + 0.35, 1.05, TZ + 0.3], color: GLOW.candle, r: 1.5, kind: 'lantern', intensity: 0.8 });
  b.box(1.5, 0.07, 0.3, { at: [TX, 0.42, TZ - 0.65], tones: 'plank', pattern: 'none' });
  for (const s of [-1, 1]) b.box(0.08, 0.42, 0.26, { at: [TX + s * 0.6, 0, TZ - 0.65], tones: 'timber', pattern: 'none' });
  room.solid(TX - 0.76, TZ - 0.82, TX + 0.76, TZ - 0.48);

  // ---- front of the room: the axe in the chopping block, the door bar leaning ready, a sprung trap by the door
  const CX = 2.55, CZ = 1.95;
  b.cylinder(0.3, 0.33, 0.48, { at: [CX, 0, CZ], tones: 'trunk', segments: 8 });
  b.cylinder(0.3, 0.3, 0.02, { at: [CX, 0.48, CZ], tones: CUT, segments: 8 });
  b.push({ at: [CX + 0.05, 0.5, CZ], rz: -0.55 });
  b.box(0.05, 0.75, 0.05, { at: [0, 0.0, 0], tones: 'plank', pattern: 'none' });
  b.box(0.06, 0.1, 0.22, { at: [0, -0.04, 0.0], rz: 0, ry: Math.PI / 2, tones: 'iron', tint: 1.06 });
  b.pop();
  for (const [dx, dz, ry] of [[-0.45, 0.15, 0.3], [-0.5, -0.2, 1.2], [0.4, 0.3, 2.0]]) b.box(0.22, 0.06, 0.1, { at: [CX + dx, 0, CZ + dz], ry, tones: CUT, pattern: 'none' });   // kindling
  room.solidAt(CX, CZ, 0.66, 0.66);
  b.hexa([V(-W / 2 + 0.05, 0, 1.2), V(-W / 2 + 0.17, 0, 1.2), V(-W / 2 + 0.05, 1.9, 1.75), V(-W / 2 + 0.17, 1.9, 1.75),
    V(-W / 2 + 0.05, 0, 1.33), V(-W / 2 + 0.17, 0, 1.33), V(-W / 2 + 0.05, 1.9, 1.88), V(-W / 2 + 0.17, 1.9, 1.88)], { tones: 'timber' });   // the door bar
  const TRX = -1.2, TRZ = 2.1;                                               // the trap, jaws open
  b.box(0.36, 0.03, 0.08, { at: [TRX, 0, TRZ], tones: 'iron' });
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    const a = (k / 5) * Math.PI;
    b.box(0.05, 0.04, 0.03, { at: [TRX + Math.cos(a) * 0.17, 0.02, TRZ + s * Math.sin(a) * 0.17], ry: a, tones: 'iron', tint: 1.06 });
  }
  for (let k = 0; k < 5; k++) b.box(0.05, 0.02, 0.03, { at: [TRX + 0.25 + k * 0.05, 0, TRZ + 0.12 + k * 0.03], ry: 0.5 * (k % 2), tones: 'iron' });
  b.box(1.0, 0.02, 0.55, { at: [0, 0.002, D / 2 - 0.4], tones: FUR, pattern: 'none' });           // a hide by the door
  F.barrel(room, { x: -W / 2 + 0.5, z: D / 2 - 0.55 });                     // salted meat
  F.sacks(room, { x: -W / 2 + 1.45, z: D / 2 - 0.4, n: 2 });

  // ---- embers spiralling up out of the hearth mouth, grey ash drifting down (stepped 8 fps)
  const EC = ['#FFB040', '#FF7A2A', '#FFE08A', '#FF9A40'];
  const fx0 = Fx - NX * 0.25, fz0 = Fz - NZ * 0.25;
  const embers = motes(room, ctx, 'house-8-embers', 20, (k) => (k < 14 ? EC[k % 4] : '#7E7884'), 0.04, (k, t) => {
    if (k < 14) {
      const P = 2.0 + hash(k) * 1.2, u = (((t + hash(k + 3) * P) % P) + P) % P / P;
      const out = u * (0.6 + hash(k + 5) * 0.9), sway = Math.sin(u * 9 + k) * 0.12;
      return [fx0 + NX * out + sway * NZ, 0.45 + u * 1.75, fz0 + NZ * out - sway * NX, u < 0.85 ? 1 - u * 0.5 : 0];
    }
    const P = 5 + hash(k) * 3, u = (((t + hash(k + 7) * P) % P) + P) % P / P;
    const x0 = fx0 + NX * (0.8 + hash(k + 1) * 1.6), z0 = fz0 + NZ * (0.8 + hash(k + 2) * 1.6);
    return [x0 + Math.sin(u * 6 + k) * 0.3, 2.0 - u * 1.9, z0 + Math.cos(u * 5 + k) * 0.2, 0.9];
  });

  room.spot('hearth', Fx + NX * 1.3, Fz + NZ * 1.3, -Math.PI * 0.75);
  room.spot('table', TX, TZ + 0.9, Math.PI);
  room.spot('window', WX, BZ + 0.9, Math.PI);

  return {
    bed: { x: BX, z: BZc - 0.6, y: 0.55, facing: 0 },
    visit: { x: BX - 0.95, z: BZc + 0.6, facing: Math.PI / 2 },
    extras: [embers.group],
    update(t) { embers.update(t); },
    bedRect: bed.rect,
  };
}
