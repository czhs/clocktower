// Hollowmere cinematic overview (owner: intro; docs/DEMO.md). Plays once the town is ready, before the player gets
// control: a high texel-snapped sweep from the south-west over the river and the forest rim toward the clock tower, a
// stop-motion 45 deg turn at the tower, a stepped descent down the zoom ladder onto the spawn point, then a title card
// "HOLLOWMERE" + "press any key / click to begin". Esc / click / any key during the flight skips straight to play.
//
// Deterministic: the pose is a pure function of the intro time tau = t - t0 (engine t). USER REQUEST (2026-10-16): the
// turn and the descent are CONTINUOUS (eased yaw; geometric eased zoom) instead of stop-motion poses / ladder cuts. The
// trade-off is some texel crawl while the camera turns or zooms (the t3ssel8r stop-motion convention avoids it); the
// sweep and the end pose are still texel-snapped, so play itself is unaffected.
// The ground's zoom-dependent pattern sizes are held world-locked for the flight (engine.uniforms.uCamFlight = 1, read by
// src/town/pieces/ground.js), else the lane setts / forest litter rescale every frame and slide over the ground.
//
// No stutter: before the flight starts, every key pose of the flight is rendered ONE frame each behind the loading
// screen (src/demo/loading.js), so all programs (objects that only enter the frustum on the wide views: the forest rim,
// the river, the far cottages) compile there; then loading.done() fades the screen and tau starts at 0.
// info.programs = [after warm, at the end] (must be equal), info.maxGapMs = the longest frame gap during the flight.
//
// Exports: createIntro(demo, { loading }) -> intro = { phase ('warm' | 'fly' | 'title' | 'done'), info, update(t, dt),
//   skip(), begin(), done: Promise<{skipped}>, dispose() }; INTRO (the timeline constants); introPose(tau, end).
// Wiring: the update must run AFTER the camera rig's (it reads the rig's pose of the frame as the end pose, then
// overrides the camera). loading.js does that by itself (engine.onUpdate after main's updater) unless the lead set
// demo.intro first. Events (demo.events): 'intro:start' {}, 'intro:title' {}, 'intro:end' {skipped}.
// While it runs: keys / clicks / wheel are swallowed (capture listeners), the control panel is hidden (body.ct-intro).
import { loading as defaultLoading, drawText } from './loading.js';
import { CAMERAS } from '../town/api.js';
import { ZOOM_LADDER } from '../core/PixelCamera.js';

const DEG = Math.PI / 180;
export const INTRO = {
  from: [-2, 37],        // over the river bend / plank bridge (south-west, outside the forest rim)
  tower: [22.5, 7],      // the clock tower: spire, dial and the square below it in one frame
  vh: 30,                // sweep viewHeight (a ZOOM_LADDER stop): the town, the rim and the river in one frame
  sweep: 6.5,            // s, from -> tower
  turn: 1.8,             // s, the 45 deg turn (continuous, eased: user 2026-10-16 "I don't like the discrete steps")
  turnSteps: 3,
  hold: 0.35,            // s at the tower after the turn
  descend: 3.6,          // s, tower -> spawn, a continuous zoom (geometric in viewHeight, eased)
  titleAt: 0.8,          // s, the title card fades in
};
const T_TURN = INTRO.sweep, T_DESC = INTRO.sweep + INTRO.turn + INTRO.hold, T_END = T_DESC + INTRO.descend;

const easeInOutSine = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/** The ladder stops from INTRO.vh to `to` (inclusive both), in flight order. */
function ladder(to) {
  const lo = Math.min(INTRO.vh, to), hi = Math.max(INTRO.vh, to);
  const s = ZOOM_LADDER.filter((v) => v >= lo - 1e-6 && v <= hi + 1e-6);
  if (!s.some((v) => Math.abs(v - to) < 1e-6)) s.push(to);
  if (!s.some((v) => Math.abs(v - INTRO.vh) < 1e-6)) s.push(INTRO.vh);
  s.sort((a, b) => a - b);
  return to < INTRO.vh ? s.reverse() : s;
}

/**
 * The camera pose at intro time tau. end = { x, z, vh, yaw } is the gameplay pose the flight settles into.
 * Returns { x, z, vh, yaw, stage }.
 */
export function introPose(tau, end) {
  const y0 = end.yaw - 45 * DEG;
  const [fx, fz] = INTRO.from, [tx, tz] = INTRO.tower;
  if (tau < T_TURN) {
    const e = easeInOutSine(clamp01(tau / INTRO.sweep));
    return { x: fx + (tx - fx) * e, z: fz + (tz - fz) * e, vh: INTRO.vh, yaw: y0, stage: 'sweep' };
  }
  if (tau < T_DESC) {
    // continuous eased turn (user request, 2026-10-16: no discrete steps); was a 3-pose stop-motion turn
    const e = easeInOutSine(clamp01((tau - T_TURN) / INTRO.turn));
    return { x: tx, z: tz, vh: INTRO.vh, yaw: y0 + (end.yaw - y0) * e, stage: 'turn' };
  }
  if (tau < T_END) {
    const u = clamp01((tau - T_DESC) / INTRO.descend);
    const e = easeInOutSine(u);
    // continuous zoom (user request): geometric in viewHeight so it feels even; was cuts between ZOOM_LADDER stops
    const vh = INTRO.vh * Math.pow(end.vh / INTRO.vh, e);
    return { x: tx + (end.x - tx) * e, z: tz + (end.z - tz) * e, vh, yaw: end.yaw, stage: 'descend' };
  }
  return { x: end.x, z: end.z, vh: end.vh, yaw: end.yaw, stage: 'end' };
}

/** The key poses rendered behind the loading screen (one frame each) so the flight compiles nothing. */
function warmTaus(end) {
  const taus = [];
  for (let i = 0; i <= 4; i++) taus.push((INTRO.sweep * i) / 4);
  for (let k = 0; k <= 4; k++) taus.push(T_TURN + (INTRO.turn * k) / 4);
  for (let i = 0; i <= 5; i++) taus.push(T_DESC + (INTRO.descend * i) / 5);
  taus.push(T_END);
  return taus;
}

function overlay() {
  const root = document.createElement('div');
  root.id = 'demo-intro';
  const px = Math.max(2, Math.min(5, Math.floor(innerHeight / 200)));
  root.style.setProperty('--px', `${px}px`);
  const top = document.createElement('div'); top.className = 'itr-bar top';
  const bot = document.createElement('div'); bot.className = 'itr-bar bot';
  const card = document.createElement('div'); card.className = 'itr-card';
  card.appendChild(drawText('Hollowmere', { scale: px * 2, color: '#efe6cf', shade: '#d8ccb0', shadow: '#0a0c12' }));
  const sub = drawText('fifteen doors · one clock tower', { scale: px, color: '#e4ae52', shadow: '#0a0c12' });
  sub.classList.add('itr-sub');
  card.appendChild(sub);
  const prompt = document.createElement('div'); prompt.className = 'itr-prompt';
  prompt.appendChild(drawText('press any key / click to begin', { scale: px, color: '#efe6cf', shadow: '#0a0c12' }));
  const skip = document.createElement('div'); skip.className = 'itr-skip';
  skip.appendChild(drawText('esc / click to skip', { scale: Math.max(2, px - 1), color: '#a69c86', shadow: '#0a0c12' }));
  root.append(top, bot, card, prompt, skip);
  document.body.appendChild(root);
  return root;
}

export function createIntro(demo, { loading = defaultLoading } = {}) {
  const { engine, store, events } = demo;
  const cam = engine.camera;
  const el = overlay();
  document.body.classList.add('ct-intro');
  loading?.hold?.();

  let phase = 'warm', t0 = null, warmIx = 0, warm = null, skipped = false, lastNow = null;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const info = { phase, tau: 0, stage: 'warm', warmPoses: 0, programs: [null, null], maxGapMs: 0, frames: 0, programsSeen: null, programLog: [], maxGapAt: null, slow: 0, revealed: 0, slowLog: [] };
  const programs = () => engine.renderer.info.programs?.length ?? null;

  // the gameplay pose: what the rig set for this frame (it ran before us), yaw from the mode (api.js modeYaw)
  const endPose = () => {
    const m = store.state.camera;
    const yaw = m === 'iso' ? CAMERAS.iso.yaw : (m === 'vote' || m === 'overview') ? 0 : store.state.yaw * DEG;
    return { x: cam.target.x, z: cam.target.z, vh: cam.viewHeight, yaw };
  };
  // world-locked ground LOD while the camera zooms / turns continuously (src/town/pieces/ground.js uCamFlight): the
  // zoom-dependent sett / litter sizes would otherwise rescale every frame and slide over the ground
  const flight = (engine.uniforms.uCamFlight ??= { value: 0 });
  const apply = (p) => {
    flight.value = p.stage === 'end' ? 0 : 1;
    cam.target.set(p.x, 0, p.z);
    cam.viewHeight = p.vh;
    cam.yaw = p.yaw;
  };
  if (cam._rot) cam.rotateTo(cam.targetYaw, 0, { exact: true }); // no running turn may override our yaw

  // ---- input: swallow everything while the intro runs (keys never reach demo.input, clicks never reach the canvas)
  const passThrough = (e) => e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code);
  const onKey = (e) => {
    if (phase === 'done' || passThrough(e)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.repeat) return;
    if (phase === 'fly') skip();
    else if (phase === 'title') begin();
  };
  const onPointer = (e) => {
    if (phase === 'done') return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (phase === 'fly') skip();
    else if (phase === 'title') begin();
  };
  const onWheel = (e) => { if (phase !== 'done') { e.stopImmediatePropagation(); e.preventDefault(); } };
  addEventListener('keydown', onKey, true);
  addEventListener('pointerdown', onPointer, true);
  addEventListener('wheel', onWheel, { capture: true, passive: false });

  const setPhase = (p) => { phase = p; info.phase = p; };

  /** Make never-compiled hidden drawables (and their hidden ancestors) visible for the frame being rendered now. */
  function revealHidden() {
    const props = engine.renderer.properties, flipped = [];
    const compiled = (m) => !!props.get(m).currentProgram;
    engine.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.every(compiled)) return;
      let hidden = false;
      for (let q = o; q; q = q.parent) if (!q.visible) { hidden = true; break; }
      if (!hidden) return;
      for (let q = o; q; q = q.parent) if (!q.visible) { q.visible = true; flipped.push(q); }
    });
    // restore after this frame's render: the demo loop renders synchronously inside its RAF callback; the microtask
    // runs right after that callback, before any other module sees the flipped flags
    if (flipped.length) queueMicrotask(() => { for (const q of flipped) q.visible = false; });
    return flipped.length;
  }

  function finish() {
    removeEventListener('keydown', onKey, true);
    removeEventListener('pointerdown', onPointer, true);
    removeEventListener('wheel', onWheel, { capture: true });
    document.body.classList.remove('ct-intro');
    el.classList.remove('itr-wait');
    el.classList.add('itr-open', 'itr-out');
    setTimeout(() => el.remove(), 1200);
    if (!loading?.done) return;
    loading.done();           // (no-op unless skipped during the warm-up)
  }
  /** Skip the flight: straight to play. */
  function skip() {
    if (phase === 'done') return;
    skipped = true;
    begin();
  }
  /** Hand the camera back to the rig (the end pose IS the rig's pose: no jump). */
  function begin() {
    if (phase === 'done') return;
    info.programs[1] = programs();
    // the rig sets target / viewHeight every frame, but never the yaw: put the gameplay yaw back ourselves (a skip
    // mid-sweep would otherwise leave the camera at the sweep's 45 deg)
    cam.yaw = endPose().yaw;
    flight.value = 0;
    setPhase('done');
    finish();
    events?.emit?.('intro:end', { skipped });
    resolveDone({ skipped });
  }

  const intro = {
    get phase() { return phase; },
    info,
    done,
    skip,
    begin,
    update(t) {
      if (phase === 'done') return;
      const end = endPose();
      if (phase === 'warm') {
        // one key pose per frame behind the loading screen (programs compile here), then fade the screen
        warm ??= warmTaus(end);
        // 2 frames per pose: the cut-away controller reads the camera one frame late (it runs before us)
        if (warmIx < warm.length * 2) { apply(introPose(warm[warmIx >> 1], end)); warmIx++; info.warmPoses = warmIx >> 1; return; }
        // one frame at the gameplay pose with every HIDDEN drawable that has never been compiled shown (e.g. a
        // character's FX that first appears seconds later: 'char-fx', one program, measured at t ~ 5-11 s), so its
        // program links here and not mid-flight; shown only for this frame (restored right after the render)
        if (warmIx === warm.length * 2) { warmIx++; apply(end); info.revealed = revealHidden(); return; }
        if (warmIx < warm.length * 2 + 3) { warmIx++; apply(introPose(0, end)); return; }   // settle 2 frames on pose 0
        info.programs[0] = programs();
        setPhase('fly');
        t0 = t;
        loading?.done?.();
        events?.emit?.('intro:start', {});
      }
      const tau = Math.max(0, t - t0);
      info.tau = +tau.toFixed(3);
      const now = performance.now();
      if (lastNow !== null && phase === 'fly' && tau > 0.8) { const g = Math.round(now - lastNow); if (g > info.maxGapMs) { info.maxGapMs = g; info.maxGapAt = info.tau; } if (g > 25) { info.slow++; if (info.slowLog.length < 12) info.slowLog.push([info.tau, g, +(engine.lastFrameMs ?? 0).toFixed(1), +(cam.yaw / DEG).toFixed(1), cam.viewHeight]); } }
      lastNow = now;
      info.frames++;
      const np = programs();
      if (np !== info.programsSeen) { info.programsSeen = np; info.programLog.push([info.tau, np, info.stage]); }
      if (tau >= INTRO.titleAt && !el.classList.contains('itr-title')) { el.classList.add('itr-title'); events?.emit?.('intro:title', {}); }
      const p = introPose(tau, end);
      info.stage = p.stage;
      apply(p);
      if (p.stage === 'end' && phase === 'fly') {
        setPhase('title');
        el.classList.add('itr-wait');
      }
    },
    dispose() { flight.value = 0; if (phase !== 'done') { setPhase('done'); finish(); resolveDone({ skipped: true }); } },
  };
  return intro;
}
