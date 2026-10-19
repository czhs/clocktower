// Panels atlas (owner: panels; docs/UI.md §3.4): out/ui/panels.{png,json} (+ out/ui/panels.css via shots/ui-panels/mkcss.py)
//   tools/uibake.sh panels --strict     (coverage vs the v2 art/ui file set, src/ui/panels/v2-art-ui.json)
//
// v2 frame names kept verbatim (apps/client/public/art/ui/<name>.png, same sizes): panel, panel-parchment (48x48, now
// 9-slice 8 = v2's slice), button, button-hover, button-primary (48x16), divider (64x8), and the 16x16 icons alive, dead,
// ghost-vote, ghost-vote-spent, host, locked, muted, nominate, phase-dawn/day/dusk/night, speaking, storyteller,
// vote-hand, vote-yes. Everything else is new-style (meta.newStyle). 9-slice insets per frame: meta.nineSlice.
import { panelKit, CURSORS, GLYPHS, V2_ICONS } from './art.js';
import { buildCss } from './css.js';
import { chat, chatFolded, CHAT_FOLDED_H } from './screens.js';
import { hex, ramp, PixelImage } from '../kit.js';

const V2 = ['panel', 'panel-parchment', 'button', 'button-hover', 'button-primary', 'divider', ...Object.keys(V2_ICONS)];

export default {
  image: 'panels.png',
  width: 512,
  v2: '../../../src/ui/panels/v2-art-ui.json',   // resolved by the bake page as refs/ui/_src/<v2> -> src/ui/panels/
  async frames({ T }) {
    const K = panelKit(T);
    this._K = K;
    const names = [...V2, ...Object.keys(K.img).filter((n) => !V2.includes(n))];
    const out = names.map((n) => [n, K.img[n]]);
    // UI integration r2 (whole-screen critic: no chat-specific frames): composed chat-dock samples (row 44) cut from the
    // chat screen + the folded dock alone. 9-slices stay the generic kit (panel-plain, tab*, input*, badge-*).
    {
      const ctx = { t: 0 };
      const full = new PixelImage(640, 360); chat(full, K, ctx, {});
      out.push(['chat-dock_sample', full.crop(6, 360 - 6 - 128, 196, 128)]);          // open: tabs, scope bar, log, field
      out.push(['chat-tabs_sample', full.crop(6, 360 - 6 - 128, 196, 22)]);           // Chat | Crier tabs + count + minimise
      out.push(['chat-crier-line_sample', full.crop(6, 360 - 6 - 128 + 23 + 23 + 12 - 2, 196, 12)]);   // a crier log line
      for (const [n, oo] of [['chat-folded_sample', { unread: 7 }], ['chat-folded_crier', { crier: true, text: 'Night falls on Hollowmere.', unread: 2 }], ['chat-folded_read', {}]]) {
        const im = new PixelImage(168, CHAT_FOLDED_H); chatFolded(im, K, 0, 0, oo); out.push([n, im]);
      }
      const peek = new PixelImage(168, 21); chatFolded(peek, K, 0, 0, {}); out.push(['chat-peek_sample', peek.crop(0, 0, 168, 21)]);
    }
    // palette audit (docs/UI.md §2.3): every opaque colour = a token, or a ramp tone of a token
    const allowed = new Set(Object.values(T).filter((v) => typeof v === 'string').map((v) => hex(v)));
    for (const k of ['ok', 'danger', 'warn', 'good', 'evil', 'stViolet', 'ghost', 'ghostSh', 'parchment']) for (const v of Object.values(ramp(T[k]))) allowed.add(hex(v));
    for (const v of Object.values(ramp(T.parchment, { line: 0.5 }))) allowed.add(hex(v));
    for (const v of Object.values(ramp(T.ghostSh, { line: 0.3 }))) allowed.add(hex(v));
    for (const v of Object.values(ramp(T.ironHi, { light: 0.12, dark: 0.1 }))) allowed.add(hex(v));   // 'steel' glyphs
    const used = new Set(); for (const [, im] of out) for (const c of im.colors()) used.add(c);
    const sc = T.scrim; allowed.add(hex(sc));
    this._audit = { colours: used.size, untraced: [...used].filter((c) => !allowed.has(c)) };
    return out;
  },
  meta() {
    const K = this._K;
    const cursors = Object.fromEntries(Object.entries(CURSORS).map(([n, c]) => [n, { hot: { x: c.hot[0], y: c.hot[1] } }]));
    return {
      v2Files: 'apps/client/public/art/ui/<name>.png -> frames of the same name (one atlas); v2 CSS slice 8 (panel) / 6 (button) -> meta.nineSlice',
      nineSlice: K.insets,
      cursors,
      fps: { spinner: 10, switch: 15, caret: 1.875 },
      anim: {
        spinner: 'spinner_0..8, 3 grid frames each = 0.9 s per turn (v2 .ct-spinner 0.9 s linear)',
        switch: 'switch_0 (off) -> switch_1, switch_2 (2 grid frames each) -> switch_3 (on): 4 grid frames = 133 ms (v2 transform 120 ms); reverse for off',
        button: 'hover = button-hover immediately (v2 80 ms bg transition < 3 grid frames); press = button-pressed (plate 1 px down) while held',
        modal: 'open: scrim + modal pop (frame 0 one step smaller, 2 grid frames); close: 3-step Bayer dissolve at 15 fps (kit envelope)',
        caret: '16 grid frames on / 16 off (533 ms, browser caret blink)',
        toggle: 'notebook mark toggles pop: 1 step smaller for 2 grid frames, then full',
        checkbox: 'check: checkbox-pop (the ON drawing with a 1-step smaller tick) for 2 grid frames, then checkbox-on; never another state\'s drawing',
        reducedMotion: 'spinner shows spinner_0 still; switch jumps to the end drawing; no pops (docs/UI.md §2.8)',
      },
      fonts: 'titles = hud DISPLAY face (out/ui/hud-font.json), small caps = hud LABEL (kit tiny + 5-wide M/W); body = kit body',
      glyphs: Object.keys(GLYPHS).map((n) => `glyph_${n}`),
      glyphChars: { edit: '✎', firstnight: '☽', day: '☼', gather: '◎', bedtime: '♫', night: '☾', dawn: '✷', end: '⚑', undo: '↶', swap: '⇆', home: '⌂', gear: '⚙', help: '?', leave: '⇦', check: '✓', cross: '✗', star: '★', ghost: '👻', hand: '✋', scale: '⚖', scroll: '📜', mic: '🎙', mute: '🔇', close: '×', minimize: '–', chevron: '▾' },
      css: 'out/ui/panels.css (border-image rules at the integer scale --px; drop in after theme.css)',
      cssText: buildCss(K),
      newStyle: {
        'button-pressed|disabled|selected': 'button states (selected = gold edge, pressed = plate 1 px down; distinguishable without colour)',
        'button-primary-*': 'primary hover / pressed / disabled', 'button-danger*': 'danger (Kick, Abort)', 'segment*': 'segmented control',
        'tab*': 'tabs (open bottom) + tab-strip', 'input*': 'text field states', select: 'select well (chevron baked; r inset 11)', 'select-chevron': 'chevron alone',
        caret: 'text caret', focus: '9-slice keyboard focus ring (gold + goldLine)', 'checkbox*|radio*': '9x9 controls', 'switch*': '17x9 switch, switch_0..3 toggle steps',
        'slider-*': 'range track / fill (3-slice) + knob states', 'scrollbar-*': 'scrollbar track + thumb', 'panel-plain': 'plain panel (insets 3/3/4/3)',
        modal: 'modal panel with gold corner brackets', 'row*': 'list rows (members, notebook seats, ST seat grid)', well: '16x16 socket for a 12x12 cast icon',
        'avatar-well': '28x28 socket for a 24x24 avatar', 'tooltip*': 'tooltip + tail', 'tip-strip': 'first-time tip strip', 'banner-danger': 'error / nobody-on-the-block banner',
        'chip*': 'pill 9-slices for DOM badges', kbd: 'key cap', 'scroll-*': 'parchment pamphlet: rolled top / bottom caps + body', 'divider-*': 'rules + centre ornament',
        scrim: 'modal scrim tile (the one translucent token)', 'badge-*': 'composed tiny-caps badges (You, Host, Not ready, Ready, Storyteller, alive, dead, NOW, NEXT, SAVED, good, evil)',
        'spinner_*': 'loading spinner drawings', 'cursor-*': '16x16 cursors (hotspots meta.cursors)', 'glyph_*': '16x16 UI glyph set (meta.glyphChars)', 'toggle_*': '7x7 notebook mark toggles (toggle_<n>-off = flat textDim mark, no outline)',
        'badge-unread': 'chat unread count pill 9-slice (v2 .ct-chat-unread, danger; LABEL digits, 99+ cap)', 'badge-count': 'crier new-count pill 9-slice (v2 .ct-chat-dot, violet)',
        'checkbox-pop': 'checkbox pop drawing (on, 1 step smaller tick)',
        'chat-*': 'chat dock samples (row 44, composed from the kit; screens.js chat / chatFolded): chat-dock_sample (open), chat-tabs_sample, chat-crier-line_sample, chat-folded_sample / _crier / _read (peek line + Chat toggle + unread pill), chat-peek_sample',
      },
      paletteAudit: this._audit,
    };
  },
};
