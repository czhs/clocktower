// HUD font atlas (owner: hud group; docs/UI.md §2.4 / §4 "hud"): out/ui/hud-font.{png,json}
//   tools/uibake.sh hud:hud-font
// Same glyph format as the kit atlas (src/ui/kit-bake.js): one frame per glyph `font_<face>_<codepoint>` drawn in cream
// on transparent; meta.bitmapFont.<face> = {lineH, space, tracking, cap, xh, desc, upper, glyphs: {ch: {frame, w, top}}}
// so a Phaser BitmapText / canvas port rebuilds the text exactly. Faces: 'display' (titling small caps, cap 9 / 7) and
// 'label' (kit tiny + 5-wide M/W, 4-wide N). The v2 3x5 review font (scripts/fx/font.ts) is carried verbatim in
// meta.v2Tiny (its glyphs are the kit 'tiny' face, kit.json). sample_* frames = labelled specimens (not glyphs).
import { PixelImage, drawText, textWidth, tokens } from '../kit.js';
import { DISPLAY, LABEL, V2_TINY_SRC } from './font.js';

function glyphImage(font, ch, color) {
  const g = font.map.get(ch);
  const h = font.cap + font.desc;
  const im = new PixelImage(Math.max(1, g.w), h);
  g.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') im.set(i, g.top + j, color); });
  return im;
}
const SAMPLES = [
  ['sample_display_caps', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'display'],
  ['sample_display_small', 'abcdefghijklmnopqrstuvwxyz 0123456789', 'display'],
  ['sample_display_punct', ". , : ; ! ? ' - + × · … — / ( ) & % ✓", 'display'],
  ['sample_display_words', 'Undertaker  Good wins  Your home  Day 1  5:58', 'display'],
  ['sample_label', 'NOMINATIONS OPEN IN  WAVE 0123456789 +TIME', 'label'],
];

export default {
  image: 'hud-font.png',
  width: 256,
  async frames({ T }) {
    const out = [];
    for (const f of [DISPLAY, LABEL])
      for (const ch of f.map.keys()) out.push([`font_${f.name}_${ch.codePointAt(0)}`, glyphImage(f, ch, '#F4ECDC')]);
    for (const [n, s, face] of SAMPLES) {
      const font = face === 'display' ? DISPLAY : LABEL;
      const im = new PixelImage(textWidth(s, font) + 2, font.cap + font.desc + 2);
      drawText(im, 1, 1, s, { font, color: T.text });
      out.push([n, im]);
    }
    return out;
  },
  meta() {
    const fonts = {};
    for (const f of [DISPLAY, LABEL]) {
      const glyphs = {};
      for (const [ch, g] of f.map) glyphs[ch] = { frame: `font_${f.name}_${ch.codePointAt(0)}`, w: g.w, top: g.top };
      fonts[f.name] = { lineH: f.lineH, space: f.space, tracking: f.tracking, cap: f.cap, xh: f.xh, desc: f.desc, upper: f.upper, glyphs };
    }
    return {
      bitmapFont: fonts,
      v2Tiny: { source: 'packages/assets/scripts/fx/font.ts', advance: 4, w: 3, h: 5, glyphs: V2_TINY_SRC, note: 'kit FONTS.tiny = these glyphs upper-cased (out/ui/kit.json)' },
      newStyle: {
        display: 'titling face: pixel serif small caps (capitals 9 rows, small capitals + figures 7 rows, stems 2 px), nod to v2 IM Fell English small-caps headings',
        label: 'kit tiny 3x5 caps with readable 5-wide M/W and 4-wide N (v2 small-caps letter-spaced labels)',
        usage: "kit drawText(img, x, y, s, {font: DISPLAY | LABEL}) (src/ui/hud/font.js); lower-case input = small caps",
      },
      tokens: { day: tokens('noon').text, night: tokens('night').text },
    };
  },
};
