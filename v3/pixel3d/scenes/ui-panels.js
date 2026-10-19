// Panels group scene (owner: panels; docs/UI.md §3.3, §4 "panels"). The mock HUD square + cast with the panel kit's mock
// screens over the 3D town, day or night. Every state is a pure function of the UI clock (?t= freezes it).
//   index.html?scene=ui-panels[&tod=noon|golden|night][&state=kit|hud|lobby|notebook|storyteller|endgame|settings|
//             interior|demo|modal|voice|chat|dialogs][&held=1][&rm=1][&others=1][&t=<s>]
//   tools/shot.sh ui-panels shots/ui-panels/r1/kit-noon.png --size 1280x720 --t 1
// state=hud = the mock HUD with the panels module in its slot (+ the other groups with others=1, default on there).
// state=demo = scripted cursor interaction loop (6.4 s); state=modal = settings modal open (pop) / close (dissolve) loop.
import { buildHudStage, GROUPS } from './ui-hud.js';
import { PLACEHOLDERS } from '../src/ui/placeholders.js';
import panels from '../src/ui/panels/hud.js';
import { panelKit } from '../src/ui/panels/art.js';
import * as SC from '../src/ui/panels/screens.js';

const MODAL_CYCLE = 3.2;

export default async function build(engine, params) {
  const hud = await buildHudStage(engine, params);
  const P = hud.P, state = P('state', 'kit');
  const others = P('others', state === 'hud' ? '1' : '0') === '1';
  if (state === 'hud') {
    for (const g of GROUPS) {
      if (g === 'panels' || !others) continue;
      let mod = null;
      try { mod = await import(`../src/ui/${g}/hud.js`); } catch (e) { if (!/fetch|import|Failed|404|not found/i.test(String(e.message))) throw e; }
      if (mod?.default?.draw) { await mod.default.setup?.(hud); hud.ui.add((L) => mod.default.draw(hud, L), mod.default.z ?? 10); }
      else PLACEHOLDERS[g]?.(hud);
    }
    await panels.setup(hud);
    hud.ui.add((L) => panels.draw(hud, L), panels.z);
    engine.stats.ui.panels = { state };
    return;
  }
  await panels.setup(hud);   // loads the portraits atlas into hud.panels.P
  const S = hud.panels;
  hud.ui.add((L) => {
    const K = panelKit(L.tok), img = L.screen;
    const ctx = { P: S.P, cast: hud.cast, st: hud.st, t: L.t, reduced: S.reduced, night: hud.tod === 'night' };
    switch (state) {
      case 'lobby': SC.lobby(img, K, ctx); break;
      case 'notebook': SC.notebook(img, K, { x: 4, y: 24, w: 132, h: 158 }, ctx, { popAt: [1, 0, 0.5] }); break;
      case 'storyteller': SC.storyteller(img, K, ctx); break;
      case 'endgame': SC.endgame(img, K, ctx); break;
      case 'settings': SC.settings(img, K, ctx, { switchK: 3 }); break;
      case 'interior': SC.interior(img, K, ctx); break;
      case 'demo': SC.demo(img, K, ctx); break;
      case 'voice': SC.voice(img, K, ctx, { held: P('held', '0') === '1' }); break;
      case 'chat': SC.chat(img, K, ctx); break;
      case 'dialogs': SC.dialogs(img, K, ctx); break;
      case 'modal': {
        // whole grid frames (rounded capture times must not eat the 2-frame pop): open at frame 12, close at 78
        const f = Math.floor(L.t * 30 + 0.01) % Math.round(MODAL_CYCLE * 30);
        SC.lobby(img, K, ctx);
        if (f >= 12 && f < 78) SC.settings(img, K, ctx, { openK: f - 12, switchK: 3 });
        else if (f >= 78) SC.settings(img, K, ctx, { closeK: f - 78, switchK: 3 });
        break;
      }
      default: SC.kitShowcase(img, K, ctx);
    }
  }, 70);
  engine.stats.ui.panels = { state };
}
