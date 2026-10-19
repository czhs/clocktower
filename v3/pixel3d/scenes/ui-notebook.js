// Notebook group scene (owner: notebook group; docs/UI.md §3.3, rows 41b/41c). The mock town square at the game camera
// with the in-world "reading the notebook" book and the Notes page of the notebook panel, day or night.
//
//   index.html?scene=ui-notebook[&state=live|dirs|cycle|point|pages|close|variants|handbook][&book=held|big|bigsprite|held3d][&pointer=new|v2][&tod=noon|golden|night][&nbpage=notes][&still=1][&t=<s>]
//   tools/shot.sh ui-notebook shots/ui-notebook/r1/dirs-noon.png --size 1280x720 --t 1 --q "state=dirs"
//
// States
//   live   the mock HUD with every group + the notebook slot (src/ui/notebook/hud.js): Dov (you) reads while his panel is
//          open (?nbpage=notes: the Notes page, typing -> quill), Finn opens / reads / closes on a 6.5 s loop
//   dirs   8 readers on a ring facing the centre = all 8 facings at once, holding their open books (Esme the ghost reads
//          the dim ghost book, Dov and Gus write with the quill); labels from the indicators group
//   cycle  the same ring, every reader opening, reading (page flutter), closing, staggered, on a 4 s loop -> 1x GIFs
//   point  Ada points at Bram while he reads (Cleo reads too): finger + trail + labels stay above the book
//   close  three readers close together (game camera), staggered open / hold / write / close on a 4 s loop -> GIF crops
//   variants  the four option combinations side by side (src/ui/notebook/variants.js): Notebook held / big x Pointer
//          new / v2 size, one pair each (one points at the other, who reads), captioned; 5.5 s loop
//   handbook  the dirs ring with the 3D big book (book=big by default here) AND each reader pointing along its own facing
//          (pointer v2 by default): the book next to the pointing hand at all 8 facings (the user's reference: "like the hand")
//   (any world state + ?book=big draws the 3D big book instead of the held one, ?book=bigsprite its baked port sprites:
//    hud.uiOptions.bookStyle, scenes/ui-hud.js)
//   pages  the notebook panel 8 times over the town: Seats page, Notes typing, empty (hint), selection, scrolled,
//          saving, offline, 85 % full
import { buildHudStage, GROUPS } from './ui-hud.js';
import { PLACEHOLDERS } from '../src/ui/placeholders.js';
import notebookSlot, { drawLive } from '../src/ui/notebook/hud.js';
import { notebookContext } from '../src/ui/notebook/draw.js';
import { notesScript, NOTES_BASE } from '../src/ui/notebook/page.js';
import { panelKit } from '../src/ui/panels/art.js';
import * as SC from '../src/ui/panels/screens.js';
import { installVariants, VARIANT_CAST } from '../src/ui/notebook/variants.js';

const RING8 = [
  { id: 'frog', name: 'Ada', seat: 1, clip: 'idle', role: 'Empath' },
  { id: 'owl', name: 'Bram', seat: 2, clip: 'idle', role: 'Chef' },
  { id: 'fox', name: 'Cleo', seat: 3, clip: 'idle', role: 'Monk' },
  { id: 'mushroom', name: 'Dov', seat: 4, clip: 'idle', role: 'Undertaker', you: true },
  { id: 'rabbit', name: 'Esme', seat: 5, clip: 'idle', role: 'Imp', ghost: true },
  { id: 'goat', name: 'Finn', seat: 6, clip: 'idle', role: 'Poisoner' },
  { id: 'crow', name: 'Gus', seat: 7, clip: 'idle', role: 'Butler' },
  { id: 'toad', name: 'Hob', seat: 8, clip: 'idle', role: 'Saint' },
];
const CYCLE = 4;

async function loadGroup(hud, g) {
  let mod = null;
  try { mod = await import(`../src/ui/${g}/hud.js`); } catch (e) { if (!/fetch|import|Failed|404|not found/i.test(String(e.message))) throw e; }
  if (mod?.default?.draw) { await mod.default.setup?.(hud); hud.ui.add((L) => mod.default.draw(hud, L), mod.default.z ?? 10); return mod.default; }
  PLACEHOLDERS[g]?.(hud);
  return null;
}

export default async function build(engine, params) {
  const state = params.get('state') ?? 'live';
  if (state === 'handbook') { if (!params.has('book')) params.set('book', 'big'); if (!params.has('pointer')) params.set('pointer', 'v2'); }
  const opts = state === 'variants' ? { cast: VARIANT_CAST } : ['dirs', 'cycle', 'handbook'].includes(state) ? { cast: RING8 } : state === 'close' ? { cast: RING8.slice(0, 3), storyteller: null, ring: 1.6 } : {};
  if (state === 'point') opts.cast = [
    { id: 'frog', name: 'Ada', seat: 1, clip: 'point', role: 'Empath' }, { id: 'owl', name: 'Bram', seat: 2, clip: 'idle', role: 'Chef' },
    { id: 'fox', name: 'Cleo', seat: 3, clip: 'talk', role: 'Monk' }, { id: 'mushroom', name: 'Dov', seat: 4, clip: 'idle', role: 'Undertaker', you: true },
    { id: 'rabbit', name: 'Esme', seat: 5, clip: 'idle', role: 'Imp', ghost: true }, { id: 'goat', name: 'Finn', seat: 6, clip: 'idle', role: 'Poisoner' },
    { id: 'crow', name: 'Gus', seat: 7, clip: 'idle', role: 'Butler' }];
  const hud = await buildHudStage(engine, params, opts);
  const P = hud.P, still = P('still', '0') === '1';
  engine.stats.notebook = { state };

  if (state === 'live') {
    for (const g of GROUPS) if (g !== 'notebook') await loadGroup(hud, g);
    await notebookSlot.setup(hud);
    hud.ui.add((L) => notebookSlot.draw(hud, L), notebookSlot.z);
    return;
  }
  if (state === 'pages') {
    hud.ui.add((L) => {
      const K = panelKit(L.tok), t = L.t, ctx = { P: null, cast: hud.cast, st: hud.st, t, reduced: still };
      const long = `${NOTES_BASE} Gus voted no on Esme.\n\nN2: Dov died? No — Esme died. Undertaker says Imp?? Check the vote counts again tomorrow before nominating.`;
      const V = [
        { page: 'players' },
        { page: 'notes', notes: { ...notesScript(t), t } },
        { page: 'notes', notes: { text: '', t } },
        { page: 'notes', notes: { text: NOTES_BASE, sel: [27, 43], t } },
        { page: 'notes', notes: { text: long, scroll: 40, t, focus: false } },
        { page: 'notes', notes: { text: NOTES_BASE + ' Gus', status: 'saving', typing: true, t } },
        { page: 'notes', notes: { text: NOTES_BASE, status: 'offline', t, focus: false } },
        { page: 'notes', notes: { text: NOTES_BASE, max: 120, t, focus: false } },
      ];
      V.forEach((v, i) => SC.notebook(L.screen, K, { x: 4 + (i % 4) * 158, y: 4 + Math.floor(i / 4) * 178, w: 132, h: 158 }, ctx, v));
    }, 70);
    return;
  }
  // world states: names from the indicators group (or the placeholder); no chat bubbles (they would sit over readers)
  hud.indicatorsConfig = { bubbles: [] };
  await loadGroup(hud, 'indicators');
  if (state === 'variants') { await installVariants(hud, { still }); return; }
  const N = notebookContext(hud);
  const members = hud.cast;
  if (state === 'bigsprite' || hud.uiOptions.bookStyle === 'bigsprite') await (await import('../src/ui/notebook/port3d.js')).preloadPortBook(hud.tod);
  if (state === 'dirs') {
    N.add((Q) => members.forEach((m, i) => N.drawReader(Q, m, { openAt: -10, typing: m.id === 'mushroom' || m.id === 'crow', seed: i, still })));
  } else if (state === 'handbook') {
    const { markersContext } = await import('../src/ui/markers/stage.js');
    const { drawPoint } = await import('../src/ui/markers/draw.js');
    const THREE = await import('three');
    const M = await markersContext(hud);
    N.add((Q) => members.forEach((m, i) => N.drawReader(Q, m, { openAt: -10, seed: i, still })));
    // each reader points 2.5 m along its own facing (the finger loops 0..4 s; ?t= 1 shows it held)
    M.register((L) => members.forEach((m) => {
      const face = m.actor?.st?.face ?? 0, f = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
      const tgt = m.pos.clone().addScaledVector(f, 2.5);
      drawPoint(L, M.frames(L), { head: M.head(L, m), aim: L.at(tgt.clone().setY(m.pos.y + m.height * 0.72)), spot: L.at(tgt), person: true, age: ((L.t % 4) + 4) % 4 + 0.3, still });
    }));
  } else if (state === 'cycle') {
    // staggered: reader i opens at 0.15 + 0.2 i and closes 2.6 s later (mod CYCLE)
    N.add((Q) => members.forEach((m, i) => {
      const t = Q.t, base = t - (((t % CYCLE) + CYCLE) % CYCLE), o = 0.15 + 0.2 * i;
      N.drawReader(Q, m, { openAt: base + o, closeAt: base + o + 2.6, seed: i, still });
      N.drawReader(Q, m, { openAt: base + o - CYCLE, closeAt: base + o + 2.6 - CYCLE, seed: i, still });   // a close wrapping the loop end
    }));
  } else if (state === 'close') {
    N.add((Q) => members.forEach((m, i) => {
      const t = Q.t, base = t - (((t % CYCLE) + CYCLE) % CYCLE);
      N.drawReader(Q, m, { openAt: base + 0.2, closeAt: base + 3.0, typing: i === 1 && t - base > 1.6 && t - base < 2.6, seed: i, still });
    }));
  } else if (state === 'point') {
    const { markersContext } = await import('../src/ui/markers/stage.js');
    const { drawPoint } = await import('../src/ui/markers/draw.js');
    const M = await markersContext(hud);
    const ada = hud.bySeat(1), bram = hud.bySeat(2), cleo = hud.bySeat(3);
    // Ada points AT Bram, who is reading: finger + trail + ping vs the book; Cleo reads beside them
    N.add((Q) => { N.drawReader(Q, bram, { openAt: -10, seed: 1, still }); N.drawReader(Q, cleo, { openAt: -10, seed: 4, still }); });
    M.register((L) => drawPoint(L, M.frames(L), { head: M.head(L, ada), aim: M.aim(L, bram), spot: M.feet(L, bram), person: true, age: ((L.t % 4) + 4) % 4 - 0.2, still }));
  }
}
