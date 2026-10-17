// Flowers (owner: grass agent). Small flower sprites that live INSIDE the grass instancing (same
// material, same far->near sort, so grass and flowers overlap correctly). docs/TECHNIQUES.md §5.5.
//
// Normal use: createGrass(engine, terrain, { flowers: { fraction: 0.04, tints: [...] } })  (on by default)
// Stand-alone: createFlowers(engine, terrain, opts) — a separate field containing only flowers (it is sorted
//   independently from the grass, so prefer the grass option when both cover the same ground).
//
// Flower options:
//   fraction: 0.04          share of grass points that become flowers (inside patches it is much higher)
//   tints: [{hex, weight}]  blossom colours (sRGB hex). Default: lilac 3 shades + yellow (shrine palette)
//   patchScale: 0.22        1/m frequency of the patch noise (bigger = smaller patches)
//   patchThreshold: auto    fbm level above which flowers grow (auto-picked to hit `fraction`)
//   mix: 0.12               chance a flower ignores its clump colour (clumps are mostly one colour)
//   bump: true              blossoms are "bumped a cut" (stay bright in shade, Holland accent)
//   seed
// Sprite: 1-px stem (ground tones at the root, like a grass blade) + 2×2 / plus / 3×2 blossom with a
// highlight pixel. Blossom tones: hi = tint, mid = tint·0.85, sh = tint·(0.50, 0.52, 0.78).
// Lilac petals (tints with b > g) are NOT multiplied by a warm sun ramp (golden hour would turn them salmon /
// coral): under warm light the lit petal becomes the next lighter lilac (tint·1.15, at the ramp's max channel)
// and the mid tone keeps its brightness but drops the warm hue (FLOWER_LIGHT_GLSL). Neutral / cool ramps
// (noon, night) are unchanged; yellow / white tints always follow the ramp.
import * as THREE from 'three';

/**
 * GLSL used by the grass material's `tones` hook. flowerTones(tint, ramp, lit) returns the tone to feed the
 * ramp so that tone·ramp is the petal colour wanted under that light.
 */
export const FLOWER_LIGHT_GLSL = /* glsl */`
  float flWarm(vec3 ramp) { return clamp((ramp.r - ramp.b) * 2.0, 0.0, 1.0); }
  vec3 flowerTone(vec3 tone, vec3 tint, vec3 ramp, bool lit) {
    float w = flWarm(ramp) * step(tint.g, tint.b);               // warm light on a lilac/violet petal
    vec3 want = lit ? min(tone * 1.15 + 0.02, vec3(1.0)) * max(ramp.r, max(ramp.g, ramp.b))
                    : tone * dot(ramp, vec3(0.2126, 0.7152, 0.0722));
    return mix(tone, want / max(ramp, vec3(1e-3)), w);
  }`;
import { rng, fbm2, noise2 } from '../core/noise.js';
import { createGrass } from './grass.js';

export const FLOWER_TINTS = {
  shrine: [{ hex: '#A875D7', weight: 0.3 }, { hex: '#CA91E3', weight: 0.25 }, { hex: '#DC9EFF', weight: 0.15 }, { hex: '#E6D36A', weight: 0.3 }],
  pond: [{ hex: '#A875D7', weight: 0.2 }, { hex: '#CA91E3', weight: 0.2 }, { hex: '#E6D36A', weight: 0.35 }, { hex: '#EDEBDA', weight: 0.25 }],
  glade: [{ hex: '#A875D7', weight: 0.6 }, { hex: '#CA91E3', weight: 0.4 }],
};

// blossom shapes, (x, y) relative to the stem top; kind 1 = main, 2 = highlight
const BLOSSOMS = [
  [[0, 1, 1], [1, 1, 1], [0, 2, 2], [1, 2, 1]],                         // 2×2
  [[0, 1, 1], [-1, 2, 1], [0, 2, 2], [1, 2, 1], [0, 3, 1]],              // plus
  [[-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 2], [-1, 2, 1], [1, 2, 1]], // 3×2
  [[0, 1, 1], [0, 2, 2]],                                               // bud (1×2)
];

/** Flower sprites in the grass atlas stroke format (see grass.js buildAtlas). */
export function flowerSprites(seed = 7) {
  const rand = rng(seed * 613 + 1);
  const out = [];
  const one = (x0, stemH, shape, lean) => {
    const stem = { h: stemH + 2, pts: [] };
    let x = x0;
    for (let y = 0; y < stemH; y++) { if (y === 2 && lean) x += lean; stem.pts.push([x, y, 0]); }
    const blossom = { h: stemH + 2, pts: BLOSSOMS[shape].map(([bx, by, k]) => [x + bx, stemH - 1 + by, k]) };
    return [stem, blossom];
  };
  for (let v = 0; v < 6; v++) {
    const strokes = [];
    const shape = v % 4;
    strokes.push(...one(0, 2 + Math.floor(rand() * 3), shape, v % 2 ? 0 : (rand() < 0.5 ? -1 : 1)));
    if (v >= 3) strokes.push(...one(v % 2 ? 3 : -3, 1 + Math.floor(rand() * 2), 3 - (v % 3), 0)); // a second, shorter flower
    // a couple of grass blades around the stem so the flower sits IN the grass
    for (const bx of [-1, 1]) {
      const h = 2 + Math.floor(rand() * 3), pts = [];
      for (let y = 0; y < h; y++) pts.push([bx + (y > 2 ? bx : 0), y, 0]);
      strokes.push({ h, pts });
    }
    out.push(strokes);
  }
  return out;
}

/**
 * Choose which points become flowers: clustered in fbm patches, each patch mostly one colour.
 * Returns an array (same length as pts) of linear THREE.Color tints or null.
 */
export function pickFlowers(pts, opts = {}, seed = 1) {
  const {
    fraction = 0.04, tints = FLOWER_TINTS.shrine, patchScale = 0.22, patchThreshold = null, mix = 0.12,
    seed: fseed = seed,
  } = opts;
  if (!pts.length || fraction <= 0) return pts.map(() => null);
  const cols = tints.map((t) => new THREE.Color(t.hex ?? t));
  const wts = tints.map((t) => t.weight ?? 1);
  const wsum = wts.reduce((a, b) => a + b, 0);
  const pickTint = (u) => { let a = u * wsum; for (let i = 0; i < cols.length; i++) { a -= wts[i]; if (a <= 0) return i; } return cols.length - 1; };
  const s = fseed * 7 + 101;
  const pn = pts.map(([x, z]) => fbm2(x * patchScale + 50, z * patchScale + 50, { seed: s, octaves: 3 }));
  // patches (fbm) cover ~2.4×fraction of the grass; inside them flowers grow in small clumps (≈0.5 m)
  let thr = patchThreshold;
  if (thr === null) {
    const sorted = Float32Array.from(pn).sort();
    thr = sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - fraction * 2.4))))];
  }
  const rand = rng(s * 3 + 9);
  return pts.map(([x, z], i) => {
    const u = rand(), v = rand(), w = rand();
    if (pn[i] < thr) return null;
    const depth = Math.min(1, (pn[i] - thr) / 0.06);              // denser toward the patch centre
    const clump = noise2(x * 1.7 + 3.1, z * 1.7 - 7.7, s + 11);   // small clumps inside the patch
    if (clump < 0.62 - 0.22 * depth || u > 0.85) return null;
    // one colour per clump (mostly): coherent noise picks the tint, `mix` adds strays
    const cu = noise2(x * 0.9 - 2.0, z * 0.9 + 5.0, s + 23);
    const k = v < mix ? pickTint(w) : pickTint(Math.min(0.999, Math.max(0, (cu - 0.25) / 0.5)));
    return cols[k];
  });
}

/** Stand-alone flower field (only flowers). Same options as createGrass plus `flowers` options. */
export function createFlowers(engine, terrain, opts = {}) {
  const { flowers = {}, ...rest } = opts;
  return createGrass(engine, terrain, { ...rest, flowers: { ...flowers, ...pickOnly(opts) }, only: 'flowers' });
}

function pickOnly(opts) {
  const o = {};
  for (const k of ['fraction', 'tints', 'patchScale', 'patchThreshold', 'mix', 'bump']) if (opts[k] !== undefined) o[k] = opts[k];
  return o;
}
