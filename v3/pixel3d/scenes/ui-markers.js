// Markers scene (owner: markers group; docs/UI.md §3.3/§4). The mock town square of scenes/ui-hud.js with the markers
// group's elements over it, at the game camera (vh 12), day or night, with the cast. Name labels come from the
// indicators group module when it exists, else the kit placeholder (pins sit on the labels).
//
//   index.html?scene=ui-markers[&state=live|all|point|drop|pick|depth|variants][&pointer=new|v2][&book=held|big][&tod=noon|golden|night][&still=1][&labels=0][&t=<s>]
//   tools/shot.sh ui-markers shots/ui-markers/r2/all.png --size 1280x720 --t 1 --q "state=all"
//
// States
//   live   the HUD slot moment (src/ui/markers/hud.js): a point, place pins (one dropping + removed), person pins
//   all    every element at once at 1:1: the 8-direction finger rose around the Storyteller, the 8 pin colours on the
//          cobbles (shadows + dropper icons, your own with the remove badge), ping_0..3 and pin_drop_0..3 laid out on
//          the ground, trail dots, the place chevron, the Storyteller pick crosshair frames
//   point  four people point at once (person targets + a place), staggered, 4.2 s loop  -> 1x GIF
//   drop   place pins and person pins drop, land, sparkle; one is removed; 3.2 s loop  -> 1x GIF
//   pick   the Storyteller pick crosshair with its label, 1.07 s loop                  -> 1x GIF
//          (the label steps to the free side of the crosshair when a name label is in the way)
//   depth  place pins around characters: pins BEHIND Bram / Finn / Cleo are hidden by them, pins IN FRONT of Finn /
//          Gus cover them (depth-tested pin pass, src/ui/markers/pinPass.js); one drops behind Finn on a 3.2 s loop
//   variants  the four combinations Notebook held / big x Pointer new / v2 size side by side (src/ui/notebook/variants.js)
//   (any state + ?pointer=v2 draws the v2-size finger: hud.uiOptions.pointerScale, scenes/ui-hud.js)
// still=1 = reduced motion (no pop, bob, marching, pulsing; drops land at once).
// Every state is registered through M.register (draw.js phases): depth-tested pins, trail at z 15, the rest at z 30.
import { buildHudStage } from './ui-hud.js';
import { PLACEHOLDERS } from '../src/ui/placeholders.js';
import { drawText } from '../src/ui/kit.js';
import { PIN_COLORS, POINT_DIRS, POINT_VEC, POINT } from '../src/ui/markers/art.js';
import { drawPoint, drawPlacePin, drawPersonPins, drawPick, put } from '../src/ui/markers/draw.js';
import { markersContext } from '../src/ui/markers/stage.js';
import { drawLive } from '../src/ui/markers/hud.js';
import { frameAt } from '../src/ui/kit.js';
import * as THREE from 'three';
import { installVariants, VARIANT_CAST } from '../src/ui/notebook/variants.js';

export default async function build(engine, params) {
  const variants = params.get('state') === 'variants';
  const hud = await buildHudStage(engine, params, variants ? { cast: VARIANT_CAST } : undefined);
  const P = hud.P, state = P('state', 'live'), still = P('still', '0') === '1';
  // indicators config: keep Cleo's chat bubble, drop Bram's (his name carries the person-pin fan here)
  const cleo = hud.bySeat(3);
  hud.indicatorsConfig = { bubbles: cleo && !variants ? [{ m: cleo, text: 'Something was scratching at my door all night.', at: 0, period: 9 }] : [] };
  if (P('labels', '1') !== '0') {
    let ind = null;
    try { ind = (await import('../src/ui/indicators/hud.js')).default; } catch (e) {
      if (!/fetch|import|Failed|404|not found/i.test(String(e.message))) throw e;
    }
    if (ind?.draw) { await ind.setup?.(hud); hud.ui.add((L) => ind.draw(hud, L), ind.z ?? 20); }
    else PLACEHOLDERS.indicators(hud);
  }
  const M = await markersContext(hud);
  engine.stats.markers = { state, still, icons: M.iconsFrom, pointerScale: hud.uiOptions?.pointerScale };
  if (variants) { await installVariants(hud, { still }); return; }
  const mod = (x, n) => ((x % n) + n) % n;
  const draw = {
    live: (L) => drawLive(hud, L, M, { still }),

    all: (L) => {
      const F = M.frames(L), T = L.tok, t = L.t;
      // 8 pins on an arc of the near cobbles, each dropped by a cast member (icon in the socket)
      PIN_COLORS.forEach((c, i) => {
        const who = hud.cast[i % hud.cast.length];
        drawPlacePin(L, F, { spot: M.ground(L, hud.place(7.0, 180 + (i - 3.5) * 13)), color: c, ...M.icon(who, T), age: 9, settled: true, hover: c === 'gold' });
      });
      if (L.phase !== 'main') return;          // the rest are frame swatches laid out in 2D (main phase only)
      // finger rose around the Storyteller (every direction, animated by the v2 sequence)
      if (hud.st) {
        const st = hud.st, h = L.at(st.pos.clone().setY(st.pos.y + st.height * 0.45));
        for (const d of POINT_DIRS) {
          const [vx, vy] = POINT_VEC[d], f = still ? 0 : frameAt(t, 7.5, 3, { seq: POINT.sequence });
          put(L.world, F, `point_${d}_${f}`, h.x + vx * 27, h.y + vy * 27, 'point');
        }
      }
      // ground row (left of centre): ping_0..3, then pin_drop_0..3 below it
      const g0 = M.ground(L, hud.place(2.9, -112));
      for (let f = 0; f < 4; f++) put(L.ground, F, `ping_${f}`, g0.x - 46 + f * 31, g0.y, 'ping');
      const g1 = M.ground(L, hud.place(9.4, 180));
      for (let f = 0; f < 4; f++) put(L.ground, F, `pin_drop_${f}`, g1.x - 46 + f * 31, g1.y, 'pin_drop');
      // right of centre: the pick crosshair frames, trail dots, the place chevron over a ping
      const r0 = M.ground(L, hud.place(2.7, 112));
      for (let f = 0; f < 3; f++) put(L.world, F, `pick_${f}`, r0.x - 30 + f * 30, r0.y - 4, 'pick');
      const r1 = M.ground(L, hud.place(2.4, 150));
      put(L.ground, F, 'ping_1', r1.x, r1.y, 'ping');
      put(L.world, F, 'ping_mark', r1.x, r1.y - 4, 'ping_mark');
      for (let k = 0; k < 5; k++) put(L.world, F, k ? 'trail_0' : 'trail_1', r1.x + 18 + k * 6, r1.y - 6 - k * 3, 'trail');
      // person pins on Bram (3: fan) for the in-context look
      const bram = hud.bySeat(2);
      if (bram) {
        const lt = M.labelTop(L, bram);
        drawPersonPins(L, F, { cx: lt.x, labelTop: lt.y, t, still, hover: 2, pins: ['crimson', 'teal', 'gold'].map((c, i) => ({ color: c, ...M.icon(hud.cast[(i * 3 + 3) % hud.cast.length], T), age: 9, settled: true })) });
      }
    },

    point: (L) => {
      const F = M.frames(L), t = L.t, c = mod(t, 4.2);
      const go = (from, to, delay) => {
        if (!from || !to) return;
        drawPoint(L, F, { head: M.head(L, from), aim: M.aim(L, to), spot: M.feet(L, to), person: true, age: c - delay, still });
      };
      go(hud.bySeat(1), hud.bySeat(3), 0.0);     // Ada -> Cleo
      go(hud.bySeat(7), hud.bySeat(5), 0.35);    // Gus -> Esme
      go(hud.bySeat(4), hud.bySeat(2), 0.7);     // Dov (you) -> Bram
      const finn = hud.bySeat(6);
      if (finn) {
        const spot = M.ground(L, hud.place(2.6, -40));
        drawPoint(L, F, { head: M.head(L, finn), aim: spot, spot, person: false, age: c - 0.15, still });
      }
    },

    drop: (L) => {
      const F = M.frames(L), T = L.tok, t = L.t, c = mod(t, 3.2);
      const pins = [['teal', 2.6, 140, 0.2, null], ['crimson', 3.0, -150, 0.6, 2.4], ['gold', 2.2, -40, 1.0, null], ['violet', 3.2, 100, 1.4, null]];
      pins.forEach(([color, r, a, at, rm], i) => drawPlacePin(L, F, { spot: M.ground(L, hud.place(r, a)), color, ...M.icon(hud.cast[i * 2 % hud.cast.length], T), age: c - at, removeAt: rm == null ? null : rm - at, still }));
      const bram = hud.bySeat(2);
      if (bram) {
        const lt = M.labelTop(L, bram);
        drawPersonPins(L, F, { cx: lt.x, labelTop: lt.y, t, still, pins: [
          { color: 'green', ...M.icon(hud.bySeat(5), T), age: 9, settled: true },
          { color: 'orange', ...M.icon(hud.bySeat(6), T), age: c - 0.8 },
        ] });
      }
    },

    pick: (L) => {
      const F = M.frames(L), T = L.tok;
      const at = M.ground(L, hud.place(2.5, 120));
      drawPick(L, F, { at, label: 'Teleport Bram here', hint: 'Esc to cancel', t: L.t, still, T, avoid: M.labelRects(L) });
    },

    depth: (L) => {
      const F = M.frames(L), T = L.tok, c = mod(L.t, 3.2);
      // camera-relative offsets on the ground: +back = farther from the camera (up-screen), +side = screen right
      const cam = engine.camera.cam, fwd = new THREE.Vector3(), right = new THREE.Vector3();
      cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.set(-fwd.z, 0, fwd.x);
      const near = (m, back, side) => m.pos.clone().addScaledVector(fwd, back).addScaledVector(right, side);
      const pins = [
        [hud.bySeat(2), 0.45, 0.25, 'teal', 9, null],      // behind Bram, half hidden
        [hud.bySeat(6), 0.5, -0.4, 'crimson', c - 0.4, null], // behind Finn (drops on a loop): half hidden by Finn
        [hud.bySeat(6), -0.55, 0.35, 'gold', 9, null],     // in front of Finn: covers his legs
        [hud.bySeat(3), 0.35, -0.3, 'violet', 9, null],    // behind Cleo
        [hud.bySeat(7), -0.5, -0.2, 'black', 9, null],     // in front of Gus
        [hud.bySeat(5), -0.6, 0.3, 'white', 9, null],      // in front of Esme (ghost)
      ];
      pins.forEach(([m, back, side, color, age], i) => {
        if (!m) return;
        drawPlacePin(L, F, { spot: M.ground(L, near(m, back, side)), color, ...M.icon(hud.cast[(i * 3 + 1) % hud.cast.length], T), age, settled: age > 5, still });
      });
    },
  }[state];
  if (!draw) throw new Error(`ui-markers: unknown state '${state}'`);
  M.register(draw);
}
