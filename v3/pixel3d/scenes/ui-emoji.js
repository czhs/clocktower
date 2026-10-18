// EMOJI EMOTES gallery (docs/UI-EMOJI.md). The mock town square with today's 1x UI on the LEFT half and the same drawers
// at UI density D=2 on the RIGHT half (the right half draws through L.hd.screenView / worldView after prepareWave2HD +
// prepareEmojiHD), like scenes/ui-density-wave2.js.
//
//   index.html?scene=ui-emoji&page=pops|pie|dock|sheet[&tod=noon|night]
//     pops   frame strips of the 7 pops (f0 .. f6) + a live row of all 7 popping (staggered, 3.6 s loop)
//     pie    the new pie: on a person with Remove (hot wedge sweeping), sticky on the ground, touch size at the pin cap
//     dock   the new emote dock + the pin-colour picker over it + the settings row; the two subjects react (world pops)
//     sheet  the 7 chosen + the 3 alternates, 1x (x2 blocks) and D=2, on the bubble fill
//   tools/shot.sh ui-emoji shots/ui-emoji/pie-noon.png --size 1280x720 --t 1 --q page=pie
import * as THREE from 'three';
import { buildHudStage } from './ui-hud.js';
import { PixelImage, drawBox, drawText, textWidth } from '../src/ui/kit.js';
import * as E from '../src/ui/emotes/art.js';
import * as EJ from '../src/ui/emotes/emoji.js';
import * as IA from '../src/ui/indicators/art.js';
import { loadPortraits, goldFrame } from '../src/ui/portraits/atlas.js';
import { prepareWave2HD } from '../src/ui/hd/wave2.js';
import { prepareEmojiHD } from '../src/ui/hd/emoji.js';

const CAST = [
  { id: 'fox', name: 'Cleo', seat: 1, clip: 'idle', role: 'Monk' },
  { id: 'frog', name: 'Ada', seat: 2, clip: 'idle', role: 'Empath' },
];
const LOOP = 3.6;

export default async function build(engine, params) {
  if (!params.has('uidensity')) params.set('uidensity', '2');
  const page = params.get('page') ?? 'pops';
  const withCast = page === 'dock';
  const hud = await buildHudStage(engine, params, { cast: withCast ? CAST : [], storyteller: null, ring: 2.2 });
  const L = hud.ui;
  if (!L.hd) throw new Error('ui-emoji: no L.hd');
  const spots = [new THREE.Vector3(-6.2, 0, 7.6), new THREE.Vector3(4.6, 0, 7.6)];
  hud.cast.forEach((m, i) => { const p = spots[i].clone(); p.y = hud.terrain.heightAt(p.x, p.z); m.pos.copy(p); if (m.actor) { m.actor.st.base.copy(p); m.actor.st.face = 0; } });
  const P = await loadPortraits('out/ui/').catch(() => null);
  const avatar = P?.avatar('mushroom') ?? null;
  engine.stats.ui.emoji = { page, scale: L.hd.scale, k: L.hd.k, d: L.hd.d };

  const tag = (img, x, y, s, T) => { const w = textWidth(s, 'tiny') + 6; drawBox(img, x, y, w, 9, 'chipGold', T); drawText(img, x + 3, y + 2, s, { font: 'tiny', color: T.goldHi }); };
  const plate = (img, cx, y, s, T) => { const w = textWidth(s) + 8; drawBox(img, cx - (w >> 1), y, w, 12, 'chip', T); drawText(img, cx, y + 3, s, { color: T.text, align: 'center' }); };

  const half = (img, x0, x1, T, hd, t) => {
    const W = x1 - x0, H = img.h;
    tag(img, x0 + 4, H - 13, hd ? 'NEW · DENSITY 2' : 'TODAY · 1X', T);
    if (page === 'pops') {
      const P0 = EJ.EMOJI_POP;
      EJ.EMOJI.forEach((e, r) => {
        const y = 4 + r * 30;
        drawText(img, x0 + 6, y + 14, `${r + 1} ${e.label}`, { color: T.text, outline: T.outline });
        for (let f = 0; f < 7; f++) img.blit(EJ.emojiPopFrame(e.key, f, T), x0 + 74 + f * 34, y);
      });
      // live row: all 7 pop, staggered 0.15 s, on a 3.6 s loop (the GIF)
      const u = ((t % LOOP) + LOOP) % LOOP;
      EJ.EMOJI.forEach((e, i) => {
        const cx = x0 + 26 + i * 44, top = 300;
        EJ.drawEmojiPop(img, cx, top, e.key, T, u, 0.1 + i * 0.15);
        plate(img, cx, top, ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Gus'][i], T);
      });
    } else if (page === 'pie') {
      const itemsA = EJ.pieItemsEmoji({ name: 'Bram', removable: { mine: true }, color: 'teal' });
      const hotA = Math.floor(t / 0.6) % itemsA.length;
      E.drawPie(img, x0 + 70, 86, T, { items: itemsA, hot: hotA, color: 'teal', tOpen: 1, title: EJ.PIE_TITLE });
      const itemsB = EJ.pieItemsEmoji({ color: 'crimson' });
      E.drawPie(img, x0 + 70, 238, T, { items: itemsB, hot: null, color: 'crimson', tOpen: t, sticky: true, title: EJ.PIE_TITLE });
      const itemsC = EJ.pieItemsEmoji({ name: 'Gus', color: 'violet' });
      const offC = new Set([itemsC.length - 1]);   // the pin cap: the Pin wedge off
      E.drawPie(img, x0 + 220, 150, T, { items: itemsC, hot: 3, off: offC, color: 'violet', tOpen: 1, size: 'touch', input: 'touch', title: EJ.PIE_TITLE });
    } else if (page === 'dock') {
      const by = H - 4 - 24, bxr = x1 - 4 - 24;
      if (avatar) img.blit(goldFrame(avatar, T), bxr, by);
      img.blit(E.dockButton(T, { state: 'open', color: 'teal' }), bxr - 1, by - 1);
      const dx = x1 - 4 - EJ.EMOTE_DOCK.w, dy = by - 3 - EJ.EMOTE_DOCK.h;
      const keys = EJ.EMOJI.map((e) => e.key), k = Math.floor(t / LOOP) % keys.length;
      const r = EJ.drawEmoteDock(img, dx, dy, T, { mode: 'idle', color: 'teal', mine: 2, hover: 'pinColor', picker: true, active: keys[k] });
      const pk = EJ.pinPickerAt(dx, dy, r);
      EJ.drawPinPicker(img, pk.x, pk.y, T, { color: 'teal', auto: false, autoColor: 'orange', hover: 'color:violet', tailX: pk.tailX });
      // the settings-panel row (on a panel, top left)
      const rw = textWidth('Pin colour') + 6 + EJ.pinCellsWidth() + 10;
      drawBox(img, x0 + 4, 4, rw, 21, 'panel', T);
      EJ.drawPinColorRow(img, x0 + 9, 9, T, { color: 'teal', auto: true, autoColor: 'orange', hover: 'color:green' });
      // the second dock state: Pin armed, hovering an emoji (smaller: no picker), top right
      EJ.drawEmoteDock(img, x1 - 4 - EJ.EMOTE_DOCK.w, 4, T, { mode: 'pin', color: 'crimson', mine: 0, hover: 'emoji:question' });
    } else if (page === 'sheet') {
      const all = [...EJ.EMOJI.map((e) => [e, true]), ...EJ.EMOJI_ALT.map((e) => [e, false])];
      all.forEach(([e, chosen], i) => {
        const col = i % 5, row = Math.floor(i / 5), x = x0 + 8 + col * 61, y = 8 + row * 96;
        drawBox(img, x, y, 56, 88, chosen ? 'panel' : 'disabled', T);
        const ic = EJ.emojiIcon(e.key, T);
        img.blit(ic, x + 21, y + 8);   // real size (through the view: the .hd art), then the same at 2x below
        if (hd) img.base.blit(ic.hd, (x + 15) * img.density + img.ox, (y + 26) * img.density + img.oy, { scale: 2 });
        else { const big = new PixelImage(ic.w * 2, ic.h * 2); big.blit(ic, 0, 0, { scale: 2 }); img.blit(big, x + 15, y + 26); }
        drawText(img, x + 28, y + 58, e.label, { color: chosen ? T.goldHi : T.textDim, align: 'center' });
        drawText(img, x + 28, y + 70, chosen ? `key ${EJ.EMOJI.indexOf(e) + 1}` : 'alternate', { font: 'tiny', color: T.textDim, align: 'center' });
      });
    }
  };

  L.add((LL) => {
    const T = LL.tok, t = LL.t;
    prepareWave2HD(T); prepareEmojiHD(T);
    const W1 = LL.screen.w, hv = LL.hd.screenView, Wh = hv.w, d = LL.hd.d;
    half(LL.screen, 0, Math.floor(W1 / 2), T, false, t);
    half(hv, Math.floor(Wh / 2), Wh, T, true, t);
    for (let y = 0; y < LL.screen.h; y += 2) LL.screen.set(Math.floor(W1 / 2), y, T.iron);
    if (!withCast) return;
    const [mL, mR] = hud.cast;
    if (!mL || !mR) return;
    const wv = LL.hd.worldView;
    const atHD = (p) => { const h = LL.hd.at(p); return { x: Math.round(h.x / d), y: Math.round(h.y / d) }; };
    const keys = EJ.EMOJI.map((e) => e.key), k = Math.floor(t / LOOP), t0 = k * LOOP + 0.1;
    for (const [img, at, m, off] of [[LL.world, (p) => LL.at(p), mL, 0], [wv, atHD, mR, 3]]) {
      const head = at(m.head());
      IA.label(img, head.x, head.y + IA.LABEL_DY, m.name, 'player', T);
      EJ.drawEmojiPop(img, head.x, head.y + IA.LABEL_DY - 1, keys[(k + off) % keys.length], T, t, t0);
    }
  }, 50);
}
