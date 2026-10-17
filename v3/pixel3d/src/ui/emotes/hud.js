// Emotes slot module for the mock HUD (owner: emotes; docs/UI.md §3.3). Draws the social dock (+ the toggle ring
// around the portraits group's button), the radial pie menu at its slot, and in-world emote pops above cast members.
//   ?state=showcase (default) | anim | sticky | armed | hint | disabled | pops | tooltip     ?rm=1 reduced motion
//   ?pie=mouse|touch  ?remove=1 (Remove wedge)  ?tod=night ...
// Every animation is a pure function of L.t on the 30 Hz grid (docs/UI.md §2.8).
import * as E from './art.js';
import { SLOTS, rect } from '../placeholders.js';
import { PixelImage, dissolve } from '../kit.js';
import { VISUAL_TOP_M } from '../indicators/hud.js';                 // read-only reuse (indicators group)
import { LABEL_DY, GHOST_LIFT_M } from '../indicators/art.js';
import { markersContext } from '../markers/stage.js';                // read-only reuse (markers group)
import { drawPlacePin } from '../markers/draw.js';
import { ANCHORS as MARKER_ANCHORS } from '../markers/art.js';

/**
 * Top of the name-label stack of member m (layer px): hud.indicators.stackTop when the indicators group is loaded (ghost
 * lift, the "You" chevron, the Storyteller's visual top); otherwise the same rule computed here (feet + VISUAL_TOP_M or
 * spec height + 0.1 m, + ghost lift, + LABEL_DY, - 1). r2 (critic r1): m.head() is spec.height, which for the
 * Storyteller is the staff finial, so its pop floated ~20 texels over the hood and read as Ada's.
 */
export function stackTop(hud, m, L) {
  // CONTRACT-REQUEST (lead): a shared stack allocator (labels < bubble < pins < pop); used as soon as it lands
  if (hud.stack?.top) return hud.stack.top(m, L, 'pop');
  if (hud.indicators?.stackTop) return hud.indicators.stackTop(m, L);
  const top = VISUAL_TOP_M[m.id];
  const h = top !== undefined ? m.feet().clone().setY(m.feet().y + Math.min(top, m.height) + 0.1) : m.head();
  if (m.ghost) h.y += GHOST_LIFT_M;
  return L.at(h).y + LABEL_DY - (m.you ? 8 : 1);
}
/** Your own settled place pin (the markers group's mock: Dov's gold pin on the cobbles, hovered) = the tooltip anchor. */
const OWN_PIN = { r: 3.1, ang: 158, color: 'gold' };

const ANIM_CYCLE = 8;   // s: the scripted 'anim' timeline loops
const g = (t) => E.gridK(t);

/** Scripted timeline (state=anim): dock opens, pie opens, sweeps Point -> teal, commits, the pinner gets a pop. */
function timeline(t) {
  const u = ((t % ANIM_CYCLE) + ANIM_CYCLE) % ANIM_CYCLE;
  const dock = u < 0.3 ? { closed: true } : u < 7.0 ? { tOpen: u - 0.3 } : { tClose: u - 7.0 };
  let pie = null;
  if (u >= 0.8 && u < 3.6) {
    const hotAt = [[1.3, 0], [1.7, 1], [2.0, 2], [2.3, 3], [2.6, 4]];
    let hot = null; for (const [s, i] of hotAt) if (u >= s) hot = i;
    pie = { tOpen: u - 0.8, hot };
  } else if (u >= 3.6 && u < 4.2) pie = { tOpen: 99, commit: { i: 4, t: u - 3.6 } };
  // the pinner (you, seat 4) gets a pop in the committed colour; Gus asks '?' (r2: not Finn, who wears person pins)
  const pops = [{ seat: 4, kind: 'pin', color: 'teal', t0: 3.7 }, { seat: 7, kind: 'question', t0: 0.5 }];
  return { u, dock, pie, pops };
}

export default {
  z: 80,
  async setup(hud) {
    const P = hud.P;
    const S = hud.emotes = {
      state: P('state', 'showcase'), armMode: P('arm', 'pin'), size: P('pie', 'mouse'), reduced: P('rm', '0') === '1', remove: P('remove', '0') === '1',
    };
    // tooltip state: the tooltip needs a real pin under it. With the markers group loaded (others=1) its hovered own pin
    // is already drawn; alone, draw that same pin through the markers API (setup order: other groups first).
    if (S.state === 'tooltip') { S.ownPin = !hud._markersM; S.M = await markersContext(hud); }
    // in-world pops (tier A), above the name labels; z after labels (indicators 20) and markers (30)
    hud.ui.add((L) => {
      const T = L.tok;
      let pops;
      if (S.state === 'anim') pops = timeline(L.t).pops.map((p) => ({ ...p, t0: p.t0 + Math.floor(L.t / ANIM_CYCLE) * ANIM_CYCLE }));
      else if (S.state === 'pops') pops = [['st', 'point'], [4, 'pin', 'teal'], [5, 'alert'], [7, 'question']].map(([seat, kind, color]) => ({ seat, kind, color, t0: -1 }));
      else if (S.state === 'showcase') {
        // looping showcase: '?' over the Storyteller, '!' over Esme (members without person pins / chat bubbles in the
        // mock HUD: the pop has no shared stack-top yet), each 3.5 s on + dissolve, restarting every 5 s
        pops = [['st', 'question', 0.2], [5, 'alert', 1.6]].map(([seat, kind, o]) => ({ seat, kind, t0: o + Math.floor((L.t - o) / 5) * 5 }));
      } else pops = [];
      for (const p of pops) {
        const m = p.seat === 'st' ? hud.st : hud.bySeat(p.seat);
        if (!m) continue;
        const ps = E.popState(L.t, p.t0, { reduced: S.reduced });
        if (ps.f < 0) continue;
        const x = L.at(m.feet()).x, top = stackTop(hud, m, L);   // tail tip 1 px above the label stack top
        const im = E.popFrame(p.kind, ps.f, T, p.color || 'gold');
        L.world.blit(im, x - E.POP.anchor.x, top - 1 - E.POP.anchor.y - ps.bob);
      }
      if (S.state === 'tooltip' && S.M) {
        // v2 tooltip anchor = the pin head's top (state.ts): own pin -> 'Your pin' (logic.ts pinTitle), removable
        const spot = S.M.ground(L, hud.place(OWN_PIN.r, OWN_PIN.ang));
        if (S.ownPin) drawPlacePin(L, S.M.frames(L), { spot, color: OWN_PIN.color, ...S.M.icon(hud.you || hud.bySeat(4), T), age: 9, settled: true, hover: true, still: true });
        E.drawPinTip(L.world, Math.round(spot.x), Math.round(spot.y) - MARKER_ANCHORS.pin.y - 2, 'Your pin · click to remove', T, { removable: true });
      }
    }, 35);
  },
  draw(hud, L) {
    const S = hud.emotes, T = L.tok, img = L.screen;
    const dockR = rect(SLOTS.emotes[0], img.w, img.h), pieR = rect(SLOTS.emotes[1], img.w, img.h);
    const btnR = rect(SLOTS.portraits[0], img.w, img.h);
    const cx = pieR.x + Math.floor(pieR.w / 2), cy = pieR.y + Math.floor(pieR.h / 2);
    const color = 'crimson';
    let dock = { tOpen: 99 }, pie = null, mode = 'pin', hover = null, mine = 2;
    const items = E.pieItems({ name: 'Bram', removable: S.remove || S.state === 'sticky' ? { mine: true } : null });
    switch (S.state) {
      case 'anim': { const tl = timeline(L.t); dock = tl.dock; pie = tl.pie; mode = tl.u > 3.7 && tl.u < 7 ? 'idle' : 'pin'; break; }
      case 'showcase': {
        const hot = Math.floor(L.t / 0.8) % items.length;   // sweep the wedges (a mouse circling the hub)
        pie = { tOpen: 99, hot }; hover = null; break;
      }
      case 'sticky': dock = { closed: true, hint: false }; pie = { tOpen: L.t, hot: null, sticky: true, size: 'touch', input: 'touch' }; break;
      case 'armed': dock = { closed: true, armed: true }; break;
      case 'hint': dock = { closed: true, hint: true }; break;
      case 'disabled': {
        mine = E.TIMING.MAX_PINS_PER_MEMBER; hover = 'clear';
        const off = new Set(items.map((it, i) => (it.kind === 'pin' ? i : -1)).filter((i) => i >= 0));
        pie = { tOpen: 99, hot: 0, off }; break;
      }
      default: dock = { closed: true };
    }
    // --- dock toggle ring + colour dot around the portraits group's button (bottom right)
    const open = !dock.closed && dock.tClose == null;
    img.blit(E.dockButton(T, { state: open ? 'open' : 'normal', color }), btnR.x, btnR.y);
    // --- dock panel (open pop / close dissolve)
    if (!dock.closed) {
      const kO = dock.tOpen != null ? (S.reduced ? 99 : g(dock.tOpen)) : 99;
      const tmp = new PixelImage(E.DOCK.w, E.DOCK.h + 2);
      const dockY = dockR.y + dockR.h - E.DOCK.h;   // bottom-aligned in the slot (the dock grew 9 px for the 3rd hint row)
      if (kO < 1) E.drawDock(tmp, 0, 1, T, { framesOnly: true });
      else E.drawDock(tmp, 0, 0, T, { mode, color, mine, hover });
      if (dock.tClose != null) {
        const k = E.gridK(dock.tClose, 2);
        if (S.reduced || k >= 3) return this.drawPieAt(img, cx, cy, T, S, pie, items, color);
        dissolve(tmp, [0.25, 0.5, 0.75][k]);
      }
      img.blit(tmp, dockR.x, dockY);
    } else if (dock.armed) {
      const z = E.armedSize(T, { mode: S.armMode || 'pin' });   // right-aligned with the dock, bottom on the slot bottom
      E.drawArmed(img, dockR.x + dockR.w - z.w, dockR.y + dockR.h - z.h, T, { mode: S.armMode || 'pin' });
    } else if (dock.hint) {
      E.drawHint(img, btnR.x + btnR.w, btnR.y - 2, T, { w: E.DOCK.w, tailX: btnR.x + 12 });
    }
    this.drawPieAt(img, cx, cy, T, S, pie, items, color);
  },
  drawPieAt(img, cx, cy, T, S, pie, items, color) {
    if (!pie) return;
    const size = pie.size || S.size;
    E.drawPie(img, cx, cy, T, { ...pie, size, input: pie.input || size, items, color, reduced: S.reduced, title: 'Point or pin' });
  },
};
