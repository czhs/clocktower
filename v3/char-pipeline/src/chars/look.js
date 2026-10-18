// Character look (owner: look). docs/CHARACTERS.md §5, docs/CHARACTER_TECHNIQUES.md §3.
//
//   characterMaterial(engine, opts) -> toonMaterial with per-vertex tones (vertexColors + toneHi/toneSh),
//     outline flag 'char' (FLAG_CHAR: inner depth lines only, no silhouette line against the world, no edge
//     highlights; src/post/outline.js) and the FAR-HALF SHADOW (t3ssel8r 2021-05, refs/chars/01: "always put
//     the far half of the body in shadow, to mimic the pixel-art trick to make limbs read better").
//   updateLook(engine, rig) -> writes the per-bone far flags for the current pose / facing / camera. The first
//     call also hooks rig.mesh.onBeforeRender, so the flags stay right when only the camera turns or the root
//     moves between pose changes (pure function of the current state: deterministic).
//
// Far-half shadow, how:
//   * PER BONE (a limb never splits): skinIndex/skinWeight pick the flag of the bone each vertex is bound to,
//     weighted (2-bone blends cut cleanly at w = .5). Flags live in a uniform float array (LOOK_MAX_BONES).
//   * A bone's SIDE comes from its NAME (CHARACTERS.md §1): …L / …R (+ digits) sided, else the nearest sided ancestor
//     (a prop bone under handR is R), else MIDLINE (hips, spine, head, scarf/tail chains…). `sides: {bone: 'L'|'R'|
//     'mid'|'auto'}` overrides ('auto' = by bind position, x beyond ±sideEps).
//   * far side: s = dot(character's left axis (root +X, on the ground), camera forward on the ground).
//     s > +dead → the LEFT side points away from the camera → L bones far; s < -dead → R bones far.
//     |s| <= dead (facing the camera or facing away: the sides are equally far) → the side turned away from the
//     sun is the "far" one (keeps the trick at the two frontal facings, consistent with the light); if the sun
//     is also side-on, nothing is forced. With 8 quantized facings s ∈ {0, ±.71, ±1}: no flicker.
//   * Midline bones are not forced (default). opts.midline = 'pixel' forces their far half per pixel (behind
//     the vertical plane through the hips, as seen from the camera, with a dead zone in metres).
//   * Forced pixels get light L = 0 (shadow band) but keep the shadow definition (faces turned away from the
//     sun one step darker, hemispheric up/down term), so the far limb keeps its form. opts.farLight > 0 caps the
//     far side at that L instead (e.g. 0.3 → mid band at noon).
//   * Colour pass only: the normal pass (outline flags) and shadow casting (three's skinned depth material)
//     are unaffected; the mesh casts and receives sun shadows like the world.
//
// Ground separation (TECHNIQUES §3, decision recorded in CHARACTER_LEARNINGS): t3ssel8r's character separates
// from grass by VALUE and HUE of its palette + the far-half shadow + its own cast shadow; there is no rim light
// and no outline in any of his shots, so neither is added here. One change from the world material:
//   * cloud: 'root' (default) — cloud shadows are evaluated once at the character's anchor (root + 0.5 m), so a
//     drifting cloud edge never cuts the 50-texel figure into two bands (it flips the whole figure at once,
//     like a sprite). 'pixel' = world behaviour, 'off' = never cloud-shadowed.
//
// Options (all optional; anything else is passed to toonMaterial):
//   farHalf true | false, farLight 0 (L of forced pixels), sideEps 0.035 (m), dead 0.3 (|s| for "facing"),
//   sunTieBreak true, midline 'none'|'pixel', midDead 0.04 (m), sides {boneName: 'L'|'R'|'mid'},
//   cloud 'root'|'pixel'|'off', maxBones 64, debug: 'far' (forced pixels tinted magenta) | 'parts' (flat colour per
//   part id) — or ?look=far / ?look=parts,
//   selfShadow 'hull' | <metres> | 0, hullMargin 0.12 (m), partLines true.
//   A/B from the URL: ?lookOpts=selfShadow:0,partLines:0,farHalf:0 (numbers; selfShadow:-1 = 'hull').
//
// Self-shadow exemption (critic-wanderer 2026-10-15): a 50-texel figure must not shadow ITSELF with the sun's shadow
// map. A 0.32 m hat brim put the whole face in the skin shadow tone (#976670) in every facing (a dark mask), and while
// the root travels the self-shadow edges re-rasterise against the shadow-map grid (4-13 px specks per frame on the
// coat). Each character pixel compares against the shadow map as if moved TOWARDS the sun to where its light ray
// leaves the character's own HULL (default 'hull': a vertical cylinder around the root, radius = the bind mesh's
// horizontal reach + hullMargin, top = its height + hullMargin, measured on the first render) — an extra depth bias
// in the shadow camera's depth units. So every caster inside the hull (brim, arms, scarf, the other leg) is ignored,
// every caster outside it (pillars, trees, walls, other characters) still shades the figure, per pixel. A fixed
// distance (selfShadow: 0.4) was tried first: the brim's shadow on the chest is ≈ 0.5 m up the ray at noon and stayed.
// The far-half shadow replaces self-shadowing as the form cue (t3ssel8r's elf: lit face under the hair, refs/chars/01).
// selfShadow 0 = plain shadow-map behaviour.
//
// Part lines (FLAG_CHAR inner lines only between DIFFERENT parts): the normal pass writes FLAG_CHAR + id·2^-11 in
// rtNormal.a (half float: exact for |id| ≤ 78, still inside isChar's ±0.05). id = (dominant skin bone · m + palette
// slot) mod 156 folded to ±1..±78 (0 = no part info → every depth step lines, the old rule), computed in the vertex
// shader; the slot is the index of the vertex colour in uCharPal (the mesh's distinct mid tones, ≤ 16) and m is picked per mesh so that every (bone, slot) pair present gets its own id (both
// set from material.onBeforeRender: uniforms, no geometry change — an attribute added after three's per-frame upload
// is never bound to the VAO).
// outline.js draws a character inner line only where the two pixels' ids differ: brim over face, arm over coat,
// sword over leg keep their line; the crown over the back brim of the SAME lathe (dotted 1-px staircase at grazing
// angles) no longer draws. partLines false → id 0 everywhere (old behaviour: every FLAG_CHAR depth step lines).
// outline.js also skips its shadow-map term for FLAG_CHAR line colours (it saw the self-shadow and crept 1-11/255
// per frame while the root glided: the last walk/run specks).
//
// Round 05 (look owner, after run 04's critics):
//   * toon.js HOOKS instead of string patches: lightMod / cloudExpr / shadowBias / outlineFlag / outgoing (toon.js
//     header). With the hooks unset toon.js emits the old shader text (world scenes + town A/B 0 px). A missing hook
//     is a console.error (page_errors FAIL), never a silently flat figure.
//   * far flags + part options are also written from material.onBeforeRender (static rig runtime, replaced
//     mesh.onBeforeRender); updateLook still installs the full rig (spec) when the Character calls it.
//   * §Part options (bottom of the file): signature/face LIFT (sigLift 0.3, faceLift 0.3), held PROPS not far-forced
//     (props 'mid', propReach 0.2 m), material HINTS for animals (material.hints {slot: 'fur'|'feather'|'scale'},
//     hintAmp), per-slot overrides material.slots {slot: {lift, side, hint}}. ?look=opts shows them (yellow lift, cyan
//     prop, green/blue/red hint).
//   * shadowSnap (default true): caster (customDepthMaterial) and receiver lookup of the figure are shifted together by
//     < 1 shadow texel so the root sits on a shadow-texel corner: the figure's own shadow pattern no longer re-rasterises
//     while it travels (wanderer walk with selfShadow:0: 48 speck frames → 0).
//   URL A/B: ?lookOpts=sigLift:0,faceLift:0,props:0,shadowSnap:0,hintAmp:0 = the run-04 look exactly (0 px, measured).
import * as THREE from 'three';
import { toonMaterial } from '../materials/toon.js';

export const PART_STEP = '0.00048828125';            // 2^-11: one half-float ulp in [0.5, 1) → exact ids
const PART_MOD = 156;                                 // ids ±1..±78 (FLAG_CHAR ± 0.039; inner-line tone parts ±79..±156, isChar: ± 0.08); 0 = no part
                                                      // info (plain FLAG_CHAR, partLines false): lines as before
const PAL_MAX = 16;

// ?lookOpts=selfShadow:0,partLines:0 → numeric A/B overrides of the material options (tests / critics)
function urlOpts(engine) {
  const q = engine.params?.get?.('lookOpts');
  if (!q) return {};
  const o = {};
  for (const kv of q.split(',')) {
    const [k, v] = kv.split(':');
    if (!k || v === undefined) continue;
    const n = Number(v);
    const kk = k.trim();
    o[kk] = ['partLines', 'farHalf', 'sunTieBreak', 'shadowSnap'].includes(kk) ? n !== 0 : kk === 'props' ? (n ? 'mid' : 'sided') : n;
  }
  return o;
}

const _hp = new THREE.Vector3(), _hs = new THREE.Vector3();
// bind-pose reach of a character mesh (root at the feet): radius around the vertical axis and top, + margin (cached)
function hullOf(geometry, margin) {
  const ud = geometry?.userData;
  if (!ud) return null;
  if (ud.charHull && ud.charHull.margin === margin) return ud.charHull;
  const p = geometry.attributes.position;
  if (!p) return null;
  let r2 = 0, top = 0;
  for (let i = 0, n = Math.min(p.count, ud.charGhostFrom ?? Infinity); i < n; i++) {   // ghost halo excluded
    const x = p.getX(i), z = p.getZ(i);
    r2 = Math.max(r2, x * x + z * z); top = Math.max(top, p.getY(i));
  }
  ud.charHull = { r: Math.sqrt(r2) + margin, top: top + margin, margin };
  return ud.charHull;
}

/**
 * Part-id table of a character geometry (cached in geometry.userData.charParts): `pal` = distinct vertex colours
 * (≤ PAL_MAX, linear floats as stored), `m` = bone multiplier making (bone·m + slot) mod PART_MOD injective over the
 * (dominant bone, slot) pairs present (null if no m works: ids may then collide → a missing line, never a wrong one).
 */
export function partTable(geometry) {
  const ud = geometry?.userData;
  if (!ud) return null;
  if (ud.charParts) return ud.charParts;
  const si = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight, col = geometry.attributes.color;
  const pal = [], pairs = new Set();
  const n = Math.min(geometry.attributes.position?.count ?? 0, ud.charGhostFrom ?? Infinity);   // ghost halo excluded
  for (let i = 0; i < n; i++) {
    let b = 0, w = -1;
    if (si && sw) for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k); if (wk > w) { w = wk; b = si.getComponent(i, k); } }
    let slot = 0;
    if (col) {
      const r = col.getX(i), g = col.getY(i), bl = col.getZ(i);
      slot = pal.findIndex((c) => Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - bl) < 1e-4);
      if (slot < 0) { slot = Math.min(pal.length, PAL_MAX - 1); if (pal.length < PAL_MAX) pal.push([r, g, bl]); }
    }
    pairs.add(b * PAL_MAX + slot);
  }
  let m = null;
  for (let k = PAL_MAX; k < PAL_MAX + PART_MOD && m === null; k++) {
    const seen = new Set();
    let ok = true;
    for (const p of pairs) { const id = (Math.floor(p / PAL_MAX) * k + (p % PAL_MAX)) % PART_MOD; if (seen.has(id)) { ok = false; break; } seen.add(id); }
    if (ok) m = k;
  }
  ud.charParts = { pal, m: m ?? PAL_MAX, pairs: pairs.size, unique: m !== null };
  return ud.charParts;
}

// stable string for the program cache key (textures/colours by identity/value, no toJSON side effects)
function keyOf(v) {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'function') return `fn:${String(v).length}:${String(v).slice(0, 200)}`;
  if (typeof v !== 'object') return JSON.stringify(v);
  if (v.isTexture) return `tex:${v.uuid}`;
  if (v.isColor) return `col:${v.getHexString()}`;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return `[${Array.from(v, keyOf).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${k}:${keyOf(v[k])}`).join(',')}}`;
}

export function characterMaterial(engine, opts = {}) {
  const {
    farHalf = true, farLight = 0, sideEps = 0.035, dead = 0.3, sunTieBreak = true, midline = 'none', midDead = 0.04,
    sides = null, cloud = 'root', maxBones = 64, debug = engine.params?.get?.('look') || null,
    selfShadow = 'hull', hullMargin = 0.12, partLines = true,
    // round 05 (look.js header §Part options): signature / face lift, held props off the far side, material hints
    sigLift = 0.3, faceLift = 0.3, liftDown = -0.35, props = 'mid', propReach = 0.2, slots = null, hints = null,
    hintAmp = 1, shadowSnap = true,
    // (module fix, wave 4) inner-line tone: 'tone' = every part's inner lines take the darker adjacent tone (hue kept)
    // instead of the cool grey-lilac; per slot: material.slots.<x>.line 'tone' | 'grey'. creamKeep k | [k, lift]: see outgoing
    innerLine = null, creamKeep = 0,
    // (module fix, wave 5) hueKeep k | { <slot>: k }: read from rig.spec.material in applyFlags (named here so it stays out of `rest`)
    hueKeep = 0,
    // (module fix, wave 3) shared ghost look: rig.buildCharacter passes spec.ghost (rig.ghostOpts) + the halo bone index
    ghost = null, ghostHaloBone = -1, ghostHeight = 1, ghostHaloC = null,
    uniforms = {}, vertexHead = '', vertex = '', fragmentHead = '', tones = '', ...rest
  } = { ...opts, ...urlOpts(engine) };
  const lin = (hex) => new THREE.Color(hex);
  const GR = ghost ? [ghost.ramp[0], ghost.ramp[1], ghost.spent[0], ghost.spent[1], ghost.mist].map(lin) : [];
  const look = {
    uCharFar: { value: new Float32Array(maxBones) },     // 1 = far side (forced), per skeleton bone index
    uCharMid: { value: new Float32Array(maxBones) },     // 1 = midline bone shaded per pixel (midline: 'pixel')
    // (module fix, look row) part-id bone per skeleton bone: identity, or spec.material.merge { <bone>: <bone> } so a
    // child part (ear, tuft, eye bump) shares its parent's part id → no inner line / speckle at the junction
    uCharIdBone: { value: Float32Array.from({ length: maxBones }, (_, i) => i) },
    uCharTime: { value: 0 },                             // Character clock (Character.update sets it each frame)
    uCharWhiteKeep: { value: 0 },                        // material.whiteKeep (golden near-white keep, see outgoing)
    uCharCenter: { value: new THREE.Vector3() },        // hips world position
    uCharFwd: { value: new THREE.Vector3(0, 0, -1) },   // camera forward on the ground (normalised)
    uCharAnchor: { value: new THREE.Vector3() },        // cloud lookup point (cloud: 'root')
    uCharShape: { value: new THREE.Vector4(farHalf ? 1 : 0, farLight, midDead, 0) },
    uCharPal: { value: Array.from({ length: PAL_MAX }, () => new THREE.Vector3()) },   // part ids: palette (linear)
    uCharPartK: { value: new THREE.Vector2(PAL_MAX, 0) },                              // bone multiplier, palette size
    uCharHull: { value: new THREE.Vector4(0, 0, 0, 0) }, // self-shadow hull: centre x, base y, centre z, radius
    uCharSelf: { value: new THREE.Vector3(0, 0, 0) },    // hull top y, fixed distance (m), 1/(shadow far - near)
    uCharOpt: { value: Array.from({ length: PART_MOD / 4 }, () => new THREE.Vector4()) }, // per raw part id (encodePartOpt)
    uCharHintK: { value: hintAmp },
    uCharSnap: { value: new THREE.Vector3(0, 0, 0) },    // shadow-lookup shift (world m) that snaps the root to the shadow grid
    uCharWhiteKeepLift: { value: 0 },                    // material.whiteKeepLift (whiteKeep on pixels a slot lift raised)
    // (module fix, wave 4) material.creamKeep: x k (0 = off), y lift (min luma of the kept cream / its authored band tone)
    uCharCreamKeep: { value: new THREE.Vector2(...(Array.isArray(creamKeep) ? [+creamKeep[0] || 0, +creamKeep[1] || 0] : [+creamKeep || 0, 0])) },
    // shared ghost (spec.ghost; level set per displayed clip by Character / rig.setGhost): x level 0|1|2, y halo bone, z H
    uCharGhost: { value: new THREE.Vector4(0, ghostHaloBone, ghostHeight, 0) },
    uCharGhostRamp: { value: Array.from({ length: 5 }, (_, i) => (GR[i] ? new THREE.Vector3(GR[i].r, GR[i].g, GR[i].b) : new THREE.Vector3())) },
    uCharGhostHalo: { value: (() => { const c = lin(ghost?.halo?.color || '#FFE08A'); return new THREE.Vector3(c.r, c.g, c.b); })() },
    // (halo boost, rig.js HALO) x, z the ring's bind-space centre; z the glint bar 0..7 (-1 = none), w the glow step 0..2
    uCharGhostHaloK: { value: new THREE.Vector4(ghostHaloC?.[0] ?? 0, ghostHaloC?.[1] ?? 0, -1, 0) },
    uCharGhostK: { value: new THREE.Vector4(ghost?.lo ?? 0.12, ghost?.slope ?? 1.35, ghost?.keepHue ?? 0, 0) },
    uCharGhostFade: { value: new THREE.Vector4(...(ghost?.fade || [0, 0, 0, 0])) },
    uCharGhostGlow: { value: new THREE.Vector4(ghost?.glow?.[0] ?? 0, ghost?.glow?.[1] ?? 0, ghost?.mistK?.[0] ?? 0, ghost?.mistK?.[1] ?? 0) },
    uCharGhostKeep: { value: new Float32Array(PAL_MAX) },  // 1 = palette slot keeps its living tones (glow eyes, lantern)
    uCharHueKeep: { value: new Float32Array(PAL_MAX) },    // (module fix, wave 5) material.hueKeep per palette slot (0 = off)
  };
  const flag = partLines ? `FLAG_CHAR + vCharPart * ${PART_STEP}` : `FLAG_CHAR + 0.0 * ${PART_STEP}`;
  const dbgOut = debug === 'far' ? 'if (charFarK > 0.5) outgoingLight = mix(outgoingLight, vec3(1.0, 0.0, 1.0), 0.6);'
    : debug === 'parts' ? 'outgoingLight = 0.15 + 0.7 * fract(vec3(0.137, 0.271, 0.419) * (vCharPart + 81.0) * vec3(1.0, 3.0, 7.0));'
    : debug === 'opts' ? `// lifted: yellow, prop (not sided): cyan, hint: green (fur) / blue (feather) / red (scale)
        if (vCharLift > 0.0) outgoingLight = mix(outgoingLight, vec3(1.0, 0.9, 0.0), 0.55);
        if (vCharProp > 0.5) outgoingLight = mix(outgoingLight, vec3(0.0, 0.9, 1.0), 0.55);
        if (vCharHint > 0.5) outgoingLight = mix(outgoingLight, vCharHint < 1.5 ? vec3(0.1, 0.9, 0.1) : vCharHint < 2.5 ? vec3(0.2, 0.3, 1.0) : vec3(1.0, 0.2, 0.1), 0.55);`
    : '';
  // shared ghost (after the character's own `tones`): level 1 ghost / 2 spent, gated by the uniform (0 = no change).
  // Bind-height bands (fractions of H): below fade.x gone, below fade.y dithered, mist mixed in below fade.z / fade.w;
  // the halo bone flat emissive gold; uCharGhostKeep slots keep their living tones; a night self-glow (keeper test).
  const ghostTones = `
      if (uCharGhost.x > 0.5) {
        bool gSp = uCharGhost.x > 1.5;
        if (vCharGHalo > 0.5) {
          // (halo boost, rig.js HALO) flat emissive in 3 tones by the face's world up (top pale gold, sides gold,
          // underside deep gold) + the stepped glow (w 0..2: whiter) + the white glint bar running round the ring (z)
          #ifndef FLAT_SHADED
            float hUp = dot(normalize(vNormal), viewMatrix[1].xyz);
          #else
            float hUp = 1.0;
          #endif
          float hW = uCharGhostHaloK.w;
          vec3 hTop = mix(uCharGhostHalo, vec3(1.0), 0.42 + 0.18 * hW);
          vec3 hE = hUp > 0.5 ? hTop : (hUp < -0.5 ? uCharGhostHalo * vec3(0.5, 0.33, 0.14) : mix(uCharGhostHalo, vec3(1.0), 0.07 * hW));
          if (uCharGhostHaloK.z > -0.5) {
            vec2 hD = vCharBind.xz - uCharGhostHaloK.xy;
            float hA = atan(hD.x, hD.y) - (uCharGhostHaloK.z + 0.5) * 0.78539816;
            if (abs(mod(hA + 3.14159265, 6.28318531) - 3.14159265) < 0.39269908) hE = hUp < -0.5 ? hTop : vec3(1.0);
          }
          totalEmissiveRadiance = hE; toonHi = vec3(0.0); toonMid = vec3(0.0); toonSh = vec3(0.0);
        } else if (uCharGhostKeep[int(vCharGSlot + 0.5)] < 0.5) {
          float gy = vCharBind.y / max(uCharGhost.z, 1e-3);
          ivec2 gPx = ivec2(gl_FragCoord.xy);
          if (gy < uCharGhostFade.x) discard;
          if (gy < uCharGhostFade.y && ((gPx.x + gPx.y) & 1) == 1) discard;
          vec3 gD = gSp ? uCharGhostRamp[2] : uCharGhostRamp[0], gL = gSp ? uCharGhostRamp[3] : uCharGhostRamp[1];
          float gM = gy < uCharGhostFade.z ? uCharGhostGlow.z : (gy < uCharGhostFade.w ? uCharGhostGlow.w : 0.0);
          vec3 gMist = gSp ? gL : uCharGhostRamp[4];
          toonHi = mix(charGhostTone(toonHi, gD, gL), gMist, gM);
          toonMid = mix(charGhostTone(toonMid, gD, gL), gMist, gM);
          toonSh = mix(charGhostTone(toonSh, gD, gL), gMist, gM);
          float gNight = 1.0 - smoothstep(0.35, 0.6, dot(uRampHi, vec3(0.299, 0.587, 0.114)));
          totalEmissiveRadiance += toonMid * (gSp ? uCharGhostGlow.y : uCharGhostGlow.x) * gNight;
        }
      }`;
  const mat = toonMaterial(engine, {
    vertexColors: true, toneAttributes: true, outline: 'char', ...rest,
    tones: `${tones}${ghostTones}`,
    uniforms: { ...look, ...uniforms },
    vertexHead: `${vertexHead}
      uniform float uCharFar[${maxBones}]; uniform float uCharMid[${maxBones}]; uniform float uCharIdBone[${maxBones}];
      varying float vCharFar; varying float vCharMid;
      uniform vec3 uCharPal[${PAL_MAX}]; uniform vec2 uCharPartK; flat varying float vCharPart;
      uniform vec4 uCharOpt[${PART_MOD / 4}]; flat varying float vCharLift; flat varying float vCharHint;
      flat varying float vCharProp; varying vec3 vCharBind;
      uniform vec4 uCharGhost; flat varying float vCharGSlot; flat varying float vCharGHalo;`,
    vertex: `${vertex}
      vCharBind = transformed;                 // bind-space position (before skinning): hint patterns ride the part
      vCharLift = 0.0; vCharHint = 0.0; vCharProp = 0.0; vCharGSlot = 0.0; vCharGHalo = 0.0;
      #ifdef USE_SKINNING
        {
          ivec4 bi = ivec4(skinIndex);
          vec4 bw = skinWeight;
          vCharFar = bw.x * uCharFar[bi.x] + bw.y * uCharFar[bi.y] + bw.z * uCharFar[bi.z] + bw.w * uCharFar[bi.w];
          vCharMid = bw.x * uCharMid[bi.x] + bw.y * uCharMid[bi.y] + bw.z * uCharMid[bi.z] + bw.w * uCharMid[bi.w];
          // part id: dominant bone (rigid parts: their only bone) and palette slot of the vertex colour
          float pb = float(bi.x), pw = bw.x;
          if (bw.y > pw) { pb = float(bi.y); pw = bw.y; }
          if (bw.z > pw) { pb = float(bi.z); pw = bw.z; }
          if (bw.w > pw) { pb = float(bi.w); }
          vCharGHalo = abs(pb - uCharGhost.y) < 0.5 ? 1.0 : 0.0;   // shared ghost: the halo bone's ring
          pb = uCharIdBone[int(pb + 0.5)];     // material.merge (identity by default)
          float ps = 0.0;
          #ifdef USE_COLOR
            float pd = 1e9;
            for (int j = 0; j < ${PAL_MAX}; j++) {
              if (float(j) >= uCharPartK.y) break;
              vec3 dc = abs(color.rgb - uCharPal[j]);
              float dj = dc.r + dc.g + dc.b;
              if (dj < pd) { pd = dj; ps = float(j); }
            }
          #endif
          vCharGSlot = ps;
          vCharPart = mod(pb * uCharPartK.x + ps, ${PART_MOD}.0);
          // per-part options (look.js §Part options): lift % + 128·prop + 256·hint
          int pi = int(vCharPart + 0.5);
          float po = uCharOpt[pi / 4][pi - (pi / 4) * 4];
          vCharLift = mod(po, 128.0) * 0.01;
          vCharProp = mod(floor(po / 128.0), 2.0);
          vCharHint = mod(floor(po / 256.0), 4.0);
          vCharFar *= 1.0 - vCharProp;
          vCharPart = vCharPart < ${PART_MOD / 2}.0 ? vCharPart - ${PART_MOD / 2}.0 : vCharPart - ${PART_MOD / 2 - 1}.0;
          // (module fix, wave 4) inner-line TONE parts (opt bit 1024) write their id in the outer band ±79..±156
          // (FLAG_CHAR ± 0.076; outline.js isChar ± 0.08): outline.js colours their lines from the darker adjacent tone
          if (po >= 1024.0) vCharPart += sign(vCharPart) * ${PART_MOD / 2}.0;
        }
      #else
        vCharFar = 0.0; vCharMid = 0.0; vCharPart = 0.0;
      #endif`,
    fragmentHead: `${fragmentHead}
      uniform vec3 uCharCenter, uCharFwd, uCharAnchor; uniform vec4 uCharShape, uCharHull; uniform vec3 uCharSelf;
      uniform float uCharHintK; uniform vec3 uCharSnap;
      uniform float uCharTime;   // (module fix, look row) the Character's clock (frozen with the stage's t=): use it, not uTime, for glow/flicker
      uniform float uCharWhiteKeep, uCharWhiteKeepLift; uniform vec2 uCharCreamKeep;
      uniform vec4 uCharGhost, uCharGhostK, uCharGhostFade, uCharGhostGlow, uCharGhostHaloK; uniform vec3 uCharGhostRamp[5], uCharGhostHalo;
      uniform float uCharGhostKeep[${PAL_MAX}]; uniform float uCharHueKeep[${PAL_MAX}];
      flat varying float vCharGSlot; flat varying float vCharGHalo;
      // shared ghost tone: perceptual lightness (sqrt of linear luma) onto the pale ramp d → l, so value order and slot
      // separation survive (crow/polly recipe); keepHue keeps that share of the living hue at the ghost value (mole)
      vec3 charGhostTone(vec3 c, vec3 d, vec3 l) {
        float lc = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 g = mix(d, l, clamp((sqrt(max(lc, 0.0)) - uCharGhostK.x) * uCharGhostK.y, 0.0, 1.0));
        float lg = dot(g, vec3(0.2126, 0.7152, 0.0722));
        return mix(g, c * (lg / max(lc, 1e-4)), uCharGhostK.z);
      }
      varying float vCharFar; varying float vCharMid; flat varying float vCharPart;
      flat varying float vCharLift; flat varying float vCharHint; flat varying float vCharProp; varying vec3 vCharBind;
      // extra shadow-map bias (depth units): distance along the sun ray from this pixel to where the ray leaves the
      // character's hull (cylinder), or a fixed distance; 0 = off (look.js header, self-shadow exemption)
      float charSelfBias() {
        if (uCharSelf.z <= 0.0) return 0.0;
        if (uCharHull.w <= 0.0) return uCharSelf.y * uCharSelf.z;
        vec3 L = normalize(uSunDir);
        vec2 d = vToonWorld.xz - uCharHull.xz, l = L.xz;
        float a = dot(l, l), b = dot(d, l), c = dot(d, d) - uCharHull.w * uCharHull.w;
        float sOut = 1e3;                                         // exit through the side (far root)
        if (a > 1e-6) { float disc = b * b - a * c; sOut = disc > 0.0 ? max((-b + sqrt(disc)) / a, 0.0) : 0.0; }
        if (L.y > 1e-3) sOut = min(sOut, max((uCharSelf.x - vToonWorld.y) / L.y, 0.0));   // exit through the top
        return min(sOut, 4.0) * uCharSelf.z;
      }
      float charFar() {
        if (uCharShape.x < 0.5) return 0.0;
        if (vCharFar > 0.5) return 1.0;
        if (vCharMid > 0.5 && dot(vToonWorld - uCharCenter, uCharFwd) > uCharShape.z) return 1.0;
        return 0.0;
      }
      float charHash3(vec3 c) { return hash12(c.xy + c.z * vec2(57.0, 113.0) + 4096.0); }
      // material hints (fur / feather / scale): a per-CELL offset of L in bind space (cells 1.5-3 texels at vh 10),
      // so the band terminator becomes a staircase of tufts / scallop rows / scale rows instead of a straight cut.
      // Lit side only (the far side and cast shadows stay one flat shadow tone).
      float charHintL(float L) {
        vec3 p = vCharBind;
        if (vCharHint < 1.5) {                       // fur: columns (7 x 12 cm) of random height → a comb of tufts
          vec2 c = floor(p.xz / 0.07);               //   along the terminator, no texture away from it
          float r = p.y / 0.12 + charHash3(vec3(c, 7.0));
          return L + uCharHintK * 0.13 * (charHash3(vec3(c, floor(r))) * 2.0 - 1.0);
        }
        float h = vCharHint < 2.5 ? 0.08 : 0.055;    // feather rows 8 cm / scale rows 5.5 cm, staggered half a cell
        float a = vCharHint < 2.5 ? 0.12 : 0.08;
        float r = p.y / h, row = floor(r);
        float w = h * 1.6, sh = 0.5 * mod(row, 2.0);
        vec2 c = floor(vec2(p.x / w + sh, p.z / w + sh));
        // each row lighter at its top edge, darker at its lower edge (the row below tucks under it): scallop steps
        return L + uCharHintK * a * ((fract(r) - 0.5) * 2.0 + 0.6 * (charHash3(vec3(c, row)) - 0.5));
      }`,
    lightMod: `float charFarK = charFar();
        if (vCharHint > 0.5 && toonL > 0.0) toonL = max(charHintL(toonL), 0.0);
        // lift: the part's lit faces never drop below L = lift from N.L alone (cast shadows still apply)
        float charLifted = 0.0;
        if (vCharLift > 0.0 && toonUpY > ${liftDown.toFixed(3)}) { float charLv = vCharLift * toonShadow * toonCloud; if (charLv > toonL) charLifted = 1.0; toonL = max(toonL, charLv); }
        toonL = mix(toonL, min(toonL, uCharShape.y), charFarK);`,
    cloudExpr: cloud === 'pixel' ? '' : cloud === 'off' ? '1.0' : 'cloudAtten(uCharAnchor)',
    shadowBias: 'charSelfBias()',
    outlineFlag: flag,
    // (module fix, look row: golden near-white) material.whiteKeep k (0..1, default 0 = unchanged): a near-white HI tone
    // (linear luma > 0.75, chroma < 0.18) keeps its white under the warm golden key (warmth = rampHi r-b): the lit colour is pulled
    // toward its own luma by k * warmth. Characters only; world materials are untouched.
    outgoing: `if (uCharWhiteKeep > 0.0) {
        float wkL = dot(toonHi, vec3(0.299, 0.587, 0.114));
        float wkC = max(max(toonHi.r, toonHi.g), toonHi.b) - min(min(toonHi.r, toonHi.g), toonHi.b);
        float wkW = clamp((uRampHi.r - uRampHi.b - 0.1) * 2.0, 0.0, 1.0);
        if (wkL > 0.75 && wkC < 0.18) outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.299, 0.587, 0.114))), uCharWhiteKeep * wkW * toonW.z);   // lit (hi) band only: shadows keep their colour
      }
      // (module fix, wave 3: requin) material.whiteKeepLift k: the same keep on pixels a slot/signature LIFT raised into the
      // mid band (a lifted white belly stayed peach: whiteKeep alone acts on the hi band only). Default 0 = unchanged.
      if (uCharWhiteKeepLift > 0.0 && charLifted > 0.5) {
        float wlL = dot(toonHi, vec3(0.299, 0.587, 0.114));
        float wlC = max(max(toonHi.r, toonHi.g), toonHi.b) - min(min(toonHi.r, toonHi.g), toonHi.b);
        float wlW = clamp((uRampHi.r - uRampHi.b - 0.1) * 2.0, 0.0, 1.0);
        if (wlL > 0.7 && wlC < 0.25) outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.299, 0.587, 0.114))), uCharWhiteKeepLift * wlW * (toonW.y + toonW.z));
      }
      // (module fix, wave 4: maxflow, theo-rem) material.creamKeep k | [k, lift] (default 0 = unchanged): a CREAM albedo
      // (authored mid: linear luma > 0.45, warm r >= b, saturation < 0.45, fading out by 0.6; whiteKeep's chroma gate
      // rejects cream) keeps its authored hue under the warm golden grade in EVERY band (sun hi/mid and the shade
      // copy): the lit colour is re-hued to the authored band tone at the same luma (k · warmth), and with lift > 0
      // never darker than lift × that tone's luma (the mauve-grey golden chest #957C7E). Ghost levels are skipped.
      if (uCharCreamKeep.x > 0.0 && uCharGhost.x < 0.5) {
        vec3 ckLw = vec3(0.299, 0.587, 0.114);
        float ckMx = max(max(toonMid0.r, toonMid0.g), toonMid0.b), ckMn = min(min(toonMid0.r, toonMid0.g), toonMid0.b);
        float ckS = (ckMx - ckMn) / max(ckMx, 1e-4);
        float ckG = step(0.45, dot(toonMid0, ckLw)) * step(toonMid0.b, toonMid0.r) * (1.0 - smoothstep(0.45, 0.6, ckS));
        float ckW = clamp((uRampHi.r - uRampHi.b - 0.1) * 2.0, 0.0, 1.0);
        if (ckG * ckW > 0.0) {
          vec3 ckT = toonW.z * toonHi + toonW.y * toonMid + toonW.x * toonSh;   // authored band tone (this pixel's bands)
          float ckL = dot(outgoingLight, ckLw), ckTL = max(dot(ckT, ckLw), 1e-4);
          float ckTarget = max(ckL, uCharCreamKeep.y * ckTL);
          outgoingLight = mix(outgoingLight, ckT * (ckTarget / ckTL), clamp(uCharCreamKeep.x, 0.0, 1.0) * ckG * ckW);
        }
      }
      // (module fix, wave 5: npc-sweeper, npc-porter) material.hueKeep k | { <slot>: k } (default 0 = unchanged): a MID-value
      // neutral (grey hair #66667C → tan, burlap #A19276 → orange at golden; whiteKeep / creamKeep gate on luma > 0.75 /
      // > 0.45 + warm, so neither applies) keeps the hue/chroma of its authored band tone at the graded luma, any luma,
      // every band (sun and shade copy), scaled by the warm grade (rampHi r-b: golden only; noon / night = 0). Ghosts skip.
      if (uCharGhost.x < 0.5) {
        float hkK = uCharHueKeep[int(vCharGSlot + 0.5)];
        float hkW = clamp((uRampHi.r - uRampHi.b - 0.1) * 2.0, 0.0, 1.0);
        if (hkK > 0.0 && hkW > 0.0) {
          vec3 hkLw = vec3(0.299, 0.587, 0.114);
          vec3 hkT = toonW.z * toonHi + toonW.y * toonMid + toonW.x * toonSh;
          float hkL = dot(outgoingLight, hkLw), hkTL = max(dot(hkT, hkLw), 1e-4);
          outgoingLight = mix(outgoingLight, hkT * (hkL / hkTL), clamp(hkK, 0.0, 1.0) * hkW);
        }
      }
      ${dbgOut}`,
  });
  mat.defines.LOOK_MAX_BONES = maxBones;
  // shadow snapping: the shadow-map lookup of character pixels is shifted by uCharSnap (< 1 shadow texel), so the
  // figure's sampling phase on the shadow grid is the same wherever the root stands (look.js header)
  const toonCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    toonCompile(shader, renderer);
    const fs = shader.fragmentShader;
    if (!fs.includes('float charFarK = charFar();') || !fs.includes('charSelfBias()') || !fs.includes('vCharPart *')) {
      console.error('look.js: toon hooks missing (lightMod / shadowBias / outlineFlag) — character look disabled');
    }
    if (shadowSnap) {
      const SV = 'vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;';
      const chunk = THREE.ShaderChunk.shadowmap_vertex;
      if (chunk.includes(SV) && shader.vertexShader.includes('#include <shadowmap_vertex>')) {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uCharSnap;')
          .replace('#include <shadowmap_vertex>', chunk.replace(SV, 'vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * (shadowWorldPosition + vec4(uCharSnap, 0.0));'));
      } else console.log('look.js: shadow coord anchor not found — shadowSnap off');
    }
  };
  const self = selfShadow === -1 ? 'hull' : selfShadow;
  const o = { farHalf, farLight, sideEps, dead, sunTieBreak, midline, sides, cloud, selfShadow: self, hullMargin, partLines,
    sigLift, faceLift, props, propReach, slots, hints, shadowSnap, innerLine };
  mat.userData.look = { uniforms: look, opts: o };
  // per render: hull + shadow depth scale (self-shadow exemption), part ids on the geometry (first render), snap
  mat.onBeforeRender = (renderer, scene, camera, geometry, object) => {
    const pt = partTable(geometry);
    if (pt) {
      look.uCharPartK.value.set(pt.m, pt.pal.length);
      pt.pal.forEach((c, i) => look.uCharPal.value[i].set(c[0], c[1], c[2]));
    }
    // far flags / part options also without updateLook (static rig runtime, a mesh the Character never posed):
    // robust to a replaced mesh.onBeforeRender. updateLook installs the full rig (spec) when it runs.
    if (object?.isSkinnedMesh && object.skeleton) {
      const st = object.userData.lookState ??= { sides: null, engine, rig: { mesh: object, root: object.parent ?? object } };
      applyFlags(st.engine, st.rig);
    }
    const sc = engine.sun?.shadow?.camera;
    const S = look.uCharSelf.value, H = look.uCharHull.value;
    S.set(0, 0, 0); H.w = 0; look.uCharSnap.value.set(0, 0, 0);
    if (!sc || !object) return;
    object.updateWorldMatrix(true, false);
    _hp.setFromMatrixPosition(object.matrixWorld);
    if (shadowSnap) snapShift(engine.sun, _hp, look.uCharSnap.value);
    if (!self) return;
    S.z = 1 / Math.max(sc.far - sc.near, 1e-3);
    if (self !== 'hull') { S.y = Number(self) || 0; if (!(S.y > 0)) S.z = 0; return; }
    const hb = hullOf(geometry, hullMargin);
    if (!hb) { S.z = 0; return; }
    const k = _hs.setFromMatrixScale(object.matrixWorld).x;
    H.set(_hp.x, _hp.y, _hp.z, hb.r * k);
    S.x = _hp.y + hb.top * k;
  };
  // Program sharing (lead, rig CONTRACT-REQUEST): toonMaterial keys every instance uniquely (`toon-<n>`), so each
  // character compiled its own program (+1 per character). The generated GLSL depends only on these options (all
  // per-character values are uniforms, bound per material by three), so identical character materials share one
  // program. three still calls onBeforeCompile per material, so each keeps its own uniform objects.
  const progKey = `char:${keyOf({ rest, tones, vertexHead, vertex, fragmentHead, u: Object.keys(uniforms).sort(), maxBones, cloud, debug, partLines, liftDown, shadowSnap })}`;
  mat.customProgramCacheKey = () => progKey;
  return mat;
}

// Shadow snapping. The sun's shadow camera has its own texel grid (world-fixed while the shadow camera stands still).
// A root that glides by whole SCREEN texels lands at a different sub-texel phase of that grid on every step, so any
// shadow edge on the figure (its own residual self-shadow, a pillar's edge) re-rasterises: 4-8 speck px per frame.
// snapShift returns the world offset d (in the shadow camera's x/y plane, |d| < 1 shadow texel) that moves the root
// onto the nearest shadow-texel corner; the material looks up every pixel at (world + d), i.e. the whole figure
// samples the shadow map at one fixed phase → identical shadow pattern wherever it stands. World shadows on the
// figure move by < 1 shadow texel (≈ 1 cm at the default shadow extent): invisible.
// The CASTER must move with the lookup (else the receiver samples a different spot of its own shadow): the
// character's shadow-pass depth material gets the same shift (mesh.customDepthMaterial, onBeforeShadow), so caster
// and receiver together sit exactly as if the root stood on the snapped point.
function snapDepth(engine, mesh, mat) {
  const U = mat.userData.look.uniforms;
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dm.onBeforeCompile = (sh) => {
    sh.uniforms.uCharSnap = U.uCharSnap;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCharSnap;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        mvPosition.xyz += (viewMatrix * vec4(uCharSnap, 0.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  dm.customProgramCacheKey = () => 'char-depth-snap';
  mesh.customDepthMaterial = dm;
  mesh.userData.lookDepth = dm;
  const prev = mesh.onBeforeShadow;
  mesh.onBeforeShadow = function (...a) {
    this.updateWorldMatrix(true, false);
    snapShift(engine.sun, _hp2.setFromMatrixPosition(this.matrixWorld), U.uCharSnap.value);
    return prev.apply(this, a);
  };
}
const _hp2 = new THREE.Vector3();

const _sx = new THREE.Vector3(), _sy = new THREE.Vector3(), _so = new THREE.Vector3();
function snapShift(sun, p, out) {
  const sh = sun?.shadow, cam = sh?.camera;
  if (!cam || !sh.mapSize) return out.set(0, 0, 0);
  cam.updateMatrixWorld();
  const tx = (cam.right - cam.left) / sh.mapSize.x, ty = (cam.top - cam.bottom) / sh.mapSize.y;
  if (!(tx > 0 && ty > 0)) return out.set(0, 0, 0);
  _sx.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
  _sy.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
  _so.subVectors(p, _so.setFromMatrixPosition(cam.matrixWorld));
  const u = _so.dot(_sx) / tx, v = _so.dot(_sy) / ty;
  const du = (Math.round(u) - u) * tx, dv = (Math.round(v) - v) * ty;
  return out.copy(_sx).multiplyScalar(du).addScaledVector(_sy, dv);
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _left = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _sun = new THREE.Vector3();

const SIDE_L = /(?<=[a-z0-9])L\d*$|(^|[^a-z])(l|left)$|Left\d*$/, SIDE_R = /(?<=[a-z0-9])R\d*$|(^|[^a-z])(r|right)$|Right\d*$/;
const nameSide = (n) => (SIDE_L.test(n) ? 1 : SIDE_R.test(n) ? -1 : null);

/**
 * Rest-pose side of every skeleton bone: +1 = character's left (+X), -1 = right, 0 = midline.
 * The NAME decides (CHARACTERS.md §1: `…L`/`…R` + optional digits is sided, else midline): `sides` override →
 * own name → nearest sided ancestor (a prop bone under handR is R) → midline. Bind position only decides with
 * `sides: 'auto'` per bone. (Was position-first: the wanderer's scarf chain rooted at x = 0.05 m became a LEFT
 * limb and flipped orange ↔ wine with every turn, critic-wanderer 2026-10-15.)
 */
function boneSides(mesh, o) {
  const sk = mesh.skeleton;
  const bones = sk.bones;
  const byName = new Map(bones.map((b, i) => [b.name, i]));
  return bones.map((b, i) => {
    const forced = o.sides?.[b.name];
    if (forced === 'auto') {
      // bind matrix of the bone in mesh space = inverse(boneInverse); its x is the lateral rest offset
      const x = _v.setFromMatrixPosition(_m.copy(sk.boneInverses[i]).invert()).x;
      return x > o.sideEps ? 1 : x < -o.sideEps ? -1 : 0;
    }
    if (forced) return forced === 'L' ? 1 : forced === 'R' ? -1 : 0;
    for (let p = b; p?.isBone && byName.has(p.name); p = p.parent) {
      const f = o.sides?.[p.name];
      if (p !== b && f && f !== 'auto') return f === 'L' ? 1 : f === 'R' ? -1 : 0;
      const s = nameSide(p.name);
      if (s !== null) return s;
    }
    return 0;
  });
}

function materialsOf(mesh) {
  const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return ms.filter((m) => m?.userData?.look);
}

/** Which side is far for this mesh right now: +1 left, -1 right, 0 none. Exported for tests/tools. */
export function farSide(engine, rig, o = {}) {
  const mesh = rig.mesh ?? rig;
  const root = rig.root ?? mesh;
  const dead = o.dead ?? 0.3;
  root.updateWorldMatrix(true, false);
  _left.setFromMatrixColumn(root.matrixWorld, 0).setY(0);
  if (_left.lengthSq() < 1e-8) return 0;
  _left.normalize();
  const cf = engine.camera.forward;
  _fwd.set(cf.x, 0, cf.z).normalize();
  const s = _left.dot(_fwd);
  if (s > dead) return 1;
  if (s < -dead) return -1;
  if (o.sunTieBreak === false) return 0;
  const sd = engine.uniforms.uSunDir?.value;
  if (!sd) return 0;
  _sun.set(sd.x, 0, sd.z);
  if (_sun.lengthSq() < 1e-6) return 0;
  const k = _left.dot(_sun.normalize());            // > 0: the left side faces the sun
  return k > 0.25 ? -1 : k < -0.25 ? 1 : 0;
}

/**
 * Per displayed pose (Character calls it after applyPose) — or any time: writes the far flags of rig.mesh's
 * look materials. rig = { root, mesh } (rig.buildCharacter result, or the spike). Installs an onBeforeRender
 * hook on first use so camera turns / root moves between poses are picked up before every render.
 */
export function updateLook(engine, rig) {
  const mesh = rig?.mesh;
  if (!mesh?.isSkinnedMesh || !mesh.skeleton) return;
  const mats = materialsOf(mesh);
  if (!mats.length) return;
  const state = mesh.userData.lookState ??= { sides: null, engine, rig };
  if (state.rig !== rig && rig.spec && state.rig?.spec !== rig.spec) { state.rig = rig; state.partOpt = null; }
  if (!mesh.userData.lookHooked) {
    mesh.userData.lookHooked = true;
    const prev = mesh.onBeforeRender;
    mesh.onBeforeRender = function (...a) { applyFlags(state.engine, state.rig); return prev.apply(this, a); };
  }
  applyFlags(engine, rig);
}

function applyFlags(engine, rig) {
  const mesh = rig.mesh;
  const mats = materialsOf(mesh);
  if (!mats.length) return;
  const o = mats[0].userData.look.opts;
  const state = mesh.userData.lookState;
  state.sides ??= boneSides(mesh, o);
  if (!state.partOpt) state.partOpt = partOptions(mesh, rig, o);
  if (o.shadowSnap && !mesh.userData.lookDepth) snapDepth(state.engine ?? engine, mesh, mats[0]);
  const side = farSide(engine, rig, o);
  const bones = mesh.skeleton.bones;
  const cf = engine.camera.forward;
  for (const m of mats) {
    const U = m.userData.look.uniforms;
    if (U.uCharOpt && state.partOpt.ver !== U.uCharOpt.ver) {
      U.uCharOpt.ver = state.partOpt.ver;
      U.uCharOpt.value.forEach((v, i) => v.fromArray(state.partOpt.enc, i * 4));
    }
    const far = U.uCharFar.value, mid = U.uCharMid.value;
    const n = Math.min(bones.length, far.length);
    if (U.uCharWhiteKeep) U.uCharWhiteKeep.value = +(rig.spec?.material?.whiteKeep ?? 0);
    if (U.uCharWhiteKeepLift) U.uCharWhiteKeepLift.value = +(rig.spec?.material?.whiteKeepLift ?? 0);
    if (U.uCharGhostKeep && !U.uCharGhostKeep.done && rig.spec?.ghost?.keep?.length) {   // spec.ghost.keep: palette slot names
      U.uCharGhostKeep.done = true;
      const pt = partTable(mesh.geometry), pal = rig.spec.palette || {};
      for (const name of rig.spec.ghost.keep) {
        const t = pal[name];
        if (!t || !pt) { console.warn(`spec.ghost.keep: unknown palette slot '${name}'`); continue; }
        const c = new THREE.Color(Array.isArray(t) ? (t.length === 3 ? t[1] : t[0]) : t);
        const i = pt.pal.findIndex((q) => Math.abs(q[0] - c.r) + Math.abs(q[1] - c.g) + Math.abs(q[2] - c.b) < 1e-3);
        if (i >= 0) U.uCharGhostKeep.value[i] = 1;
      }
    }
    // (module fix, wave 5) material.hueKeep: k (every slot) | { <palette slot>: k } → per palette index (mid tone match)
    if (U.uCharHueKeep && !U.uCharHueKeep.done && rig.spec?.material?.hueKeep) {
      U.uCharHueKeep.done = true;
      const hk = rig.spec.material.hueKeep, pt = partTable(mesh.geometry), pal = rig.spec.palette || {};
      if (typeof hk === 'number' || typeof hk === 'string') { if (pt) U.uCharHueKeep.value.fill(+hk || 0, 0, pt.pal.length); }
      else for (const [name, k] of Object.entries(hk)) {
        const t = pal[name];
        if (!t || !pt) { console.warn(`material.hueKeep: unknown palette slot '${name}'`); continue; }
        const c = new THREE.Color(Array.isArray(t) ? (t.length === 3 ? t[1] : t[0]) : t);
        const i = pt.pal.findIndex((q) => Math.abs(q[0] - c.r) + Math.abs(q[1] - c.g) + Math.abs(q[2] - c.b) < 1e-3);
        if (i >= 0) U.uCharHueKeep.value[i] = +k || 0;
        else console.warn(`material.hueKeep: slot '${name}' not on the mesh`);
      }
    }
    if (U.uCharIdBone && !U.uCharIdBone.done) {                 // material.merge: { child bone: parent bone } (part ids)
      U.uCharIdBone.done = true;
      const merge = rig.spec?.material?.merge || {};
      const idx = new Map(bones.map((b, i) => [b.name, i]));
      for (const [a, b] of Object.entries(merge)) if (idx.has(a) && idx.has(b) && idx.get(a) < n) U.uCharIdBone.value[idx.get(a)] = idx.get(b);
    }
    for (let i = 0; i < n; i++) {
      const s = state.sides[i];
      far[i] = side !== 0 && s === side ? 1 : 0;
      mid[i] = o.midline === 'pixel' && s === 0 ? 1 : 0;
    }
    // hips (first root-most bone) for the per-pixel midline split; cloud anchor = root + 0.5 m
    const hips = rig.bones?.hips ?? bones[0];
    hips.updateWorldMatrix(true, false);
    U.uCharCenter.value.setFromMatrixPosition(hips.matrixWorld);
    U.uCharFwd.value.set(cf.x, 0, cf.z).normalize();
    (rig.root ?? mesh).getWorldPosition(U.uCharAnchor.value).y += 0.5;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Part options (round 05). Resolved once per mesh from rig.spec (palette slot names, signature, faceSlot, parts) and
// the bind geometry, written per RAW part id (dominant bone · m + palette slot, mod 156; see partTable) into the
// uCharOpt uniform as  lift% + 128·prop + 256·hint.
//   lift  — the part's faces that are not facing down (world N.y > liftDown) never fall below L = lift from N·L alone;
//           cast shadows (toonShadow) and cloud still darken it. Default: spec.signature slots/parts → sigLift (0.3 =
//           mid band) and the face slot (spec.faceSlot, else /skin|face/) on the head bone and its children → faceLift.
//           Fixes "signature light mass in its shadow tone at the pack facing" (keeper beard 76 % sh) and face_lit.
//   prop  — held props are not far-forced: a (bone, slot) pair on a bone BELOW a hand bone (lantern chain, a prop
//           bone), or on a hand bone itself reaching > propReach (0.2 m) from the hand joint (blade, staff), is lit by
//           N·L like a midline part (props: 'mid', default). The hand and forearm stay sided. props: 'sided' = old rule.
//   hint  — 'fur' | 'feather' | 'scale': material hint for animals (charHintL in the shader).
//   material.slots { <slot>: { lift, side: 'mid'|'sided', hint } } and material.hints { <slot>: 'fur' } override.
let _optVer = 0;
const HINTS = { fur: 1, feather: 2, feathers: 2, scale: 3, scales: 3 };
const HAND_RE = /hand|grip|wrist/i;
const _bp = new THREE.Vector3();

/** {enc: Float32Array(156), ver, pairs: [{bone, slot, raw, lift, prop, hint}]} for a character mesh (cached). */
export function partOptions(mesh, rig, o = {}) {
  const geo = mesh.geometry, pt = partTable(geo);
  const enc = new Float32Array(PART_MOD);
  const out = { enc, ver: ++_optVer, pairs: [] };
  if (!pt || !mesh.skeleton || !geo.attributes.skinIndex) return out;
  const spec = rig?.spec || {}, pal = spec.palette || {};
  const bones = mesh.skeleton.bones, names = bones.map((b) => b.name);
  const slotIndex = (name) => {
    const t = pal[name];
    if (!t) return -1;
    const c = new THREE.Color(Array.isArray(t) ? (t.length === 3 ? t[1] : t[0]) : t);
    return pt.pal.findIndex((q) => Math.abs(q[0] - c.r) + Math.abs(q[1] - c.g) + Math.abs(q[2] - c.b) < 1e-3);
  };
  const slotName = new Map();
  for (const n of Object.keys(pal)) { const i = slotIndex(n); if (i >= 0 && !slotName.has(i)) slotName.set(i, n); }
  // bind positions of the bones (mesh space)
  const bindPos = mesh.skeleton.boneInverses.map((bi) => new THREE.Vector3().setFromMatrixPosition(_m.copy(bi).invert()));
  const descOf = (pred) => {
    const set = new Set();
    bones.forEach((b, i) => { for (let p = b; p?.isBone; p = p.parent) { const j = bones.indexOf(p); if (j >= 0 && pred(p, j)) { set.add(i); break; } } });
    return set;
  };
  const handIdx = new Set(bones.map((b, i) => (HAND_RE.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const underHand = descOf((p, j) => handIdx.has(j));
  const headBone = rig?.bones?.head ?? bones.find((b) => /^head$/i.test(b.name));
  const headSet = headBone ? descOf((p) => p === headBone) : new Set();
  // pairs present + reach from their bone's bind position
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, col = geo.attributes.color, P = geo.attributes.position;
  const pairs = new Map();
  for (let v = 0, nv = Math.min(P.count, geo.userData?.charGhostFrom ?? Infinity); v < nv; v++) {
    let b = 0, w = -1;
    for (let k = 0; k < 4; k++) { const wk = sw.getComponent(v, k); if (wk > w) { w = wk; b = si.getComponent(v, k); } }
    let slot = 0;
    if (col) {
      const r = col.getX(v), g = col.getY(v), bl = col.getZ(v);
      let bd = 1e9;
      pt.pal.forEach((q, i) => { const d = Math.abs(q[0] - r) + Math.abs(q[1] - g) + Math.abs(q[2] - bl); if (d < bd) { bd = d; slot = i; } });
    }
    const key = b * PAL_MAX + slot;
    let e = pairs.get(key);
    if (!e) pairs.set(key, e = { bone: b, slot, reach: 0 });
    e.reach = Math.max(e.reach, _bp.fromBufferAttribute(P, v).distanceTo(bindPos[b] ?? _bp));
  }
  // signature: '<slot>' | ['<slot>'|'<part name>'] | { slot, slots, parts }
  const sig = spec.signature, sigSlots = new Set(), sigParts = new Set();
  const addSig = (x) => { if (!x) return; if (x in pal) sigSlots.add(x); else sigParts.add(x); };
  if (typeof sig === 'string') addSig(sig);
  else if (Array.isArray(sig)) sig.forEach((x) => addSig(typeof x === 'string' ? x : x?.part || x?.slot));
  else if (sig && typeof sig === 'object') { addSig(sig.slot); (sig.slots || []).forEach(addSig); (sig.parts || []).forEach(addSig); }
  const sigPairs = new Set();
  for (const p of spec.parts || []) {
    if (!p.name || !sigParts.has(p.name)) continue;
    const s = typeof p.color === 'string' ? slotIndex(p.color) : -1;
    for (const bn of p.mirror ? [p.bone, swapName(p.bone)] : [p.bone]) {
      const bi = names.indexOf(bn);
      if (bi >= 0 && s >= 0) sigPairs.add(bi * PAL_MAX + s);
    }
  }
  const faceSlot = spec.faceSlot && spec.faceSlot in pal ? spec.faceSlot : Object.keys(pal).find((n) => /skin|face/i.test(n));
  const lvl = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  for (const [key, e] of pairs) {
    const sn = slotName.get(e.slot);
    const so = (sn && o.slots?.[sn]) || {};
    let lift = 0;
    if ((sn && sigSlots.has(sn)) || sigPairs.has(key)) lift = Math.max(lift, lvl(o.sigLift ?? 0.3));
    if (sn && sn === faceSlot && headSet.has(e.bone)) lift = Math.max(lift, lvl(o.faceLift ?? 0.3));
    if (so.lift !== undefined) lift = lvl(so.lift);
    let prop = 0;
    if ((o.props ?? 'mid') === 'mid' && underHand.has(e.bone) && (!handIdx.has(e.bone) || e.reach > (o.propReach ?? 0.2))) prop = 1;
    if (so.side === 'mid') prop = 1; else if (so.side === 'sided') prop = 0;
    const hint = HINTS[so.hint ?? (sn && o.hints?.[sn])] || 0;
    const raw = (e.bone * pt.m + e.slot) % PART_MOD;
    // (module fix, wave 4) inner-line tone: material.innerLine 'tone' (all parts) or material.slots.<x>.line 'tone'|'grey'
    const line = (so.line ?? o.innerLine) === 'tone' ? 1 : 0;
    const val = Math.round(lift * 100) + 128 * prop + 256 * hint + 1024 * line;
    enc[raw] = Math.max(enc[raw], val);
    out.pairs.push({ bone: names[e.bone], slot: sn ?? e.slot, raw, reach: +e.reach.toFixed(3), lift, prop, hint, line });
  }
  return out;
}

const swapName = (n) => n.replace(/L(\d*)$/, 'R$1') === n ? n.replace(/R(\d*)$/, 'L$1') : n.replace(/L(\d*)$/, 'R$1');
