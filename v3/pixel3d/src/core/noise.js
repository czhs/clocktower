// Deterministic noise + sampling utilities (no Math.random anywhere in scene code: captures must be reproducible).

/** Mulberry32 seeded RNG -> () => [0,1) */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal value noise in ~[0,1]. */
export function fbm2(x, y, { octaves = 4, lacunarity = 2, gain = 0.5, seed = 0 } = {}) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, y * freq, seed + i * 17);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/** 2D Poisson-disk sampling (Bridson) inside [x0,x0+w]x[z0,z0+h]. accept(x,z) can reject points. */
export function poissonDisk2D({ x0 = 0, z0 = 0, w, h, r, k = 20, seed = 1, accept = null, max = Infinity }) {
  const rand = rng(seed);
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [], active = [];
  const add = (x, z) => {
    const i = pts.length; pts.push([x, z]); active.push(i);
    grid[Math.floor((z - z0) / cell) * gw + Math.floor((x - x0) / cell)] = i;
  };
  add(x0 + rand() * w, z0 + rand() * h);
  while (active.length && pts.length < max) {
    const ai = Math.floor(rand() * active.length);
    const [px, pz] = pts[active[ai]];
    let found = false;
    for (let j = 0; j < k; j++) {
      const ang = rand() * Math.PI * 2, rad = r * (1 + rand());
      const x = px + Math.cos(ang) * rad, z = pz + Math.sin(ang) * rad;
      if (x < x0 || z < z0 || x >= x0 + w || z >= z0 + h) continue;
      const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
      let ok = true;
      for (let yy = Math.max(0, gz - 2); yy <= Math.min(gh - 1, gz + 2) && ok; yy++)
        for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
          const q = grid[yy * gw + xx];
          if (q >= 0) { const dx = pts[q][0] - x, dz = pts[q][1] - z; if (dx * dx + dz * dz < r * r) { ok = false; break; } }
        }
      if (ok) { add(x, z); found = true; break; }
    }
    if (!found) active.splice(ai, 1);
  }
  return accept ? pts.filter(([x, z]) => accept(x, z)) : pts;
}
