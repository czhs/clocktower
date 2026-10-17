// Demo entry (owner: demo lead; docs/DEMO.md). demo.html boots this module:
//   1. the Engine (src/core/Engine.js) with the page's URL params (?scale= ?capture= ... as index.html)
//   2. the shared store (state.js) seeded from the URL (api.js stateFromParams)
//   3. the town via the composer (src/town/town.js buildTown: the same code path as scenes/town.js), built ONCE per
//      quality tier at a wide build camera so the grass covers the whole walkable town (see buildWide)
//   4. the owners' modules, in this order: characters (list) -> player -> camera rig + live cut-away (lead, api.js)
//      -> time -> ui -> deploy; each failure is reported, the page keeps running without that module
//   5. shader warm-up, then the demo's own real-time loop (not Engine.start's: see the comment there)
// One per-frame updater runs after every town piece: player -> camera -> cut-away -> time -> ui -> deploy.
import * as THREE from 'three';
import { Engine } from '../core/Engine.js';
import { applyCamera } from '../town/api.js';
import { kitMaterial } from '../town/kit.js';
import { buildTown } from '../town/town.js';
import * as layout from '../town/layout.js';
import { createEvents, createInput, createCameraRig, createCutController, stateFromParams, stateToParams, presetForHour } from './api.js';
import { store } from './state.js';

window.__pixel = { ready: false, errors: [], renderAt: () => {}, info: () => null, gpu: null };
window.__demo = { ready: false, errors: [], loadMarks: [] };
// boot timeline (ms since navigation): [stage, at, took] - tools/demo-perf.mjs reports it
const mark = (name, since) => { const now = performance.now(); window.__demo.loadMarks.push([name, Math.round(now), since === undefined ? null : Math.round(now - since)]); return now; };
mark('main');
const fail = (msg) => { window.__pixel.errors.push(msg); window.__demo.errors.push(msg); };
window.addEventListener('error', (e) => fail(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => fail('unhandled: ' + (e.reason?.stack || e.reason)));

const boot = document.getElementById('demo-boot');
const say = (t) => { if (boot) boot.textContent = t; };

/** Import an owner's module and run its factory; a missing / broken module is reported and skipped. */
async function load(name, path, factory, ...args) {
  const t0 = performance.now();
  try {
    const mod = await import(path);
    if (typeof mod[factory] !== 'function') throw new Error(`${path}: no export ${factory}()`);
    const r = await mod[factory](...args);
    mark(name, t0);
    return r;
  } catch (e) {
    console.error(`[demo] ${name} failed:`, e);
    fail(`${name}: ${e?.stack || e}`);
    return null;
  }
}

/**
 * Build the town at a WIDE build camera: the ground piece scatters its grass over the build camera's view area
 * (world/grass.js viewArea reads engine.lowW / lowH), and the player walks the whole town. The camera is the gameplay
 * one (yaw 0, viewHeight 12: leaf / grass texel sizes stay the game's) centred on the square, and only the view WIDTH
 * is widened for the build (lowW = 4 x lowH: x -8..53, z 4.5..34.5), then restored.
 * CONTRACT-REQUEST ground: a documented grass-area option (ctx.params / opts) instead of this.
 */
async function buildWide(engine, q) {
  applyCamera(engine, 'gameplay', { focus: new THREE.Vector3(layout.PLAZA.cx, 0, layout.PLAZA.cz) });
  const cam = engine.camera, lowW = engine.lowW;
  // The grass area: x -2..47 (the town is 45 wide), z 3..41.5 (TOWN_H 42: the south bay round house-9). Its z extent
  // is the view's ground DEPTH, which only the viewHeight sets (world/grass.js viewArea), and every other piece reads
  // the build viewHeight / target too (foliage's leafy-tree set, shadows), so the wide view is shown ONLY to the
  // ground piece's own viewArea() call: a viewHeight / target getter that answers the grass area while the call stack
  // is inside src/town/pieces/ground.js and the ground build has not finished (engine.stats.ground is set at its end).
  // viewArea(engine, 3): half depth = vh + 3 (pitch 30 deg), half width = vh * aspect / 2 + 3.
  const GA = { x0: -2, x1: 47, z0: 3, z1: 41.5 };
  if (q.get('demoGrass') === 'wide4') {   // the previous build (review only): lowW = 4 x lowH, x -8..53, z 4.5..34.5
    engine.lowW = engine.lowH * 4;
    try { return await buildTown(engine, q, {}); } finally { engine.lowW = lowW; engine.resize(); }
  }
  const gvh = (GA.z1 - GA.z0) / 2 - 3, gaspect = ((GA.x1 - GA.x0) / 2 - 3) * 2 / gvh;
  const gtarget = new THREE.Vector3((GA.x0 + GA.x1) / 2, 0, (GA.z0 + GA.z1) / 2);
  const vh = cam.viewHeight, target = cam.target;
  const grassCall = () => !engine.stats.ground && /\/town\/pieces\/ground\.js/.test(new Error().stack ?? '');
  let realVh = vh;
  Object.defineProperty(cam, 'viewHeight', { configurable: true, get: () => (grassCall() ? gvh : realVh), set: (v) => { realVh = v; } });
  Object.defineProperty(cam, 'target', { configurable: true, get: () => (grassCall() ? gtarget : target), set: (v) => { target.copy(v); } });
  engine.lowW = Math.round(engine.lowH * gaspect);   // read only by viewArea (grass.js)
  try { return await buildTown(engine, q, {}); } finally {
    delete cam.viewHeight; delete cam.target;
    cam.viewHeight = realVh; cam.target = target;
    engine.lowW = lowW; engine.resize();
  }
}

/**
 * Runtime CPU savings around three's renderer (perf fleet; measured with tools/demo-perf.mjs, ?rtopt=0 turns them off):
 *  - ONE scene matrix update per frame: three's render() re-walks the whole scene graph (~1.5k nodes) to update world
 *    matrices on EVERY call, and the pipeline renders the scene twice (colour + normal) plus any preRender cameras.
 *    The matrices are updated once, after every updater, the camera and the sun, then render() is told to skip it
 *    (nothing moves objects between the passes: preRender hooks only toggle visibility; texel-snapped objects update
 *    their own matrices in snapObjectToTexel / afterRender).
 *  - a 'town-lights' group always exists: props' lamp-pool onBeforeRender (and life's cycle) look it up by name and
 *    retry every call while it is missing (day builds install no PointLights): 2 full-scene traversals per frame.
 *    An empty group answers "no composer lights" exactly as the missing group did, once.
 */
function installRuntimeOpts(engine) {
  const scene = engine.scene;
  if (!scene.getObjectByName('town-lights')) {
    const g = new THREE.Group();
    g.name = 'town-lights';
    scene.add(g);
  }
  const pipe = engine.pipeline, render = pipe.render;
  let once = true;
  pipe.render = function () {
    if (!once) return render.call(this);
    scene.updateMatrixWorld();
    const auto = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    try { return render.call(this); } finally { scene.matrixWorldAutoUpdate = auto; }
  };
  // A/B in one page (tools/demo-perf.mjs --ab): window.__demo.rtopt(false) = three's per-render matrix update again,
  // the town un-parked inside a cottage, life's instanced figures back on the town's shared kit material
  let lifeMats = null;
  window.__demo.rtopt = (on) => {
    once = !!on;
    const d = window.__demo.demo;
    d?.townPark?.enable(!!on);
    lifeMats ??= (() => {
      const own = [], shared = kitMaterial(engine, 'solid');
      d?.town?.registry?.get('life')?.group?.traverse((o) => { if (o.isInstancedMesh && o.material?.name === 'town-kit-solid-life') own.push([o, o.material]); });
      return { own, shared };
    })();
    for (const [m, mat] of lifeMats.own) m.material = on ? mat : lifeMats.shared;
    return once;
  };
}

/**
 * (perf) Shader warm-up for the WHOLE town, not just the spawn view: the two warm-up frames only compile what the
 * gameplay camera sees at the spawn, so the first walk to another part of town compiled programs mid-game (measured:
 * 3 new programs on the way back from house-8 - house-7's cap, the tree cores, a sprite shader - each a 10-30 ms
 * stall on the 4090, ~4x that on a laptop). One extra frame with the camera pulled back over the whole town (the
 * pipeline only: no updaters, the clock does not move) compiles them behind the loading screen; the camera is then put
 * back and the real first frame renders as before.
 */
function warmWholeTown(engine) {
  const cam = engine.camera;
  const target = cam.target.clone(), vh = cam.viewHeight;
  const p0 = engine.renderer.info.programs?.length ?? 0;
  try {
    cam.target.set(layout.TOWN_W ? layout.TOWN_W / 2 : 22.5, 0, layout.TOWN_H ? layout.TOWN_H / 2 : 21);
    cam.viewHeight = 45;
    cam.update(); engine._updateSun(); engine.pipeline.render();
  } finally {
    cam.target.copy(target); cam.viewHeight = vh;
    cam.update(); engine._updateSun(); engine.pipeline.render();
  }
  engine.stats.demoWarmTown = { programs: [p0, engine.renderer.info.programs?.length ?? 0] };
}

/**
 * Keep the characters' FX program alive (critic r6: demo-play 'programs changed during the day cycle', one program
 * added at 19:40 / 22:30 = src/chars/fx.js 'char-fx', a ShaderMaterial). Every Character owns its own FX points +
 * material, hidden while no mote is alive, so (a) without the intro nothing ever compiled it behind the loading
 * screen (it linked mid-game on the first emitted mote), and (b) a character swap disposes the old material: when that
 * was the program's last user, three released it, and the next mote linked it again (a 10-30 ms hitch each time).
 * A tiny never-disposed twin (the same shaders = the same program cache key, one dead mote far below the ground) is
 * drawn in the warm-up frames and then hidden: it compiles the program behind the loading screen and holds a reference,
 * so the program survives every swap. CONTRACT-REQUEST characters: compile char-fx at creation (DEMO.md §8).
 */
function keepFxProgram(engine) {
  let src = null;
  engine.scene.traverse((o) => { if (!src && o.isPoints && o.name === 'char-fx' && o.material?.isShaderMaterial) src = o; });
  if (!src) return null;
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(src.geometry.attributes)) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(a.itemSize), a.itemSize));
  g.attributes.position.setXYZ(0, 0, -500, 0);
  const keeper = new THREE.Points(g, src.material.clone());
  keeper.name = 'demo-char-fx-keeper';
  keeper.layers.mask = src.layers.mask;
  keeper.frustumCulled = false;
  keeper.renderOrder = src.renderOrder;
  engine.scene.add(keeper);
  return keeper;
}

/**
 * The control panel covers the right of the canvas (316 px + margins at 1280 x 720). Framed views - the cottage
 * dollhouse camera and the vote / overview / iso presets - are centred on the VISIBLE area instead of the canvas
 * (critic r6: house-8's bed / firewood / visit point under the panel; the vote camera's east seats on its edge): the
 * camera target moves right by half the covered width (in whole low-res texels, eased over ~0.2 s), and inside a
 * cottage the view also widens (viewHeight, at most x MAX_FIT) until the room's width fits beside the panel. The
 * follow / free cameras stay centred on the canvas (the player stays in the middle of the screen). The covered width
 * comes from the panel's box (ResizeObserver + the store's `ui`): 0 when it is hidden, folded or not on the right.
 * `demo.camera.inset` = {px, shift (m), fit} for the checks.
 */
function installViewInset(demo) {
  const { engine, store } = demo;
  const rig = demo.camera, cam = engine.camera, canvas = engine.renderer.domElement;
  if (!rig?.update || rig.__inset) return;
  const MAX_FIT = 1.35, MARGIN = 0.5;
  let want = 0, px = 0, panelEl = null, ro = null;
  const measure = () => {
    panelEl ??= document.querySelector('#demo-ui > .dui-panel');
    if (!panelEl || !store.state.ui || panelEl.classList.contains('collapsed') || document.body.classList.contains('ct-intro')) { want = 0; return; }
    const p = panelEl.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    // only a panel standing on the canvas' right part, taller than a third of it, frames anything out
    if (p.width < 1 || p.height < c.height / 3 || p.left < c.left + c.width / 2 || p.left >= c.right) { want = 0; return; }
    want = Math.max(0, c.right - p.left);
  };
  const watch = () => {
    panelEl = document.querySelector('#demo-ui > .dui-panel');
    if (panelEl && typeof ResizeObserver === 'function') { ro = new ResizeObserver(measure); ro.observe(panelEl); new MutationObserver(measure).observe(panelEl, { attributes: true, attributeFilter: ['class'] }); }
    measure();
  };
  store.on('ui', measure);
  addEventListener('resize', measure);
  demo.events.on('ready', watch);
  demo.events.on('intro:end', measure);
  const info = { px: 0, shift: 0, fit: 1 };
  const base = rig.update.bind(rig);
  rig.update = (t, dt) => {
    base(t, dt);
    const room = demo.player?.interior ?? null, m = store.state.camera;
    const framed = !!room || m === 'vote' || m === 'overview' || m === 'iso';
    const goal = framed ? want : 0;
    px += (goal - px) * (1 - Math.exp(-(dt || 0) * 14));
    if (Math.abs(goal - px) < 0.5) px = goal;
    info.px = Math.round(px);
    if (px < 0.5) { info.shift = 0; info.fit = 1; return; }
    const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight, aspect = cw / ch;
    const vis = Math.max(0.3, (cw - px) / cw);
    if (room?.floor) {
      // widen until the room's projected width (+ walls, margin) fits the visible part, never past MAX_FIT
      const f = room.floor, R = Math.abs(Math.cos(cam.yaw)), S = Math.abs(Math.sin(cam.yaw));
      const need = (f.x1 - f.x0) * R + (f.z1 - f.z0) * S + 0.6 + MARGIN * 2;
      const fit = Math.min(MAX_FIT, Math.max(1, need / (cam.viewHeight * aspect * vis)));
      cam.viewHeight *= fit; info.fit = +fit.toFixed(3);
    } else info.fit = 1;
    // move the target right (camera right axis on the ground) by half the covered width, in whole texels
    const tw = cam.viewHeight / cam.lowH;
    const shift = Math.round(((px / 2) * (cam.viewHeight / ch)) / tw) * tw;
    cam.target.x += Math.cos(cam.yaw) * shift;
    cam.target.z += -Math.sin(cam.yaw) * shift;
    info.shift = +shift.toFixed(3);
  };
  rig.inset = info;
  rig.__inset = true;
}

/**
 * (perf) Park the town while the player is inside a cottage: the room is a separate little scene 200 m away, but the
 * whole town graph (~1.5k nodes: every piece, the life layer's figures and Character skeletons) still went through
 * three's per-frame matrix update, frustum culling and the shadow pass. Every light-free branch of the town root is
 * detached while inside and re-attached (in its original child order) on the way out; branches holding a light stay
 * (hiding / removing a light changes the light count = every lit material recompiles), their light-free children are
 * parked instead (only below identity-transform nodes, so a parked object's world matrix stays right even if someone
 * reads it; only the root's few-mm texel-snap offset is lost meanwhile). Life's own update (crows, cats, smoke, the walkers' bookkeeping: all pure f(t)) is skipped meanwhile; its
 * Characters keep simulating (their fixed-step sim re-runs from 0 after a gap). Starts after 'ready' (the warm-up
 * compiles the town's programs with the town in the scene); a life on / off while inside un-parks first.
 */
function createTownPark(demo) {
  const { engine, events, store, town } = demo;
  const root = town?.root;
  const lifePiece = town?.registry?.get('life');
  const I = new THREE.Matrix4();
  const parked = [];            // [parent, child]
  const orders = new Map();     // parent -> its children before parking
  let on = false, ready = false, inside = false, skip = null, saved = null;
  const hasLight = (o) => { let l = false; o.traverse((c) => { if (c.isLight) l = true; }); return l; };
  const localIsIdentity = (o) => { if (o.matrixAutoUpdate) o.updateMatrix(); return o.matrix.equals(I); };
  // the town root itself carries the camera's sub-texel snap offset (a few mm, re-set every frame): a parked branch
  // only loses that offset in its (unused) world matrix while parked
  const rootOk = () => {
    if (!root || root.parent !== engine.scene) return false;
    const e = root.matrix.elements;
    return Math.abs(e[0] - 1) + Math.abs(e[5] - 1) + Math.abs(e[10] - 1) + Math.abs(e[1]) + Math.abs(e[2]) + Math.abs(e[4]) + Math.abs(e[6]) + Math.abs(e[8]) + Math.abs(e[9]) < 1e-6
      && Math.hypot(e[12], e[13], e[14]) < 0.5;
  };
  function collect(node) {
    for (const c of node.children) {
      if (!hasLight(c)) parked.push([node, c]);
      else if (localIsIdentity(c)) collect(c);
    }
  }
  function park() {
    if (on || !rootOk()) return;
    on = true;
    collect(root);
    for (const [p] of parked) if (!orders.has(p)) orders.set(p, p.children.slice());
    for (const [p, c] of parked) p.remove(c);
    if (lifePiece) { saved = lifePiece.update; skip = () => {}; lifePiece.update = skip; }
    engine.stats.townPark = { parked: parked.length };
  }
  function unpark() {
    if (!on) return;
    on = false;
    for (const [p, c] of parked) p.add(c);
    for (const [p, before] of orders) {
      const at = new Map(before.map((o, i) => [o, i]));
      p.children.sort((a, b) => (at.get(a) ?? 1e9) - (at.get(b) ?? 1e9));
    }
    parked.length = 0; orders.clear();
    if (lifePiece && lifePiece.update === skip) lifePiece.update = saved;
    skip = saved = null;
  }
  let enabled = true;
  const sync = () => { if (enabled && ready && inside) park(); else unpark(); };
  events.on('player:location', ({ location }) => { inside = !!location && location !== 'town'; sync(); });
  events.on('ready', () => { ready = true; inside = !!demo.player?.interior; sync(); });
  store.on('life', () => { unpark(); ready = false; queueMicrotask(() => { ready = true; }); });
  return { get parked() { return on; }, park, unpark, enable(v) { enabled = !!v; sync(); } };
}

try {
  const params = new URLSearchParams(location.search);
  store.set(stateFromParams(params), 'url');
  const engine = new Engine({ params });
  // the town's own URL params (scenes/town.js names): time-of-day preset + quality from the state; life is always built
  // (state.life only hides / shows it); the cut-away is re-aimed every frame by api.js createCutController
  const q = new URLSearchParams(params);
  for (const k of ['cut', 'cam', 'yaw', 'focus', 'pieces', 'pan']) q.delete(k);
  q.set('tod', presetForHour(store.state.timeOfDay));
  q.set('quality', store.state.quality);
  q.set('life', '1');
  // (perf) the character specs download while the town builds (listCharacters below then finds them imported)
  import('./characters.js').then((m) => m.prefetchCharacters?.()).catch(() => {});
  say(`building Hollowmere (${store.state.quality}) ...`);
  const t0 = performance.now();
  const town = await buildWide(engine, q);
  engine.stats.demoBuildMs = Math.round(performance.now() - t0);
  mark('town', t0);
  if (params.get('rtopt') !== '0') installRuntimeOpts(engine);   // ?rtopt=0: the A/B baseline (tools/demo-perf.mjs)

  const demo = {
    engine, params, store, layout, town,
    events: createEvents(),
    input: createInput(window),
    // npcs: a placeholder until createNPCs below (listCharacters starts them itself when demo.npcs is unset, BEFORE
    // the player exists; main creates them explicitly after the player instead)
    characters: [], player: null, camera: null, cut: null, intro: null, npcs: { list: [], placeholder: true }, time: null, ui: null, deploy: null,
    /** Reload the page with the current state (+ patch) in the URL: quality changes rebuild the town this way. */
    reload(patch = {}) {
      store.set(patch, 'reload');
      const p = demo.player?.position;
      // a reload is a rebuild, not a new visit: never replay the opening cinematic (?intro=0 also when the page
      // was opened with ?intro=1; the loading screen still shows while the town rebuilds)
      const sp = stateToParams(store.state, { player: p, keep: params });
      sp.set('intro', '0');
      location.search = sp.toString();
    },
  };
  window.__demo.demo = demo;
  if (params.get('rtopt') !== '0') demo.townPark = createTownPark(demo);

  say('loading characters ...');
  demo.characters = (await load('characters', './characters.js', 'listCharacters')) ?? [];
  demo.player = await load('player', './player.js', 'createPlayer', demo);
  // the lead's rig (api.js: modes, keys, zoom ladder) with the player's texel-locked follow + the interior dollhouse
  // camera installed (camera.js)
  demo.camera = (await load('camera', './camera.js', 'createCameraRig', demo)) ?? createCameraRig(demo);
  if (demo.player) demo.camera.snapTo(demo.player.position);
  demo.cut = createCutController(demo);
  // idle townsfolk characters on the square (?npcs=0 off), after the player (they avoid the spawn, swap with it)
  if (params.get('npcs') !== '0') demo.npcs = (await load('npcs', './characters.js', 'createNPCs', demo, { count: Number(params.get('npcs') ?? 3) })) ?? null;
  else demo.npcs = null;
  // the opening cinematic (src/demo/intro.js; ?intro=0|1, off under automation / capture): its poses warm up behind
  // the loading screen (src/demo/loading.js holds it), its update runs right after the camera rig's (it reads the
  // rig's pose of the frame as the end pose)
  const ld = await import('./loading.js').catch(() => null);
  if (ld?.introEnabled?.(params) && !engine.capture) demo.intro = await load('intro', './intro.js', 'createIntro', demo, { loading: ld.loading });
  demo.time = await load('time', './time.js', 'createTime', demo);
  demo.ui = await load('ui', './ui.js', 'mountUI', demo);
  demo.deploy = await load('deploy', './deploy.js', 'installDeploy', demo);
  try { installViewInset(demo); } catch (e) { console.error('[demo] view inset failed:', e); fail(`inset: ${e?.stack || e}`); }

  const step = (name, mod, t, dt) => {
    if (!mod?.update) return;
    try { mod.update(t, dt); } catch (e) {
      // one report per module, then it is switched off (the page keeps running)
      console.error(`[demo] ${name}.update failed:`, e); fail(`${name}.update: ${e?.stack || e}`); mod.update = null;
    }
  };
  engine.onUpdate((t, dt) => {
    step('player', demo.player, t, dt);
    step('camera', demo.camera, t, dt);
    step('intro', demo.intro, t, dt);
    step('cut', demo.cut, t, dt);
    step('time', demo.time, t, dt);
    step('ui', demo.ui, t, dt);
    step('deploy', demo.deploy, t, dt);
  });

  // Engine.start() in CAPTURE mode: it installs window.__pixel.renderAt / info and renders t = 0 once, but neither its
  // debug camera controls (WASD / drag pan would fight the player) nor its RAF loop - that loop derives t from the RAF
  // timestamp minus a performance.now() taken earlier, so its first frame can run at a NEGATIVE t (house-1's
  // update(t) then indexes frames[-1] and throws: see docs/DEMO.md §8). Our loop below is monotonic from t = 0.
  // The t = 0 frame + one more behind the boot screen are the shader warm-up: every program compiles there (night:
  // ~35 with 12 point lights = ~5 s of 1-fps stalls on the 4090 when it happened inside the running loop).
  // (renderer.compileAsync was tried: no KHR_parallel_shader_compile in headless Chrome, +25 extra program variants.)
  say('compiling shaders ...');
  await new Promise((r) => requestAnimationFrame(() => r()));
  const tc = performance.now();
  const fxKeeper = keepFxProgram(engine);   // drawn in the warm-up frames only (see keepFxProgram)
  const realtime = !engine.capture;
  engine.capture = true;
  engine.start();                       // renderAt(0), window.__pixel.{renderAt, info, ready}
  engine.capture = !realtime;
  engine.renderAt(1 / 60);   // (three links programs synchronously here: no parallel-compile extension in use, no GPU sync needed)
  if (params.get('rtopt') !== '0' && !engine.capture) warmWholeTown(engine, demo);
  if (fxKeeper) fxKeeper.visible = false;   // compiled; its material (never disposed) holds the program
  engine.stats.demoFxKeeper = !!fxKeeper;
  engine.stats.demoCompileMs = Math.round(performance.now() - tc);
  mark('warm-up', tc);

  if (realtime) {
    // the real-time loop: t = seconds since the warm-up (+ 2 frames), never negative, never backwards; a hidden tab
    // (no RAF) resumes where it stopped instead of jumping (the Engine clamps dt to 0.1 s anyway)
    let last = 2 / 60, prev = performance.now();
    const loop = () => {
      const now = performance.now();
      last += Math.min(0.25, Math.max(0, (now - prev) / 1000));
      prev = now;
      engine.renderAt(last);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  window.__demo.ready = true;
  demo.events.emit('ready', { buildMs: engine.stats.demoBuildMs, compileMs: engine.stats.demoCompileMs });
  boot?.classList.add('done');
} catch (e) {
  console.error(e);
  fail(String(e?.stack || e));
  if (boot) { boot.classList.add('error'); boot.textContent = `demo failed to start:\n${e?.stack || e}`; }
}
