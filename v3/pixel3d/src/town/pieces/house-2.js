// house-2 — The Weaver's House (owner: house-2 agent). docs/TOWN.md §4 piece API, §6 scale rules.
//
// DESIGN NOTE (v1 identity: pipgws packages/assets/scripts/houses/house-2.ts, read only)
//   Signature silhouette: a TALL two-storey trader's house. Ochre-stone shop below, a cream half-timbered upper floor
//   that sails out over the lane on a JETTY with carved brackets, a red-tile HALF-HIPPED main roof (steep hip ends ->
//   trapezoid silhouette), and a big steep cream LOFT GABLE in the middle of the front with a HOIST BEAM at its apex,
//   a rope and a swinging bale of wool hanging in front of the open loft door. Nobody else in the ring has a jetty,
//   a ribbon window or a hoist: that is what must read at 640x360 from the gameplay camera.
//   Key details: the weaver's RIBBON WINDOW (a band of lights right across the upper floor; at night a glowing strip),
//   St Andrew's crosses in the panels below it, flower boxes on the sill rail; the LOOM WINDOW (left, warp threads and
//   striped half-woven cloth silhouetted against the glass), the SHOP COUNTER window (right, a let-down shutter with
//   bolts of cloth seen end-on and spools), dyed yarn SKEINS hanging under the jetty, a hanging lantern on a chain,
//   an indigo (dyer's blue) panelled door hinged right, and the SPOOL SIGN hanging off the right corner. Brick
//   chimney on the LEFT rear slope (v1 draws it at x 14/80 = left; the layout style hint says 'right' - the v1 house
//   file is the identity source of truth, TOWN.md §1). Extras (persona): a barrel by the left corner with the black cat.
//   Palette rows (TOWN.md §3): walls daub (= v1 ochre stone, ashlar-coursed) + plaster (jetty floor) + timber; roof red;
//   trim ashlar / cream / iron / brass; brick (plinth course + chimney: the layout's 'brick' hint); door + shutters
//   paintRamp(v1 '#2a3a6a' indigo); accents: yarn & cloth bannerRed/bannerGold/bannerBlue/bannerGreen/flowerViolet/
//   pumpkin, wool = cream ramp, flowers red/white/violet.
//   Layout: footprint x 26..31, z 5..9 (local frame: origin at the footprint centre (28.5, 7), +z = south = the lane).
//   Ground floor wall at z 8.75, jetty / upper floor face at z 9.15, roof eave 9.45 (<= 0.6 m beyond the footprint),
//   door centred on x 28.5 (door tile 28,9 kept clear: only the step's lip and the mat). Ridge 6.85 m (top row <= 7).
//   Animation: the wool bale sways on its rope (8 stepped poses at 3 fps, pure f(t)); door via api.setDoor.
import * as THREE from 'three';
import * as kit from '../kit.js';
import { toWorld } from '../api.js';
import { TOWN_PALETTE as P, paintRamp } from '../palette.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------- dimensions (local m)
const GF = { x: 2.3, zb: -1.85, zf: 1.75, top: 2.52 };            // ground floor: half width, back / front wall, top
const JET = { y0: 2.52, y1: 2.72 };                                // jetty beam
const UF = { x: 2.42, zb: -1.95, zf: 2.15, y0: 2.72, eave: 4.55 }; // upper floor (jettied forward 0.4 m)
const ROOF = { ridge: 6.85, ovS: 0.3, tanE: 2.0 };                 // main half-hip roof: side overhang, end-slope tan
const GAB = { half: 1.35, eave: 4.87, ridge: 6.55, zBack: 0.35, ov: 0.2, front: 0.1 }; // front loft gable
const ROOF_PAT = 'none';                                           // joints on the 1-px course faces read as dots
const YARN = [P.bannerRed, P.bannerGold, P.bannerBlue, P.bannerGreen, P.flowerViolet, P.pumpkin];

/**
 * Half-hip ("steep-ended hip") roof with stepped courses, my own variant of kit.hipRoof: long slopes at the side
 * pitch, the two ends steeper (tanE), so the front reads as a tall trapezoid like the v1 sprite. `cut` opens the
 * front eave courses in front of the loft gable's face. Tile joints: 'vboards' with a per-course scale (staggered).
 */
function halfHipRoof(b, { cz, hx, hz, eave, ridge, ovS, tanE, seed, cut }) {
  const tanS = (ridge - eave) / hz;
  const y0 = eave - ovS * tanS;
  const D = hz + ovS;
  const R = ridge - y0;
  const W = hx + ovS * tanS / tanE;
  const ridgeHalf = Math.max(0, W - R / tanE);
  const r = rng(seed * 7717 + 5);
  const course = 0.3, thick = 0.1, lift = 0.07;            // 2-texel lift: solid course lines (1 texel dashes)
  const sides = [
    { nx: 0, nz: 1, along: W, across: D, tan: tanS, other: tanE, min: ridgeHalf },
    { nx: 0, nz: -1, along: W, across: D, tan: tanS, other: tanE, min: ridgeHalf },
    { nx: 1, nz: 0, along: D, across: W, tan: tanE, other: tanS, min: 0 },
    { nx: -1, nz: 0, along: D, across: W, tan: tanE, other: tanS, min: 0 },
  ];
  const tints = [0.95, 1, 1, 1, 1.04];
  for (const S of sides) {
    const th = Math.atan(S.tan), run = S.across, slopeLen = R / Math.sin(th);
    const n = Math.max(2, Math.round(slopeLen / course)), cl = slopeLen / n;
    for (let k = 0; k < n; k++) {
      const s0 = k * cl, s1 = Math.min(slopeLen, (k + 1) * cl + 0.02);
      const lf0 = k === n - 1 ? 0 : lift;
      const q = (s) => s * Math.cos(th);
      const halfAt = (s) => Math.max(S.min, S.along - q(s) * S.tan / S.other);
      const pt = (t, s, lf) => {
        const h = halfAt(s) * t, dist = run - q(s);
        const px = S.nx === 0 ? h : S.nx * dist, pz = S.nx === 0 ? S.nz * dist : -h * S.nx;
        return V3(px + S.nx * Math.sin(th) * lf, y0 + s * Math.sin(th) + Math.cos(th) * lf, cz + pz + S.nz * Math.sin(th) * lf);
      };
      const lo = (t, s, lf) => pt(t, s, lf - thick);
      let cuts = [-1, 1];
      if (cut && S.nz === 1) {
        const zLo = cz + run - q(s0);
        if (zLo > cut.z - 0.05) {
          // cut at a constant x (= cut.half) on both edges of the course
          const c0 = Math.min(0.999, cut.half / Math.max(halfAt(s0), 1e-3)), c1 = Math.min(0.999, cut.half / Math.max(halfAt(s1), 1e-3));
          cuts = [[-1, -1], [-c0, -c1], null, [c0, c1], [1, 1]];
        }
      }
      if (cuts.length === 2) cuts = [[-1, -1], [1, 1]];
      for (let i = 0; i < cuts.length - 1; i++) {
        if (cuts[i] === null || cuts[i + 1] === null) continue;
        const [A0, A1] = cuts[i], [B0, B1] = cuts[i + 1];
        // split into tile patches 0.45-1.2 m long, each a tint step (weathered / replaced tiles, never a new hue)
        const wm = (B0 - A0) * halfAt(s0);
        const fs = [0];
        while (fs[fs.length - 1] < 1) { const f = fs[fs.length - 1] + (0.45 + r() * 0.75) / Math.max(wm, 1e-3); fs.push(1 - f < 0.35 / Math.max(wm, 1e-3) ? 1 : f); }
        for (let j = 0; j < fs.length - 1; j++) {
          const L = (u, v, f) => u + (v - u) * f;
          const ta0 = L(A0, B0, fs[j]), tb0 = L(A0, B0, fs[j + 1]), ta1 = L(A1, B1, fs[j]), tb1 = L(A1, B1, fs[j + 1]);
          const tint = tints[Math.floor(r() * tints.length)];
          b.hexa([lo(ta0, s0, lf0), lo(tb0, s0, lf0), pt(ta0, s0, lf0), pt(tb0, s0, lf0), lo(ta1, s1, 0), lo(tb1, s1, 0), pt(ta1, s1, 0), pt(tb1, s1, 0)],
            { tones: 'red', pattern: ROOF_PAT, tint });
        }
      }
    }
  }
  if (ridgeHalf > 0.05) b.box(2 * (ridgeHalf + 0.06), 0.14, 0.22, { tones: 'red', tint: 0.9, at: [0, ridge - 0.03, cz] });
  // hip capping: 4 straight strips over the course ends (the ends otherwise outline as a ragged staircase)
  {
    const thS = Math.atan(tanS), thE = Math.atan(tanE);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const A = V3(sx * W, y0, cz + sz * D), Bp = V3(sx * ridgeHalf, ridge, cz);
      const n = V3(sx * Math.sin(thE), Math.cos(thS) + Math.cos(thE), sz * Math.sin(thS)).normalize();
      hipCap(b, A.clone().addScaledVector(V3(sx * 0.0137, 0, sz * 0.0119), 1), Bp, n);
    }
  }
  return { y0, W, D, ridgeHalf, tanS };
}

/** Horizontal cylinder along z (bolts of cloth seen end-on), flat octagon edge on top. */
function boltZ(b, { at, r, len, tones, layer = 'solid' }) {
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  g.rotateY(Math.PI / 8); g.rotateX(Math.PI / 2);
  b.add(g, kit.M({ at }), { tones, layer });
  g.dispose();
}

/** Wooden spool: two flanges + a thread body (vertical). */
function spool(b, { at, r = 0.06, h = 0.16, thread }) {
  const [x, y, z] = at;
  b.cylinder(r * 1.4, r * 1.4, 0.035, { at: [x, y, z], tones: 'plank' });
  b.cylinder(r, r, h - 0.07, { at: [x, y + 0.035, z], tones: thread, layer: 'soft' });
  b.cylinder(r * 1.4, r * 1.4, 0.035, { at: [x, y + h - 0.035, z], tones: 'plank' });
}

/**
 * Four-panel dyer's-blue door leaf (my own kit.door variant: same {pivot, leaf, open} contract). Recessed field in
 * a deeper tone of the same paint, stiles / rails 1 texel proud, raised panels 1 more texel: three tones + outline
 * pairs, so it reads as a panelled door at 640x360 instead of a flat slab.
 */
function panelDoor(engine, { w, h, tones, deep, name }) {
  const b = new kit.Builder(engine, { name });
  const s = -1, cx = (s * w) / 2, thick = 0.05, fz = thick / 2;         // hinge right: leaf extends along -x
  b.box(w, h, thick, { tones: deep, at: [cx, 0, 0] });                                   // recessed field
  const st = 0.15, rp = 0.035;
  for (const x of [cx - w / 2 + st / 2, cx + w / 2 - st / 2]) b.box(st, h, rp, { tones, at: [x, 0, fz] });
  b.box(0.08, h, rp, { tones, at: [cx, 0, fz] });                                        // muntin
  for (const [y, hh] of [[0, 0.24], [0.98, 0.15], [h - 0.15, 0.15]]) b.box(w - 2 * st + 0.01, hh, rp, { tones, at: [cx, y, fz] });
  const pw = (w - 2 * st - 0.08) / 2 - 0.08;
  for (const [y0, y1] of [[0.24, 0.98], [1.13, h - 0.15]]) for (const sx of [-1, 1]) {
    b.box(pw, y1 - y0 - 0.1, 0.03, { tones, tint: 1.05, at: [cx + sx * (0.04 + 0.04 + pw / 2), y0 + 0.05, fz] });
  }
  for (const hy of [0.3, h - 0.4]) b.box(0.05, 0.16, 0.05, { tones: 'iron', at: [s * 0.015, hy, fz] });   // butt hinges
  b.box(0.07, 0.07, 0.06, { tones: 'brass', at: [s * (w - 0.1), h * 0.48, fz + 0.04] });                  // knob
  b.box(0.1, 0.035, 0.035, { tones: 'brass', at: [cx, 1.32 + 0.0123, fz + 0.04] });                         // knocker bar
  // receiveShadow off: the jetty's shadow-map terminator otherwise crosses the panels as a jagged staircase
  const leaf = b.build({ name, receiveShadow: false });
  const pivot = new THREE.Group(); pivot.name = `${name}-pivot`;
  pivot.add(leaf);
  leaf.position.z = -thick / 2;
  const open = (f) => { pivot.rotation.y = s * Math.max(0, Math.min(1, f)) * 1.75; };
  return { pivot, leaf, open };
}

/**
 * Capping strip along a hip line from eave corner A to ridge end B (local frame): covers the stepped course ends so
 * the outline pass draws one straight line. n = outward normal (average of the two slopes), raised to sit `proud`
 * above the course tops.
 */
function hipCap(b, A, B, n, { w = 0.09, lo = -0.04, hi = 0.15, tones = 'red', tint = 0.92 } = {}) {
  const d = B.clone().sub(A).normalize(), sv = new THREE.Vector3().crossVectors(d, n).normalize();
  const c = (P0, a, o) => P0.clone().addScaledVector(sv, a).addScaledVector(n, o);
  b.hexa([c(A, -w, lo), c(A, w, lo), c(A, -w, hi), c(A, w, hi), c(B, -w, lo), c(B, w, lo), c(B, -w, hi), c(B, w, hi)], { tones, tint });
}

export default function build(engine, ctx) {
  const rec = ctx.record, fr = kit.frameOf(rec);
  const seed = ctx.seed ?? 2;
  const indigo = paintRamp('#2a3a6a', { lightness: 0.32 });                   // v1 house-2.ts door + shutter paint (dyer's blue)
  const indigoDeep = paintRamp('#2a3a6a', { lightness: 0.24 });               // same paint, the door's recessed fields / curtains
  const b = new kit.Builder(engine, { name: rec.id });
  const lights = [], windows = [];

  // =============================================================================================== ground floor
  {
    // brick plinth course (sunk 0.06), open at the doorway (the door leaf and threshold stand at floor level)
    const pz = (GF.zf + GF.zb) / 2, pd = GF.zf - GF.zb + 0.1, X0 = -GF.x - 0.05, X1 = GF.x + 0.05, d0 = fr.doorX - 0.56, d1 = fr.doorX + 0.56;
    b.box(GF.x * 2 + 0.1, 0.3, pd - 0.5, { tones: 'brick', pattern: 'brick', at: [0, -0.06, pz - 0.25] });
    b.box(d0 - X0, 0.3, 0.5, { tones: 'brick', pattern: 'brick', at: [(X0 + d0) / 2, -0.06, GF.zf + 0.05 - 0.25] });
    b.box(X1 - d1, 0.3, 0.5, { tones: 'brick', pattern: 'brick', at: [(X1 + d1) / 2, -0.06, GF.zf + 0.05 - 0.25] });
  }
  b.box(GF.x * 2, GF.top, GF.zf - 0.34 - GF.zb, { tones: 'daub', pattern: 'ashlar', at: [0, 0, (GF.zf - 0.34 + GF.zb) / 2] });
  const DOOR = { x: fr.doorX, w: 1.0, h: 2.0 };
  const LOOM = { x: -1.4, w: 1.24, h: 0.8, y: 0.95 };
  const SHOP = { x: 1.42, w: 1.22, h: 0.62, y: 1.14 };
  kit.wallWithOpenings(b, {
    x0: -GF.x, x1: GF.x, y1: GF.top, z0: GF.zf, thick: 0.3, tones: 'daub', pattern: 'ashlar',
    openings: [{ x: DOOR.x, y: 0, w: DOOR.w, h: DOOR.h }, { x: LOOM.x, y: LOOM.y, w: LOOM.w, h: LOOM.h }, { x: SHOP.x, y: SHOP.y, w: SHOP.w, h: SHOP.h }],
  });
  const dw = kit.doorway(b, { at: [DOOR.x, 0, GF.zf], w: DOOR.w, h: DOOR.h, thick: 0.3, hood: 'lintel', frame: 'ashlar' });
  kit.steps(b, { at: [DOOR.x, 0, GF.zf], w: 1.24, count: 1, rise: 0.1, run: 0.3 });
  b.box(0.86, 0.04, 0.3, { tones: P.bannerRed, layer: 'soft', at: [DOOR.x, 0, 2.22] });          // woven mat (step + mat <= 0.4 m onto the door tile)
  for (const dz of [-0.1, 0.1]) b.box(0.86, 0.045, 0.05, { tones: P.bannerGold, layer: 'soft', at: [DOOR.x, 0, 2.22 + dz] });

  // loom window (left): recessed glass, the loom inside it silhouetted against the glow
  {
    const { x, w, h, y } = LOOM, zg = GF.zf - 0.16;
    const win = kit.window_(b, { at: [x, y + h / 2, GF.zf], w, h, panes: [1, 1], frame: 'timber', inset: 0.16, sill: false, bar: 0.06 });
    windows.push({ id: 'loom', local: win.glowPos });
    const zl = zg + 0.04;
    b.box(w - 0.12, 0.05, 0.03, { tones: 'timber', at: [x, y + h - 0.12, zl] });
    for (const s of [-1, 1]) b.box(0.05, h - 0.06, 0.03, { tones: 'timber', at: [x + s * (w / 2 - 0.09), y, zl] });
    for (let i = 0; i < 9; i++) b.box(0.034, 0.24, 0.02, { tones: P.ivory, at: [x - 0.4 + i * 0.1, y + 0.38, zl + 0.005] });
    [P.bannerRed, P.bannerGold, P.bannerBlue, P.bannerRed].forEach((c, j) => b.box(w - 0.24, 0.07, 0.025, { tones: c, at: [x, y + 0.31 - j * 0.07, zl + 0.008] }));
    b.box(w - 0.2, 0.04, 0.035, { tones: 'timber', at: [x, y + 0.37, zl + 0.012] });
    b.box(0.16, 0.035, 0.03, { tones: P.ivory, tint: 0.95, at: [x - 0.18, y + 0.52, zl + 0.02] });
    b.box(w + 0.3, 0.07, 0.18, { tones: 'ashlar', at: [x, y - 0.07, GF.zf + 0.05] });
  }
  // shop counter window (right)
  {
    const { x, w, h, y } = SHOP;
    const win = kit.window_(b, { at: [x, y + h / 2, GF.zf], w, h, panes: [3, 1], frame: 'timber', inset: 0.14, sill: false, bar: 0.06 });
    windows.push({ id: 'shop', local: win.glowPos });
    const cy = y - 0.1, cd = 0.36;
    b.box(w + 0.3, 0.07, cd, { tones: 'plank', pattern: 'boards', at: [x, cy, GF.zf + cd / 2] });
    for (const s of [-1, 1]) b.prism([[0, 0], [0.26, 0], [0, -0.26]], 0.06, { tones: 'timber', at: [x + s * (w / 2 + 0.05), cy, GF.zf], ry: -Math.PI / 2 });
    [P.bannerRed, P.bannerBlue, P.bannerGold, P.bannerGreen, P.flowerViolet]
      .forEach((c, k) => boltZ(b, { at: [x - 0.6 + 0.07 + k * 0.19, cy + 0.07 + 0.085, GF.zf + 0.19], r: 0.085, len: 0.28, tones: c }));
    spool(b, { at: [x + 0.43, cy + 0.07, GF.zf + 0.12], thread: P.ivory });
    spool(b, { at: [x + 0.58, cy + 0.07, GF.zf + 0.24], thread: P.bannerRed });
  }

  // jetty: floor beam, joist ends, carved brackets, yarn skeins, hanging lantern
  b.box(UF.x * 2 + 0.08, JET.y1 - JET.y0, UF.zf - GF.zf + 0.06, { tones: 'timber', at: [0, JET.y0, (UF.zf + GF.zf) / 2 + 0.03] });
  for (let x = -UF.x + 0.2; x < UF.x - 0.1; x += 0.36) b.box(0.1, 0.08, 0.06, { tones: 'timber', tint: 1.06, at: [x, JET.y0 + 0.02, UF.zf + 0.08] });
  const bracket = [[0, 0], [0.4, 0], [0.4, -0.07], [0.22, -0.12], [0.1, -0.24], [0.05, -0.4], [0, -0.42]];
  for (const bx of [-2.18, -1.08, 1.08, 2.18]) b.prism(bracket, 0.1, { tones: 'timber', at: [bx, JET.y0, GF.zf], ry: -Math.PI / 2 });
  {
    const x0 = 0.86, n = 6;
    b.box(1.5, 0.035, 0.035, { tones: 'iron', at: [x0 + 0.62, JET.y0 - 0.06, GF.zf + 0.3] });
    for (let k = 0; k < n; k++) {
      const len = k % 2 ? 0.34 : 0.28, x = x0 + k * 0.25;
      b.box(0.1, len, 0.05, { tones: YARN[k], layer: 'soft', at: [x, JET.y0 - 0.05 - len, GF.zf + 0.3] });
      b.box(0.06, 0.05, 0.05, { tones: YARN[k], layer: 'soft', tint: 0.94, at: [x, JET.y0 - 0.1 - len, GF.zf + 0.3] });
    }
  }
  // hanging lantern: its own small NO-SHADOW mesh (its shadow-map stair-steps landed on the indigo door)
  const lb = new kit.Builder(engine, { name: `${rec.id}-lantern` });
  {
    const lx = -0.8, lz = GF.zf + 0.27, top = JET.y0;
    lb.box(0.035, 0.26, 0.035, { tones: 'iron', at: [lx, top - 0.26, lz] });                          // chain
    lb.box(0.24, 0.05, 0.24, { tones: 'iron', at: [lx, top - 0.31, lz] });                            // cap
    b.box(0.16, 0.25, 0.16, { tones: 'glass', layer: 'glass', glow: P.lampGlow, glowKind: 2, at: [lx, top - 0.56, lz] });
    for (const s of [-1, 1]) lb.box(0.035, 0.25, 0.035, { tones: 'iron', at: [lx + s * 0.09, top - 0.56, lz + 0.09] });
    lb.box(0.2, 0.045, 0.2, { tones: 'iron', at: [lx, top - 0.6, lz] });                              // base
    // light anchor pulled toward the door axis and ~0.8 m out over the step (beyond the 0.45 m wall-hug band, so it
    // stays put): intensity 3.0 / reach 4 m (= the night pointReach clamp) so the toon pool saturates to the full warm
    // band on the step, mat, kerb and lane in front, with the dithered outer bands spilling onto the lane (at 1.4 /
    // 3.6 m only the facade warmed; the doorstep stayed lane blue-grey)
    lights.push({ pos: V3(-0.3, 1.35, GF.zf + 0.8), color: P.lampGlow, r: 4.0, intensity: 3.0, kind: 'lantern', flicker: true });
  }

  // =============================================================================================== upper floor
  b.box(UF.x * 2, UF.eave - UF.y0, UF.zf - UF.zb, { tones: 'plaster', pattern: 'plaster', at: [0, UF.y0, (UF.zf + UF.zb) / 2] });
  const RIB = { y0: 3.27, y1: 3.9 };
  const posts = [-UF.x + 0.06, -1.2, 0, 1.2, UF.x - 0.06];
  kit.timbers(b, { x0: -UF.x, x1: UF.x, y0: UF.y0, y1: RIB.y0, z: UF.zf, posts });
  kit.timbers(b, { x0: -UF.x, x1: UF.x, y0: RIB.y1, y1: UF.eave, z: UF.zf, posts: posts.filter((x) => x !== 0) });
  // close studding (~0.4 m bays) across the band under the loft gable: no empty cream panel between gable and ribbon
  kit.timbers(b, { x0: -UF.x, x1: UF.x, y0: RIB.y1 + 0.06, y1: UF.eave - 0.06, z: UF.zf, posts: [-0.8, -0.4, 0, 0.4, 0.8], size: 0.1 });
  kit.timbers(b, { x0: -UF.x, x1: UF.x, z: UF.zf, rails: [RIB.y0 - 0.06, RIB.y1 + 0.06, UF.eave - 0.06] });
  // ribbon window: kit.window_'s frame, but one glass pane per light so the night strip breaks into 3 lit clusters
  // (glow mid), drawn indigo curtains between them and dim end lights (glow sh) instead of one clipped band
  const rib = { center: V3(0, (RIB.y0 + RIB.y1) / 2, UF.zf) };
  {
    const w = UF.x * 2 - 0.12, h = RIB.y1 - RIB.y0, x = 0, y = rib.center.y, z = UF.zf, bar = 0.05, n = 15, pw = w / n;
    const fr = { tones: 'timber', pattern: 'none' }, fz = z + 0.025;
    b.box(w + bar * 2, bar, 0.05, { ...fr, at: [x, y + h / 2, fz] });
    b.box(w + bar * 2, bar, 0.05, { ...fr, at: [x, y - h / 2 - bar, fz] });
    for (const s of [-1, 1]) b.box(bar, h, 0.05, { ...fr, at: [x + s * (w / 2 + bar / 2), y - h / 2, fz] });
    for (let i = 1; i < n; i++) b.box(bar * 0.7, h, 0.03, { ...fr, at: [x - w / 2 + pw * i, y - h / 2, z + 0.02] });
    const CURTAIN = new Set([4, 5, 9, 10]), DIM = new Set([0, 14]);
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + pw * (i + 0.5);
      if (CURTAIN.has(i)) {
        b.box(pw + 0.01, h, 0.02, { tones: indigoDeep, pattern: 'vboards', scale: 0.35, at: [px, y - h / 2, z] });   // drawn curtain
        b.box(pw * 0.5, 0.06, 0.025, { tones: indigo, at: [px + (i === 4 || i === 9 ? 0.06 : -0.06), y - 0.12, z + 0.004] }); // tie-back
      } else {
        b.box(pw + 0.01, h, 0.02, { at: [px, y - h / 2, z], tones: 'glass', layer: 'glass', glow: DIM.has(i) ? P.glow[2] : P.glow[1] });
      }
    }
  }
  for (const x of [-1.6, 0, 1.6]) windows.push({ id: `ribbon${x}`, local: V3(x, rib.center.y, UF.zf + 0.3) });
  {
    const yA = UF.y0 + 0.0431, yB = RIB.y0 - 0.1223;              // odd offsets: no rasterisation ties on the diagonals
    const braces = [];
    for (let i = 0; i < 4; i++) {
      const a = posts[i], c = posts[i + 1], m = (a + c) / 2, i0 = a + 0.06, i1 = c - 0.06;
      for (const [p, q] of [[i0, m - 0.04], [m + 0.04, i1]]) braces.push([p, yA, q, yB], [p, yB, q, yA]);
      b.box(0.08, yB - yA, 0.06, { tones: 'timber', at: [m, yA, UF.zf + 0.01] });
    }
    kit.timbers(b, { x0: -UF.x, x1: UF.x, z: UF.zf, braces, size: 0.07, proud: 0.03 });
  }
  kit.flowerBox(b, { at: [-1.8, RIB.y0 - 0.02, UF.zf + 0.02], w: 0.9, seed: seed + 1 });
  kit.flowerBox(b, { at: [1.8, RIB.y0 - 0.02, UF.zf + 0.02], w: 0.9, seed: seed + 2, colors: [P.flowerWhite, P.flowerViolet, P.flowerRed] });
  for (const [ry, len, zf] of [[Math.PI / 2, UF.zf - UF.zb, UF.x], [-Math.PI / 2, UF.zf - UF.zb, UF.x], [Math.PI, UF.x * 2, (UF.zf - UF.zb) / 2]]) {
    b.push(kit.M({ at: [0, 0, (UF.zf + UF.zb) / 2], ry }));
    const h = len / 2;
    kit.timbers(b, { x0: -h, x1: h, y0: UF.y0, y1: UF.eave, z: zf, posts: [-h + 0.06, -h / 3, h / 3, h - 0.06], rails: [3.55, UF.eave - 0.06], braces: [[-h + 0.1, UF.y0 + 0.1, -h / 3 - 0.06, 3.5], [h - 0.1, UF.y0 + 0.1, h / 3 + 0.06, 3.5]] });
    kit.window_(b, { at: [0, 3.95, zf], w: 0.5, h: 0.5, panes: [2, 2], frame: 'cream', shutters: indigo, sill: true });
    b.pop();
  }
  b.push(kit.M({ ry: Math.PI }));                         // back: the dye-yard window (iso / turntables)
  kit.window_(b, { at: [0.9, 1.45, -GF.zb], w: 0.7, h: 0.62, panes: [2, 2], frame: 'cream', shutters: indigo, sill: true });
  b.pop();
  for (const ry of [Math.PI / 2, -Math.PI / 2]) {
    b.push(kit.M({ at: [0, 0, (GF.zf + GF.zb) / 2], ry }));
    kit.window_(b, { at: [0, 1.45, GF.x], w: 0.5, h: 0.62, panes: [2, 2], frame: 'cream', shutters: indigo, sill: true });
    b.pop();
  }

  // =============================================================================================== roofs
  const cz = (UF.zf + UF.zb) / 2, hz = (UF.zf - UF.zb) / 2;
  const roof = halfHipRoof(b, { cz, hx: UF.x, hz, eave: UF.eave, ridge: ROOF.ridge, ovS: ROOF.ovS, tanE: ROOF.tanE, seed, cut: { z: UF.zf, half: GAB.half - 0.01 } });
  // knee wall under the loft gable (its eave sits above the main eave courses: no valley gaps)
  b.box(GAB.half * 2, GAB.eave - UF.eave + 0.02, UF.zf - GAB.zBack, { tones: 'plaster', pattern: 'plaster', at: [0, UF.eave - 0.02, (UF.zf + GAB.zBack) / 2] });
  {
    const posts = [-GAB.half + 0.06, -0.94, -0.5, 0.5, 0.94, GAB.half - 0.06];   // symmetric, ~0.45 m bays (matches below)
    kit.timbers(b, { x0: -GAB.half, x1: GAB.half, y0: UF.eave - 0.02, y1: GAB.eave, z: UF.zf, posts, size: 0.1 });
  }
  kit.gableRoof(b, {
    x: 0, z: (UF.zf + GAB.zBack) / 2, w: UF.zf - GAB.zBack, d: GAB.half * 2, eave: GAB.eave, ridge: GAB.ridge, axis: 'z', kind: 'red',
    overhang: GAB.ov, gableOverhang: GAB.front, gable: 'plaster', gablePattern: 'plaster', seed: seed + 3,
  });
  {
    // bargeboards: one clean board per rake over the stepped course ends (v1 draws red-tile bargeboards)
    const tg = (GAB.ridge - GAB.eave) / GAB.half, th = Math.atan(tg), yE = GAB.eave - GAB.ov * tg, X = GAB.half + GAB.ov;
    const z0 = UF.zf + GAB.front - 0.0213, z1 = UF.zf + GAB.front + 0.0491;
    for (const sd of [-1, 1]) {
      const pA = [sd * X + 0.0019, yE + 0.0027], pB = [0.0019, GAB.ridge + 0.0027], nx = sd * Math.sin(th), ny = Math.cos(th);
      const c = (p, o, z) => V3(p[0] + nx * o, p[1] + ny * o, z);
      b.hexa([c(pA, -0.07, z0), c(pB, -0.07, z0), c(pA, 0.13, z0), c(pB, 0.13, z0), c(pA, -0.07, z1), c(pB, -0.07, z1), c(pA, 0.13, z1), c(pB, 0.13, z1)], { tones: 'red', tint: 0.96 });
    }
  }
  // gable face: king post, collar, loft door with open leaves, a bolt inside, finial; hoist beam + pulley
  const LD = { y0: 4.7, y1: 5.42, w: 0.62 };
  const by = GAB.ridge - 0.42, beamZ1 = UF.zf + 0.40;             // beam end 0.55 m past the footprint (§1 cap 0.6)
  {
    const z = UF.zf, gy = (y) => GAB.half * (GAB.ridge - y) / (GAB.ridge - GAB.eave);
    b.box(0.1, GAB.ridge - 0.3 - 5.72, 0.06, { tones: 'timber', at: [0, 5.72, z + 0.01] });
    b.box(gy(5.72) * 2 - 0.04, 0.1, 0.06, { tones: 'timber', at: [0, 5.62, z + 0.01] });
    const lw = kit.window_(b, { at: [0, (LD.y0 + LD.y1) / 2, z], w: LD.w, h: LD.y1 - LD.y0, panes: [1, 1], frame: 'timber', sill: false, bar: 0.06, glowKind: 2 });
    windows.push({ id: 'loft', local: lw.glowPos });
    b.box(LD.w + 0.2, 0.06, 0.2, { tones: 'timber', at: [0, LD.y0 - 0.12, z + 0.08] });
    b.box(0.42, 0.13, 0.12, { tones: P.bannerRed, at: [0.02, LD.y0 - 0.06, z + 0.04] });
    for (const s of [-1, 1]) b.box(0.3, LD.y1 - LD.y0, 0.04, { tones: indigo, pattern: 'vboards', scale: 0.5, at: [s * (LD.w / 2 + 0.06 + 0.17), LD.y0, z + 0.03] });
    b.box(0.07, 0.24, 0.07, { tones: 'timber', at: [0, GAB.ridge + 0.08, z + GAB.front - 0.06] });
    b.box(0.1, 0.1, 0.1, { tones: 'brass', at: [0, GAB.ridge + 0.32, z + GAB.front - 0.06] });
    b.box(0.15, 0.15, beamZ1 - z + 0.1, { tones: 'timber', at: [0, by, (z - 0.1 + beamZ1) / 2] });                // hoist beam
    b.box(0.1, 0.1, 0.1, { tones: 'iron', at: [0.1, by - 0.1, beamZ1 - 0.1] });                             // pulley block
  }
  const chim = kit.chimney(b, { at: [-1.55, -1.05], base: 3.6, top: 7.55, w: 0.56, d: 0.5, tones: 'brick', pattern: 'brick', pots: 2, potTones: 'red' });

  // =============================================================================================== the spool sign
  const SIGN = { ax: UF.x - 0.02, y: 3.0, z: GF.zf + 0.2, ex: 2.86 };
  {
    const { ax, y, z, ex } = SIGN;
    b.box(ex - ax + 0.04, 0.05, 0.05, { tones: 'iron', at: [(ax + ex) / 2, y, z] });
    b.hexa([V3(ax, y - 0.3, z - 0.025), V3(ax + 0.04, y - 0.3, z - 0.025), V3(ax, y, z - 0.025), V3(ax + 0.3, y, z - 0.025),
      V3(ax, y - 0.3, z + 0.025), V3(ax + 0.04, y - 0.3, z + 0.025), V3(ax, y, z + 0.025), V3(ax + 0.3, y, z + 0.025)], { tones: 'iron' });
    b.box(0.08, 0.06, 0.08, { tones: 'brass', at: [ex + 0.02, y - 0.005, z] });
    const sx = ex - 0.14, top = y - 0.14;
    for (const s of [-1, 1]) b.box(0.03, 0.14, 0.03, { tones: 'iron', at: [sx + s * 0.08, top, z] });
    b.cylinder(0.19, 0.19, 0.06, { at: [sx, top - 0.06, z], tones: 'plank' });
    b.cylinder(0.12, 0.12, 0.36, { at: [sx, top - 0.42, z], tones: P.bannerRed, layer: 'soft' });
    b.cylinder(0.19, 0.19, 0.06, { at: [sx, top - 0.48, z], tones: 'plank' });
    b.box(0.035, 0.2, 0.035, { tones: P.bannerRed, layer: 'soft', at: [sx + 0.1, top - 0.66, z + 0.1] });
  }

  // =============================================================================================== barrel + cat
  const CAT = { x: -2.9, z: 1.27, y: 0.76 };
  {
    const bx = -2.92, bz = 1.25, h = 0.74;
    b.cylinder(0.27, 0.27, h, { at: [bx, -0.02, bz], tones: 'plank', pattern: 'vboards', scale: 0.6 });
    for (const y of [0.12, 0.56]) b.cylinder(0.29, 0.29, 0.06, { at: [bx, y, bz], tones: 'iron' });
    b.cylinder(0.25, 0.25, 0.04, { at: [bx, h - 0.02, bz], tones: 'plank', tint: 1.05 });
    const { x: cx, y, z: czz } = CAT;
    b.box(0.2, 0.2, 0.22, { tones: 'iron', at: [cx, y, czz] });
    b.box(0.16, 0.13, 0.13, { tones: 'iron', at: [cx, y + 0.2, czz + 0.06] });
    for (const s of [-1, 1]) b.prism([[-0.035, 0], [0.035, 0], [0, 0.07]], 0.04, { tones: 'iron', at: [cx + s * 0.05 + 0.0023, y + 0.3317, czz + 0.06] });
    for (const s of [-1, 1]) b.box(0.035, 0.035, 0.02, { tones: P.bannerGold, at: [cx + s * 0.04, y + 0.27, czz + 0.13] });
    b.box(0.22, 0.05, 0.05, { tones: 'iron', at: [cx + 0.07, y, czz + 0.12] });
  }

  const group = b.build();
  group.add(lb.build({ castShadow: false, name: `${rec.id}-lantern` }));

  // door (animated by life / api)
  const d = panelDoor(engine, { w: DOOR.w, h: DOOR.h, tones: indigo, deep: indigoDeep, name: `${rec.id}-door` });
  d.pivot.position.copy(dw.hingeRight);
  group.add(d.pivot);

  // the bale of wool on the hoist rope (its own small mesh; sways in stepped poses)
  const hb = new kit.Builder(engine, { name: `${rec.id}-bale` });
  const rope = 0.32, BH = 0.3, BW = 0.38, BD = 0.3, y0b = -rope - 0.05 - BH;
  hb.box(0.035, rope, 0.035, { tones: 'thatch', tint: 0.95, at: [0, -rope, 0] });                // rope
  hb.box(0.09, 0.05, 0.09, { tones: 'iron', at: [0, -rope - 0.05, 0] });                         // hook
  hb.box(BW, BH, BD, { tones: 'thatch', tint: 0.96, layer: 'soft', at: [0, y0b, 0] });          // sacking bale
  hb.box(BW - 0.08, 0.04, BD - 0.06, { tones: 'thatch', tint: 1.04, layer: 'soft', at: [0, y0b + BH, 0] }); // pillowed top
  for (const x of [-0.1, 0.1]) {                                                                  // two rope lashings
    hb.box(0.045, BH + 0.02, BD + 0.03, { tones: 'timber', at: [x, y0b - 0.01, 0] });
    hb.box(0.045, 0.03, BD + 0.03, { tones: 'timber', at: [x, y0b + BH + 0.01, 0] });
  }
  hb.box(0.14, 0.07, 0.11, { tones: P.ivory, layer: 'soft', at: [0.03, y0b + BH + 0.03, 0.02] });   // wool tuft
  const load = new THREE.Group(); load.name = `${rec.id}-bale-pivot`;
  load.add(hb.build({ name: `${rec.id}-bale` }));
  load.position.set(0.16, by - 0.1, beamZ1 - 0.1);
  group.add(load);

  fr.apply(group);
  const W3 = (v) => toWorld(group, v);
  const wins = windows.map((w) => ({ id: `${rec.id}-${w.id}`, pos: W3(w.local) }));
  const swing = [0, 0.1, 0.17, 0.1, 0, -0.1, -0.17, -0.1];           // extremes ~3.5 texels at the bale (r ~0.6 m)

  return {
    group,
    update(t) { load.rotation.z = swing[Math.floor(Math.max(0, t) * 3) % swing.length]; },
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot: d.pivot, open: d.open }],
      chimneys: [W3(chim)],
      windows: wins,
      lights: [
        ...lights.map((l) => ({ ...l, pos: W3(l.pos) })),
        ...wins.map((w) => ({ pos: w.pos, color: P.glow[1], r: 1.6, kind: 'window' })),
      ],
      perches: [
        W3(V3(-roof.ridgeHalf, ROOF.ridge + 0.12, cz)), W3(V3(roof.ridgeHalf, ROOF.ridge + 0.12, cz)),
        W3(V3(chim.x, chim.y + 0.05, chim.z)), W3(V3(SIGN.ex - 0.1, SIGN.y + 0.04, SIGN.z)), W3(V3(0, by + 0.07, beamZ1 - 0.05)),
      ],
      spots: {
        doorstep: W3(V3(DOOR.x, 0, 2.3)), counter: W3(V3(SHOP.x, 0, 2.4)), cat: W3(V3(CAT.x, CAT.y, CAT.z)),
        bale: W3(V3(0.16, by - 0.8, beamZ1 - 0.1)),
      },
    },
    api: {
      setDoor: (f) => d.open(f),
      setLit: (on) => group.traverse((o) => o.userData.layer === 'glass' && kit.setGlowLit(o, on)),
    },
    stats: { weaver: 1 },
  };
}
