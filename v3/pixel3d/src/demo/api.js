// Demo shared API (owner: demo lead). docs/DEMO.md is the contract; this file implements the lead's half of it:
//   constants (PHASES, CAMERA_MODES, ...), the state store + event bus every module talks through, URL <-> state,
//   keyboard input (held keys + named bindings the UI lists), the camera rig (follow / vote / overview / iso / free)
//   and the live cut-away controller (the town's camera-aware cut-away re-aimed at the walking player every frame).
// Other owners import from here; they never import each other's internals (only the documented exports).
import * as THREE from 'three';
import { CAMERAS } from '../town/api.js';
import * as layout from '../town/layout.js';
import { houseBox, doorZone, DOOR_ZONE } from '../town/town.js';
import { pieceTag } from '../town/cutaway.js';
import { ZOOM_LADDER } from '../core/PixelCamera.js';

// ------------------------------------------------------------------------------------------------ constants
export const SEAT_COUNT = 15;
export const PHASES = ['day', 'nomination', 'vote', 'execution', 'night'];
export const CAMERA_MODES = ['follow', 'vote', 'overview', 'iso', 'free'];
export const CUT_MODES = ['auto', 'on', 'off'];
export const QUALITIES = ['high', 'low'];
/** Named town time-of-day presets (src/town/api.js TOWN_TOD) and the clock hour each one is anchored at. */
export const TOD_HOURS = { night: 0, morning: 8, noon: 12.5, afternoon: 16, golden: 18.5 };
/** The player's spawn: the game's PLAYER_SPAWN tile (22, 27), moved to its north half - the south edge of the square,
 *  between the dial ring and the kerb, clear of house-9's roof at the gameplay camera. */
export const SPAWN = { x: layout.PLAYER_SPAWN.x + 0.5, z: layout.PLAYER_SPAWN.z + 0.1 };
/** Default character id (characters.js may override with its own first completed character). */
export const DEFAULT_CHARACTER = 'wanderer';

export const emptySeat = () => ({ occupied: false, dead: false, ghostVote: true, nominated: false, onBlock: false });

/**
 * The shared demo state (docs/DEMO.md §3). Everything the UI can change lives here; modules react to changes through
 * store.on(key, fn). Runtime-only data (player position, character handle, fps) lives on the module objects, not here.
 */
export const DEFAULT_STATE = Object.freeze({
  character: DEFAULT_CHARACTER,  // characters/<id>.js (one of characters.js listCharacters() with complete: true)
  timeOfDay: 12.5,               // clock hours 0..24 (continuous; 12.5 = 12:30)
  timeSpeed: 1,                  // game minutes per real second (0 = the clock stands; 60 = an hour per second)
  paused: false,                 // freezes the town clock (rendering and walking go on)
  phase: 'day',                  // PHASES
  nominee: null,                 // seat index being nominated / voted on (phase nomination | vote | execution), or null
  seats: Object.freeze(Array.from({ length: SEAT_COUNT }, emptySeat)),
  quality: 'high',               // QUALITIES; changing it reloads the page (the town is built per tier)
  life: true,                    // town life layer (walkers, crows, smoke ...) visible + updated
  cutaway: 'auto',               // CUT_MODES: auto = on at gameplay zooms (viewHeight <= 20.5)
  camera: 'follow',              // CAMERA_MODES
  zoom: 12,                      // follow-camera viewHeight (a ZOOM_LADDER stop; 12 = the game's camera)
  yaw: 0,                        // follow / free camera yaw in degrees (multiples of 45; 0 = the game's view, looking north)
  ui: true,                      // control panel visible
  location: 'town',              // 'town' | 'house-N': where the player is (player.js writes it, source 'player';
                                 // any other writer makes the player walk in / out: fade to the room / doorstep)
  bookStyle: 'held',             // BOOK_STYLES: the reading notebook others see (gameui.js): 'held' at the hands | 'big' 3D book
  pointerScale: 'new',           // POINTER_SCALES: the pointing finger 'new' | 'v2' (the v2 size relative to the character)
});
/** Game-UI variant toggles (docs/DEMO.md §5: ?book=held|big ?pointer=new|v2), switched live by the panel. */
export const BOOK_STYLES = ['held', 'big'];
export const POINTER_SCALES = ['new', 'v2'];
/** Valid values of state.location. */
export const LOCATION_RX = /^(town|house-(?:[0-9]|1[0-4]))$/;

// ------------------------------------------------------------------------------------------------ store + events
/** Tiny event emitter: on(name, fn) -> unsubscribe, off, emit(name, payload). '*' listeners get (name, payload). */
export function createEvents() {
  const map = new Map();
  const api = {
    on(name, fn) { (map.get(name) ?? map.set(name, new Set()).get(name)).add(fn); return () => api.off(name, fn); },
    off(name, fn) { map.get(name)?.delete(fn); },
    emit(name, payload) {
      for (const fn of [...(map.get(name) ?? [])]) { try { fn(payload); } catch (e) { console.error(`[demo] '${name}' listener:`, e); } }
      if (name !== '*') for (const fn of [...(map.get('*') ?? [])]) { try { fn(name, payload); } catch (e) { console.error(e); } }
    },
  };
  return api;
}

/**
 * State store. store.state is a frozen snapshot (replaced on every change: compare by reference).
 *   store.set(patch, source?)          shallow merge; emits '<key>' (value, prev, state, source) per changed key, then
 *                                      'change' ({keys, state, prev, source})
 *   store.setSeat(i, patch, source?)   merge into seats[i] (emits 'seats')
 *   store.on(key | 'change', fn)       -> unsubscribe
 * `source` is a free tag ('ui', 'time', 'url', 'key' ...) so a module can ignore its own echoes.
 */
export function createStore(initial = DEFAULT_STATE) {
  const ev = createEvents();
  let state = freeze({ ...DEFAULT_STATE, ...initial });
  const store = {
    get state() { return state; },
    get(key) { return key === undefined ? state : state[key]; },
    set(patch, source = null) {
      const prev = state, keys = [];
      const next = { ...state };
      for (const [k, v] of Object.entries(patch ?? {})) {
        if (!(k in DEFAULT_STATE)) { console.warn(`[demo] store.set: unknown key '${k}'`); continue; }
        const val = validate(k, v, state[k]);
        if (sameValue(val, state[k])) continue;
        next[k] = val; keys.push(k);
      }
      if (!keys.length) return false;
      state = freeze(next);
      for (const k of keys) ev.emit(k, { value: state[k], prev: prev[k], state, source });
      ev.emit('change', { keys, state, prev, source });
      return true;
    },
    setSeat(i, patch, source = null) {
      if (!(i >= 0 && i < SEAT_COUNT)) return false;
      const seats = state.seats.map((s, k) => (k === i ? { ...s, ...patch } : s));
      return store.set({ seats }, source);
    },
    /** fn({value, prev, state, source}) for one key, or fn({keys, state, prev, source}) for 'change'. */
    on(key, fn) { return ev.on(key, fn); },
    off(key, fn) { ev.off(key, fn); },
  };
  return store;
}
const freeze = (s) => Object.freeze({ ...s, seats: Object.freeze(s.seats.map((x) => Object.freeze({ ...emptySeat(), ...x }))) });
const sameValue = (a, b) => a === b || (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));
function validate(k, v, old) {
  switch (k) {
    case 'timeOfDay': { const h = Number(v); return Number.isFinite(h) ? ((h % 24) + 24) % 24 : old; }
    case 'timeSpeed': { const s = Number(v); return Number.isFinite(s) ? Math.max(0, Math.min(3600, s)) : old; }
    case 'zoom': { const z = Number(v); return Number.isFinite(z) && z > 0 ? z : old; }
    case 'yaw': { const y = Number(v); return Number.isFinite(y) ? ((Math.round(y / 45) * 45) % 360 + 360) % 360 : old; }
    case 'phase': return PHASES.includes(v) ? v : old;
    case 'camera': return CAMERA_MODES.includes(v) ? v : old;
    case 'cutaway': return CUT_MODES.includes(v) ? v : old;
    case 'quality': return QUALITIES.includes(v) ? v : old;
    case 'nominee': return v === null || (Number.isInteger(Number(v)) && v >= 0 && v < SEAT_COUNT) ? (v === null ? null : Number(v)) : old;
    case 'seats': return Array.isArray(v) && v.length === SEAT_COUNT ? v : old;
    case 'paused': case 'life': case 'ui': return !!v;
    case 'location': return typeof v === 'string' && LOCATION_RX.test(v) ? v : old;
    case 'bookStyle': return BOOK_STYLES.includes(v) ? v : old;
    case 'pointerScale': return POINTER_SCALES.includes(v) ? v : old;
    default: return v;
  }
}

// ------------------------------------------------------------------------------------------------ URL <-> state
/** URL params that seed the state (docs/DEMO.md §5): ?char= ?tod=<hours|preset> ?speed= ?paused=1 ?phase= ?quality=
 *  ?life=0 ?cut= ?cam= ?zoom= ?yaw= ?ui=0 ?seats=<n occupied> ?seatbits=<15 base-32 digits> ?nominee=<seat> ?in=house-N
 *  ?book=held|big ?pointer=new|v2 (game-UI variants) */
export function stateFromParams(params) {
  const p = {}, g = (k) => params.get(k);
  if (g('char')) p.character = g('char');
  if (g('tod') !== null) p.timeOfDay = TOD_HOURS[g('tod')] ?? Number(g('tod'));
  if (g('speed') !== null) p.timeSpeed = Number(g('speed'));
  if (g('paused') !== null) p.paused = g('paused') === '1';
  if (g('phase')) p.phase = g('phase');
  if (g('quality')) p.quality = g('quality');
  if (g('life') !== null) p.life = g('life') !== '0';
  if (g('cut')) p.cutaway = g('cut') === '1' ? 'on' : g('cut') === '0' ? 'off' : g('cut');
  if (g('cam')) p.camera = g('cam');
  if (g('zoom') !== null) p.zoom = Number(g('zoom'));
  if (g('yaw') !== null) p.yaw = Number(g('yaw'));
  if (g('ui') !== null) p.ui = g('ui') !== '0';
  if (g('seats') !== null) {
    const n = Math.max(0, Math.min(SEAT_COUNT, Number(g('seats')) || 0));
    p.seats = Array.from({ length: SEAT_COUNT }, (_, i) => ({ ...emptySeat(), occupied: i < n }));
  }
  if (g('seatbits') !== null) { const s = decodeSeats(g('seatbits')); if (s) p.seats = s; }
  if (g('nominee') !== null) p.nominee = g('nominee') === '' || g('nominee') === 'none' ? null : Number(g('nominee'));
  if (g('in') !== null) p.location = g('in') || 'town';
  if (g('book') !== null) p.bookStyle = g('book');
  if (g('pointer') !== null) p.pointerScale = g('pointer');
  return p;
}
/** The inverse (what a reload keeps): URLSearchParams for the current state + the player position. */
export function stateToParams(state, { player = null, keep = new URLSearchParams() } = {}) {
  const q = new URLSearchParams(keep);
  q.set('char', state.character); q.set('tod', state.timeOfDay.toFixed(3)); q.set('speed', String(state.timeSpeed));
  q.set('paused', state.paused ? '1' : '0'); q.set('phase', state.phase); q.set('quality', state.quality);
  q.set('life', state.life ? '1' : '0'); q.set('cut', state.cutaway); q.set('cam', state.camera);
  q.set('zoom', String(state.zoom)); q.set('yaw', String(state.yaw)); q.set('ui', state.ui ? '1' : '0');
  q.delete('seats'); q.set('seatbits', encodeSeats(state.seats));
  if (state.nominee === null) q.delete('nominee'); else q.set('nominee', String(state.nominee));
  q.set('book', state.bookStyle); q.set('pointer', state.pointerScale);
  // inside a cottage: ?in=house-N (the player starts at the town spawn and walks straight in; the room's coordinates
  // are not a town position, so no ?at=)
  if (state.location && state.location !== 'town') { q.set('in', state.location); q.delete('at'); }
  else { q.delete('in'); if (player) q.set('at', `${player.x.toFixed(2)},${player.z.toFixed(2)}`); }
  return q;
}
/** Seats <-> URL: one base-32 digit per seat, bits occupied 1, dead 2, ghost vote SPENT 4, nominated 8, on block 16. */
export function encodeSeats(seats) {
  return seats.map((s) => ((s.occupied ? 1 : 0) | (s.dead ? 2 : 0) | (s.ghostVote ? 0 : 4) | (s.nominated ? 8 : 0) | (s.onBlock ? 16 : 0)).toString(32)).join('');
}
export function decodeSeats(str) {
  if (typeof str !== 'string' || str.length !== SEAT_COUNT || !/^[0-9a-v]+$/.test(str)) return null;
  return [...str].map((c) => { const b = parseInt(c, 32); return { occupied: !!(b & 1), dead: !!(b & 2), ghostVote: !(b & 4), nominated: !!(b & 8), onBlock: !!(b & 16) }; });
}

/** Nearest named preset for a clock hour (the stub mapping; time.js owns the continuous sky). */
export function presetForHour(h) {
  if (h < 5.5 || h >= 20.5) return 'night';
  if (h < 10) return 'morning';
  if (h < 14.5) return 'noon';
  if (h < 17.5) return 'afternoon';
  return 'golden';
}
/** 'HH:MM' for clock hours. */
export const formatClock = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------------------------------------ keyboard input
/**
 * Keyboard: `held(code)` for continuous input (movement), `bind(code, fn, {desc, group, repeat})` for presses.
 * KeyboardEvent.code names ('KeyW', 'ArrowUp', 'Space', 'BracketRight' ...) so layouts do not matter. Keys typed into
 * form fields are ignored. `bindings()` lists every binding for the UI's help overlay.
 */
export function createInput(target = window) {
  const down = new Set(), binds = new Map();
  const typing = (e) => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && t.type !== 'range' && t.type !== 'checkbox'; };
  const kd = (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    down.add(e.code);
    const list = binds.get(e.code);
    if (list?.length) {
      e.preventDefault();
      for (const b of list) if (!e.repeat || b.repeat) { try { b.fn(e); } catch (err) { console.error('[demo] key', e.code, err); } }
    } else if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
  };
  const ku = (e) => down.delete(e.code);
  const blur = () => down.clear();
  target.addEventListener('keydown', kd);
  target.addEventListener('keyup', ku);
  target.addEventListener('blur', blur);
  return {
    held: (code) => down.has(code),
    any: (...codes) => codes.some((c) => down.has(c)),
    bind(code, fn, { desc = '', group = 'misc', repeat = false } = {}) {
      const b = { code, fn, desc, group, repeat };
      (binds.get(code) ?? binds.set(code, []).get(code)).push(b);
      return () => { const l = binds.get(code); const i = l?.indexOf(b); if (i >= 0) l.splice(i, 1); };
    },
    bindings: () => [...binds.values()].flat().map(({ code, desc, group }) => ({ code, desc, group })),
    /** Run every press binding of `code` once, as a key press would (the game UI's action-bar buttons: the SAME code
     *  path as the key). Returns how many bindings ran. */
    press(code) {
      const list = binds.get(code);
      if (!list?.length) return 0;
      for (const b of [...list]) { try { b.fn({ code, repeat: false, synthetic: true, preventDefault() {} }); } catch (err) { console.error('[demo] press', code, err); } }
      return list.length;
    },
    /** Is anything bound to `code`? */
    has: (code) => !!binds.get(code)?.length,
    dispose() { target.removeEventListener('keydown', kd); target.removeEventListener('keyup', ku); target.removeEventListener('blur', blur); },
  };
}
/** 'KeyW' -> 'W', 'BracketRight' -> ']' ... for help text. */
export function keyLabel(code) {
  const m = { BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=', Space: 'Space',
    Backquote: '`', Semicolon: ';', Quote: "'", Backslash: '\\', Escape: 'Esc', Tab: 'Tab' };
  return m[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Arrow/, '');
}

// ------------------------------------------------------------------------------------------------ camera rig
const DEG = Math.PI / 180;
/** Horizontal camera axes for a yaw: forward (screen up, into the scene) and right (screen right). */
export function cameraAxes(yaw, out = null) {
  if (out) { out.fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); out.right.set(Math.cos(yaw), 0, -Math.sin(yaw)); return out; }   // (perf) no allocation
  return { fwd: new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)) };
}

/**
 * The demo camera (lead). Modes (state.camera):
 *   follow   the game camera: yaw state.yaw, viewHeight state.zoom, follows demo.player.position (critically damped,
 *            the PixelCamera snaps to texels itself)
 *   vote     CAMERAS.vote (the whole circle + the tower dial), overview / iso: the town presets
 *   free     the target stays where it is; drag with the mouse to pan, wheel zooms
 * Q / E rotate 45 deg (follow / free), wheel or - / = step the zoom ladder, C cycles the modes.
 */
export function createCameraRig(demo) {
  const { engine, store, input } = demo;
  const cam = engine.camera;
  const smooth = new THREE.Vector3().copy(cam.target);
  let drag = null;
  const modeYaw = () => {
    const m = store.state.camera;
    return m === 'iso' ? CAMERAS.iso.yaw : (m === 'vote' || m === 'overview') ? 0 : store.state.yaw * DEG;
  };
  const shortest = (to) => cam.targetYaw + Math.atan2(Math.sin(to - cam.targetYaw), Math.cos(to - cam.targetYaw));
  const reaim = (dur = 0.3) => { const to = modeYaw(); if (Math.abs(Math.sin((to - cam.targetYaw) / 2)) > 1e-4) cam.rotateTo(shortest(to), dur, { steps: 3 }); };
  store.on('camera', ({ value, prev }) => {
    if (value === 'free' && prev) smooth.copy(cam.target);
    if (value === 'follow') { const p = demo.player?.position; if (p) smooth.set(p.x, 0, p.z); }
    reaim();
  });
  store.on('yaw', () => reaim());
  const step = (dir) => {
    const vh = store.state.zoom;
    let i = ZOOM_LADDER.findIndex((v) => v >= vh - 1e-6);
    if (i < 0) i = ZOOM_LADDER.length - 1;
    i = Math.max(0, Math.min(ZOOM_LADDER.length - 1, i + dir));
    store.set({ zoom: Math.max(5, Math.min(45, ZOOM_LADDER[i])) }, 'camera');
  };
  input.bind('KeyQ', () => store.set({ yaw: store.state.yaw + 45 }, 'key'), { desc: 'rotate camera left 45°', group: 'camera' });
  input.bind('KeyE', () => store.set({ yaw: store.state.yaw - 45 }, 'key'), { desc: 'rotate camera right 45°', group: 'camera' });
  input.bind('Equal', () => step(-1), { desc: 'zoom in', group: 'camera' });
  input.bind('Minus', () => step(1), { desc: 'zoom out', group: 'camera' });
  input.bind('KeyC', () => store.set({ camera: CAMERA_MODES[(CAMERA_MODES.indexOf(store.state.camera) + 1) % CAMERA_MODES.length] }, 'key'), { desc: 'cycle camera mode', group: 'camera' });
  const el = engine.renderer.domElement;
  let wheelAcc = 0;
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (Math.abs(wheelAcc) < 60) return;
    step(Math.sign(wheelAcc)); wheelAcc = 0;
  }, { passive: false });
  // left button only: the right button points / opens the pie (gameui.js)
  el.addEventListener('pointerdown', (e) => { if (store.state.camera === 'free' && e.button === 0) drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / engine.pixelScale, dy = (e.clientY - drag.y) / engine.pixelScale;
    drag = { x: e.clientX, y: e.clientY };
    const { fwd, right } = cameraAxes(cam.yaw), tw = cam.texelWorld;
    smooth.addScaledVector(right, -dx * tw).addScaledVector(fwd, dy * tw / Math.sin(cam.pitch));
  });

  const rig = {
    get mode() { return store.state.camera; },
    /** Ground point the camera looks at (before snapping). */
    get target() { return cam.target; },
    snapTo(p) { smooth.set(p.x, 0, p.z); cam.target.copy(smooth); },
    update(t, dt) {
      const m = store.state.camera;
      if (m === 'follow') {
        const p = demo.player?.position;
        if (p) {
          // critically damped follow (~0.25 s), hard catch-up beyond 4 m (teleports, character swaps)
          const k = 1 - Math.exp(-dt * 9);
          if (smooth.distanceTo(p) > 4) smooth.set(p.x, 0, p.z);
          else smooth.x += (p.x - smooth.x) * k, smooth.z += (p.z - smooth.z) * k;
        }
        cam.target.set(smooth.x, 0, smooth.z);
        cam.viewHeight = store.state.zoom;
      } else if (m === 'free') {
        cam.target.copy(smooth);
        cam.viewHeight = store.state.zoom;
      } else {
        const P = CAMERAS[m];
        cam.target.set(...P.target);
        cam.viewHeight = P.viewHeight;
      }
    },
  };
  cam.set({ yaw: modeYaw(), pitch: Math.PI / 6 });
  return rig;
}

// ------------------------------------------------------------------------------------------------ live cut-away
/**
 * Re-aims the town's camera-aware cut-away (src/town/cutaway.js, docs/TOWN.md §12.2) every frame:
 *   - the voting circle while the camera centre is on the square (as buildTown decides at build time),
 *   - the player: a 0.9 x 1.8 m box at the character (never hidden behind a cottage),
 *   - the cottage whose door-approach zone the player stands in (town.js doorZone, plus a zone at the PIECE's door
 *     where it differs from layout.js: house-14), or whose door trigger the player is in (player.nearDoor): cut + keep box.
 * state.cutaway: auto = on at viewHeight <= 20.5 (gameplay zooms, vote), on / off force it.
 * Not yet live: the roof-off LIFTS of buildTown (whole roofs of the cottage in front) - they need section twins built
 * per cottage; see docs/DEMO.md §7 (lead backlog).
 */
export function createCutController(demo) {
  const { engine, store, town } = demo;
  const cut = town.cutaway;
  const tops = new Map();
  for (const rec of layout.houses) {
    const g = town.registry.get(rec.id)?.group;
    const top = g ? new THREE.Box3().setFromObject(g).max.y + 0.3 : 7;
    tops.set(rec.id, Number.isFinite(top) ? Math.min(12, top) : 7);
  }
  // the PIECE's door (doorOf) where it differs from layout.js's (house-14's recessed mill door, 0.9 m off:
  // stats.doorMismatch): town.js doorZone only knows the layout door, so the real door gets its own approach zone
  const realZones = [];
  for (const rec of layout.houses) {
    const d = doorOf(town.registry, rec.id);
    if (d && Math.hypot(d.pos.x - rec.doorPoint.x, d.pos.z - rec.doorPoint.z) > 0.2) {
      const [nx, nz] = d.normal, l = Math.hypot(nx, nz) || 1;
      realZones.push({ rec, x: d.pos.x, z: d.pos.z, nx: nx / l, nz: nz / l });
    }
  }
  const zoneOf = (rec, x, z) => {
    let best = doorZone(rec, x, z);
    for (const r of realZones) {
      if (r.rec !== rec) continue;
      const dx = x - r.x, dz = z - r.z, s = dx * r.nx + dz * r.nz, lat = Math.abs(-dx * r.nz + dz * r.nx);
      if (s > -0.3 && s < DOOR_ZONE.depth && lat < DOOR_ZONE.half) best = Math.min(best ?? Infinity, Math.max(0, s) + lat * 0.5);
    }
    return best;
  };
  let sig = '';
  // (perf) the rebuild key as numbers (the string key was built every frame): on, onSquare, house, cell x / z, yaw
  const K = [null, null, null, NaN, NaN, NaN];
  const info = { on: false, circle: false, house: null, boxes: 0, inside: false };
  // entering / leaving a cottage: rebuild on the next town frame (the doorstep cell on the way out is the same cell
  // as on the way in, so the quantised key alone would not notice that the cut was switched off meanwhile)
  demo.events?.on?.('player:location', () => { sig = ''; });
  return {
    info,
    update() {
      if (!cut) return;
      // inside a cottage (player.interior): the town cut-away is off (its player box would cut the room's furniture,
      // the circle / door boxes are town-only); the room kit drops its own walls facing the camera
      if (demo.player?.interior) {
        if (sig !== 'inside') { cut.enabled = false; cut.setBoxes([]); cut.setKeep(null); cut.setLifts([]); cut.setCircle(null); sig = 'inside'; }
        Object.assign(info, { on: false, circle: false, house: null, boxes: 0, inside: true });
        return;
      }
      info.inside = false;
      const s = store.state, c = engine.camera, vh = c.viewHeight, tg = c.target;
      const on = s.cutaway === 'on' || (s.cutaway === 'auto' && vh <= 20.5);
      const p = demo.player?.position;
      const onSquare = Math.abs(layout.CIRCLE.cz - tg.z) < 0.9 * vh && Math.abs(layout.CIRCLE.cx - tg.x) < 0.8 * vh;
      let house = null;
      if (on && p) {
        let bd = Infinity;
        for (const h of layout.houses) { const d = zoneOf(h, p.x, p.z); if (d !== null && d < bd) { bd = d; house = h; } }
        // the player's own door trigger (piece anchors) wins: standing AT a door always protects that cottage
        const nd = demo.player?.nearDoor?.id;
        if (nd && nd !== house?.id) house = layout.houses.find((h) => h.id === nd) ?? house;
      }
      // quantise the player box to 5 cm: the boxes are rebuilt only when something really changed
      const px = p ? Math.round(p.x * 20) / 20 : 0, pz = p ? Math.round(p.z * 20) / 20 : 0;
      const hid = house?.id ?? null, yq = Math.round(c.yaw * 1000);
      if (sig === 'town' && K[0] === on && K[1] === onSquare && K[2] === hid && K[3] === px && K[4] === pz && K[5] === yq) return;
      sig = 'town'; K[0] = on; K[1] = onSquare; K[2] = hid; K[3] = px; K[4] = pz; K[5] = yq;
      const boxes = [];
      if (on && p) boxes.push({ min: [px - 0.45, 0.03, pz - 0.45], max: [px + 0.45, 1.8, pz + 0.45] });
      if (house) {
        boxes.push(houseBox(house, tops.get(house.id), 'eave'));
        cut.setKeep(houseBox(house, tops.get(house.id), 'full'), pieceTag(house.id));
      } else cut.setKeep(null);
      cut.setBoxes(boxes);
      cut.setLifts([]);
      cut.setCircle(on && onSquare ? { cx: layout.CIRCLE.cx, cz: layout.CIRCLE.cz, r: 6.9, top: 1.6 } : null);
      cut.enabled = on && (boxes.length > 0 || onSquare);
      Object.assign(info, { on: cut.enabled, circle: on && onSquare, house: house?.id ?? null, boxes: boxes.length });
    },
  };
}

// ------------------------------------------------------------------------------------------------ misc helpers
/** World door point of a cottage for walking / door triggers: the PIECE's door anchor when it has one (the real door;
 *  house-14's front-wall door differs from layout.js, stats.doorMismatch), else the layout record's doorPoint. */
export function doorOf(registry, id) {
  const rec = layout.houses.find((h) => h.id === id) ?? (id === 'clocktower' ? layout.clocktower : null);
  const anchors = registry.anchors('doors').filter((d) => d.piece === id);
  if (anchors.length) {
    // an anchor with a `point` is the real door centre (house-14's recessed mill door, chamfer / porch doors); a
    // pivot-only anchor's pivot is the HINGE, so its door centre is the layout record's doorPoint (as collision.js
    // realDoors does). The anchor nearest the record's door wins (houses with several doors).
    const ref = rec?.doorPoint ?? null;
    const dist = (a) => (a.point && ref ? Math.hypot(a.point.x - ref.x, a.point.z - ref.z) : 0);
    const pick = anchors.slice().sort((a, b) => dist(a) - dist(b))[0];
    const pt = pick.point ?? ref ?? pick.pivot.getWorldPosition(new THREE.Vector3());
    return { id, pos: new THREE.Vector3(pt.x, 0, pt.z), normal: pick.normal ?? rec?.doorNormal ?? [0, 1], anchor: pick, record: rec };
  }
  return rec ? { id, pos: new THREE.Vector3(rec.doorPoint.x, 0, rec.doorPoint.z), normal: rec.doorNormal, anchor: null, record: rec } : null;
}
