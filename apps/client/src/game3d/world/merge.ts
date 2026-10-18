// v3.1 stage: merge the town's STATIC kit meshes across pieces at build time (docs/perf-v3/stage.md §4.1, "the biggest
// remaining draw-call lever"). The vendor already merges each piece's kit triangles into one mesh per kit layer
// (src/town/kit.js Builder.build: solid / soft / glass), so a cottage is 2-3 draws; with ~16 buildings + props in view
// that is still ~50 kit meshes per pass (colour + normal + shadow). Here the static ones are re-merged ACROSS pieces,
// bucketed by
//   material (the shared kit material: same program) + design castShadow + receiveShadow + attribute layout
//   + (mode 'merge' only) a coarse spatial cell, so three's frustum culling still drops the far side of the town,
// into new meshes under the town root (they inherit its per-frame texel-snap offset). Pure three: no vendor import.
// Mode 'batch' (default, measured best: docs/perf-v3/stage.md §6) makes each bucket a THREE.BatchedMesh with one
// identity-matrix instance per source: one multi-draw per pass while three still culls (and front-to-back sorts) every
// source per pass, so no triangle is drawn that the separate meshes would not have drawn. The kit materials get the
// USE_BATCHING program variant (compiled by the stage warm-up like every other program; the vendor's world-position
// code reads modelMatrix only, which is right because the instance matrices are identity).
//
// What stays exactly the same:
//   - vertices are baked into ROOT space with the source's root-relative matrix (position, normal, and the cut-away's
//     aTownPart centroid / bottom, the same transform its vertex shader applies with modelMatrix); every other attribute
//     (tones, pattern, glow, aTownPiece) is copied verbatim, so the material sees the same world data per vertex;
//   - the SOURCES stay in their piece groups (Box3.setFromObject pick proxies / cut-away tops, the pieces' own apis keep
//     working on them) but leave every render pass: their layer mask is 0 (three tests layers in the colour, normal
//     and shadow passes alike) and they are never uploaded;
//   - runtime writes the vendor makes to a source (setLit / the street-lamp glass write aGlow and bump the attribute
//     version) are mirrored into the merged range each frame (`sync`, a version compare per attribute: ~µs);
//   - a source that is hidden, re-parented, moved, or whose geometry / material / attributes are swapped is EJECTED:
//     its merged range collapses to a degenerate point and the source renders itself again (never a frozen copy).
// The caller leaves out what is known to change: door pivots, the tower hands / timer face, the canopy fade targets,
// boards, life, the dais, interiors (game3d/vendor/town.ts mergeTownKit).
import * as THREE from 'three';

export interface MergeCandidate {
  mesh: THREE.Mesh;
  /** The design castShadow flag (before any per-frame shadow-caster culling). */
  cast: boolean;
}

export interface MergeOptions {
  /**
   * 'batch' (default): one THREE.BatchedMesh per bucket, every source one instance (identity matrix: the vertices are
   * baked): ONE multi-draw per pass, three culls and sorts the instances per pass (camera / shadow camera), so the
   * triangle count stays that of the visible sources. 'merge': one plain merged geometry per bucket and cell (draws
   * everything of its cell). Both bake the same vertices.
   */
  mode?: 'batch' | 'merge';
  /** Spatial cell edge (m, root space) of the 'merge' mode. Default 12. 'batch' buckets ignore cells. */
  cell?: number;
  /** A bucket needs at least this many sources to be merged (else its meshes stay as they are). Default 2. */
  minSources?: number;
  /** Name prefix of the merged meshes / group. */
  name?: string;
  /**
   * Float attributes (name -> itemSize) a source may lack: a missing one is written as zeros, which is what the shader
   * reads for an absent attribute (WebGL's generic attribute default), so such sources can share a bucket. Default
   * { aTownPiece: 1 } (the composer tags only cottage / tower meshes; 0 = "not a cottage", cutaway.js).
   */
  pad?: Record<string, number>;
  /**
   * Camera forward (world) the sources of a bucket are ordered along, front to back: three draws the separate meshes of
   * one material front to back by their bounding-sphere centres, so depth TIES (coplanar faces of two pieces, LessEqual)
   * resolve the same way inside the merged draw. Default: the town's gameplay camera (yaw 0, pitch 30 deg).
   */
  forward?: THREE.Vector3;
}

/** The view the shadow-caster cull tests against (the vendor's installShadowCull, town.js). */
export interface ShadowView {
  target: THREE.Vector3;
  yaw: number;
  pitch: number;
  viewHeight: number;
  aspect: number;
  sunDir: THREE.Vector3;
  margin?: number;
}

export interface MergedTown {
  readonly group: THREE.Group;
  readonly meshes: readonly THREE.Mesh[];
  /** Per frame: mirror vendor attribute writes, eject sources that changed. Cheap (no allocation). */
  sync(): void;
  /** Per frame: castShadow of each merged caster = its bounds or their ground shadow overlap the view. */
  cullShadows(v: ShadowView): void;
  /** A/B switch (debug): false = the sources render themselves again, the merged meshes are hidden. */
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  info(): { mode: 'batch' | 'merge'; sources: number; merged: number; buckets: number; kept: number; ejected: number; synced: number; casters: number; culled: number; byMaterial: Record<string, number>; refused: Record<string, number>; ejectLog: string[] };
  dispose(): void;
}

interface AttrRec {
  name: string;
  attr: THREE.BufferAttribute;
  version: number;
  out: THREE.BufferAttribute;
  kind: 0 | 1 | 2 | 3; // 0 verbatim, 1 position, 2 normal, 3 aTownPart
}

interface SourceRec {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  layerMask: number;
  target: THREE.Mesh;
  /** The BatchedMesh instance ('batch' mode), else -1. */
  instance: number;
  start: number;
  count: number;
  B: THREE.Matrix4;
  N: THREE.Matrix3;
  attrs: AttrRec[];
  chain: number[]; // indices into nodes (mesh .. up to, excluding, root)
  live: boolean;
}

interface NodeRec {
  o: THREE.Object3D;
  parent: THREE.Object3D | null;
  sig: Float64Array; // position, quaternion, scale (auto) or matrix (manual)
  visible: boolean;
}

const DEFAULT_OBR = THREE.Object3D.prototype.onBeforeRender;

function nodeSig(o: THREE.Object3D, out: Float64Array): void {
  if (o.matrixAutoUpdate) {
    out[0] = o.position.x;
    out[1] = o.position.y;
    out[2] = o.position.z;
    out[3] = o.quaternion.x;
    out[4] = o.quaternion.y;
    out[5] = o.quaternion.z;
    out[6] = o.quaternion.w;
    out[7] = o.scale.x;
    out[8] = o.scale.y;
    out[9] = o.scale.z;
    for (let i = 10; i < 16; i++) out[i] = 0;
  } else for (let i = 0; i < 16; i++) out[i] = o.matrix.elements[i]!;
}

function sigEquals(o: THREE.Object3D, s: Float64Array): boolean {
  if (o.matrixAutoUpdate)
    return (
      s[0] === o.position.x && s[1] === o.position.y && s[2] === o.position.z &&
      s[3] === o.quaternion.x && s[4] === o.quaternion.y && s[5] === o.quaternion.z && s[6] === o.quaternion.w &&
      s[7] === o.scale.x && s[8] === o.scale.y && s[9] === o.scale.z
    );
  const e = o.matrix.elements;
  for (let i = 0; i < 16; i++) if (s[i] !== e[i]) return false;
  return true;
}

/** Why a candidate cannot be merged (null = it can). */
export function unmergeable(mesh: THREE.Mesh, root: THREE.Object3D): string | null {
  const m = mesh as THREE.Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
  if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.isBatchedMesh) return 'kind';
  const g = mesh.geometry as THREE.BufferGeometry & { isInstancedBufferGeometry?: boolean };
  if (!g?.attributes?.position || g.isInstancedBufferGeometry) return 'geometry';
  if (g.index) return 'indexed';
  if (g.groups.length) return 'groups';
  if (Object.keys(g.morphAttributes).length) return 'morph';
  if (g.drawRange.start !== 0 || Number.isFinite(g.drawRange.count)) return 'drawRange';
  if (Array.isArray(mesh.material) || !mesh.material) return 'material';
  if (mesh.layers.mask !== 1) return 'layers';
  if (mesh.onBeforeRender !== DEFAULT_OBR || mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return 'hooks';
  if (mesh.children.length) return 'children';
  for (const [, a] of Object.entries(g.attributes)) {
    const ba = a as THREE.BufferAttribute & { isInterleavedBufferAttribute?: boolean; isGLBufferAttribute?: boolean };
    if (ba.isInterleavedBufferAttribute || ba.isGLBufferAttribute || !ba.array) return 'attribute';
  }
  if (g.attributes.tangent) return 'tangent';
  let o: THREE.Object3D | null = mesh;
  while (o && o !== root) {
    if (!o.visible) return 'hidden';
    o = o.parent;
  }
  if (o !== root) return 'outside';
  return null;
}

function attrSig(g: THREE.BufferGeometry, pad: Record<string, number>): string {
  const names = new Set([...Object.keys(g.attributes), ...Object.keys(pad)]);
  return [...names]
    .sort()
    .map((k) => {
      const a = g.attributes[k] as THREE.BufferAttribute | undefined;
      if (!a) return `${k}:${pad[k]}:0:Float32Array`;
      return `${k}:${a.itemSize}:${a.normalized ? 1 : 0}:${(a.array as { constructor: { name: string } }).constructor.name}`;
    })
    .join(',');
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Copy `count` items of `src` (source-local) into `out` at item `start`, applying the bake transform of `kind`. */
function copyAttr(kind: AttrRec['kind'], src: THREE.BufferAttribute, out: THREE.BufferAttribute, start: number, B: THREE.Matrix4, N: THREE.Matrix3): void {
  const n = src.count;
  const s = src.itemSize;
  const sa = src.array as ArrayLike<number> & { [i: number]: number };
  const oa = out.array as ArrayLike<number> & { [i: number]: number };
  if (kind === 0) {
    (oa as unknown as { set(a: ArrayLike<number>, o: number): void }).set(sa.length === n * s ? sa : Array.prototype.slice.call(sa, 0, n * s), start * s);
    return;
  }
  for (let i = 0; i < n; i++) {
    const k = i * s;
    const d = (start + i) * s;
    if (kind === 1) {
      _v.set(sa[k]!, sa[k + 1]!, sa[k + 2]!).applyMatrix4(B);
      oa[d] = _v.x;
      oa[d + 1] = _v.y;
      oa[d + 2] = _v.z;
      for (let c = 3; c < s; c++) oa[d + c] = sa[k + c]!;
    } else if (kind === 2) {
      _v.set(sa[k]!, sa[k + 1]!, sa[k + 2]!).applyNormalMatrix(N);
      oa[d] = _v.x;
      oa[d + 1] = _v.y;
      oa[d + 2] = _v.z;
      for (let c = 3; c < s; c++) oa[d + c] = sa[k + c]!;
    } else {
      // aTownPart (cutaway.js PART_VERT): xyz = the part centroid (a point), w = 2 + the part's bottom y (0 = no data);
      // the shader takes modelMatrix * (x, w - 2, z).y as the world bottom, so the baked w is 2 + (B * (x, w - 2, z)).y
      const x = sa[k]!, y = sa[k + 1]!, z = sa[k + 2]!, w = sa[k + 3]!;
      _v.set(x, y, z).applyMatrix4(B);
      oa[d] = _v.x;
      oa[d + 1] = _v.y;
      oa[d + 2] = _v.z;
      oa[d + 3] = w > 1.5 ? 2 + _w.set(x, w - 2, z).applyMatrix4(B).y : w;
    }
  }
}

/**
 * Merge `candidates` (meshes somewhere under `root`) into per-bucket meshes added to a new group under `root`.
 * Call it before the first render (programs and uploads happen once, for the merged meshes only).
 */
export function mergeStatic(root: THREE.Object3D, candidates: readonly MergeCandidate[], o: MergeOptions = {}): MergedTown {
  const batch = (o.mode ?? 'batch') === 'batch';
  const cell = batch ? Infinity : o.cell && o.cell > 0 ? o.cell : 12;
  const minSources = Math.max(2, o.minSources ?? 2);
  const name = o.name ?? 'ct-town-merged';
  const pad = o.pad ?? { aTownPiece: 1 };
  const group = new THREE.Group();
  group.name = name;
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();

  // ---- bucket
  const buckets = new Map<string, { cast: boolean; list: { mesh: THREE.Mesh; B: THREE.Matrix4; depth: number }[] }>();
  const fwd = (o.forward ?? new THREE.Vector3(0, -Math.sin(Math.PI / 6), -Math.cos(Math.PI / 6))).clone().normalize();
  const sph = new THREE.Sphere();
  const seen = new Set<THREE.Mesh>();
  const refused: Record<string, number> = {};
  const box = new THREE.Box3();
  const ctr = new THREE.Vector3();
  for (const c of candidates) {
    const mesh = c.mesh;
    if (seen.has(mesh)) continue;
    seen.add(mesh);
    const why = unmergeable(mesh, root);
    if (why) {
      refused[why] = (refused[why] ?? 0) + 1;
      continue;
    }
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox || g.boundingBox.isEmpty()) continue;
    const B = rootInv.clone().multiply(mesh.matrixWorld);
    box.copy(g.boundingBox).applyMatrix4(B).getCenter(ctr);
    if (!Number.isFinite(ctr.x) || !Number.isFinite(ctr.z)) continue;
    const mat = mesh.material as THREE.Material;
    const key = [mat.uuid, c.cast ? 1 : 0, mesh.receiveShadow ? 1 : 0, mesh.frustumCulled ? 1 : 0, mesh.renderOrder, attrSig(g, pad), batch ? 0 : Math.floor(ctr.x / cell), batch ? 0 : Math.floor(ctr.z / cell)].join('|');
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { cast: c.cast, list: [] }));
    if (!g.boundingSphere) g.computeBoundingSphere();
    sph.copy(g.boundingSphere!).applyMatrix4(B);
    b.list.push({ mesh, B, depth: sph.center.dot(fwd) });
  }

  // ---- build
  const meshes: THREE.Mesh[] = [];
  const sources: SourceRec[] = [];
  const nodes: NodeRec[] = [];
  const nodeIx = new Map<THREE.Object3D, number>();
  const byMaterial: Record<string, number> = {};
  let kept = 0;
  const chainOf = (mesh: THREE.Object3D): number[] => {
    const out: number[] = [];
    for (let n: THREE.Object3D | null = mesh; n && n !== root; n = n.parent) {
      let i = nodeIx.get(n);
      if (i === undefined) {
        const sig = new Float64Array(16);
        nodeSig(n, sig);
        i = nodes.push({ o: n, parent: n.parent, sig, visible: n.visible }) - 1;
        nodeIx.set(n, i);
      }
      out.push(i);
    }
    return out;
  };
  for (const [key, b] of buckets) {
    if (b.list.length < minSources) {
      kept += b.list.length;
      continue;
    }
    b.list.sort((p, q) => p.depth - q.depth);
    const first = b.list[0]!.mesh;
    let total = 0;
    for (const s of b.list) total += s.mesh.geometry.attributes.position!.count;
    const geo = new THREE.BufferGeometry();
    const names = [...new Set(b.list.flatMap((s) => Object.keys(s.mesh.geometry.attributes)))];
    const outs = new Map<string, THREE.BufferAttribute>();
    for (const n of names) {
      const a = b.list.map((s) => s.mesh.geometry.attributes[n] as THREE.BufferAttribute | undefined).find(Boolean)!;
      const Ctor = (a.array as unknown as { constructor: new (n: number) => THREE.TypedArray }).constructor;
      const out = new THREE.BufferAttribute(new Ctor(total * a.itemSize), a.itemSize, a.normalized); // zeros: a padded source's value
      geo.setAttribute(n, out);
      outs.set(n, out);
    }
    const mat = first.material as THREE.Material;
    const recs: SourceRec[] = [];
    let start = 0;
    for (const s of b.list) {
      const g = s.mesh.geometry;
      const count = g.attributes.position!.count;
      const N = new THREE.Matrix3().getNormalMatrix(s.B);
      const attrs: AttrRec[] = [];
      for (const n of names) {
        const a = g.attributes[n] as THREE.BufferAttribute | undefined;
        if (!a) continue; // padded (pad): stays zero
        const kind: AttrRec['kind'] = n === 'position' ? 1 : n === 'normal' ? 2 : n === 'aTownPart' && a.itemSize === 4 ? 3 : 0;
        const out = outs.get(n)!;
        copyAttr(kind, a, out, start, s.B, N);
        attrs.push({ name: n, attr: a, version: a.version, out, kind });
      }
      recs.push({ mesh: s.mesh, geometry: g, material: s.mesh.material as THREE.Material, layerMask: s.mesh.layers.mask, target: null as unknown as THREE.Mesh, instance: -1, start, count, B: s.B, N, attrs, chain: chainOf(s.mesh), live: true });
      start += count;
    }
    let target: THREE.Mesh;
    if (batch) {
      // one instance per source: its baked range of `geo` as its own geometry (copied into the batch), identity matrix
      const bm = new THREE.BatchedMesh(recs.length, total, 0, mat);
      bm.perObjectFrustumCulled = true;
      bm.sortObjects = true; // front to back per pass, as three orders the separate meshes of one material
      for (const r of recs) {
        const part = new THREE.BufferGeometry();
        for (const n of names) {
          const o = outs.get(n)!;
          const arr = (o.array as THREE.TypedArray).slice(r.start * o.itemSize, (r.start + r.count) * o.itemSize);
          part.setAttribute(n, new THREE.BufferAttribute(arr, o.itemSize, o.normalized));
        }
        const gid = bm.addGeometry(part);
        r.instance = bm.addInstance(gid);
        const range = bm.getGeometryRangeAt(gid)!;
        r.start = range.vertexStart;
        for (const a of r.attrs) a.out = bm.geometry.attributes[a.name] as THREE.BufferAttribute;
        part.dispose();
      }
      bm.computeBoundingBox();
      bm.computeBoundingSphere();
      target = bm;
    } else {
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      target = new THREE.Mesh(geo, mat);
    }
    for (const r of recs) {
      r.target = target;
      sources.push(r);
    }
    const parts = key.split('|');
    target.name = `${name}-${mat.name || 'mat'}${batch ? '-batch' : `-${parts[6]}_${parts[7]}`}${b.cast ? '-cast' : ''}`;
    target.castShadow = b.cast;
    target.receiveShadow = first.receiveShadow;
    target.frustumCulled = first.frustumCulled;
    target.renderOrder = first.renderOrder;
    target.matrixAutoUpdate = false; // identity in root space
    target.userData.ctMerged = { sources: b.list.length, cast: b.cast };
    group.add(target);
    meshes.push(target);
    byMaterial[mat.name || 'mat'] = (byMaterial[mat.name || 'mat'] ?? 0) + 1;
  }
  group.matrixAutoUpdate = false;
  if (meshes.length) root.add(group);
  group.updateMatrixWorld(true);
  for (const s of sources) s.mesh.layers.mask = 0;

  // ---- shadow cull bounds (root space; the root's own offset is a few mm)
  const boundsOf = (m: THREE.Mesh) => ((m as THREE.BatchedMesh).isBatchedMesh ? (m as THREE.BatchedMesh).boundingBox! : m.geometry.boundingBox!);
  const casters = meshes.filter((m) => m.castShadow).map((m) => ({ m, min: boundsOf(m).min.clone(), max: boundsOf(m).max.clone() }));

  let enabled = true;
  let ejected = 0;
  let synced = 0;
  let culled = 0;

  const ejectLog: string[] = [];
  const eject = (s: SourceRec, why: string) => {
    if (!s.live) return;
    s.live = false;
    ejected++;
    if (ejectLog.length < 16) ejectLog.push(`${s.mesh.parent?.name ?? '?'}/${s.mesh.name}: ${why}`);
    if (enabled) s.mesh.layers.mask = s.layerMask;
    if (s.instance >= 0) {
      (s.target as THREE.BatchedMesh).setVisibleAt(s.instance, false);
      return;
    }
    const pos = s.target.geometry.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const i0 = s.start * 3;
    for (let i = 1; i < s.count; i++) {
      a[i0 + i * 3] = a[i0]!;
      a[i0 + i * 3 + 1] = a[i0 + 1]!;
      a[i0 + i * 3 + 2] = a[i0 + 2]!;
    }
    pos.addUpdateRange(i0, s.count * 3);
    pos.needsUpdate = true;
  };

  // per-frame node state: 0 = unchecked, 1 = unchanged, 2 = changed / hidden, 3 = detached (parked: skip)
  const state = new Uint8Array(nodes.length);
  const R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3(), p = new THREE.Vector3(), sd = new THREE.Vector3();

  return {
    group,
    meshes,
    get enabled() {
      return enabled;
    },
    sync() {
      if (!sources.length || group.parent !== root) return; // parked (interior shown) or nothing merged
      state.fill(0);
      for (const s of sources) {
        if (!s.live) continue;
        let bad = false;
        let skip = false;
        for (const i of s.chain) {
          let st = state[i]!;
          if (st === 0) {
            const n = nodes[i]!;
            if (n.o.parent !== n.parent) st = n.o.parent === null ? 3 : 2;
            else st = n.o.visible === n.visible && sigEquals(n.o, n.sig) ? 1 : 2;
            state[i] = st;
          }
          if (st === 3) skip = true;
          else if (st === 2) bad = true;
        }
        if (skip) continue;
        const g = s.mesh.geometry;
        const why = bad ? 'moved/hidden' : g !== s.geometry ? 'geometry' : s.mesh.material !== s.material ? 'material' : g.index ? 'index' : s.mesh.layers.mask !== (enabled ? 0 : s.layerMask) ? 'layers' : null;
        if (why) {
          eject(s, why);
          continue;
        }
        for (const r of s.attrs) {
          const a = g.attributes[r.name];
          if (a !== r.attr || r.attr.count !== s.count) {
            eject(s, `attribute ${r.name}`);
            break;
          }
          if (r.attr.version !== r.version) {
            r.version = r.attr.version;
            copyAttr(r.kind, r.attr, r.out, s.start, s.B, s.N);
            r.out.addUpdateRange(s.start * r.out.itemSize, s.count * r.out.itemSize);
            r.out.needsUpdate = true;
            synced++;
          }
        }
      }
    },
    cullShadows(v) {
      const margin = v.margin ?? 1.5;
      R.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
      F.set(-Math.cos(v.pitch) * Math.sin(v.yaw), -Math.sin(v.pitch), -Math.cos(v.pitch) * Math.cos(v.yaw));
      U.crossVectors(R, F).normalize();
      sd.copy(v.sunDir).normalize();
      const k = Math.max(sd.y, 0.05);
      const hx = (v.viewHeight * v.aspect) / 2 + margin, hy = v.viewHeight / 2 + margin, tx = v.target.dot(R), ty = v.target.dot(U);
      culled = 0;
      for (const it of casters) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i < 16; i++) {
          p.set(i & 1 ? it.max.x : it.min.x, i & 2 ? it.max.y : it.min.y, i & 4 ? it.max.z : it.min.z);
          if (i & 8) p.addScaledVector(sd, -Math.max(p.y, 0) / k);
          const sx = p.dot(R) - tx, sy = p.dot(U) - ty;
          if (sx < x0) x0 = sx;
          if (sx > x1) x1 = sx;
          if (sy < y0) y0 = sy;
          if (sy > y1) y1 = sy;
        }
        const vis = x1 > -hx && x0 < hx && y1 > -hy && y0 < hy;
        it.m.castShadow = vis;
        if (!vis) culled++;
      }
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      group.visible = on;
      for (const s of sources) if (s.live) s.mesh.layers.mask = on ? 0 : s.layerMask;
    },
    info: () => ({ mode: batch ? 'batch' : 'merge', sources: sources.length, merged: meshes.length, buckets: buckets.size, kept, ejected, synced, casters: casters.length, culled, byMaterial: { ...byMaterial }, refused: { ...refused }, ejectLog: ejectLog.slice() }),
    dispose() {
      for (const m of meshes) {
        if ((m as THREE.BatchedMesh).isBatchedMesh) (m as THREE.BatchedMesh).dispose();
        else m.geometry.dispose();
      }
      group.removeFromParent();
      for (const s of sources) s.mesh.layers.mask = s.layerMask;
      sources.length = 0;
    },
  };
}
