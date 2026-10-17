// Portrait renderer (owner: portraits group; docs/UI.md §4 "portraits"). Renders the 3D cast (characters/*) into
// PixelImages at an exact texel size — one shared portrait camera, light and framing for every cast member — so the
// bake modules (bake.js = icons + avatars, cast-portraits.bake.js = the v2 cast-portraits sheet) never downscale.
//
//   import { renderCast, PORTRAIT_IDS, PLAYERS } from './render.js';
//   const r = await renderCast(engine, { ids, variant: 'idle'|'walk'|'ghost'|'ghost-spent'|'dead', ppm });
//   r[id] = { frames: [PixelImage], feet: {x, y}, eyes: {x, y}, ghostMode, poseIds }
//
// The portrait camera = the game camera (yaw 0, pitch 30°, orthographic), facing 'down' (dir 0, toward the viewer),
// noon key light from the upper left (sky.js 'noon', sunFor(): relAz 155, elev 50 — the same sun char-bake uses, so
// every facing is lit the same on screen), no ground / grade / fog (key-colour background, keyed to alpha 0).
// Each copy stands in its own grid cell (cells ≥ 2.1 m apart: no copy shadows another). Deterministic: every batch
// starts its own clock at 0 and is stepped at 30 Hz up to the sample times (spring dynamics settle the same way).
// Must run in a page whose Engine has capture=1 (preserveDrawingBuffer; tools/uibake.mjs and shot.mjs both do).
import * as THREE from 'three';
import { applyTimeOfDay, setClouds } from '../../world/sky.js';
import { PixelImage } from '../kit.js';

/** v2 meta.icons order minus the user skips (pipeline/skip.txt: nicksong) and brianbi (no pixel3d character). */
export const PORTRAIT_IDS = ['frog', 'mushroom', 'fox', 'owl', 'crow', 'moth', 'goat', 'skeleton-chef', 'rabbit', 'mole', 'snail',
  'toad', 'green-hood', 'honk', 'chonk', 'polly', 'clarabelle', 'requin', 'progress', 'preservation', 'opal', 'cilantro', 'mincut',
  'maxflow', 'theo-rem', 'greenting', 'storyteller', 'npc-sweeper', 'npc-vendor', 'npc-elder', 'npc-porter'];
/** Playable members (v2 cast-portraits: 5 frames + ghost + ghost-spent); storyteller + NPCs get 1 frame. */
export const PLAYERS = PORTRAIT_IDS.filter((id) => id !== 'storyteller' && !id.startsWith('npc-'));
export const SKIPPED = ['nicksong', 'brianbi'];

const KEY = '#00FF00';
const D2R = Math.PI / 180;
const GRID = 1 / 30;

let _stage = null;
function stage(engine) {
  if (_stage) return _stage;
  // the bake page has no scene content of its own: light + key background once
  engine.camera.set({ target: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: Math.PI / 6, viewHeight: 12 });
  applyTimeOfDay(engine, 'noon', { relAz: 155, elev: 50, shadowExtent: 24 });
  setClouds(engine, { scale: 0 });
  engine.style.sky.set(KEY);
  _stage = { t: 0, batches: 0 };
  return _stage;
}

async function load(id) {
  const { loadCharacter } = await import('../../../scenes/char-stage.js');
  return loadCharacter(id, 'auto', { fx: false });
}

/** Read the low-res frame (one sample per texel) from the capture canvas. */
function grab(engine) {
  const c = engine.renderer.domElement, s = engine.pixelScale;
  const g = (grab.cv ||= document.createElement('canvas'));
  g.width = c.width; g.height = c.height;
  const x = g.getContext('2d', { willReadFrequently: true });
  x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const W = engine.lowW, H = engine.lowH, img = new PixelImage(W, H);
  let mixed = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = ((j * s) * c.width + i * s) * 4, o2 = ((j * s + s - 1) * c.width + i * s + s - 1) * 4;
    if (d[o] !== d[o2] || d[o + 1] !== d[o2 + 1] || d[o + 2] !== d[o2 + 2]) mixed++;
    const key = d[o] === 0 && d[o + 1] === 255 && d[o + 2] === 0;
    if (!key) img.set(i, j, [d[o], d[o + 1], d[o + 2], 255]);
  }
  grab.mixed = mixed;   // texels whose s×s block is not uniform (must be 0: a texel = a whole block)
  return img;
}

/**
 * Render one variant for many ids. ppm = texels per metre (portrait 28 ≈ v2 sprite scale, CAST_PORTING §4: 0.04 m per
 * v2 px at cos 30°). Returns { [id]: { frames, feet, eyes, poseIds, ghostMode } } with frames cropped to `crop`
 * ({w, h, fx, fy}: the feet anchor (pixel-edge coords) inside the crop) or the whole cell.
 */
export async function renderCast(engine, { ids, variant = 'idle', ppm = 28, crop = null, walkSamples = 12, at = 0.6, mark = null, raw = false, loco = null } = {}) {
  const st = stage(engine);
  const { createActor, screenToGround, projector } = await import('../../../scenes/char-stage.js');
  const vh = engine.lowH / ppm;
  engine.camera.set({ target: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: Math.PI / 6, viewHeight: vh });
  const cw = Math.ceil(ppm * 2.2 / 2) * 2, ch = Math.ceil(ppm * 2.5 / 2) * 2;
  const cols = Math.floor(engine.lowW / cw), rows = Math.floor(engine.lowH / ch);
  const per = cols * rows;
  const out = {};
  for (let b0 = 0; b0 < ids.length; b0 += per) {
    const batch = ids.slice(b0, b0 + per);
    const T0 = st.t + 1;                                    // this batch's clock origin (engine time only increases)
    const clock = (t) => Math.max(0, t - T0);
    const ground = { heightAt: () => 0 };
    const actors = [];
    for (let k = 0; k < batch.length; k++) {
      const id = batch[k];
      const loaded = await load(id);
      let spec = loaded.spec;
      if (mark) {
        const { markSpec } = await import('../../../scenes/char-stage.js');
        spec = markSpec(spec, mark);
      }
      // loco: per-render overrides merged into spec.locomotion (the portrait walk-in-place: no pelvis twist)
      if (loco && spec.locomotion) spec = { ...spec, locomotion: { ...spec.locomotion, ...(typeof loco === 'function' ? loco(spec) : loco) } };
      const L = { ...loaded, spec };
      const c = k % cols, r = Math.floor(k / cols);
      const dx = (c - cols / 2) * cw + cw / 2, dy = (r - rows / 2) * ch + ch - Math.round(ch * 0.12);
      const pos = screenToGround(engine, dx, dy);
      // variant → clip + ghost level
      const clips = spec.clips || {};
      let clip = 'idle', ghost = null, ghostMode = null;
      if (variant === 'walk') clip = 'walk';                 // the gait plan walks even without an authored clips.walk
      else if (variant === 'ghost' || variant === 'ghost-spent') {
        if (clips[variant]) { clip = variant; ghostMode = 'clip'; }
        else if (variant === 'ghost-spent' && clips.ghost && spec.ghost) { clip = 'ghost'; ghost = 2; ghostMode = 'clip+level'; }
        else if (spec.ghost) { clip = clips.ghost ? 'ghost' : 'idle'; ghost = variant === 'ghost' ? 1 : 2; ghostMode = 'level'; }
        else { clip = clips.ghost ? 'ghost' : 'idle'; ghostMode = clips.ghost ? 'clip' : '2d'; }
      } else if (variant === 'dead') clip = clips.die ? 'die' : 'idle';
      const speed = spec.game?.speed ?? spec.gameSpeed?.v ?? 3.95 * (spec.height || 1.3);
      // walk: really travel toward the viewer at game speed (LegGait plans do not step on a pinned treadmill root) and
      // arrive in the cell mid-window; every sample is cropped around the root's projection (the camera "follows")
      const walking = clip === 'walk';
      const tMid = at + (walkSamples / 2) * GRID;
      if (walking) pos.z -= speed * tMid;
      const a = createActor(engine, L, {
        clip, face: 0, pos, move: walking, pin: false, at: variant === 'dead' ? 0.25 : 0, clock, ground,
        ...(clip === 'walk' ? { speed } : {}),
      });
      if (ghost !== null && a.ch) a.ch.ghost = ghost;
      // loop clips: createActor's play() is stamped with the ENGINE time (later than this batch's clock): replay at 0
      if (a.ch && clip !== 'idle' && clip !== 'walk' && variant !== 'dead') a.ch.play(clip, { restart: true, at: 0 });
      actors.push({ id, a, dx, dy, ghostMode, clip });
    }
    // sample times (clip time, s)
    const times = variant === 'walk' ? Array.from({ length: walkSamples }, (_, i) => at + i * GRID)
      : variant === 'dead' ? [3.0] : [at];
    const shots = [];
    const tEnd = times[times.length - 1];
    for (let f = 0; f * GRID <= tEnd + 1e-6; f++) {
      const tc = f * GRID;
      engine.renderAt(T0 + tc);
      const want = times.find((x) => Math.abs(x - tc) < GRID / 2);
      if (want !== undefined) shots.push({ img: grab(engine), ids: actors.map((x) => x.a.poseId), mixed: grab.mixed,
        roots: actors.map((x) => projector(engine)(x.a.root.getWorldPosition(new THREE.Vector3()).setY(0))) });   // ground point under the root (bob stays visible)
    }
    st.t = T0 + tEnd + 1;
    const proj = projector(engine);
    for (let k = 0; k < actors.length; k++) {
      const { id, a, dx, dy, ghostMode, clip } = actors[k];
      const fx = engine.lowW / 2 + dx, fy = engine.lowH / 2 + dy;      // feet anchor (pixel-edge coords)
      const cr = crop || { w: cw, h: ch, fx: cw / 2, fy: ch - Math.round(ch * 0.12) };
      const x0 = Math.round(fx - cr.fx), y0 = Math.round(fy - cr.fy);
      // eyes (face centre) from the eye bones, else the head bone + 60 % of the head height
      const B = a.bones || {};
      const wp = (b) => { const v = new THREE.Vector3(); b.updateWorldMatrix(true, false); return b.getWorldPosition(v); };
      let eyes = null;
      if (B.eyeL && B.eyeR) { const p = wp(B.eyeL).add(wp(B.eyeR)).multiplyScalar(0.5); const q = proj(p); eyes = { x: q[0] - x0, y: q[1] - y0 }; }
      else if (B.head) { const q = proj(wp(B.head)); eyes = { x: q[0] - x0, y: q[1] - y0 - 4 }; }
      const hq = B.head ? proj(wp(B.head)) : null;
      const headPt = hq ? { x: hq[0] - x0, y: hq[1] - y0 } : null;
      let frames = shots.map((s) => (s.roots && actors[k].clip === 'walk'
        ? s.img.crop(Math.round(s.roots[k][0] - cr.fx), Math.round(s.roots[k][1] - cr.fy), cr.w, cr.h) : s.img.crop(x0, y0, cr.w, cr.h)));
      const poseIds = shots.map((s) => s.ids[k]);
      if (variant === 'walk' && !raw) {
        // the 4 drawings of one cycle in play order: the first 4 distinct pose ids after the first pose change
        // (pose ids are not emitted by every gait plan: compare the drawings themselves)
        // a new drawing = a real pose change (> 24 px differ), not a 1-px rounding shimmer of a held one
        const diff = (A, B) => { let n = 0; for (let i = 0; i < A.data.length; i += 4) if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2] || A.data[i + 3] !== B.data[i + 3]) n++; return n; };
        const NEW = 24;
        const picks = [];
        let start = frames.findIndex((im, i) => i > 0 && diff(im, frames[i - 1]) > NEW);
        if (start < 0) start = 0;
        for (let i = start; i < frames.length && picks.length < 4; i++)
          if (!picks.length || diff(frames[i], frames[picks[picks.length - 1]]) > NEW) picks.push(i);
        while (picks.length < 4) picks.push(picks[picks.length - 1] ?? 0);
        frames = picks.map((i) => frames[i]);
      }
      out[id] = { frames, sig: variant === 'walk' ? undefined : null, feet: { x: cr.fx, y: cr.fy }, eyes, headPt, poseIds, ghostMode, clip, mixed: shots.map((s) => s.mixed), height: a.spec.height };
      if (a.root) a.root.visible = false;               // done: hide (its updater keeps running, harmless)
      a.smears?.dispose?.(); a.fx?.dispose?.();
    }
  }
  return out;
}

/** Stats for the bake log: which ids used which ghost path, block uniformity. */
export function summary(res) {
  return Object.fromEntries(Object.entries(res).map(([id, r]) => [id, { clip: r.clip, ghost: r.ghostMode, mixed: Math.max(...r.mixed), poses: [...new Set(r.poseIds)].length }]));
}
