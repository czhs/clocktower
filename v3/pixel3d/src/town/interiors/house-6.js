// house-6 interior: The Lantern-maker's (owner: interiors 5-9 builder; LORE pass 2026-10-16). docs/INTERIORS.md, docs/LORE.md.
// The maker of every lantern in Hollowmere. Busy, cozy, sooty; dark by day, a hive of small lights by night.
//   ROOM: a TALL soot-blackened brick workshop (3.8 m) with a SLEEPING LOFT across the back-left on posts: the
//   lantern-maker's bed, a chest and spare frames up there, a ladder up to it. Under the loft's front beam hangs the
//   town's rack: one lantern per house on fifteen numbered hooks, and one hook is EMPTY. A brick forge with a sooty iron
//   hood in the back-right corner (no hearth), a stone-flag floor, strings of lanterns criss-crossing the high room,
//   and the great brass lantern swinging from the rafters.
//   STORY: the empty hook; the SMASHED lantern on the workbench (bent cage, glass shards, a tag reading 13: the
//   ferryman's, whose hook by the river is bare); the lamplighter's route map of the lanes pinned on the wall (the ring,
//   the square, lamp dots, one red dot by the river); beside it a calendar with THE CIRCLED DATE; a lamplighter's pole.
//   LIGHT: by day only the forge glows orange in a sooty room (every lantern dark: glass and coloured paper); at night
//   every lantern is lit (the kit's night glass) - gold, pumpkin, rose and violet - plus the forge, the test lantern on
//   the bench, the swinging great lantern and the loft candle.
//   AMBIANCE: sparks spitting up from the forge (stepped 8 fps), the great lantern swinging on its chain.
import * as THREE from 'three';
import { Builder } from '../kit.js';

export const ROOM = { w: 9, d: 6, h: 3.8, wall: 'brick', pal: 2, floor: 'flags' };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** A flat, upward-facing w x d quad at y, turned ry (thin panes and sheets whose edges never read: tri budget). */
function flat(b, w, d, [x, y, z], ry, opts) {
  const c = Math.cos(ry), s = Math.sin(ry), q = (u, v) => [x + u * c + v * s, y, z - u * s + v * c];
  b.tris([...q(-w / 2, d / 2), ...q(w / 2, d / 2), ...q(w / 2, -d / 2), ...q(-w / 2, d / 2), ...q(w / 2, -d / 2), ...q(-w / 2, -d / 2)], opts);
}

/** One mesh of n tiny glowing boxes whose centres follow pos(k, t) -> [x, y, z, scale] (room-local), stepped 8 fps.
 *  sizeOf(k) -> [w, h, d] / kindOf(k) -> glowKind: a mote may be a bigger box (the great lantern's swinging core). */
function motes(room, ctx, name, n, colorOf, size, pos, { sizeOf = null, kindOf = null } = {}) {
  const pb = new Builder(room.engine, { name });
  for (let k = 0; k < n; k++) pb.box(...(sizeOf?.(k) ?? [size, size, size]), { at: [0, 0, 0], origin: 'center', tones: 'glass', layer: 'glass', glow: colorOf(k), glowKind: kindOf?.(k) ?? 1 });
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
  const { FURNITURE: F, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp } = ctx;
  const W = room.W, D = room.D, H = room.H, BZ = -D / 2;
  const b = room.b, g = room.g;
  const SOOT = paintRamp('#54392a', { lightness: 0.32 });             // soot-black brick, warm umber (not mauve)
  const FLAG = paintRamp('#8a6c50', { lightness: 0.46 });             // warm sandstone flags (night: the lantern gold reads)
  const MUSTARD = paintRamp('#a8782a', { lightness: 0.46 });
  // lantern colours: [paper / glass tone by day, glow at night]
  const LAMP = [['cream', TP.lampGlow], [TP.pumpkin, TP.fireGlow], [TP.flowerRed, '#FF7A6A'], [TP.bannerGold, '#FFD27A'], [TP.flowerViolet, '#C89CFF'], ['cream', TP.glow[0]]];

  /** A tin lantern with its bottom at y. glow: 'night' (kit night glass), 'always' (interior glow), null (dark glass). */
  // (polish tri budget: only the two front posts - the back ones hide behind the glass core; the hanging ring is opt-in)
  const tinLantern = (bb, gg, x, y, z, { lit = 'night', s = 1, color = TP.lampGlow, ring = false } = {}) => {
    const h = 0.25 * s, w = 0.17 * s;
    bb.box(w + 0.03, 0.035, w + 0.03, { at: [x, y, z], tones: 'iron', pattern: 'none' });
    for (const sx of [-1, 1]) bb.box(0.025, h, 0.025, { at: [x + sx * w / 2, y + 0.035, z + w / 2], tones: 'iron', pattern: 'none' });
    bb.hexa([V(x - w / 2 - 0.02, y + h + 0.035, z - w / 2 - 0.02), V(x + w / 2 + 0.02, y + h + 0.035, z - w / 2 - 0.02), V(x - 0.03, y + h + 0.12 * s, z - 0.03), V(x + 0.03, y + h + 0.12 * s, z - 0.03),
      V(x - w / 2 - 0.02, y + h + 0.035, z + w / 2 + 0.02), V(x + w / 2 + 0.02, y + h + 0.035, z + w / 2 + 0.02), V(x - 0.03, y + h + 0.12 * s, z + 0.03), V(x + 0.03, y + h + 0.12 * s, z + 0.03)], { tones: 'iron' });
    if (ring) bb.box(0.05, 0.05, 0.015, { at: [x, y + h + 0.12 * s, z], tones: 'iron' });
    const core = [w - 0.02, h - 0.02, w - 0.02], at = [x, y + 0.045, z];
    if (lit === 'always') gg.box(...core, { at, tones: 'glass', layer: 'glass', glow: color, glowKind: 2 });
    else if (lit === 'night') bb.box(...core, { at, tones: 'glass', layer: 'glass', glow: color, glowKind: 2 });
    else bb.box(...core, { at, tones: 'glass', pattern: 'none' });
  };
  /** A paper lantern (two cones of coloured paper that glow at night, dark caps) with its bottom at y. */
  const paperLantern = (x, y, z, k, s = 1) => {
    const [tone, glow] = LAMP[k % LAMP.length];
    b.box(0.11 * s, 0.03 * s, 0.11 * s, { at: [x, y - 0.02 * s, z], tones: 'crow', pattern: 'none' });          // (caps: boxes, tri budget)
    b.cylinder(0.1 * s, 0.14 * s, 0.12 * s, { at: [x, y, z], tones: tone, layer: 'glass', glow, glowKind: 2, segments: 6 });
    b.cylinder(0.14 * s, 0.1 * s, 0.12 * s, { at: [x, y + 0.12 * s, z], tones: tone, layer: 'glass', glow, glowKind: 2, segments: 6 });
    b.box(0.1 * s, 0.03 * s, 0.1 * s, { at: [x, y + 0.24 * s, z], tones: 'crow', pattern: 'none' });
  };

  // ---- shell: soot-black brick over warm brick, a small iron-framed window back-right, a high loft window, flags
  room.shell({
    windows: [
      { x: 2.88, y: 1.05, w: 0.64, h: 1.2, panes: [2, 3], curtains: null, frame: 'iron' },
      { x: -2.2, y: 2.45, w: 0.95, h: 0.72, panes: [3, 2], curtains: null, frame: 'iron' },
    ],
    wallTones: { upper: { tones: SOOT, pattern: 'brick' }, lower: { tones: 'brick', pattern: 'brick' } },
    dado: 1.3, floorTones: FLAG, floorPattern: 'ashlar',
  });

  // ---- the sleeping loft across the back-left (deck at 1.75 m), posts, railing, ladder
  const LX0 = -W / 2, LX1 = 0.78, LZ1 = -1.45, LY = 1.75, LCX = (LX0 + LX1) / 2, LW = LX1 - LX0, LD = LZ1 - BZ;
  b.box(LW, 0.12, LD, { at: [LCX, LY - 0.12, BZ + LD / 2], tones: 'plank', pattern: 'planks' });
  b.box(LW + 0.04, 0.22, 0.08, { at: [LCX, LY - 0.3, LZ1 - 0.04], tones: 'timber', pattern: 'none' });       // front beam
  for (let i = 0; i < 6; i++) b.box(0.09, 0.14, LD, { at: [LX0 + 0.2 + i * (LW - 0.4) / 5, LY - 0.26, BZ + LD / 2], tones: 'timber', pattern: 'none' });
  for (const px of [-2.35, LX1 - 0.07]) {
    b.box(0.14, LY - 0.3, 0.14, { at: [px, 0, LZ1 - 0.07], tones: 'timber', pattern: 'none' });
    room.solid(px - 0.09, LZ1 - 0.16, px + 0.09, LZ1 + 0.02);
  }
  for (const px of [-2.35, LX1 - 0.07]) {                                                                   // knee braces
    for (const s of [-1, 1]) if (px + s * 0.3 > LX0 && px + s * 0.3 < LX1) b.box(0.06, 0.45, 0.06, { at: [px + s * 0.17, LY - 0.68, LZ1 - 0.07], tones: 'timber', rz: -s * 0.75 });
  }
  // railing with a gap for the ladder (x -0.05 .. 0.6)
  const railY = LY + 0.72, gap0 = -0.05, gap1 = 0.62;
  for (const [x0, x1] of [[LX0, gap0], [gap1, LX1]]) b.box(x1 - x0, 0.06, 0.06, { at: [(x0 + x1) / 2, railY, LZ1 - 0.04], tones: 'timber', pattern: 'none' });
  for (let x = LX0 + 0.25; x < LX1; x += 0.36) if (x < gap0 || x > gap1) b.box(0.04, 0.72, 0.04, { at: [x, LY, LZ1 - 0.04], tones: 'timber', pattern: 'none' });
  b.box(0.06, 0.06, LD, { at: [LX1 - 0.03, railY, BZ + LD / 2], tones: 'timber', pattern: 'none' });
  for (let z = BZ + 0.35; z < LZ1; z += 0.4) b.box(0.04, 0.72, 0.04, { at: [LX1 - 0.03, LY, z], tones: 'timber', pattern: 'none' });
  const LAX = 0.28, LAZ0 = -0.78;
  for (const s of [-1, 1]) {
    b.hexa([V(LAX + s * 0.22 - 0.03, 0, LAZ0), V(LAX + s * 0.22 + 0.03, 0, LAZ0), V(LAX + s * 0.22 - 0.03, LY + 0.55, LZ1 - 0.02), V(LAX + s * 0.22 + 0.03, LY + 0.55, LZ1 - 0.02),
      V(LAX + s * 0.22 - 0.03, 0, LAZ0 + 0.06), V(LAX + s * 0.22 + 0.03, 0, LAZ0 + 0.06), V(LAX + s * 0.22 - 0.03, LY + 0.55, LZ1 + 0.04), V(LAX + s * 0.22 + 0.03, LY + 0.55, LZ1 + 0.04)], { tones: 'plank' });
  }
  for (let i = 1; i < 7; i++) { const f = i / 7.4; b.box(0.44, 0.035, 0.04, { at: [LAX, f * (LY + 0.55), LAZ0 + 0.03 + f * (LZ1 - LAZ0 - 0.03)], tones: 'plank', pattern: 'none' }); }
  room.solid(LAX - 0.27, LZ1, LAX + 0.27, LAZ0 + 0.08);
  // up on the loft: the bed (head to the left wall), a quilt in mustard patches, a chest, spare frames, a candle
  const BXc = -3.45, BZc = BZ + 0.8;
  b.box(2.0, 0.22, 1.0, { at: [BXc, LY, BZc], tones: 'plank', pattern: 'none' });
  b.box(0.08, 0.7, 1.0, { at: [BXc - 1.0, LY, BZc], tones: 'timber', pattern: 'vboards', scale: 0.6 });
  b.box(1.92, 0.14, 0.92, { at: [BXc, LY + 0.22, BZc], tones: 'cream', pattern: 'none' });
  b.box(0.36, 0.12, 0.55, { at: [BXc - 0.72, LY + 0.36, BZc], tones: 'cream', tint: 1.04, pattern: 'none' });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.box(0.44, 0.07, 0.5, { at: [BXc - 0.22 + i * 0.44, LY + 0.36, BZc - 0.25 + j * 0.5], tones: (i + j) % 2 ? MUSTARD : CLOTH.red, tint: [1, 0.95, 1.05][(i + j) % 3], pattern: 'none' });
  b.box(1.32, 0.24, 0.04, { at: [BXc + 0.22, LY + 0.14, BZc + 0.51], tones: MUSTARD, tint: 0.94, pattern: 'none' });
  F.chest(room, { x: -1.55, z: BZ + 0.35, y: LY, collide: false });
  room.colliders.pop();                                                     // (the chest stands on the loft, not the floor)
  b.cylinder(0.07, 0.07, 0.02, { at: [-1.35, LY + 0.53, BZ + 0.35], tones: 'brass', segments: 8 });
  b.box(0.05, 0.12, 0.05, { at: [-1.35, LY + 0.55, BZ + 0.35], tones: 'cream', pattern: 'none' });
  g.box(0.05, 0.06, 0.05, { at: [-1.35, LY + 0.67, BZ + 0.35], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
  room.light({ pos: [-1.35, LY + 0.85, BZ + 1.0], color: GLOW.candle, r: 1.0, kind: 'lantern', intensity: 1.3 });
  for (let i = 0; i < 3; i++) tinLantern(b, g, -0.55 + i * 0.22, LY, BZ + 0.3 + (i % 2) * 0.15, { lit: null, s: 0.9 });   // spare frames (unglazed)
  // ---- the town's rack: fifteen numbered hooks under the loft beam, one lantern per house; hook 14 is EMPTY
  const HOOK0 = LX0 + 0.3, HOOKS = 15, HS = (LX1 - 0.25 - HOOK0) / (HOOKS - 1);
  b.box(LW - 0.2, 0.04, 0.04, { at: [LCX, LY - 0.46, LZ1 - 0.12], tones: 'iron', pattern: 'none' });
  for (let i = 0; i < HOOKS; i++) {
    const x = HOOK0 + i * HS, z = LZ1 - 0.12;
    b.tris([x - 0.012, LY - 0.56, z + 0.01, x + 0.012, LY - 0.56, z + 0.01, x + 0.012, LY - 0.46, z + 0.01,
      x - 0.012, LY - 0.56, z + 0.01, x + 0.012, LY - 0.46, z + 0.01, x - 0.012, LY - 0.46, z + 0.01], { tones: 'iron', pattern: 'none' });   // the hook (a front quad)
    b.tris([x - 0.035, LY - 0.43, z + 0.036, x + 0.035, LY - 0.43, z + 0.036, x + 0.035, LY - 0.39, z + 0.036,
      x - 0.035, LY - 0.43, z + 0.036, x + 0.035, LY - 0.39, z + 0.036, x - 0.035, LY - 0.39, z + 0.036], { tones: 'cream', pattern: 'none' });   // the number plate
    if (i === 13) continue;
    tinLantern(b, g, x, LY - 0.93, z, { s: 0.85, color: LAMP[i % LAMP.length][1] });
  }
  room.light({ pos: [-1.7, 1.3, LZ1 + 0.35], color: '#FFAA48', r: 1.25, kind: 'lantern', intensity: 1.5 });
  // under the loft: crates of glass and tin, oil cans
  b.box(0.7, 0.42, 0.5, { at: [-3.6, 0, BZ + 0.4], tones: 'plank', pattern: 'boards', scale: 0.6 });
  b.box(0.6, 0.36, 0.45, { at: [-2.8, 0, BZ + 0.35], tones: 'plank', pattern: 'boards', scale: 0.6, tint: 0.94 });
  for (let i = 0; i < 4; i++) b.box(0.4, 0.3, 0.02, { at: [-2.8, 0.36, BZ + 0.22 + i * 0.07], tones: 'glass', pattern: 'none' });
  for (let i = 0; i < 3; i++) b.cylinder(0.08, 0.08, 0.26, { at: [-1.2 + i * 0.2, 0, BZ + 0.3 + (i % 2) * 0.12], tones: i % 2 ? 'copper' : 'iron', segments: 8 });
  room.solid(LX0, BZ, -1.0, BZ + 0.65);

  // ---- the forge in the back-right corner: brick, glowing coals, a sooty iron hood and flue, bellows, an anvil
  const FX0 = 3.3, FX1 = W / 2, FXc = (FX0 + FX1) / 2, FD = 0.95;
  b.box(FX1 - FX0, 0.82, FD, { at: [FXc, 0, BZ + FD / 2], tones: 'brick', pattern: 'brick', scale: 0.8 });
  b.box(FX1 - FX0 + 0.06, 0.07, FD + 0.06, { at: [FXc, 0.82, BZ + FD / 2], tones: 'ashlar', pattern: 'none', tint: 0.94 });
  b.box(0.7, 0.05, 0.55, { at: [FXc, 0.86, BZ + 0.45], tones: 'crow', pattern: 'none' });
  g.box(0.6, 0.05, 0.45, { at: [FXc, 0.89, BZ + 0.45], tones: 'glass', layer: 'glass', glow: GLOW.ember, glowKind: 2 });
  for (const [fx, fz, fh, c] of [[-0.18, 0.4, 0.2, GLOW.fire], [0.02, 0.5, 0.28, GLOW.fire], [0.2, 0.42, 0.16, GLOW.fire], [-0.05, 0.36, 0.14, GLOW.flame], [0.1, 0.55, 0.12, GLOW.flame]]) {
    g.box(0.1, fh, 0.1, { at: [FXc + fx, 0.92, BZ + fz], tones: 'glass', layer: 'glass', glow: c, glowKind: 2 });
  }
  b.hexa([V(FX0 - 0.05, 1.55, BZ), V(FX1, 1.55, BZ), V(FXc - 0.2, 2.35, BZ), V(FXc + 0.2, 2.35, BZ),
    V(FX0 - 0.05, 1.55, BZ + FD + 0.05), V(FX1, 1.55, BZ + FD + 0.05), V(FXc - 0.2, 2.35, BZ + 0.35), V(FXc + 0.2, 2.35, BZ + 0.35)], { tones: 'iron' });
  b.box(FX1 - FX0 + 0.1, 0.06, FD + 0.1, { at: [FXc - 0.02, 1.52, BZ + FD / 2 + 0.02], tones: 'crow', pattern: 'none' });
  b.box(0.4, H - 2.35, 0.35, { at: [FXc, 2.35, BZ + 0.175], tones: 'iron', pattern: 'none', tint: 0.94 });
  for (const s of [-1, 1]) b.box(0.05, 0.75, 0.05, { at: [FXc + s * 0.5, 0.82, BZ + FD - 0.05], tones: 'iron' });
  b.hexa([V(FX0 - 0.42, 0.55, BZ + 0.35), V(FX0 - 0.08, 0.6, BZ + 0.35), V(FX0 - 0.42, 0.8, BZ + 0.35), V(FX0 - 0.08, 0.66, BZ + 0.35),
    V(FX0 - 0.42, 0.55, BZ + 0.75), V(FX0 - 0.08, 0.6, BZ + 0.75), V(FX0 - 0.42, 0.8, BZ + 0.75), V(FX0 - 0.08, 0.66, BZ + 0.75)], { tones: 'trunk' });
  b.box(0.06, 0.55, 0.06, { at: [FX0 - 0.25, 0, BZ + 0.55], tones: 'timber' });
  room.solid(FX0 - 0.45, BZ, FX1, BZ + FD + 0.05);
  const ANX = 3.55, ANZ = -1.45;                                                                            // the anvil
  b.cylinder(0.22, 0.25, 0.48, { at: [ANX, 0, ANZ], tones: 'trunk', segments: 8 });
  b.box(0.42, 0.12, 0.18, { at: [ANX, 0.48, ANZ], tones: 'iron' });
  b.box(0.2, 0.08, 0.14, { at: [ANX, 0.6, ANZ], tones: 'iron', tint: 1.06 });
  b.prism([[0, 0], [0.2, 0.04], [0, 0.1]], 0.12, { at: [ANX + 0.2, 0.58, ANZ], tones: 'iron' });
  room.solid(ANX - 0.27, ANZ - 0.25, ANX + 0.27, ANZ + 0.25);
  // (polish 3: the fire sits over the coals under the hood, BEHIND the brick base's front face - 0.35 m in front of it,
  //  its toon pool painted a hard pinkish half-ellipse on the brick. r 1.25 < its 1.2 m height + the hearth's depth, so
  //  it reaches the hood, the coals' rim, the bellows and the anvil, never the flags: the dithered fan carries the floor)
  room.light({ pos: [FXc - 0.1, 1.2, BZ + 0.45], color: '#FF7A30', r: 1.25, kind: 'fire', intensity: 1.7 });

  // ---- the back wall: the lamplighter's route map, the calendar with the circled date
  const MX = 1.6, MY = 1.55, MW = 1.36, MH = 1.05;
  room.wallFrame('back', ({ full, glow: wg }) => {
    full.box(MW + 0.1, MH + 0.1, 0.04, { at: [MX, MY - 0.05, 0.02], tones: 'timber', pattern: 'none' });
    full.box(MW, MH, 0.02, { at: [MX, MY, 0.045], tones: TP.thatch, pattern: 'none', tint: 1.04 });
    const cx = MX - 0.05, cy = MY + MH * 0.52, R = 0.3;
    for (let k = 0; k < 8; k++) {                                                    // the ring lane
      const a = (k / 8) * Math.PI * 2;
      full.box(0.25, 0.03, 0.01, { at: [cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0.06], rz: a + Math.PI / 2, tones: 'timber', origin: 'center', pattern: 'none' });
    }
    for (const a of [0.4, 1.9, 3.3, 4.6]) {                                          // radial lanes out to the edge
      full.box(0.34, 0.025, 0.01, { at: [cx + Math.cos(a) * (R + 0.17), cy + Math.sin(a) * (R + 0.17), 0.06], rz: a, tones: 'timber', origin: 'center', pattern: 'none' });
    }
    full.box(0.14, 0.14, 0.01, { at: [cx, cy, 0.06], tones: 'ashlar', origin: 'center', pattern: 'none', rz: Math.PI / 4 });   // the square
    full.box(MW - 0.1, 0.06, 0.01, { at: [MX, MY + 0.12, 0.058], rz: 0.08, tones: CLOTH.blue, origin: 'center', pattern: 'none' });   // the river
    const dots = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; dots.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
    for (const a of [0.4, 1.9, 3.3, 4.6]) dots.push([cx + Math.cos(a) * (R + 0.3), cy + Math.sin(a) * (R + 0.3)]);
    for (const [x, y] of dots) wg.box(0.035, 0.035, 0.01, { at: [x, y, 0.065], origin: 'center', tones: 'glass', layer: 'glass', glow: TP.glow[1], glowKind: 1 });
    wg.box(0.045, 0.045, 0.01, { at: [MX + 0.42, MY + 0.18, 0.066], origin: 'center', tones: 'glass', layer: 'glass', glow: '#FF4A3A', glowKind: 1 });   // the one by the river
    for (let k = 0; k < dots.length - 1; k += 1) {                                   // the round, in red thread
      if (k % 3 === 2) continue;
      const [x0, y0] = dots[k], [x1, y1] = dots[(k + 5) % dots.length];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > 0.5) continue;
      full.box(len, 0.012, 0.008, { at: [(x0 + x1) / 2, (y0 + y1) / 2, 0.07], rz: Math.atan2(y1 - y0, x1 - x0), origin: 'center', tones: TP.bannerRed, pattern: 'none' });
    }
    for (const [px, py] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) full.box(0.03, 0.03, 0.02, { at: [MX + px * (MW / 2 - 0.04), MY + MH / 2 + py * (MH / 2 - 0.04), 0.07], origin: 'center', tones: 'brass' });
    // the calendar: a cream sheet of ruled days, one CIRCLED in red
    const CX = 2.42, CY = 1.62;
    full.box(0.3, 0.42, 0.015, { at: [CX, CY, 0.04], tones: 'cream', pattern: 'none' });
    full.box(0.3, 0.07, 0.016, { at: [CX, CY + 0.35, 0.042], tones: TP.bannerRed, pattern: 'none', tint: 0.94 });
    for (let r = 0; r < 4; r++) full.box(0.26, 0.008, 0.01, { at: [CX, CY + 0.06 + r * 0.075, 0.05], tones: 'iron', pattern: 'none' });
    for (let c = 0; c < 3; c++) full.box(0.008, 0.28, 0.01, { at: [CX - 0.09 + c * 0.09, CY + 0.04, 0.05], tones: 'iron', pattern: 'none' });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      full.box(0.035, 0.014, 0.01, { at: [CX + 0.045 + Math.cos(a) * 0.04, CY + 0.17 + Math.sin(a) * 0.036, 0.056], rz: a + Math.PI / 2, origin: 'center', tones: TP.bannerRed, pattern: 'none' });
    }
  });

  // ---- the workbench: snips, panes, and one lantern lit for testing
  const WBX = 1.55, WBZ = -0.5;
  F.workbench(room, {
    x: WBX, z: WBZ, w: 1.9,
    extra: (bb, gg, top) => {
      // snips, a stack of panes, a coil of wire, the test lantern (lit day and night)
      bb.box(0.22, 0.02, 0.03, { at: [0.25, top, 0.18], ry: 0.5, tones: 'iron' });
      for (let i = 0; i < 4; i++) flat(bb, 0.2, 0.16, [0.35, top + 0.012 + i * 0.013, -0.15], i * 0.06, { tones: 'glass', pattern: 'none' });
      bb.cylinder(0.07, 0.07, 0.04, { at: [0.6, top, 0.1], tones: 'brass', segments: 8 });
      tinLantern(bb, gg, 0.72, top, -0.12, { lit: 'always', s: 1.1 });
    },
  });
  room.light({ pos: [WBX + 0.72, 1.45, WBZ + 0.3], color: '#FFB050', r: 0.85, kind: 'lantern', intensity: 1.2 });
  F.stool(room, { x: WBX - 0.3, z: WBZ + 0.7 });

  // ---- the SMASHED lantern, big, on the open floor in front of the bench: a bent cage on its side, its hood knocked
  // off, glass shards everywhere, spilt oil, and a CREAM TAG on a red thread leaning on it, lettered 13 (the ferryman's)
  const SLX = 1.25, SLZ = 1.2;
  b.box(0.55, 0.008, 0.32, { at: [SLX - 0.15, 0.004, SLZ + 0.05], ry: 0.3, tones: 'crow', pattern: 'none', tint: 0.94 });   // spilt oil
  b.push({ at: [SLX, 0.2, SLZ], ry: 0.45, rz: Math.PI / 2 - 0.18 });
  b.box(0.42, 0.05, 0.42, { at: [0, -0.3, 0], tones: 'iron', pattern: 'none' });                                       // base plate
  for (const [sx, sz, rz, rx] of [[-1, -1, 0.0, 0.0], [1, -1, -0.35, 0.1], [-1, 1, 0.25, -0.2], [1, 1, 0.55, 0.0]]) {
    b.box(0.04, 0.5, 0.04, { at: [sx * 0.19, -0.27, sz * 0.19], rz, rx, tones: 'iron', pattern: 'none' });            // bent posts
  }
  b.box(0.42, 0.04, 0.04, { at: [0, 0.2, -0.19], rz: 0.12, tones: 'iron', pattern: 'none' });
  b.box(0.04, 0.04, 0.42, { at: [0.2, 0.18, 0], rx: -0.2, tones: 'iron', pattern: 'none' });
  b.box(0.3, 0.3, 0.02, { at: [-0.02, -0.24, -0.17], rz: 0.3, tones: 'glass', pattern: 'none', tint: 1.04 });          // one cracked pane left
  b.pop();
  b.hexa([V(SLX - 0.85, 0, SLZ - 0.25), V(SLX - 0.45, 0, SLZ - 0.3), V(SLX - 0.72, 0.2, SLZ - 0.2), V(SLX - 0.6, 0.2, SLZ - 0.22),
    V(SLX - 0.85, 0, SLZ + 0.12), V(SLX - 0.45, 0, SLZ + 0.08), V(SLX - 0.72, 0.2, SLZ - 0.05), V(SLX - 0.6, 0.2, SLZ - 0.06)], { tones: 'iron' });   // its fallen hood
  b.box(0.08, 0.08, 0.025, { at: [SLX - 0.66, 0.2, SLZ - 0.13], tones: 'iron' });
  for (let i = 0; i < 14; i++) {                                                                                        // glass shards
    const a = hash(i + 70) * Math.PI * 2, r = 0.35 + hash(i + 80) * 0.55;
    const sw = 0.05 + hash(i + 90) * 0.04, sd = 0.03 + hash(i + 95) * 0.025, sx = SLX + Math.cos(a) * r, sz = SLZ + Math.sin(a) * r * 0.7, c = Math.cos(a * 3), sn = Math.sin(a * 3);
    const q = (u, v) => [sx + u * c + v * sn, 0.012, sz - u * sn + v * c];                                            // a flat shard (top face only)
    b.tris([...q(-sw, sd), ...q(sw, sd), ...q(sw, -sd), ...q(-sw, sd), ...q(sw, -sd), ...q(-sw, -sd)], { tones: 'cream', pattern: 'none', tint: i % 2 ? 1.05 : 0.97 });
  }
  // the tag: a big cream card leaning back against the cage, facing the room; a red thread back to the cage ring
  const TGX = SLX + 0.42, TGZ = SLZ + 0.3;
  b.box(0.5, 0.012, 0.012, { at: [TGX - 0.3, 0.02, TGZ - 0.12], ry: 0.55, tones: TP.bannerRed, pattern: 'none' });
  b.push({ at: [TGX, 0.0, TGZ], ry: -0.2, rx: -0.55 });
  b.box(0.46, 0.3, 0.02, { at: [0, 0, 0], tones: 'cream', pattern: 'none', tint: 1.04 });
  b.box(0.035, 0.035, 0.012, { at: [-0.18, 0.13, 0.014], tones: TP.bannerRed, pattern: 'none' });                    // the punched hole, threaded
  const ink = (w, h, x, y) => b.box(w, h, 0.01, { at: [x, y, 0.016], tones: 'crow', pattern: 'none' });
  ink(0.04, 0.2, -0.07, 0.05); ink(0.06, 0.035, -0.09, 0.2);                                                           // 1
  ink(0.13, 0.035, 0.07, 0.215); ink(0.1, 0.035, 0.075, 0.13); ink(0.13, 0.035, 0.07, 0.05); ink(0.04, 0.2, 0.115, 0.05);   // 3
  b.pop();
  room.solid(SLX - 0.6, SLZ - 0.35, SLX + 0.5, SLZ + 0.4);

  // ---- front-left: the paper-lantern table (a half-ribbed globe, coloured paper, paint pots, a brush)
  const PTX = -2.55, PTZ = 0.95;
  F.table(room, {
    x: PTX, z: PTZ, w: 1.35, d: 0.72, items: false,
    extra: (bb, gg, top) => {
      for (let r = 0; r < 3; r++) {                                   // the rib globe: three meridian hoops of cane
        bb.push({ at: [-0.2, top + 0.24, 0], ry: (r / 3) * Math.PI });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; bb.box(0.17, 0.016, 0.016, { at: [Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0], rz: a + Math.PI / 2, origin: 'center', tones: TP.thatch, pattern: 'none' }); }
        bb.pop();
      }
      bb.cylinder(0.06, 0.08, 0.03, { at: [-0.2, top, 0], tones: 'timber', segments: 8 });
      for (const [i, c] of [[0, TP.pumpkin], [1, TP.flowerRed], [2, TP.flowerViolet], [3, TP.bannerGold]].map(([i, c]) => [i, c])) {
        bb.box(0.34, 0.006, 0.26, { at: [0.3 + (i % 2) * 0.04, top + i * 0.007, -0.05 + (i % 2) * 0.04], ry: i * 0.12 - 0.15, tones: c, pattern: 'none' });
      }
      for (const [dx, c] of [[0.1, TP.flowerRed], [0.22, TP.bannerGold]]) {
        bb.cylinder(0.045, 0.045, 0.07, { at: [dx, top, 0.24], tones: 'iron', segments: 8 });
        bb.cylinder(0.038, 0.038, 0.01, { at: [dx, top + 0.07, 0.24], tones: c, segments: 8 });
      }
      bb.box(0.02, 0.2, 0.02, { at: [0.25, top + 0.04, 0.22], rz: 0.4, tones: TP.thatch });
    },
  });
  F.chair(room, { x: PTX, z: PTZ - 0.62, ry: 0 });
  // ---- strings of lanterns criss-crossing the high room (paper + tin; dark by day, all lit at night)
  const strings = [
    { x0: -W / 2, x1: W / 2, z: 0.25, y0: 3.45, sag: 0.38, n: 6, k0: 0 },
    { x0: -W / 2, x1: W / 2, z: 1.55, y0: 3.3, sag: 0.45, n: 5, k0: 3 },
    { x0: -W / 2, x1: LX1, z: -1.3, y0: 3.6, sag: 0.25, n: 4, k0: 2 },
  ];
  for (const s of strings) {
    const yAt = (x) => s.y0 - s.sag * (1 - ((2 * (x - s.x0)) / (s.x1 - s.x0) - 1) ** 2);
    const seg = 6;
    for (let i = 0; i < seg; i++) {
      const xa = s.x0 + ((s.x1 - s.x0) * i) / seg, xb = s.x0 + ((s.x1 - s.x0) * (i + 1)) / seg, ya = yAt(xa), yb = yAt(xb);
      b.box(Math.hypot(xb - xa, yb - ya), 0.02, 0.02, { at: [(xa + xb) / 2, (ya + yb) / 2, s.z], rz: Math.atan2(yb - ya, xb - xa), origin: 'center', tones: 'crow', pattern: 'none' });
    }
    for (let i = 0; i < s.n; i++) {
      const x = s.x0 + ((s.x1 - s.x0) * (i + 0.7 + (i % 2) * 0.15)) / (s.n + 0.4), y = yAt(x);
      const k = s.k0 + i, drop = 0.18 + (k % 3) * 0.1;
      b.box(0.014, drop, 0.014, { at: [x, y - drop, s.z], tones: 'crow', pattern: 'none' });
      if (k % 3 === 1) tinLantern(b, g, x, y - drop - 0.3, s.z, { s: 1.0, color: LAMP[k % LAMP.length][1], ring: true });
      else paperLantern(x, y - drop - 0.34, s.z, k, 1.3);
    }
  }
  // (polish: these used to reach the flags as big hard-banded discs that overlapped the painted pools - the "ellipse
  // outlines"; now they stop short of the floor and only warm the strings, the loft and the upper walls)
  room.light({ pos: [-2.4, 2.5, 1.55], color: '#FFA040', r: 2.1, kind: 'lantern', intensity: 1.5 });
  room.light({ pos: [2.4, 2.6, 0.0], color: '#FFB050', r: 2.1, kind: 'lantern', intensity: 1.5 });
  room.light({ pos: [1.2, 2.3, 1.9], color: '#FF9A3C', r: 1.9, kind: 'lantern', intensity: 1.5 });

  // ---- front of the room: the lamp-oil barrel, a crate of panes, the lamplighter's pole; crates of packed lanterns
  F.barrel(room, { x: -W / 2 + 0.45, z: D / 2 - 0.55 });
  b.box(0.06, 0.08, 0.14, { at: [-W / 2 + 0.45, 0.45, D / 2 - 0.22], tones: 'brass' });
  b.box(0.62, 0.34, 0.42, { at: [-2.85, 0, D / 2 - 0.42], tones: 'plank', pattern: 'boards', scale: 0.6 });
  for (let i = 0; i < 5; i++) flat(b, 0.5, 0.32, [-2.85, 0.352 + i * 0.013, D / 2 - 0.42], (i % 2) * 0.05, { tones: 'glass', pattern: 'none' });
  room.solidAt(-2.85, D / 2 - 0.42, 0.62, 0.42);
  b.hexa([V(-W / 2 + 0.1, 0, 0.35), V(-W / 2 + 0.15, 0, 0.35), V(-W / 2 + 0.1, 3.1, 0.75), V(-W / 2 + 0.15, 3.1, 0.75),
    V(-W / 2 + 0.1, 0, 0.4), V(-W / 2 + 0.15, 0, 0.4), V(-W / 2 + 0.1, 3.1, 0.8), V(-W / 2 + 0.15, 3.1, 0.8)], { tones: 'timber' });   // the pole
  b.box(0.05, 0.16, 0.12, { at: [-W / 2 + 0.13, 3.05, 0.8], tones: 'brass' });
  for (const [cx, cz, cy, ry] of [[3.65, 1.75, 0, 0], [3.7, 2.35, 0, 0.1], [3.68, 2.05, 0.42, -0.08]]) {
    b.box(0.72, 0.42, 0.52, { at: [cx, cy, cz], ry, tones: 'plank', pattern: 'boards', scale: 0.6, tint: cy ? 1.04 : 1 });
    b.box(0.6, 0.06, 0.4, { at: [cx, cy + 0.42, cz], ry, tones: 'thatch', pattern: 'thatch', scale: 0.4 });
  }
  tinLantern(b, g, 3.55, 0.9, 2.0, { s: 0.9, color: TP.lampGlow });
  room.solid(3.25, 1.45, W / 2, D / 2);
  b.box(1.0, 0.02, 0.55, { at: [0, 0.002, D / 2 - 0.4], tones: 'thatch', pattern: 'thatch', scale: 0.4 });       // doormat

  // ---- the great brass lantern on its chain, swinging (stepped 8 fps); its pool is static
  const GX = -1.3, GZ = 0.75, GY = 2.15;
  const gb = new Builder(room.engine, { name: 'house-6-great' });
  gb.box(0.025, H - GY - 0.45, 0.025, { at: [0, -(H - GY - 0.45), 0], tones: 'iron', pattern: 'none' });
  const ly = -(H - GY);
  gb.box(0.32, 0.05, 0.32, { at: [0, ly, 0], tones: 'brass', pattern: 'none' });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.box(0.035, 0.34, 0.035, { at: [sx * 0.14, ly + 0.05, sz * 0.14], tones: 'brass', pattern: 'none' });
  gb.hexa([V(-0.19, ly + 0.39, -0.19), V(0.19, ly + 0.39, -0.19), V(-0.04, ly + 0.55, -0.04), V(0.04, ly + 0.55, -0.04),
    V(-0.19, ly + 0.39, 0.19), V(0.19, ly + 0.39, 0.19), V(-0.04, ly + 0.55, 0.04), V(0.04, ly + 0.55, 0.04)], { tones: 'brass' });
  gb.cylinder(0.04, 0.04, 0.05, { at: [0, ly + 0.55, 0], tones: 'brass', segments: 8 });
  // (polish mesh budget: its glowing core is the last mote of the forge-sparks mesh, swung with the same pendulum)
  const great = new THREE.Group();
  great.position.set(GX, H, GZ);
  great.add(gb.build({ name: 'house-6-great' }));
  const swing = (k) => [Math.sin(k * 1.9) * 0.1, Math.sin(k * 1.3 + 1) * 0.04];       // [rot z, rot x], stepped time k
  const coreL = ly + 0.06 + 0.15;
  room.light({ pos: [GX, GY + 0.1, GZ + 0.1], color: '#FFB860', r: 1.9, kind: 'lantern', intensity: 1.7 });

  // ---- sparks spitting up from the forge coals (ballistic, stepped 8 fps)
  // ---- night: a hive of small lights. Every lantern pools gold on the sandstone flags (dithered, overlapping), the
  // forge throws a flickering orange fan and climbs the sooty brick behind it, the rack of fifteen glows under the loft,
  // (the loft candle keeps a small toon pool on the bed)
  const GOLD = ['#8A6444', '#C28C4A', '#F4C268'], FORGE = ['#8E4C34', '#CC6634', '#F8944A'];
  const night = lightPools(room, ctx, 'house-6-night', {
    floor: [
      pool(FXc - 0.35, BZ + 1.35, 2.0, FORGE, { peak: 1.0, sx: 1.1, kind: 2 }),
      // (polish: one broad gold pool for the great lantern + the strings + the rack instead of three overlapping ones -
      // where two pools met, the switch of dominant source drew an ellipse outline)
      pool(-0.5, 0.25, 3.1, GOLD, { peak: 0.86, sx: 1.4, sz: 0.85, pow: 1.25 }),
    ],
    back: [pool(FXc - 0.2, 1.1, 1.5, FORGE, { peak: 0.85, sz: 1.3 })],
    tone: flagJoints(ctx), band: 0.3, cell: 2.5,
  });
  const SC = ['#FFE08A', '#FFA040', '#FFF4C8', '#FF8A30'];
  const NSP = 16;
  const sparks = motes(room, ctx, 'house-6-sparks', NSP + 1, (k) => (k === NSP ? TP.lampGlow : SC[k % 4]), 0.04, (k, t) => {
    if (k === NSP) {                                               // the great lantern's core: Euler XYZ of (0, coreL, 0)
      const [rz, rx] = swing(t), L = coreL;
      return [GX - L * Math.sin(rz), H + L * Math.cos(rz) * Math.cos(rx), GZ + L * Math.cos(rz) * Math.sin(rx)];
    }
    const P = 1.1 + hash(k) * 0.7, a = (((t + hash(k + 9) * P) % P) + P) % P, life = P * 0.8;
    if (a > life) return [FXc, -1, BZ + 0.4, 0];
    const vx = (hash(k + 3) - 0.5) * 0.9, vz = 0.15 + hash(k + 5) * 0.55, vy = 1.4 + hash(k + 7) * 1.1;
    return [FXc + vx * a, 0.95 + vy * a - 2.2 * a * a, BZ + 0.45 + vz * a, 1 - (a / life) * 0.6];
  }, { sizeOf: (k) => (k === NSP ? [0.24, 0.3, 0.24] : null), kindOf: (k) => (k === NSP ? 2 : 1) });

  room.spot('forge', FXc - 0.4, -1.0, Math.PI);
  room.spot('workbench', WBX, WBZ + 0.75, Math.PI);
  room.spot('loft', LAX, LAZ0 + 0.35, Math.PI);

  return {
    bed: { x: BXc - 0.7, z: BZc, y: LY + 0.36, facing: Math.PI / 2 },
    visit: { x: LAX - 0.6, z: LAZ0 + 0.3, facing: Math.PI },
    extras: [great, sparks.group, night.group],
    update(t) {
      const k = Math.floor(t * 8) / 8;
      [great.rotation.z, great.rotation.x] = swing(k);
      sparks.update(t);
      night.update();
    },
  };
}
