// v3 WP4 (v3-overlay). The in-world social layer of the 3D town: pins, pointing emotes, the touch
// long-press ring and pin hover, drawn over social/controller.ts (the renderer-free half of v2's social
// layer: gestures, rate buckets, the optimistic pins model, the pie menu and every send). This file is the
// v3 counterpart of social/phaserView.ts; behaviour and secrecy are the controller's (pins only from the
// viewer's own snapshot while the snapshot location is ours, emotes only as delivered to us).
//
// Art: markers(-night) atlas — `pin_<colour>` with the dropper's `icon_<castId>` (portraits atlas) on its
// inner disc, `pin_shadow`, `pin_drop_0..3` once on landing, `point_<dir>_<f>` hands (sequence 0,1,2,1 at
// 7.5 fps) beside the emoter's head (feet + 0.72 × height), `ping_0..3` at the pointed spot / person's feet,
// `ping_mark` over a pointed spot, `trail_0/1` dots every 6 texels, `pin_remove` on a removable hovered pin.
// All blitted on the FX canvas at the 3D image's texel scale, positions from View3d / AvatarRegistry.
//
// Input: WP1's input/pointer.ts forwards every press / move / release / enter / leave to `sink` and asks
// `sink.onTap` FIRST on every primary tap (exactly like TownScene asks social.onTap); touch taps the
// controller holds come back through `deps.passTap` (= WP1's PointerInput.tapAt). Without WP1's input
// (`deps.ownPointerInput`, the harness) the view listens on the surface itself.
//
// Hit tests run in screen space: the controller asks in world px (it got them from worldAt), so worldAt
// remembers the screen point it answered for and pinAt / entityAt use that point (a 3D pick can map a
// roof click to the house's door tile, whose re-projection would be elsewhere).
import { EMOTE_POINT_MS, NICK_FACE_MS, type PinView } from '@ct/protocol';
import { createSocialController, type EmoteModel, type SocialController, type SocialPointer } from '../../game/social/controller';
import { DIR_VECTORS, emoteAlpha, fanSlot, nearestDir, personStacks } from '../../game/social/logic';
import { socialHover, socialMode } from '../../game/social/state';
import { stackBase } from './anchors';
import { newPlaceState, place, setShown, setStyle, setText, type PlaceState } from './place';
import type { DrawnAvatar, OverlayEnv, OverlayFrame, OverlayView } from './types';

// markers.json meta (anchors in texels)
const PIN_ANCHOR = { x: 8, y: 25 };
const PIN_ICON = { left: 3, top: 3, cx: 6, cy: 6, r: 5 };
const PIN_HEAD = { x: 9, y: 9, r: 6 };
const PIN_W = 18;
const SHADOW_ANCHOR = { x: 6, y: 2 };
const DROP_ANCHOR = { x: 13, y: 12 };
const POINT_ANCHOR = { x: 10, y: 10 };
const POINT_OFFSET = 14;
const POINT_SIZE = 20;
const POINT_SEQ = [0, 1, 2, 1];
const PING_ANCHOR = { x: 14, y: 7 };
const MARK_ANCHOR = { x: 4, y: 5 };
const REMOVE_ANCHOR = { x: 4, y: 4 };
const TRAIL_GAP = 6;
// timing (markers meta.newStyle.timing)
const DROP_MS = 460;
const POP_MS = 170;
const SETTLE_MS = 900;
const DROP_PX = 16;
const LAND_K = 0.68;
const FPS_POINT = 7.5;
const FPS_PING = 10;
const FPS_DROP = 15;

interface PinSprite {
  id: string;
  view: PinView;
  local: boolean;
  born: number;
  animate: boolean;
  landedAt: number | null;
  dying: number | null;
  /** Head circle (root-local CSS px) while shown, for hit tests / hover. */
  head: { x: number; y: number; r: number } | null;
  tip: { x: number; y: number } | null;
  /** The reused head / tip objects (head / tip point at them while the pin is shown). */
  headBuf: { x: number; y: number; r: number };
  tipBuf: { x: number; y: number };
}

/** What WP1's input/pointer.ts forwards pointer events to (`PointerInput.setSocial`). */
export type SocialSink = Pick<SocialController, 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerOver' | 'pointerOut' | 'onTap'>;

export interface SocialView extends OverlayView {
  /** Ask FIRST on every primary tap / click on the town (a DOM pointer event); true = the social layer consumed it. */
  tapFirst(ev: PointerEvent | MouseEvent): boolean;
  /** Pointer sink for WP1's input layer (records the screen point of each claim for the hit tests). */
  sink: SocialSink;
  /** The `__ctSocial` members (controller + this view), for a host that installs the hook itself. */
  debugMembers(): Record<string, () => unknown>;
  controller: SocialController;
}

export function createSocialView(env: OverlayEnv): SocialView {
  const { deps, surface, atlas, stats } = env;
  const el = deps.surface ?? deps.parent;
  const offs: (() => void)[] = [];
  const pins = new Map<string, PinSprite>();
  let frame: OverlayFrame | null = null;
  let cursorStyle = '';
  let hoverKey = '';
  const nickFaces = new Map<string, { t0: number; el: HTMLElement; st: PlaceState; size: number }>();
  const tmp = { x: 0, y: 0 };
  const known = new Set<string>();
  const live = new Set<string>();
  const ptBuf = { x: 0, y: 0 };

  /** The last screen point (page CSS px) worldAt answered, and its answer. */
  const asked = { sx: NaN, sy: NaN, wx: NaN, wy: NaN };
  const me = () => frame?.state.me ?? null;
  const drawnOf = (pid: string): DrawnAvatar | null => frame?.byPid.get(pid) ?? null;

  const worldAt = (sx: number, sy: number) => {
    const w = deps.view.screenToWorld(sx, sy);
    const m = me();
    const out = w ? { x: w.x, y: w.y } : m ? { x: m.x, y: m.y } : { x: 0, y: 0 };
    asked.sx = sx;
    asked.sy = sy;
    asked.wx = out.x;
    asked.wy = out.y;
    return out;
  };
  /** Page CSS px of a world point the controller handed back (the screen point it came from, if any). */
  const screenOf = (wx: number, wy: number): { x: number; y: number } | null => {
    if (wx === asked.wx && wy === asked.wy) return { x: asked.sx, y: asked.sy };
    const loc = me()?.location;
    return loc ? deps.view.worldToScreen({ x: wx, y: wy }, loc) : null;
  };

  const ctl: SocialController = createSocialController(
    {
      conn: deps.conn,
      myPid: () => frame?.state.myPid ?? deps.conn.lobbyView.get()?.youPid ?? null,
      me: () => {
        const m = me();
        return m ? { x: m.x, y: m.y, location: m.location, facing: m.facing } : { x: 0, y: 0, location: 'outdoors', facing: 'down' };
      },
      amStoryteller: () => !!frame?.state.amStoryteller,
      positionOf: (pid) => {
        const a = drawnOf(pid);
        return a ? { x: a.feet.x, y: a.feet.y } : null;
      },
      entityAt: (wx, wy) => {
        const s = screenOf(wx, wy);
        return s ? deps.avatars.pidAt(s.x, s.y) : null;
      },
      characterOf: (pid) => frame?.state.members.get(pid)?.castId ?? 'storyteller',
      faceToward: (x, y) => deps.faceToward?.(x, y),
      ...(deps.passTap ? { passTap: (sx: number, sy: number) => deps.passTap!(sx, sy) } : {}),
    },
    {
      worldAt,
      clientOf: (sx, sy) => ({ x: sx, y: sy }), // our screen coords already are viewport CSS px
      cssZoom: () => Math.max(0.05, deps.view.cssPerPx()),
      pinAt: (wx, wy, slack) => {
        const s = screenOf(wx, wy);
        if (!s) return null;
        const hit = pinAtCss(surface.toLocal(s.x, s.y, tmp), slack * Math.max(0.05, deps.view.cssPerPx()));
        return hit ? { id: hit.id, view: hit.view } : null;
      },
      // the town surface or anything inside it (the 3D canvas under the pointer-events:none overlay root)
      isSurface: (target) => target === el || (typeof Node !== 'undefined' && target instanceof Node && el.contains(target)),
      emoteAdded: () => undefined,
      emoteRemoved: () => undefined,
      nickFace: (pid) => showNickFace(pid),
      placeChanged: () => clearNickFaces(),
    },
  );

  // -------------------------------------------------------------------------------------
  // input (DOM pointer events -> controller)

  const toPointer = (e: PointerEvent | MouseEvent): SocialPointer => {
    const pe = e as PointerEvent;
    const touch = pe.pointerType === 'touch' || pe.pointerType === 'pen';
    return { id: typeof pe.pointerId === 'number' ? pe.pointerId : 1, button: e.button, sx: e.clientX, sy: e.clientY, wasTouch: touch, event: e as unknown as SocialPointer['event'] };
  };
  // WP1's input/pointer.ts forwards the town's pointer events to `sink` (setSocial); a host without that
  // input layer (harness) passes `ownPointerInput` and the view listens on the surface itself.
  const sink: SocialSink = {
    pointerDown: (p) => ctl.pointerDown(p),
    pointerMove: (p) => ctl.pointerMove(p),
    pointerUp: (p) => ctl.pointerUp(p),
    pointerOver: () => ctl.pointerOver(),
    pointerOut: () => ctl.pointerOut(),
    onTap: (wx, wy, p) => {
      // the caller resolved (wx, wy) from this pointer: hit tests use its screen point
      asked.sx = p.sx;
      asked.sy = p.sy;
      asked.wx = wx;
      asked.wy = wy;
      return ctl.onTap(wx, wy, p);
    },
  };
  if (deps.ownPointerInput) {
    const onDown = (e: PointerEvent) => {
      const p = toPointer(e);
      if (e.button === 0) {
        const w = worldAt(e.clientX, e.clientY);
        if (!ctl.onTap(w.x, w.y, p)) deps.passTap?.(e.clientX, e.clientY);
      }
      ctl.pointerDown(p);
    };
    const onMove = (e: PointerEvent) => ctl.pointerMove(toPointer(e));
    const onUp = (e: PointerEvent) => ctl.pointerUp(toPointer(e));
    const onOver = () => ctl.pointerOver();
    const onOut = () => ctl.pointerOut();
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerenter', onOver);
    el.addEventListener('pointerleave', onOut);
    el.addEventListener('contextmenu', noMenu);
    // a long-press on the town must not open the browser's callout / text selection (iOS, Android)
    const es = el.style as CSSStyleDeclaration & { webkitTouchCallout?: string; webkitUserSelect?: string };
    es.webkitTouchCallout = 'none';
    es.webkitUserSelect = 'none';
    es.userSelect = 'none';
    offs.push(() => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerenter', onOver);
      el.removeEventListener('pointerleave', onOut);
      el.removeEventListener('contextmenu', noMenu);
    });
  }

  // -------------------------------------------------------------------------------------
  // nick-face (v2.2): his head becomes a 😝 for NICK_FACE_MS (social.json has no nick_face frame by user
  // decision, so the emoji glyph is drawn as text over the head)

  function showNickFace(pid: string) {
    let f = nickFaces.get(pid);
    if (!f) {
      const e = surface.text('tip');
      setText(e, '😝', stats);
      f = { t0: 0, el: e, st: newPlaceState(), size: 0 };
      nickFaces.set(pid, f);
    }
    f.t0 = performance.now();
  }
  function clearNickFaces() {
    for (const f of nickFaces.values()) f.el.remove();
    stats.content += nickFaces.size;
    nickFaces.clear();
  }
  function drawNickFaces(f: OverlayFrame) {
    for (const [pid, nf] of nickFaces) {
      const a = f.byPid.get(pid);
      if (f.now - nf.t0 >= NICK_FACE_MS) {
        nf.el.remove();
        stats.content++;
        nickFaces.delete(pid);
        continue;
      }
      const size = Math.max(14, Math.round(0.45 * f.cssPerM));
      if (nf.size !== size) {
        nf.size = size;
        setStyle(nf.el, 'fontSize', `${size}px`, stats);
      }
      if (!a) setShown(nf.el, nf.st, false, stats);
      else place(nf.el, nf.st, a.head.x - size / 2, a.head.y + size * 0.1, stats);
    }
  }

  // -------------------------------------------------------------------------------------
  // pins

  function pinAtCss(p: { x: number; y: number }, slack: number): PinSprite | null {
    let best: PinSprite | null = null;
    for (const sp of pins.values()) {
      if (!sp.head || !sp.tip || sp.dying !== null) continue;
      const inHead = Math.hypot(p.x - sp.head.x, p.y - sp.head.y) <= sp.head.r + slack;
      const inNeedle = Math.abs(p.x - sp.tip.x) <= sp.head.r * 0.4 + slack && p.y <= sp.tip.y + slack && p.y >= sp.head.y;
      if (!inHead && !inNeedle) continue;
      // the nearest-to-camera (lowest on screen) wins, like the y-sorted v2 pins
      if (!best || sp.tip.y > best.tip!.y) best = sp;
    }
    return best;
  }

  function layoutPins(f: OverlayFrame) {
    const t = f.now;
    const px = f.px;
    known.clear();
    for (const id of pins.keys()) if (!id.startsWith('~')) known.add(id);
    const { list, adopted } = ctl.displayPins(t, known);
    for (const [lid, sid] of adopted) {
      const sp = pins.get(lid);
      if (sp && !pins.has(sid)) {
        pins.delete(lid);
        sp.id = sid;
        sp.local = false;
        pins.set(sid, sp);
      }
    }
    live.clear();
    for (let i = 0; i < list.length; i++) live.add(list[i]!.view.id);
    for (const sp of pins.values()) if (!live.has(sp.id) && sp.dying === null) sp.dying = t;
    for (const { view, local } of list) {
      let sp = pins.get(view.id);
      if (!sp) {
        sp = { id: view.id, view, local, born: t, animate: local || t - ctl.placeSince() > SETTLE_MS, landedAt: null, dying: null, head: null, tip: null, headBuf: { x: 0, y: 0, r: 0 }, tipBuf: { x: 0, y: 0 } };
        pins.set(view.id, sp);
      }
      sp.view = view;
      sp.dying = null;
    }
    const here = ctl.here();
    const stacks = personStacks(list.map((p) => p.view));
    for (const [id, sp] of pins) {
      sp.head = null;
      sp.tip = null;
      const v = sp.view;
      let tip: { x: number; y: number } | null = null;
      let isPlace = false;
      const pt = ptBuf;
      if (!here) {
        if (sp.dying !== null) pins.delete(id);
        continue;
      }
      if (v.target.kind === 'person') {
        const a = f.byPid.get(v.target.pid);
        if (!a) {
          if (sp.dying !== null) pins.delete(id);
          continue;
        }
        const stack = stacks.get(v.target.pid) ?? [v];
        const i = Math.max(0, stack.findIndex((q) => q.id === v.id));
        const slot = fanSlot(i, stack.length, PIN_W * px);
        const base = stackBase(a.label, a.head, px, pt);
        const bob = f.still ? 0 : (Math.floor(t / 500 + i) % 2) * px; // 1 texel at 2 fps
        pt.x = base.x + slot.dx;
        pt.y = base.y + slot.dy - bob;
        tip = pt;
      } else {
        tip = f.project(v.target, 0, pt);
        isPlace = true;
        if (!tip) continue;
      }
      // drop / pop
      let yOff = 0;
      let alpha = 1;
      if (sp.dying !== null) {
        const k = (t - sp.dying) / POP_MS;
        if (k >= 1) {
          pins.delete(id);
          continue;
        }
        alpha = 1 - k;
      } else if (sp.animate) {
        const k = (t - sp.born) / (f.still ? 220 : DROP_MS);
        if (k < 1) {
          if (f.still) alpha = k;
          else {
            const fall = k < LAND_K ? 1 - (k / LAND_K) ** 2 : -0.14 * Math.sin(((k - LAND_K) / (1 - LAND_K)) * Math.PI);
            yOff = -fall * DROP_PX * px;
            alpha = Math.min(1, k * 4);
          }
        } else sp.animate = false;
        if (sp.landedAt === null && (f.still || k >= LAND_K)) sp.landedAt = t;
      }
      // landing sparkle (under the pin body, once)
      if (sp.landedAt !== null && !f.still) {
        const fi = Math.floor(((t - sp.landedAt) / 1000) * (FPS_DROP / 2));
        if (fi < 4) f.fx.blit(atlas.frame('markers', `pin_drop_${fi}`, f.night), tip.x, tip.y, DROP_ANCHOR.x, DROP_ANCHOR.y, alpha);
      }
      if (isPlace) f.fx.blit(atlas.frame('markers', 'pin_shadow', f.night), tip.x, tip.y, SHADOW_ANCHOR.x, SHADOW_ANCHOR.y, alpha * (yOff < 0 ? 0.6 : 1));
      const y = tip.y + yOff;
      const body = atlas.frame('markers', `pin_${v.color}`, f.night) ?? atlas.frame('markers', 'pin_gold', f.night);
      const x0 = tip.x - PIN_ANCHOR.x * px;
      const y0 = y - PIN_ANCHOR.y * px;
      if (!f.fx.blit(body, tip.x, y, PIN_ANCHOR.x, PIN_ANCHOR.y, alpha)) f.fx.ellipse(tip.x, y - 9 * px, 5, 5, f.tokens.gold, alpha);
      const icon = atlas.frame('portraits', `icon_${ctl.iconOf(v)}`, f.night);
      f.fx.blitDisc(icon, x0 + PIN_ICON.left * px, y0 + PIN_ICON.top * px, PIN_ICON.cx, PIN_ICON.cy, PIN_ICON.r, alpha);
      sp.tipBuf.x = tip.x;
      sp.tipBuf.y = y;
      sp.tip = sp.tipBuf;
      sp.headBuf.x = x0 + PIN_HEAD.x * px;
      sp.headBuf.y = y0 + PIN_HEAD.y * px;
      sp.headBuf.r = PIN_HEAD.r * px;
      sp.head = sp.headBuf;
      if (v.target.kind === 'person') {
        const a = f.byPid.get(v.target.pid);
        if (a) a.stackTop = Math.min(a.stackTop ?? Infinity, y0);
      }
    }
    ctl.publishCounts(list);
  }

  // -------------------------------------------------------------------------------------
  // emotes

  function drawEmotes(f: OverlayFrame) {
    const t = f.now;
    const px = f.px;
    for (const [pid, e] of ctl.emotes()) {
      const age = ctl.emoteAge(e, t);
      const a = emoteAlpha(age, EMOTE_POINT_MS);
      if (a <= 0) {
        ctl.dropEmote(pid);
        continue;
      }
      drawEmote(f, e, age, a, px);
    }
  }
  function drawEmote(f: OverlayFrame, e: EmoteModel, age: number, a: number, px: number) {
    const from = f.byPid.get(e.pid) ?? null;
    const target = e.target ? (f.byPid.get(e.target) ?? null) : null;
    const spot = target ? target.foot : f.project({ x: e.x, y: e.y });
    const pingF = f.still ? 0 : Math.floor((age / 1000) * FPS_PING) % 4;
    if (spot) {
      f.fx.blit(atlas.frame('markers', `ping_${pingF}`, f.night), spot.x, spot.y, PING_ANCHOR.x, PING_ANCHOR.y, a);
      if (!target) {
        const bob = f.still ? 0 : (Math.floor(age / 500) % 2) * px;
        f.fx.blit(atlas.frame('markers', 'ping_mark', f.night), spot.x, spot.y - 9 * px - bob, MARK_ANCHOR.x, MARK_ANCHOR.y, a);
      }
    }
    if (!from) return;
    const head = f.project(from.feet, 0.72 * from.heightM);
    if (!head) return;
    // aim: a person's torso, else the spot
    const aim = target ? (f.project(target.feet, 0.5 * target.heightM) ?? target.head) : spot;
    if (!aim) return;
    const dir = nearestDir(aim.x - head.x, aim.y - head.y, DIR_VECTORS);
    const v = DIR_VECTORS[dir];
    const seq = POINT_SEQ[f.still ? 0 : Math.floor((age / 1000) * FPS_POINT) % POINT_SEQ.length]!;
    const hx = head.x + v[0] * POINT_OFFSET * px;
    const hy = head.y + v[1] * POINT_OFFSET * px;
    // dotted trail from the fingertip to the aim point (below the hand)
    const tipX = hx + v[0] * (POINT_SIZE / 2) * px;
    const tipY = hy + v[1] * (POINT_SIZE / 2) * px;
    const dx = aim.x - tipX;
    const dy = aim.y - tipY;
    const dist = Math.hypot(dx, dy);
    const gap = TRAIL_GAP * px;
    const end = dist - 8 * px;
    if (end > gap) {
      const ux = dx / dist;
      const uy = dy / dist;
      const lit = f.still ? -1 : Math.floor((age / 1000) * 2.5) % 3;
      let k = 0;
      for (let d = gap * 0.5; d < end; d += gap, k++) {
        const fade = Math.min(1, d / (gap * 2)) * a;
        f.fx.blit(atlas.frame('markers', k % 3 === lit ? 'trail_1' : 'trail_0', f.night), tipX + ux * d, tipY + uy * d, 1, 1, fade);
      }
    }
    if (f.fx.blit(atlas.frame('markers', `point_${dir}_${seq}`, f.night), hx, hy, POINT_ANCHOR.x, POINT_ANCHOR.y, a) && age < 1000) ctl.noteSeen(`${e.pid}@${Math.round(e.t0)}`);
  }

  // -------------------------------------------------------------------------------------
  // hover (mouse): tooltip + remove badge + cursor

  function updateHover(f: OverlayFrame) {
    const cursor = ctl.cursor();
    let hit: PinSprite | null = null;
    if (cursor.over && cursor.mouse && !ctl.pressing()) hit = pinAtCss(surface.toLocal(cursor.sx, cursor.sy, tmp), 0);
    const removable = !!hit && ctl.canRemove(hit.view);
    if (hit?.head) {
      const { text } = ctl.hoverText(hit.view);
      const p = surface.toPage(hit.head.x, hit.head.y - hit.head.r);
      const sx = Math.round(p.x);
      const sy = Math.round(p.y);
      const key = `${hit.id}|${sx}|${sy}|${text}`;
      if (key !== hoverKey) {
        hoverKey = key;
        socialHover.set({ sx, sy, text, removable });
      }
      if (removable) f.fx.blit(atlas.frame('markers', 'pin_remove', f.night), hit.head.x + hit.head.r * 0.78, hit.head.y - hit.head.r * 0.78, REMOVE_ANCHOR.x, REMOVE_ANCHOR.y);
    } else if (hoverKey) {
      hoverKey = '';
      socialHover.set(null);
    }
    const mode = socialMode.get().mode;
    const want = mode !== 'idle' ? 'crosshair' : removable ? 'pointer' : '';
    if (want !== cursorStyle) {
      cursorStyle = want;
      el.style.cursor = want;
      stats.content++;
    }
  }

  // -------------------------------------------------------------------------------------
  // per frame

  function update(f: OverlayFrame) {
    frame = f;
    const ring = ctl.tick(f.now);
    if (ring) {
      const s = screenOf(ring.wx, ring.wy);
      if (s) {
        const c = surface.toLocal(s.x, s.y, tmp);
        f.fx.ellipse(c.x, c.y, 8, 8, f.tokens.shadow, 0.5);
        f.fx.ellipse(c.x, c.y, 7, 7, f.tokens.gold, 0.95, ring.k);
      }
    }
    if (ctl.needsLayout() || pins.size) layoutPins(f);
    ctl.clean();
    drawEmotes(f);
    drawNickFaces(f);
    updateHover(f);
  }

  // e2e / debugging only (opt-in per browser, ct.debug.social = '1'): what the layer is drawing right now.
  // Installed here unless the host installs it itself from `debugMembers()` (deps.socialHook === false).
  const debugMembers = (): Record<string, () => unknown> => ({
    ...(ctl.debug() as unknown as Record<string, () => unknown>),
    emotes: () =>
      [...ctl.emotes().values()].map((e) => {
        const a = frame?.byPid.get(e.pid);
        return { pid: e.pid, hand: !!a, alpha: emoteAlpha(ctl.emoteAge(e, performance.now()), EMOTE_POINT_MS), x: e.x, y: e.y, target: e.target ?? null };
      }),
    pins: () =>
      [...pins.values()].map((p) => {
        const tip = p.tip ? surface.toPage(p.tip.x, p.tip.y) : null;
        const head = p.head ? { ...surface.toPage(p.head.x, p.head.y), r: p.head.r } : null;
        return { id: p.id, color: p.view.color, kind: p.view.target.kind, visible: !!p.tip, x: tip?.x ?? null, y: tip?.y ?? null, head, screen: true };
      }),
    zoom: () => deps.view.cssPerPx(),
  });
  if (deps.socialHook !== false)
    try {
      if (window.localStorage.getItem('ct.debug.social') === '1') {
        const w = window as unknown as { __ctSocial?: unknown };
        const hook = debugMembers();
        w.__ctSocial = hook;
        offs.push(() => {
          if (w.__ctSocial === hook) delete w.__ctSocial;
        });
      }
    } catch {
      // no storage
    }

  return {
    update,
    tapFirst(ev) {
      const w = worldAt(ev.clientX, ev.clientY);
      return ctl.onTap(w.x, w.y, toPointer(ev));
    },
    sink,
    debugMembers,
    controller: ctl,
    destroy() {
      for (const off of offs.splice(0)) off();
      ctl.destroy();
      clearNickFaces();
      pins.clear();
      if (hoverKey) socialHover.set(null);
      try {
        el.style.cursor = '';
      } catch {
        // gone
      }
    },
  };
}

