// Pixel webfont builder (owner: notebook group; docs/UI.md row 41b, §5). Turns a kit bitmap font (FONTS.body: the same
// glyph rows as out/ui/kit.json meta.bitmapFont.body) into a minimal TrueType font, so the native v2 <textarea
// class="ctn-text"> can type in the game's pixel face (opt-in: .ctn.ctn-pixelfont). Pure + deterministic (no dates: the
// head timestamps are 0), browser or node (Uint8Array / DataView only).
//
// Geometry: 1 bitmap pixel = PX font units, unitsPerEm = 8 PX, so `font-size: calc(8px * var(--px))` draws one glyph
// pixel as exactly --px CSS pixels. Ascent 6 px (= cap height: row 0 = cap top) and descent 4 px, line gap 0, so with
// `line-height: calc(10px * var(--px))` the cap top sits at the top of each line box and the descenders end 2 px above
// the next line (the notebook rule sits on row 8 = right under them). USE_TYPO_METRICS is set so Windows uses the same
// metrics. Every glyph = rectangles (horizontal runs merged down identical rows), outer contours clockwise.
// Characters the face lacks (accents, CJK, emoji, IME input) fall back per character to the next family in the CSS
// stack (the v2 vector font), so nothing becomes a box.
import { FONTS } from '../kit.js';

export const PX = 128;
export const UPM = 8 * PX;
const ASC = 6, DESC = 4;

/** Glyph list from a kit font: [{ cp, adv (px), rows[], top }] (space first after .notdef). */
function glyphsOf(font) {
  const out = [{ cp: 32, adv: font.space + font.tracking, rows: [], top: 0 }];
  const cps = [...font.map.keys()].filter((ch) => [...ch].length === 1).map((ch) => ch.codePointAt(0)).filter((cp) => cp > 32 && cp <= 0xffff);
  for (const cp of [...new Set(cps)].sort((a, b) => a - b)) {
    const g = font.map.get(String.fromCodePoint(cp));
    out.push({ cp, adv: g.w + font.tracking, rows: g.rows, top: g.top });
  }
  return out;
}

/** Rectangles (in px, y down from the cap top) of one glyph: runs per row merged with identical runs below. */
function rects(rows, top) {
  const runs = rows.map((r) => { const o = []; let x = 0; while (x < r.length) { if (r[x] !== '#') { x++; continue; } const a = x; while (r[x] === '#') x++; o.push([a, x]); } return o; });
  const out = [], used = runs.map((r) => r.map(() => false));
  runs.forEach((rr, y) => rr.forEach(([a, b], i) => {
    if (used[y][i]) return;
    let h = 1;
    for (;;) { const j = runs[y + h]?.findIndex(([c, d]) => c === a && d === b); if (j === undefined || j < 0) break; used[y + h][j] = true; h++; }
    out.push({ x0: a, x1: b, y0: top + y, y1: top + y + h });
  }));
  return out;
}

class W {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 255); return this; }
  u16(v) { return this.u8(v >> 8).u8(v); }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { return this.u16(Math.floor(v / 65536) & 0xffff).u16(v & 0xffff); }
  tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  bytes(a) { for (const v of a) this.u8(v); return this; }
  pad4() { while (this.b.length % 4) this.u8(0); return this; }
}
const sum32 = (b) => { let s = 0; for (let i = 0; i < b.length; i += 4) s = (s + ((b[i] << 24) >>> 0) + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0)) >>> 0; return s; };

/** Build the TTF bytes (Uint8Array) for a kit font. */
export function buildTTF(font = FONTS.body, name = 'CT Pixel Body') {
  const G = [{ cp: null, adv: font.space + font.tracking, rows: [], top: 0 }, ...glyphsOf(font)];
  const n = G.length;
  // glyf + loca
  const glyf = new W(), loca = [];
  let maxPts = 0, maxCont = 0, xMax = 0, yMin = 0, yMax = 0;
  const bbox = [];
  for (const g of G) {
    loca.push(glyf.b.length);
    const R = rects(g.rows, g.top);
    if (!R.length) { bbox.push([0, 0]); continue; }
    // y up, baseline 0: px row r spans (ASC - r - 1 .. ASC - r) px
    const pts = [];
    for (const r of R) {
      const X0 = r.x0 * PX, X1 = r.x1 * PX, YT = (ASC - r.y0) * PX, YB = (ASC - r.y1) * PX;
      pts.push([[X0, YB], [X0, YT], [X1, YT], [X1, YB]]);      // clockwise (TrueType outer)
    }
    const flat = pts.flat(), xs = flat.map((p) => p[0]), ys = flat.map((p) => p[1]);
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    bbox.push([bb[0], bb[2]]);
    xMax = Math.max(xMax, bb[2]); yMin = Math.min(yMin, bb[1]); yMax = Math.max(yMax, bb[3]);
    maxPts = Math.max(maxPts, flat.length); maxCont = Math.max(maxCont, R.length);
    glyf.i16(R.length).i16(bb[0]).i16(bb[1]).i16(bb[2]).i16(bb[3]);
    for (let i = 0; i < R.length; i++) glyf.u16(i * 4 + 3);
    glyf.u16(0);                                                  // no instructions
    for (let i = 0; i < flat.length; i++) glyf.u8(1);            // on-curve, int16 x / y deltas
    let px = 0; for (const [x] of flat) { glyf.i16(x - px); px = x; }
    let py = 0; for (const [, y] of flat) { glyf.i16(y - py); py = y; }
    glyf.pad4();
  }
  loca.push(glyf.b.length);
  const locaT = new W(); for (const o of loca) locaT.u32(o);
  const advMax = Math.max(...G.map((g) => g.adv)) * PX;
  // head (checkSumAdjustment patched at the end)
  const head = new W().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(UPM)
    .u32(0).u32(0).u32(0).u32(0)                                  // created / modified = 0 (deterministic)
    .i16(0).i16(yMin).i16(xMax).i16(yMax).u16(0).u16(8).i16(2).i16(1).i16(0);
  const hhea = new W().u32(0x00010000).i16(ASC * PX).i16(-DESC * PX).i16(0).u16(advMax).i16(0)
    .i16(Math.min(...G.map((g, i) => g.adv * PX - (bbox[i][1] || 0)))).i16(xMax).i16(1).i16(0).i16(0)
    .i16(0).i16(0).i16(0).i16(0).i16(0).u16(n);
  const maxp = new W().u32(0x00010000).u16(n).u16(maxPts).u16(maxCont).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  const cps = G.slice(1).map((g) => g.cp);
  const avg = Math.round(G.slice(1).reduce((s, g) => s + g.adv * PX, 0) / (n - 1));
  const os2 = new W().u16(4).i16(avg).u16(400).u16(5).u16(0)
    .i16(PX * 4).i16(PX * 4).i16(0).i16(PX).i16(PX * 4).i16(PX * 4).i16(0).i16(PX * 3)   // sub / superscript
    .i16(PX).i16(PX * 2).i16(0).bytes([2, 0, 6, 0, 0, 0, 0, 0, 0, 0])                       // strikeout, family class, panose
    .u32(1).u32(0).u32(0).u32(0).tag('NONE').u16(0x00c0)                                    // Basic Latin; REGULAR | USE_TYPO_METRICS
    .u16(Math.min(...cps)).u16(Math.max(...cps)).i16(ASC * PX).i16(-DESC * PX).i16(0).u16(ASC * PX).u16(DESC * PX)
    .u32(1).u32(0).i16(font.xh * PX).i16(font.cap * PX).u16(0).u16(32).u16(1);
  const hmtx = new W(); G.forEach((g, i) => hmtx.u16(g.adv * PX).i16(bbox[i][0]));
  // cmap: format 4, one segment per code point + the 0xFFFF terminator
  const segs = [...cps.map((cp, i) => [cp, i + 1]), [0xffff, 0]];
  const sc = segs.length, es = Math.floor(Math.log2(sc)), sr = 2 * 2 ** es;
  const f4 = new W().u16(4).u16(16 + sc * 8).u16(0).u16(sc * 2).u16(sr).u16(es).u16(sc * 2 - sr);
  for (const [cp] of segs) f4.u16(cp);
  f4.u16(0);
  for (const [cp] of segs) f4.u16(cp);
  for (const [cp, gid] of segs) f4.u16(cp === 0xffff ? 1 : (gid - cp + 65536) & 0xffff);
  for (let i = 0; i < sc; i++) f4.u16(0);
  const cmap = new W().u16(0).u16(1).u16(3).u16(1).u32(12).bytes(f4.b);
  // name (Windows Unicode BMP, en-US)
  const ps = name.replace(/[^A-Za-z0-9]/g, '');
  const names = [[1, name], [2, 'Regular'], [3, `${ps}-Regular-pixel3d`], [4, name], [5, 'Version 1.0'], [6, `${ps}-Regular`]];
  const str = new W(), recs = [];
  for (const [id, v] of names) { const o = str.b.length; for (const c of v) str.u16(c.charCodeAt(0)); recs.push([id, o, str.b.length - o]); }
  const nameT = new W().u16(0).u16(recs.length).u16(6 + recs.length * 12);
  for (const [id, o, l] of recs) nameT.u16(3).u16(1).u16(0x409).u16(id).u16(l).u16(o);
  nameT.bytes(str.b);
  const post = new W().u32(0x00030000).u32(0).i16(-PX * 3).i16(PX).u32(0).u32(0).u32(0).u32(0).u32(0);
  // assemble (tags sorted)
  const tables = [['OS/2', os2], ['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea], ['hmtx', hmtx], ['loca', locaT], ['maxp', maxp], ['name', nameT], ['post', post]]
    .map(([t, w]) => [t, w.b]);
  const nt = tables.length, e2 = Math.floor(Math.log2(nt)), sr2 = 16 * 2 ** e2;
  const out = new W().u32(0x00010000).u16(nt).u16(sr2).u16(e2).u16(nt * 16 - sr2);
  let off = 12 + nt * 16;
  const offs = [];
  for (const [t, b] of tables) { out.tag(t).u32(sum32(b)).u32(off).u32(b.length); offs.push(off); off += (b.length + 3) & ~3; }
  for (const [, b] of tables) { out.bytes(b); out.pad4(); }
  const bytes = Uint8Array.from(out.b);
  const hi = tables.findIndex(([t]) => t === 'head'), adj = (0xb1b0afba - sum32(bytes) + 2 ** 32) % 2 ** 32;
  new DataView(bytes.buffer).setUint32(offs[hi] + 8, adj);
  return bytes;
}

/** base64 of the TTF (for a data: URI in notebook.css). */
export function ttfBase64(font, name) {
  const b = buildTTF(font, name);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(b).toString('base64');
}
