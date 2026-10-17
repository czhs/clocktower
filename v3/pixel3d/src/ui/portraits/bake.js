// Bake module of the portraits group (docs/UI.md §3.4, §4 "portraits"): out/ui/portraits.{png,json}
//   tools/uibake.sh portraits [--strict]          (the 26 x 5 cast-portraits strip: tools/uibake.sh portraits:cast-portraits)
//
// Frames (v2 names first, `social.json` order; the lead's social composite re-packs the icon_* frames):
//   icon_<id>                12x12 round bust (v2 social icons; anchor 6,6): the head fitted over the disc (ICON_FIT), disc r6 = 1-px line
//                            ring + a slate backdrop; the bust is RENDERED at its own scale (never a downscaled image)
//   icon_<id>/ghost   (new)  players: r2 = the ALIVE bust remapped (value-preserving) onto the shared ghost ramp, gold
//                            halo arc on the ring top (non-colour cue); r1's re-rendered pale shells were faceless
//   icon_<id>/ghost-spent (new)  players: the alive bust on the darker spent ramp, plain ring
//   icon_<id>/dead    (new)  players: the alive bust on the warm memorial ramp, cracked ring (notch upper right)
//   (portraits-night.bake.js: the same frames on TOKENS.night -> out/ui/portraits-night.*)
//   avatar_<id>[/ghost|/ghost-spent|/dead] (new) 24x24 head-and-shoulders (dock / voice button, notebook rows, lobby
//                            faces): notched frame (outline + bevel), bust fitted by AVATAR_FIT (head ≈ 15 px)
// Skipped (user): icon_nicksong (pipeline/skip.txt), icon_brianbi (no pixel3d character).
import { renderCast, PORTRAIT_IDS, PLAYERS, SKIPPED } from './render.js';
import { portraitCells } from './cast-portraits.bake.js';
import { outlineOwn, PORTRAIT, PPM, toneShift, variantStyle, variantRamp, VARIANT_KINDS } from './style.js';
import { PixelImage, tokens, toOklab, fromOklab } from '../kit.js';

export const VARIANTS = ['', '/ghost', '/ghost-spent', '/dead'];
// Framing (one rule for everyone): the HEAD (every part on the head bone and below, measured from a magenta mark
// render, '@head') is fitted to a target width, i.e. each member gets its own bust scale (ppm), quantised to 2 texels/m.
// Never above the native cap (a bust is a close-up, but no texel is ever magnified from a smaller render).
// Icons: the head box fitted slightly OVER the disc (headW 13 > the 10-px interior: ears / hats / horns run off as in
// v2) and centred at 72 % of the head box height (faces sit low in hooded / eared / hatted heads). r1 tried a face
// crop at the cast's design scale (34 texels/m, eye-bone centred): flat colour discs for the frog family — the eye
// bones sit on the eye bumps — shots/ui-portraits/r1 notes in docs/UI.md §6.
export const ICON_FIT = { headW: 13, minPpm: 12, maxPpm: 34, centre: 0.72 };
export const AVATAR_FIT = { headW: 15, minPpm: 18, maxPpm: 44, chinRow: 15 };    // 24x24: head ≈ 15 px, shoulders below
/** Per-id framing nudges (texels, +y = down) on top of the head-box rule (art-directed exceptions; r2 critic AD9). */
export const ICON_NUDGE = { frog: [0, 0], rabbit: [0, -2], chonk: [0, -2], greenting: [0, -2] };   // r2 sweep: shots/ui-portraits/probe/icons-{a,b}.png
/** Per-id icon scale overrides (texels/m): faces whose 2x2 eyes vanish at the fitted scale. */
export const ICON_PPM = { frog: 12, rabbit: 14, moth: 16, chonk: 20, greenting: 16 };   // r2: rabbit's ears + face, chonk's eyes + beak, moth's dark eyes enter the disc
const AVATAR_NUDGE = {};
/**
 * r2 feature boost (critic AD9, as the v2 icons did): ids whose eyes are 1-texel / mid-value at 12 px get their eye
 * texels (a magenta mark render of the parts named here, same ppm + pose) pushed to their own line tone after the render.
 */
export const FEATURE_IDS = ['moth', 'frog', 'chonk', 'rabbit', 'greenting'];
export const FEATURE_MARKS = ['pupil', 'eye', '@eyeL', '@eyeR'];

// URL overrides for art-direction passes (?iconPpm=rabbit:16,frog:14&iconNudge=rabbit:0:-1)
function overrides(engine) {
  const P = (k) => engine.params?.get?.(k) || '';
  const ppm = { ...ICON_PPM }, nudge = { ...ICON_NUDGE };
  for (const t of P('iconPpm').split(',').filter(Boolean)) { const [id, v] = t.split(':'); ppm[id] = Number(v); }
  for (const t of P('iconNudge').split(',').filter(Boolean)) { const [id, x, y] = t.split(':'); nudge[id] = [Number(x), Number(y)]; }
  return { ppm, nudge };
}

/** Disc mask of the 12x12 icon: inside r 5 = content, r 5..6 = line ring. */
function inDisc(x, y, r) { const dx = x + 0.5 - 6, dy = y + 0.5 - 6; return dx * dx + dy * dy <= r * r; }

/** Crop w x h of a raw render with its top-left at (x0, y0) (+ nudge). */
export function bust(src, x0, y0, w, h, nudge = [0, 0]) { return src.crop(Math.round(x0 + nudge[0]), Math.round(y0 + nudge[1]), w, h); }

/** Darken the feature texels (mask image: magenta = feature) to their own line tone. */
export function boostFeatures(b, mask) {
  if (!mask) return b;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const m = mask.get(x, y);
    if (!(m[3] && m[0] > 190 && m[1] < 90 && m[2] > 190) || !b.alpha(x, y)) continue;
    const v = b.get(x, y);
    // a deep shade of its own hue (L .27, cooler; never black) unless already that dark
    const [L, a, c] = toOklab(v);
    if (L > 0.3) b.set(x, y, fromOklab([0.27, a * 0.6, c * 0.6 - 0.02]));
  }
  return b;
}

/** The variant of an alive bust: a value-preserving remap onto the shared ghost / spent / dead ramp (identity kept). */
export function variantBust(alive, kind, T) {
  const b = alive.clone();
  return kind ? toneShift(b, kind, T) : b;
}

/**
 * 12x12 icon from a 12x12 bust (alive pixels, already boosted). kind: '' | ghost | spent | dead.
 * Non-colour cues (critic U1): ghost = a gold halo arc replacing the ring's top (the halo of an unspent ghost vote),
 * dead = a cracked ring (a notch + a 1-px crack at the upper right), spent = the plain ring.
 */
export function makeIcon(alive, kind = '', T = tokens('noon')) {
  const S = variantStyle(kind, T);
  const b = outlineOwn(variantBust(alive, kind, T));
  const im = new PixelImage(12, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    if (!inDisc(x, y, 6)) continue;
    if (!inDisc(x, y, 5)) { im.set(x, y, S.ring); continue; }
    // backdrop: lit from the upper left (hi crescent top-left, shadow crescent bottom-right)
    const d = (x - 6) + (y - 6);
    im.set(x, y, d <= -7 ? S.backHi : d >= 6 ? S.backSh : S.back);
    const v = b.get(x, y);
    if (v[3]) im.set(x, y, v);
  }
  if (kind === 'ghost') {
    // halo arc: the ring's top row (x 3..8) in gold, lit from the left
    for (let x = 3; x <= 8; x++) im.set(x, 0, x < 6 ? T.goldHi : T.gold);
    im.set(2, 1, T.goldSh); im.set(9, 1, T.goldSh);
  }
  if (kind === 'dead') {
    // crack: the ring opens at the upper right and a 1-px fissure runs one texel inward
    im.erase(9, 1); im.erase(10, 2);
    im.set(9, 2, S.backSh); im.set(8, 2, S.backSh);
  }
  return im;
}

/** 24x24 avatar from a 22x22 bust; same variant family + cues as the icons (frame instead of the disc). */
export function makeAvatar(alive, kind = '', T = tokens('noon')) {
  const S = variantStyle(kind, T);
  const b = outlineOwn(variantBust(alive, kind, T), { skipBelow: 21 });
  const im = new PixelImage(24, 24);
  // notched square: outline ring (corner pixels open), bevel lit from the upper left, slate backdrop
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const edge = x === 0 || y === 0 || x === 23 || y === 23;
    const corner = (x === 0 || x === 23) && (y === 0 || y === 23);
    if (corner) continue;
    if (edge) { im.set(x, y, S.ring); continue; }
    const c = x === 1 || y === 1 ? S.backHi : x === 22 || y === 22 ? S.backSh : S.back;
    im.set(x, y, c);
  }
  im.blit(b, 1, 1);
  if (kind === 'ghost') { for (let x = 7; x <= 16; x++) im.set(x, 0, x < 12 ? T.goldHi : T.gold); im.set(6, 1, T.goldSh); im.set(17, 1, T.goldSh); }
  if (kind === 'dead') { im.erase(21, 0); im.erase(22, 0); im.erase(23, 1); im.erase(23, 2); im.set(21, 1, S.backSh); im.set(22, 1, S.backSh); im.set(20, 2, S.backSh); }
  return im;
}

/** Magenta head box per id at the portrait scale: {x0, y0, x1, y1} relative to the feet anchor (texels). */
export function headBoxes(marks) {
  const out = {};
  for (const [id, r] of Object.entries(marks)) {
    const im = r.frames[0];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      const v = im.get(x, y);
      if (v[3] && v[0] > 190 && v[1] < 90 && v[2] > 190) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
    }
    out[id] = x1 > x0 ? { x0: x0 - r.feet.x, y0: y0 - r.feet.y, x1: x1 - r.feet.x, y1: y1 - r.feet.y, head: r.headPt && { x: r.headPt.x - r.feet.x, y: r.headPt.y - r.feet.y } } : null;
  }
  return out;
}

/** Crop box (top-left in the raw render) for a w x h bust of `id` rendered at ppm, per the fit rule. */
export function frameBox(hb, r, idleHead, ppm, w, fit) {
  const k = ppm / PPM;
  const cx = ((hb.x0 + hb.x1) / 2) * k, top = hb.y0 * k, chin = hb.y1 * k;
  // the variant's head moved (ghost hover / pose): follow the head bone
  const dx = r.headPt && idleHead ? r.headPt.x - idleHead.x : 0, dy = r.headPt && idleHead ? r.headPt.y - idleHead.y : 0;
  const hH = chin - top, side = w;   // square crops
  const y0 = fit.centre !== undefined ? top + hH * fit.centre - side / 2      // icon: a point in the head box at the centre
    : hH <= fit.chinRow ? top + hH / 2 - fit.chinRow / 2 - 0.5 : chin - fit.chinRow - 0.5;   // avatar: centre, else chin on chinRow
  return { x: r.feet.x + cx + dx - w / 2, y: r.feet.y + y0 + dy };
}

let cache = null;
let DEBUG = new Set();
/** Raw busts (tod-independent): { alive: {icon: {id: 12x12}, avatar: {id: 22x22}}, hb, framing, debug }. */
export async function build(engine) {
  DEBUG = new Set((engine.params?.get?.('dbg') || '').split(',').filter(Boolean));
  if (cache) return cache;
  const OV = overrides(engine);
  const big = { w: 96, h: 100, fx: 48, fy: 94 };
  const marks = await renderCast(engine, { ids: PORTRAIT_IDS, variant: 'idle', ppm: PPM, mark: ['@head'] });   // crop = its own grid cell (no neighbour heads)
  const hb = headBoxes(marks);
  const ppmFor = (id, fit) => {
    if (fit === ICON_FIT && OV.ppm[id]) return OV.ppm[id];
    // fit the head's width, but horns/ears wider than 1.3x its height do not shrink the face (clarabelle, goat)
    const w = hb[id] ? Math.min(hb[id].x1 - hb[id].x0, 1.3 * (hb[id].y1 - hb[id].y0)) : 16;
    return Math.max(fit.minPpm, Math.min(fit.maxPpm, 2 * Math.round(PPM * fit.headW / w / 2)));
  };
  // render every ppm group once (alive idle only: r2 variants are remaps of the alive bust), + the feature marks
  const groups = new Map();
  for (const id of PORTRAIT_IDS) for (const fit of [ICON_FIT, AVATAR_FIT]) {
    const p = ppmFor(id, fit);
    if (!groups.has(p)) groups.set(p, new Set());
    groups.get(p).add(id);
  }
  const R = {}, MK = {};
  for (const [p, set] of [...groups].sort((a, b) => a[0] - b[0])) {
    const ids = [...set];
    R[p] = await renderCast(engine, { ids, variant: 'idle', ppm: p, crop: big });
    if (ids.some((i) => FEATURE_IDS.includes(i))) MK[p] = await renderCast(engine, { ids, variant: 'idle', ppm: p, crop: big, mark: FEATURE_MARKS });
  }
  const alive = { icon: {}, avatar: {} }, framing = {}, debug = [];
  for (const id of PORTRAIT_IDS) {
    const pi = ppmFor(id, ICON_FIT), pa = ppmFor(id, AVATAR_FIT);
    framing[id] = { iconPpm: pi, avatarPpm: pa, head: hb[id] };
    if (!hb[id]) console.warn(`portraits: no head mark for ${id}`);
    const H = hb[id] || { x0: -8, x1: 8, y0: -40, y1: -24 };
    const ri = R[pi][id], ra = R[pa][id];
    const bi = frameBox(H, ri, null, pi, 12, ICON_FIT), ba = frameBox(H, ra, null, pa, 22, AVATAR_FIT);
    const nI = OV.nudge[id], nA = AVATAR_NUDGE[id];
    let icon = bust(ri.frames[0], bi.x, bi.y, 12, 12, nI), av = bust(ra.frames[0], ba.x, ba.y, 22, 22, nA);
    if (FEATURE_IDS.includes(id)) {
      icon = boostFeatures(icon, MK[pi] && bust(MK[pi][id].frames[0], bi.x, bi.y, 12, 12, nI));
      av = boostFeatures(av, MK[pa] && bust(MK[pa][id].frames[0], ba.x, ba.y, 22, 22, nA));
    }
    alive.icon[id] = icon; alive.avatar[id] = av;
    if (DEBUG.has(id)) { const d = ri.frames[0].clone(); d.frame(Math.round(bi.x + (nI?.[0] || 0)), Math.round(bi.y + (nI?.[1] || 0)), 12, 12, '#FF00FF'); debug.push([`dbg_${id}`, d]); }
  }
  engine.stats.portraitFraming = framing;
  console.warn('portraits framing: ' + JSON.stringify(Object.fromEntries(Object.entries(framing).map(([k, f]) => [k, [f.iconPpm, f.avatarPpm, f.head && f.head.x1 - f.head.x0, f.head && f.head.y1 - f.head.y0]]))));
  cache = { alive, framing, hb, debug };
  return cache;
}

/** Every icon + avatar frame for a token set (noon / night): v2 icons first, then variants, then avatars. */
export async function portraitFrames(engine, T) {
  const { alive, debug } = await build(engine);
  const icons = [], vIcons = [], avatars = [];
  for (const id of PORTRAIT_IDS) for (const v of VARIANTS) {
    if (v && !PLAYERS.includes(id)) continue;
    const kind = VARIANT_KINDS[v] || '';
    (v ? vIcons : icons).push([`icon_${id}${v}`, makeIcon(alive.icon[id], kind, T)]);
    avatars.push([`avatar_${id}${v}`, makeAvatar(alive.avatar[id], kind, T)]);
  }
  return [...debug, ...icons, ...vIcons, ...avatars];
}

export async function portraitsMeta(engine, tod) {
  const { shifts } = await portraitCells(engine);
  const anchors = { icon: { x: 6, y: 6 } };     // v2 key (social.json meta.anchors.icon), kept
  for (const id of PORTRAIT_IDS) for (const v of VARIANTS) {
    if (v && !PLAYERS.includes(id)) continue;
    anchors[`icon_${id}${v}`] = { x: 6, y: 6 };
    anchors[`avatar_${id}${v}`] = { x: 12, y: 12 };
  }
  // headCrops, v2 semantics (social.json): a 12-px square around the FACE inside the 32x40 cast-portraits idle cell
  // (size 12, face = head-box centre at 60 % height). The new-style head box (whole head incl. ears/hats) is under newStyle.
  const { hb, framing } = await build(engine);
  const headCrops = {}, headBoxes = {};
  for (const id of PORTRAIT_IDS) {
    const h = hb[id]; if (!h) continue;
    const dx = Array.isArray(shifts[id]) ? shifts[id][0] : 0, dy = Array.isArray(shifts[id]) ? shifts[id][1] : 0;
    // face = the head box's centre column at 60 % of its height (eye bones are not on the eyes in every rig: fox's sit 7 px low)
    const f = { x: PORTRAIT.fx + dx + (h.x0 + h.x1) / 2, y: PORTRAIT.fy + dy + h.y0 + (h.y1 - h.y0) * 0.6 };
    headCrops[id] = { x: Math.round(f.x - 6), y: Math.round(f.y - 6), size: 12, face: { x: +f.x.toFixed(2), y: +f.y.toFixed(2) } };
    const fx = PORTRAIT.fx + dx + (h.x0 + h.x1) / 2, fy = PORTRAIT.fy + dy + (h.y0 + h.y1) / 2;
    const size = Math.max(12, Math.round(Math.max(h.x1 - h.x0, h.y1 - h.y0)));
    headBoxes[id] = { x: Math.round(fx - size / 2), y: Math.round(fy - size / 2), size, iconPpm: framing[id].iconPpm };
  }
  const T = tokens(tod);
  return {
    iconSize: 12,
    icons: PORTRAIT_IDS,
    headCrops,
    anchors,
    newStyle: {
      tod,
      variants: {
        '/ghost': 'players: the alive bust remapped (value-preserving, 5 steps) onto the shared ghost ramp + a gold halo arc on the ring top',
        '/ghost-spent': 'players: the alive bust on the darker spent ramp, plain ring (no halo: the vote is used)',
        '/dead': 'players: the alive bust on the warm memorial (parchment stone) ramp + a cracked ring (notch upper right)',
      },
      ramps: { ghost: variantRamp('ghost', T), spent: variantRamp('spent', T), dead: variantRamp('dead', T) },
      avatar: { size: 24, fit: AVATAR_FIT, frame: 'notched outline + bevel lit from the upper left; ghost = gold top edge, dead = cracked corner', anchor: [12, 12] },
      icon: { fit: ICON_FIT, disc: 'r6: 1-px ring, r5 backdrop (hi crescent upper left, shadow lower right); tokens(tod).inkRaised for alive' },
      headBoxes,
      portraitCell: PORTRAIT,
      skipped: SKIPPED.map((id) => `icon_${id}`),
    },
  };
}

export default {
  image: 'portraits.png',
  width: 256,
  v2: 'social.json',
  only: (n) => n.startsWith('icon_'),
  skip: SKIPPED.map((id) => `icon_${id}`),
  async frames({ engine }) { return portraitFrames(engine, tokens('noon')); },
  async meta({ engine }) { return portraitsMeta(engine, 'noon'); },
};
