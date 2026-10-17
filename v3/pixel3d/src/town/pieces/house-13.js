// house-13 — "Riverbend Boathouse" (owner: house-13 agent). docs/TOWN.md §4 (piece API), §6 (scale rules).
//
// DESIGN NOTE
// Identity source: pipgws packages/assets/scripts/houses/house-13.ts (v1): a fisherman's house roofed with an old
// UPTURNED CLINKER BOAT (Lindisfarne boat sheds). East-facing 4x5 lot (x 1..5, z 14..19), door tile 5,18 (the lane spur).
// Signature shape (must read at 640x360 from the gameplay camera, distinct from every neighbour):
//   * the whole roof is a deep upturned hull whose POINTED BOW comes at the camera (south): clinker strakes step out one
//     by one and sweep together into the stem, which overhangs the prow of the house by ~0.45 m and ends in a carved stem
//     head curling up at the keel; a timber keel strip runs the whole ridge; rust-red antifouling bottom (the part the
//     camera sees), a cream boot-stripe, dark navy topsides at the eave, a timber rubbing strake as the gutter line.
//     (round 1 had the cut stern facing the camera: from yaw 0 its round transom read as a quonset hut, and the bow, the
//     part that says 'boat', faced away. Critic fix: the boat is turned end for end.)
//   * the house plan follows the bow: two straight bow walls (SW, SE) meet at a narrow prow with a timber stem post and
//     an old anchor leaning on it; the door is in the SE bow wall (faces SE: half to the yaw-0 camera, half to its door
//     tile) under a gabled slate hood with cream barges and a ship's lantern;
//   * the cut stern (north) is planked with driftwood: brass porthole, RIVERBEND in cream, a stern post with a brass fish
//     weathervane (pokes up behind the roof), rudder + tiller, a ship's lantern;
//   * a crooked iron stovepipe with a coolie hat pokes through the door-side (east) flank, as in v1.
// Below: black tarred weatherboard walls on a rubble footing.
// Palette rows (TOWN.md §3): walls iron (tar weatherboard, as house-6) + stone (rubble footing); hull RUST (hand ramp of v1 ANTIFOUL '#9a3e2a'/'#b4563a'),
//   cream (boot stripe), NAVY (hand ramp of v1 TOPSIDE '#284056') (topsides), timber (rubbing strake, keel, stem, posts);
//   transom plank (v1 DRIFT driftwood); door paintRamp(v1 '#2f6aa8'), shutters paintRamp(v1 '#3a6a9a'); brass
//   (porthole, vane), iron (stovepipe, brackets, lantern), glass / glow; nets paintRamp(v1 NET '#8a7a5a') + pumpkin
//   floats; life ring bannerRed + ivory; dinghy cream + copper stripe + plank; ivy leaf; flowers accents; pots brick.
// Key v1 details kept: porthole + ship's lantern on the transom, blue-shuttered window and a red/white life ring on the
//   end wall (now the SW bow wall, facing the camera), nets with cork floats hung under the gunwale, two oars leaning on
//   the wall, lobster pot, a little rowing boat beside the house (east apron), blue plank door in the side with a ship's
//   lamp, tiny side porthole, stovepipe through the hull. Persona extras: ivy, cat, two pots.
// Mooring post on the SE apron with a lantern and the swinging navy 'Riverbend' sign (face to the camera, 4 fps gusts).
// At 640x360 it must read as: a big rust-red boat lying keel-up on dark walls, its bow pointing at you, strake lines
//   sweeping to the stem, with a stovepipe and lanterns at night.
//
// Local frame: origin = footprint centre (3, 0, 16.5), axes WORLD-aligned (no rotation): +z = south (the bow / prow the
// camera sees), +x = east. The HULL is authored in its own frame (bow toward -z, transom at +z) and placed with a
// 180-degree turn (ROT), so the hull maths is the proven round-1 parametrisation.
import * as THREE from 'three';
import { Builder, M, window_, door as kitDoor, flowerBox, setGlowLit } from '../kit.js';
import { TOWN_PALETTE, paintRamp } from '../palette.js';
import { toWorld } from '../api.js';
import { rng } from '../../core/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

// ---- dimensions (metres, local house frame)
const HW = 1.82;                 // wall half-width (x)
const ZS = 2.48;                 // prow (south) outer face
const ZN = -2.48;                // north (stern) wall outer face
const ZB = 0.88;                 // where the two bow walls start to converge
const AW = 0.16;                 // half-width of the narrow prow end wall
const WT = 0.14;                 // wall thickness
const G = 2.8;                   // gunwale (eave) height
const WALL_TOP = G + 0.16;
const PLINTH = 0.26;
// hull (HULL frame: bow at -z, transom at +z; house = hull turned 180 deg)
const B0 = 2.27;                 // half beam at the gunwale (0.45 m overhang over the side walls)
const D0 = 2.95;                 // hull depth gunwale -> keel (keel at 5.75 midships)
const ZT = 2.78;                 // transom (cut end) = house z -2.78 (0.28 beyond the north wall)
const ZTIP_G = -2.92, ZTIP_K = -2.97;   // bow tip at the gunwale / at the keel (house z 2.92 / 2.97: <= 0.47 m beyond the footprint)
const HULL_T = 0.11, LIFT = 0.075;
const ROT = M({ ry: Math.PI });
const rot = (p) => p.clone().applyMatrix4(ROT);      // hull frame -> house frame
// door: centred in the SE bow wall
const DOOR_W = 0.86, DOOR_Y = 0.12, DOOR_H = 1.94;

// ---- ramps
const DOORP = paintRamp('#2f6aa8', { lightness: 0.42 });    // v1 side door paint
const SHUT = paintRamp('#3a6a9a', { lightness: 0.4 });      // v1 front window shutters
const NET = paintRamp('#8a7a5a', { lightness: 0.44 });      // v1 NET
// hull paint: hand-set 3-tone ramps (paintRamp's cream-lerped highlight washed the navy out to tin-grey and the rust
// to salmon). Navy = v1 TOPSIDE #284056 family, rust = v1 ANTIFOUL #9a3e2a / #b4563a; shadows pushed to cool slate.
const NAVY = ['#3A5E8A', '#284466', '#1C263E'];
const RUST = ['#B4563A', '#953C2A', '#57343F'];
const KEEL = ['#7A5638', '#563A2A', '#33222A'];             // dark oiled keel / stem: a clear strip on the rust
const CAT = [TOWN_PALETTE.iron[1], TOWN_PALETTE.iron[2], TOWN_PALETTE.iron[2]];
const INTERIOR = '#2A1A20';                                 // kit doorway interior tone

// ---- bow walls (house frame): straight lines from (+-HW, ZB) to (+-AW, ZS), extended past the prow for the hull taper
const wallXh = (zh) => HW + ((AW - HW) * (zh - ZB)) / (ZS - ZB);
// ---- hull surface: section w(u) from v1 hwAt (u 0 = gunwale .. 1 = keel); plan beam over v (0 = bow .. 1 = stern)
// must cover the bow walls (the gunwale's inner face stays outside the wall top: beam >= (wallX + 0.22) / 0.98)
const wSec = (u) => Math.pow(Math.max(0, 1 - u), 0.58) * (1 + 0.08 * Math.sin(Math.PI * u));
const zgH = (v) => ZTIP_G + v * (ZT - ZTIP_G);               // gunwale z (hull frame) at v
// round 2a used the straight requirement line itself: a hard knuckle + straight flanks = a pentagon 'pencil tip' from the
// camera. Now a convex ogive B0 * (1 - t^1.8) from house z 0.6 to the tip, never below the wall-cover line.
const OG0 = 0.6, OGP = 1.8;
const beamAt = (v) => {
  const zh = -zgH(v), t = clamp((zh - OG0) / (-ZTIP_G - OG0), 0, 1);
  return Math.max(0.07, B0 * (1 - Math.pow(t, OGP)), Math.min(B0, (wallXh(zh) + 0.22) / 0.98));
};
const bowT = (v) => clamp(1 - beamAt(v) / B0, 0, 1);
const depthAt = (v) => D0 * (1 - 0.16 * bowT(v) * bowT(v));
const ztip = (u) => lerp(ZTIP_G, ZTIP_K, Math.pow(u, 0.7));
// sheer: an upturned boat's gunwale dips toward the bow (the upright sheer rises there), so the bow's lower edge sweeps
// down to the stem instead of running dead level like a quonset eave; the keel line is unchanged.
const SHEER = 0.3;
const sheerAt = (v) => SHEER * bowT(v) * bowT(v);
function hullP(side, u, v) {
  const z = ztip(u) + v * (ZT - ztip(u));
  const s = sheerAt(v);
  return V3(side * beamAt(v) * wSec(u), G - s + (depthAt(v) + s) * u, z);
}
/** u at a given fraction of the half-girth (gunwale -> keel) of the midship section. */
function uAtGirth() {
  const n = 400, acc = [0];
  let prev = hullP(1, 0, 1);
  for (let i = 1; i <= n; i++) { const p = hullP(1, i / n, 1); acc.push(acc[i - 1] + p.distanceTo(prev)); prev = p; }
  const tot = acc[n];
  return (f) => { const t = f * tot; let i = 0; while (i < n - 1 && acc[i + 1] < t) i++; return (i + (t - acc[i]) / Math.max(1e-9, acc[i + 1] - acc[i])) / n; };
}

/** Box between two points (beam): `a` = size in the 'up-ish' direction, `t` = sideways. */
function beam(b, p0, p1, a, t, opts) {
  const d = p1.clone().sub(p0).normalize();
  const upRef = Math.abs(d.y) > 0.95 ? V3(1, 0, 0) : V3(0, 1, 0);
  const s = new THREE.Vector3().crossVectors(d, upRef).normalize();
  const u = new THREE.Vector3().crossVectors(s, d).normalize();
  const c = [];
  for (let i = 0; i < 8; i++) {
    const base = i & 4 ? p1 : p0;
    c.push(base.clone().addScaledVector(s, (i & 1 ? 0.5 : -0.5) * t).addScaledVector(u, (i & 2 ? 0.5 : -0.5) * a));
  }
  return b.hexa(c, opts);
}

export default function build(engine, ctx) {
  const rec = ctx.record;
  const r = rng(ctx.seed ^ 0x13b0a7);
  const b = new Builder(engine, { name: rec.id });
  const tar = { tones: 'iron', pattern: 'boards' };
  const windows = [];
  const inF = (w) => ({ center: w.center.clone().applyMatrix4(b.matrix), glowPos: w.glowPos.clone().applyMatrix4(b.matrix) });
  const here = (p) => p.clone().applyMatrix4(b.matrix);

  // =========================================================================================== walls + footing
  // wall runs: outer-face polyline, clockwise seen from above (+z toward the viewer), starting at the prow.
  // trimA / trimC shorten a run at a 90-degree corner (the neighbour's end face would be coplanar with its outer face)
  const runs = [
    { a: [-AW, ZS], c: [AW, ZS], name: 'prow' },
    { a: [AW, ZS], c: [HW, ZB], name: 'se' },                    // the door wall
    { a: [HW, ZB], c: [HW, ZN], name: 'east' },
    { a: [HW, ZN], c: [-HW, ZN], name: 'north', trimA: WT, trimC: WT },
    { a: [-HW, ZN], c: [-HW, ZB], name: 'west' },
    { a: [-HW, ZB], c: [-AW, ZS], name: 'sw' },                  // the window wall
  ];
  const wallFrames = {};
  for (const run of runs) {
    const [ax, az] = run.a, [cx, cz] = run.c;
    const dx = cx - ax, dz = cz - az, L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L;                       // outward normal of a clockwise run
    const ry = Math.atan2(nx, nz);
    const m = M({ at: [(ax + cx) / 2, 0, (az + cz) / 2], ry });
    wallFrames[run.name] = { m, L, n: [nx, nz] };
    b.push(m);
    const x0 = -L / 2 + (run.trimA ?? 0), x1 = L / 2 - (run.trimC ?? 0);
    const openings = run.name === 'se' ? [{ x: 0, y: DOOR_Y, w: DOOR_W, h: DOOR_H }] : [];
    const xs = [...new Set([x0, x1, ...openings.flatMap((q) => [q.x - q.w / 2, q.x + q.w / 2])])].sort((p, q) => p - q);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], c = xs[i + 1], mx = (a + c) / 2, w = c - a;
      if (w < 1e-4) continue;
      const hole = openings.find((q) => mx > q.x - q.w / 2 && mx < q.x + q.w / 2);
      if (hole) {
        b.box(w, WALL_TOP - (hole.y + hole.h), WT, { ...tar, at: [mx, hole.y + hole.h, -WT / 2] });
        b.box(w, hole.y + 0.06, WT, { tones: 'stone', pattern: 'rubble', at: [mx, -0.06, -WT / 2] });
      } else {
        b.box(w, WALL_TOP + 0.06, WT, { ...tar, at: [mx, -0.06, -WT / 2] });
      }
    }
    // rubble footing: a plinth course standing 0.07 proud (not under the door)
    const segs = openings.length ? [[x0, openings[0].x - openings[0].w / 2], [openings[0].x + openings[0].w / 2, x1]] : [[x0, x1]];
    for (const [a, c] of segs) {
      const ea = a === x0 && !run.trimA ? 0.07 : 0, ec = c === x1 && !run.trimC ? 0.07 : 0;
      b.box(c - a + ea + ec, PLINTH + 0.07, 0.09, { tones: 'stone', pattern: 'rubble', at: [(a + c) / 2 + (ec - ea) / 2, -0.07, 0.035 - 0.0013] });
    }
    b.pop();
  }

  // =========================================================================================== the upturned hull
  const ug = uAtGirth();
  // more, narrower rust strakes than round 1: each lap = one 1-texel clinker line sweeping into the stem
  const BANDS = [
    { f0: 0, f1: 0.035, tones: 'timber', thick: 0.16, lift: 0 },          // rubbing strake (gutter line)
    { f0: 0.035, f1: 0.15, tones: NAVY }, { f0: 0.15, f1: 0.265, tones: NAVY }, { f0: 0.265, f1: 0.37, tones: NAVY },
    { f0: 0.37, f1: 0.41, tones: 'cream' },                                 // boot stripe (high enough to face the sky)
    { f0: 0.41, f1: 0.51, tones: RUST }, { f0: 0.51, f1: 0.61, tones: RUST }, { f0: 0.61, f1: 0.71, tones: RUST },
    { f0: 0.71, f1: 0.80, tones: RUST }, { f0: 0.80, f1: 0.90, tones: RUST }, { f0: 0.90, f1: 1.0, tones: RUST },
  ].map((bd) => ({ ...bd, u0: ug(bd.f0), u1: bd.f1 >= 1 ? 1 : ug(bd.f1) }));
  const NV = 40;
  const vs = Array.from({ length: NV + 1 }, (_, i) => Math.pow(i / NV, 1.5));   // dense at the bow, where the strakes twist
  // consistent outward normal per side (sign fixed once at midship)
  const rawN = (side, u, v) => {
    const e = 1e-3, uu = clamp(u, e, 0.996 - e), vv = clamp(v, e, 1 - e);
    const du = hullP(side, uu + e, vv).sub(hullP(side, uu - e, vv));
    const dv = hullP(side, uu, vv + e).sub(hullP(side, uu, vv - e));
    return du.cross(dv).normalize();
  };
  const sgn = { 1: Math.sign(rawN(1, 0.3, 0.7).x), [-1]: -Math.sign(rawN(-1, 0.3, 0.7).x) };
  const nrm = (side, u, v) => rawN(side, u, v).multiplyScalar(sgn[side]);
  // Planar strake faces: the kit material is flatShading (normals per TRIANGLE), so a twisted quad splits into two toon
  // bands. Keep each face's visible edge exact (the lap line) and project the other edge onto the plane through it.
  const planarize = (p0, p1, q0, q1) => {
    const t = q0.clone().sub(p0).add(q1.clone().sub(p1));
    const m = new THREE.Vector3().crossVectors(p1.clone().sub(p0), t);
    if (m.lengthSq() < 1e-12) return;
    m.normalize();
    q0.addScaledVector(m, -q0.clone().sub(p0).dot(m));
    q1.addScaledVector(m, -q1.clone().sub(p0).dot(m));
  };
  b.push(ROT);                              // ---- HULL FRAME
  for (const side of [-1, 1]) {
    BANDS.forEach((bd, bi) => {
      for (let i = 0; i < NV; i++) {
        const v0 = vs[i], v1 = vs[i + 1];
        const thick = (v) => Math.min(bd.thick ?? HULL_T, 0.45 * beamAt(v) + 0.02);
        const lift = (v) => (bd.lift ?? LIFT) * clamp(beamAt(v) / 0.6, 0.3, 1);
        const u1x = bd.u1 >= 1 ? 1 : Math.min(1, bd.u1 + 0.004);
        // odd strakes end 8 mm short at the transom / bow (coplanar end faces would z-fight under a pan)
        const endZ = (v) => (v >= 1 ? -1 : v <= 0 ? 1 : 0) * (bi % 2) * 0.008;
        const P = (u, v, lf) => hullP(side, u, v).addScaledVector(nrm(side, u, v), lf).add(V3(0, 0, endZ(v)));
        const c = [P(bd.u0, v0, lift(v0) - thick(v0)), P(bd.u0, v1, lift(v1) - thick(v1)), P(bd.u0, v0, lift(v0)), P(bd.u0, v1, lift(v1)),
          P(u1x, v0, -thick(v0)), P(u1x, v1, -thick(v1)), P(u1x, v0, 0), P(u1x, v1, 0)];
        planarize(c[2], c[3], c[6], c[7]);         // outer face: lap edge exact
        planarize(c[2], c[3], c[0], c[1]);         // lap (step) face
        planarize(c[0], c[1], c[4], c[5]);         // inner face
        b.hexa(c, { tones: bd.tones, pattern: 'none' });
      }
    });
  }
  // keel strip along the whole ridge (0.22 wide, standing 0.1 proud: a dark line splitting the two rust flanks)
  const keelPts = vs.map((v) => hullP(1, 1, v));
  for (let i = 0; i < NV; i++) {
    const p0 = keelPts[i].clone().add(V3(0, 0.06, 0)), p1 = keelPts[i + 1].clone().add(V3(0, 0.06, 0));
    beam(b, p0, p1, 0.2, 0.22, { tones: KEEL, pattern: 'none' });
  }
  // stem: from the keel's bow end down the raked bow to the gunwale tip, with a short forefoot below it
  const stemPts = [];
  for (let k = 0; k <= 8; k++) { const u = 1 - k / 8; const p = hullP(1, u, 0); p.x = 0; p.z -= 0.04; stemPts.push(p); }
  stemPts.push(V3(0, G - sheerAt(0) - 0.16, ZTIP_G + 0.05));
  for (let k = 0; k < stemPts.length - 1; k++) beam(b, stemPts[k], stemPts[k + 1], 0.2, 0.2, { tones: KEEL, pattern: 'none' });
  // carved stem head standing up at the bow end of the keel, curling back over the roof (now right above the prow)
  const SH = stemPts[0];
  const headPts = [SH.clone().add(V3(0, -0.12, 0.12)), SH.clone().add(V3(0, 0.3, -0.03)), SH.clone().add(V3(0, 0.58, -0.02)), SH.clone().add(V3(0, 0.7, 0.14)), SH.clone().add(V3(0, 0.62, 0.28))];
  for (let k = 0; k < headPts.length - 1; k++) beam(b, headPts[k], headPts[k + 1], 0.15, 0.15, { tones: KEEL, pattern: 'none' });
  b.box(0.13, 0.11, 0.13, { tones: 'brass', at: [0, headPts[4].y - 0.09, headPts[4].z + 0.04] });
  const perchKeel = here(keelPts[Math.round(NV * 0.6)].clone().add(V3(0, 0.22, 0)));
  const perchHead = here(headPts[2].clone().add(V3(0, 0.16, 0)));
  b.pop();                                  // ---- end HULL FRAME

  // the prow: a timber stem post down the narrow prow wall, an old iron anchor leaning on it
  b.box(0.2, G + 0.16, 0.16, { tones: 'timber', pattern: 'none', at: [0, -0.06, ZS + 0.08] });
  for (const y of [0.55, 1.75]) b.box(0.24, 0.06, 0.2, { tones: 'iron', at: [0, y, ZS + 0.08] });
  {
    const ax = -0.1, lean = 0.2, AZ = ZS + 0.44;
    const top = V3(ax, 0.92, AZ - lean), bot = V3(ax, 0.1, AZ);
    const ir = { tones: 'iron', pattern: 'none' };
    beam(b, bot, top, 0.07, 0.07, ir);                                                       // shank
    beam(b, V3(ax - 0.3, 0.8, AZ - lean * 0.86), V3(ax + 0.3, 0.8, AZ - lean * 0.86), 0.06, 0.06, ir);   // stock
    b.box(0.12, 0.12, 0.05, { ...ir, at: [ax, 0.92, AZ - lean - 0.01] });                    // ring
    for (const sd of [-1, 1]) {                                                               // curved arms + flukes
      const p1 = V3(ax + sd * 0.2, 0.14, AZ + 0.01), p2 = V3(ax + sd * 0.32, 0.32, AZ - 0.03);
      beam(b, bot, p1, 0.065, 0.065, ir);
      beam(b, p1, p2, 0.065, 0.065, ir);
      b.box(0.1, 0.1, 0.06, { ...ir, at: [p2.x, p2.y - 0.05, p2.z] });
    }
  }

  // =========================================================================================== the transom (north, cut end)
  // authored in the HULL frame (+z = out of the transom), so the round-1 stern code is unchanged
  let stern, PHw, SP_TOP;
  b.push(ROT);
  {
    // driftwood boards recessed inside the cut end
    const pts = [];
    const NS = 14;
    for (let k = 0; k <= NS; k++) { const p = hullP(1, k / NS, 1); pts.push([Math.max(0.02, p.x - HULL_T - 0.02), p.y - 0.02]); }
    for (let k = NS - 1; k >= 0; k--) { const p = hullP(1, k / NS, 1); pts.push([-Math.max(0.02, p.x - HULL_T - 0.02), p.y - 0.02]); }
    b.prism(pts, 0.14, { tones: 'plank', pattern: 'vboards', at: [0, 0, ZT - 0.08 - 0.07] });
    // dark caulked seam round the transom rim
    const rim = [];
    for (let k = 0; k <= NS; k++) { const p = hullP(1, k / NS, 1); rim.push(V3(Math.max(0.0, p.x - HULL_T - 0.03), p.y - 0.03, ZT - 0.05)); }
    for (let k = NS - 1; k >= 0; k--) { const p = rim[k]; rim.push(V3(-p.x, p.y, p.z)); }
    for (let k = 0; k < rim.length - 1; k++) if (rim[k].distanceTo(rim[k + 1]) > 1e-3) beam(b, rim[k], rim[k + 1], 0.07, 0.06, { tones: 'timber', pattern: 'none' });
    // brass porthole
    const PH = { x: 0.82, y: G + 1.05, z: ZT - 0.08 };
    b.push(M({ at: [PH.x, PH.y, PH.z], rx: Math.PI / 2 }));
    b.cylinder(0.25, 0.25, 0.07, { segments: 16, tones: 'brass', at: [0, 0, 0] });
    b.cylinder(0.16, 0.16, 0.1, { segments: 16, tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1, at: [0, 0, 0] });
    b.pop();
    PHw = here(V3(PH.x, PH.y, PH.z + 0.35));
    // stern post (outside the transom) + brass fish weathervane on top
    SP_TOP = G + D0 + 0.25;
    const SP_BOT = G + 2.2;
    b.box(0.17, SP_TOP - SP_BOT, 0.15, { tones: 'timber', pattern: 'none', at: [0, SP_BOT, ZT + 0.06] });
    b.box(0.04, 0.26, 0.04, { tones: 'iron', at: [0, SP_TOP, ZT + 0.06] });
    {
      const y = SP_TOP + 0.3;
      const fish = [[-0.34, 0], [-0.2, 0.09], [0.0, 0.11], [0.18, 0.06], [0.26, 0.0], [0.18, -0.06], [0.0, -0.1], [-0.2, -0.08]];
      b.prism(fish, 0.05, { tones: 'brass', at: [0.03, y, ZT + 0.06] });
      b.prism([[0.24, 0], [0.4, 0.11], [0.4, -0.11]], 0.05, { tones: 'brass', tint: 0.96, at: [0.03, y, ZT + 0.06] });
    }
    // the rudder hung on the stern post: navy blade, timber stock, 3 iron pintle straps, a short tiller
    {
      const RZ = ZT - 0.02, RT = 0.12;
      const blade = [[0, G + 0.62], [0.3, G + 0.74], [0.32, G + 1.62], [0.18, G + 1.98], [0, G + 2.02]];
      b.push(M({ at: [0, 0, RZ], ry: -Math.PI / 2 }));
      b.prism(blade, RT, { tones: NAVY, pattern: 'none', at: [0, 0, 0] });
      b.pop();
      b.box(0.15, SP_BOT - (G + 1.9) + 0.04, 0.13, { tones: 'timber', pattern: 'none', at: [0, G + 1.9, RZ + 0.01] });
      for (const y of [G + 0.8, G + 1.3, G + 1.8]) b.box(RT + 0.05, 0.06, 0.36, { tones: 'iron', at: [0, y, RZ + 0.13] });
      beam(b, V3(0, G + 2.02, RZ + 0.05), V3(0, G + 2.3, RZ + 0.3), 0.07, 0.07, { tones: 'timber', pattern: 'none' });
    }
    // RIVERBEND painted across the transom in cream: a 3x5 pixel font, 1 font px = 2 gameplay texels
    {
      const FONT = {
        R: ['110', '101', '110', '101', '101'], I: ['111', '010', '010', '010', '111'], V: ['101', '101', '101', '101', '010'],
        E: ['111', '100', '110', '100', '111'], B: ['110', '101', '110', '101', '110'], N: ['110', '101', '101', '101', '101'],
        D: ['110', '101', '101', '101', '110'],
      };
      const word = 'RIVERBEND', FP = 2 / 30, W = word.length * 4 - 1;
      const x0 = -(W * FP) / 2, yTop = G + 0.46, z = ZT - 0.08 + 0.012;
      [...word].forEach((ch, li) => FONT[ch].forEach((row, ry) => {
        for (let cx = 0; cx < 3;) {
          if (row[cx] !== '1') { cx++; continue; }
          let e = cx; while (e < 3 && row[e] === '1') e++;
          const px0 = x0 + (li * 4 + cx) * FP, px1 = x0 + (li * 4 + e) * FP;
          b.box(px1 - px0, FP, 0.03, { tones: 'cream', pattern: 'none', at: [(px0 + px1) / 2, yTop - (ry + 1) * FP, z] });
          cx = e;
        }
      }));
    }
    // ship's lantern on an iron arm off the stern post
    const s = { x: -0.62, y: G + 1.95, z: ZT + 0.22 };
    b.box(0.62, 0.05, 0.05, { tones: 'iron', at: [-0.31, s.y + 0.42, ZT + 0.12] });
    b.box(0.04, 0.12, 0.04, { tones: 'iron', at: [s.x, s.y + 0.3, s.z - 0.08] });
    b.box(0.2, 0.05, 0.2, { tones: 'iron', at: [s.x, s.y + 0.25, s.z - 0.08] });
    b.box(0.14, 0.22, 0.14, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [s.x, s.y + 0.03, s.z - 0.08] });
    b.box(0.2, 0.05, 0.2, { tones: 'iron', at: [s.x, s.y - 0.02, s.z - 0.08] });
    stern = here(V3(s.x, s.y + 0.1, s.z + 0.1));
  }
  const perchStern = here(V3(0, SP_TOP + 0.05, ZT + 0.06));
  b.pop();
  windows.push({ glowPos: PHw });

  // stovepipe through the hull: v1 puts it on the door-side (east) flank near the cut end, slightly crooked, coolie hat
  const SP = { x: 0.92, z: -1.15 };                          // house frame
  const hullYAt = (x, zh) => {
    const zz = -zh;                                          // hull frame
    const v = (zz - ztip(0.8)) / (ZT - ztip(0.8));
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (beamAt(v) * wSec(m) > Math.abs(x)) lo = m; else hi = m; }
    return G - sheerAt(v) + (depthAt(v) + sheerAt(v)) * lo;
  };
  const pipeBase = hullYAt(SP.x, SP.z) - 0.25;
  const PIPE_KNEE = G + 3.0;
  b.cylinder(0.11, 0.11, PIPE_KNEE - pipeBase, { segments: 8, tones: 'iron', at: [SP.x, pipeBase, SP.z] });
  b.cylinder(0.17, 0.17, 0.09, { segments: 8, tones: 'iron', tint: 1.04, at: [SP.x, pipeBase + 0.25 + 0.03, SP.z] });   // collar at the hull
  b.push(M({ at: [SP.x, PIPE_KNEE - 0.02, SP.z], rz: -0.22 }));
  b.cylinder(0.11, 0.11, 0.5, { segments: 8, tones: 'iron', at: [0, 0, 0] });
  b.cylinder(0.26, 0.02, 0.14, { segments: 8, tones: 'iron', tint: 1.05, at: [0, 0.63, 0] });
  b.box(0.04, 0.12, 0.04, { tones: 'iron', at: [0, 0.51, 0] });
  const smokeLocal = V3(0, 0.57, 0).applyMatrix4(b.matrix);
  b.pop();

  // =========================================================================================== SW bow wall dressing
  // local x from the west end (-L/2) to the prow (+L/2), +z = out (SW, toward the camera at 45 deg)
  const SWF = wallFrames.sw;
  b.push(SWF.m);
  {
    const w = window_(b, { at: [-0.06, 1.5, 0], w: 0.5, h: 0.72, panes: [2, 2], shutters: SHUT, frame: 'cream' });
    windows.push(inF(w));
    flowerBox(b, { at: [-0.06, 1.03, 0], w: 0.7, seed: ctx.seed, colors: [TOWN_PALETTE.flowerRed, TOWN_PALETTE.flowerWhite, TOWN_PALETTE.flowerYellow] });
    // life ring: 8 segments, red / ivory quarters (high on the wall, above the oars, near the prow)
    const RC = { x: 0.8, y: 1.98 };   // below the bow's dipping gunwale
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      const ro = 0.25, ri = 0.14, z0 = 0.02, z1 = 0.11;
      const P = (a, rr, z) => V3(RC.x + Math.cos(a) * rr, RC.y + Math.sin(a) * rr, z);
      b.hexa([P(a0, ri, z0), P(a1, ri, z0), P(a0, ro, z0), P(a1, ro, z0), P(a0, ri, z1), P(a1, ri, z1), P(a0, ro, z1), P(a1, ro, z1)],
        { tones: (k >> 1) % 2 ? TOWN_PALETTE.ivory : TOWN_PALETTE.bannerRed });
    }
    b.box(0.04, 0.12, 0.05, { tones: 'iron', at: [RC.x, RC.y + 0.23, 0.03] });
    // nets hung under the gunwale with cork floats (west end): a diamond lattice of 5 cm cords in two layers
    const NX0 = -1.06, NX1 = -0.6, NY0 = 1.15, NY1 = G - 0.16, SPC = 0.17;
    const cord = { tones: NET, pattern: 'none', layer: 'soft' };
    for (const [dir, zc] of [[1, 0.045], [-1, 0.08]]) {
      for (let c0 = -5; c0 <= 5; c0 += SPC) {
        const c = c0 + 0.031;
        let xa, xb;
        if (dir > 0) { xa = Math.max(NX0, NY0 - c); xb = Math.min(NX1, NY1 - c); } else { xa = Math.max(NX0, c - NY1); xb = Math.min(NX1, c - NY0); }
        if (xb - xa < 0.06) continue;
        beam(b, V3(xa, dir * xa + c, zc), V3(xb, dir * xb + c, zc), 0.05, 0.035, cord);
      }
    }
    b.box(NX1 - NX0 + 0.1, 0.06, 0.06, { ...cord, at: [(NX0 + NX1) / 2, NY1 - 0.01, 0.07] });     // head rope
    for (let k = 0; k < 3; k++) {
      const x = lerp(NX0 + 0.08, NX1 - 0.08, k / 2);
      b.box(0.11, 0.09, 0.09, { tones: TOWN_PALETTE.pumpkin, layer: 'soft', at: [x, NY1 - 0.07, 0.11] });
    }
    // two oars leaning on the wall under the ring, by the prow
    for (const [x0, len, lean] of [[0.84, 1.68, -0.12], [0.98, 1.55, -0.16]]) {
      const p0 = V3(x0, 0.0, 0.2), p1 = V3(x0 + lean * len * 0.5, len, 0.06);
      beam(b, p0, p0.clone().lerp(p1, 0.68), 0.06, 0.06, { tones: 'plank', pattern: 'none' });
      beam(b, p0.clone().lerp(p1, 0.68), p1, 0.05, 0.15, { tones: 'thatch', pattern: 'none' });
    }
    // ivy climbing the west end of the bow wall
    for (let k = 0; k < 16; k++) {
      const y = 0.15 + r() * 1.8 * Math.sqrt((k + 1) / 16);
      const along = r() * (0.55 - y * 0.2);
      const s = 0.1 + r() * 0.06;
      b.box(s, s, 0.05, { tones: 'leaf', tint: r() < 0.3 ? 0.95 : 1, layer: 'soft', at: [-SWF.L / 2 + 0.08 + along, y, 0.03] });
    }
  }
  b.pop();
  // ivy wrapping round onto the west wall
  for (let k = 0; k < 7; k++) {
    const y = 0.15 + r() * 1.5, s = 0.1 + r() * 0.05;
    b.box(0.05, s, s, { tones: 'leaf', layer: 'soft', at: [-HW - 0.03, y, ZB - 0.1 - r() * 0.35] });
  }
  // lobster pot on the ground in front of the nets: plank base, 4 withy hoops + 3 rails, a float on its line
  {
    const LPOT = { x: -1.36, z: 1.95 };
    const wy = { tones: 'plank', tint: 1.05, pattern: 'none' };
    b.box(0.6, 0.06, 0.42, { tones: 'plank', pattern: 'none', at: [LPOT.x, 0, LPOT.z] });
    const arc = (k) => { const a = (k / 4) * Math.PI; return [Math.cos(a) * 0.19, 0.06 + Math.sin(a) * 0.22]; };
    for (const x of [-0.26, -0.09, 0.09, 0.26]) for (let k = 0; k < 4; k++) {
      const [z0, y0] = arc(k), [z1, y1] = arc(k + 1);
      beam(b, V3(LPOT.x + x, y0, LPOT.z + z0), V3(LPOT.x + x, y1, LPOT.z + z1), 0.05, 0.05, wy);
    }
    for (const k of [1, 2, 3]) { const [z0, y0] = arc(k); b.box(0.58, 0.045, 0.045, { ...wy, tint: 0.95, at: [LPOT.x, y0 - 0.022, LPOT.z + z0] }); }
    b.box(0.13, 0.13, 0.13, { tones: TOWN_PALETTE.pumpkin, at: [LPOT.x + 0.46, 0, LPOT.z + 0.14] });
  }

  // =========================================================================================== SE bow wall: door, hood
  let doorLamp = null, hoodPerch = null;
  const CF = wallFrames.se;
  b.push(CF.m);                            // local x along the wall (prow end -> north-east end), +z = out (SE)
  {
    const fr = { tones: 'timber', pattern: 'none' };
    const DH = DOOR_W / 2;
    for (const sd of [-1, 1]) b.box(0.1, DOOR_H + 0.06, 0.06, { ...fr, at: [sd * (DH + 0.05), DOOR_Y, 0.03 - 0.0017] });
    b.box(DOOR_W + 0.24, 0.12, 0.08, { ...fr, at: [0, DOOR_Y + DOOR_H, 0.04 - 0.0017] });
    b.box(DOOR_W, 0.06, 0.2, { tones: 'ashlar', pattern: 'none', at: [0, DOOR_Y - 0.06, 0.0] });
    // interior (glass layer: glows when the door stands open at night): back plate, both reveal sides, hall floor
    const ig = { tones: INTERIOR, layer: 'glass', glow: TOWN_PALETTE.fireGlow, glowKind: 2 };
    b.box(DOOR_W + 0.2, DOOR_H, 0.02, { ...ig, at: [0, DOOR_Y, -0.95] });
    for (const sd of [-1, 1]) b.box(0.02, DOOR_H, 0.82, { ...ig, at: [sd * (DH + 0.09), DOOR_Y, -0.55] });
    b.box(DOOR_W + 0.18, 0.02, 0.88, { ...ig, at: [0, DOOR_Y - 0.02, -0.52] });
    // gabled slate door hood, ridge OUT from the wall, cream bargeboards, tarred pediment, ship's lantern under the apex
    const HH = DH + 0.14, HOV = 0.06, HE = DOOR_Y + DOOR_H + 0.1, HR = HE + 0.4, HP = 0.6;
    for (const sd of [-1, 1]) {
      const P = (t, zz, lf) => {
        const px = sd * (HH + HOV) * (1 - t), py = HE - HOV * 0.5 + (HR - HE + HOV * 0.5) * t;
        const nx = sd * (HR - HE), ny = HH;
        const nl = Math.hypot(nx, ny);
        return V3(px + (nx / nl) * lf, py + (ny / nl) * lf, zz);
      };
      for (const [t0, t1, lf] of [[0, 0.55, 0], [0.5, 1, 0.07]]) {
        b.hexa([P(t0, -0.05, lf - 0.08), P(t0, HP, lf - 0.08), P(t0, -0.05, lf), P(t0, HP, lf),
          P(t1, -0.05, -0.08), P(t1, HP, -0.08), P(t1, -0.05, 0), P(t1, HP, 0)], { tones: 'slate', tint: lf ? 1 : 0.97, pattern: 'none' });
      }
      beam(b, V3(sd * (HH + HOV + 0.02), HE - 0.07, HP + 0.02), V3(0, HR + 0.04, HP + 0.02), 0.09, 0.05, { tones: 'cream', pattern: 'none' });
    }
    b.box(0.12, 0.1, HP + 0.06, { tones: 'slate', tint: 0.9, pattern: 'none', at: [0, HR - 0.02, HP / 2 - 0.03] });
    b.prism([[-HH, HE], [HH, HE], [0, HR - 0.03]], 0.06, { tones: 'iron', pattern: 'vboards', at: [0, 0, HP - 0.06] });
    b.prism([[-0.13, 0], [-0.06, 0.05], [0.04, 0.05], [0.1, 0], [0.04, -0.05], [-0.06, -0.05]], 0.03, { tones: 'brass', at: [-0.02, HE + 0.13, HP - 0.015] });
    b.prism([[0.09, 0], [0.16, 0.05], [0.16, -0.05]], 0.03, { tones: 'brass', at: [-0.02, HE + 0.13, HP - 0.015] });
    for (const sd of [-1, 1]) beam(b, V3(sd * (DH + 0.08), 1.62, 0.03), V3(sd * (DH + 0.08), HE - 0.04, HP - 0.1), 0.07, 0.07, fr);
    b.box(0.05, 0.05, 0.22, { tones: 'iron', at: [0, HR - 0.14, HP + 0.08] });
    b.box(0.03, 0.14, 0.03, { tones: 'iron', at: [0, HR - 0.3, HP + 0.18] });
    b.box(0.2, 0.05, 0.2, { tones: 'iron', at: [0, HR - 0.35, HP + 0.18] });
    b.box(0.14, 0.2, 0.14, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [0, HR - 0.55, HP + 0.18] });
    b.box(0.19, 0.05, 0.19, { tones: 'iron', at: [0, HR - 0.6, HP + 0.18] });
    doorLamp = here(V3(0, HR - 0.45, HP + 0.18));
    hoodPerch = here(V3(0, HR + 0.06, HP * 0.5));
    // stone doorstep (rise 0.06) + mat
    b.box(DOOR_W + 0.34, 0.12, 0.36, { tones: 'ashlar', pattern: 'none', at: [0, -0.06, 0.18] });
    b.box(DOOR_W + 0.1, 0.03, 0.22, { tones: 'thatch', tint: 0.9, layer: 'soft', at: [0, 0.055, 0.2] });
  }
  const doorPointL = here(V3(0, 0, 0));
  b.pop();
  // flagstone spur from the doorstep toward the door tile (flat, 3 cm: the tile stays walkable)
  for (const [x, z, w, d] of [[1.6, 2.12, 0.34, 0.3], [2.0, 2.2, 0.3, 0.28], [2.38, 2.14, 0.32, 0.3]]) {
    b.box(w, 0.05, d, { tones: 'ashlar', pattern: 'none', at: [x, -0.02, z], ry: 0.35 });
  }
  // east wall: the tiny side porthole (v1)
  {
    const EF = wallFrames.east;
    const eMid = (ZB + ZN) / 2;
    const lx = (z) => -(z - eMid);           // house z -> east-frame local x
    b.push(EF.m);
    b.push(M({ at: [lx(-0.5), 1.62, 0.0], rx: Math.PI / 2 }));
    b.cylinder(0.19, 0.19, 0.08, { segments: 16, tones: 'brass', at: [0, 0, 0] });
    b.cylinder(0.12, 0.12, 0.11, { segments: 16, tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.glow[1], glowKind: 1, at: [0, 0, 0] });
    b.pop();
    windows.push({ glowPos: here(V3(lx(-0.5), 1.62, 0.35)) });
    b.pop();
  }
  // two flower pots by the east wall, north of the door (apron tile 5,17)
  for (const [z, col] of [[0.66, TOWN_PALETTE.flowerRed], [0.34, TOWN_PALETTE.flowerViolet]]) {
    b.cylinder(0.12, 0.09, 0.2, { segments: 8, tones: 'brick', at: [HW + 0.24, 0, z] });
    b.box(0.2, 0.1, 0.2, { tones: 'leaf', layer: 'soft', at: [HW + 0.24, 0.2, z] });
    b.box(0.08, 0.08, 0.08, { tones: col, layer: 'soft', at: [HW + 0.24 - 0.03, 0.29, z + 0.02] });
    b.box(0.08, 0.08, 0.08, { tones: col, layer: 'soft', at: [HW + 0.24 + 0.05, 0.27, z - 0.05] });
  }
  // mooring post on the south-east apron (tile 5,19; 1.2 m, decorative-extra cap): a lantern on top that lights the door
  // corner from the camera side, and the gallows arm the swinging 'Riverbend' sign hangs from (face to the camera)
  const POST = { x: 2.55, z: 2.86 }, POST_H = 1.0;
  b.box(0.17, POST_H + 0.06, 0.17, { tones: 'timber', pattern: 'none', at: [POST.x, -0.06, POST.z] });
  b.box(0.21, 0.06, 0.21, { tones: 'iron', at: [POST.x, 0.3, POST.z] });
  b.box(0.21, 0.04, 0.21, { tones: 'iron', at: [POST.x, POST_H, POST.z] });
  b.box(0.12, 0.12, 0.12, { tones: 'glass', layer: 'glass', glow: TOWN_PALETTE.lampGlow, glowKind: 2, at: [POST.x, POST_H + 0.04, POST.z] });
  b.hexa([V3(POST.x - 0.1, POST_H + 0.16, POST.z - 0.1), V3(POST.x + 0.1, POST_H + 0.16, POST.z - 0.1), V3(POST.x - 0.02, POST_H + 0.21, POST.z - 0.02), V3(POST.x + 0.02, POST_H + 0.21, POST.z - 0.02),
    V3(POST.x - 0.1, POST_H + 0.16, POST.z + 0.1), V3(POST.x + 0.1, POST_H + 0.16, POST.z + 0.1), V3(POST.x - 0.02, POST_H + 0.21, POST.z + 0.02), V3(POST.x + 0.02, POST_H + 0.21, POST.z + 0.02)], { tones: 'iron' });
  const postLamp = V3(POST.x, POST_H + 0.1, POST.z);
  b.cylinder(0.16, 0.16, 0.07, { segments: 8, tones: NET, at: [POST.x, 0, POST.z] });
  b.cylinder(0.14, 0.14, 0.06, { segments: 8, tones: NET, tint: 0.95, at: [POST.x, 0.07, POST.z] });

  // =========================================================================================== rowing boat on the east apron
  {
    const BX = HW + 0.58, BZ0 = -2.32, BZ1 = 0.06, BB = 0.36, BD = 0.34;
    const dP = (side, u, v) => {
      // upright: u 0 = gunwale (top) .. 1 = keel; pointed bow at v = 0 (north), small transom at v = 1
      const t = clamp((0.4 - v) / 0.4, 0, 1);
      const be = Math.max(0.03, BB * Math.pow(Math.max(0, 1 - t * t), 0.6) * (v > 0.85 ? 1 - (v - 0.85) * 1.6 : 1));
      const sheer = 0.06 * t * t + 0.03 * Math.max(0, v - 0.8) / 0.2;
      return V3(BX + side * be * wSec(u * 0.92), BD + sheer - (BD - 0.02) * u, lerp(BZ0, BZ1, v));
    };
    const NB = 10;
    for (const side of [-1, 1]) {
      for (let i = 0; i < NB; i++) {
        const v0 = i / NB, v1 = (i + 1) / NB;
        for (const [u0, u1, tones] of [[0, 0.14, 'copper'], [0.14, 1, 'cream']]) {
          const P = (u, v, k) => { const p = dP(side, u, v); p.x = BX + (p.x - BX) * k; return p; };
          b.hexa([P(u0, v0, 0.82), P(u0, v1, 0.82), P(u0, v0, 1), P(u0, v1, 1), P(u1, v0, 0.6), P(u1, v1, 0.6), P(u1, v0, 1), P(u1, v1, 1)],
            { tones, pattern: 'none' });
        }
      }
    }
    {
      const sec = [];
      for (let k = 0; k <= 5; k++) { const p = dP(1, k / 5, 0.999); sec.push([p.x - BX, p.y]); }
      for (let k = 4; k >= 0; k--) { const p = dP(1, k / 5, 0.999); sec.push([-(p.x - BX), p.y]); }
      b.prism(sec, 0.05, { tones: 'plank', pattern: 'none', at: [BX, 0, BZ1 - 0.02] });
      const top = dP(1, 0, 0.999);
      b.box((top.x - BX) * 2 + 0.04, 0.06, 0.07, { tones: 'copper', pattern: 'none', at: [BX, top.y - 0.05, BZ1 - 0.015] });
    }
    const fl = 0.16;
    b.box(BB * 1.2, 0.04, (BZ1 - BZ0) * 0.62, { tones: 'plank', pattern: 'vboards', scale: 0.5, at: [BX, fl, BZ0 + (BZ1 - BZ0) * 0.55] });
    for (const v of [0.42, 0.78]) b.box(BB * 1.7, 0.05, 0.14, { tones: 'plank', tint: 1.04, pattern: 'none', at: [BX, BD - 0.07, lerp(BZ0, BZ1, v)] });
    b.box(0.26, 0.08, 0.3, { tones: NET, layer: 'soft', at: [BX, fl + 0.04, lerp(BZ0, BZ1, 0.6)] });
    const CZ = lerp(BZ0, BZ1, 0.78);
    b.box(0.17, 0.14, 0.12, { tones: CAT, pattern: 'none', at: [BX, BD - 0.02, CZ] });
    b.box(0.12, 0.11, 0.1, { tones: CAT, pattern: 'none', at: [BX + 0.01, BD + 0.12, CZ + 0.02] });
    b.box(0.035, 0.05, 0.035, { tones: CAT, pattern: 'none', at: [BX - 0.035, BD + 0.23, CZ + 0.03] });
    b.box(0.035, 0.05, 0.035, { tones: CAT, pattern: 'none', at: [BX + 0.055, BD + 0.23, CZ + 0.03] });
    beam(b, V3(BX + 0.08, BD + 0.0, CZ - 0.04), V3(BX + 0.2, BD + 0.08, CZ - 0.12), 0.04, 0.04, { tones: CAT, pattern: 'none' });
  }

  // =========================================================================================== swinging shop sign (+1 call)
  const SGN = V3(POST.x - 0.36, POST_H - 0.07, POST.z);
  b.box(0.6, 0.05, 0.05, { tones: 'iron', at: [POST.x - 0.3, SGN.y, SGN.z] });
  beam(b, V3(POST.x - 0.06, SGN.y - 0.22, POST.z), V3(POST.x - 0.24, SGN.y + 0.01, POST.z), 0.04, 0.04, { tones: 'iron', pattern: 'none' });
  b.box(0.05, 0.05, 0.05, { tones: 'iron', at: [POST.x - 0.62, SGN.y - 0.03, SGN.z] });
  const sb = new Builder(engine, { name: `${rec.id}-sign` });
  sb.box(0.04, 0.1, 0.03, { tones: 'iron', at: [-0.17, -0.12, 0] });
  sb.box(0.04, 0.1, 0.03, { tones: 'iron', at: [0.17, -0.12, 0] });
  sb.box(0.6, 0.05, 0.07, { tones: 'cream', pattern: 'none', at: [0, -0.07 - 0.1, 0] });
  sb.box(0.54, 0.32, 0.05, { tones: NAVY, pattern: 'none', at: [0, -0.49, 0] });
  for (const sz of [1, -1]) {
    const fish = [[-0.2, 0], [-0.1, 0.07], [0.04, 0.08], [0.14, 0.04], [0.18, 0], [0.14, -0.04], [0.04, -0.07], [-0.1, -0.06]];
    sb.prism(fish, 0.03, { tones: 'brass', at: [0.02, -0.33, sz * 0.035] });
    sb.prism([[0.16, 0], [0.25, 0.07], [0.25, -0.07]], 0.03, { tones: 'brass', tint: 0.96, at: [0.02, -0.33, sz * 0.035] });
  }
  const signPivot = new THREE.Group();
  signPivot.name = `${rec.id}-sign-pivot`;
  signPivot.position.copy(SGN);
  signPivot.add(sb.build());

  const group = b.build();
  group.add(signPivot);

  // =========================================================================================== door leaf (dutch, hinge right)
  const d = kitDoor(engine, { w: DOOR_W - 0.02, h: DOOR_H - 0.02, kind: 'dutch', tones: DOORP, hinge: 'right', name: `${rec.id}-door` });
  const doorFrame = new THREE.Group();
  doorFrame.name = `${rec.id}-doorframe`;
  // SE wall frame: local +x = along the wall toward the east wall, +z = out (SE). Hinge 'right': the pivot sits at the
  // north-east jamb, the leaf extends along local -x and swings inward.
  doorFrame.applyMatrix4(CF.m.clone().multiply(new THREE.Matrix4().makeTranslation(DOOR_W / 2 - 0.01, DOOR_Y + 0.01, -0.05)));
  doorFrame.add(d.pivot);
  group.add(doorFrame);

  group.position.set(rec.center.x, 0, rec.center.z);
  group.updateMatrixWorld(true);
  const W3 = (v) => toWorld(group, v);
  const glassMeshes = [];
  group.traverse((o) => { if (o.userData.layer === 'glass') glassMeshes.push(o); });

  const SWING = [0, 0.05, 0.09, 0.05, 0, -0.05, -0.08, -0.04];
  const update = (t) => {
    const k = Math.floor(t * 4);
    const gust = rng(Math.floor(t / 3) * 7919 + 13)();
    signPivot.rotation.x = SWING[k % 8] * (gust < 0.4 ? 0.0 : gust < 0.8 ? 1.2 : 2.2);
  };

  const dpw = W3(doorPointL);
  const [dnx, dnz] = CF.n;
  return {
    group,
    update,
    anchors: {
      doors: [{ id: `${rec.id}-door`, pivot: d.pivot, open: d.open, normal: [dnx, dnz], point: { x: dpw.x, z: dpw.z } }],
      chimneys: [W3(smokeLocal)],
      windows: windows.map((w, i) => ({ id: `${rec.id}-win-${i}`, pos: W3(w.glowPos) })),
      lights: [
        { pos: W3(doorLamp), color: TOWN_PALETTE.lampGlow, r: 3, kind: 'lantern', flicker: true },
        { pos: W3(postLamp), color: TOWN_PALETTE.lampGlow, r: 2.2, kind: 'lantern', flicker: true },
        { pos: W3(windows[1].glowPos), color: TOWN_PALETTE.glow[1], r: 1.8, kind: 'window' },
        { pos: W3(stern), color: TOWN_PALETTE.lampGlow, r: 2.5, kind: 'lantern', flicker: true },
      ],
      perches: [
        W3(perchHead),                                                   // the carved stem head over the prow
        W3(perchKeel),                                                   // the keel, midships
        W3(perchStern),                                                  // stern post (under the vane)
        W3(hoodPerch),                                                   // the door hood ridge
        W3(V3(POST.x, POST_H + 0.22, POST.z)),                           // the mooring post's lantern cap
      ],
      spots: { door: W3(V3(2.1, 0, 2.1)), boat: W3(V3(HW + 0.58, 0.3, -0.9)), cat: W3(V3(HW + 0.58, 0.45, -0.2)) },
    },
    api: {
      setDoor: (f) => d.open(f),
      setLit: (on) => glassMeshes.forEach((m) => setGlowLit(m, on)),
      sign: signPivot,
    },
    stats: {},
  };
}
