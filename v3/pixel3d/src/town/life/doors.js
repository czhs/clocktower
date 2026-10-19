// life doors (owner: life agent): the door choreography. Every door anchor ({id, pivot, open(f)}) is driven from a
// list of open/close events (the walkers' visits) through a stepped curve with ANTICIPATION and OVERSHOOT:
//   open:  the latch rattles (two small jolts), a beat, then the leaf swings in 3 drawings, overshoots the stop ~10 deg,
//          bounces back once and settles (8 fps, held drawings, no in-betweens)
//   close: a short pull (the leaf opens a hair more), 2 drawings in, a slam a few degrees past the frame, settle
// open(f) owns f in [0, 1]; values outside are applied by extrapolating the pivot's own rotation (the hinge axis is
// whatever the house owner built: we measure the pivot's rotation at f = 0 and f = 1 and continue that line).
import { held, step } from './util.js';

const FPS = 8;
// Doors swing OUTWARD (f < 0, extrapolated past the owner's open(f) range): an inward leaf passes behind the
// doorway's dark interior plate (0.22 m behind the hinge) after ~13 deg and vanishes; outward, its planks face the
// camera at ~65-75 deg and the side doors on the edge-on east / west walls show their leaf too.
// [frame (1/8 s), f]: latch rattle (two small inward jolts), a beat, 3 swing drawings, overshoot, bounce, settle
const OPEN_F = -0.74;
const OPEN = [[0, 0], [1, 0.035], [2, 0], [3, 0.05], [4, 0.0], [5, -0.22], [6, -0.52], [7, -0.86], [8, -0.68], [9, -0.78], [10, OPEN_F]];
const CLOSE = [[0, OPEN_F], [1, -0.8], [2, -0.48], [3, -0.14], [4, 0.045], [5, -0.02], [6, 0.0]];
export const DOOR_CURVES = { OPEN, CLOSE, FPS };

/** f of a door at time t from its sorted events [{t, kind}] (pure). */
export function doorF(events, t) {
  let e = null;
  for (const q of events) { if (q.t <= t) e = q; else break; }
  if (!e) return 0;
  const k = Math.floor(step(t - e.t, FPS) * FPS + 1e-6);
  return held(e.kind === 'open' ? OPEN : CLOSE, k);
}

/**
 * Wrap a door anchor so f outside [0, 1] extrapolates the hinge rotation (anticipation / overshoot / outward swing).
 * Every object of the owner's group whose rotation changes between open(0) and open(1) is extrapolated (double doors:
 * the clocktower's two leaves), not only the anchor's pivot.
 */
export function makeDoorDriver(anchor, pieceGroup = null) {
  const moved = [];
  if (typeof anchor.open === 'function') {
    const objs = [];
    (pieceGroup ?? anchor.pivot)?.traverse?.((o) => objs.push(o));
    if (anchor.pivot && !objs.includes(anchor.pivot)) objs.push(anchor.pivot);
    anchor.open(0); const r0 = objs.map((o) => o.rotation.clone());
    anchor.open(1); const r1 = objs.map((o) => o.rotation.clone());
    anchor.open(0);
    objs.forEach((o, i) => {
      for (const k of ['x', 'y', 'z']) if (Math.abs(r1[i][k] - r0[i][k]) > 1e-3) moved.push({ o, k, a: r0[i][k], b: r1[i][k] });
    });
  }
  let last = null;
  return {
    id: anchor.id, piece: anchor.piece, anchor, moved: moved.length,
    set(f) {
      if (f === last) return;
      last = f;
      anchor.open(Math.max(0, Math.min(1, f)));
      if (f < 0 || f > 1) for (const m of moved) m.o.rotation[m.k] = m.a + (m.b - m.a) * f;
    },
  };
}
