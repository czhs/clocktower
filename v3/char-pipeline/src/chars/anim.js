// Clip evaluation (motion owner). docs/CHARACTERS.md §4. Pure functions: (clip, localTime) → held pose.
//
// A clip is plain data:
//   { fps: 30, loop: false, interp: 'step'|'ease', twos: 2, ease: 'inOutSine', length?: <grid frames>,
//     keys: [{ f, pose: { bone: [fwd, twist, out], …, pos?: [x,y,z] }, smear?, ease? }, …],
//     events: { <frame>: 'name' | ['a','b'] }, root: { <frame>: [x, y, z] } }
//
// Timing rules (t3ssel8r, research/05 §3):
//   - the pose only changes on the KEY GRID (fps, default 30 Hz); 'step' clips hold each key until the next one
//     (bones missing from a key are at rest = 0);
//   - 'ease' clips (cycles) ease between keys but are SAMPLED ON TWOS: a new pose every `twos` grid frames
//     (bones missing from a key interpolate to 0);
//   - non-looping clips hold their last key for one extra grid frame (his importer), then report `done`;
//   - looping clips: period = `length` grid frames; default = last key f + spacing of the first two keys
//     (so keys 0,4,8,12 → length 16, the last key eases back into the first);
//   - root offsets are the only smooth channel (they move every frame, eased between root keys); a stepped copy
//     is also returned (`rootStep`) for slow actions that want "option A" travel;
//   - clip switches/blends happen only on grid-frame boundaries (character.js), see blendPoses / crossfadePose.
import * as THREE from 'three';

export const EASE = {
  linear: (u) => u,
  inOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  inOutQuad: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  outCubic: (u) => 1 - Math.pow(1 - u, 3),
  inCubic: (u) => u * u * u,
  outQuad: (u) => 1 - (1 - u) * (1 - u),
  inQuad: (u) => u * u,
  // pixel-animation favourite: hold near the extremes, fast through the middle
  slowInOut: (u) => { const s = u * u * (3 - 2 * u); return s * s * (3 - 2 * s); },
};

const EPS = 1e-6;
const meta = new WeakMap();

/** Cached per-clip info: sorted keys, period, bone set, event table. */
export function clipInfo(clip) {
  let m = meta.get(clip);
  if (m) return m;
  const fps = clip.fps ?? 30;
  const keys = [...(clip.keys || [])].sort((a, b) => a.f - b.f);
  if (!keys.length) keys.push({ f: 0, pose: {} });
  const loop = !!clip.loop;
  const interp = clip.interp ?? (loop ? 'ease' : 'step');
  const twos = Math.max(1, clip.twos ?? (interp === 'ease' ? 2 : 1));
  const last = keys[keys.length - 1].f;
  const spacing = keys.length > 1 ? keys[1].f - keys[0].f : 1;
  const length = Math.max(1, clip.length ?? (loop ? last + spacing : last + 1));
  const bones = new Set();
  for (const k of keys) for (const b of Object.keys(k.pose || {})) bones.add(b);
  const events = new Map();
  for (const [f, e] of Object.entries(clip.events || {})) events.set(Number(f), Array.isArray(e) ? e : [e]);
  const rootKeys = Object.entries(clip.root || {}).map(([f, v]) => ({ f: Number(f), v })).sort((a, b) => a.f - b.f);
  m = { fps, keys, loop, interp, twos, length, duration: length / fps, bones: [...bones], events, rootKeys };
  meta.set(clip, m);
  return m;
}

/** Grid frame index of a local time (robust to float error: 0.1*30 = 2.9999…). */
export function gridFrame(localTime, fps = 30) { return Math.floor(localTime * fps + EPS); }

/** Index of the last key with f <= g (keys sorted). */
function keyAt(keys, g) {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].f <= g + EPS) i++;
  return i;
}

function lerpVal(a, b, u) {
  if (a === undefined && b === undefined) return undefined;
  const A = a ?? [0, 0, 0], B = b ?? [0, 0, 0];
  if (typeof A === 'number') return A + ((B ?? 0) - A) * u;
  const out = new Array(Math.max(A.length, B.length));
  for (let i = 0; i < out.length; i++) out[i] = (A[i] ?? 0) + ((B[i] ?? 0) - (A[i] ?? 0)) * u;
  return out;
}

/** Fill the clip's bone set with rest (0) where a pose omits a bone (so applying it resets those bones). */
function fullPose(pose, bones) {
  const out = {};
  for (const b of bones) out[b] = pose[b] !== undefined ? (Array.isArray(pose[b]) ? [...pose[b]] : pose[b]) : [0, 0, 0];
  for (const b of Object.keys(pose)) if (!(b in out)) out[b] = pose[b];
  if (out.pos !== undefined && pose.pos === undefined) out.pos = [0, 0, 0];
  return out;
}

/** Root offset at continuous grid position x (frames), eased between root keys (smooth channel). */
function rootAt(info, x) {
  const R = info.rootKeys;
  if (!R.length) return null;
  if (x <= R[0].f) return R[0].f === 0 ? [...R[0].v] : lerpVal([0, 0, 0], R[0].v, EASE.inOutSine(Math.max(0, x) / Math.max(EPS, R[0].f)));
  for (let i = 0; i + 1 < R.length; i++) {
    if (x < R[i + 1].f) return lerpVal(R[i].v, R[i + 1].v, EASE.inOutSine((x - R[i].f) / (R[i + 1].f - R[i].f)));
  }
  return [...R[R.length - 1].v];
}
function rootStepAt(info, g) {
  const R = info.rootKeys;
  if (!R.length) return null;
  let v = [0, 0, 0];
  for (const k of R) if (k.f <= g + EPS) v = k.v;
  return [...v];
}

/**
 * Evaluate a clip at localTime (seconds since the clip started; speed already applied by the caller).
 * Returns {
 *   poseMap   held pose (full: every bone the clip animates; 'pos' when keyed),
 *   frame     displayed grid frame within the clip (changes only when the displayed pose changes),
 *   grid      raw grid frame within the clip (30 Hz),
 *   cycle     loop count (0 for one-shots),
 *   keyIndex, key   the key at/before the displayed frame (carries smear/other per-key data),
 *   root, rootStep  smooth and stepped root offsets ([x,y,z] character space) or null,
 *   done      one-shot finished (past its final hold),
 *   length, fps, interp
 * }
 */
export function evaluateClip(clip, localTime) {
  const info = clipInfo(clip);
  const { fps, keys, loop, interp, twos, length } = info;
  const gAbs = gridFrame(Math.max(0, localTime), fps);
  let g, cycle = 0, done = false;
  if (loop) { cycle = Math.floor(gAbs / length); g = gAbs - cycle * length; }
  else { done = gAbs >= length; g = Math.min(gAbs, length - 1); }

  let poseMap, frame, keyIndex;
  if (interp === 'step') {
    keyIndex = keyAt(keys, g);
    frame = keys[keyIndex].f;
    poseMap = fullPose(keys[keyIndex].pose || {}, info.bones);
  } else {
    frame = Math.floor(g / twos) * twos;
    keyIndex = keyAt(keys, frame);
    const a = keys[keyIndex];
    let b = keys[keyIndex + 1], bf = b ? b.f : 0;
    if (!b) { if (loop) { b = keys[0]; bf = keys[0].f + length; } else { b = a; bf = a.f + 1; } }
    if (frame < a.f) { b = a; bf = a.f; }                       // before the first key: hold it
    const span = Math.max(EPS, bf - a.f);
    const ease = EASE[a.ease ?? clip.ease ?? 'inOutSine'] || EASE.inOutSine;
    const u = b === a ? 0 : ease(Math.min(1, Math.max(0, (frame - a.f) / span)));
    poseMap = blendPoses(fullPose(a.pose || {}, info.bones), fullPose(b.pose || {}, info.bones), u);
  }
  const xCont = loop ? (Math.max(0, localTime) * fps) % length : Math.min(Math.max(0, localTime) * fps, length - 1);
  return {
    poseMap, frame, grid: g, cycle, keyIndex, key: keys[keyIndex],
    root: rootAt(info, xCont), rootStep: rootStepAt(info, g),
    done, length, fps, interp,
  };
}

/**
 * Evaluate a looping clip by PHASE (0..1 of its period) instead of time — used by locomotion for authored
 * walk/run cycles (distance-phased). The phase is quantised to the clip's sampling (`twos` grid frames).
 */
export function evaluateClipAtPhase(clip, phase) {
  const info = clipInfo(clip);
  const p = phase - Math.floor(phase);
  return evaluateClip(clip, (p * info.length + EPS) / info.fps);
}

/**
 * Events crossed when going from grid frame g0 (exclusive) to g1 (inclusive), absolute grid frames since the
 * clip started (loops wrap). Returns [{frame, name}] in order. Frame 0 fires when g0 < 0 (clip start).
 */
export function eventsBetween(clip, g0, g1) {
  const info = clipInfo(clip);
  const out = [];
  if (!info.events.size || g1 <= g0) return out;
  for (let g = g0 + 1; g <= g1; g++) {
    let f = g;
    if (info.loop) f = ((g % info.length) + info.length) % info.length;
    else if (g >= info.length) break;
    const e = info.events.get(f);
    if (e) for (const name of e) out.push({ frame: f, name, grid: g });
  }
  return out;
}

/** Linear blend of two pose maps (triples and pos), bones missing on one side count as rest. */
export function blendPoses(a, b, w) {
  if (w <= 0) return { ...a };
  if (w >= 1) return { ...b };
  const out = {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const n of names) out[n] = lerpVal(a[n], b[n], w);
  return out;
}

/** Overlay: bones in `top` replace bones in `base` (optionally only bones passing filter(name)). */
export function overlayPose(base, top, filter = null) {
  const out = { ...base };
  for (const [n, v] of Object.entries(top)) if (!filter || filter(n)) out[n] = v;
  return out;
}

/** Add pose triples (additive layers: breathing, lean, look). */
export function addPoses(base, add, weight = 1) {
  const out = { ...base };
  for (const [n, v] of Object.entries(add)) {
    const b = out[n] ?? [0, 0, 0];
    out[n] = b.map((x, i) => x + (v[i] ?? 0) * weight);
  }
  return out;
}

/**
 * Stepped crossfade helper: when switching from a held pose `from` to a new clip, the first `frames` displayed
 * frames of the new clip blend from `from` in equal steps (k+1)/(frames+1). frames = 0 → hard cut (default
 * for pixel animation). gFromStart = grid frames since the switch (already quantised by the caller).
 */
export function crossfadePose(from, to, gFromStart, frames = 0) {
  if (!from || frames <= 0 || gFromStart >= frames) return to;
  return blendPoses(from, to, (gFromStart + 1) / (frames + 1));
}

/** Duration in seconds of a clip (one period for loops; includes the final hold for one-shots). */
export function clipDuration(clip) { return clipInfo(clip).duration; }

/** Degrees → radians helper for pose triples. */
export const deg = THREE.MathUtils.degToRad;
