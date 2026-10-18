// In-world social layer for the Phaser town: the drawing half (v3 WP0s split of social/index.ts, no
// behaviour change). Gestures, rate limits, the optimistic pins model and the sends live in
// social/controller.ts (renderer-free, shared with the v3 3D town); this file forwards Phaser pointer events
// to it and draws its model.
//
// Rendering: pins carry the dropper's character icon (art.ts); place pins stand on the ground with a soft
// shadow, y-sorted (above a cottage when dropped on one); person pins float above the target's name and fan
// out when one person carries several; constant on-screen size with whole-texel scaling. Points: your avatar
// turns, a hand appears beside the pointer, a dotted trail runs to the target and a ping ring pulses there for
// EMOTE_POINT_MS. Reduced motion: no drop bounce, no pulsing, no marching.
//
// Contract with TownScene (lead-owned): created once in create(); update(dt) every frame after remote
// interpolation; onTap(x, y) is asked FIRST on every primary tap/click on the town and returns true when it
// consumed the tap (pointing / dropping / removing a pin); destroy() on shutdown.
import type * as Phaser from 'phaser';
import { EMOTE_POINT_MS, type PinView } from '@ct/protocol';
import { reducedMotion } from '../fx/motion';
import { createSocialArt, type Dir8, type HandArt } from './art';
import { createSocialController, type EmoteModel, type SocialController, type SocialControllerCtx, type SocialPointer } from './controller';
import { crispScale, DIR_VECTORS, emoteAlpha, fanSlot, nearestDir, personStacks, pinTexels } from './logic';
import { socialHover, socialMode } from './state';
import { createNickFace } from './nickFace';
import type { RoomConnection } from '../../net/room';

export interface SocialCtx extends SocialControllerCtx {
  conn: RoomConnection;
  /** Optional: canvas px per CSS px (the low render tier draws the canvas smaller; default 1). */
  renderScale?(): number;
  /** Optional (v2.2 'nick-face'): the avatar sprite drawing this pid, else null. */
  spriteOf?(pid: string): Phaser.GameObjects.Sprite | null;
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

interface EmoteSprites {
  hand: Phaser.GameObjects.Sprite | null;
  dir: Dir8 | null;
  ping: Phaser.GameObjects.Sprite | null;
}

export function createSocialLayer(scene: Phaser.Scene, ctx: SocialCtx): SocialLayer {
  const offs: (() => void)[] = [];
  const pins = new Map<string, PinSprite>();
  const emoteSprites = new Map<EmoteModel, EmoteSprites>();
  let hoverKey = '';
  let cursorStyle = '';
  // assigned below, once the drawing objects exist (the art callback may only mark the model dirty)
  let ctlRef: SocialController | null = null;

  const art = createSocialArt(scene, () => {
    // art (re)loaded: re-key every pin sprite
    for (const p of pins.values()) p.tex = '';
    ctlRef?.markDirty();
  });
  const gGround = scene.add.graphics().setDepth(DEPTH_GROUND);
  const gUp = scene.add.graphics().setDepth(DEPTH_EMOTE);
  const badge = scene.add.image(0, 0, art.badge()).setDepth(DEPTH_PERSON_PIN + 1).setVisible(false);
  // Nick Song's 'nick-face' emote: his head becomes a 😝 for NICK_FACE_MS (nickFace.ts)
  const nick = createNickFace(scene, { art, spriteOf: (pid) => ctx.spriteOf?.(pid) ?? null });
  offs.push(() => nick.destroy());

  const now = () => performance.now();
  const cam = () => scene.cameras.main;
  const canvasRect = () => scene.game.canvas.getBoundingClientRect();
  /** CSS px per world px: sizes meant in screen px use this (the camera zoom is in canvas px). */
  const cssZoom = () => cam().zoom / (ctx.renderScale?.() ?? 1);
  const worldAt = (sx: number, sy: number) => cam().getWorldPoint(sx, sy);
  /** Viewport (client) coords of a canvas point (canvas px -> CSS px; 1:1 unless the low tier scales the canvas). */
  const clientOf = (sx: number, sy: number) => {
    const r = canvasRect();
    const k = r.width / scene.scale.width;
    return { x: r.left + sx * k, y: r.top + sy * k };
  };

  const ctl = createSocialController(ctx, {
    worldAt,
    clientOf,
    cssZoom,
    pinAt: (wx, wy, slack) => pinAt(wx, wy, slack),
    isSurface: (target) => target === scene.game.canvas,
    replayTap(sx, sy) {
      const s = scene as unknown as { onTap?: (p: { button: number; x: number; y: number }) => void };
      if (typeof s.onTap === 'function') s.onTap.call(scene, { button: 0, x: sx, y: sy });
    },
    emoteAdded(e) {
      const sp: EmoteSprites = { hand: null, dir: null, ping: null };
      const ping = art.ping();
      if (ping) sp.ping = scene.add.sprite(0, 0, ping.key, ping.frame).setOrigin(ping.ox, ping.oy).setDepth(DEPTH_GROUND + 0.01).setVisible(false).play(ping.anim);
      emoteSprites.set(e, sp);
    },
    emoteRemoved(e) {
      const sp = emoteSprites.get(e);
      if (!sp) return;
      sp.hand?.destroy();
      sp.ping?.destroy();
      emoteSprites.delete(e);
    },
    nickFace: (pid) => nick.show(pid),
    placeChanged: () => nick.clear(),
  });
  ctlRef = ctl;

  // -------------------------------------------------------------------------------------
  // input (Phaser pointer -> controller)

  const toPointer = (p: Phaser.Input.Pointer): SocialPointer => ({
    id: p.id,
    button: p.button,
    sx: p.x,
    sy: p.y,
    wasTouch: p.wasTouch,
    event: p.event as unknown as SocialPointer['event'],
  });

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

  const onDown = (p: Phaser.Input.Pointer) => ctl.pointerDown(toPointer(p));
  const onMove = (p: Phaser.Input.Pointer) => ctl.pointerMove(toPointer(p));
  const onUp = (p: Phaser.Input.Pointer) => ctl.pointerUp(toPointer(p));
  input.on('pointerdown', onDown);
  input.on('pointermove', onMove);
  input.on('pointerup', onUp);
  input.on('pointerupoutside', onUp);
  const onOut = () => ctl.pointerOut();
  const onOver = () => ctl.pointerOver();
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

  // -------------------------------------------------------------------------------------
  // emotes

  /** The hand for an emote aimed `dir`: the art's 8-way animated hand, else the rotated fallback. */
  function handFor(sp: EmoteSprites, dir: Dir8): HandArt {
    const h = art.hand(dir);
    if (!sp.hand || sp.dir !== dir) {
      sp.hand?.destroy();
      const spr = scene.add.sprite(0, 0, h.key, h.frame).setOrigin(h.ox, h.oy).setDepth(DEPTH_EMOTE + 1);
      if (h.anim && !reducedMotion()) spr.play(h.anim);
      sp.hand = spr;
      sp.dir = dir;
    }
    return h;
  }

  function drawEmotes(t: number) {
    const z = cssZoom();
    const still = reducedMotion();
    for (const [pid, e] of ctl.emotes()) {
      const sp = emoteSprites.get(e);
      const age = ctl.emoteAge(e, t);
      const a = emoteAlpha(age, EMOTE_POINT_MS);
      if (a <= 0 || !sp) {
        ctl.dropEmote(pid); // defensive (ctl.tick already expired old ones); safe while iterating the live map
        continue;
      }
      const from = ctx.positionOf(e.pid);
      const tp = e.target ? ctx.positionOf(e.target) : null;
      const to = tp ?? { x: e.x, y: e.y };
      const aim = { x: to.x, y: tp ? to.y - 14 : to.y };
      // ping at the target (a person: at their feet)
      if (sp.ping) sp.ping.setPosition(Math.round(to.x), Math.round(to.y)).setAlpha(a).setVisible(true);
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
        sp.hand?.setVisible(false);
        continue;
      }
      // the hand beside the emoter's head, aimed at the target (world scale 1 = the cast's pixel size)
      const head = { x: from.x, y: from.y - HEAD_Y };
      const dx = aim.x - head.x;
      const dy = aim.y - head.y;
      const dir = nearestDir(dx, dy, DIR_VECTORS);
      const h = handFor(sp, dir);
      if (age < 1000) ctl.noteSeen(`${e.pid}@${Math.round(e.t0)}`);
      let hx: number;
      let hy: number;
      let tipX: number;
      let tipY: number;
      if (h.directional) {
        const v = DIR_VECTORS[dir];
        const bob = still ? 0 : Math.sin(age / 180) * 1;
        hx = head.x + v[0] * (h.offset + bob);
        hy = head.y + v[1] * (h.offset + bob);
        sp.hand!.setPosition(Math.round(hx), Math.round(hy)).setRotation(0).setFlipY(false).setScale(1).setAlpha(a).setVisible(true);
        tipX = hx + v[0] * (h.w / 2);
        tipY = hy + v[1] * (h.h / 2);
      } else {
        const ang = Math.atan2(dy, dx);
        const wob = still ? 0 : Math.sin(age / 140) * 1.2;
        hx = head.x + Math.cos(ang) * (h.offset + wob);
        hy = head.y + Math.sin(ang) * (h.offset + wob) * 0.8;
        sp.hand!.setPosition(hx, hy).setScale(1).setRotation(ang).setFlipY(Math.cos(ang) < 0).setAlpha(a).setVisible(true);
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
    const z = cam().zoom; // canvas px per world px: pixel snapping
    const zc = cssZoom(); // CSS px per world px: sizes
    const g = art.pinGeom();
    const s = pinTexels(zc) / zc;
    const still = reducedMotion();
    const known = new Set([...pins.keys()].filter((id) => !id.startsWith('~')));
    const { list, adopted } = ctl.displayPins(t, known);
    // adopted: move the optimistic sprite over to the server id (no second drop)
    for (const [lid, sid] of adopted) {
      const sp = pins.get(lid);
      if (sp && !pins.has(sid)) {
        pins.delete(lid);
        sp.id = sid;
        sp.local = false;
        pins.set(sid, sp);
      }
    }
    const live = new Set(list.map((p) => p.view.id));
    const here = ctl.here();
    // retire pins that are gone
    for (const sp of pins.values()) if (!live.has(sp.id) && sp.dying === null) sp.dying = t;
    // create / update
    const stacks = personStacks(list.map((p) => p.view));
    for (const { view, local } of list) {
      let sp = pins.get(view.id);
      if (!sp) {
        const tex = art.pin(view.color, ctl.iconOf(view));
        const img = scene.add.image(0, 0, tex).setOrigin(g.tip.x / g.w, g.tip.y / g.h);
        const sh = art.shadow();
        const shadow = view.target.kind === 'place' ? scene.add.image(0, 0, sh.key, sh.frame).setOrigin(sh.ox, sh.oy).setDepth(DEPTH_GROUND - 0.05) : null;
        sp = { id: view.id, view, local, img, shadow, tex, born: t, animate: local || t - ctl.placeSince() > SETTLE_MS, landed: false, dying: null, head: null };
        pins.set(view.id, sp);
      }
      sp.view = view;
      sp.dying = null;
      if (!sp.tex || !scene.textures.exists(sp.tex)) {
        sp.tex = art.pin(view.color, ctl.iconOf(view));
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
        const label = 14 / zc; // clear the name label above the head
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
            yOff = -fall * (30 / zc);
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
      sp.img.setPosition(px, py).setScale(s * k2).setRotation(rot).setAlpha(alpha).setVisible(true);
      if (sp.img.depth !== depth) sp.img.setDepth(depth); // setDepth always queues a display-list sort
      if (sp.shadow) {
        const near = 1 - Math.min(1, -yOff / (30 / zc));
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
    ctl.publishCounts(list);
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
    const z = cssZoom();
    const cursor = ctl.cursor();
    let hit: PinSprite | null = null;
    if (cursor.over && cursor.mouse && !ctl.pressing()) {
      const w = worldAt(cursor.sx, cursor.sy);
      hit = pinAt(w.x, w.y, 0);
    }
    const removable = !!hit && ctl.canRemove(hit.view);
    if (hit && hit.head) {
      const { text } = ctl.hoverText(hit.view);
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
    nick.update();
    gGround.clear();
    gUp.clear();
    // long-press progress ring (the controller also opens the pie, closes the radial and re-aims Q)
    const ring = ctl.tick(t);
    if (ring) {
      const z = cssZoom();
      const r = 15 / z;
      gUp.lineStyle(4 / z, 0x1a1008, 0.5).beginPath().arc(ring.wx, ring.wy, r, 0, Math.PI * 2).strokePath();
      gUp.lineStyle(2.5 / z, 0xffd76a, 0.95).beginPath().arc(ring.wx, ring.wy, r, -Math.PI / 2, -Math.PI / 2 + ring.k * Math.PI * 2).strokePath();
    }
    if (ctl.needsLayout() || pins.size) layoutPins(t);
    ctl.clean();
    drawEmotes(t);
    updateHover();
  }

  // e2e / debugging only (opt-in per browser): what the layer is drawing right now
  try {
    if (window.localStorage.getItem('ct.debug.social') === '1') {
      const w = window as unknown as { __ctSocial?: unknown };
      w.__ctSocial = {
        ...ctl.debug(),
        emotes: () =>
          [...ctl.emotes().values()].map((e) => {
            const sp = emoteSprites.get(e);
            return { pid: e.pid, dir: sp?.dir ?? null, hand: !!sp?.hand?.visible, alpha: sp?.hand?.alpha ?? 0, x: sp?.hand?.x, y: sp?.hand?.y, depth: sp?.hand?.depth, tex: sp?.hand?.texture.key, frame: sp?.hand?.frame.name, ping: !!sp?.ping?.visible };
          }),
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
    onTap: (x, y) => ctl.onTap(x, y, toPointer(input.activePointer)),
    destroy() {
      for (const off of offs.splice(0)) off();
      ctl.destroy();
      for (const [id, sp] of pins) destroyPin(id, sp);
      gGround.destroy();
      gUp.destroy();
      badge.destroy();
      art.destroy();
      try {
        scene.game.canvas.style.cursor = '';
      } catch {
        // canvas already gone
      }
    },
  };
}
