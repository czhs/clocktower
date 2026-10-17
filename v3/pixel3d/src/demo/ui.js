// Hollowmere demo control panel (owner: ui; docs/DEMO.md §4.4).
//   mountUI(demo) -> ui = { el, update(t, dt), toast(text), help(open?), dispose() }
// Plain DOM, no framework. Mounts into #demo-ui (the panel / help take pointer events, the status line and toasts let
// clicks through to the canvas). Styling: src/demo/ui.css (linked from here, so demo.html needs nothing).
// Every control WRITES THE SHARED STORE (src/demo/state.js via demo.store, source 'ui') and re-renders from store
// events, so keys, URL params, tests and other modules stay in sync with the panel. The only calls outside the store
// are the documented module APIs that have no state key: demo.time.ringBell() (DEMO.md §4.3: "any module may call")
// and demo.player.teleport(x, z, face) for Travel (§4.1) - CONTRACT-REQUEST lead: a store/event route for travel.
// Read-only: demo.player.position / nearDoor, demo.time.hours / preset, demo.cut.info, window.__pixel.info() (perf).
// Sections: Character (roster of complete characters), Time (clock, 0-24 h slider, run/pause, speed, presets),
// Town (phase, ceremony, bell, 15-seat editor + nominee), Render (quality, life, cut-away, camera, zoom, yaw, perf),
// Travel (the 15 cottages by name, the dais, the clock tower, spawn). Keys: H help overlay, ` (backquote) panel.
// User text is never put through innerHTML: every label is a text node.
import { PHASES, CAMERA_MODES, CUT_MODES, QUALITIES, SEAT_COUNT, SPAWN, formatClock, keyLabel, doorOf, emptySeat } from './api.js';
import { ZOOM_LADDER } from '../core/PixelCamera.js';

// ------------------------------------------------------------------------------------------------ small DOM kit
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
};
const pressed = (el, on) => el.setAttribute('aria-pressed', on ? 'true' : 'false');

/** Clock presets of the Time section (hours). */
export const TIME_PRESETS = [['dawn', 6.25], ['noon', 12.5], ['golden', 18.5], ['dusk', 19.75], ['night', 0]];
const SPEEDS = [1, 10, 60, 600];
const SEAT_KEYS = [['occupied', 'seated'], ['dead', 'dead'], ['ghostVote', 'ghost vote'], ['nominated', 'nominated'], ['onBlock', 'on block']];
const PREFS_KEY = 'hollowmere-demo-ui';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ } };

function ensureCss() {
  const href = new URL('./ui.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === href)) return;
  document.head.append(h('link', { rel: 'stylesheet', href }));
}

/** A stable, muted colour per character id (the roster's monogram tiles). */
function tint(id) {
  let x = 2166136261;
  for (const c of id) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return `hsl(${(x >>> 0) % 360} 30% 36%)`;
}
const titleCase = (s) => String(s).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const isDay = (hours) => hours >= 6 && hours < 20;

/** 15x15 pixel sun / moon glyph for the clock (drawn into a canvas shown at 2x, pixelated). */
function drawSky(cv, hours) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 15, 15);
  if (isDay(hours)) {
    g.fillStyle = hours < 8 || hours > 17.5 ? '#f0a85a' : '#f3d27a';
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const dx = x - 7, dy = y - 7, d = Math.hypot(dx, dy);
      if (d < 3.6 || (d > 5 && d < 6.6 && (dx * dy === 0 || Math.abs(dx) === Math.abs(dy)))) g.fillRect(x, y, 1, 1);
    }
  } else {
    g.fillStyle = '#dfe6f2';
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) if (Math.hypot(x - 7, y - 7) < 5.2 && Math.hypot(x - 9.5, y - 5.5) >= 4.6) g.fillRect(x, y, 1, 1);
    g.fillStyle = '#9fb0cf'; g.fillRect(2, 2, 1, 1); g.fillRect(12, 11, 1, 1); g.fillRect(13, 3, 1, 1);
  }
}

// ------------------------------------------------------------------------------------------------ mountUI
export function mountUI(demo) {
  ensureCss();
  const { store, input, events } = demo;
  const L = demo.layout;
  const root = document.getElementById('demo-ui') ?? document.body.appendChild(h('div', { id: 'demo-ui' }));
  const offs = [];                                   // unsubscribe / unbind functions (dispose)
  const renders = new Map();                         // store key -> [render fns]
  const onKey = (key, fn) => { (renders.get(key) ?? renders.set(key, []).get(key)).push(fn); fn(store.state); };
  offs.push(store.on('change', ({ keys, state }) => { for (const k of keys) for (const fn of renders.get(k) ?? []) fn(state); }));
  const set = (patch) => store.set(patch, 'ui');
  const prefs = loadPrefs();
  prefs.open ??= { character: true, time: true, town: false, render: true, travel: false };

  // --- generic controls ---------------------------------------------------------------------------
  const btn = (label, onclick, props = {}) => h('button', { type: 'button', class: 'dui-btn', onclick, ...props }, label);
  /** Segmented control bound to a store key. */
  const seg = (key, options, label = (o) => o, title = null) => {
    const bs = options.map((o) => btn(label(o), () => set({ [key]: o }), { title: title?.(o) }));
    onKey(key, (s) => options.forEach((o, i) => pressed(bs[i], s[key] === o)));
    return h('div', { class: 'dui-seg' }, bs);
  };
  /** On / off toggle bound to a boolean store key. */
  const tog = (key, on = 'on', off = 'off') => {
    const b = btn('', () => set({ [key]: !store.state[key] }));
    onKey(key, (s) => { pressed(b, s[key]); b.textContent = s[key] ? on : off; });
    return b;
  };
  const row = (label, ...ctl) => h('div', { class: 'dui-row' }, h('span', { class: 'dui-lbl' }, label), ...ctl);
  /** Label above a full-width control (segmented controls with long names). */
  const stack = (label, ctl) => h('div', { class: 'dui-stack' }, h('span', { class: 'dui-lbl' }, label), ctl);
  const section = (id, title, ...kids) => {
    const aside = h('span', { class: 'dui-aside' });
    const d = h('details', { class: 'dui-sec', dataset: { sec: id } },
      h('summary', {}, title, aside), h('div', { class: 'dui-sec-body' }, kids));
    d.open = !!prefs.open[id];
    d.addEventListener('toggle', () => { prefs.open[id] = d.open; savePrefs(prefs); });
    d.aside = aside;
    return d;
  };

  // toasts are used by every section below
  const toasts = h('div', { class: 'dui-toasts', 'aria-live': 'polite' });
  function toast(text, ms = 2600) {
    const el = h('div', { class: 'dui-toast' }, String(text));
    toasts.prepend(el);
    while (toasts.children.length > 4) toasts.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }

  // --- Character ----------------------------------------------------------------------------------
  const roster = (demo.characters ?? []).filter((c) => c && c.complete && c.id);
  if (!roster.some((c) => c.id === store.state.character)) roster.unshift({ id: store.state.character, name: titleCase(store.state.character) });
  let loadingChar = null;
  const nameOf = (id) => roster.find((c) => c.id === id)?.name ?? titleCase(id);
  const charBtns = roster.map((c) => {
    const tile = h('span', { class: 'dui-mono-tile', style: { background: tint(c.id) } },
      c.thumb ? h('img', { src: c.thumb, alt: '' }) : String(c.name || c.id).trim()[0].toUpperCase());
    const sub = [c.status === 'wip' ? 'WIP' : null, c.bodyPlan, Number(c.height) ? `${Number(c.height).toFixed(1)} m` : null].filter(Boolean).join(' · ') || c.blurb || 'ready';
    const b = h('button', { type: 'button', class: 'dui-char', title: c.blurb || c.name || c.id, onclick: () => pickChar(c.id) },
      tile, h('span', { class: 'dui-char-text' }, h('span', { class: 'dui-char-name' }, c.name || titleCase(c.id)), h('span', { class: 'dui-char-sub' }, sub)));
    b.dataset.id = c.id;
    if (c.status) b.dataset.status = c.status;
    return b;
  });
  // the roster comes shipped first (characters.js); a header row before each group: Shipped / Work in progress
  const nShipped = roster.filter((c) => c.status !== 'wip').length, nWip = roster.length - nShipped;
  const charList = [];
  charBtns.forEach((b, i) => {
    const st = roster[i].status === 'wip' ? 'wip' : 'shipped';
    const prev = i ? (roster[i - 1].status === 'wip' ? 'wip' : 'shipped') : null;
    if (nWip && st !== prev) charList.push(h('div', { class: 'dui-char-grp' }, st === 'wip' ? `Work in progress · ${nWip}` : `Shipped · ${nShipped}`));
    charList.push(b);
  });
  const paintChars = () => charBtns.forEach((b) => {
    pressed(b, b.dataset.id === store.state.character);
    b.classList.toggle('loading', b.dataset.id === loadingChar);
  });
  const pickChar = (id) => {
    if (id === store.state.character) return;
    loadingChar = id;
    set({ character: id });
    paintChars();
  };
  const charSec = section('character', 'Character', h('div', { class: 'dui-chars' }, charList));
  onKey('character', (s) => { charSec.aside.textContent = nameOf(s.character); paintChars(); });
  offs.push(events.on('player:character', ({ id }) => {
    const was = loadingChar; loadingChar = null; paintChars();
    if (was) toast(`Now walking as ${nameOf(id)}`);
  }));
  offs.push(store.on('character', ({ value, source }) => {
    // the player restores the previous id (source 'player') when a character fails to load
    if (source === 'player') { if (loadingChar && loadingChar !== value) toast(`Could not load ${nameOf(loadingChar)}`); loadingChar = null; paintChars(); }
    else if (source !== 'ui') { loadingChar = value; paintChars(); }
  }));

  // --- Time ---------------------------------------------------------------------------------------
  const clockBig = h('div', { class: 'dui-clock-big' }, '--:--');
  const clockPreset = h('div', { class: 'dui-clock-preset' });
  const clockSpeed = h('div', { class: 'dui-clock-speed' });
  const glyph = h('canvas', { class: 'dui-clock-glyph', width: 15, height: 15 });
  const slider = h('input', { type: 'range', min: 0, max: 24, step: 1 / 60, value: store.state.timeOfDay, 'aria-label': 'time of day' });
  let dragging = false;
  slider.addEventListener('pointerdown', () => { dragging = true; });
  const endDrag = () => { if (dragging) { dragging = false; slider.blur(); } };
  addEventListener('pointerup', endDrag); offs.push(() => removeEventListener('pointerup', endDrag));
  slider.addEventListener('input', () => set({ timeOfDay: Number(slider.value) }));
  slider.addEventListener('change', () => slider.blur());
  const playBtn = btn('', () => set({ paused: !store.state.paused }), { class: 'dui-btn icon', title: 'run / pause the clock (T)' });
  onKey('paused', (s) => { playBtn.textContent = s.paused ? '▶' : '❚❚'; pressed(playBtn, s.paused); });
  const speedBtns = SPEEDS.map((v) => btn(`${v}×`, () => set({ timeSpeed: v, paused: false }), { title: `${v} game minute${v === 1 ? '' : 's'} per second` }));
  const slower = btn('−', () => set({ timeSpeed: store.state.timeSpeed <= 0.5 ? 0 : store.state.timeSpeed / 2 }), { class: 'dui-btn icon', title: 'clock slower (,)' });
  const faster = btn('+', () => set({ timeSpeed: Math.min(3600, (store.state.timeSpeed || 0.5) * 2) }), { class: 'dui-btn icon', title: 'clock faster (.)' });
  const speedText = () => {
    const s = store.state;
    if (s.paused) return 'paused';
    if (!s.timeSpeed) return 'clock stands';
    const v = s.timeSpeed;
    return v >= 60 ? `${+(v / 60).toFixed(2)} h / s` : `${+v.toFixed(2)} min / s`;
  };
  onKey('timeSpeed', (s) => speedBtns.forEach((b, i) => pressed(b, s.timeSpeed === SPEEDS[i])));
  const timeSec = section('time', 'Time',
    h('div', { class: 'dui-clock' }, clockBig, h('div', { class: 'dui-clock-side' }, clockPreset, clockSpeed), glyph),
    h('div', {}, h('div', { class: 'dui-range' }, h('div', { class: 'dui-track' }), slider),
      h('div', { class: 'dui-ticks' }, ['0', '3', '6', '9', '12', '15', '18', '21', '24'].map((t) => h('span', {}, t)))),
    h('div', { class: 'dui-row' }, playBtn, slower, h('div', { class: 'dui-seg' }, speedBtns), faster),
    h('div', { class: 'dui-seg' }, TIME_PRESETS.map(([name, def]) => {
      // the time module's keyframe hours when it publishes them (time.presets), else ours
      const hr = Number.isFinite(demo.time?.presets?.[name]) ? demo.time.presets[name] : def;
      return btn(name, () => set({ timeOfDay: hr }), { title: formatClock(hr) });
    })),
  );
  let shownMin = -1, shownSpeed = '', shownDay = null, shownPreset = null, shownPaused = null, shownRate = null;
  const paintClock = (force = false) => {
    const hours = Number.isFinite(demo.time?.hours) ? demo.time.hours : store.state.timeOfDay;
    const m = Math.floor(hours * 60), preset = demo.time?.preset ?? '';
    if (m !== shownMin || preset !== shownPreset || force) {
      if (isDay(hours) !== shownDay) { shownDay = isDay(hours); drawSky(glyph, hours); }
      shownMin = m; shownPreset = preset;
      clockBig.textContent = formatClock(hours);
      clockPreset.textContent = preset;
      timeSec.aside.textContent = `${formatClock(hours)} ${preset}`;
      if (!dragging && Math.abs(Number(slider.value) - hours) > 1 / 120) slider.value = String(hours);
    }
    // (perf) the speed label only changes with paused / timeSpeed: no string built per frame otherwise
    const st = store.state;
    if (force || st.paused !== shownPaused || st.timeSpeed !== shownRate) {
      shownPaused = st.paused; shownRate = st.timeSpeed;
      const sp = speedText();
      if (sp !== shownSpeed) { shownSpeed = sp; clockSpeed.textContent = sp; clockSpeed.classList.toggle('paused', st.paused); }
    }
  };
  onKey('paused', () => paintClock(true));
  onKey('timeSpeed', () => paintClock(true));
  onKey('timeOfDay', () => paintClock(true));
  offs.push(events.on('tod', () => paintClock(true)));

  // --- Town ---------------------------------------------------------------------------------------
  const phaseSeg = seg('phase', PHASES, (p) => (p === 'nomination' ? 'nominate' : p === 'execution' ? 'execute' : p), (p) => `phase: ${p} (V cycles)`);
  let ceremonyTimer = null;
  /** Fallback ceremony (no time.playCeremony): seat 8 if fewer than 5 sit, nominate, vote after 3 s - all store writes. */
  const storeCeremony = () => {
    clearTimeout(ceremonyTimer);
    let seats = store.state.seats.map((s) => ({ ...s }));
    if (seats.filter((s) => s.occupied).length < 5) seats = seats.map((s, i) => ({ ...s, occupied: s.occupied || i < 8 }));
    const alive = seats.map((s, i) => (s.occupied && !s.dead ? i : -1)).filter((i) => i >= 0);
    let nominee = store.state.nominee;
    if (nominee === null || !seats[nominee]?.occupied) nominee = alive[Math.floor(Math.random() * alive.length)] ?? 0;
    seats = seats.map((s, i) => ({ ...s, nominated: i === nominee ? true : s.nominated, onBlock: false }));
    set({ seats, nominee, phase: 'nomination' });
    toast(`Seat ${nominee + 1} is nominated`);
    ceremonyTimer = setTimeout(() => {
      if (store.state.phase === 'nomination' && store.state.nominee === nominee) { set({ phase: 'vote' }); toast('The vote begins'); }
    }, 3000);
  };
  // the scripted ceremony is the time module's (life/ceremony.js timings, written through the store; P plays / stops)
  const ceremonyRunning = () => !!demo.time?.ceremony;
  const startCeremony = () => {
    const T = demo.time;
    if (T?.playCeremony) { if (ceremonyRunning()) T.stopCeremony?.(); else T.playCeremony(); paintCeremony(); }
    else storeCeremony();
  };
  let ceremonyBtn = null, shownCer = null;
  const paintCeremony = () => {
    const on = ceremonyRunning();
    if (!ceremonyBtn || on === shownCer) return;
    shownCer = on; ceremonyBtn.textContent = on ? 'stop ceremony' : 'play ceremony'; pressed(ceremonyBtn, on);
  };
  const ringBell = () => {
    if (demo.time?.ringBell) demo.time.ringBell();
    else toast('No bell: the time module is not loaded');
  };
  const fillSeats = (n) => set({
    seats: store.state.seats.map((s, i) => (i < n ? { ...s, occupied: true } : emptySeat())),
    nominee: store.state.nominee !== null && store.state.nominee < n ? store.state.nominee : null,
  });
  const clearSeats = () => { clearTimeout(ceremonyTimer); set({ seats: Array.from({ length: SEAT_COUNT }, emptySeat), nominee: null }); };

  // seat grid: one column per seat, a row per flag (+ the nominee radio row)
  const grid = h('div', { class: 'dui-seats', role: 'group', 'aria-label': 'seats' });
  grid.append(h('span', {}));
  for (let i = 0; i < SEAT_COUNT; i++) grid.append(h('span', { class: 'dui-sn' }, String(i + 1)));
  const cells = [];
  const toggleSeat = (i, key) => {
    const s = store.state.seats[i];
    const v = !s[key];
    const patch = { [key]: v };
    if (v && key !== 'occupied') patch.occupied = true;                          // dead / nominated / ... imply a seat
    if (key === 'occupied' && !v) Object.assign(patch, { dead: false, nominated: false, onBlock: false });
    store.setSeat(i, patch, 'ui');
    if (key === 'occupied' && !v && store.state.nominee === i) set({ nominee: null });
  };
  for (const [key, label] of [...SEAT_KEYS, ['nominee', 'nominee']]) {
    grid.append(h('span', { class: 'dui-sl' }, label));
    for (let i = 0; i < SEAT_COUNT; i++) {
      const c = h('button', { type: 'button', class: `dui-cell k-${key}`, title: `seat ${i + 1}: ${label}`, 'aria-label': `seat ${i + 1} ${label}`,
        onclick: () => (key === 'nominee' ? set({ nominee: store.state.nominee === i ? null : i }) : toggleSeat(i, key)) });
      cells.push({ c, i, key });
      grid.append(c);
    }
  }
  const paintSeats = (s) => {
    for (const { c, i, key } of cells) {
      const seat = s.seats[i];
      pressed(c, key === 'nominee' ? s.nominee === i : !!seat[key]);
      c.classList.toggle('off', key !== 'occupied' && !seat.occupied && !(key === 'nominee' && s.nominee === i));
    }
  };
  onKey('seats', paintSeats); onKey('nominee', paintSeats);
  const townSec = section('town', 'Town',
    stack('phase', phaseSeg),
    h('div', { class: 'dui-btns' },
      (ceremonyBtn = btn('play ceremony', startCeremony, { class: 'dui-btn wide', title: 'the scripted voting ceremony: seats fill, a nomination, the vote, the execution, night (P)' })),
      btn('ring bell', ringBell, { class: 'dui-btn wide', title: 'ring the clock-tower bell (B)' })),
    grid,
    h('div', { class: 'dui-row' }, h('span', { class: 'dui-lbl' }, 'fill'),
      h('div', { class: 'dui-seg' }, [5, 8, 10, 12, 15].map((n) => btn(String(n), () => fillSeats(n), { title: `seat ${n} players` }))),
      btn('clear', clearSeats, { class: 'dui-btn warn', title: 'empty every seat' })),
  );
  const paintTownAside = (s) => {
    const n = s.seats.filter((x) => x.occupied).length;
    townSec.aside.textContent = `${s.phase} · ${n}/15${s.nominee !== null ? ` · #${s.nominee + 1}` : ''}`;
  };
  onKey('phase', paintTownAside); onKey('seats', paintTownAside); onKey('nominee', paintTownAside);
  offs.push(() => clearTimeout(ceremonyTimer));

  // --- Render -------------------------------------------------------------------------------------
  const qualitySeg = (() => {
    const bs = QUALITIES.map((q) => btn(q, () => {
      if (store.state.quality === q) return;
      toast(`Rebuilding the town (${q}) ...`);
      set({ quality: q });   // the time module reloads the page with the whole state (demo.reload)
    }, { title: 'render tier (reloads the town, keeps the state)' }));
    onKey('quality', (s) => QUALITIES.forEach((q, i) => pressed(bs[i], s.quality === q)));
    return h('div', { class: 'dui-seg' }, bs);
  })();
  const zoomVal = h('span', { class: 'dui-mono', style: { minWidth: '40px', textAlign: 'center' } });
  const zoomStep = (dir) => {
    const vh = store.state.zoom;
    let i = ZOOM_LADDER.findIndex((v) => v >= vh - 1e-6);
    if (i < 0) i = ZOOM_LADDER.length - 1;
    i = Math.max(0, Math.min(ZOOM_LADDER.length - 1, i + dir));
    set({ zoom: Math.max(5, Math.min(45, ZOOM_LADDER[i])) });
  };
  onKey('zoom', (s) => { zoomVal.textContent = `${+Number(s.zoom).toFixed(1)} m`; });
  const yawVal = h('span', { class: 'dui-mono', style: { minWidth: '32px', textAlign: 'center' } });
  onKey('yaw', (s) => { yawVal.textContent = `${s.yaw}°`; });
  const perf = {};
  const perfCell = (k, label) => h('div', {}, (perf[k] = h('b', {}, '-')), h('span', {}, label));
  const renderSec = section('render', 'Render',
    row('quality', qualitySeg),
    row('life', tog('life', 'townsfolk about', 'town stands still')),
    row('cut-away', seg('cutaway', CUT_MODES, (m) => m, (m) => ({ auto: 'on at gameplay zooms', on: 'always', off: 'never' }[m]))),
    stack('camera', seg('camera', CAMERA_MODES, (m) => m, (m) => `camera: ${m} (C cycles)`)),
    h('div', { class: 'dui-row' }, h('span', { class: 'dui-lbl' }, 'zoom'),
      btn('−', () => zoomStep(1), { class: 'dui-btn icon', title: 'zoom out (-, wheel)' }), zoomVal,
      btn('+', () => zoomStep(-1), { class: 'dui-btn icon', title: 'zoom in (=, wheel)' }),
      h('span', { class: 'dui-lbl', style: { width: 'auto', marginLeft: 'auto' } }, 'turn'),
      btn('↺', () => set({ yaw: store.state.yaw + 45 }), { class: 'dui-btn icon', title: 'rotate left 45° (Q)' }), yawVal,
      btn('↻', () => set({ yaw: store.state.yaw - 45 }), { class: 'dui-btn icon', title: 'rotate right 45° (E)' })),
    h('div', { class: 'dui-perf' }, perfCell('fps', 'fps'), perfCell('ms', 'render cpu ms'), perfCell('tris', 'triangles'),
      perfCell('calls', 'draw calls'), perfCell('programs', 'programs'), perfCell('res', 'pixels')),
  );

  // --- Travel -------------------------------------------------------------------------------------
  const inHouse = (x, z) => L.houses.some((r) => L.insideHouse(r, x, z, 0.15));
  const free = (x, z) => !L.blocked(Math.floor(x), Math.floor(z)) && !inHouse(x, z);
  /** A walkable standing point near (x, z). With a door normal n: in front of the door, ~0.9 m out (within the
   *  player's door trigger), sliding sideways / further out when that tile is blocked; else a spiral search. */
  const spotNear = (x, z, n = null) => {
    if (n) {
      // prefer points within 1.25 m of the door (inside the player's door trigger), closest to 0.9 m straight out
      const ix = x + n[0] * 0.9, iz = z + n[1] * 0.9;
      let near = null, nearS = Infinity, far = null, farS = Infinity;
      for (let d = 0.5; d <= 3.5; d += 0.1) for (let lat = -1; lat <= 1.001; lat += 0.125) {
        const px = x + n[0] * d - n[1] * lat, pz = z + n[1] * d + n[0] * lat;
        if (!free(px, pz)) continue;
        const sc = Math.hypot(px - ix, pz - iz);
        if (Math.hypot(px - x, pz - z) <= 1.25) { if (sc < nearS) { near = [px, pz]; nearS = sc; } }
        else if (sc < farS) { far = [px, pz]; farS = sc; }
      }
      if (near || far) return near ?? far;
    }
    for (let r = 0; r <= 6; r += 0.5) for (let a = 0; a < 16; a++) {
      const px = x + Math.sin(a / 16 * Math.PI * 2) * r, pz = z + Math.cos(a / 16 * Math.PI * 2) * r;
      if (free(px, pz)) return [px, pz];
    }
    return [x, z];
  };
  const places = [
    ...L.houses.map((r) => ({ id: r.id, name: `${r.index} · ${r.name}`, short: r.name })),
    { id: 'clocktower', name: 'The Clocktower', short: 'the clock tower' },
    { id: 'dais', name: 'The Dais', short: 'the dais' },
    { id: 'spawn', name: 'Spawn', short: 'the square' },
  ];
  const placeName = (id) => places.find((p) => p.id === id)?.short ?? id;
  /** Where Travel puts the player for a place id: [x, z, face]. Exported on the ui object for tests. */
  const travelSpot = (id) => {
    if (id === 'spawn') return [SPAWN.x, SPAWN.z, 0];
    if (id === 'dais') { const [x, z] = spotNear(L.STORYTELLER_SPAWN.x + 0.5, L.STORYTELLER_SPAWN.z + 0.5); return [x, z, 0]; }
    const d = doorOf(demo.town.registry, id);   // the piece's door anchor (house-14: the real front-wall door)
    if (!d) return null;
    const n = d.normal ?? [0, 1];
    const [x, z] = spotNear(d.pos.x, d.pos.z, n);
    return [x, z, Math.atan2(-n[0], -n[1])];     // facing the door
  };
  // Travel prefers the player's own spots (player.goTo: in front of the REAL door, facing it; `walk` follows an A*
  // path); travelSpot() above is the fallback for a player without goTo.
  const go = (id) => {
    const P = demo.player;
    if (!P?.teleport && !P?.goTo) { toast('No player to move'); return; }
    if (store.state.camera !== 'follow' && store.state.camera !== 'free') set({ camera: 'follow' });
    const walk = prefs.travel === 'walk';
    let ok = false;
    if (P.goTo) ok = P.goTo(id, { walk });
    if (!ok && !walk && P.teleport) { const s = travelSpot(id); if (s) { P.teleport(...s); ok = true; } }
    if (ok) toast(`${walk ? 'Walking to' : 'To'} ${placeName(id)}`);
    else if (!walk) toast(`No way to ${placeName(id)}`);
  };
  const travelMode = (() => {
    const modes = [['jump', 'appear there at once'], ['walk', 'walk there along the lanes']];
    const bs = modes.map(([m, title]) => btn(m, () => { prefs.travel = m; savePrefs(prefs); paint(); }, { title }));
    const paint = () => modes.forEach(([m], i) => pressed(bs[i], (prefs.travel ?? 'jump') === m));
    paint();
    return h('div', { class: 'dui-seg' }, bs);
  })();
  let extraSpots = [];
  try { extraSpots = ['well', 'fountain'].filter((k) => demo.player?.spots?.()[k]); } catch { extraSpots = []; }
  for (const k of extraSpots) places.push({ id: k, name: titleCase(k), short: `the ${k}` });
  const placeSel = h('select', { class: 'dui-select dui-grow', 'aria-label': 'travel to' },
    places.filter((p) => p.id.startsWith('house-')).map((p) => h('option', { value: p.id }, p.name)));
  placeSel.addEventListener('change', () => { go(placeSel.value); placeSel.blur(); });
  const doorNow = h('span', { class: 'dui-note' });
  // houses (player.js + interior.js): 'enter' fades into the chosen cottage (from anywhere: the store's `location`
  // key, source 'ui'; the player walks in through the fade), 'leave' back to its doorstep; inside, 'bed' walks to the
  // room's night-visit point beside the bed (the Storyteller's night visits)
  const enterHouse = (id) => {
    if (!demo.player?.enter) { toast('No houses to enter'); return; }
    if (store.state.camera !== 'follow') set({ camera: 'follow' });
    if (!set({ location: id })) demo.player.enter(id);
  };
  const leaveHouse = () => { if (!set({ location: 'town' })) demo.player?.leave?.(); };
  const visitBed = () => {
    const r = demo.player?.interior, v = r?.visitPoint ?? r?.bed;
    if (!v) { toast('Not inside a house'); return; }
    const ok = demo.player.walkTo?.(v.x, v.z, { face: v.facing ?? null });
    toast(ok ? 'To the bedside' : 'No way to the bed');
  };
  const enterBtn = btn('enter', () => enterHouse(placeSel.value), { title: 'go into the chosen house' });
  const leaveBtn = btn('leave', leaveHouse, { title: 'back out to the doorstep' });
  const bedBtn = btn('bed', visitBed, { title: 'walk to the night-visit spot by the bed' });
  const whereNow = h('span', { class: 'dui-note' });
  const paintWhere = (s) => {
    const inside = s.location && s.location !== 'town';
    leaveBtn.disabled = !inside; bedBtn.disabled = !inside;
    whereNow.textContent = inside ? `Inside ${L.houses.find((r) => r.id === s.location)?.name ?? s.location}` : 'In town';
    travelSec.aside.textContent = inside ? placeName(s.location) : '';
    if (inside && placeSel.value !== s.location) placeSel.value = s.location;
  };
  const travelSec = section('travel', 'Travel',
    h('div', { class: 'dui-row' }, placeSel, btn('go', () => go(placeSel.value), { title: 'to its door' }), enterBtn),
    h('div', { class: 'dui-row' }, whereNow, leaveBtn, bedBtn),
    h('div', { class: 'dui-seg' }, btn('dais', () => go('dais')), btn('tower', () => go('clocktower'), { title: 'the clock tower door' }),
      extraSpots.map((k) => btn(k, () => go(k))), btn('spawn', () => go('spawn'))),
    row('travel', travelMode),
    doorNow,
  );

  onKey('location', paintWhere);

  // --- panel shell --------------------------------------------------------------------------------
  // Folding: prefs.collapsed is the viewer's saved choice on a wide screen. The panel also folds by itself (never
  // saved) on a narrow screen (innerWidth < NARROW_W: a phone, where it would cover ~80% of the view) and inside a
  // cottage on a small screen (innerWidth < ROOM_W: the dollhouse room would sit partly under it). A click on the fold
  // button overrides the automatic choice until that condition changes (resize across the threshold, enter / leave).
  const NARROW_W = 700, ROOM_W = 1100;
  const autoFold = () => innerWidth < NARROW_W || (store.state.location && store.state.location !== 'town' && innerWidth < ROOM_W);
  let autoWas = autoFold(), override = null;
  const folded = () => override ?? (autoWas || !!prefs.collapsed);
  const collapseBtn = btn('', () => {
    const next = !folded();
    if (autoWas) override = next; else { prefs.collapsed = next; savePrefs(prefs); override = null; }
    paintCollapsed();
  }, { class: 'dui-btn icon', title: 'fold the panel' });
  const refold = () => { const a = !!autoFold(); if (a !== autoWas) { autoWas = a; override = null; paintCollapsed(); } };
  const helpBtn = btn('?', () => help(), { class: 'dui-btn icon', title: 'keys (H)' });
  const hideBtn = btn('×', () => { set({ ui: false }); toast('Panel hidden: the backquote key ( ` ) brings it back'); }, { class: 'dui-btn icon', title: 'hide the panel (`)' });
  const body = h('div', { class: 'dui-body' }, charSec, timeSec, townSec, renderSec, travelSec);
  const panel = h('div', { class: 'dui-panel', role: 'region', 'aria-label': 'demo controls' },
    h('div', { class: 'dui-head' }, h('span', { class: 'dui-title' }, 'Hollowmere', h('small', {}, 'controls')), helpBtn, collapseBtn, hideBtn),
    body);
  const paintCollapsed = () => { const f = folded(); panel.classList.toggle('collapsed', f); collapseBtn.textContent = f ? '▾' : '▴'; };
  paintCollapsed();
  addEventListener('resize', refold);
  offs.push(() => removeEventListener('resize', refold), store.on('location', refold));
  // buttons / selects must not keep keyboard focus: Space / arrows / letters belong to the game (walking, emotes)
  panel.addEventListener('click', (e) => { const b = e.target.closest?.('button'); if (b) b.blur(); });
  panel.addEventListener('mousedown', (e) => { if (e.target.closest?.('button')) e.preventDefault(); });

  const status = h('div', { class: 'dui-status', 'aria-live': 'off' });

  // --- help overlay -------------------------------------------------------------------------------
  const helpCard = h('div', { class: 'dui-help-card', role: 'dialog', 'aria-label': 'keyboard shortcuts' });
  const helpEl = h('div', { class: 'dui-help', hidden: true, onclick: (e) => { if (e.target === helpEl) help(false); } }, helpCard);
  const GROUP_ORDER = ['move', 'player', 'character', 'emote', 'camera', 'time', 'town', 'ui', 'misc'];
  const GROUP_NAME = { move: 'Walking', player: 'Player', character: 'Character', emote: 'Emotes', camera: 'Camera', time: 'Clock', town: 'Town', ui: 'Panel', misc: 'Other' };
  function buildHelp() {
    const groups = new Map();
    const add = (group, keys, desc) => {
      const g = groups.get(group) ?? groups.set(group, new Map()).get(group);
      g.set(desc, [...(g.get(desc) ?? []), ...keys]);
    };
    add('move', ['W', 'A', 'S', 'D'], 'walk (relative to the camera)');
    add('move', ['↑', '←', '↓', '→'], 'walk');
    if (demo.player?.speeds) add('move', ['Shift'], 'run (hold while walking)');
    if (demo.player?.clickAt) add('move', ['click'], 'walk there (a cottage: to its door)');
    for (const b of input.bindings()) add(b.group || 'misc', [keyLabel(b.code)], b.desc || b.code);
    add('camera', ['wheel'], 'zoom (ladder stops)');
    add('camera', ['drag'], 'pan (free camera)');
    const rank = (g) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? 99 : i; };
    const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
    helpCard.replaceChildren(
      h('h2', {}, 'Keys', h('small', {}, 'H or Esc closes')),
      h('div', { class: 'dui-help-cols' }, order.map((g) => h('div', { class: 'dui-help-grp' },
        h('h3', {}, GROUP_NAME[g] ?? titleCase(g)),
        [...groups.get(g)].map(([desc, keys]) => h('div', { class: 'dui-help-row' },
          h('span', { class: 'dui-kbd' }, [...new Set(keys)].map((k) => h('kbd', {}, k))), h('span', {}, desc)))))),
    );
  }
  function help(open = helpEl.hidden) {
    if (open) buildHelp();
    helpEl.hidden = !open;
  }

  root.append(panel, status, toasts, helpEl);
  onKey('ui', (s) => { panel.style.display = s.ui ? '' : 'none'; status.style.display = s.ui ? '' : 'none'; });

  // --- keys + event toasts ------------------------------------------------------------------------
  offs.push(
    input.bind('KeyH', () => help(), { desc: 'keys (this overlay)', group: 'ui' }),
    input.bind('Escape', () => { if (!helpEl.hidden) help(false); }, { desc: 'close the overlay', group: 'ui' }),
    input.bind('Backquote', () => {
      set({ ui: !store.state.ui });
      if (!store.state.ui) toast('Panel hidden: the backquote key ( ` ) brings it back');
    }, { desc: 'show / hide the panel', group: 'ui' }),
    events.on('toast', (p) => toast(p?.text ?? p)),
    events.on('bell', () => toast('The bell tolls')),
    // user request: tell players they can emote (Space = the character's signature emote, 1-6 = the others)
    events.on('intro:end', () => setTimeout(() => toast('Tip: press SPACE to emote (1-6 for more)', 9000), 1200)),
    events.on('ready', () => { if (!demo.intro || store.state.intro === false) setTimeout(() => toast('Tip: press SPACE to emote (1-6 for more)', 9000), 1500); }),
    store.on('phase', ({ value, source }) => { if (source !== 'ui') toast(`Phase: ${value}`); }),
  );

  // --- per frame ----------------------------------------------------------------------------------
  let fpsN = 0, fpsT = -1, fps = 0, nextStatus = 0;
  // perf readout on a timer, BETWEEN frames: the engine resets renderer.info at the start of each frame, so inside
  // update() (before the render) tris / calls read 0
  const paintPerf = () => {
    if (!renderSec.open || !store.state.ui || folded()) return;
    let i = null;
    try { i = window.__pixel?.info?.(); } catch { i = null; }
    const r = demo.engine?.renderer?.info;
    const tris = i?.tris ?? r?.render?.triangles, calls = i?.calls ?? r?.render?.calls, programs = i?.programs ?? r?.programs?.length;
    perf.fps.textContent = fps.toFixed(0);
    perf.fps.className = fps >= 55 ? 'ok' : fps < 30 ? 'bad' : '';
    perf.ms.textContent = Number.isFinite(i?.frameMs) ? i.frameMs.toFixed(1) : '-';
    perf.tris.textContent = Number.isFinite(tris) ? fmtK(tris) : '-';
    perf.calls.textContent = Number.isFinite(calls) ? String(calls) : '-';
    perf.programs.textContent = Number.isFinite(programs) ? String(programs) : '-';
    perf.res.textContent = Array.isArray(i?.low) ? `${i.low[0]}\u00D7${i.low[1]}` : '-';
    renderSec.aside.textContent = `${store.state.quality} \u00B7 ${fps.toFixed(0)} fps`;
  };
  const perfTimer = setInterval(paintPerf, 500);
  offs.push(() => clearInterval(perfTimer));
  const fmtK = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));
  return {
    el: panel,
    toast,
    help,
    travelSpot,
    go,
    enterHouse,
    leaveHouse,
    visitBed,
    update(t) {
      if (fpsT < 0) fpsT = t;
      fpsN++;
      if (t - fpsT >= 0.5) { fps = fpsN / (t - fpsT); fpsN = 0; fpsT = t; }
      paintClock();
      if (t >= nextStatus) {
        nextStatus = t + 0.25;
        const s = store.state, p = demo.player?.position, door = demo.player?.nearDoor;
        const hours = Number.isFinite(demo.time?.hours) ? demo.time.hours : s.timeOfDay;
        const inside = demo.player?.interior;
        status.textContent = `${formatClock(hours)} ${demo.time?.preset ?? ''} · ${s.phase} · ${fps.toFixed(0)} fps\n` +
          (inside ? `${nameOf(s.character)} inside ${inside.name ?? inside.id}`
            : `${nameOf(s.character)} @ ${p ? `${p.x.toFixed(1)}, ${p.z.toFixed(1)}` : '-'}${door ? ` · door: ${placeName(door.id)}` : ''}`);
        paintCeremony();
        doorNow.textContent = inside ? '' : door ? `At the door of ${placeName(door.id)}` : p ? `Standing at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}` : '';
      }
    },
    dispose() {
      for (const o of offs) { try { o?.(); } catch { /* already gone */ } }
      panel.remove(); status.remove(); toasts.remove(); helpEl.remove();
    },
  };
}
