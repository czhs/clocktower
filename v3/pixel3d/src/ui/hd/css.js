// D=2 pixel webfont + DOM rules (owner: UI lead; docs/UI.md "Density"). The DOM twin of the canvas faces: a TrueType
// font built at runtime from FONTS['body@2'] (src/ui/notebook/ttf.js; deterministic, ~10 KB), so DOM text (the
// notebook page, chips, buttons) gets the same finer face as the canvas UI. Browser only (document).
//
//   installHDCss(document)        once; then set --hdpx on :root (or any ancestor) = L.hd.scale (device px per HD px)
//   <div class="ctn ctn-pixelfont-hd">  the notebook page (instead of .ctn-pixelfont): D=2 face, line = 20 HD px
//   class="ct-pixel-hd"           any DOM text in the D=2 body face (cap 12 HD px, line 18 HD px)
// Metrics: 1 glyph px = --hdpx CSS px (font-size 16 x --hdpx, ascent 12 = cap top at the line-box top, descent 8).
// At --px 2 / --hdpx 1 (720p) the page geometry is identical to .ctn-pixelfont (line 20 CSS px = the 10-texel rule
// pitch); at --px 3 / --hdpx 2 (1080p, policy 'round') the HD page lines are 40 CSS px (the rule tile is re-sized to
// 4 CSS px per tile px, the holes stay on the --px frame). Glyphs the face lacks fall back per character to the vector font.
import { FONTS } from '../kit.js';
import { ttfBase64 } from '../notebook/ttf.js';

export const HD_FONT_FAMILY = 'CT Pixel Body HD';
let css = null;
/** The CSS text (@font-face + .ct-pixel-hd + .ctn-pixelfont-hd page rules). */
export function buildHDCss() {
  if (css) return css;
  const b64 = ttfBase64(FONTS['body@2'], HD_FONT_FAMILY, { asc: 12, desc: 8, em: 16 });
  const face = `'${HD_FONT_FAMILY}', var(--font, 'Alegreya Sans'), system-ui, sans-serif`;
  const crisp = '-webkit-font-smoothing: none; font-smooth: never; font-kerning: none; font-variant-ligatures: none; letter-spacing: 0;';
  css = [
    '/* D=2 pixel face (src/ui/hd/css.js, generated at runtime; docs/UI.md "Density"). Set --hdpx = L.hd.scale. */',
    `@font-face { font-family: '${HD_FONT_FAMILY}'; src: url(data:font/ttf;base64,${b64}) format('truetype'); font-display: block; }`,
    `.ct-pixel-hd { font-family: ${face}; font-size: calc(16px * var(--hdpx, 1)); line-height: calc(18px * var(--hdpx, 1)); ${crisp} }`,
    `.ctn.ctn-pixelfont-hd .ctn-text { font-family: ${face}; font-size: calc(16px * var(--hdpx, 1)); line-height: calc(20px * var(--hdpx, 1));`
      + ` background-size: calc(16px * var(--hdpx, 1)) calc(20px * var(--hdpx, 1)); background-position: 0 calc(2px * var(--hdpx, 1)); ${crisp} }`,
  ].join('\n') + '\n';
  return css;
}
/** Inject the rules once (a <style id="ct-hd-css">). Returns the element. */
export function installHDCss(doc = document) {
  let s = doc.getElementById('ct-hd-css');
  if (s) return s;
  s = doc.createElement('style');
  s.id = 'ct-hd-css';
  s.textContent = buildHDCss();
  doc.head.append(s);
  return s;
}
