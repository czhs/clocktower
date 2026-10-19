// UI DENSITY comparison gallery (owner: UI lead; docs/UI.md "Density", docs/UI_GALLERY.md). The mock town square with
// today's 1x UI on the LEFT half and the same elements at UI density D=2 on the RIGHT half, over the same frame:
// clock + phase chips, the toolbar (tip bulb / notebook / panel / keys), the controls tip, a name label + a person pin,
// a place pin, the social palette (Point / Pin / swatches / Clear my pins / key hints) with the dock button, and the
// notebook page text (DOM: the 1x pixel webfont vs the D=2 one). Everything left is drawn exactly as the demo draws it
// today (src/demo/gameui.js); everything right goes through the density tiers (L.hd) and views.
//
//   index.html?scene=ui-density[&tod=noon|night][&uipolicy=round|floor][&swatch=bust|dot|portrait][&outlineW=1|2]
//   tools/shot.sh ui-density shots/ui-hd/cmp-1280.png --size 1280x720 --t 1
//   tools/shot.sh ui-density shots/ui-hd/cmp-1920.png --size 1920x1080 --t 1
import * as THREE from 'three';
import { buildHudStage } from './ui-hud.js';
import { PixelImage, drawBox, drawText, textWidth, tokens, densityView, HD_TEXT, FONTS } from '../src/ui/kit.js';
import { checkDensityFaces } from '../src/ui/fonts.js';
import * as E from '../src/ui/emotes/art.js';
import * as HA from '../src/ui/hud/art.js';
import * as IA from '../src/ui/indicators/art.js';
import { markerFrames } from '../src/ui/markers/art.js';
import { drawPersonPins, drawPlacePin } from '../src/ui/markers/draw.js';
import { loadPortraits, goldFrame } from '../src/ui/portraits/atlas.js';
import { prepareHD, pinWithIconHD, toolButtonHD, drawClockChipHD, ANCHORS_HD, glyphHD } from '../src/ui/hd/art.js';
import { installHDCss } from '../src/ui/hd/css.js';
import * as AB from '../src/demo/actionbar.js';   // the demo's 1x bulb + tip tokens (read-only import: today's look)

const CAST = [
  { id: 'fox', name: 'Cleo', seat: 1, clip: 'idle', role: 'Monk' },
  { id: 'frog', name: 'Ada', seat: 2, clip: 'idle', role: 'Empath' },
];
const NOTE = 'Ada trusts Cleo. The mill light at 2:10 — who? Gus voted ✓, Bram did not… suspect: Finn (quiet, jumpy).';

export default async function build(engine, params) {
  if (!params.has('uidensity')) params.set('uidensity', '2');
  const hud = await buildHudStage(engine, params, { cast: CAST, storyteller: null, ring: 2.2 });
  const L = hud.ui, T0 = L.tok;
  if (!L.hd) throw new Error('ui-density: no L.hd (createUILayers density option)');
  const swatchIcon = params.get('swatch') ?? 'dot';
  const occ = params.get('occ') === '1';
  if (params.has('outlineW')) HD_TEXT.outlineW = Number(params.get('outlineW'));
  // the two subjects: left (1x) and right (D=2), same depth, facing the camera
  const spots = [new THREE.Vector3(-2.3, 0, 2.4), new THREE.Vector3(2.3, 0, 2.4)];
  hud.cast.forEach((m, i) => {
    const p = spots[i].clone(); p.y = hud.terrain.heightAt(p.x, p.z);
    m.pos.copy(p); if (m.actor) { m.actor.st.base.copy(p); m.actor.st.face = 0; }
  });
  const pinSpots = [new THREE.Vector3(-4.3, 0, 1.2), new THREE.Vector3(4.3, 0, 1.2)].map((p) => p.setY(hud.terrain.heightAt(p.x, p.z)));
  const P = await loadPortraits('out/ui/').catch(() => null);
  const youId = 'mushroom';
  const icon12 = P?.icon(youId) ?? null, avatar = P?.avatar(youId) ?? null;
  L.hd.useDepth();
  const bad = checkDensityFaces();
  engine.stats.ui.density = { scale: L.hd.scale, k: L.hd.k, d: L.hd.d, policy: L.hd.policy, faceMismatches: bad.length, hdText: { ...HD_TEXT } };

  // ---- DOM: the notebook page text, 1x pixel webfont (left) vs the D=2 one (right)
  installHDCss(document);
  for (const href of ['out/ui/panels.css', 'out/ui/notebook.css']) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
  }
  const ps = Math.max(1, Math.round(engine.pixelScale));
  document.documentElement.style.setProperty('--hdpx', String(L.hd.scale));
  const pages = [];
  for (const hd of [false, true]) {
    const box = document.createElement('div');
    box.className = `ctn ${hd ? 'ctn-pixelfont-hd' : 'ctn-pixelfont'}${ps === 3 ? ' ctp-px3' : ''}`;
    box.style.cssText = `position:fixed; z-index:5; bottom:${4 * ps}px; left:${(hd ? engine.width / 2 : 0) + 4 * ps}px; --px:${ps};`;
    const ta = document.createElement('textarea');
    ta.className = 'ctn-text'; ta.spellcheck = false; ta.value = NOTE;
    ta.style.cssText = `--ctn-rows: 4; width: ${118 * ps}px;`;
    box.append(ta);
    const chip = document.createElement('div');
    chip.className = hd ? 'ct-pixel-hd' : '';
    chip.textContent = '✓ Saved · Seats · Notes';
    chip.style.cssText = `margin-top:${2 * ps}px; display:inline-block; padding:${ps}px ${3 * ps}px; color:#96C77E; background:#2B2536; border:${ps}px solid #5E566C;`
      + (hd ? '' : `font-family:'CT Pixel Body'; font-size:${8 * ps}px; line-height:${10 * ps}px; -webkit-font-smoothing:none;`);
    box.append(chip);
    document.body.append(box);
    pages.push(box);
  }
  await document.fonts?.ready;

  // ---- per-frame drawing
  const F = markerFrames(T0);
  const clockO = { stage: 'discussion', label: 'Noon', time: '12:30', frac: 0.62, paused: false, reduced: true };
  const tipTokens = AB.tipTokens(false);
  const tools = ['tip', 'notebook', 'panel', 'help'];
  const glyph1 = { tip: (T) => AB.bulb(T, false), notebook: (T) => HA.GLYPH.notebook(T), panel: (T) => HA.GLYPH.gear(T), help: (T) => HA.GLYPH.help(T) };
  const hdKey = { tip: 'tip', notebook: 'notebook', panel: 'gear', help: 'help' };
  // the demo's tip "never show again" row (gameui.js tipImage), drawn through either image / view
  const tipWithRow = (img, cx, y, T, maxW = 296) => {
    const r = HA.drawKeyHint(img, cx, y, T, { tokens: tipTokens, maxW });
    drawBox(img, r.x, y + r.h - 1, r.w, 14, { line: 'outline', edge: 'goldSh', fill: 'ink', hi: null, sh: null, corner: 1, shadow: true }, T);
    drawBox(img, r.x + 6, y + r.h + 2, 8, 8, 'sunk', T);
    drawText(img, r.x + 18, y + r.h + 3, 'Never show again', { color: T.textDim });
    return { ...r, h: r.h + 14 };
  };
  const tag = (img, x, y, s, T) => { const w = textWidth(s, 'tiny') + 6; drawBox(img, x, y, w, 9, 'chipGold', T); drawText(img, x + 3, y + 2, s, { font: 'tiny', color: T.goldHi }); };

  const half = (img, x0, x1, T, hdMode) => {
    // clock chip + phase chip (top left of the half)
    if (hdMode) drawClockChipHD(img, x0 + 6, 4, T, clockO); else HA.drawClockChip(img, x0 + 6, 4, T, clockO);
    const cw = HA.clockChipWidth(clockO);
    HA.drawPhaseChip(img, x0 + 6 + cw + 2 + 60, 5, T, { phase: 'day', day: 1, gathered: false, t: 0 });
    // toolbar (top right of the half)
    let bx = x1 - 4;
    for (let i = tools.length - 1; i >= 0; i--) {
      bx -= 15;
      if (hdMode) img.base.blit(toolButtonHD(hdKey[tools[i]], 'raised', T), bx * 2 + img.ox, 4 * 2 + img.oy);
      else { drawBox(img, bx, 4, 15, 15, 'raised', T); const g = glyph1[tools[i]](T); img.blit(g, bx + Math.floor((15 - g.w) / 2), 4 + Math.floor((15 - g.h) / 2)); }
      bx -= 2;
    }
    tag(img, x0 + 6, 24, hdMode ? 'NEW · DENSITY 2' : 'TODAY · 1X', T);
    // the controls tip (as wide as the demo's, or the half at odd pixel scales where the D=2 half is narrower)
    tipWithRow(img, Math.floor((x0 + x1) / 2), 38, T, Math.min(296, x1 - x0 - 24));
    // the social palette above the dock button (bottom right of the half)
    const by = img.h - 4 - 24, bxr = x1 - 4 - 24;
    if (avatar) img.blit(goldFrame(avatar, T), bxr, by);
    img.blit(E.dockButton(T, { state: 'open', color: 'crimson' }), bxr - 1, by - 1);
    E.drawDock(img, x1 - 4 - E.DOCK.w, by - 3 - E.DOCK.h, T, { mode: 'idle', color: 'crimson', mine: 2, hover: null, touch: false });
  };

  L.add((LL) => {
    const T = LL.tok;
    prepareHD(T, { swatchIcon: swatchIcon === 'portrait' ? (icon12 ?? 'bust') : swatchIcon });
    const W1 = LL.screen.w, hv = LL.hd.screenView, Wh = hv.w;
    // left half: today's 1x layer; right half: the D=2 view (its own logical width at odd scales)
    half(LL.screen, 0, Math.floor(W1 / 2), T, false);
    half(hv, Math.floor(Wh / 2), Wh, T, true);
    // divider
    for (let y = 0; y < LL.screen.h; y += 2) LL.screen.set(Math.floor(W1 / 2), y, T.iron);
    // world: name labels (+ person pin above), place pins
    const [mL, mR] = hud.cast;
    if (mL) {
      const p = LL.at(mL.head()), top = p.y + IA.LABEL_DY;
      IA.label(LL.world, p.x, top, mL.name, 'player', T);
      drawPersonPins(LL, F, { cx: p.x, labelTop: top - 1, pins: [{ color: 'teal', icon: icon12, iconKey: 'you', age: 9 }], t: 0, still: true });
    }
    if (mR) {
      const wv = LL.hd.worldView, d = LL.hd.d, h = LL.hd.at(mR.head());
      const lx = Math.floor(h.x / d), top = Math.floor(h.y / d) + IA.LABEL_DY;
      IA.label(wv, lx, top, mR.name, 'player', T);
      const pin = pinWithIconHD('teal', avatar ?? icon12, T, 'you');
      LL.hd.world.blit(pin, lx * d - ANCHORS_HD.pin.x, (top - 2) * d - ANCHORS_HD.pin.y);
    }
    drawPlacePin(LL, F, { spot: LL.at(pinSpots[0]), color: 'crimson', icon: icon12, iconKey: 'you', age: 9, still: true });
    const q = LL.hd.at(pinSpots[1]), dep = LL.hd.depthOf(pinSpots[1]);
    LL.hd.putDepth(scaleUp(F.get('pin_shadow')), q.x - 12, q.y - 4, dep + 0.02);
    LL.hd.putDepth(pinWithIconHD('crimson', avatar ?? icon12, T, 'you'), q.x - ANCHORS_HD.pin.x, q.y - ANCHORS_HD.pin.y, dep);
    if (occ && mR) {                      // ?occ=1: an HD pin just behind the right subject (the depth tier must hide it)
      const b = mR.pos.clone().add(new THREE.Vector3(0.25, 0, -0.5)), qb = LL.hd.at(b);
      LL.hd.putDepth(pinWithIconHD('violet', avatar ?? icon12, T, 'you'), qb.x - ANCHORS_HD.pin.x, qb.y - ANCHORS_HD.pin.y, LL.hd.depthOf(b));
    }
  }, 50);
  engine.stats.ui.densityGallery = { pages: pages.length, swatch: swatchIcon, glyphs: Object.keys(glyphHD), fonts: Object.keys(FONTS).filter((k) => k.includes('@')) };
  void tokens; void PixelImage; void densityView;
}
const _up = new Map();
function scaleUp(im) { let v = _up.get(im); if (!v) { v = new PixelImage(im.w * 2, im.h * 2); v.blit(im, 0, 0, { scale: 2 }); _up.set(im, v); } return v; }
