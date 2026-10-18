// (B) The VOTE MARKS (pass B; docs/DEMO.md §4.9 "the seal vote"): every voter's vote, unmistakable in the vote camera,
// day and night, in the town's gothic-cozy pixel style (stepped drawings on the 30 Hz grid, pure functions of the demo
// clock, no real lights, no new shader programs except the ONE spotlight program compiled in the warm-up).
// The user (2026-10-18): "[the HUD vote-dial card] ideally don't have this panel. also hand raising is not very clear.
// perhaps they slap the seal onto the ground in front of the character - that would be a very clear vote. this is
// important so that butler can be played properly"; "what are the candles? they are a little bit visually messy";
// "when vote is locked, how about a spotlight on the character".
//
// THE STATES (the seal vote, sealvote.js: a seal lying at a voter's feet when the clock hand reaches them COUNTS):
//   waiting        nothing at all (a living voter with no seal down)
//   SLAP           the voter plays their 'vote' clip (seatcast.js) and slaps a red WAX SEAL onto the ground just in
//                  front of their feet (toward the viewer, so no figure ever hides it): the seal held up (2 frames), the
//                  fall (2 drawings, a streak), the SLAM (squashed, slam dashes), a dust puff (4 drawings) and a ring of
//                  wax drops flung out that settle round it; then it rests there, drawn in the UI's own colours (lit by
//                  day and by night). Real time, for everyone: a Butler can watch their master's seal.
//   WITHDRAW       before the hand arrives: the seal un-stamps (hops up, the drops vanish), rises back to the voter's
//                  hand and is gone in a small puff; no seal = no vote
//   LOCKED         the hand reaches a seat with a seal: a BRASS STAMP comes down on it (3 drawings), the seal turns GOLD
//                  under it (a flash + a brass chime ring + sparks), the stamp lifts away; a SPOTLIGHT drops onto the
//                  voter (spotlight.js: a warm beam from above + a pool at the feet) and stays while the vote stands
//   passed, no     nothing (clean)
//   ghost vote     a dead player's one ghost vote: a small pale GHOST TOKEN hovers at their feet; used = it becomes a
//                  pale seal (slap / withdraw / lock as above, a pale beam); spent / no ghost vote = nothing
// THE NOMINEE: a crimson ring round their feet for the whole nomination + vote; the THRESHOLD (the tally reaches the
//   votes needed): a crimson + gold burst at the nominee, the ring becomes the block ring (crimson + a gold inner ring +
//   4 gold studs), the tower bell rings, the tally turns gold, the caption says "<name> is on the block".
// THE CURRENT VOTER: the clock hand's outer end drawn on the ground in LIT brass (gold + a pale-gold light line: it
//   reads at night) from the dais (stage A: the dais' own hand turns under it) or the staging's hub to that voter.
// THE TALLY: one small plaque bottom centre above the action bar: "3 votes · 7 needed"; at the threshold it turns gold
//   "9 votes · 7 needed · ON THE BLOCK" (narrow screens: "ON THE BLOCK · 9 votes"); a new count lifts the number lit
//   (no blank mid-flip drawing).
//
// DENSITY: on the game UI's HD tiers (L.hd, D=2: 2 HD px per scene texel at 720p) every piece is drawn at the HD
// resolution from its WORLD size (a 0.54 m seal at k HD px per texel), lines 1 HD px; ?uidensity=1 = the same art on
// the 1x tiers. Tiers: the resting seals / drops / rings / the clock hand as GROUND decals (HD depth tier, putGroundHD:
// hidden under figures like L.ground); the falling seal, the stamp, sparks, the ghost token on the world tier; the
// plaque on the screen tier.
//   createVoteMarks(demo) -> marks { info(), states(t), topOf(seat), plaque, update(), dispose() }
import * as THREE from 'three';
import * as EV from '../ui/events/draw.js';
import * as A from '../ui/events/art.js';
import { PixelImage, frameAt, dissolve, drawText, textWidth, drawBox, GRID_HZ, hdPiece } from '../ui/kit.js';
import { putGroundHD } from '../ui/markers/hd.js';
import { worldLayerHD } from '../ui/hd/wave2.js';
import { GATHER_STAGGER } from './votestage.js';
import { sealVoteAt } from './sealvote.js';
import { createSpotlights } from './spotlight.js';

const N = 15;
const gk = (dt) => Math.floor(dt * GRID_HZ + 1e-6);          // whole grid frames since an event
export const KINDS = ['waiting', 'sealed', 'withdrawn', 'counted', 'passed', 'ghost', 'ghost-sealed', 'ghost-withdrawn', 'ghost-counted', 'ghost-passed', 'spent'];
export const SEAL_M = 0.27;     // the seal's radius (m, x the cast scale)
export const SEAL_AHEAD = 0.62;       // m in front of the feet (facing the dais; against the seat stone's rim: it reads as theirs)
const T_SLAM = 4, T_REST = 14, T_WD = 10, T_STAMP = 12;        // grid frames: the slam, the slap done, withdraw done, stamp done
const END_S = 0.5;              // the marks dissolve this long after the vote phase ends

// ------------------------------------------------------------------------------------------------ helpers
/** (perf) blit a cached sprite straight into a layer's bytes; partial alpha composites through set() */
function fastBlit(dst, src, x, y) {
  x |= 0; y |= 0;
  const W = dst.w, H = dst.h, sw = src.w, sd = src.data, dd = dst.data;
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + sw), y1 = Math.min(H, y + src.h);
  if (x1 <= x0 || y1 <= y0) return;
  for (let yy = y0; yy < y1; yy++) {
    let si = ((yy - y) * sw + (x0 - x)) * 4, di = (yy * W + x0) * 4;
    for (let xx = x0; xx < x1; xx++, si += 4, di += 4) {
      const a = sd[si + 3];
      if (!a) continue;
      if (a === 255 || !dd[di + 3]) { dd[di] = sd[si]; dd[di + 1] = sd[si + 1]; dd[di + 2] = sd[si + 2]; dd[di + 3] = a; }
      else dst.set(xx, yy, [sd[si], sd[si + 1], sd[si + 2], a]);
    }
  }
  dst.mark?.(x0, y0, x1 - 1, y1 - 1);
}
const cache = new Map();
const memo = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); if (cache.size > 1200) cache.delete(cache.keys().next().value); } return v; };
const ghostLine = (T) => A.rampOf(T.ghostSh, { line: 0.3 }).line;
const hash = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ------------------------------------------------------------------------------------------------ materials
const WAX = { hi: '#E8806A', mid: '#BC3A3C', sh: '#7E2230', side: '#5E1A26', line: '#2E0E16', mark: '#E6B632', markHi: '#FFE9A0' };
const PALE = { hi: '#F4FAFC', mid: '#BCD6E4', sh: '#86A6BC', side: '#62809A', line: '#24384A', mark: '#EEF6F9', markHi: '#FFFFFF' };
const goldWax = (T) => ({ hi: '#FFF6C8', mid: T.goldHi, sh: T.gold, side: T.goldSh, line: T.goldLine, mark: '#8A3A1E', markHi: T.goldSh });
const paleGold = (T) => ({ hi: '#FFFDF0', mid: '#F2E6B4', sh: '#D2BE78', side: T.goldSh, line: T.goldLine, mark: '#9FC4D6', markHi: '#FFFFFF' });
const matOf = (kind, T) => (kind === 'gold' ? goldWax(T) : kind === 'ghost' ? PALE : kind === 'ghostgold' ? paleGold(T) : WAX);
const CRIMSON = { hi: '#EE7A70', mid: '#C42C3C', sh: '#86202E', line: '#2A0C14' };
const DUST = { hi: '#EFE4C8', mid: '#CDBB96', sh: '#9E8C6C', line: '#5A4C3A' };

// ------------------------------------------------------------------------------------------------ art (cached by size)
/**
 * The wax seal lying on the ground (rx x ry px ellipse; ry = rx x the camera's foreshortening; face-on when ry = rx):
 * a bumpy wax rim (8 lobes), a lit upper-left band, a shaded lower-right band, the impression groove, a 4-point mark in
 * the middle (gold on red / pale, rust on gold), its thickness as a darker band under the near rim, 1-px line.
 * kind 'red' | 'gold' | 'ghost' | 'ghostgold'. -> PixelImage, centre at (ox, oy) (img.ox / img.oy).
 */
function sealArt(kind, rx, ry, T, th = 1) {
  return memo(`seal|${kind}|${rx}|${ry}|${th}|${T.gold}`, () => {
    const M = matOf(kind, T);
    const R = Math.ceil(rx * 1.12) + 2, Rv = Math.ceil(ry * 1.12) + 2 + th;
    const img = new PixelImage(2 * R + 1, 2 * Rv + 1);
    const cx = R + 0.5, cy = Rv + 0.5 - th / 2;
    const inside = (x, y, dy = 0) => {
      const ax = (x + 0.5 - cx) / rx, ay = (y + 0.5 - cy - dy) / ry, d = Math.hypot(ax, ay), a = Math.atan2(ay, ax);
      return d <= 1 + 0.085 * Math.cos(a * 8 + 0.4);
    };
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const top = inside(x, y), body = !top && th > 0 && [1, 2, 3].slice(0, th).some((q) => inside(x, y, q));
      if (!top && !body) continue;
      if (body) { img.set(x, y, M.side); continue; }
      const ax = (x + 0.5 - cx) / rx, ay = (y + 0.5 - cy) / ry, d = Math.hypot(ax, ay), lit = -ax * 0.7 - ay * 0.7;
      let c = M.mid;
      if (d > 0.74 && lit > 0.3) c = M.hi;
      else if (d > 0.74 && lit < -0.3) c = M.sh;
      else if (d > 0.5 && d < 0.62) c = lit > 0.2 ? M.mid : M.sh;                   // the impression groove
      // the mark: a 4-point star / diamond in the middle
      const s = Math.abs(ax) + Math.abs(ay) * 1.0, st = Math.min(Math.abs(ax), Math.abs(ay));
      if (s < 0.26 || (st < 0.06 && Math.max(Math.abs(ax), Math.abs(ay)) < 0.4)) c = (ax + ay < 0 ? M.markHi : M.mark);
      img.set(x, y, c);
    }
    img.outline(M.line);
    img.ox = R; img.oy = Rv;
    return img;
  });
}
/** A dust puff round the seal's slam (k 0..3): 7 tufts flung out along the ground, swelling then thinning */
function dustArt(k, rx, ry, q) {
  return memo(`dust|${k}|${rx}|${ry}|${q}`, () => {
    const R = Math.ceil(rx * 1.9) + 4 * q, Rv = Math.ceil(ry * 1.9) + 6 * q;
    const img = new PixelImage(2 * R + 1, 2 * Rv + 1), cx = R + 0.5, cy = Rv + 0.5;
    const f = [0.95, 1.25, 1.5, 1.7][k], r = [1.6, 2.3, 2.6, 2.2][k] * q, lift = [0.5, 1.5, 2.5, 3.5][k] * q;
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(a) * rx * f, y = cy + Math.sin(a) * ry * f - lift * (0.6 + 0.4 * ((j * 3) % 2));
      img.disc(x, y, r * (j % 2 ? 0.85 : 1), DUST.mid);
    }
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      if (!img.alpha(x, y)) continue;
      if (!img.alpha(x - 1, y) || !img.alpha(x, y - 1)) img.set(x, y, DUST.hi);
      else if (!img.alpha(x + 1, y) || !img.alpha(x, y + 1)) img.set(x, y, DUST.sh);
    }
    img.outline(DUST.line);
    img.ox = R; img.oy = Rv;
    return k >= 2 ? dissolve(img, k === 2 ? 0.25 : 0.5) : img;
  });
}
/** The wax drops flung from the slam: 7 drops; k 0..2 in flight (rising arcs), 3 = at rest round the seal */
function dropsArt(k, rx, ry, q, kind, T) {
  return memo(`drops|${k}|${rx}|${ry}|${q}|${kind}|${T.gold}`, () => {
    const M = matOf(kind, T);
    const R = Math.ceil(rx * 1.6) + 3 * q, Rv = Math.ceil(ry * 1.6) + 6 * q;
    const img = new PixelImage(2 * R + 1, 2 * Rv + 1), cx = R, cy = Rv;
    const f = [1.0, 1.2, 1.36, 1.42][k], lift = [3, 4, 2, 0][k] * q;
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * Math.PI * 2 + 0.9 + hash(j) * 0.4, ff = f * (0.92 + 0.16 * hash(j + 5));
      const x = Math.round(cx + Math.cos(a) * rx * ff), y = Math.round(cy + Math.sin(a) * ry * ff - lift);
      const w = j % 3 === 0 ? 2 * q : q + (q > 1 ? 1 : 0);
      img.rect(x, y, w, Math.max(1, q), M.mid);
      img.set(x, y, M.hi);
    }
    img.outline(M.line);
    img.ox = R; img.oy = Rv;
    return img;
  });
}
/** Short slam dashes radiating from the seal's rim (the impact drawing) */
function slamArt(rx, ry, q, T) {
  return memo(`slam|${rx}|${ry}|${q}|${T.gold}`, () => {
    const R = Math.ceil(rx * 1.7) + 2, Rv = Math.ceil(ry * 1.9) + 2;
    const img = new PixelImage(2 * R + 1, 2 * Rv + 1), cx = R, cy = Rv;
    for (const a of [-2.6, -1.9, -1.25, -0.55, 0.55, 2.6]) {
      const x0 = cx + Math.cos(a) * rx * 1.18, y0 = cy + Math.sin(a) * ry * 1.25, x1 = cx + Math.cos(a) * rx * 1.6, y1 = cy + Math.sin(a) * ry * 1.75;
      img.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), T.parchmentHi);
    }
    img.outline(T.outline);
    img.ox = R; img.oy = Rv;
    return img;
  });
}
/** The brass seal-press (the hand's lock): a brass block with a turned wooden knob, w px wide; pressed = 1 px squat */
function stampArt(w, q, T, pressed = false) {
  return memo(`stamp|${w}|${q}|${pressed}|${T.gold}`, () => {
    const bw = w, bh = Math.round(w * (pressed ? 0.42 : 0.5)), ew = Math.max(2, Math.round(w * 0.18));
    const nw = Math.max(2 * q, Math.round(w * 0.34)), nh = Math.round(w * 0.32), kw = Math.round(w * 0.62), kh = Math.round(w * 0.44);
    const W = bw + 4, H = kh + nh + bh + ew + 4;
    const img = new PixelImage(W, H), cx = W / 2;
    const B = { hi: T.goldHi, mid: T.gold, sh: T.goldSh, line: T.goldLine }, WOOD = { hi: '#C08A5A', mid: '#8E5A36', sh: '#5E3A22' };
    // knob (an ellipse), neck, block (+ its bottom face as an ellipse lip)
    const ky = 2 + kh / 2;
    img.ellipse(cx, ky, kw / 2, kh / 2, WOOD.mid);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img.alpha(x, y)) { const lx = (x + 0.5 - cx) / (kw / 2), ly = (y + 0.5 - ky) / (kh / 2); if (lx + ly < -0.6) img.set(x, y, WOOD.hi); else if (lx + ly > 0.6) img.set(x, y, WOOD.sh); }
    const ny = Math.round(2 + kh - 1);
    img.rect(Math.round(cx - nw / 2), ny, nw, nh, B.mid); img.rect(Math.round(cx - nw / 2), ny, Math.max(1, q), nh, B.hi);
    const by = ny + nh;
    img.rect(Math.round(cx - bw / 2), by, bw, bh, B.mid);
    for (let y = by; y < by + bh; y++) { for (let i = 0; i < Math.max(1, q); i++) img.set(Math.round(cx - bw / 2) + i, y, B.hi); for (let i = 1; i <= 2 * q; i++) img.set(Math.round(cx + bw / 2) - i, y, B.sh); }
    img.ellipse(cx, by + bh, bw / 2, ew / 2, B.sh);
    img.ellipse(cx, by, bw / 2, ew / 2, B.hi);
    img.outline(B.line);
    img.ox = Math.round(cx); img.oy = H - 2;              // anchor: the middle of the press face's bottom
    return img;
  });
}
/** The brass chime ring of a lock (k 0..2, expanding) round an rx x ry ellipse */
function chimeArt(k, rx, ry, q, T) {
  return memo(`chime|${k}|${rx}|${ry}|${q}|${T.gold}`, () => {
    const s = 1.15 + 0.3 * k, R = Math.ceil(rx * s) + 3, Rv = Math.ceil(ry * s) + 3;
    const o = new PixelImage(2 * R + 1, 2 * Rv + 1), cx = R + 0.5, cy = Rv + 0.5;
    for (let i = 0; i < q; i++) o.ring(cx, cy, rx * s - i, ry * s - i * 0.5, k === 0 ? '#FFFFFF' : k === 1 ? T.goldHi : T.gold);
    if (k === 2) for (let x = 0; x < o.w; x += 2) for (let y = 0; y < o.h; y++) o.erase(x, y);
    o.outline(T.goldLine);
    o.ox = R; o.oy = Rv;
    return o;
  });
}
/** The flash as the stamp presses (a white-gold ring hugging the seal) */
function flashArt(rx, ry, q, T) {
  return memo(`flash|${rx}|${ry}|${q}|${T.gold}`, () => {
    const R = Math.ceil(rx) + 4, Rv = Math.ceil(ry) + 4, o = new PixelImage(2 * R + 1, 2 * Rv + 1);
    A.annulus(o, R + 0.5, Rv + 0.5, rx + 2 * q, ry + 1.5 * q, { hi: '#FFFFFF', mid: '#FFF6C8', sh: T.goldHi, line: T.goldLine }, { tx: 2 * q, ty: q });
    o.ox = R; o.oy = Rv;
    return o;
  });
}
/** The ghost token: a small pale sheet ghost (h px tall) hovering at the seat; k = the hem's wave drawing */
function ghostArt(h, k, T) {
  return memo(`gtok|${h}|${k}|${T.gold}`, () => {
    const w = Math.max(7, Math.round(h * 0.62)) | 1, W = w + 4, H = h + 4;
    const img = new PixelImage(W, H), cx = W / 2, r = w / 2;
    const hi = '#F4FAFC', mid = T.ghost, sh = T.ghostSh, line = ghostLine(T);
    img.disc(cx, 2 + r, r, mid);
    img.rect(Math.round(cx - r), Math.round(2 + r), w, Math.round(h - r - 2), mid);
    const hemY = 2 + h - 2, n = 3;
    for (let j = 0; j < n; j++) {                                         // the wavy hem: n scallops, shifted by k
      const x0 = Math.round(cx - r + (j + (k ? 0.5 : 0)) * (w / n));
      img.disc(x0 + w / n / 2, hemY, w / n / 2, mid);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!img.alpha(x, y)) continue;
      if (!img.alpha(x - 1, y) || !img.alpha(x, y - 1)) img.set(x, y, hi);
      else if (!img.alpha(x + 1, y)) img.set(x, y, sh);
    }
    const ey = Math.round(2 + r * 0.95), ex = Math.max(1, Math.round(r * 0.42)), es = Math.max(1, Math.round(h / 12));
    img.rect(Math.round(cx - ex - es / 2), ey, es, es + 1, line); img.rect(Math.round(cx + ex - es / 2), ey, es, es + 1, line);
    img.outline(line);
    img.ox = Math.round(cx); img.oy = H - 2;                    // anchor: the hem's bottom middle
    return img;
  });
}
/** The nominee's ring round the feet (crimson; `block` = on the block: + a gold inner ring and 4 gold studs) */
function nomRingArt(rx, ry, q, T, block) {
  return memo(`nom|${rx}|${ry}|${q}|${block}|${T.gold}`, () => {
    const R = Math.ceil(rx) + 3 * q, Rv = Math.ceil(ry) + 3 * q;
    const img = new PixelImage(2 * R + 1, 2 * Rv + 1), cx = R + 0.5, cy = Rv + 0.5;
    A.annulus(img, cx, cy, rx, ry, CRIMSON, { tx: 3 * q, ty: 2 * q });
    if (block) {
      const g = new PixelImage(img.w, img.h);
      for (let i = 0; i < q; i++) g.ring(cx, cy, rx - 3 * q - 1 - i, ry - 2 * q - 1 - i * 0.5, T.goldHi);
      img.blit(g, 0, 0);
      for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
        const x = Math.round(cx + Math.cos(a) * (rx - 1.5 * q)), y = Math.round(cy + Math.sin(a) * (ry - q));
        img.rect(x - q, y - q, 2 * q, 2 * q, T.goldHi); img.set(x - q, y - q, '#FFFFFF');
      }
    }
    img.ox = R; img.oy = Rv;
    return img;
  });
}
/** The threshold burst at the nominee (k 0..3): crimson + gold rings racing out */
function burstArt(k, rx, ry, q, T) {
  return memo(`burst|${k}|${rx}|${ry}|${q}|${T.gold}`, () => {
    const s = 1.2 + 0.45 * k, R = Math.ceil(rx * s) + 4, Rv = Math.ceil(ry * s) + 4;
    const o = new PixelImage(2 * R + 1, 2 * Rv + 1), cx = R + 0.5, cy = Rv + 0.5;
    for (let i = 0; i < 2 * q; i++) o.ring(cx, cy, rx * s - i, ry * s - i * 0.5, i < q ? CRIMSON.hi : CRIMSON.mid);
    for (let i = 0; i < q; i++) o.ring(cx, cy, rx * s * 0.78 - i, ry * s * 0.78 - i * 0.5, T.goldHi);
    if (k >= 2) for (let x = 0; x < o.w; x += 2) for (let y = 0; y < o.h; y++) o.erase(x + (y & 1), y);
    o.outline(CRIMSON.line);
    o.ox = R; o.oy = Rv;
    return o;
  });
}
/** The clock hand's outer end on the ground in LIT brass (a gold shaft, a pale-gold light line, the line tone under it,
 *  a chevron tip): from (x0, y0) to (x1, y1) px. -> { im, x, y } (top-left) */
const DIRV = { right: [1, 0], 'down-right': [1, 1], down: [0, 1], 'down-left': [-1, 1], left: [-1, 0], 'up-left': [-1, -1], up: [0, -1], 'up-right': [1, -1] };
const DIRS8 = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
const tipArt = (dir, q, T) => memo(`htip|${dir}|${q}|${T.gold}`, () => {
  const S = 7 * q, m = new PixelImage(S, S);
  const [vx, vy] = DIRV[dir], n = Math.hypot(vx, vy), ux = vx / n, uy = vy / n, px = -uy, py = ux, c = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, a = (dx * ux + dy * uy) / q, b = Math.abs(dx * px + dy * py) / q;
    if (a >= -1.6 && a <= 2.3 && b <= (2.3 - a) * 0.62 + 0.15) m.set(x, y, T.goldHi);
  }
  return A.shade(m, { hi: '#FFF6C8', mid: T.goldHi, sh: T.gold, line: T.goldLine });
});
function handArt(x0, y0, x1, y1, q, T) {
  const pad = 6 * q, minx = Math.min(x0, x1) - pad, miny = Math.min(y0, y1) - pad;
  const s = new PixelImage(Math.abs(x1 - x0) + 2 * pad + 1, Math.abs(y1 - y0) + 2 * pad + 1);
  const ax = x0 - minx, ay = y0 - miny, bx = x1 - minx, by = y1 - miny;
  const steep = Math.abs(by - ay) > Math.abs(bx - ax), off = (k) => (steep ? [k, 0] : [0, k]);
  for (let k = q + 1; k >= -1; k--) {
    const [ox, oy] = off(k), c = k === -1 ? '#FFF6C8' : k > q - 1 ? T.goldLine : k === 0 ? T.goldHi : T.gold;
    s.line(ax + ox, ay + oy, bx + ox, by + oy, c);
  }
  const ang = Math.atan2(by - ay, bx - ax), d = DIRS8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  const tp = tipArt(d, q, T);
  s.blit(tp, bx - (tp.w >> 1), by - (tp.h >> 1));
  s.outline(T.goldLine);
  return { im: s, x: minx, y: miny };
}
/** A 1x / HD spark at (x, y): r 0 = a mote, r >= 1 = a plus (HD: 1-px arms, 2r long) */
function sparkQ(img, x, y, r, q, S) {
  x |= 0; y |= 0;
  if (q === 1) { A.spark(img, x, y, r, S); return; }
  if (r <= 0) { img.rect(x, y, 2, 2, S.arm); img.set(x, y, S.core); return; }
  A.spark(img, x, y, 2 * r, S);
  if (r >= 2) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) img.set(x + dx, y + dy, S.arm);
}

// ------------------------------------------------------------------------------------------------ the tally plaque
// (vote-fix4) COMPACT + out of the ring's way: on a wide screen (visible area >= PLAQUE.topMinW logical px) the plaque
// sits TOP LEFT, under the clock / phase chips ("THE VOTE" -> "Clover: 5 votes · 7 needed"), where the stage-A frame
// never puts a seat (the ring's near tip is bottom centre, right over the action bar: a plaque there cost the frame
// ~22 of 360 rows, the figures 57.7 -> 49.1 px). On a narrow screen (a phone: the frame is width-bound, rows are free)
// it stays bottom centre above the action bar. The threshold text is the compact form everywhere ("Clover: ON THE
// BLOCK · 9 votes"): <= ~170 px with the longest short name, clear of the centred caption (<= 232 px) at 640 px.
export const PLAQUE = { h: 15, pad: 9, gap: 4, topMinW: 400 };
/** where the plaque goes on a visible area visW logical px wide: 'top' (left, under the chips) | 'bottom' (centre) */
export const plaqueSpot = (visW) => (visW >= PLAQUE.topMinW ? 'top' : 'bottom');
/** the plaque's text: the NOMINEE (critic-3 P1-3: named for the whole vote) + the count. Before the threshold
 *  "Clover: 3 votes · 7 needed"; from it "Clover: 9 votes · 7 needed · ON THE BLOCK" (narrow: "Clover: ON THE BLOCK ·
 *  9 votes"). Segments n (name) a (the count) b c, drawn in their own inks. */
export function plaqueText(tally, needed, passed, narrow, name = '') {
  const v = `${tally} vote${tally === 1 ? '' : 's'}`, n = name ? `${name}: ` : '';
  if (!passed) return { n, a: v, b: ` · ${needed} needed`, c: '' };
  return narrow ? { n, a: '', b: 'ON THE BLOCK · ', c: v, block: true } : { n, a: v, b: ` · ${needed} needed · `, c: 'ON THE BLOCK' };
}
const textOf = (o) => `${o.n}${o.a}${o.b}${o.c}`;
/** the plaque's width (logical px) for that count: snug round its text */
export const plaqueWidth = (tally, needed, passed, narrow, name = '') => textWidth(textOf(plaqueText(tally, needed, passed, narrow, name))) + 2 * PLAQUE.pad;
/** the widest the plaque gets on a visible area `visW` wide (the vote camera's keep-out: the threshold text, 2 digits,
 *  a long name) */
export const plaqueW = (visW) => Math.max(plaqueWidth(15, 15, true, true, 'Croaksworth'), plaqueWidth(15, 15, false, true, 'Croaksworth'));
/** a nominee's name for the plaque: a titled name's last word when it is long ("Archivist Hoot" -> "Hoot") */
export const shortName = (s) => { const w = String(s).split(' '); return w.length > 1 && s.length > 11 ? w[w.length - 1] : s; };

// ------------------------------------------------------------------------------------------------ the module
export function createVoteMarks(demo) {
  const { engine, store, events } = demo;
  const gameui = demo.gameui, L = gameui?.layers;
  if (!L?.add || typeof gameui.voteOf !== 'function') return null;
  const params = demo.params ?? new URLSearchParams();
  if (params.get('voteMarks') === '0') return null;
  const reduced = params.get('rm') === '1';
  const stage = () => demo.passB?.stage ?? null;
  const seats = () => demo.passB?.seats ?? null;
  const cam = engine.camera;
  const P = new THREE.Vector3();
  const C = demo.layout?.CIRCLE ?? { cx: 22.5, cz: 19.75 };
  let spots = null;
  if (params.get('spotlights') !== '0') { try { spots = createSpotlights(engine); } catch (e) { console.warn('[passB] spotlights unavailable:', e); spots = null; } }

  // the last vote: its final state is held (dissolving) END_S after the vote phase ends
  let last = null;          // { v, V, S, endedAt, lastTally, liftAt, bell }
  const info = { phase: null, seats: {}, tally: 0, needed: 0, passed: false, passedAt: null, bell: 0, current: null, plaque: null, hand: false, poofs: 0, drawn: 0, events: [], hd: null, nominee: null, spot: null };
  const log = (e) => { info.events.push(e); if (info.events.length > 60) info.events.shift(); };
  const markTop = new Map();
  const prevKind = new Map();
  const sealLog = () => demo.time?.seals?.log ?? new Map();

  /** the vote's seal state at demo time t (sealvote.js), or the last vote's held final state */
  function voteState(t) {
    const ph = store.state.phase, V = gameui.voteOf(t);
    if (V && ph === 'vote') {
      if (!last || last.v !== V.v) last = { v: V.v, V, S: null, endedAt: null, lastTally: null, liftAt: null, bell: false };
      last.V = V; last.endedAt = null;
      last.S = sealVoteAt(V, t, sealLog());
    } else if (last && last.endedAt === null) last.endedAt = t;
    return last && (last.endedAt === null || t - last.endedAt < END_S) ? last : null;
  }
  /** per seat (0-based) the kind + the times its drawings run from (pure) */
  function kindsAt(t, live) {
    const s = store.state, out = {};
    const S = live?.S;
    for (let i = 0; i < N; i++) {
      const st = s.seats[i];
      if (!(st.occupied || st.dead)) continue;
      const dead = !!st.dead, ghostVote = dead && st.ghostVote !== false;
      const d = S?.seats?.[i + 1];
      let kind = dead ? (ghostVote ? 'ghost' : 'spent') : 'waiting', since = null, lockAt = null, wdAt = null;
      if (d) {
        const pale = d.ghost;
        if (d.yes) { kind = pale ? 'ghost-counted' : 'counted'; since = d.changeAt; lockAt = d.lockAt; }
        else if (d.no) kind = pale ? 'ghost-passed' : dead ? 'spent' : 'passed';
        else if (d.down) { kind = pale ? 'ghost-sealed' : 'sealed'; since = d.changeAt; }
        else if (d.changeAt != null && !d.on) { wdAt = d.changeAt; if (t - wdAt < T_WD / GRID_HZ) kind = pale ? 'ghost-withdrawn' : 'withdrawn'; }
        // a ghost who passed with the token still up keeps it until the vote ends; one counted is spent after it
        if (kind === 'ghost-passed' && !d.eligible) kind = 'spent';
      }
      out[i] = { kind, since, lockAt, wdAt, ghost: dead, current: S?.current === i + 1, nominee: (live?.v?.nominee ?? (s.nominee ?? -1) + 1) === i + 1 };
    }
    return out;
  }

  const towardCam = () => { const y = cam.yaw; return new THREE.Vector3(Math.sin(y), 0, Math.cos(y)); };
  /** where seat i's seal lies: SEAL_AHEAD m in front of the feet FACING THE DAIS (the ring's centre / the court's
   *  focus); where that would put it behind the figure (the near arc: the dais lies away from the viewer) it turns toward
   *  the viewer, blended between - so it always shows, at its own voter's feet, inward of them (never between two
   *  neighbours stacked on screen at the ring's sides) */
  const sealDir = new THREE.Vector3();
  function sealDirOf(at, toCam) {
    const st = stage(), staged = !!st && !st.onStones && st.active;
    const fx = staged ? at.pos.x + Math.sin(at.face ?? 0) : C.cx, fz = staged ? at.pos.z + Math.cos(at.face ?? 0) : C.cz;
    sealDir.set(fx - at.pos.x, 0, fz - at.pos.z).normalize();
    const dot = sealDir.dot(toCam), w = Math.min(1, Math.max(0, (-dot - 0.25) / 0.5));
    return sealDir.lerp(toCam, w).normalize();
  }
  const sealBoxes = new Map();   // seat -> the seal's box (L.world texels) last frame (gameui keeps names off it)
  const groundApi = demo.town?.registry?.get?.('ground')?.api;
  const terrain = (x, z) => (typeof groundApi?.heightAt === 'function' ? groundApi.heightAt(x, z) : 0);
  // the staging's hub (the court) or the dais' centre (on the stones) for the clock hand drawn on the ground
  const hubOf = () => {
    const st = stage();
    if (st && !st.onStones && st.active) {
      if (st.hub) return st.hub;
      let x = 0, z = 0;
      for (const p of st.spots) { x += p.x; z += p.z; }
      return new THREE.Vector3(x / N, 0, z / N + 1.6);
    }
    return new THREE.Vector3(C.cx, 0.05, C.cz);
  };

  const draw = (LL) => {
    const T = LL.tok, t = LL.t, ph = store.state.phase;
    const HD = LL.hd && LL.hd.d > 1 ? LL.hd : null, q = HD ? HD.d : 1, kk = HD ? HD.k : 1;
    const atW = (p) => (HD ? HD.at(p) : LL.at(p));
    const Wimg = HD ? HD.world : LL.world;
    const night = T.labelLine === '#141325';
    info.drawn = 0; info.hd = HD ? { d: q, k: +kk.toFixed(3) } : null;
    const sc = seats();
    // ---- the gather puffs (votestage.js): the Storyteller's poof on the stone and on the vote spot (stages B..N)
    const stg = stage(), g = stg?.gather;
    info.poofs = 0;
    if (g && !stg.onStones && sc && !reduced) {
      const F = EV.framesFor(T), LP = HD ? worldLayerHD(LL) : LL;
      for (let i = 0; i < N; i++) {
        const st = store.state.seats[i];
        if (!(st.occupied || st.dead)) continue;
        const k = gk(t - (g.t0 + i * GATHER_STAGGER));
        if (k < 0 || k >= 12) continue;
        const stone = demo.layout.seatPos(i, N), spot = stg.spots[i];
        for (const p of [[stone.x, 0.235, stone.z], [spot.x, spot.y ?? 0, spot.z]]) EV.drawPoof(LP, F, LP.at(P.set(...p)), k, { appear: true });
        info.poofs++;
      }
      if (stg.active) for (let i = 0; i < N; i++) {
        const at = sc.spotOf(i);
        if (!at?.shown || !at.staged || at.shownAt == null) continue;
        const k = gk(t - at.shownAt);
        if (k >= 0 && k < 12) { EV.drawPoof(LP, F, LP.at(at.pos), k, { appear: true }); info.poofs++; }
      }
    }
    const live = voteState(t);
    const active = ph === 'vote' || ph === 'nomination' || !!live;
    if (!active || !sc) {
      info.phase = ph; info.seats = {}; markTop.clear(); info.nominee = null;
      if (spots) { spots.allOff(); info.spot = null; }
      if (!live) { info.plaque = null; Object.assign(info, { tally: 0, needed: 0, passed: false, passedAt: null, current: null }); }
      return;
    }
    info.phase = ph;
    const K = kindsAt(t, live);
    const S = live?.S ?? null;
    const fade = live?.endedAt != null ? Math.min(0.75, Math.floor((t - live.endedAt) / 0.125) * 0.25) : 0;
    const blitF = (img, im, x, y) => { fastBlit(img, fade > 0 ? dissolve(im.clone(), fade, x & 3, y & 3) : im, x, y); info.drawn++; };
    const ground = (im, x, y, p, anchorRow) => {
      if (HD) putGroundHD(HD, im, x, y, p, { anchorRow, k: fade });
      else blitF(LL.ground, im, x, y);
      info.drawn++;
    };
    const tw = cam.texelWorld, sp = Math.sin(cam.pitch);
    const toCam = towardCam();
    const pxOf = (m) => Math.max(2, Math.round((m / tw) * kk));            // world metres -> tier px
    // ---- the clock hand on the ground, lit brass, at the current voter
    info.hand = false;
    if (S && S.current != null && !S.done && live.endedAt == null) {
      const i = S.current - 1, at = sc.spotOf(i);
      if (at) {
        const hub = hubOf(), staged = !!stg && !stg.onStones && stg.active;
        // the hand turns voter to voter in the events vote's stepped drawings (S.hand: from, to, u)
        const pa = sc.spotOf(S.hand.from - 1)?.pos ?? at.pos, pb = at.pos;
        const u = reduced ? 1 : Math.min(1, S.hand.u);
        const a0 = Math.atan2(pa.x - hub.x, pa.z - hub.z), a1 = Math.atan2(pb.x - hub.x, pb.z - hub.z);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const ang = a0 + da * u;
        const r = Math.hypot(pb.x - hub.x, pb.z - hub.z);
        // the outer part only (stage A: from just past the dais' treads to just before the stone)
        const r0 = staged ? 0.4 : Math.max(2.9, r * 0.5), r1 = Math.max(r0 + 0.5, r - 0.62 * at.scale);
        const y = staged ? terrain(hub.x, hub.z) + 0.03 : 0.05;
        const e0 = new THREE.Vector3(hub.x + Math.sin(ang) * r0, y, hub.z + Math.cos(ang) * r0), e1 = new THREE.Vector3(hub.x + Math.sin(ang) * r1, y, hub.z + Math.cos(ang) * r1);
        const h0 = atW(e0), h1 = atW(e1);
        const hh = handArt(Math.round(h0.x), Math.round(h0.y), Math.round(h1.x), Math.round(h1.y), q, T);
        ground(hh.im, hh.x, hh.y, e0, Math.round(h0.y) - hh.y);
        info.hand = true;
      }
    }
    // ---- the nominee: the crimson ring (the block ring from the threshold) + the threshold burst
    const nomIdx = live?.v ? live.v.nominee - 1 : (store.state.nominee ?? store.state.seats.findIndex((x) => x.nominated));
    info.nominee = null;
    if (nomIdx != null && nomIdx >= 0 && (ph === 'nomination' || ph === 'vote' || live)) {
      const at = sc.spotOf(nomIdx);
      if (at?.shown) {
        const f = atW(at.pos), rx = pxOf(0.66 * at.scale), ry = Math.max(2, Math.round(rx * sp * 1.02));
        const passed = S?.passedAt != null && t >= S.passedAt;
        const im = nomRingArt(rx, ry, q, T, passed);
        ground(im, Math.round(f.x) - im.ox, Math.round(f.y) - im.oy, at.pos, im.oy);
        if (passed && !reduced) {
          const k = gk(t - S.passedAt);
          if (k >= 0 && k < 12) { const b = burstArt(Math.min(3, k >> 2), rx, ry, q, T); ground(b, Math.round(f.x) - b.ox, Math.round(f.y) - b.oy, at.pos, b.oy); }
          if (k >= 0 && k < 14) {
            const G = { core: '#FFFFFF', arm: T.goldHi, tip: T.gold }, hp = atW(at.pos.clone().setY(at.pos.y + at.height * 0.55));
            for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2 + k * 0.08, rr = (8 + k * 2.2) * q; sparkQ(Wimg, hp.x + Math.cos(a) * rr * 1.2, hp.y + Math.sin(a) * rr * 0.8, k < 7 ? 1 : 0, q, G); }
          }
        }
        info.nominee = { seat: nomIdx, block: passed };
      }
    }
    // ---- per seat (far first: nearer pieces print over farther ones)
    const marks = {}, at0 = {};
    for (const i of Object.keys(K)) at0[i] = sc.spotOf(Number(i));
    const order = Object.keys(K).map(Number).sort((a, b) => (at0[a]?.pos.z ?? 0) - (at0[b]?.pos.z ?? 0));
    markTop.clear();
    const lit = new Set();
    for (const i of order) {
      const m = K[i], at = at0[i];
      if (!at || !at.shown) { spots?.off(i); continue; }
      if (prevKind.get(i) !== m.kind) { if (prevKind.has(i)) log({ seat: i, kind: m.kind, t: +t.toFixed(2) }); prevKind.set(i, m.kind); }
      const sc1 = at.scale ?? 1;
      // the seal's spot: SEAL_AHEAD m in front of the feet, facing the dais (sealDirOf), on the ground (stage A: the ring)
      const dir = sealDirOf(at, toCam), sx = at.pos.x + dir.x * SEAL_AHEAD * sc1, sz = at.pos.z + dir.z * SEAL_AHEAD * sc1;
      const gy = at.staged ? terrain(sx, sz) + 0.03 : 0.05;
      const sp0 = new THREE.Vector3(sx, gy, sz);
      const f = atW(sp0), fx = Math.round(f.x), fy = Math.round(f.y);
      const rx = pxOf(SEAL_M * sc1), ry = Math.max(2, Math.round(rx * sp * 1.04)), th = Math.max(1, q);
      // (vote-fix4) the seal's BODY (+ its rim / thickness, 1 px): a name may graze the settled wax drops round it, never
      // the seal (was x 1.4 / 1.6: on the phone it kept 4 side names out)
      { const s1 = 1 / kk; sealBoxes.set(i, { x0: Math.floor((fx - rx * 1.15 - q) * s1), x1: Math.ceil((fx + rx * 1.15 + q) * s1), y0: Math.floor((fy - ry * 1.2 - q) * s1), y1: Math.ceil((fy + ry * 1.2 + th + q) * s1) }); }
      const handP = atW(at.pos.clone().setY(at.pos.y + at.height * 0.98).addScaledVector(toCam, 0.3 * sc1));
      const kind = m.kind, pale = kind.startsWith('ghost');
      const red = pale ? 'ghost' : 'red', gold = pale ? 'ghostgold' : 'gold';
      let drawn = null;
      const restSeal = (kd) => { const im = sealArt(kd, rx, ry, T, th); ground(im, fx - im.ox, fy - im.oy, sp0, im.oy); };
      const drops = (k, kd) => { const im = dropsArt(Math.min(3, k), rx, ry, q, kd, T); if (k >= 3) ground(im, fx - im.ox, fy - im.oy, sp0, im.oy); else blitF(Wimg, im, fx - im.ox, fy - im.oy); };
      // the seal in the air (face-on, shrinking with height): u = 0 at the hand .. 1 on the ground
      const airSeal = (kd, u) => {
        const r = Math.max(2, Math.round(rx * (0.8 + 0.2 * u))), rv = Math.max(2, Math.round(r + (ry - r) * u * u));
        const im = sealArt(kd, r, rv, T, th), x = Math.round(handP.x + (fx - handP.x) * u), y = Math.round(handP.y + (fy - handP.y) * u);
        blitF(Wimg, im, x - im.ox, y - im.oy);
        return y;
      };
      if (kind === 'sealed' || kind === 'ghost-sealed') {
        const k = reduced ? 99 : gk(t - (m.since ?? -1e9));
        if (k < 2) { airSeal(red, 0); drawn = 'lift'; }
        else if (k < T_SLAM) {
          const y = airSeal(red, k === 2 ? 0.45 : 0.85);
          for (const dx of [-Math.round(rx * 0.45), 0, Math.round(rx * 0.45)]) Wimg.rect?.(fx + dx, y - (6 + Math.abs(dx) % 3) * q - Math.round(ry), Math.max(1, q >> 1) || 1, 4 * q, T.parchmentHi);
          drawn = 'fall';
        } else {
          if (k < T_SLAM + 2) {
            // the SLAM: squashed wide + the slam dashes
            const im = sealArt(red, Math.round(rx * 1.22), Math.max(2, Math.round(ry * 0.78)), T, th);
            ground(im, fx - im.ox, fy - im.oy, sp0, im.oy);
            const sl = slamArt(rx, ry, q, T); blitF(Wimg, sl, fx - sl.ox, fy - sl.oy);
            drawn = 'slam';
          } else { restSeal(red); drawn = k < T_REST ? 'settle' : 'rest'; }
          drops(Math.floor((k - T_SLAM) / 2), red);
          if (k - T_SLAM < 8) { const du = dustArt(Math.min(3, (k - T_SLAM) >> 1), rx, ry, q); blitF(Wimg, du, fx - du.ox, fy - du.oy); }
        }
        spots?.off(i);
      } else if (kind === 'withdrawn' || kind === 'ghost-withdrawn') {
        const k = gk(t - m.wdAt);
        if (k < 2) {
          const im = sealArt(red, rx, ry, T, th); blitF(Wimg, im, fx - im.ox, fy - im.oy - 2 * q);   // un-stamped: a hop
          drawn = 'unstamp';
        } else if (k < 6) { airSeal(red, k < 4 ? 0.6 : 0.25); drawn = 'rise'; }
        else if (k < T_WD) { const du = dustArt(k < 8 ? 1 : 2, Math.round(rx * 0.5), Math.round(rx * 0.5), q); blitF(Wimg, du, Math.round(handP.x) - du.ox, Math.round(handP.y) - du.oy); drawn = 'gone'; }
        spots?.off(i);
      } else if (kind === 'counted' || kind === 'ghost-counted') {
        const k = reduced ? 99 : gk(t - m.lockAt);
        const pressed = k >= 3;
        restSeal(pressed ? gold : red);
        drops(3, pressed ? gold : red);
        if (k < T_STAMP) {
          // the brass stamp: down (3 drawings), pressed (2), up (2)
          const w = Math.round(rx * 1.5), st = stampArt(w, q, T, k >= 3 && k < 5), drop = Math.round((ry + 26 * q) * 1.0);
          const dy = k < 3 ? [1, 0.55, 0.2][k] * drop : k < 5 ? 0 : k < 8 ? 0.35 * drop : 0.8 * drop;
          if (k < 10) blitF(Wimg, st, fx - st.ox, Math.round(fy - Math.round(ry * 0.35) - dy) - st.oy);
          if (k >= 3 && k < 5) { const fl = flashArt(rx, ry, q, T); blitF(Wimg, fl, fx - fl.ox, fy - fl.oy); }
          if (k >= 3) { const ch = chimeArt(Math.min(2, (k - 3) / 3 | 0), rx, ry, q, T); ground(ch, fx - ch.ox, fy - ch.oy, sp0, ch.oy); }
          if (k >= 4 && k < 11) {
            const G = pale ? { core: '#FFFFFF', arm: T.ghost, tip: T.ghostSh } : { core: '#FFFFFF', arm: T.goldHi, tip: T.gold };
            for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2 + 0.78, rr = 1 + (k - 4) * 0.16; sparkQ(Wimg, fx + Math.cos(a) * rx * rr * 1.25, fy + Math.sin(a) * ry * rr * 1.6 - (k - 4) * q, k < 8 ? 1 : 0, q, G); }
          }
          drawn = k < 3 ? 'stamp-down' : k < 5 ? 'pressed' : 'stamp-up';
        } else drawn = 'gold';
        // the spotlight: the beam drops in 4 steps (2 grid frames each), the pool spreads after it
        if (spots) {
          const drop = reduced ? 1 : Math.min(1, (Math.floor(k / 2) + 1) / 4), pool = reduced || k >= 10 ? 1 : k >= 8 ? 0.5 : 0;
          const on = 1 - fade;
          spots.set(i, { x: at.pos.x, y: at.pos.y, z: at.pos.z, ground: at.staged ? at.pos.y : 0.06, scale: sc1, drop, pool, on, ghost: pale });
          lit.add(i);
        }
      } else if (kind === 'ghost' || kind === 'ghost-passed') {
        // the ghost token: a small pale ghost hovering at the seal's spot
        const hT = pxOf(0.58 * sc1), bob = reduced ? 0 : frameAt(t + i * 0.37, 2.5, 2);
        const gt = ghostArt(hT, bob, T);
        blitF(Wimg, gt, fx - gt.ox, fy - gt.oy - (2 + bob) * q);
        const sh = memo(`gsh|${rx}|${q}`, () => { const o = new PixelImage(2 * Math.round(rx * 0.5) + 3, 2 * Math.round(ry * 0.4) + 3); o.ellipse(o.w / 2, o.h / 2, rx * 0.5, Math.max(1, ry * 0.4), '#3A4860'); o.ox = o.w >> 1; o.oy = o.h >> 1; return dissolve(o, 0.5); });
        ground(sh, fx - sh.ox, fy - sh.oy, sp0, sh.oy);
        drawn = 'token';
        spots?.off(i);
      } else spots?.off(i);
      const top = Math.round(handP.y - 2 * q);
      if (drawn && drawn !== 'rest' && drawn !== 'gold') markTop.set(i, HD ? Math.floor(top / kk) : top);
      marks[i] = { kind, drawn, current: m.current, nominee: m.nominee, at: [fx, fy], spot: lit.has(i) };
    }
    info.seats = marks;
    if (spots) {
      spots.gain(night ? 0.5 : 0.42, night ? 0.55 : 0.38);
      if (!live || live.endedAt != null && fade >= 0.75) spots.allOff();
      info.spot = spots.info();
    }
    // ---- the tally + the threshold
    if (S && live) {
      const tally = S.tally, needed = S.needed;
      const passed = S.passedAt != null && t >= S.passedAt;
      if (passed && !live.bell && live.endedAt == null) {
        live.bell = true; info.bell++;
        try { demo.time?.ringBell?.(); } catch { /* no bell */ }
        log({ threshold: true, tally, needed, t: +t.toFixed(2) });
        events?.emit?.('vote:threshold', { tally, needed, nominee: live.v.nominee - 1 });
      }
      if (live.lastTally !== tally) { if (live.lastTally !== null) live.liftAt = t; live.lastTally = tally; }
      drawPlaque(LL, T, t, tally, needed, passed, live, HD);
      Object.assign(info, { tally, needed, passed, passedAt: S.passedAt, current: S.current });
    } else { info.plaque = null; Object.assign(info, { tally: 0, needed: 0, passed: false, passedAt: null, current: null }); }
  };

  /** the plaque face into img (a PixelImage or a density view) at (0, 0) */
  function plaqueInto(P0, w, h, T, { tally, needed, passed, gold, lift, narrow, name }) {
    drawBox(P0, 0, 0, w, h, gold ? 'gold' : 'panel', T);
    const tx = plaqueText(tally, needed, passed, narrow, name);
    const ink = gold ? T.textInk : T.text, dim = gold ? T.goldLine : T.textDim, num = gold ? T.textInk : lift ? T.goldHi : T.text;
    const wn = textWidth(tx.n), wa = textWidth(tx.a), wb = textWidth(tx.b), wc = textWidth(tx.c);
    let x = Math.floor((w - wn - wa - wb - wc) / 2);
    const y = 4;
    // the nominee's name in the crimson of their ring (cream on the gold plaque)
    if (tx.n) { drawText(P0, x, y, tx.n, { color: gold ? '#7E1A28' : CRIMSON.hi }); x += wn; }
    if (tx.a) { drawText(P0, x, y - (lift === 2 ? 1 : 0), tx.a, { color: num }); x += wa; }
    drawText(P0, x, y, tx.b, { color: tx.block ? ink : dim }); x += wb;
    if (tx.c) drawText(P0, x, y - (lift === 2 && !tx.a ? 1 : 0), tx.c, { color: tx.block ? num : ink });
  }
  /** The tally plaque: bottom centre above the action bar (logical px; the vote camera keeps that box clear) */
  function drawPlaque(LL, T, t, tally, needed, passed, live, HD) {
    if (!LL.screenEnabled) return;
    const dd = HD ? HD.d : 1, img = HD ? HD.screenView : LL.screen;
    if (!img) return;
    const bar = gameui.barRect ?? null;
    const visW = img.w - ((demo.passB?.votecam?.info?.cover?.right ?? 0) / (gameui.texPerLogical ?? 1));
    // (vote-fix4) the compact threshold text on every screen; top left under the chips when wide (plaqueSpot)
    const narrow = true, name = nomineeName(live.v.nominee - 1), w = plaqueWidth(tally, needed, passed, narrow, name), h = PLAQUE.h;
    const top = plaqueSpot(visW) === 'top' ? gameui.topRow : null;
    let x, y;
    if (top) { x = top.x0; y = top.y1 + PLAQUE.gap; }
    else {
      const cx = bar ? Math.floor(bar.x + bar.w / 2) : Math.floor(visW / 2);
      y = (bar ? bar.y : img.h - 26) - PLAQUE.gap - h;
      x = cx - (w >> 1);
    }
    const goldK = passed ? gk(t - live.S.passedAt) : -1;
    const gold = passed && (goldK >= 2 || reduced);
    const fk = live.liftAt != null ? gk(t - live.liftAt) : 99;
    const lift = reduced ? 0 : fk < 3 ? 2 : fk < 12 ? 1 : 0;      // a new count: the number lifts 1 px lit, then rests lit
    const fade = live.endedAt != null ? Math.min(0.75, Math.floor((t - live.endedAt) / 0.125) * 0.25) : 0;
    const o = { tally, needed, passed, gold, lift, narrow, name };
    let im = memo(`plaque|${dd}|${w}|${name}|${tally}|${needed}|${passed}|${gold}|${lift}|${narrow}|${T.gold}|${T.ink}`, () => {
      if (HD) return hdPiece(w + 1, h + 1, (v) => plaqueInto(v, w, h, T, o), dd);
      const P0 = new PixelImage(w + 1, h + 1); plaqueInto(P0, w, h, T, o); return P0;
    });
    const dst = HD ? HD.screen : img;
    if (fade > 0) im = dissolve(im.clone(), fade, (x * dd) & 3, (y * dd) & 3);
    fastBlit(dst, im, x * dd, y * dd);
    if (gold && goldK < 14 && !reduced) {
      const G = { core: T.goldHi, arm: T.gold, tip: T.goldSh }, r = goldK < 8 ? 2 : 1;
      for (const [sx, sy] of [[x - 2, y - 2], [x + w + 1, y - 2], [x - 2, y + h], [x + w + 1, y + h]]) sparkQ(dst, sx * dd, sy * dd, r, dd, G);
    }
    dst.mark?.((x - 3) * dd, (y - 3) * dd, (x + w + 3) * dd, (y + h + 3) * dd);
    info.plaque = { x, y, w, h, spot: top ? 'top' : 'bottom', tally, needed, passed, gold, lifting: lift === 2, hd: !!HD, text: textOf(plaqueText(tally, needed, passed, narrow, name)) };
  }
  /** the nominee's display name (the cast member on that seat; "You" on your seat), short form */
  function nomineeName(i) {
    if (demo.passB?.seats?.yours === i) return 'You';
    const m = (demo.npcs?.members ?? []).find((n) => n && n.slot === 1000 + i);
    return shortName(m?.handle?.name ?? m?.id ?? `Seat ${i + 1}`);
  }

  L.add(draw, 40);
  return {
    info: () => JSON.parse(JSON.stringify(info)),
    states: (t = engine.time) => Object.fromEntries(Object.entries(kindsAt(t, voteState(t))).map(([i, s]) => [i, s.kind])),
    /** the top row (L.world texels) of an animating mark over seat i (the slap / stamp in the air), or null */
    topOf: (i) => markTop.get(i) ?? null,
    /** the tally plaque's rect as drawn last frame (logical px), or null */
    get plaque() { return info.plaque; },
    /** seat i's seal box (L.world texels) as placed last frame (drawn or not: where it lies / would lie), or null */
    sealBoxOf: (i) => sealBoxes.get(i) ?? null,
    spotlights: spots,
    update() { /* drawn by the UI layer pass (gameui.layers) */ },
    dispose() { L.remove?.(draw); spots?.dispose(); },
  };
}

/** The art of the vote states for review strips (tools / shots): { name: PixelImage } (hd: the D=2 art) */
export function voteStateArt(T, { hd = false } = {}) {
  const q = hd ? 2 : 1, rx = 13 * q, ry = 7 * q, out = {};
  for (const k of ['red', 'gold', 'ghost', 'ghostgold']) out[`seal_${k}`] = sealArt(k, rx, ry, T, q);
  out.seal_face = sealArt('red', 10 * q, 10 * q, T, q);
  for (let k = 0; k < 4; k++) { out[`dust_${k}`] = dustArt(k, rx, ry, q); out[`drops_${k}`] = dropsArt(k, rx, ry, q, 'red', T); }
  out.slam = slamArt(rx, ry, q, T);
  out.stamp = stampArt(Math.round(rx * 1.5), q, T); out.stamp_pressed = stampArt(Math.round(rx * 1.5), q, T, true);
  for (let k = 0; k < 3; k++) out[`chime_${k}`] = chimeArt(k, rx, ry, q, T);
  out.flash = flashArt(rx, ry, q, T);
  out.ghost_0 = ghostArt(18 * q, 0, T); out.ghost_1 = ghostArt(18 * q, 1, T);
  out.nominee = nomRingArt(18 * q, 9 * q, q, T, false); out.block = nomRingArt(18 * q, 9 * q, q, T, true);
  for (let k = 0; k < 4; k++) out[`burst_${k}`] = burstArt(k, 18 * q, 9 * q, q, T);
  return out;
}
