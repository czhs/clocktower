// Inverse kinematics (motion owner). Analytic, recomputed from the REST offsets every call (no accumulation,
// no iteration, deterministic): CHARACTER_TECHNIQUES §5, research/06.
//
//   solveTwoBone(rig, 'thighL', 'shinL', 'footL', targetWorld, poleWorld, opts) → {knee, reached, dist}
//     Places the END bone's joint (its origin, e.g. the ankle) on targetWorld. Lengths come from the rest offsets
//     (lower.position, end.position), so whatever rotation the bones had before is ignored. The knee lies in the
//     plane (upper joint, target, pole) on the pole side. Reach is clamped to `reach` × full length (a straight
//     leg never snaps/pops: the target is pulled back along the hip→target ray), and to ≥ |L1 − L2| + ε.
//     opts.poleLocal (default +Z = character forward for knees; use [0,0,-1] for elbows whose pole is behind)
//     is the rest-pose direction, in the upper bone's local space, that should end up pointing at the pole.
//     opts.endQuat (world THREE.Quaternion): orientation for the end bone (planted foot flat on the ground);
//     omitted → the end bone keeps its local rotation.
//   lookAt(rig, bones, targetWorld, {yaw: 70, pitch: 35, weights, forwardLocal}) → {yaw, pitch} (degrees, applied)
//     Turns one bone or a chain (['neck','head'], weights summing to ≤ 1) so its forward axis (local +Z) points at
//     the target, relative to its CURRENT (animated) orientation, limited to ±yaw / ±pitch degrees.
//   aimBone(bone, dirWorld, childLocal) — minimal rotation so the bone's child offset points along dirWorld
//     (secondary chains).
//   setWorldQuaternion(bone, q), worldQuaternion(bone)
//
// Every function expects the parents' world matrices to be current (call rig.root.updateMatrixWorld(true) after
// applying the pose) and leaves the touched bones' world matrices updated (children included).
import * as THREE from 'three';

const _v = () => new THREE.Vector3();
const A = _v(), T = _v(), D = _v(), P = _v(), K = _v(), U = _v(), R = _v(), S = _v(), C1 = _v(), C2 = _v(), REF = _v(), X = _v();
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), PQ = new THREE.Quaternion(), QW = new THREE.Quaternion(), QE = new THREE.Quaternion();
const M1 = new THREE.Matrix4(), M2 = new THREE.Matrix4();
const SC = _v();

function boneOf(rig, b) { return typeof b === 'string' ? (rig.bones?.[b] ?? null) : b; }

/** World quaternion of an object (from its current matrixWorld). */
export function worldQuaternion(obj, out = new THREE.Quaternion()) {
  obj.matrixWorld.decompose(X, out, SC);
  return out;
}

/** Set a bone's LOCAL quaternion so that its world orientation equals q (parent matrixWorld must be current). */
export function setWorldQuaternion(bone, q) {
  if (bone.parent) { worldQuaternion(bone.parent, PQ); bone.quaternion.copy(PQ.invert().multiply(q)); }
  else bone.quaternion.copy(q);
  bone.updateMatrixWorld(true);
  return bone;
}

/**
 * Rotation that maps the frame (u, r) onto (u2, r2): u/u2 are the primary axes (bone direction), r/r2 are
 * reference axes (orthogonalised against u/u2 here). out = B2 · B1⁻¹.
 */
function frameRotation(u, r, u2, r2, out) {
  const a = U.copy(u).normalize(), b = R.copy(r).addScaledVector(a, -r.dot(a)).normalize(), c = S.crossVectors(a, b);
  M1.makeBasis(a, b, c);
  const a2 = C1.copy(u2).normalize(), b2 = C2.copy(r2).addScaledVector(a2, -r2.dot(a2)).normalize(), c2 = X.crossVectors(a2, b2);
  M2.makeBasis(a2, b2, c2);
  M1.transpose(); // orthonormal: inverse = transpose
  M2.multiply(M1);
  return out.setFromRotationMatrix(M2);
}

/**
 * Two-bone IK, see header. targetWorld / poleWorld: THREE.Vector3 (world). Returns
 * { knee: Vector3 (world), reached: bool, dist: number (clamped hip→target distance), stretch: unclamped/full }.
 */
export function solveTwoBone(rig, upperName, lowerName, endName, targetWorld, poleWorld, opts = {}) {
  const upper = boneOf(rig, upperName), lower = boneOf(rig, lowerName), end = boneOf(rig, endName);
  if (!upper || !lower || !end) throw new Error(`ik.solveTwoBone: missing bone ${!upper ? upperName : !lower ? lowerName : endName}`);
  const reach = opts.reach ?? 0.999;
  const poleLocal = opts.poleLocal ? REF.fromArray(opts.poleLocal.isVector3 ? opts.poleLocal.toArray() : opts.poleLocal) : REF.set(0, 0, 1);

  upper.parent.updateWorldMatrix(true, false);
  worldQuaternion(upper.parent, PQ);
  upper.parent.matrixWorld.decompose(X, Q1, SC);
  const scale = SC.x;                                         // uniform scale assumed (characters are unscaled)
  A.copy(upper.position).applyMatrix4(upper.parent.matrixWorld); // upper joint (hip) in world

  const c1 = new THREE.Vector3().copy(lower.position), c2 = new THREE.Vector3().copy(end.position);
  const L1 = c1.length() * scale, L2 = c2.length() * scale;
  T.copy(targetWorld);
  D.subVectors(T, A);
  const raw = D.length();
  const maxD = (L1 + L2) * reach, minD = Math.abs(L1 - L2) + 1e-4;
  const dist = Math.min(maxD, Math.max(minD, raw));
  if (raw < 1e-6) D.set(0, -1, 0); else D.divideScalar(raw);
  T.copy(A).addScaledVector(D, dist);

  // pole direction ⟂ hip→target
  const pole = new THREE.Vector3();
  if (poleWorld) pole.subVectors(poleWorld, A); else pole.copy(poleLocal).applyQuaternion(PQ);
  pole.addScaledVector(D, -pole.dot(D));
  if (pole.lengthSq() < 1e-10) { pole.copy(poleLocal).applyQuaternion(PQ); pole.addScaledVector(D, -pole.dot(D)); }
  if (pole.lengthSq() < 1e-10) pole.set(0, 0, 1).addScaledVector(D, -D.z);
  pole.normalize();

  // knee by the law of cosines
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  K.copy(A).addScaledVector(D, a).addScaledVector(pole, h);
  const knee = K.clone();

  // upper: rest frame (c1, poleLocal) in its local axes (rest rotation = 0) → world frame (A→K, pole)
  const dirU = new THREE.Vector3().subVectors(knee, A);
  frameRotation(c1, poleLocal, dirU, pole, QW);               // world rotation for the upper bone
  upper.quaternion.copy(Q2.copy(PQ).invert().multiply(QW));
  upper.updateMatrixWorld(true);

  // lower: rest frame (c2, poleLocal) in ITS local axes → world (K→T, pole); local = upperWorld⁻¹ · world
  const dirL = new THREE.Vector3().subVectors(T, knee);
  frameRotation(c2, poleLocal, dirL, pole, QE);
  lower.quaternion.copy(Q2.copy(QW).invert().multiply(QE));
  lower.updateMatrixWorld(true);

  if (opts.endQuat) { end.quaternion.copy(Q2.copy(QE).invert().multiply(opts.endQuat)); end.updateMatrixWorld(true); }
  return { knee, reached: raw <= maxD + 1e-9, dist, stretch: raw / (L1 + L2) };
}

/**
 * Head/neck look-at with limits (degrees). `bones` = name, bone, or array; weights default to an even split.
 * The rotation is added on top of the current local rotation (call after the pose is applied).
 */
export function lookAt(rig, bones, targetWorld, { yaw = 70, pitch = 35, weights = null, forwardLocal = [0, 0, 1], weight = 1 } = {}) {
  const list = (Array.isArray(bones) ? bones : [bones]).map((b) => boneOf(rig, b)).filter(Boolean);
  if (!list.length || !targetWorld) return { yaw: 0, pitch: 0 };
  const w = weights || list.map(() => 1 / list.length);
  const last = list[list.length - 1];
  last.updateWorldMatrix(true, false);
  // total angles measured at the last bone (the head), relative to its current orientation
  const pos = new THREE.Vector3().setFromMatrixPosition(last.matrixWorld);
  const q = worldQuaternion(last, new THREE.Quaternion());
  const d = new THREE.Vector3().subVectors(targetWorld, pos).applyQuaternion(q.invert());
  const fwd = new THREE.Vector3().fromArray(forwardLocal).normalize();
  // express in a frame where fwd = +Z (default case is identity)
  const toZ = new THREE.Quaternion().setFromUnitVectors(fwd, new THREE.Vector3(0, 0, 1));
  d.applyQuaternion(toZ);
  const deg = THREE.MathUtils.radToDeg, rad = THREE.MathUtils.degToRad;
  let ay = deg(Math.atan2(d.x, d.z)), ap = deg(Math.atan2(-d.y, Math.hypot(d.x, d.z)));
  ay = Math.max(-yaw, Math.min(yaw, ay)) * weight;
  ap = Math.max(-pitch, Math.min(pitch, ap)) * weight;
  const fromZ = toZ.clone().invert();
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const r = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(ap * w[i]), rad(ay * w[i]), 0, 'YXZ'));
    r.premultiply(fromZ).multiply(toZ);
    b.quaternion.multiply(r);
    b.updateMatrixWorld(true);
  }
  return { yaw: ay, pitch: ap };
}

/**
 * Minimal-rotation aim: rotate `bone` (world) so that its child offset `childLocal` (local, rest) points along
 * dirWorld. Keeps twist as close as possible to the current orientation. Parent matrices must be current.
 */
export function aimBone(bone, dirWorld, childLocal) {
  bone.updateWorldMatrix(true, false);
  const qw = worldQuaternion(bone, new THREE.Quaternion());
  const cur = new THREE.Vector3().copy(childLocal).normalize().applyQuaternion(qw);
  const want = new THREE.Vector3().copy(dirWorld).normalize();
  const r = new THREE.Quaternion().setFromUnitVectors(cur, want);
  return setWorldQuaternion(bone, r.multiply(qw));
}
