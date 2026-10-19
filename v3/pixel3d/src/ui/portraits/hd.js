// Portraits at UI DENSITY D=2 (owner: portraits group; docs/UI.md §2.10 "Density", wave 1). The icons and avatars
// RE-RENDERED from the 3D cast at twice the texel density (never an upscaled 1x bust): same framing rule as bake.js
// (head box fitted per id, ICON_PPM / ICON_NUDGE art direction, feature boost), every ppm x 2, crops x 2.
//   icon_<id>[/ghost|/ghost-spent|/dead]    24x24 (= the 12x12 icon at D=2; anchor 12,12): the clear "who" mark of
//                                            the HD pins (pinWithIconHD takes it 1:1 into the 24-px socket)
//   avatar_<id>[/ghost|/ghost-spent|/dead]  48x48 (= the 24x24 avatar at D=2; anchor 24,24): dock / voice button,
//                                            notebook rows, off-screen discs
// Every roster member (src/demo/roster.json minus the user skip): bake.js PORTRAIT_IDS + the four shipped characters
// that have no 1x atlas portrait (wanderer, keeper, hound, duelist). Atlases (tools/uibake.sh):
//   portraits:portraits-hd        -> out/ui/portraits-hd.{png,json}        (noon tokens)
//   portraits:portraits-hd-night  -> out/ui/portraits-hd-night.{png,json}  (night tokens)
// The 1x atlases (portraits.*, portraits-night.*) are untouched (byte-identical). Loader: atlas.js loadPortraits(base,
// tod, { hd: true }) (1x crops carry .hd) / loadPortraitsHD(base, tod).
import { renderCast, PORTRAIT_IDS, PLAYERS, SKIPPED } from './render.js';
import { outlineOwn, PPM, variantStyle, VARIANT_KINDS } from './style.js';
import { headBoxes, frameBox, bust, boostFeatures, variantBust, ICON_FIT, AVATAR_FIT, ICON_NUDGE, ICON_PPM, FEATURE_IDS, FEATURE_MARKS, VARIANTS } from './bake.js';
import { PixelImage, tokens } from '../kit.js';

export const D = 2;
/** The roster characters without a 1x atlas portrait (the demo used their roster thumbs): HD portraits for them too. */
export const EXTRA_IDS = ['wanderer', 'keeper', 'hound', 'duelist'];
export const HD_IDS = [...PORTRAIT_IDS, ...EXTRA_IDS].filter((id) => !SKIPPED.includes(id));
export const HD_PLAYERS = [...PLAYERS, ...EXTRA_IDS];
export const ICON_HD = 12 * D, AVATAR_HD = 24 * D;

let cache = null;
/** Raw HD busts (tod-independent): { icon: {id: 24x24}, avatar: {id: 44x44}, framing }. */
export async function buildHD(engine) {
  if (cache) return cache;
  const marks = await renderCast(engine, { ids: HD_IDS, variant: 'idle', ppm: PPM, mark: ['@head'] });
  const hb = headBoxes(marks);
  const ppmFor = (id, fit) => {
    if (fit === ICON_FIT && ICON_PPM[id]) return ICON_PPM[id];
    const w = hb[id] ? Math.min(hb[id].x1 - hb[id].x0, 1.3 * (hb[id].y1 - hb[id].y0)) : 16;
    return Math.max(fit.minPpm, Math.min(fit.maxPpm, 2 * Math.round(PPM * fit.headW / w / 2)));
  };
  // the 1x rule picks the ppm; the HD bust is rendered at D x that ppm (2x texel density, a real render)
  const groups = new Map();
  for (const id of HD_IDS) for (const fit of [ICON_FIT, AVATAR_FIT]) {
    const p = D * ppmFor(id, fit);
    if (!groups.has(p)) groups.set(p, new Set());
    groups.get(p).add(id);
  }
  const R = {}, MK = {};
  for (const [p, set] of [...groups].sort((a, b) => a[0] - b[0])) {
    const ids = [...set];   // crop = each copy's own grid cell (2.2 x 2.5 m at this ppm: no neighbour in the head box)
    R[p] = await renderCast(engine, { ids, variant: 'idle', ppm: p });
    if (ids.some((i) => FEATURE_IDS.includes(i))) MK[p] = await renderCast(engine, { ids, variant: 'idle', ppm: p, mark: FEATURE_MARKS });
  }
  const icon = {}, avatar = {}, framing = {};
  const AV_FIT = { ...AVATAR_FIT, chinRow: AVATAR_FIT.chinRow * D };
  for (const id of HD_IDS) {
    const pi = D * ppmFor(id, ICON_FIT), pa = D * ppmFor(id, AVATAR_FIT);
    framing[id] = { iconPpm: pi, avatarPpm: pa };
    const H = hb[id] || { x0: -8, x1: 8, y0: -40, y1: -24 };
    const ri = R[pi][id], ra = R[pa][id];
    const bi = frameBox(H, ri, null, pi, ICON_HD, ICON_FIT), ba = frameBox(H, ra, null, pa, AVATAR_HD - 4, AV_FIT);
    const n = ICON_NUDGE[id] ? [ICON_NUDGE[id][0] * D, ICON_NUDGE[id][1] * D] : [0, 0];
    let ic = bust(ri.frames[0], bi.x, bi.y, ICON_HD, ICON_HD, n), av = bust(ra.frames[0], ba.x, ba.y, AVATAR_HD - 4, AVATAR_HD - 4);
    if (FEATURE_IDS.includes(id)) {
      ic = boostFeatures(ic, MK[pi] && bust(MK[pi][id].frames[0], bi.x, bi.y, ICON_HD, ICON_HD, n));
      av = boostFeatures(av, MK[pa] && bust(MK[pa][id].frames[0], ba.x, ba.y, AVATAR_HD - 4, AVATAR_HD - 4));
    }
    icon[id] = ic; avatar[id] = av;
  }
  engine.stats.portraitFramingHD = framing;
  cache = { icon, avatar, framing };
  return cache;
}

const inDisc = (x, y, r, c) => { const dx = x + 0.5 - c, dy = y + 0.5 - c; return dx * dx + dy * dy <= r * r; };
/**
 * 24x24 HD icon (icon_<id> at D=2): disc r 12 = a 1-px ring + a lit backdrop (1-px hi crescent upper-left, sh crescent
 * lower-right) + the bust with its 1-px own-colour line. Cues as the 1x icon, redrawn at D=2: ghost = a gold halo arc
 * on the ring top (lit from the left), dead = the ring cracked at the upper right with a 1-px fissure inward.
 */
export function makeIconHD(alive, kind = '', T = tokens('noon')) {
  const S = variantStyle(kind, T), N = ICON_HD, c = N / 2;
  const b = outlineOwn(variantBust(alive, kind, T));
  const im = new PixelImage(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inDisc(x, y, c, c)) continue;
    if (!inDisc(x, y, c - 1, c)) { im.set(x, y, S.ring); continue; }
    const d = (x + 0.5 - c) + (y + 0.5 - c), r = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    im.set(x, y, d <= -12 && r > c - 3.2 ? S.backHi : d >= 11 && r > c - 3.2 ? S.backSh : S.back);
    const v = b.get(x, y);
    if (v[3]) im.set(x, y, v);
  }
  if (kind === 'ghost') {
    // halo arc: the ring's top arc (above y 6) widened inward to 2 px (the 1x 1-texel arc), goldHi on the outer row
    // left of centre, gold elsewhere, goldSh where the arc ends
    for (let y = 0; y < 7; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (r > c || r <= c - 2) continue;
      im.set(x, y, y >= 5 ? T.goldSh : r > c - 1 && x < c ? T.goldHi : T.gold);
    }
  }
  if (kind === 'dead') {
    // crack: the ring opens at the upper right, a 1-px fissure zig-zags 3 px inward
    for (const [x, y] of [[18, 2], [19, 2], [19, 3], [20, 3], [20, 4], [21, 4]]) im.erase(x, y);
    for (const [x, y] of [[18, 3], [17, 4], [18, 4], [17, 5], [16, 6]]) im.set(x, y, S.backSh);
  }
  return im;
}
/**
 * 48x48 HD avatar (avatar_<id> at D=2): a rounded notched frame (1-px ring, corners cut [2, 1] like the D=2 kit
 * frames), a 1-px bevel lit from the upper left, the backdrop, the 44x44 bust (own-colour line, open at the bottom).
 * Ghost = a gold top edge over the middle third; dead = a cracked upper-right corner.
 */
export function makeAvatarHD(alive, kind = '', T = tokens('noon')) {
  const S = variantStyle(kind, T), N = AVATAR_HD;
  const b = outlineOwn(variantBust(alive, kind, T), { skipBelow: N - 5 });
  const im = new PixelImage(N, N);
  const cut = [2, 1];
  const cornerOut = (x, y) => { const dx = Math.min(x, N - 1 - x), dy = Math.min(y, N - 1 - y); return dy < cut.length && dx < cut[dy]; };
  const out = (x, y) => x < 0 || y < 0 || x >= N || y >= N || cornerOut(x, y);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (out(x, y)) continue;
    if (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1)) { im.set(x, y, S.ring); continue; }
    const e1 = out(x - 2, y) || out(x, y - 2), e2 = out(x + 2, y) || out(x, y + 2);
    im.set(x, y, e1 && !e2 ? S.backHi : e2 && !e1 ? S.backSh : S.back);
  }
  im.blit(b, 2, 2);
  // the bottom line of the frame stays on top of the bust (the shoulders sit IN the frame)
  for (let x = 0; x < N; x++) if (!out(x, N - 1)) im.set(x, N - 1, S.ring);
  if (kind === 'ghost') {
    // a 2-px gold top edge over the middle (1x: x 7..16 of 24), lit left of centre, goldSh ends
    for (let x = 14; x <= 33; x++) { im.set(x, 0, x < 24 ? T.goldHi : T.gold); im.set(x, 1, x < 24 ? T.gold : T.goldSh); }
    im.set(13, 1, T.goldSh); im.set(34, 1, T.goldSh);
  }
  if (kind === 'dead') {
    for (const [x, y] of [[42, 0], [43, 0], [44, 0], [45, 0], [46, 1], [47, 2], [47, 3], [47, 4], [47, 5], [45, 1], [46, 2]]) im.erase(x, y);
    for (const [x, y] of [[44, 1], [45, 2], [46, 3], [46, 4], [43, 2], [44, 3], [42, 4]]) im.set(x, y, S.backSh);
  }
  return im;
}

/** Every HD icon + avatar frame for a token set (same names as the 1x atlas; HD_IDS incl. the shipped four). */
export async function portraitFramesHD(engine, T) {
  const { icon, avatar } = await buildHD(engine);
  const icons = [], vIcons = [], avatars = [];
  for (const id of HD_IDS) for (const v of VARIANTS) {
    if (v && !HD_PLAYERS.includes(id)) continue;
    const kind = VARIANT_KINDS[v] || '';
    (v ? vIcons : icons).push([`icon_${id}${v}`, makeIconHD(icon[id], kind, T)]);
    avatars.push([`avatar_${id}${v}`, makeAvatarHD(avatar[id], kind, T)]);
  }
  return [...icons, ...vIcons, ...avatars];
}
export async function portraitsMetaHD(engine, tod) {
  const { framing } = await buildHD(engine);
  const anchors = {};
  for (const id of HD_IDS) for (const v of VARIANTS) {
    if (v && !HD_PLAYERS.includes(id)) continue;
    anchors[`icon_${id}${v}`] = { x: ICON_HD / 2, y: ICON_HD / 2 };
    anchors[`avatar_${id}${v}`] = { x: AVATAR_HD / 2, y: AVATAR_HD / 2 };
  }
  return {
    density: D, iconSize: ICON_HD, avatarSize: AVATAR_HD, ids: HD_IDS, players: HD_PLAYERS, anchors,
    newStyle: {
      tod,
      what: 'UI density D=2 (docs/UI.md §2.10): the 1x icons / avatars re-rendered from the 3D cast at 2x the texel density (ppm x 2, crops x 2; same framing rule, art direction and variant cues), drawn at the SAME on-screen size as the 1x frames on the L.hd tiers',
      framing,
      oneX: 'out/ui/portraits{,-night}.{png,json} (12x12 / 24x24) unchanged; frame names identical; wanderer / keeper / hound / duelist exist only here',
      skipped: SKIPPED,
    },
  };
}
