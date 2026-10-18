// UI DENSITY wave 2 comparison gallery (hud / events / emotes / panels groups; docs/UI-HD-WAVE2.md). The mock town square
// with today's 1x UI on the LEFT half and the same drawers at UI density D=2 on the RIGHT half. Both halves call the SAME
// group drawers with the same state; the right half draws through the density view (L.hd.screenView / worldView) after
// the wave-2 prepare*() calls, so what differs is exactly the wave-2 HD art.
//
//   index.html?scene=ui-density-wave2&page=hud|hud2|events|emotes|panels[&tod=noon|night][&uipolicy=round|floor]
//   tools/shot.sh ui-density-wave2 shots/ui-hd-wave2/hud-1280.png --size 1280x720 --t 1 --q page=hud
import * as THREE from 'three';
import { buildHudStage } from './ui-hud.js';
import { PixelImage, drawBox, drawText, textWidth } from '../src/ui/kit.js';
import * as HA from '../src/ui/hud/art.js';
import * as EV from '../src/ui/events/draw.js';
import * as E from '../src/ui/emotes/art.js';
import * as IA from '../src/ui/indicators/art.js';
import { loadPortraits, goldFrame } from '../src/ui/portraits/atlas.js';
import { prepareWave2HD, drawExecutionFxHD } from '../src/ui/hd/wave2.js';
import { installPanelsHD } from '../src/ui/hd/panels.js';
import { installHDCss } from '../src/ui/hd/css.js';

const CAST = [
  { id: 'fox', name: 'Cleo', seat: 1, clip: 'idle', role: 'Monk' },
  { id: 'frog', name: 'Ada', seat: 2, clip: 'idle', role: 'Empath' },
];

export default async function build(engine, params) {
  if (!params.has('uidensity')) params.set('uidensity', '2');
  const page = params.get('page') ?? 'hud';
  const hud = await buildHudStage(engine, params, { cast: page === 'panels' ? [] : CAST, storyteller: null, ring: 2.2 });
  const L = hud.ui;
  if (!L.hd) throw new Error('ui-density-wave2: no L.hd');
  const spots = [new THREE.Vector3(-5.33, 0, 8.8), new THREE.Vector3(5.33, 0, 8.8)];   // centred in each half, low on screen
  hud.cast.forEach((m, i) => { const p = spots[i].clone(); p.y = hud.terrain.heightAt(p.x, p.z); m.pos.copy(p); if (m.actor) { m.actor.st.base.copy(p); m.actor.st.face = 0; } });
  const P = await loadPortraits('out/ui/').catch(() => null);
  const avatar = P?.avatar('mushroom') ?? null;
  engine.stats.ui.density = { page, scale: L.hd.scale, k: L.hd.k, d: L.hd.d, policy: L.hd.policy };
  if (page === 'panels') await panelsPage(engine, L);

  const tag = (img, x, y, s, T) => { const w = textWidth(s, 'tiny') + 6; drawBox(img, x, y, w, 9, 'chipGold', T); drawText(img, x + 3, y + 2, s, { font: 'tiny', color: T.goldHi }); };
  const cast = [1, 2, 3, 4, 5, 6, 7].map((s) => ({ seat: s, name: ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Gus'][s - 1] }));
  const vhud = { cast, bySeat: (s) => cast.find((m) => m.seat === s) };
  const vote = EV.makeVote({ nominee: 3, order: [4, 5, 6, 7, 1, 2, 3], raise: { 4: true, 6: true, 1: true }, ghosts: [5], dead: [5], t0: 0, needed: 3 });

  // one half of the screen: x0..x1 in the image's logical px (L.screen = 1x, the screen view = D=2)
  const half = (img, x0, x1, T, hd, LL) => {
    const W = x1 - x0, H = img.h, t = 0.5;
    tag(img, x0 + 4, H - 13, hd ? 'NEW · DENSITY 2' : 'TODAY · 1X', T);
    if (page === 'hud') {
      HA.drawClockChip(img, x0 + 6, 4, T, { stage: 'discussion', label: 'Noon', time: '12:30', frac: 0.62, reduced: true });
      HA.drawPhaseChip(img, x1 - 4, 5, T, { phase: 'day', day: 1 });
      HA.drawClockChip(img, x0 + 6, 23, T, { stage: 'nominations', label: 'Execution in', time: '0:24', frac: 0.3, urgent: true, t: 0.5, plus: 'normal' });
      HA.drawClockChip(img, x0 + 6, 42, T, { stage: 'bedtime', label: 'Paused', time: '4:12', frac: 0.7, paused: true });
      HA.drawPhaseChip(img, x1 - 4, 19, T, { phase: 'night', countdown: 42 });
      HA.drawPhaseChip(img, x1 - 4, 33, T, { phase: 'bedtime', day: 2, visit: true, t: 0.1 });
      HA.drawPhaseChip(img, x1 - 4, 47, T, { phase: 'dawn' });
      HA.drawPhaseChip(img, x1 - 4, 61, T, { phase: 'day', day: 3, gathered: true });
      HA.drawToolbar(img, x1 - 4, 87, T, { host: true, hover: 'help' });
      HA.drawRoleChip(img, x0 + 6, 62, T, { role: 'Empath', house: 'Ravenscroft', dead: 'vote', badge: 2 });
      HA.drawToast(img, x0 + 6, 106, 140, T, { kind: 'info', text: 'Ada nominates Cleo. The town gathers at the square.', name: 'Ada' });
      HA.drawToast(img, x0 + 6, 132, 140, T, { kind: 'vote', text: 'Cora: 4 votes (needed 3) · ✓ your vote counted', name: 'Cora' });
      HA.drawToast(img, x0 + 6, 158, 140, T, { kind: 'death', text: 'Bram died in the night.', name: 'Bram' });
      HA.drawHint(img, x1 - 50, 108, T, { parts: [{ g: 'snow' }, { s: 'Paused' }], tone: 'frozen' });
      HA.drawHint(img, x1 - 50, 124, T, { parts: [{ g: 'hand' }, { s: 'Hand up' }, { countdown: 7 }], tone: 'vote', mode: 'pill', t });
      HA.drawVoicePill(img, x1 - 4, 176, T, { link: 'live', mic: 'live', talkers: ['Cleo', 'Gus'], t: 0.2 });
      HA.drawVoicePill(img, x1 - 4, 194, T, { link: 'wait', mic: 'muted', talkers: [], t: 0.2 });
    } else if (page === 'hud2') {
      HA.drawRoleCard(img, x0 + 4, 4, Math.min(196, W - 8), T, { badge: 2 });
      HA.drawJoystick(img, x0 + 6, H - 84, T, { active: true, kx: 9, ky: -6 });
      HA.drawUseButton(img, x0 + 76, H - 70, T, {});
      HA.drawUseButton(img, x0 + 76, H - 42, T, { label: 'Not your house', locked: true });
      HA.drawPrompt(img, x0 + Math.floor(W / 2), 172, T, { text: 'Walk in: Ravenscroft', key: 'e' });
      HA.drawConn(img, x0 + Math.floor(W / 2), 192, T, { t: 0.4 });
    } else if (page === 'events') {
      const LS = { tok: T, screen: img };
      EV.drawCaption(LS, EV.framesFor(T), { text: 'Night falls on Hollowmere.', glyph: 'moon', k: 10, durF: 126, cx: x0 + Math.floor(W / 2), y: 4, still: true });
      EV.drawCaption(LS, EV.framesFor(T), { text: 'The bell tolls for Seat 3.', glyph: 'bell', k: 10, durF: 126, cx: x0 + Math.floor(W / 2), y: 22, still: true });
      EV.drawVoteHud(vhud, LS, EV.framesFor(T), vote, { x: x0 + 4, y: 42, w: 92, h: 96 }, { t: 3.1 });
      EV.drawBanner(LS, EV.framesFor(T), 'start', 60, { cx: x0 + Math.floor(W / 2) + 34, y: 124, still: true });
      EV.drawBanner(LS, EV.framesFor(T), 'evil', 60, { cx: x0 + Math.floor(W / 2) + 34, y: 170, still: true });
    } else if (page === 'emotes') {
      const items = E.pieItems({ name: 'Bram', removable: { mine: true } });
      E.drawPie(img, x0 + 64, 70, T, { items, hot: 2, color: 'crimson', tOpen: 1, input: 'mouse', press: { dx: 0, dy: 0 } });
      E.drawPie(img, x0 + 64, 180, T, { items: E.pieItems({ name: null }), hot: null, color: 'teal', tOpen: 1.3, sticky: true });
      const by = H - 4 - 24, bxr = x1 - 4 - 24;
      if (avatar) img.blit(goldFrame(avatar, T), bxr, by);
      img.blit(E.dockButton(T, { state: 'open', color: 'crimson' }), bxr - 1, by - 1);
      E.drawDock(img, x1 - 4 - E.DOCK.w, by - 3 - E.DOCK.h, T, { mode: 'pin', color: 'crimson', mine: 2, hover: 'swatch:teal' });
      const z = E.armedSize(T, { mode: 'point' });
      E.drawArmed(img, x1 - 4 - z.w, 4, T, { mode: 'point' });
    }
  };

  L.add((LL) => {
    const T = LL.tok;
    prepareWave2HD(T);
    const W1 = LL.screen.w, hv = LL.hd.screenView, Wh = hv.w, d = LL.hd.d;
    half(LL.screen, 0, Math.floor(W1 / 2), T, false, LL);
    half(hv, Math.floor(Wh / 2), Wh, T, true, LL);
    for (let y = 0; y < LL.screen.h; y += 2) LL.screen.set(Math.floor(W1 / 2), y, T.iron);
    // world pieces on the two subjects: left = L.world (1x), right = the HD world view
    const [mL, mR] = hud.cast;
    if (!mL || !mR) return;
    const F = EV.framesFor(T), wv = LL.hd.worldView;
    const atHD = (p) => { const h = LL.hd.at(p); return { x: Math.round(h.x / d), y: Math.round(h.y / d) }; };
    const sides = [[LL.world, (p) => LL.at(p), mL], [wv, atHD, mR]];
    for (const [img, at, m] of sides) {
      const head = at(m.head()), feet = at(m.feet());
      if (page === 'events') {
        // the execution FX (bell over the label, the wisp leaving the body) at k = 99 grid frames: 1x on the left
        // (EV.drawExecution 'fx' layer), D=2 on the right (wave2 drawExecutionFxHD); a poof + a memorial candle beside
        IA.label(img, head.x, head.y + IA.LABEL_DY, m.name, 'ghost', T);
        const t0 = LL.t - 99 / 30;
        if (img === LL.world) EV.drawExecution(hud, LL, F, m, t0, { t: LL.t, layer: 'fx' });
        else drawExecutionFxHD(hud, LL, F, m, t0, { t: LL.t });
        EV.put(img, F, 'poof_2', feet.x - 32, feet.y + 6, 'poof');
        EV.put(img, F, 'reveal_1', feet.x + 34, feet.y + 4, 'reveal');
        EV.put(img, F, 'candle_1', feet.x + 14, feet.y + 4, 'candle');
      } else if (page === 'emotes') {
        IA.label(img, head.x, head.y + IA.LABEL_DY, m.name, 'player', T);
        const pop = E.popFrame('point', 1, T), a = E.POP.anchor;
        img.blit(pop, head.x - a.x - 9, head.y + IA.LABEL_DY - 2 - a.y);
        img.blit(E.popFrame('pin', 1, T, 'violet'), head.x - a.x + 9, head.y + IA.LABEL_DY - 2 - a.y);
      } else if (page === 'hud' || page === 'hud2') IA.label(img, head.x, head.y + IA.LABEL_DY, m.name, 'player', T);
    }
  }, 50);
}

// ------------------------------------------------------------------------------------------------ panels (DOM)
async function panelsPage(engine, L) {
  const T = L.tok, ps = Math.max(1, Math.round(engine.pixelScale)), hdpx = L.hd.scale;
  installHDCss(document);
  for (const href of ['out/ui/panels.css', 'out/ui/notebook.css']) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); }
  installPanelsHD(document, T);
  document.documentElement.style.setProperty('--hdpx', String(hdpx));
  const css = document.createElement('style');
  css.textContent = `.w2-half { position: fixed; top: 0; bottom: 0; overflow: hidden; z-index: 5; color: ${T.text}; }
  .w2-half .ctp-skin { display: flex; flex-wrap: wrap; gap: calc(4px * var(--u)); align-items: center; margin: calc(3px * var(--u)) 0; }
  .w2-half button, .w2-half input, .w2-half textarea, .w2-half kbd { color: ${T.text}; }
  .w2-l * { font-family: 'CT Pixel Body'; font-size: calc(8px * var(--px)); line-height: calc(10px * var(--px)); -webkit-font-smoothing: none; }
  .w2-r * { font-family: 'CT Pixel Body HD'; font-size: calc(16px * var(--hdpx)); line-height: calc(20px * var(--hdpx)); -webkit-font-smoothing: none; }
  .w2-half .ctp-panel { padding: calc(6px * var(--u)); margin: calc(4px * var(--u)); }
  .w2-half [role=tablist] { display: flex; gap: calc(1px * var(--u)); }
  .w2-half .ctp-row { padding: calc(3px * var(--u)) calc(5px * var(--u)); margin: calc(2px * var(--u)) 0; }
  .w2-half button { padding: calc(2px * var(--u)) calc(6px * var(--u)); }
  .w2-half input[type=text] { width: calc(90px * var(--u)); padding: calc(1px * var(--u)) calc(3px * var(--u)); }
  .w2-half .ct-badge { padding: 0 calc(3px * var(--u)); }`;
  document.head.append(css);
  const mk = (hd) => {
    const el = document.createElement('div');
    el.className = `w2-half ${hd ? 'w2-r ctp-hd' : 'w2-l'}`;
    const u = hd ? 2 * hdpx : ps;   // CSS px per 1x texel on each side (HD: 2 HD px)
    el.style.cssText = `left: ${hd ? engine.width / 2 : 0}px; width: ${engine.width / 2}px; --px: ${ps}; --u: ${u};`;
    el.innerHTML = `
      <div class="ctp-panel">
        <div role="tablist"><button role="tab" aria-selected="true">Seats</button><button role="tab">Notes</button><button role="tab">Crier</button></div>
        <div class="ctp-skin"><button>Leave</button><button class="primary">Start game</button><button disabled>Kick</button><button class="ct-danger-btn">Abort</button></div>
        <div class="ctp-skin"><input type="text" value="Ada trusts Cleo"><input type="checkbox" checked><input type="checkbox"><input type="radio" checked><span class="ctp-switch on"></span><span class="ctp-switch"></span></div>
        <div class="ctp-row">1 · Bram <span class="ct-badge ct-badge-host">host</span></div>
        <div class="ctp-row selected">2 · Cleo <span class="ct-badge ct-badge-ready">ready</span></div>
        <div class="ctp-row dead">5 · Esme <span class="ct-badge ct-badge-away">away</span></div>
        <div class="ctp-skin"><span class="ctp-tooltip" style="padding: 0 calc(4px * var(--u))">Tooltip text</span><kbd>J</kbd><span class="ct-chat-unread" style="padding: 0 calc(3px * var(--u))">7</span></div>
      </div>
      <div class="ctp-parchment" style="margin: calc(4px * var(--u)); padding: calc(6px * var(--u)); color: ${T.textInk}">The Storyteller reads the town crier.</div>`;
    document.body.append(el);
  };
  mk(false); mk(true);
  await document.fonts?.ready;
}
