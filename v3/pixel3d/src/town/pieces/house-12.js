// house-12 — "Rookery House" (owner: house-12 agent). docs/TOWN.md §4 (piece API), §6 (scale rules).
//
// DESIGN NOTE
// Identity source: pipgws packages/assets/scripts/houses/house-12.ts (v1): a tall, narrow, CROOKED half-timbered
// townhouse - a stone ground floor carrying jettied timber storeys that oversail the street and lean a little
// further each floor, under a steep red-tiled gable with a rook weathervane; a leaded oriel bay, a leaning brick
// chimney with two clay pots, rooks on the ridge, ivy up the lit stone corner, door in the stone side wall.
// Lot: east-facing 4x5 (x 1..5, z 20..25), door tile (5, 24) = a lane tile; the GABLE END faces the camera (south).
// Signature shape at 640x360 (gameplay camera, yaw 0): a narrow steep red gable that visibly LEANS to the right
// (east) and STEPS OUT twice (stone -> close-studded timber storey -> jettied gable), black-and-ochre timbering,
// a glowing three-sided oriel on the first floor, an iron rook on the apex and two rooks on the ridge, a crooked
// chimney with a twig nest on the left slope.
// r6 (overview merge with house-13's rust hull): russet-brown tile ramp, a ridge break (the rear range stands 0.36 m
// taller behind a bargeboarded step), a west lucarne breaking the lit slope, ragged moss patches, a sooty chimney.
// Side-door readability (§6): the SE corner of the stone floor is CHAMFERED at 45 deg under the jetty's dragon-beam
// corner, so the oxblood door (with a wreath, persona) half-faces the camera and the door tile; a lantern hangs
// from the dragon-beam corner bracket right in front of it; doorstep + mat on the diagonal.
// Persona (layout): hood pent -> the oversailing jetty is the hood; door panel, hinge left; extras dormer (an east
// wall-dormer = the 'cross' gable), woodpile (logs end-on along the east wall + chopping block), wreath.
// Palette rows (TOWN.md §3): walls stone (rubble ground floor), ashlar (quoins, door surround, sills, step),
// daub (ochre infill), timber (beams, studs, brackets, bargeboards), roof red (tiles, oriel roof), brick (chimney),
// iron (vane, lantern, hinges, rooks = [iron mid, iron sh, iron sh]), cream sh (rook bills: the rook's bare grey
// face), brass (vane ball, door ring), glass / glow, leaf (ivy, wreath) + berry, trunk + thatch (logs, end grain,
// nest), shutters paintRamp(style.shutters '#3f5a3a'), door paintRamp(v1 sideDoor paint '#7a2a2a').
// Crookedness = two stacked shears about y (x += K1·(y - 2.38) above the stone floor, + K2·(y - 3.85) above the
// eave): the apex sits ~0.5 m (15 px) right of the gable base; vertical timbers become clean 1-px stair lines.
//
// Local frame: origin = footprint centre (3, 0, 22.5), axes WORLD-aligned (no rotation): +z = south (the gable the
// camera sees), +x = east (the door side).
import * as THREE from 'three';
import { Builder, M, NORMAL_RY, window_, setGlowLit } from '../kit.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { toWorld } from '../api.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = Math.PI / 4;

// ---------------------------------------------------------------- dimensions (metres, local)
// stone ground floor (chamfered SE corner)
const GX0 = -1.42, GX1 = 1.85, GZ0 = -2.32, GZ1 = 2.25, GH = 2.38;
const CHL = 0.95;                                   // chamfer legs
const CA = [GX1, GZ1 - CHL], CB = [GX1 - CHL, GZ1]; // chamfer corners (east wall end, front wall end)
const DC = [(CA[0] + CB[0]) / 2, (CA[1] + CB[1]) / 2]; // door centre on the chamfer (1.375, 1.775) = world (4.375, 24.275)
const DOOR_W = 0.9, DOOR_Y = 0.24, DOOR_H = 1.93, NOTCH = 0.95;
// first floor (jettied 0.2 on all sides)
const FX0 = -1.62, FX1 = 2.05, FZ0 = -2.45, FZ1 = 2.45, FB = 2.53, EAVE = 3.85, PLATE = 3.97;
// jettied gable + roof
const GZF = 2.65;                                   // gable wall front plane
const RIDGE = 6.45, XC = (FX0 + FX1) / 2, HALF = (FX1 - FX0) / 2;
const TANR = (RIDGE - PLATE) / HALF, TH = Math.atan(TANR);
const OVH = 0.28, RZF = GZF + 0.15, RZB = FZ0 - 0.25;
// east wall-dormer (the cross gable)
const DZ0 = -1.4, DZ1 = -0.05, DZC = (DZ0 + DZ1) / 2, DHW = (DZ1 - DZ0) / 2;
// oriel bay on the first-floor front
const OX = -0.3, OFW = 0.95, OD = 0.3, OB = FB, OT = 3.53;
// crookedness
const K1 = 0.05, K2 = 0.11;
// ridge break (r6, town critic: the long unbroken roof merged with house-13's rust hull at the overview): the older
// REAR range (z < CUT) stands DY taller than the jettied front range, so the ridge and both eaves step where the
// crooked storeys do; a daub chevron + bargeboard closes the step and faces the camera.
const CUT = -1.5, DY = 0.36;
// west lucarne (wall-dormer) on the lit west slope, in the front range
const LZ0 = 0.3, LZ1 = 1.3, LZC = (LZ0 + LZ1) / 2, LHW = (LZ1 - LZ0) / 2, LDF = 4.55, LTAN = 1.0;

// ---------------------------------------------------------------- ramps
const DOORP = paintRamp('#7a2a2a', { lightness: 0.32 });   // v1 sideDoor paint (oxblood)
// russet-brown tiles (r6): one step browner / less saturated than the shared 'red' so the Rookery no longer reads as
// one red building with house-13's rust hull; shadow stays cool slate-plum like the shared ramp.
const TILE = ['#C88A64', '#985C45', '#523A47'];
const TILE_OLD = ['#B4806A', '#855848', '#4C3A47'];         // the older rear range: weathered a little further
const SOOT_BRICK = ['#A06654', '#74463F', '#463444'];       // darker sooty brick: the chimney stands clear of the tiles
const ROOK = ['#46424F', '#2A2834', '#2A2834'];            // iron mid / sh: glossy black birds
const BILL = '#8A8692';                                     // cream sh: the rook's bare grey face
const ENDGRAIN = 'thatch';

function shear(terms) {
  let k = 0, c = 0;
  for (const [kk, y0] of terms) { k += kk; c -= kk * y0; }
  return new THREE.Matrix4().set(1, k, 0, c, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}
const SH1 = shear([[K1, GH]]), SH2 = shear([[K1, GH], [K2, EAVE]]);

/** Box between two points (a = size across in the up-ish direction, t = sideways). */
function beam(b, p0, p1, a, t, opts) {
  const d = p1.clone().sub(p0).normalize();
  const upRef = Math.abs(d.y) > 0.95 ? V3(1, 0, 0) : V3(0, 1, 0);
  const v = upRef.clone().sub(d.clone().multiplyScalar(upRef.dot(d))).normalize();
  const u = d.clone().cross(v).normalize();
  const c = [];
  for (let i = 0; i < 8; i++) {
    const base = i & 1 ? p1 : p0;
    c.push(base.clone().addScaledVector(v, (i & 2 ? 0.5 : -0.5) * a).addScaledVector(u, (i & 4 ? 0.5 : -0.5) * t));
  }
  return b.hexa(c, opts);
}

/** Vertical prism from an XZ outline [[x, z], ...] between y0 and y1. */
function slab(b, outline, y0, y1, opts) {
  const h = y1 - y0;
  b.prism(outline.map(([x, z]) => [x, -z]), h, { ...opts, rx: -Math.PI / 2, at: [0, y0 + h / 2, 0] });
}

/**
 * Stepped-course gable roof in a generic frame P(a, p, y) (a along the ridge, p across, y up). Each course's lower
 * edge is lifted `lift` (>= 2 texels: a continuous line + rim), no 1-px pattern (TOWN_LEARNINGS: dotted lines),
 * tile patches as tint steps. skip(side, k, a0, a1) drops course segments; cuts = forced split points along a.
 */
function courseRoof(b, o) {
  const { P, a0, a1, run, y0, th, sides = [1, -1], course = 0.44, lift = 0.066, thick = 0.085, tones = TILE, seed = 1,
    cuts = [], skip = null, ridgeCap = true, ridgeY, patch = [0.45, 0.75], tints = [0.95, 1, 1, 1.04], pattern = 'vboards', scale = 1.8 } = o;
  const r = rng(seed);
  const cosT = Math.cos(th), sinT = Math.sin(th);
  const L = run / cosT, n = Math.max(2, Math.round(L / course)), cl = L / n;
  for (const sd of sides) {
    for (let k = 0; k < n; k++) {
      const s0 = k * cl, s1 = Math.min(L, (k + 1) * cl + 0.02), lf0 = k === n - 1 ? 0 : lift;
      const bounds = [a0];
      while (bounds[bounds.length - 1] < a1 - 1e-6) {
        const cur = bounds[bounds.length - 1];
        let nx = Math.min(a1, cur + patch[0] + r() * patch[1]);
        if (a1 - nx < patch[0] * 0.6) nx = a1;
        bounds.push(nx);
      }
      const all = [...new Set([...bounds, ...cuts.filter((c) => c > a0 && c < a1)])].sort((x, y) => x - y);
      const pp = (s, lf) => sd * (run - s * cosT) + sd * sinT * lf, py = (s, lf) => y0 + s * sinT + cosT * lf;
      const top = (a, s, lf) => P(a, pp(s, lf), py(s, lf)), bot = (a, s, lf) => P(a, pp(s, lf - thick), py(s, lf - thick));
      for (let i = 0; i < all.length - 1; i++) {
        const sa = all[i], sb = all[i + 1];
        const tint = tints[Math.floor(r() * tints.length)];
        if (skip && skip(sd, k, sa, sb)) continue;
        b.hexa([bot(sa, s0, lf0), bot(sb, s0, lf0), top(sa, s0, lf0), top(sb, s0, lf0),
          bot(sa, s1, 0), bot(sb, s1, 0), top(sa, s1, 0), top(sb, s1, 0)], { tones, pattern, scale, tint });
      }
    }
  }
  if (ridgeCap) {
    const cw = 0.12, ry = ridgeY ?? (y0 + run * Math.tan(th));
    b.hexa([P(a0, -cw, ry - 0.03), P(a1, -cw, ry - 0.03), P(a0, -cw, ry + 0.12), P(a1, -cw, ry + 0.12),
      P(a0, cw, ry - 0.03), P(a1, cw, ry - 0.03), P(a0, cw, ry + 0.12), P(a1, cw, ry + 0.12)], { tones, pattern: 'none', tint: 0.88 });
  }
  return { L, n, cl, cosT, sinT };
}

/** Bargeboards on one gable end (a = aE, `out` = +1 if the end faces +a): one board per rake, cut at the apex. */
function barges(b, { P, aE, out, run, y0, th, tones = 'timber', lo = -0.075, hi = 0.135, t0 = -0.047, t1 = 0.031 }) {
  const cosT = Math.cos(th), sinT = Math.sin(th);
  for (const sd of [1, -1]) {
    const pt = (s, lf, a) => P(a, sd * (run - s * cosT) + sd * sinT * lf, y0 + s * sinT + cosT * lf);
    const sLo = (run + sinT * lo) / cosT, sHi = (run + sinT * hi) / cosT;   // where each edge reaches p = 0
    const aIn = aE + out * t0, aOut = aE + out * t1;
    b.hexa([pt(0, lo, aIn), pt(sLo, lo, aIn), pt(0, hi, aIn), pt(sHi, hi, aIn),
      pt(0, lo, aOut), pt(sLo, lo, aOut), pt(0, hi, aOut), pt(sHi, hi, aOut)], { tones, pattern: 'none' });
  }
}

/** A rook (feet at the origin, facing +x): glossy black body, grey bill, wedge tail. ~0.55 m bill to tail. */
const RS = 1.35;   // rook scale: at 1.0 the birds were ~15x7 texels smudges at the gameplay camera (critic r1)
function rookGeo(b, { sit = false } = {}) {
  b.push(M({ s: RS }));
  const o = { tones: ROOK, pattern: 'none' };
  const by = sit ? -0.04 : 0;
  if (!sit) for (const z of [-0.04, 0.04]) b.box(0.05, 0.08, 0.05, { ...o, at: [0.01, 0, z] });
  b.hexa([V3(-0.13, 0.08 + by, -0.05), V3(0.1, 0.06 + by, -0.075), V3(-0.13, 0.19 + by, -0.05), V3(0.1, 0.22 + by, -0.075),
    V3(-0.13, 0.08 + by, 0.05), V3(0.1, 0.06 + by, 0.075), V3(-0.13, 0.19 + by, 0.05), V3(0.1, 0.22 + by, 0.075)], o);
  b.box(0.11, 0.11, 0.1, { ...o, at: [0.14, 0.18 + by, 0] });
  b.hexa([V3(0.19, 0.2 + by, -0.035), V3(0.29, 0.215 + by, -0.012), V3(0.19, 0.27 + by, -0.035), V3(0.29, 0.235 + by, -0.012),
    V3(0.19, 0.2 + by, 0.035), V3(0.29, 0.215 + by, 0.012), V3(0.19, 0.27 + by, 0.035), V3(0.29, 0.235 + by, 0.012)], { tones: BILL, pattern: 'none' });
  b.hexa([V3(-0.28, 0.08 + by, -0.06), V3(-0.12, 0.12 + by, -0.045), V3(-0.28, 0.12 + by, -0.06), V3(-0.12, 0.18 + by, -0.045),
    V3(-0.28, 0.08 + by, 0.06), V3(-0.12, 0.12 + by, 0.045), V3(-0.28, 0.12 + by, 0.06), V3(-0.12, 0.18 + by, 0.045)], o);
  b.pop();
}

/** Leaded lights of the oriel: [y0, y1] of the lower and upper light (transom at 3.17). */
const LIGHTS = (gy) => [[gy + 0.03, 3.14], [3.2, OT - 0.03]];
/**
 * Diamond lead lattice in a light (centre cx, y0..y1, width w), in the current face frame (glass plane z = 0): two
 * families of 45 deg bars, clipped to the rectangle; cell diagonal CELL (~4 texels), lead 0.035 (~1 texel).
 */
const CELL = 0.2;
function lattice(b, cx, y0, y1, w) {
  const x0 = cx - w / 2, x1 = cx + w / 2, o = { tones: ROOK, pattern: 'none' };
  for (const m of [1, -1]) {
    // bar: y = yc + m * (x - cx); yc steps by CELL so the two families cross on a diamond grid
    for (let k = -12; k <= 12; k++) {
      const yc = (y0 + y1) / 2 + k * CELL;
      // x range where y0 <= y <= y1, intersected with [x0, x1]
      const xa0 = cx + (y0 - yc) / m, xb0 = cx + (y1 - yc) / m;
      const xa = Math.max(x0, Math.min(xa0, xb0)), xb = Math.min(x1, Math.max(xa0, xb0));
      if (xb - xa < 0.035) continue;
      const P0 = V3(xa + 0.0043, yc + m * (xa - cx) + 0.0061, 0.018), P1 = V3(xb + 0.0043, yc + m * (xb - cx) + 0.0061, 0.018);
      beam(b, P0, P1, 0.035, 0.012, o);
    }
  }
}

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export default function build(engine, ctx) {
  const rec = ctx.record;
  const SHUT = paintRamp(rec.style.shutters);
  const b = new Builder(engine, { name: rec.id });
  const windows = [];
  const TIM = { tones: 'timber', pattern: 'none' };
  const ASH = { tones: 'ashlar', pattern: 'none' };

  // ============================================================ stone ground floor
  const n = [Math.SQRT1_2, Math.SQRT1_2];                  // chamfer outward normal
  const along = [-Math.SQRT1_2, Math.SQRT1_2];             // chamfer direction CA -> CB
  const chamferAt = (t, d = 0) => [CA[0] + along[0] * t - n[0] * d, CA[1] + along[1] * t - n[1] * d];
  const CL = Math.hypot(CB[0] - CA[0], CB[1] - CA[1]);
  const tA = (CL - DOOR_W) / 2, tB = tA + DOOR_W;
  const outline = [[GX0, GZ0], [GX1, GZ0], CA, CB, [GX0, GZ1]];
  const notched = [[GX0, GZ0], [GX1, GZ0], CA, chamferAt(tA), chamferAt(tA, NOTCH), chamferAt(tB, NOTCH), chamferAt(tB), CB, [GX0, GZ1]];
  const STONE = { tones: 'stone', pattern: 'rubble' };
  slab(b, notched, 0.2, DOOR_Y + DOOR_H, STONE);
  slab(b, outline, DOOR_Y + DOOR_H, GH, STONE);
  // plinth course (0.04 proud) - the vestibule floor is its top
  const grow = 0.043;
  const plinth = [[GX0 - grow, GZ0 - grow], [GX1 + grow, GZ0 - grow], [GX1 + grow, CA[1] + grow * 0.414], [CB[0] + grow * 0.414, GZ1 + grow], [GX0 - grow, GZ1 + grow]];
  slab(b, plinth, -0.07, DOOR_Y, { tones: 'stone', pattern: 'ashlar', tint: 0.94 });
  // quoins (alternating long / short, 0.03 proud) on the SW and NE corners
  for (let i = 0; i < 7; i++) {
    const y = DOOR_Y + 0.02 + i * 0.3, h = 0.27, lng = i % 2 === 0;
    const tint = [1, 0.97, 1.03][i % 3];
    b.box(lng ? 0.42 : 0.24, h, lng ? 0.24 : 0.42, { ...ASH, tint, at: [GX0 - 0.031 + (lng ? 0.21 : 0.12), y, GZ1 + 0.031 - (lng ? 0.12 : 0.21)] });
    b.box(lng ? 0.24 : 0.42, h, lng ? 0.42 : 0.24, { ...ASH, tint, at: [GX1 + 0.031 - (lng ? 0.12 : 0.21), y, GZ0 - 0.031 + (lng ? 0.21 : 0.12)] });
  }

  // ---- the chamfered doorway (frame F: local +z = the chamfer's outward normal)
  b.push(M({ at: [DC[0], 0, DC[1]], ry: Q }));
  {
    // dressed jambs (alternating), a lintel + keystone
    for (let i = 0; i < 6; i++) {
      const w = i % 2 ? 0.13 : 0.19, y = DOOR_Y + i * 0.322;
      for (const s of [-1, 1]) b.box(w, 0.3, 0.07, { ...ASH, tint: [1, 0.96, 1.03][(i + (s > 0 ? 1 : 0)) % 3], at: [s * (DOOR_W / 2 + w / 2 - 0.005), y, 0.006] });
    }
    const hy = DOOR_Y + DOOR_H;
    b.box(DOOR_W + 0.3, 0.12, 0.08, { ...ASH, at: [0, hy, 0.012] });
    b.box(0.17, 0.2, 0.11, { ...ASH, tint: 1.04, at: [0, hy - 0.035, 0.024] });
    // vestibule back: dark hearth-lit interior (glows at night when the door is open)
    const IN = { tones: '#2A1A20', layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2 };
    b.box(DOOR_W, DOOR_H, 0.02, { ...IN, at: [0, DOOR_Y, -NOTCH + 0.03] });
    // the vestibule's side walls too: at yaw 0 the camera looks into the 45 deg doorway mostly at a side wall
    for (const s of [-1, 1]) b.box(0.02, DOOR_H, NOTCH - 0.22, { ...IN, at: [s * (DOOR_W / 2 - 0.02), DOOR_Y, -(NOTCH - 0.22) / 2 - 0.19] });
    // doorstep (rise 0.12, twice) + coir mat on the diagonal
    b.box(DOOR_W + 0.32, 0.12, 0.32, { ...ASH, tint: 0.97, at: [0, 0, 0.16] });
    b.box(0.74, 0.025, 0.34, { tones: 'thatch', pattern: 'none', tint: 0.95, at: [0, 0, 0.5] });
  }
  b.pop();

  // ---- ground-floor windows
  windows.push(window_(b, { at: [-0.33, 1.48, GZ1], w: 0.66, h: 0.74, panes: [3, 2], frame: 'ashlar', shutters: SHUT, sillTones: 'ashlar' }));
  {
    const fE = M({ at: [GX1, 0, -0.75], ry: NORMAL_RY['+x'] });
    b.push(fE);
    windows.push({ ...window_(b, { at: [0, 1.5, 0], w: 0.5, h: 0.62, panes: [2, 2], frame: 'ashlar', shutters: SHUT }), frame: fE });
    b.pop();
    const fW = M({ at: [GX0, 0, -0.4], ry: NORMAL_RY['-x'] });
    b.push(fW);
    windows.push({ ...window_(b, { at: [0, 1.5, 0], w: 0.46, h: 0.6, panes: [2, 2], frame: 'ashlar' }), frame: fW });
    b.pop();
  }

  // ---- ivy up the lit (south-west) stone corner: ONE dense mass of overlapping clumps on a jittered grid (a sparse
  // scatter read as a glyph), wider at the foot, climbing higher round the corner on the west face; soft layer.
  {
    const ir = rng(ctx.seed + 77);
    const IVY = { tones: 'leaf', layer: 'soft', pattern: 'none' };
    const clump = (u, y, face) => {
      const s = 0.12 + ir() * 0.06, d = 0.04 + ir() * 0.035, tint = [0.94, 1, 1, 1.05][Math.floor(ir() * 4)];
      if (face === 'front') b.box(s, s * 0.85, d, { ...IVY, tint, at: [GX0 + u, y, GZ1 + d / 2 + 0.01] });
      else b.box(d, s * 0.85, s, { ...IVY, tint, at: [GX0 - d / 2 - 0.01, y, GZ1 - u] });
    };
    // front: x within reach(y) of the corner; west: climbs to 2.1 m, 0.9 m round the corner at the foot
    for (let y = 0.2; y < 1.5; y += 0.085) for (let u = 0.02; u < 0.62; u += 0.085) {
      const reach = (y < 1.0 ? 0.62 - (y - 0.2) * 0.4 : 0.3 - (y - 1.0) * 0.3) + (ir() - 0.5) * 0.08;
      if (u < reach) clump(u + (ir() - 0.5) * 0.03, y + (ir() - 0.5) * 0.03, 'front');
    }
    for (let y = 0.2; y < 2.15; y += 0.085) for (let u = 0.03; u < 0.95; u += 0.085) {
      const reach = 0.9 - (y - 0.2) * 0.42 + (ir() - 0.5) * 0.12;
      if (u < reach) clump(u + (ir() - 0.5) * 0.03, y + (ir() - 0.5) * 0.03, 'west');
    }
  }

  // ---- woodpile (persona) along the east wall, logs end-on to the camera, + chopping block with an axe
  {
    const logG = new THREE.CylinderGeometry(0.095, 0.095, 1.05, 8, 1);
    logG.rotateY(Math.PI / 8);
    const capG = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 8, 1);
    capG.rotateY(Math.PI / 8);
    const rows = [[0, 3], [1, 3], [2, 2], [3, 1]];
    let i = 0;
    for (const [row, cnt] of rows) for (let k = 0; k < cnt; k++, i++) {
      const lx = 2.25 + (k - (cnt - 1) / 2) * 0.2, ly = 0.095 + row * 0.165;
      const lz = -0.42 + (hash(i + 3) - 0.5) * 0.06;
      b.add(logG, M({ at: [lx, ly, lz], rx: Math.PI / 2 }), { tones: 'trunk', tint: [1, 0.96, 1.04][i % 3] });
      b.add(capG, M({ at: [lx, ly, lz + 0.525 + 0.01], rx: Math.PI / 2 }), { tones: ENDGRAIN, tint: [1, 0.97, 1.03][(i + 1) % 3] });
    }
    logG.dispose(); capG.dispose();
    b.box(0.07, 0.72, 0.07, { ...TIM, at: [1.94, 0, 0.1] });
    b.box(0.07, 0.62, 0.07, { ...TIM, at: [2.56, 0, 0.1] });
    // an axe leant against the woodpile's front post
    beam(b, V3(2.62, 0.02, 0.2), V3(2.6, 0.62, 0.16), 0.05, 0.05, { tones: 'plank', pattern: 'none' });
    b.box(0.07, 0.15, 0.16, { tones: 'iron', at: [2.6, 0.5, 0.13] });
  }

  // ============================================================ first floor (jettied, leaning: shear 1)
  b.push(SH1);
  // jetty bressummer (floor beam all round), the floor's body, the wall plate
  b.box(FX1 - FX0 + 0.083, FB - GH, FZ1 - FZ0 + 0.081, { ...TIM, tint: 0.96, at: [XC, GH, 0] });
  b.box(FX1 - FX0, EAVE - FB, FZ1 - FZ0, { tones: 'daub', pattern: 'plaster', at: [XC, FB, 0] });
  b.box(FX1 - FX0 + 0.077, PLATE - EAVE, FZ1 - FZ0 + 0.073, { ...TIM, at: [XC, EAVE, 0] });
  // dragon-beam end at the SE corner (diagonal) + carved drop, over the chamfered door
  b.push(M({ at: [FX1 + 0.02, GH, FZ1 + 0.02], ry: Q }));
  b.box(0.16, 0.17, 0.36, { ...TIM, tint: 1.04, at: [0, -0.02, 0.02] });
  b.box(0.11, 0.2, 0.11, { ...TIM, at: [0, -0.21, 0.12] });
  b.box(0.06, 0.07, 0.06, { ...TIM, tint: 1.05, at: [0, -0.28, 0.12] });
  b.pop();
  // jetty brackets under the front and east bressummers (on the stone wall)
  const bracket = (x, zWall, zOut) => b.hexa([V3(x - 0.055, 1.96, zWall), V3(x + 0.055, 1.96, zWall), V3(x - 0.055, GH, zWall), V3(x + 0.055, GH, zWall),
    V3(x - 0.055, GH - 0.08, zOut), V3(x + 0.055, GH - 0.08, zOut), V3(x - 0.055, GH, zOut), V3(x + 0.055, GH, zOut)], TIM);
  for (const x of [-1.15, 0.45]) bracket(x, GZ1, FZ1 + 0.02);
  b.push(M({ ry: NORMAL_RY['+x'] }));                     // east wall frame: local x' = -z, z' = x
  for (const z of [-1.7, -0.1]) bracket(-z, GX1, FX1 + 0.02);
  b.pop();

  // close-studding + mid rail on every first-floor face (skip the oriel / windows)
  const studFace = (frame, x0, x1, holes) => {
    b.push(frame);
    const posts = [];
    for (let x = x0 + 0.05; x <= x1 - 0.2; x += 0.3) posts.push(x);
    posts.push(x1 - 0.05);
    for (const x of posts) {
      if (holes.some(([a, c]) => x > a - 0.06 && x < c + 0.06)) continue;
      b.box(0.095, EAVE - FB, 0.05, { ...TIM, at: [x, FB, 0.018] });
    }
    let xa = x0;
    for (const [a, c] of [...holes, [x1, x1]]) {
      if (a - xa > 0.1) b.box(a - xa, 0.09, 0.046, { ...TIM, tint: 0.97, at: [(xa + a) / 2, 3.15, 0.019] });
      xa = Math.max(xa, c);
    }
    b.pop();
  };
  const ORL = OX - OFW / 2 - OD, ORR = OX + OFW / 2 + OD;
  studFace(M({ at: [0, 0, FZ1] }), FX0, FX1, [[ORL - 0.02, ORR + 0.02]]);
  studFace(M({ at: [FX1, 0, 0], ry: NORMAL_RY['+x'] }), FZ0, FZ1, [[0.62, 1.13]]);       // east: local x = -z
  studFace(M({ at: [FX0, 0, 0], ry: NORMAL_RY['-x'] }), FZ0, FZ1, [[-0.25, 0.25]]);
  studFace(M({ at: [XC, 0, FZ0], ry: NORMAL_RY['-z'] }), -HALF, HALF, []);
  // side casements on the first floor
  {
    const fE = M({ at: [FX1, 0, -0.875], ry: NORMAL_RY['+x'] });
    b.push(fE);
    windows.push({ ...window_(b, { at: [0, 3.2, 0.03], w: 0.42, h: 0.5, panes: [2, 2], frame: 'cream', sill: false }), frame: SH1.clone().multiply(fE) });
    b.pop();
    const fW = M({ at: [FX0, 0, 0], ry: NORMAL_RY['-x'] });
    b.push(fW);
    windows.push({ ...window_(b, { at: [0, 3.2, 0.03], w: 0.4, h: 0.5, panes: [2, 2], frame: 'cream', sill: false }), frame: SH1.clone().multiply(fW) });
    b.pop();
  }

  // ---- the leaded oriel bay (three-sided), on a carved corbel, under a little tiled roof
  {
    const L = [ORL, FZ1], R2 = [ORR, FZ1], FL = [OX - OFW / 2, FZ1 + OD], FR = [OX + OFW / 2, FZ1 + OD];
    const plan = (y, g = 0) => [V3(L[0] - g, y, L[1]), V3(R2[0] + g, y, R2[1]), V3(FL[0] - g * 0.41, y, FL[1] + g), V3(FR[0] + g * 0.41, y, FR[1] + g)];
    const hex2 = (lo, hiP, opts) => b.hexa([lo[0], lo[1], hiP[0], hiP[1], lo[2], lo[3], hiP[2], hiP[3]], opts);
    // corbel: bay plan tapering down to a short line on the bressummer
    const cb = [V3(OX - 0.28, 2.16, FZ1 + 0.02), V3(OX + 0.28, 2.16, FZ1 + 0.02)];
    hex2([cb[0], cb[1], cb[0], cb[1]], plan(OB - 0.003, 0.03), TIM);
    // sill, glazing core (glows), head
    hex2(plan(OB, 0.045), plan(OB + 0.13, 0.045), { ...TIM, tint: 1.03 });
    hex2(plan(OB + 0.13), plan(OT), { tones: '#2A1A20', pattern: 'none' });
    hex2(plan(OT, 0.035), plan(OT + 0.09, 0.035), TIM);
    // mullions + transom on the front (proud of the glass)
    const gy = OB + 0.13, gh = OT - gy;
    b.push(M({ at: [OX, 0, FZ1 + OD] }));
    b.box(OFW, gh, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1, at: [0, gy, 0.0] });
    for (const x of [-OFW / 2 + 0.03, -OFW / 6, OFW / 6, OFW / 2 - 0.03]) b.box(0.065, gh, 0.05, { ...TIM, at: [x, gy, 0.012] });
    b.box(OFW, 0.055, 0.04, { ...TIM, at: [0, 3.17, 0.012] });
    // lead cames: a fine diamond lattice (1-texel lead, ~4-texel cells) in each light
    for (const cx of [-OFW / 3, 0, OFW / 3]) for (const [y0, y1] of LIGHTS(gy)) lattice(b, cx, y0, y1, OFW / 3 - 0.07);
    b.pop();
    for (const [side, P0, P1] of [[-1, L, FL], [1, FR, R2]]) {
      const mx = (P0[0] + P1[0]) / 2, mz = (P0[1] + P1[1]) / 2;
      b.push(M({ at: [mx, 0, mz], ry: side * Q }));
      const sw = OD * Math.SQRT2 - 0.06;
      // side panes glow one step dimmer (glow[2]) so the lead survives at night (critic r1: flat 'XX' slabs)
      b.box(sw + 0.04, gh, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[2], glowKind: 1, at: [0, gy, 0.0] });
      b.box(sw, 0.055, 0.04, { ...TIM, at: [0, 3.17, 0.012] });
      for (const [y0, y1] of LIGHTS(gy)) lattice(b, 0, y0, y1, sw - 0.04);
      b.pop();
    }
    // the little tiled roof, sloping back up to the gable bressummer
    const rb = OT + 0.09, rt = EAVE - 0.02;
    const back = [V3(L[0] - 0.07, rt, FZ1 - 0.01), V3(R2[0] + 0.07, rt, FZ1 - 0.01)];
    b.hexa([V3(L[0] - 0.07, rb, FZ1 - 0.01), V3(R2[0] + 0.07, rb, FZ1 - 0.01), back[0], back[1],
      V3(FL[0] - 0.08, rb - 0.02, FL[1] + 0.09), V3(FR[0] + 0.08, rb - 0.02, FR[1] + 0.09), back[0], back[1]], { tones: TILE, pattern: 'none', tint: 0.97 });
    windows.push({ glowPos: V3(OX, 3.05, FZ1 + OD + 0.3), frame: SH1 });
    // a rook perched on the oriel roof, facing east (profile to the camera)
    const oz = FZ1 + 0.22, oy = rt - (oz - FZ1 + 0.01) * (rt - rb + 0.02) / (OD + 0.1);
    b.push(M({ at: [OX + 0.22, oy, oz] }));
    rookGeo(b);
    b.pop();
  }
  b.pop();   // SH1

  // ============================================================ the jettied gable, roof, dormer, chimney (shear 2)
  b.push(SH2);
  // gable bressummer (front) + its brackets on the first-floor wall
  b.box(FX1 - FX0 + 0.13, PLATE + 0.02 - EAVE, GZF + 0.04 - (FZ1 - 0.003), { ...TIM, tint: 1.03, at: [XC, EAVE, (GZF + 0.04 + FZ1 - 0.003) / 2] });
  for (const x of [FX0 + 0.1, FX1 - 0.1]) b.hexa([V3(x - 0.05, EAVE - 0.34, FZ1), V3(x + 0.05, EAVE - 0.34, FZ1), V3(x - 0.05, EAVE, FZ1), V3(x + 0.05, EAVE, FZ1),
    V3(x - 0.05, EAVE - 0.06, GZF), V3(x + 0.05, EAVE - 0.06, GZF), V3(x - 0.05, EAVE, GZF), V3(x + 0.05, EAVE, GZF)], TIM);
  // gable triangles (front jettied, back flush): daub infill
  const GB = PLATE + 0.02, APX = RIDGE - 0.07;
  const tri = (zb, zf) => b.hexa([V3(FX0, GB, zb), V3(FX1, GB, zb), V3(XC, APX, zb), V3(XC, APX, zb),
    V3(FX0, GB, zf), V3(FX1, GB, zf), V3(XC, APX, zf), V3(XC, APX, zf)], { tones: 'daub', pattern: 'plaster' });
  tri(FZ1 - 0.05, GZF);
  // back gable belongs to the taller rear range: apex DY higher
  b.hexa([V3(FX0, GB, FZ0 - 0.02), V3(FX1, GB, FZ0 - 0.02), V3(XC, APX + DY, FZ0 - 0.02), V3(XC, APX + DY, FZ0 - 0.02),
    V3(FX0, GB, FZ0 + 0.3), V3(FX1, GB, FZ0 + 0.3), V3(XC, APX + DY, FZ0 + 0.3), V3(XC, APX + DY, FZ0 + 0.3)], { tones: 'daub', pattern: 'plaster' });
  // the step: a daub chevron closing the rear range's south end above the front roof (only the band above the front
  // tiles shows), knee walls + a raised wall plate along both eaves of the rear range
  b.hexa([V3(FX0 - OVH, PLATE + DY - OVH * TANR - 0.1, CUT - 0.22), V3(FX1 + OVH, PLATE + DY - OVH * TANR - 0.1, CUT - 0.22), V3(XC, APX + DY, CUT - 0.22), V3(XC, APX + DY, CUT - 0.22),
    V3(FX0 - OVH, PLATE + DY - OVH * TANR - 0.1, CUT + 0.02), V3(FX1 + OVH, PLATE + DY - OVH * TANR - 0.1, CUT + 0.02), V3(XC, APX + DY, CUT + 0.02), V3(XC, APX + DY, CUT + 0.02)], { tones: 'daub', pattern: 'plaster', tint: 0.97 });
  for (const x of [FX0 + 0.015, FX1 - 0.015]) {
    b.box(0.05, DY, CUT - FZ0, { tones: 'daub', pattern: 'plaster', at: [x, PLATE - 0.005, (CUT + FZ0) / 2] });
    b.box(0.1, 0.08, CUT - FZ0 + 0.06, { ...TIM, at: [x, PLATE + DY - 0.08, (CUT + FZ0) / 2] });
    for (const z of [FZ0 + 0.06, (CUT + FZ0) / 2, CUT - 0.04]) b.box(0.07, DY, 0.06, { ...TIM, at: [x, PLATE - 0.005, z] });
  }
  {
    // back gable: king post, collar and a small attic light (seen from the iso / turntable views)
    b.push(M({ at: [XC, 0, FZ0 - 0.02], ry: Math.PI }));
    const z = 0.018;
    b.box(0.09, APX + DY - 0.08 - GB, 0.05, { ...TIM, at: [0, GB, z] });
    const railY = 4.75, hw = (APX - railY) / TANR - 0.07;
    b.box(hw * 2, 0.085, 0.046, { ...TIM, tint: 0.97, at: [0, railY, z] });
    for (const s of [-1, 1]) beam(b, V3(s * 0.05 + 0.0037, railY + 0.08, z), V3(s * 0.7 + 0.0037, GB + 0.02, z), 0.08, 0.045, TIM);
    windows.push({ ...window_(b, { at: [0, 5.25, 0], w: 0.3, h: 0.34, panes: [1, 2], frame: 'cream', sill: false }), frame: SH2.clone().multiply(M({ at: [XC, 0, FZ0 - 0.02], ry: Math.PI })) });
    b.pop();
  }
  // gable timbering (front, proud 0.04): posts, rail, collar, king post, braces
  {
    const z = GZF + 0.018;
    const yAtX = (x) => APX - Math.abs(x - XC) * TANR - 0.06;     // under the rake
    const post = (x, y0, y1) => b.box(0.09, y1 - y0, 0.05, { ...TIM, at: [x, y0, z] });
    for (const dx of [-0.36, 0.36]) post(XC + dx, GB, yAtX(XC + dx));
    for (const dx of [-1.28, 1.28]) post(XC + dx, GB, yAtX(XC + dx));
    const railY = 4.78, hw = (APX - railY) / TANR - 0.07;
    b.box(hw * 2, 0.085, 0.046, { ...TIM, tint: 0.97, at: [XC, railY, z] });
    b.box(0.72, 0.08, 0.046, { ...TIM, tint: 0.97, at: [XC, 5.5, z] });
    post(XC, 5.58, yAtX(XC));
    for (const s of [-1, 1]) beam(b, V3(XC + s * 0.41 + 0.0031, 5.31, z + 0.003), V3(XC + s * 0.9 + 0.0031, railY + 0.1, z + 0.003), 0.08, 0.045, TIM);
    // two small casements in the lower outer panels
    for (const s of [-1, 1]) windows.push({ ...window_(b, { at: [XC + s * 0.82, 4.4, GZF], w: 0.32, h: 0.42, panes: [1, 2], frame: 'cream', sill: true, sillTones: 'timber' }), frame: SH2 });
    // the pointed attic lancet
    const lw = 0.38, ly0 = 4.9, lh = 0.45;
    b.box(lw, lh, 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1, at: [XC, ly0, GZF + 0.005] });
    b.prism([[-lw / 2, 0], [lw / 2, 0], [0, 0.22]], 0.02, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1, at: [XC, ly0 + lh, GZF + 0.005] });
    b.box(0.06, lh + 0.12, 0.04, { tones: 'cream', pattern: 'none', at: [XC, ly0, GZF + 0.02] });
    for (const s of [-1, 1]) {
      b.box(0.06, lh, 0.045, { tones: 'cream', pattern: 'none', at: [XC + s * (lw / 2 + 0.03), ly0, GZF + 0.02] });
      beam(b, V3(XC + s * (lw / 2 + 0.03), ly0 + lh, GZF + 0.02), V3(XC + 0.0043, ly0 + lh + 0.27, GZF + 0.02), 0.06, 0.045, { tones: 'cream', pattern: 'none' });
    }
    b.box(lw + 0.14, 0.06, 0.12, { tones: 'cream', pattern: 'none', at: [XC, ly0 - 0.06, GZF + 0.04] });
    windows.push({ glowPos: V3(XC, ly0 + 0.3, GZF + 0.3), frame: SH2 });
  }

  // ---- east wall-dormer: a SHED (cat-slide) dormer on the first-floor east wall. r1 had a little gabled dormer whose
  // lit south slope was cut into pale shards by the shadowed main slope in front of it at yaw 0; a shed roof faces
  // east like the slope it sits on, so it shades with it and only its eave line + the window face read.
  {
    const DX0 = 1.0, DX1 = FX1, DF = 4.75, tanS = 0.45, thS = Math.atan(tanS), OV = 0.2;
    const XS = 1.05;                                          // top of the shed, just inside the main-roof plane
    const shedY = (x) => DF + (DX1 - x) * tanS;
    const yU = shedY(XS) - 0.05;
    // body = one tile-hung (red) pentagon prism whose south / north faces ARE the cheeks; the daub infill is only a
    // thin plate on the east face. (r2 lesson: a daub body's south face rose above the main slope into its cast
    // shadow and read as a flat daub-shadow grey triangle.)
    b.prism([[DX0, EAVE], [DX1 - 0.02, EAVE], [DX1 - 0.02, DF], [XS, yU], [DX0, yU]], DZ1 - DZ0, { tones: TILE, pattern: 'none', tint: 0.92, at: [0, 0, DZC] });
    b.box(0.03, DF - PLATE, DZ1 - DZ0 - 0.02, { tones: 'daub', pattern: 'plaster', at: [DX1 - 0.005, PLATE, DZC] });
    const fD = M({ at: [DX1, 0, DZC], ry: NORMAL_RY['+x'] });
    b.push(fD);
    for (const x of [-DHW + 0.05, DHW - 0.05]) b.box(0.09, DF - PLATE, 0.05, { ...TIM, at: [x, PLATE, 0.018] });
    b.box(DHW * 2 + 0.04, 0.08, 0.05, { ...TIM, at: [0, DF - 0.08, 0.02] });
    windows.push({ ...window_(b, { at: [0, 4.38, 0.03], w: 0.4, h: 0.4, panes: [2, 2], frame: 'cream', sill: false }), frame: SH2.clone().multiply(fD) });
    b.pop();
    const xE = DX1 + OV, PS = (a, p, y) => V3(XS + p, y, a);
    courseRoof(b, { P: PS, a0: DZ0 - 0.13, a1: DZ1 + 0.13, run: xE - XS, y0: shedY(xE), th: thS, sides: [1], course: 0.3,
      seed: ctx.seed + 5, ridgeCap: false, pattern: 'none', patch: [0.3, 0.4], tints: [0.94, 1, 1.03], tones: TILE });
  }

  // ---- main roof: steep russet tiles, ridge along z, in TWO ranges (r6 ridge break): the jettied front range
  // (CUT..RZF) and the older rear range (RZB..CUT) standing DY taller. Bargeboards on both gables and on the step.
  const PM = (a, p, y) => V3(XC + p, y, a);
  const runM = HALF + OVH, y0M = PLATE - OVH * TANR;
  const LMEET = XC - (RIDGE - (LDF + LHW * LTAN)) / TANR;     // where the lucarne ridge meets the west slope
  courseRoof(b, {
    P: PM, a0: CUT, a1: RZF, run: runM, y0: y0M, th: TH, course: 0.44, seed: ctx.seed + 1,
    cuts: [DZ0 - 0.02, DZ1 + 0.02, LZ0 - 0.02, LZ1 + 0.02], patch: [0.26, 0.34], tints: [0.93, 0.97, 1, 1, 1.03, 1.06],
    // no per-tile joint pattern: the vboards stagger read as a regular diagonal dash hatch at 1x (critic r1). The
    // course steps (2-texel lift + rim) and the tint patches carry the tiles.
    pattern: 'none',
    // the eave course in front of each dormer face is cut away (the dormers break the eave)
    skip: (sd, k, a0, a1) => k === 0 && ((sd === 1 && a1 > DZ0 - 0.021 && a0 < DZ1 + 0.021) || (sd === -1 && a1 > LZ0 - 0.021 && a0 < LZ1 + 0.021)),
    ridgeY: RIDGE,
  });
  courseRoof(b, {
    P: PM, a0: RZB, a1: CUT + 0.04, run: runM, y0: y0M + DY, th: TH, course: 0.44, seed: ctx.seed + 2, tones: TILE_OLD,
    patch: [0.26, 0.3], tints: [0.92, 0.96, 1, 1.03], pattern: 'none', ridgeY: RIDGE + DY,
  });
  barges(b, { P: PM, aE: RZF, out: 1, run: runM, y0: y0M, th: TH });
  barges(b, { P: PM, aE: RZB, out: -1, run: runM, y0: y0M + DY, th: TH });
  barges(b, { P: PM, aE: CUT + 0.04, out: 1, run: runM, y0: y0M + DY, th: TH });
  // a small finial on the step apex
  b.box(0.09, 0.3, 0.09, { ...TIM, tint: 1.04, at: [XC, RIDGE + DY - 0.02, CUT + 0.06] });

  // ---- west lucarne: a gabled wall-dormer breaking the lit west slope (and its eave) in the front range. Body
  // tile-hung like the east dormer (a daub body reads as a flat shadow triangle above the slope: r2 lesson), a daub
  // face plate with a cream casement, a little stepped gable roof with bargeboards and a tiny finial.
  {
    const DR = LDF + LHW * LTAN, thL = Math.atan(LTAN), OV = 0.12;
    const xF = FX0 - 0.02, len = LMEET + 0.1 - xF;
    b.prism([[-LZ0, EAVE], [-LZ1, EAVE], [-LZ1, LDF], [-LZC, DR - 0.04], [-LZ0, LDF]], len, { tones: TILE, pattern: 'none', tint: 0.92, ry: Math.PI / 2, at: [xF + len / 2, 0, 0] });
    b.prism([[-LZ0 + 0.02, PLATE], [-LZ1 - 0.02, PLATE], [-LZ1 - 0.02, LDF], [-LZC, DR - 0.05], [-LZ0 + 0.02, LDF]], 0.03, { tones: 'daub', pattern: 'plaster', ry: Math.PI / 2, at: [xF - 0.01, 0, 0] });
    const fL = M({ at: [xF - 0.025, 0, LZC], ry: NORMAL_RY['-x'] });
    b.push(fL);
    for (const x of [-LHW + 0.05, LHW - 0.05]) b.box(0.09, LDF - PLATE, 0.05, { ...TIM, at: [x, PLATE, 0.018] });
    b.box(LHW * 2 + 0.04, 0.08, 0.05, { ...TIM, at: [0, LDF - 0.08, 0.02] });
    windows.push({ ...window_(b, { at: [0, 4.05, 0.03], w: 0.4, h: 0.4, panes: [2, 2], frame: 'cream', sill: false }), frame: SH2.clone().multiply(fL) });
    b.pop();
    const PL = (a, p, y) => V3(a, y, LZC + p);
    const runL = LHW + OV;
    courseRoof(b, { P: PL, a0: xF - 0.16, a1: LMEET + 0.12, run: runL, y0: DR - runL * LTAN, th: thL, course: 0.26, seed: ctx.seed + 7,
      pattern: 'none', patch: [0.25, 0.3], tints: [0.95, 1, 1.04], ridgeY: DR });
    barges(b, { P: PL, aE: xF - 0.16, out: -1, run: runL, y0: DR - runL * LTAN, th: thL });
    b.box(0.08, 0.26, 0.08, { ...TIM, tint: 1.04, at: [xF - 0.16, DR - 0.02, LZC] });
  }

  // ---- moss: soft clumps lying in the tile courses (thicker on the old rear range and along the west eave + the
  // lucarne valley), so the lit west slope is no longer one flat field at the overview
  {
    const mr = rng(ctx.seed + 31);
    const cosT = Math.cos(TH), sinT = Math.sin(TH), Ls = runM / cosT;
    const clump = (sd, a, s, w, l, y0, lo, hi, opts) => {
      const pt = (aa, ss, lf) => PM(aa, sd * (runM - ss * cosT) + sd * sinT * lf, y0 + ss * sinT + cosT * lf);
      const s0 = Math.max(0.02, s - l / 2), s1 = Math.min(Ls - 0.15, s + l / 2);
      b.hexa([pt(a - w / 2, s0, lo), pt(a + w / 2, s0, lo), pt(a - w / 2, s0, hi), pt(a + w / 2, s0, hi),
        pt(a - w / 2, s1, lo), pt(a + w / 2, s1, lo), pt(a - w / 2, s1, hi), pt(a + w / 2, s1, hi)], opts);
    };
    // a patch = a few overlapping dark-moss cushions + one or two bright tufts on top (one mass, not a dot scatter)
    const patch = (sd, a, ss, size, rear) => {
      const y0 = y0M + (rear ? DY : 0);
      // many small cushions scattered in an ellipse: a ragged-edged mass, not one rectangle sticker
      const k = Math.round(5 + size * 8);
      for (let i = 0; i < k; i++) {
        const ang = mr() * Math.PI * 2, rr = Math.sqrt(mr()) * size * 0.5;
        const w = 0.1 + mr() * 0.12 + size * 0.1;
        const raw = a + Math.cos(ang) * rr;
        // stay on this range's tiles (a cushion over the ridge step would float)
        const ac = rear ? Math.min(CUT - 0.04 - w / 2, Math.max(RZB + 0.05 + w / 2, raw)) : Math.max(CUT + 0.06 + w / 2, Math.min(RZF - 0.1 - w / 2, raw));
        clump(sd, ac, ss + Math.sin(ang) * rr * 0.75, w, 0.08 + mr() * 0.1 + size * 0.06, y0, 0.01, 0.07 + mr() * 0.03,
          { tones: 'moss', layer: 'soft', pattern: 'none', tint: [0.94, 1, 1, 1.05][Math.floor(mr() * 4)] });
      }
      for (let i = 0; i < 1 + (size > 0.55 ? 1 : 0); i++)
        clump(sd, a + (mr() - 0.5) * size * 0.4, ss + (mr() - 0.3) * size * 0.25, 0.1 + size * 0.12, 0.08 + size * 0.06, y0, 0.05, 0.12,
          { tones: 'mossTuft', layer: 'soft', pattern: 'none' });
    };
    // [side, a (along the ridge), s (up the slope from the eave), size, rear?]
    for (const [sd, a, ss, size, rear] of [
      [-1, -2.2, 0.55, 0.95, true], [-1, -1.8, 1.7, 0.7, true], [-1, -2.45, 2.7, 0.45, true],
      [1, -2.1, 0.6, 0.8, true], [1, -1.8, 1.9, 0.5, true],
      [-1, -0.75, 0.4, 0.85, false], [-1, -0.2, 1.25, 0.5, false], [-1, 2.25, 0.35, 0.6, false], [-1, 0.8, 2.0, 0.55, false],
      [1, 1.5, 0.45, 0.6, false], [-1, 1.8, 2.6, 0.4, false],
    ]) patch(sd, a, ss, size, rear);
  }
  // apex finial + drop on the front gable (the vane stands on it)
  b.box(0.1, 0.42, 0.1, { ...TIM, tint: 1.04, at: [XC, RIDGE - 0.02, RZF] });
  b.box(0.08, 0.3, 0.08, { ...TIM, at: [XC, RIDGE - 0.36, RZF] });
  b.box(0.14, 0.05, 0.14, { ...TIM, tint: 0.95, at: [XC, RIDGE + 0.4, RZF] });

  // ---- the leaning brick chimney on the west (left) slope, two clay pots, a rooks' twig nest and a rook on a pot.
  // Placed far back + low on the slope and leaning OUT (west, against the house's eastward shear) so its upper half
  // stands clear above the roof silhouette at the gameplay camera; it used to lie along the slope as a brick band.
  const CHX = -1.12, CHZ = -2.02, CHB = 4.35, CHH = 2.6, CHW = 0.72, CHD = 0.62;
  const chimL = M({ at: [CHX, CHB, CHZ], rz: 0.2 });
  const chimM = SH2.clone().multiply(chimL);
  b.push(chimL);
  b.box(CHW, CHH, CHD, { tones: SOOT_BRICK, pattern: 'brick' });
  b.box(CHW + 0.14, 0.12, CHD + 0.14, { tones: 'ashlar', pattern: 'none', at: [0, CHH, 0] });
  b.box(CHW + 0.06, 0.08, CHD + 0.06, { tones: 'ashlar', pattern: 'none', tint: 0.95, at: [0, CHH - 0.55, 0] });
  b.cylinder(0.1, 0.085, 0.28, { segments: 8, at: [-0.19, CHH + 0.12, 0.14], tones: 'red' });
  b.cylinder(0.09, 0.075, 0.38, { segments: 8, at: [-0.17, CHH + 0.12, -0.14], tones: 'red', tint: 0.95 });
  {
    // nest: a squat twig bowl + sticks at 45 deg stops (soft: no cream rims)
    const NX = 0.2, NY = CHH + 0.12;
    b.cylinder(0.2, 0.25, 0.14, { segments: 8, at: [NX, NY, 0.0], tones: 'trunk', layer: 'soft' });
    const nr = rng(ctx.seed + 9);
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI) / 4 + (i > 7 ? Q / 2 : 0);
      const r0 = 0.17 + nr() * 0.05;
      b.box(0.24, 0.05, 0.05, { tones: i % 2 ? 'trunk' : 'timber', layer: 'soft', origin: 'center', at: [NX + Math.cos(a) * r0, NY + 0.09 + nr() * 0.04, Math.sin(a) * r0], ry: a + Math.PI / 2 });
    }
    // the sitting rook in the nest, facing east; a second rook stands on the tall pot, facing west (both static)
    b.push(M({ at: [NX - 0.02, NY + 0.1, 0], rz: -0.2 }));
    rookGeo(b, { sit: true });
    b.pop();
    b.push(M({ at: [-0.17, CHH + 0.12 + 0.38, -0.14], rz: -0.2, ry: Math.PI }));
    rookGeo(b);
    b.pop();
  }
  b.pop();
  const smokeLocal = V3(-0.19, CHH + 0.12 + 0.28, 0.14).applyMatrix4(chimM);
  b.pop();   // SH2

  // ============================================================ the hanging door lantern (dragon-beam corner bracket)
  // hung from the east jetty ~0.35 m north of the chamfer corner so it FLANKS the door (it used to hang dead centre
  // in front of the door panel at yaw 45)
  const LX = FX1 + 0.3, LZ = CA[1] - 0.04, LY = 2.3;
  beam(b, V3(GX1 + 0.02, LY + 0.045, LZ), V3(LX + 0.03, LY + 0.045, LZ), 0.05, 0.05, { tones: 'iron', pattern: 'none' });
  beam(b, V3(GX1 + 0.02, LY - 0.32, LZ), V3(GX1 + 0.3, LY + 0.02, LZ), 0.045, 0.045, { tones: 'iron', pattern: 'none' });
  b.box(0.04, 0.12, 0.04, { tones: 'iron', at: [LX, LY - 0.1, LZ] });
  b.hexa([V3(LX - 0.11, LY - 0.19, LZ - 0.11), V3(LX + 0.11, LY - 0.19, LZ - 0.11), V3(LX - 0.03, LY - 0.09, LZ - 0.03), V3(LX + 0.03, LY - 0.09, LZ - 0.03),
    V3(LX - 0.11, LY - 0.19, LZ + 0.11), V3(LX + 0.11, LY - 0.19, LZ + 0.11), V3(LX - 0.03, LY - 0.09, LZ + 0.03), V3(LX + 0.03, LY - 0.09, LZ + 0.03)], { tones: 'iron' });
  b.box(0.14, 0.2, 0.14, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [LX, LY - 0.4, LZ] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.035, 0.21, 0.035, { tones: 'iron', at: [LX + sx * 0.07, LY - 0.405, LZ + sz * 0.07] });
  b.box(0.18, 0.04, 0.18, { tones: 'iron', at: [LX, LY - 0.44, LZ] });
  const lampPos = V3(LX, LY - 0.3, LZ);

  const group = b.build({ name: rec.id });

  // ============================================================ the door leaf (own mesh): oxblood panels + wreath
  const db = new Builder(engine, { name: `${rec.id}-door` });
  {
    const w = DOOR_W - 0.02, h = DOOR_H - 0.01, th = 0.06, cx = w / 2;
    db.box(w, h, th, { tones: DOORP, pattern: 'none', at: [cx, 0, 0] });
    for (const py of [0.2, 1.05]) for (const px of [-0.2, 0.2]) db.box(w * 0.32, 0.68, 0.03, { tones: DOORP, tint: 1.05, at: [cx + px * w, py, th / 2] });
    for (const hy of [0.32, h - 0.42]) db.box(w * 0.55, 0.05, 0.03, { tones: 'iron', at: [w * 0.27, hy, th / 2 + 0.01] });
    db.box(0.07, 0.07, 0.05, { tones: 'brass', at: [w - 0.13, h * 0.47, th / 2 + 0.02] });
    // wreath: ring of leaf clumps with berries and a red bow
    const wc = [cx, 1.42], wr = 0.15;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      db.box(0.09, 0.09, 0.05, { tones: 'leaf', tint: [1, 0.95, 1.04][i % 3], at: [wc[0] + Math.cos(a) * wr, wc[1] + Math.sin(a) * wr - 0.045, th / 2 + 0.03] });
    }
    for (const a of [0.6, 2.4, 3.9, 5.3]) db.box(0.05, 0.05, 0.04, { tones: TOWN_PALETTE.berry, at: [wc[0] + Math.cos(a) * wr, wc[1] + Math.sin(a) * wr - 0.025, th / 2 + 0.06] });
    db.box(0.12, 0.07, 0.04, { tones: TOWN_PALETTE.flowerRed, at: [wc[0], wc[1] - wr - 0.07, th / 2 + 0.06] });
  }
  const leaf = db.build({ name: `${rec.id}-door` });
  leaf.position.z = -0.03;
  const pivot = new THREE.Group(); pivot.name = `${rec.id}-door-pivot`;
  pivot.add(leaf);
  const holder = new THREE.Group(); holder.name = `${rec.id}-door-frame`;
  holder.position.set(DC[0], 0, DC[1]);
  holder.rotation.y = Q;
  pivot.position.set(-DOOR_W / 2 + 0.01, DOOR_Y + 0.005, -0.1);
  holder.add(pivot);
  group.add(holder);
  const openDoor = (f) => { pivot.rotation.y = Math.max(0, Math.min(1, f)) * 1.75; };

  // ============================================================ rooks on the ridge + the rook weathervane (own meshes)
  const shUp = (v) => v.clone().applyMatrix4(SH2);
  const mkRook = (name) => { const rb = new Builder(engine, { name }); rookGeo(rb); const g = rb.build({ name }); const p = new THREE.Group(); p.name = `${name}-pivot`; p.add(g); return p; };
  const rookA = mkRook(`${rec.id}-rook-a`), rookB = mkRook(`${rec.id}-rook-b`);
  const rookAt = [shUp(V3(XC, RIDGE + 0.12, 1.05)), shUp(V3(XC, RIDGE + 0.12, -1.05))];
  rookA.position.copy(rookAt[0]); rookB.position.copy(rookAt[1]);
  group.add(rookA, rookB);
  // vane: iron rod + compass arms on the finial, a flat iron rook that turns in the wind
  const vb = new Builder(engine, { name: `${rec.id}-vane` });
  {
    vb.box(0.045, 0.62, 0.045, { tones: 'iron', at: [0, -0.62, 0] });
    vb.box(0.4, 0.04, 0.04, { tones: 'iron', at: [0, -0.36, 0] });
    vb.box(0.04, 0.04, 0.4, { tones: 'iron', at: [0, -0.36, 0] });
    vb.cylinder(0.05, 0.05, 0.08, { segments: 8, at: [0, -0.1, 0], tones: 'brass' });
    const pts = [[-0.3, 0.05], [-0.15, 0.1], [-0.02, 0.16], [0.09, 0.22], [0.15, 0.22], [0.25, 0.165], [0.15, 0.15], [0.12, 0.08], [0.0, 0.02], [-0.16, 0.035]];
    vb.prism(pts, 0.04, { tones: 'iron', at: [0, -0.02, 0] });
  }
  const vane = vb.build({ name: `${rec.id}-vane` });
  const vanePivot = new THREE.Group(); vanePivot.name = `${rec.id}-vane-pivot`;
  vanePivot.add(vane);
  vanePivot.position.copy(shUp(V3(XC, RIDGE + 1.1, RZF)));
  group.add(vanePivot);

  // ============================================================ place, anchors, animation
  group.position.set(rec.center.x, 0, rec.center.z);
  group.updateMatrixWorld(true);
  const W3 = (v) => toWorld(group, v);
  const winWorld = windows.map((w) => W3(w.frame ? w.glowPos.clone().applyMatrix4(w.frame) : w.glowPos));

  // rooks: stepped 4 fps behaviour in 1.5 s beats (idle / peck / caw-hop), facing flips per beat; a pure f(t)
  const ROOK_BASE = [rookA.position.clone(), rookB.position.clone()];
  const poseRook = (p, i, t) => {
    const tt = t + i * 0.55, beat = Math.floor(tt / 1.5), fr = Math.floor((tt - beat * 1.5) * 4) % 6;
    const h = hash(beat * 13 + i * 101);
    const face = hash(beat * 7 + i * 31) < 0.5 ? 0 : Math.PI;           // east or west: profile to the camera
    let rz = 0, dy = 0;
    if (h < 0.35) rz = [0, -0.5, -0.5, 0, -0.5, 0][fr];                 // peck at the ridge tiles
    else if (h < 0.6) { rz = [0, 0.25, 0.3, 0.25, 0, 0][fr]; dy = [0, 0, 0.067, 0, 0, 0][fr]; }   // caw + hop
    p.rotation.set(0, face, rz, 'YXZ');
    p.position.copy(ROOK_BASE[i]); p.position.y += dy;
  };
  const VSWING = [0, 0.13, 0.22, 0.13, 0, -0.1];
  const update = (t) => {
    poseRook(rookA, 0, t);
    poseRook(rookB, 1, t);
    const gust = Math.floor(t / 2.2), k = Math.floor(t * 3) % 6;
    const base = [-0.35, -0.15, 0, 0.2, 0.35][Math.floor(hash(gust * 3.3 + 1) * 5)];
    vanePivot.rotation.y = base + VSWING[k] * (hash(gust + 9) < 0.4 ? 0.4 : 1);
  };
  update(0);

  const glassMeshes = [];
  group.traverse((o) => { if (o.userData.layer === 'glass') glassMeshes.push(o); });
  const ridgeFront = shUp(V3(XC, RIDGE + 0.12, RZF - 0.3)), ridgeBack = shUp(V3(XC, RIDGE + DY + 0.12, RZB + 0.25));
  return {
    group,
    update,
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot, open: openDoor }],
      chimneys: [W3(smokeLocal)],
      windows: winWorld.map((pos, i) => ({ id: `${rec.id}-win-${i}`, pos })),
      lights: [
        { pos: W3(lampPos), color: TOWN_PALETTE.lampGlow, r: 3, kind: 'lantern', flicker: true },
        { pos: W3(V3(OX, 3.0, FZ1 + OD + 0.45).applyMatrix4(SH1)), color: TOWN_PALETTE.glow[1], r: 2.0, kind: 'window' },
        { pos: W3(V3(-0.33, 1.4, GZ1 + 0.3)), color: TOWN_PALETTE.glow[1], r: 1.6, kind: 'window' },
      ],
      perches: [W3(ridgeFront), W3(ridgeBack), W3(V3(0.1, CHH + 0.2, 0.15).applyMatrix4(chimM)), W3(V3(2.25, 0.75, -0.4)),
        W3(V3(OX - 0.2, 3.75, FZ1 + 0.2).applyMatrix4(SH1))],
      spots: {
        door: W3(V3(DC[0] + 0.75, 0, DC[1] + 0.75)),
        woodpile: W3(V3(2.6, 0, -0.4)),
        rookA: W3(rookAt[0]), rookB: W3(rookAt[1]),
      },
    },
    api: {
      setDoor: (f) => openDoor(f),
      setLit: (on) => glassMeshes.forEach((m) => setGlowLit(m, on)),
      rooks: [rookA, rookB],
      vane: vanePivot,
    },
    stats: { rooks: 6 },
  };
}
