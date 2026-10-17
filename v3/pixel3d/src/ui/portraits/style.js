// Portrait style constants + 2D finishing passes (owner: portraits group). Pure JS on kit PixelImages, deterministic.
//
//   PPM          portrait scale (texels per metre of the 3D cast) shared by icons, avatars and cast-portraits
//   PORTRAIT     v2 cast-portraits cell {w 32, h 40} + feet anchor (pixel-edge x 16, ground under row 38)
//   finishPortrait(img, kind)   own-colour 1-px rim line (ART_DIRECTION rubric #5: a darker, cooler shade of the
//                               pixel it borders; never black) — the 3D cast has no silhouette line (FLAG_CHAR)
//   deadTone(img)               memorial tone for '<id>/dead': desaturated, cooled, value-compressed (OKLab)
//   ghostTone(img, level)       2D fallback ghost ramp for a member without a ghost clip/spec.ghost (none today)
//   VARIANT_RAMPS / variantRamp(kind, T)   the ONE 5-step ramp per variant (ghost / spent / dead) shared by icons,
//                               avatars and cast-portrait cells (r2: critic AD8 / U4 — every ghost on one family)
//   toneRemap(img, stops)       value-preserving remap onto a ramp (per-image L percentiles, quantised to the 5 steps:
//                               eyes stay the darkest step, faces the lightest — identity survives the recolour)
//   variantStyle(kind, T)       icon / avatar backdrop + ring tones, derived from tokens / ramps (no free hexes)
//   haloPixels(img) / stampHalo(img, cx, bottomY, T)   find the 3D ghost halo / draw THE 2D halo (7x3, gold tokens)
import { toOklab, fromOklab, ramp, rgba, hex, mix, tokens } from '../kit.js';

export const PPM = 26;                         // ≈ v2 sprite scale: 0.04 m per v2 px at cos 30° (CAST_PORTING §4)
export const PORTRAIT = { w: 32, h: 40, fx: 16, fy: 39 };

const _line = new Map();
/** Rim line tone for an opaque colour: ramp(c).line (darker + cooler, OKLab), cached. */
export function lineOf(c) {
  const k = hex(c);
  let v = _line.get(k);
  if (!v) { v = rgba(ramp(k, { line: 0.24 }).line); _line.set(k, v); }
  return v;
}

/**
 * Own-colour outline: every transparent pixel 4-adjacent to the figure takes the line tone of the darkest
 * (lowest OKLab L) opaque neighbour, so a line never lightens a dark edge. `skipBelow` leaves the ground row open
 * (feet stand on the panel, as the v2 sprites' 1-px foot line did).
 */
export function outlineOwn(img, { skipBelow = Infinity, islands = false } = {}) {
  const hits = [];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // r2 (critic AD3): a single-texel island (no opaque 4-neighbour: the ghost hover fringe's dither dots) is not ringed —
  // ringing every dot speckled the bottom of every ghost
  const island = (x, y) => !N4.some(([dx, dy]) => img.alpha(x + dx, y + dy) >= 128);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.alpha(x, y) || y >= skipBelow) continue;
    let best = null, bl = 9;
    for (const [dx, dy] of N4) {
      const v = img.get(x + dx, y + dy);
      if (v[3] < 128) continue;
      if (!islands && island(x + dx, y + dy)) continue;
      const L = toOklab(v)[0];
      if (L < bl) { bl = L; best = v; }
    }
    if (best) hits.push(x, y, lineOf(best));
  }
  for (let i = 0; i < hits.length; i += 3) img.set(hits[i], hits[i + 1], hits[i + 2]);
  return img;
}

/** Final pass of every portrait-family image. kind: alive | ghost | ghost2d | spent2d | dead. */
export function finishPortrait(img, kind = 'alive') {
  if (kind === 'ghost2d') ghostTone(img, 1);
  if (kind === 'spent2d') ghostTone(img, 2);
  return outlineOwn(img);
}

/** Memorial tone (new-style '<id>/dead'): chroma × 0.16, L compressed into 0.40..0.84, tinted violet-slate (a tintype). */
export function deadTone(img) {
  const cache = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    let v = cache.get(key);
    if (!v) {
      const [L, a, b] = toOklab([img.data[i], img.data[i + 1], img.data[i + 2]]);
      v = fromOklab([0.40 + L * 0.44, a * 0.16 + 0.012, b * 0.16 - 0.022]);
      cache.set(key, v);
    }
    img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2];
  }
  return img;
}

/** 2D ghost fallback: lightness onto the shared ghost ramp (rig.ghostOpts defaults), level 2 = the dimmer spent ramp. */
export function ghostTone(img, level = 1) {
  const [d, l] = level === 2 ? ['#3A4260', '#98A2BA'] : ['#3A5696', '#E2EEFA'];
  const A = toOklab(d), B = toOklab(l);
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const L = toOklab([img.data[i], img.data[i + 1], img.data[i + 2]])[0];
    const k = Math.min(1, Math.max(0, (L - 0.2) / 0.7));
    const v = fromOklab([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
    img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2];
  }
  return img;
}

// ------------------------------------------------------------------------------------------------ r2: variant family
/** n OKLab-even steps from a to b. */
function steps(a, b, n = 5) {
  const A = toOklab(a), B = toOklab(b);
  return Array.from({ length: n }, (_, i) => hex(fromOklab(A.map((v, j) => v + (B[j] - v) * (i / (n - 1))))));
}
/**
 * The variant ramps (5 steps, dark → light). ghost / spent = the cast's shared ghost material (src/chars/rig.js
 * ghostOpts defaults: ramp #3A5696..#E2EEFA, spent #3A4260..#98A2BA — the in-world ghosts use the same); dead = a warm
 * memorial stone/sepia on the parchment tokens (parchmentLine's line → parchment), so the three states differ in VALUE
 * (ghost light, spent dark, dead mid-light) and temperature (ghost/spent cool, dead warm), not only by a hue shift.
 * CONTRACT-REQUEST (lead): promote these to TOKENS (ghostRamp, spentRamp, deadRamp) so events/indicators share them.
 */
export function variantRamp(kind, T = tokens('noon')) {
  if (kind === 'ghost') return steps('#3A5696', '#E2EEFA');
  if (kind === 'spent') return steps('#3A4260', '#98A2BA');
  const d = ramp(T.parchmentLine).line;
  return [d, T.parchmentLine, hex(mix(T.parchmentLine, T.parchmentSh, 0.5)), T.parchmentSh, T.parchment];
}
export const VARIANT_KINDS = { '/ghost': 'ghost', '/ghost-spent': 'spent', '/dead': 'dead' };

/**
 * Value-preserving remap onto a ramp: each opaque pixel's OKLab L is normalised between this image's 3rd / 97th
 * percentile and quantised onto the ramp's steps (darkest features → step 0, lightest → the top step). `skip(x, y)`
 * leaves a pixel untouched (the gold halo).
 */
export function toneRemap(img, stops, { skip = null, gamma = 1 } = {}) {
  const Ls = [];
  const S = stops.map((c) => rgba(c));
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.alpha(x, y) && !(skip && skip(x, y))) Ls.push(toOklab(img.get(x, y))[0]);
  if (!Ls.length) return img;
  Ls.sort((a, b) => a - b);
  const lo = Ls[Math.floor(Ls.length * 0.03)], hi = Ls[Math.min(Ls.length - 1, Math.floor(Ls.length * 0.97))];
  const span = Math.max(0.12, hi - lo);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!img.alpha(x, y) || (skip && skip(x, y))) continue;
    const L = toOklab(img.get(x, y))[0];
    const k = Math.min(1, Math.max(0, (L - lo) / span)) ** gamma;
    const c = S[Math.min(S.length - 1, Math.round(k * (S.length - 1)))];
    const i = (y * img.w + x) * 4;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2];
  }
  return img;
}

/** Icon / avatar backdrop + ring per variant ('' alive), from the token set T (noon / night) and the variant ramps. */
export function variantStyle(kind, T = tokens('noon')) {
  if (!kind) {
    const r = ramp(T.inkRaised);
    return { ring: T.outline, back: T.inkRaised, backHi: r.hi, backSh: r.sh };
  }
  const R = variantRamp(kind, T);
  // backdrop one value step under the ramp's darkest (features keep their contrast); ring = the ramp's mid-light step
  // so a ghost / spent / dead disc still reads on night cobbles (critic U1: the dark spent disc vanished there)
  // (tinted toward the ink tokens: a pure ramp-dark backdrop was a saturated royal blue behind the ghosts)
  const r0 = ramp(R[0], { dark: 0.12, light: 0.05 });
  const ink = (c, k = 0.5) => hex(mix(c, T.inkRaised, k));
  return { ring: kind === 'spent' ? R[2] : R[3], back: ink(r0.sh), backHi: ink(R[0]), backSh: ink(ramp(r0.sh, { dark: 0.06 }).sh), ramp: R };
}

/**
 * The 3D ghost halo of a ghost render (the rig's gold halo bars, #FFE08A family, under the ghost material): seeds =
 * clearly gold texels (yellow, light) at / above the body's top, flooded through every yellowish opaque
 * neighbour (the halo's darker rim texels). Returns a 0/1 mask (w*h). Gold props lower down are not seeded.
 */
export function haloMask(img) {
  const W = img.w, m = new Uint8Array(W * img.h), lab = new Array(W * img.h);
  let top = Infinity, bot = -Infinity;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < W; x++) if (img.alpha(x, y)) { lab[y * W + x] = toOklab(img.get(x, y)); top = Math.min(top, y); bot = Math.max(bot, y); }
  const yellow = (v, k) => v && v[2] > k && v[2] > Math.abs(v[1]);
  // the body's top = first row with a non-yellowish texel: seeds only at / above it (+2), so kept-gold eyes stay
  let bodyTop = bot;
  for (let i = 0; i < lab.length; i++) if (lab[i] && !yellow(lab[i], 0.02)) { bodyTop = Math.floor(i / W); break; }
  const st = [];
  for (let y = top; y <= Math.min(bodyTop + 2, top + (bot - top) * 0.5); y++) for (let x = 0; x < W; x++) {
    const v = lab[y * W + x];
    if (yellow(v, 0.06) && v[0] > 0.5) { m[y * W + x] = 1; st.push(x, y); }
  }
  while (st.length) {
    const y = st.pop(), x = st.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= img.h || m[Y * W + X]) continue;
      if (yellow(lab[Y * W + X], 0.02)) { m[Y * W + X] = 1; st.push(X, Y); }
    }
  }
  return m;
}

/**
 * THE ghost halo (2D, one shape for the whole cast, gold tokens): an open 7x3 ellipse lit from the upper left,
 * centred on cx, bottom row at y = bottomY.
 */
export function stampHalo(img, cx, bottomY, T = tokens('noon')) {
  const y0 = bottomY - 2;
  for (let i = -2; i <= 2; i++) img.set(cx + i, y0, i < 1 ? T.goldHi : T.gold);
  img.set(cx - 3, y0 + 1, T.gold); img.set(cx + 3, y0 + 1, T.goldSh);
  for (let i = -2; i <= 2; i++) img.set(cx + i, y0 + 2, T.goldSh);
  return img;
}

/**
 * VALUE-PRESERVING variant tone for busts made from the alive render (icons, avatars): each texel keeps its own OKLab
 * lightness (through a per-variant affine: ghost lifted, spent lowered, dead as is), and takes the chroma of the
 * variant ramp at that lightness. Eyes stay as dark against the face as they were alive (critic AD9/U1).
 */
// target lightness band per variant: the bust's own L (5th..95th percentile) is stretched onto it, order and relative
// spacing kept — hue no longer separates green from cream, so the values must (ghost light, spent dark, dead mid)
export const VARIANT_L = { ghost: [0.4, 0.95], spent: [0.24, 0.74], dead: [0.3, 0.9] };
export function toneShift(img, kind, T) {
  const R = variantRamp(kind, T).map((c) => toOklab(c));
  const Ls = [];
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) Ls.push(toOklab([img.data[i], img.data[i + 1], img.data[i + 2]])[0]);
  if (!Ls.length) return img;
  Ls.sort((a, b) => a - b);
  const lo = Ls[Math.floor(Ls.length * 0.05)], hi = Ls[Math.min(Ls.length - 1, Math.floor(Ls.length * 0.95))];
  const [t0, t1] = VARIANT_L[kind], sc = (t1 - t0) / Math.max(0.25, hi - lo);
  const a0 = t0 - lo * sc, a1 = sc;
  const memo = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (!img.data[i + 3]) continue;
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    let v = memo.get(key);
    if (!v) {
      const L = Math.min(0.96, Math.max(0.16, a0 + a1 * toOklab([img.data[i], img.data[i + 1], img.data[i + 2]])[0]));
      let j = 0;
      while (j < R.length - 2 && L > R[j + 1][0]) j++;
      const k = Math.min(1, Math.max(0, (L - R[j][0]) / (R[j + 1][0] - R[j][0] || 1)));
      v = fromOklab([L, R[j][1] + (R[j + 1][1] - R[j][1]) * k, R[j][2] + (R[j + 1][2] - R[j][2]) * k]);
      memo.set(key, v);
    }
    img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2];
  }
  return img;
}
