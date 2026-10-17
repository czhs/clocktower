// house-0 interior: the Stargazer's Tower (owner: interiors builder, houses 0-4; lore pass 2026-10-16). docs/INTERIORS.md,
// docs/LORE.md row 0.
// The astronomer who charted a red comet on the night of the long night. A ROUND room (a 12-sided tower drum, no
// hearth: the tower is cold): pale ashlar footing under deep-indigo plaster painted with gold stars, a slate-blue
// flagstone floor, a tall lancet in the back wall and an arrow-slit on the back-right. Story, front to back:
//   - CHALK ON THE FLOOR: a great chalk circle of the sky with tick marks and a triangle, rows of equations, and a RED
//     chalk comet track that ends in one red-circled point
//   - the brass TELESCOPE aimed out of the slit, the big floor ORRERY that turns (stepped), a star chart high on the
//     back-left wall with one star circled red, a bookcase of atlases under it
//   - a stone stair winding up the right wall to a small door (the roof), the cot by the left wall
//   - the writing desk (front-left): the almanac open on THE CIRCLED DATE, a pocket watch stopped at 11:55, quill, candle
//   - the Lantern-maker's lantern on its chain
// Ambiance: cold blue moonlight through the lancet (a blue key light; at night a moonbeam on the floor) with dust motes
// drifting in it; one warm candle on the desk, the lantern, the orrery's little brass sun. Wonder and unease.
//
// This file also exports the SHAPE KIT shared by houses 0-4 (bareShell, polyWalls, polyFloor, blockOutside, onSeg,
// segPoint, motes, at): rooms that are not the kit's rectangle (round, L-shaped, apsed, chamfered), still cut away by
// camera yaw (every wall segment goes into the kit wall group that matches its inward normal).
import * as THREE from 'three';
import { Builder, M, nightGlow } from '../kit.js';
import { interiorGlowMaterial } from './kit.js';
import { rng } from '../../core/noise.js';

// =================================================================================================== shape kit
const WALLS4 = ['back', 'left', 'right', 'front'];

/** Run fn(b, g) in a frame (room-local x, y, z, turned by ry / rx / rz) on the free-standing builders. */
export function at(room, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0 }, fn) {
  const m = M({ at: [x, y, z], ry, rx, rz });
  room.b.push(m); room.g.push(m);
  try { return fn(room.b, room.g); } finally { room.b.pop(); room.g.pop(); }
}

/** Throw away the kit's rectangular shell geometry (keep its void plane and the window list) so a house can build its
 *  own room shape with polyWalls / polyFloor. Call it first. */
export function bareShell(room) {
  room.shell({ windows: [], beams: false, dado: 0 });
  for (const n of WALLS4) {
    const w = room.walls[n];
    w.full = new Builder(room.engine, { name: `${room.id}-wall-${n}` });
    w.low = new Builder(room.engine, { name: `${room.id}-wall-${n}-low` });
    w.glow = new Builder(room.engine, { name: `${room.id}-wall-${n}-glow` });
    w.openings = [];
  }
  room.b = new Builder(room.engine, { name: `${room.id}-int` });
}

/** Point in polygon ([[x, z], ...]). */
export function inPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** A wall segment a -> b (room-local [x, z]) with its frame: local x along the wall (left -> right seen from inside),
 *  +z = the inward normal n, `wall` = the kit wall group it hides with (front when it faces away from the yaw-0 camera). */
export function makeSeg(a, b, poly) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let n = [-dz / len, dx / len];
  if (!inPoly(poly, mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05)) n = [-n[0], -n[1]];
  const ry = Math.atan2(n[0], n[1]);
  const xa = [Math.cos(ry), -Math.sin(ry)];
  const wall = n[1] < -0.25 ? 'front' : Math.abs(n[0]) > Math.abs(n[1]) ? (n[0] > 0 ? 'left' : 'right') : 'back';
  const ua = (a[0] - mid[0]) * xa[0] + (a[1] - mid[1]) * xa[1];
  return { a, b, mid, len, n, ry, xa, wall, ua };
}
/** Room-local point of (u along the segment, y, out = distance into the room). */
export function segPoint(s, u, y, out = 0) {
  return [s.mid[0] + u * s.xa[0] + out * s.n[0], y, s.mid[1] + u * s.xa[1] + out * s.n[1]];
}
/** Run fn(full, glow) on the segment's wall builders at (u, y): local +z = into the room. Hides with the wall. */
export function onSeg(room, s, u, y, fn) {
  const W = room.walls[s.wall];
  const m = M({ at: [s.mid[0], 0, s.mid[1]], ry: s.ry }).multiply(M({ at: [u, y, 0] }));
  W.full.push(m); W.glow.push(m);
  try { return fn(W.full, W.glow); } finally { W.full.pop(); W.glow.pop(); }
}

function band(b, { x0, x1, y0, y1, openings, tones, pattern, scale = 1, thick }) {
  const xs = [...new Set([x0, x1, ...openings.flatMap((q) => [q.x - q.w / 2, q.x + q.w / 2]).filter((x) => x > x0 && x < x1)])].sort((p, q) => p - q);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], c = xs[i + 1], mx = (a + c) / 2, w = c - a;
    if (w < 1e-4) continue;
    const holes = openings.filter((q) => mx > q.x - q.w / 2 && mx < q.x + q.w / 2).map((q) => [Math.max(y0, q.y), Math.min(y1, q.y + q.h)]).filter(([p, q]) => q > p).sort((p, q) => p[0] - q[0]);
    let y = y0;
    for (const [h0, h1] of holes) { if (h0 - y > 1e-4) b.box(w, h0 - y, thick, { tones, pattern, scale, at: [mx, y, -thick / 2] }); y = Math.max(y, h1); }
    if (y1 - y > 1e-4) b.box(w, y1 - y, thick, { tones, pattern, scale, at: [mx, y, -thick / 2] });
  }
}
function rail(b, { x0, x1, y, openings, h, d, tones, base = false }) {
  const cuts = openings.filter((q) => q.y <= y + h && q.y + q.h >= y).map((q) => [q.x - q.w / 2, q.x + q.w / 2]).sort((p, q) => p[0] - q[0]);
  let a = x0;
  const seg = (p, q) => { if (q - p > 0.02) b.box(q - p, h, d, { at: [(p + q) / 2, base ? y : y - h / 2, d / 2], tones, pattern: 'none' }); };
  for (const [c0, c1] of cuts) { seg(a, Math.min(c0, x1)); a = Math.max(a, c1); }
  seg(a, x1);
}
/** Interior side of a window: glowing pane (kind 3 = the light outside x glowColor), frame, mullions, sill, optional
 *  curtains, arch true (flat-topped hood) | 'pointed' (a glass lancet head) | 'round' (a glass half-disc head). */
export function segWindow(full, glow, { x = 0, y, w, h, T, panes = [2, 3], curtains = null, arch = false, frame = 'timber', glowColor = '#FFFFFF', sill = 'plank' }) {
  const gz = -T * 0.55;
  glow.box(w, h, 0.02, { at: [x, y, gz], tones: 'glass', layer: 'glass', glow: glowColor, glowKind: 3 });
  const fr = { tones: frame, pattern: 'none' }, bar = 0.06;
  full.box(w + 2 * bar, bar, 0.08, { ...fr, at: [x, y + h, gz] });
  full.box(w + 2 * bar, bar, 0.08, { ...fr, at: [x, y - bar, gz] });
  full.box(bar, h, 0.08, { ...fr, at: [x - w / 2 - bar / 2, y, gz] });
  full.box(bar, h, 0.08, { ...fr, at: [x + w / 2 + bar / 2, y, gz] });
  for (let i = 1; i < panes[0]; i++) full.box(0.04, h, 0.05, { ...fr, at: [x - w / 2 + (w * i) / panes[0], y, gz + 0.02] });
  for (let j = 1; j < panes[1]; j++) full.box(w, 0.04, 0.05, { ...fr, at: [x, y + (h * j) / panes[1] - 0.02, gz + 0.02] });
  full.box(w + 0.16, 0.07, -gz + 0.14, { tones: sill, pattern: 'none', at: [x, y - 0.07, (gz + 0.14) / 2] });
  if (arch === 'pointed' || arch === 'round') {
    const top = y + h + bar, ah = arch === 'pointed' ? w * 0.8 : w / 2;
    const pts = arch === 'pointed' ? [[-w / 2, 0], [w / 2, 0], [w * 0.3, ah * 0.55], [0, ah], [-w * 0.3, ah * 0.55]]
      : Array.from({ length: 9 }, (_, k) => { const a = (k / 8) * Math.PI; return [Math.cos(a) * w / 2, Math.sin(a) * ah]; });
    glow.prism(pts, 0.02, { at: [x, top, 0.012], tones: 'glass', layer: 'glass', glow: glowColor, glowKind: 3 });
    // frame round the head: short bars along the outline + the centre mullion
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      if (k === 0 && arch === 'pointed') continue;
      const L = Math.hypot(bx - ax, by - ay) + 0.05;
      full.box(L, bar, 0.06, { ...fr, at: [x + (ax + bx) / 2 * 1.06, top + (ay + by) / 2 * 1.04 + 0.01, 0.03], rz: Math.atan2(by - ay, bx - ax), origin: 'center' });
    }
    if (arch === 'pointed') {
      const [ax, ay] = pts[pts.length - 1], [bx, by] = pts[0];
      full.box(Math.hypot(bx - ax, by - ay) + 0.05, bar, 0.06, { ...fr, at: [x + (ax + bx) / 2 * 1.06, top + (ay + by) / 2 * 1.04 + 0.01, 0.03], rz: Math.atan2(by - ay, bx - ax), origin: 'center' });
    }
    full.box(0.04, ah, 0.04, { ...fr, at: [x, top, 0.03] });
  } else if (arch) {
    full.prism([[-w / 2 - 0.06, 0], [w / 2 + 0.06, 0], [w / 4, w * 0.3], [-w / 4, w * 0.3]], 0.1, { ...fr, at: [x, y + h + 0.04, 0.0] });
  }
  if (curtains) {
    const cw = 0.24;
    full.box(w + 0.75, 0.04, 0.04, { tones: 'iron', pattern: 'none', at: [x, y + h + 0.16, 0.12] });
    for (const s of [-1, 1]) {
      full.box(cw, h + 0.28, 0.06, { tones: curtains, pattern: 'vboards', scale: 0.35, at: [x + s * (w / 2 + cw / 2 + 0.04), y - 0.14, 0.1], layer: 'soft' });
      full.box(cw + 0.04, 0.06, 0.09, { tones: curtains, tint: 0.92, at: [x + s * (w / 2 + cw / 2 + 0.04), y + 0.4, 0.1], layer: 'soft' });
    }
  }
}

/**
 * Walls along a closed polygon (room-local [x, z] inner faces, any winding; an entry may be [x, z, edgeOpts] for the
 * edge that starts there: {windows: [{u, y, w, h, ...segWindow opts}], ext: [a, b] corner extensions (default T, use 0
 * at a re-entrant corner), skip}). The edge through (0, D/2) gets the doorway. Every edge gets a full and a low (cut)
 * variant in the kit wall group that matches its inward normal, a skirting, a cap beam and an optional chair rail.
 *   o: {H, T, dado 0, upper {tones, pattern, scale}, lower {...}, railTones, capTones, posts (spacing m | 0),
 *       postTones, low 0.42, windowGlow}
 * Returns the segments (for onSeg / segPoint).
 */
export function polyWalls(room, pts, o = {}) {
  const H = o.H ?? room.H, T = o.T ?? room.T, low = o.low ?? 0.42, dado = o.dado ?? 0;
  const upper = o.upper, lower = o.lower ?? o.upper;
  const poly = pts.map((p) => [p[0], p[1]]);
  const segs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], eo = pts[i][2] ?? {};
    const s = makeSeg(a, b, poly);
    s.i = i; s.opts = eo;
    segs.push(s);
    if (eo.skip) continue;
    const [eA, eB] = eo.ext ?? [T, T];
    const x0 = -s.len / 2 - (s.ua < 0 ? eA : eB), x1 = s.len / 2 + (s.ua < 0 ? eB : eA);
    // the doorway: the front edge through (0, D/2)
    const isDoor = Math.abs(s.mid[1] - room.D / 2) < 0.02 && Math.abs(s.n[0]) < 0.01 && Math.min(a[0], b[0]) < -room.doorW / 2 && Math.max(a[0], b[0]) > room.doorW / 2;
    const du = isDoor ? (0 - s.mid[0]) * s.xa[0] + (room.D / 2 - s.mid[1]) * s.xa[1] : 0;
    const wins = (eo.windows ?? []).map((w) => ({ u: 0, y: 1.0, w: 0.8, h: 1.0, ...w }));
    const openings = wins.map((w) => ({ x: w.u, y: w.y, w: w.w + 0.02, h: w.h }));
    if (isDoor) openings.push({ x: du, y: -0.2, w: room.doorW, h: H + 1 });
    s.door = isDoor ? du : null;
    const W = room.walls[s.wall];
    const m = M({ at: [s.mid[0], 0, s.mid[1]], ry: s.ry });
    W.full.push(m); W.low.push(m); W.glow.push(m);
    try {
      const full = W.full, lo = W.low;
      if (dado > 0) {
        band(full, { x0, x1, y0: 0, y1: dado, openings, ...lower, thick: T });
        band(full, { x0, x1, y0: dado, y1: H, openings, ...upper, thick: T });
        if (o.railTones !== null) rail(full, { x0: -s.len / 2, x1: s.len / 2, y: dado, openings, h: 0.07, d: 0.06, tones: o.railTones ?? 'timber' });
      } else band(full, { x0, x1, y0: 0, y1: H, openings, ...upper, thick: T });
      rail(full, { x0: -s.len / 2, x1: s.len / 2, y: 0, openings, h: 0.12, d: 0.04, tones: o.skirtTones ?? 'timber', base: true });
      full.box(x1 - x0 + 0.04, 0.12, T + 0.06, { at: [(x0 + x1) / 2, H, -T / 2], tones: o.capTones ?? 'timber', pattern: 'none' });
      if (o.posts) {
        const n = Math.max(1, Math.round(s.len / o.posts));
        for (let k = 0; k <= n; k++) {
          const px = -s.len / 2 + 0.07 + (k * (s.len - 0.14)) / n;
          if (openings.some((q) => Math.abs(px - q.x) < q.w / 2 + 0.1)) continue;
          full.box(0.14, H - dado, 0.05, { at: [px, dado, 0.0], tones: o.postTones ?? 'timber', pattern: 'none', rz: o.postLean ? o.postLean(s.i, k) : 0 });
        }
      }
      const lowOpen = openings.filter((q) => q.y < low);
      const lt = dado > 0 && low <= dado ? lower : upper;
      band(lo, { x0, x1, y0: 0, y1: low, openings: lowOpen, ...lt, thick: T });
      rail(lo, { x0: -s.len / 2, x1: s.len / 2, y: 0, openings: lowOpen, h: 0.12, d: 0.04, tones: o.skirtTones ?? 'timber', base: true });
      const cuts = lowOpen.map((q) => [q.x - q.w / 2, q.x + q.w / 2]).sort((p, q) => p[0] - q[0]);
      let ca = x0;
      const cap = (p, q) => { if (q - p > 0.02) lo.box(q - p, 0.07, T + 0.04, { at: [(p + q) / 2, low, -T / 2], tones: 'timber', pattern: 'none', tint: 0.92 }); };
      for (const [c0, c1] of cuts) { cap(ca, Math.min(c0, x1)); ca = Math.max(ca, c1); }
      cap(ca, x1);
      for (const w of wins) segWindow(full, W.glow, { ...w, x: w.u, T, glowColor: w.glowColor ?? o.windowGlow ?? '#FFFFFF' });
      if (isDoor) {
        const dw = room.doorW;
        for (const sx of [-1, 1]) {
          full.box(0.14, Math.min(H, 2.3) - 0.02, T + 0.08, { at: [du + sx * (dw / 2 + 0.07), 0, -T / 2], tones: o.jambTones ?? 'timber', pattern: 'none' });
          lo.box(0.14, low + 0.08, T + 0.08, { at: [du + sx * (dw / 2 + 0.07), 0, -T / 2], tones: o.jambTones ?? 'timber', pattern: 'none' });
        }
        full.box(dw + 0.28, 0.16, T + 0.08, { at: [du, 2.05, -T / 2], tones: o.jambTones ?? 'timber', pattern: 'none' });
        if (H > 2.22) full.box(dw, H - 2.21, T, { at: [du, 2.21, -T / 2], ...upper });
      }
    } finally { W.full.pop(); W.low.pop(); W.glow.pop(); }
  }
  // threshold stone in the doorway
  room.b.box(room.doorW + 0.1, 0.03, T + 0.1, { at: [0, 0, room.D / 2 + T / 2], tones: 'ashlar', pattern: 'none' });
  return segs;
}

/** Floor slab over a polygon (+ the rubble foundation lip under it: `lip` = a polygon, or a scale about the origin;
 *  `lipH` its depth, `lipTones` its stone). */
export function polyFloor(room, pts, { tones = 'plank', pattern = 'planks', scale = 1, tint = 1, lip = null, lipH = 0.5, lipTones = 'stone' } = {}) {
  const P = (q) => q.map(([x, z]) => [x, -z]);
  room.b.prism(P(pts), 0.12, { at: [0, -0.06, 0], rx: -Math.PI / 2, tones, pattern, scale, tint });
  const lp = Array.isArray(lip) ? lip : pts.map(([x, z]) => [x * (lip ?? 1.12), z * (lip ?? 1.12)]);
  room.b.prism(P(lp), lipH, { at: [0, -0.12 - lipH / 2, 0], rx: -Math.PI / 2, tones: lipTones, pattern: 'rubble' });
}

/** Block every floor cell of the room rectangle that lies outside `inside(x, z)` (collision; kind 'void'). The doorway
 *  corridor stays open. */
export function blockOutside(room, inside, step = 0.2) {
  const W = room.W, D = room.D;
  const nz = Math.ceil(D / step), nx = Math.ceil(W / step);
  for (let j = 0; j < nz; j++) {
    const z0 = -D / 2 + j * step, z1 = Math.min(D / 2, z0 + step), cz = (z0 + z1) / 2;
    let run = null;
    for (let i = 0; i <= nx; i++) {
      const x0 = -W / 2 + i * step, cx = x0 + step / 2;
      const door = Math.abs(cx) < room.doorW / 2 + 0.1 && cz > D / 2 - 0.9;
      const out = i < nx && !door && !inside(cx, cz);
      if (out && run === null) run = x0;
      if (!out && run !== null) { room.solid(run, z0, Math.min(W / 2, x0), z1, 'void'); run = null; }
    }
  }
}

/**
 * Cheap animated specks / puffs in ONE mesh (vertices rewritten at `fps`, a pure function of t): dust motes, pollen,
 * lint, smoke curls, steam. {n, seed, box {x0, x1, y0, y1, z0, z1}, sources [[x, z], ...] (rise from these points),
 * size, glow colour (interior glow material, glowKind 1) | glow false + tones / layer (toon-lit), mode 'drift' | 'rise'
 * | 'fall' | 'steam', speed (m/s), sway (m), grow}. Returns {group, update(t), mesh}.
 */
export function motes(room, o = {}) {
  const { n = 20, seed = 1, box, sources = null, size = 0.045, glow = '#FFFFFF', tones = 'cream', layer = 'soft', mode = 'drift', speed = 0.12, sway = 0.12, grow = 1.5, fps = 8, name = 'motes', jitter = 0.08 } = o;
  const r = rng(seed);
  const b = new Builder(room.engine, { name: `${room.id}-${name}` });
  const L = glow ? 'glass' : layer;
  const items = [];
  for (let k = 0; k < n; k++) {
    const src = sources ? sources[k % sources.length] : null;
    const y0 = src && src[2] != null ? src[2] + box.y0 : box.y0;
    const p = src ? [src[0] + (r() - 0.5) * jitter, y0, src[1] + (r() - 0.5) * jitter]
      : [box.x0 + r() * (box.x1 - box.x0), box.y0 + r() * (box.y1 - box.y0), box.z0 + r() * (box.z1 - box.z0)];
    const v0 = (b.layers[L]?.pos.length ?? 0) / 3;
    const s = size * (0.75 + r() * 0.5);
    b.box(s, s, s, { origin: 'center', ry: r() * 1.5, ...(glow ? { tones: 'glass', layer: 'glass', glow, glowKind: 1 } : { tones, layer, tint: [1, 0.96, 1.04][k % 3] }) });
    items.push({ p, y0, ph: r(), v0, v1: b.layers[L].pos.length / 3, sx: r() - 0.5, sz: r() - 0.5 });
  }
  const grp = b.build({ name: `${room.id}-${name}`, castShadow: false });
  let mesh = null;
  grp.traverse((q) => { if (q.isMesh) { mesh = q; q.castShadow = false; q.frustumCulled = false; if (glow) q.material = interiorGlowMaterial(room.engine); } });
  const pos = mesh.geometry.getAttribute('position');
  const base = Float32Array.from(pos.array);
  const Hy = box.y1 - box.y0;
  let last = null;
  const update = (t) => {
    const k = Math.floor(t * fps);
    if (k === last) return;
    last = k;
    const ts = k / fps;
    for (const it of items) {
      let [x, y, z] = it.p, s = 1;
      if (mode === 'drift') {
        x += Math.sin(ts * speed * 3 + it.ph * 40) * sway * (0.6 + it.sx);
        y += Math.sin(ts * speed * 2.1 + it.ph * 23) * sway * 0.8;
        z += Math.cos(ts * speed * 2.6 + it.ph * 31) * sway * (0.6 + it.sz);
      } else {
        let f = (it.ph + (ts * speed) / Hy) % 1;
        if (mode === 'fall') f = 1 - f;
        y = it.y0 + f * Hy;
        const wig = mode === 'steam' ? 0.3 + f : 1;
        x += Math.sin(ts * 1.7 + it.ph * 20 + f * 5) * sway * wig;
        z += Math.cos(ts * 1.3 + it.ph * 17 + f * 4) * sway * 0.6 * wig;
        if (mode === 'steam' || mode === 'rise') s = (mode === 'steam' ? 0.45 + f * grow : 1 - f * 0.5) * (f > 0.82 ? Math.max(0, (1 - f) / 0.18) : 1) * (f < 0.06 ? f / 0.06 : 1);
      }
      for (let v = it.v0; v < it.v1; v++) {
        pos.array[v * 3] = x + base[v * 3] * s;
        pos.array[v * 3 + 1] = y + base[v * 3 + 1] * s;
        pos.array[v * 3 + 2] = z + base[v * 3 + 2] * s;
      }
    }
    pos.needsUpdate = true;
  };
  update(0);
  return { group: grp, update, mesh };
}

/** Shadow-only ceiling (keeps the town sun out of a dark room): a plane high up the sun ray (off screen) that casts the
 *  room into shadow, with holes where `open(x, z)` (room-local floor point) lets sun through. Add `.group` to extras and
 *  call `.update()` every frame (it follows the sun; hidden at night). Same recipe as houses 10 / 12 / 13. */
export function sunMask(room, { open = () => false, cell = 0.2, margin = 6, name = `${room.id}-sunmask` } = {}) {
  const b = new Builder(room.engine, { name });
  const x0 = -room.W / 2 - margin, z0 = -room.D / 2 - margin;
  const nx = Math.ceil((room.W + 2 * margin) / cell), nz = Math.ceil((room.D + 2 * margin) / cell);
  const rowRuns = (j) => {
    const runs = []; let s = -1;
    for (let i = 0; i <= nx; i++) {
      const closed = i < nx && !open(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell);
      if (closed && s < 0) s = i; else if (!closed && s >= 0) { runs.push([s, i]); s = -1; }
    }
    return runs;
  };
  let start = 0, prev = rowRuns(0), key = JSON.stringify(prev);
  const flush = (j0, j1, runs) => {
    for (const [i0, i1] of runs) b.box((i1 - i0) * cell, 0.04, (j1 - j0) * cell, { at: [x0 + ((i0 + i1) / 2) * cell, 0, z0 + ((j0 + j1) / 2) * cell], tones: 'timber' });
  };
  for (let j = 1; j <= nz; j++) {
    const runs = j < nz ? rowRuns(j) : null, k = runs ? JSON.stringify(runs) : null;
    if (k !== key) { flush(start, j, prev); start = j; prev = runs; key = k; }
  }
  const holder = new THREE.Group(); holder.name = name;
  holder.add(b.build({ name, castShadow: true, receiveShadow: false }));
  const sun = room.engine.uniforms?.uSunDir?.value;
  const update = () => {
    if (!sun || sun.y < 0.08) { holder.visible = false; return; }
    holder.visible = true;
    const h = Math.min(20, 30 * sun.y);
    holder.position.set((sun.x * h) / sun.y, h, (sun.z * h) / sun.y);
  };
  update();
  return { group: holder, update };
}

/** Glow-only builder -> group with the interior glow material. */
export function glowGroup(room, b, name) {
  const grp = b.build({ name, castShadow: false });
  grp.traverse((q) => { if (q.isMesh) { q.material = interiorGlowMaterial(room.engine); q.castShadow = false; } });
  return grp;
}
/** Is it night in the town (the kit's global window glow, 0 day .. 1 night)? */
export const isNight = (room) => nightGlow(room.engine) > 0.5;

/** A ring of short boxes lying on the floor (chalk circles, inlays). */
export function floorRing(b, { x, z, r, n = 32, w = 0.035, tones = 'cream', y = 0.002, h = 0.008, dash = 1, from = 0, to = Math.PI * 2 }) {
  for (let k = 0; k < n; k++) {
    if (dash > 1 && k % dash) continue;
    const a0 = from + ((to - from) * k) / n, a1 = from + ((to - from) * (k + 1)) / n, a = (a0 + a1) / 2;
    const L = r * (a1 - a0) + 0.01;
    b.box(L, h, w, { at: [x + Math.cos(a) * r, y, z + Math.sin(a) * r], ry: -a - Math.PI / 2, tones, pattern: 'none' });
  }
}
/** A straight line of chalk on the floor from p to q. */
export function floorLine(b, p, q, { w = 0.035, tones = 'cream', y = 0.002, h = 0.008 } = {}) {
  const dx = q[0] - p[0], dz = q[1] - p[1];
  b.box(Math.hypot(dx, dz), h, w, { at: [(p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2], ry: -Math.atan2(dz, dx), tones, pattern: 'none' });
}

// =================================================================================================== the tower
/** Room size / walls (index.js reads ROOM before build): a tall round tower drum fitted in a 6.6 m square. */
export const ROOM = { w: 6.6, d: 6.6, h: 3.8, wall: 'stone', pal: 0, doorW: 1.0 };

export default function build(room, ctx) {
  const { FURNITURE: F, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp } = ctx;
  const H = room.H, A = room.D / 2;                         // apothem of the 12-gon = half the room
  const R = A / Math.cos(Math.PI / 12);
  const INDIGO = paintRamp('#2c3466', { lightness: 0.3 });
  const NIGHTBLUE = paintRamp('#1e2a52', { lightness: 0.26 });
  const RED = paintRamp(TP.flowerRed, { lightness: 0.5 });
  const MOON = '#C8D6FF';
  bareShell(room);

  // ---- the 12-sided drum: vertices at 15 + 30k deg (flat edges face front / back / left / right)
  const V = Array.from({ length: 12 }, (_, k) => { const a = ((15 + 30 * k) * Math.PI) / 180; return [R * Math.cos(a), R * Math.sin(a)]; });
  const edge = {};
  edge[8] = { windows: [{ u: 0, y: 0.95, w: 0.86, h: 1.85, panes: [2, 5], arch: 'pointed', frame: 'iron', sill: 'ashlar' }] };   // the lancet (back)
  edge[9] = { windows: [{ u: 0.1, y: 1.3, w: 0.3, h: 1.25, panes: [1, 3], arch: 'pointed', frame: 'iron', sill: 'ashlar' }] };   // arrow-slit (back-right)
  const pts = V.map((v, k) => (edge[k] ? [v[0], v[1], edge[k]] : v));
  const segs = polyWalls(room, pts, {
    dado: 1.1, upper: { tones: INDIGO, pattern: 'plaster' }, lower: { tones: 'ashlar', pattern: 'ashlar', scale: 0.8 },
    railTones: 'brass', capTones: 'stone', jambTones: 'ashlar', windowGlow: MOON,
  });
  polyFloor(room, V, { tones: 'slate', pattern: 'ashlar', scale: 1.6, lip: 1.11 });
  blockOutside(room, (x, z) => inPoly(V, x, z));
  const S = (k) => segs[k];

  // ---- painted sky on the upper walls: gold stars + a constellation in brass lines (back half only: the front is cut).
  // Only the back wall's stars glow; the side walls' are gilt paint, so those walls need no glow mesh (16 draw calls)
  const sr = rng(4242);
  for (const k of [4, 5, 6, 7, 8, 9, 10, 11, 0]) {
    onSeg(room, S(k), 0, 0, (full, glow) => {
      for (let i = 0; i < 7; i++) {
        const u = (sr() - 0.5) * (S(k).len - 0.3), y = 1.45 + sr() * (H - 1.75);
        if (k === 8 && Math.abs(u) < 0.62 && y < 3.6) continue;          // not over the lancet
        if (k === 9 && Math.abs(u - 0.1) < 0.35 && y < 3.4) continue;
        const big = sr() < 0.25, s = big ? 0.05 : 0.035;
        if (S(k).wall === 'back') glow.box(s, s, 0.01, { at: [u, y, 0.005], tones: 'glass', layer: 'glass', glow: big ? TP.glow[0] : '#D8DCF0', glowKind: 1 });
        else full.box(s, s, 0.01, { at: [u, y, 0.005], tones: big ? TP.bannerGold : 'cream', pattern: 'none' });   // gilt paint (no glow mesh)
        if (big) { full.box(0.13, 0.018, 0.01, { at: [u, y + s / 2 - 0.009, 0.004], tones: 'brass', pattern: 'none' }); full.box(0.018, 0.13, 0.01, { at: [u, y + s / 2 - 0.065, 0.004], tones: 'brass', pattern: 'none' }); }
      }
    });
  }
  // a brass constellation (the Plough-ish) over the lancet
  onSeg(room, S(8), 0, 0, (full, glow) => {
    const st = [[-0.85, 3.15], [-0.5, 3.4], [-0.1, 3.3], [0.3, 3.45], [0.55, 3.2], [0.95, 3.32]];
    st.forEach(([u, y], i) => {
      glow.box(0.05, 0.05, 0.01, { at: [u, y, 0.006], tones: 'glass', layer: 'glass', glow: TP.glow[0], glowKind: 1 });
      if (i) { const [pu, py] = st[i - 1]; full.box(Math.hypot(u - pu, y - py), 0.012, 0.008, { at: [(u + pu) / 2, (y + py) / 2 + 0.02, 0.004], rz: Math.atan2(y - py, u - pu), tones: 'brass', pattern: 'none', origin: 'center' }); }
    });
  });

  // ---- the big star chart high on the back-left wall: one star circled in red, a red comet streak
  onSeg(room, S(7), 0, 2.45, (full, glow) => {
    full.box(1.22, 0.92, 0.04, { at: [0, -0.04, 0.02], tones: 'brass', pattern: 'none' });
    full.box(1.12, 0.82, 0.02, { at: [0, 0.01, 0.045], tones: NIGHTBLUE });
    const cr = rng(77);
    for (let i = 0; i < 16; i++) glow.box(0.03, 0.03, 0.01, { at: [(cr() - 0.5) * 1.0, 0.06 + cr() * 0.7, 0.06], tones: 'glass', layer: 'glass', glow: TP.glow[0], glowKind: 1 });
    // the comet: a red head and a tail streak, and the red circle round one star
    glow.box(0.05, 0.05, 0.01, { at: [0.28, 0.5, 0.062], tones: 'glass', layer: 'glass', glow: TP.flowerRed, glowKind: 1 });
    full.box(0.42, 0.025, 0.01, { at: [0.08, 0.6, 0.058], rz: -0.42, tones: RED, pattern: 'none', origin: 'center' });
    for (let q = 0; q < 10; q++) { const a = (q / 10) * Math.PI * 2; full.box(0.05, 0.016, 0.01, { at: [-0.3 + Math.cos(a) * 0.09, 0.32 + Math.sin(a) * 0.09, 0.06], rz: a + Math.PI / 2, tones: RED, pattern: 'none', origin: 'center' }); }
    glow.box(0.03, 0.03, 0.01, { at: [-0.3, 0.305, 0.062], tones: 'glass', layer: 'glass', glow: TP.glow[0], glowKind: 1 });
  });
  // a smaller chart (the moon's phases: cream discs) on the left wall
  onSeg(room, S(6), 0, 1.75, (full) => {
    full.box(0.86, 0.38, 0.04, { at: [0, -0.04, 0.02], tones: 'timber', pattern: 'none' });
    full.box(0.78, 0.3, 0.02, { at: [0, 0, 0.045], tones: NIGHTBLUE });
    for (let i = 0; i < 5; i++) {
      const w = [0.04, 0.08, 0.12, 0.08, 0.04][i];
      full.box(w, 0.12, 0.01, { at: [-0.3 + i * 0.15 + (i < 2 ? 0.03 : i > 2 ? -0.03 : 0), 0.09, 0.06], tones: 'cream', pattern: 'none' });
    }
  });

  // ---- the bookcase of atlases under the chart, turned to the back-left wall
  {
    const s = S(7), p = segPoint(s, 0, 0, 0.24);
    F.bookshelf(room, { x: p[0], z: p[2], ry: s.ry, w: 1.1, h: 2.05, ornaments: ['globe', 'candle'] });
  }

  // ---- the telescope (brass, on its tripod) in the moonbeam, aimed up through the lancet; the observer's stool
  const tsx = 0.72, tsz = -1.45;
  {
    const s = S(8), q = segPoint(s, 0, 2.15, 0);           // the lancet's upper panes
    const dx = q[0] - tsx, dz = q[2] - tsz, l = Math.hypot(dx, dz);
    F.telescope(room, { x: tsx, z: tsz, ry: Math.atan2(-dx / l, -dz / l), pitch: Math.atan2(q[1] - 1.21, l), len: 1.55 });
  }
  F.stool(room, { x: 1.25, z: -0.75 });

  // ---- the stone stair winding up the right wall to the roof door
  const steps = 9;
  for (let k = 0; k < steps; k++) {
    const phi = ((38 - k * 9.5) * Math.PI) / 180, rr = A - 0.5, h = 0.26 * (k + 1);
    const x = Math.cos(phi) * rr, z = Math.sin(phi) * rr, ry = Math.atan2(Math.cos(phi), Math.sin(phi));
    room.b.box(0.6, h, 1.0, { at: [x, 0, z], ry, tones: 'stone', pattern: 'ashlar', scale: 0.8, tint: k % 2 ? 0.97 : 1.02 });
    room.b.box(0.62, 0.05, 1.02, { at: [x, h, z], ry, tones: 'ashlar', pattern: 'none' });
    room.solidAt(x, z, 0.62, 0.95, ry, 'stair');
  }
  // the little roof door at the top of the stair (edge 10), iron studs
  onSeg(room, S(10), 0.15, 2.37, (full) => {
    full.box(0.72, 1.25, 0.05, { at: [0, 0, 0.025], tones: 'timber', pattern: 'vboards', scale: 0.6 });
    full.prism([[-0.36, 0], [0.36, 0], [0.2, 0.18], [0, 0.24], [-0.2, 0.18]], 0.05, { at: [0, 1.25, 0.025], tones: 'timber' });
    for (const y of [0.25, 0.95]) full.box(0.66, 0.05, 0.03, { at: [0, y, 0.06], tones: 'iron' });
    full.box(0.06, 0.06, 0.04, { at: [0.24, 0.6, 0.07], tones: 'brass' });
  });

  // ---- the floor orrery (back-left): brass pedestal, a glowing sun, arms with planets turning in 8 fps steps
  const ox = -0.85, oz = -1.85;
  at(room, { x: ox, z: oz }, (b, g) => {
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; b.box(0.08, 0.05, 0.42, { at: [Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], ry: -a + Math.PI / 2, tones: 'timber' }); }
    b.cylinder(0.07, 0.05, 0.92, { at: [0, 0.04, 0], tones: 'brass', segments: 8 });
    b.cylinder(0.16, 0.12, 0.05, { at: [0, 0.9, 0], tones: 'brass', segments: 8 });
    g.box(0.17, 0.17, 0.17, { at: [0, 1.18, 0], tones: 'glass', layer: 'glass', glow: TP.glow[1], glowKind: 2, origin: 'center' });
    g.box(0.11, 0.11, 0.11, { at: [0, 1.18, 0], ry: Math.PI / 4, rx: Math.PI / 4, tones: 'glass', layer: 'glass', glow: TP.glow[0], glowKind: 2, origin: 'center' });
  });
  room.solidAt(ox, oz, 0.6, 0.6, 0, 'orrery');
  room.light({ pos: [ox, 1.3, oz], color: TP.glow[1], r: 1.8, kind: 'lantern', intensity: 0.8 });
  const orb = new Builder(room.engine, { name: 'house-0-orrery' });
  orb.cylinder(0.022, 0.022, 0.34, { at: [0, 0.92, 0], tones: 'brass', segments: 8 });
  const planets = [[0.36, 0.98, 0.0, CLOTH.blue, 0.1], [0.62, 1.04, 2.3, RED, 0.09], [0.92, 1.1, 4.2, 'cream', 0.13]];
  for (const [rr, y, a, tones, ps] of planets) {
    orb.box(rr, 0.02, 0.02, { at: [Math.cos(a) * rr / 2, y, -Math.sin(a) * rr / 2], ry: a, tones: 'brass', pattern: 'none', origin: 'center' });
    orb.box(0.02, 0.1, 0.02, { at: [Math.cos(a) * rr, y, -Math.sin(a) * rr], tones: 'brass', pattern: 'none' });
    orb.box(ps, ps, ps, { at: [Math.cos(a) * rr, y + 0.1 + ps / 2, -Math.sin(a) * rr], tones, origin: 'center', ry: 0.4 });
  }
  // the ringed one
  orb.box(0.28, 0.014, 0.28, { at: [Math.cos(4.2) * 0.92, 1.265, -Math.sin(4.2) * 0.92], ry: 0.4, rx: 0.3, tones: 'brass', origin: 'center' });
  floorRing(orb, { x: 0, z: 0, r: 0.3, n: 16, y: 1.16, h: 0.025, w: 0.025, tones: 'brass' });
  const orbG = orb.build({ name: 'house-0-orrery', castShadow: true });
  const orbPivot = new THREE.Group();
  orbPivot.position.set(ox, 0, oz);
  orbPivot.add(orbG);

  // ---- the cot along the left wall (head to the back), a night-blue blanket with stars
  const bx = -A + 0.62, bz = 0.05;
  const bed = F.bed(room, { x: bx, z: bz, quilt: NIGHTBLUE, frame: 'timber' });
  for (const [qx, qz] of [[-0.25, -0.05], [0.2, 0.25], [-0.1, 0.55], [0.28, -0.3], [-0.3, 0.8], [0.12, 0.7]]) {
    room.b.box(0.06, 0.02, 0.06, { at: [bx + qx, 0.54, bz + qz], tones: TP.bannerGold, layer: 'soft', ry: Math.PI / 4 });
  }

  // ---- CHALK ON THE FLOOR: the sky circle, ticks, a triangle, equations; the red comet track + one red ring
  const cx = 0.25, cz = 0.2, cr2 = 1.3;
  floorRing(room.b, { x: cx, z: cz, r: cr2, n: 40 });
  floorRing(room.b, { x: cx, z: cz, r: 0.42, n: 18 });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    floorLine(room.b, [cx + Math.cos(a) * (cr2 - 0.12), cz + Math.sin(a) * (cr2 - 0.12)], [cx + Math.cos(a) * (cr2 + 0.1), cz + Math.sin(a) * (cr2 + 0.1)], { w: 0.03 });
  }
  const tri = [0.4, 2.5, 4.6].map((a) => [cx + Math.cos(a) * cr2, cz + Math.sin(a) * cr2]);
  for (let k = 0; k < 3; k++) floorLine(room.b, tri[k], tri[(k + 1) % 3], { w: 0.028 });
  // equations: rows of strokes outside the circle (front-left of it), and a column on the right
  const er = rng(909);
  for (let row = 0; row < 3; row++) {
    let x = -0.95 + row * 0.1;
    while (x < 0.3 - row * 0.2) {
      const w = 0.06 + er() * 0.16;
      floorLine(room.b, [x, 1.72 + row * 0.2], [x + w, 1.72 + row * 0.2 + (er() - 0.5) * 0.02], { w: 0.028 });
      if (er() < 0.3) floorLine(room.b, [x + w / 2, 1.65 + row * 0.2], [x + w / 2, 1.79 + row * 0.2], { w: 0.026 });
      x += w + 0.06 + er() * 0.05;
    }
  }
  for (let row = 0; row < 3; row++) floorLine(room.b, [1.75, 1.15 + row * 0.2], [1.75 + 0.35 + er() * 0.25, 1.15 + row * 0.2], { w: 0.028 });
  // the comet: a dashed red arc sweeping in across the circle, ending in a red-circled point
  floorRing(room.b, { x: cx - 2.4, z: cz - 1.6, r: 2.9, n: 22, from: 0.15, to: 0.95, tones: RED, w: 0.06 });
  const hx = cx - 2.4 + Math.cos(0.95) * 2.9, hz = cz - 1.6 + Math.sin(0.95) * 2.9;
  floorRing(room.b, { x: hx, z: hz, r: 0.22, n: 14, tones: RED, w: 0.06 });
  room.b.box(0.07, 0.01, 0.07, { at: [hx, 0.002, hz], ry: Math.PI / 4, tones: RED, pattern: 'none' });
  // a stub of chalk and the slate it was ground on
  room.b.box(0.1, 0.03, 0.03, { at: [cx + 1.05, 0, cz + 0.95], ry: 0.6, tones: 'cream' });

  // ---- the writing desk (front-left): the almanac open on the circled date, the pocket watch at 11:55, candle, quill
  const dx = -1.55, dz = 1.95;
  F.table(room, {
    x: dx, z: dz, w: 1.25, d: 0.66, items: false,
    extra: (b, g, top) => {
      // the almanac: two cream pages, a month grid of dots, one date ringed in red
      b.box(0.62, 0.04, 0.42, { at: [-0.12, top, -0.02], tones: CLOTH.red, ry: 0.06 });
      b.box(0.58, 0.02, 0.38, { at: [-0.12, top + 0.04, -0.02], tones: 'cream', pattern: 'none', ry: 0.06 });
      b.box(0.012, 0.022, 0.36, { at: [-0.12, top + 0.04, -0.02], tones: 'timber', ry: 0.06 });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        b.box(0.03, 0.006, 0.03, { at: [0.0 + i * 0.055, top + 0.06, -0.12 + j * 0.065], ry: 0.06, tones: 'timber', pattern: 'none' });
      }
      for (let q = 0; q < 8; q++) { const a = (q / 8) * Math.PI * 2; b.box(0.025, 0.008, 0.012, { at: [0.11 + Math.cos(a) * 0.04, top + 0.064, 0.0 + Math.sin(a) * 0.04], ry: -a, tones: RED, pattern: 'none' }); }
      for (let r2 = 0; r2 < 4; r2++) b.box(0.18, 0.006, 0.014, { at: [-0.28, top + 0.06, -0.12 + r2 * 0.07], ry: 0.06, tones: 'timber', pattern: 'none' });
      // the pocket watch: brass case, cream face, hands at 11:55, chain
      b.cylinder(0.075, 0.075, 0.025, { at: [0.42, top, 0.15], tones: 'brass', segments: 12 });
      b.cylinder(0.06, 0.06, 0.01, { at: [0.42, top + 0.025, 0.15], tones: 'cream', segments: 12 });
      b.box(0.012, 0.008, 0.05, { at: [0.418, top + 0.035, 0.15 - 0.025], ry: 0.04, tones: 'crow' });                  // hour ~12
      b.box(0.01, 0.008, 0.055, { at: [0.42 - 0.014, top + 0.035, 0.15 - 0.024], ry: 0.52, tones: 'crow' });        // minute at 55
      b.box(0.02, 0.02, 0.02, { at: [0.42, top + 0.012, 0.07], tones: 'brass' });
      for (let q = 0; q < 5; q++) b.box(0.05, 0.012, 0.012, { at: [0.36 - q * 0.04, top, 0.05 - q * 0.02], ry: 0.5, tones: 'brass' });
      // ink, a quill, a candle
      b.box(0.06, 0.07, 0.06, { at: [0.3, top, -0.2], tones: 'crow' });
      b.box(0.012, 0.012, 0.3, { at: [0.33, top + 0.1, -0.13], rx: -0.9, ry: 0.4, tones: 'cream' });
      b.cylinder(0.07, 0.07, 0.025, { at: [0.5, top, -0.15], tones: 'brass', segments: 8 });
      b.box(0.05, 0.16, 0.05, { at: [0.5, top + 0.025, -0.15], tones: 'cream', pattern: 'none' });
      g.box(0.06, 0.07, 0.06, { at: [0.5, top + 0.185, -0.15], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
      g.box(0.035, 0.06, 0.035, { at: [0.5, top + 0.255, -0.15], tones: 'glass', layer: 'glass', glow: GLOW.flame, glowKind: 2 });
      // a stack of star atlases
      b.box(0.26, 0.07, 0.2, { at: [-0.5, top, 0.18], tones: CLOTH.blue, ry: 0.2 });
      b.box(0.24, 0.06, 0.18, { at: [-0.5, top + 0.07, 0.18], tones: CLOTH.purple, ry: -0.1 });
    },
  });
  room.light({ pos: [dx + 0.5, 1.2, dz - 0.15], color: GLOW.candle, r: 2.3, kind: 'lantern', intensity: 1.15 });
  F.chair(room, { x: dx, z: dz - 0.72, ry: 0 });

  // ---- the Lantern-maker's lantern on a chain over the floor chart
  F.hangingLantern(room, { x: 1.55, z: 0.15, y: 2.35, r: 3.0, intensity: 1.15 });
  // a barrel of rolled charts by the stair foot, the doormat
  F.barrel(room, { x: 1.95, z: 2.15 });
  for (const [ddx, ddz, ry] of [[-0.08, 0.02, 0.2], [0.1, -0.05, -0.3], [0.0, 0.1, 0.9]]) {
    room.b.cylinder(0.04, 0.04, 0.5, { at: [1.95 + ddx, 0.7, 2.15 + ddz], ry, tones: TP.thatch, segments: 8 });
  }
  F.doormat(room, { x: 0, z: room.D / 2 - 0.4 });

  // ---- the moonbeam: a blue key light at the lancet (by day it only cools the back of the room), and at night a pale
  // patch on the floor under the lancet with dust motes drifting in its column
  room.light({ pos: [0, 2.1, -A + 0.25], color: '#8FA8E8', r: 5.0, kind: 'fire', intensity: 1.25 });
  const beamB = new Builder(room.engine, { name: 'house-0-moonbeam' });
  beamB.hexa([new THREE.Vector3(-0.45, 0.004, -A + 0.05), new THREE.Vector3(0.45, 0.004, -A + 0.05), new THREE.Vector3(-0.45, 0.012, -A + 0.05), new THREE.Vector3(0.45, 0.012, -A + 0.05),
    new THREE.Vector3(-0.15, 0.004, -1.25), new THREE.Vector3(0.75, 0.004, -1.25), new THREE.Vector3(-0.15, 0.012, -1.25), new THREE.Vector3(0.75, 0.012, -1.25)],
  { tones: 'glass', layer: 'glass', glow: '#5468A8', glowKind: 1 });
  // the moon itself, low in the lancet (night only)
  beamB.cylinder(0.17, 0.17, 0.02, { at: [0.12, 2.25, -A - 0.13], segments: 12, tones: 'glass', layer: 'glass', glow: '#E8ECFF', glowKind: 1 });
  const beamG = glowGroup(room, beamB, 'house-0-moonbeam');
  const dust = motes(room, { n: 26, seed: 31, box: { x0: -0.45, x1: 0.65, y0: 0.35, y1: 2.6, z0: -A + 0.3, z1: -1.4 }, size: 0.04, glow: MOON, mode: 'drift', speed: 0.18, sway: 0.16, name: 'dust' });

  room.spot('telescope', 1.35, -0.2, Math.atan2(tsx - 1.35, tsz + 0.2));
  room.spot('desk', dx + 0.95, dz - 0.45, -Math.PI / 2);
  room.spot('chalk', cx, cz + 1.5, Math.PI);
  room.spot('stair', 1.35, 0.95, Math.PI / 2);

  return {
    bed: { x: bx, z: bz - 0.6, y: 0.55, facing: 0 },
    visit: { x: bx + 0.95, z: bz + 0.4, facing: -Math.PI / 2 },
    extras: [orbPivot, beamG, dust.group],
    update(t) {
      const k = Math.floor(t * 8) / 8;                         // stepped 8 fps
      orbG.rotation.y = k * 0.22;
      beamG.visible = isNight(room);
      dust.update(t);
    },
    bedRect: bed.rect,
  };
}
