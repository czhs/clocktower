// Second atlas of the portraits group: the drop-in replacement for v2 packages/assets/generated/cast-portraits.{png,json}
// (read by apps/client/src/ui/common/castPortrait.ts: `sheets[<key>] = {x, y, frames}`, cells frameWidth x frameHeight,
// idle first, then walk1..4, all facing 'down').
//   tools/uibake.sh portraits:cast-portraits [--strict]      -> out/ui/cast-portraits.{png,json}
//
// Cells 32x40, feet on row 38 (v2: 1 px under the feet), centred on the pixel edge x 16. Rendered from the 3D cast at
// the portrait scale PPM (render.js: same camera, light and framing for everyone). Keys (v2 order):
//   <id>                     players: 5 frames (idle, walk1..4: one game-speed cycle IN PLACE facing down — r2: the
//                            gait's pelvis twist / bird roll / head bob / hop arc are zeroed for the portrait walk
//                            (WALK_LOCO), so the figure steps instead of twisting; each drawing's feet sit on the idle
//                            ground row and its head stays within 1 px of the idle head x); storyteller + NPCs: 1
//   <id>/ghost               players: the character's ghost clip, normalised onto THE shared ghost ramp (value-
//                            preserving 5-step remap), its 3D halo replaced by the one 2D halo (stampHalo) 1 px above
//                            the head, hovering with its solid bottom on row HOVER_ROW, 1 frame
//   <id>/ghost-spent         players: the ghost-spent clip on the darker spent ramp, same hover, no halo, 1 frame
//   <id>/dead     (new)      players: the idle portrait on the warm memorial (parchment-stone) ramp, 1 frame — the die
//                            clip's lying pose was tried (r1) and does not fit/read in a 32x40 cell (10-12 px overflow)
// Skipped (user): nicksong (pipeline/skip.txt) and brianbi (no pixel3d character) and their ghost keys.
import { renderCast, PORTRAIT_IDS, PLAYERS, SKIPPED, summary } from './render.js';
import { outlineOwn, toneRemap, variantRamp, haloMask, stampHalo, PORTRAIT, PPM } from './style.js';
import { PixelImage, tokens } from '../kit.js';

const FW = PORTRAIT.w, FH = PORTRAIT.h;
/** Portrait walk-in-place: no yaw-reading body motion (pelvis twist, bird waddle roll, head bob, spine flex), a low hop. */
export const WALK_LOCO = { twist: [0, 0], roll: [0, 0], headBob: [0, 0], flex: [0, 0], hop: [0.03, 0.03] };
/** Ghost hover: the lowest SOLID row (fringe dots excluded) of every ghost / spent cell (feet row = 38: hover 2 px). */
export const HOVER_ROW = 36;

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const solid = (im, x, y) => im.alpha(x, y) && N4.filter(([dx, dy]) => im.alpha(x + dx, y + dy)).length >= 2;
function rows(im, pred = (x, y) => im.alpha(x, y)) {
  let top = Infinity, bot = -Infinity;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (pred(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); }
  return { top, bot };
}
/** Mean x of the opaque texels in the top 35 % of the figure (the head). */
function headX(im) {
  const { top, bot } = rows(im); if (!isFinite(top)) return 0;
  const lim = top + (bot - top) * 0.35; let sx = 0, n = 0;
  for (let y = top; y <= lim; y++) for (let x = 0; x < im.w; x++) if (im.alpha(x, y)) { sx += x; n++; }
  return n ? sx / n : 0;
}
function shift(im, dx, dy) { const o = new PixelImage(im.w, im.h); o.blit(im, dx, dy); return o; }

let cache = null;
export async function portraitCells(engine) {
  if (cache) return cache;
  const T = tokens('noon');
  // render with a margin (overflow check), crop to the cell afterwards
  const M = 16, crop = { w: FW + 2 * M, h: FH + M, fx: PORTRAIT.fx + M, fy: PORTRAIT.fy + M };
  const idle = await renderCast(engine, { ids: PORTRAIT_IDS, variant: 'idle', ppm: PPM, crop });
  const walk = await renderCast(engine, { ids: PLAYERS, variant: 'walk', ppm: PPM, crop, at: 1.0, loco: WALK_LOCO });
  const ghost = await renderCast(engine, { ids: PLAYERS, variant: 'ghost', ppm: PPM, crop });
  const spent = await renderCast(engine, { ids: PLAYERS, variant: 'ghost-spent', ppm: PPM, crop });
  const overflow = {}, shifts = {}, faces = {}, walkFix = {};
  // walk drawings in place: feet on the idle's ground row, head within 1 px of the idle head x (critic AD12)
  for (const id of PLAYERS) {
    const ref = idle[id].frames[0], rb = rows(ref).bot, rx = headX(ref);
    walkFix[id] = walk[id].frames.map((im) => {
      const d = headX(im) - rx, dx = Math.abs(d) > 1 ? -Math.sign(d) * Math.round(Math.abs(d) - 1) : 0;
      const dy = rb - rows(im).bot;
      return [dx, dy];
    });
    walk[id].frames = walk[id].frames.map((im, i) => shift(im, ...walkFix[id][i]));
  }
  // one horizontal shift per sheet key (all its frames together: no jitter between idle and walk1..4): keep the feet
  // anchor unless a prop/pose sticks out of the 32-px cell, then slide it in (centre it when wider than the cell)
  const cutKey = (key, ims, { dyFixed = null } = {}) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const im of ims) { const b = im.bbox(); if (!b) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    let dx = 0;
    if (x1 - x0 > FW) dx = Math.floor(M + (FW - (x1 - x0)) / 2 - x0);
    else if (x0 < M) dx = M - x0;
    else if (x1 > M + FW) dx = M + FW - x1;
    const dy = dyFixed ?? 0;
    if (dx || dy) shifts[key] = [dx, dy];
    const o = { l: Math.max(0, M - (x0 + dx)), t: Math.max(0, M - (y0 + dy)), r: Math.max(0, x1 + dx - M - FW) };
    if (o.l || o.t || o.r) overflow[key] = o;
    return { cells: ims.map((im) => im.crop(M - dx, M - dy, FW, FH)), dx, dy };
  };
  const sheets = [];
  for (const id of PORTRAIT_IDS) {
    const { cells, dx } = cutKey(id, [idle[id].frames[0], ...(PLAYERS.includes(id) ? walk[id].frames : [])]);
    sheets.push([id, cells.map((im) => outlineOwn(im))]);
    const e = idle[id].eyes;
    if (e) faces[id] = { x: e.x - M + dx, y: e.y - M };
  }
  // ghost family (critic AD8/U4): one ramp, one halo, one hover for everyone
  const ghostCell = (key, r, kind) => {
    const im = r.frames[0].clone();
    const hm = haloMask(im);
    // the 3D halo (gold, seeded in the upper half, flooded through its rim) is replaced by THE 2D halo below
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (hm[y * im.w + x]) im.erase(x, y);
    toneRemap(im, variantRamp(kind, T));
    // hover: solid bottom on HOVER_ROW; keep ≥ 4 rows above the head for the halo (hover less if the figure is tall)
    const sb = rows(im, (x, y) => solid(im, x, y));
    let dy = (HOVER_ROW + M) - sb.bot;
    if (kind === 'ghost') dy = Math.max(dy, Math.min(M + 5 - sb.top, (38 + M) - sb.bot));
    const { cells: [c], dx } = cutKey(key, [im], { dyFixed: dy });
    const hx = Math.round((r.headPt ? r.headPt.x : idle[key.split('/')[0]].feet.x) - M + dx);
    const near = rows(c, (x, y) => c.alpha(x, y) && Math.abs(x - hx) <= 3);
    outlineOwn(c);
    // the halo after the rim line (an unlined gold ring like v2's), 1 px clear of the head's line
    if (kind === 'ghost') stampHalo(c, hx, Math.max(2, near.top - 3), T);
    return c;
  };
  for (const id of PLAYERS) {
    sheets.push([`${id}/ghost`, [ghostCell(`${id}/ghost`, ghost[id], 'ghost')]]);
    sheets.push([`${id}/ghost-spent`, [ghostCell(`${id}/ghost-spent`, spent[id], 'spent')]]);
  }
  for (const id of PLAYERS) {
    const { cells } = cutKey(`${id}/dead`, [toneRemap(idle[id].frames[0].clone(), variantRamp('dead', T))]);
    sheets.push([`${id}/dead`, cells.map((im) => outlineOwn(im))]);
  }
  cache = { sheets, overflow, shifts, faces, walkFix, raw: { idle, ghost, spent }, M, stats: { idle: summary(idle), walk: summary(walk), ghost: summary(ghost), spent: summary(spent) } };
  engine.stats.portraits = { overflow, ghost: cache.stats.ghost, spent: cache.stats.spent, walk: cache.stats.walk, walkFix };
  console.warn('portraits overflow: ' + JSON.stringify(overflow) + ' shifts: ' + JSON.stringify(shifts));
  console.warn('portraits walk fix [dx,dy]: ' + JSON.stringify(walkFix));
  return cache;
}

export default {
  image: 'cast-portraits.png',
  width: 648,
  v2: 'cast-portraits.json',
  skip: SKIPPED.flatMap((id) => [id, `${id}/ghost`, `${id}/ghost-spent`]),
  async frames({ engine, kit }) {
    const { sheets } = await portraitCells(engine);
    // one atlas entry per sheet key = a horizontal strip of its frames (the v2 strip layout: frames left to right)
    return sheets.map(([key, fr]) => {
      const strip = new kit.PixelImage(FW * fr.length, FH);
      fr.forEach((im, i) => strip.blit(im, i * FW, 0));
      return [key, strip];
    });
  },
  async meta({ engine }) {
    const { overflow, shifts } = await portraitCells(engine);
    return { overflow, shifts };
  },
  manifest(env, { rects, meta, image }) {
    const sheets = Object.fromEntries(Object.entries(rects).map(([k, r]) => [k, { x: r.x, y: r.y, frames: Math.round(r.w / FW) }]));
    return {
      image, frameWidth: FW, frameHeight: FH, dir: 'down', sheets,
      meta: {
        ...meta,
        anchor: { x: PORTRAIT.fx, y: PORTRAIT.fy, note: 'feet: pixel-edge x 16, ground under row 38 (v2 cells)' },
        frames: ['idle', 'walk1', 'walk2', 'walk3', 'walk4'],
        walkFps: 15, walkNote: 'one game-speed cycle (CAST_PORTING §8): 4 drawings, each held 2 grid frames (15 fps). The v2 consumer (apps/client/src/ui/common/castPortrait.ts) ignores this and steps WALK [1,2,3,4] every 140 ms (7.1 fps) = this cycle at half speed: port it to 67 ms (or read walkFps). Drawn in place facing down (no twist/roll), feet on the idle ground row.',
        walkStepMsV2: 140, walkStepMs: 67,
        skipped: SKIPPED,
        newStyle: {
          '<id>/dead': 'players: idle portrait on the warm memorial ramp (parchment stone); 1 frame',
          ghostFamily: 'every <id>/ghost on one 5-step ghost ramp + one 2D gold halo 1 px above the head; <id>/ghost-spent on the spent ramp, no halo; solid bottom on row 36 (hover 2 px)',
          render: `pixel3d characters/*, ortho yaw 0 pitch 30, ${PPM} texels/m, noon key light from the upper left, no outline (FLAG_CHAR inner lines only) + 1-px own-colour rim line added in 2D`,
        },
        bakedBy: meta.bakedBy, tod: meta.tod,
      },
    };
  },
};
