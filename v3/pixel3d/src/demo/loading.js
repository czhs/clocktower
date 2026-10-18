// Hollowmere loading screen (owner: intro; docs/DEMO.md). demo.html includes this module BEFORE main.js and the
// static #demo-loading markup; it draws itself at once and needs nothing from main.js to work:
//   - the scene: a pixel-art clock tower (canvas, image-rendering: pixelated) whose hands tick through 12 stepped
//     frames and whose belfry lantern flickers, pines + cottage roofs, drifting mist, twinkling stars. Every moving
//     layer is a CSS transform / opacity animation, which runs on the compositor: it keeps ticking while the main thread
//     is busy building a town piece (the build blocks JS for ~100 ms per piece).
//   - REAL progress: the town pieces are counted as buildTown imports them (Resource Timing entries of
//     src/town/pieces/<id>.js and src/town/life/index.js, in town.js BUILD_ORDER), the boot phases are read from main.js's
//     #demo-boot text ("building", "loading characters", "compiling shaders"), `__demo.ready` ends the boot. The lead can
//     also drive it explicitly: loading.progress(frac, label) / loading.step(name).
//   - then the cinematic (src/demo/intro.js) warms its camera poses BEHIND this screen and calls loading.done().
//     With ?intro=0, in capture mode or under automation (navigator.webdriver; ?intro=1 forces it on) the screen fades
//     on ready instead.
// Exports: loading (singleton) = { el, value, label, progress(frac, label?), step(name), piece(id), done(), fail(msg),
//   hold(), whenDone: Promise }, introEnabled(params), drawText(text, opts) -> canvas (the 5x7 pixel font), FONT.
// Wiring (lead, optional): if main.js creates the intro itself (`demo.intro = createIntro(demo)` + its update stepped
// after the camera rig), this module only shows progress; otherwise it starts the intro on ready (engine.onUpdate).

// ------------------------------------------------------------------------------------------------ the pixel font
// 5x7 glyphs (proportional: empty columns trimmed, 1 px tracking). Lower case renders as upper case.
const G = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '####.|....#|....#|.###.|....#|....#|####.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|....#|.###.',
  '.': '.|.|.|.|.|#|#', ',': '..|..|..|..|.#|.#|#.', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
  '-': '...|...|...|###|...|...|...', "'": '#|#|.|.|.|.|.', '’': '#|#|.|.|.|.|.', ':': '.|#|#|.|#|#|.',
  '!': '#|#|#|#|#|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '(': '.#|#.|#.|#.|#.|#.|.#',
  ')': '#.|.#|.#|.#|.#|.#|#.', '+': '.....|..#..|..#..|#####|..#..|..#..|.....', '=': '...|...|###|...|###|...|...',
  '[': '##|#.|#.|#.|#.|#.|##', ']': '##|.#|.#|.#|.#|.#|##', '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##',
  '·': '.|.|.|#|.|.|.', '°': '###|#.#|###|...|...|...|...', '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
};
export const FONT = Object.fromEntries(Object.entries(G).map(([k, v]) => [k, v.split('|')]));

/**
 * Render `text` in the 5x7 pixel font onto a new canvas at native size (1 font pixel = 1 canvas pixel); the CSS size is
 * native x `scale` with image-rendering: pixelated. opts: { scale = 2, color = '#efe6cf', shadow = '#14121c' (1 px
 * drop shadow down-right, null = none), shade = null (colour of the glyphs' lower 3 rows: a two-tone gothic band) }.
 */
export function drawText(text, { scale = 2, color = '#efe6cf', shadow = '#14121c', shade = null } = {}) {
  const glyphs = [...String(text).toUpperCase()].map((ch) => (ch === ' ' ? null : FONT[ch] ?? FONT['?']));
  let w = 0;
  for (const g of glyphs) w += (g ? g[0].length : 3) + 1;
  w = Math.max(1, w - 1 + (shadow ? 1 : 0));
  const h = 7 + (shadow ? 1 : 0);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.style.width = `${w * scale}px`; c.style.height = `${h * scale}px`;
  c.className = 'ldg-text';
  const g2 = c.getContext('2d');
  const paint = (dx, dy, colOf) => {
    let x = 0;
    for (const g of glyphs) {
      if (!g) { x += 4; continue; }
      for (let r = 0; r < 7; r++) for (let k = 0; k < g[r].length; k++) {
        if (g[r][k] !== '#') continue;
        g2.fillStyle = colOf(r);
        g2.fillRect(x + k + dx, r + dy, 1, 1);
      }
      x += g[0].length + 1;
    }
  };
  if (shadow) paint(1, 1, () => shadow);
  paint(0, 0, (r) => (shade && r >= 4 ? shade : color));
  return c;
}

// ------------------------------------------------------------------------------------------------ palette (TOWN.md §3)
const P = {
  sky: '#141828', star: '#d8ccb0', starDim: '#6e6a7e',
  slate0: '#1c1b26', slate1: '#2a2834', slate2: '#46424f', slate3: '#6e6a7e', cream: '#d8ccb0', ivory: '#f2e8d0',
  ring: '#a0846c', ringD: '#625660', brass: '#f0d080', brassD: '#c9a040', brassDD: '#7a6248',
  glow: '#ffc46b', glowHi: '#ffe6a8', glowD: '#c8803c', spire: '#30324a', spireHi: '#4e5a78',
  pine0: '#16202a', pine1: '#1f2e34', roof: '#2c2a3c', roofHi: '#3e3a52', wall: '#24222e',
};

// scene: 200 x 112 native pixels; the tower (40 x 86) stands at x 80..119 on the ground line y 104
const SW = 200, SH = 112, TX = 80, TY = 18;
const DIAL = { x: TX + 20, y: TY + 52, r: 7 };

function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

function drawScene() {
  const c = document.createElement('canvas');
  c.width = SW; c.height = SH;
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // stars (static layer; a second, sparser layer twinkles in CSS)
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hash(i) * SW), y = Math.floor(hash(i + 99) * 70);
    R(x, y, 1, 1, hash(i + 7) > 0.7 ? P.star : P.starDim);
  }
  // far hills
  for (let x = 0; x < SW; x++) {
    const y = 88 + Math.round(4 * Math.sin(x * 0.045) + 2 * Math.sin(x * 0.13 + 1));
    R(x, y, 1, SH - y, '#191d2c');
  }
  // ---- the clock tower
  const T = (x, y, w, h, col) => R(TX + x, TY + y, w, h, col);
  // vane + spire (flared slate, lit left edge)
  T(19, 0, 1, 5, P.brassD); T(17, 1, 5, 1, P.brass); T(20, 1, 2, 1, P.brassD); T(19, 0, 1, 1, P.brass);
  for (let y = 5; y < 24; y++) {
    const half = Math.round(1 + (y - 5) * 0.34 + (y > 20 ? (y - 20) * 0.6 : 0));
    T(20 - half, y, half * 2, 1, P.spire);
    T(20 - half, y, 1, 1, P.spireHi);
    T(19 + half, y, 1, 1, P.slate0);
    if (y % 4 === 1) T(20 - half + 1, y, half * 2 - 2, 1, '#282a40'); // slate courses
  }
  // parade: crenellations + corner pinnacles
  T(10, 26, 20, 3, P.slate2); T(10, 26, 20, 1, P.slate3);
  for (let x = 10; x < 30; x += 4) { T(x, 24, 2, 2, P.slate2); T(x, 24, 1, 1, P.cream); }
  T(9, 20, 2, 6, P.slate2); T(9, 19, 2, 1, P.slate3); T(29, 20, 2, 6, P.slate1); T(29, 19, 2, 1, P.slate2);
  T(10, 29, 20, 1, P.slate0);
  // belfry: arch opening with the bell (the lantern glow layer sits on top, flickering)
  T(12, 30, 16, 12, P.slate1); T(12, 30, 1, 12, P.slate3); T(27, 30, 1, 12, P.slate0);
  T(15, 32, 10, 9, '#0f0e16'); T(16, 31, 8, 1, '#0f0e16'); // arch
  T(17, 33, 6, 1, P.brassDD); T(18, 32, 4, 1, P.brassD);   // bell crown
  T(17, 34, 6, 4, P.brassD); T(17, 34, 2, 4, P.brass); T(16, 38, 8, 1, P.brassD); T(19, 39, 2, 1, P.brassDD);
  // string course
  T(11, 42, 18, 2, P.slate2); T(11, 42, 18, 1, P.cream);
  // clock stage with the ivory dial
  T(12, 44, 16, 18, P.slate1); T(12, 44, 1, 18, P.slate2); T(27, 44, 1, 18, P.slate0);
  for (let y = -DIAL.r - 1; y <= DIAL.r + 1; y++) for (let x = -DIAL.r - 1; x <= DIAL.r + 1; x++) {
    const d = Math.hypot(x, y);
    if (d <= DIAL.r - 0.6) R(DIAL.x + x, DIAL.y + y, 1, 1, P.ivory);
    else if (d <= DIAL.r + 0.5) R(DIAL.x + x, DIAL.y + y, 1, 1, x + y < 0 ? P.ring : P.ringD);
  }
  for (let k = 0; k < 12; k += 3) { // hour marks at 12 / 3 / 6 / 9
    const a = (k / 12) * Math.PI * 2;
    R(DIAL.x + Math.round(Math.sin(a) * (DIAL.r - 1.6)), DIAL.y - Math.round(Math.cos(a) * (DIAL.r - 1.6)), 1, 1, P.ringD);
  }
  // base with the great door, plinth steps
  T(10, 62, 20, 20, P.slate1); T(10, 62, 1, 20, P.slate3); T(29, 62, 1, 20, P.slate0); T(10, 62, 20, 1, P.slate2);
  for (let y = 64; y < 82; y += 3) T(11, y, 18, 1, '#26242f');   // masonry courses
  T(16, 70, 8, 12, '#3a2a1e'); T(17, 69, 6, 1, '#3a2a1e'); T(16, 70, 1, 12, '#4f3a2a'); T(19, 70, 1, 12, '#2a1e16');
  T(21, 75, 1, 1, P.brassD);
  T(13, 66, 2, 3, P.glowD); T(25, 66, 2, 3, P.glowD);            // two lit slits
  T(6, 82, 28, 2, P.slate2); T(6, 82, 28, 1, P.slate3); T(4, 84, 32, 2, P.slate1); T(4, 84, 32, 1, P.slate2);
  // ---- cottages either side (roof + lit window), then pines in front
  const cottage = (x, w, h, lit) => {
    const y0 = 104 - h;
    R(x, y0, w, h, P.wall);
    for (let i = 0; i < Math.ceil(w / 2) + 1; i++) R(x - 1 + i, y0 - i, w + 2 - i * 2, 1, i === 0 ? P.roofHi : P.roof);
    if (lit) { R(x + 2, y0 + 3, 2, 2, P.glow); R(x + 2, y0 + 3, 1, 1, P.glowHi); }
  };
  cottage(40, 14, 9, true); cottage(58, 10, 7, false); cottage(132, 12, 8, true); cottage(150, 16, 10, true);
  const pine = (x, h, col) => {
    for (let y = 0; y < h; y++) {
      const half = Math.floor((y % 5) * 0.8 + y * 0.28);
      R(x - half, 104 - h + y, half * 2 + 1, 1, col);
    }
  };
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(6 + i * 14 + hash(i + 40) * 8);
    if (x > 74 && x < 126) continue;
    pine(x, 14 + Math.floor(hash(i + 3) * 12), i % 2 ? P.pine0 : P.pine1);
  }
  R(0, 104, SW, SH - 104, '#10131d');
  for (let x = 0; x < SW; x += 3) R(x, 104, 2, 1, '#1c2230');
  return c;
}

/** A horizontal strip of 12 frames (each `size` px square) with one clock hand per frame (frame k at k x 30 deg). */
function drawHandStrip(size, len, col, thick = false) {
  const c = document.createElement('canvas');
  c.width = size * 12; c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = col;
  const o = (size - 1) / 2;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const ex = Math.round(o + Math.sin(a) * len), ey = Math.round(o - Math.cos(a) * len);
    // Bresenham from the centre pin to the tip
    let x0 = o, y0 = o; const dx = Math.abs(ex - x0), dy = -Math.abs(ey - y0), sx = x0 < ex ? 1 : -1, sy = y0 < ey ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      g.fillRect(k * size + x0, y0, 1, 1);
      if (thick) g.fillRect(k * size + x0 + (dy === 0 ? 0 : 1), y0 + (dy === 0 ? 1 : 0), 1, 1);
      if (x0 === ex && y0 === ey) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    g.fillStyle = P.brassD; g.fillRect(k * size + o, o, 1, 1); g.fillStyle = col;
  }
  return c;
}

const TIPS = [
  'SPACE opens the emotes · 6 plays every character\'s own signature move',
  'WASD or the arrows walk - the camera follows',
  'Q / E turn the camera in 45° steps',
  'The wheel or - / = steps the zoom ladder',
  'C cycles the camera: follow, vote, overview, iso, free',
  'T stops the clock · , and . run it slower or faster',
  'B rings the bell in the clock tower',
  'V moves the game on: day, nomination, vote, execution, night',
  '[ and ] switch character · 1-6 play the emotes',
  'H hides the panel',
  'Fifteen cottages ring the square - stand at a door to open it',
  'The voting circle waits in the middle of the square',
  'The river runs down the west side, past the boathouse and the mill',
];

const PIECE_LABEL = (id, names) => {
  if (id === 'ground') return 'laying the ground and the river';
  if (id === 'props') return 'lighting the lamps';
  if (id === 'clocktower') return 'raising the clock tower';
  if (id === 'dais') return 'setting out the voting circle';
  if (id === 'foliage') return 'planting the forest';
  if (id === 'life') return 'waking the townsfolk';
  const m = /^house-(\d+)$/.exec(id);
  return m ? `building ${names?.[+m[1]] ?? id}` : id;
};

// boot phases (main.js #demo-boot text) -> [progress floor, label]
const PHASES = [
  [/building/i, 0.04, 'building Hollowmere'],
  [/loading characters/i, 0.8, 'calling the characters'],
  [/compiling shaders/i, 0.88, 'mixing the paints (shaders)'],
];
const PIECES_TOTAL = 21;          // town.js BUILD_ORDER: ground, props, 15 houses, clocktower, dais, foliage, life
const PIECES_SPAN = [0.05, 0.78]; // the town build's share of the bar

/** ?intro=0 off, ?intro=1 on; default on except capture mode and automation (Playwright: navigator.webdriver). */
export function introEnabled(params = new URLSearchParams(location.search)) {
  const v = params.get('intro');
  if (v === '0' || v === 'off' || v === 'false') return false;
  if (v === '1' || v === 'on' || v === 'true') return true;
  if (params.get('capture') === '1') return false;
  return !navigator.webdriver;
}

function mount() {
  let root = document.getElementById('demo-loading');
  if (!root) { root = document.createElement('div'); root.id = 'demo-loading'; document.body.appendChild(root); }
  root.replaceChildren();
  root.classList.add('ldg-live');
  const vw = innerWidth, vh = innerHeight;
  const px = Math.max(2, Math.min(5, Math.floor(Math.min(vw / 230, vh / 210))));
  root.style.setProperty('--px', `${px}px`);

  const wrap = document.createElement('div'); wrap.className = 'ldg-wrap';
  const scene = document.createElement('div'); scene.className = 'ldg-scene';
  scene.style.width = `${SW * px}px`; scene.style.height = `${SH * px}px`;
  const bg = drawScene(); bg.className = 'ldg-layer'; scene.appendChild(bg);
  // twinkling stars: a sparse layer whose opacity blinks in steps
  const tw = document.createElement('canvas'); tw.width = SW; tw.height = SH; tw.className = 'ldg-layer ldg-twinkle';
  { const g = tw.getContext('2d'); g.fillStyle = P.glowHi; for (let i = 0; i < 9; i++) g.fillRect(Math.floor(hash(i + 500) * SW), Math.floor(hash(i + 600) * 60), 1, 1); }
  scene.appendChild(tw);
  const tw2 = tw.cloneNode(); tw2.className = 'ldg-layer ldg-twinkle b';
  { const g = tw2.getContext('2d'); g.fillStyle = P.star; for (let i = 0; i < 9; i++) g.fillRect(Math.floor(hash(i + 700) * SW), Math.floor(hash(i + 800) * 60), 1, 1); }
  scene.appendChild(tw2);
  // belfry lantern glow (flicker = stepped opacity) over the bell
  const lan = document.createElement('canvas'); lan.width = 10; lan.height = 9; lan.className = 'ldg-abs ldg-lantern';
  { const g = lan.getContext('2d'); g.fillStyle = 'rgba(255,196,107,0.55)'; g.fillRect(0, 2, 10, 7); g.fillRect(1, 1, 8, 1); g.fillStyle = 'rgba(255,230,168,0.5)'; g.fillRect(2, 6, 6, 3); }
  place(lan, TX + 15, TY + 31, 10, 9, px);
  scene.appendChild(lan);
  // clock hands: two 12-frame strips behind 15 x 15 windows centred on the dial
  const HS = 15;
  for (const [cls, len, col, thick] of [['ldg-hour', 3, P.slate1, true], ['ldg-min', 5, P.slate0, false]]) {
    const win = document.createElement('div'); win.className = `ldg-abs ldg-handwin ${cls}`;
    place(win, DIAL.x - 7, DIAL.y - 7, HS, HS, px);
    const strip = drawHandStrip(HS, len, col, thick); strip.className = 'ldg-strip';
    strip.style.width = `${HS * 12 * px}px`; strip.style.height = `${HS * px}px`;
    win.appendChild(strip);
    scene.appendChild(win);
  }
  // drifting mist: one wide translucent band, translated by whole scene pixels in steps
  const mist = document.createElement('canvas'); mist.width = SW * 2; mist.height = 14; mist.className = 'ldg-abs ldg-mist';
  { const g = mist.getContext('2d'); for (let x = 0; x < SW * 2; x++) { const h = 3 + Math.round(3 * (0.5 + 0.5 * Math.sin(x * 2 * Math.PI / SW * 3))) + Math.round(2 * hash(x % SW)); g.fillStyle = 'rgba(147,160,190,0.10)'; g.fillRect(x, 14 - h - 2, 1, h); g.fillStyle = 'rgba(147,160,190,0.07)'; g.fillRect(x, 14 - h - 4, 1, 2); } }
  place(mist, 0, 92, SW * 2, 14, px);
  scene.appendChild(mist);
  wrap.appendChild(scene);

  const title = drawText('Hollowmere', { scale: px * 2, color: '#efe6cf', shade: '#d8ccb0', shadow: '#0a0c12' });
  title.classList.add('ldg-title');
  wrap.appendChild(title);
  const bar = document.createElement('div'); bar.className = 'ldg-bar';
  bar.style.width = `${120 * px}px`; bar.style.height = `${4 * px}px`;
  const fill = document.createElement('div'); fill.className = 'ldg-fill'; bar.appendChild(fill);
  wrap.appendChild(bar);
  const label = document.createElement('div'); label.className = 'ldg-label'; wrap.appendChild(label);
  const tip = document.createElement('div'); tip.className = 'ldg-tip'; wrap.appendChild(tip);
  root.appendChild(wrap);
  return { root, fill, label, tip, px };
}

function place(el, x, y, w, h, px) {
  el.style.left = `${x * px}px`; el.style.top = `${y * px}px`; el.style.width = `${w * px}px`; el.style.height = `${h * px}px`;
}

function createLoading() {
  const ui = mount();
  let value = 0, text = '', done = false, held = false, names = null, phaseFloor = 0, lastPieces = -1;
  let resolveDone;
  const whenDone = new Promise((r) => { resolveDone = r; });

  const setLabel = (s) => {
    if (s === text) return;
    text = s;
    ui.label.replaceChildren(drawText(`${s}`, { scale: ui.px, color: '#a69c86', shadow: '#0a0c12' }));
  };
  const render = () => {
    const q = Math.round(value * 60) / 60;      // the fill moves in whole steps (pixel bar)
    ui.fill.style.transform = `scaleX(${q})`;
  };
  let tipIx = Math.floor((Date.now() / 1000) % TIPS.length);
  const showTip = () => {
    ui.tip.replaceChildren(drawText(TIPS[tipIx % TIPS.length], { scale: Math.max(2, ui.px - 1), color: '#6f6a5e', shadow: null }));
    tipIx++;
  };
  showTip();
  const tipTimer = setInterval(showTip, 3600);

  const api = {
    el: ui.root,
    get value() { return value; },
    get label() { return text; },
    get done() { return done; },
    whenDone,
    /** Set the bar (never moves backwards) and optionally the label. */
    progress(frac, lbl) {
      if (done) return;
      value = Math.max(value, Math.min(1, frac));
      if (lbl) setLabel(lbl);
      render();
    },
    step(name) {
      for (const [re, f, l] of PHASES) if (re.test(name)) { phaseFloor = Math.max(phaseFloor, f); api.progress(f, l); return; }
      api.progress(value, name);
    },
    /** A town piece started building (id from BUILD_ORDER). */
    piece(id, n) {
      const k = Math.max(0, n - 1);   // the piece being imported now is not built yet
      api.progress(PIECES_SPAN[0] + (PIECES_SPAN[1] - PIECES_SPAN[0]) * (k / PIECES_TOTAL), PIECE_LABEL(id, names));
    },
    /** Keep the screen up after ready (the intro warms its poses behind it, then calls done()). */
    hold() { held = true; },
    done() {
      if (done) return;
      api.progress(1, 'welcome to Hollowmere');
      done = true;
      clearInterval(tipTimer);
      ui.root.classList.add('ldg-out');
      setTimeout(() => { ui.root.style.display = 'none'; }, 750);
      resolveDone();
    },
    fail() { done = true; clearInterval(tipTimer); ui.root.style.display = 'none'; resolveDone(); },
    get held() { return held; },
  };
  setLabel('opening the gates');
  render();

  // ---- passive progress: piece imports (Resource Timing), boot phases (#demo-boot), ready (window.__demo)
  import('../town/layout.js').then((m) => { names = m.HOUSE_NAMES; }).catch(() => {});
  const seen = [];
  const scan = () => {
    for (const e of performance.getEntriesByType('resource')) {
      const m = /\/src\/town\/(?:pieces\/([\w-]+)|(life)\/index)\.js(?:$|\?)/.exec(e.name);
      if (!m) continue;
      const id = m[1] || m[2];
      if (!seen.includes(id)) seen.push(id);
    }
    if (seen.length !== lastPieces && phaseFloor < 0.8) { lastPieces = seen.length; if (seen.length) api.piece(seen[seen.length - 1], seen.length); }
  };
  const boot = document.getElementById('demo-boot');
  let readySeen = false, bootText = null;
  const tick = () => {
    if (done) return;
    scan();
    if (boot) {
      if (boot.classList.contains('error')) { api.fail(); return; }
      const bt = boot.textContent || '';
      if (bt !== bootText) { bootText = bt; api.step(bt); }
    }
    const d = window.__demo;
    if (d?.ready && !readySeen) { readySeen = true; onReady(d); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // the RAF callback does not run while a piece builds; a fallback timer catches the boot text in between
  const t2 = setInterval(() => { if (done) clearInterval(t2); else scan(); }, 200);

  async function onReady(d) {
    api.progress(0.94, 'the town is ready');
    const demo = d.demo;
    if (!demo || !introEnabled(demo.params) || demo.engine?.capture) { api.done(); return; }
    if (demo.intro) { api.hold(); return; }    // the lead wired the intro: it calls done() after its warm-up
    api.hold();
    try {
      const { createIntro } = await import('./intro.js');
      const intro = createIntro(demo, { loading: api });
      demo.intro = intro;
      demo.engine.onUpdate((t, dt) => intro.update(t, dt));
    } catch (e) {
      console.error('[demo] intro failed:', e);
      (window.__demo.errors ??= []).push(`intro: ${e?.stack || e}`);
      api.done();
    }
  }
  return api;
}

export const loading = createLoading();
export default loading;
