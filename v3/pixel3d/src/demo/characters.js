// Demo characters (owner: demo characters; docs/DEMO.md §4.2). Which characters the demo offers, and the runtime handle
// that puts one of them into the town (the player's avatar, the idle NPCs on the square).
//
//   listCharacters() -> Promise<[{ id, name, complete, bodyPlan, height, blurb, reason, error? }]>
//       every roster character (src/demo/roster.json from tools/demo-roster.mjs, else the built-in shipped four); the
//       offered ones (publicly: FINISHED only; ?wip=1: + work in progress) are probed (imported) here, and one that
//       fails to import is returned complete: false with `error` (the switcher shows only complete: true). Also starts the idle NPCs (createNPCs) when the demo
//       object is already published on window.__demo.demo (main.js does that before it lists characters).
//   createCharacter(engine, id, { position, face, ground, fx = true, smears = true }) -> Promise<handle>
//       handle = { id, name, spec, ch, root, height, walkSpeed, runSpeed, gameSpeed, clips, emotes, emoteClips, clock,
//                  update(t), play(clip), dispose() }; rejects with an Error on any failure (missing / broken spec, rig
//                  build error). The caller adds handle.root to the scene; dispose() removes it.
//   createNPCs(demo, { count }) -> { list, update(t), dispose() }   idle completed characters on the square (?npcs=N, 0 = off)
//
// Runtime notes (src/chars is read-only for the demo; these are workarounds, see the CONTRACT-REQUESTs below):
// - The Character is created with autoUpdate: false and its smears / FX get a PROXY engine whose onUpdate collects their
//   per-frame functions into the handle: handle.update(t) runs Character + smears + FX, and dispose() drops them all
//   (attachFx / attachSmears register engine.onUpdate forever otherwise, like an autoUpdate Character).
// - LOCAL CLOCK: a Character re-simulates from t = 0 on its first update (and on any jump > 1 s) - created at engine time
//   600 s that is 36 000 fixed steps (a multi-second freeze on every character swap). The handle runs the Character on
//   its own clock tau = t - t0 (t0 = the engine time at creation): ch.drive(fn) still receives ENGINE time (the wrapper
//   adds t0), ch.play() / FX / smears see tau through the proxy's `time`. If the engine time jumps (> 0.9 s forward or
//   backwards) the offset is re-based so tau keeps running instead of re-simulating. ch.play(name) without `at` starts
//   on the next 1/30 s grid frame (Character.play's default "now" is already simulated -> a full re-simulation).
// - Ground: feet follow the town terrain (ground piece api.heightAt) - flat on the square, the rim rolls.
// CONTRACT-REQUEST motion (character.js): an `epoch`/`t0` option (simulate from the creation time, not from 0) and a
//   dispose() that unregisters the engine updater; fx/smear: return an unsubscribe for their engine.onUpdate.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { buildCharacter } from '../chars/rig.js';
import { loadRoster, loadSpec, probe, wipMode, publicOffer, wipOffer, isFinished } from './roster.js';

let smearMod = null, fxMod = null;

/** (P1.3, the Storyteller's lantern) A Character builds a PointLight for every spec.lights entry under its socket the
 *  first time it updates: one more light in the scene = every lit material recompiles (+23 programs, a ~200 ms hitch
 *  on the swap, audit 2026-10-17). The demo builds the Character from a shallow copy WITHOUT lights; the entries stay on
 *  the handle (`handle.lights`, with the socket node resolved) and the time module pins one light of its constant pool
 *  to the socket (time.js `carried`). Same spec object everywhere else (handle.spec is the original). */
export const lightless = (spec) => (spec?.lights?.length ? { ...spec, lights: [] } : spec);
/** The default spawn character (= api.js DEFAULT_CHARACTER; critic P1-2: one with all six game emotes). */
export const DEFAULT_ID = 'frog';
const optional = async (p) => { try { return await import(p); } catch (e) { console.warn(`[demo] ${p} unavailable:`, e?.message || e); return null; } };

// game emotes (CHARACTERS.md clocktower rule) -> clip name in the spec (or null). 'signature' = spec.emote.
const GAME_EMOTES = ['talk', 'vote', 'point', 'die', 'ghost'];
// combat / hurt clips the clocktower rule bans from play (the shipped four still carry them): never offered as emotes
const BANNED = new Set(['attack', 'hurt', 'lunge', 'spin', 'parry', 'pounce', 'thump', 'hit', 'strike']);

let listP = null;
/** (perf) Start fetching the roster + every offered spec module now (main.js calls this before the town build: the
 *  imports download while the town is built, so listCharacters' probes find them done). Never throws. */
export function prefetchCharacters() {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const pick = q.get('roster');
  return loadRoster().then((roster) => {
    const wip = wipMode();
    const ids = roster.characters.filter((c) => pick === 'all' || (wip ? wipOffer(c) : publicOffer(c))).map((c) => c.id);
    for (const id of new Set([q.get('char') ?? DEFAULT_ID, ...ids])) loadSpec(id).catch(() => {});
  }).catch(() => {});
}
/** Rows of the switcher: `complete` = offered: publicly only FINISHED characters that load + animate (roster.js
 *  publicOffer); with ?wip=1 also the work in progress (`status` 'wip', labelled). `status` 'shipped' (= finished:
 *  CHARACTER_STATUS.md / final critic ship verdict / roster-allow.json) | 'wip'; finished first. If the URL's
 *  ?char= names a character that is not offered (a WIP id on the public page), the store falls back to the first
 *  offered one before the player is created. Each offered row gets `thumb` (a 24 px pixel portrait,
 *  data: URL, rendered once here) and `check` ({ idle, walk, ms }) from the runtime exercise. */
export function listCharacters() {
  listP ??= (async () => {
    const roster = await loadRoster();
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    const pick = q.get('roster');   // debug: 'all' = every roster character that loads; 'a,b' = exactly those; 'shipped'
    const want = pick && !['all', 'shipped'].includes(pick) ? new Set(pick.split(',')) : null;
    const wip = wipMode();
    const rows = roster.characters.map((c) => {
      const status = isFinished(c) || (c.complete && roster.source === 'fallback') ? 'shipped' : 'wip';
      // public: finished + playable only; ?wip=1: every playable one (roster.js publicOffer / wipOffer, v1-v3 manifests)
      const offered = wip ? wipOffer(c) : publicOffer(c);
      return {
        id: c.id, name: c.name ?? c.id, bodyPlan: c.bodyPlan ?? null, height: c.height ?? null,
        blurb: status === 'wip' ? `Work in progress${c.blurb ? ` - ${c.blurb}` : ''}` : c.blurb ?? null,
        status, shipped: status === 'shipped', reason: c.reason ?? null,
        complete: pick === 'all' ? true : pick === 'shipped' ? publicOffer(c) : want ? want.has(c.id) : !!offered,
      };
    });
    // ?roster=a,b may name characters the manifest does not know yet (a cast member finished after the last generator run)
    for (const id of want ?? []) if (/^[a-z0-9][a-z0-9-]*$/.test(id) && !rows.some((r) => r.id === id)) rows.push({ id, name: id, complete: true, status: 'wip', shipped: false, reason: '?roster=' });
    rows.sort((a, b) => (b.shipped - a.shipped));   // stable: shipped first, the manifest order inside each group
    await Promise.all(rows.filter((r) => r.complete).map(async (r) => {
      const p = await probe(r.id);
      if (!p.ok) { r.complete = false; r.error = p.error; console.warn(`[demo] character '${r.id}' skipped: ${p.error}`); }
    }));
    // build every offered character once: it must pose (idle) and walk when driven, else it is skipped; the idle pose
    // is rendered into the switcher's portrait (?thumbs=0: exercise only, the UI falls back to monograms)
    const engine = globalThis.window?.__demo?.demo?.engine;
    if (engine && q.get('exercise') !== '0') {
      const t0 = performance.now();
      const thumbs = q.get('thumbs') !== '0' ? createThumbnailer(engine) : null;
      const cache = q.get('rosterCache') === '0' ? null : loadCheckCache();
      let hits = 0, printMs = 0, manifestHits = 0;
      try {
        for (const r of rows.filter((x) => x.complete)) {
          try {
            const { spec } = await loadSpec(r.id);
            // (perf) the exercise is deterministic for a given spec: its result (check + portrait) is cached per
            // browser under a fingerprint of the spec's whole content (functions by source), so a reload (quality
            // switch, a collaborator's second visit) skips ~0.6 s (4090) / ~2.5 s (laptop) of rig builds + read-backs.
            // Any edit to the spec changes the fingerprint and re-runs it. ?rosterCache=0 bypasses the cache.
            const tp = performance.now();
            const src = cache ? await sourcePrint(r.id) : null;
            const key = src ? `${r.id}:${thumbs ? 't' : 'n'}:${roster.generated ?? '-'}:${src}` : null;
            printMs += performance.now() - tp;
            let res = key ? cache.get(key) : null;
            // the manifest's own live check of this exact file (tools/demo-roster.mjs --browser: verified.src + thumb):
            // valid on a first visit too, when the source fingerprint matches
            const mv = src && (roster.characters.find((c) => c.id === r.id)?.verified ?? null);
            if (!res && mv && mv.src === src && mv.ok && mv.walk && (mv.thumb || !thumbs)) {
              res = { check: { idle: mv.idle, mode: mv.mode, clip: mv.clip, speed: mv.speed, walk: mv.walk, ms: 0, manifest: true }, thumb: thumbs ? mv.thumb : null };
              manifestHits++;
            }
            if (res) hits++;
            else {
              res = exercise(engine, spec, thumbs, r.status);
              if (key && res.check.walk) cache.set(key, { check: res.check, thumb: res.thumb ?? null });
            }
            r.check = res.check;
            if (res.thumb) r.thumb = res.thumb;
            if (!res.check.walk) throw new Error(`does not walk when driven (mode ${res.check.mode}, speed ${res.check.speed})`);
          } catch (e) {
            r.complete = false; r.error = String(e?.message || e).split('\n')[0];
            console.warn(`[demo] character '${r.id}' skipped: ${r.error}`);
          }
        }
      } finally { thumbs?.dispose(); }
      cache?.save();
      engine.stats.demoRosterMs = Math.round(performance.now() - t0);
      engine.stats.demoRosterCache = cache ? { hits, manifest: manifestHits, of: rows.filter((x) => x.complete).length, printMs: Math.round(printMs) } : null;
    }
    const demo = globalThis.window?.__demo?.demo;
    // ?char=<id> must not reach a character the page does not offer (a WIP id on the public demo): the player is
    // created after this list (main.js), from store.state.character
    const offeredIds = rows.filter((r) => r.complete).map((r) => r.id);
    const cur = demo?.store?.state?.character;
    if (cur && offeredIds.length && !offeredIds.includes(cur)) {
      const to = offeredIds.includes(DEFAULT_ID) ? DEFAULT_ID : offeredIds.includes('wanderer') ? 'wanderer' : offeredIds[0];
      console.info(`[demo] character '${cur}' is not offered${wip ? '' : ' publicly (work in progress: add ?wip=1)'}; starting as '${to}'`);
      demo.store.set({ character: to }, 'roster');
    }
    if (demo && !demo.npcs && q.get('npcs') !== '0') {
      demo.characters = rows;   // createNPCs reads the list (main assigns it again after we return)
      try { demo.npcs = await createNPCs(demo, { count: Number(q.get('npcs') ?? 3) }); } catch (e) {
        console.warn('[demo] NPCs failed:', e);
      }
    }
    return rows;
  })();
  return listP.then((rows) => rows.map((r) => ({ ...r })));
}

// ------------------------------------------------------------------------------------------------ check cache
// localStorage (per browser, per origin): { v, rows: { "<id>:<t|n>:<fingerprint>": { check, thumb } } }. Bumped CACHE_V
// whenever the exercise / portrait renderer changes. Every access is guarded (private windows, blocked storage).
const CACHE_V = 1, CACHE_KEY = 'pixel3d.demo.rosterChecks';
function loadCheckCache() {
  let rows = {};
  try { const o = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) ?? 'null'); if (o?.v === CACHE_V && o.rows) rows = o.rows; } catch { rows = {}; }
  const used = {};
  let dirty = false;
  return {
    get(k) { const v = rows[k]; if (v) used[k] = v; return v ?? null; },
    set(k, v) { used[k] = v; dirty = true; },
    // only the entries this load used are kept (stale fingerprints of edited specs drop out)
    save() { if (!dirty && Object.keys(used).length === Object.keys(rows).length) return; try { globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_V, rows: used })); } catch { /* quota / blocked */ } },
  };
}
/** FNV-1a fingerprint of the spec module's source text (characters/<id>.js; from the HTTP cache: it was just imported).
 *  (A spec object itself is no stable key: built geometries / materials carry random uuids, and walking it took ~20 ms
 *  per character.) An edit to a helper module the spec imports is not seen: bump CACHE_V or use ?rosterCache=0. */
async function sourcePrint(id) {
  let text = '';
  try { const r = await fetch(new URL(`../../characters/${id}.js`, import.meta.url), { cache: 'force-cache' }); text = r.ok ? await r.text() : ''; } catch { text = ''; }
  if (!text) return null;   // no source: no cache entry
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${h.toString(36)}.${text.length}`;
}

// ------------------------------------------------------------------------------------------------ exercise + portrait
// One throwaway Character per offered spec, on its own clock (a proxy engine whose time is the local tau; no texel snap,
// no smears / FX, never added to the town scene): idle until 0.5 s (portrait), then driven forward at the cast game
// speed (4 H/s) for 0.8 s: the gait must leave 'idle' and report a speed. Throws on a rig / motion error.
const THUMB = 24;   // ui.css .dui-mono-tile: 26 x 26 border box = 24 x 24 content (the img): one texel per CSS pixel

function exercise(engine, spec, thumbs, status) {
  const t0 = performance.now();
  let tau = 0;
  const proxy = Object.create(engine);
  Object.defineProperty(proxy, 'time', { get: () => tau });
  proxy.onUpdate = () => {};
  const H = spec.height ?? 1.4, v = spec.gameSpeed?.v ?? spec.game?.speed ?? 3.95 * H, GO = 0.6;
  const ch = new Character(proxy, lightless(spec), { autoUpdate: false, snap: false, facingSteps: 8, face: 0, position: new THREE.Vector3() });
  try {
    ch.drive((t) => ({ pos: new THREE.Vector3(0, 0, Math.max(0, t - GO) * v), face: 0 }));
    for (let i = 0; i <= 15; i++) ch.update(tau = i / 30);           // idle, 0 .. 0.5 s
    const idle = ch.state;
    const thumb = thumbs ? thumbs.render(ch, status) : null;
    let walk = null;
    for (let i = 16; i <= 42; i++) { ch.update(tau = i / 30); if (i === 36) walk = ch.state; }   // walking from 0.6 s
    const check = { idle: idle.clip ?? 'idle', mode: walk.mode, clip: walk.clip, speed: +(walk.speed ?? 0).toFixed(2),
      walk: walk.mode !== 'idle' || (walk.speed ?? 0) > 0.1, ms: Math.round(performance.now() - t0) };
    return { check, thumb };
  } finally { ch.dispose(); ch.root.removeFromParent(); }
}

/** Portrait renderer: the character's own palette (toneHi / color / toneSh per vertex, banded like the toon material)
 *  through a tiny skinned ShaderMaterial into a 24 x 24 float target, read back, sRGB-encoded, 1 px dark outline,
 *  a 'WIP' ribbon for work-in-progress characters. Uses the engine's renderer; restores its target / clear state. */
function createThumbnailer(engine) {
  const renderer = engine.renderer;
  const rt = new THREE.WebGLRenderTarget(THUMB, THUMB, { type: THREE.FloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  const mat = new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: { uSun: { value: new THREE.Vector3(0.55, 0.75, 0.6).normalize() } },
    vertexShader: /* glsl */`
      attribute vec3 toneHi; attribute vec3 toneSh;
      varying vec3 vMid; varying vec3 vHi; varying vec3 vSh; varying vec3 vN;
      #include <common>
      #include <skinning_pars_vertex>
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vN = normalize(mat3(modelMatrix) * objectNormal);
        vMid = color; vHi = toneHi; vSh = toneSh;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun;
      varying vec3 vMid; varying vec3 vHi; varying vec3 vSh; varying vec3 vN;
      void main() {
        float l = dot(normalize(vN), uSun);
        vec3 c = l > 0.55 ? vHi : l > -0.05 ? vMid : vSh;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const buf = new Float32Array(THUMB * THUMB * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = THUMB;
  const g = canvas.getContext('2d');
  const enc = (x) => Math.round(255 * Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)));
  // 3 x 5 pixel glyphs for the ribbon
  const GLYPH = { W: ['101', '101', '101', '111', '101'], I: ['111', '010', '010', '010', '111'], P: ['110', '101', '110', '100', '100'] };
  const v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();

  return {
    render(ch, status) {
      const root = ch.root, mesh = root.getObjectByProperty('isSkinnedMesh', true);
      if (!mesh) return null;
      const keep = { parent: root.parent, mat: mesh.material, obr: mesh.onBeforeRender };
      scene.add(root);
      root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);
      const hidden = [];
      root.traverse((o) => { if (o.isMesh && o !== mesh && o.visible) { o.visible = false; hidden.push(o); } });
      mesh.material = mat; mesh.onBeforeRender = () => {};
      // a 3/4 front view (character faces +Z), 25 deg above the horizon; long-bodied characters (quadrupeds: the posed
      // body is deeper than it is tall) turn further, so the portrait shows the body and not a head on two front legs
      mesh.skeleton.update();
      const n = mesh.geometry.attributes.position.count;
      const bb = new THREE.Box3();
      for (let i = 0; i < n; i++) bb.expandByPoint(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld));
      const long = bb.max.z - bb.min.z > 0.85 * (bb.max.y - bb.min.y);
      const yaw = THREE.MathUtils.degToRad(long ? 62 : 28), el = THREE.MathUtils.degToRad(25);
      fwd.set(-Math.sin(yaw) * Math.cos(el), -Math.sin(el), -Math.cos(yaw) * Math.cos(el));   // camera looks along fwd
      right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize();
      up.crossVectors(right, fwd).normalize();
      // frame the posed (skinned) vertices: full width, top of the head down to 85 % of the width-limited square
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) {
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
        const x = v.dot(right), y = v.dot(up);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const s = Math.max(x1 - x0, (y1 - y0) * 0.78) * 1.1 + 0.04;   // the square's side (m); tall figures crop at the knee
      const cx = (x0 + x1) / 2, top = y1 + s * 0.05;
      const centre = right.clone().multiplyScalar(cx).addScaledVector(up, top - s / 2);
      cam.left = -s / 2; cam.right = s / 2; cam.top = s / 2; cam.bottom = -s / 2;
      cam.position.copy(centre).addScaledVector(fwd, -10); cam.up.copy(up); cam.lookAt(centre);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha();
      const prevCol = renderer.getClearColor(new THREE.Color()), prevShadow = renderer.shadowMap.enabled;
      try {
        renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
        renderer.shadowMap.enabled = false;
        renderer.clear(); renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, THUMB, THUMB, buf);
      } finally {
        renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto; renderer.setClearColor(prevCol, prevAlpha);
        renderer.shadowMap.enabled = prevShadow;
        mesh.material = keep.mat; mesh.onBeforeRender = keep.obr;
        for (const o of hidden) o.visible = true;
        scene.remove(root); keep.parent?.add(root);
      }
      // pixels (GL rows bottom-up) -> canvas, 1 px outline in a deep ink around the figure
      const img = g.createImageData(THUMB, THUMB), A = (x, y) => x >= 0 && y >= 0 && x < THUMB && y < THUMB && buf[((THUMB - 1 - y) * THUMB + x) * 4 + 3] > 0.5;
      for (let y = 0; y < THUMB; y++) for (let x = 0; x < THUMB; x++) {
        const o = (y * THUMB + x) * 4, b = ((THUMB - 1 - y) * THUMB + x) * 4;
        if (A(x, y)) { img.data[o] = enc(buf[b]); img.data[o + 1] = enc(buf[b + 1]); img.data[o + 2] = enc(buf[b + 2]); img.data[o + 3] = 255; }
        else if (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1)) { img.data[o] = 24; img.data[o + 1] = 20; img.data[o + 2] = 30; img.data[o + 3] = 235; }
      }
      g.putImageData(img, 0, 0);
      if (status === 'wip') {   // corner tag, bottom right: 'WIP' in amber on ink (13 x 7 px)
        g.fillStyle = 'rgba(20, 17, 26, 0.9)'; g.fillRect(THUMB - 13, THUMB - 7, 13, 7);
        g.fillStyle = '#e8b04a';
        let px = THUMB - 12;
        for (const c of 'WIP') { GLYPH[c].forEach((row, ry) => [...row].forEach((on, rx) => { if (on === '1') g.fillRect(px + rx, THUMB - 6 + ry, 1, 1); })); px += 4; }   // 3 px glyph + 1 px gap
      }
      return canvas.toDataURL('image/png');
    },
    dispose() { rt.dispose(); mat.dispose(); },
  };
}

function groundOf() {
  const g = globalThis.window?.__demo?.demo?.town?.registry?.get?.('ground')?.api;
  return typeof g?.heightAt === 'function' ? { heightAt: (x, z) => g.heightAt(x, z) } : undefined;
}

/** Resolve on the next animation frame (or after 50 ms when frames are not running: hidden tab, node). */
const nextFrame = () => new Promise((res) => {
  const t = setTimeout(res, 50);
  globalThis.requestAnimationFrame?.(() => { clearTimeout(t); res(); });
});

export async function createCharacter(engine, id, { position, face = 0, ground, fx = true, smears = true } = {}) {
  const [{ spec }, roster] = await Promise.all([loadSpec(id), loadRoster()]);
  if (smears && spec.smears && !smearMod) smearMod = await optional('../chars/smear.js');
  if (fx && spec.fx && !fxMod) fxMod = await optional('../chars/fx.js');

  // the local clock (see the header)
  const updaters = [];
  let t0 = engine.time ?? 0, tau = -1, disposed = false;
  const proxy = Object.create(engine);
  Object.defineProperty(proxy, 'time', { get: () => Math.max(0, (engine.time ?? 0) - t0) });
  proxy.onUpdate = (fn) => { updaters.push(fn); };

  let rig = null, ch = null;
  const fxs = [];
  try {
    rig = buildCharacter(engine, spec);
    // (perf) the rig build and the Character's first update (its rest-shape / dynamics setup) land in DIFFERENT frames:
    // owl's build alone is 55-90 ms and its first update 25-40 ms (2026-10-16 probe), together a >100 ms swap frame
    await nextFrame();
    ch = new Character(proxy, lightless(spec), {
      rig, autoUpdate: false, snap: true, facingSteps: 8, face,
      position: position?.clone?.() ?? new THREE.Vector3(), ground: ground ?? groundOf(),
    });
    // drive(fn): the caller's fn is a function of ENGINE time; the Character samples its local time
    const drive = ch.drive.bind(ch);
    ch.drive = (fn) => drive(fn ? (t) => fn(t + t0) : null);
    // play(): Character.play at the CURRENT time (its default) is "in the past" for the already simulated step and
    // re-simulates from 0; start on the next 1/30 s key-grid frame instead (CHARACTERS.md: action starts on the grid)
    const play = ch.play.bind(ch);
    ch.play = (name, o = {}) => play(name, { at: (Math.floor(Math.max(0, tau) * 30 + 1e-6) + 1) / 30, ...o });
    if (smears && smearMod?.attachSmears && spec.smears) fxs.push(smearMod.attachSmears(proxy, ch, { sockets: spec.smears }));
    if (fx && fxMod?.attachFx && spec.fx) fxs.push(fxMod.attachFx(proxy, ch, { ground: ch.opts.ground, ...spec.fx }));
  } catch (e) {
    for (const f of fxs) try { f.dispose(); } catch { /* best effort */ }
    try { if (ch) ch.dispose(); else rig?.dispose?.(); } catch { /* best effort */ }
    rig?.root?.removeFromParent();
    throw new Error(`character '${id}': ${e?.message || e}`, { cause: e });
  }
  ch.root.name = `character:${id}`;
  // spec.lights (not built by the Character, see lightless): an empty Object3D at each light's socket / bone (+ `at`),
  // so the time module can read its world position; never a light itself (the light count stays constant)
  const lights = [];
  for (const L of spec.lights ?? []) {
    const node = ch.rig?.sockets?.[L.socket] ?? ch.bones?.[L.bone ?? L.socket];
    if (!node) { console.warn(`[demo] '${id}' spec.lights: no socket/bone '${L.socket ?? L.bone}'`); continue; }
    const at = new THREE.Object3D();
    at.name = `demo-carried-light:${L.socket ?? L.bone}`;
    if (L.at) at.position.fromArray(L.at);
    node.add(at);
    lights.push({ L, node: at });
  }

  const clips = Object.keys(spec.clips ?? {});
  const emotes = {};
  for (const e of GAME_EMOTES) emotes[e] = spec.clips?.[e] ? e : null;
  emotes.signature = spec.emote && spec.clips?.[spec.emote] && !BANNED.has(spec.emote) ? spec.emote : null;
  const meta = roster.characters.find((c) => c.id === id);
  const loco = spec.locomotion ?? {};

  return {
    id, name: meta?.name ?? id, spec, ch, root: ch.root, height: spec.height ?? 1.4,
    walkSpeed: loco.walkSpeed ?? 1.4,            // the spec's walk (the shipped four: 0.6-1.4 m/s, legacy Gait)
    runSpeed: loco.runSpeed ?? 3.4,
    gameSpeed: spec.gameSpeed?.v ?? spec.game?.speed ?? null,   // cast members: THE game speed (4 H/s); null = use walkSpeed
    clips, emotes,
    /** the spec's carried lights [{ L (the spec.lights entry), node (Object3D at the socket) }]: lit by time.js */
    lights,
    /** clips safe to play as emotes in the clocktower game (no combat / hurt, no locomotion) */
    emoteClips: clips.filter((c) => !BANNED.has(c) && !['idle', 'walk', 'run'].includes(c)),
    /** the Character's local clock (s since creation; -1 before the first update) */
    get clock() { return tau; },
    update(t) {
      if (disposed) return;
      let l = t - t0;
      if (tau >= 0 && (l < tau - 1e-6 || l - tau > 0.9)) { t0 = t - tau - 1 / 60; l = tau + 1 / 60; }   // re-base, no re-sim
      tau = Math.max(0, l);
      ch.update(tau);
      for (const fn of updaters) fn(tau, 1 / 60, proxy);
    },
    /** play a clip now (one-shots return to idle / locomotion; vote / die hold until play('idle')) */
    play(name, opts) { if (!disposed && (spec.clips?.[name] || name === 'idle')) ch.play(name, opts); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const f of fxs) try { f.dispose(); } catch (e) { console.warn('[demo] fx dispose:', e); }
      ch.dispose();
      ch.root.removeFromParent();
      updaters.length = 0;
    },
  };
}

// ------------------------------------------------------------------------------------------------ idle NPCs
// A few completed characters (never the player's) stand on the square's south arc, between the voting circle (r 6.25)
// and the square's edge (r 9), face the circle, turn toward the player when it comes close and now and then play a
// harmless emote. They swap with the player: pick an NPC's character and that NPC becomes your previous one.
// CONTRACT-REQUEST lead (main.js): call createNPCs(demo) explicitly after createPlayer (today listCharacters starts them
// through window.__demo.demo) and have the player collide with demo.npcs.list (it walks through them now).
// [angle from south, r]. Not near the spawn (south, r 7.35): an NPC standing 3-4 m from a freshly spawned player
// (and turning to face it) read as the player's own avatar in the swap screenshots ('hound selected' showed the
// wanderer NPC next to the hound, 2026-10-16); the nearest spot is now 8.4 m from the spawn.
const NPC_SPOTS = [[-1.2, 7.6], [1.2, 7.6], [-1.8, 7.6], [1.8, 7.6], [-2.4, 7.6], [2.4, 7.6]];
const NPC_EMOTES = ['talk', 'sniff', 'raise', 'bark', 'whisper', 'wave'];

export async function createNPCs(demo, { count = 3 } = {}) {
  const { engine, layout, store, events } = demo;
  const C = layout.CIRCLE;
  const spots = NPC_SPOTS.map(([a, r]) => {
    const th = Math.PI + a;
    return new THREE.Vector3(C.cx + Math.sin(th) * r, 0, C.cz - Math.cos(th) * r);
  }).filter((p) => !layout.blocked(Math.floor(p.x), Math.floor(p.z))).slice(0, Math.max(0, Math.min(6, count || 0)));
  const npcs = [];   // per slot: { id, slot, spot, handle, face, home, next }
  let playerId = store.state.character, disposed = false;
  const available = () => (demo.characters ?? []).filter((c) => c.complete).map((c) => c.id);

  async function spawn(slot, id) {
    const spot = spots[slot];
    const home = Math.atan2(C.cx - spot.x, C.cz - spot.z);
    let h;
    try { h = await createCharacter(engine, id, { position: spot, face: home }); } catch (e) {
      console.warn(`[demo] NPC '${id}' failed:`, e?.message || e); return null;
    }
    if (disposed) { h.dispose(); return null; }
    const n = { id, slot, spot, handle: h, face: home, home, next: 3 + slot * 2.9 };
    h.ch.drive(() => ({ pos: spot, face: n.face }));
    engine.scene.add(h.root);
    npcs[slot]?.handle?.dispose();
    npcs[slot] = n;
    return n;
  }

  const ids = available().filter((id) => id !== playerId);
  await Promise.all(spots.slice(0, ids.length).map((_, i) => spawn(i, ids[i])));

  // the player took an NPC's character -> that NPC becomes the player's previous character
  const off = events?.on?.('player:character', ({ id }) => {
    const prev = playerId;
    playerId = id;
    const n = npcs.find((x) => x?.id === id);
    if (n && prev && prev !== id) spawn(n.slot, prev);
  });

  const api = {
    get list() { return npcs.filter(Boolean).map((n) => ({ id: n.id, pos: [n.spot.x, n.spot.z], clip: n.handle.ch.state.clip })); },
    /** The live NPC records for the game UI (src/demo/gameui.js: labels, talk, pops, readers): no copies per frame.
     *  [{ slot, id, name, spot (Vector3), face (rad), height, handle }] */
    get members() { return npcs; },
    update(t) {
      const p = demo.player?.position;
      for (const n of npcs) {
        if (!n) continue;
        // face the player while it stands within 3.5 m (the Character turns in stop-motion 45° steps), else the circle
        const near = p && Math.hypot(p.x - n.spot.x, p.z - n.spot.z) < 3.5;
        n.face = near ? Math.atan2(p.x - n.spot.x, p.z - n.spot.z) : n.home;
        const tau = n.handle.clock;
        if (tau >= n.next) {
          const opts = NPC_EMOTES.filter((c) => n.handle.spec.clips?.[c]);
          if (n.handle.emotes.signature && !opts.includes(n.handle.emotes.signature)) opts.push(n.handle.emotes.signature);
          if (opts.length) n.handle.play(opts[Math.floor(tau * 7.13) % opts.length]);
          n.next = tau + 7 + ((n.slot * 2.7 + tau) % 5);
        }
        n.handle.update(t);
      }
    },
    dispose() { disposed = true; off?.(); for (const n of npcs) n?.handle.dispose(); npcs.length = 0; },
  };
  // one engine updater for all NPCs (a failure is reported once, then the NPCs freeze; the page keeps running)
  let broken = false;
  engine.onUpdate((t) => {
    if (disposed || broken) return;
    try { api.update(t); } catch (e) {
      broken = true; console.error('[demo] npcs.update failed:', e); window.__demo?.errors?.push(`npcs.update: ${e?.stack || e}`);
    }
  });
  return api;
}
