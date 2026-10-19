// (B) The tower timer's screen UI (pass B; docs/DEMO.md §4.9): drawn with the pixel3d UI library's HUD art (read only:
// src/ui/hud/art.js, the v2 clock pieces), in DOM canvases of its own (no change to gameui.js's layer / layout).
//   createTimerUI(demo) -> { chip, st, section, update(t, dt), info(), dispose() }
//
// - THE HUD CHIP (hud art drawClockChip = v2 ctc-chip: the brass mini-dial medallion with the stage wedge, the stage
//   label "NOMINATIONS OPEN IN" / "PAUSED" / due, the m:ss figures, the urgent pulse in the last 30 s): in the top row
//   right of the game UI's clock / phase chips (x 156 texels; centred on a phone), above the caption ribbon. Shown while the
//   tower timer is not idle.
// - THE STORYTELLER'S CONTROLS (hud art drawStClock = v2 ctc-stctl, "Town clock:"): row 1 clear (x) / +1m /
//   Pause-Resume, row 2 "Set [-] N min [+] for", row 3 the stages (a stage button = start N minutes of that stage).
//   Shown bottom left (above the status line) while the player IS the Storyteller character (id 'storyteller';
//   ?wip=1), or with ?stControls=1 / the panel's "on screen" toggle. Mouse + touch (pointer events), hover states.
// - THE PANEL SECTION ("Tower timer", injected into the control panel after "Time"): the readout, -1m / minutes / +1m,
//   Start-Pause / Reset, the stage segment, "Storyteller controls on screen". Keys: K / Y / U / I (towertimer.js).
// Pixel scale: the canvases are drawn at 1 texel = engine.pixelScale CSS px (image-rendering: pixelated) and placed
// on whole texels, like the game UI layer. Tokens follow the town preset (night / golden / day).
// (density, docs/DEMO.md §4.7 "Density") With the game UI present the chip and the Storyteller's control are HUD CLIENTS
// of gameui.js (gameui.hudHost): drawn inside its HUD pass on ITS screen tier (L.hd.screen at D=2: the D=2 frames /
// faces, the HD clock dial; the 1x L.screen with ?uidensity=1), laid out in its logical px (the chip right of the clock
// / phase chips, or under them when the top row is full; the control above the status line, or above the action bar on
// a narrow screen), hit-tested by its pointer code (mouse + touch). info() keeps its client-px contract (chip / st rects).
// Without the game UI (?gameui=0) the DOM canvases below draw them as before.
import { PixelImage, tokens, textWidth } from '../ui/kit.js';
import * as HA from '../ui/hud/art.js';

import { STAGES, formatTimer } from './towertimer.js';

const ST_W = 160, ST_H = 58;
const STAGE_NAMES = { discussion: 'Discussion', nominations: 'Nominations', bedtime: 'Bedtime' };

function canvasLayer(id, z = 8) {
  const c = document.createElement('canvas');
  c.id = id;
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', imageRendering: 'pixelated', zIndex: String(z), pointerEvents: 'none', display: 'none' });
  document.body.appendChild(c);
  return c;
}
function paint(c, img, S) {
  if (c.width !== img.w || c.height !== img.h) { c.width = img.w; c.height = img.h; }
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
  c.style.width = `${img.w * S}px`; c.style.height = `${img.h * S}px`;
}

/** drawStClock's own layout (src/ui/hud/art.js), mirrored for hit tests: [{k, x, y, w, h}] in the panel's texels */
export function stClockRects(x, y, w, { isSet, paused, minutes, done = false }) {
  const R = [];
  if (isSet) {
    let bx = x + w - 5;
    // (critic P3-13) at zero the third button is Start (restart), not Pause
    const go = paused ? ['resume', 'Resume'] : done ? ['start', 'Start'] : ['pause', 'Pause'];
    const items = [['clear', 13], ['add', HA.buttonWidth('+1m', 4)], [go[0], HA.buttonWidth(go[1], 4) + 7]];
    for (const [k, bw] of items) { bx -= bw; R.push({ k, x: bx, y: y + 3, w: bw, h: 13 }); bx -= 2; }
  }
  const r2 = y + 27;
  let bx = x + 6 + textWidth('Set') + 4;
  R.push({ k: 'minus', x: bx, y: r2 + 1, w: 11, h: 11 }); bx += 13;
  bx += textWidth(`${minutes} min`) + 6;
  R.push({ k: 'plus', x: bx, y: r2 + 1, w: 11, h: 11 });
  let sx = x + 5;
  for (const s of STAGES) { const bw = HA.buttonWidth(STAGE_NAMES[s], 4); R.push({ k: s, x: sx, y: y + 41, w: bw, h: 13 }); sx += bw + 2; }
  return R;
}

export function createTimerUI(demo) {
  const { engine, store, events } = demo;
  const timer = demo.passB?.timer;
  if (!timer) return null;
  const params = demo.params ?? new URLSearchParams();
  const canvas = engine.renderer.domElement;
  const chipC = canvasLayer('passb-timer-chip', 8);
  const stC = canvasLayer('passb-st-clock', 8);
  stC.style.pointerEvents = 'auto'; stC.style.cursor = 'pointer'; stC.style.touchAction = 'none';
  stC.title = 'Town clock (Storyteller): K start / pause · Y reset · U / I -/+ 1 minute';
  let T = tokens('noon'), todKey = 'noon', chipKey = '', stKey = '';
  const setTod = (p) => { const k = p === 'night' ? 'night' : p === 'golden' ? 'golden' : 'noon'; if (k !== todKey) { todKey = k; T = tokens(k); chipKey = stKey = ''; } };
  setTod(demo.time?.preset);
  const offs = [events.on('tod', (e) => setTod(e?.preset))];
  let onScreen = params.get('stControls') === '1';
  const isST = () => (demo.player?.handle?.id ?? store.state.character) === 'storyteller';
  const showST = () => onScreen || isST();
  let hover = null, pressedK = null;
  const info = { chip: null, st: null, clicks: 0, rects: [] };

  // the visible area (CSS px): the canvas minus the control panel's right band (as main.js / votecam.js measure it)
  let panelEl = null;
  const coverRight = () => {
    panelEl ??= document.querySelector('#demo-ui > .dui-panel');
    if (!panelEl || !store.state.ui || panelEl.classList.contains('collapsed') || panelEl.classList.contains('dui-away')) return 0;
    const p = panelEl.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    if (p.width < 1 || p.height < c.height / 3 || p.left < c.left + c.width / 2 || p.left >= c.right) return 0;
    return Math.max(0, c.right - p.left);
  };
  // v2 labels: 'Execution in' only with someone on the block (the execution phase / a seat onBlock), else 'Nominations close in'
  const onBlock = () => store.state.phase === 'execution' || store.state.seats.some((x) => x.onBlock);
  // (critic-3 P2) the chip's wording follows the game: a countdown set in the day still reads "Nominations open in"
  // once nominations ARE open - the stage shown is never earlier than the phase's own (day < nominations < bedtime)
  const ORDER = ['discussion', 'nominations', 'bedtime'], PH = { day: 'discussion', nomination: 'nominations', vote: 'nominations', execution: 'nominations', night: 'bedtime' };
  const shownStage = (s) => { const p = PH[store.state.phase] ?? s; return ORDER.indexOf(p) > ORDER.indexOf(s) ? p : s; };
  const hidden = () => document.body.classList.contains('ct-intro') || !!demo.player?.transition;

  // ---- the chip
  function drawChip(t) {
    const st = timer.state, S = engine.pixelScale || 1;
    if (st.mode === 'idle' || hidden()) { chipC.style.display = 'none'; info.chip = null; return; }
    const due = st.mode === 'done', paused = st.mode === 'paused', running = st.mode === 'running';
    const urgent = running && st.remaining <= HA.TIMING.URGENT_MS / 1000;
    const o = {
      stage: shownStage(st.stage), label: HA.stageLabel(shownStage(st.stage), { due, paused, onTheBlock: onBlock() }), time: due ? null : HA.formatCountdown(st.remaining * 1000),
      frac: due ? 0 : st.frac, paused, urgent, due, plus: null, t, reduced: params.get('rm') === '1',
    };
    const key = `${todKey}|${o.stage}|${o.label}|${o.time}|${Math.round(o.frac * 60)}|${paused}|${urgent ? HA.pulseBands(t) : -1}|${due}`;
    const w = HA.clockChipWidth(o) + 4, h = 19;
    const cw = canvas.getBoundingClientRect(), vis = cw.width - coverRight();
    // the top row, right of the game UI's clock / phase chips (x 156 texels: votecam.js keeps that row clear of seats and
    // the dial); a narrow canvas (a phone) centres it on the visible area instead
    const left = vis / S > 156 + w + 80 ? cw.left + 156 * S : cw.left + vis / 2 - (w * S) / 2;
    const x = Math.round(left / S) * S, y = Math.round((cw.top + 3 * S) / S) * S;
    chipC.style.left = `${x}px`; chipC.style.top = `${y}px`; chipC.style.display = 'block';
    info.chip = { x, y, w: w * S, h: h * S, text: `${o.label} ${o.time ?? ''}`.trim(), stage: o.stage };
    if (key === chipKey) return;
    chipKey = key;
    const img = new PixelImage(w, h);
    HA.drawClockChip(img, 2, 2, T, o);
    paint(chipC, img, S);
  }

  // ---- the Storyteller's control
  let stRects = [], stPos = { x: 0, y: 0, S: 1 };
  function drawST() {
    const S = engine.pixelScale || 1;
    if (!showST() || hidden()) { stC.style.display = 'none'; info.st = null; return; }
    const st = timer.state, isSet = st.mode === 'running' || st.mode === 'paused' || st.mode === 'done';
    const o = { isSet, stage: st.stage, time: HA.formatCountdown(st.remaining * 1000), paused: st.mode === 'paused', done: st.mode === 'done', urgent: st.mode === 'running' && st.remaining <= 30, minutes: st.minutes, hover, onTheBlock: onBlock() };
    // bottom left, above the status line (DOM, #demo-status or the panel's status) when there is one
    const cw = canvas.getBoundingClientRect();
    const status = document.querySelector('.dui-status');
    const sb = status?.getBoundingClientRect();
    const bottom = sb && sb.height > 0 && sb.top > cw.top + cw.height / 2 ? sb.top - 4 : cw.bottom - 6 * S;
    const x = Math.round((cw.left + 4 * S) / S) * S, y = Math.round((bottom - (ST_H + 2) * S) / S) * S;
    stC.style.left = `${x}px`; stC.style.top = `${y}px`; stC.style.display = 'block';
    stPos = { x, y, S };
    stRects = stClockRects(1, 1, ST_W, o);
    info.st = { x, y, w: (ST_W + 2) * S, h: (ST_H + 2) * S, rects: stRects.map((r) => ({ k: r.k, x: x + (r.x + r.w / 2) * S, y: y + (r.y + r.h / 2) * S })) };
    const key = `${todKey}|${JSON.stringify(o)}|${pressedK}`;
    if (key === stKey) return;
    stKey = key;
    const img = new PixelImage(ST_W + 2, ST_H + 2);
    HA.drawStClock(img, 1, 1, ST_W, T, o);
    paint(stC, img, S);
  }
  const hitST = (e) => {
    const { x, y, S } = stPos, px = (e.clientX - x) / S, py = (e.clientY - y) / S;
    return stRects.find((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h)?.k ?? null;
  };
  function act(k) {
    const st = timer.state;
    info.clicks++;
    if (k === 'clear') timer.reset();
    else if (k === 'add') timer.add(60);
    else if (k === 'pause' || k === 'resume') timer.toggle();
    else if (k === 'start') { timer.reset(); timer.start(); }
    else if (k === 'minus') timer.setMinutes(st.minutes - 1);
    else if (k === 'plus') timer.setMinutes(st.minutes + 1);
    else if (STAGES.includes(k)) { timer.setStage(k); timer.reset(); timer.start(); }
    events.emit('passb:stclock', { k });
  }
  stC.addEventListener('pointermove', (e) => { const k = hitST(e); if (k !== hover) { hover = k; stKey = ''; } });
  stC.addEventListener('pointerleave', () => { hover = null; stKey = ''; });
  stC.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); pressedK = hitST(e); });
  stC.addEventListener('pointerup', (e) => { e.preventDefault(); e.stopPropagation(); const k = hitST(e); if (k && k === pressedK) act(k); pressedK = null; });
  stC.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- the panel section (injected into the control panel after "Time")
  let section = null, paintSection = () => {};
  function mountSection() {
    const bodyEl = document.querySelector('#demo-ui .dui-panel .dui-body');
    if (!bodyEl || section) return;
    const el = (tag, attrs = {}, ...kids) => {
      const n = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) { if (k === 'onclick') n.addEventListener('click', v); else if (k === 'class') n.className = v; else n.setAttribute(k, v); }
      for (const c of kids.flat()) if (c !== null && c !== undefined) n.append(c);
      return n;
    };
    const btn = (label, fn, title = '') => el('button', { type: 'button', class: 'dui-btn', title, onclick: fn }, label);
    const pressed = (b, on) => b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const read = el('span', { class: 'dui-lbl' }, '');
    const readBig = el('span', { style: 'font: 600 22px/1 var(--dui-mono, monospace); color: #f3c674; min-width: 74px' }, '');
    const minus = btn('−1m', () => timer.add(-60), 'one minute less (U)');
    const mins = el('span', { class: 'dui-lbl', style: 'min-width: 48px; text-align: center' }, '');
    const plus = btn('+1m', () => timer.add(60), 'one minute more (I)');
    const go = btn('start', () => timer.toggle(), 'start / pause the tower timer (K)');
    const reset = btn('reset', () => timer.reset(), 'reset: the tower shows the time again (Y)');
    const stageBs = STAGES.map((s) => btn(STAGE_NAMES[s], () => timer.setStage(s), `the timer's stage colour: ${STAGE_NAMES[s]}`));
    const scr = btn('ST controls on screen', () => { onScreen = !onScreen; stKey = ''; paintSection(); }, 'the Storyteller\'s town-clock control (shown by itself when you play the Storyteller)');
    const aside = el('span', { class: 'dui-aside' }, '');
    const d = el('details', { class: 'dui-sec', 'data-sec': 'towertimer' },
      el('summary', {}, 'Tower timer', aside),
      el('div', { class: 'dui-sec-body' },
        el('div', { class: 'dui-row' }, readBig, read),
        el('div', { class: 'dui-row' }, minus, mins, plus, go, reset),
        el('div', { class: 'dui-seg' }, stageBs),
        el('div', { class: 'dui-btns' }, scr),
        el('div', { class: 'dui-note' }, 'The Storyteller\'s countdown on the clock tower: the dials, the hour-board over the door, the chip. K start / pause · Y reset · U / I ∓1 min')));
    try { d.open = localStorage.getItem('hollowmere-passb:timerOpen') === '1'; } catch { d.open = false; }
    d.addEventListener('toggle', () => { try { localStorage.setItem('hollowmere-passb:timerOpen', d.open ? '1' : '0'); } catch { /* storage off */ } });
    const after = bodyEl.querySelector('details[data-sec="time"]');
    if (after?.nextSibling) bodyEl.insertBefore(d, after.nextSibling); else bodyEl.appendChild(d);
    section = d;
    let last = '';
    paintSection = () => {
      const st = timer.state;
      const k = `${st.mode}|${Math.ceil(st.remaining)}|${st.minutes}|${st.stage}|${onScreen}`;
      if (k === last) return;
      last = k;
      readBig.textContent = formatTimer(st.remaining);
      read.textContent = `${st.mode === 'idle' ? 'idle · the tower shows the time' : st.mode}`;
      mins.textContent = `${st.minutes} min`;
      go.textContent = st.mode === 'running' ? 'pause' : st.mode === 'paused' ? 'resume' : 'start';
      stageBs.forEach((b, i) => pressed(b, STAGES[i] === st.stage));
      pressed(scr, onScreen);
      aside.textContent = st.mode === 'idle' ? '' : `${formatTimer(st.remaining)} ${st.mode === 'running' ? '' : st.mode}`.trim();
    };
    paintSection();
  }
  offs.push(events.on('ready', mountSection));
  mountSection();

  // the action bar's "more" tray (gameui.js draws src/demo/actionbar.js TRAY at draw time): a third row with a button
  // for each timer key, so every key stays clickable (the user's rule; demo-play's gameui2 coverage check)
  const TIMER_ROW = [
    // (critic P2-2) the timer's own glyphs: an hourglass, back-to-start, -1 / +1 (they reused T / Esc / zoom - + glyphs)
    { code: 'KeyK', hint: 'K', tip: 'Tower timer: start / pause', glyph: 'timer', passB: true },
    { code: 'KeyY', hint: 'Y', tip: 'Tower timer: reset', glyph: 'reset', passB: true },
    { code: 'KeyU', hint: 'U', tip: 'Tower timer: one minute less', glyph: 'minus1', passB: true },
    { code: 'KeyI', hint: 'I', tip: 'Tower timer: one minute more', glyph: 'plus1', passB: true },
  ];
  // ---- the game UI's HUD client (see the header): both pieces on the game UI's screen tier
  const host = demo.gameui?.hudHost ?? null;
  const chipO = (t) => {
    const st = timer.state, due = st.mode === 'done', paused = st.mode === 'paused', running = st.mode === 'running';
    const urgent = running && st.remaining <= HA.TIMING.URGENT_MS / 1000;
    return { stage: shownStage(st.stage), label: HA.stageLabel(shownStage(st.stage), { due, paused, onTheBlock: onBlock() }), time: due ? null : HA.formatCountdown(st.remaining * 1000),
      frac: due ? 0 : st.frac, paused, urgent, due, plus: null, t, reduced: params.get('rm') === '1' };
  };
  const client = host && {
    id: 'passb-timer',
    draw(G) {
      const out = { rects: [] }, T2 = G.T;
      // the chip: the top row right of the game UI's clock / phase chips; under them when the row is full (a phone)
      const st = timer.state;
      if (st.mode !== 'idle' && !hidden()) {
        const o = chipO(G.t), w = HA.clockChipWidth(o) + 4, h = 19;
        let x = G.chipsEnd + 4, y = G.y0 + 2, top = true;
        if (x + w > G.toolbarX - 4) { x = Math.max(G.x0, Math.floor((G.x0 + G.x1 - w) / 2)); y = G.topY; top = false; }
        const key = `pbchip|${T2.ink}|${o.stage}|${o.label}|${o.time}|${Math.round(o.frac * 60)}|${o.paused}|${o.urgent ? HA.pulseBands(G.t) : -1}|${o.due}`;
        // (through the view = the wave-2 HD chip: HD dial, urgent glow, paused dashes)
        G.put(G.cached(key, () => G.mk(w, h, (v) => HA.drawClockChip(v, 2, 2, T2, o))), x, y);
        const a = G.toClient(x, y), b = G.toClient(x + w, y + h);
        info.chip = { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y), text: `${o.label} ${o.time ?? ''}`.trim(), stage: o.stage, logical: { x, y, w, h } };
        if (top) out.top = { x, w };
        else out.row2 = { y1: y + h };   // (critic P2-9) under the chips: the game UI moves its caption below it
      } else info.chip = null;
      // the Storyteller's control: above the status line; above the action bar where the bar stands there (a phone)
      if (showST() && !hidden()) {
        const o = { isSet: ['running', 'paused', 'done'].includes(st.mode), stage: st.stage, time: HA.formatCountdown(st.remaining * 1000), paused: st.mode === 'paused', done: st.mode === 'done',
          urgent: st.mode === 'running' && st.remaining <= 30, minutes: st.minutes, hover: G.hover, onTheBlock: onBlock() };
        const w = ST_W + 2, h = ST_H + 2, x = G.x0;
        let y = (G.status ? G.status.y0 : G.H - 4) - 3 - h;
        if (x < G.bar.x + G.bar.w && x + w > G.bar.x && y + h > G.bar.y - 2) y = G.bar.y - 3 - h;
        G.put(G.cached(`pbst|${T2.ink}|${JSON.stringify(o)}`, () => G.mk(w, h, (v) => HA.drawStClock(v, 1, 1, ST_W, T2, o))), x, y);
        const rs = stClockRects(1, 1, ST_W, o).map((r) => ({ k: r.k, x: x + r.x, y: y + r.y, w: r.w, h: r.h }));
        out.rects.push(...rs, { k: null, x, y, w, h, inert: true });   // (the panel body eats its clicks: no walk-through)
        const a = G.toClient(x, y), b = G.toClient(x + w, y + h);
        info.st = { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(b.x - a.x), h: Math.round(b.y - a.y), logical: { x, y, w, h },
          rects: rs.map((r) => { const c = G.toClient(r.x + r.w / 2, r.y + r.h / 2); return { k: r.k, x: Math.round(c.x), y: Math.round(c.y) }; }) };
      } else info.st = null;
      return out;
    },
    click(k) { if (k) act(k); },
  };
  if (client) { offs.push(host.add(client)); chipC.style.display = 'none'; stC.style.display = 'none'; }

  let trayRow = null;
  import('./actionbar.js').then((AB) => {
    const T0 = AB.TRAY;
    if (Array.isArray(T0) && T0.every(Array.isArray) && !T0.some((r) => r.some((b) => b.passB))) { trayRow = TIMER_ROW.slice(); T0.push(trayRow); }
  }).catch((e) => console.warn('[passB] action bar tray row unavailable:', e?.message ?? e));
  offs.push(() => { if (!trayRow) return; import('./actionbar.js').then((AB) => { const i = AB.TRAY.indexOf(trayRow); if (i >= 0) AB.TRAY.splice(i, 1); }).catch(() => {}); });

  return {
    keyCodes: TIMER_ROW.map((b) => b.code),
    chip: chipC, st: stC, get section() { return section; },
    get onScreen() { return onScreen; }, set onScreen(v) { onScreen = !!v; stKey = ''; },
    /** test hook: press an ST control button by key (the same code path as a click) */
    press: (k) => act(k),
    update(t) {
      if (!section) mountSection();
      if (!client) { drawChip(t); drawST(); }   // (hosted: the game UI's HUD pass draws them)
      paintSection();
    },
    info() { return { chip: info.chip, st: info.st, showST: showST(), isST: isST(), onScreen, clicks: info.clicks, section: !!section }; },
    dispose() { for (const o of offs) o?.(); chipC.remove(); stC.remove(); section?.remove(); },
  };
}
