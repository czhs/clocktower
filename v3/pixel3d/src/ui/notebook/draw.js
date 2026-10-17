// Notebook runtime (owner: notebook group): the "reading the notebook" book at a reader's hands, as OTHER players see
// it, re-timed on the 30 Hz grid. Pure function of the stage time (deterministic, freezable with ?t=).
//
//   const N = notebookContext(hud);                 // once per hud: frames + a depth-tested pass (order 302)
//   N.add((P) => N.drawReader(P, member, { openAt, closeAt, typing, seed }));   // inside the pass callback
//
// State machine (one per reader; the game only needs openAt / closeAt from the "notebook open" flag, plus `typing`):
//   open   book_<dir>_open_0..3 at 15 fps (2 grid frames each, 8 frames = 267 ms): pop, closed, half, open
//   hold   book_<dir>_hold_<HOLD_SEQ[k]> at 10 fps from the end of the open: open for 2.4 s, then a page corner lifts and
//          a page stands up (0.6 s), on a 3 s loop; `seed` offsets the loop so two readers never flutter in unison
//   write  book_<dir>_write_0..3 at 10 fps while typing (an input event in the last TIMING.WRITE_HOLD_MS)
//   close  book_<dir>_close_0..2 at 15 fps (6 grid frames = 200 ms): half, closed, pop; then nothing
//   A close that starts before the open reached its half drawing skips close_0. Reduced motion: no open/close
//   drawings (the book appears open and vanishes), no flutter, the quill stays still.
//   dir = the reader's facing relative to the camera (dirOf), so a reader who turns shows the matching view.
// Placement: the grip point = feet + up x (handY x height + ghost lift) + facing x fwd (PLACE). Depth: every book texel
// carries the grip point's view depth; the scene wins where it is nearer by more than PLACE.depthEps, so the reader's
// own body hides the book when they face away, and anyone standing in front hides it. Masked by L.world (labels,
// bubbles, the pointing finger, person pins stay on top). 2D fallback without the pass: drawReader(L, ...) on L.world.
import * as THREE from 'three';
import { GRID_HZ } from '../kit.js';
import { DIRS, ANCHOR, buildBookFrames } from './art.js';
import { createPinPass } from '../markers/pinPass.js';
import { drawBigBook, PLACE_BIG } from './bigbook.js';

export const BOOK_FPS = { open: 15, hold: 10, close: 15, write: 10 };
export const TIMING = {
  OPEN_FRAMES: 8,          // 4 drawings x 2 grid frames (267 ms; v2 drawer slide-in is 160 ms, the book lands just after)
  CLOSE_FRAMES: 6,         // 3 drawings x 2 grid frames (200 ms)
  HOLD_LOOP_S: 3.0,        // HOLD_SEQ length / 10 fps
  WRITE_HOLD_MS: 1500,     // 'write' while an input event happened in the last 1.5 s
  SAVE_DEBOUNCE_MS: 900,   // v2 notebook controller (Saving… -> Saved), used by the mock page
};
/** Hold drawing per 10 fps step: open 2.4 s, corner lifts, page stands (2 steps), corner, open. */
export const HOLD_SEQ = [...Array(24).fill(0), 1, 2, 2, 1, 0, 0];
export const PLACE = {
  handY: 0.42,             // grip height as a fraction of the visual height (chibi cast: hands at the belly line)
  // r6 (critic): readers facing the camera (down, down-left, down-right) hold it lower, so the top of the face stays
  // visible above the spread on the big-headed chibis
  handYFront: 0.36,
  fwd: 0.24,               // m in front of the body along the facing (a held book; beyond the belly of the widest cast)
  // facing away (up, up-left, up-right): the book is held off to the right side at the same height, so its spread shows
  // beside the body at the hip (r2 tried the shoulder at 0.6 H and 0.42 H: it sat on the mushroom cap / beside the rabbit's
  // head, shots/ui-notebook/r3/z-dirs-noon.png Dov, Esme)
  shoulderY: 0.32, shoulderFwd: 0.06, shoulderSide: 0.27,
  ghostLift: 0.2,          // ghosts hover ~0.2 m (cast ghost clips)
  depthEps: 0.12,          // m: scene texels nearer than the book by more than this hide it
  selfBias: 0.5,           // m: the book's depth is at most (reader centre - selfBias): its own reader never hides it
  // r6: ... and at most (top of the reader's head - headBias). At the lower front grip (handYFront) a wide head (the
  // mushroom cap) is nearer to the high camera than centre - selfBias and clipped the book top + the quill
  // (shots/ui-notebook/r6/z/dov8-noon.png before this rule)
  headBias: 0.1,
  // visual tops where spec.height is not the head (indicators learning: the Storyteller's 1.91 is the staff finial)
  visualH: { storyteller: 1.55 },
  handYOverride: { owl: 0.3 },     // the owl's face sits mid-body (r4: the book covered it, shots/ui-notebook/r4/z/pointzone.png)
};
export const AWAY = new Set(['up', 'up-left', 'up-right']);
export const FRONT = new Set(['down', 'down-left', 'down-right']);

const gf = (s) => Math.floor(s * GRID_HZ + 0.01);

/** The reader's facing (radians, Character convention: 0 = +z) relative to the camera yaw -> one of the 8 dir names. */
export function dirOf(face, yaw = 0) {
  const k = ((Math.round((face - yaw) / (Math.PI / 4)) % 8) + 8) % 8;
  return ['down', 'down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'][k];
}

/**
 * Which drawing a reader shows at time t. openAt / closeAt in stage seconds (closeAt = Infinity while open).
 * Returns { phase, f } or null (no book).
 */
export function bookState(t, { openAt, closeAt = Infinity, typing = false, seed = 0, still = false }) {
  if (openAt === undefined || openAt === null || t < openAt) return null;
  if (t >= closeAt) {
    if (still) return null;
    const c = gf(t - closeAt), reached = gf(closeAt - openAt);
    const k = (reached >= 4 ? 0 : 1) + (c >> 1);
    return k < 3 ? { phase: 'close', f: k } : null;
  }
  const g = gf(t - openAt);
  if (!still && g < TIMING.OPEN_FRAMES) return { phase: 'open', f: g >> 1 };
  if (typing) return { phase: 'write', f: still ? 0 : Math.floor((gf(t) + seed * 2) / 3) % 4 };
  if (still) return { phase: 'hold', f: 0 };
  const k = Math.floor((g - TIMING.OPEN_FRAMES) / 3) + seed * 7;
  return { phase: 'hold', f: HOLD_SEQ[((k % HOLD_SEQ.length) + HOLD_SEQ.length) % HOLD_SEQ.length] };
}
/** Frame name for a state. */
export const frameName = (dir, s, ghost = false) => `${ghost ? 'bookghost' : 'book'}_${dir}_${s.phase}_${s.f}`;

/**
 * The grip point (world) of a hud member: feet + up x (handY x visual height (+ ghost lift)) + facing x fwd; readers
 * facing away hold it off to their right side (feet + up x shoulderY x H + facing x shoulderFwd + right x shoulderSide).
 */
export function gripPoint(m, face, dir = 'down') {
  const H = PLACE.visualH[m.id] ?? m.height ?? 1.3, lift = m.ghost ? PLACE.ghostLift : 0;
  const f = new THREE.Vector3(Math.sin(face), 0, Math.cos(face)), right = new THREE.Vector3(-Math.cos(face), 0, Math.sin(face));
  if (AWAY.has(dir)) return m.pos.clone().add(new THREE.Vector3(0, H * PLACE.shoulderY + lift, 0)).addScaledVector(f, PLACE.shoulderFwd).addScaledVector(right, PLACE.shoulderSide);
  const hy = PLACE.handYOverride[m.id] ?? (FRONT.has(dir) ? PLACE.handYFront : PLACE.handY);
  return m.pos.clone().add(new THREE.Vector3(0, H * hy + lift, 0)).addScaledVector(f, PLACE.fwd);
}
export const faceOf = (m) => m.face ?? m.actor?.st?.face ?? 0;

/** Book frames per token set (built in-page from art.js; the baked atlas holds the same pixels). */
const _frames = new Map();
export function bookFrames(T) {
  if (!_frames.has(T)) _frames.set(T, new Map([...buildBookFrames(T), ...buildBookFrames(T, { ghost: true })]));
  return _frames.get(T);
}

/**
 * Notebook context for a hud: { pass (depth-tested P), add(fn), drawReader(P|L, m, opts), yaw }.
 * One per hud (cached as hud._notebookN).
 */
export function notebookContext(hud) {
  if (hud._notebookN) return hud._notebookN;
  const engine = hud.engine;
  const pass = engine?.pipeline ? createPinPass(engine, hud.ui, { order: 302, timeFn: hud.clock }) : null;
  if (pass?.pass?.material?.uniforms?.uEps) pass.pass.material.uniforms.uEps.value = PLACE.depthEps;
  if (pass?.pass) pass.pass.name = 'ui-notebook-books';
  const yaw = () => Math.atan2(-engine.camera.right.z, engine.camera.right.x);   // R = (cos yaw, 0, -sin yaw)
  const N = {
    pass,
    yaw,
    /** Register a draw callback: depth-tested (pass) when available, else on L.world at z (2D fallback). */
    // variants (additive): the same callback also runs on L.world at PLACE_BIG.z through a 'bigOnly' view, where
    // drawReader draws the readers whose style is 'big' (bigbook.js; tier A like the finger); the pass view draws the
    // 'held' readers. Without the pass (2D fallback) one L callback draws both styles.
    add(fn, z = 25) {
      if (!pass) return hud.ui.add(fn, z);
      pass.add(fn);
      hud.ui.add((L) => fn(Object.assign(Object.create(L), { bigOnly: true })), PLACE_BIG.z);
      return fn;
    },
    /** The style a reader is drawn in: opts.bookStyle, else the live option hud.uiOptions.bookStyle, else 'held'. */
    styleOf(opts = {}) { return (opts.bookStyle ?? hud.uiOptions?.bookStyle) === 'big' ? 'big' : 'held'; },
    /**
     * Draw one reader. P = the pass view (has blitD/depthOf) or L (2D: L.world). opts: { openAt, closeAt, typing, seed,
     * still, face (override), ghost (default m.ghost) }. Returns the drawn state (or null).
     */
    drawReader(P, m, opts = {}) {
      // opts.bookStyle 'held' (default: this function) | 'big' (bigbook.js drawBigBook, on the bigOnly / 2D view)
      if (N.styleOf(opts) === 'big') return P.blitD && !P.bigOnly ? null : drawBigBook(P, m, opts);
      if (P.bigOnly) return null;
      const s = bookState(P.t, opts);
      if (!s || !m) return null;
      const face = opts.face ?? faceOf(m), dir = dirOf(face, yaw()), F = bookFrames(P.tok);
      const g = gripPoint(m, face, dir), q = P.at(g), img = F.get(frameName(dir, s, opts.ghost ?? !!m.ghost));
      if (P.blitD) {
        // depth-correct against everyone else, never hidden by its own reader (the book is in the reader's hands)
        const c = m.pos.clone().setY(g.y), top = m.pos.clone().setY(m.pos.y + (PLACE.visualH[m.id] ?? m.height ?? 1.3) + (m.ghost ? PLACE.ghostLift : 0));
        const d = Math.min(P.depthOf(g), P.depthOf(c) - PLACE.selfBias, P.depthOf(top) - PLACE.headBias);
        P.blitD(img, q.x - ANCHOR.x, q.y - ANCHOR.y, d);
      }
      else P.world.blit(img, q.x - ANCHOR.x, q.y - ANCHOR.y);
      return { ...s, dir, x: q.x, y: q.y };
    },
  };
  hud._notebookN = N;
  return N;
}
export { DIRS };
