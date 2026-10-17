// house-9 interior: Gloamend Clockworks (owner: interiors 5-9 builder; LORE pass 2026-10-16). docs/INTERIORS.md, docs/LORE.md.
// The clockmaker, obsessed with repairing the tower. Obsessive.
//   ROOM: a TALL WORKSHOP (4 m) under verdigris-washed ashlar over oxblood panelling, a cold flagstone floor, no hearth.
//   The whole back wall is the clockmaker's copy of the tower movement: a MASTER DIAL two metres across (cream, lit
//   from behind at night) STOPPED AT 11:55, a gear train around it, and under it the great pendulum - which still
//   swings, though the hands never move. A tall north window (cool light) on the right; the bench under the schematics
//   on the left with its one HOT LAMP; a drafting table in the middle; a cot shoved into the front-right corner.
//   STORY: the empty axle in the gear train with a gear-shaped CHALK OUTLINE where THE MISSING GEAR should be (and a
//   tray of gears on the bench with one gear-shaped empty slot); the tower schematics pinned up; chalk tally marks
//   counting the days; pocket watches hung on a rail, every one at 11:55; the same gear drawn again and again in
//   chalk on the floor.
//   LIGHT: cool workshop light from the north window (a 'window' anchor, blue-white), one hot warm-white magnifier lamp
//   over the bench (the 'fire' anchor: by day too), the dial glowing cream at night, a candle, the Lantern-maker's lantern.
//   AMBIANCE: two pendulums ticking (the great one slow, a wall regulator quick; stepped 8 fps), dust motes turning
//   in the window light.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 9.4, d: 6, h: 4.0, wall: 'stone', pal: 4, floor: 'flags' };

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
/** Clock-hand angle (radians clockwise from 12) for h:m. */
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

const HOUR = (h, m) => ((h % 12) + m / 60) / 12 * Math.PI * 2, MIN = (m) => (m / 60) * Math.PI * 2;

export default function build(room, ctx) {
  const { FURNITURE: F, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp, M } = ctx;
  const W = room.W, D = room.D, H = room.H, BZ = -D / 2;
  const b = room.b, g = room.g;
  const VERD = paintRamp('#46665e', { lightness: 0.44 });
  const OXBLOOD = paintRamp('#6b2f2f', { lightness: 0.36 });
  const PRINT = paintRamp('#2a4a7a', { lightness: 0.36 });            // blueprint
  const CHALK = paintRamp('#e8e4d8', { lightness: 0.86 });

  /** A gear facing +z at (x, y, z) on builder bb: disc, teeth, hub, spokes. */
  const gear = (bb, x, y, z, r, tones, { spokes = 4, rot = 0 } = {}) => {
    bb.push(M({ at: [x, y, z], rx: Math.PI / 2 }));
    bb.cylinder(r, r, 0.05, { at: [0, -0.025, 0], tones, segments: 16 });
    bb.cylinder(r * 0.25, r * 0.25, 0.09, { at: [0, -0.04, 0], tones: 'iron', segments: 8 });
    const nt = Math.max(10, Math.round(r * 34));
    for (let k = 0; k < nt; k++) { const a = (k / nt) * Math.PI * 2 + rot; bb.box(0.07, 0.05, 0.06, { at: [Math.cos(a) * (r + 0.03), -0.025, Math.sin(a) * (r + 0.03)], ry: -a, tones }); }
    bb.pop();
    for (let k = 0; k < spokes; k++) bb.box(0.045, r * 1.5, 0.012, { at: [x, y, z + 0.03], rz: (k / spokes) * Math.PI + rot, tones: 'crow', tint: 1.06, origin: 'center' });
  };
  /** A hand from (x, y) at angle a (clockwise from 12), length l, on builder bb (wall frame). */
  const hand = (bb, x, y, z, a, l, w, tones = 'crow') => bb.box(w, l, 0.025, { at: [x + Math.sin(a) * l / 2, y + Math.cos(a) * l / 2, z], rz: -a, tones, origin: 'center', pattern: 'none' });

  // ---- shell: verdigris ashlar over oxblood panelling; one tall north window back-right; cold flags
  const NWX = 3.55, NWW = 1.05;
  room.shell({
    windows: [{ x: NWX, y: 1.05, w: NWW, h: 2.05, panes: [3, 6], curtains: null, frame: 'iron' }],
    wallTones: { upper: { tones: VERD, pattern: 'ashlar', scale: 0.9 }, lower: { tones: OXBLOOD, pattern: 'vboards', scale: 0.8 } },
    dado: 1.0, floorTones: 'stone', floorPattern: 'ashlar',
  });

  // ---- the back wall: THE MASTER DIAL (stopped at 11:55), the gear train, the empty axle, schematics, tallies
  const DX = 0.15, DY = 2.55, DR = 1.0;
  room.wallFrame('back', ({ full, glow: wg }) => {
    // dial: brass bezel, cream face (glows warm at night through the glow material's own colour), chapter ring
    full.push(M({ at: [DX, DY, 0.0], rx: Math.PI / 2 }));
    full.cylinder(DR + 0.1, DR + 0.1, 0.1, { at: [0, 0, 0], tones: 'brass', segments: 24 });
    full.pop();
    wg.push(M({ at: [DX, DY, 0.1], rx: Math.PI / 2 }));
    wg.cylinder(DR, DR, 0.02, { at: [0, 0, 0], tones: 'glass', layer: 'glass', glow: '#E6D8B4', glowKind: 1, segments: 24 });
    wg.pop();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, big = k % 3 === 0;
      full.box(big ? 0.07 : 0.045, big ? 0.22 : 0.14, 0.02, { at: [DX + Math.sin(a) * DR * 0.8, DY + Math.cos(a) * DR * 0.8, 0.125], rz: -a, origin: 'center', tones: 'crow', pattern: 'none' });
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      full.box(0.2, 0.02, 0.02, { at: [DX + Math.sin(a) * DR * 0.94, DY + Math.cos(a) * DR * 0.94, 0.122], rz: -a + Math.PI / 2, origin: 'center', tones: 'brass', pattern: 'none', tint: 0.94 });
    }
    hand(full, DX, DY, 0.14, HOUR(11, 55), DR * 0.52, 0.09);                       // 11:55
    hand(full, DX, DY, 0.16, MIN(55), DR * 0.82, 0.06);
    full.push(M({ at: [DX, DY, 0.17], rx: Math.PI / 2 }));
    full.cylinder(0.07, 0.07, 0.04, { at: [0, 0, 0], tones: 'brass', segments: 8 });
    full.pop();
    // the gear train around the dial (frozen)
    gear(full, -1.75, 3.05, 0.06, 0.55, 'brass', { spokes: 3, rot: 0.2 });
    gear(full, 1.95, 3.3, 0.06, 0.38, 'copper', { spokes: 4 });
    gear(full, 1.72, 1.55, 0.06, 0.28, 'brass', { spokes: 3, rot: 0.5 });
    gear(full, 2.35, 2.35, 0.08, 0.2, 'copper', { spokes: 3 });
    // THE EMPTY AXLE: a bare iron arbor and a chalk outline of the gear that should be there
    const EX = -1.45, EY = 1.62, ER = 0.42;
    full.push(M({ at: [EX, EY, 0.0], rx: Math.PI / 2 }));
    full.cylinder(0.06, 0.06, 0.24, { at: [0, 0, 0], tones: 'iron', segments: 8 });
    full.cylinder(0.1, 0.1, 0.03, { at: [0, 0, 0], tones: 'brass', segments: 8 });
    full.pop();
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      full.box(0.11, 0.02, 0.01, { at: [EX + Math.cos(a) * ER, EY + Math.sin(a) * ER, 0.01], rz: a + Math.PI / 2, origin: 'center', tones: CHALK, pattern: 'none' });
      if (k % 2 === 0) full.box(0.025, 0.07, 0.01, { at: [EX + Math.cos(a) * (ER + 0.05), EY + Math.sin(a) * (ER + 0.05), 0.012], rz: a - Math.PI / 2, origin: 'center', tones: CHALK, pattern: 'none' });
    }
    for (const s of [-1, 1]) full.box(0.2, 0.025, 0.01, { at: [EX + 0.28 * s + 0.62, EY + 0.32, 0.012], rz: s * 0.6, origin: 'center', tones: CHALK, pattern: 'none' });  // a chalk "?"-ish mark
    // the tower schematics (blueprints), pinned up on the left
    const sheet = (x, y, w, h, rz) => { full.box(w, h, 0.012, { at: [x, y, 0.025], rz, tones: PRINT, pattern: 'none' }); full.box(0.035, 0.035, 0.02, { at: [x, y + h - 0.04, 0.035], tones: TP.bannerRed }); };
    sheet(-3.65, 1.55, 0.8, 1.05, 0.02);                                            // the tower elevation
    full.box(0.32, 0.62, 0.008, { at: [-3.65, 1.65, 0.033], tones: CHALK, pattern: 'none', tint: 0.94 });
    full.box(0.28, 0.58, 0.009, { at: [-3.65, 1.67, 0.034], tones: PRINT, pattern: 'none' });
    full.prism([[-0.2, 0], [0.2, 0], [0, 0.28]], 0.008, { at: [-3.65, 2.27, 0.034], tones: CHALK });
    full.push(M({ at: [-3.65, 2.08, 0.04], rx: Math.PI / 2 }));
    full.cylinder(0.08, 0.08, 0.006, { at: [0, 0, 0], tones: CHALK, segments: 12 });
    full.pop();
    sheet(-2.72, 1.85, 0.7, 0.62, -0.05);                                           // the gear train diagram
    for (const [cx, cy, r] of [[-2.85, 2.2, 0.14], [-2.6, 2.05, 0.1], [-2.55, 2.3, 0.07]]) {
      full.push(M({ at: [cx, cy, 0.035], rx: Math.PI / 2 }));
      full.cylinder(r, r, 0.006, { at: [0, 0, 0], tones: CHALK, segments: 12 });
      full.cylinder(r - 0.025, r - 0.025, 0.008, { at: [0, 0, 0], tones: PRINT, segments: 12 });
      full.pop();
    }
    sheet(-2.85, 1.28, 0.55, 0.45, 0.08);                                           // notes
    for (let i = 0; i < 4; i++) full.box(0.4, 0.015, 0.008, { at: [-2.85, 1.38 + i * 0.08, 0.035], rz: 0.08, tones: CHALK, pattern: 'none', tint: 0.94 });
    // chalk tallies: the days counted, in fives
    for (let gi = 0; gi < 7; gi++) {
      const gx = -4.3 + (gi % 4) * 0.26, gy = 2.92 + Math.floor(gi / 4) * 0.3;
      for (let k = 0; k < 4; k++) full.box(0.018, 0.2, 0.01, { at: [gx + k * 0.045, gy, 0.01], tones: CHALK, pattern: 'none' });
      full.box(0.22, 0.018, 0.01, { at: [gx + 0.07, gy + 0.1, 0.012], rz: 0.6, origin: 'center', tones: CHALK, pattern: 'none' });
    }
    // the wall regulator (right of the dial): a small dial and a glazed case (its pendulum swings, below)
    const RX = 2.75, RY = 1.25;
    full.box(0.36, 0.95, 0.14, { at: [RX, RY, 0.07], tones: 'timber', pattern: 'none' });
    full.box(0.28, 0.6, 0.02, { at: [RX, RY + 0.06, 0.145], tones: 'crow', pattern: 'none' });
    full.push(M({ at: [RX, RY + 0.98, 0.1], rx: Math.PI / 2 }));
    full.cylinder(0.2, 0.2, 0.06, { at: [0, 0, 0], tones: 'brass', segments: 16 });
    full.cylinder(0.16, 0.16, 0.02, { at: [0, 0.06, 0], tones: 'cream', segments: 16 });
    full.pop();
    hand(full, RX, RY + 0.98, 0.185, HOUR(11, 55), 0.09, 0.025);
    hand(full, RX, RY + 0.98, 0.19, MIN(55), 0.13, 0.018);
    // pocket watches hung on a rail over the bench, every one at 11:55
    full.box(1.15, 0.035, 0.05, { at: [-2.3, 2.62, 0.04], tones: 'brass', pattern: 'none' });
    for (let i = 0; i < 6; i++) {
      const x = -2.78 + i * 0.19, y = 2.38 - (i % 2) * 0.07;
      full.box(0.012, 2.62 - y - 0.06, 0.012, { at: [x, y + 0.06, 0.05], tones: 'brass', pattern: 'none' });
      full.push(M({ at: [x, y, 0.05], rx: Math.PI / 2 }));
      full.cylinder(0.065, 0.065, 0.03, { at: [0, 0, 0], tones: i % 3 ? 'brass' : 'iron', segments: 12 });
      full.cylinder(0.05, 0.05, 0.02, { at: [0, 0.025, 0], tones: 'cream', segments: 12 });
      full.pop();
      hand(full, x, y, 0.08, MIN(55), 0.04, 0.012);
    }
  });
  room.light({ pos: [DX, DY - 0.6, BZ + 1.4], color: '#FFE2A8', r: 1.5, kind: 'lantern', intensity: 1.0 });   // (off the wall: the dial's halo is painted)
  // the ladder up to the dial
  b.hexa([new THREE.Vector3(-0.95 - 0.03, 0, BZ + 0.75), new THREE.Vector3(-0.95 + 0.03, 0, BZ + 0.75), new THREE.Vector3(-0.95 - 0.03, 3.3, BZ + 0.08), new THREE.Vector3(-0.95 + 0.03, 3.3, BZ + 0.08),
    new THREE.Vector3(-0.95 - 0.03, 0, BZ + 0.81), new THREE.Vector3(-0.95 + 0.03, 0, BZ + 0.81), new THREE.Vector3(-0.95 - 0.03, 3.3, BZ + 0.14), new THREE.Vector3(-0.95 + 0.03, 3.3, BZ + 0.14)], { tones: 'plank' });
  b.hexa([new THREE.Vector3(-1.45 - 0.03, 0, BZ + 0.75), new THREE.Vector3(-1.45 + 0.03, 0, BZ + 0.75), new THREE.Vector3(-1.45 - 0.03, 3.3, BZ + 0.08), new THREE.Vector3(-1.45 + 0.03, 3.3, BZ + 0.08),
    new THREE.Vector3(-1.45 - 0.03, 0, BZ + 0.81), new THREE.Vector3(-1.45 + 0.03, 0, BZ + 0.81), new THREE.Vector3(-1.45 - 0.03, 3.3, BZ + 0.14), new THREE.Vector3(-1.45 + 0.03, 3.3, BZ + 0.14)], { tones: 'plank' });
  for (let i = 1; i < 10; i++) { const f = i / 10.5; b.box(0.5, 0.035, 0.04, { at: [-1.2, f * 3.3, BZ + 0.78 - f * 0.67], tones: 'plank', pattern: 'none' }); }
  room.solid(-1.5, BZ, -0.9, BZ + 0.84);

  // ---- the bench under the schematics: vice, trays of gears (one EMPTY gear-shaped slot), the HOT magnifier lamp
  const BXc = -2.85, BZc = BZ + 0.42, BW = 2.4, BT = 0.9;
  F.workbench(room, {
    x: BXc, z: BZc, w: BW,
    extra: (bb, gg, top) => {
      for (let tr = 0; tr < 3; tr++) {
        const tx = -0.75 + tr * 0.42, tz = 0.06;
        bb.box(0.36, 0.035, 0.28, { at: [tx, top, tz], tones: 'timber', pattern: 'none' });
        bb.box(0.32, 0.01, 0.24, { at: [tx, top + 0.035, tz], tones: tr === 1 ? CLOTH.night : CLOTH.green, pattern: 'none', tint: 0.94 });
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          const gx = tx - 0.11 + i * 0.11, gz = tz - 0.055 + j * 0.11;
          if (tr === 1 && i === 1 && j === 0) {                                // the empty slot: a gear-shaped hollow
            for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; bb.box(0.018, 0.006, 0.018, { at: [gx + Math.cos(a) * 0.045, top + 0.046, gz + Math.sin(a) * 0.045], tones: CHALK, pattern: 'none' }); }
            continue;
          }
          bb.cylinder(0.04, 0.04, 0.015, { at: [gx, top + 0.045, gz], tones: (i + j) % 2 ? 'brass' : 'copper', segments: 8 });
        }
      }
      // the magnifier lamp: an arm up from a clamp, a brass shade, a big lens on its own arm
      bb.box(0.08, 0.1, 0.1, { at: [0.55, top, -0.2], tones: 'iron' });
      bb.box(0.035, 0.6, 0.035, { at: [0.55, top + 0.1, -0.2], rz: 0.3, tones: 'brass' });
      bb.box(0.4, 0.035, 0.035, { at: [0.3, top + 0.66, -0.2], rz: -0.1, tones: 'brass' });
      bb.cylinder(0.05, 0.16, 0.14, { at: [0.12, top + 0.48, -0.15], tones: 'brass', segments: 8 });
      gg.cylinder(0.13, 0.13, 0.03, { at: [0.12, top + 0.46, -0.15], tones: 'glass', layer: 'glass', glow: '#FFF0C8', glowKind: 1, segments: 8 });
      bb.push(M({ at: [0.15, top + 0.3, 0.08], rx: 1.0 }));
      bb.cylinder(0.12, 0.12, 0.025, { at: [0, 0, 0], tones: 'brass', segments: 12 });
      bb.cylinder(0.1, 0.1, 0.03, { at: [0, 0, 0], tones: 'glass', segments: 12, tint: 1.06 });
      bb.pop();
      bb.box(0.03, 0.32, 0.03, { at: [0.3, top, 0.08], rz: 0.4, tones: 'brass' });
      // an open movement under the lens, tweezers, a loupe
      bb.cylinder(0.09, 0.09, 0.03, { at: [0.15, top, 0.0], tones: 'brass', segments: 12 });
      bb.box(0.14, 0.012, 0.012, { at: [0.42, top, 0.18], ry: 0.6, tones: 'iron' });
      bb.cylinder(0.03, 0.04, 0.04, { at: [0.75, top, 0.15], tones: 'crow', segments: 8 });
    },
  });
  // the hot lamp's pool is pulled forward off the back wall (it lit the oxblood panelling as a red disc): it lights the
  // bench top, the stool and the floor in front
  room.light({ pos: [BXc + 0.12, BT + 0.35, BZc + 1.25], color: '#FFE8B8', r: 1.8, kind: 'fire', intensity: 1.9 });
  F.stool(room, { x: BXc + 0.15, z: BZc + 0.75 });

  // ---- the great pendulum under the dial (still swinging) and the regulator's (quick); separate meshes
  const pendulum = (name, len, bob, w) => {
    const pb = new Builder(room.engine, { name });
    pb.box(w, len, w, { at: [0, -len, 0], tones: 'brass', pattern: 'none' });
    pb.push(M({ at: [0, -len, 0], rx: Math.PI / 2 }));
    pb.cylinder(bob, bob, 0.06, { at: [0, -0.03, 0], tones: 'brass', segments: 12 });
    pb.cylinder(bob * 0.6, bob * 0.6, 0.08, { at: [0, -0.04, 0], tones: 'brass', segments: 12, tint: 1.06 });
    pb.pop();
    return pb.build({ name });
  };
  const great = new THREE.Group();
  great.position.set(DX, DY - DR - 0.1, BZ + 0.32);
  great.add(pendulum('house-9-pendulum', 1.12, 0.2, 0.05));
  b.box(0.3, 0.12, 0.3, { at: [DX, DY - DR - 0.16, BZ + 0.15], tones: 'iron', pattern: 'none' });         // its suspension block
  const reg = new THREE.Group();
  reg.position.set(2.75, 1.25 + 0.68, BZ + 0.2);
  reg.add(pendulum('house-9-regulator', 0.5, 0.07, 0.02));

  // ---- the drafting table in the middle: the tower's plan unrolled, compasses, a brass gear set down, a candle
  const TX = 0.55, TZ = 0.45;
  F.table(room, {
    x: TX, z: TZ, w: 1.8, d: 0.95, items: false,
    extra: (bb, gg, top) => {
      bb.box(1.2, 0.012, 0.75, { at: [0, top, 0], ry: 0.06, tones: PRINT, pattern: 'none' });
      for (const s of [-1, 1]) bb.box(0.07, 0.07, 0.82, { at: [s * 0.62, top, 0], ry: 0.06, tones: CLOTH.linen, pattern: 'none' });
      bb.push(M({ at: [0, top + 0.013, 0], ry: 0.06 }));
      for (const [cx, cz, r] of [[-0.25, -0.05, 0.2], [0.1, 0.1, 0.12], [0.3, -0.1, 0.09]]) {
        bb.cylinder(r, r, 0.004, { at: [cx, 0, cz], tones: CHALK, segments: 12 });
        bb.cylinder(r - 0.02, r - 0.02, 0.006, { at: [cx, 0, cz], tones: PRINT, segments: 12 });
      }
      bb.pop();
      bb.box(0.02, 0.012, 0.3, { at: [0.35, top + 0.02, 0.18], ry: 0.4, tones: 'iron' });
      bb.box(0.02, 0.012, 0.3, { at: [0.4, top + 0.02, 0.18], ry: 0.1, tones: 'iron' });
      bb.push(M({ at: [-0.55, top + 0.02, 0.25] }));
      bb.cylinder(0.17, 0.17, 0.03, { at: [0, 0, 0], tones: 'brass', segments: 12 });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; bb.box(0.04, 0.03, 0.04, { at: [Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19], ry: -a, tones: 'brass' }); }
      bb.pop();
      bb.cylinder(0.06, 0.06, 0.025, { at: [0.6, top, -0.3], tones: 'brass', segments: 8 });
      bb.box(0.045, 0.14, 0.045, { at: [0.6, top + 0.025, -0.3], tones: 'cream', pattern: 'none' });
      gg.box(0.05, 0.06, 0.05, { at: [0.6, top + 0.165, -0.3], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    },
  });
  room.light({ pos: [TX + 0.6, 1.15, TZ - 0.1], color: GLOW.candle, r: 1.3, kind: 'lantern', intensity: 1.0 });
  F.chair(room, { x: TX - 0.2, z: TZ - 0.85, ry: 0 });
  // the same gear chalked on the floor again and again around the table
  for (let n = 0; n < 3; n++) {
    const cx = [-1.9, 2.0, -0.9][n], cz = [1.3, 1.6, 2.2][n], r = [0.42, 0.34, 0.28][n];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      b.box(0.15 * r / 0.4, 0.006, 0.02, { at: [cx + Math.cos(a) * r, 0.002, cz + Math.sin(a) * r], ry: -a + Math.PI / 2, tones: CHALK, pattern: 'none', tint: 0.94 });
      if (k % 2 === 0) b.box(0.025, 0.006, 0.06, { at: [cx + Math.cos(a) * (r + 0.04), 0.003, cz + Math.sin(a) * (r + 0.04)], ry: -a + Math.PI / 2, tones: CHALK, pattern: 'none', tint: 0.94 });
    }
  }

  // ---- the cot shoved into the front-right corner, a blueprint left on it; crates of parts; the lantern
  const CX = W / 2 - 0.58, CZ = 1.55;
  const bed = F.bed(room, { x: CX, z: CZ, quilt: OXBLOOD, frame: 'timber' });
  b.box(0.6, 0.012, 0.45, { at: [CX - 0.05, 0.56, CZ + 0.3], ry: 0.3, tones: PRINT, pattern: 'none' });
  for (const [x, z, h] of [[-W / 2 + 0.45, 2.3, 0.5], [-W / 2 + 0.45, 1.65, 0.4], [-W / 2 + 1.1, 2.4, 0.36]]) {
    b.box(0.6, h, 0.5, { at: [x, 0, z], tones: 'plank', pattern: 'boards', scale: 0.6 });
    for (let k = 0; k < 3; k++) b.cylinder(0.07, 0.07, 0.03, { at: [x - 0.15 + k * 0.15, h, z], tones: k % 2 ? 'copper' : 'brass', segments: 8 });
    room.solidAt(x, z, 0.6, 0.5);
  }
  F.hangingLantern(room, { x: -0.6, z: 1.3, y: 2.6, r: 2.7, intensity: 1.2 });
  b.box(1.0, 0.02, 0.55, { at: [0, 0.002, D / 2 - 0.4], tones: OXBLOOD, pattern: 'none', tint: 1.05 });   // mat
  // the cool north light (a window anchor: moonlight-blue at night)
  room.light({ pos: [NWX - 0.2, 2.2, BZ + 2.5], color: '#A8C4F0', r: 2.4, kind: 'window', intensity: 0.9 });   // (forward + high: no disc on the panelling or floor)

  // ---- dust motes turning in the window light (stepped 8 fps)
  const motesW = motes(room, ctx, 'house-9-dust', 16, (k) => (k % 3 ? '#D8E2F0' : '#F0E6CC'), 0.035, (k, t) => {
    const u = (((t * 0.05 + hash(k)) % 1) + 1) % 1;
    const x = NWX - 0.6 + hash(k + 3) * 1.2 + Math.sin(t * 0.3 + k) * 0.15;
    const y = 0.6 + ((hash(k + 5) * 2.4 + u * 2.4) % 2.4);
    const z = BZ + 0.5 + hash(k + 8) * 1.8 - (y - 0.6) * 0.3;
    return [x, y, z, 1];
  });

  // ---- night: two temperatures. The north window throws a cold moonlight SHAFT across the flags (dithered, cut by the
  // glazing bars); the hot lamp a tight warm-white pool in front of the bench; and the
  // stopped dial glows cream through its verdigris halo on the wall (the lantern is left to its own small toon pool)
  const MOON = ['#5A6C94', '#7C94C0', '#B0C8EA'], HOT = ['#7A6E62', '#B4A286', '#F4E4BC'];
  const shaft = {
    cols: MOON, kind: 1,
    at: (u, v) => {
      const t = (v - (BZ + 0.95)) / 2.5;                           // from under the sill toward the room
      if (t < 0 || t > 1) return 0;
      const cx = NWX - 0.1 - t * 0.85, hw = NWW / 2 + 0.05;           // the moon is high and to the right
      const e = Math.min(1, (hw - Math.abs(u - cx)) / 0.14);
      if (e <= 0) return 0;
      const bar = Math.abs((u - cx + NWW / 2) / (NWW / 3) - Math.round((u - cx + NWW / 2) / (NWW / 3))) < 0.07 ? 0.6 : 1;   // the glazing bars
      return 1.05 * e * (1 - t * 0.5) * bar;
    },
  };
  const night = lightPools(room, ctx, 'house-9-night', {
    floor: [shaft, pool(BXc + 0.12, BZc + 1.05, 1.35, HOT, { peak: 1.05, sz: 0.85 })],
    back: [ring(DX, DY, DR + 0.04, 0.5, ['#4C6862', '#7C9A86', '#CCDCB8'], { peak: 0.85 })],
    y: 0.003, tone: flagJoints(ctx),
  });

  room.spot('bench', BXc, BZc + 1.0, Math.PI);
  room.spot('dial', DX, BZ + 1.2, Math.PI);
  room.spot('table', TX, TZ + 0.95, Math.PI);

  return {
    bed: { x: CX, z: CZ - 0.6, y: 0.55, facing: 0 },
    visit: { x: CX - 0.95, z: CZ, facing: Math.PI / 2 },
    extras: [great, reg, motesW.group, night.group],
    update(t) {
      const k = Math.floor(t * 8) / 8;
      great.rotation.z = Math.sin(k * Math.PI) * 0.16;                         // a 2 s beat
      reg.rotation.z = Math.sin(k * Math.PI * 2) * 0.2;                        // a 1 s beat
      motesW.update(t);
      night.update();
    },
    bedRect: bed.rect,
  };
}
