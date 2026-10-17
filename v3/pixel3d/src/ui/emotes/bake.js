// Emotes atlas (owner: emotes; docs/UI.md §3.4): out/ui/emotes.{png,json}  —  tools/uibake.sh emotes [--strict]
//
// v2 frame kept verbatim: emote_point (14x14, the palette / pie Point icon; social.json). 'nick_face' is skipped (user).
// New-style frames (meta.newStyle explains each prefix):
//   emote_point_9                 9x9 inline Point glyph (buttons, armed pill), art bottom-aligned
//   emote_point_11                11x11 Point glyph of the emote pop
//   emote_pin_<c> / emote_pin_s_<c>   9x12 / 7x9 mini map pins per v2 pin colour (pie wedges, swatches / pop)
//   emote_remove, emote_clear, emote_alert, emote_question   glyphs (Remove wedge, clear pins, pop '!' / '?')
//   emote_pop_<kind>_<0..4>       in-world emote pop (point / alert / question): 0 pop, 1 full, 2..4 dissolve (15 fps),
//   emote_pop_pin_<c>_<0..4>      anchor = tail tip; the pin pop per pin colour
//   emote_pie_<size><n>_base      the whole pie at rest (n = 9 wedges, or 10 with Remove), centre = meta.pie offsets
//   emote_pie_<size><n>_open_<k>  open steps (0 = pop, 1..2 = wedges fanning in; 3 = base)
//   emote_pie_<size><n>_hot_<i> / _off_<i>   hot / disabled wedge overlays (+ icon), offsets in meta.pie
//   emote_pie_hub_idle_<0..3>     marching dotted gold hub ring (idle / sticky), emote_pie_press, emote_pie_notch_<c>
//   emote_dock_*                  dock toggle ring (normal / hover / open), corner dot per colour, swatch cells,
//                                 kbd chip, and the composed dock panel (reference)
import * as E from './art.js';
import { PixelImage, PIN_COLORS, PIN_RAMPS, drawBox, ramp, hex } from '../kit.js';

const SIZES = ['mouse', 'touch'];
const popNames = () => E.POP.kinds.flatMap((k) => (k === 'pin' ? PIN_COLORS.map((c) => [k, c]) : [[k, null]]))
  .flatMap(([k, c]) => [0, 1, 2, 3, 4].map((f) => ({ n: `emote_pop_${k}${c ? '_' + c : ''}_${f}`, k, c: c || 'gold', f })));
const crop = (img) => { const b = img.bbox(); return { img: img.crop(b.x, b.y, b.w, b.h), x: b.x, y: b.y }; };

export default {
  image: 'emotes.png',
  width: 512,
  v2: 'social.json',
  skip: ['nick_face'],
  only: (n) => n === 'emote_point',
  async frames({ T }) {
    const out = [];
    this._pie = {};
    out.push(['emote_point', E.emotePoint(T)], ['emote_point_9', E.emotePointSmall(T)], ['emote_point_11', E.emotePointPop(T)]);
    for (const c of PIN_COLORS) out.push([`emote_pin_${c}`, E.pinIcon(c, T)]);
    for (const c of PIN_COLORS) out.push([`emote_pin_s_${c}`, E.pinIconSmall(c, T)]);
    out.push(['emote_remove', E.removeIcon(T)], ['emote_clear', E.clearIcon(T)], ['emote_alert', E.alertIcon(T)], ['emote_question', E.questionIcon(T)]);
    for (const name of popNames()) out.push([name.n, E.popFrame(name.k, name.f, T, name.c)]);
    // pie
    for (const size of SIZES) for (const n of [9, 10]) {
      const items = E.pieItems({ name: 'Bram', removable: n === 10 ? { mine: true } : null });
      const key = `${size}${n}`, G = E.PIE[size], c = G.R + 3;
      const meta = this._pie[key] = { centre: { x: c, y: c }, wedges: items.map((i) => i.key), offsets: {} };
      out.push([`emote_pie_${key}_base`, E.pieImage(T, { size, items })]);
      // open steps: drawn exactly as drawPie does at grid frames 0..2
      for (let k = 0; k < 3; k++) {
        const im = new PixelImage(2 * c + 1, 2 * c + 2);
        E.drawPie(im, c, c, T, { size, items, tOpen: k / 30 + 0.001, noCaption: true, noPress: true });
        out.push([`emote_pie_${key}_open_${k}`, im]);
      }
      for (const [tag, opt] of [['hot', (i) => ({ hot: i })], ['off', (i) => ({ off: new Set([i]) })]])
        items.forEach((_, i) => {
          const full = E.pieImage(T, { size, items, show: new Set([i]), back: false, hub: false, ...opt(i) });
          const r = crop(full);
          const name = `emote_pie_${key}_${tag}_${i}`;
          meta.offsets[name] = { x: r.x - c, y: r.y - c };
          out.push([name, r.img]);
        });
    }
    for (let p = 0; p < 4; p++) {
      const full = E.pieImage(T, { size: 'mouse', items: E.pieItems({}), back: false, icons: false, show: new Set(), idleHub: true, phase: p });
      const r = crop(full);
      this._pie.hubIdleOffset = { x: r.x - (E.PIE.mouse.R + 3), y: r.y - (E.PIE.mouse.R + 3) };
      out.push([`emote_pie_hub_idle_${p}`, r.img]);
    }
    const press = new PixelImage(7, 7); E.drawPie(press, 3, 3, T, { pressOnly: true }); out.push(['emote_pie_press', press]);
    for (const c of PIN_COLORS) { const notch = new PixelImage(2, 2); notch.rect(0, 0, 2, 2, PIN_RAMPS[c].hi); notch.set(1, 1, PIN_RAMPS[c].mid); out.push([`emote_pie_notch_${c}`, notch]); }
    // dock
    for (const s of ['normal', 'hover', 'open']) out.push([`emote_dock_btn${s === 'normal' ? '' : '_' + s}`, E.dockButton(T, { state: s })]);
    for (const c of PIN_COLORS) out.push([`emote_dock_dot_${c}`, E.dockDot(c)]);
    for (const [n, st] of [['emote_swatch_on', 'on'], ['emote_swatch_hover', 'hover']]) {
      const im = new PixelImage(11, 16); drawBox(im, 0, 0, 11, 16, st === 'on' ? { line: 'outline', edge: 'goldHi', fill: 'inkRaised', corner: 1 } : { line: 'outline', edge: 'ironHi', fill: 'inkRaised', corner: 1 }, T);
      out.push([n, im]);
    }
    // key chips = exactly the scene's dock hints (critic r1: the baked chip said 'RMB' while the dock says RIGHT)
    for (const k of ['RIGHT', 'DRAG', 'F']) {
      const w = E.drawKbd(new PixelImage(40, 7), 0, 0, k, T), im = new PixelImage(w, 7); E.drawKbd(im, 0, 0, k, T);
      out.push([k === 'RIGHT' ? 'emote_kbd' : `emote_kbd_${k.toLowerCase()}`, im]);
    }
    const dock = new PixelImage(E.DOCK.w, E.DOCK.h + 1); E.drawDock(dock, 0, 0, T, { mode: 'pin', color: 'crimson', mine: 2 }); out.push(['emote_dock_panel', dock]);
    // palette audit (docs/UI.md §2.3): every opaque colour must be a token, a pin ramp tone or the danger ramp
    const allowed = new Set([...Object.values(T).filter((v) => typeof v === 'string').map((v) => hex(v)),
      ...Object.values(PIN_RAMPS).flatMap((r) => Object.values(r).map((v) => hex(v))), ...Object.values(ramp(T.danger)).map((v) => hex(v))]);
    const used = new Set(); for (const [, im] of out) for (const c of im.colors()) used.add(c);
    this._audit = { colours: used.size, untraced: [...used].filter((c) => !allowed.has(c)) };
    return out;
  },
  meta({ T }) {
    const anchors = {};
    for (const { n } of popNames()) anchors[n] = { ...E.POP.anchor };
    for (const c of PIN_COLORS) { anchors[`emote_pin_${c}`] = { x: 4, y: 11 }; anchors[`emote_pin_s_${c}`] = { x: 3, y: 8 }; }
    return {
      anchors,
      fps: { emote_pop: 15, emote_pie_open: 30, emote_pie_close: 15, emote_pie_hub_idle: 7.5 },
      emotePop: { kinds: E.POP.kinds, frames: { pop: [0], hold: [1], dissolve: [2, 3, 4] }, ms: E.TIMING.EMOTE_POP_MS, bob: { px: 1, fps: 2 },
        names: 'emote_pop_<point|alert|question>_<f>, emote_pop_pin_<color>_<f> (the dropped pin colour)',
        place: 'tail tip 1 px above the label stack top: hud.indicators.stackTop(m) (visual top, ghost lift, You chevron); a shared stack allocator (labels < bubble < pins < pop) is pending (lead)' },
      pie: { geometry: E.PIE, v2: E.V2_PIE, scale: 'texels at x2 (1280x720): R = round(cssRadius / 2) - 6; dead zone = css / 2', ...this._pie,
        open: 'grid frame 0: open_0 (pop), 1..2: open_1/open_2, >= 3: base; wedges fan in from Point (0, 1, n-1, 2, n-2, ...)',
        commit: '15 fps: others 50 % dissolved (back, hub, chosen hot wedge solid), back + hub + chosen, that at 50 %, at 75 %, gone', cancel: '3-step Bayer dissolve at 15 fps',
        hot: 'emote_pie_<k>_hot_<i> overlay (pops out 2 px over the back ring, icon 1 px out/up); pin wedges in the pin ramp, Point in gold, Remove in danger',
        notch: 'emote_pie_notch_<color> at radius R-3, angle + 0.28 wedge: the current pin colour' },
      timing: E.TIMING,
      newStyle: {
        emote_point_9: '9x9 Point glyph (art bottom-aligned)', emote_point_11: '11x11 Point glyph (emote pop)', 'emote_kbd*': 'key chips RIGHT / DRAG / F (dock hints)', 'emote_pin_<c>': 'mini map pins 9x12 (tip anchor)', 'emote_pin_s_<c>': 'mini pins 7x9',
        emote_remove: 'Remove wedge glyph', emote_clear: 'clear my pins glyph', emote_alert: "pop '!'", emote_question: "pop '?'",
        'emote_pop_<kind>_<f>': 'in-world emote pop above a character', 'emote_pie_*': 'radial pie menu (screen tier)', 'emote_dock_*': 'social dock parts',
      },
      paletteAudit: this._audit,
      skipped: ['nick_face (user decision)'],
    };
  },
};
