// In-world social layer: pointing emotes + character pins (social-client agent).
//
// Gestures (no menus):
//   desktop  right-click            point (at a person if one is under the cursor, else the spot)
//            Q (hold + move = re-aim) point at the cursor
//            F · middle-click · shift+click   drop a pin (on a person = it follows them)
//            click one of your pins  remove it (hover shows a small ×; the Storyteller may remove any)
//            Esc                      cancel an armed dock mode / the radial
//   touch    tap                      as before (walk / Storyteller teleport) — decided on release
//            long-press (350 ms)      a tiny radial at the finger: 👉 point · 📍 pin; slide onto one
//                                     and lift to choose, or lift and tap one; tap elsewhere = close
//            tap one of your pins     remove it
//   dock     👉 / 📍 buttons arm the next tap; swatches pick the pin colour (ui/social/SocialPalette)
//
// Rendering: pins carry the dropper's character icon (art.ts); place pins stand on the ground with
// a soft shadow, y-sorted (above a cottage when dropped on one); person pins float above the target's
// name and fan out when one person carries several; constant on-screen size with whole-texel scaling.
// Points: your avatar turns, a hand appears beside the pointer, a dotted trail runs to the target and
// a ping ring pulses there for EMOTE_POINT_MS. Reduced motion: no drop bounce, no pulsing, no marching.
//
// Secrecy: pins come only from WorldSnapshot.pins (the server's per-viewer filter), drawn only while
// the snapshot's location is still ours; person pins only on avatars we can currently see; emotes
// only as delivered to us. Nothing here is sent anywhere except the four 'social:*' messages.
//
// Contract with TownScene (lead-owned): created once in create(); update(dt) every frame after
// remote interpolation; onTap(x, y) is asked FIRST on every primary tap/click on the town and returns
// true when it consumed the tap (pointing / dropping / removing a pin); destroy() on shutdown.
import type * as Phaser from 'phaser';
import { EMOTE_POINT_MS, type EmoteEvent, type Facing, type LocationId, type PinView, type WorldSnapshot } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { reducedMotion } from '../fx/motion';
import { stagePick } from '../gameplay/pick';
import { castManifest } from '../../ui/common/castPortrait';
import { createSocialArt, type Dir8, type HandArt } from './art';
import {
  createBucket,
  crispScale,
  DIR_VECTORS,
  EMOTE_BUCKET,
  emoteAlpha,
  evictedByDrop,
  fanSlot,
  loadPinColor,
  nearestDir,
  personStacks,
  PIN_BUCKET,
  pinLabel,
  pinTexels,
  pressState,
  reconcileLocal,
  type LocalPin,
  type PressState,
} from './logic';
import { socialActions, socialHover, socialInfo, socialMode, socialRadial, type SocialTarget } from './state';

export interface SocialCtx {
  conn: RoomConnection;
  myPid(): string | null;
  me(): { x: number; y: number; location: LocationId; facing: Facing };
  amStoryteller(): boolean;
  /** Feet position of a pid the viewer can currently SEE (rendered avatar, incl. yourself), else null. */
  positionOf(pid: string): { x: number; y: number } | null;
  /** The visible character under a world point (generous hit box), else null. */
  entityAt(x: number, y: number): string | null;
  /** Cast id used to draw this pid ('storyteller' for the Storyteller). */
  characterOf(pid: string): string;
  /** Make the local avatar face a world point (pointing). */
  faceToward(x: number, y: number): void;
  /**
   * Optional: run TownScene's normal primary-tap handling for a canvas point (tap-to-go / teleport)
   * without asking the social layer again. Touch taps are held until release (a long-press must not
   * start a walk first) and replayed through this (wired by TownScene).
   */
  passTap?(sx: number, sy: number): void;
}

export interface SocialLayer {
  update(dt: number): void;
  onTap(x: number, y: number): boolean;
  destroy(): void;
}

/** On-screen sizes (CSS px; snapped to whole texels). */
const BADGE_CSS = 14;
/** The emoter's head above their feet (world px): the hand floats beside it. */
const HEAD_Y = 26;
const DROP_MS = 460;
const POP_MS = 170;
/** Pins that arrive this soon after we enter a place were already there: no drop animation. */
const SETTLE_MS = 900;
// Pins and gestures draw ABOVE the lighting layer (5000) so they stay readable at night; place pins
// are y-sorted among themselves, their shadows stay on the ground (below the avatars and the night).
const DEPTH_PLACE_PIN = 5100;
const DEPTH_EMOTE = 5160;
const DEPTH_PERSON_PIN = 5180; // above the board cards (5150), below name labels (5200)
const DEPTH_GROUND = 3.6;

interface PinSprite {
  id: string;
  view: PinView;
  local: boolean;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  tex: string;
  born: number;
  animate: boolean;
  /** The landing sparkle has played. */
  landed: boolean;
  dying: number | null;
  /** World-space head (for hit tests), valid while shown. */
  head: { x: number; y: number; r: number } | null;
}

interface Emote {
  pid: string;
  x: number;
  y: number;
  target?: string;
  t0: number;
  hand: Phaser.GameObjects.Sprite | null;
  dir: Dir8 | null;
  ping: Phaser.GameObjects.Sprite | null;
}

interface Press {
  id: number;
  downAt: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  wx: number;
  wy: number;
  moved: number;
  state: PressState;
}

export function createSocialLayer(scene: Phaser.Scene, ctx: SocialCtx): SocialLayer {
  const conn = ctx.conn;
  const offs: (() => void)[] = [];
  const pins = new Map<string, PinSprite>();
  const emotes = new Map<string, Emote>();
  const hidden = new Map<string, number>(); // optimistic removals: id -> until (performance.now)
  let locals: LocalPin[] = [];
  let localSeq = 0;
  let server: PinView[] = [];
  let snapLoc: LocationId | null = null;
  let locSince = 0;
  const emoteBucket = createBucket(EMOTE_BUCKET);
  const pinBucket = createBucket(PIN_BUCKET);
  let press: Press | null = null;
  let replaying = false;
  let radialAt = 0;
  /** Last touch activity: browsers follow a touch with emulated mouse events ("ghost clicks"). */
  let lastTouchAt = -1e9;
  /** (debug hook) pids whose pointing hand has been drawn. */
  const debugSeen: string[] = [];
  /** (debug hook) keep gestures on screen (slow test machines take seconds per screenshot). */
  let debugHold = false;
  let qHeld = false;
  let lastPoint = { t: 0, x: NaN, y: NaN, pid: null as string | null };
  const cursor = { sx: 0, sy: 0, over: false, mouse: true };
  let hoverKey = '';
  let cursorStyle = '';
  let dirty = true;

  const art = createSocialArt(scene, () => {
    // art (re)loaded: re-key every pin sprite
    for (const p of pins.values()) p.tex = '';
    dirty = true;
  });
  const gGround = scene.add.graphics().setDepth(DEPTH_GROUND);
  const gUp = scene.add.graphics().setDepth(DEPTH_EMOTE);
  const badge = scene.add.image(0, 0, art.badge()).setDepth(DEPTH_PERSON_PIN + 1).setVisible(false);

  // remembered pin colour
  try {
    socialMode.set((m) => ({ ...m, color: loadPinColor(window.localStorage, m.color) }));
  } catch {
    // no storage
  }

  const now = () => performance.now();
  const cam = () => scene.cameras.main;
  const me = () => ctx.myPid();
  const ready = () => {
    const pid = me();
    return !!pid && !!ctx.positionOf(pid);
  };
  const nameOf = (pid: string) => conn.lobbyView.get()?.members.find((m) => m.pid === pid)?.displayName ?? 'Someone';
  const canvasRect = () => scene.game.canvas.getBoundingClientRect();
  const worldAt = (sx: number, sy: number) => cam().getWorldPoint(sx, sy);
  const clampCoord = (v: number) => Math.max(-64, Math.min(4096, Math.round(v * 10) / 10));

  /** What a gesture at a world point is aimed at. */
  function targetAt(wx: number, wy: number): SocialTarget {
    const pid = ctx.entityAt(wx, wy);
    if (pid) {
      const p = ctx.positionOf(pid);
      if (p) return { x: p.x, y: p.y, pid };
    }
    return { x: wx, y: wy, pid: null };
  }

  // -------------------------------------------------------------------------------------
  // actions

  function point(t: SocialTarget) {
    const pid = me();
    if (!pid || !ready()) return;
    if (!emoteBucket.take(now())) return;
    ctx.faceToward(t.x, t.y - 8);
    const x = clampCoord(t.x);
    const y = clampCoord(t.y);
    conn.send('social:emote', t.pid ? { kind: 'point', x, y, pid: t.pid } : { kind: 'point', x, y });
    lastPoint = { t: now(), x: t.x, y: t.y, pid: t.pid };
    showEmote({ pid, kind: 'point', x, y, ...(t.pid ? { target: t.pid } : {}), at: Date.now() });
  }

  function myServerPins(): PinView[] {
    const pid = me();
    return server.filter((p) => p.by === pid && !hidden.has(p.id));
  }

  function pin(t: SocialTarget) {
    const pid = me();
    if (!pid || !ready()) return;
    if (!pinBucket.take(now())) return;
    const color = socialMode.get().color;
    const target: PinView['target'] = t.pid ? { kind: 'person', pid: t.pid } : { kind: 'place', x: clampCoord(t.x), y: clampCoord(t.y) };
    conn.send('social:pin', { target, color });
    // the server evicts my oldest beyond the cap: fade them now
    const mine = [...myServerPins(), ...locals.map((l) => ({ id: l.id, at: Number.MAX_SAFE_INTEGER - 1e6 + l.t }))];
    for (const id of evictedByDrop(mine)) hide(id);
    locals.push({ id: `~${++localSeq}`, color, target, t: now() });
    dirty = true;
  }

  function unpin(id: string) {
    if (id.startsWith('~')) {
      // not confirmed yet: it will be matched (and removed) when it arrives
      return;
    }
    if (!pinBucket.take(now())) return;
    conn.send('social:unpin', { id });
    hide(id);
  }

  function clear(scope: 'mine' | 'all') {
    if (scope === 'all' && !ctx.amStoryteller()) return;
    if (!pinBucket.take(now())) return;
    conn.send('social:clearPins', { scope });
    const pid = me();
    for (const p of server) if (scope === 'all' || p.by === pid) hide(p.id);
    locals = [];
    dirty = true;
  }

  function hide(id: string) {
    hidden.set(id, now() + 2500);
    dirty = true;
  }

  function canRemove(v: PinView) {
    return v.by === me() || ctx.amStoryteller();
  }

  socialActions.register({
    point: (t) => {
      closeRadial('btn:point');
      point(t);
    },
    pin: (t) => {
      closeRadial('btn:pin');
      pin(t);
    },
    clear,
    cancel: () => {
      closeRadial('cancel');
      if (socialMode.get().mode !== 'idle') socialMode.set((m) => ({ ...m, mode: 'idle' }));
    },
  });
  offs.push(() => socialActions.register(null));

  // -------------------------------------------------------------------------------------
  // network

  offs.push(
    conn.events.on('world:snapshot', (s: WorldSnapshot) => {
      const pid = me();
      const mine = pid ? s.entities.find((e) => e.id === pid) : undefined;
      const loc = mine?.location ?? ctx.me().location;
      if (loc !== snapLoc) {
        snapLoc = loc;
        locSince = now();
        locals = [];
        for (const e of emotes.values()) dropEmote(e);
        emotes.clear();
      }
      server = s.pins ?? [];
      dirty = true;
    }),
  );
  offs.push(
    conn.events.on('social:emote', (ev: EmoteEvent) => {
      if (ev.pid === me()) return; // shown the instant we pointed
      showEmote(ev);
    }),
  );
  offs.push(
    conn.events.on('error', (e) => {
      const f = e.for ?? '';
      if (f === 'social:pin') {
        locals.shift(); // the oldest unconfirmed drop was refused
        dirty = true;
      } else if (f === 'social:unpin' || f === 'social:clearPins') {
        hidden.clear();
        dirty = true;
      }
    }),
  );

  // -------------------------------------------------------------------------------------
  // input

  const input = scene.input;
  input.mouse?.disableContextMenu();
  // a long-press on the town must not open the browser's callout / text selection (iOS, Android)
  try {
    const cs = scene.game.canvas.style as CSSStyleDeclaration & { webkitTouchCallout?: string; webkitUserSelect?: string };
    cs.webkitTouchCallout = 'none';
    cs.webkitUserSelect = 'none';
    cs.userSelect = 'none';
  } catch {
    // no canvas style
  }

  const onDown = (p: Phaser.Input.Pointer) => {
    const ev = p.event as PointerEvent | MouseEvent | undefined;
    cursor.mouse = !p.wasTouch && (ev as PointerEvent | undefined)?.pointerType !== 'touch' && (ev as PointerEvent | undefined)?.pointerType !== 'pen';
    if (p.button === 0 || stagePick.get()) return; // primary: TownScene asks onTap()
    if (!ready()) return;
    const w = worldAt(p.x, p.y);
    if (p.button === 2) point(targetAt(w.x, w.y));
    else if (p.button === 1) {
      ev?.preventDefault?.(); // no autoscroll
      pin(targetAt(w.x, w.y));
    }
  };
  const onMove = (p: Phaser.Input.Pointer) => {
    cursor.sx = p.x;
    cursor.sy = p.y;
    cursor.over = true;
    if (press && press.id === p.id) {
      press.moved = Math.max(press.moved, Math.hypot(p.x - press.sx, p.y - press.sy));
      if (press.state === 'long') {
        const r = socialRadial.get();
        if (r) {
          const c = clientOf(p);
          const hot = radialButtonAt(c.x, c.y);
          if (hot !== r.hot) socialRadial.set({ ...r, hot });
        }
      } else press.state = pressState(press.downAt, now(), press.moved, press.state);
    }
  };
  const onUp = (p: Phaser.Input.Pointer) => {
    if (p.wasTouch) lastTouchAt = now();
    if (!press || press.id !== p.id) return;
    const pr = press;
    press = null;
    const st = pressState(pr.downAt, now(), pr.moved, pr.state);
    if (st === 'long') {
      const r = socialRadial.get();
      const c = clientOf(p);
      const hot = radialButtonAt(c.x, c.y);
      if (r && hot) {
        closeRadial(`slide:${hot}`);
        if (hot === 'point') point(r.target);
        else pin(r.target);
      } else if (r) {
        socialRadial.set({ ...r, hot: null });
        radialAt = now(); // lifted without choosing: the radial waits for a tap a while
      }
      return;
    }
    if (st === 'cancelled') return;
    // a short tap: your pin -> remove it; else the town's normal tap
    const hit = pinAt(pr.wx, pr.wy, 8 / cam().zoom);
    if (hit && canRemove(hit.view)) {
      unpin(hit.id);
      return;
    }
    replayTap(pr.sx, pr.sy);
  };
  input.on('pointerdown', onDown);
  input.on('pointermove', onMove);
  input.on('pointerup', onUp);
  input.on('pointerupoutside', onUp);
  const onOut = () => (cursor.over = false);
  const onOver = () => (cursor.over = true);
  input.on('gameout', onOut);
  input.on('gameover', onOver);
  offs.push(() => {
    input.off('pointerdown', onDown);
    input.off('pointermove', onMove);
    input.off('pointerup', onUp);
    input.off('pointerupoutside', onUp);
    input.off('gameout', onOut);
    input.off('gameover', onOver);
  });

  /** Viewport (client) coords of a pointer: the canvas is sized 1:1 in CSS px. */
  function clientOf(p: Phaser.Input.Pointer) {
    const r = canvasRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }

  function radialButtonAt(cx: number, cy: number): 'point' | 'pin' | null {
    const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
    const act = el?.closest?.('[data-social-act]')?.getAttribute('data-social-act');
    return act === 'point' || act === 'pin' ? act : null;
  }

  function closeRadial(why = '') {
    if (!socialRadial.get()) return;
    if (debugSeen.length < 200) debugSeen.push(`radial-close:${why}`);
    socialRadial.set(null);
  }

  function replayTap(sx: number, sy: number) {
    if (ctx.passTap) return ctx.passTap(sx, sy);
    const s = scene as unknown as { onTap?: (p: { button: number; x: number; y: number }) => void };
    if (typeof s.onTap !== 'function') return;
    replaying = true;
    try {
      s.onTap.call(scene, { button: 0, x: sx, y: sy });
    } finally {
      replaying = false;
    }
  }

  const keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && (socialRadial.get() || socialMode.get().mode !== 'idle')) {
      closeRadial('esc');
      socialMode.set((m) => ({ ...m, mode: 'idle' }));
      e.stopImmediatePropagation(); // don't also leave the cottage
      return;
    }
    if (isTyping(e) || e.repeat || stagePick.get()) return;
    if (e.code === 'KeyQ') {
      qHeld = true;
      if (cursor.over && cursor.mouse) {
        const w = worldAt(cursor.sx, cursor.sy);
        point(targetAt(w.x, w.y));
      }
    } else if (e.code === 'KeyF') {
      if (cursor.over && cursor.mouse) {
        const w = worldAt(cursor.sx, cursor.sy);
        pin(targetAt(w.x, w.y));
      } else {
        // cursor off the town (or a touch keyboard): mark where you stand
        const m = ctx.me();
        pin({ x: m.x, y: m.y, pid: null });
      }
    }
  };
  const keyUp = (e: KeyboardEvent) => {
    if (e.code === 'KeyQ') qHeld = false;
  };
  const blur = () => (qHeld = false);
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  window.addEventListener('blur', blur);
  offs.push(() => {
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('keyup', keyUp, true);
    window.removeEventListener('blur', blur);
  });

  function onTap(wx: number, wy: number): boolean {
    if (replaying) return false;
    const p = input.activePointer;
    const ev = p.event as PointerEvent | MouseEvent | undefined;
    const touchLike = p.wasTouch || (ev as PointerEvent | undefined)?.pointerType === 'touch' || (ev as PointerEvent | undefined)?.pointerType === 'pen';
    // Phaser also reports touches that land on HUD elements (its window listeners): those taps
    // belong to the button under the finger (e.g. the radial's), never to the town.
    const target = ev?.target as Node | null | undefined;
    if (target && target !== scene.game.canvas) return true;
    cursor.mouse = !touchLike;
    if (touchLike) lastTouchAt = now();
    else if (now() - lastTouchAt < 800) return true; // the emulated click after a touch: already handled
    if (socialRadial.get()) {
      closeRadial(`tap:${touchLike ? 'touch' : 'mouse'}`);
      return true; // a tap elsewhere just closes the radial
    }
    const mode = socialMode.get().mode;
    if (mode !== 'idle') {
      socialMode.set((m) => ({ ...m, mode: 'idle' }));
      if (!ready()) return true;
      const t = targetAt(wx, wy);
      if (mode === 'point') point(t);
      else pin(t);
      return true;
    }
    if (!touchLike) {
      const hit = pinAt(wx, wy, 0);
      if (hit && canRemove(hit.view)) {
        unpin(hit.id);
        return true;
      }
      if (ev?.shiftKey && ready()) {
        pin(targetAt(wx, wy));
        return true;
      }
      return false;
    }
    // touch: hold the decision until release (tap) or 350 ms (long-press radial)
    const c = clientOf(p);
    press = { id: p.id, downAt: now(), sx: p.x, sy: p.y, cx: c.x, cy: c.y, wx, wy, moved: 0, state: 'pending' };
    return true;
  }

  // -------------------------------------------------------------------------------------
  // emotes

  function showEmote(ev: EmoteEvent) {
    const old = emotes.get(ev.pid);
    if (old) dropEmote(old);
    const e: Emote = { pid: ev.pid, x: ev.x, y: ev.y, ...(ev.target ? { target: ev.target } : {}), t0: now(), hand: null, dir: null, ping: null };
    const ping = art.ping();
    if (ping) e.ping = scene.add.sprite(0, 0, ping.key, ping.frame).setOrigin(ping.ox, ping.oy).setDepth(DEPTH_GROUND + 0.01).setVisible(false).play(ping.anim);
    emotes.set(ev.pid, e);
  }
  function dropEmote(e: Emote) {
    e.hand?.destroy();
    e.ping?.destroy();
    e.hand = null;
    e.ping = null;
  }

  /** The hand for an emote aimed `dir`: the art's 8-way animated hand, else the rotated fallback. */
  function handFor(e: Emote, dir: Dir8): HandArt {
    const h = art.hand(dir);
    if (!e.hand || e.dir !== dir) {
      e.hand?.destroy();
      const spr = scene.add.sprite(0, 0, h.key, h.frame).setOrigin(h.ox, h.oy).setDepth(DEPTH_EMOTE + 1);
      if (h.anim && !reducedMotion()) spr.play(h.anim);
      e.hand = spr;
      e.dir = dir;
    }
    return h;
  }

  function drawEmotes(t: number) {
    const z = cam().zoom;
    const still = reducedMotion();
    for (const [pid, e] of emotes) {
      const age = debugHold ? Math.min(t - e.t0, EMOTE_POINT_MS / 2) : t - e.t0;
      const a = emoteAlpha(age, EMOTE_POINT_MS);
      if (a <= 0) {
        dropEmote(e);
        emotes.delete(pid);
        continue;
      }
      const from = ctx.positionOf(e.pid);
      const tp = e.target ? ctx.positionOf(e.target) : null;
      const to = tp ?? { x: e.x, y: e.y };
      const aim = { x: to.x, y: tp ? to.y - 14 : to.y };
      // ping at the target (a person: at their feet)
      if (e.ping) e.ping.setPosition(Math.round(to.x), Math.round(to.y)).setAlpha(a).setVisible(true);
      else {
        const rx = tp ? 12 : 9;
        const ry = tp ? 5 : 4;
        gGround.lineStyle(Math.max(1, 2.5 / z) + 1 / z, 0x1a1008, 0.55 * a).strokeEllipse(to.x, to.y, rx * 2, ry * 2);
        gGround.lineStyle(Math.max(1 / z, 2 / z), 0xffd76a, 0.95 * a).strokeEllipse(to.x, to.y, rx * 2, ry * 2);
        if (!still)
          for (let j = 0; j < 2; j++) {
            const k = ((age / 1000) * 1.1 + j * 0.5) % 1;
            const sc = 0.7 + k * 1.1;
            gGround.lineStyle(Math.max(1 / z, 1.6 / z), 0xffe9a8, (1 - k) * 0.85 * a).strokeEllipse(to.x, to.y, rx * 2 * sc, ry * 2 * sc);
          }
      }
      if (!tp) {
        // a little chevron over the spot (readable over grass and cobbles, above the night)
        const bob = still ? 0 : Math.sin(age / 160) * 1.5;
        const cy = to.y - 9 - bob;
        const w = 4;
        gUp.fillStyle(0x1a1008, 0.75 * a).fillTriangle(to.x - w - 1.5, cy - 4.5, to.x + w + 1.5, cy - 4.5, to.x, cy + 3);
        gUp.fillStyle(0xffd76a, a).fillTriangle(to.x - w, cy - 3.5, to.x + w, cy - 3.5, to.x, cy + 1.2);
      }
      if (!from) {
        e.hand?.setVisible(false);
        continue;
      }
      // the hand beside the emoter's head, aimed at the target (world scale 1 = the cast's pixel size)
      const head = { x: from.x, y: from.y - HEAD_Y };
      const dx = aim.x - head.x;
      const dy = aim.y - head.y;
      const dir = nearestDir(dx, dy, DIR_VECTORS);
      const h = handFor(e, dir);
      if (age < 1000 && !debugSeen.includes(`${e.pid}@${Math.round(e.t0)}`)) debugSeen.push(`${e.pid}@${Math.round(e.t0)}`);
      let hx: number;
      let hy: number;
      let tipX: number;
      let tipY: number;
      if (h.directional) {
        const v = DIR_VECTORS[dir];
        const bob = still ? 0 : Math.sin(age / 180) * 1;
        hx = head.x + v[0] * (h.offset + bob);
        hy = head.y + v[1] * (h.offset + bob);
        e.hand!.setPosition(Math.round(hx), Math.round(hy)).setRotation(0).setFlipY(false).setScale(1).setAlpha(a).setVisible(true);
        tipX = hx + v[0] * (h.w / 2);
        tipY = hy + v[1] * (h.h / 2);
      } else {
        const ang = Math.atan2(dy, dx);
        const wob = still ? 0 : Math.sin(age / 140) * 1.2;
        hx = head.x + Math.cos(ang) * (h.offset + wob);
        hy = head.y + Math.sin(ang) * (h.offset + wob) * 0.8;
        e.hand!.setPosition(hx, hy).setScale(1).setRotation(ang).setFlipY(Math.cos(ang) < 0).setAlpha(a).setVisible(true);
        tipX = hx + Math.cos(ang) * h.w * 0.85;
        tipY = hy + Math.sin(ang) * h.w * 0.85;
      }
      // dotted trail from the fingertip to the target
      const ddx = aim.x - tipX;
      const ddy = aim.y - tipY;
      const dist = Math.hypot(ddx, ddy);
      const gap = Math.max(5, 9 / z);
      const end = dist - Math.max(5, 8 / z);
      if (end > gap) {
        const ux = ddx / dist;
        const uy = ddy / dist;
        const off = still ? 0 : (((age / 1000) * 28) % gap);
        const d1 = Math.max(2, 3 / z);
        const d2 = Math.max(1, 1.6 / z);
        for (let d = gap * 0.5 + off; d < end; d += gap) {
          const px = tipX + ux * d;
          const py = tipY + uy * d;
          const fade = Math.min(1, d / (gap * 2)) * a * 0.8;
          gUp.fillStyle(0x1a1008, fade * 0.8).fillRect(px - d1 / 2, py - d1 / 2, d1, d1);
          gUp.fillStyle(0xffe9a8, fade).fillRect(px - d2 / 2, py - d2 / 2, d2, d2);
        }
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // pins

  /** The list of pins to show right now (server minus optimistic removals, plus optimistic drops). */
  function displayPins(t: number): { view: PinView; local: boolean }[] {
    for (const [id, until] of hidden) if (t > until) hidden.delete(id);
    const pid = me();
    const known = new Set([...pins.keys()].filter((id) => !id.startsWith('~')));
    const rec = reconcileLocal(locals, server, pid, known, t);
    // adopted: move the optimistic sprite over to the server id (no second drop)
    for (const [lid, sid] of rec.adopted) {
      const sp = pins.get(lid);
      if (sp && !pins.has(sid)) {
        pins.delete(lid);
        sp.id = sid;
        sp.local = false;
        pins.set(sid, sp);
      }
    }
    locals = rec.waiting;
    const out: { view: PinView; local: boolean }[] = [];
    for (const v of server) if (!hidden.has(v.id)) out.push({ view: v, local: false });
    if (pid) {
      const character = ctx.characterOf(pid);
      for (const l of locals) out.push({ view: { id: l.id, by: pid, character, color: l.color, target: l.target, at: Date.now() + l.t }, local: true });
    }
    return out;
  }

  /** The icon to show: the dropper's cast id, or (unknown / legacy) how this client draws them. */
  function iconOf(v: PinView): string {
    const m = castManifest();
    if (!m || m.sheets[v.character]) return v.character;
    return ctx.characterOf(v.by);
  }

  /** The art's little landing sparkle (once). */
  function sparkle(x: number, y: number, s: number, depth: number) {
    const d = art.drop();
    if (!d || reducedMotion()) return;
    const spr = scene.add.sprite(Math.round(x), Math.round(y), d.key, d.frame).setOrigin(d.ox, d.oy).setScale(s).setDepth(depth);
    spr.play(d.anim);
    spr.once('animationcomplete', () => spr.destroy());
    offs.push(() => spr.active && spr.destroy());
  }

  function layoutPins(t: number) {
    const z = cam().zoom;
    const g = art.pinGeom();
    const s = pinTexels(z) / z;
    const still = reducedMotion();
    const list = displayPins(t);
    const live = new Set(list.map((p) => p.view.id));
    const here = snapLoc !== null && snapLoc === ctx.me().location;
    // retire pins that are gone
    for (const sp of pins.values()) if (!live.has(sp.id) && sp.dying === null) sp.dying = t;
    // create / update
    const stacks = personStacks(list.map((p) => p.view));
    for (const { view, local } of list) {
      let sp = pins.get(view.id);
      if (!sp) {
        const tex = art.pin(view.color, iconOf(view));
        const img = scene.add.image(0, 0, tex).setOrigin(g.tip.x / g.w, g.tip.y / g.h);
        const sh = art.shadow();
        const shadow = view.target.kind === 'place' ? scene.add.image(0, 0, sh.key, sh.frame).setOrigin(sh.ox, sh.oy).setDepth(DEPTH_GROUND - 0.05) : null;
        sp = { id: view.id, view, local, img, shadow, tex, born: t, animate: local || t - locSince > SETTLE_MS, landed: false, dying: null, head: null };
        pins.set(view.id, sp);
      }
      sp.view = view;
      sp.dying = null;
      if (!sp.tex || !scene.textures.exists(sp.tex)) {
        sp.tex = art.pin(view.color, iconOf(view));
        sp.img.setTexture(sp.tex).setOrigin(g.tip.x / g.w, g.tip.y / g.h);
      }
    }
    for (const [id, sp] of pins) {
      const v = sp.view;
      let x: number;
      let y: number;
      let rot = 0;
      let depth: number;
      if (v.target.kind === 'person') {
        const p = ctx.positionOf(v.target.pid);
        if (!p || !here) {
          hidePin(sp);
          if (sp.dying !== null) destroyPin(id, sp);
          continue;
        }
        const stack = stacks.get(v.target.pid) ?? [v];
        const i = Math.max(0, stack.findIndex((q) => q.id === v.id));
        const slot = fanSlot(i, stack.length, g.w * s);
        const label = 14 / z; // clear the name label above the head
        const bob = reducedMotion() ? 0 : Math.round(Math.sin(t / 420 + i * 1.3)) * s;
        x = p.x + slot.dx;
        y = p.y - 35 - label + slot.dy + bob;
        rot = slot.rot;
        depth = DEPTH_PERSON_PIN + i * 0.001;
      } else {
        if (!here) {
          hidePin(sp);
          if (sp.dying !== null) destroyPin(id, sp);
          continue;
        }
        x = v.target.x;
        y = v.target.y;
        depth = DEPTH_PLACE_PIN + y * 1e-4;
      }
      // drop / pop animation
      let yOff = 0;
      let alpha = 1;
      let k2 = 1;
      if (sp.dying !== null) {
        const k = (t - sp.dying) / POP_MS;
        if (k >= 1) {
          destroyPin(id, sp);
          continue;
        }
        alpha = 1 - k;
        k2 = 1 + 0.3 * k;
      } else if (sp.animate) {
        const k = (t - sp.born) / (still ? 220 : DROP_MS);
        if (k < 1) {
          if (still) alpha = k;
          else {
            const fall = k < 0.68 ? 1 - (k / 0.68) ** 2 : -0.14 * Math.sin(((k - 0.68) / 0.32) * Math.PI);
            yOff = -fall * (30 / z);
            alpha = Math.min(1, k * 4);
          }
        } else sp.animate = false;
        if (!sp.landed && (still || k >= 0.68)) {
          sp.landed = true;
          sparkle(x, y, s, depth + 0.0005);
        }
      }
      const px = Math.round(x * z) / z;
      const py = Math.round((y + yOff) * z) / z;
      sp.img.setPosition(px, py).setScale(s * k2).setRotation(rot).setAlpha(alpha).setDepth(depth).setVisible(true);
      if (sp.shadow) {
        const near = 1 - Math.min(1, -yOff / (30 / z));
        sp.shadow
          .setPosition(Math.round(x * z) / z, Math.round(y * z) / z)
          .setScale(s * (0.6 + 0.4 * near))
          .setAlpha(alpha * (0.6 + 0.4 * near))
          .setVisible(true);
      }
      // world-space head for hit tests
      const hx = (g.head.x - g.tip.x) * s;
      const hy = (g.head.y - g.tip.y) * s;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      sp.head = { x: px + hx * c - hy * sn, y: py + hx * sn + hy * c, r: g.head.r * s };
    }
    // counts for the dock
    const pid = me();
    const mine = list.filter((p) => p.view.by === pid).length;
    const info = socialInfo.get();
    if (info.mine !== mine || info.here !== list.length) socialInfo.set({ mine, here: list.length });
  }

  function hidePin(sp: PinSprite) {
    sp.img.setVisible(false);
    sp.shadow?.setVisible(false);
    sp.head = null;
  }
  function destroyPin(id: string, sp: PinSprite) {
    sp.img.destroy();
    sp.shadow?.destroy();
    pins.delete(id);
  }

  /** Topmost shown pin whose head is under a world point (`slack` = extra world px). */
  function pinAt(wx: number, wy: number, slack: number): PinSprite | null {
    let best: PinSprite | null = null;
    for (const sp of pins.values()) {
      if (!sp.head || sp.dying !== null || !sp.img.visible) continue;
      // head circle, plus the needle down to the tip
      const inHead = Math.hypot(wx - sp.head.x, wy - sp.head.y) <= sp.head.r + slack;
      const inNeedle = Math.abs(wx - sp.img.x) <= sp.head.r * 0.4 + slack && wy <= sp.img.y + slack && wy >= sp.head.y;
      if (!inHead && !inNeedle) continue;
      if (!best || sp.img.depth > best.img.depth) best = sp;
    }
    return best;
  }

  // -------------------------------------------------------------------------------------
  // hover (mouse): tooltip + remove badge + cursor

  function updateHover() {
    const z = cam().zoom;
    let hit: PinSprite | null = null;
    if (cursor.over && cursor.mouse && !press) {
      const w = worldAt(cursor.sx, cursor.sy);
      hit = pinAt(w.x, w.y, 0);
    }
    const removable = !!hit && canRemove(hit.view);
    if (hit && hit.head) {
      const v = hit.view;
      const mine = v.by === me();
      const target = v.target.kind === 'person' ? v.target.pid : null;
      const text = pinLabel({ byName: nameOf(v.by), mine, targetName: target ? nameOf(target) : null, targetIsMe: target === me() }) + (removable ? ' · click to remove' : '');
      const cm = cam();
      const r = canvasRect();
      const sx = Math.round(r.left + (hit.head.x - cm.worldView.x) * z);
      const sy = Math.round(r.top + (hit.head.y - hit.head.r - cm.worldView.y) * z);
      const key = `${hit.id}|${sx}|${sy}|${text}`;
      if (key !== hoverKey) {
        hoverKey = key;
        socialHover.set({ sx, sy, text, removable });
      }
      if (removable) {
        const bs = crispScale(z, 1, 9, BADGE_CSS);
        badge
          .setPosition(hit.head.x + hit.head.r * 0.78, hit.head.y - hit.head.r * 0.78)
          .setScale(bs)
          .setVisible(true);
      } else badge.setVisible(false);
    } else {
      if (hoverKey) {
        hoverKey = '';
        socialHover.set(null);
      }
      badge.setVisible(false);
    }
    const mode = socialMode.get().mode;
    const want = mode !== 'idle' ? 'crosshair' : removable ? 'pointer' : '';
    if (want !== cursorStyle) {
      cursorStyle = want;
      scene.game.canvas.style.cursor = want;
    }
  }

  // -------------------------------------------------------------------------------------
  // per frame

  function update(_dt: number) {
    const t = now();
    gGround.clear();
    gUp.clear();
    // long-press progress / radial
    if (press && press.state !== 'cancelled') {
      press.state = pressState(press.downAt, t, press.moved, press.state);
      const age = t - press.downAt;
      if (press.state === 'long' && !socialRadial.get()) {
        socialRadial.set({ sx: press.cx, sy: press.cy, target: targetAt(press.wx, press.wy), hot: null });
        radialAt = t;
        try {
          navigator.vibrate?.(12);
        } catch {
          // no haptics
        }
      } else if (press.state === 'pending' && age > 110) {
        const z = cam().zoom;
        const k = Math.min(1, (age - 110) / (350 - 110));
        const r = 15 / z;
        gUp.lineStyle(4 / z, 0x1a1008, 0.5).beginPath().arc(press.wx, press.wy, r, 0, Math.PI * 2).strokePath();
        gUp.lineStyle(2.5 / z, 0xffd76a, 0.95).beginPath().arc(press.wx, press.wy, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
      }
    }
    // the radial closes itself if ignored, or when we change place
    if (socialRadial.get() && !press && (t - radialAt > 8000 || snapLoc !== ctx.me().location)) closeRadial(t - radialAt > 8000 ? 'timeout' : 'moved');
    // hold Q: re-aim when the cursor moves to something else
    if (qHeld && cursor.over && cursor.mouse && t - lastPoint.t > 650) {
      const w = worldAt(cursor.sx, cursor.sy);
      const tg = targetAt(w.x, w.y);
      if (tg.pid !== lastPoint.pid || (tg.pid === null && Math.hypot(tg.x - lastPoint.x, tg.y - lastPoint.y) > 20)) point(tg);
    }
    if (dirty || pins.size || locals.length) layoutPins(t);
    dirty = false;
    drawEmotes(t);
    updateHover();
  }

  // e2e / debugging only (opt-in per browser): what the layer is drawing right now
  try {
    if (window.localStorage.getItem('ct.debug.social') === '1') {
      const w = window as unknown as { __ctSocial?: unknown };
      w.__ctSocial = {
        seen: () => [...debugSeen],
        hold: (on: boolean) => void (debugHold = on),
        radial: () => socialRadial.get(),
        emotes: () =>
          [...emotes.values()].map((e) => ({ pid: e.pid, dir: e.dir, hand: !!e.hand?.visible, alpha: e.hand?.alpha ?? 0, x: e.hand?.x, y: e.hand?.y, depth: e.hand?.depth, tex: e.hand?.texture.key, frame: e.hand?.frame.name, ping: !!e.ping?.visible })),
        pins: () => [...pins.values()].map((p) => ({ id: p.id, color: p.view.color, kind: p.view.target.kind, visible: p.img.visible, x: p.img.x, y: p.img.y, head: p.head, scale: p.img.scaleX })),
        zoom: () => cam().zoom,
      };
      offs.push(() => delete w.__ctSocial);
    }
  } catch {
    // no storage
  }

  return {
    update,
    onTap,
    destroy() {
      for (const off of offs.splice(0)) off();
      for (const [id, sp] of pins) destroyPin(id, sp);
      for (const e of emotes.values()) dropEmote(e);
      emotes.clear();
      gGround.destroy();
      gUp.destroy();
      badge.destroy();
      art.destroy();
      socialRadial.set(null);
      socialHover.set(null);
      socialInfo.set({ mine: 0, here: 0 });
      socialMode.set((m) => ({ ...m, mode: 'idle' }));
      try {
        scene.game.canvas.style.cursor = '';
      } catch {
        // canvas already gone
      }
    },
  };
}

function isTyping(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = (e.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  const a = document.activeElement as HTMLElement | null;
  for (const n of [el, a]) {
    if (!n || !n.tagName) continue;
    const tag = n.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable) return true;
  }
  return false;
}
