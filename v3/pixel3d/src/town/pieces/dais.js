// dais (owner: dais agent): the voting circle and the Storyteller's dais at the heart of Hollowmere's square.
// docs/TOWN.md §4 (owns everything ON the square inside r <= 6.9 m of CIRCLE; the ground piece paints the setts).
//
// DESIGN NOTE
// v1 identity (pipgws scripts/ground.ts): the voting circle is a CLOCK DIAL - a warm sandstone ring of dressed
// blocks with brass hour marks (XII = a diamond), and a dark stone disc in the middle with a chart compass rose
// (4 long + 4 short points, each split into a lit and a shaded half, north the brightest, a brass hub).
// 3D version = that dial turned into a stage:
//  - signature shape: a low octagonal stepped dais (flat face to the camera, like the t3ssel8r shrine basin): three
//    grey kerb-stone treads with pale sandstone nosings, a warm sandstone platform with a projecting carved lip, a dark floor with the compass
//    rose in RELIEF (each point a low ridge, so the sun splits it into the v1 lit/shaded halves; north in brass);
//    a stone lectern with the open grimoire at the north edge (faces the camera); 4 iron braziers on the lower
//    tread at the diagonals (bowls' inner rims fire-lit), two red town banners behind the lectern (2.46 m), a brass hourglass at its foot.
//    Stone height 0.58 m (3 treads), lectern 1.25 m, flames <= ~1.6 m: low, ceremonial; nothing tall south of the centre.
//  - the dial ring (r 5.8..6.7): 30 dressed sandstone blocks (2 per seat), 2 texels proud, real joints, brass
//    minute pins; a 15-HOUR dial: one seat stone per hour, seat 0 at XII (north, toward the clocktower, brass
//    diamond), clockwise = house order. Each seat: a pale octagonal two-course stone (top 0.2 m) with a brass boss,
//    and beside it (clockwise) an iron candle stake with a candle = the seat marker (the candle is the seat's life).
//  - two giant brass CLOCK HANDS lie on the setts between dais and ring, resting at 10:10. During a vote the long
//    hand steps seat to seat clockwise from the nominee (stop-motion 3-pose moves), a light sweeping the ring under
//    its tip, while the short hand points at the nominee; at an execution both point at the seat on the block.
//  - states (api.setSeat / setPhase): alive = candle lit; dead = the stone drains to cold grey, candle out, a
//    blue ghost-light burns on the stake while the ghost vote is unspent; at night a lit candle throws a 2-band warm
//    halo on the dial round its stake and warms its stone's top (emissive decals: the ring has no PointLights); nominated = a pulsing ember halo around
//    the stone; voteHand = the stone's top rim glows gold (once the hand has passed it); onBlock = a crimson
//    pennant on the stake. Phases: day low fire, nomination brighter, vote braziers FLARE with embers, execution
//    flare, night = coals only and the grimoire's pages glow faint holy blue.
// Palette rows (docs/TOWN.md §3): dial (ring, platform, lip), kerb (treads), grout (floor), ashlar (seat stones,
// long rose points, lectern), stone (short rose points, dead seats), brass (hand, hub, bosses, north point, brazier
// rims), iron (stakes, braziers), timber (book rest), plum + cream (grimoire), ivory (candles), bannerRed/Gold
// (pennant, ribbon); emissive: fireGlow / lampGlow / glow (flames, halos), holyGlow (wisps, night pages).
// At 640x360 (30 px/m) it must read as: a pale stone ring of 15 stones round a stepped octagon with fire at its
// corners and a long brass hand pointing at the clocktower - "the stage of the game".
//
// Draw calls: static kit solid + glass (hourglass) (2) + states kit solid (1, pennants) + 2 hands (2) + fx (1: every
// emissive part - flames, halos, wisps, sweep light, night pages; 1 extra shader program) = 6, ~11.2k tris.
// Render: tools/townpiece.sh dais shots/town-dais [--q 'dais=demo&daisPhase=vote']
import * as THREE from 'three';
import { Builder, M, toTones } from '../kit.js';
import { toonMaterial } from '../../materials/toon.js';
import { TOWN_PALETTE as PAL } from '../palette.js';
import { LAYERS } from '../../core/PixelPipeline.js';

const TAU = Math.PI * 2;
const N = 15;
// radii (m, from CIRCLE centre)
const RING_IN = 5.8, RING_OUT = 6.7, RING_TOP = 0.06, RING_TINT = 0.86;
const DECAL = 0.036;                         // emissive decals float >= 1 texel above the surface they light (crawl)
const SEAT_R = 6.25;
const POST_DA = 0.75 / SEAT_R;               // candle stake: 0.75 m along the ring from its seat, always on the
// side AWAY from the camera (north), so a stake never stands in front of a player on the stone
const postAngle = (a) => a + (Math.sin(a) > 1e-6 ? -POST_DA : POST_DA);
const BRAZIER_R = 1.86;
const HAND_R0 = 2.74, HAND_R1 = 5.72, HOUR_R1 = 4.6;       // R0: the tails clear the widest tread (T0, inradius 2.36)
const REST_LONG = TAU / 6, REST_SHORT = -TAU / 6;   // hands at rest: 10:10, like a clockmaker's window
// tiers (8-gons, circumradius, flat face toward +z)
// a 3-tread stage (0.13 m risers): low and ceremonial, but it reads as a raised stage inside the ring
const T0 = { R: 2.56, y: 0.13 }, T1 = { R: 2.2, y: 0.26 }, T2 = { R: 1.8, y: 0.39 }, PLAT = { R: 1.5, y: 0.52 }, LIP = { R0: 1.3, R1: 1.56, y: 0.58 };
const FLOOR = { R: 1.34, y: 0.545 };

// fx slots (uniform float array)
const S_NOM = 0, S_VOTE = 15, S_WISP = 30, S_CANDLE = 45, S_BRAZ = 60, S_COAL = 64, S_SWEEP = 65, S_PAGES = 66, S_EMBER = 67;
const S_HANDLINE = 68, S_POOL = 70, S_WISPOOL = 85, S_BLOCK = 100, S_TRAIL = 130, S_HALO = 160, S_RIM = 175;
const NSLOT = 176;
// fx kinds (K_HAND follows the long hand, K_HOUR the short one)
const K_GLOW = 0, K_FLAME = 1, K_WISP = 2, K_EMBER = 3, K_HAND = 4, K_HOUR = 5;

const P = (r, a, y) => new THREE.Vector3(Math.sin(a) * r, y, -Math.cos(a) * r);
const lin = (hex) => new THREE.Color(hex);

// ------------------------------------------------------------------------------------------------ brazier pool
// The braziers' warm pool on the setts round the stage (night / golden): ONE PointLight cannot carry a toon pool
// past the treads (quadratic reach x N.L from 1.2 m up: the setts 3 m out got ~2/255), so like props' street-lamp
// pools the light on the ground is baked: a flat disc 3.5 cm above the setts (under the treads / ring stones, so
// they depth-hide it), drawn additively in the colour pass only as 3 hard concentric rings in local space. The
// shader keeps props' 'props-lamp-pools' structure on purpose: the cut-away patch (patchPoolShader) recognises it
// and gives the ring edges the same world-anchored Bayer dither + faint outer band (crawl-free on whole-texel pans).
// Gain = the fire level (day 0.75 .. execution 1.45; night phase = coals), only while the composer lit our anchor.
const POOL_RINGS = [3.2, 4.15, 5.05];          // T0 inradius 2.36: the pool spills ~0.8 / 1.8 / 2.7 m past the steps
const POOL_LEVELS = [0.95, 0.6, 0.3];
const FIRE_I = 2.6;                            // the fire anchor's intensity (the composer flickers it 0.8..1 x this)
function brazierPool(engine, tod) {
  const seg = 48, R = POOL_RINGS[2] + 0.05, y = 0.035;
  const pos = [], ctr = [];
  for (let k = 0; k < seg; k++) {
    const a0 = (k * TAU) / seg, a1 = ((k + 1) * TAU) / seg;
    pos.push(0, y, 0, Math.sin(a0) * R, y, Math.cos(a0) * R, Math.sin(a1) * R, y, Math.cos(a1) * R);   // CCW from above
    for (let v = 0; v < 3; v++) ctr.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(ctr, 2));
  const uGain = { value: 0 };
  const night = tod === 'night';
  const mat = new THREE.ShaderMaterial({
    name: 'dais-brazier-pool',
    uniforms: {
      uPassMode: engine.uniforms.uPassMode, uGain,
      // out = warm*lv*g + dst*(1 - keep*lv*g): scale the cool setts down first, then add the brazier tone
      uWarm: { value: night ? new THREE.Vector3(0.42, 0.22, 0.07) : new THREE.Vector3(0.2, 0.11, 0.035) },
      uKeep: { value: night ? 0.45 : 0.15 },
      uRings: { value: new THREE.Vector3(...POOL_RINGS) }, uLevels: { value: new THREE.Vector3(...POOL_LEVELS) },
    },
    vertexShader: /* glsl */`
      attribute vec2 aCenter;
      varying vec2 vRel;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vRel = position.xz - aCenter;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform int uPassMode; uniform vec3 uWarm, uRings, uLevels; uniform float uKeep, uGain;
      varying vec2 vRel;
      void main() {
        if (uPassMode == 1 || uGain <= 0.001) discard;
        float d = length(vRel);
        float lv = d < uRings.x ? uLevels.x : d < uRings.y ? uLevels.y : d < uRings.z ? uLevels.z : 0.0;
        if (lv <= 0.0) discard;
        float k = lv * uGain;
        gl_FragColor = vec4(uWarm * k, 1.0 - uKeep * min(k, 1.0));
      }`,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'dais-brazier-pool';
  mesh.layers.set(LAYERS.COLOR_ONLY);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return { mesh, uGain };
}

// ------------------------------------------------------------------------------------------------ fx material
// Emissive-only toon material (PIPELINE emissive rule: rtScene.a = 0, outline none). Per-vertex slot -> level
// from uLevel[]; level 0 collapses the part to its pivot (invisible). Flames / wisps / embers animate in the
// vertex shader as a pure, stepped function of uTime; K_HAND parts rotate with the clock hand (uHandAngle).
function fxMaterial(engine, uniforms) {
  const mat = toonMaterial(engine, {
    color: 0x000000, flatShading: true, outline: 'none',
    uniforms,
    vertexHead: /* glsl */`
      attribute vec3 aEmit; attribute vec4 aFx; attribute vec3 aPivot;   // aFx: slot, kind, phase, layer
      uniform float uLevel[${NSLOT}]; uniform float uHandAngle; uniform float uHourAngle;
      varying vec3 vFxEmit;
      float fxHash(float k) { return fract(sin(k * 12.9898 + 4.1) * 43758.5453); }`,
    vertex: /* glsl */`
      {
        int slot = int(aFx.x + 0.5); int kind = int(aFx.y + 0.5); float ph = aFx.z;
        float lv = uLevel[slot];
        vec3 rel = transformed - aPivot;
        vec3 piv = aPivot;
        float bright = 1.0;
        if (kind == ${K_FLAME}) {                       // stepped flicker: own fps per layer (core fastest)
          float fps = 5.0 + aFx.w * 2.0;
          float k = floor(uTime * fps + ph * 13.0);
          float h1 = fxHash(k + ph * 71.0), h2 = fxHash(k * 1.7 + ph * 29.0);
          float sy = (0.78 + 0.44 * floor(h1 * 4.0) / 3.0) * lv;
          float sx = lv > 1.0 ? mix(1.0, lv, 0.5) : lv;
          rel *= vec3(sx, sy, sx);
          piv.x += (floor(h2 * 3.0) - 1.0) * 0.022 * min(lv, 1.0);
        } else if (kind == ${K_WISP}) {                 // ghost-light: slow sway + bob, 4 fps
          float k = floor(uTime * 4.0 + ph * 5.0);
          float sw = sin(k * 0.9 + ph * 6.0);
          rel.x += sw * 0.045 * (rel.y / 0.3);
          piv.y += (fxHash(k + ph) > 0.5 ? 0.034 : 0.0);
          bright = lv;
          if (lv > 0.01) lv = 1.0;
        } else if (kind == ${K_EMBER}) {                // rising sparks only when the fire flares (level > 1)
          float k = floor(uTime * 6.0);
          float rise = fract(k / 6.0 * 0.55 + ph);
          piv.y += rise * 0.75;
          piv.x += (fxHash(floor(k / 3.0) + ph * 17.0) - 0.5) * 0.12;
          lv = lv > 1.05 && rise < 0.85 ? 1.0 : 0.0;
        } else if (kind == ${K_HAND} || kind == ${K_HOUR}) {   // follows its clock hand
          bright = lv; if (lv > 0.01) lv = 1.0;
          float ha = kind == ${K_HAND} ? uHandAngle : uHourAngle;
          float c = cos(ha), s = sin(ha);
          rel = vec3(rel.x * c + rel.z * s, rel.y, -rel.x * s + rel.z * c);
          piv = vec3(piv.x * c + piv.z * s, piv.y, -piv.x * s + piv.z * c);
        } else {                                        // steady glow; level = brightness
          bright = lv; if (lv > 0.01) lv = 1.0;
        }
        if (lv < 0.01) rel = vec3(0.0);
        transformed = piv + rel;
        vFxEmit = aEmit * bright;
      }`,
    viewVertex: /* glsl */`mvPosition.z += aFx.w * 0.06;  // inner flame layers drawn in front of the outer ones`,
    fragmentHead: 'varying vec3 vFxEmit;',
    tones: /* glsl */`
      totalEmissiveRadiance = vFxEmit;
      toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
      diffuseColor.a = 0.0;`,
  });
  // pure replace (like the kit glass): alpha 0 marks emissive texels for fog / god rays
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.ZeroFactor;
  mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.ZeroFactor;
  mat.name = 'dais-fx';
  return mat;
}

class FxBuilder {
  constructor() { this.pos = []; this.emit = []; this.fx = []; this.piv = []; }
  tris(arr, { emit, slot, kind = K_GLOW, phase = 0, layer = 0, pivot = [0, 0, 0] }) {
    const c = lin(emit);
    for (let i = 0; i < arr.length; i += 3) {
      this.pos.push(arr[i], arr[i + 1], arr[i + 2]);
      this.emit.push(c.r, c.g, c.b);
      this.fx.push(slot, kind, phase, layer);
      this.piv.push(...pivot);
    }
  }
  /** Flat polygon (convex): pts [[x, y, z], ...], wound to face up. */
  fan(pts, o) {
    const out = [];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[0], b = pts[i], c = pts[i + 1];
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (ny >= 0) out.push(...a, ...b, ...c); else out.push(...a, ...c, ...b);
    }
    this.tris(out, o);
  }
  /** Flat annulus sector (r0..r1, a0..a1) at height y, n slices. */
  arc(r0, r1, a0, a1, y, n, o) {
    for (let i = 0; i < n; i++) {
      const u0 = a0 + ((a1 - a0) * i) / n, u1 = a0 + ((a1 - a0) * (i + 1)) / n;
      this.fan([P(r0, u0, y), P(r0, u1, y), P(r1, u1, y), P(r1, u0, y)].map((v) => [v.x, v.y, v.z]), o);
    }
  }
  /** Octagonal flat ring (axis-aligned, flat face +z) around (x, z); R0 = 0 gives a disc. */
  octRing(x, y, z, R0, R1, o) {
    for (let i = 0; i < 8; i++) {
      const a0 = Math.PI / 8 + (i * TAU) / 8, a1 = a0 + TAU / 8;
      const p = (R, a) => [x + Math.sin(a) * R, y, z + Math.cos(a) * R];
      if (R0 > 0) this.fan([p(R0, a0), p(R1, a0), p(R1, a1), p(R0, a1)], o);
      else this.fan([[x, y, z], p(R1, a0), p(R1, a1)], o);
    }
  }
  /** Diamond flame / wisp: 4-sided bipyramid, base point at (x, y, z), widest at `belly` of its height. */
  flame(x, y, z, w, h, o, belly = 0.32) {
    const b = [x, y, z], t = [x, y + h, z], m = (dx, dz) => [x + dx, y + h * belly, z + dz];
    const ring = [m(w, 0), m(0, w * 0.8), m(-w, 0), m(0, -w * 0.8)];
    const out = [];
    for (let i = 0; i < 4; i++) {
      const p = ring[i], q = ring[(i + 1) % 4];
      out.push(...b, ...p, ...q, ...t, ...q, ...p);
    }
    this.tris(out, { ...o, pivot: o.pivot ?? b });
  }
  cube(x, y, z, s, o) {
    const h = s / 2, c = [];
    for (let i = 0; i < 8; i++) c.push([x + (i & 1 ? h : -h), y + (i & 2 ? s : 0), z + (i & 4 ? h : -h)]);
    const F = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    const out = [];
    for (const f of F) out.push(...c[f[0]], ...c[f[1]], ...c[f[2]], ...c[f[0]], ...c[f[2]], ...c[f[3]]);
    this.tris(out, { ...o, pivot: o.pivot ?? [x, y, z] });
  }
  build(engine, uniforms) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.emit, 3));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.fx, 4));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.piv, 3));
    g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, fxMaterial(engine, uniforms));
    m.name = 'dais-fx'; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2;
    m.frustumCulled = false;                 // vertex animation moves parts outside the static bounds
    return m;
  }
}

// ------------------------------------------------------------------------------------------------ geometry helpers
/** Curved block: annulus sector r0..r1, a0..a1, y0..y1, as n hexa slices. */
function arcBlock(b, r0, r1, a0, a1, y0, y1, n, o) {
  for (let i = 0; i < n; i++) {
    const u0 = a0 + ((a1 - a0) * i) / n, u1 = a0 + ((a1 - a0) * (i + 1)) / n;
    b.hexa([P(r0, u0, y0), P(r0, u1, y0), P(r0, u0, y1), P(r0, u1, y1), P(r1, u0, y0), P(r1, u1, y0), P(r1, u0, y1), P(r1, u1, y1)], o);
  }
}
/** 8-gon annulus (flat face +z) centred on the current frame origin, circumradii R0 < R1, y0..y1. */
function octAnnulus(b, R0, R1, y0, y1, o, tints = null) {
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI / 8 + (i * TAU) / 8, a1 = a0 + TAU / 8;
    const p = (R, a, y) => new THREE.Vector3(Math.sin(a) * R, y, Math.cos(a) * R);
    b.hexa([p(R0, a0, y0), p(R0, a1, y0), p(R0, a0, y1), p(R0, a1, y1), p(R1, a0, y0), p(R1, a1, y0), p(R1, a0, y1), p(R1, a1, y1)],
      { ...o, tint: tints ? tints[i % tints.length] : (o.tint ?? 1) });
  }
}
/** Triangle with an outward hint (fixes winding). */
function tri(out, a, b2, c, hint) {
  const n = new THREE.Vector3().subVectors(b2, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.dot(hint) < 0) out.push(a.x, a.y, a.z, c.x, c.y, c.z, b2.x, b2.y, b2.z);
  else out.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, c.x, c.y, c.z);
}

// ------------------------------------------------------------------------------------------------ build
export default function build(engine, ctx) {
  const { circle, seats } = ctx.record;
  const C = new THREE.Vector3(circle.cx, 0, circle.cz);
  const b = new Builder(engine, { name: 'dais' });
  const fx = new FxBuilder();
  const UP = new THREE.Vector3(0, 1, 0);
  const solid = () => b._layer('solid').pos.length / 3;

  // ---- the dial ring: 30 dressed blocks (joints at each seat and half-way), 2 texels proud, real gaps
  const JOINT = 0.07, PH = 0.0173;          // PH: irrational-ish azimuth phase (no edges exactly on screen axes)
  for (let k = 0; k < 2 * N; k++) {
    const a0 = (k * TAU) / (2 * N) + JOINT / 2 / SEAT_R + PH, a1 = ((k + 1) * TAU) / (2 * N) - JOINT / 2 / SEAT_R + PH;
    const r = ctx.rng();
    // RING_TINT: one step duskier than the platform (v1's brown dial band), so the pale seat stones pop off it
    arcBlock(b, RING_IN, RING_OUT, a0, a1, -0.06, RING_TOP, 3, { tones: 'dial', pattern: 'none', tint: RING_TINT * (r < 0.3 ? 0.96 : r > 0.8 ? 1.04 : 1) });
  }
  // brass hour bars (v1 dial marks): 2x5-texel radial bars on the ring half-way between seats
  for (let k = 0; k < N; k++) {
    const a = ((k + 0.5) * TAU) / N, p = P((RING_IN + RING_OUT) / 2, a, RING_TOP);
    b.box(0.075, 0.035, 0.42, { tones: 'brass', ry: -a, at: [p.x, RING_TOP - 0.005, p.z] });
  }

  // ---- seats: pale two-course octagonal stones (axis aligned: crawl-safe), brass boss; candle stakes
  const seatRange = [], bossRange = [];
  const seatTop = 0.2;
  // candle-lit stone at night: the ashlar mid tinted by the candle, exactly what a toon PointLight pool does
  // (toon.js: mix toward toonMid0 * light / max, warmth 0.6), as 2 emissive bands (inner full, outer one step down)
  const warmOf = (ramp, k = 1) => {
    const m = lin(ramp[1]), g = lin(PAL.glow[1]), mx = Math.max(g.r, g.g, g.b);
    const w = new THREE.Color(1, 1, 1).lerp(g.multiplyScalar(1 / mx), 0.6);
    return m.multiply(w).multiplyScalar(k);
  };
  const CAP_HI = warmOf(PAL.ashlar, 1.0), CAP_LO = warmOf(PAL.ashlar, 0.66);
  const HOLY_LO = lin(PAL.holyGlow).multiplyScalar(0.42);
  const HALO_HI = warmOf([0, PAL.dial[0]], 0.94), HALO_LO = warmOf(PAL.dial, RING_TINT * 0.86), HALO_Y = DECAL - 0.008;
  for (let i = 0; i < N; i++) {
    const s = seats[i];
    const x = s.x - C.x, z = s.z - C.z;
    const r0 = solid();
    b.cylinder(0.43, 0.43, 0.18, { segments: 8, at: [x, -0.05, z], tones: 'ashlar', pattern: 'none' });
    b.cylinder(0.36, 0.36, 0.07, { segments: 8, at: [x, 0.13, z], tones: 'ashlar', pattern: 'none', tint: 1.03 });
    const r1 = solid();
    b.cylinder(0.12, 0.12, 0.035, { segments: 8, at: [x, seatTop, z], tones: 'brass' });
    seatRange.push([r0, r1]); bossRange.push([r1, solid()]);
    if (i === 0) {                                       // XII: a brass diamond on the ring's outer band
      const p = P(RING_OUT - 0.17, 0, RING_TOP);
      b.prism([[0, -0.11], [0.09, 0], [0, 0.11], [-0.09, 0]], 0.04, { tones: 'brass', rx: -Math.PI / 2, at: [p.x, RING_TOP, p.z] });
    }
    // candle stake (the seat marker) beside the seat, on the ring; a fat 3x4-texel church candle
    const pp = P(SEAT_R, postAngle(s.angle), 0);
    b.box(0.17, 0.035, 0.17, { tones: 'iron', at: [pp.x, RING_TOP, pp.z] });
    b.box(0.075, 0.4, 0.075, { tones: 'iron', at: [pp.x, RING_TOP, pp.z] });
    b.box(0.16, 0.04, 0.16, { tones: 'iron', at: [pp.x, RING_TOP + 0.4, pp.z] });
    b.box(0.1, 0.12, 0.1, { tones: PAL.ivory, at: [pp.x, RING_TOP + 0.44, pp.z] });
    const top = RING_TOP + 0.56;
    // candle flame (lit seats): 3x5-texel outer tongue + 2x3 core; ghost-light (dead with a vote left): a 6-texel
    // wide cold wisp with a white heart, and a cool pool on the stake foot
    fx.flame(pp.x, top, pp.z, 0.06, 0.24, { emit: PAL.glow[1], slot: S_CANDLE + i, kind: K_FLAME, phase: i * 0.37, layer: 0 }, 0.4);
    fx.flame(pp.x, top + 0.005, pp.z, 0.036, 0.13, { emit: PAL.glow[0], slot: S_CANDLE + i, kind: K_FLAME, phase: i * 0.37, layer: 1, pivot: [pp.x, top, pp.z] }, 0.4);
    fx.flame(pp.x, top - 0.06, pp.z, 0.11, 0.62, { emit: PAL.holyGlow, slot: S_WISP + i, kind: K_WISP, phase: i * 0.61 }, 0.3);
    fx.cube(pp.x, top + 0.11, pp.z + 0.04, 0.075, { emit: PAL.flowerWhite, slot: S_WISP + i, kind: K_WISP, phase: i * 0.61, layer: 1, pivot: [pp.x, top - 0.06, pp.z] });
    fx.octRing(pp.x, RING_TOP + DECAL, pp.z, 0.13, 0.3, { emit: HOLY_LO, slot: S_WISPOOL + i });
    // night: the lit candle warms its stone's top (2 bands, leaving the brass boss)
    fx.octRing(x, seatTop + 0.012, z, 0.13, 0.25, { emit: CAP_HI, slot: S_POOL + i });
    fx.octRing(x, seatTop + 0.012, z, 0.25, 0.36, { emit: CAP_LO, slot: S_POOL + i });
    // night: the candle's own light on the dial ring (no PointLight): a 2-band warm ellipse round the stake foot,
    // stretched along the ring (tangent 1.5x); inner band = the dial lit by the candle, outer one step down; a hole
    // for the stake's foot plate. Just under the sweep / nominee decals (they win where they overlap).
    {
      const ang = postAngle(s.angle), tx = Math.cos(ang), tz = Math.sin(ang), rx = Math.sin(ang), rz = -Math.cos(ang);
      const ell = (R) => Array.from({ length: 12 }, (_, j) => {
        const u = (j / 12) * TAU + 0.13, ta = Math.cos(u) * R * 1.5, ra = Math.sin(u) * R;
        return [pp.x + tx * ta + rx * ra, RING_TOP + HALO_Y, pp.z + tz * ta + rz * ra];
      });
      const band = (R0, R1, emit) => {
        const i0 = ell(R0), o0 = ell(R1);
        for (let j = 0; j < 12; j++) fx.fan([i0[j], o0[j], o0[(j + 1) % 12], i0[(j + 1) % 12]], { emit, slot: S_HALO + i });
      };
      band(0.12, 0.24, HALO_HI);
      band(0.24, 0.4, HALO_LO);
    }
    // nominated: ember halo round the stone (fire core + a 1-texel dark-ember outer line);
    // voted: the stone's top rim glows gold
    fx.octRing(x, RING_TOP + DECAL, z, 0.48, 0.6, { emit: PAL.fireGlow, slot: S_NOM + i });
    fx.octRing(x, RING_TOP + DECAL, z, 0.6, 0.65, { emit: PAL.glow[2], slot: S_NOM + i });
    fx.octRing(x, seatTop + 0.024, z, 0.25, 0.36, { emit: PAL.glow[1], slot: S_VOTE + i });
  }

  // ---- the Storyteller's dais: two kerb treads, sandstone platform + carved lip, dark floor, rose in relief
  b.cylinder(T0.R, T0.R, T0.y + 0.06, { segments: 8, at: [0, -0.06, 0], tones: 'kerb', pattern: 'ashlar', tint: 0.98 });
  b.cylinder(T1.R, T1.R, T1.y - T0.y + 0.02, { segments: 8, at: [0, T0.y - 0.02, 0], tones: 'kerb', pattern: 'ashlar' });
  b.cylinder(T2.R, T2.R, T2.y - T1.y + 0.02, { segments: 8, at: [0, T1.y - 0.02, 0], tones: 'kerb', pattern: 'ashlar', tint: 1.02 });
  b.cylinder(PLAT.R, PLAT.R, PLAT.y - T2.y + 0.02, { segments: 8, at: [0, T2.y - 0.02, 0], tones: 'dial', pattern: 'ashlar' });
  // step nosings: each tread's front edge a pale dressed sandstone band (proud of the tread), so every riser reads
  // as a step line - sun-lit by day, caught by the dais fire at night
  for (const T of [T0, T1, T2]) octAnnulus(b, T.R - 0.1, T.R + 0.012, T.y - 0.01, T.y + 0.012, { tones: 'dial', pattern: 'none' }, [1.04, 1, 1.06, 1]);
  octAnnulus(b, LIP.R0, LIP.R1, PLAT.y - 0.013, LIP.y, { tones: 'dial', pattern: 'none' }, [1, 0.97, 1.03, 1]);
  b.cylinder(FLOOR.R, FLOOR.R, FLOOR.y - (PLAT.y - 0.06), { segments: 8, at: [0, PLAT.y - 0.06, 0], tones: 'grout', pattern: 'none' });
  // compass rose: 8 kite points (ridge from the hub to the tip), N in brass, long points pale, short darker
  {
    const out = { pale: [], dark: [], brass: [] };
    const y0 = FLOOR.y + 0.012, yc = FLOOR.y + 0.1;
    for (let k = 0; k < 8; k++) {
      // long points on the DIAGONALS (an X star), short ones on the cardinals: a long N/S pair is foreshortened
      // to a fat screen-vertical blade at the 30 deg camera and read as a sword / dagger with the lectern.
      // N = a short fat brass diamond (still the brightest point, still at XII)
      const a = (k * TAU) / 8, long = k % 2 === 1;
      const L = k === 0 ? 0.62 : long ? 1.18 : 0.62, w = k === 0 ? 0.26 : long ? 0.25 : 0.2;
      const T = P(L, a, y0), Cc = new THREE.Vector3(0, yc, 0);
      const B1 = P(w, a - Math.PI / 8, y0), B2 = P(w, a + Math.PI / 8, y0);
      const dst = k === 0 ? out.brass : long ? out.pale : out.dark;
      tri(dst, Cc, B1, T, UP); tri(dst, Cc, T, B2, UP);
    }
    b.tris(out.pale, { tones: 'ashlar' });
    b.tris(out.dark, { tones: 'stone', tint: 0.96 });
    b.tris(out.brass, { tones: 'brass' });
    b.cylinder(0.1, 0.1, 0.06, { segments: 8, at: [0, yc - 0.025, 0], tones: 'brass' });   // straight: a tapered side face crawled 1/255
  }

  // ---- lectern with the open grimoire at the north edge (book faces the camera / the crowd)
  {
    // a wide, squat book-stand (not a pedestal: a tall thin stem on the screen-vertical axis read as a sword hilt):
    // a stone plinth slab, a carved desk body as wide as the book (dark timber front panel), the slanted rest on top
    const lz = -1.0, fy = FLOOR.y;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    b.box(0.66, 0.07, 0.4, { tones: 'ashlar', pattern: 'none', at: [0, fy - 0.01, lz] });
    b.box(0.5, 0.42, 0.28, { tones: 'ashlar', pattern: 'none', tint: 0.98, at: [0, fy + 0.06, lz] });
    b.box(0.36, 0.28, 0.03, { tones: 'timber', at: [0, fy + 0.12, lz + 0.14] });                    // front panel
    b.box(0.12, 0.12, 0.035, { tones: 'brass', at: [0, fy + 0.2, lz + 0.155] });                    // brass boss
    b.box(0.58, 0.05, 0.34, { tones: 'ashlar', pattern: 'none', tint: 1.03, at: [0, fy + 0.48, lz] });
    // slanted book rest (timber), tilted ~31 deg toward +z
    const wR = 0.33, yF = fy + 0.56, yB = fy + 0.76, zF = lz + 0.2, zB = lz - 0.15;
    b.hexa([V(-wR, yF - 0.06, zF), V(wR, yF - 0.06, zF), V(-wR, yF, zF), V(wR, yF, zF),
      V(-wR, yB - 0.06, zB), V(wR, yB - 0.06, zB), V(-wR, yB, zB), V(wR, yB, zB)], { tones: 'timber' });
    b.box(0.5, 0.2, 0.08, { tones: 'timber', tint: 0.95, at: [0, fy + 0.52, lz - 0.1] });             // rest's back block
    // grimoire: plum cover proud of the rest, two cream page blocks, crimson ribbon
    const lift = (t) => [yF + (yB - yF) * t, zF + (zB - zF) * t];
    const slab = (x0, x1, t0, t1, d0, d1, tones, tint = 1) => {
      const [ya, za] = lift(t0), [yb, zb] = lift(t1);
      b.hexa([V(x0, ya + d0, za), V(x1, ya + d0, za), V(x0, ya + d1, za), V(x1, ya + d1, za),
        V(x0, yb + d0, zb), V(x1, yb + d0, zb), V(x0, yb + d1, zb), V(x1, yb + d1, zb)], { tones, tint });
    };
    slab(-0.27, 0.27, 0.06, 0.94, -0.005, 0.03, 'plum');
    slab(-0.245, -0.012, 0.1, 0.9, 0.02, 0.07, 'cream', 1.02);
    slab(0.012, 0.245, 0.1, 0.9, 0.02, 0.07, 'cream', 0.98);
    b.box(0.035, 0.2, 0.025, { tones: PAL.bannerRed, at: [0.06, yF - 0.21, zF + 0.035] });
    // pages glow holy blue at night
    // one sheet over both page blocks (their full extent: a decal ending a texel short of the block, with the
    // sub-texel gutter showing between, flipped a texel on a whole-texel pan) + a 1.5-texel dim gutter line on it
    const [ya, za] = lift(0.1), [yb, zb] = lift(0.9);
    const pg = (x0, x1, dy) => [[x0, ya + dy, za], [x1, ya + dy, za], [x1, yb + dy, zb], [x0, yb + dy, zb]];
    fx.fan(pg(-0.245, 0.245, 0.074), { emit: PAL.holyGlow, slot: S_PAGES });
    fx.fan(pg(-0.025, 0.025, 0.08), { emit: lin(PAL.holyGlow).multiplyScalar(0.6), slot: S_PAGES });
  }

  // ---- two town banners on iron poles behind the lectern (north tread): red with a gold border and a gold dial
  for (const sx of [-1, 1]) {
    const bx = sx * 0.5, bz = -1.86, by = T1.y;
    b.box(0.2, 0.06, 0.2, { tones: 'iron', at: [bx, by - 0.01, bz] });
    b.box(0.075, 2.2, 0.075, { tones: 'iron', at: [bx, by, bz] });
    b.cylinder(0.06, 0.02, 0.14, { segments: 8, at: [bx, by + 2.2, bz], tones: 'brass' });           // finial
    b.box(0.62, 0.05, 0.06, { tones: 'iron', at: [bx + sx * 0.25, by + 2.02, bz + 0.05] });          // crossbar
    const cx = bx + sx * 0.27, top = by + 2.0, bot = by + 1.02, w2 = 0.24, zc = bz + 0.08;
    // cloth in 4 vertical folds (edges alternate 0.035 m in z: banded light, not a flat slab), swallow-tail hem
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const ex = [-w2, -w2 / 2, 0, w2 / 2, w2], ey = [bot, bot + 0.05, bot + 0.17, bot + 0.05, bot], ez = [0, 0.035, 0, 0.035, 0];
    for (let f = 0; f < 4; f++) {
      const [x0, x1] = [cx + ex[f], cx + ex[f + 1]], [z0, z1] = [zc + ez[f], zc + ez[f + 1]];
      b.hexa([V(x0, ey[f], z0 - 0.03), V(x1, ey[f + 1], z1 - 0.03), V(x0, top, z0 - 0.03), V(x1, top, z1 - 0.03),
        V(x0, ey[f], z0), V(x1, ey[f + 1], z1), V(x0, top, z0), V(x1, top, z1)], { tones: PAL.bannerRed });
    }
    b.box(w2 * 2 + 0.04, 0.07, 0.07, { tones: PAL.bannerGold, at: [cx, top - 0.07, zc - 0.005] });           // gold hem
    // (the gold dial emblem: a disc facing the camera, built rotated)
    b.push(M({ at: [cx, by + 1.58, zc + 0.045], rx: Math.PI / 2 }));
    b.cylinder(0.11, 0.11, 0.035, { segments: 8, tones: PAL.bannerGold });
    b.pop();
  }
  // a brass hourglass at the lectern's foot (the Storyteller's timer)
  {
    const hx = 0.54, hz = -0.98, hy = FLOOR.y;
    b.cylinder(0.11, 0.11, 0.04, { segments: 8, at: [hx, hy, hz], tones: 'brass' });
    b.cylinder(0.11, 0.11, 0.04, { segments: 8, at: [hx, hy + 0.3, hz], tones: 'brass' });
    for (const [dx, dz] of [[-0.075, -0.075], [0.075, -0.075], [-0.075, 0.075], [0.075, 0.075]]) b.box(0.035, 0.27, 0.035, { tones: 'timber', at: [hx + dx, hy + 0.035, hz + dz] });
    b.cylinder(0.035, 0.075, 0.12, { segments: 8, at: [hx, hy + 0.04, hz], tones: 'glass', layer: 'glass', glow: null });
    b.cylinder(0.075, 0.035, 0.12, { segments: 8, at: [hx, hy + 0.17, hz], tones: 'glass', layer: 'glass', glow: null });
    b.cylinder(0.06, 0.03, 0.05, { segments: 8, at: [hx, hy + 0.045, hz], tones: 'thatch' });            // the sand
  }

  // ---- 4 iron braziers on the lower tread at the diagonals
  const brazierTops = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const p = P(BRAZIER_R, a, T1.y);
    const by = T1.y;
    const V = (x, y, z) => new THREE.Vector3(p.x + x, y, p.z + z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {     // 4 splayed legs (tapered hexas)
      const f0 = 0.15, f1 = 0.08, t = 0.032;
      b.hexa([V(dx * f0 - t, by, dz * f0 - t), V(dx * f0 + t, by, dz * f0 - t), V(dx * f1 - t, by + 0.5, dz * f1 - t), V(dx * f1 + t, by + 0.5, dz * f1 - t),
        V(dx * f0 - t, by, dz * f0 + t), V(dx * f0 + t, by, dz * f0 + t), V(dx * f1 - t, by + 0.5, dz * f1 + t), V(dx * f1 + t, by + 0.5, dz * f1 + t)], { tones: 'iron' });
    }
    b.cylinder(0.1, 0.1, 0.05, { segments: 8, at: [p.x, by + 0.42, p.z], tones: 'iron', tint: 0.95 });
    b.cylinder(0.13, 0.25, 0.17, { segments: 8, at: [p.x, by + 0.47, p.z], tones: 'iron' });
    b.push(M({ at: [p.x, 0, p.z] }));
    octAnnulus(b, 0.2, 0.29, by + 0.6, by + 0.66, { tones: 'brass' });
    b.pop();
    brazierTops.push(new THREE.Vector3(p.x, by + 0.62, p.z));
  }
  // fire (3 layers at different frame rates: outer tongues, mid, core) + coals + embers
  // the bowl's inner rim lit by its own fire: the brass rim's inner half warm-lit (2 bands: inner face glow orange,
  // top inner band hot brass) - the bowls read as full of fire, not as dark iron cups with a flame stuck on top
  const RIM_HOT = lin(PAL.brass[0]).lerp(lin(PAL.glow[0]), 0.35), RIM_FACE = lin(PAL.glow[2]).lerp(lin(PAL.fireGlow), 0.5);
  brazierTops.forEach((q, k) => {
    const yR = q.y + 0.04;                              // = the rim top (by + 0.66) + a hair
    fx.octRing(q.x, yR + 0.002, q.z, 0.2, 0.245, { emit: RIM_HOT, slot: S_RIM });
    {                                                   // inner faces of the rim (octagon R 0.19, 1 cm inside the brass)
      const out = [];
      for (let i = 0; i < 8; i++) {
        const a0 = Math.PI / 8 + (i * TAU) / 8, a1 = a0 + TAU / 8, R = 0.19;
        const A = [q.x + Math.sin(a0) * R, q.z + Math.cos(a0) * R], B = [q.x + Math.sin(a1) * R, q.z + Math.cos(a1) * R];
        const y0 = q.y - 0.02, y1 = yR;
        out.push(A[0], y0, A[1], B[0], y1, B[1], B[0], y0, B[1], A[0], y0, A[1], A[0], y1, A[1], B[0], y1, B[1]);   // wound to face the bowl's centre
      }
      fx.tris(out, { emit: RIM_FACE, slot: S_RIM });
    }
    fx.octRing(q.x, q.y + 0.03, q.z, 0, 0.21, { emit: PAL.glow[2], slot: S_COAL });
    for (const [dx, dz] of [[-0.07, 0.02], [0.05, 0.05], [0.02, -0.06]]) fx.cube(q.x + dx, q.y + 0.03, q.z + dz, 0.06, { emit: PAL.fireGlow, slot: S_COAL });
    const tongues = [[-0.07, 0.03, 0.08, 0.36], [0.06, -0.02, 0.075, 0.3], [0.0, 0.05, 0.1, 0.46]];
    tongues.forEach(([dx, dz, w, h], j) => {
      fx.flame(q.x + dx, q.y, q.z + dz, w, h, { emit: PAL.fireGlow, slot: S_BRAZ + k, kind: K_FLAME, phase: k * 0.29 + j * 0.53, layer: 0 });
    });
    fx.flame(q.x + 0.01, q.y, q.z + 0.03, 0.075, 0.3, { emit: PAL.lampGlow, slot: S_BRAZ + k, kind: K_FLAME, phase: k * 0.41 + 0.2, layer: 1 });
    fx.flame(q.x, q.y, q.z + 0.04, 0.042, 0.17, { emit: PAL.glow[0], slot: S_BRAZ + k, kind: K_FLAME, phase: k * 0.67 + 0.5, layer: 2 });
    for (let e = 0; e < 4; e++) fx.cube(q.x + (e - 1.5) * 0.06, q.y + 0.25, q.z + 0.02, 0.04, { emit: e % 2 ? PAL.glow[1] : PAL.fireGlow, slot: S_EMBER, kind: K_EMBER, phase: e * 0.27 + k * 0.13, layer: 2 });
  });

  // ---- sweep light: a lit arc of the ring under the hand's tip (rotates with the hand)
  // the sweep light lives on the ring's own dressed blocks (joints stay dark, so it reads as light ON the stone,
  // not a UI wedge): the block(s) under the long hand's tip glow as warm-lit sandstone, the block behind it holds a
  // dim ember afterglow. Colours = the dial's lit tone pulled toward the lamp glow (2 bands, never one flat fill).
  {
    const dialHi = lin(PAL.dial[0]).multiplyScalar(RING_TINT);
    const LEAD = dialHi.clone().lerp(lin(PAL.glow[1]), 0.88), TRAIL = dialHi.clone().lerp(lin(PAL.glow[1]), 0.4);
    const ins = 0.035 / SEAT_R;
    for (let k = 0; k < 2 * N; k++) {
      const a0 = (k * TAU) / (2 * N) + JOINT / 2 / SEAT_R + PH + ins, a1 = ((k + 1) * TAU) / (2 * N) - JOINT / 2 / SEAT_R + PH - ins;
      fx.arc(RING_IN + 0.035, RING_OUT - 0.035, a0, a1, RING_TOP + DECAL, 3, { emit: LEAD, slot: S_BLOCK + k });
      fx.arc(RING_IN + 0.035, RING_OUT - 0.035, a0, a1, RING_TOP + DECAL - 0.004, 3, { emit: TRAIL, slot: S_TRAIL + k });
    }
  }
  // night: a faint gilt line along each hand's spine so the dial still reads in the dark
  const HANDLINE = lin(PAL.brass[0]).multiplyScalar(0.5);
  const spine = (r0, r1, y, w, kind) => fx.fan([[-w, y, -r0], [w, y, -r0], [w, y, -r1], [-w, y, -r1]], { emit: HANDLINE, slot: S_HANDLINE, kind });
  spine(HAND_R0 + 0.45, HAND_R1 - 0.3, 0.055 + 0.012, 0.025, K_HAND);
  spine(HAND_R0 + 0.45, HOUR_R1 - 0.3, 0.035 + 0.012, 0.03, K_HOUR);

  const group = b.build();
  group.name = 'dais';

  // ---- states mesh (kit solid): crimson pennants for the seat on the block, collapsed when hidden
  const sb = new Builder(engine, { name: 'dais-states' });
  const penRange = [], crackRange = [];
  const sNow = () => sb._layer('solid').pos.length / 3;
  for (let i = 0; i < N; i++) {
    const a = seats[i].angle, pp = P(SEAT_R, postAngle(a), 0);
    // the pennant flies on the side of the stake away from its seat stone (outward when that is screen-vertical),
    // on the camera side: 7x10 texels of crimson with a gold hem, hung from an iron arm under the candle cup
    const awayX = pp.x - seats[i].x + C.x;
    const sx = Math.abs(awayX) > 0.35 ? Math.sign(awayX) : (Math.sin(a) < -1e-6 ? -1 : 1);
    const r0 = sNow();
    const yA = RING_TOP + 0.36, zc = pp.z + 0.06;
    sb.box(0.32, 0.04, 0.04, { tones: 'iron', at: [pp.x + sx * 0.16, yA, pp.z + 0.03] });
    sb.box(0.04, 0.04, 0.05, { tones: 'brass', at: [pp.x + sx * 0.32, yA - 0.005, pp.z + 0.03] });
    const x0 = sx > 0 ? 0.05 : -0.29;
    sb.prism([[0, 0], [0.24, 0], [0.24, -0.32], [0.12, -0.23], [0, -0.32]], 0.03, { tones: PAL.bannerRed, at: [pp.x + x0, yA, zc] });
    sb.box(0.24, 0.05, 0.035, { tones: PAL.bannerGold, at: [pp.x + x0 + 0.12, yA - 0.07, zc + 0.012] });
    penRange.push([r0, sNow()]);
    // dead: a crack across the stone's top and a moss fleck (shown with the cold grey stone)
    const c0 = sNow(), sx0 = seats[i].x - C.x, sz0 = seats[i].z - C.z, yC = seatTop - 0.004;
    sb.box(0.2, 0.012, 0.04, { tones: 'iron', at: [sx0 - 0.17, yC, sz0 + 0.05] });
    sb.box(0.04, 0.012, 0.1, { tones: 'iron', at: [sx0 - 0.07, yC, sz0 + 0.1] });
    sb.box(0.12, 0.012, 0.04, { tones: 'iron', at: [sx0 + 0.15, yC, sz0 - 0.12] });
    sb.box(0.1, 0.035, 0.07, { tones: 'mossTuft', at: [sx0 + 0.24, 0.13, sz0 + 0.31] });
    sb.box(0.06, 0.03, 0.06, { tones: 'mossTuft', at: [sx0 + 0.34, 0.13, sz0 + 0.21] });
    crackRange.push([c0, sNow()]);
  }
  const states = sb.build();
  group.add(states);

  // ---- the clock hands (own meshes, rotate about the centre in stepped poses); built pointing at XII (-z).
  // Long (minute) hand = the vote sweep; short (hour) hand = the nominee / the block. Rest pose: 10:10.
  const makeHand = (name, r1, wS, wA, y1, tint) => {
    const hb = new Builder(engine, { name });
    const y0 = -0.02, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const s0 = HAND_R0 + 0.3, s1 = r1 - 0.5;
    hb.box(wS, y1 - y0, s1 - s0 + 0.02, { tones: 'brass', tint, at: [0, y0, -(s0 + s1) / 2] });
    for (let i = 0; i < 8; i++) {                         // counterweight loop at the tail
      const a0 = Math.PI / 8 + (i * TAU) / 8, a1 = a0 + TAU / 8, cz = -(HAND_R0 + 0.16);
      const p = (R, a, y) => V(Math.sin(a) * R, y, cz + Math.cos(a) * R);
      hb.hexa([p(0.09, a0, y0), p(0.09, a1, y0), p(0.09, a0, y1), p(0.09, a1, y1), p(0.19, a0, y0), p(0.19, a1, y0), p(0.19, a0, y1), p(0.19, a1, y1)], { tones: 'brass', tint: tint * (i % 2 ? 0.97 : 1.02) });
    }
    // arrowhead: a flat spade laid on the setts
    hb.prism([[-wA, 0], [wA, 0], [0.07, 0.24], [0, 0.56], [-0.07, 0.24]], y1 - y0, { tones: 'brass', tint, rx: -Math.PI / 2, at: [0, (y0 + y1) / 2, -(r1 - 0.56)] });
    hb.cylinder(0.14, 0.14, y1 - y0 + 0.012, { segments: 8, at: [0, y0, -(HAND_R0 + 0.3 + (s1 - s0) * 0.38)], tones: 'brass', tint: tint * 1.04 });   // the hand's eye
    const pivot = new THREE.Group();
    pivot.name = `${name}-pivot`;
    pivot.add(hb.build());
    group.add(pivot);
    return pivot;
  };
  const handPivot = makeHand('dais-hand-long', HAND_R1, 0.14, 0.24, 0.055, 1);
  const hourPivot = makeHand('dais-hand-short', HOUR_R1, 0.17, 0.27, 0.035, 0.97);

  const uniforms = { uLevel: { value: new Float32Array(NSLOT) }, uHandAngle: { value: 0 }, uHourAngle: { value: 0 } };
  group.add(fx.build(engine, uniforms));
  const pool = brazierPool(engine, ctx.tod);
  group.add(pool.mesh);
  group.position.copy(C);
  group.updateMatrixWorld(true);

  // ---- state
  const solidMesh = group.children.find((o) => o.userData.layer === 'solid');
  const stateMesh = states.children.find((o) => o.userData.layer === 'solid');
  const stoneAttr = ['color', 'toneHi', 'toneSh'].map((n) => solidMesh.geometry.getAttribute(n));
  const stoneOrig = stoneAttr.map((a) => Float32Array.from(a.array));
  // dead: the warm pale stone drains to cold grey-violet field stone (a stone, not a hole: hi/mid stay light, the
  // darkest tone is left to the outline); with its ghost vote still unspent it keeps a faint blue cast; the brass
  // boss dulls to pewter
  const DEAD = toTones('stone');
  const GHOST = toTones('stone'); ['hi', 'mid', 'sh'].forEach((k, j) => GHOST[k].lerp(lin(PAL.slate[j]), 0.28));
  const PEWTER = toTones([PAL.stone[1], PAL.iron[0], PAL.iron[1]]);
  const penPos = stateMesh.geometry.getAttribute('position');
  const penOrig = Float32Array.from(penPos.array);

  const blank = () => ({ occupied: false, dead: false, ghostVote: false, nominated: false, onBlock: false, voteHand: false });
  const state = {
    phase: 'day', seats: Array.from({ length: N }, () => ({ ...blank(), occupied: true })),
    vote: { from: 0, t0: 0, perSeat: 1.2 }, hand: null, night: ctx.night,
  };

  function paintSeat(i) {
    const s = state.seats[i];
    const stoneT = s.ghostVote ? GHOST : DEAD;
    for (const [[a, c], T] of [[seatRange[i], stoneT], [bossRange[i], PEWTER]]) {
      stoneAttr.forEach((attr, k) => {
        const arr = attr.array, orig = stoneOrig[k], col = [T.mid, T.hi, T.sh][k];
        for (let v = a; v < c; v++) {
          if (s.dead) { arr[v * 3] = col.r; arr[v * 3 + 1] = col.g; arr[v * 3 + 2] = col.b; } else for (let q = 0; q < 3; q++) arr[v * 3 + q] = orig[v * 3 + q];
        }
        attr.needsUpdate = true;
      });
    }
    for (const [[p0, p1], show] of [[penRange[i], s.onBlock], [crackRange[i], s.dead]]) {
      for (let v = p0; v < p1; v++) for (let q = 0; q < 3; q++) penPos.array[v * 3 + q] = show ? penOrig[v * 3 + q] : penOrig[p0 * 3 + q];
    }
    penPos.needsUpdate = true;
  }
  const norm = (st) => {
    if (typeof st === 'string') {
      const o = blank();
      if (st !== 'empty') o.occupied = true;
      if (st === 'dead') { o.dead = true; o.ghostVote = true; }
      if (st === 'nominated') o.nominated = true;
      if (st === 'voting') o.voteHand = true;
      return o;
    }
    return { ...blank(), occupied: true, ...st };
  };
  const setSeat = (i, st) => {
    if (!(i >= 0 && i < N)) return;
    state.seats[i] = norm(st);
    paintSeat(i);
  };
  const setPhase = (p, opts = {}) => {
    state.phase = p;
    if (p === 'vote') state.vote = { ...state.vote, ...opts, from: opts.from ?? Math.max(0, state.seats.findIndex((s) => s.nominated)) };
  };
  for (let i = 0; i < N; i++) paintSeat(i);

  // ---- pure function of t (+ the current state): fx levels and the hand
  const L = uniforms.uLevel.value;
  const seatAngle = (i) => (i * TAU) / N;
  function voteProgress(t) {
    const { from, t0, perSeat } = state.vote;
    const q = (t - t0) / perSeat, k = Math.floor(q);
    return { k: Math.max(0, Math.min(N, k + 1)), from, f: k + 1 > N ? 1 : q - k };     // k = seats reached (1 = first after the nominee)
  }
  // the long hand starts on the FIRST VOTER (the seat clockwise of the nominee - BotC order) and steps seat to
  // seat in 3-pose stop-motion, ending on the nominee; it never starts on top of the short hand
  function handAngle(t) {
    if (state.hand !== null && state.hand !== undefined) return seatAngle(state.hand);
    const ph = state.phase;
    if (ph === 'execution') return seatAngle(Math.max(0, state.seats.findIndex((s) => s.onBlock)));
    if (ph === 'vote') {
      const { k, from, f } = voteProgress(t);
      if (k <= 1) return seatAngle(from + 1);
      const step = Math.min(3, Math.floor((f / 0.3) * 3) + 1);    // stop-motion: 3 poses in the first 30 %, then hold
      return seatAngle(from + k - 1) + (seatAngle(1) * step) / 3;
    }
    return REST_LONG;
  }
  function hourTarget() {
    const ph = state.phase;
    const nom = state.seats.findIndex((s) => s.nominated), blk = state.seats.findIndex((s) => s.onBlock);
    if (ph === 'execution' && blk >= 0) return seatAngle(blk);
    if ((ph === 'vote' || ph === 'nomination') && nom >= 0) return ph === 'vote' ? seatAngle(state.vote.from) : seatAngle(nom);
    return REST_SHORT;
  }
  const angDist = (x, y) => { const d = (((x - y) % TAU) + TAU) % TAU; return Math.min(d, TAU - d); };
  /** The short hand never lies on (or within 0.75 seat of) the long one: it parks at 10 o'clock (or 2) instead. */
  function hourAngle(longA) {
    const h = hourTarget(), near = seatAngle(1) * 0.75;
    if (angDist(h, longA) >= near) return h;
    return angDist(REST_SHORT, longA) >= near ? REST_SHORT : REST_LONG;
  }
  // the composer's PointLight for our fire anchor (scenes add it after build): its colour follows the fire level
  let fireLight, fireBase;
  const fireAnchor = new THREE.Vector3(C.x, 1.2, C.z);
  function findLight() {
    if (fireLight !== undefined) return fireLight;
    let found = null;
    engine.scene.traverse((o) => { if (!found && o.isPointLight && o.position.distanceTo(fireAnchor) < 1e-3) found = o; });
    fireLight = found;                       // searched once, at the first rendered frame (null at noon: no lights)
    if (found) fireBase = found.color.clone();
    return found;
  }
  function update(t, live = true) {
    const ph = state.phase;
    const pulse = Math.floor(t * 4) % 2 ? 0.6 : 1.0;
    const fire = { day: 0.75, nomination: 0.9, vote: 1.3, execution: 1.45, night: 0 }[ph] ?? 0.75;
    for (let k = 0; k < 4; k++) L[S_BRAZ + k] = fire;
    L[S_COAL] = fire === 0 ? 0.55 : 1.0;
    L[S_RIM] = fire === 0 ? 0.6 : 1.0;
    L[S_EMBER] = fire;
    L[S_PAGES] = ph === 'night' || state.night ? 1 : 0;
    const vp = ph === 'vote' ? voteProgress(t) : null;
    for (let i = 0; i < N; i++) {
      const s = state.seats[i];
      L[S_CANDLE + i] = s.occupied && !s.dead ? (s.nominated ? 1.35 : 1) : 0;
      L[S_WISP + i] = s.occupied && s.dead && s.ghostVote ? 1 : 0;
      L[S_NOM + i] = (ph === 'execution' ? s.onBlock : s.nominated && ph !== 'night') ? pulse : 0;
      let voted = s.voteHand;
      if (vp) { const off = (i - vp.from + N) % N || N; voted = voted && off <= vp.k; }
      L[S_VOTE + i] = voted && ph !== 'night' ? 1 : 0;
      L[S_POOL + i] = state.night && L[S_CANDLE + i] > 0 ? 1 : 0;
      L[S_HALO + i] = L[S_POOL + i];
      L[S_WISPOOL + i] = L[S_WISP + i] > 0 ? (Math.floor(t * 4 + i * 0.61 * 5) % 4 === 0 ? 0.8 : 1) : 0;
    }
    // sweep: light the ring block(s) under the long hand's tip, ember on the block behind it
    const a = handAngle(t);
    const blk = (x) => { const u = (((x - PH) % TAU) + TAU) % TAU; return Math.floor(u / (TAU / (2 * N))) % (2 * N); };
    for (let k = 0; k < 2 * N; k++) { L[S_BLOCK + k] = 0; L[S_TRAIL + k] = 0; }
    if (ph === 'vote') {
      const d4 = TAU / 90;                                   // 4 deg: at a seat pose both blocks round the stone
      L[S_BLOCK + blk(a)] = 1; L[S_BLOCK + blk(a + d4)] = 1;
      const tb = blk(a - 3 * d4);
      if (!L[S_BLOCK + tb]) L[S_TRAIL + tb] = 1;
    }
    L[S_HANDLINE] = state.night ? 1 : 0;
    const fl = live ? findLight() : null;
    if (fl) fl.color.copy(fireBase).multiplyScalar(fire === 0 ? 0.6 : fire > 1 ? 1.15 : 1);   // night phase: coals still light the stage
    // the baked pool on the setts: only while the composer gave our fire anchor a PointLight (golden / night), its
    // brightness stepping with the fire (and the light's own stepped flicker); night phase = the coals' low glow
    pool.uGain.value = fl ? (fire === 0 ? 0.4 : Math.min(1.15, fire)) * Math.min(1, fl.intensity / FIRE_I) : 0;
    const h = hourAngle(a);
    handPivot.rotation.y = -a;
    hourPivot.rotation.y = -h;
    uniforms.uHandAngle.value = -a;
    uniforms.uHourAngle.value = -h;
  }

  // review / demo state from URL params: ?dais=demo&daisPhase=vote|day|nomination|execution|night
  const prm = ctx.params;
  if (prm?.get?.('dais') === 'demo') {
    setSeat(3, { dead: true, ghostVote: true });
    setSeat(11, { dead: true, ghostVote: false });
    setSeat(13, 'empty');
    setSeat(6, { nominated: true });
    for (const i of [7, 9, 10, 12, 0, 1]) setSeat(i, { voteHand: true });
    setSeat(2, { onBlock: true, voteHand: true });
    setPhase(prm.get('daisPhase') ?? 'vote', { from: 6, t0: 0, perSeat: Number(prm.get('daisPer') ?? 0.5) });
  } else if (prm?.has?.('daisPhase')) setPhase(prm.get('daisPhase'));
  update(0, false);

  // ---- anchors (world space)
  const W = (x, y, z) => new THREE.Vector3(C.x + x, y, C.z + z);
  return {
    group,
    update: (t) => update(t),
    anchors: {
      seats: seats.map((s) => new THREE.Vector3(s.x, seatTop + 0.035, s.z)),
      spots: {
        center: W(0, FLOOR.y + 0.01, 0), storyteller: W(0, FLOOR.y + 0.01, 0.2), lectern: W(0, FLOOR.y + 0.78, -1.0),
        ...Object.fromEntries(brazierTops.map((q, k) => [`brazier${k}`, W(q.x, q.y, q.z)])),
      },
      // the braziers' pool: ONE light for the whole stage + plaza (the game happens here: at night the circle must be
      // the warmest place in the frame). Warm lamp tone (fireGlow x the grey setts went muddy brown-red), r 6 /
      // intensity 2.6 (the treads reach the full band) from 1.2 m up; the toon reach is clamped by the time-of-day pointReach (night 4 m, golden 3 m), so
      // in practice: stage + treads full band, the setts out to ~3 m stepped down; the seat ring gets its light from
      // the candle halos (emissive decals, no PointLights)
      lights: [{ pos: W(0, 1.2, 0), color: PAL.glow[1], r: 6, intensity: FIRE_I, kind: 'fire', flicker: true }],
      perches: [W(0, FLOOR.y + 0.8, -1.12)],                 // the lectern's top edge (a raven reading the grimoire)
    },
    api: {
      seatPos: (i, nn = 15) => ctx.layout.seatPos(i, nn),
      setSeat, setPhase,
      setHand: (i) => { state.hand = i; },
      setNight: (on) => { state.night = !!on; },
      state,
    },
    stats: { seats: N },
  };
}
