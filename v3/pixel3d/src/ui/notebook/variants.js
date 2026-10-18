// The four variant combinations side by side (owner: notebook group; used by scenes/ui-notebook.js and
// scenes/ui-markers.js ?state=variants; docs/UI.md §6 variants). Eight cast members on the ring = four pairs; in each
// pair one points at the other, who reads the notebook:
//   pair 1 (Ada -> Bram)   Notebook: held  ·  Pointer: new        (the defaults)
//   pair 2 (Cleo -> Dov)   Notebook: held  ·  Pointer: v2 size
//   pair 3 (Finn -> Esme)  Notebook: big   ·  Pointer: new        (Esme is a ghost: the dim ghost big book)
//   pair 4 (Gus -> Hob)    Notebook: big   ·  Pointer: v2 size
// Loop VARIANT_LOOP s: readers open at 0.3 s, write 2.6-3.4 s, close at 4.6 s; the finger points 0.9-4.4 s.
// A caption under each pair names its combination (tiny caps, anchored under the reader).
import { drawText, textWidth } from '../kit.js';
import { notebookContext } from './draw.js';

export const VARIANT_CAST = [
  { id: 'frog', name: 'Ada', seat: 1, clip: 'idle', role: 'Empath' },
  { id: 'owl', name: 'Bram', seat: 2, clip: 'idle', role: 'Chef' },
  { id: 'fox', name: 'Cleo', seat: 3, clip: 'idle', role: 'Monk' },
  { id: 'mushroom', name: 'Dov', seat: 4, clip: 'idle', role: 'Undertaker', you: true },
  { id: 'rabbit', name: 'Esme', seat: 5, clip: 'idle', role: 'Imp', ghost: true },
  { id: 'goat', name: 'Finn', seat: 6, clip: 'idle', role: 'Poisoner' },
  { id: 'crow', name: 'Gus', seat: 7, clip: 'idle', role: 'Butler' },
  { id: 'toad', name: 'Hob', seat: 8, clip: 'idle', role: 'Saint' },
];
export const VARIANT_PAIRS = [
  { from: 1, to: 2, bookStyle: 'held', pointerScale: 'new' },
  { from: 3, to: 4, bookStyle: 'held', pointerScale: 'v2' },
  { from: 6, to: 5, bookStyle: 'big', pointerScale: 'new' },
  { from: 7, to: 8, bookStyle: 'big', pointerScale: 'v2' },
];
export const VARIANT_LOOP = 5.5;

/** Install the variants moment on a hud built with { cast: VARIANT_CAST } (needs the markers context). */
export async function installVariants(hud, { still = false } = {}) {
  const { markersContext } = await import('../markers/stage.js');
  const { drawPoint } = await import('../markers/draw.js');
  const N = notebookContext(hud), M = await markersContext(hud);
  const base = (t) => t - (((t % VARIANT_LOOP) + VARIANT_LOOP) % VARIANT_LOOP);
  N.add((Q) => VARIANT_PAIRS.forEach((p, i) => {
    const m = hud.bySeat(p.to), b = base(Q.t), u = Q.t - b;
    N.drawReader(Q, m, { openAt: b + 0.3, closeAt: b + 4.6, typing: u > 2.6 && u < 3.4, seed: i * 2, still, bookStyle: p.bookStyle });
  }));
  M.register((L) => VARIANT_PAIRS.forEach((p) => {
    const a = hud.bySeat(p.from), r = hud.bySeat(p.to);
    if (!a || !r) return;
    const F = M.framesFor(L, p.pointerScale), u = L.t - base(L.t);
    drawPoint(L, F, { head: M.head(L, a), aim: M.aim(L, r), spot: M.feet(L, r), person: true, age: u - 0.9, still });
  }));
  // captions: anchored 9 px under the reader's feet (below a big book's ribbon), tiny caps in the label colours
  hud.ui.add((L) => VARIANT_PAIRS.forEach((p) => {
    const r = hud.bySeat(p.to);
    if (!r) return;
    const q = L.at(r.pos), T = L.tok;
    const s1 = `BOOK ${p.bookStyle.toUpperCase()}`, s2 = `POINTER ${p.pointerScale === 'v2' ? 'V2 SIZE' : 'NEW'}`;
    drawText(L.world, q.x - (textWidth(s1, 'tiny') >> 1), q.y + 9, s1, { font: 'tiny', color: T.gold, outline: T.labelLine });
    drawText(L.world, q.x - (textWidth(s2, 'tiny') >> 1), q.y + 16, s2, { font: 'tiny', color: T.labelText, outline: T.labelLine });
  }), 21);
  return { N, M };
}
