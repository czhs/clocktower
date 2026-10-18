// UI DENSITY perf probe (owner: UI lead; docs/UI.md "Density"): the demo's typical UI frame drawn the way the demo
// draws it (cached pieces + fastBlit through the LIVE layers, src/ui/runtime/layer.js with dirty-band uploads), once at
// 1x (mode=1x: L.screen / L.world, today) and once at D=2 (mode=hd: the same elements as HD pieces on L.hd.screen /
// L.hd.world + the depth-tested HD place pins). Measure with tools/shot.mjs --bench N (wall ms / frame incl. GPU sync).
//   tools/remote.sh node tools/shot.mjs ui-density-perf shots/ui-hd/perf/hd-1280.png --size 1280x720 --t 1 --q mode=hd --bench 240
// engine.stats.uiPerf = { mode, drawMs (UI callbacks, mean), uploads / uploadPx per frame (1x layers + HD tiers) }.
import * as THREE from 'three';
import { buildHudStage } from './ui-hud.js';
import { PixelImage, drawBox, drawText, hdPiece } from '../src/ui/kit.js';
import { createUILayers } from '../src/ui/runtime/layer.js';
import * as E from '../src/ui/emotes/art.js';
import * as HA from '../src/ui/hud/art.js';
import * as IA from '../src/ui/indicators/art.js';
import { markerFrames, ANCHORS } from '../src/ui/markers/art.js';
import { pinWithIcon } from '../src/ui/markers/draw.js';
import { loadPortraits, goldFrame } from '../src/ui/portraits/atlas.js';
import { prepareHD, toolButtonHD, drawClockChipHD } from '../src/ui/hd/art.js';
import { fastBlit, drawPlacePinHD, drawPersonPinsHD, labelHD, up2 } from '../src/ui/hd/draw.js';
import * as AB from '../src/demo/actionbar.js';

const CAST = [
  { id: 'fox', name: 'Cleo', seat: 1, clip: 'idle' }, { id: 'frog', name: 'Ada', seat: 2, clip: 'talk' },
  { id: 'owl', name: 'Bram', seat: 3, clip: 'idle' }, { id: 'mushroom', name: 'Dov', seat: 4, clip: 'idle', you: true },
];

export default async function build(engine, params) {
  const mode = params.get('mode') === 'hd' ? 'hd' : '1x';
  params.delete('uidensity');
  const hud = await buildHudStage(engine, params, { cast: CAST, storyteller: null, ring: 3.6 });
  hud.ui.enabled = false;                                         // the mock layer stays off: the live layer draws
  const L = createUILayers(engine, { tod: hud.tod, timeFn: hud.clock, density: mode === 'hd' || params.get('attach') === '1' ? 2 : 1 });
  if (mode === 'hd') L.hd.useDepth();
  const P = await loadPortraits('out/ui/').catch(() => null);
  const icon12 = P?.icon('mushroom') ?? null, avatar = P?.avatar('mushroom') ?? null;
  const pinSpots = [new THREE.Vector3(-1.5, 0, -1.2), new THREE.Vector3(1.8, 0, 1.4)].map((p) => p.setY(hud.terrain.heightAt(p.x, p.z)));
  const clockO = { stage: 'discussion', label: 'Noon', time: '12:30', frac: 0.62, paused: false, reduced: true };
  const cache = new Map();
  const piece = (k, fn) => { let v = cache.get(k); if (!v) { v = fn(); cache.set(k, v); } return v; };
  // 1x pieces (as gameui.js: drawn once into a PixelImage, blitted every frame) / HD pieces (hdPiece: the same drawers)
  const mk = (w, h, fn) => (mode === 'hd' ? hdPiece(w, h, fn) : (() => { const im = new PixelImage(w, h); fn(im); return im; })());
  const perf = { mode, frames: 0, drawMs: 0, uploads: 0, uploadPx: 0 };
  engine.stats.uiPerf = perf;
  const glyph1 = [(T) => AB.bulb(T, false), (T) => HA.GLYPH.notebook(T), (T) => HA.GLYPH.gear(T), (T) => HA.GLYPH.help(T)];
  const keysHD = ['tip', 'notebook', 'gear', 'help'];
  L.add((LL) => {
    const a = performance.now(), T = LL.tok, hd = mode === 'hd';
    if (hd) prepareHD(T);
    const S = hd ? LL.hd.screen : LL.screen, D = hd ? LL.hd.d : 1, W = Math.floor(S.w / D), H = Math.floor(S.h / D);
    const put = (im, x, y) => fastBlit(S, im, x * D, y * D);
    // clock chip + phase chip
    put(piece('chip', () => mk(140, 20, (v) => (hd ? drawClockChipHD(v, 2, 2, T, clockO) : HA.drawClockChip(v, 2, 2, T, clockO)))), 2, 2);
    put(piece('phase', () => mk(120, 14, (v) => HA.drawPhaseChip(v, 118, 1, T, { phase: 'day', day: 1, gathered: false, t: 0 }))), 100, 4);
    // toolbar
    for (let i = 0; i < 4; i++) {
      const b = piece(`tool${i}`, () => (hd ? toolButtonHD(keysHD[i], 'raised', T) : mk(15, 15, (v) => { drawBox(v, 0, 0, 15, 15, 'raised', T); const g = glyph1[i](T); v.blit(g, (15 - g.w) >> 1, (15 - g.h) >> 1); })));
      put(b, W - 4 - (4 - i) * 17, 4);
    }
    // the tip + the dock + its button
    const tip = piece('tip', () => mk(320, 60, (v) => HA.drawKeyHint(v, 160, 0, T, { tokens: AB.tipTokens(false), maxW: 296 })));
    put(tip, (W >> 1) - 160, H - 4 - 24 - 70);
    put(piece('dock', () => mk(E.DOCK.w + 2, E.DOCK.h + 2, (v) => E.drawDock(v, 0, 0, T, { mode: 'idle', color: 'crimson', mine: 2 }))), W - 4 - E.DOCK.w, H - 4 - 24 - 3 - E.DOCK.h);
    if (avatar) put(piece('btn', () => mk(26, 26, (v) => { v.blit(goldFrame(avatar, T), 1, 1); v.blit(E.dockButton(T, { state: 'open', color: 'crimson' }), 0, 0); })), W - 4 - 25, H - 4 - 25);
    // world: 4 labels, a person pin, 2 place pins
    hud.cast.forEach((m, i) => {
      if (hd) {
        const lb = labelHD(LL, m.head(), m.name, 'player', T);
        if (i === 1) drawPersonPinsHD(LL, { cx: LL.hd.at(m.head()).x, labelTopHD: lb.top, pins: [{ color: 'teal', icon: avatar ?? icon12, iconKey: 'you', age: 9 }], t: LL.t, still: true });
      } else {
        const p = LL.at(m.head()), top = p.y + IA.LABEL_DY;
        const lab = piece(`lab${m.name}`, () => { const im = new PixelImage(160, 12); IA.label(im, 80, 1, m.name, 'player', T); return im; });
        fastBlit(LL.world, lab, p.x - 80, top - 1);
        if (i === 1) { const pin = pinWithIcon(markerFrames(T), 'teal', icon12, 'you'); fastBlit(LL.world, pin, p.x - ANCHORS.pin.x, top - 2 - ANCHORS.pin.y); }
      }
    });
    pinSpots.forEach((sp, i) => {
      if (hd) drawPlacePinHD(LL, { p: sp, color: i ? 'gold' : 'crimson', icon: avatar ?? icon12, iconKey: 'you', age: 9, still: true });
      else {
        const q = LL.at(sp), F = markerFrames(T);
        fastBlit(LL.ground, F.get('pin_shadow'), q.x - ANCHORS.pin_shadow.x, q.y - ANCHORS.pin_shadow.y);
        fastBlit(LL.world, pinWithIcon(F, i ? 'gold' : 'crimson', icon12, 'you'), q.x - ANCHORS.pin.x, q.y - ANCHORS.pin.y);
      }
    });
    perf.drawMs += performance.now() - a; perf.frames++;
    const s1 = LL.stats, s2 = LL.hd?.stats;
    perf.uploadsTotal = s1.uploads + (s2?.uploads ?? 0);
    perf.uploadPxTotal = s1.uploadPx + (s2?.uploadPx ?? 0);
    perf.meanDrawMs = +(perf.drawMs / perf.frames).toFixed(3);
    perf.hd = LL.hd ? { scale: LL.hd.scale, d: LL.hd.d, screen: [LL.hd.screen.w, LL.hd.screen.h], world: [LL.hd.world.w, LL.hd.world.h] } : null;
    void drawText; void up2;
  }, 50);
}
