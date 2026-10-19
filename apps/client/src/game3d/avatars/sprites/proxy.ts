// v3.3 sprites: the shadow-only proxy of a baked character (pure; unit-tested in avatars.sprites.test.ts).
//
// The prototype cast the sprite's silhouette from a vertical plane turned to the sun, most of the pixel difference to
// the rig. The ship version casts from a tiny rigid-skinned copy of the rig instead: vertex clustering of the bind
// mesh (per dominant bone, on a grid of `cell` m), so the proxy keeps the figure's volume (hats, brims, props, a
// raised arm) at ~1-3 % of the triangles. Each drawing's bone matrices (root frame) are baked next to the atlas; the
// proxy is drawn only into the sun's shadow map (its own render layer), posed per frame with the displayed drawing
// and facing, so the shadow follows the real sun direction and elevation at any time of day.

export interface ProxyInput {
  /** xyz per vertex (bind space = geometry space). */
  position: ArrayLike<number>;
  /** 4 bone indices + 4 weights per vertex. */
  skinIndex: ArrayLike<number>;
  skinWeight: ArrayLike<number>;
  /** Vertices to use (the live part: the shared ghost's extra parts start at charGhostFrom). */
  count: number;
  /** Triangle indices (indexed geometry) or null (non-indexed: every 3 vertices). */
  index: ArrayLike<number> | null;
}

export interface ProxyMesh {
  /** xyz per proxy vertex (bind space). */
  position: Float32Array;
  /** Rigid bone index per proxy vertex. */
  bone: Uint16Array;
  /** Triangles (indices into the proxy vertices). */
  index: Uint16Array;
}

/** Dominant bone of vertex i. */
function dominant(si: ArrayLike<number>, sw: ArrayLike<number>, i: number): number {
  let b = si[i * 4]!;
  let w = sw[i * 4]!;
  for (let k = 1; k < 4; k++) {
    const wk = sw[i * 4 + k]!;
    if (wk > w) {
      w = wk;
      b = si[i * 4 + k]!;
    }
  }
  return b;
}

/**
 * Cluster the mesh (a generator: yields every `chunk` vertices / triangles so a bake can spread it over frames).
 * Returns null when the proxy would not fit 16-bit indices (the sprite then keeps the plane caster).
 */
export function* clusterProxy(m: ProxyInput, cell: number, chunk = 4096): Generator<void, ProxyMesh | null, unknown> {
  const inv = 1 / Math.max(1e-4, cell);
  const P = m.position;
  const ids = new Map<number, number>();
  const sum: number[] = [];
  const bones: number[] = [];
  const cnt: number[] = [];
  const of = new Int32Array(m.count);
  for (let i = 0; i < m.count; i++) {
    const b = dominant(m.skinIndex, m.skinWeight, i);
    const ix = Math.floor(P[i * 3]! * inv) + 512;
    const iy = Math.floor(P[i * 3 + 1]! * inv) + 512;
    const iz = Math.floor(P[i * 3 + 2]! * inv) + 512;
    const key = ((b * 1024 + (ix & 1023)) * 1024 + (iy & 1023)) * 1024 + (iz & 1023);
    let c = ids.get(key);
    if (c === undefined) {
      c = bones.length;
      ids.set(key, c);
      bones.push(b);
      cnt.push(0);
      sum.push(0, 0, 0);
    }
    sum[c * 3] = sum[c * 3]! + P[i * 3]!;
    sum[c * 3 + 1] = sum[c * 3 + 1]! + P[i * 3 + 1]!;
    sum[c * 3 + 2] = sum[c * 3 + 2]! + P[i * 3 + 2]!;
    cnt[c] = cnt[c]! + 1;
    of[i] = c;
    if (i % chunk === chunk - 1) yield;
  }
  if (bones.length > 65535) return null;
  const tris: number[] = [];
  const seen = new Set<number>();
  const nTri = m.index ? Math.floor(m.index.length / 3) : Math.floor(m.count / 3);
  for (let t = 0; t < nTri; t++) {
    const i0 = m.index ? m.index[t * 3]! : t * 3;
    const i1 = m.index ? m.index[t * 3 + 1]! : t * 3 + 1;
    const i2 = m.index ? m.index[t * 3 + 2]! : t * 3 + 2;
    if (i0 >= m.count || i1 >= m.count || i2 >= m.count) continue;
    const a = of[i0]!;
    const b = of[i1]!;
    const c = of[i2]!;
    if (a === b || b === c || a === c) continue;
    // one triangle per cluster triple (either winding: the proxy is drawn double-sided)
    const lo = Math.min(a, b, c);
    const hi = Math.max(a, b, c);
    const mid = a + b + c - lo - hi;
    const k = (lo * 65536 + mid) * 65536 + hi;
    if (seen.has(k)) continue;
    seen.add(k);
    tris.push(a, b, c);
    if (t % chunk === chunk - 1) yield;
  }
  const n = bones.length;
  const position = new Float32Array(n * 3);
  for (let c = 0; c < n; c++) {
    const k = 1 / cnt[c]!;
    position[c * 3] = sum[c * 3]! * k;
    position[c * 3 + 1] = sum[c * 3 + 1]! * k;
    position[c * 3 + 2] = sum[c * 3 + 2]! * k;
  }
  return { position, bone: Uint16Array.from(bones), index: Uint16Array.from(tris) };
}

/** Run a generator to its end synchronously (tests, and a bake that need not be sliced). */
export function runToEnd<T>(g: Generator<unknown, T, unknown>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}
