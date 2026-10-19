// v3 WP4 (v3-overlay). The gameplay overlay of the 3D town: draws gameplay/core.ts's GameplayFrame (the
// rules are the core's, shared with Classic) plus the teleport poof.
//
//   seat markers   gathered circle (outdoors, not night): the events atlas' `seat_you_0..3` pulsing on your
//                  own spot (+ the indicators `you_seat_*` chevron 1.25 m above it), `seat_dead_*` wisps on
//                  publicly dead seats, a faint `seat_stone` on the others (the 3D dais has the real stones)
//   hands          raised (`hand_raised_0/1`, 2.5 fps) / locked yes (`hand_locked`) above visible voters;
//                  dead voters use the `hand_ghost*` frames
//   hints          players only: bedtime → `door_ring_*` + bobbing `door_chevron` on your home door and a
//                  `guide_<heading>` arrow 0.85 m from your feet toward it; gathering → the arrow toward your
//                  spot. A target outside the view (unclipped projection) gets the `offscreen_<heading>`
//                  marker on the screen edge instead.
//   poof           `poof_0..5` (events atlas, 15 fps) where an avatar vanished / appeared on a teleport
//                  (own: reason ≠ 'correction'; remote: a jump > 48 px in the same place, e.g. the ST)
//
// Secrecy: GameplayFrame is derived from the viewer's own views (public data + own seat); hands only for
// voters this client can see in its own location; nothing outdoors at night.
import type { WorldTeleport } from '@ct/protocol';
import { edgePoint, headingOf } from './anchors';
import type { OverlayEnv, OverlayFrame, OverlayView } from './types';

const SEAT = { x: 9, y: 5 };
const SEAT_DEAD = { x: 9, y: 13 };
const HAND = { x: 4, y: 12 };
const DOOR_RING = { x: 15, y: 7 };
const DOOR_CHEVRON = { x: 5, y: 6 };
const POOF = { x: 16, y: 38 };
const POOF_FPS = 15;
const POOF_FRAMES = 6;
/** Remote jumps larger than this (px) in one step are teleports (§3: ST jump > 48 px → poof). */
export const POOF_JUMP_PX = 48;

interface Poof {
  x: number;
  y: number;
  location: string;
  t0: number;
}

export interface GameplayView extends OverlayView {
  poofs(): number;
}

export function createGameplayView(env: OverlayEnv): GameplayView {
  const { deps, atlas } = env;
  const poofs: Poof[] = [];
  const lastPos = new Map<string, { x: number; y: number; location: string }>();
  let myLast: { x: number; y: number; location: string } | null = null;
  let pendingTeleport: WorldTeleport | null = null;
  const off = deps.conn.events.on('world:teleport', (t: WorldTeleport) => {
    if (t.reason !== 'correction') pendingTeleport = t;
  });

  // reused projection outputs (no per-frame allocation)
  const fromBuf = { x: 0, y: 0 };
  const toBuf = { x: 0, y: 0 };
  const gBuf = { x: 0, y: 0 };
  const pt = { x: 0, y: 0 };
  const at = { x: 0, y: 0 };
  const at2 = { x: 0, y: 0 };
  const addPoof = (x: number, y: number, location: string, now: number) => {
    if (poofs.length > 24) poofs.shift();
    poofs.push({ x, y, location, t0: now });
  };

  function trackPoofs(f: OverlayFrame) {
    const now = f.now;
    const me = f.state.me;
    if (pendingTeleport) {
      const t = pendingTeleport;
      pendingTeleport = null;
      if (myLast && myLast.location === t.location && Math.hypot(myLast.x - t.x, myLast.y - t.y) > 4) addPoof(myLast.x, myLast.y, myLast.location, now);
      addPoof(t.x, t.y, t.location, now);
    }
    if (me) {
      myLast ??= { x: 0, y: 0, location: '' };
      myLast.x = me.x;
      myLast.y = me.y;
      myLast.location = me.location;
    } else myLast = null;
    for (const [pid, p] of f.state.remotes) {
      const prev = lastPos.get(pid);
      if (prev && prev.location === p.location && Math.hypot(prev.x - p.x, prev.y - p.y) > POOF_JUMP_PX) {
        addPoof(prev.x, prev.y, p.location, now);
        addPoof(p.x, p.y, p.location, now);
      }
      if (prev) {
        prev.x = p.x;
        prev.y = p.y;
        prev.location = p.location;
      } else lastPos.set(pid, { x: p.x, y: p.y, location: p.location });
    }
    for (const pid of lastPos.keys()) if (!f.state.remotes.has(pid)) lastPos.delete(pid);
    const life = (POOF_FRAMES / POOF_FPS) * 1000;
    for (let i = poofs.length - 1; i >= 0; i--) {
      const p = poofs[i]!;
      const age = now - p.t0;
      if (age >= life) {
        poofs.splice(i, 1);
        continue;
      }
      if (p.location !== f.location) continue;
      if (!f.project(p, 0, at)) continue;
      const fi = f.still ? 2 : Math.min(POOF_FRAMES - 1, Math.floor((age / 1000) * POOF_FPS));
      f.fx.blit(atlas.frame('events', `poof_${fi}`, f.night), at.x, at.y, POOF.x, POOF.y, f.still ? 1 - age / life : 1);
    }
  }

  /**
   * Arrow 0.85 m from the feet toward a world target, or, when the target lies outside the view inset by 12
   * texels, the `offscreen_<heading>` marker on that inset edge toward it. The target uses the UNCLIPPED
   * projection (frame.projectFree): a clipped worldToScreen is null for exactly the targets that need a marker.
   */
  function guide(f: OverlayFrame, target: { x: number; y: number }) {
    const me = f.state.me;
    const from = f.byPid.get(f.state.myPid ?? '')?.foot ?? (me ? f.project(me, 0, fromBuf) : null);
    if (!me) return;
    const to = f.projectFree(target, 0, toBuf);
    if (to) {
      const edge = edgePoint(to, f.w, f.h, 12 * f.px);
      if (edge) {
        const hd = headingOf(to.x - f.w / 2, to.y - f.h / 2);
        f.fx.blit(atlas.frame('indicators', `offscreen_${hd}`, f.night), edge.x, edge.y, 23, 23);
        return;
      }
    }
    if (!from) return;
    const d = Math.hypot(target.x - me.x, target.y - me.y);
    if (d < 1) return;
    const k = Math.min(d, 0.85 * 16 + (f.still ? 0 : (Math.floor(f.now / 500) % 2) * 0.12 * 16)) / d;
    pt.x = me.x + (target.x - me.x) * k;
    pt.y = me.y + (target.y - me.y) * k;
    const g = f.project(pt, 0, gBuf);
    if (!g) return;
    const ref = to ?? g;
    const hd = headingOf(ref.x - from.x, ref.y - from.y);
    const fr = atlas.frame('indicators', `guide_${hd}`, f.night);
    if (fr) f.fx.blit(fr, g.x, g.y, fr.w >> 1, fr.h >> 1);
    else f.fx.ellipse(g.x, g.y, 2, 2, f.tokens.gold);
  }

  function update(f: OverlayFrame) {
    trackPoofs(f);
    const gf = deps.gameplay?.() ?? null;
    if (!gf) return;
    const px = f.px;
    const n = f.night;
    const seatStep = f.still ? 0 : Math.floor(f.now / 400) % 4; // seat_you 2.5 fps
    // seat markers
    for (let i = 0; i < gf.markers.length; i++) {
      const m = gf.markers[i]!;
      if (!f.project(m, 0, at)) continue;
      if (m.mine) {
        f.fx.blit(atlas.frame('events', `seat_you_${seatStep}`, n), at.x, at.y, SEAT.x, SEAT.y);
        const chev = f.project(m, 1.25, at2);
        const fr = atlas.frame('indicators', `you_seat_${f.still ? 0 : Math.floor(f.now / 500) % 2}`, n);
        if (chev && fr) f.fx.blit(fr, chev.x, chev.y, fr.w >> 1, fr.h);
      } else if (m.dead) f.fx.blit(atlas.frame('events', `seat_dead_${f.still ? 0 : Math.floor(f.now / 500) % 2}`, n), at.x, at.y, SEAT_DEAD.x, SEAT_DEAD.y, 0.9);
      else f.fx.blit(atlas.frame('events', 'seat_stone', n), at.x, at.y, SEAT.x, SEAT.y, 0.45);
    }
    // raised / locked hands
    if (gf.hands.length) {
      const players = gf.view?.players ?? [];
      const step = f.still ? 0 : Math.floor(f.now / 400) % 2;
      for (let i = 0; i < gf.hands.length; i++) {
        const h = gf.hands[i]!;
        const a = f.byPid.get(h.pid);
        // a drawn voter whose head is off the canvas: nothing to draw; a voter without a body yet: its spot
        const head = a ? a.head : f.drawn.has(h.pid) ? null : f.project(h, 1.4, at);
        if (!head) continue;
        let dead = false;
        for (let j = 0; j < players.length; j++) if (players[j]!.pid === h.pid) dead = players[j]!.alive === false;
        const name = dead ? (h.locked ? 'hand_ghost_locked' : 'hand_ghost') : h.locked ? 'hand_locked' : `hand_raised_${step}`;
        const x = a?.label ? a.label.x + a.label.w + 2 * px : head.x + 8 * px;
        f.fx.blit(atlas.frame('events', name, n), x, head.y - 2 * px, HAND.x, HAND.y);
      }
    }
    // hints
    const hint = gf.hint;
    if (hint?.kind === 'home') {
      const door = f.project(hint.door, 0, at);
      if (door) {
        const ringStep = f.still ? 0 : Math.floor(f.now / 400) % 4;
        f.fx.blit(atlas.frame('indicators', `door_ring_${ringStep}`, n), door.x, door.y, DOOR_RING.x, DOOR_RING.y);
        const top = f.project(hint.door, 1.8, at2);
        if (top) f.fx.blit(atlas.frame('indicators', 'door_chevron', n), top.x, top.y - (f.still ? 0 : (Math.floor(f.now / 500) % 2) * px), DOOR_CHEVRON.x, DOOR_CHEVRON.y);
      }
      if (hint.arrow) guide(f, hint.door);
    } else if (hint?.kind === 'seat') guide(f, hint.spot);
  }

  return {
    update,
    poofs: () => poofs.length,
    destroy() {
      off();
      poofs.length = 0;
      lastPos.clear();
    },
  };
}
