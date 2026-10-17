// Portraits group slot in the mock HUD (scenes/ui-hud.js; docs/UI.md §3.3). Draws from the BAKED atlases
// (out/ui/portraits.*, out/ui/cast-portraits.*: tools/uibake.sh portraits, portraits:cast-portraits), exactly what a
// game client would load:
//   - SLOTS.portraits[0] (24x24, bottom right): the dock / voice portrait button = your avatar in the gold frame + the
//     status dot (v2: your portrait button with an armed dot)
//   - the notebook rows of the side panel (the lead's placeholder positions): 12x12 cast icons, ghost variant for ghosts
// Screen tier only (S). Nothing animates here (portraits are still in the HUD; the picker walk lives in the scene).
import { rect, SLOTS } from '../placeholders.js';
import { loadPortraits, goldFrame } from './atlas.js';

let P = null;
const variantOf = (m) => (m.dead ? 'dead' : m.ghostSpent ? 'ghost-spent' : m.ghost ? 'ghost' : 'alive');

export default {
  z: 75,
  async setup() { P = await loadPortraits(); },
  draw(hud, L) {
    if (!P) return;
    const T = L.tok, S = L.screen;
    // dock / voice portrait button
    const r = rect(SLOTS.portraits[0], S.w, S.h);
    const you = hud.you || hud.cast[0];
    if (you) {
      S.blit(goldFrame(P.avatar(you.id, variantOf(you)), T), r.x, r.y);
      // status dot (bottom-right, over the frame): ok = voice live
      S.disc(r.x + r.w - 2.5, r.y + r.h - 2.5, 3.5, T.outline);
      S.disc(r.x + r.w - 2.5, r.y + r.h - 2.5, 2.5, T.ok);
    }
    // notebook rows (panels slot): icon at the placeholder's avatar spot. UI integration r2: none while the side panel
    // is hidden (?panel=none, the game screen's Storyteller view): the icons floated over the town without their rows
    if (hud.panels?.panel === 'none') return;
    const pr = rect(SLOTS.panels[0], S.w, S.h);
    hud.cast.slice(0, 4).forEach((m, i) => {
      const x = pr.x + 7, y = pr.y + 2 + 17 + i * 26 + 6;
      const ic = P.icon(m.id, variantOf(m));
      if (ic) S.blit(ic, x, y);
    });
  },
};
