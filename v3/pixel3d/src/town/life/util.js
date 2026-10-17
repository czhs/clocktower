// life helpers (owner: life agent). Pure, deterministic utilities shared by the life systems.
import * as THREE from 'three';

/** Integer hash -> [0, 1). Stable across runs (no Math.random). */
export function hash(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Hash of a float key (e.g. a seed + index). */
export const hashf = (x, salt = 0) => hash(Math.floor(x * 1000003) | 0, salt);

/** Stepped time: the last tick of a `fps` clock at or before t. */
export const step = (t, fps) => Math.floor(t * fps + 1e-6) / fps;

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, f) => a + (b - a) * f;
export const smooth = (f) => { f = clamp(f); return f * f * (3 - 2 * f); };
export const TAU = Math.PI * 2;

/** Quantise an angle (radians) to `n` stops (default 8 = 45 deg). */
export const quantAngle = (a, n = 8) => Math.round(a / (TAU / n)) * (TAU / n);

/** Linear THREE.Color from an sRGB hex. */
export const lin = (hex) => new THREE.Color(hex);

/**
 * Keep a moving object (or instance position) on the camera's texel grid while its parent (the town root) is offset
 * by a sub-texel anti-tie nudge: local = snapWorld(local + rootOffset) (the root offset is then re-added by the
 * parent), so the whole object moves in whole texels and keeps the anti-tie phase of the static town.
 */
export function snapLocal(engine, rootOffset, p, out = new THREE.Vector3()) {
  out.copy(p).add(rootOffset);
  engine.camera.snapWorld(out, out);
  return out;
}

/** Piecewise-linear lookup over sorted keys [[t, v], ...] (holds at the ends). */
export function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
}

/** Held (step) lookup over sorted keys [[t, v], ...]: the value of the last key at or before t. */
export function held(keys, t, before = keys[0]?.[1]) {
  let v = before;
  for (const [k, val] of keys) { if (t >= k) v = val; else break; }
  return v;
}

/** Vertices of an object tree (world-ish: in the coordinate frame of `relTo`'s parent chain = layout space). */
export function scanVertices(obj, fn) {
  obj.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  // layout space = the town root's local frame (pieces are parented under it)
  let root = obj; while (root.parent && root.parent.name !== 'town' && root.parent.type !== 'Scene') root = root.parent;
  const rootParent = root.parent && root.parent.name === 'town' ? root.parent : null;
  if (rootParent) inv.copy(rootParent.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.getAttribute('position') || o.isInstancedMesh || o.isSkinnedMesh) return;
    const p = o.geometry.getAttribute('position');
    const m = o.matrixWorld.clone();
    if (rootParent) m.premultiply(inv);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); fn(v, o, i); }
  });
}
