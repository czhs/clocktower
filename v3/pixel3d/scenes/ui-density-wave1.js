// UI DENSITY wave 1 comparison (markers + indicators + portraits at D=2; docs/UI.md §2.10, docs/UI_GALLERY.md). The
// mock town square with the same moment drawn twice: today's 1x art on the LEFT half, the wave-1 D=2 art on the RIGHT
// half (L.hd tiers), over the same frame:
//   world  Ada (you): the "you" ring + chevron, her name, the talk glyph, pointing at Cleo (finger + marching trail +
//          the ping at Cleo's feet); Cleo: her name, a speech bubble, two person pins (fanned, the first hovered: remove
//          badge); a place pin with your portrait (hovered), one landing (sparkle), the place-point chevron
//   screen off-screen discs (avatar / icon / initial, pointers in 3 directions), a row of roster avatars + icons
//          (ghost / dead variants), your dock button (gold frame), the talk glyph kinds
//   index.html?scene=ui-density-wave1[&tod=noon|night][&uipolicy=round|floor][&pointer=new|v2][&age=<point age s>]
//   tools/shot.sh ui-density-wave1 shots/ui-hd-wave1/cmp-1280x720.png --size 1280x720 --t 1
import * as THREE from 'three';
import { buildHudStage } from './ui-hud.js';
import { drawBox, drawText, textWidth, frameAt } from '../src/ui/kit.js';
import * as IA from '../src/ui/indicators/art.js';
import * as IH from '../src/ui/indicators/hd.js';
import { markerFrames } from '../src/ui/markers/art.js';
import { markerFramesV2size } from '../src/ui/markers/v2size.js';
import { drawPoint, drawPersonPins, drawPlacePin } from '../src/ui/markers/draw.js';
import { markerFramesHD, drawPointHD, putGroundHD } from '../src/ui/markers/hd.js';
import { loadPortraits, goldFrame } from '../src/ui/portraits/atlas.js';
import { drawPlacePinHD, drawPersonPinsHD, labelHD, fastBlit } from '../src/ui/hd/draw.js';

const CAST = [
  { id: 'frog', name: 'Ada', seat: 1, clip: 'idle', role: 'Empath' },
  { id: 'fox', name: 'Cleo', seat: 2, clip: 'idle', role: 'Monk' },
  { id: 'frog', name: 'Ada', seat: 3, clip: 'idle', role: 'Empath' },
  { id: 'fox', name: 'Cleo', seat: 4, clip: 'idle', role: 'Monk' },
];
const LINE = 'Ada was at the mill at 2:10 — I saw her lamp.';
const ROW = ['mushroom', 'owl', 'mole', 'rabbit', 'goat', 'wanderer'];

export default async function build(engine, params) {
  if (!params.has('uidensity')) params.set('uidensity', '2');
  const hud = await buildHudStage(engine, params, { cast: CAST, storyteller: null, ring: 2.2 });
  const L = hud.ui, H = L.hd;
  if (!H) throw new Error('ui-density-wave1: no L.hd');
  H.useDepth();
  const variant = params.get('pointer') === 'v2' ? 'v2' : 'new';
  const pointAge = Number(params.get('age') ?? 1.2);
  // subjects: left pair (1x) and right pair (D=2), same depth, facing the camera
  const spots = [[-4.6, 2.2], [-1.7, 1.2], [1.7, 2.2], [4.6, 1.2]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  hud.cast.forEach((m, i) => {
    const p = spots[i].clone(); p.y = hud.terrain.heightAt(p.x, p.z);
    m.pos.copy(p); if (m.actor) { m.actor.st.base.copy(p); m.actor.st.face = 0; }
  });
  const g = (x, z) => new THREE.Vector3(x, hud.terrain.heightAt(x, z), z);
  const placeSpots = [[g(-6.4, 3.9), g(-3.4, 4.6)], [g(-0.1, 3.9), g(2.9, 4.6)]];   // [hovered pin, landing pin] per half
  const P = await loadPortraits('out/ui/', hud.tod === 'night' ? 'night' : 'noon', { hd: true }).catch(() => null);
  const youId = 'mushroom';
  const icon = P?.icon(youId) ?? null, avatar = P?.avatar(youId) ?? null;
  engine.stats.ui.wave1 = { scale: H.scale, k: H.k, d: H.d, policy: H.policy, hdAtlas: !!P?.hd, variant };

  const tag = (img, x, y, s, T) => { const w = textWidth(s, 'tiny') + 6; drawBox(img, x, y, w, 9, 'chipGold', T); drawText(img, x + 3, y + 2, s, { font: 'tiny', color: T.goldHi }); };
  const head = (m) => m.pos.clone().setY(m.pos.y + m.height * 0.72);
  const aimP = (m) => m.pos.clone().setY(m.pos.y + m.height * 0.4);

  // ---------------------------------------------------------------- world: 1x (left pair)
  const world1x = (LL) => {
    const T = LL.tok, t = LL.t, F = variant === 'v2' ? markerFramesV2size(T) : markerFrames(T);
    const [ada, cleo] = hud.cast;
    // you ring (ground) + label + talk glyph + chevron
    const f = LL.at(ada.pos);
    LL.ground.blit(IA.youRing(frameAt(t, 2.5, 4), T), f.x - 16, f.y - 8);
    const pa = LL.at(ada.head()), ta = pa.y + IA.LABEL_DY;
    const box = IA.label(LL.world, pa.x, ta, ada.name, 'player', T);
    LL.world.blit(IA.talkGlyph(IA.talkStep(t), 'self', T), box.x + box.w + 1, ta - 1);
    LL.world.blit(IA.youChevron(T), pa.x - 4, ta - 8 - frameAt(t, 2, 2));
    // Cleo: label, bubble, person pins
    const pc = LL.at(cleo.head()), tc = pc.y + IA.LABEL_DY;
    IA.label(LL.world, pc.x, tc, cleo.name, 'player', T);
    const lines = IA.bubbleLines(LINE), sz = IA.bubbleSize(lines), left = pc.x - Math.floor(sz.w / 2);
    const bTop = tc - 2 - sz.h - IA.BUBBLE_TAIL_H;
    LL.world.blit(IA.bubble(lines, pc.x - left, T), left, bTop);
    drawPersonPins(LL, F, { cx: pc.x, labelTop: bTop, t, still: true, hover: 0, pins: [
      { color: 'teal', icon, iconKey: 'you', age: 9 }, { color: 'crimson', icon, iconKey: 'you', age: 9 }] });
    // place pins: hovered + landing (age 0.44 s = the sparkle's 2nd drawing: twinkles fanning out)
    const s0 = LL.at(placeSpots[0][0]), s1 = LL.at(placeSpots[0][1]);
    drawPlacePin(LL, F, { spot: s0, color: 'gold', icon, iconKey: 'you', age: 9, hover: true, still: true });
    drawPlacePin(LL, F, { spot: s1, color: 'violet', icon, iconKey: 'you', age: 0.44 });
    // the point emote: Ada points at Cleo
    drawPoint(LL, F, { head: LL.at(head(ada)), aim: LL.at(aimP(cleo)), spot: LL.at(cleo.pos), person: true, age: pointAge });
  };
  // ---------------------------------------------------------------- world: D=2 (right pair)
  const worldHD = (LL) => {
    const T = LL.tok, t = LL.t, d = H.d, k = H.k, FH = markerFramesHD(T, variant);
    const [, , ada, cleo] = hud.cast;
    const f = H.at(ada.pos);
    putGroundHD(H, IH.youRingHD(frameAt(t, 2.5, 4), T), f.x - 32, f.y - 16, ada.pos, { anchorRow: 16 });
    const la = labelHD(LL, ada.head(), ada.name, 'player', T);
    fastBlit(H.world, IH.talkGlyphHD(IA.talkStep(t), 'self', T), la.x + la.w + d, la.y);
    const qa = H.at(ada.head());
    fastBlit(H.world, IH.youChevronHD(T), qa.x - 4 * d, la.top - 8 * d - frameAt(t, 2, 2) * d);
    const lc = labelHD(LL, cleo.head(), cleo.name, 'player', T), qc = H.at(cleo.head());
    // the bubble in logical px (as the 1x layout), drawn INTO the world view (bubbleInto -> the HD bubble)
    const lines = IA.bubbleLines(LINE), sz = IA.bubbleSize(lines), cx = Math.floor(qc.x / d), left = cx - Math.floor(sz.w / 2);
    const bTop = Math.floor(lc.top / d) - 2 - sz.h - IA.BUBBLE_TAIL_H;
    IH.bubbleInto(H.worldView, left, bTop, lines, cx - left, T);
    drawPersonPinsHD(LL, { cx: qc.x, labelTopHD: bTop * d, t, still: true, hover: 0, pins: [
      { color: 'teal', icon, iconKey: 'you', age: 9 }, { color: 'crimson', icon, iconKey: 'you', age: 9 }] });
    drawPlacePinHD(LL, { p: placeSpots[1][0], color: 'gold', icon, iconKey: 'you', age: 9, hover: true, still: true });
    drawPlacePinHD(LL, { p: placeSpots[1][1], color: 'violet', icon, iconKey: 'you', age: 0.44 });
    for (const ph of ['trail', 'main']) drawPointHD(Object.assign(Object.create(LL), { phase: ph }), FH,
      { head: H.at(head(ada)), aim: H.at(aimP(cleo)), spot: H.at(cleo.pos), spotP: cleo.pos, person: true, age: pointAge });
    void k;
  };
  // ---------------------------------------------------------------- screen: discs, portraits, glyph kinds
  const screenHalf = (img, x0, x1, T, hd) => {
    tag(img, x0 + 6, 4, hd ? 'NEW · DENSITY 2 · WAVE 1' : 'TODAY · 1X', T);
    const bottom = img.h - 6;
    // portraits row: avatar (alive) + icons alive / ghost / dead
    let x = x0 + 6;
    const y = bottom - 24 - 16;
    for (const id of ROW) {
      const av = P?.avatar(id);   // (carries .hd: a view blits the 48x48 HD avatar)
      if (av) img.blit(av, x, y);
      else if (hd && P?.avatarHD(id)) img.base.blit(P.avatarHD(id), x * 2 + img.ox, y * 2 + img.oy);   // HD-only roster ids
      const ic = P?.icon(id) ?? null;
      if (ic) img.blit(ic, x + 6, y + 26);
      x += 27;
    }
    for (const v of ['ghost', 'dead']) { const ic = P?.icon('owl', v); if (ic) img.blit(ic, x, y + 26); const av = P?.avatar('owl', v); if (av) img.blit(av, x, y); x += 27; }
    // your dock button (gold frame)
    if (avatar) img.blit(goldFrame(avatar, T), x1 - 30, bottom - 24);
    // off-screen discs: avatar (pointing right), icon (down-right), initial (up)
    const discs = hd
      ? [IH.edgeDiscPointerHD(IH.edgeDiscHD(P?.avatarHD('owl') ?? null, T, 'Gus'), 0, T), IH.edgeDiscPointerHD(IH.edgeDiscHD(P?.iconHD('rabbit') ?? null, T, 'Bo'), 1, T), IH.edgeDiscPointerHD(IH.edgeDiscHD(null, T, 'Finn'), 6, T)]
      : [IA.edgeDiscPointer(IA.edgeDisc(P?.avatar('owl') ?? null, T, 'Gus'), 0, T), IA.edgeDiscPointer(IA.edgeDisc(P?.icon('rabbit') ?? null, T, 'Bo'), 1, T), IA.edgeDiscPointer(IA.edgeDisc(null, T, 'Finn'), 6, T)];
    let dx = x0 + 6;
    const dy = 20;
    for (const dp of discs) {
      if (hd) img.base.blit(dp.img, dx * 2 + img.ox, dy * 2 + img.oy); else img.blit(dp.img, dx, dy);
      dx += (hd ? dp.img.w / 2 : dp.img.w) + 4;
    }
    // the talk glyph kinds
    let gx = dx + 6;
    for (const kind of ['talk', 'self', 'selfIdle', 'muted']) {
      if (hd) img.base.blit(IH.talkGlyphHD(1, kind, T), gx * 2 + img.ox, (dy + 6) * 2 + img.oy); else img.blit(IA.talkGlyph(1, kind, T), gx, dy + 6);
      gx += 11;
    }
  };

  L.add((LL) => {
    const T = LL.tok;
    world1x(LL);
    worldHD(LL);
    const W1 = LL.screen.w, hv = H.screenView, Wh = hv.w;
    screenHalf(LL.screen, 0, Math.floor(W1 / 2), T, false);
    screenHalf(hv, Math.floor(Wh / 2), Wh, T, true);
    for (let y = 0; y < LL.screen.h; y += 2) LL.screen.set(Math.floor(W1 / 2), y, T.iron);
  }, 50);
}
