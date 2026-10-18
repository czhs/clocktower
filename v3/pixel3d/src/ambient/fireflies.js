// Ambient system "fireflies" (owner: fireflies). Night insects and glows + their daytime cousins, all reacting to the
// actors of the core proximity registry (docs/AMBIENT.md):
//   NIGHT  fireflies   swarms over the grass that blink in a travelling ripple, drift on stepped paths, SCATTER up
//                      and away from a walker (alarm-flash, then lights out), and re-gather blinking
//          glow-worms  steady ground glows (core + a horizontal light pool, never a plus) in a band along the wall
//                      foot and at pillar feet, >= 0.6 m from any firefly home; they go dark when someone comes close
//                      and relight one by one once it is calm again
//          moths       circle every lamp of anchors.lights on stepped orbits, bonk into the light, flare out when a
//                      walker brushes past the lamp
//   DAY    butterflies flutter between blooms (bouncy stepped flight: the body rises on the down-stroke), rest with
//                      slow wing fans, snap their wings shut (alert) and flutter up and away when approached
//          bees        dart between the blooms of one garden, buzz on them, zip off, come back quickly
//          blooms      the system's own little flowers the day insects visit: 5-px plus heads on a 1-px stem, the
//                      style of the stage's own flower drifts (they dip when one lands)
//          shadows     every airborne day insect drops a 1-2 px sun-projected ground shadow (alpha-blended, same call)
// Golden hour: the first fireflies (~45 %) and the lamp moths are out, two butterflies are still about. Golden
// fireflies are atlas drawings (pale core / plus + a dark 1-px under-shadow): the night glow tones sink into ochre.
// Homes keep off the trail (spots.trail, 0.95 m) and the bare dirt patch (spots.flock); opts.avoid(x, z) adds more.
// Day insects judge "calm" at the bloom they would return to and flutter off again if someone stops where they hide.
//
// UNIQUE-TO-ME SHEET (docs/AMBIENT.md §9)
// - extra animated parts: butterfly wings (open 5 px / half 3 px / closed 1 px wide), bee wing pixels (high / level),
//   moth wings (up V / down / open glide), firefly halo (1 px dim -> plus-shaped flash -> 1 px), bloom bend.
// - own gait / motion: butterflies bob 1 texel per wing beat on erratic S-curves; bees dart in straight zips and
//   hover with 1-texel jitter; moths orbit (15 fps travel) and bonk the lamp; fireflies drift on 7.5 fps steps.
// - expressions in this style: an alert is a silhouette change (butterfly 5 px -> 1 px wide, firefly 1 px -> steady
//   plus flash, glow-worm bright -> dim), a fright is a jump (scatter 1.2-3.6 m), lights go out in one step and
//   come back in 2 steps (dim, bright) — no fades.
// - readability at game speed: flee radii checked against a 5.8 m/s walker (lead >= 0.3 s via `lookahead`); every
//   drawing differs from the previous one by >= 2 texels; everything is on the 15 Hz ambient grid.
//
// DRAW CALLS: 2 (one texel-exact palette-indexed ATLAS point batch for every day insect / moth / bloom / glow-worm /
// golden firefly, per-entry alpha, colour pass only; one emissive core sprite batch for night fireflies).
//
// opts (all optional; the defaults derive everything from the ambient-stage anchors):
//   swarms:  [{ c: Vector3, r, n }]   firefly swarms   (default: spots.fireflies r 2.0 n 26, a quiet meadow spot, 2.5 m
//                                     in front of the wall)
//   gardens: [{ c: Vector3, r, n }]   bloom clusters    (default: spots.fireflies r 1.2 n 7, the quiet spot r 0.9 n 5)
//   glow:    [{ c: Vector3, r, n, along? }]  glow-worm sites (default: wall foot band along 1.45 m n 9, pillar feet n 6)
//   water:   [Vector3]                extra low firefly swarm per pond (default: spots.water / spots.pond / anchors.water;
//                                     r = opts.waterR 2.4, floor = the lowest bank height around it)
//   avoid:   (x, z) => bool           extra keep-out test for homes / blooms (terrain zones the scene knows)
//   lamps:   [Vector3]                moth lamps        (default: anchors.lights[].pos), mothsPerLamp = 4
//   butterflies = 5, bees = 6, blooms = true (draw the bloom clumps), reaction: { ff, bfly, bee, moth, glow }
// api: { events (flee log), agents (read-only), blooms }
import * as THREE from 'three';
import { LAYERS } from '../core/PixelPipeline.js';
import {
  defineSystem, createReaction, createSpriteBatch, Ticker, STATE, STATE_NAMES,
  gridTime, clockIndex, clockTime, cycleFrame, hash, clamp, lerp, smooth, TAU, GRID_HZ,
} from './core.js';

// ------------------------------------------------------------------------------------------------ palette
// sRGB. Wing triples are [hi, mid, sh] with hue-shifted (cooler) shadows; petals follow FLOWER_TINTS (shrine), stems
// the meadow greens. `fixed` entries are lit by their own light (moths at the lamp, night moths) and skip the
// time-of-day multiplier.
const COLORS = {
  body: '#3E3A52',
  lilH: '#DC9EFF', lilM: '#A875D7', lilS: '#6F5A9C',
  yelH: '#F6EDA8', yelM: '#E6D36A', yelS: '#A8964E',
  whiH: '#F4F2E4', whiM: '#D9D5C2', whiS: '#9C9AA6',
  beeY: '#E6C24A', beeW: '#E8FBFF',
  mLitH: '#FFE2B0', mLitM: '#D9A878', mLitS: '#8E6A5E', mLitO: '#5E4A52',
  mDimH: '#A9AAC2', mDimM: '#6F7090', mDimS: '#44465E', mDimO: '#2C2E44',
  flLilP: '#CA91E3', flLilM: '#A875D7', flLilS: '#6E5A9E',
  flYelP: '#F0DE7A', flYelM: '#E6D36A', flYelS: '#9E8E4A',
  flWhiP: '#EDEBDA', flWhiM: '#CFCBB8', flWhiS: '#8D8A86',
  stemM: '#75A558', stemS: '#3B6B5A',
  shd: '#1E2A44',                                                   // ground shadow of a flying insect (alpha-blended)
  // glow-worms (night, self-lit): steady core + a horizontal pool of light on the ground (alpha-blended)
  gwC: '#D2FFC8', gwM: '#9BEFA0', gwP: '#9BEFA0', gwD: '#3E7A5A',
  // golden-hour fireflies: a cooler, brighter core than the ochre grass + a dark 1-px under-shadow (value contrast)
  gfC: '#FBFFE6', gfA: '#F4FFC0', gfD: '#3E4A2E',
};
const FIXED = new Set(['mLitH', 'mLitM', 'mLitS', 'mLitO', 'mDimH', 'mDimM', 'mDimS', 'mDimO', 'shd', 'gwC', 'gwM', 'gwP', 'gwD', 'gfC', 'gfA', 'gfD']);
const SHADE_ALPHA = 0.42;                                           // shd darkens what is under it (meadow -> its shade)
const ALPHA = { shd: SHADE_ALPHA, gwP: 0.42, gfD: 0.8 };            // per-palette-entry alpha (default 1 = opaque)
const NPAL = 48;
const PAL_NAMES = Object.keys(COLORS);
const PAL_INDEX = Object.fromEntries(PAL_NAMES.map((n, i) => [n, i + 1]));   // 0 = transparent
// linear multipliers per time of day for the unlit (non-fixed) entries
const TOD_MUL = { noon: [1, 1, 1], morning: [1, 0.97, 0.92], golden: [1.0, 0.8, 0.58], night: [0.24, 0.32, 0.68] };

// ------------------------------------------------------------------------------------------------ drawings
// 8x8 cells, row 0 = top. Sprite centre = the texel corner between rows 3/4 and columns 3/4. Insect bodies sit on
// column 3, rows 3-4 in every drawing (so a drawing change never moves the body).
const ART = {
  bOpen:   ['', '', '.HH.HH', 'HHMoMHH', '.MSoSM', '..S.S'],     // wings spread: 7 px wide, fore + hind wings
  bHalf:   ['', '..H.H', '..H.H', '..MoM', '...o'],               // wings raised: 3 px wide, 4 tall
  bClosed: ['...H', '...H', '...M', '...o', '...o'],              // wings together above the body: 1 px wide, 5 tall
  shd2:    ['', '', '', '...ss'],                                  // ground shadow under a low flier (2 px)
  shd1:    ['', '', '', '...s'],                                   // ... a high one (1 px)
  beeA:    ['', '', '..w', '..ww', '.oyoy'],                      // wings high
  beeB:    ['', '', '', '.w..w', '.oyoy'],                        // wings level
  mUp:     ['', '.H...H', '..H.H', '...o', '...o'],               // moth wings up (V)
  mDown:   ['', '', '', '...o', '.MMoMM', '..S.S'],               // wings down
  mOpen:   ['', '', '', '.HHoHH', '..MoM'],                       // glide
  // blooms: a 5-px plus head (like the stage's own flower drifts) on a 1-px stem; bent = dipped 1 px, leaning right
  flRest:  ['', '', '', '...p', '..pPq', '...q', '...G'],
  flBent:  ['', '', '', '', '...pp', '..pPq', '...G'],
  // glow-worms: core on the ground + a dim horizontal pool (no plus: that is the firefly's flash)
  gwBig:   ['', '', '', '...CC', '..PPPP'],
  gwSmall: ['', '', '', '...C', '..PPP'],
  gwDip:   ['', '', '', '...M', '...P'],
  gwDim:   ['', '', '', '...D'],
  // golden-hour fireflies: bright 1-px core / plus flash, both with a dark under-shadow below
  gfPx:    ['', '', '', '...c', '...d'],
  gfPlus:  ['', '', '...a', '..aca', '..dad', '...d'],
};
const VARIANTS = {
  lilac:  { H: 'lilH', M: 'lilM', S: 'lilS', o: 'body' },
  yellow: { H: 'yelH', M: 'yelM', S: 'yelS', o: 'body' },
  white:  { H: 'whiH', M: 'whiM', S: 'whiS', o: 'body' },
  bee:    { o: 'body', y: 'beeY', w: 'beeW' },
  shade:  { s: 'shd' },
  mLit:   { H: 'mLitH', M: 'mLitM', S: 'mLitS', o: 'mLitO' },
  mDim:   { H: 'mDimH', M: 'mDimM', S: 'mDimS', o: 'mDimO' },
  fLil:   { p: 'flLilP', P: 'flLilM', q: 'flLilS', g: 'stemM', G: 'stemS' },
  fYel:   { p: 'flYelP', P: 'flYelM', q: 'flYelS', g: 'stemM', G: 'stemS' },
  fWhi:   { p: 'flWhiP', P: 'flWhiM', q: 'flWhiS', g: 'stemM', G: 'stemS' },
  glow:   { C: 'gwC', M: 'gwM', P: 'gwP', D: 'gwD' },
  gold:   { c: 'gfC', a: 'gfA', d: 'gfD' },
  // (additive, demo ui pass / critic P2-7: opts.night.mothGlint) a moth away from its lamp keeps a LIT wing tip
  mGlint: { H: 'mLitH', M: 'mDimM', S: 'mDimS', o: 'mDimO' },
};
const FRAMES_SPEC = [
  ...['lilac', 'yellow', 'white'].flatMap((v) => ['bOpen', 'bHalf', 'bClosed'].map((d) => [v, d])),
  ['bee', 'beeA'], ['bee', 'beeB'],
  ...['mLit', 'mDim'].flatMap((v) => ['mUp', 'mDown', 'mOpen'].map((d) => [v, d])),
  ...['fLil', 'fYel', 'fWhi'].flatMap((v) => ['flRest', 'flBent'].map((d) => [v, d])),
  ['shade', 'shd2'], ['shade', 'shd1'],
  ['glow', 'gwBig'], ['glow', 'gwSmall'], ['glow', 'gwDip'], ['glow', 'gwDim'],
  ['gold', 'gfPx'], ['gold', 'gfPlus'],
  ...['mUp', 'mDown', 'mOpen'].map((d) => ['mGlint', d]),   // (additive: appended, earlier frame indices unchanged)
];
const FRAME = Object.fromEntries(FRAMES_SPEC.map(([v, d], i) => [`${v}.${d}`, i]));
const CELL = 8, ACOLS = 8;

function buildAtlas() {
  const rows = Math.ceil(FRAMES_SPEC.length / ACOLS), W = ACOLS * CELL, H = rows * CELL;
  const data = new Uint8Array(W * H * 4);
  FRAMES_SPEC.forEach(([v, d], f) => {
    const map = VARIANTS[v], art = ART[d], cx = (f % ACOLS) * CELL, cy = Math.floor(f / ACOLS) * CELL;
    for (let y = 0; y < CELL; y++) {
      const line = art[y] || '';
      for (let x = 0; x < CELL; x++) {
        const ch = line[x];
        if (!ch || ch === '.') continue;
        const name = map[ch];
        if (!name) throw new Error(`fireflies atlas: '${ch}' unmapped in ${v}.${d}`);
        data[((cy + y) * W + cx + x) * 4] = PAL_INDEX[name];
        data[((cy + y) * W + cx + x) * 4 + 3] = 255;
      }
    }
  });
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

const ATLAS_VERT = /* glsl */`
uniform int uPassMode;
uniform vec2 uLowSize;
attribute float aFrame;   // atlas cell; < 0 = hidden
attribute float aFlip;
varying float vFrame, vFlip;
void main() {
  vFrame = aFrame; vFlip = aFlip;
  if (uPassMode == 1 || aFrame < -0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  px = floor(px + 0.5);                                  // 8-texel sprite: centre on a texel corner
  clip.xy = (px / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = 8.0;
}`;
const ATLAS_FRAG = /* glsl */`
uniform int uPassMode;
uniform sampler2D uAtlas;
uniform vec3 uPal[${NPAL}];
uniform float uAlpha[${NPAL}];
varying float vFrame, vFlip;
void main() {
  if (uPassMode == 1) discard;
  ivec2 c = clamp(ivec2(floor(gl_PointCoord * 8.0)), ivec2(0), ivec2(7));
  if (vFlip > 0.5) c.x = 7 - c.x;
  int fr = int(vFrame + 0.5);
  ivec2 cell = ivec2(fr - (fr / ${ACOLS}) * ${ACOLS}, fr / ${ACOLS});
  int idx = int(texelFetch(uAtlas, cell * 8 + c, 0).r * 255.0 + 0.5);
  if (idx == 0) discard;
  gl_FragColor = vec4(uPal[idx], uAlpha[idx]);
}`;

/** Palette-indexed 8x8 atlas point batch: 1 draw call, colour pass only, texel-snapped, opaque (alpha 1). */
function createAtlasBatch(engine, { max, parent, name }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), frame = new Float32Array(max).fill(-1), flip = new Float32Array(max);
  const attr = (a, n) => { const b = new THREE.BufferAttribute(a, n); b.setUsage(THREE.DynamicDrawUsage); return b; };
  geo.setAttribute('position', attr(pos, 3)); geo.setAttribute('aFrame', attr(frame, 1)); geo.setAttribute('aFlip', attr(flip, 1));
  const atlas = buildAtlas();
  const pal = new Float32Array(NPAL * 3), alpha = new Float32Array(NPAL).fill(1);
  PAL_NAMES.forEach((n, i) => { if (ALPHA[n] !== undefined) alpha[i + 1] = ALPHA[n]; });
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPassMode: engine.uniforms.uPassMode, uLowSize: engine.pipeline.common.uLowSize, uAtlas: { value: atlas }, uPal: { value: pal }, uAlpha: { value: alpha } },
    vertexShader: ATLAS_VERT, fragmentShader: ATLAS_FRAG, transparent: true, depthWrite: false, depthTest: true,
  });
  const points = new THREE.Points(geo, mat);
  points.layers.set(LAYERS.COLOR_ONLY);
  points.frustumCulled = false; points.renderOrder = 10; points.name = name;
  parent.add(points);
  let visible = 0;
  const c = new THREE.Color();
  return {
    points, max,
    setPalette(todName) {
      const m = TOD_MUL[todName] ?? TOD_MUL.noon;
      PAL_NAMES.forEach((n, i) => {
        c.set(COLORS[n]);                                   // sRGB hex -> linear working colour
        const k = FIXED.has(n) ? [1, 1, 1] : m;
        pal.set([c.r * k[0], c.g * k[1], c.b * k[2]], (i + 1) * 3);
      });
    },
    set(i, p, f, fl = 0) { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; frame[i] = f; flip[i] = fl; },
    hide(i) { frame[i] = -1; },
    commit() {
      for (const k of ['position', 'aFrame', 'aFlip']) geo.attributes[k].needsUpdate = true;
      visible = 0; for (let i = 0; i < max; i++) visible += frame[i] >= 0 ? 1 : 0;
    },
    get visible() { return visible; },
    dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); atlas.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ helpers
const easeOut = (u) => 1 - (1 - clamp(u)) * (1 - clamp(u));
/** Erratic flight from A to B (u 0..1): eased base + lateral S-waves + an arc. */
function flyPath(A, B, u, { amp = 0.3, waves = 2, arc = 0.4, ph = 0, ease = smooth } = {}, out) {
  const e = ease(u);
  out.lerpVectors(A, B, e);
  const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
  const s = Math.sin(clamp(u) * Math.PI);
  const w = Math.sin(clamp(u) * Math.PI * waves + ph) * amp * s;
  out.x += (-dz / L) * w; out.z += (dx / L) * w; out.y += arc * s;
  return out;
}
/** Dart-throw n points in a disc (min spacing), seeded. */
function scatter(r, c, rad, n, minD, out = [], ok = null) {
  const pts = [];
  for (let tries = 0; pts.length < n && tries < 3000; tries++) {
    const a = r() * TAU, d = Math.sqrt(r()) * rad;
    const p = new THREE.Vector3(c.x + Math.cos(a) * d, 0, c.z + Math.sin(a) * d);
    if (ok && !ok(p)) continue;
    if (pts.every((q) => q.distanceTo(p) >= minD)) pts.push(p);
  }
  out.push(...pts);
  return pts;
}
/** Visit timeline over blooms: rest (dwell) / fly segments, closed loop (last flight returns to the start bloom). */
function makeTimeline(r, blooms, start, pickNext, { dwell, speed, minFly, total = 96 }) {
  const segs = [];
  let t = 0, j = start;
  while (t < total) {
    const d = lerp(dwell[0], dwell[1], r());
    segs.push({ t0: t, t1: t + d, rest: true, a: j, b: j }); t += d;
    if (t >= total) break;
    const k = pickNext(j, r);
    const f = Math.max(minFly, blooms[j].ground.distanceTo(blooms[k].ground) / speed);
    segs.push({ t0: t, t1: t + f, rest: false, a: j, b: k, ph: r() * TAU, w: 1.5 + r() * 1.5, amp: r() }); t += f; j = k;
  }
  if (j !== start) {
    const f = Math.max(minFly, blooms[j].ground.distanceTo(blooms[start].ground) / speed);
    segs.push({ t0: t, t1: t + f, rest: false, a: j, b: start, ph: r() * TAU, w: 2, amp: r() }); t += f;
  }
  return { segs, period: t };
}
function segAt(tl, t) {
  const u = ((t % tl.period) + tl.period) % tl.period;
  let lo = 0, hi = tl.segs.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (tl.segs[m].t1 <= u) lo = m + 1; else hi = m; }
  return { s: tl.segs[lo], u: tl.segs[lo].t1 > tl.segs[lo].t0 ? (u - tl.segs[lo].t0) / (tl.segs[lo].t1 - tl.segs[lo].t0) : 0 };
}

// ------------------------------------------------------------------------------------------------ system
export default defineSystem({
  name: 'fireflies', owner: 'fireflies', budget: { glCalls: 2 },
  create(ctx, opts = {}) {
    const { engine, actors, anchors = {} } = ctx;
    const spots = anchors.spots || {};
    const gy = (x, z) => ctx.heightAt?.(x, z) ?? 0;
    const seed = ctx.seed;
    const cam = engine.camera;
    // ground basis from the yaw (camera.right / forward are built lazily in camera.update(): stale at create time)
    const fwdH = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));     // into the screen, on the ground
    const v3 = (p) => p && new THREE.Vector3(p.x, p.y ?? 0, p.z);
    const toward = (p, d) => v3(p).addScaledVector(fwdH, -d);                      // d metres toward the camera

    // ---- layout (anchors of the ambient stage by default)
    const main = v3(spots.fireflies) ?? v3(opts.center) ?? new THREE.Vector3();
    const quiet = spots.flock && spots.pillarB ? v3(spots.flock).lerp(v3(spots.pillarB), 0.5) : null;
    // water: fireflies love the banks — any `opts.water` / `spots.water|pond` / `anchors.water` point gets a low swarm
    const water = (opts.water ?? (spots.water ? [spots.water] : spots.pond ? [spots.pond] : anchors.water ?? [])).map(v3);
    const swarms = opts.swarms ?? [
      { c: main, r: 2.0, n: 26 },
      ...(quiet ? [{ c: quiet, r: 1.2, n: 12 }] : []),
      ...(spots.wall ? [{ c: toward(spots.wall, 2.5), r: 1.0, n: 10 }] : []),       // in front of the wall (its foot = glow-worms)
      ...water.map((c) => ({ c, r: opts.waterR ?? 2.4, n: 16, low: true })),
    ];
    const gardens = opts.gardens ?? [{ c: main, r: 1.2, n: 7 }, ...(quiet ? [{ c: quiet, r: 0.9, n: 5 }] : [])];
    // glow-worms: a band along the foot of the wall (screen-wide, 0.35-0.65 m in front of it), a ring at pillar feet
    const camR = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));       // screen-right, on the ground
    const glowSites = opts.glow ?? [
      ...(spots.wall ? [{ c: toward(spots.wall, 0.5), r: 0.15, n: 9, along: 1.45 }] : []),
      ...['pillarA', 'pillarB'].filter((k) => spots[k]).map((k) => ({ c: toward(spots[k], 0.75), r: 0.5, n: 6 })),
    ];
    const lamps = (opts.lamps ?? (anchors.lights || []).map((l) => l.pos)).map(v3);

    // ---- where things may live: fireflies / blooms / glow-worms keep off the trail and the bare dirt patch
    // (opts.avoid(x, z) -> true = keep out, from a scene that knows its terrain zones; the stage's trail by default)
    const trail = (spots.trail ?? []).map(v3);
    const trailD = (x, z) => {
      let best = Infinity;
      for (let i = 0; i < trail.length; i++) {
        const A = trail[i], B = trail[(i + 1) % trail.length];
        const ex = B.x - A.x, ez = B.z - A.z, L2 = ex * ex + ez * ez || 1;
        const u = clamp(((x - A.x) * ex + (z - A.z) * ez) / L2);
        best = Math.min(best, Math.hypot(x - A.x - ex * u, z - A.z - ez * u));
      }
      return best;
    };
    const dirt = spots.flock ? v3(spots.flock) : null;
    const clear = (gap) => (p) => !(opts.avoid?.(p.x, p.z)) && trailD(p.x, p.z) >= gap && (!dirt || Math.hypot(p.x - dirt.x, p.z - dirt.z) >= 1.7 + gap);

    // ---- blooms
    const rB = ctx.rng(11);
    const blooms = [];
    gardens.forEach((g, gi) => {
      for (const p of scatter(rB, g.c, g.r, g.n, 0.42, [], clear(0.95))) {
        p.y = gy(p.x, p.z);
        blooms.push({ i: blooms.length, g: gi, ground: p, kind: ['fLil', 'fYel', 'fLil', 'fWhi'][Math.floor(rB() * 4)], pos: new THREE.Vector3(), land: new THREE.Vector3(), busy: false });
      }
    });
    const byGarden = gardens.map((_, gi) => blooms.filter((b) => b.g === gi).map((b) => b.i));
    const gardenY = gardens.map((g) => gy(g.c.x, g.c.z));                // cached floor for the insects' ground shadows
    let tw = -1;
    const layoutBlooms = () => {
      // bloom sprite centre: 3 texels screen-up from its ground point (stems end on the ground), pulled 0.12 m toward
      // the camera so the stem rows win the depth test; landing spot = top of the dipped (bent) blossom
      tw = cam.texelWorld;
      for (const b of blooms) {
        b.pos.copy(b.ground).addScaledVector(cam.up, 3 * tw).addScaledVector(cam.forward, -0.12);
        b.land.copy(b.pos).addScaledVector(cam.up, 1 * tw).addScaledVector(cam.forward, -0.05);
      }
    };
    layoutBlooms();

    // ---- reactions (game speed: lead = (flee radius + 5.8 m/s x lookahead - 0.6 m) / 5.8 m/s >= 0.3 s)
    const RO = opts.reaction || {};
    const RX = {
      ff: createReaction({ alertR: 1.9, fleeR: 1.5, calmR: 2.6, calmTime: 0.9, fleeTime: 0.8, awayMin: 0.8, returnTime: 2.4, lookahead: 0.35, ...RO.ff }),
      bfly: createReaction({ alertR: 2.5, fleeR: 1.7, calmR: 3.6, calmTime: 1.2, fleeTime: 1.3, awayMin: 1.2, returnTime: 2.4, lookahead: 0.35, ...RO.bfly }),
      bee: createReaction({ alertR: 1.6, fleeR: 1.1, calmR: 3.0, calmTime: 0.7, fleeTime: 0.5, awayMin: 0.6, returnTime: 1.1, lookahead: 0.3, ...RO.bee }),
      moth: createReaction({ alertR: 1.4, fleeR: 1.0, calmR: 1.7, calmTime: 0.5, fleeTime: 0.6, awayMin: 0.4, returnTime: 1.3, lookahead: 0.25, ...RO.moth }),
      glow: createReaction({ alertR: 2.8, fleeR: 2.2, calmR: 3.0, calmTime: 1.0, fleeTime: 0.2, awayMin: 0.8, returnTime: 2.6, lookahead: 0.4, stillScale: 1.1, ...RO.glow }),
    };

    // ---- agents
    const agents = [];
    const add = (kind, extra) => { const a = { kind, i: agents.length, k: 0, rec: null, cur: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), ox: 0, oy: 0, oz: 0, ...extra }; agents.push(a); return a; };
    const rA = ctx.rng(21);
    // glow-worms on the ground at prop feet (first: the firefly homes keep >= 0.6 m from them, so the two never mix)
    const glowHomes = [];
    glowSites.forEach((s) => {
      let pts;
      if (s.along) {                                                    // a band along the screen-x (wall foot)
        pts = [];
        for (let tries = 0; pts.length < s.n && tries < 600; tries++) {
          const p = v3(s.c).addScaledVector(camR, (rA() * 2 - 1) * s.along).addScaledVector(fwdH, (rA() * 2 - 1) * s.r);
          if (clear(0.55)(p) && pts.every((q) => q.distanceTo(p) >= 0.24)) pts.push(p);
        }
      } else pts = scatter(rA, s.c, s.r, s.n, 0.22, [], clear(0.55));
      for (const p of pts) { p.y = gy(p.x, p.z) + 0.03; glowHomes.push(p); add('glow', { home: p, big: rA() < 0.5, relight: rA(), per: 7 + Math.floor(rA() * 6) }); }
    });
    // fireflies: homes in each swarm disc over the grass (not the trail / the dirt patch / the glow-worms), 0.2-1.0 m
    // up; 35 % ignore the swarm ripple. Water swarms skim low over the banks (floor = the lowest bank height, so a
    // home over the pond never sinks under the water level)
    const okFF = (p) => clear(0.95)(p) && glowHomes.every((g) => Math.hypot(g.x - p.x, g.z - p.z) >= 0.6);
    swarms.forEach((s, si) => {
      let bank = -Infinity;
      if (s.low) { bank = Infinity; for (let k = 0; k < 16; k++) bank = Math.min(bank, gy(s.c.x + Math.cos(k / 16 * TAU) * (s.r + 0.6), s.c.z + Math.sin(k / 16 * TAU) * (s.r + 0.6))); }
      const homes = scatter(rA, s.c, s.r, s.n, 0.22, [], okFF);
      homes.forEach((h, k) => {
        h.y = Math.max(gy(h.x, h.z), bank) + (s.low ? lerp(0.12, 0.6, rA()) : lerp(0.2, 1.0, rA()));   // over water: skimming low
        add('ff', { home: h, swarm: si, sync: rA() > 0.35, ring: Math.round(h.distanceTo(s.c) / 0.45), per: 10 + Math.floor(rA() * 8), off: Math.floor(rA() * 16), dusk: rA(), k });
      });
    });
    // moths
    const mothsPerLamp = opts.mothsPerLamp ?? 4;
    lamps.forEach((L, li) => {
      for (let k = 0; k < mothsPerLamp; k++) add('moth', { lamp: L, r: lerp(0.5, 0.85, rA()), hy: lerp(-0.05, 0.4, rA()), w: (rA() < 0.5 ? -1 : 1) * lerp(2.2, 3.6, rA()), ph: rA() * TAU, ph2: rA() * TAU, bonk: 9 + Math.floor(rA() * 8) });
    });
    // butterflies: mostly their home garden, now and then another garden
    const nB = blooms.length ? (opts.butterflies ?? 5) : 0, nBee = blooms.length ? (opts.bees ?? 6) : 0;
    const species = ['lilac', 'yellow', 'white', 'lilac', 'yellow', 'white'];
    for (let k = 0; k < nB; k++) {
      const g = k % gardens.length, home = byGarden[g].length ? byGarden[g] : blooms.map((b) => b.i);
      const pick = (j, r) => {
        const pool = r() < 0.25 && gardens.length > 1 ? blooms.map((b) => b.i) : home;
        let n = pool[Math.floor(r() * pool.length)];
        if (n === j && pool.length > 1) n = pool[(pool.indexOf(n) + 1) % pool.length];
        return n;
      };
      const tl = makeTimeline(ctx.rng(100 + k), blooms, home[k % home.length], pick, { dwell: [1.6, 4.2], speed: 0.9, minFly: 1.4 });
      add('bfly', { sp: species[k % species.length], tl, ph: Math.floor(rA() * 8), floor: gardenY[g] ?? 0 });
    }
    for (let k = 0; k < nBee; k++) {
      const g = k % gardens.length, home = byGarden[g].length ? byGarden[g] : blooms.map((b) => b.i);
      const pick = (j, r) => { let n = home[Math.floor(r() * home.length)]; if (n === j && home.length > 1) n = home[(home.indexOf(n) + 1) % home.length]; return n; };
      const tl = makeTimeline(ctx.rng(200 + k), blooms, home[(k * 2) % home.length], pick, { dwell: [0.8, 2.2], speed: 1.6, minFly: 0.33 });
      add('bee', { tl, ph: Math.floor(rA() * 8), floor: gardenY[g] ?? 0 });
    }
    for (const a of agents) a.rec = RX[a.kind].init(seed + a.i * 13);

    // ---- per-kind positions (pure in t + the agent's reaction record)
    const T = new THREE.Vector3(), T2 = new THREE.Vector3();
    const tex = () => cam.texelWorld;
    function idleVisit(a, t, out) {
      // pure f(t) visit schedule: returns the segment, writes the position
      const { s, u } = segAt(a.tl, gridTime(t));
      if (s.rest) { out.copy(blooms[s.a].land); return s; }
      const bee = a.kind === 'bee';
      flyPath(blooms[s.a].land, blooms[s.b].land, u, bee ? { amp: 0.08 * s.amp, waves: 2, arc: 0.12, ph: s.ph } : { amp: 0.2 + 0.25 * s.amp, waves: s.w, arc: 0.35 + 0.3 * s.amp, ph: s.ph }, out);
      return s;
    }
    function posAt(a, t, out) {
      const rec = a.rec, R = RX[a.kind].opts, age = Math.max(0, gridTime(t) - rec.t0);
      if (a.kind === 'glow') return out.copy(a.home);
      if (a.kind === 'ff' || a.kind === 'moth') {
        if (a.kind === 'ff') {
          const ts = clockTime(t, 2), ph = hash(a.i, 1, seed) * TAU;   // 7.5 fps drift steps
          out.set(a.home.x + 0.4 * Math.sin(ts * 0.55 + ph) + 0.18 * Math.sin(ts * 1.37 + ph * 2.1),
            a.home.y + 0.16 * Math.sin(ts * 0.83 + ph * 1.3),
            a.home.z + 0.4 * Math.cos(ts * 0.47 + ph * 0.7) + 0.18 * Math.cos(ts * 1.11 + ph * 1.7));
        }
        let k = 0;
        if (rec.s === STATE.FLEE) k = easeOut(age / R.fleeTime);
        else if (rec.s === STATE.AWAY) k = 1;
        else if (rec.s === STATE.RETURN) k = 1 - smooth(age / R.returnTime);
        if (a.kind === 'moth') {
          const tg = gridTime(t);                                       // 15 fps orbit travel
          const th = a.w * tg + a.ph;
          const bonk = clockIndex(t, 4, a.i) % a.bonk < 2;             // 2 beats into the light
          const r = (bonk ? 0.34 : a.r) * (1 + 1.8 * k);
          out.set(a.lamp.x + Math.cos(th) * r, a.lamp.y + a.hy + 0.1 * Math.sin(2 * th + a.ph2) + 0.5 * k, a.lamp.z + Math.sin(th) * r * 0.85);
          return out;
        }
        if (k > 0) out.add(T.set(a.ox * k, a.oy * k, a.oz * k));
        return out;
      }
      // butterflies / bees: latched from -> to paths while reacting
      const bee = a.kind === 'bee';
      switch (rec.s) {
        case STATE.FLEE: {
          const u = clamp(age / R.fleeTime);
          return flyPath(a.from, a.to, u, { amp: bee ? 0.1 : 0.45, waves: bee ? 1 : 3, arc: 0, ph: a.i, ease: easeOut }, out);
        }
        case STATE.AWAY: {
          const s = bee ? 0.12 : 0.3;
          return out.set(a.to.x + s * Math.sin(age * 1.3), a.to.y + 0.12 * Math.sin(age * 2.1), a.to.z + s * 0.8 * (1 - Math.cos(age * 1.1)));
        }
        case STATE.RETURN: {
          idleVisit(a, rec.t0 + R.returnTime, T2);                    // where the schedule wants it when the return ends
          return flyPath(a.from, T2, clamp(age / R.returnTime), { amp: bee ? 0.05 : 0.25, waves: 2, arc: bee ? 0.05 : 0.2, ph: a.i }, out);
        }
        default: { idleVisit(a, t, out); return out; }
      }
    }

    // ---- reaction sim (15 Hz replay ticker)
    let tod = ctx.tod;
    const active = (a) => {
      const n = tod?.name ?? 'noon', dark = !!tod?.dark;
      switch (a.kind) {
        case 'ff': return dark && (n === 'night' || a.dusk < 0.45);
        case 'glow': return n === 'night';
        case 'moth': return dark;
        case 'bfly': return !dark || (n === 'golden' && a.i % 3 === 0);
        case 'bee': return !dark;
      }
      return false;
    };
    const events = [];
    const ticker = new Ticker({
      hz: GRID_HZ,
      reset() { for (const a of agents) { a.rec = RX[a.kind].init(seed + a.i * 13); a.ox = a.oy = a.oz = 0; } events.length = 0; },
      tick(t, dt) {
        const snap = actors.snapshot(t);
        for (const a of agents) {
          const R = RX[a.kind], rec = a.rec, s0 = rec.s;
          posAt(a, t, a.cur);                                          // the drawn position BEFORE stepping (latch source)
          let hit;
          if (rec.s === STATE.AWAY && (a.kind === 'bfly' || a.kind === 'bee')) {
            // calm is judged at the bloom it would come back to, not where it hides: a walker standing in the garden
            // keeps them away until he leaves (instead of bees landing next to his hat)
            idleVisit(a, t + R.opts.returnTime, T2);
            hit = snap.nearest(T2.x, T2.z, R.range);
          } else hit = snap.nearest(a.cur.x, a.cur.z, R.range);
          let changed = R.step(rec, t, hit, dt);
          if (!changed && rec.s === STATE.AWAY && (a.kind === 'bfly' || a.kind === 'bee')) {
            // someone stopped right where it hides (the walker ran on in the flee direction): flutter off again
            const near = snap.nearest(a.cur.x, a.cur.z, 1.5);
            if (near && near.d < 1.3) { changed = R.force(rec, STATE.FLEE, t, near.ax, near.az); hit = null; }
          }
          if (!changed) continue;
          const h = hash(a.i, rec.changes, seed);
          if (rec.s === STATE.FLEE) {
            a.from.copy(a.cur);
            const sp = (hash(a.i, rec.changes, 9) - 0.5) * 1.6, c = Math.cos(sp), sn = Math.sin(sp);
            const ax = rec.ax * c - rec.az * sn, az = rec.ax * sn + rec.az * c;
            if (a.kind === 'ff') { const d = 1.2 + h * 1.0; a.ox = ax * d; a.oz = az * d; a.oy = 0.5 + hash(a.i, rec.changes, 4) * 0.7; }
            else if (a.kind === 'bfly') { const d = 2.4 + h * 1.2; a.to.set(a.cur.x + ax * d, 0, a.cur.z + az * d); a.to.y = gy(a.to.x, a.to.z) + 1.0 + hash(a.i, rec.changes, 4) * 0.6; }
            else if (a.kind === 'bee') { const d = 2.5 + h * 0.8; a.to.set(a.cur.x + ax * d, 0, a.cur.z + az * d); a.to.y = gy(a.to.x, a.to.z) + 0.8 + hash(a.i, rec.changes, 4) * 0.4; }
            if (active(a) && events.length < 128 && hit) events.push({ kind: a.kind, i: a.i, t: +t.toFixed(3), d: +hit.d.toFixed(2), speed: +hit.speed.toFixed(2) });
          } else if (rec.s === STATE.RETURN) a.from.copy(a.cur);
        }
      },
    });

    // ---- batches
    const fliers = agents.filter((a) => a.kind === 'bfly' || a.kind === 'bee');
    const nAtlas = fliers.length + blooms.length + agents.length;       // every agent has an atlas slot (golden ff, glow-worms)
    const nGlow = agents.filter((a) => a.kind === 'ff').length;
    // (additive, demo ui pass / critic P2-7 "night fireflies are barely visible") opts.night = { core: 2, halo: 4,
    // gain: 1.5, haloGain: 0.3, mothGlint: true }: each night firefly = a bright 2x2 core + a dim 4x4 additive halo
    // (a second sprite in the same batch: still ONE draw call), the flash a 2x2 core in a 6x6 halo; moths away from
    // their lamp keep a lit wing tip (mGlint). Without opts.night: unchanged.
    const NB = opts.night ?? null;
    const atlas = createAtlasBatch(engine, { max: Math.max(1, nAtlas), parent: ctx.root, name: 'ambient-fireflies-atlas' });
    const glows = createSpriteBatch(engine, { max: Math.max(1, nGlow * (NB ? 2 : 1)), emissive: true, haloGain: 0.5, name: 'ambient-fireflies-glow', parent: ctx.root });
    const NBC = NB ? { gain: NB.gain ?? 1.5, haloGain: NB.haloGain ?? 0.3, core: NB.core ?? 2, halo: NB.halo ?? 4 } : null;
    const _bc = new THREE.Color(), _hc = new THREE.Color();
    const setGlow = (a, look) => {
      const base = look === 1 ? C.ffDim : C.ff;
      if (!NBC) { glows.set(a.gslot, P, base, look === 2 ? 3 : 1, look === 2 ? 1 : 0); return; }
      const flash = look === 2;
      glows.set(a.gslot, P, _bc.copy(base).multiplyScalar(NBC.gain * (flash ? 1.3 : 1)), NBC.core, 0);
      glows.set(nGlow + a.gslot, P, _hc.copy(base).multiplyScalar(NBC.haloGain * (flash ? 1.4 : 1)), NBC.halo + (flash ? 2 : 0), 0);
    };
    atlas.setPalette(tod?.name);
    let ai = 0, gi = 0;
    for (const a of fliers) a.shadeSlot = ai++;                          // shadows first: everything draws over them
    for (const b of blooms) b.slot = ai++;
    for (const a of agents) { a.slot = ai++; if (a.kind === 'ff') a.gslot = gi++; }
    const C = { ff: new THREE.Color('#E8F27A'), ffDim: new THREE.Color('#8FB04A') };
    const BF = ['bOpen', 'bHalf', 'bClosed'];
    const FLAP4 = ['bClosed', 'bHalf', 'bOpen', 'bHalf'], BOB4 = [-1, 0, 1, 0];
    const REST8 = ['bOpen', 'bOpen', 'bOpen', 'bOpen', 'bOpen', 'bHalf', 'bClosed', 'bHalf'];
    const counts = new Array(STATE_NAMES.length).fill(0);
    const vis = { ff: 0, glow: 0, moth: 0, bfly: 0, bee: 0, bloom: 0, shade: 0 };
    const P = new THREE.Vector3(), S = new THREE.Vector3();
    const screenDir = (a, t) => {                                      // sign of the screen-x travel over one grid tick
      posAt(a, t, T); posAt(a, Math.max(0, t - 1 / GRID_HZ), T2);
      return Math.sign((T.x - T2.x) * cam.right.x + (T.z - T2.z) * cam.right.z);
    };

    return {
      update(t) {
        if (cam.texelWorld !== tw) layoutBlooms();
        ticker.advance(t);
        counts.fill(0);
        for (const k in vis) vis[k] = 0;
        for (const b of blooms) b.busy = false;
        const twl = tex(), lift = (n) => P.y += n * twl / 0.866;     // n texels screen-up (world y)
        for (const a of agents) {
          const rec = a.rec, on = active(a);
          if (on) counts[rec.s]++;
          if (a.shadeSlot !== undefined) atlas.hide(a.shadeSlot);
          atlas.hide(a.slot); if (a.gslot !== undefined) { glows.hide(a.gslot); if (NBC) glows.hide(nGlow + a.gslot); }
          if (!on) continue;
          const age = Math.max(0, gridTime(t) - rec.t0), R = RX[a.kind].opts;
          posAt(a, t, P);
          if (a.kind === 'ff') {
            // blink beats of 4 grid ticks (3.75 fps): ripple outward through the swarm (synced) or own period
            const beat = clockIndex(t, 4, a.i % 4);
            const per = a.sync ? 12 + 2 * a.swarm : a.per;
            const b = (((beat - (a.sync ? a.ring : a.off)) % per) + per) % per;
            // 0 off, 1 dim px, 2 flash (plus), 3 bright px: dim -> flash x2 -> bright x3 -> dim, then dark (~55 % lit,
            // so a swarm never goes fully dark between ripples)
            let look = b === 0 || b === 6 ? 1 : b <= 2 ? 2 : b <= 5 ? 3 : 0;
            if (rec.s === STATE.ALERT || rec.s === STATE.FLEE) look = 2; // alarm: steady flash
            else if (rec.s === STATE.AWAY) look = clockIndex(t, 4, a.i) % 9 === 0 ? 1 : 0;   // lights out, rare dim spark
            else if (rec.s === STATE.RETURN && look === 0) look = clockIndex(t, 4, a.i) % 3 === 0 ? 1 : 0; // re-gather: flickering back
            if (!look) continue;
            if (tod?.name === 'golden') {
              // golden hour: no dim 1-px look (it sinks into the ochre grass): bright core + dark under-shadow, or the
              // plus flash with its shadow — value contrast instead of hue
              atlas.set(a.slot, P, FRAME[look === 2 ? 'gold.gfPlus' : 'gold.gfPx'], 0);
            } else setGlow(a, look);
            vis.ff++;
          } else if (a.kind === 'glow') {
            let look = 2;                                                // 2 bright, 1 dim, 0 off
            const beat = clockIndex(t, 5, a.i % 5);                      // 3 fps: slow breathing dips
            if (beat % a.per === 0) look = 1;
            if (rec.s === STATE.ALERT) look = 1;
            else if (rec.s === STATE.FLEE || rec.s === STATE.AWAY) look = 0;
            else if (rec.s === STATE.RETURN) { const u = age / R.returnTime; look = u < a.relight * 0.8 ? 0 : u < a.relight * 0.8 + 0.12 ? 1 : 2; }
            if (!look) continue;
            // a ground glow: steady core + a horizontal pool on the ground (never the firefly's plus); the breathing
            // dip / alert drop to a small mid core, a returning one shows its dim core for one step first
            const dip = look === 1 && rec.s !== STATE.RETURN;
            const f = look === 2 ? (a.big ? 'gwBig' : 'gwSmall') : dip ? 'gwDip' : 'gwDim';
            atlas.set(a.slot, S.copy(P).addScaledVector(cam.forward, -0.1), FRAME[`glow.${f}`], 0);
            vis.glow++;
          } else if (a.kind === 'moth') {
            const lit = tod?.name === 'golden' || P.distanceTo(a.lamp) < 0.75;
            const beat = clockIndex(t, 2, a.i % 2);
            const d = hash(Math.floor(beat / 3), a.i, seed) < 0.18 ? 'mOpen' : beat % 2 ? 'mDown' : 'mUp';
            atlas.set(a.slot, P, FRAME[`${lit ? 'mLit' : NB?.mothGlint ? 'mGlint' : 'mDim'}.${d}`], screenDir(a, t) > 0 ? 1 : 0);
            vis.moth++;
          } else {
            // butterflies / bees
            const bee = a.kind === 'bee';
            let resting = false, s = null;
            if (rec.s === STATE.IDLE || rec.s === STATE.ALERT) { s = segAt(a.tl, gridTime(t)).s; resting = s.rest; }
            if (resting) blooms[s.a].busy = true;
            const P0y = P.y;                                               // before the drawing's bob / lift
            if (bee) {
              let f;
              if (resting) {
                f = clockIndex(t, 4, a.ph) % 5 === 0 ? 'beeA' : 'beeB';
                P.addScaledVector(cam.right, ((clockIndex(t, 4, a.ph) >> 2) % 3 - 1) * twl);   // crawls over the blossom
                if (rec.s === STATE.ALERT) lift(2);
              } else {
                f = cycleFrame(t, 2, 2, a.ph) ? 'beeB' : 'beeA';
                lift(cycleFrame(t, 2, 2, a.ph) ? 0 : 1);                  // hover buzz: 1-texel bounce
              }
              const dir = resting ? (hash(a.i, s.t0 * 10 | 0, 3) < 0.5 ? -1 : 1) : screenDir(a, t);
              atlas.set(a.slot, P, FRAME[`bee.${f}`], dir > 0 ? 1 : 0);
              vis.bee++;
            } else {
              let f;
              if (resting) {
                f = rec.s === STATE.ALERT ? 'bClosed' : REST8[(clockIndex(t, 4, a.ph) % 8)];
              } else {
                const fast = rec.s === STATE.FLEE;
                const k4 = fast ? cycleFrame(t, 2, 2, a.ph) * 2 : cycleFrame(t, 4, 2, a.ph);   // flee: closed/open snaps
                f = FLAP4[k4];
                lift(BOB4[k4]);
              }
              atlas.set(a.slot, P, FRAME[`${a.sp}.${f}`], 0);
              vis.bfly++;
            }
            // ground shadow (sun-projected, from the un-bobbed height) while airborne by day: sells the height of a
            // 4-7 px flier over the meadow; 2 px low, 1 px high; held on the travel clock like the insect
            const h = P0y - a.floor;
            if (!resting && !tod?.dark && h > 0.14) {
              const sun = engine.uniforms.uSunDir.value, k = h / Math.max(0.25, sun.y);
              S.set(P.x - sun.x * k, a.floor + 0.02, P.z - sun.z * k).addScaledVector(cam.forward, -0.08);
              atlas.set(a.shadeSlot, S, FRAME[h < 0.75 ? 'shade.shd2' : 'shade.shd1'], 0);
              vis.shade++;
            }
          }
        }
        if (opts.blooms !== false) for (const b of blooms) { atlas.set(b.slot, b.pos, FRAME[`${b.kind}.${b.busy ? 'flBent' : 'flRest'}`], 0); vis.bloom++; }
        else for (const b of blooms) atlas.hide(b.slot);
        atlas.commit(); glows.commit();
      },
      setTimeOfDay(info) { tod = info; atlas.setPalette(info?.name); },
      stats() {
        const first = events[0];
        return {
          agents: agents.length, visible: atlas.visible + glows.visible, ...vis,
          ...Object.fromEntries(STATE_NAMES.map((n, k) => [n, counts[k]])),
          calls: 2, lights: 0, flees: events.length,
          fleeLog: events.slice(0, 12).map((e) => `${e.kind}${e.i}:${e.t}@${e.d}`).join(' '),
          firstFlee: first ? `${first.t}s@${first.d}m/${first.speed}mps` : '', resets: ticker.resets, tod: tod?.name,
        };
      },
      debug() { return { events: events.slice(), states: agents.map((a) => `${a.kind}${a.i}:${STATE_NAMES[a.rec.s]}`) }; },
      api: { events, agents, blooms },
      dispose() { atlas.dispose(); glows.dispose(); },
    };
  },
});
