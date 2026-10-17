// Lumen (char-moth) — cast member "moth", villager (lantern): "Lights the lamps at dusk; cannot resist them."
// Design sheet (Unique to me, timing charts, self-critique): characters/moth.md. Touch-up: point, ghost, ghost-spent
// (GHOST_GLSL + halo bone), gentle die (no hurt flash). Identity source (read only):
// pipgws/packages/assets/scripts/cast/moth.ts + refs/cast/moth.png.
// Body plan (r3): upright CHIBI (chibi(), 2.15 heads — the v2 moth WALKS, wings folded as a cape) + 2 keyed wing bones on
// the back with hinged outer flaps (wingFlapL/R: twist unfolds them flat for vote / emote / die), 2 fan antennae and a
// lantern under the LEFT paw — all KEYED bones, no spring chains (r2's springs popped inside holds). Gait: legacy Gait chibi
// recipe (CAST_PORTING §8) at the v2 game speed, playing authored clips.walk/run (wing scissor + flutter, lantern carried
// out in front, antenna dip, bob); LegGait sat this 0.29 m-legged chibi down (module backlog).
// Lantern glass: emissive through the toon `tones` hook, QUANTISED by time of day (day: unlit glass; dusk/golden: lit;
// night: hot, warm #FFD27A) — a pure function of the sky ramp, no uTime flicker (deterministic). The night PointLight is
// scene code: shots/char-moth/night.js (`attachLumenLight`), there is no spec.lights (look backlog).
import * as THREE from 'three';
import { chibi } from '../src/chars/rig.js';
import * as K from '../src/chars/kit.js';

export const H = 1.36;                       // castHeight(34): ground → antenna tips
export const SKH = 1.12;                     // template height = top of the fluffy head
export const V_GAME = 3.95 * H;              // 5.37 m/s (v2 150 px/s on a 38 px sprite, relative to body height)
const FR_GAME = V_GAME * V_GAME / (9.81 * 0.3635);   // game Froude on the chibi hip (meta.hipsY 0.3635)

// [hi, mid, sh] sRGB. 5 slots + 1 accent (glow). No pure white (cream fluff hi #F6EEDC), no black (eyes #2E2440).
export const PALETTE = {
  fluff: ['#F8F0DE', '#E8D8B6', '#A99098'],   // signature 1: fluffy head (lightest mass), collar, paws
  wing: ['#E4D0A8', '#C4AC84', '#8A7484'],    // folded pale wings (cape), one step darker than the fluff
  coat: ['#8C5C46', '#5E3C30', '#42303C'],    // little brown coat, sleeves, legs, boots, wing eyespots
  ant: ['#E2A858', '#A46E3A', '#6A4A3E'],     // signature 2: feathery antennae; brass buttons, hem band, lantern frame (r3: a value step below the cream head, which it merged with under golden light)
  eye: ['#3A3050', '#2E2440', '#272036'],     // big glossy eyes, mouth, boots + shins (r3: hi darkened from #5C4C7C)
  glow: ['#FFD27A', '#FFB04A', '#D07A3A'],    // accent: lantern glass (emissive at dusk / night; r3: warm night hi, was near-white #FFF2C0)
};

const deg = Math.PI / 180;
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// arm segment directions at rest: [out°, fwd°] (L side; R mirrored). The LEFT forearm reaches forward so the lantern
// hangs in front of the left hip (v2: lantern low at the left paw), clear of the wing panel behind.
// r3: the LEFT arm rests holding the lantern OUT IN FRONT (upper arm fwd 45, forearm fwd 85): LegGait cannot play
// authored walk poses, so the rest pose IS the walk's lantern carry (glass in front of the left hip at S/SE/E).
const ARM = { L: { up: [15, 45], fore: [5, 85] }, R: { up: [12, 4], fore: [10, 24] } };
const armDir = ([o, f]) => { const O = o * deg, F = f * deg; return [Math.sin(O) * Math.cos(F), -Math.cos(O) * Math.cos(F), Math.sin(F)]; };
// antennae (L side): joint near the crown, sweeping up + out + a little back (≥ 35° off vertical at every facing)
export const ANT = { at: [0.085, 0.47, 0.03], dir: [0.62, 1, -0.42], len: 0.36, fan: 40 };
// wing joints on the upper back (chest-local) and the folded panel's rows: [down a, inner x, outer x, back z, wrap z]
export const WING = { at: [0.072, 0.105, -0.115], fold: [0.075, -0.2, -0.125], rows: [[0.0, -0.06, 0.10, -0.03, 0.0], [0.2, -0.066, 0.2, -0.13, 0.17], [0.39, -0.066, 0.25, -0.19, 0.3]] };
const EYE = { x: 0.128, y: 0.25, z: 0.228, yaw: 20 };
const HALO_K = 0.001, HALO_Y = 0.66;           // halo authored scale; joint height above the chin (head top 0.515)

export function skeleton() {
  const S0 = chibi({ height: SKH, heads: 2.15, legs: 0.7, arms: 0.85, snout: 0, ears: false, tail: false, jaw: false, shoulders: 0.34, hips: 0.15,
    face: { eye: [EYE.x, EYE.y, EYE.z], brow: false, mouth: [0, 0.105, 0.236] },
    chains: { ant: { n: 1, parent: 'head', at: ANT.at, dir: ANT.dir, len: ANT.len, mirror: true } } });
  const S = S0.map((b) => ({ ...b }));
  // arms authored BENT at rest (gait swings about this rest; bone axes stay 'down')
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    for (const [n, a] of [[`forearm${s}`, ARM[s].up], [`hand${s}`, ARM[s].fore]]) {
      const b = S.find((x) => x.name === n), d = armDir(a), len = Math.hypot(...b.pos);
      b.pos = [sx * len * d[0], len * d[1], len * d[2]];
    }
  }
  // wings: keyed (not sprung) bones on the upper back, rest = folded down behind the coat. out + spreads them.
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    S.push({ name: `wing${s}`, parent: 'chest', pos: [sx * WING.at[0], WING.at[1], WING.at[2]], axis: 'down' });
    // r3: the outer flap (wrapped forward round the coat) hinges on the fold line → twist + UNFOLDS it flat with the
    // back panel (vote / emote / die), so a raised wing is one broad panel instead of a flap curling over the face
    S.push({ name: `wingFlap${s}`, parent: `wing${s}`, pos: [sx * WING.fold[0], WING.fold[1], WING.fold[2]], axis: 'down' });
  }
  // lantern: ONE pendulum link under the left paw (the chain's tip hangs along −Y from the joint)
  S.push({ name: 'lantern0', parent: 'handL', pos: [0, -0.05, 0.01], axis: 'down' });
  // (touch-up, ghost) HALO bone above the crown, between the antennae (they pass x ±0.2 at that height). Its ring is
  // authored at HALO_K scale (a speck buried in the joint: never seen while alive); the ghost clip keys 'halo.s' to grow
  // it back. Its world scale / the head's is also the GHOST SIGNAL the shader reads (GHOST_GLSL): 1 alive, 2 =
  // ghost-spent (no halo, dimmer), 1/HALO_K = ghost with the vote unspent (halo shown). Last bone → index = array index.
  S.push({ name: 'halo', parent: 'head', pos: [0, HALO_Y, -0.02], axis: 'up' });
  return Object.defineProperties(S, { sockets: { value: S0.sockets }, meta: { value: S0.meta } });
}

export function parts(S) {
  const m = S.meta;
  const P = [];
  const add = (bone, shape, at, color, extra = {}) => P.push({ bone, shape, at, color, ...extra });

  // ── head (joint = chin): ONE fluffy ball (10-sided lathe: chunky facets = the fuzzy rim at 1x)
  const HEAD = [[0.13, 0], [0.235, 0.06], [0.282, 0.17], [0.285, 0.29], [0.24, 0.42], [0.13, 0.5], [0, 0.515]];
  add('head', K.lathe(HEAD, 10, { sz: 0.94 }), [0, 0.515 / 2, 0], 'fluff', { name: 'head' });
  // (a cheek fluff ring turned half a facet was tried: +5 isolated px on the signature, no visible fuzz at 1x → removed)
  // big glossy eyes: dark 3×4-texel pads turned outward 36°, a 1-texel light glint up-inside
  add('eyeL', K.xf(K.chamferBox(0.125, 0.15, 0.05, 0.3), { rot: [0, EYE.yaw, 0] }), [0, 0, 0], 'eye', { name: 'eye', mirror: true });
  add('eyeL', K.xf(K.box(0.044, 0.044, 0.03), { rot: [0, EYE.yaw, 0] }), [-0.03, 0.05, 0.026], 'fluff', { name: 'glint', mirror: true });
  add('mouth', K.box(0.06, 0.03, 0.03), [0, 0, 0], 'eye', { name: 'mouth' });

  // ── antennae (r3): a FAN frond — 2-texel stalk widening to a 6-texel comb tip — in a plane turned ANT.fan° out of
  // the frontal plane (normal front-out), so it reads ≥ 3 texels wide at S/SE/SW AND in profile at E/W (r2's 1-texel
  // stalk + lobes read as a stair stick at dir 1 and as owl's ear spike at E/W). Two lobes (lower, upper) = the comb notch.
  {
    const u = norm(ANT.dir), L = ANT.len, a = ANT.fan * deg;
    const w = norm([Math.cos(a), 0, -Math.sin(a)]);            // across the fan: HORIZONTAL, outward + back (L side)
    const n = norm(cross(w, u));                                // slab thickness axis (fan normal, forward-ish)
    const T = 0.075;                                            // 2.7 texels: the edge-on (far) frond still reads at dir 1
    const P3 = (al, wd, t) => [0, 1, 2].map((i) => u[i] * al + w[i] * wd + n[i] * t);
    const slab = (pts) => K.hull(pts.flatMap(([al, wd]) => [P3(al, wd, -T / 2), P3(al, wd, T / 2)]));
    add('antL0', slab([[0, -0.03], [0, 0.03], [0.16, -0.035], [0.16, 0.035]]), [0, 0, 0], 'ant', { name: 'antenna', mirror: true });
    add('antL0', slab([[0.1, -0.03], [0.1, 0.03], [0.22, -0.075], [0.24, 0.075], [0.25, 0]]), [0, 0, 0], 'ant', { name: 'antenna', mirror: true });
    add('antL0', slab([[0.2, -0.03], [0.2, 0.03], [0.32, -0.095], [0.34, 0.095], [0.37, -0.04], [0.37, 0.04]]), [0, 0, 0], 'ant', { name: 'antenna', mirror: true });
  }

  // ── body: brown coat (bell skirt on hips, upper on chest), brass hem band of the same profile, 2 brass buttons
  const hemY = 0.15, waistY = m.spineY + 0.02, shY = m.shoulderY + 0.02;
  const rAt = (y) => 0.21 + (0.165 - 0.21) * (y - hemY) / (waistY - hemY);
  const skirt = (y0, y1, color, name) => add('hips', K.frustum(8, rAt(y0), rAt(y1), y1 - y0, { sz: 0.9 }), [0, (y0 + y1) / 2 - m.hipsY, 0], color, { name });
  skirt(hemY, hemY + 0.055, 'ant', 'hem');
  skirt(hemY + 0.055, waistY, 'coat', 'skirt');
  add('hips', K.frustum(8, rAt(hemY) - 0.004, rAt(hemY) - 0.004, 0.012, { sz: 0.9 }), [0, hemY + 0.006 - m.hipsY, 0], 'coat', { name: 'hemSole' });
  add('chest', K.frustum(8, 0.17, 0.13, shY - waistY + 0.02, { sz: 0.9 }), [0, (shY + waistY) / 2 - 0.01 - m.chestY, 0], 'coat', { name: 'coatTop' });
  for (const [y, bn] of [[0.30, 'hips'], [0.45, 'chest']]) {
    const r = y < waistY ? rAt(y) : 0.165 - (y - waistY) * 0.3;
    add(bn, K.box(0.055, 0.055, 0.03), [0, y - m[bn === 'hips' ? 'hipsY' : 'chestY'], r * 0.9 + 0.008], 'ant', { name: 'button' });
  }
  // fuzzy collar: two 8-sided rings, the second turned 22.5° (a 16-point fluffy ruff)
  add('chest', K.lathe([[0.2, 0], [0.205, 0.04], [0.13, 0.085]], 8), [0, shY - m.chestY + 0.02, -0.005], 'wing', { name: 'collar' });
  add('chest', K.xf(K.lathe([[0.185, 0], [0.19, 0.04], [0.12, 0.08]], 8), { rot: [0, 22.5, 0] }), [0, shY - m.chestY + 0.03, -0.005], 'wing', { name: 'collar2' });

  // ── arms: brown sleeves along the bent rest directions, fluffy paws
  const seg = (bone, d, len, r0, r1, name, color = 'coat') => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...d));
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    add(bone, K.xf(K.frustum(4, r1, r0, len), { rot: [e.x, e.y, e.z].map((r) => r / deg) }), d.map((v) => v * len / 2), color, { name });
  };
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1, m3 = (v) => [sx * v[0], v[1], v[2]];
    seg('upperArm' + sd, m3(armDir(ARM[sd].up)), m.upperArm + 0.02, 0.066, 0.062, 'sleeve' + sd);
    seg('forearm' + sd, m3(armDir(ARM[sd].fore)), m.forearm, 0.062, 0.07, 'cuff' + sd);
    const d = armDir(ARM[sd].fore);
    add('hand' + sd, K.chamferBox(0.085, 0.085, 0.085, 0.4), [sx * d[0] * 0.03, d[1] * 0.03, d[2] * 0.03], 'wing', { name: 'paw' });
  }

  // ── legs (r3): shins + boots in the dark EYE slot under a hem raised to 0.15 m, so each footfall reads against the
  // brown coat and the grass (r2: brown boots under the brown coat never showed contact at dir 1/2)
  add('thighL', K.frustum(4, 0.06, 0.056, m.thigh), [0, -m.thigh / 2, 0], 'coat', { name: 'thigh', mirror: true });
  add('shinL', K.frustum(4, 0.058, 0.062, m.shin), [0, -m.shin / 2, 0], 'eye', { name: 'shin', mirror: true });
  add('footL', K.chamferBox(0.11, m.ankleY + 0.015, 0.16, 0.4), [0, -m.ankleY / 2 + 0.008, 0.035], 'eye', { name: 'boot', mirror: true });

  // ── wings (folded cape): per wing a back panel + an outer flap wrapping forward round the coat, built in the wing
  // bone's rest frame (hangs along −Y). Same slot + bone → no inner line between them. A dark eyespot on the back.
  {
    const T = 0.05, R = WING.rows;
    const back = [], flap = [];
    for (const [a, xi, xo, z, wz] of R) {
      const xm = xi + (xo - xi) * 0.55;
      for (const q of [-1, 1]) {
        back.push([xi, -a, z + q * T / 2], [xm, -a, z + q * T / 2]);
        flap.push([xm - 0.01, -a, z + q * T / 2], [xo, -a, z + wz + q * T / 2]);
      }
    }
    add('wingL', K.hull(back), [0, 0, 0], 'wing', { name: 'wingBack', mirror: true });
    add('wingFlapL', K.hull(flap), [-WING.fold[0], -WING.fold[1], -WING.fold[2]], 'wing', { name: 'wingFlap', mirror: true });
    // eyespot: a 3-texel disc proud of the back surface at 55 % down (the v2 'SPOT' ring)
    const a = 0.25, zs = -0.13 - 0.06 * (a - 0.22) / 0.21 - T / 2 - 0.006;
    add('wingL', K.xf(K.prism(8, 0.05, 0.014), { rot: [90, 0, 0] }), [0.115, -a, zs], 'coat', { name: 'eyespot', mirror: true });
  }

  // ── lantern on lantern0 (joint under the paw, hangs along −Y): ring handle, cap, glowing glass, base
  add('lantern0', K.box(0.035, 0.05, 0.035), [0, -0.02, 0], 'ant', { name: 'lanternHandle' });
  add('lantern0', K.frustum(4, 0.095, 0.04, 0.05), [0, -0.065, 0], 'ant', { name: 'lanternCap' });
  add('lantern0', K.box(0.125, 0.14, 0.125), [0, -0.16, 0], 'glow', { name: 'glass' });   // r3: 4.5 × 5 texels (was 0.105 × 0.12)
  add('lantern0', K.box(0.145, 0.04, 0.145), [0, -0.245, 0], 'ant', { name: 'lanternBase' });
  // ── ghost halo (touch-up): a flat 12-sided ring r 0.08-0.13 m (9 texels wide) over the crown, authored at HALO_K
  const ring = K.lathe([[0.08, 0], [0.13, 0], [0.13, 0.035], [0.08, 0.035], [0.08, 0]], 12);
  add('halo', K.xf(ring, { scale: HALO_K }), [0, 0, 0], 'ant', { name: 'halo' });
  return P;
}

// ── lantern glass glow (toon `tones` hook, fragment). Recognised by its mid tone. Time of day from the toon ramp's hi
// luma (sky.js: morning 0.97, noon 1.0, golden 0.64, night 0.29), QUANTISED into 3 levels — day: plain lit glass;
// dusk (golden): lit lamp; night: hot. No uTime → deterministic, freezes with the stage.
export const GLOW_LEVELS = { dusk: 0.85, night: 0.45 };
const glsl3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`; };
const GLOW_TONES = /* glsl */`
  if (distance(diffuseColor.rgb, ${glsl3(PALETTE.glow[1])}) < 0.03) {
    float gL = dot(uRampHi, vec3(0.299, 0.587, 0.114));
    if (gL < ${GLOW_LEVELS.dusk.toFixed(2)}) {
      totalEmissiveRadiance = gL < ${GLOW_LEVELS.night.toFixed(2)} ? ${glsl3(PALETTE.glow[0])} : ${glsl3(PALETTE.glow[1])};
      toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
    }
  }`;

// ── (touch-up) GHOST look through the characterMaterial hooks (no shared code; same scheme as mushroom/frog).
// vertex: ghost signal = world scale of 'halo' / world scale of 'head' (1 alive, 2 spent, 1000 ghost); halo and lantern
// vertices flagged by skin index (rigid skinning). fragment: every tone is re-mapped by its luminance onto a pale
// blue ramp (spent: greyer, dimmer), so the eyes / glint / mouth keep their value steps; the lower coat and the wing
// tips dissolve through a 2x2 ordered dither (discard) from bind height GHOST_FADE[1] (solid) to [0] (gone); the
// lantern keeps its glass (she still carries it: "cannot resist them") — no dither, no warm glow; the halo = pale gold.
export const GHOST_COL = {
  lo: '#40567E', hi: '#E6F6FF',                // live ghost ramp (dark → light)
  halo: ['#FFF6CC', '#F4D98A', '#C9A25A'],
  glass: ['#F6FDFF', '#DDF3FF', '#B4D6EE'],    // the lantern's glass = a cold ghost-light (lit at dusk / night)
};
const GHOST_FADE = { live: [0.12, 0.42], spent: [0.16, 0.48] };
const GHOST_GLSL = {
  vertexHead: 'flat varying float vMothGhost; flat varying float vMothHalo; flat varying float vMothLamp;',
  vertex: (headI, haloI, lampI) => `
    vMothGhost = 0.0; vMothHalo = 0.0; vMothLamp = 0.0;
    #ifdef USE_SKINNING
      {
        float gH = length(getBoneMatrix(${headI}.0)[0].xyz);
        float gS = length(getBoneMatrix(${haloI}.0)[0].xyz) / max(gH, 1e-6);
        vMothGhost = gS > 100.0 ? 1.0 : (gS > 1.5 ? 2.0 : 0.0);
        vMothHalo = abs(skinIndex.x - ${haloI}.0) < 0.5 ? 1.0 : 0.0;
        vMothLamp = abs(skinIndex.x - ${lampI}.0) < 0.5 ? 1.0 : 0.0;
      }
    #endif`,
  fragmentHead: `flat varying float vMothGhost; flat varying float vMothHalo; flat varying float vMothLamp;
    vec3 mothGhostTone(vec3 c, float spent) {
      float l = pow(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 0.55);
      vec3 g = mix(${glsl3(GHOST_COL.lo)}, ${glsl3(GHOST_COL.hi)}, l);
      return spent > 0.5 ? mix(g, vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), 0.5) * 0.66 : g;
    }`,
  tones: `
    if (vMothGhost > 0.5) {
      float gSpent = vMothGhost > 1.5 ? 1.0 : 0.0;
      if (vMothHalo > 0.5) {
        toonHi = ${glsl3(GHOST_COL.halo[0])}; toonMid = ${glsl3(GHOST_COL.halo[1])}; toonSh = ${glsl3(GHOST_COL.halo[2])};
      } else {
        if (vMothLamp < 0.5) {
          float gLo = mix(${GHOST_FADE.live[0].toFixed(3)}, ${GHOST_FADE.spent[0].toFixed(3)}, gSpent);
          float gHi = mix(${GHOST_FADE.live[1].toFixed(3)}, ${GHOST_FADE.spent[1].toFixed(3)}, gSpent);
          float gA = clamp((vCharBind.y - gLo) / (gHi - gLo), 0.0, 1.0);
          ivec2 gq = ivec2(gl_FragCoord.xy) & 1;
          float gT = gq.x == 0 ? (gq.y == 0 ? 0.125 : 0.625) : (gq.y == 0 ? 0.875 : 0.375);
          if (gA < gT) discard;
        }
        if (vMothLamp > 0.5 && distance(diffuseColor.rgb, ${glsl3(PALETTE.glow[1])}) < 0.03) {
          float gL = dot(uRampHi, vec3(0.299, 0.587, 0.114));
          float gk = gSpent > 0.5 ? 0.72 : 1.0;     // spent: the ghost-light dims with her
          toonHi = ${glsl3(GHOST_COL.glass[0])} * gk; toonMid = ${glsl3(GHOST_COL.glass[1])} * gk; toonSh = ${glsl3(GHOST_COL.glass[2])} * gk;
          if (gL < ${GLOW_LEVELS.dusk.toFixed(2)}) { totalEmissiveRadiance = ${glsl3(GHOST_COL.glass[1])} * (gSpent > 0.5 ? 0.5 : 1.0); toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0); }
        } else {
          toonHi = mothGhostTone(toonHi, gSpent); toonMid = mothGhostTone(toonMid, gSpent); toonSh = mothGhostTone(toonSh, gSpent);
        }
      }
    } else {${GLOW_TONES}
    }`,
};

/** Night factor the glass shader uses (0 day, 1 dusk, 2 night) — for scene lights. */
export function glowLevel(engine) {
  const c = engine.toonUniforms?.uRampHi?.value;
  if (!c) return 0;
  const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return l < GLOW_LEVELS.night ? 2 : l < GLOW_LEVELS.dusk ? 1 : 0;
}
/** Scene code: a warm PointLight in the lantern (no spec.lights yet). Steady, stepped by time of day. */
export function attachLumenLight(engine, socket, { color = '#FF6A28', intensity = [0, 1.4, 3.2], distance = 2.2, decay = 1.5 } = {}) {
  const pl = new THREE.PointLight(new THREE.Color(color), 0, distance, decay);
  pl.name = 'moth-lantern-light';
  socket.add(pl);
  const set = () => { pl.intensity = intensity[glowLevel(engine)]; };
  set(); engine.onUpdate(set);
  return pl;
}

// ── clips (pose triples [fwd, twist, out] deg; 30 Hz grid) ──────────────────────────────────────────────────────
// r3: NO spring chains. Antennae and lantern are plain bones KEYED per drawing (r2's sprung antennae re-snapped 104 px
// inside the vote hold, 47 px in the die hold and redrew 39-100 px 2 frames after every talk key; loop clips ignore
// clip.dynamics). wings (down bones): fwd + = panel swings forward, out + = spread; 'wingL.s' unfurls (stretch).
// antennae (up-ish bones): fwd + = bend forward. lantern0 (down bone under the left paw): rest = hangs plumb when the
// arm is at rest; keys counter-rotate it when the arm moves (UPRIGHT = held up by its base, glass above the paw).
const EYES = (sx, sy) => ({ 'eyeL.s': [sx, sy, 0], 'eyeR.s': [sx, sy, 0] });
const SHUT = EYES(0.1, -0.78), WIDE = EYES(0.15, 0.22);
const MOUTH = (o, w = 0) => ({ 'mouth.s': [w, o, 0] });
const WINGS = (fwd, out, tw = 0) => ({ wingL: [fwd, tw, out], wingR: [fwd, tw, out] });
const FLAPS = (tw) => ({ wingFlapL: [0, tw, 0], wingFlapR: [0, tw, 0] });
const UNFURL = (k) => ({ 'wingL.s': [0.25 * k, k, 0.1 * k], 'wingR.s': [0.25 * k, k, 0.1 * k] });
const ANTS = (fwd, out = 0) => ({ antL0: [fwd, 0, out], antR0: [fwd, 0, out] });
const KNEES = (a) => ({ thighL: [a, 0, 0], shinL: [-2 * a, 0, 0], thighR: [a, 0, 0], shinR: [-2 * a, 0, 0] });
const breath = (d, extra = {}) => ({ pos: [0, -0.012 - 0.028 * d, 0], chest: [4 * d, 0, 0], head: [-4 * d, 0, 0],
  ...WINGS(0, 4 + 4 * d), upperArmR: [3 * d, 0, 0], lantern0: [-4 * d, 0, 0], ...extra });

// vote: wings flung UP into a V behind the head and unfurled (tips clear the head top), lantern held up by its base
// out to the left side (clear of the face), right paw up, antennae perked, eyes wide.
export const VOTE_UP = { pos: [0, 0.01, 0], spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-10, 0, 0], ...WIDE, ...MOUTH(0.8),
  ...WINGS(-22, 140), ...FLAPS(60), ...UNFURL(0.8), ...ANTS(-18, 12),
  upperArmL: [10, 0, 125], forearmL: [-20, 0, 0], lantern0: [180, 0, -20], upperArmR: [30, 0, 70], forearmR: [40, 0, 0] };
const DEAD = { pos: [0, -0.2, -0.16], hips: [-78, 0, 0], spine: [-4, 0, 0], chest: [-2, 0, 0], head: [-8, -20, 0], ...SHUT, ...MOUTH(0.6),
  thighL: [100, 0, 14], shinL: [-70, 0, 0], thighR: [100, 0, 14], shinR: [-70, 0, 0],
  upperArmL: [-10, 0, 60], forearmL: [-40, 0, 0], lantern0: [60, 0, 0], upperArmR: [60, 0, 50], forearmR: [40, 0, 0], ...WINGS(0, 72), ...FLAPS(50), ...ANTS(30, -10) };

// walk / run (legacy Gait plays these upper bodies; one step key per gait drawing, length 4, f0 = left contact):
// FLUTTER-SCURRY — contact drawings: the wings scissor (one back, one forward), body low, antennae dip; pass (flight)
// drawings: both wings flutter OPEN, body high, antennae up. The lantern arm only sways ±8° (lantern0 counter-keyed:
// it stays plumb, carried out in front of the left hip); the right paw swings opposite the near leg.
const gaitKey = (side, up, k = 1) => up
  ? { pos: [0, 0.03 * k, 0], chest: [-2, 0, 0], ...WINGS(-6 * k, 30 * k), ...ANTS(-12 * k, 6),
    upperArmL: [0, 0, 0], lantern0: [0, 0, 0], upperArmR: [0, 0, 8], forearmR: [30, 0, 0] }
  : { pos: [0, -0.03 * k, 0], chest: [3, 0, 0], head: [-3, 0, 0], ANT: 0, ...ANTS(10 * k, -4),
    wingL: [side * 34 * k, 0, 10], wingR: [-side * 34 * k, 0, 10],
    upperArmL: [side * 8, 0, 0], lantern0: [-side * 8, 0, 0], upperArmR: [side * 26 * k, 0, 8], forearmR: [30 + 10 * k, 0, 0] };
const strip = (o) => { const { ANT, ...r } = o; return r; };
const GAIT = (k) => ({ fps: 30, loop: true, interp: 'step', length: 4, keys: [
  { f: 0, pose: strip(gaitKey(-1, false, k)) }, { f: 1, pose: strip(gaitKey(-1, true, k)) },
  { f: 2, pose: strip(gaitKey(1, false, k)) }, { f: 3, pose: strip(gaitKey(1, true, k)) }] });

export const CLIPS = {
  walk: GAIT(1),
  run: GAIT(1.3),
  // idle: breathe (extremes held 30 / 30), a blink, and a nervous glance over her RIGHT shoulder (toward the camera at
  // dir 1, so the face stays on screen) with an antenna twitch — all keyed drawings, no springs
  idle: { fps: 30, loop: true, interp: 'step', length: 72, keys: [
    { f: 0, pose: breath(0) },
    { f: 30, pose: breath(1) },
    { f: 36, pose: breath(1, SHUT) },
    { f: 38, pose: breath(1) },
    { f: 54, pose: breath(0, { head: [-4, -26, -4], neck: [0, -8, 0], ...ANTS(-16, 10) }) },
    { f: 66, pose: breath(0) },
  ] },
  // talk (loop 20): mouth-OPEN keys tip the head UP (face to the camera), shut keys level; the free right paw gestures
  // out to the side (out ≥ 60, clear of the face at SW); antennae flick with the beat (keyed)
  talk: { fps: 30, loop: true, interp: 'step', length: 20, events: { 0: 'speak' }, keys: [
    { f: 0, pose: { pos: [0, -0.012, 0], chest: [-4, -8, 0], head: [-16, -6, 0], ...MOUTH(1.6, 0.3), ...WINGS(0, 6), ...ANTS(-16, 8),
      upperArmR: [40, 0, 75], forearmR: [50, 0, 0], handR: [0, -30, 0] } },
    { f: 5, pose: { pos: [0, -0.04, 0], chest: [3, 0, 0], head: [4, 6, -4], ...MOUTH(0), ...WINGS(0, 4), ...ANTS(10),
      upperArmR: [12, 0, 22], forearmR: [30, 0, 0] } },
    { f: 10, pose: { pos: [0, -0.012, 0], chest: [-4, 6, 0], head: [-16, 4, 4], ...MOUTH(1.6, 0.3), ...WINGS(0, 6), ...ANTS(-16, 8),
      upperArmR: [60, 0, 62], forearmR: [40, 0, 0], handR: [0, -40, 0] } },
    { f: 15, pose: { pos: [0, -0.04, 0], chest: [3, 0, 0], head: [4, -6, 4], ...MOUTH(0.3), ...WINGS(0, 4), ...ANTS(10),
      upperArmR: [16, 0, 26], forearmR: [45, 0, 0] } },
  ] },
  // vote: a 3-frame dip (wings gathered, lantern drawn in) → VOTE_UP in frame 3, HELD (repeat at f30 = identical drawing)
  vote: { fps: 30, loop: false, interp: 'step', events: { 3: 'vote@lantern' }, keys: [
    { f: 0, pose: { pos: [0, -0.05, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [-6, 0, 0], ...WINGS(8, 0), ...ANTS(14),
      upperArmL: [-25, 0, -4], forearmL: [-20, 0, 0], lantern0: [45, 0, 0] } },
    { f: 3, pose: VOTE_UP },
    { f: 30, pose: VOTE_UP },
  ] },
  // die (touch-up: GENTLE, no hurt reaction): a faint swoon — eyes droop, head tips back, the free paw goes to her brow,
  // wings and antennae sag (8 frames, no flash) → knees buckle, eyes shut → she sinks back onto the grass → dead-bug
  // pose: legs and arms up, wings spread flat on the ground, antennae limp, lantern beside her → a soft settle → held.
  // (r3 opened on a flinch + 'hurt' flash with wide eyes and an open mouth = a hit reaction: removed, Clocktower rule)
  die: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 18: 'land' }, keys: [
    { f: 0, pose: { pos: [0, -0.02, -0.02], spine: [-4, 0, 4], chest: [-8, 0, 6], head: [-14, 10, 8], ...EYES(0, -0.5), ...MOUTH(0.5), ...WINGS(2, 18), ...ANTS(16, -6),
      upperArmR: [80, 0, 40], forearmR: [100, 0, 0], handR: [0, 0, 0], upperArmL: [-10, 0, 8], lantern0: [10, 0, 0] } },
    { f: 8, pose: { pos: [0, -0.11, 0], spine: [14, 0, 6], chest: [8, 0, 0], head: [-6, 0, 0], ...SHUT, ...KNEES(55), ...WINGS(4, 22), ...ANTS(25, -5),
      upperArmR: [20, 0, 20], forearmR: [40, 0, 0], upperArmL: [-30, 0, 10], lantern0: [10, 0, 0] } },
    { f: 13, pose: { pos: [0, -0.16, -0.08], hips: [-40, 0, 0], head: [6, 0, 0], ...SHUT, thighL: [60, 0, 10], shinL: [-80, 0, 0], thighR: [60, 0, 10], shinR: [-80, 0, 0],
      ...WINGS(0, 50), ...ANTS(30, -10), upperArmL: [-20, 0, 50], forearmL: [-30, 0, 0], lantern0: [40, 0, 0], upperArmR: [30, 0, 50], forearmR: [30, 0, 0] } },
    { f: 18, pose: DEAD },
    { f: 20, pose: { ...DEAD, pos: [0, -0.17, -0.16], thighL: [80, 0, 18], shinL: [-90, 0, 0], thighR: [80, 0, 18], shinR: [-90, 0, 0] } },
    { f: 24, pose: DEAD },
    { f: 62, pose: DEAD },
  ] },
  // lamp (emote: "cannot resist them"): she looks down at the lantern → lifts it before her face, eyes wide → TOSSES it
  // up (lantern0.p: the lamp flies 0.5-0.8 m up, above her head) and flutter-hops after it (wings beat 112 ↔ 46 on
  // 4-frame drawings, flaps unfolded, heart glyph, gaze up on the lamp) → catches it as she lands → sheepish head shake
  // → idle. (A chibi arm tops out at chin height: the toss is the only way the lamp gets above her head.)
  lamp: { fps: 30, loop: false, interp: 'step', legs: 'fk', events: { 12: ['emote:heart', 'flap@wingTipL'], 20: 'flap@wingTipR', 28: 'land' }, keys: [
    { f: 0, pose: { pos: [0, -0.012, 0], head: [14, 8, 0], neck: [4, 0, 0], ...WIDE, ...ANTS(30), ...WINGS(0, 10) } },
    { f: 6, pose: { pos: [0, -0.03, 0], spine: [-6, 0, 0], head: [-14, 4, 0], ...WIDE, ...MOUTH(1.0), ...ANTS(-10, 10), ...WINGS(-10, 45),
      upperArmL: [70, 0, 10], forearmL: [-50, 0, 0], lantern0: [180, 0, 0], ...KNEES(14) } },
    { f: 12, pose: { pos: [0, 0.13, 0.03], spine: [-8, 0, 0], head: [-26, 4, 0], ...WIDE, ...MOUTH(1.0), ...ANTS(-16, 10), ...WINGS(-6, 112), ...FLAPS(50),
      upperArmL: [100, 0, 10], forearmL: [-20, 0, 0], lantern0: [120, 0, 0], 'lantern0.p': [0, 0, 0.25], thighL: [40, 0, 6], shinL: [-70, 0, 0], thighR: [30, 0, 6], shinR: [-60, 0, 0] } },
    { f: 16, pose: { pos: [0, 0.17, 0.05], spine: [-8, 0, 0], head: [-28, 4, 0], ...WIDE, ...MOUTH(1.0), ...ANTS(-16, 10), ...WINGS(4, 46),
      upperArmL: [100, 0, 10], forearmL: [-20, 0, 0], lantern0: [120, 0, 0], 'lantern0.p': [0, 0, 0.5], thighL: [30, 0, 6], shinL: [-50, 0, 0], thighR: [40, 0, 6], shinR: [-70, 0, 0] } },
    { f: 20, pose: { pos: [0, 0.15, 0.07], spine: [-8, 0, 0], head: [-28, 4, 0], ...WIDE, ...MOUTH(1.0), ...ANTS(-16, 10), ...WINGS(-6, 112), ...FLAPS(50),
      upperArmL: [100, 0, 10], forearmL: [-20, 0, 0], lantern0: [120, 0, 0], 'lantern0.p': [0, 0, 0.58], thighL: [40, 0, 6], shinL: [-70, 0, 0], thighR: [30, 0, 6], shinR: [-60, 0, 0] } },
    { f: 24, pose: { pos: [0, 0.08, 0.08], spine: [-6, 0, 0], head: [-20, 4, 0], ...WIDE, ...MOUTH(1.0), ...ANTS(-10, 10), ...WINGS(4, 46),
      upperArmL: [100, 0, 10], forearmL: [-20, 0, 0], lantern0: [120, 0, 0], 'lantern0.p': [0, 0, 0.2], thighL: [20, 0, 6], shinL: [-30, 0, 0], thighR: [20, 0, 6], shinR: [-30, 0, 0] } },
    { f: 28, pose: { pos: [0, -0.09, 0.08], spine: [10, 0, 0], head: [-4, 0, 0], ...SHUT, ...ANTS(20), ...WINGS(0, 20), upperArmL: [-10, 0, 0], lantern0: [8, 0, 0], ...KNEES(40) } },
    { f: 34, pose: { pos: [0, -0.02, 0.06], head: [0, -24, -10], ...EYES(0, -0.4), ...ANTS(-10, 15), ...WINGS(0, 8), upperArmR: [40, 0, 20], forearmR: [80, 0, 0], ...KNEES(8) } },
    { f: 40, pose: { pos: [0, -0.02, 0.04], head: [0, 20, 10], ...EYES(0, -0.4), ...MOUTH(0.4, 0.4), ...ANTS(-10, -10), ...WINGS(0, 8), upperArmR: [40, 0, 20], forearmR: [80, 0, 0], ...KNEES(8) } },
    { f: 46, pose: { ...breath(0), pos: [0, -0.012, 0.02] } },
    { f: 52, pose: breath(0) },
  ] },
};

// ── point (touch-up: the game's shared emote) — she points at someone in front with her free RIGHT paw (the lantern
// stays in the left at its carry). Nervous: she draws the paw in to her collar (eyes wide, antennae perked) → the arm
// flicks straight out ahead at shoulder height, body leaning in, BOTH antennae swing forward along the point (her own
// "pointer", unique to a moth), "!" glyph → a second firmer point (mouth open: "her!") → she catches herself: paw back
// to the collar, wings wrapped in, shy glance aside → idle.
// (8-facing variants shots/char-moth/t3/v1-v6: a lone chibi paw pointing ahead hides under the big head at SE; the
// LANTERN thrust out ahead at chest height is what reads at dir 1 — she lights up the one she means.)
const POINT = (d = 0, extra = {}) => ({ pos: [0, -0.012 - 0.02 * d, 0.02 * d], spine: [4 + 3 * d, -8, 0], chest: [6 + 3 * d, -10, 0], head: [-12, 6, 0],
  ...WIDE, ...ANTS(30 + 6 * d, -6), ...WINGS(-4, 12), upperArmR: [100 - 6 * d, 0, 0], forearmR: [-30, 0, 0], handR: [0, 0, 0],
  upperArmL: [50 + 6 * d, 0, 20], forearmL: [-50, 0, 0], lantern0: [-50 - 6 * d, 0, 0], ...extra });
CLIPS.point = { fps: 30, loop: false, interp: 'step', events: { 4: 'emote:exclaim' }, keys: [
  { f: 0, pose: { pos: [0, -0.04, 0], chest: [-4, -8, 0], head: [-6, 6, 0], ...WIDE, ...ANTS(-16, 10), ...WINGS(6, 0),
    upperArmR: [-15, 0, 10], forearmR: [80, 0, 0] } },
  { f: 4, pose: POINT(0) },
  { f: 16, pose: POINT(1, MOUTH(1.4, 0.3)) },
  { f: 28, pose: POINT(0) },
  { f: 38, pose: { pos: [0, -0.04, 0], chest: [4, 0, 0], head: [-6, 24, 8], ...EYES(0, -0.4), ...ANTS(14, -8), ...WINGS(8, 0),
    upperArmR: [40, 0, -6], forearmR: [80, 0, 0] } },
  { f: 48, pose: breath(0) },
] };

// ── ghost / ghost-spent (touch-up). Dead players hover as a pale blue ghost (v1 ghost row; gold halo while the ghost
// vote is unspent). In the spec only:
//   * hover: root up (the leg-reach dip pulls ≤ 0.1 m back; net hover measured in the md), a slow 4-drawing moth flutter
//     (wings half open 26 ↔ 50, flaps unfolded, step keys 0.6 s apart) with a 1-texel bob, eyes half shut, the right paw
//     at her collar, the lantern at its carry. Shins + boots scaled away ('shin*.s' −0.98): legs on the ground IK can't
//     dangle in a loop clip, and a ghost has no feet in v1;
//   * pale: GHOST_GLSL (tones remapped, lower coat + wing tips dithered away, lantern kept, halo pale gold);
//   * spent: lower, wings drooped, head bowed, eyes nearly shut, no halo, greyer + dimmer.
const GHOST_UP = 1 / HALO_K - 1, GHOST_SPENT = 1;
const HIDE_LEGS = { 'shinL.s': [-0.98, -0.98, -0.98], 'shinR.s': [-0.98, -0.98, -0.98] };
const GHOSTP = (y, w, roll, halo, extra = {}) => ({ pos: [0, y, 0], spine: [0, 0, roll], chest: [2, 0, roll * 0.5], head: [-8, 0, -roll],
  ...EYES(0, -0.45), ...WINGS(-6, w), ...FLAPS(0.6 * w), ...ANTS(6, 6), upperArmR: [45, 0, -6], forearmR: [80, 0, 0], ...HIDE_LEGS,
  upperArmL: [30, 0, 0], lantern0: [-30, 0, 0],      // lantern lifted to her chest (it hung down to the grass under the faded coat)
  'halo.s': [halo, halo, halo], ...extra });
const ghostClip = (hi, lo, w0, w1, roll, halo, extra) => ({ fps: 30, loop: true, interp: 'step', length: 72, dynamics: 'hold', keys: [
  { f: 0, pose: GHOSTP(hi, w1, roll, halo, extra) },
  { f: 18, pose: GHOSTP((hi + lo) / 2, (w0 + w1) / 2, 0, halo, extra) },
  { f: 36, pose: GHOSTP(lo, w0, -roll, halo, extra) },
  { f: 54, pose: GHOSTP((hi + lo) / 2, (w0 + w1) / 2, 0, halo, extra) },
] });
CLIPS.ghost = ghostClip(0.26, 0.23, 26, 50, 3, GHOST_UP);
CLIPS['ghost-spent'] = ghostClip(0.2, 0.17, 10, 22, 2, GHOST_SPENT, { head: [2, 0, 0], ...EYES(0, -0.62), ...ANTS(22, -6) });

export function make() {
  const S = skeleton();
  return {
    name: 'moth',
    height: H,
    palette: PALETTE,
    signature: ['fluff', { part: 'antenna' }],
    faceSlot: 'fluff',
    bodyPlan: 'uprightAnimal',
    heightPx: [44, 56],
    gameSpeed: { v: V_GAME, drawings: 4, gait: 'scurry' },
    emote: 'lamp',
    skeleton: S,
    parts: parts(S),
    sockets: { lantern: { bone: 'lantern0', at: [0, -0.16, 0] },
      wingTipL: { bone: 'wingL', at: [0.22, -0.36, -0.12] }, wingTipR: { bone: 'wingR', at: [-0.22, -0.36, -0.12] } },
    // r3: no spring chains (antennae + lantern are keyed bones; see the clips header)
    chains: [],
    personality: { body: { f: 4, zeta: 0.5, r: 0 }, head: { f: 4.5, zeta: 0.55, r: 0 } },
    // r3: LEGACY Gait chibi recipe (CAST_PORTING §8), not LegGait: LegGait's body drop sat this 0.29 m-legged chibi down
    // at 4 H/s (hips −0.2 m: coat on the grass, lantern sunk out of sight, a "gliding head" at 1×; skeleton-chef lesson)
    // and it ignores authored walk poses. The legacy Gait keeps the legs straight and plays clips.walk/run (GAIT above:
    // wing scissor/flutter, lantern carry, antenna dip, bob). WALK branch at v_game (runFroude above the game Froude).
    locomotion: { walkSpeed: V_GAME, runSpeed: 2 * V_GAME, stride: 0.55 * H, runStride: 1.05 * H, duty: [0.18, 0.1], reach: 0.6, poses: [4, 4],
      lift: [0.04 * H, 0.05 * H], bob: [0.035, 0.035], lean: [6, 12], runFroude: [FR_GAME * 1.5, FR_GAME * 2] },
    character: { legIK: 'pose', quant: { yaw: 8, chain: 4 } },
    clips: CLIPS,
    // FX: wing dust = the feather kind in her wing tones; vote sparkles at the raised lantern; heart glyph in the emote
    fx: { feather: [PALETTE.wing[0], PALETTE.wing[2]], vote: { node: 'lantern' } },
    // tones = lantern glow (alive) + ghost / ghost-spent look (GHOST_GLSL); bone indices = skeleton order
    material: { tones: GHOST_GLSL.tones, vertexHead: GHOST_GLSL.vertexHead, fragmentHead: GHOST_GLSL.fragmentHead,
      vertex: GHOST_GLSL.vertex(S.findIndex((b) => b.name === 'head'), S.findIndex((b) => b.name === 'halo'), S.findIndex((b) => b.name === 'lantern0')),
      slots: { wing: { lift: 0.3 } }, sides: { eyeL: 'mid', eyeR: 'mid', antL0: 'mid', antR0: 'mid', wingL: 'mid', wingR: 'mid', wingFlapL: 'mid', wingFlapR: 'mid', lantern0: 'mid' } },
  };
}

export default make();
