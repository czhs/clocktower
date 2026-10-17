// Ambient system "fire" (owner: fire; contract docs/AMBIENT.md): campfire, wall torch, brazier, forge hearth, candles.
//
// UNIQUE-TO-ME SHEET
//  - extra animated parts: stepped flame DRAWINGS (2-5 tongues + a lick that pinches off the tip), a pale core that
//    pulses on its own rhythm, a coal bed that crawls, embers that rise and cool (yellow -> orange -> red -> gone),
//    a smoke column of pixel puffs (overlapping near the source, each with its own life so the upper column breaks
//    into clumps; rises first, bends later; the walker's wake drags only its low part; chimneys are never dragged), a warm PointLight whose quantised level
//    follows the drawing on screen (tall drawing = bright frame).
//  - own gait / motion: every part on its own ambient clock (t3ssel8r: "different parts of the fire run at different
//    frame rates to emulate a hand-animation look"): flame k=2 (7.5 fps, 6-drawing loop), core k=3 (5 fps), coals
//    k=4 (3.75 fps), smoke travel k=3 (5 fps), ember travel k=1 (15 fps), light on the flame clock.
//  - expressions in this style: a FLARE is a silhouette change, not a brightness fade: the flame jumps two sizes
//    (1.0 -> 1.25 -> 1.5) and leans with the walker's motion (the body drags air along), throws a burst of embers
//    and pushes the smoke, holds, drops back past normal into a short GUTTER (0.8, leaning back), then settles.
//    Extinguish = 1.0 -> 0.55 -> 0.3 -> out in 3 drawings (0.4 s), a thick smoke burst, wisps, coals dying in 3
//    steps over 8 s. Relight = spark burst, 0.3 -> 0.55 -> 0.8 -> 1.25 (catches) -> 1.0.
//  - readability at game speed: the flare triggers on effective distance d - approach * 0.35 s (the walker's bow
//    wave), so a 5.8 m/s runner passing ~1 m away sets it off ~0.45 s before the closest pass (firstFlee logged for
//    ambientpack's reaction_lead); each step is a whole drawing held >= 2 grid ticks (0.13 s), 2-6 texels taller.
//
// RENDER: ONE THREE.Points batch draws every flame, core, coal bed, smoke puff and ember of every fire: point sprites
// that sample a palette-index atlas (src/ambient/fire/drawings.js), anchored at their base and snapped to the texel
// grid in the vertex shader. Colour pass: flames / coals / embers are emissive (rtScene.a = 0: fog and god rays leave
// them alone), smoke is solid (a = 1). Normal pass: FLAG_NONE (never outlined, never paints an outline over a flame).
// => 2 GL calls for all fires + 3 for the merged fixture mesh (fixtures: false for hosts with their own props).
// PointLights: <= 2 (budget), always in the scene, off = intensity 0.
//
// opts: {
//   fires: [{ id, kind: 'campfire'|'brazier'|'torch'|'forge'|'candle', pos: Vector3 (ground; torch: the wall-face
//            mount point), yaw (rad, local +Z = open side), lit = true }]   (default: a layout on the ambient stage)
//   fixtures = true, lights = ['campfire', 'forge'] (ids or kinds that own the <= 2 PointLights),
//   flare: { look = 0.35, minSpeed = 1.2 }, wind = 0.08 (m/s smoke drift, screen-right), dayLight = 0 (lights are off by day) }
// api: { fires (ids), extinguish(id, t), relight(id, t), schedule([{ id, t, on }]), flare(id, t, lean),
//        isLit(id, t), events (flare log) }   — events are a sorted list, so the image stays a pure f(t).
import * as THREE from 'three';
import { defineSystem, Ticker, GRID_HZ, gridTime, clockIndex, clockTime, cycleFrame, hash, clamp, TAU } from './core.js';
import { FLAGS_GLSL } from '../core/glsl.js';
import { buildAtlas, PALETTE, PAL_SIZE, SIZES, S_NORMAL, NF, NC, NCOAL, heightScale } from './fire/drawings.js';
import { buildFixture, mergeFixtures } from './fire/fixtures.js';
import { toonMaterial } from '../materials/toon.js';

// ------------------------------------------------------------------------------------------------ per-kind tuning
// flareR: effective distance (m) that flares it. smoke / embers periods are whole grid ticks (n / 15 s).
const KIND = {
  campfire: { flareR: 1.7, bias: 0.3, light: { color: '#FF6836', intensity: 2.8, distance: 1.55 },
    smoke: { P: 6, Q: 3, life: 3.6, rise: 0.55, r: [2, 6] }, embers: { P: 2, life: [0.9, 1.6], rise: 0.95, spread: 0.3 }, coals: true },
  brazier: { flareR: 1.6, bias: 0.12, light: { color: '#FF9A4A', intensity: 2.2, distance: 4.2 },
    smoke: { P: 8, Q: 3, life: 3.0, rise: 0.5, r: [2, 5] }, embers: { P: 3, life: [0.8, 1.4], rise: 0.85, spread: 0.24 }, coals: true },
  torch: { flareR: 1.5, bias: 0.06, light: { color: '#FF9A4A', intensity: 1.6, distance: 3.2 },
    smoke: { P: 6, Q: 3, life: 2.2, rise: 0.45, r: [2, 4] }, embers: { P: 5, life: [0.6, 1.1], rise: 0.7, spread: 0.1 }, coals: true },
  forge: { flareR: 1.8, bias: 0.12, light: { color: '#FF6836', intensity: 2.4, distance: 1.25 },
    smoke: { P: 7, Q: 4, life: 3.4, rise: 0.5, r: [2, 5] }, embers: { P: 3, life: [0.5, 0.9], rise: 0.8, spread: 0.6 }, coals: true },
  candle: { flareR: 1.2, bias: 0.03, light: { color: '#FFC46B', intensity: 0.9, distance: 2.0 },
    smoke: null, embers: null, coals: false },
};
const SIZE_LIGHT = [0.3, 0.5, 0.75, 1, 1.2, 1.4];
const RELIGHT = [[0.27, 0], [0.54, 1], [0.8, 2], [1.07, 4]];     // age -> size index while catching
const SMOKE_AFTER = 1.4;          // a relit fire smokes again 0.33 s after the catch drawing settled (no skewered puff)
const CANDLE_STAGGER = [0, 3, 5]; // grid ticks: each wick catches on its own beat
const MAXP = 448;

// ------------------------------------------------------------------------------------------------ point shader
const VERT = /* glsl */`
uniform int uPassMode;
uniform vec2 uLowSize;
attribute vec4 aSpr;      // cell, size (texels; 0 = hidden), offY (texels from the anchor up to the sprite centre), bias (m)
varying float vCell, vSize;
void main() {
  vCell = aSpr.x; vSize = aSpr.y;
  if (aSpr.y < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.z += aSpr.w;                                   // towards the camera (depth only: the ortho projection keeps x/y)
  vec4 clip = projectionMatrix * mv;
  vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uLowSize;
  vec2 a = floor(px);                               // anchor texel (whole-texel steps: nothing glides)
  float odd = mod(aSpr.y, 2.0);
  vec2 c = vec2(a.x + (odd > 0.5 ? 0.5 : 0.0), a.y + aSpr.z + (odd > 0.5 ? 0.5 : 0.0));
  clip.xy = (c / uLowSize * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = aSpr.y;
}`;
const FRAG = /* glsl */`
uniform int uPassMode;
uniform sampler2D tAtlas;
uniform vec3 uAtlas;      // cols, cell, (unused)
uniform vec2 uAtlasSize;
uniform vec3 uPal[${PAL_SIZE}];
uniform int uGlowMode;
varying float vCell, vSize;
${FLAGS_GLSL}
void main() {
  vec2 c = floor(gl_PointCoord * vSize);
  float col = mod(vCell, uAtlas.x), row = floor(vCell / uAtlas.x + 1e-4);
  vec2 uv = (vec2(col, row) * uAtlas.y + c + 0.5) / uAtlasSize;
  int idx = int(texture2D(tAtlas, uv).r * 255.0 + 0.5);
  if (idx == 0) discard;
  bool glow = idx >= 18;
  if (glow && (uPassMode == 1 || uGlowMode == 0)) discard;     // light only: never in the normal pass
  if (uPassMode == 1) { gl_FragColor = vec4(0.5, 0.5, 1.0, FLAG_NONE); return; }
  // glow mode (night): dst factor = src alpha -> a = 0 replaces (flames, smoke), a = 1 ADDS (glow on the stone)
  // glow a < 1 also dims the cool stone under it a little, so warm x blue-grey lands on a brown, not a mauve
  if (uGlowMode == 1) { gl_FragColor = vec4(uPal[idx], glow ? (idx == 19 ? 0.9 : 0.8) : 0.0); return; }
  bool solid = idx >= 6 && idx <= 11;
  gl_FragColor = vec4(uPal[idx], solid ? 1.0 : 0.0);
}`;

// ------------------------------------------------------------------------------------------------ default layout
/** Screen-right / screen-up directions on the ground from the camera yaw (camera.right is only built on update). */
function groundBasis(engine) {
  const y = engine.camera.yaw ?? Math.PI / 4;
  return { R: new THREE.Vector3(Math.cos(y), 0, -Math.sin(y)), F: new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)) };
}
/** The ambient stage layout: every fire beside the scripted walker's loop (docs/AMBIENT.md §6). */
function stageLayout(ctx) {
  const { engine, anchors } = ctx;
  const S = anchors.spots || {};
  const { R, F } = groundBasis(engine);
  const scr = (p, sx, sy) => p.clone().addScaledVector(R, sx).addScaledVector(F, sy * 2).setY(0);
  const face = Math.atan2(-F.x, -F.z);                        // local +Z -> towards the camera
  const o = new THREE.Vector3();
  const flock = S.flock ?? o, pillarB = S.pillarB ?? scr(o, -0.6, 3.3), wall = S.wall ?? scr(o, 3.6, 3.1), lantern = S.lantern ?? scr(o, 2.4, 0.9);
  const torchAt = wall.clone().addScaledVector(R, 0.9).addScaledVector(F, -0.27).setY(0);
  return [
    { id: 'campfire', kind: 'campfire', pos: scr(flock, -0.35, -0.45), yaw: face },
    { id: 'brazier', kind: 'brazier', pos: scr(pillarB, 1.1, 0.05), yaw: face },
    { id: 'torch', kind: 'torch', pos: torchAt, yaw: face, mount: 0.62 },
    { id: 'forge', kind: 'forge', pos: scr(lantern, 2.0, -2.5), yaw: face },
    { id: 'candle', kind: 'candle', pos: scr(lantern, -1.4, -1.85), yaw: face },
  ];
}

export default defineSystem({
  name: 'fire', owner: 'fire', budget: { glCalls: 5, lights: 2 },
  create(ctx, opts = {}) {
    const { engine, actors, heightAt } = ctx;
    const seed = ctx.seed;
    const vh = engine.camera.viewHeight ?? 10;
    const tpm = 360 / vh;
    const look = opts.flare?.look ?? 0.35, minSpeed = opts.flare?.minSpeed ?? 1.2;
    const wind = opts.wind ?? 0.08, dayLight = opts.dayLight ?? 0;
    const { R } = groundBasis(engine);
    const UP = new THREE.Vector3(0, 1, 0);
    const pscale = tpm / 36;

    // ---- fires + fixtures
    const defs = opts.fires ?? stageLayout(ctx);
    const kinds = [...new Set(defs.map((d) => d.kind))];
    const atlas = buildAtlas(kinds, tpm, seed);
    const parts = [];
    const fires = defs.map((d, i) => {
      const K = KIND[d.kind];
      if (!K) throw new Error(`fire: unknown kind '${d.kind}'`);
      const p = d.pos.clone();
      p.y = d.mount !== undefined ? (heightAt(p.x, p.z) ?? 0) + d.mount : (d.pos.y || heightAt(p.x, p.z) || 0);
      const fx = buildFixture(d.kind, p, d.yaw ?? 0);
      if (opts.fixtures !== false) parts.push(...fx.parts);
      const A = atlas.kinds[d.kind];
      const yaw = d.yaw ?? 0;
      return {
        i, id: d.id ?? `${d.kind}${i}`, kind: d.kind, K, A, emitters: fx.emitters, lightAt: fx.light, glowAt: fx.glow,
        chimneyAt: fx.smoke, center: p, events: [], forced: [], lit0: d.lit !== false,
        facing: d.mount !== undefined ? [Math.sin(yaw), Math.cos(yaw)] : null,      // wall-mounted: reacts on its own side only
        flare: null, flares: [], light: null, ph: Math.floor(hash(i, 11, seed) * 6),
      };
    });
    let fixtureMesh = null;
    if (parts.length) {
      const geo = mergeFixtures(parts);
      const mat = toonMaterial(engine, { vertexColors: true, toneAttributes: true, flatShading: true, outline: 'full' });
      fixtureMesh = new THREE.Mesh(geo, mat);
      fixtureMesh.castShadow = true; fixtureMesh.receiveShadow = true; fixtureMesh.name = 'ambient-fire-fixtures';
      ctx.root.add(fixtureMesh);
    }

    // ---- lights (<= 2, always present; off = 0)
    const want = opts.lights ?? ['campfire', 'forge'];
    const owners = (typeof want === 'number' ? fires.slice(0, want) : fires.filter((f) => want.includes(f.id) || want.includes(f.kind))).slice(0, 2);
    for (const f of owners) {
      const L = f.K.light;
      const pl = new THREE.PointLight(new THREE.Color(L.color), 0, L.distance, L.decay ?? 1.5);
      pl.castShadow = false; pl.position.copy(f.lightAt); pl.name = `ambient-fire-${f.id}`;
      ctx.root.add(pl);
      f.light = pl;
    }

    // ---- sprite batch
    const tex = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    const pal = Array.from({ length: PAL_SIZE }, () => new THREE.Color(0, 0, 0));
    const setPalette = (night) => { const P = night ? PALETTE.night : PALETTE.day; for (let k = 1; k < PAL_SIZE; k++) pal[k].set(P[k]); };
    setPalette(false);
    const U = {
      uPassMode: engine.uniforms.uPassMode, uLowSize: engine.pipeline.common.uLowSize, tAtlas: { value: tex },
      uAtlas: { value: new THREE.Vector3(atlas.cols, atlas.cell, 0) }, uAtlasSize: { value: new THREE.Vector2(atlas.width, atlas.height) },
      uPal: { value: pal }, uGlowMode: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true });
    // pure replace (colour AND alpha): emissive texels write a = 0, smoke a = 1 (PIPELINE emissive rule)
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.ZeroFactor;
    mat.blendEquationAlpha = THREE.AddEquation; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.ZeroFactor;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXP * 3), spr = new Float32Array(MAXP * 4);
    const pA = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), sA = new THREE.BufferAttribute(spr, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pA); geo.setAttribute('aSpr', sA);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; points.renderOrder = 10; points.name = 'ambient-fire-fx';
    // night glow: the colour pass blends dst x src.a (a = 0: replace, a = 1: add); the normal pass stays pure replace
    // (its alpha is the outline flag). Same draw call; only the blend factor changes per pass.
    points.onBeforeRender = () => { mat.blendDst = U.uGlowMode.value && U.uPassMode.value === 0 ? THREE.SrcAlphaFactor : THREE.ZeroFactor; };
    ctx.root.add(points);
    let np = 0, lastNp = 0;
    const put = (p, cell, size, offY, bias) => {
      if (np >= MAXP || cell < 0) return;
      pos[np * 3] = p.x; pos[np * 3 + 1] = p.y; pos[np * 3 + 2] = p.z;
      spr[np * 4] = cell; spr[np * 4 + 1] = size; spr[np * 4 + 2] = offY; spr[np * 4 + 3] = bias;
      np++;
    };

    // ---- lit state from the event list (pure f(t))
    const sortEv = (f) => f.events.sort((a, b) => a.t - b.t);
    function litAt(f, t) {
      let on = f.lit0, t0 = -1e9, has = false;
      for (const e of f.events) { if (e.t > t + 1e-9) break; on = e.on; t0 = e.t; has = true; }
      return { on, age: t - t0, has };
    }
    const settled = (L) => L.on && (!L.has || L.age >= 1.2);

    // ---- flare reaction: 15 Hz replay ticker over the actors' sampled paths
    const events = [];
    let firstFlee = '';
    const R2 = new THREE.Vector3();
    const ticker = new Ticker({
      hz: GRID_HZ,
      reset() { events.length = 0; firstFlee = ''; for (const f of fires) { f.flare = null; f.flares.length = 0; } },
      tick(t) {
        const snap = actors.snapshot(t);
        for (const f of fires) {
          if (!settled(litAt(f, t))) continue;
          const forced = f.forced.find((e) => e.t > t - 1 / GRID_HZ + 1e-9 && e.t <= t + 1e-9);
          let trig = null;
          if (forced) trig = { lean: forced.lean || 1, d: 0, v: 0 };
          let hit = snap.nearest(f.center.x, f.center.z, 8);
          // a wall torch only feels a walker on its own side of the wall (dot of the offset with its facing > 0)
          if (hit && f.facing && (hit.item.x - f.center.x) * f.facing[0] + (hit.item.z - f.center.z) * f.facing[1] <= 0.05) hit = null;
          // the lean starts only once the body is actually at the fire (d < flareR): step 1 is the pure size jump
          const fl0 = f.flare;
          if (fl0 && fl0.tLean === null && hit && hit.d < f.K.flareR && t - fl0.t0 < fl0.hold - fl0.t0 + 0.4) fl0.tLean = t;
          if (!trig && hit && hit.speed >= minSpeed) {
            const eff = hit.d - Math.max(0, hit.approach) * look;
            if (eff < f.K.flareR) {
              const sx = hit.item.vx * R.x + hit.item.vz * R.z;
              trig = { lean: sx >= 0 ? 1 : -1, d: hit.d, v: hit.speed };
            }
          }
          if (!trig) continue;
          const fl = f.flare;
          if (fl && t - fl.t0 < fl.hold - fl.t0 + 0.8) {           // already flaring: a close walker extends the peak
            if (t < fl.hold) fl.hold = Math.max(fl.hold, t + 0.2);
            continue;
          }
          f.flare = { t0: t, hold: t + 0.4, lean: trig.lean, tLean: forced || (hit && hit.d < f.K.flareR) ? t + 2 / GRID_HZ : null };
          f.flares.push(f.flare); if (f.flares.length > 4) f.flares.shift();
          events.push({ id: f.id, t: +t.toFixed(3), d: +trig.d.toFixed(2), v: +trig.v.toFixed(2) });
          if (!firstFlee && trig.v > 0) firstFlee = `${t.toFixed(3)}s@${trig.d.toFixed(2)}m/${trig.v.toFixed(2)}mps`;
        }
      },
    });

    /** Size index + lean of a fire's flame at t (-1 = no flame). */
    function flameState(f, t) {
      const L = litAt(f, t);
      if (!L.on) { if (L.has && L.age < 0.2) return { s: 1, lean: 0, L }; if (L.has && L.age < 0.4) return { s: 0, lean: 0, L }; return { s: -1, lean: 0, L }; }
      if (L.has && L.age < 1.2) { for (const [a, s] of RELIGHT) if (L.age < a) return { s, lean: 0, L }; return { s: S_NORMAL, lean: 0, L }; }
      const fl = f.flare;
      if (fl && t >= fl.t0) {
        const a = t - fl.t0, he = fl.hold - fl.t0;
        const ln = fl.tLean !== null && t >= fl.tLean - 1e-9 ? fl.lean : 0;     // body there: the flame leans with it
        if (a < 2 / GRID_HZ) return { s: 4, lean: 0, L, flare: 1 };           // anticipation: pure size jump
        if (a < he) return { s: 5, lean: ln, L, flare: 2 };
        if (a < he + 0.4) return { s: 4, lean: ln, L, flare: 3 };
        if (a < he + 0.8) return { s: 2, lean: ln, L, flare: 4 };            // gutter: dips, the wake keeps dragging
        if (a < he + 1.2) return { s: S_NORMAL, lean: 0, L, flare: 5 };      // springs back upright
      }
      return { s: S_NORMAL, lean: 0, L };
    }
    function coalLevel(f, st) {
      const L = st.L;
      if (f.kind === 'candle') return !L.on && L.has && L.age < 0.6 ? 1 : 0;
      if (L.on) return L.has && L.age < 0.54 ? 2 : 3;
      if (!L.has) return 0;
      if (f.kind === 'torch') return L.age < 1.0 ? 2 : L.age < 2.5 ? 1 : 0;
      return L.age < 1.5 ? 3 : L.age < 4 ? 2 : L.age < 8 ? 1 : 0;
    }

    const tmp = new THREE.Vector3();
    let tod = ctx.tod;
    const S = { lit: 0, flaring: 0, puffs: 0, embers: 0, glow: 0 };
    let glowOn = false;
    function smoke(f, t, night) {
      const sm = f.K.smoke;
      const L = litAt(f, t);
      // candle: no smoke while lit; a single thread after the snuff
      // A column that rises first and bends later (lean ~ age^2), puffs ~ their own radius apart near the source
      // (overlapping: a column, not beads), each puff with its own life (45-100 %) so the upper column breaks into
      // separate clumps instead of a solid tube, a per-puff wander that grows with age, and a final shrink drawing.
      const P = sm ? sm.P : 4, Q = (sm?.Q ?? Math.max(2, Math.round(P * 0.5))) / GRID_HZ, life = sm ? sm.life : 1.6;
      const j0 = Math.floor((t - life - 1.6) / Q), j1 = Math.floor(t / Q + 1e-6);
      const ts = clockTime(t, 3, f.i % 3);
      const chimney = f.kind === 'forge';
      for (let j = j0; j <= j1; j++) {
        const tj = j * Q;                                 // (tj < 0: pre-roll, the column exists at t = 0)
        const Lb = litAt(f, tj);
        let r0, r1, lf, dense = false;
        if (Lb.on && (!Lb.has || Lb.age > SMOKE_AFTER)) { if (!sm) continue; [r0, r1] = sm.r; lf = life; }
        else if (!Lb.on && L.on) continue;               // relit: the catch burns off the last wisps (none beside the new flame)
        else if (!Lb.on && Lb.has && Lb.age < 1.6) { dense = true; r0 = sm ? sm.r[0] + 1 : 1; r1 = sm ? sm.r[1] : 2; lf = sm ? life * 0.9 : 1.4; if (!sm && j % 2) continue; }
        else if (!Lb.on && Lb.has && Lb.age < 5) { if (j % 2 || !sm) continue; r0 = 1; r1 = Math.max(2, sm.r[1] - 2); lf = life * 0.6; }
        else continue;
        const hj = hash(j, f.i, seed + 9);
        const lj = lf * (dense ? 0.75 + 0.25 * hj : 0.6 + 0.4 * hj);            // this puff's own life
        const a = ts - tj; if (a < 0 || a > lj) continue;
        const u = a / lf, uj = a / lj;
        const ph = TAU * hash(j, 17, seed);
        let x = wind * 1.6 * a * a / (1 + 0.35 * a)                                        // rises first, bends later
          + (0.03 + 0.07 * a) * Math.sin(ph + a * 1.7)                                    // wander grows with age
          + (hash(j, f.i, seed) - 0.5) * (dense ? 0.16 : 0.07);
        if (!chimney) for (const fl of f.flares) {
          // the walker's wake drags the LOW part of the column (puffs near the fire when it passed), never a chimney
          const af = fl.t0 - tj;                       // this puff's age at the flare (< 0: born just after it)
          if (fl.tLean === null || ts < fl.tLean || af > lj || af < -0.5) continue;
          const w = af >= 0 ? clamp(1 - af / 1.4) : clamp(1 + af / 0.5);
          x += fl.lean * 0.34 * w * clamp((ts - fl.tLean) / 0.45);
        }
        const rise = (sm ? sm.rise : 0.35) * (dense ? 1.15 : 1) * (0.9 + 0.2 * hash(j, 23, seed));
        // lit: born above the tip of the drawing on screen AT ITS BIRTH (a flare / catch tongue is taller), its bottom
        // edge clear of the tip, so no tongue ever skewers a young puff; snuffed: pours off the coals / wick
        if (chimney) tmp.copy(f.chimneyAt);
        else if (Lb.on) tmp.copy(f.emitters[0]).addScaledVector(UP, (f.A.p.h * heightScale(f.A.p, SIZES[tipSize(f, tj)]) * 1.1 + (r0 + 3) * pscale) / tpm);
        else tmp.copy(f.emitters[0]);
        tmp.addScaledVector(UP, rise * a * (1 - 0.22 * u)).addScaledVector(R, x);
        let rad = r0 + (r1 - r0) * Math.sqrt(u) + (hash(j, 31, seed) < 0.3 ? -1 : 0);
        if (uj > 0.9) rad = Math.max(1, rad - 2);                                  // last drawing: shrink, no pop
        rad = Math.round(rad * pscale);                                          // radii are authored at vh 10
        const fade = uj > 0.9 ? 2 : uj > 0.72 ? 1 : 0;
        const warm = false && night && L.on;   // (warm-lit puffs read as brown blobs capping the flame at night: off)
        put(tmp, atlas.puff(rad, fade, warm), atlas.puffN, 0, 0);
        S.puffs++;
      }
    }
    /** Size index of the flame drawing at a puff's birth tj (flare steps from the flare log; else normal). */
    function tipSize(f, tj) {
      for (const fl of f.flares) {
        const a = tj - fl.t0, he = fl.hold - fl.t0;
        if (a >= 0 && a < he + 0.4) return a < 2 / GRID_HZ || a >= he ? 4 : 5;
      }
      return S_NORMAL;
    }
    function embers(f, t, st) {
      const em = f.K.embers;
      if (!em) { if (f.kind === 'candle') candleSparks(f, t); return; }
      const tg = gridTime(t);
      const H0 = f.A.p.h / tpm;
      // lat: a number (fixed offset) or { x0, v } (a throw: sideways speed that dies off in ~0.35 s, so a burst
      // fans out and then rises, instead of streaming sideways as a dotted line)
      const draw = (k, born, life, rise, lat, size2) => {
        const a = tg - born; if (a < 0 || a > life) return;
        const u = a / life;
        const e = f.emitters[k % f.emitters.length];
        const sway = 0.05 * Math.sin(a * 7 + k * 1.7);
        const lx = typeof lat === 'number' ? lat : lat.x0 + lat.v * (1 - Math.exp(-3 * a)) / 3;
        tmp.copy(e).addScaledVector(UP, H0 * 0.3 + rise * a * (1 - 0.35 * u)).addScaledVector(R, lx + sway + wind * a);
        const stage = u < 0.4 ? 0 : u < 0.75 ? 1 : 2;
        put(tmp, atlas.ember(stage, size2 && a < 0.2 ? 2 : 1), size2 && a < 0.2 ? 2 : 1, 0, f.K.bias);
        S.embers++;
      };
      const P = em.P / GRID_HZ, maxL = em.life[1];
      for (let j = Math.floor((tg - maxL) / P); j <= Math.floor(tg / P + 1e-6); j++) {
        const tj = j * P;
        if (!settled(litAt(f, tj)) || hash(j, f.i, seed + 3) > 0.75) continue;
        const life = em.life[0] + (em.life[1] - em.life[0]) * hash(j, f.i, seed + 4);
        draw(j, tj, life, em.rise * (0.8 + 0.4 * hash(j, 2, seed)), (hash(j, f.i, seed + 5) - 0.5) * em.spread, false);
      }
      // flare bursts: 10 embers thrown with the lean; relight: 6 sparks
      // the burst leaves on the big jump (step 2); it is thrown sideways only if the body is already there
      const big = f.kind === 'torch' ? 6 : 3;                    // the small torch throws more 2-texel sparks
      for (const fl of f.flares) {
        if (tg - fl.t0 > 1.8 || tg < fl.t0) continue;
        for (let k = 0; k < 10; k++) {
          const born = fl.t0 + (2 + (k % 4)) / GRID_HZ;
          const thrown = fl.tLean !== null && fl.tLean <= born + 1e-9 ? 1 : 0.2;
          const life = 0.7 + 0.7 * hash(k, Math.round(fl.t0 * 15), seed + 6);
          draw(k + 3, born, life, em.rise * (0.9 + 0.9 * hash(k, 13, seed)),
            { x0: (hash(k, 4, seed) - 0.5) * Math.max(em.spread, 0.2), v: fl.lean * thrown * (0.4 + 1.4 * hash(k, 9, seed)) }, k < big);
        }
      }
      const L = st.L;
      if (L.on && L.has && L.age < 1.6) for (let k = 0; k < 6; k++)
        draw(k, gridTime(t - L.age + 1e-6) + (k % 3) / GRID_HZ, 0.5 + 0.4 * hash(k, 21, seed), em.rise * 1.2, (hash(k, 22, seed) - 0.5) * em.spread * 1.5, k < 2);
    }

    /** Candle relight: a 2-texel spark hop over each wick on its own beat (stagger); snuffed: a red wick ember 0.5 s. */
    function candleSparks(f, t) {
      const tg = gridTime(t);
      f.emitters.forEach((e, k) => {
        const L = litAt(f, tg - CANDLE_STAGGER[k % 3] / GRID_HZ);
        if (!L.on || !L.has || L.age < 0 || L.age >= 4 / GRID_HZ) return;
        const n = Math.round(L.age * GRID_HZ);
        if (n < 2) { put(e, atlas.ember(0, 1), 1, 3 + n, 0.05); put(e, atlas.ember(0, 1), 1, 5 + n, 0.05); S.embers += 2; }
        else { put(e, atlas.ember(1, 1), 1, 6 + n, 0.05); S.embers++; }
      });
    }
    function writeAll(t) {
      np = 0; S.lit = 0; S.flaring = 0; S.puffs = 0; S.embers = 0; S.glow = 0;
      const night = !!tod?.dark;
      const smokeNight = (tod?.night ?? 0) > 0.8;
      const states = fires.map((f) => flameState(f, t));
      // per-emitter state: candle wicks catch on their own beats after a relight (stagger), everything else shares
      const est = fires.map((f, n) => f.emitters.map((e, k) => {
        const st = states[n];
        return f.kind === 'candle' && st.L.on && st.L.has && st.L.age < 2 ? flameState(f, t - CANDLE_STAGGER[k % 3] / GRID_HZ) : st;
      }));
      // order = paint order inside the one draw call: glow (adds onto the stone) -> smoke -> coals -> flames -> cores -> embers
      if (glowOn) fires.forEach((f, n) => {
        if (f.light) return;                                      // a PointLight already lights its stone
        const st = states[n];
        const s = st.s >= 0 ? st.s : coalLevel(f, st) >= 2 ? 0 : -1;
        if (s < 0) return;
        const g = f.A.glow(s, f.A.light[cycleFrame(t, NF, 2, f.ph)] >= 2 ? 1 : 0);
        if (g) { put(f.glowAt, g.cell, g.N, 0, f.kind === 'torch' ? 0.06 : f.A.p.glow[0] + 0.1); S.glow++; }
        if (f.A.p.halo) f.emitters.forEach((e, k) => {
          const sk = est[n][k];
          if (sk.s >= 0) put(e, f.A.halo(sk.s, sk.lean, cycleFrame(t, NF, 2, f.ph + k * 3)), f.A.N, f.A.N / 2, f.K.bias - 0.005);
        });
      });
      for (const f of fires) smoke(f, t, smokeNight);
      fires.forEach((f, n) => {
        const lv = coalLevel(f, states[n]);
        if (lv > 0 && f.K.coals) for (const e of f.emitters) put(e, f.A.coal(lv, cycleFrame(t, NCOAL, 4, f.ph)), f.A.N, f.A.N / 2, f.K.bias + 0.01);
        // a snuffed candle wick keeps a red ember for 0.5 s
        if (f.kind === 'candle' && !states[n].L.on && states[n].L.has && states[n].L.age < 0.5) for (const e of f.emitters) put(e, atlas.wick, 1, 1, f.K.bias);
      });
      fires.forEach((f, n) => {
        const st = states[n];
        if (st.s >= 0) { S.lit++; if (st.flare) S.flaring++; }
        f.emitters.forEach((e, k) => {
          const sk = est[n][k];
          if (sk.s < 0) return;
          const fr = cycleFrame(t, NF, 2, f.ph + k * 3);
          put(e, f.A.flame(sk.s, sk.lean, fr), f.A.N, f.A.N / 2, f.K.bias);
        });
      });
      fires.forEach((f, n) => {
        const st = states[n];
        if (st.s < 2 || !f.A.p.core) return;
        for (const e of f.emitters) put(e, f.A.core(st.s, cycleFrame(t, NC, 3, f.ph)), f.A.N, f.A.N / 2, f.K.bias + 0.01);
      });
      fires.forEach((f, n) => embers(f, t, states[n]));
      for (let k = np; k < lastNp; k++) spr[k * 4 + 1] = 0;
      lastNp = np;
      pA.needsUpdate = true; sA.needsUpdate = true;
      geo.setDrawRange(0, Math.max(np, 1));
      // lights: quantised level follows the flame drawing on screen (tall frame = bright), x size, x day/night
      for (const [n, f] of fires.entries()) {
        if (!f.light) continue;
        const st = states[n];
        const q = st.s >= 0 ? f.A.light[cycleFrame(t, NF, 2, f.ph)] : 0;
        let I = st.s >= 0 ? f.K.light.intensity * SIZE_LIGHT[st.s] * (0.76 + 0.08 * q) : f.K.light.intensity * 0.1 * coalLevel(f, st);
        if (!night) I *= dayLight;
        f.light.intensity = I;
      }
    }

    const api = {
      get fires() { return fires.map((f) => ({ id: f.id, kind: f.kind, pos: f.center.clone() })); },
      get events() { return events; },
      extinguish(id, t) { return api.schedule([{ id, t, on: false }]); },
      relight(id, t) { return api.schedule([{ id, t, on: true }]); },
      schedule(list) {
        for (const e of list) { const f = fires.find((x) => x.id === e.id || x.kind === e.id); if (f) { f.events.push({ t: e.t, on: !!e.on }); sortEv(f); } }
        ticker.n = null;                                  // re-simulate: the flare history depends on the lit state
        return api;
      },
      flare(id, t, lean = 1) { const f = fires.find((x) => x.id === id || x.kind === id); if (f) { f.forced.push({ t, lean }); ticker.n = null; } return api; },
      isLit(id, t) { const f = fires.find((x) => x.id === id || x.kind === id); return f ? litAt(f, t).on : false; },
    };
    let lastT = 0;
    return {
      api,
      update(t) { lastT = t; ticker.advance(t); writeAll(t); },
      // golden keeps the day smoke (warm light, pale smoke); night: the night smoke ramp + the glow of unlit fires
      setTimeOfDay(info) { tod = info; const n = (info?.night ?? 0) > 0.8; setPalette(n); glowOn = n && opts.glow !== false; U.uGlowMode.value = glowOn ? 1 : 0; },
      stats() {
        return {
          agents: fires.length, visible: lastNp, lit: S.lit, flaring: S.flaring, puffs: S.puffs, embers: S.embers, glow: S.glow,
          calls: 2 + (fixtureMesh ? 3 : 0), lights: fires.filter((f) => f.light).length,
          flees: events.length, firstFlee, flareLog: events.map((e) => `${e.id}@${e.t}/${e.d}m`).join(' '),
          atlas: `${atlas.width}x${atlas.height}/${atlas.count}`, resets: ticker.resets, tod: tod?.name,
          dist: fires.map((f) => `${f.id}:${f.center.x.toFixed(1)},${f.center.z.toFixed(1)}`).join(' '),
        };
      },
      dispose() { points.removeFromParent(); geo.dispose(); mat.dispose(); tex.dispose(); fixtureMesh?.removeFromParent(); fixtureMesh?.geometry.dispose(); fixtureMesh?.material.dispose(); for (const f of fires) f.light?.removeFromParent(); },
    };
  },
});
