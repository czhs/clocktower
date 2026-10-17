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
//   LIGHT: roaring orange firelight from one side (fire anchors + a painted dithered fan at night), deep shadow in
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

// ---- night light pools (night pass 2026-10-16; the critic's "hard-edged coloured discs"): the toon point-light pools are
// quantised into a few hard bands, so the soft falloff of each lamp / fire / glow is PAINTED instead: a 4x4 Bayer-dithered
// field of up to 3 tones per source on the floor (+ the back wall), run-merged quads in ONE glow mesh, shown only while
// the sky is dark (engine.style.sky) and hidden when the back wall is cut away (camera turned to face it).
//   src = pool(x, z, r, cols [dim, mid, hot], {peak 1, sx 1, sz 1, kind 1 steady | 2 flicker, pow 1.3}) (back wall: x, y)
//         ring(x, z, R, w, cols, opts): a halo around a circle of radius R, w wide
//   tops [{in(u, v), y, cols}]: raised surfaces (a pelt, a hearth slab) re-painted in their own lit tones (checked first)
//   panes [{x0, x1, y0, y1}]: back-wall openings (windows) the wall field leaves alone
//   tone {at(u, v, cu, cv) -> variant index, mul: [[r, g, b], ...]}: the floor's own pattern (harlequin tiles, flag joints)
//   kept in the light; flagJoints(ctx, scale) = the kit's ashlar floor joints (kit.js kitBlocks: rows 0.32, blocks 0.58)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const pool = (x, z, r, cols, { peak = 1, sx = 1, sz = 1, kind = 1, pow = 1.3 } = {}) => ({
  cols, kind, at: (u, v) => { const d = Math.hypot((u - x) / sx, (v - z) / sz) / r; return d >= 1 ? 0 : peak * (1 - d) ** pow; },
});
const ring = (x, z, R, w, cols, { peak = 1, kind = 1, pow = 1.3 } = {}) => ({
  cols, kind, at: (u, v) => { const d = Math.abs(Math.hypot(u - x, v - z) - R) / w; return d >= 1 ? 0 : peak * (1 - d) ** pow; },
});
function flagJoints(ctx, sc = 1.7) {
  const ox = 200 + 30 * ctx.index + 0.0047 + 0.0037, oz = 20 + 0.0071, CH = 0.32, BW = 0.58;   // index.js originOf + the pattern phase
  return {
    mul: [[1, 1, 1], [0.76, 0.76, 0.76]],
    at: (u, v, cu, cv) => {
      const X = (ox + u) / sc, Y = (-(oz + v) + 0.0061) / sc, hy = cv / 2 / sc, hx = cu / 2 / sc;
      if (Math.floor((Y - hy) / CH) !== Math.floor((Y + hy) / CH)) return 1;
      const xs = X + (((Math.floor(Y / CH) % 2) + 2) % 2) * 0.5 * BW;
      return Math.floor((xs - hx) / BW) !== Math.floor((xs + hx) / BW) ? 1 : 0;
    },
  };
}
function lightPools(room, ctx, name, { floor = [], back = [], y = 0.006, raise = [], holes = [], seams = null, tops = [], panes = [], tone = null, extra = null, cell = 3, band = 0.5, dark = 0.1 } = {}) {
  const { W, D, H, T } = room, BZ = -D / 2;
  // the dither cell = `cell` texels of the room's own camera (index.js buildInterior: viewHeight over 360 rows); each band
  // step is dithered only over the middle `band` of its range (solid rings between: long merged runs, few triangles)
  const sF = 0.866 * 0.5 - 0.5 * (D / 2 + T + 0.1), sB = 0.866 * (H + 0.2) - 0.5 * (-D / 2 - T);
  const vh = Math.max((sB - sF) * 1.1, ((W + 2 * T + 0.6) / (16 / 9)) * 1.04), tx = (cell * vh) / 360;
  const pb = new Builder(room.engine, { name });
  const solids = room.colliders.filter((c) => c.kind !== 'wall');
  const inR = (r, u, v, e = 0) => u > r.x0 + e && u < r.x1 - e && v > r.z0 + e && v < r.z1 - e;
  const under = (u, v) => solids.some((c) => inR(c, u, v, 0.04)) || holes.some((r) => (typeof r === 'function' ? r(u, v) : inR(r, u, v)));
  // seams {z: pitch, x: pitch (0 = none), x0, z0}: the floor's plank / flag joints, one band darker (the lit floor keeps
  // its pattern instead of turning into a flat painted rug)
  const seam = (u, v, cu, cv) => !!seams && ((seams.z > 0 && Math.abs(((v - (seams.z0 ?? 0)) % seams.z + seams.z) % seams.z) < cv * 0.999)
    || (seams.x > 0 && Math.abs(((u - (seams.x0 ?? 0)) % seams.x + seams.x) % seams.x) < cu * 0.999));
  let quads = 0;
  const field = (srcs, u0, u1, v0, v1, cu, cv, skip, emit, joints = false) => {
    for (let j = 0; v0 + (j + 0.5) * cv < v1; j++) {
      const v = v0 + (j + 0.5) * cv;
      let run = null;
      const flush = () => { if (run) { emit(run.a, run.b, v - cv / 2, v + cv / 2, run.s, run.lev, run.vk); quads++; run = null; } };
      for (let i = 0; u0 + (i + 0.5) * cu < u1; i++) {
        const u = u0 + (i + 0.5) * cu;
        let best = 0, bs = null, sum = 0;
        for (const s of srcs) { const val = s.at(u, v); sum += val; if (val > best) { best = val; bs = s; } }
        let lev = 0;
        const top = tops.find((q) => q.in(u, v)) ?? null;
        if (bs && (top || !skip(u, v))) {
          const L = Math.min(sum, 1) * 3;
          const f = Math.min(1, Math.max(0, (L - Math.floor(L) - 0.5 + band / 2) / band));
          lev = Math.min(3, Math.floor(L) + (f > BAYER[(j & 3) * 4 + (i & 3)] ? 1 : 0));
          if (joints && !top && lev && seam(u, v, cu, cv)) lev--;
        }
        const ss = top && lev ? (top.src ??= { cols: top.cols, kind: top.kind ?? 1, y: top.y }) : bs;
        const vk = joints && !top && tone ? tone.at(u, v, cu, cv) : 0;
        if (lev && run && run.s === ss && run.lev === lev && run.vk === vk) run.b = u + cu / 2;
        else { flush(); if (lev) run = { a: u - cu / 2, b: u + cu / 2, s: ss, lev, vk }; }
      }
      flush();
    }
  };
  const tinted = new Map();
  const colOf = (c, vk) => {
    if (!vk || !tone) return c;
    const key = c + vk;
    if (!tinted.has(key)) { const m = tone.mul[vk], q = new THREE.Color(c); tinted.set(key, new THREE.Color(q.r * m[0], q.g * m[1], q.b * m[2]).getHex()); }
    return tinted.get(key);
  };
  const opt = (s, lev, vk = 0) => ({ tones: 'glass', layer: 'glass', glow: colOf(s.cols[lev - 1], vk), glowKind: s.kind });
  if (floor.length) {
    const yAt = (u, v) => { for (const r of raise) if (inR(r, u, v)) return r.y; return y; };
    field(floor, -W / 2, W / 2, BZ, D / 2, tx, tx * 2, under, (a, b, z0, z1, s, lev, vk) => {
      const yy = s.y ?? yAt((a + b) / 2, (z0 + z1) / 2);
      pb.tris([a, yy, z0, a, yy, z1, b, yy, z1, a, yy, z0, b, yy, z1, b, yy, z0], opt(s, lev, vk));
    }, true);
  }
  if (back.length) {
    const z = BZ + 0.004;
    const t0 = tops; tops = [];
    field(back, -W / 2, W / 2, 0.02, H, tx, tx / 0.866, (u, v) => panes.some((q) => u > q.x0 && u < q.x1 && v > q.y0 && v < q.y1), (a, b, y0, y1, s, lev) => {
      pb.tris([a, y0, z, b, y0, z, b, y1, z, a, y0, z, b, y1, z, a, y1, z], opt(s, lev));
    });
    tops = t0;
  }
  extra?.(pb, tx);                                              // more night-only glow (pb: room-local, 'glass' layer)
  const grp = pb.build({ name, castShadow: false });
  grp.traverse((o) => { if (o.isMesh) { o.material = ctx.kit.interiorGlowMaterial(room.engine); o.castShadow = false; o.receiveShadow = false; } });
  const E = room.engine;
  const update = () => {
    const c = E.style?.sky, lum = c?.isColor ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : (ctx.tod === 'night' ? 0 : 1);
    const yaw = E.camera?.targetYaw ?? E.camera?.yaw ?? 0;
    grp.visible = lum < dark && Math.cos(yaw) > -0.3;
  };
  update();
  return { group: grp, update, quads };
}

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
  const fire = [Fx + NX * 0.02, 0.55, Fz + NZ * 0.02];                       // (at the mouth: a spill on the slab, no floor disc)
  // the hearth is THE key light: fire anchors out in front of the mouth warm the slab, the pelt, the logs and the table
  // (night pass: short reaches, kept off the walls and the hearth face, so the toon pools never draw a disc; the soft fan
  // across the floor and up the logs is painted by lightPools below); the far right (bed, woodpile) is left to the dark
  // (polish 2026-10-16: by day / golden hour - no painted pools then - the r 1.8 / 2.2 / 1.4 anchors left flat red hard
  // circles on the planks. Now only the fire anchor reaches down, onto the raised slab; the others stop short of the
  // floor and warm the hearth face, the mantel, the logs and the pelt's edge; the floor fan is painted at night)
  room.light({ pos: fire, color: '#FF7A2A', r: 0.62, kind: 'fire', intensity: 1.2, hug: false });
  room.light({ pos: [Fx + NX * 1.6, 1.45, Fz + NZ * 1.6], color: '#FF8A30', r: 1.4, kind: 'fire', intensity: 1.2 });
  room.light({ pos: [Fx + NX * 3.1, 1.9, Fz + NZ * 3.1], color: '#FF9A40', r: 1.75, kind: 'lantern', intensity: 1.1 });
  room.light({ pos: [-W / 2 + 1.2, 1.15, Fz + 2.6], color: '#FF8030', r: 1.05, kind: 'lantern', intensity: 1.0 });
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
  Wl.sconce(room, { wall: 'back', x: 0.45, y: 1.85, r: 0.6 });   // (its halo on the logs is painted: lightPools)
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
  // (polish: no point light for the candle stub - it painted a hard half-ellipse on the top and an amber patch on the
  // floor; its glow on the tabletop is a dithered `tops` field at night, lightPools below)
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

  // ---- night: the roaring hearth paints a dithered orange fan across the planks (flickering at its core) and up the
  // back wall's logs; the lantern by the boarded window a small amber halo; the far right corner is left to the dark
  const CNDL = ['#5E4A3A', '#8E6A44', '#D8A458'], EMB = ['#5E443E', '#8A5236', '#B86A34'], ROAR = ['#A0582C', '#D07A34', '#F4A048'], AMB = ['#5A4840', '#7E5E40', '#A88048'];
  const peltLocal = (u, v) => { const c = Math.cos(0.9), s = Math.sin(0.9), du = u + 1.55, dv = v + 0.05; return [du * c - dv * s, du * s + dv * c]; };
  const inPelt = (u, v) => {                                    // the wolf pelt's own outline (+ its head), re-lit by the fire
    const [x, z] = peltLocal(u, v);
    if (Math.abs(x) < 0.15 && z < -0.65 && z > -1.0) return true;
    let inside = false;
    for (let i = 0, j = pelt.length - 1; i < pelt.length; j = i++) {
      const [xi, yi] = pelt[i], [xj, yj] = pelt[j], zi = -yi, zj = -yj;
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  const inFur = (u, v) => { const [x, z] = peltLocal(u, v); return Math.abs(x) < 0.07 && Math.abs(z) < 0.5; };
  const inSlab = (u, v) => {                                    // the raised hearth slab (hearth frame: ry PI / 4)
    const du = u - Fx, dv = v - Fz, lx = (du - dv) * Math.SQRT1_2, lz = (du + dv) * Math.SQRT1_2;
    return Math.abs(lx) < 1.38 && lz > 0.02 && lz < 0.83;
  };
  const night = lightPools(room, ctx, 'house-8-night', {
    floor: [
      pool(Fx + NX * 1.0, Fz + NZ * 1.0, 1.7, ROAR, { kind: 2, peak: 1.05 }),
      pool(Fx + NX * 1.5, Fz + NZ * 1.5, 5.0, EMB, { peak: 0.95, sx: 1.25 }),
      pool(0.45, BZ + 0.5, 1.3, AMB, { peak: 0.34, sz: 0.75, pow: 1.6 }),        // (polish: dim + wide: no hard amber block)
      pool(TX + 0.35, TZ + 0.15, 0.62, CNDL, { peak: 0.85, sx: 1.25, kind: 2 }),          // the candle stub on the table
    ],
    back: [pool(-3.3, 0.6, 3.0, EMB, { peak: 1.0, sx: 1.1 }), pool(0.45, 1.75, 0.8, AMB, { peak: 0.7 })],
    tops: [{ in: (u, v) => Math.abs(u - TX) < 0.79 && Math.abs(v - TZ) < 0.39, y: 0.766, cols: ['#5A4436', '#8A6442', '#C8964E'], kind: 2 },
      { in: inSlab, y: 0.104, cols: ['#6A5048', '#9A6A50', '#D09060'], kind: 2 }, { in: inFur, y: 0.04, cols: ['#5E5050', '#7A6058', '#9A7464'] }, { in: inPelt, y: 0.04, cols: ['#7A6A64', '#A68474', '#C8A084'] }],
    raise: [{ x0: -0.5, z0: D / 2 - 0.68, x1: 0.5, z1: D / 2 - 0.12, y: 0.026 }],
    seams: { z: 0.3, x: 0 },
  });

  room.spot('hearth', Fx + NX * 1.3, Fz + NZ * 1.3, -Math.PI * 0.75);
  room.spot('table', TX, TZ + 0.9, Math.PI);
  room.spot('window', WX, BZ + 0.9, Math.PI);

  return {
    bed: { x: BX, z: BZc - 0.6, y: 0.55, facing: 0 },
    visit: { x: BX - 0.95, z: BZc + 0.6, facing: Math.PI / 2 },
    extras: [embers.group, night.group],
    update(t) { embers.update(t); night.update(); },
    bedRect: bed.rect,
  };
}
