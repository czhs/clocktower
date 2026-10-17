// Kit placeholders for the mock HUD (owner: UI lead). One function per element group draws that group's slot in the
// BASELINE kit style (docs/UI.md §2) so the mock HUD is complete before any group lands, and so every group sees the
// neighbours it must sit next to. A group replaces its placeholder by shipping src/ui/<group>/hud.js (docs/UI.md §3.3).
// Positions here ARE the slot contract (SLOTS): groups may refine sizes inside their slot, not move them elsewhere.
//
//   PLACEHOLDERS[group](hud)  registers draw functions on hud.ui (hud from scenes/ui-hud.js buildHudStage)
//   SLOTS[group]              screen-layer rects (640x360 coords) and/or world anchors the group owns
//   drawSlots(hud, L)         debug: dashed slot rects + tags (?slots=1)
import * as THREE from 'three';
import { PixelImage, drawText, textWidth, wrapText, drawBox, frameAt, PIN_RAMPS, PIN_COLORS, mix } from './kit.js';

/** Screen-space slots (x, y, w, h in the 640x360 screen layer; right/bottom anchored ones resolved by `rect`). */
// Indices are part of the contract (groups read SLOTS.hud[i]): new slots are APPENDED. Module fix 2026-10-17: role chip
// 150 -> 180 (v2 'ROLE · ⌂ House · badge' for Undertaker + Ravenscroft needs 168), toasts 170 -> 150 wide (the column
// covered the north-east seats' chat bubbles at the game camera), + voice pill, clock card, touch joystick (hud), vote
// clock + moment banner (events). `transient: true` = shown only while that UI is up (not a permanent keep-out).
// UI integration r2: the mock pie moved off the circle (410,214 -> 420,268, over the grass right of Dov): its caption
// plate sat on Dov's label ring and the right third was overcrowded (whole-screen critic).
export const SLOTS = {
  hud: [
    { name: 'role chip', x: 4, y: 4, w: 180, h: 13 },
    { name: 'clock chip', x: 'c', y: 4, w: 168, h: 15 },
    { name: 'toolbar', x: -4, y: 4, w: 126, h: 15 },
    { name: 'phase chip', x: -4, y: 22, w: 44, h: 11 },
    { name: 'toasts', x: -4, y: 38, w: 150, h: 40 },
    { name: 'hint pill', x: 'c', y: -60, w: 120, h: 13 },
    { name: 'voice pill', x: -32, y: -4, w: 64, h: 14 },
    { name: 'clock card (vote / tray / result; below the phase caption while one shows)', x: 'c', y: 24, w: 168, h: 40, transient: true },
    { name: 'touch joystick (phones)', x: 4, y: -4, w: 56, h: 56, transient: true },
  ],
  panels: [{ name: 'side panel (notebook / lobby / storyteller)', x: 4, y: 24, w: 132, h: 158 }],
  emotes: [{ name: 'social dock', x: -32, y: -34, w: 96, h: 70 }, { name: 'pie menu (at the pointer)', x: 420, y: 268, w: 76, h: 76, transient: true, pointer: true }],
  portraits: [{ name: 'dock / voice portrait button', x: -4, y: -4, w: 24, h: 24 }],
  indicators: [{ name: 'home compass pill', x: 'c', y: -4, w: 132, h: 14 }, { name: 'labels, bubbles, talking (world)', world: true }],
  markers: [{ name: 'finger, trail, ping, pins (world)', world: true }],
  events: [{ name: 'phase caption', x: 'c', y: 24, w: 210, h: 13, transient: true }, { name: 'seat markers, vote hand, ghost, poof (world)', world: true },
    { name: 'vote clock', x: 4, y: 188, w: 69, h: 90, transient: true },
    { name: 'moment banner (game start / end, death; world labels under it may be covered for its 4 s)', x: 'c', y: 96, w: 300, h: 48, transient: true }],
};
/**
 * Screen keep-out rects (module fix: indicators / hud request): every screen slot the HUD occupies, resolved to
 * {x, y, w, h, group, name} in screen coords (space 'world' = L.world coords, + MARGIN). World UI (bubbles, offscreen
 * arrows) can clamp around them. opts: transient (include slots shown only briefly, default false), groups (filter).
 */
export function keepOutRects(W, H, { transient = false, groups = null, space = 'screen', margin = 0 } = {}) {
  const out = [];
  for (const [g, list] of Object.entries(SLOTS)) {
    if (groups && !groups.includes(g)) continue;
    for (const s of list) {
      if (s.world || s.pointer || (s.transient && !transient)) continue;
      const r = rect(s, W, H);
      out.push({ x: r.x + (space === 'world' ? margin : 0), y: r.y + (space === 'world' ? margin : 0), w: r.w, h: r.h, group: g, name: s.name });
    }
  }
  return out;
}
/** Resolve a slot rect against the screen size: x 'c' = centred, negative x / y = from the right / bottom edge. */
export function rect(s, W, H) {
  const x = s.x === 'c' ? Math.floor((W - s.w) / 2) : s.x < 0 ? W + s.x - s.w : s.x;
  const y = s.y === 'c' ? Math.floor((H - s.h) / 2) : s.y < 0 ? H + s.y - s.h : s.y;
  return { x, y, w: s.w, h: s.h };
}
const slot = (g, i, L) => rect(SLOTS[g][i], L.screen.w, L.screen.h);
const GROUP_TINT = { markers: '#E36E5E', emotes: '#E3BD62', indicators: '#8DB8E6', portraits: '#CFA6E8', hud: '#96C77E', panels: '#E8A24A', events: '#7FD3D0' };

export function drawSlots(hud, L, only = null) {
  for (const [g, list] of Object.entries(SLOTS)) {
    if (only && !only.includes(g)) continue;
    list.forEach((s, i) => {
      if (s.world) return;
      const r = slot(g, i, L), c = GROUP_TINT[g];
      L.screen.dotted(r.x - 1, r.y - 1, r.x + r.w, r.y - 1, c, { on: 2, off: 2 });
      L.screen.dotted(r.x - 1, r.y + r.h, r.x + r.w, r.y + r.h, c, { on: 2, off: 2 });
      L.screen.dotted(r.x - 1, r.y - 1, r.x - 1, r.y + r.h, c, { on: 2, off: 2 });
      L.screen.dotted(r.x + r.w, r.y - 1, r.x + r.w, r.y + r.h, c, { on: 2, off: 2 });
      const below = r.y + r.h + 9 <= L.screen.h;   // bottom-anchored slots: tag above the rect
      drawText(L.screen, Math.min(r.x, L.screen.w - textWidth(g, 'tiny') - 2), below ? r.y + r.h + 2 : r.y - 8, `${g}`, { font: 'tiny', color: c, outline: '#13121F' });
    });
  }
}

// ------------------------------------------------------------------------------------------------ shared bits
/** Name label (indicators placeholder; also used by markers/events placeholders to find label tops). */
function labelBox(L, m, T) {
  const p = L.at(m.head());
  const color = m.st ? T.st : m.ghost ? T.ghost : T.labelText;
  const w = textWidth(m.name) + 2;
  return { x: p.x - Math.floor(w / 2), y: p.y - 11, w, h: 10, color, cx: p.x, top: p.y - 11 };
}
function drawPin(img, x, y, color, T, initial = '') {
  // placeholder pin, tip at (x, y): head disc r5 + 3-row point, icon disc r3 (parchment) with an initial
  const R = PIN_RAMPS[color];
  const p = new PixelImage(13, 17);
  p.disc(6.5, 6.5, 6, R.mid);
  for (let j = 0; j < 4; j++) p.rect(6 - (3 - j), 11 + j, 1 + 2 * (3 - j), 1, R.sh);
  p.rect(6, 15, 1, 1, R.sh);
  p.disc(5.5, 5.5, 3, R.hi);
  p.disc(6.5, 6.5, 4, T.parchment);
  if (initial) drawText(p, 6, 3, initial, { font: 'tiny', color: T.textInk, align: 'center' });
  p.outline(R.line);
  img.blit(p, x - 6, y - 16);
}

// ------------------------------------------------------------------------------------------------ placeholders
export const PLACEHOLDERS = {
  indicators(hud) {
    hud.ui.add((L) => {
      const T = L.tok;
      for (const m of [...hud.cast, hud.st].filter(Boolean)) {
        const b = labelBox(L, m, T);
        drawText(L.world, b.cx, b.top, m.name, { color: b.color, outline: T.labelLine, align: 'center' });
        if (m.you) {
          // own marker: gold "You" chevron under the name
          const cx = b.cx, y = b.top - 6;
          for (let j = 0; j < 3; j++) L.world.hline(cx - 2 + j, y + j, 5 - 2 * j, T.gold);
          L.world.outline(T.goldLine, { only: [cx - 4, y - 2, 9, 7] });
        }
        if (m.clip === 'talk') {
          // talking glyph: 3 bars beside the name (stepped 10 fps)
          const k = frameAt(L.t, 10, 4);
          const gx = b.x + b.w + 3, gy = b.top + 1;
          const hs = [[3, 5, 3], [5, 3, 5], [4, 6, 2], [2, 4, 6]][k];
          L.world.rect(gx - 1, gy - 1, 9, 9, T.labelLine);
          hs.forEach((h, i) => L.world.rect(gx + 1 + i * 2, gy + 3 - Math.floor(h / 2), 1, h, T.talk));
        }
      }
      // speech bubble over the first talker
      const talker = hud.cast.find((m) => m.clip === 'talk');
      if (talker) {
        const b = labelBox(L, talker, T);
        const lines = wrapText('Something was scratching at my door all night.', 70, { maxLines: 3 });
        const w = Math.max(...lines.map((l) => textWidth(l))) + 8, h = lines.length * 9 + 5;
        const x = b.cx - Math.floor(w / 2), y = b.top - h - 5;
        drawBox(L.world, x, y, w, h, 'bubble', T);
        // tail
        L.world.rect(b.cx - 2, y + h - 1, 4, 1, T.bubble); L.world.rect(b.cx - 1, y + h, 2, 1, T.bubble);
        L.world.set(b.cx - 3, y + h - 1, T.outline); L.world.set(b.cx + 2, y + h - 1, T.outline);
        L.world.set(b.cx - 2, y + h, T.outline); L.world.set(b.cx + 1, y + h, T.outline);
        L.world.rect(b.cx - 1, y + h + 1, 2, 1, T.outline);
        lines.forEach((l, i) => drawText(L.world, b.cx, y + 3 + i * 9, l, { color: T.text, align: 'center' }));
      }
    }, 20);
    // home compass pill (screen, bottom centre)
    hud.ui.add((L) => {
      const T = L.tok, r = slot('indicators', 0, L);
      drawBox(L.screen, r.x, r.y, r.w, r.h, 'chipGold', T);
      L.screen.disc(r.x + 7, r.y + 7, 4.5, T.inkSunk);
      L.screen.ring(r.x + 7, r.y + 7, 5, 5, T.goldSh);
      drawText(L.screen, r.x + 7, r.y + 4, '→', { color: T.gold, align: 'center' });
      drawText(L.screen, r.x + 16, r.y + 4, 'Your home', { color: T.text });
      drawText(L.screen, r.x + 16 + textWidth('Your home') + 4, r.y + 5, '22 steps', { font: 'tiny', color: T.textDim });
    }, 50);
  },

  markers(hud) {
    hud.ui.add((L) => {
      const T = L.tok;
      const from = hud.cast.find((m) => m.clip === 'point'), to = hud.bySeat(3);
      if (from && to) {
        const a = L.at(from.head()), b = L.at(to.feet());
        // dotted trail, marching at 7.5 fps
        L.world.dotted(a.x, a.y, b.x, b.y - 2, T.gold, { on: 1, off: 3, phase: -frameAt(L.t, 7.5, 4), skipStart: 10, skipEnd: 6 });
        // finger (placeholder: fist + index toward the target)
        const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
        const fx = Math.round(a.x + d.x * 10), fy = Math.round(a.y - 4 + d.y * 10);
        const f = new PixelImage(15, 15);
        f.disc(7.5, 7.5, 3, T.parchmentHi);
        f.line(7, 7, Math.round(7 + d.x * 6), Math.round(7 + d.y * 6), T.parchmentHi);
        f.outline(T.parchmentLine);
        L.world.blit(f, fx - 7, fy - 7);
        // ping at the target's feet: 4 rings at 10 fps
        const k = frameAt(L.t, 10, 4);
        L.ground.ring(b.x, b.y, 4 + k * 2, 2 + k, k < 3 ? T.gold : T.goldSh);
      }
      // place pin on the ground + person pin over seat 2
      const g = hud.place(2.6, 140);
      const gp = L.at(g.setY(hud.terrain.heightAt(g.x, g.z)));
      L.ground.ellipse(gp.x, gp.y, 4, 1.5, [18, 14, 25, 255]);
      drawPin(L.world, gp.x, gp.y - frameAt(L.t, 2, 2), 'teal', T, 'A');
      const p2 = hud.bySeat(2);
      if (p2) { const b2 = labelBox(L, p2, T); drawPin(L.world, b2.cx, b2.top - 2, 'crimson', T, 'D'); }
    }, 30);
  },

  events(hud) {
    hud.ui.add((L) => {
      const T = L.tok;
      // seat markers: numbered discs on the ground just in front of each seat (placeholder for 3D markers, tier W)
      for (const m of hud.cast) {
        const s = m.pos.clone().multiplyScalar(1.17);
        const p = L.at(s.setY(hud.terrain.heightAt(s.x, s.z)));
        L.ground.ellipse(p.x, p.y, 5, 3, m.ghost ? T.ghostSh : T.ironSh);
        L.ground.ring(p.x, p.y, 5, 3, m.you ? T.gold : T.outline);
        drawText(L.ground, p.x, p.y - 2, String(m.seat), { font: 'tiny', color: m.you ? T.goldHi : T.text, align: 'center' });
      }
      // raised hand over the voter (vote)
      const v = hud.cast.find((m) => m.clip === 'vote');
      if (v) {
        const b = labelBox(L, v, T), x = b.x + b.w + 2, y = b.top - 1 - frameAt(L.t, 4, 2);
        const h = new PixelImage(9, 10);
        h.rect(2, 3, 5, 5, T.parchment); for (let i = 0; i < 4; i++) h.rect(2 + i, 0 + (i % 2), 1, 3, T.parchment);
        h.rect(2, 7, 5, 1, T.gold); h.outline(T.goldLine);
        L.world.blit(h, x, y);
      }
    }, 5);
    hud.ui.add((L) => {
      const T = L.tok, r = slot('events', 0, L);
      // phase caption: italic-free plain line on a thin ink band, gold rule left (v2 .ct-game-caption)
      const s = hud.tod === 'night' ? 'Night falls. You are alone in your home.' : 'Dawn breaks over Hollowmere.';
      const w = textWidth(s) + 12;
      const x = Math.floor((L.screen.w - w) / 2);
      drawBox(L.screen, x, r.y, w, r.h, 'tooltip', T);
      drawText(L.screen, x + 6, r.y + 3, s, { color: T.text });
    }, 60);
  },

  hud(hud) {
    hud.ui.add((L) => {
      const T = L.tok;
      // role chip
      let r = slot('hud', 0, L);
      drawBox(L.screen, r.x, r.y, r.w, r.h, 'chip', T);
      drawText(L.screen, r.x + 6, r.y + 4, 'UNDERTAKER', { font: 'tiny', color: T.good });
      const hx = r.x + 6 + textWidth('UNDERTAKER', 'tiny') + 5;
      drawBox(L.screen, hx, r.y + 2, r.w - (hx - r.x) - 3, r.h - 4, 'chip', T);
      drawText(L.screen, hx + 5, r.y + 3, 'Ravenscroft', { color: T.textDim });
      // clock chip: mini dial (wedge = time left) + label + time
      r = slot('hud', 1, L);
      drawBox(L.screen, r.x, r.y, r.w, r.h, 'chipGold', T);
      const cx = r.x + 9, cy = r.y + 7.5, left = 0.62;
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
        if (x * x + y * y > 25) continue;
        const ang = (Math.atan2(x + 0.5, -(y + 0.5)) / (2 * Math.PI) + 1) % 1;
        L.screen.set(Math.floor(cx + x), Math.floor(cy + y), ang < left ? T.gold : T.goldSh);
      }
      L.screen.ring(cx, cy, 6, 6, T.goldLine);
      drawText(L.screen, r.x + 19, r.y + 5, 'NOMINATIONS IN', { font: 'tiny', color: T.textDim });
      drawText(L.screen, r.x + 19 + textWidth('NOMINATIONS IN', 'tiny') + 5, r.y + 4, '5:51', { color: T.gold });
      drawBox(L.screen, r.x + r.w - 32, r.y + 2, 29, r.h - 4, 'chip', T);
      drawText(L.screen, r.x + r.w - 18, r.y + 4, '+time', { font: 'tiny', color: T.text, align: 'center' });
      // toolbar: notebook / settings / help / leave
      r = slot('hud', 2, L);
      let x = r.x;
      for (const [w, s, st] of [[15, '≡', 'gold'], [15, '⚙', 'raised'], [15, '?', 'raised'], [r.w - 51, '← Leave', 'raised']]) {
        drawBox(L.screen, x, r.y, w, r.h, st, T);
        drawText(L.screen, x + Math.floor(w / 2), r.y + 4, s, { color: st === 'gold' ? T.goldHi : T.text, align: 'center' });
        x += w + 2;
      }
      // phase chip
      r = slot('hud', 3, L);
      drawBox(L.screen, r.x, r.y, r.w, r.h, 'chip', T);
      drawText(L.screen, r.x + 6, r.y + 3, 'DAY 1', { font: 'tiny', color: T.text });
      L.screen.disc(r.x + r.w - 8.5, r.y + 5.5, 2.5, T.gold);
      // toasts
      r = slot('hud', 4, L);
      const toasts = ['Ada nominates Cleo.', 'Bram received 4 votes (needed 3).'];
      toasts.forEach((s, i) => {
        const y = r.y + i * 16;
        drawBox(L.screen, r.x, y, r.w, 14, 'panel', T);
        L.screen.vline(r.x + 2, y + 2, 10, T.gold);
        drawText(L.screen, r.x + 6, y + 4, s, { color: T.text });
      });
      // hint pill
      r = slot('hud', 5, L);
      drawBox(L.screen, r.x, r.y, r.w, r.h, 'chip', T);
      drawText(L.screen, r.x + Math.floor(r.w / 2), r.y + 4, 'Seated (seat 4).', { color: T.ok, align: 'center' });
    }, 60);
  },

  panels(hud) {
    hud.ui.add((L) => {
      const T = L.tok, r = slot('panels', 0, L);
      const inner = drawBox(L.screen, r.x, r.y, r.w, r.h, 'panel', T);
      drawText(L.screen, inner.x + 4, inner.y + 3, 'Notebook', { color: T.gold });
      drawText(L.screen, inner.x + inner.w - 3, inner.y + 4, 'SAVED', { font: 'tiny', color: T.ok, align: 'right' });
      L.screen.hline(inner.x, inner.y + 13, inner.w, T.ironSh);
      hud.cast.slice(0, 4).forEach((m, i) => {
        const y = inner.y + 17 + i * 26;
        drawBox(L.screen, inner.x + 2, y, inner.w - 4, 24, 'raised', T);
        drawText(L.screen, inner.x + 20, y + 3, m.name, { color: T.text });
        drawText(L.screen, inner.x + 20, y + 13, `SEAT ${m.seat}`, { font: 'tiny', color: T.textDim });
        let bx = inner.x + inner.w - 38;
        for (const s of ['*', '?', '×']) { drawBox(L.screen, bx, y + 4, 11, 11, i === 1 && s === '?' ? 'gold' : 'sunk', T); drawText(L.screen, bx + 5, y + 6, s, { font: s === '×' ? 'tiny' : 'body', color: T.text, align: 'center' }); bx += 12; }
      });
      drawBox(L.screen, inner.x + 2, r.y + r.h - 18, inner.w - 4, 14, 'gold', T);
      drawText(L.screen, inner.x + Math.floor(inner.w / 2), r.y + r.h - 14, 'Leave', { color: T.goldHi, align: 'center' });
    }, 70);
  },

  portraits(hud) {
    hud.ui.add((L) => {
      const T = L.tok, r = slot('portraits', 0, L);
      drawBox(L.screen, r.x, r.y, r.w, r.h, 'gold', T);
      L.screen.rect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, T.inkSunk);
      drawText(L.screen, r.x + 12, r.y + 8, 'D', { color: T.textDim, align: 'center' });
      L.screen.disc(r.x + r.w - 2.5, r.y + r.h - 2.5, 2.5, T.ok);
      L.screen.ring(r.x + r.w - 2.5, r.y + r.h - 2.5, 3, 3, T.outline);
      // panel avatars (12x12 discs with initials) - sit in the panels placeholder rows
      const pr = slot('panels', 0, L);
      hud.cast.slice(0, 4).forEach((m, i) => {
        const x = pr.x + 7, y = pr.y + 2 + 17 + i * 26 + 6;
        L.screen.disc(x + 6, y + 6, 6, mix(T.ironHi, T.ink, 0.3));
        L.screen.ring(x + 6, y + 6, 6, 6, T.outline);
        drawText(L.screen, x + 6, y + 3, m.name[0], { color: T.text, align: 'center' });
      });
    }, 75);
  },

  emotes(hud) {
    hud.ui.add((L) => {
      const T = L.tok;
      // social dock (bottom right, left of the portrait button)
      let r = slot('emotes', 0, L);
      const inner = drawBox(L.screen, r.x, r.y, r.w, r.h, 'panel', T);
      drawBox(L.screen, inner.x + 1, inner.y + 1, 44, 14, 'raised', T); drawText(L.screen, inner.x + 23, inner.y + 5, 'Point', { color: T.text, align: 'center' });
      drawBox(L.screen, inner.x + 47, inner.y + 1, 43, 14, 'pressed', T); drawText(L.screen, inner.x + 68, inner.y + 5, 'Pin', { color: T.text, align: 'center' });
      PIN_COLORS.forEach((c, i) => {
        const x = inner.x + 3 + i * 11, y = inner.y + 19;
        if (i === 1) drawBox(L.screen, x - 2, y - 2, 11, 13, 'chipGold', T);
        L.screen.disc(x + 3.5, y + 3.5, 3.5, PIN_RAMPS[c].mid); L.screen.set(x + 3, y + 8, PIN_RAMPS[c].sh);
        L.screen.outline(PIN_RAMPS[c].line, { only: [x - 1, y - 1, 9, 11] });
      });
      drawBox(L.screen, inner.x + 1, inner.y + 33, inner.w - 2, 12, 'sunk', T);
      drawText(L.screen, inner.x + Math.floor(inner.w / 2), inner.y + 36, 'CLEAR MY PINS', { font: 'tiny', color: T.textDim, align: 'center' });
      drawText(L.screen, inner.x + 2, inner.y + 50, 'RMB POINT  F PIN', { font: 'tiny', color: T.textDim });
      // pie menu (open at the pointer): Point + 8 colours on a ring, hub, caption
      r = slot('emotes', 1, L);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      L.screen.disc(cx, cy, 34, T.outline); L.screen.disc(cx, cy, 33, T.ink); L.screen.disc(cx, cy, 13, T.outline); L.screen.disc(cx, cy, 12, T.inkSunk);
      const items = ['point', ...PIN_COLORS];
      const hot = frameAt(L.t, 1, items.length);
      items.forEach((it, i) => {
        const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * 23), y = Math.round(cy + Math.sin(a) * 23);
        if (i === hot) L.screen.disc(x, y, 8, T.inkRaised);
        if (it === 'point') drawText(L.screen, x, y - 3, '→', { color: T.parchmentHi, align: 'center' });
        else { L.screen.disc(x, y, 4, PIN_RAMPS[it].mid); L.screen.ring(x, y, 4, 4, PIN_RAMPS[it].line); }
      });
      L.screen.disc(cx, cy, 2, T.gold);
      const cap = items[hot] === 'point' ? 'Point' : `Pin Bram · ${items[hot]}`;
      const w = textWidth(cap) + 10;
      drawBox(L.screen, Math.floor(cx - w / 2), r.y - 16, w, 13, 'tooltip', T);
      drawText(L.screen, Math.floor(cx), r.y - 12, cap, { color: T.text, align: 'center' });
    }, 80);
  },
};
