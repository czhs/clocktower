// (B) The Storyteller's countdown on the clock tower (pass B; docs/DEMO.md §4.9).
//   createTowerTimer(demo) -> timer {
//     state (frozen snapshot: mode, minutes, duration, remaining, frac, stage, running, paused, done, doneAt, version),
//     remaining(t?), frac(t?), setMinutes(n), add(sec), start(), pause(), resume(), toggle(), reset(), setStage(s),
//     update(t, dt), info(), dispose() }
//   events: 'timer' {action ('set' 'start' 'pause' 'resume' 'add' 'reset' 'stage' 'done' 'idle'), state}
//
// THE MODEL (deterministic: a pure function of the demo clock, engine.time): mode idle | set | running | paused | done.
// running: remaining(t) = max(0, rem0 - (t - t0)); the crossing time t0 + rem0 IS the done time (exactly, whatever the
// frame rate); done holds 0:00 (flashing DONE_FLASH s) and returns to idle after DONE_HOLD s. `minutes` = the length
// the next start uses (1..30, the library's ST control: hud/art.js drawStClock "Set [-] N min [+]"); add(+-60) changes
// the running / paused countdown (+1m) or the armed minutes. stage = discussion | nominations | bedtime (the v2 clock's
// stage colours: gold / red / blue): chosen by the Storyteller; while idle it follows the game phase.
// Keys (demo.input, group 'timer'): K start / pause, Y reset, U -1 min, I +1 min (the timer HUD has a button for each).
// URL: ?timer=<seconds> arms it, &timerRun=1 starts it, &timerStage=nominations.
//
// THE TOWER (the clocktower piece's own api.dials / api.hands: the pass-B town hook, docs/TOWN.md): while the timer is
// not idle the piece's live hands are hidden and ALL FOUR dials show the countdown the v2 way (library hud/tower.js,
// the HUD chip's mini dial): a stage-coloured enamel WEDGE = the time left, clockwise from XII (a full disc at the
// start, shrinking to nothing), ONE iron hand at the wedge's end (it sweeps back to XII), a brass hub; paused = the wedge
// dimmed + two pause bars instead of the hand; at zero the dials flash (stage colour <-> cream, 4 Hz) and the bell
// rings (time.ringBell: the belfry bell swings; no audio exists in the demo). The wedge is kit 'glass' (lit by day,
// glowing at night like the dial itself), hands kit 'solid': the town's shared programs, nothing new to compile. The
// geometry is rebuilt only when the wedge's rim moves by 2 deg (DIAL_STEPS per turn), ~1-3x per second.
//
// THE READOUT (the "hour-board"): a split-flap board hung from the base cornice over the great door (clocktower-local
// y 2.9..3.62, 2.3 m wide, facing the square): dark timber in a brass frame with a pointed crest and iron hooks, four
// dark enamel flip cards with LIT cream numerals in a 3 x 5 cell face (0.39 x 0.45 m: ~10 px tall at the vote camera), brass colon studs
// that blink while it runs. Idle: the armed length in dim, unlit numerals; set / running / paused: the numerals are lit (kit glass:
// cream by day, glowing lamp-warm at night); a changing digit flips (2 drawings over 0.1 s: the middle row dark = the falling
// flap); done: the cards flash with the dials. Static frame = 1 mesh (built once), cards + colon studs = 1 solid mesh,
// numerals = 1 glass mesh (both rebuilt when a digit / the lit state changes). (r4: dark numerals on cream cards were
// mush at the 45 deg vote camera; bright strokes on dark read at ~7 x 10 px.)
import * as THREE from 'three';
import { Builder, M } from '../town/kit.js';
import { TOWN_PALETTE as PAL } from '../town/palette.js';

const TAU = Math.PI * 2;
const DIAL_STEPS = 180;                 // wedge resolution (2 deg)
const DONE_FLASH = 6, DONE_HOLD = 30;   // s
const FLIP_S = 0.1;
export const STAGES = ['discussion', 'nominations', 'bedtime'];
const STAGE_TONES = {
  discussion: { tones: ['#E4BE5C', '#C49A3A', '#6A5040'], glow: '#FFC46B' },
  nominations: { tones: ['#D8685A', '#B8463E', '#6A3040'], glow: '#FF7A5A' },
  bedtime: { tones: ['#7A9ECC', '#4A6E9E', '#2E3E62'], glow: '#9FB6E8' },
  paused: { tones: ['#8E8A9E', '#6E6A7E', '#46424F'], glow: '#B8B0C8' },
  flash: { tones: ['#FFF4DC', '#F2E8D0', '#B0A898'], glow: '#FFF0C8' },
};
const PHASE_STAGE = { day: 'discussion', nomination: 'nominations', vote: 'nominations', execution: 'nominations', night: 'bedtime' };
// the tower's hand shapes (clocktower.js MIN / HOUR), in the dial's frame (+y = XII)
const HAND = [[-0.04, -0.26], [0.04, -0.26], [0.04, 0.84], [0.075, 0.88], [0, 1.0], [-0.075, 0.88], [-0.04, 0.84]];
// 3 x 5 numerals (rows top -> bottom)
const FONT = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], ' ': ['000', '000', '000', '000', '000'], '-': ['000', '000', '111', '000', '000'],
};

/** "m:ss" split into the board's 4 cards (leading blank): 305 s -> [' ', '5', '0', '5'] */
export function boardDigits(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-6)), m = Math.min(99, Math.floor(s / 60)), ss = s % 60;
  return [m >= 10 ? String(Math.floor(m / 10)) : ' ', String(m % 10), String(Math.floor(ss / 10)), String(ss % 10)];
}
export function formatTimer(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A persistent mesh per kit layer whose geometry is replaced by each rebuild (no scene-graph churn). */
function dynMeshes(engine, parent, name, { castShadow = false } = {}) {
  const meshes = {};
  return {
    meshes,
    set(b) {
      const g = b.build({ name, castShadow, receiveShadow: true });
      const got = new Set();
      for (const m of [...g.children]) {
        const layer = m.userData.layer;
        got.add(layer);
        let cur = meshes[layer];
        if (!cur) { cur = meshes[layer] = m; cur.name = `${name}-${layer}`; parent.add(cur); continue; }
        cur.geometry.dispose();
        cur.geometry = m.geometry;
        cur.visible = true;
      }
      for (const [layer, m] of Object.entries(meshes)) if (!got.has(layer)) m.visible = false;
    },
    hide() { for (const m of Object.values(meshes)) m.visible = false; },
    dispose() { for (const m of Object.values(meshes)) { m.geometry.dispose(); m.removeFromParent(); } },
  };
}

/** The countdown face in a dial frame (+z out, +y = XII): wedge (glass) + hand or pause bars + hub (solid). */
export function drawDialFace(b, { frac, mode, stage, flashOn = false, k = 1, mirror = false, night = false }) {
  const R = 1.12 * 0.86 * k;
  const st = mode === 'done' ? (flashOn ? STAGE_TONES.flash : STAGE_TONES[stage]) : mode === 'paused' ? STAGE_TONES.paused : STAGE_TONES[stage];
  const sgn = mirror ? -1 : 1;
  const q = mode === 'done' ? DIAL_STEPS : Math.round(Math.max(0, Math.min(1, frac)) * DIAL_STEPS);
  if (q > 0) {
    const L = (q / DIAL_STEPS) * TAU, n = Math.max(2, Math.ceil(q / 4));
    const pts = q >= DIAL_STEPS ? [] : [[0, 0]];
    for (let i = 0; i <= n; i++) { const a = (i / n) * L; pts.push([sgn * Math.sin(a) * R, Math.cos(a) * R]); }
    if (mirror) pts.reverse();
    // (critic P2-8) at night the dial face glows: a glowing wedge vanished into it. Night = kit SOLID (no glow) in the
    // stage's saturated mid / shadow tones: a dark coloured sector on the lit face (the town's solid program: no new one)
    const W = night && !(mode === 'done' && flashOn) ? { tones: [st.tones[1], st.tones[1], st.tones[2]] } : { tones: st.tones, layer: 'glass', glow: st.glow, glowKind: 1 };
    b.prism(pts.length > 2 ? pts : [[0, 0], [0, R], [R * 0.01, R]], 0.005, { at: [0, 0, 0.064], ...W });
  }
  const IRON = { tones: 'iron', pattern: 'none' };
  if (mode === 'paused') {
    for (const sx of [-1, 1]) b.box(0.13 * k, 0.46 * k, 0.03, { ...IRON, origin: 'center', at: [sx * 0.2 * k, 0, 0.12] });
  } else if (mode !== 'done' || !flashOn) {
    const a = mode === 'done' ? 0 : (q / DIAL_STEPS) * TAU;
    b.push(M({ at: [0, 0, 0.135], rz: -sgn * a, s: k })); b.prism(HAND, 0.025, IRON); b.pop();
  }
  b.push(M({ at: [0, 0, 0.12], rx: Math.PI / 2 })); b.cylinder(0.075 * k, 0.075 * k, 0.05, { segments: 8, tones: 'brass' }); b.pop();
}

export function createTowerTimer(demo) {
  const { engine, store, events, input } = demo;
  const params = demo.params ?? new URLSearchParams();
  const piece = demo.town?.registry?.get('clocktower');
  const api = piece?.api;
  const offs = [];

  // ------------------------------------------------------------------------------------------------ the model
  let mode = 'idle', minutes = 5, duration = 300, rem0 = 300, t0 = 0, doneAt = null, version = 0;
  let stage = PHASE_STAGE[store.state.phase] ?? 'discussion', stageSet = false;
  const now = () => engine.time ?? 0;
  const remaining = (t = now()) => (mode === 'running' ? Math.max(0, rem0 - (t - t0)) : mode === 'done' ? 0 : mode === 'idle' ? minutes * 60 : rem0);
  const frac = (t = now()) => (mode === 'idle' || duration <= 0 ? 1 : remaining(t) / duration);
  const snapshot = () => Object.freeze({
    mode, minutes, duration, remaining: +remaining().toFixed(3), frac: +frac().toFixed(4), stage, running: mode === 'running',
    paused: mode === 'paused', done: mode === 'done', doneAt, version,
  });
  const emit = (action) => { version++; events.emit('timer', { action, state: snapshot() }); };
  const clampMin = (n) => Math.max(1, Math.min(30, Math.round(n)));
  const timer = {
    get state() { return snapshot(); },
    remaining, frac,
    get mode() { return mode; },
    get stage() { return stage; },
    get minutes() { return minutes; },
    get duration() { return duration; },
    /** the length (minutes) of the next start; when not running / paused the tower shows it armed */
    setMinutes(n) {
      minutes = clampMin(n);
      if (mode === 'idle' || mode === 'set' || mode === 'done') { mode = 'set'; duration = rem0 = minutes * 60; doneAt = null; }
      emit('set');
    },
    /** +-sec on the running / paused countdown (the ST's +1m), else on the armed minutes */
    add(sec) {
      if (mode === 'running' || mode === 'paused') {
        const r = remaining();
        rem0 = Math.max(1, r + sec); t0 = now(); duration = Math.max(rem0, duration + sec);
        emit('add');
      } else timer.setMinutes(minutes + Math.round(sec / 60));
    },
    start() {
      if (mode === 'running') return;
      if (mode === 'paused') return timer.resume();
      duration = rem0 = minutes * 60; t0 = now(); doneAt = null; mode = 'running';
      emit('start');
    },
    pause() { if (mode !== 'running') return; rem0 = remaining(); mode = 'paused'; emit('pause'); },
    resume() { if (mode !== 'paused') return; t0 = now(); mode = 'running'; emit('resume'); },
    toggle() { if (mode === 'running') timer.pause(); else timer.start(); },
    reset() { mode = 'idle'; doneAt = null; duration = rem0 = minutes * 60; emit('reset'); },
    setStage(s) { if (!STAGES.includes(s)) return; stage = s; stageSet = true; emit('stage'); },
  };
  offs.push(store.on('phase', ({ value }) => { if (mode === 'idle' && !stageSet) stage = PHASE_STAGE[value] ?? stage; }));
  const toast = (text) => events.emit('toast', { text });
  offs.push(
    // (no toasts: the HUD chip, the dials and the hour-board are the feedback; the toast column covered the tower's
    // dial in the vote frame)
    input.bind('KeyK', () => timer.toggle(), { desc: 'tower timer: start / pause', group: 'timer' }),
    input.bind('KeyY', () => timer.reset(), { desc: 'tower timer: reset', group: 'timer' }),
    input.bind('KeyU', () => timer.add(-60), { desc: 'tower timer: -1 minute', group: 'timer' }),
    input.bind('KeyI', () => timer.add(60), { desc: 'tower timer: +1 minute', group: 'timer' }),
  );
  if (params.get('timerStage')) timer.setStage(params.get('timerStage'));
  if (Number(params.get('timer')) > 0) {
    const s = Number(params.get('timer'));
    minutes = clampMin(Number(params.get('timerMin')) || s / 60); timer.setMinutes(minutes); duration = rem0 = Math.max(1, s);
    // (a quality reload: the countdown's full length, so the dials' wedge keeps its fraction)
    if (Number(params.get('timerDur')) >= rem0) duration = Number(params.get('timerDur'));
    if (params.get('timerRun') === '1') { t0 = now(); mode = 'running'; emit('start'); }
    else if (params.get('timerPaused') === '1') { mode = 'paused'; emit('pause'); }
  }
  // (B, pass-B leftover) a QUALITY RELOAD keeps the timer: demo.reload writes the state into the URL from demo.params
  // (`keep`), so the timer's own keys are refreshed there just before (remaining s, running / paused, the armed
  // minutes, the full length, a chosen stage); idle / done = none of them (a reload restarts it idle)
  const TIMER_KEYS = ['timer', 'timerRun', 'timerPaused', 'timerMin', 'timerDur', 'timerStage'];
  function toParams(q) {
    for (const k of TIMER_KEYS) q.delete(k);
    if (stageSet) q.set('timerStage', stage);
    if (mode === 'idle' || mode === 'done') return q;
    q.set('timer', remaining().toFixed(2)); q.set('timerMin', String(minutes)); q.set('timerDur', String(Math.round(duration * 100) / 100));
    if (mode === 'running') q.set('timerRun', '1');
    if (mode === 'paused') q.set('timerPaused', '1');
    return q;
  }
  const reload0 = typeof demo.reload === 'function' ? demo.reload : null;
  if (reload0) { demo.reload = (patch = {}) => { toParams(params); return reload0(patch); }; offs.push(() => { if (demo.reload !== reload0) demo.reload = reload0; }); }
  timer.toParams = toParams;

  // ------------------------------------------------------------------------------------------------ the tower dials
  const info = { dials: 0, rebuilds: 0, board: false, boardRebuilds: 0, shown: false, key: '', digits: '', lit: false, flips: 0, strikes: 0 };
  const towerGroup = piece?.group ?? null;
  const dials = Array.isArray(api?.dials) ? api.dials : [];
  const handsNode = api?.hands ?? towerGroup?.getObjectByName('clocktower-hands') ?? null;
  const faceGroup = new THREE.Group(); faceGroup.name = 'demo-tower-timer';
  if (towerGroup) towerGroup.add(faceGroup);
  const face = dynMeshes(engine, faceGroup, 'demo-tower-timer');
  info.dials = dials.length;
  let faceKey = null;
  /** (critic P2-8) the dials glow (dusk to dawn): the wedge is drawn solid then */
  const dialsNight = () => { const h = Number.isFinite(demo.time?.hours) ? demo.time.hours : store.state.timeOfDay; return h >= 19.5 || h < 6; };
  function drawDials(t) {
    const shown = mode !== 'idle';
    if (handsNode && dials.length) handsNode.visible = !shown;   // (no api.dials: the dials keep the time of day)
    info.shown = shown;
    if (!shown) { if (faceKey !== 'idle') { face.hide(); faceKey = 'idle'; } return; }
    const flashOn = mode === 'done' && doneAt !== null && t - doneAt < DONE_FLASH && Math.floor((t - doneAt) * 4) % 2 === 0;
    const q = mode === 'done' ? DIAL_STEPS : Math.round(frac(t) * DIAL_STEPS);
    const night = dialsNight();
    const key = `${mode}|${stage}|${q}|${flashOn}|${night}`;
    if (key === faceKey) return;
    faceKey = key; info.key = key;
    const b = new Builder(engine, { name: 'demo-tower-timer' });
    for (const d of dials) { b.push(d.local); drawDialFace(b, { frac: q / DIAL_STEPS, mode, stage, flashOn, k: d.k, night }); b.pop(); }
    face.set(b);
    info.rebuilds++;
  }

  // ------------------------------------------------------------------------------------------------ the hour-board
  const body = api?.body;
  const zF = body?.door?.zFront ?? 1.5;
  const BOARD = { y0: 2.9, y1: 3.62, w: 2.26, z: zF + 0.16, d: 0.07 };
  const CARD = { w: 0.46, h: 0.54, xs: [-0.84, -0.34, 0.34, 0.84], y: (BOARD.y0 + BOARD.y1) / 2, z: BOARD.z + BOARD.d / 2 + 0.012 };
  const CELL = { w: 0.13, h: 0.09 };
  // (the user, 2026-10-17: "instead of the digital clock on the clocktower, have the counter just be part of the HUD")
  // the split-flap board is OFF by default (not built, not drawn: the countdown lives in the HUD timer chip and on the
  // tower's dials); ?board=1 brings it back for review
  const boardOn = params.get('board') === '1';
  const boardGroup = new THREE.Group(); boardGroup.name = 'demo-tower-board';
  if (towerGroup && boardOn) towerGroup.add(boardGroup);
  if (towerGroup && boardOn) {
    const b = new Builder(engine, { name: 'demo-tower-board' });
    const TIM = { tones: 'timber', pattern: 'vboards', scale: 0.7 }, BR = { tones: 'brass', pattern: 'none' }, IR = { tones: 'iron', pattern: 'none' };
    const zc = BOARD.z, h = BOARD.y1 - BOARD.y0;
    b.box(BOARD.w, h, BOARD.d, { ...TIM, tint: 0.9, at: [0, BOARD.y0, zc] });                                       // backboard
    b.box(BOARD.w + 0.1, 0.07, BOARD.d + 0.04, { ...BR, at: [0, BOARD.y1 - 0.02, zc] });                            // top rail
    b.box(BOARD.w + 0.1, 0.07, BOARD.d + 0.04, { ...BR, tint: 0.94, at: [0, BOARD.y0 - 0.05, zc] });                // bottom rail
    for (const sx of [-1, 1]) b.box(0.07, h + 0.12, BOARD.d + 0.04, { ...BR, at: [sx * (BOARD.w / 2 + 0.015), BOARD.y0 - 0.05, zc] });   // stiles
    // the gothic crest: a pointed gable over the middle with a brass bell knob, two finials on the stiles
    b.prism([[-0.42, 0], [0.42, 0], [0, 0.26]], BOARD.d, { ...TIM, at: [0, BOARD.y1 + 0.05, zc] });
    b.prism([[-0.5, 0], [-0.42, 0], [0, 0.3], [0.42, 0], [0.5, 0], [0, 0.36]], BOARD.d + 0.03, { ...BR, at: [0, BOARD.y1 + 0.03, zc] });
    b.box(0.09, 0.09, 0.05, { ...BR, at: [0, BOARD.y1 + 0.1, zc + BOARD.d / 2 + 0.02] });
    for (const sx of [-1, 1]) b.cylinder(0.05, 0.0, 0.14, { segments: 4, ...BR, at: [sx * (BOARD.w / 2 + 0.015), BOARD.y1 + 0.05, zc] });
    // iron hooks into the cornice (they read as the board hanging from the stone)
    for (const sx of [-1, 1]) {
      b.box(0.045, 0.045, zc - zF + 0.06, { ...IR, at: [sx * 0.62, BOARD.y1 + 0.02, (zc + zF) / 2] });
      b.box(0.045, 0.12, 0.045, { ...IR, at: [sx * 0.62, BOARD.y1 - 0.06, zc + BOARD.d / 2 + 0.01] });
    }
    // dark card slots (the cards sit in them) + the split-flap side pins of each card
    for (const x of CARD.xs) {
      b.box(CARD.w + 0.05, CARD.h + 0.05, 0.02, { tones: PAL.iron[2], pattern: 'none', origin: 'center', at: [x, CARD.y, zc + BOARD.d / 2 + 0.002] });
      for (const sx of [-1, 1]) b.box(0.04, 0.05, 0.03, { ...BR, origin: 'center', at: [x + sx * (CARD.w / 2 + 0.01), CARD.y, CARD.z + 0.004] });
    }
    const g = b.build({ name: 'demo-tower-board', castShadow: true });
    for (const m of [...g.children]) boardGroup.add(m);
    info.board = true;
  }
  const cards = dynMeshes(engine, boardGroup, 'demo-tower-cards');
  const nums = dynMeshes(engine, boardGroup, 'demo-tower-numerals');
  let shownDigits = null, flipAt = [-1, -1, -1, -1], boardKey = null;
  function drawBoard(t) {
    if (!towerGroup || !boardOn) return;
    const lit = mode !== 'idle';
    const r = remaining(t);
    const dg = boardDigits(r);
    if (shownDigits) for (let i = 0; i < 4; i++) if (dg[i] !== shownDigits[i]) { flipAt[i] = t; info.flips++; }
    shownDigits = dg;
    const flashOn = mode === 'done' && doneAt !== null && t - doneAt < DONE_FLASH && Math.floor((t - doneAt) * 4) % 2 === 0;
    const flipping = flipAt.map((f) => f >= 0 && t - f < FLIP_S);
    // (critic P3-14: "7 56" read as "756") the colon is ALWAYS shown while the board is lit, as two big lit studs in the
    // numerals' own glass (no blinking dark brass)
    const colon = mode !== 'idle';
    const key = `${dg.join('')}|${lit}|${stage}|${flashOn}|${flipping.join('')}|${colon}|${mode}`;
    if (key === boardKey) return;
    boardKey = key; info.digits = dg.join(''); info.lit = lit;
    // cards (solid: dark enamel; the flash swaps them to the stage colour) + the falling flap's dark band
    const cb = new Builder(engine, { name: 'demo-tower-cards' });
    const cardTones = flashOn ? STAGE_TONES[stage].tones : ['#4A4458', '#34303F', '#221F2A'];
    for (const x of CARD.xs) cb.box(CARD.w, CARD.h, 0.025, { tones: cardTones, pattern: 'none', origin: 'center', at: [x, CARD.y, CARD.z - 0.0125] });
    CARD.xs.forEach((x, i) => { if (flipping[i]) cb.box(CARD.w, 0.06, 0.035, { tones: PAL.iron[2], pattern: 'none', origin: 'center', at: [x, CARD.y, CARD.z + 0.014] }); });
    // the hairline split of each card (a flip board): two brass pins already sit at its ends (static frame)
    cards.set(cb);
    // numerals (glass: lit = cream by day, glowing lamp-warm at night; idle = dim, unlit)
    const nb = new Builder(engine, { name: 'demo-tower-numerals' });
    const NUM = lit ? { tones: flashOn ? ['#FFFFFF', '#F6EEDA', '#C8BEA8'] : ['#FFF6DE', '#F2E2B8', '#B8A888'], glow: flashOn ? '#FFFFFF' : PAL.lampGlow, glowKind: 1 }
      : { tones: ['#9A92A6', '#7A7286', '#5A5466'], glow: null, glowKind: 0 };
    CARD.xs.forEach((x, i) => {
      const rows = FONT[dg[i]] ?? FONT[' '];
      for (let ry = 0; ry < 5; ry++) {
        if (flipping[i] && ry === 2) continue;
        for (let cx = 0; cx < 3; cx++) {
          if (rows[ry][cx] !== '1') continue;
          nb.box(CELL.w, CELL.h, 0.018, { tones: NUM.tones, layer: 'glass', glow: NUM.glow, glowKind: NUM.glowKind, origin: 'center', at: [x + (cx - 1) * CELL.w, CARD.y + (2 - ry) * CELL.h, CARD.z + 0.008] });
        }
      }
    });
    if (colon) for (const dy of [-0.12, 0.12]) nb.box(0.15, 0.13, 0.02, { tones: NUM.tones, layer: 'glass', glow: NUM.glow, glowKind: NUM.glowKind, origin: 'center', at: [0, CARD.y + dy, BOARD.z + BOARD.d / 2 + 0.012] });
    nums.set(nb);
    info.boardRebuilds++;
  }

  // ------------------------------------------------------------------------------------------------ per frame
  let strikeAt = [];
  timer.update = (t) => {
    if (mode === 'running' && t - t0 >= rem0) {
      // done at the exact crossing time (deterministic), whatever the frame rate
      doneAt = t0 + rem0; mode = 'done'; rem0 = 0;
      demo.time?.ringBell?.();
      strikeAt = [doneAt + 2.4, doneAt + 4.8];
      info.strikes++;
      emit('done');
      toast('The tower strikes: time is up');
    }
    while (strikeAt.length && t >= strikeAt[0]) { strikeAt.shift(); demo.time?.ringBell?.(); }
    if (mode === 'done' && doneAt !== null && t - doneAt > DONE_HOLD) { mode = 'idle'; doneAt = null; duration = rem0 = minutes * 60; emit('idle'); }
    drawDials(t);
    drawBoard(t);
  };
  timer.info = () => ({ ...info, state: snapshot(), handsHidden: handsNode ? !handsNode.visible : null });
  timer.dispose = () => {
    for (const o of offs) o?.();
    face.dispose(); cards.dispose(); nums.dispose(); faceGroup.removeFromParent(); boardGroup.removeFromParent();
    if (handsNode) handsNode.visible = true;
  };
  // the first drawings now (before the warm-up: every program they use compiles there)
  drawDials(now()); drawBoard(now());
  return timer;
}
