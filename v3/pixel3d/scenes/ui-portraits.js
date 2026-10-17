// Portraits group scene (owner: portraits group; docs/UI.md §3.3, §4 "portraits"). The mock HUD square (buildHudStage:
// same camera, cast and UI layers as scenes/ui-hud.js) + the portraits slot (src/ui/portraits/hud.js) + a showcase of
// every element of the group, drawn from the BAKED atlases (out/ui/portraits.*, out/ui/cast-portraits.*).
//
//   index.html?scene=ui-portraits[&tod=noon|golden|night][&state=portraits|icons|world|hud][&walk=1|v2][&t=1]
//   tools/shot.sh ui-portraits shots/ui-portraits/r1/portraits-day.png --size 1280x720 --t 1 --q "state=portraits"
//
// States
//   portraits  bottom panel: every cast-portraits idle cell (31 ids, 1x) + the ghost / ghost-spent / dead cells of the
//              mock players; walk=1 plays walk1..4 in place at 15 fps (game speed); walk=v2 at the v2 picker's
//              cadence (castPortrait.ts steps every 140 ms -> 4 grid frames, 7.5 fps)
//   icons      top panel: every icon_<id> (31) + the mock cast's ghost / ghost-spent / dead icons + 24x24 avatars
//   world      tier A: each cast member's icon floating over its head (as a who-is-who callout; ghost variant on ghosts)
//   hud        only the mock HUD slot (dock portrait button + notebook icons)
// The portraits slot module is always on, over the lead's notebook placeholder (placeholders=0 hides it).
import { buildHudStage, MOCK_CAST } from './ui-hud.js';
import { drawBox, drawText, textWidth } from '../src/ui/kit.js';
import { loadPortraits } from '../src/ui/portraits/atlas.js';
import slot from '../src/ui/portraits/hud.js';
import { PORTRAIT_IDS, PLAYERS } from '../src/ui/portraits/render.js';
import { PLACEHOLDERS } from '../src/ui/placeholders.js';

export default async function build(engine, params) {
  // the mock players' states for the variants: Esme (rabbit) is a ghost (ui-hud), Gus (crow) a spent ghost, Finn (goat) dead
  const cast = MOCK_CAST.map((c) => (c.id === 'crow' ? { ...c, ghost: true, ghostSpent: true } : c.id === 'goat' ? { ...c, dead: true } : c));
  const hud = await buildHudStage(engine, params, { cast });
  const P = hud.P, state = P('state', 'portraits'), walkP = P('walk', '0'), walk = walkP !== '0';
  const A = await loadPortraits('out/ui/', hud.tod === 'night' ? 'night' : 'noon');   // tier-A icons follow the scene tod
  await slot.setup(hud);
  if (P('placeholders', '1') !== '0') PLACEHOLDERS.panels(hud);   // the notebook the slot's icons sit in (panels placeholder)
  hud.ui.add((L) => slot.draw(hud, L), 75);
  const vOf = (m) => (m.dead ? 'dead' : m.ghostSpent ? 'ghost-spent' : m.ghost ? 'ghost' : 'alive');

  if (state === 'portraits') {
    hud.ui.add((L) => {
      const T = L.tok, S = L.screen;
      const x0 = 4, y0 = S.h - 4 - 112, w = S.w - 8 - 30;
      const inner = drawBox(S, x0, y0, w, 112, 'panel', T);
      drawText(S, inner.x + 3, inner.y + 2, 'Cast portraits', { color: T.gold });
      drawText(S, inner.x + w - 8, inner.y + 3, walk ? (walkP === 'v2' ? 'WALK V2 140MS' : 'WALK 15 FPS') : 'IDLE', { font: 'tiny', color: T.textDim, align: 'right' });
      const k = walk ? A.walkFrame(L.t, walkP === 'v2' ? 'v2' : 'game') : 0;
      PORTRAIT_IDS.forEach((id, i) => {
        const col = i % 19, row = Math.floor(i / 19);
        const cell = A.cell(id, PLAYERS.includes(id) ? k : 0);
        S.blit(cell, inner.x + 1 + col * 31, inner.y + 11 + row * 46);
      });
      // ghost / ghost-spent / dead cells of three mock players, after the second row
      let x = inner.x + 1 + 12 * 31 + 6;
      for (const [id, v] of [['rabbit', 'ghost'], ['crow', 'ghost-spent'], ['goat', 'dead'], ['fox', 'ghost'], ['fox', 'ghost-spent'], ['fox', 'dead']]) {
        S.blit(A.cell(`${id}/${v}`), x, inner.y + 11 + 46);
        drawText(S, x + 16, inner.y + 11 + 46 + 41, v === 'ghost-spent' ? 'SPENT' : v.toUpperCase(), { font: 'tiny', color: T.textDim, align: 'center' });
        x += 34;
      }
    }, 80);
  }
  if (state === 'icons') {
    hud.ui.add((L) => {
      const T = L.tok, S = L.screen;
      const x0 = 142, y0 = 4, w = S.w - 146, h = 92;
      const inner = drawBox(S, x0, y0, w, h, 'panel', T);
      drawText(S, inner.x + 3, inner.y + 2, 'Cast icons + avatars', { color: T.gold });
      PORTRAIT_IDS.forEach((id, i) => S.blit(A.icon(id), inner.x + 2 + (i % 16) * 15, inner.y + 12 + Math.floor(i / 16) * 14));
      // variants of the mock cast: icon row + avatar row
      let x = inner.x + 2;
      const yI = inner.y + 44, yA = inner.y + 58;
      for (const m of [...hud.cast, hud.st].filter(Boolean)) {
        S.blit(A.icon(m.id, vOf(m)), x + 6, yI);
        S.blit(A.avatar(m.id, vOf(m)), x, yA);
        x += 27;
      }
      for (const v of ['ghost', 'ghost-spent', 'dead']) {
        S.blit(A.icon('fox', v), x + 6, yI); S.blit(A.avatar('fox', v), x, yA); x += 27;
      }
      const tag = 'ALIVE / GHOST / SPENT / DEAD';
      drawText(S, inner.x + inner.w - textWidth(tag, 'tiny') - 2, inner.y + 3, tag, { font: 'tiny', color: T.textDim });
    }, 80);
  }
  if (state === 'world') {
    hud.ui.add((L) => {
      const T = L.tok;
      for (const m of [...hud.cast, hud.st].filter(Boolean)) {
        const p = L.at(m.head());
        const ic = A.icon(m.id, vOf(m));
        // icon over the head (anchor 6,6), its bottom 1 px above the head point, the name above it
        L.world.blit(ic, p.x - 6, p.y - 13);
        drawText(L.world, p.x, p.y - 23, m.name.split(' ').pop(), { font: 'body', color: m.st ? T.st : m.ghost ? T.ghost : T.labelText, outline: T.labelLine, align: 'center' });
      }
    }, 20);
  }
  engine.stats.uiPortraits = { state, walk, ids: PORTRAIT_IDS.length, players: PLAYERS.length };
}
