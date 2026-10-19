// Character modelling kit (rig owner). Low-poly, flat-shaded geometry helpers that read well at 36 px/m
// (viewHeight 10: 1 texel = 0.0278 m). docs/CHARACTERS.md §1-3, CHARACTER_TECHNIQUES §2.
//
// CONVENTIONS (every helper):
//   - Returns a NON-INDEXED THREE.BufferGeometry with flat per-face normals (position + normal only; the rig adds
//     colour / tone / skin attributes). Triangles are wound CCW seen from outside.
//   - Metres; y up; the "front" of a shape is +Z (the character faces +Z).
//   - CENTRED: the bounding box centre is at the origin (box, chamferBox, frustum, prism, wedge, lathe, extrude),
//     so a limb part hung from a joint uses `at: [0, -h/2, 0]`. Exceptions are listed per function
//     (hull keeps your points as given).
//   - Polygon rings (frustum/prism/lathe) put a FLAT FACE towards +Z and towards ±X when n is a multiple of 4
//     (a 4-sided frustum is a box-like taper, not a diamond). `r` is the circumradius; the width across flats is
//     2·r·cos(π/n) (n=4: 1.41·r, n=6: 1.73·r, n=8: 1.85·r).
//   - Pixel budget: keep every dimension ≥ 0.06 m (2 texels) and facets ≥ 0.08 m (3 texels); prefer 4-6 sides for
//     limbs, chamfers only on the big masses (head, torso, hat) — CHARACTER_LEARNINGS.
//
// API
//   box(w, h, d, {segY=1})                     axis-aligned box; segY > 1 splits it into horizontal bands (so bend()
//                                              can curve it: capes, scarves, hair locks)
//   chamferBox(w, h, d, c=0.25, {top, bottom}) 8-sided prism: vertical edges cut at 45°, cut = c·min(w,d)/2;
//                                              top/bottom: horizontal 45° bevel size (m) on the top/bottom rims
//   frustum(n, rBottom, rTop, h)               n-sided truncated pyramid (also accepts the doc order
//          | frustum(rBottom, rTop, h, n=6)    frustum(rBottom, rTop, h, n)); opts {sx, sz} scale x/z of both rings,
//                                              {shiftTop:[x,z]} slides the top ring (lean)
//   prism(n, r, h)                             = frustum(n, r, r, h)
//   wedge(w, h, d, {top='back'})               triangular prism: full height at the back (−Z) sloping to 0 at the
//                                              front (+Z) (top:'front' reverses; 'center' = ridge in the middle)
//   hull(points)                               convex hull of [[x,y,z]…] or Vector3[] (three/addons ConvexGeometry)
//   lathe(profile, n=6)                        profile [[r, y], …] bottom→top; r = 0 makes a point (apex)
//   loft(rings)                                general: rings = [{y, pts:[[x,z]…]}] with equal counts (convex rings)
//   extrude(poly, depth, {axis='z'})           2-D polygon [[x,y]…] (any winding, may be concave) extruded along z
//                                              (axis 'y': polygon is [[x,z]…], extruded along y). Capes, blades, ears.
//   mirrorX(geo)                               mirrored copy across x = 0 (winding fixed)
//   merge(...geos)                             one non-indexed geometry
//   xf(geo, {at, rot, scale})                  transformed copy; rot in degrees (XYZ Euler)
//   bend(geo, {axis='y', taper=[1,1], taperZ, bend=0, flare=0, from, to, curl})
//                                              cape/hair modifier along an axis (default y, top→bottom):
//                                              taper = [scaleX at top, at bottom], taperZ likewise for depth,
//                                              bend = degrees the bottom end swings towards −Z (back, + = cape
//                                              trailing), flare = metres the bottom moves outwards in x (|x|),
//                                              curl = metres the bottom moves in z (+ = forward). Only vertices move:
//                                              give the shape bands (box segY / lathe rings) or it just shears.
//                                              NOT re-centred (the top edge stays put = the attachment line).
//   flat(geo)                                  re-derive flat normals (after you edit positions)
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Build a non-indexed geometry from a flat triangle list [x,y,z, …] and give it flat normals. */
function fromTris(arr) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return flat(g);
}

/** Recompute flat face normals (non-indexed geometry). */
export function flat(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g.computeVertexNormals(); // non-indexed: each triangle gets its own face normal
  g.computeBoundingBox();
  return g;
}

/** Centre a geometry on its bounding-box centre. */
function centre(g) {
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
  return g;
}

// Push a triangle, oriented so its normal points away from `inside` (a point inside the solid).
function tri(out, a, b, c, inside) {
  const ab = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = V(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const n = ab.cross(ac);
  if (n.lengthSq() < 1e-14) return; // degenerate (apex rings)
  const cx = (a[0] + b[0] + c[0]) / 3 - inside[0], cy = (a[1] + b[1] + c[1]) / 3 - inside[1], cz = (a[2] + b[2] + c[2]) / 3 - inside[2];
  if (n.x * cx + n.y * cy + n.z * cz < 0) out.push(...a, ...c, ...b);
  else out.push(...a, ...b, ...c);
}

/**
 * Loft between convex rings. rings: [{y, pts:[[x,z],…]}] bottom→top, every ring the same vertex count.
 * Caps on the first/last ring (unless a ring is a single point). Returns an UNCENTRED geometry.
 */
export function loft(rings, { capBottom = true, capTop = true } = {}) {
  const out = [];
  const ringC = (r) => { let x = 0, z = 0; for (const p of r.pts) { x += p[0]; z += p[1]; } return [x / r.pts.length, r.y, z / r.pts.length]; };
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], B = rings[k + 1], n = A.pts.length;
    const ca = ringC(A), cb = ringC(B);
    const inside = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = [A.pts[i][0], A.y, A.pts[i][1]], a1 = [A.pts[j][0], A.y, A.pts[j][1]];
      const b0 = [B.pts[i][0], B.y, B.pts[i][1]], b1 = [B.pts[j][0], B.y, B.pts[j][1]];
      tri(out, a0, a1, b1, inside); tri(out, a0, b1, b0, inside);
    }
  }
  const cap = (R, other) => {
    const c = ringC(R), o = ringC(other);
    const inside = [c[0], c[1] + (o[1] - c[1]) * 0.01 + Math.sign(o[1] - c[1]) * 1e-4, c[2]];
    for (let i = 1; i + 1 < R.pts.length; i++) {
      tri(out, [R.pts[0][0], R.y, R.pts[0][1]], [R.pts[i][0], R.y, R.pts[i][1]], [R.pts[i + 1][0], R.y, R.pts[i + 1][1]], inside);
    }
  };
  if (capBottom && rings.length > 1) cap(rings[0], rings[1]);
  if (capTop && rings.length > 1) cap(rings[rings.length - 1], rings[rings.length - 2]);
  return fromTris(out);
}

/** n-gon ring points [[x,z]…], flat face towards +Z, circumradius r, scaled by sx/sz, offset by [ox, oz]. */
function ngon(n, r, sx = 1, sz = 1, ox = 0, oz = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / n + (2 * Math.PI * i) / n; // angle from +Z towards +X
    pts.push([ox + Math.sin(a) * r * sx, oz + Math.cos(a) * r * sz]);
  }
  return pts;
}

export function box(w, h, d, { segY = 1 } = {}) {
  const x = w / 2, y = h / 2, z = d / 2;
  const rect = [[-x, -z], [x, -z], [x, z], [-x, z]];
  const rings = [];
  for (let i = 0; i <= segY; i++) rings.push({ y: -y + (h * i) / segY, pts: rect });
  return centre(loft(rings));
}

function octRing(w, d, c) {
  const x = w / 2, z = d / 2;
  const cx = Math.min(c, x * 0.999, z * 0.999);
  return [[-x + cx, -z], [x - cx, -z], [x, -z + cx], [x, z - cx], [x - cx, z], [-x + cx, z], [-x, z - cx], [-x, -z + cx]];
}

/** Box with 45° chamfered vertical edges; optional 45° bevels on the top / bottom rims (metres). */
export function chamferBox(w, h, d, c = 0.25, { top = 0, bottom = 0 } = {}) {
  const cut = Math.min(w, d) * c * 0.5;
  const y = h / 2;
  const rings = [];
  if (bottom > 0) rings.push({ y: -y, pts: octRing(w - 2 * bottom, d - 2 * bottom, Math.max(0, cut - bottom * 0.4)) });
  rings.push({ y: -y + bottom, pts: octRing(w, d, cut) });
  rings.push({ y: y - top, pts: octRing(w, d, cut) });
  if (top > 0) rings.push({ y, pts: octRing(w - 2 * top, d - 2 * top, Math.max(0, cut - top * 0.4)) });
  return centre(loft(rings));
}

/**
 * n-sided frustum (truncated pyramid), centred. frustum(n, rBottom, rTop, h, opts) or the doc order
 * frustum(rBottom, rTop, h, n = 6, opts). opts: {sx, sz} (ring scale in x / z), {shiftTop: [x, z]}.
 */
export function frustum(a, b, c, d, e) {
  let n, rb, rt, h, opts;
  if (Number.isInteger(a) && a >= 3) { n = a; rb = b; rt = c; h = d; opts = e; }
  else { rb = a; rt = b; h = c; n = Number.isInteger(d) ? d : 6; opts = typeof d === 'object' ? d : e; }
  const { sx = 1, sz = 1, shiftTop = [0, 0] } = opts || {};
  const rings = [{ y: -h / 2, pts: ngon(n, rb, sx, sz) }];
  if (rt > 0) rings.push({ y: h / 2, pts: ngon(n, rt, sx, sz, shiftTop[0], shiftTop[1]) });
  else rings.push({ y: h / 2, pts: ngon(n, 0, 1, 1, shiftTop[0], shiftTop[1]) });
  return centre(loft(rings));
}

export function prism(n, r, h, opts) { return frustum(n, r, r, h, opts); }

/** Triangular prism along x: profile in the y-z plane. top: 'back' (default, ridge at −Z), 'front', 'center'. */
export function wedge(w, h, d, { top = 'back' } = {}) {
  const z = d / 2, ry = top === 'front' ? z : top === 'center' ? 0 : -z;
  const poly = [[-z, 0], [z, 0], [ry, h]]; // (z, y)
  const out = [];
  const x = w / 2;
  const inside = [0, h / 3, (-z + z + ry) / 3];
  const P = (px, [pz, py]) => [px, py, pz];
  tri(out, P(-x, poly[0]), P(-x, poly[1]), P(-x, poly[2]), inside);
  tri(out, P(x, poly[0]), P(x, poly[1]), P(x, poly[2]), inside);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    tri(out, P(-x, poly[i]), P(x, poly[i]), P(x, poly[j]), inside);
    tri(out, P(-x, poly[i]), P(x, poly[j]), P(-x, poly[j]), inside);
  }
  return centre(fromTris(out));
}

/** Convex hull of points ([[x,y,z]…] or Vector3[]). NOT centred: points stay where you put them. */
export function hull(points) {
  const pts = points.map((p) => (p.isVector3 ? p.clone() : V(p[0], p[1], p[2])));
  return flat(new ConvexGeometry(pts));
}

/** Lathe: profile [[r, y], …] bottom→top, n sides (flat face to +Z). Apex where r = 0. Centred. */
export function lathe(profile, n = 6, { sx = 1, sz = 1 } = {}) {
  const rings = profile.map(([r, y]) => ({ y, pts: ngon(n, r, sx, sz) }));
  return centre(loft(rings));
}

/**
 * Extrude a 2-D polygon by `depth`. axis 'z' (default): poly = [[x, y]…] in the x-y plane, extruded along z
 * (a cape panel / blade seen from the front). axis 'y': poly = [[x, z]…] on the ground plane, extruded up.
 * axis 'x': poly = [[z, y]…], extruded along x (ear / fin seen from the side). Concave polygons are fine. Centred.
 */
export function extrude(poly, depth, { axis = 'z' } = {}) {
  const pts2 = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  if (THREE.ShapeUtils.isClockWise(pts2)) pts2.reverse();
  const faces = THREE.ShapeUtils.triangulateShape(pts2, []);
  const out = [];
  const h = depth / 2;
  // build in a local frame: (u, v) = polygon coords, w = extrusion; map to xyz at the end
  const map = (u, v, w) => (axis === 'y' ? [u, w, v] : axis === 'x' ? [w, v, u] : [u, v, w]);
  const flip = axis === 'y' || axis === 'x'; // (u, v, w) → xyz is a reflection for these two mappings
  const push = (a, b, c) => { if (flip) out.push(...a, ...c, ...b); else out.push(...a, ...b, ...c); };
  for (const [a, b, c] of faces) {
    const A = pts2[a], B = pts2[b], C = pts2[c];
    push(map(A.x, A.y, h), map(B.x, B.y, h), map(C.x, C.y, h));   // front cap (+w), CCW
    push(map(A.x, A.y, -h), map(C.x, C.y, -h), map(B.x, B.y, -h)); // back cap
  }
  for (let i = 0; i < pts2.length; i++) {
    const P = pts2[i], Q = pts2[(i + 1) % pts2.length];
    // CCW polygon: outward side normal = (dy, -dx)
    push(map(P.x, P.y, -h), map(Q.x, Q.y, -h), map(Q.x, Q.y, h));
    push(map(P.x, P.y, -h), map(Q.x, Q.y, h), map(P.x, P.y, h));
  }
  return centre(fromTris(out));
}

/** Mirrored copy across x = 0 (winding reversed so normals stay outward). */
export function mirrorX(geo) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  for (let i = 0; i < p.count; i += 3) { // swap vertices 1 and 2 of every triangle
    const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  return flat(g);
}

/** Merge geometries (position only) into one non-indexed geometry. */
export function merge(...geos) {
  const out = [];
  for (const g0 of geos.flat()) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    out.push(...g.attributes.position.array);
  }
  return fromTris(out);
}

/** Transformed copy: at [x,y,z], rot [x,y,z] degrees (XYZ Euler), scale number|[x,y,z]. */
export function xf(geo, { at = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  const m = new THREE.Matrix4().compose(V(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot.map(THREE.MathUtils.degToRad))), V(...s));
  g.applyMatrix4(m);
  if (s[0] * s[1] * s[2] < 0) return flipWinding(g);
  return flat(g);
}

function flipWinding(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    p.setXYZ(i + 2, x, y, z);
  }
  return flat(g);
}

/**
 * Taper / bend modifier (capes, hair, tails, sleeves). Works along y from the top (t = 0, y = to) to the bottom
 * (t = 1, y = from); defaults to the geometry's own y extent. Per vertex at parameter t:
 *   x *= lerp(taper[0], taper[1], t)            (width)
 *   z *= lerp(taperZ[0], taperZ[1], t)          (depth, default 1)
 *   x += sign(x) · flare · t²                   (hem flares outwards)
 *   z += curl · t²  − bendArc                   (bend: the bottom swings back by `bend` degrees about the top edge)
 * Returns a new geometry with flat normals.
 */
export function bend(geo, { taper = [1, 1], taperZ = [1, 1], bend: deg = 0, flare = 0, curl = 0, from, to } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.computeBoundingBox();
  const y1 = to ?? g.boundingBox.max.y, y0 = from ?? g.boundingBox.min.y;
  const L = Math.max(1e-6, y1 - y0);
  const p = g.attributes.position;
  const ang = THREE.MathUtils.degToRad(deg);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = THREE.MathUtils.clamp((y1 - y) / L, 0, 1);
    x *= THREE.MathUtils.lerp(taper[0], taper[1], t);
    z *= THREE.MathUtils.lerp(taperZ[0], taperZ[1], t);
    x += Math.sign(x) * flare * t * t;
    z += curl * t * t;
    if (ang) { // rotate about the top edge (the x axis at y1, z 0) by ang·t: a progressive bend, + = bottom goes back (−Z)
      const a = ang * t, dy = y - y1, c = Math.cos(a), s = Math.sin(a);
      const nz = z * c + dy * s, ndy = -z * s + dy * c;
      z = nz; y = y1 + ndy;
    }
    p.setXYZ(i, x, y, z);
  }
  return flat(g);
}
