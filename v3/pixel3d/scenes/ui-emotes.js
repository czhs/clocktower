// Emotes group scene (owner: emotes; docs/UI.md §3.3, §4 "emotes"). The mock HUD square + cast with ONLY the emotes
// module (or, with others=1, the other groups' modules/placeholders around it for context).
//   index.html?scene=ui-emotes[&tod=noon|night][&state=showcase|anim|sticky|armed|hint|disabled|pops|tooltip][&rm=1]
//             [&pie=mouse|touch][&remove=1][&others=1][&t=<s>]
//   tools/shot.sh ui-emotes shots/ui-emotes/r1/day.png --size 1280x720 --t 1
import { buildHudStage, GROUPS } from './ui-hud.js';
import { PLACEHOLDERS } from '../src/ui/placeholders.js';
import emotes from '../src/ui/emotes/hud.js';

export default async function build(engine, params) {
  const hud = await buildHudStage(engine, params);
  if (hud.P('others', '0') === '1') {
    for (const g of GROUPS) {
      if (g === 'emotes') continue;
      let mod = null;
      try { mod = await import(`../src/ui/${g}/hud.js`); } catch (e) { if (!/fetch|import|Failed|404|not found/i.test(String(e.message))) throw e; }
      if (mod?.default?.draw) { await mod.default.setup?.(hud); hud.ui.add((L) => mod.default.draw(hud, L), mod.default.z ?? 10); }
      else PLACEHOLDERS[g]?.(hud);
    }
  }
  await emotes.setup(hud);
  hud.ui.add((L) => emotes.draw(hud, L), emotes.z);
  engine.stats.ui.emotes = hud.emotes;
}
