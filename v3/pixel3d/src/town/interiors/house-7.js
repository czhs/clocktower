// house-7 interior: Toadstool Hollow (owner: interiors 5-9 builder; LORE pass 2026-10-16). docs/INTERIORS.md, docs/LORE.md.
// A reclusive fae-touched tenant. Whimsical, and slightly wrong.
//   ROOM: a LOW ROUND BURROW (2.5 m, smaller than a cottage): curved earthen banks fill all four corners (cream
//   limewash over an earthen course, like a hobbit hole), roots dangle from a lip of earth along the top, two ROUND
//   porthole windows, a packed-earth floor with moss creeping in at the edges. No hearth, no table legs: everything is
//   a little too small. A toadstool table set for six on tiny mushroom stools (one knocked over), a nest bed in a
//   walnut-coloured shell, a tiny dresser.
//   STORY: the FAIRY RING of red toadstools on the floor, and in the middle of it one small buckled shoe; the mushroom
//   almanac open on a stump at the page of a red toadstool, crossed out ("never eat the red ones"); jars of glowing
//   beetles; a tiny round-topped door low in the wall, ajar, with gold light behind it (it opens onto earth).
//   LIGHT: bioluminescence. A cyan cluster of shelf-fungi on the left bank is the key (cyan pool by day and night), a
//   pink cluster on the right, the ring's caps light up at night (kit night glass), the beetle jars, the gold crack of
//   the tiny door, and the Lantern-maker's lantern - with beetles in it instead of a candle.
//   AMBIANCE: spores drifting and rising through the room (pale green / cyan / pink motes, stepped 8 fps).
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 7.6, d: 5.6, h: 2.5, wall: 'stone', pal: 3, floor: 'boards' };

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
/** A flat upward-facing n-gon of radius r at height y (current frame): thin discs whose rims never read (tri budget). */
function disc(b, r, n, [x, y, z], opts) {
  const p = (k) => { const a = (k / n) * Math.PI * 2; return [x + Math.cos(a) * r, y, z + Math.sin(a) * r]; };
  const out = [];
  for (let k = 1; k < n - 1; k++) out.push(...p(0), ...p(k + 1), ...p(k));
  b.tris(out, opts);
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
  const { CLOTH, TOWN_PALETTE: TP, paintRamp } = ctx;
  const W = room.W, D = room.D, H = room.H, BZ = -D / 2;
  const b = room.b, g = room.g;
  const EARTH = paintRamp('#6e5440', { lightness: 0.4 });
  const FLOOR = paintRamp('#7c6450', { lightness: 0.44 });
  const RED = paintRamp(TP.toadstool, { lightness: 0.46 });
  const SHELL = paintRamp('#7a5434', { lightness: 0.4 });
  const CYAN = '#6CE8D8', PINK = '#F08CD0', BEETLE = '#B8F090';
  const glow = (bb, w, h, d, at, color, kind = 1, extra = {}) => bb.box(w, h, d, { at, tones: 'glass', layer: 'glass', glow: color, glowKind: kind, ...extra });

  // ---- shell: cream limewash over an earthen course, two round porthole windows, a packed-earth floor; no beam
  const WX = [-1.15, 1.25], WY = 1.2, WS = 0.56;
  room.shell({
    windows: WX.map((x) => ({ x, y: WY, w: WS, h: WS, panes: [2, 2], curtains: null })),
    wallTones: { upper: { tones: 'plaster', pattern: 'plaster' }, lower: { tones: EARTH, pattern: 'rubble', scale: 0.6 } },
    dado: 0.8, floorTones: FLOOR, floorPattern: 'plaster', beams: false,
  });
  // round frames over the square holes (a ring of timber blocks + corner fills)
  room.wallFrame('back', ({ full }) => {
    for (const x of WX) {
      const cx = x, cy = WY + WS / 2, R = WS * 0.62;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        full.box(0.215, 0.11, 0.1, { at: [cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0.03], rz: a + Math.PI / 2, origin: 'center', tones: 'timber', pattern: 'none' });
      }
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        full.prism([[0, 0], [0.14 * sx, 0], [0, 0.14 * sy]], 0.06, { at: [cx + sx * (WS / 2 + 0.01), cy + sy * (WS / 2 + 0.01), 0.0], rz: 0, tones: 'plaster' });
      }
    }
  });

  // ---- the round: curved earthen banks in all four corners (back: full height, front: low), moss on top
  const bank = (sx, sz, R, h, tones, pattern, y0 = 0) => {
    const Px = sx * W / 2, Pz = sz * D / 2, Cx = Px - sx * R, Cz = Pz - sz * R;
    const pts = [[Px, -Pz]];
    for (let i = 0; i <= 6; i++) { const t = (i / 6) * Math.PI / 2; pts.push([Cx + sx * R * Math.cos(t), -(Cz + sz * R * Math.sin(t))]); }
    b.prism(pts, h, { at: [0, y0 + h / 2, 0], rx: -Math.PI / 2, tones, pattern, scale: 0.7 });
  };
  for (const sx of [-1, 1]) {
    bank(sx, -1, 1.35, 0.8, EARTH, 'rubble');
    bank(sx, -1, 1.35, H - 0.8, 'plaster', 'plaster', 0.8);
    bank(sx, 1, 1.0, 0.42, EARTH, 'rubble');
    bank(sx, 1, 0.92, 0.06, 'mossTuft', 'none', 0.42);
    for (const sz of [-1, 1]) {
      const R = sz < 0 ? 1.35 : 1.0, Px = sx * W / 2, Pz = sz * D / 2;
      room.solid(Px - sx * 0.62 * R, Pz - sz * 0.62 * R, Px, Pz);
      room.solid(Px - sx * R, Pz - sz * 0.22 * R, Px, Pz);
      room.solid(Px - sx * 0.22 * R, Pz - sz * R, Px, Pz);
    }
  }
  // the earthen lip along the top of the back wall, roots dangling from it
  b.box(W, 0.26, 0.42, { at: [0, H - 0.2, BZ + 0.21], tones: EARTH, pattern: 'rubble', scale: 0.6 });
  b.box(W, 0.06, 0.46, { at: [0, H + 0.04, BZ + 0.22], tones: 'moss', pattern: 'none' });
  for (let i = 0; i < 16; i++) {
    const x = -W / 2 + 0.6 + hash(i) * (W - 1.2), len = 0.15 + hash(i + 40) * 0.5;
    b.box(0.03, len, 0.03, { at: [x, H - 0.2 - len, BZ + 0.36 + hash(i + 7) * 0.05], rz: (hash(i + 3) - 0.5) * 0.4, tones: 'trunk', pattern: 'none' });
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {                      // roots creeping down the banks
    b.box(0.04, 0.9 + i * 0.25, 0.04, { at: [sx * (W / 2 - 0.55 - i * 0.28), H - 1.0 - i * 0.25, BZ + 0.5 + i * 0.25], rz: sx * (0.25 - i * 0.1), tones: 'trunk', pattern: 'none' });
  }
  // moss creeping in from the banks: soft round patches (flattened octagons) and a few pebbles
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, rx = W / 2 - 1.05, rz = D / 2 - 0.85;
    const x = Math.cos(a) * rx * (0.95 + hash(i) * 0.1), z = Math.sin(a) * rz * (0.95 + hash(i + 1) * 0.1);
    if (Math.abs(x) < 1.0 && z > 1.2) continue;
    const r = 0.22 + hash(i + 2) * 0.2;
    b.push({ at: [x, 0, z], ry: a, s: [1, 1, 0.6] });
    disc(b, r, 7, [0, 0.012, 0], { tones: 'moss', tint: [0.95, 1, 1.05][i % 3] });
    disc(b, r * 0.55, 6, [r * 0.3, 0.02, 0.05], { tones: 'mossTuft' });
    b.pop();
    b.box(0.07, 0.04, 0.06, { at: [x + r + 0.1, 0, z + 0.05], ry: a, tones: 'stone', pattern: 'none' });
  }
  // ---- bioluminescent shelf-fungi on the back banks: cyan (left, the key) and pink (right)
  const fungi = (sx, color, n) => {
    for (let i = 0; i < n; i++) {
      const t = 0.2 + (i / n) * 0.65, R = 1.35, Px = sx * W / 2, Pz = -D / 2, Cx = Px - sx * R, Cz = Pz + R;
      const ang = t * Math.PI / 2;
      const x = Cx + sx * R * Math.cos(ang) * 0.98, z = Cz - R * Math.sin(ang) * 0.98, y = 0.5 + hash(i + (sx > 0 ? 20 : 0)) * 1.4;
      const ry = Math.atan2(Cx - x, Cz - z), r = 0.12 + hash(i + 11) * 0.1;
      b.push({ at: [x, y, z], ry });
      g.push({ at: [x, y, z], ry });
      g.cylinder(r, r * 0.8, 0.05, { at: [0, 0, 0.02], tones: 'glass', layer: 'glass', glow: color, glowKind: 2, segments: 6 });
      b.cylinder(r * 0.7, r * 0.5, 0.04, { at: [0, -0.04, 0.0], tones: 'cream', segments: 6 });
      g.pop(); b.pop();
    }
  };
  fungi(-1, CYAN, 10);
  fungi(1, PINK, 9);
  // little glowing toadstools sprouting from the low front banks
  for (const [x, z, c] of [[-3.2, 2.1, CYAN], [-3.0, 2.4, CYAN], [3.15, 2.2, PINK], [2.95, 2.45, CYAN]]) {
    b.box(0.03, 0.12, 0.03, { at: [x, 0.47, z], tones: 'cream', pattern: 'none' });
    g.cylinder(0.08, 0.03, 0.06, { at: [x, 0.58, z], tones: 'glass', layer: 'glass', glow: c, glowKind: 2, segments: 8 });
  }
  // more glowing caps instead of big pools: clusters of tiny bioluminescent mushrooms along the bank feet and the floor
  // edges (the interior glow material: the light lives in the caps); the point-light pools are small and soft
  const caps = [[-2.9, -1.05, CYAN], [-2.55, -1.35, CYAN], [-3.25, -0.55, CYAN], [-2.2, -1.75, CYAN], [-3.4, 0.4, CYAN], [-3.2, 1.0, '#9AF0C8'],
    [2.95, -0.2, PINK], [3.25, 0.35, PINK], [3.2, -1.6, PINK], [3.3, -0.75, '#F0B8E8'], [1.6, 2.25, CYAN], [-0.9, -1.95, '#9AF0C8'], [0.95, 1.95, PINK]];
  caps.forEach(([cx, cz, c], i) => {
    for (let k = 0; k < 3; k++) {
      const x = cx + (hash(i * 3 + k + 200) - 0.5) * 0.3, z = cz + (hash(i * 3 + k + 230) - 0.5) * 0.24, s = 0.6 + hash(i * 3 + k + 260) * 0.6;
      const hw = 0.0125 * s, hh = 0.1 * s;                          // the stem: a front quad (tri budget; it is 1-2 px wide)
      b.tris([x - hw, 0, z, x + hw, 0, z, x + hw, hh, z, x - hw, 0, z, x + hw, hh, z, x - hw, hh, z], { tones: 'cream', pattern: 'none' });
      g.cylinder(0.065 * s, 0.025 * s, 0.05 * s, { at: [x, 0.1 * s, z], tones: 'glass', layer: 'glass', glow: c, glowKind: 2, segments: 5 });
    }
  });
  room.light({ pos: [-2.7, 1.0, BZ + 1.15], color: CYAN, r: 1.15, kind: 'fire', intensity: 1.0 });
  room.light({ pos: [2.75, 1.0, BZ + 1.15], color: PINK, r: 1.05, kind: 'lantern', intensity: 0.9 });

  // ---- the back wall: the beetle jars on a shelf, the tiny dresser, the tiny door (ajar, gold light behind)
  room.wallFrame('back', ({ full, glow: wg }) => {
    // the shelf of beetle jars between the windows
    const SX = 0.05, SY = 1.48;
    full.box(0.86, 0.04, 0.2, { at: [SX, SY, 0.1], tones: 'plank', pattern: 'none' });
    for (const s of [-1, 1]) full.box(0.04, 0.14, 0.14, { at: [SX + s * 0.34, SY - 0.14, 0.07], tones: 'trunk' });
    for (let i = 0; i < 4; i++) {
      const x = SX - 0.3 + i * 0.2, h = 0.13 + (i % 2) * 0.05;
      full.box(0.12, h, 0.12, { at: [x, SY + 0.04, 0.1], tones: 'glass', pattern: 'none', tint: 1.06 });
      wg.box(0.07, 0.04, 0.07, { at: [x, SY + 0.05 + h * 0.3, 0.17], tones: 'glass', layer: 'glass', glow: BEETLE, glowKind: 2 });
      full.box(0.13, 0.03, 0.13, { at: [x, SY + 0.04 + h, 0.1], tones: 'cream', pattern: 'none' });
    }
    // the tiny door, low in the wall right of centre, ajar
    const TDX = 2.2, TW = 0.34, TH = 0.5;
    full.box(TW + 0.1, TH + 0.06, 0.05, { at: [TDX, 0, 0.02], tones: 'timber', pattern: 'none' });
    wg.box(TW, TH - 0.04, 0.02, { at: [TDX, 0.02, 0.05], tones: 'glass', layer: 'glass', glow: '#FFD27A', glowKind: 2 });
    full.push({ at: [TDX - TW / 2, 0.02, 0.06], ry: -0.75 });
    full.box(TW, TH - 0.06, 0.03, { at: [TW / 2, 0, 0.015], tones: RED, pattern: 'vboards', scale: 0.3 });
    full.box(0.035, 0.035, 0.03, { at: [TW - 0.06, 0.22, 0.04], tones: 'brass' });
    full.pop();
    full.prism([[-TW / 2 - 0.05, 0], [TW / 2 + 0.05, 0], [0, 0.16]], 0.05, { at: [TDX, TH + 0.06, 0.02], tones: 'timber' });
  });
  room.light({ pos: [2.2, 0.35, BZ + 0.3], color: '#FFD27A', r: 0.9, kind: 'lantern', intensity: 0.8 });
  room.light({ pos: [0.05, 1.6, BZ + 0.45], color: BEETLE, r: 1.1, kind: 'lantern', intensity: 0.8 });
  // the tiny dresser (half size) under the left window, a crooked tiny portrait over it
  const TX = -1.15, TZ = BZ + 0.22;
  b.box(0.62, 0.62, 0.32, { at: [TX, 0, TZ], tones: SHELL, pattern: 'vboards', scale: 0.4 });
  b.box(0.68, 0.04, 0.36, { at: [TX, 0.62, TZ], tones: 'plank', pattern: 'none' });
  for (const y of [0.1, 0.32]) {
    b.box(0.54, 0.17, 0.02, { at: [TX, y, TZ + 0.165], tones: SHELL, tint: 1.06, pattern: 'none' });
    b.box(0.035, 0.035, 0.03, { at: [TX, y + 0.08, TZ + 0.18], tones: 'brass' });
  }
  for (const [dx, c] of [[-0.18, RED], [0.15, 'cream']]) b.cylinder(0.05, 0.035, 0.05, { at: [TX + dx, 0.66, TZ], tones: c, segments: 8 });
  room.solid(TX - 0.36, BZ, TX + 0.36, TZ + 0.2);

  // ---- the toadstool table, set for six on tiny mushroom stools (one knocked over)
  const QX = -0.25, QZ = 0.15;
  b.cylinder(0.16, 0.12, 0.5, { at: [QX, 0, QZ], tones: 'cream', segments: 8 });
  b.cylinder(0.6, 0.62, 0.08, { at: [QX, 0.5, QZ], tones: 'cream', segments: 12, tint: 0.95 });       // gills
  b.cylinder(0.62, 0.5, 0.1, { at: [QX, 0.58, QZ], tones: RED, segments: 12 });
  b.cylinder(0.5, 0.25, 0.07, { at: [QX, 0.68, QZ], tones: RED, segments: 12, tint: 1.04 });
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3, r = k % 2 ? 0.42 : 0.2;
    b.box(0.07, 0.03, 0.07, { at: [QX + Math.cos(a) * r, 0.7 - r * 0.15, QZ + Math.sin(a) * r], ry: a, tones: 'cream', pattern: 'none' });
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    // place settings on the cap: a tiny plate + an acorn cup
    disc(b, 0.06, 8, [QX + Math.cos(a) * 0.36, 0.762, QZ + Math.sin(a) * 0.36], { tones: k === 4 ? 'crow' : 'cream' });
    b.cylinder(0.025, 0.02, 0.03, { at: [QX + Math.cos(a) * 0.25, 0.75, QZ + Math.sin(a) * 0.25], tones: SHELL, segments: 8 });
    const sx = QX + Math.cos(a) * 0.9, sz = QZ + Math.sin(a) * 0.9;
    if (k === 1) {                                                          // the knocked-over stool
      b.push({ at: [sx, 0.13, sz], rz: Math.PI / 2, ry: a });
      b.cylinder(0.05, 0.05, 0.24, { at: [0, -0.12, 0], tones: 'cream', segments: 8 });
      b.cylinder(0.16, 0.12, 0.07, { at: [0, 0.12, 0], tones: RED, segments: 8 });
      b.pop();
      continue;
    }
    b.cylinder(0.06, 0.05, 0.26, { at: [sx, 0, sz], tones: 'cream', segments: 8 });
    b.cylinder(0.16, 0.14, 0.06, { at: [sx, 0.26, sz], tones: RED, segments: 8 });
    b.box(0.04, 0.02, 0.04, { at: [sx + 0.05, 0.32, sz], tones: 'cream', pattern: 'none' });
  }
  room.solid(QX - 0.55, QZ - 0.55, QX + 0.55, QZ + 0.55);

  // ---- the FAIRY RING on the floor (front-left), the small buckled shoe in the middle
  const RX = -1.75, RZ = 1.45, RR = 0.68;
  disc(b, RR + 0.14, 16, [RX, 0.012, RZ], { tones: 'mossTuft', tint: 0.94 });
  disc(b, RR - 0.14, 16, [RX, 0.016, RZ], { tones: FLOOR, tint: 0.94 });
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2, x = RX + Math.cos(a) * RR, z = RZ + Math.sin(a) * RR, s = 0.8 + hash(k + 60) * 0.5;
    b.cylinder(0.035 * s, 0.03 * s, 0.13 * s, { at: [x, 0, z], tones: 'cream', segments: 8 });
    b.cylinder(0.1 * s, 0.03 * s, 0.07 * s, { at: [x, 0.13 * s, z], tones: RED, layer: 'glass', glow: '#FF7AA8', glowKind: 2, segments: 8 });
    b.box(0.025, 0.015, 0.025, { at: [x + 0.03 * s, 0.17 * s, z], tones: 'cream', pattern: 'none' });
  }
  b.push({ at: [RX + 0.05, 0, RZ - 0.02], ry: 0.6 });                     // the shoe
  b.box(0.11, 0.08, 0.24, { at: [0, 0, 0], tones: SHELL, pattern: 'none', tint: 0.94 });
  b.box(0.1, 0.05, 0.1, { at: [0, 0.08, -0.06], tones: SHELL, pattern: 'none', tint: 0.94 });
  b.box(0.12, 0.02, 0.04, { at: [0, 0.08, 0.04], tones: 'brass' });
  b.pop();
  room.light({ pos: [RX, 0.35, RZ], color: '#FF88B0', r: 1.1, kind: 'lantern', intensity: 0.8 });

  // ---- the mushroom almanac open on a stump (right): a red toadstool, crossed out
  const AX = 2.25, AZ = 0.85;
  b.cylinder(0.24, 0.27, 0.62, { at: [AX, 0, AZ], tones: 'trunk', segments: 8 });
  b.cylinder(0.24, 0.24, 0.02, { at: [AX, 0.62, AZ], tones: 'plank', segments: 8 });
  b.push({ at: [AX, 0.7, AZ], rx: 0.55 });
  b.box(0.6, 0.04, 0.4, { at: [0, -0.04, 0], tones: CLOTH.green, pattern: 'none' });
  for (const s of [-1, 1]) b.box(0.27, 0.025, 0.36, { at: [s * 0.14, 0, 0], rz: s * -0.05, tones: 'cream', pattern: 'none' });
  b.cylinder(0.09, 0.03, 0.006, { at: [0.15, 0.026, -0.02], tones: RED, segments: 8 });                    // the toadstool drawing
  b.box(0.11, 0.006, 0.03, { at: [0.15, 0.026, 0.02], tones: RED, pattern: 'none' });
  b.box(0.025, 0.006, 0.09, { at: [0.15, 0.026, 0.07], tones: 'iron', pattern: 'none' });
  for (const s of [-1, 1]) b.box(0.24, 0.008, 0.025, { at: [0.15, 0.032, 0.02], ry: s * 0.75, tones: 'crow', pattern: 'none' });   // the X
  for (let i = 0; i < 4; i++) b.box(0.18, 0.006, 0.012, { at: [-0.14, 0.026, -0.12 + i * 0.07], tones: 'iron', pattern: 'none' });
  b.pop();
  room.solidAt(AX, AZ, 0.56, 0.56);

  // ---- the nest bed in a shell (back-right, in front of the bank), cream quilt with red spots
  const BX = 2.45, BZc = -1.05;
  b.push({ at: [BX, 0, BZc], s: [0.5, 1, 0.82] });
  b.cylinder(0.9, 1.0, 0.3, { at: [0, 0, 0], tones: SHELL, pattern: 'vboards', scale: 0.4, segments: 12 });
  b.cylinder(1.0, 0.94, 0.16, { at: [0, 0.3, 0], tones: SHELL, pattern: 'vboards', scale: 0.4, segments: 12, tint: 1.06 });
  b.cylinder(0.86, 0.8, 0.12, { at: [0, 0.36, 0], tones: 'mossTuft', segments: 12 });
  b.cylinder(0.78, 0.7, 0.1, { at: [0, 0.4, 0.14], tones: RED, segments: 12 });                         // the quilt
  b.pop();
  b.push({ at: [BX, 0, BZc - 0.5], s: [0.26, 1, 0.16] });
  b.cylinder(0.85, 0.85, 0.12, { at: [0, 0.42, 0], tones: 'cream', segments: 8, tint: 1.04 });           // the pillow
  b.pop();
  for (const [dx, dz] of [[-0.16, 0.0], [0.14, 0.28], [0.0, 0.55], [-0.2, 0.4], [0.2, -0.1], [0.05, 0.12]]) b.box(0.08, 0.02, 0.08, { at: [BX + dx, 0.5, BZc + dz], tones: 'cream', pattern: 'none' });
  room.solid(BX - 0.5, BZc - 0.82, BX + 0.5, BZc + 0.82);

  // ---- the Lantern-maker's lantern, hung from a root over the table, BEETLES glowing in it instead of a candle
  const LX = 0.75, LZ = -0.55, LY = 1.55;
  b.box(0.02, H - LY - 0.32, 0.02, { at: [LX, LY + 0.32, LZ], tones: 'trunk', pattern: 'none' });
  b.box(0.2, 0.035, 0.2, { at: [LX, LY, LZ], tones: 'iron', pattern: 'none' });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.025, 0.24, 0.025, { at: [LX + sx * 0.085, LY + 0.035, LZ + sz * 0.085], tones: 'iron', pattern: 'none' });
  b.box(0.22, 0.05, 0.22, { at: [LX, LY + 0.27, LZ], tones: 'iron', pattern: 'none' });
  b.box(0.15, 0.2, 0.15, { at: [LX, LY + 0.05, LZ], tones: 'glass', pattern: 'none', tint: 1.04 });
  for (const [dx, dy, dz] of [[-0.03, 0.08, 0.06], [0.04, 0.15, 0.065], [0.0, 0.11, 0.07]]) glow(g, 0.03, 0.03, 0.02, [LX + dx, LY + dy, LZ + dz], BEETLE, 2);
  room.light({ pos: [LX, LY + 0.1, LZ + 0.2], color: '#C8F098', r: 1.5, kind: 'lantern', intensity: 0.9 });
  // a round woven mat by the door
  b.push({ at: [0, 0.002, D / 2 - 0.45], s: [0.55, 1, 0.3] });
  disc(b, 1, 12, [0, 0.02, 0], { tones: 'thatch' });
  disc(b, 0.65, 12, [0, 0.025, 0], { tones: RED, tint: 0.95 });
  b.pop();

  // ---- spores drifting and rising through the burrow (stepped 8 fps)
  const SC = ['#C8F0B8', CYAN, '#F0C0E4', '#E8F0D0'];
  const spores = motes(room, ctx, 'house-7-spores', 24, (k) => SC[k % 4], 0.035, (k, t) => {
    const x0 = (hash(k) - 0.5) * (W - 2.2), z0 = (hash(k + 50) - 0.5) * (D - 1.6), span = 1.9;
    const u = ((t * (0.08 + hash(k + 9) * 0.07) + hash(k + 21)) % 1 + 1) % 1;
    return [x0 + Math.sin(t * 0.5 + k) * 0.25, 0.25 + u * span, z0 + Math.cos(t * 0.4 + k * 1.7) * 0.2, Math.min(1, u * 6, (1 - u) * 6)];
  });

  // ---- night: the burrow glows from below. Dithered halos on the packed earth: cyan at the left bank's fungi, pink at
  // the right, a rose ring around the fairy ring (its middle, with the shoe, left dark: slightly wrong), gold spilling
  // from the tiny door, beetle-green under the lantern; specks of glowing spore-dust on the floor
  const CY = ['#4C7C88', '#58AEB2', '#8EE6DA'], PK = ['#7C5A78', '#B26C9C', '#F29CCC'], RS = ['#84506A', '#C25E86', '#FF8AB0'];
  const GD = ['#7C6446', '#B48C4C', '#F4C674'], BG = ['#5C7A5A', '#82AA6A', '#BCEA92'];
  const night = lightPools(room, ctx, 'house-7-night', {
    floor: [
      pool(-2.75, -0.75, 1.75, CY, { peak: 1.0, sz: 1.25 }), pool(-2.2, 1.1, 0.9, CY, { peak: 0.55 }),
      pool(2.9, -0.45, 1.5, PK, { peak: 0.9, sz: 1.3 }), pool(1.0, 1.95, 0.75, PK, { peak: 0.5 }),
      ring(RX, RZ, RR, 0.42, RS, { peak: 1.0, kind: 2 }),
      pool(2.2, BZ + 0.45, 0.85, GD, { peak: 0.95, sx: 0.75, kind: 2 }),
      pool(LX, LZ + 0.1, 0.75, BG, { peak: 0.42 }),
    ],
    back: [pool(2.2, 0.32, 0.6, GD, { peak: 0.85 })],
    // the back banks' colliders (axis rects) reach past the curved face: the floor in front of the curve, inside them,
    // is still painted (it used to stay as a dark moon-shadow band at the bank's foot)
    tops: [-1, 1].map((sx) => ({
      in: (u, v) => {
        const Cx = sx * (W / 2 - 1.35), Cz = BZ + 1.35;
        return sx * u > W / 2 - 1.35 && v < Cz && Math.hypot(u - Cx, v - Cz) < 1.33;
      },
      y: 0.006, cols: sx < 0 ? CY : PK,
    })),
    extra: (pb, tx) => {
      // (polish 2026-10-16) the left back bank: its earthen foot sat in the moon shadow as a hard black dome. The cyan
      // shelf-fungi on it now light their own bank: a Bayer-dithered field on the curved face (arc length s, height y),
      // brightest around the fungi, dissolving toward the corner and the floor (no hard edge, never black)
      {
        const R = 1.35 * 0.985, Cx = -W / 2 + 1.35, Cz = BZ + 1.35, L = R * Math.PI / 2, cs = tx * 1.25, cy = tx * 1.4;
        const BK = ['#2E3E4C', '#3A5A62', '#4E8282'];
        const at = (t) => [Cx - R * Math.cos(t), Cz - R * Math.sin(t)];
        const I = (sv, y) => {
          const d = Math.hypot((sv - L * 0.52) / (L * 0.62), (y - 1.05) / 1.25);
          return Math.max(0.45 * Math.max(0, 1 - y / 1.9), d >= 1 ? 0 : 0.62 * (1 - d) ** 1.2);   // + a floor-up base wash
        };
        const SEG = 0.22;                                              // runs split every 22 cm of arc: chords hug the curve
        for (let j = 0; (j + 0.5) * cy < H - 0.25; j++) {
          const y0 = j * cy, y1 = y0 + cy, yc = y0 + cy / 2;
          let run = null;
          const flush = () => {
            if (!run) return;
            const [xa, za] = at(run.a / R), [xb, zb] = at(run.b / R);
            pb.tris([xa, y0, za, xb, y0, zb, xb, y1, zb, xa, y0, za, xb, y1, zb, xa, y1, za], { tones: 'glass', layer: 'glass', glow: BK[run.lev - 1], glowKind: 1 });
            run = null;
          };
          for (let i = 0; (i + 0.5) * cs < L; i++) {
            const sv = (i + 0.5) * cs, v = I(sv, yc) * 3, lo = Math.floor(v);
            const f = Math.min(1, Math.max(0, (v - lo - 0.5 + 0.22) / 0.44));        // dithered only mid-step (few runs)
            const lev = Math.min(3, lo + (f > BAYER[(j & 3) * 4 + (i & 3)] ? 1 : 0));
            const a = i * cs, bnd = Math.min(L, a + cs);
            if (run && run.lev === lev && Math.floor(a / SEG) === Math.floor(run.a / SEG)) run.b = bnd;
            else { flush(); if (lev) run = { a, b: bnd, lev }; }
          }
          flush();
        }
      }
      for (let i = 0; i < 46; i++) {
        const x = (hash(i + 400) - 0.5) * (W - 1.4), z = (hash(i + 450) - 0.5) * (D - 1.0), c = [CYAN, '#9AF0C8', PINK][i % 3];
        if (Math.hypot(x - QX, z - QZ) < 0.6) continue;
        pb.tris([x, 0.008, z, x, 0.008, z + 2 * tx, x + tx, 0.008, z + 2 * tx, x, 0.008, z, x + tx, 0.008, z + 2 * tx, x + tx, 0.008, z], { tones: 'glass', layer: 'glass', glow: c, glowKind: 2 });
      }
    },
  });

  let leftWallSoft = false;
  room.spot('ring', RX + 0.9, RZ, -Math.PI / 2);
  room.spot('table', QX, QZ + 1.15, Math.PI);
  room.spot('almanac', AX, AZ + 0.6, Math.PI);

  return {
    bed: { x: BX, z: BZc - 0.4, y: 0.46, facing: 0 },
    visit: { x: BX - 0.85, z: BZc + 0.25, facing: Math.PI / 2 },
    extras: [spores.group, night.group],
    update(t) {
      // the burrow's left wall throws no hard noon shadow across the floor (the round banks shade the corners instead):
      // once the room is attached, its full-height left wall stops casting
      if (!leftWallSoft && spores.group.parent) {
        leftWallSoft = true;
        spores.group.parent.getObjectByName(`${room.id}-wall-left`)?.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      }
      spores.update(t);
      night.update();
    },
  };
}
