// Bake module for the shared kit (owner: UI lead): out/ui/kit.{png,json}. Also the reference example of the bake
// module contract (docs/UI.md §3.4) — `tools/uibake.sh kit`.
//
// Frames
//   font_body_<code> / font_tiny_<code>   one frame per glyph (code = char code, decimal), cream on transparent; the JSON
//                                         meta.bitmapFont has per-glyph {frame, top, w} + metrics, so a Phaser BitmapText /
//                                         canvas port can rebuild the kit text exactly (docs/UI.md §2.4 + Porting)
//   frame_<style>                         each FRAMES style at 24x16 (9-slice inset 3 px; meta.nineSlice)
//   swatch_<token>                        8x8 swatch per colour token (day), swatch_night_<token> (night)
//   pinramp_<color>                       4x8 hi/mid/sh/line strip per v2 pin colour
import { FONTS, FRAMES, TOKENS, PIN_RAMPS, PixelImage, drawBox, rgba } from './kit.js';

function glyphImage(font, ch, color) {
  const g = font.map.get(ch);
  const h = font.cap + font.desc;
  const im = new PixelImage(Math.max(1, g.w), h);
  g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') im.set(i, g.top + j, color); });
  return im;
}

export default {
  image: 'kit.png',
  width: 256,
  async frames({ T }) {
    const out = [];
    for (const f of [FONTS.body, FONTS.tiny])
      for (const ch of f.map.keys()) out.push([`font_${f.name}_${ch.codePointAt(0)}`, glyphImage(f, ch, '#F4ECDC')]);
    for (const k of Object.keys(FRAMES)) {
      const im = new PixelImage(24, 17);
      drawBox(im, 0, 0, 24, 16, k, T);
      out.push([`frame_${k}`, im]);
    }
    for (const [set, toks] of [['', TOKENS.day], ['night_', TOKENS.night]])
      for (const [k, v] of Object.entries(toks)) out.push([`swatch_${set}${k}`, new PixelImage(8, 8).fill(rgba(v))]);
    for (const [k, r] of Object.entries(PIN_RAMPS)) {
      const im = new PixelImage(4, 8);
      [r.hi, r.mid, r.sh, r.line].forEach((c, i) => im.rect(i, 0, 1, 8, c));
      out.push([`pinramp_${k}`, im]);
    }
    return out;
  },
  meta() {
    const fonts = {};
    for (const f of [FONTS.body, FONTS.tiny]) {
      const glyphs = {};
      for (const [ch, g] of f.map) glyphs[ch] = { frame: `font_${f.name}_${ch.codePointAt(0)}`, w: g.w, top: g.top };
      fonts[f.name] = { lineH: f.lineH, space: f.space, tracking: f.tracking, cap: f.cap, xh: f.xh, desc: f.desc, upper: f.upper, glyphs };
    }
    return {
      bitmapFont: fonts,
      nineSlice: Object.fromEntries(Object.keys(FRAMES).map((k) => [`frame_${k}`, { l: 3, t: 3, r: 3, b: 4, shadow: !!FRAMES[k].shadow }])),
      tokens: TOKENS,
      pinRamps: PIN_RAMPS,
      newStyle: { texel: 1, scale: 'integer only', grid: '30 Hz', doc: 'docs/UI.md' },
    };
  },
};
