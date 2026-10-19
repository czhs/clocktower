// Gameplay overlay for the Phaser town scene: the drawing half of the gameplay layer (placeholder art,
// restyled later by the art lead per docs/art-direction.md). The rules live in gameplay/core.ts
// (renderer-free, shared with the v3 3D town); this file only draws a GameplayFrame and forwards pointer
// input (v3 WP0s split, no behaviour change).
//
//   * markers      nomination-circle seat markers while the town is gathered (outdoors only),
//                  own spot pulsing gold, dead seats as pale wisps.
//   * vote clock   golden hand from the circle centre to the current voter, red ring on the nominee.
//   * hands        raised (bobbing outline) / locked-yes (solid) hands above visible voters.
//   * hints        bedtime: arrow toward your home door + pulsing door marker; gathering: arrow
//                  toward your seat spot. Players only, never the Storyteller.
//   * pick         the Storyteller's crosshair + label while a map-point pick is armed.
//
// TownScene hook contract (TownScene is owned by the art lead):
//   create():   this.gameplay = createGameplayLayer(this, { conn, myPid: () => this.myPid,
//                 me: () => this.me, amStoryteller: () => this.amStoryteller() });
//               this.offs.push(() => { this.gameplay?.destroy(); this.gameplay = null; });
//   stepLocal(): (top) const d = this.gameplay?.drive(dt); if (d) { …apply pose, no 'move'…; return; }
//   update():   after this.stepRemotes(): this.gameplay?.update(dt);
//   doorLocked(): const o = this.gameplay?.doorOverride(d.b.id);
//                 if (o !== null && o !== undefined && !this.amStoryteller()) return o;
import type * as Phaser from 'phaser';
import { reducedMotion } from '../fx/motion';
import type { RoomConnection } from '../../net/room';
import { createGameplayCore, type DrivenPose, type GameplayCoreCtx, type GameplayFrame } from './core';

export interface GameplayCtx extends GameplayCoreCtx {
  conn: RoomConnection;
}
export interface GameplayLayer {
  /** Every frame, right after TownScene.stepRemotes(): markers, arrows, clock hand, raised hands. */
  update(dt: number): void;
  /** Called at the top of TownScene.stepLocal. Non-null => TownScene applies this pose to the local avatar
   *  instead of keyboard/pointer input and sends no 'move'. null => normal local control. */
  drive(dt: number): DrivenPose | null;
  /** !drive-active; convenience. */
  wantsLocalInput(): boolean;
  /** Storyteller door override for a building (from snapshot.doors): true locked, false forced open, null = phase default. */
  doorOverride(buildingId: string): boolean | null;
  /** Bumps whenever the door overrides change (TownScene refreshes its door prompt on change). */
  doorOverrideVersion(): number;
  destroy(): void;
}

// Placeholder palette (docs/art-direction.md master palette).
const GOLD = 0xd5b56a; // Focus gold
const PARCHMENT = 0xe4d8ba;
const INK = 0x211f2c; // Panel ink
const SOOT = 0x191c29;
const STONE = 0x505061; // Plum stone
const CHALK = 0xa39dab; // Chalk edge
const MIST = 0x8eb4c2; // Ghost mist
const SPIRIT = 0xcce1de; // Spirit light
const NOMINEE = 0xa65f4b; // Clay (reads as red on cobbles)

const DEPTH_GROUND = 3.5; // above AmbientLayer ground (3), below avatars (10 + y)
const DEPTH_GROUND_TEXT = 3.6;
const DEPTH_HANDS = 4002; // above every world sprite, below the lighting overlay (5000)
const DEPTH_HINTS = 5150; // above lighting (readable at dusk), below name labels (5200)
const HAND_LIFT = 30; // px above the feet
const LABEL_FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

const r = Math.round;

export function createGameplayLayer(scene: Phaser.Scene, ctx: GameplayCtx): GameplayLayer {
  const core = createGameplayCore(ctx);
  const offs: (() => void)[] = [];

  const ground = scene.add.graphics().setDepth(DEPTH_GROUND);
  const hands = scene.add.graphics().setDepth(DEPTH_HANDS);
  const hints = scene.add.graphics().setDepth(DEPTH_HINTS);
  const textRes = () => Math.max(1, Math.round(scene.cameras.main.zoom * (window.devicePixelRatio || 1)));
  const seatText = new Map<number, Phaser.GameObjects.Text>();
  const pickLabel = scene.add
    .text(0, 0, '', { fontFamily: LABEL_FONT, fontSize: '8px', color: '#e4d8ba', backgroundColor: 'rgba(33,31,44,0.85)', padding: { left: 2, right: 2, top: 0, bottom: 1 }, resolution: textRes() })
    .setDepth(DEPTH_HINTS + 1)
    .setVisible(false);

  // ---------------------------------------------------------------------------------------
  // Storyteller pick input (the rules and Escape live in core.ts)

  const onPointerDown = (p: Phaser.Input.Pointer) => {
    if (p.button !== 0 || !core.isPicking()) return;
    // Resolve through the world camera explicitly: the overlay camera also receives input.
    const world = scene.cameras.main.getWorldPoint(p.x, p.y);
    core.pickAt(world.x, world.y);
  };
  const onPointerUp = () => core.releasePointer();
  scene.input.on('pointerdown', onPointerDown);
  scene.input.on('pointerup', onPointerUp);
  scene.input.on('pointerupoutside', onPointerUp);
  offs.push(() => {
    scene.input.off('pointerdown', onPointerDown);
    scene.input.off('pointerup', onPointerUp);
    scene.input.off('pointerupoutside', onPointerUp);
  });

  // ---------------------------------------------------------------------------------------
  // drawing primitives (integer coords for pixel-crisp placeholders)

  /** Small arrow at `dist` px from (x,y) pointing toward (tx,ty). */
  const arrow = (g: Phaser.GameObjects.Graphics, x: number, y: number, tx: number, ty: number, t: number) => {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const ux = dx / d;
    const uy = dy / d;
    const dist = 14 + Math.sin(t * 6) * 1.5;
    const cx = x + ux * dist;
    const cy = y - 4 + uy * dist;
    const tip = { x: r(cx + ux * 5), y: r(cy + uy * 5) };
    const a = { x: r(cx - ux * 3 - uy * 4), y: r(cy - uy * 3 + ux * 4) };
    const b = { x: r(cx - ux * 3 + uy * 4), y: r(cy - uy * 3 - ux * 4) };
    g.fillStyle(GOLD, 1);
    g.fillTriangle(tip.x, tip.y, a.x, a.y, b.x, b.y);
    g.lineStyle(1, SOOT, 0.9);
    g.strokeTriangle(tip.x, tip.y, a.x, a.y, b.x, b.y);
  };

  /** A tiny pixel hand (7x11) with its wrist at (cx, bottom). */
  const hand = (g: Phaser.GameObjects.Graphics, cx: number, bottom: number, solid: boolean) => {
    const x0 = r(cx) - 3;
    const top = r(bottom) - 11;
    const rects: [number, number, number, number][] = [
      [x0, top + 1, 1, 4], // fingers
      [x0 + 2, top, 1, 5],
      [x0 + 4, top, 1, 5],
      [x0 + 6, top + 1, 1, 4],
      [x0, top + 5, 7, 4], // palm
      [x0 + 1, top + 9, 5, 2], // wrist
    ];
    // contour first (1 px Soot all around), then the fill
    g.fillStyle(SOOT, 0.9);
    for (const [x, y, w, h] of rects) g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(solid ? GOLD : PARCHMENT, solid ? 1 : 0.9);
    for (const [x, y, w, h] of rects) g.fillRect(x, y, w, h);
    if (!solid) {
      g.fillStyle(GOLD, 1); // gold cuff marks "raised, not yet counted"
      g.fillRect(x0 + 1, top + 9, 5, 1);
    }
  };

  const seatLabel = (seat: number, x: number, y: number, color: string) => {
    let t = seatText.get(seat);
    if (!t) {
      t = scene.add
        .text(0, 0, String(seat + 1), { fontFamily: LABEL_FONT, fontSize: '8px', fontStyle: '700', color, resolution: textRes() })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH_GROUND_TEXT);
      seatText.set(seat, t);
    }
    // setColor re-renders the text canvas + re-uploads its texture: only on change
    if (t.style.color !== color) t.setColor(color);
    t.setPosition(r(x), r(y)).setVisible(true);
  };

  // ---------------------------------------------------------------------------------------
  // per-frame

  let clockAng: number | null = null;
  let clockLen = 0;

  const draw = (f: GameplayFrame, dt: number) => {
    // Keep directions and vote state readable without pulsing/bobbing for reduced motion.
    const t = reducedMotion() ? 0 : performance.now() / 1000;
    const me = f.me;
    ground.clear();
    hands.clear();
    hints.clear();
    for (const txt of seatText.values()) txt.setVisible(false);

    // ---- Storyteller pick crosshair (any phase, any location)
    if (f.picking) {
      const p = scene.input.activePointer;
      const w = scene.cameras.main.getWorldPoint(p.x, p.y);
      const x = r(w.x);
      const y = r(w.y);
      hints.lineStyle(1, SOOT, 0.9);
      hints.strokeCircle(x, y, 6);
      hints.lineStyle(1, GOLD, 1);
      hints.strokeCircle(x, y, 5);
      hints.fillStyle(GOLD, 1);
      for (const [dx, dy, ww, hh] of [[-9, 0, 5, 1], [5, 0, 5, 1], [0, -9, 1, 5], [0, 5, 1, 5]] as const) hints.fillRect(x + dx, y + dy, ww, hh);
      hints.fillRect(x, y, 1, 1);
      pickLabel.setText(f.picking.label).setPosition(x + 9, y + 6).setVisible(true);
    } else pickLabel.setVisible(false);

    // ---- raised hands above visible voters
    for (const h of f.hands) {
      const bob = h.locked ? 0 : Math.round(Math.sin(t * 5 + h.seat) * 1.5);
      hand(hands, h.x + 7, h.y - HAND_LIFT + 11 + bob, h.locked);
    }

    // ---- seat markers (gathered circle)
    for (const s of f.markers) {
      const x = r(s.x);
      const y = r(s.y);
      const { mine, dead } = s;
      if (mine) {
        const k = (Math.sin(t * 4) + 1) / 2;
        ground.fillStyle(GOLD, 0.18 + 0.2 * k);
        ground.fillEllipse(x, y, 22 + r(4 * k), 12 + r(2 * k));
      }
      ground.fillStyle(SOOT, 0.55);
      ground.fillEllipse(x, y + 1, 16, 9); // contact shadow
      ground.fillStyle(dead ? MIST : STONE, dead ? 0.75 : 1);
      ground.fillEllipse(x, y, 14, 8);
      ground.lineStyle(1, mine ? GOLD : dead ? SPIRIT : CHALK, 1);
      ground.strokeEllipse(x, y, 14, 8);
      if (dead) {
        // pale wisp rising from the stone
        const sway = Math.round(Math.sin(t * 2 + s.seat) * 1);
        ground.fillStyle(SPIRIT, 0.65);
        ground.fillEllipse(x + sway, y - 7, 6, 7);
        ground.fillTriangle(x - 2 + sway, y - 9, x + 2 + sway, y - 9, x + 2 * sway, y - 15);
      }
      seatLabel(s.seat, x, y, dead ? '#211f2c' : mine ? '#d5b56a' : '#e4d8ba');
    }

    // ---- vote clock hand
    if (f.clock) {
      const { centre, voter, nominee } = f.clock;
      if (nominee) {
        ground.lineStyle(2, NOMINEE, 1);
        ground.strokeEllipse(r(nominee.x), r(nominee.y), 20, 11);
      }
      if (voter) {
        const target = Math.atan2(voter.y - centre.y, voter.x - centre.x);
        const len = Math.max(0, Math.hypot(voter.x - centre.x, voter.y - centre.y) - 10);
        if (clockAng === null) {
          clockAng = target;
          clockLen = len;
        } else {
          let diff = target - clockAng;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const k = Math.min(1, dt * 7);
          clockAng += diff * k;
          clockLen += (len - clockLen) * k;
        }
        const ux = Math.cos(clockAng);
        const uy = Math.sin(clockAng);
        const ex = r(centre.x + ux * clockLen);
        const ey = r(centre.y + uy * clockLen);
        ground.lineStyle(5, SOOT, 0.8);
        ground.lineBetween(r(centre.x), r(centre.y), ex, ey);
        ground.lineStyle(3, GOLD, 1);
        ground.lineBetween(r(centre.x), r(centre.y), ex, ey);
        ground.fillStyle(GOLD, 1);
        ground.fillTriangle(r(ex + ux * 6), r(ey + uy * 6), r(ex - uy * 4), r(ey + ux * 4), r(ex + uy * 4), r(ey - ux * 4));
        ground.fillStyle(INK, 1);
        ground.fillCircle(r(centre.x), r(centre.y), 3);
        const pulse = (Math.sin(t * 6) + 1) / 2;
        ground.lineStyle(2, GOLD, 0.6 + 0.4 * pulse);
        ground.strokeEllipse(r(voter.x), r(voter.y), 22 + r(2 * pulse), 12 + r(pulse));
      }
    } else clockAng = null;

    // ---- personal hints
    const hint = f.hint;
    if (hint?.kind === 'home') {
      const k = (Math.sin(t * 4) + 1) / 2;
      const dx = r(hint.door.x);
      const dy = r(hint.door.y);
      hints.lineStyle(1, GOLD, 0.5 + 0.5 * k);
      hints.strokeEllipse(dx, dy - 2, 18 + r(4 * k), 9 + r(2 * k));
      const by = dy - 26 - r(2 * k); // bobbing chevron over the door
      hints.fillStyle(SOOT, 0.9);
      hints.fillTriangle(dx - 5, by - 1, dx + 5, by - 1, dx, by + 5);
      hints.fillStyle(GOLD, 1);
      hints.fillTriangle(dx - 4, by, dx + 4, by, dx, by + 4);
      if (hint.arrow) arrow(hints, me.x, me.y, hint.door.x, hint.door.y, t);
    } else if (hint?.kind === 'seat') {
      arrow(hints, me.x, me.y, hint.spot.x, hint.spot.y, t);
    }
  };

  // ---------------------------------------------------------------------------------------

  let destroyed = false;
  return {
    update(dt) {
      if (!destroyed) draw(core.frame(), dt);
    },
    drive() {
      return destroyed ? null : core.drive();
    },
    wantsLocalInput: () => core.wantsLocalInput(),
    doorOverrideVersion: () => core.doorOverrideVersion(),
    doorOverride: (buildingId) => core.doorOverride(buildingId),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const off of offs) off();
      ground.destroy();
      hands.destroy();
      hints.destroy();
      pickLabel.destroy();
      for (const txt of seatText.values()) txt.destroy();
      seatText.clear();
      core.destroy();
    },
  };
}
