// v3.1 stage: the static kit merge (world/merge.ts) with three-only fixtures (no WebGL, no built town): baked
// root-space vertices (position / normal / the cut-away's aTownPart), buckets by material / caster flag / cell, the
// sources' layer mask, mirrored vendor attribute writes (setLit glass), ejection of a source that is hidden, moved or
// swapped, the park (detached branches) and the A/B switch.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mergeStatic, unmergeable } from '../../src/game3d/world/merge';

const kitMat = (name: string) => {
  const m = new THREE.MeshLambertMaterial();
  m.name = name;
  return m;
};

/** A non-indexed kit-like box: position, normal, color, aGlow (4), aTownPart (4: centroid + 2 + bottom y), aTownPiece. */
function kitMesh(mat: THREE.Material, tag = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(1, 2, 1).toNonIndexed();
  g.clearGroups(); // the kit Builder's geometry has no material groups
  g.translate(0, 1, 0);
  const n = g.attributes.position!.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(Float32Array.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? 1 : 0.2)), 4));
  g.setAttribute('aTownPart', new THREE.Float32BufferAttribute(Float32Array.from({ length: n * 4 }, (_, i) => [0, 1, 0, 2][i % 4]!), 4));
  g.setAttribute('aTownPiece', new THREE.Float32BufferAttribute(new Float32Array(n).fill(tag), 1));
  return new THREE.Mesh(g, mat);
}

function town() {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.set(0.0047, 0, 0.0071); // the vendor's ANTI_TIE offset
  scene.add(root);
  return { scene, root };
}

/** World position of vertex i as the shader computes it: modelMatrix * position. */
const worldVert = (m: THREE.Mesh, i: number) => new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute, i).applyMatrix4(m.matrixWorld);

describe('mergeStatic: bake + buckets', () => {
  it('merges same-material meshes of one cell into one mesh with identical world vertices; sources leave every pass', () => {
    const { scene, root } = town();
    const solid = kitMat('town-kit-solid');
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.makeRotationY(0.4).setPosition(3, 0, 2); // a layout-delta '-placed' holder
    root.add(holder);
    const a = kitMesh(solid, 3);
    a.position.set(1, 0.5, 1);
    a.rotation.y = 0.7;
    holder.add(a);
    const b = kitMesh(solid, 4);
    b.position.set(5, 0, 4);
    root.add(b);
    scene.updateMatrixWorld(true);
    const want = [worldVert(a, 0), worldVert(a, 7), worldVert(b, 0), worldVert(b, 11)];
    const merged = mergeStatic(root, [{ mesh: a, cast: true }, { mesh: b, cast: true }], { mode: 'merge', cell: 12 });
    expect(merged.meshes).toHaveLength(1);
    const m = merged.meshes[0]!;
    expect(m.parent?.parent).toBe(root);
    expect(m.material).toBe(solid);
    expect(m.castShadow).toBe(true);
    scene.updateMatrixWorld(true);
    const n = a.geometry.attributes.position!.count; // a and b are the same box: same count
    // sources are ordered front to back along the gameplay camera (b, at larger world z, is nearer): find a's range
    const oa = worldVert(m, 0).distanceTo(want[0]!) < 1e-5 ? 0 : n;
    const ob = n - oa;
    const got = [worldVert(m, oa), worldVert(m, oa + 7), worldVert(m, ob), worldVert(m, ob + 11)];
    got.forEach((v, i) => expect(v.distanceTo(want[i]!)).toBeLessThan(1e-5));
    // per-vertex data copied verbatim (the cottage tag), normals rotated like mat3(modelMatrix) * normal
    expect((m.geometry.attributes.aTownPiece as THREE.BufferAttribute).getX(oa)).toBe(3);
    expect((m.geometry.attributes.aTownPiece as THREE.BufferAttribute).getX(ob)).toBe(4);
    const nWant = new THREE.Vector3().fromBufferAttribute(a.geometry.attributes.normal as THREE.BufferAttribute, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(a.matrixWorld)).normalize();
    const nGot = new THREE.Vector3().fromBufferAttribute(m.geometry.attributes.normal as THREE.BufferAttribute, oa).applyMatrix3(new THREE.Matrix3().setFromMatrix4(m.matrixWorld)).normalize();
    expect(nGot.distanceTo(nWant)).toBeLessThan(1e-5);
    // aTownPart: the world centroid and the world bottom (cutaway.js PART_VERT) are unchanged
    const P = (mesh: THREE.Mesh, i: number) => {
      const t = mesh.geometry.attributes.aTownPart as THREE.BufferAttribute;
      const c = new THREE.Vector3(t.getX(i), t.getY(i), t.getZ(i)).applyMatrix4(mesh.matrixWorld);
      const bot = new THREE.Vector3(t.getX(i), t.getW(i) - 2, t.getZ(i)).applyMatrix4(mesh.matrixWorld).y;
      return [c.x, c.y, c.z, bot];
    };
    P(m, oa).forEach((v, i) => expect(v).toBeCloseTo(P(a, 0)[i]!, 5));
    P(m, ob).forEach((v, i) => expect(v).toBeCloseTo(P(b, 0)[i]!, 5));
    // sources stay in their groups (bounds readers) but render nowhere
    expect(a.parent).toBe(holder);
    expect(a.layers.mask).toBe(0);
    expect(b.layers.mask).toBe(0);
    expect(new THREE.Box3().setFromObject(holder).isEmpty()).toBe(false);
    expect(merged.info()).toMatchObject({ sources: 2, merged: 1, kept: 0, ejected: 0 });
  });

  it('buckets by material, caster flag and cell; a lone mesh in its bucket is left alone', () => {
    const { root } = town();
    const solid = kitMat('town-kit-solid');
    const soft = kitMat('town-kit-soft');
    const at = (mat: THREE.Material, x: number, z: number) => {
      const m = kitMesh(mat);
      m.position.set(x, 0, z);
      root.add(m);
      return m;
    };
    const s1 = at(solid, 1, 1), s2 = at(solid, 2, 2), s3 = at(solid, 3, 3); // cell 0,0
    const f1 = at(soft, 1, 1), f2 = at(soft, 4, 1); // cell 0,0, soft
    const far1 = at(solid, 30, 1), far2 = at(solid, 31, 2); // cell 2,0
    const lone = at(solid, 30, 30); // cell 2,2: alone
    const merged = mergeStatic(root, [
      { mesh: s1, cast: true }, { mesh: s2, cast: true }, { mesh: s3, cast: false },
      { mesh: f1, cast: false }, { mesh: f2, cast: false },
      { mesh: far1, cast: true }, { mesh: far2, cast: true }, { mesh: lone, cast: true },
    ], { mode: 'merge', cell: 12 });
    // s1+s2 (cast), f1+f2, far1+far2; s3 (no-cast) and lone stay
    expect(merged.meshes).toHaveLength(3);
    expect(merged.info()).toMatchObject({ sources: 6, kept: 2, casters: 2 });
    expect(s3.layers.mask).toBe(1);
    expect(lone.layers.mask).toBe(1);
    expect(merged.info().byMaterial).toEqual({ 'town-kit-solid': 2, 'town-kit-soft': 1 });
  });

  it('pads a missing aTownPiece with zeros (props + cottages share a bucket) and orders sources front to back', () => {
    const { root } = town();
    const solid = kitMat('town-kit-solid');
    const back = kitMesh(solid, 5); // a cottage, further from the camera (smaller z)
    back.position.set(2, 0, 1);
    const front = kitMesh(solid, 0);
    front.geometry.deleteAttribute('aTownPiece'); // a prop: the composer tags only cottages / the tower
    front.position.set(2, 0, 6);
    root.add(back, front);
    const merged = mergeStatic(root, [{ mesh: back, cast: true }, { mesh: front, cast: true }], { mode: 'merge' });
    expect(merged.meshes).toHaveLength(1);
    const tag = merged.meshes[0]!.geometry.attributes.aTownPiece as THREE.BufferAttribute;
    const n = back.geometry.attributes.position!.count;
    // the front prop first (drawn first, as three's front-to-back sort did), its tag 0; then the cottage's 5
    expect(tag.getX(0)).toBe(0);
    expect(tag.getX(n)).toBe(5);
    const p0 = new THREE.Vector3().fromBufferAttribute(merged.meshes[0]!.geometry.attributes.position as THREE.BufferAttribute, 0);
    expect(p0.z).toBeGreaterThan(5);
  });

  it('refuses indexed, hidden, hooked or detached meshes', () => {
    const { root } = town();
    const mat = kitMat('town-kit-solid');
    const idx = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    root.add(idx);
    expect(unmergeable(idx, root)).toBe('indexed');
    const hid = kitMesh(mat);
    const g = new THREE.Group();
    g.visible = false;
    g.add(hid);
    root.add(g);
    expect(unmergeable(hid, root)).toBe('hidden');
    const hooked = kitMesh(mat);
    hooked.onBeforeRender = () => undefined;
    root.add(hooked);
    expect(unmergeable(hooked, root)).toBe('hooks');
    expect(unmergeable(kitMesh(mat), root)).toBe('outside');
    const ok = kitMesh(mat);
    root.add(ok);
    expect(unmergeable(ok, root)).toBeNull();
  });
});

describe('mergeStatic: runtime', () => {
  const pair = () => {
    const t = town();
    const glass = kitMat('town-kit-glass');
    const piece = new THREE.Group();
    t.root.add(piece);
    const a = kitMesh(glass);
    a.position.set(1, 0, 1);
    const b = kitMesh(glass);
    b.position.set(3, 0, 1);
    piece.add(a, b);
    const merged = mergeStatic(t.root, [{ mesh: a, cast: false }, { mesh: b, cast: false }], { mode: 'merge' });
    return { ...t, piece, a, b, merged, m: merged.meshes[0]! };
  };

  it('mirrors a vendor attribute write (setLit glass: aGlow + needsUpdate) into the merged range', () => {
    const { a, b, merged, m } = pair();
    const n = a.geometry.attributes.position!.count;
    const ga = b.geometry.attributes.aGlow as THREE.BufferAttribute;
    for (let i = 0; i < ga.count; i++) ga.setW(i, 0);
    ga.needsUpdate = true;
    const out = m.geometry.attributes.aGlow as THREE.BufferAttribute;
    expect(out.getW(n)).toBe(1);
    const v0 = out.version;
    merged.sync();
    expect(out.getW(n)).toBe(0);
    expect(out.getW(0)).toBe(1); // a untouched
    expect(out.version).toBeGreaterThan(v0);
    expect(out.updateRanges).toEqual([{ start: n * 4, count: n * 4 }]);
    expect(merged.info().synced).toBe(1);
    merged.sync(); // nothing new
    expect(merged.info().synced).toBe(1);
  });

  it('ejects a source that is hidden or moved: its range collapses, it renders itself again', () => {
    const { a, b, merged, m } = pair();
    const n = a.geometry.attributes.position!.count;
    a.visible = false;
    merged.sync();
    expect(merged.info().ejected).toBe(1);
    expect(a.layers.mask).toBe(1);
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 1; i < n; i++) expect([pos.getX(i), pos.getY(i), pos.getZ(i)]).toEqual([pos.getX(0), pos.getY(0), pos.getZ(0)]);
    const bVerts = new Set(Array.from({ length: n }, (_, i) => `${pos.getX(n + i)},${pos.getY(n + i)},${pos.getZ(n + i)}`));
    expect(bVerts.size).toBe(8); // b intact: its 8 box corners
    b.rotation.y = 0.1; // b moves
    merged.sync();
    expect(merged.info().ejected).toBe(2);
    expect(b.layers.mask).toBe(1);
  });

  it('a parked branch (interior shown: detached from the root) is not ejected; nor is anything while the merge is parked', () => {
    const { root, piece, merged, a } = pair();
    root.remove(piece);
    merged.sync();
    expect(merged.info().ejected).toBe(0);
    root.remove(merged.group);
    a.visible = false;
    merged.sync();
    expect(merged.info().ejected).toBe(0);
    root.add(piece, merged.group);
    a.visible = true;
    merged.sync();
    expect(merged.info().ejected).toBe(0);
    expect(a.layers.mask).toBe(0);
  });

  it('setEnabled(false) shows the sources and hides the merge (A/B), and back', () => {
    const { a, b, merged } = pair();
    merged.setEnabled(false);
    expect(merged.group.visible).toBe(false);
    expect([a.layers.mask, b.layers.mask]).toEqual([1, 1]);
    merged.sync();
    expect(merged.info().ejected).toBe(0);
    merged.setEnabled(true);
    expect(merged.group.visible).toBe(true);
    expect([a.layers.mask, b.layers.mask]).toEqual([0, 0]);
    merged.dispose();
    expect([a.layers.mask, b.layers.mask]).toEqual([1, 1]);
    expect(merged.group.parent).toBeNull();
  });

  it('cull: a merged caster casts only when its bounds or ground shadow reach the view', () => {
    const { root } = town();
    const mat = kitMat('town-kit-solid');
    const add = (x: number) => {
      const m = kitMesh(mat);
      m.position.set(x, 0, 0);
      root.add(m);
      return m;
    };
    const near = [add(1), add(2)];
    const far = [add(100), add(101)];
    const merged = mergeStatic(root, [...near, ...far].map((mesh) => ({ mesh, cast: true })), { mode: 'merge', cell: 12 });
    expect(merged.meshes).toHaveLength(2);
    const view = { target: new THREE.Vector3(1, 0, 0), yaw: 0, pitch: Math.PI / 6, viewHeight: 12, aspect: 16 / 9, sunDir: new THREE.Vector3(0.3, 1, 0.2) };
    merged.cull(view);
    const byX = [...merged.meshes].sort((p, q) => p.geometry.boundingBox!.min.x - q.geometry.boundingBox!.min.x);
    expect(byX.map((m) => m.castShadow)).toEqual([true, false]);
    expect(merged.info().culled).toBe(1);
  });
});

describe('mergeStatic: batch mode (default)', () => {
  it('one BatchedMesh per material / caster flag, one identity instance per source, baked vertices in its ranges', () => {
    const { scene, root } = town();
    const solid = kitMat('town-kit-solid');
    const glass = kitMat('town-kit-glass');
    const at = (mat: THREE.Material, x: number, z: number, ry = 0) => {
      const m = kitMesh(mat, 2);
      m.position.set(x, 0, z);
      m.rotation.y = ry;
      root.add(m);
      return m;
    };
    const s1 = at(solid, 1, 1, 0.3), s2 = at(solid, 30, 25), g1 = at(glass, 2, 2), g2 = at(glass, 40, 3);
    scene.updateMatrixWorld(true);
    const want = worldVert(s2, 5);
    const merged = mergeStatic(root, [s1, s2, g1, g2].map((mesh) => ({ mesh, cast: mesh.material === solid })));
    expect(merged.meshes).toHaveLength(2); // cells are ignored: per-instance culling does that job
    const bm = merged.meshes.find((m) => m.material === solid) as THREE.BatchedMesh;
    expect(bm.isBatchedMesh).toBe(true);
    expect(bm.instanceCount).toBe(2);
    expect(bm.castShadow).toBe(true);
    expect(bm.perObjectFrustumCulled).toBe(false); // cull 'view' (default): one cull per frame, not per pass
    const m4 = new THREE.Matrix4();
    expect(bm.getMatrixAt(0, m4).equals(new THREE.Matrix4())).toBe(true);
    // s2 is the nearer one (larger z): sorted first, but find its range by position
    const pos = bm.geometry.attributes.position as THREE.BufferAttribute;
    scene.updateMatrixWorld(true);
    let best = Infinity;
    for (let i = 0; i < pos.count; i++) best = Math.min(best, new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(bm.matrixWorld).distanceTo(want));
    expect(best).toBeLessThan(1e-5);
    expect([s1.layers.mask, s2.layers.mask, g1.layers.mask, g2.layers.mask]).toEqual([0, 0, 0, 0]);
    expect(merged.info()).toMatchObject({ mode: 'batch', sources: 4, merged: 2, ejected: 0 });
  });

  it('mirrors glass writes into the batch and ejects by hiding the instance', () => {
    const { root } = town();
    const glass = kitMat('town-kit-glass');
    const a = kitMesh(glass);
    const b = kitMesh(glass);
    a.position.set(1, 0, 1);
    b.position.set(5, 0, 1);
    root.add(a, b);
    const merged = mergeStatic(root, [{ mesh: a, cast: false }, { mesh: b, cast: false }]);
    const bm = merged.meshes[0] as THREE.BatchedMesh;
    const out = bm.geometry.attributes.aGlow as THREE.BufferAttribute;
    const ga = a.geometry.attributes.aGlow as THREE.BufferAttribute;
    for (let i = 0; i < ga.count; i++) ga.setW(i, 0);
    ga.needsUpdate = true;
    const lit = () => Array.from({ length: out.count }, (_, i) => out.getW(i)).filter((w) => w === 1).length;
    expect(lit()).toBe(2 * ga.count);
    merged.sync();
    expect(lit()).toBe(ga.count); // only b's range still lit
    expect(merged.info().synced).toBe(1);
    b.visible = false;
    merged.sync();
    expect(b.layers.mask).toBe(1);
    expect([bm.getVisibleAt(0), bm.getVisibleAt(1)].filter(Boolean)).toHaveLength(1);
    merged.dispose();
  });

  it("cull 'view': one cull per frame shows an instance when its bounds, shadow or reflection reach the view", () => {
    const { root } = town();
    const mat = kitMat('town-kit-solid');
    const add = (x: number, z: number) => {
      const m = kitMesh(mat);
      m.position.set(x, 0, z);
      root.add(m);
      return m;
    };
    const near = add(1, 0), far = add(100, 0), north = add(1, -11); // north: 2 m tall, just above the view top
    const merged = mergeStatic(root, [near, far, north].map((mesh) => ({ mesh, cast: true })));
    const bm = merged.meshes[0] as THREE.BatchedMesh;
    expect(bm.perObjectFrustumCulled).toBe(false);
    expect(bm.sortObjects).toBe(false);
    const view = { target: new THREE.Vector3(1, 0, 0), yaw: 0, pitch: Math.PI / 6, viewHeight: 12, aspect: 16 / 9, sunDir: new THREE.Vector3(0, 1, 0), margin: 0 };
    merged.cull(view);
    const shownAt = (mesh: THREE.Mesh) => {
      // instance ids follow the front-to-back order: find the instance whose geometry bounds contain the mesh's x / z
      for (let i = 0; i < bm.instanceCount; i++) {
        const b = bm.getBoundingBoxAt(bm.getGeometryIdAt(i), new THREE.Box3())!;
        if (b.containsPoint(new THREE.Vector3(mesh.position.x, 1, mesh.position.z))) return bm.getVisibleAt(i);
      }
      throw new Error('instance not found');
    };
    expect(shownAt(near)).toBe(true);
    expect(shownAt(far)).toBe(false);
    // its bounds are above the view's top edge, but its water reflection (y mirrored) reaches into the view
    expect(shownAt(north)).toBe(true);
    expect(merged.info().culled).toBe(1);
  });
});
