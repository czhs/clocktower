// Motion smears (owner: fx). docs/CHARACTERS.md §5, docs/CHARACTER_TECHNIQUES.md §7, research/05 §4 + §8.3.
//
//   const sm = attachSmears(engine, ch, {
//     sockets: { weapon: { length: 0.58, inner: 0.35, blade: [0,0,1], edge: [1,0,0], palette: ['#ACB8B8', '#BCC4C4'] } },
//     auto: false,          // true: every displayed pose change is checked (t3ssel8r's "measure every frame");
//                           // false (default): only keys that carry `smear: '<socket>'` (or ['a','b'] / {socket,...overrides})
//   });
//   -> { group, smears, trigger(name, prevXf, curXf, t), reset(), dispose(), setEnabled(bool) }
//
// What it does (his algorithm): on every 'pose' event the socket's world transform is recorded. When a key asks
// for a smear (or `auto`), the ribbon between the PREVIOUS and the CURRENT transform is generated — "a glorified
// trail renderer: the smear never needs to be drawn until the final frame is already displaying". Position and
// orientation are interpolated with his 3-lerp / 3-slerp "Bézier"
//     P(t) = lerp(lerp(p0, p1, t), lerp(p2, p3, t), smoothstep(t))     (same with slerp for the rotation)
// with the position handles along the cutting-edge axes and the rotation handles about the swing (green) axes,
// both sized to fit a circular arc: handle = 2·tan(θ/4) (× hilt radius for positions), which puts the curve's
// midpoint exactly on the arc (θ = swing angle, hilt radius from the chord: r = c / (2 sin(θ/2))).
// Trigger: swing angle ≥ minAngle (40°) AND the cutting edge leads (tip motion · edge axis > 0; `doubleEdged`
// accepts either side). A single key can only describe ≤ 180° (quaternion difference): split bigger swings and
// spins into several smear keys of ≤ 170° each.
//
// Socket frame convention (his Unity sword): +Z = blade (hilt → tip), +X = cutting edge, +Y = swing axis.
// Override per socket with `blade` / `edge` (socket-local unit vectors) if your socket is oriented differently.
//
// Look: fan ribbon (16-24 segments) from inner·length to length along the blade, kept in WORLD space (not
// parented; each smear mesh is texel-snapped like the character root), flat unlit two tones (body + a lighter
// band toward the outer edge), opaque, depth tested + depth writing, alpha 1, no outline. Lifetime = stepped
// stages on the 30 Hz grid starting at the swing key: 'full' crescent → 'eroded' (inner edge eaten, trailing end
// split into bristles, scribbles at the leading end) → 'streaks' (1-texel dry-brush lines along the arc) →
// 'remnant' (a few dashes near the blade) → gone (refs/chars/03b: 2+2+2+2 frames at 60 fps).
// The streak/dash noise is quantized to rows and cells sized in SCREEN TEXELS (measured from the projected
// ribbon at birth), so streaks are exactly 1 texel thick at every zoom and yaw.
//
// Normal pass (uPassMode == 1): writes FLAG_NONE by default ('none'): the smear writes depth, so a plain discard
// would leave smear depth under the flag/normal of the surface behind it and the outline pass would draw a dark
// ring around the smear. FLAG_NONE pixels are never painted and are depth-only neighbours. `normalPass:
// 'discard'` restores the literal contract behaviour (A/B only).
//
// Limb variant: socket option `kind: 'limb'` → a ribbon over the outer 60 % of the limb in the limb's own tones
// (`palette: [body, light]`), a softer taper and 'full' + 'streaks' + 'remnant' stages. Use it for kicks / fast
// punches / tail whips: put a socket at the joint with +Z pointing along the limb to its end.
//
// Round-5 upgrades (fx owner, for the 32-member cast; docs/CHARACTER_LEARNINGS.md §Smears and FX):
//   * Every facing: `tilt` (default 35°): if the swing plane is closer than `tilt` to edge-on for the camera at
//     birth, the ribbon is rotated about its own on-screen line (through the hilt midpoint) until it is `tilt` off
//     edge-on, so a sagittal chop seen from the front/back or a claw swipe seen end-on still draws a crescent
//     instead of a 1-2 px stick. The side that brings the leading tip toward the camera wins. `tilt: 0` = off.
//   * `front` (m, default 0.12): the ribbon is pushed toward the camera along the view axis (ortho → no screen
//     shift), so a crescent that passes through the chest/back plane is not swallowed by the body at N.
//   * Inner radius: default `inner` is 'auto' = 0.1 for blades < 0.8 m, else 0.35, and never thinner than a
//     0.10 m ribbon (`minRibbon`). An explicit `inner` is used as given.
//   * kind 'claw': blade defaults + `stripes` (3) parallel rakes with 1-texel gaps, staggered ends (paws/talons).
//   * kind 'limb': now a ribbon (inner 0.4 of the limb, ≥ 0.10 m), not a wedge on the body; give the limb tones.
//   * kind 'thrust': a straight tapered streak from the previous to the current TIP (+ two 1-texel speed lines),
//     always face-on to the camera; stab toward/away from the camera → a short horizontal glint at the tip. Stages
//     full → thinned → line → dashes on the 30 Hz grid. `{ kind: 'thrust', length, blade, width 0.09, back 0.15 }`.
//   * Hold-safe: a smear is built only when the displayed key CHANGES (a dynamics redraw of the same clip key never
//     builds a second smear, even with minAngle 0), and the tip must travel ≥ `minTravel` texels (2).
//   * Default palette ['#DEE4E6', '#F7F9F6']: both ≥ 25 % lighter than lit meadow #BBD985 (relative luminance), the
//     inner band ≥ 12 % darker than the outer (refs/chars/03b two-tone).
//
// Determinism: smears are born at the event's t (a grid time) and their stage is a pure function of
// (engine time − birth). On ch.on('reset') (the Character re-simulates from 0) or a pose stream that goes back in
// time, every smear and recorded transform is dropped and rebuilt from the re-emitted events. No Math.random.
// Each displayed pose is compared with the previous DISPLAYED pose, so a held key re-shown on later grid frames
// (θ = 0) never builds a second smear.
import * as THREE from 'three';
import { FLAGS_GLSL } from '../core/glsl.js';

const DEG = Math.PI / 180;
const STAGE_ID = { full: 0, eroded: 1, streaks: 2, remnant: 3 };
const MAX_SEGS = 32;

export const SMEAR_DEFAULTS = {
  length: 0.6,              // blade length (hilt → tip), metres
  inner: 'auto',            // inner radius as a fraction of the blade length ('auto': 0.1 if length < 0.8 else 0.35)
  blade: [0, 0, 1],         // socket-local blade axis (hilt → tip)
  edge: [1, 0, 0],          // socket-local cutting-edge axis
  doubleEdged: false,
  minAngle: 40,             // degrees
  segs: 20,                 // 16-24
  palette: ['#DEE4E6', '#F7F9F6'],   // [body, light band] sRGB (round 5: was #ACB8B8/#BCC4C4, < 5 % off lit grass)
  band: 0.62,               // light band: v (0 inner → 1 outer) above this
  tail: 0.7,                // trailing-end taper: inner boundary at the very end (0 = no taper, 1 = point)
  tailLen: 0.3,             // fraction of the arc the taper spans
  stages: ['full', 'eroded', 'streaks', 'remnant'],
  fps: 30,                  // stage rate (t3ssel8r: stepped in pairs at 60 fps)
  rowTexels: 1,             // streak thickness in screen texels
  dashTexels: 3,            // dash cell length along the arc in screen texels
  kind: 'blade',
  tilt: 35,                 // degrees: minimum angle between the swing plane and the view axis (0 = off)
  front: 0.12,              // metres toward the camera (depth only; ortho → no screen shift)
  minRibbon: 0.10,          // metres: 'auto' inner never leaves a thinner ribbon
  minTravel: 2,             // texels: the tip must move at least this far on screen
  stripes: 0,               // claw rakes (kind 'claw' → 3)
};
const KIND_DEFAULTS = {
  blade: {},
  limb: { inner: 0.4, tail: 0.45, tailLen: 0.5, band: 0.7, stages: ['full', 'streaks', 'remnant'], minAngle: 45 },
  claw: { inner: 0.3, tail: 0.5, tailLen: 0.4, band: 0.55, stages: ['full', 'streaks', 'remnant'], minAngle: 35, stripes: 3, doubleEdged: true },
  thrust: { minAngle: 0, width: 0.09, back: 0.15, front: 0.45, stages: ['full', 'eroded', 'streaks', 'remnant'], band: 0.5 },
};
export function smearConfig(cfg = {}) {
  const c = { ...SMEAR_DEFAULTS, ...(KIND_DEFAULTS[cfg.kind] ?? {}), ...cfg };
  if (c.inner === 'auto' || c.inner == null) {
    const base = c.length < 0.8 ? 0.1 : 0.35;
    c.inner = Math.max(0, Math.min(base, 1 - c.minRibbon / Math.max(c.length, 1e-3)));
  }
  return c;
}

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
${FLAGS_GLSL}
uniform int uPassMode;
uniform float uMode, uRows, uCells, uSeed, uBand, uTail, uTailLen, uStripes, uThrust;
uniform vec3 uBody, uLight;
varying vec2 vUv;
float h1(float x) { return fract(sin(x * 12.9898 + uSeed * 78.233) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed * 37.719) * 43758.5453); }
void main() {
  if (uPassMode == 1) {
#ifdef SMEAR_NORMAL_NONE
    gl_FragColor = vec4(0.5, 0.5, 1.0, FLAG_NONE); return;
#else
    discard;
#endif
  }
  float u = vUv.x;                                   // 0 trailing (old pose) -> 1 leading (blade now)
  float row = floor(clamp(vUv.y, 0.0, 0.9999) * uRows);
  float rv = (row + 0.5) / uRows;                    // v quantized to 1-texel rows (0 inner -> 1 outer)
  float cell = floor(u * uCells);                    // dash cells along the arc
  float hr = h1(row), hr2 = h1(row + 57.0), hd = h2(vec2(row, cell));
  bool odd = mod(row, 2.0) > 0.5;                    // streak rows alternate with 1-texel gaps
  float tail = uTail * (1.0 - smoothstep(0.0, uTailLen, u));   // trailing taper toward the outer edge
  int m = int(uMode + 0.5);
  bool keep;
  if (uThrust > 0.5) {                               // straight thrust streak: v 0..1 across, core in the middle
    float d = abs(rv - 0.5) * 2.0;                   // 0 centre row -> 1 outer rows
    float core = mix(0.12, 0.42, smoothstep(0.0, 0.8, u));       // core half-width (fraction), widest at the tip
    bool speed = d > 0.7 && !odd && u > 0.25 + 0.25 * hr2 && u < 0.92 && hd > 0.2;   // 1-texel speed lines
    if (m == 0) keep = (d <= core && u < 0.995) || speed;
    else if (m == 1) keep = (d <= core * 0.6 && u > 0.3) || (speed && u > 0.5);
    else if (m == 2) keep = d <= 0.18 && u > 0.5 + 0.25 * hr2 && hd > 0.25;
    else keep = d <= 0.18 && u > 0.8 && hd > 0.5;
    if (!keep) discard;
    gl_FragColor = vec4(d < 0.2 ? uLight : uBody, 1.0);
    return;
  }
  if (uStripes > 0.5) {                              // claw rakes: the last row of each group is a gap
    float per = uRows / uStripes;
    float gi = floor(row / per);
    if (row - gi * per > per - 1.0) discard;
    if (u < 0.08 + 0.12 * mod(gi * 2.0 + 1.0, 3.0) / 2.0) discard;    // staggered trailing ends per rake
  }
  if (m == 0) {                                      // full crescent
    keep = rv >= tail;
  } else if (m == 1) {                               // eroded: inner edge + trailing end eaten
    float inner = max(tail + 0.1, 0.3);                          // ~30 % of the width eaten (03b frames 5-6)
    keep = rv >= inner && u > 0.06;
    if (keep && u < 0.35) keep = (hr > 0.35 || rv > 0.9) && u > 0.06 + 0.3 * hr2 * (1.0 - rv * 0.5);  // bristles
    if (!keep && u > 0.7 && rv > 0.12 && rv < inner && !odd) keep = hd > 0.55;                       // scribbles
  } else if (m == 2) {                               // dry-brush: thin outer band splitting into bristles + scribbles
    float hl = h2(vec2(row, floor(cell * 0.5)) + 31.0);          // long cells (2x dash) for rare breaks
    if (rv > 0.6) {
      float start = 0.22 + 0.33 * hr2;                           // bristle ends at different lengths per row
      keep = u > start && (u > 0.55 || !odd || rv > 0.88) && hl > 0.12;
    } else {
      keep = !odd && rv > 0.25 && hr > 0.55 && u > 0.55 + 0.3 * hr2 && hd > 0.35;
    }
  } else {                                           // remnant dashes near the blade
    keep = !odd && rv > 0.15 && hr > 0.6 && u > 0.72 + 0.18 * hr2 && hd > 0.5;
  }
  if (!keep) discard;
  gl_FragColor = vec4(rv > uBand ? uLight : uBody, 1.0);
}`;

const lin = (c) => (c?.isColor ? c.clone() : new THREE.Color(c));   // sRGB hex -> linear working space
const v3 = (a) => (a?.isVector3 ? a.clone() : new THREE.Vector3(...a)).normalize();

function smearMaterial(engine, normalPass) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPassMode: engine.uniforms.uPassMode,
      uMode: { value: 0 }, uRows: { value: 8 }, uCells: { value: 12 }, uSeed: { value: 0 },
      uBand: { value: 0.62 }, uTail: { value: 0.7 }, uTailLen: { value: 0.3 }, uStripes: { value: 0 }, uThrust: { value: 0 },
      uBody: { value: new THREE.Color() }, uLight: { value: new THREE.Color() },
    },
    defines: normalPass === 'discard' ? {} : { SMEAR_NORMAL_NONE: 1 },
    vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.DoubleSide, depthTest: true, depthWrite: true, transparent: false,
  });
}

function ribbonGeometry() {
  const n = (MAX_SEGS + 1) * 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < MAX_SEGS; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  g.setIndex(idx);
  return g;
}

/** Read an Object3D's world transform → {pos, quat}. */
export function socketTransform(obj) {
  obj.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), s = new THREE.Vector3();
  obj.matrixWorld.decompose(pos, quat, s);
  return { pos, quat };
}

/**
 * Sample the smear curve between two socket transforms (pure function, also used by tests / bake tools).
 * Returns null if the swing is too small or the edge trails; else {points: [[inner, outer] x (segs+1)], theta, sign}.
 */
export function smearCurve(prev, cur, cfg, view = null) {
  const c = smearConfig(cfg);
  if (c.kind === 'thrust') return thrustCurve(prev, cur, c, view);
  const B = v3(c.blade), E = v3(c.edge), G = new THREE.Vector3().crossVectors(B, E).normalize();
  const q0 = prev.quat.clone().normalize(), q3 = cur.quat.clone().normalize();
  if (q0.dot(q3) < 0) q3.set(-q3.x, -q3.y, -q3.z, -q3.w);
  const dq = q3.clone().multiply(q0.clone().invert());
  const theta = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
  if (theta < c.minAngle * DEG) return null;
  const B0 = B.clone().applyQuaternion(q0), B1 = B.clone().applyQuaternion(q3);
  const E0 = E.clone().applyQuaternion(q0), E1 = E.clone().applyQuaternion(q3);
  const G0 = G.clone().applyQuaternion(q0), G1 = G.clone().applyQuaternion(q3);
  const tip0 = prev.pos.clone().addScaledVector(B0, c.length), tip1 = cur.pos.clone().addScaledVector(B1, c.length);
  const dTip = tip1.sub(tip0);
  const lead = dTip.dot(E0.clone().add(E1));
  if (c.minTravel && view?.texel && dTip.length() < c.minTravel * view.texel) return null;   // tip barely moved
  if (!c.doubleEdged && lead <= 0) return null;          // edge trails (back-swing, recovery): no smear
  const s = lead >= 0 ? 1 : -1;                          // which edge leads (double-edged)
  const h = 2 * Math.tan(Math.min(theta, 175 * DEG) / 4); // arc-fitted handle (angle per unit t)
  const chord = cur.pos.distanceTo(prev.pos);
  const r = chord / (2 * Math.max(Math.sin(theta / 2), 1e-3)); // hilt radius about the swing pivot
  const p0 = prev.pos, p3 = cur.pos;
  const p1 = p0.clone().addScaledVector(E0, s * h * r), p2 = p3.clone().addScaledVector(E1, -s * h * r);
  // rotating about +G moves the tip along +E (G = B × E), so the sign of the edge sets the spin sense
  const q1 = new THREE.Quaternion().setFromAxisAngle(G0, s * h).multiply(q0);
  const q2 = new THREE.Quaternion().setFromAxisAngle(G1, -s * h).multiply(q3);
  const segs = Math.max(4, Math.min(MAX_SEGS, Math.round(c.segs)));
  const pts = [];
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), q = new THREE.Quaternion();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), P = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, sm = t * t * (3 - 2 * t);
    a.lerpVectors(p0, p1, t); b.lerpVectors(p2, p3, t); P.lerpVectors(a, b, sm);
    qa.slerpQuaternions(q0, q1, t); qb.slerpQuaternions(q2, q3, t); q.slerpQuaternions(qa, qb, sm);
    dir.copy(B).applyQuaternion(q);
    pts.push([P.clone().addScaledVector(dir, c.inner * c.length), P.clone().addScaledVector(dir, c.length)]);
  }
  let tilted = 0;
  if (view?.dir) {
    // every-facing rule: rotate an edge-on swing plane about its on-screen line until it is c.tilt off edge-on
    const V = view.dir.clone().normalize();
    // the ribbon's own area-weighted normal (the blade may twist about itself, so G is not always the fan plane)
    const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      e1.subVectors(pts[i + 1][1], pts[i][0]); e2.subVectors(pts[i][1], pts[i + 1][0]);
      n.add(new THREE.Vector3().crossVectors(e1, e2));
    }
    if (n.lengthSq() < 1e-10) n.copy(G0).add(G1);
    n.normalize();
    const cosNV = n.dot(V), want = Math.sin((c.tilt ?? 0) * DEG);
    if (Math.abs(cosNV) < want) {
      const axis = new THREE.Vector3().crossVectors(n, V);
      if (axis.lengthSq() > 1e-8) {
        axis.normalize();
        const need = Math.asin(want) - Math.asin(Math.abs(cosNV));
        const pivot = p0.clone().add(p3).multiplyScalar(0.5);
        const lead = pts[pts.length - 1][1];
        const rot = (ang) => new THREE.Quaternion().setFromAxisAngle(axis, ang);
        const depthAfter = (ang) => lead.clone().sub(pivot).applyQuaternion(rot(ang)).dot(V);
        const ang = depthAfter(need) <= depthAfter(-need) ? need : -need;   // leading tip toward the camera
        const q = rot(ang);
        for (const pr of pts) for (const pt of pr) pt.sub(pivot).applyQuaternion(q).add(pivot);
        tilted = ang / DEG;
      }
    }
    if (c.front) for (const pr of pts) for (const pt of pr) pt.addScaledVector(V, -c.front);
  }
  return { points: pts, theta, sign: s, segs, cfg: c, tilted };
}

/** Straight thrust streak from the previous tip (pulled back by `back` m) to the current tip, face-on to the camera. */
function thrustCurve(prev, cur, c, view) {
  const B = v3(c.blade);
  const B0 = B.clone().applyQuaternion(prev.quat), B1 = B.clone().applyQuaternion(cur.quat);
  const tip0 = prev.pos.clone().addScaledVector(B0, c.length), tip1 = cur.pos.clone().addScaledVector(B1, c.length);
  const V = (view?.dir ?? new THREE.Vector3(0, -0.5, -0.86)).clone().normalize();
  let d = tip1.clone().sub(tip0);
  if (d.length() < 1e-4) return null;
  const travel = d.length();
  d.normalize();
  const tail = tip0.clone().addScaledVector(d, -(c.back ?? 0));
  let span = tip1.clone().sub(tail);
  let across = new THREE.Vector3().crossVectors(V, span);
  let glint = false;
  const texel = view?.texel ?? 0.0278;
  if (across.length() / Math.max(span.length(), 1e-6) < 0.35 || across.length() < 3 * texel) {
    // stab toward / away from the camera: a short horizontal glint centred on the tip
    glint = true;
    const right = view?.right?.clone() ?? new THREE.Vector3(1, 0, 0);
    span = right.multiplyScalar(Math.max(0.12, c.width * 2));
    tail.copy(tip1).addScaledVector(span, -0.5);
    across = new THREE.Vector3().crossVectors(V, span);
  }
  across.normalize().multiplyScalar(c.width * 1.5);    // ribbon = 3 core widths: core + room for the speed lines
  const segs = Math.max(4, Math.min(MAX_SEGS, Math.round(c.segs)));
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const P = tail.clone().addScaledVector(span, i / segs);
    pts.push([P.clone().sub(across), P.clone().add(across)]);
  }
  if (c.front) for (const pr of pts) for (const pt of pr) pt.addScaledVector(V, -c.front);
  return { points: pts, theta: 0, sign: 1, segs, cfg: c, travel, glint, tilted: 0 };
}

function keySmears(key) {
  const s = key?.smear;
  if (!s) return [];
  if (typeof s === 'string') return [{ socket: s }];
  if (Array.isArray(s)) return s.map((x) => (typeof x === 'string' ? { socket: x } : x));
  return [s];
}

export function attachSmears(engine, ch, opts = {}) {
  const rig = ch.rig ?? ch;
  const sockCfg = opts.sockets ?? {};
  const names = () => [...new Set([...Object.keys(rig.sockets ?? {}), ...Object.keys(sockCfg)])];
  const group = new THREE.Group();
  group.name = 'smears';
  (opts.parent ?? engine.scene).add(group);
  const normalPass = opts.normalPass ?? 'none';
  const poolSize = opts.pool ?? 8;
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    const mesh = new THREE.Mesh(ribbonGeometry(), smearMaterial(engine, normalPass));
    mesh.visible = false; mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.renderOrder = opts.renderOrder ?? 5;
    mesh.name = `smear-${i}`;
    mesh.userData.smear = null;
    group.add(mesh);
    if (opts.snap !== false) engine.camera.snapObjectToTexel(mesh);
    pool.push(mesh);
  }
  const prev = new Map();     // socket name -> {pos, quat, t}
  let lastPoseT = -Infinity, lastT = -Infinity, enabled = true, born = 0, lastKeyId = null;
  const smears = [];          // live records (for tests / debug)

  const anchorOf = () => {
    const r = ch.root ?? rig.root;
    return r ? new THREE.Vector3().setFromMatrixPosition(r.matrixWorld) : new THREE.Vector3();
  };

  // camera basis from the PixelCamera's analytic yaw/pitch (the THREE camera may not be updated yet when the first
  // poses are simulated, e.g. a frozen stage frame) → projected sizes in low-res texels + the view axis
  const viewInfo = () => {
    const pc = engine.camera, yaw = pc.yaw ?? Math.PI / 4, pitch = pc.pitch ?? Math.PI / 6;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return { dir: new THREE.Vector3(-cp * sy, -sp, -cp * cy), right: new THREE.Vector3(cy, 0, -sy),
      up: new THREE.Vector3(-sp * sy, cp, -sp * cy), texel: pc.texelWorld || 0.0278 };
  };
  let VI = viewInfo();
  const proj = (p) => new THREE.Vector2(p.dot(VI.right) / VI.texel, p.dot(VI.up) / VI.texel);

  function build(name, A, Bx, t, over = {}) {
    const cfg = { ...(sockCfg[name] ?? {}), ...over };
    VI = viewInfo();
    const curve = smearCurve(A, Bx, cfg, VI);
    if (!curve) return null;
    const c = curve.cfg;
    // reuse the oldest slot
    let mesh = pool.find((m) => !m.userData.smear);
    if (!mesh) mesh = pool.reduce((o, m) => (m.userData.smear.birth < o.userData.smear.birth ? m : o));
    const anchor = anchorOf();
    mesh.position.copy(anchor);
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
    // streak rows are sized by the NARROWEST projected ribbon width over the visible part (u >= 0.3): rows
    // thinner than 1 screen texel break streaks into dots where the ribbon is foreshortened.
    let arc = 0, width = Infinity, wmax = 0;
    let last = null;
    curve.points.forEach(([pi, po], i) => {
      pos.setXYZ(i * 2, pi.x - anchor.x, pi.y - anchor.y, pi.z - anchor.z);
      pos.setXYZ(i * 2 + 1, po.x - anchor.x, po.y - anchor.y, po.z - anchor.z);
      const u = i / curve.segs;
      uv.setXY(i * 2, u, 0); uv.setXY(i * 2 + 1, u, 1);
      const so = proj(po);
      if (last) arc += so.distanceTo(last);
      last = so;
      const w = proj(pi).distanceTo(so);
      wmax = Math.max(wmax, w);
      if (u >= 0.3) width = Math.min(width, w);
    });
    pos.needsUpdate = true; uv.needsUpdate = true;
    mesh.geometry.setDrawRange(0, curve.segs * 6);
    mesh.geometry.computeBoundingSphere();
    const U = mesh.material.uniforms;
    U.uRows.value = Math.max(3, Math.round(width / c.rowTexels));
    U.uCells.value = Math.max(4, Math.round(arc / c.dashTexels));
    U.uSeed.value = (born * 0.618 + name.length * 0.37) % 7.0;
    U.uBand.value = c.band; U.uTail.value = c.tail; U.uTailLen.value = c.tailLen;
    U.uStripes.value = c.kind === 'thrust' ? 0 : (c.stripes || 0);
    U.uThrust.value = c.kind === 'thrust' ? 1 : 0;
    if (c.stripes && c.kind !== 'thrust') U.uRows.value = Math.max(U.uRows.value, c.stripes * 3);
    if (c.kind === 'thrust') U.uRows.value = Math.max(7, U.uRows.value | 1);
    U.uBody.value.copy(lin(c.palette[0])); U.uLight.value.copy(lin(c.palette[1] ?? c.palette[0]));
    born++;
    const rec = { socket: name, kind: c.kind, tilted: curve.tilted, glint: !!curve.glint, birth: t, theta: curve.theta, stages: c.stages.map((s) => STAGE_ID[s] ?? 0), fps: c.fps,
      widthTexels: wmax, rowWidthTexels: width, arcTexels: arc, mesh };
    mesh.userData.smear = rec;
    smears.push(rec);
    stage(mesh, engine.time);
    return rec;
  }

  function stage(mesh, t) {
    const rec = mesh.userData.smear;
    if (!rec) { mesh.visible = false; return; }
    const k = Math.floor((t - rec.birth) * rec.fps + 0.01);   // 0.01 frame: robust to rounded capture times
    if (k < 0 || k >= rec.stages.length || !enabled) { mesh.visible = false; if (k >= rec.stages.length) free(mesh); return; }
    mesh.material.uniforms.uMode.value = rec.stages[k];
    mesh.visible = true;
  }
  function free(mesh) {
    const rec = mesh.userData.smear;
    if (rec) { const i = smears.indexOf(rec); if (i >= 0) smears.splice(i, 1); }
    mesh.userData.smear = null; mesh.visible = false;
  }
  function reset() {
    for (const m of pool) free(m);
    prev.clear(); lastPoseT = -Infinity; born = 0; lastKeyId = null;
  }

  const onPose = (e) => {
    const t = e.t ?? engine.time;
    if (t < lastPoseT - 1e-6) reset();
    lastPoseT = t;
    // hold-safe: a dynamics-only redraw re-shows the same clip key → never a second smear for it
    const keyId = e.keyIndex != null ? `${e.clip}:${e.keyIndex}` : `${e.clip}:f${e.frame}`;
    const sameKey = keyId === lastKeyId;
    lastKeyId = keyId;
    const want = sameKey ? [] : keySmears(e.key);
    if (opts.auto && !sameKey) for (const n of Object.keys(sockCfg)) if (!want.some((w) => w.socket === n)) want.push({ socket: n, auto: true });
    for (const n of names()) {
      const obj = rig.sockets?.[n];
      if (!obj) continue;
      const cur = socketTransform(obj);
      const w = want.find((x) => x.socket === n);
      const p = prev.get(n);
      if (w && p && enabled) { const { socket, auto, ...over } = w; build(n, p, cur, t, over); }
      prev.set(n, { ...cur, t });
    }
  };
  const off = ch.on?.('pose', onPose);
  const offReset = ch.on?.('reset', () => reset());   // Character re-simulates from 0 and re-emits its poses

  engine.onUpdate((t) => {
    if (t < lastT - 1e-6) {           // time went backwards: drop smears born in the future
      for (const m of pool) if (m.userData.smear && m.userData.smear.birth > t + 1e-6) free(m);
    }
    lastT = t;
    for (const m of pool) stage(m, t);
  });

  return {
    group, smears, pool,
    /** Build a smear directly from two transforms {pos, quat} (e.g. a weapon not on a rig). */
    trigger(name, prevXf, curXf, t = engine.time, over = {}) { return build(name, prevXf, curXf, t, over); },
    reset,
    setEnabled(v) { enabled = !!v; for (const m of pool) stage(m, engine.time); },
    dispose() {
      if (typeof off === 'function') off();
      if (typeof offReset === 'function') offReset();
      for (const m of pool) { engine.camera.snapObjectToTexel(m, { enabled: false }); m.geometry.dispose(); m.material.dispose(); }
      group.removeFromParent();
    },
  };
}
