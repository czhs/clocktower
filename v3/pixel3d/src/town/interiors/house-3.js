// house-3 interior: Ravenscroft (owner: interiors builder, houses 0-4; lore pass 2026-10-16). docs/INTERIORS.md,
// docs/LORE.md row 3.
// A retired sexton who keeps the parish book of the dead. A long, low-lit NAVE with an APSE: violet stone over dark
// oak panelling, dark flagstones set with three pale grave-slabs, a blind arcade of pointed niches with candles, two
// columns and a pointed arch framing the apse. No hearth: only candles. Story props:
//   - in the apse, under a violet lancet: the LECTERN with the great parish ledger open - rows of names, several struck
//     through in black and the newest in red; tall iron prickets with thick candles either side
//   - the COFFIN-LENGTH BENCH (a coffin-shaped settle) with a folded pall and a candle; the sexton's spade by it
//   - on the right lancet's sill, the crow's hoard: buttons, a key, a ring, a spoon - and the crow itself
//   - the writing desk: a letter sealed with the RED WAX SIGIL (an eye in a clock face), quill and ink
//   - a narrow cot under a plum blanket, a skull in a niche, the Lantern-maker's lantern by the door
// Ambiance: candlelit near-dark at every hour. A shadow-only mask keeps the town sun out; the lancets are narrow and high, the stone a dark violet over a high
// oak dado; the CANDLES are the key light day and night (small warm 'fire' pools at the lectern, the coffin-bench and
// the desk), pale grey smoke curling up from them; solemn, gothic.
import * as THREE from 'three';
import { ramp } from '../palette.js';
import { bareShell, polyWalls, polyFloor, blockOutside, inPoly, onSeg, segPoint, motes, at, sunMask } from './house-0.js';

// ---- polish pass (2026-10-16): violet stone, and candle pools that know the hour
/** paintRamp, but the shadow tone sinks toward a deep VIOLET instead of the kit's slate (the shuttered nave is all
 *  shadow, and the slate lerp read blue - worst at night under the moon's blue fill). LORE: violet stone. */
function violetRamp(paintRamp, hexIn, o, shade = '#3C2252') {
  const r = paintRamp(hexIn, o);
  const sh = new THREE.Color(r[1]).multiplyScalar(0.62).lerp(new THREE.Color(shade), 0.35);
  return [r[0], r[1], '#' + sh.getHexString().toUpperCase()];
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** A dither canvas like house-0's ditherCanvas, drawn ONCE for night and day: by day (the sun up, golden hour and
 *  19:15 included) the pools drop to `dayK` of their density - on an ordered dither the day cells are an exact subset
 *  of the night cells, so the night-only quads just collapse - and their colours lean toward the stone (`dayTo`, by
 *  `dayMix`), so the candle glow on the lit violet floor stays glow and never reads as rust speckle. No extra
 *  geometry: the same quads, re-coloured and collapsed when the hour flips. */
function hourCanvas({ plane = 'floor', cw = 0.034, ch = plane === 'floor' ? 0.068 : 0.04, y = 0.006, z = 0.004, dayK = 0.6, dayTo, dayMix = 0.55 }) {
  const cells = new Map();
  const toward = new THREE.Color(dayTo);
  return {
    pool({ x = 0, v = 0, r = 1, r2 = r, color, inner = null, peak = 0.5, power = 1.4, clip = null, k = 0.62 }) {
      const i0 = Math.floor((x - r) / cw), i1 = Math.ceil((x + r) / cw), j0 = Math.floor((v - r2) / ch), j1 = Math.ceil((v + r2) / ch);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const u = (i + 0.5) * cw, w = (j + 0.5) * ch;
        const d2 = ((u - x) / r) ** 2 + ((w - v) / r2) ** 2;
        if (d2 >= 1 || (clip && !clip(u, w))) continue;
        const f = peak * (1 - d2) ** power, col = inner && f > peak * k ? inner : color;
        const key = i + ',' + j, c = cells.get(key);
        if (!c) cells.set(key, { i, j, f, col, fm: f });
        else { c.f = 1 - (1 - c.f) * (1 - f); if (f > c.fm) { c.fm = f; c.col = col; } }
      }
      return this;
    },
    /** -> quads [{v0, day (shown by day), dayCol THREE.Color}] (glass-layer vertex indices in b) */
    draw(b) {
      const rows = new Map(), quads = [];
      for (const c of cells.values()) {
        const t = (BAYER4[(((c.j % 4) + 4) % 4) * 4 + (((c.i % 4) + 4) % 4)] + 0.5) / 16;
        if (c.f <= t) continue;
        c.day = c.f * dayK > t;
        (rows.get(c.j) ?? rows.set(c.j, []).get(c.j)).push(c);
      }
      for (const [j, row] of rows) {
        row.sort((p, q) => p.i - q.i);
        for (let a = 0; a < row.length;) {
          let e = a;
          while (e + 1 < row.length && row[e + 1].i === row[e].i + 1 && row[e + 1].col === row[a].col && row[e + 1].day === row[a].day) e++;
          const x0 = row[a].i * cw, x1 = (row[e].i + 1) * cw, v0 = j * ch, v1 = (j + 1) * ch;
          const P = plane === 'floor'
            ? [x0, y, v0, x0, y, v1, x1, y, v1, x0, y, v0, x1, y, v1, x1, y, v0]
            : [x0, v0, z, x1, v0, z, x1, v1, z, x0, v0, z, x1, v1, z, x0, v1, z];
          quads.push({ v0: (b.layers.glass?.pos.length ?? 0) / 3, day: row[a].day, dayCol: new THREE.Color(row[a].col).lerp(toward, dayMix) });
          b.tris(P, { tones: 'glass', layer: 'glass', glow: row[a].col, glowKind: 1 });
          a = e + 1;
        }
      }
      return quads;
    },
  };
}
/** Day / night switch for hourCanvas quads inside a built mesh (call after the mesh exists; update() every frame). */
function hourSwitch(room, mesh, quads) {
  const pos = mesh.geometry.getAttribute('position'), glow = mesh.geometry.getAttribute('aGlow');
  const vs = quads.flatMap((q) => Array.from({ length: 6 }, (_, k) => q.v0 + k));
  const P0 = vs.map((v) => [pos.getX(v), pos.getY(v), pos.getZ(v)]), G0 = vs.map((v) => [glow.getX(v), glow.getY(v), glow.getZ(v)]);
  const sun = room.engine.uniforms?.uSunDir?.value, sunC = room.engine.uniforms?.uSunColor?.value;
  // "day" = the sun is up and warm (the same test as houses 10-14's masks): golden hour and 19:15 are day here,
  // although the kit's window glow (isNight) is already on then
  const isDay = () => !!sun && sun.y >= 0.08 && !(sunC && sunC.b > sunC.r + 0.02);
  let last = null;
  const fn = () => {
    const d = isDay();
    if (d === last) return;
    last = d;
    quads.forEach((q, n) => {
      for (let k = 0; k < 6; k++) {
        const i = n * 6 + k, v = q.v0 + k, p = d && !q.day ? P0[n * 6] : P0[i];
        pos.setXYZ(v, p[0], p[1], p[2]);
        // (glow colours are stored linear, like THREE.Color's components)
        if (d) glow.setXYZ(v, q.dayCol.r, q.dayCol.g, q.dayCol.b); else glow.setXYZ(v, G0[i][0], G0[i][1], G0[i][2]);
      }
    });
    pos.needsUpdate = true; glow.needsUpdate = true;
  };
  fn.isDay = isDay;
  return fn;
}

/** Night palette swap for the violet stone. Under the moon the toon shader desaturates tones (toneSat 0.6), strips
 *  "cool" ones (blue above red: violet counts) and multiplies by a blue ramp (0.17, 0.24, 0.48): any violet that
 *  reads violet by day comes out navy. So at night the room's violet SHADOW tones (the whole shuttered nave is in
 *  shadow) are re-hued to a red-heavy plum of the same luminance, which that blue ramp turns back into violet. Only
 *  vertices whose shadow tone has the chroma of `ramps` (any tint) are touched; written once per day / night flip. */
function nightStone(root, prefix, ramps, isDay, plum = [0.1, 0.016, 0.05], gain = 1.3) {
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const keys = ramps.map((t) => { const c = new THREE.Color(t[2]), q = c.r + c.g + c.b; return [c.r / q, c.g / q]; });
  const pl = lum(...plum);
  const sets = [];
  root.traverse((m) => {
    if (!m.isMesh || !m.name.startsWith(prefix)) return;
    const a = m.geometry.getAttribute('toneSh');
    if (!a || m.geometry.getAttribute('aGlow')) return;
    const idx = [], night = [];
    for (let v = 0; v < a.count; v++) {
      const r = a.getX(v), g = a.getY(v), b = a.getZ(v), q = r + g + b;
      if (q <= 0 || !keys.some(([kr, kg]) => Math.abs(r / q - kr) < 0.02 && Math.abs(g / q - kg) < 0.02)) continue;
      const f = (lum(r, g, b) / pl) * gain;   // (gain: the blue ramp passes less of a red-heavy tone)
      idx.push(v); night.push(r, g, b, plum[0] * f, plum[1] * f, plum[2] * f);
    }
    if (idx.length) sets.push({ a, idx, night });
  });
  let last = null;
  return () => {
    const d = isDay();
    if (d === last) return;
    last = d;
    for (const { a, idx, night } of sets) {
      idx.forEach((v, n) => { const o = n * 6 + (d ? 0 : 3); a.setXYZ(v, night[o], night[o + 1], night[o + 2]); });
      a.needsUpdate = true;
    }
  };
}

/** Room size / walls (index.js reads ROOM before build): a wide, shallow nave; the apse is part of the depth. */
export const ROOM = {
  w: 10, d: 6.0, h: 3.6, wall: 'stone', pal: 3, floor: 'flags',
  // the demo's room night look (docs/DEMO.md 4.3, once index.js passes it through): candle-warm lit faces, a deep
  // violet-rose fill, almost no mist (the smoke is the room's own)
  nightAmbient: { lit: '#E8A878', sh: '#7C6488', k: 0.7, litK: 0.45, gain: 1.0, mist: 0.2 },
};

export default function build(room, ctx) {
  const { FURNITURE: F, CLOTH, GLOW, TOWN_PALETTE: TP, paintRamp } = ctx;
  const W = room.W, D = room.D, H = room.H, T = room.T;
  const X = W / 2, Z = D / 2, NB = -1.9, AW = 1.5, AI = 1.0;    // nave back wall z; apse mouth half-width, back half-width
  const VIOLET = violetRamp(paintRamp, '#3f2d55', { lightness: 0.3 });   // (was #3a3050 + the slate shadow: read blue)
  const OAK = paintRamp('#3a2828', { lightness: 0.24 });
  const FLAGS = violetRamp(paintRamp, '#3a2c46', { lightness: 0.27 });
  const CANDLE = '#FFB85C';                                    // warm, a touch more amber than the town lamp (no pink on violet)
  const DARK = violetRamp(paintRamp, '#281a32', { lightness: 0.16 });
  const PLUM = paintRamp(TP.plum[1], { lightness: 0.36 });
  const WAX = paintRamp(TP.bannerRed, { lightness: 0.42 });
  const LANCET = '#9680C4';
  bareShell(room);

  // ---- the nave + apse
  const V = [
    [-X, NB, { ext: [T, 0] }],
    [-AW, NB, { ext: [0, T] }],
    [-AI, -Z, { windows: [{ u: 0, y: 1.6, w: 0.36, h: 1.1, panes: [1, 4], arch: 'pointed', frame: 'iron', sill: 'ashlar' }] }],
    [AI, -Z, { ext: [T, 0] }],
    [AW, NB, { ext: [0, T], windows: [{ u: 3.45 - (AW + X) / 2, y: 1.6, w: 0.34, h: 0.95, panes: [1, 3], arch: 'pointed', frame: 'iron', sill: 'ashlar' }] }],
    [X, NB], [X, Z], [-X, Z],
  ];
  const poly = V.map((p) => [p[0], p[1]]);
  const segs = polyWalls(room, V, {
    dado: 1.5, upper: { tones: VIOLET, pattern: 'ashlar', scale: 0.85 }, lower: { tones: OAK, pattern: 'vboards', scale: 0.7 },
    capTones: 'stone', jambTones: 'stone', windowGlow: LANCET,
  });
  polyFloor(room, poly, { tones: FLAGS, pattern: 'ashlar', scale: 1.7, lip: [[-X - 0.45, NB - 0.45], [-AW, NB - 0.45], [-AI, -Z - 0.45], [AI, -Z - 0.45], [AW, NB - 0.45], [X + 0.45, NB - 0.45], [X + 0.45, Z + 0.45], [-X - 0.45, Z + 0.45]] });
  blockOutside(room, (x, z) => inPoly(poly, x, z));
  const navL = segs[0], apseBack = segs[2], navR = segs[4];

  // ---- the blind arcade: pointed niches in the nave's back walls (candles, a skull, a bell)
  const niche = (s, u, what) => onSeg(room, s, u, 1.05, (b, g) => {
    b.box(0.62, 1.3, 0.02, { at: [0, 0, 0.005], tones: DARK });
    b.prism([[-0.31, 0], [0.31, 0], [0.18, 0.28], [0, 0.42], [-0.18, 0.28]], 0.02, { at: [0, 1.3, 0.012], tones: DARK });
    for (const sx of [-1, 1]) {
      b.box(0.12, 1.42, 0.1, { at: [sx * 0.37, -0.05, 0.05], tones: 'stone', pattern: 'ashlar', scale: 0.6 });
      b.box(0.18, 0.1, 0.14, { at: [sx * 0.37, 1.37, 0.07], tones: 'stone' });
      b.box(0.24, 0.07, 0.07, { at: [sx * 0.2, 1.55 + 0.04, 0.05], rz: sx * -0.75, tones: 'stone', origin: 'center' });
    }
    b.box(0.6, 0.06, 0.2, { at: [0, 0.35, 0.1], tones: 'stone' });                              // the ledge
    if (what === 'skull') {
      b.box(0.17, 0.15, 0.17, { at: [0, 0.41, 0.1], tones: 'cream' });
      b.box(0.12, 0.05, 0.08, { at: [0, 0.41, 0.17], tones: 'cream', tint: 0.95 });
      for (const sx of [-1, 1]) b.box(0.04, 0.04, 0.01, { at: [sx * 0.04, 0.5, 0.185], tones: 'crow' });
    }
    if (what === 'bell') { b.cylinder(0.08, 0.12, 0.16, { at: [0, 0.41, 0.1], tones: 'brass', segments: 8 }); b.box(0.04, 0.06, 0.04, { at: [0, 0.57, 0.1], tones: 'iron' }); }
    const cx = what ? 0.2 : 0;
    b.box(0.08, 0.26, 0.08, { at: [cx, 0.41, 0.12], tones: 'cream', pattern: 'none' });
    b.box(0.05, 0.08, 0.05, { at: [cx - 0.03, 0.41, 0.16], tones: 'cream', tint: 0.95 });               // wax run
    g.box(0.06, 0.08, 0.06, { at: [cx, 0.67, 0.12], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    g.box(0.035, 0.06, 0.035, { at: [cx, 0.75, 0.12], tones: 'glass', layer: 'glass', glow: GLOW.flame, glowKind: 2 });
  });
  const niches = [[navL, -4.2 - navL.mid[0], 'skull'], [navL, -2.75 - navL.mid[0], null], [navR, 2.2 - navR.mid[0], 'bell']];
  for (const [s, u, w] of niches) niche(s, u, w);             // (their candles only glow: point lights on the violet
                                                                //  stone paint big hard discs)

  // ---- the apse mouth: two columns and a pointed arch; the lectern with the parish ledger; prickets
  at(room, { x: 0, z: NB + 0.12 }, (b) => {
    for (const sx of [-1, 1]) {
      b.box(0.42, 0.18, 0.42, { at: [sx * AW, 0, 0], tones: 'stone', pattern: 'none' });
      b.cylinder(0.15, 0.15, 2.3, { at: [sx * AW, 0.18, 0], tones: 'stone', pattern: 'ashlar', scale: 0.6, segments: 8 });
      b.box(0.42, 0.16, 0.42, { at: [sx * AW, 2.48, 0], tones: 'stone', pattern: 'none' });
    }
    // the pointed arch: voussoirs from each capital to the apex
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const f0 = k / 6, f1 = (k + 1) / 6;
        // a depressed equilateral (pointed) arch: each half is an arc about the opposite springer, flattened
        const A0 = (f0 * Math.PI) / 3, A1 = (f1 * Math.PI) / 3;
        const ax = sx * (-AW + 2 * AW * Math.cos(A0)), ay = 2.64 + 2 * AW * Math.sin(A0) * 0.32;
        const bx2 = sx * (-AW + 2 * AW * Math.cos(A1)), by = 2.64 + 2 * AW * Math.sin(A1) * 0.32;
        b.box(Math.hypot(bx2 - ax, by - ay) + 0.06, 0.22, 0.36, { at: [(ax + bx2) / 2, (ay + by) / 2, 0], rz: Math.atan2(by - ay, bx2 - ax), tones: 'stone', pattern: 'ashlar', scale: 0.6, origin: 'center', tint: k % 2 ? 0.97 : 1.03 });
      }
    }
  });
  for (const sx of [-1, 1]) room.solidAt(sx * AW, NB + 0.12, 0.45, 0.45, 0, 'column');
  // the lectern: a slanted desk on a turned post, the open ledger (names, struck lines, one in red), a candle
  const lz = -2.35;
  at(room, { x: 0, z: lz }, (b, g) => {
    b.box(0.5, 0.06, 0.5, { at: [0, 0, 0], tones: 'timber' });
    b.cylinder(0.07, 0.09, 1.0, { at: [0, 0.06, 0], tones: 'timber', segments: 8 });
    b.push({ at: [0, 1.1, 0], rx: 0.45 });
    b.box(0.86, 0.06, 0.56, { at: [0, -0.03, 0], tones: 'timber', origin: 'center' });
    b.box(0.84, 0.05, 0.52, { at: [0, 0.03, 0], tones: OAK, origin: 'center' });                // the ledger's boards
    b.box(0.8, 0.04, 0.48, { at: [0, 0.07, 0], tones: 'cream', pattern: 'none', origin: 'center' });
    b.box(0.015, 0.05, 0.46, { at: [0, 0.075, 0], tones: 'timber', origin: 'center' });
    for (const sx of [-1, 1]) for (let r = 0; r < 7; r++) {
      const ux = sx * 0.2, uz = -0.19 + r * 0.06, w = 0.26 - ((r * 3 + (sx > 0 ? 1 : 0)) % 4) * 0.03;
      b.box(w, 0.006, 0.014, { at: [ux, 0.093, uz], tones: 'timber', pattern: 'none', origin: 'center' });
      const struck = (sx < 0 && (r === 1 || r === 4)) || (sx > 0 && (r === 2 || r === 3 || r === 5));
      if (struck) b.box(w + 0.04, 0.008, 0.02, { at: [ux, 0.097, uz], tones: 'crow', pattern: 'none', origin: 'center' });
    }
    b.box(0.2, 0.008, 0.02, { at: [0.2, 0.097, -0.19 + 6 * 0.06 + 0.04], tones: WAX, pattern: 'none', origin: 'center' });   // the newest name, in red
    b.box(0.015, 0.01, 0.5, { at: [0.05, 0.1, 0.04], ry: 0.1, tones: WAX, origin: 'center' });                          // ribbon
    b.pop();
  });
  room.solidAt(0, lz, 0.6, 0.6, 0, 'lectern');
  // tall iron prickets with thick candles either side of the lectern
  const pricket = (x, z, h) => at(room, { x, z }, (b, g) => {
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; b.box(0.04, 0.04, 0.26, { at: [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], ry: -a + Math.PI / 2, tones: 'iron' }); }
    b.box(0.04, h, 0.04, { at: [0, 0, 0], tones: 'iron' });
    b.cylinder(0.12, 0.1, 0.04, { at: [0, h, 0], tones: 'iron', segments: 8 });
    b.cylinder(0.075, 0.075, 0.32, { at: [0, h + 0.04, 0], tones: 'cream', pattern: 'none', segments: 8 });
    b.box(0.05, 0.12, 0.05, { at: [0.05, h + 0.12, 0.04], tones: 'cream', tint: 0.94 });
    g.box(0.07, 0.09, 0.07, { at: [0, h + 0.36, 0], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    g.box(0.04, 0.07, 0.04, { at: [0, h + 0.45, 0], tones: 'glass', layer: 'glass', glow: GLOW.flame, glowKind: 2 });
  });
  pricket(-0.72, -2.3, 1.15); pricket(0.72, -2.3, 1.15);
  room.solidAt(-0.72, -2.3, 0.3, 0.3); room.solidAt(0.72, -2.3, 0.3, 0.3);
  // the key light, day and night: the two prickets' pool round the lectern ('fire' = always lit; no violet window light)
  room.light({ pos: [0, 1.45, -2.55], color: CANDLE, r: 1.75, kind: 'fire', intensity: 1.45 });
  // (deep in the apse, behind the plane of the nave's back walls: those face away from it and stay dark, so the warm
  //  pool fills the apse and ends at its columns and arch instead of painting a disc across the nave)
  // the ledger itself, lit by the prickets: a small light just above the open book (reaches neither floor nor walls)
  room.light({ pos: [0, 1.62, -1.95], color: CANDLE, r: 0.75, kind: 'fire', intensity: 1.3 });

  // ---- grave-slabs in the floor (pale ledger stones with an incised cross and a border)
  for (const [sx, sz, ry] of [[-2.9, 0.2, 0], [-1.25, 0.9, 0], [2.6, 0.95, 0]]) {
    at(room, { x: sx, z: sz, ry }, (b) => {
      b.box(0.82, 0.012, 1.6, { at: [0, 0.0, 0], tones: 'ashlar', pattern: 'none', tint: 0.94 });
      b.box(0.06, 0.006, 0.9, { at: [0, 0.012, -0.15], tones: DARK, pattern: 'none' });
      b.box(0.44, 0.006, 0.06, { at: [0, 0.012, -0.32], tones: DARK, pattern: 'none' });
      for (let r = 0; r < 3; r++) b.box(0.4 - r * 0.08, 0.006, 0.03, { at: [0, 0.012, 0.45 + r * 0.1], tones: DARK, pattern: 'none' });
    });
  }

  // ---- the coffin-length bench (front-left): a coffin-shaped settle with a pall, a candle; the spade
  const cbx = -3.05, cbz = 1.55;
  at(room, { x: cbx, z: cbz }, (b, g) => {
    const shape = [[-1.0, 0], [-0.78, 0.3], [0.95, 0.22], [1.02, 0], [0.95, -0.22], [-0.78, -0.3]];
    b.prism(shape.map(([x, z]) => [x, -z]), 0.42, { at: [0, 0.21, 0], rx: -Math.PI / 2, tones: OAK, pattern: 'vboards', scale: 0.6 });
    b.prism(shape.map(([x, z]) => [x * 1.04, -z * 1.12]), 0.06, { at: [0, 0.45, 0], rx: -Math.PI / 2, tones: 'timber' });
    b.box(0.5, 0.05, 0.5, { at: [-0.35, 0.48, 0], tones: 'crow', layer: 'soft' });   // the folded pall
    b.box(0.5, 0.04, 0.08, { at: [-0.35, 0.5, 0.0], tones: 'cream', layer: 'soft' });
    b.box(0.08, 0.05, 0.4, { at: [-0.35, 0.53, 0.0], tones: 'cream', layer: 'soft' });
    b.cylinder(0.06, 0.06, 0.02, { at: [0.55, 0.48, 0], tones: 'brass', segments: 8 });
    b.box(0.06, 0.18, 0.06, { at: [0.55, 0.5, 0], tones: 'cream', pattern: 'none' });
    g.box(0.06, 0.07, 0.06, { at: [0.55, 0.68, 0], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    for (const sx of [-0.7, 0.7]) b.box(0.16, 0.06, 0.06, { at: [sx, 0.32, 0.31], tones: 'iron' });  // handles
  });
  room.solidAt(cbx, cbz, 2.1, 0.66, 0, 'coffin');
// (polish 3: no point light for the coffin candle - 0.37 m over the flat lid, its toon pool painted a hard dark ellipse
  //  under the candle; the dithered floor pool and the candle's own glow carry it, like the desk's and the candelabra's)
  at(room, { x: -4.6, z: 0.6, rz: 0.12 }, (b) => {                                              // the spade
    b.box(0.05, 1.2, 0.05, { at: [0, 0.3, 0], tones: 'plank' });
    b.box(0.16, 0.05, 0.05, { at: [0, 1.5, 0], tones: 'plank' });
    b.box(0.22, 0.3, 0.03, { at: [0, 0, 0], tones: 'iron' });
  });
  room.solidAt(-4.6, 0.6, 0.35, 0.35);

  // ---- the crow's hoard on the right lancet's sill, and the crow
  onSeg(room, navR, 3.45 - navR.mid[0], 1.6, (b) => {
    for (const [x, kind] of [[-0.14, 'button'], [-0.05, 'key'], [0.06, 'ring'], [0.15, 'spoon']]) {
      if (kind === 'button') { b.cylinder(0.03, 0.03, 0.015, { at: [x, 0.0, 0.08], tones: 'brass', segments: 8 }); b.cylinder(0.025, 0.025, 0.015, { at: [x + 0.04, 0.0, 0.12], tones: 'copper', segments: 8 }); }
      if (kind === 'key') { b.box(0.1, 0.012, 0.02, { at: [x, 0.0, 0.1], ry: 0.4, tones: 'brass' }); b.box(0.035, 0.012, 0.035, { at: [x - 0.05, 0.0, 0.08], tones: 'brass' }); }
      if (kind === 'ring') b.cylinder(0.025, 0.025, 0.012, { at: [x, 0.0, 0.07], tones: CLOTH.gold, segments: 8 });
      if (kind === 'spoon') { b.box(0.1, 0.01, 0.018, { at: [x, 0.0, 0.11], ry: -0.5, tones: 'iron' }); b.box(0.04, 0.012, 0.03, { at: [x + 0.05, 0.0, 0.08], ry: -0.5, tones: 'iron' }); }
    }
    // the crow, perched on the sill's corner, looking into the room
    b.box(0.18, 0.13, 0.11, { at: [0.25, 0.02, 0.1], ry: 0.4, tones: 'crow' });
    b.box(0.09, 0.09, 0.08, { at: [0.3, 0.13, 0.13], ry: 0.4, tones: 'crow', tint: 1.05 });
    b.box(0.07, 0.025, 0.025, { at: [0.33, 0.16, 0.19], ry: 0.4, tones: 'iron' });
    b.box(0.12, 0.04, 0.05, { at: [0.15, 0.06, 0.06], ry: 0.4, rz: 0.4, tones: 'crow', tint: 0.95 });
  });

  // ---- the narrow cot (back-right corner, head to the back wall) under a plum blanket; a candle box beside it
  const bx = X - 0.6, bz = NB + 1.02;
  const bed = F.bed(room, { x: bx, z: bz, quilt: PLUM, frame: 'timber' });
  room.b.box(0.07, 0.07, 0.07, { at: [bx, 1.15, NB + 0.08], tones: 'iron' });
  room.b.box(0.06, 0.4, 0.04, { at: [bx, 0.95, NB + 0.06], tones: 'iron' });                   // an iron cross over it
  room.b.box(0.26, 0.04, 0.04, { at: [bx, 1.2, NB + 0.06], tones: 'iron' });

  // ---- the writing desk (front-right): the letter with the red wax sigil, quill, ink, a candle
  const dx = 2.75, dz = 1.4;
  F.table(room, {
    x: dx, z: dz, w: 1.2, d: 0.62, items: false,
    extra: (b, g, top) => {
      b.box(0.3, 0.012, 0.22, { at: [-0.1, top, 0.04], ry: -0.15, tones: 'cream', pattern: 'none' });                 // the letter
      b.prism([[-0.15, 0], [0.15, 0], [0, -0.09]], 0.006, { at: [-0.1, top + 0.014, 0.04 - 0.11], rx: Math.PI / 2, ry: -0.15, tones: 'cream', tint: 0.95 });
      b.cylinder(0.04, 0.04, 0.014, { at: [-0.1, top + 0.012, 0.02], tones: WAX, segments: 12 });                    // THE SIGIL
      b.box(0.04, 0.006, 0.02, { at: [-0.1, top + 0.027, 0.02], tones: 'cream', pattern: 'none' });                  //   an eye
      b.box(0.012, 0.008, 0.012, { at: [-0.1, top + 0.029, 0.02], tones: 'crow', pattern: 'none' });
      b.box(0.004, 0.008, 0.03, { at: [-0.1, top + 0.03, 0.002], tones: 'crow', pattern: 'none' });                  //   a clock hand at twelve
      b.box(0.26, 0.04, 0.2, { at: [0.3, top, -0.12], tones: OAK, ry: 0.2 });
      b.box(0.06, 0.07, 0.06, { at: [0.12, top, -0.18], tones: 'crow' });
      b.box(0.012, 0.012, 0.3, { at: [0.15, top + 0.1, -0.11], rx: -0.9, ry: 0.3, tones: 'cream' });
      b.cylinder(0.07, 0.07, 0.025, { at: [0.45, top, 0.15], tones: 'brass', segments: 8 });
      b.box(0.05, 0.14, 0.05, { at: [0.45, top + 0.025, 0.15], tones: 'cream', pattern: 'none' });
      g.box(0.06, 0.07, 0.06, { at: [0.45, top + 0.165, 0.15], tones: 'glass', layer: 'glass', glow: GLOW.candle, glowKind: 2 });
    },
  });
  room.light({ pos: [dx + 0.45, 1.05, dz + 0.2], color: CANDLE, r: 1.05, kind: 'fire', intensity: 1.2 });
  F.chair(room, { x: dx, z: dz - 0.7, ry: 0 });
  // a candelabra by the left column, the lantern on its chain inside the door, a chest of parish rolls
  F.candelabra(room, { x: -2.1, z: -1.35 });
  room.lightList.pop();   // its own point light painted a disc on the nave wall: the dithered pool + the niche glow carry it
  F.hangingLantern(room, { x: -1.1, z: 2.05, y: 2.0, r: 1.2, intensity: 0.8 });
  F.chest(room, { x: 4.55, z: 1.15, ry: -Math.PI / 2 });
  F.rug(room, { x: 0, z: 0.0, w: 2.2, d: 1.5, tones: paintRamp('#4a1c28', { lightness: 0.22 }), border: PLUM });
  F.doormat(room, { x: 0, z: Z - 0.4 });

  // ---- smoke curling up from the candles: pale grey wisps (a faint self-lit grey, so they read pale on the dark
  // stone instead of as dark specks), rising, swaying, shrinking. In the same mesh, the CANDLELIGHT itself (day and
  // night: the shutters keep the sun out): dithered amber pools - round the lectern and up the apse, in each niche,
  // under the coffin-bench candle, the desk, the candelabra and the door lantern - soft islands in the violet dark
  const inside = (u, w) => inPoly(poly, u, w);
  const pools = [];
  const smoke = motes(room, {
    n: 26, seed: 33, sources: [[-0.72, -2.3, 1.68], [0.72, -2.3, 1.68], [cbx + 0.55, cbz, 0.78], [dx + 0.45, dz + 0.15, 1.02]], jitter: 0.05,
    box: { y0: 0, y1: 1.3 }, size: 0.045, glow: '#8E8A96', mode: 'steam', speed: 0.16, sway: 0.06, name: 'smoke',
    still: (b) => {
      const fl = hourCanvas({ plane: 'floor', dayTo: '#4A3A5C' });
      fl.pool({ x: 0, v: -2.05, r: 1.45, r2: 1.05, color: '#8A5C48', inner: '#C88A5A', peak: 0.5, power: 1.1, clip: inside });   // the lectern + prickets
      fl.pool({ x: cbx + 0.5, v: cbz + 0.15, r: 0.9, r2: 0.65, color: '#8A5C48', inner: '#C08458', peak: 0.38, clip: inside });   // the coffin-bench candle
      fl.pool({ x: dx + 0.45, v: dz + 0.3, r: 0.85, r2: 0.6, color: '#8A5C48', inner: '#C08458', peak: 0.36, clip: inside });   // the desk
      fl.pool({ x: -2.1, v: -1.25, r: 0.85, r2: 0.6, color: '#7E5646', inner: '#B07A52', peak: 0.34, clip: inside });   // the candelabra
      fl.pool({ x: -1.1, v: 2.15, r: 0.7, r2: 0.5, color: '#7E5646', inner: '#B07A52', peak: 0.3, clip: inside });   // the door lantern
      pools.push(...fl.draw(b));
      // up the apse's back wall between the prickets, and a halo in every niche
      const onWall = (sg, z, list) => {
        const c = hourCanvas({ plane: 'wall', z, dayTo: '#4E3866' });
        for (const p of list) c.pool(p);
        b.push({ at: [sg.mid[0], 0, sg.mid[1]], ry: sg.ry });
        pools.push(...c.draw(b));
        b.pop();
      };
      onWall(apseBack, 0.01, [{ x: 0, v: 1.35, r: 1.05, r2: 0.95, color: '#7A4C46', inner: '#B07058', peak: 0.42, power: 1.1 }]);
      for (const [sg, u, w] of niches) onWall(sg, 0.02, [{ x: u + (w ? 0.2 : 0), v: 1.7, r: 0.36, r2: 0.42, color: '#8A5444', inner: '#C8845A', peak: 0.55, power: 1.0 }]);
      onWall(navL, 0.01, [{ x: -2.1 - navL.mid[0], v: 1.45, r: 0.6, r2: 0.55, color: '#6E4A48', inner: '#9A6656', peak: 0.3 }]);
    },
    night: (b) => {
      // a faint violet moon in the two lancets (the panes alone go black at night)
      for (const [sg, u, w, h] of [[apseBack, 0, 0.36, 1.1], [navR, 3.45 - navR.mid[0], 0.34, 0.95]]) {
        b.push({ at: [sg.mid[0], 0, sg.mid[1]], ry: sg.ry });
        b.box(w, h, 0.004, { at: [u, 1.6, -T * 0.55 + 0.016], tones: 'glass', layer: 'glass', glow: '#56407E', glowKind: 1 });
        b.pop();
      }
    },
  });
  // ---- the sun stays out: a shadow-only mask over the whole room (the lancets only glow)
  const mask = sunMask(room, { name: 'house-3-shutter', cell: 0.5, margin: 14 });
  const hour = hourSwitch(room, smoke.mesh, pools);
  hour();
  let stone = null;

  room.spot('lectern', 0, -1.35, Math.PI);
  room.spot('coffin', cbx, cbz + 0.75, Math.PI);
  room.spot('desk', dx, dz - 0.75 - 0.4, Math.PI);

  return {
    bed: { x: bx, z: bz - 0.6, y: 0.55, facing: 0 },
    visit: { x: bx - 0.95, z: bz + 0.45, facing: Math.PI / 2 },
    extras: [smoke.group, mask.group],
    update(t) {
      smoke.update(t); mask.update(); hour();
      // (the room's meshes are only reachable once buildInterior has parented the extras)
      if (!stone && smoke.group.parent) { let r = smoke.group.parent; while (r.parent && !r.parent.isScene) r = r.parent; const a = nightStone(r, room.id, [VIOLET, FLAGS, DARK, PLUM], hour.isDay), c = nightStone(r, room.id, [ramp('stone')], hour.isDay, [0.085, 0.03, 0.06], 1.15);
        stone = () => { a(); c(); };   // (the columns, arch and caps: a greyer violet)
      }
      stone?.();
    },
    bedRect: bed.rect,
  };
}
