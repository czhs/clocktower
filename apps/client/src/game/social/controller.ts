// Social controller: the renderer-free half of the in-world social layer (pointing emotes + character pins).
// v3 WP0s split of social/index.ts with no behaviour change (docs/v3/INTEGRATION.md §3, §8 WP0s). The Phaser
// town draws it through social/phaserView.ts; the v3 3D town draws it through game3d/overlay/socialView.ts.
//
// Owns: gesture input (the pointer state machine, keys Q / F / Esc, the touch long-press), the client rate
// buckets, the optimistic pins model (local drops, optimistic removals, reconcile with the server's pins),
// emote models and the point / pin / unpin / clear / nick-face sends, the socialActions registration and the
// pie menu (radial.ts). It never draws: everything renderer-specific (screen <-> world, the drawn pins for hit
// tests, emote sprites) goes through the `SocialSurface` the renderer passes in.
//
// Gestures:
//   desktop  right-click            point (at a person if one is under the cursor, else the spot)
//            right-drag (or hold)   the point / pin pie menu around the pointer (radial.ts)
//            Q (hold + move = re-aim) point at the cursor
//            F · middle-click · shift+click   drop a pin (on a person = it follows them)
//            click one of your pins  remove it (the Storyteller may remove any)
//            Esc                      cancel an armed dock mode / the radial
//   touch    tap                      as before (walk / Storyteller teleport) — decided on release
//            long-press (450 ms)      the same pie menu at the finger
//            tap one of your pins     remove it
//   dock     👉 / 📍 buttons arm the next tap; swatches pick the pin colour (ui/social/SocialPalette)
//
// Secrecy: pins come only from WorldSnapshot.pins (the server's per-viewer filter), shown only while the
// snapshot's location is still ours; emotes only as delivered to us. Nothing here is sent anywhere except
// the four 'social:*' messages.
//
// Must not import 'phaser' or three (apps/client/test/social.controller.test.ts checks the import closure).
import { EMOTE_POINT_MS, type EmoteEvent, type Facing, type LocationId, type PinView, type WorldSnapshot } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { stagePick } from '../gameplay/pick';
import { castManifest } from '../../ui/common/castPortrait';
import { createBucket, EMOTE_BUCKET, evictedByDrop, loadPinColor, LONG_PRESS_MS, PIN_BUCKET, pinLabel, pressState, reconcileLocal, savePinColor, type LocalPin, type PressState } from './logic';
import { socialActions, socialHover, socialInfo, socialMode, socialRadial, type SocialTarget } from './state';
import { createPie, pieMenu, type PieController } from './radial';
import type { PieTargetInfo } from './radialLogic';

/** The slice of RoomConnection the controller uses (a real RoomConnection satisfies it). */
export type SocialConn = Pick<RoomConnection, 'events' | 'lobbyView' | 'send'>;

export interface SocialControllerCtx {
  conn: SocialConn;
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
   * Optional: run the renderer's normal primary-tap handling for a screen point (tap-to-go / teleport)
   * without asking the social layer again. Touch taps are held until release (a long-press must not
   * start a walk first) and replayed through this.
   */
  passTap?(sx: number, sy: number): void;
}

/** A pointer event in renderer screen coordinates (Phaser: canvas px; v3: page CSS px). */
export interface SocialPointer {
  id: number;
  /** 0 primary, 1 middle, 2 secondary. */
  button: number;
  sx: number;
  sy: number;
  /** The renderer saw a touch (Phaser `wasTouch`). */
  wasTouch: boolean;
  /** The DOM event behind it, if any (pointerType, shiftKey, target, preventDefault). */
  event?: (Partial<Pick<PointerEvent, 'pointerType' | 'shiftKey'>> & { target?: EventTarget | null; preventDefault?(): void }) | undefined;
}

/** A drawn pin, as the renderer hit-tests it. */
export interface SocialPinHit {
  id: string;
  view: PinView;
}

/** What the controller needs from (and tells) the renderer. */
export interface SocialSurface {
  /** Screen -> world px (feet coordinates). */
  worldAt(sx: number, sy: number): { x: number; y: number };
  /** Screen -> viewport CSS px (the pie menu is a DOM overlay). */
  clientOf(sx: number, sy: number): { x: number; y: number };
  /** CSS px per world px (sizes meant in screen px use it). */
  cssZoom(): number;
  /** Topmost drawn pin under a world point (`slack` = extra world px), else null. */
  pinAt(wx: number, wy: number, slack: number): SocialPinHit | null;
  /** Whether a DOM event target is the town surface itself (taps on HUD elements are not the town's). */
  isSurface(target: EventTarget): boolean;
  /** Fallback when ctx.passTap is absent: replay a primary tap at a screen point. */
  replayTap?(sx: number, sy: number): void;
  /** An emote model appeared / went away (create / destroy its sprites). */
  emoteAdded?(e: EmoteModel): void;
  emoteRemoved?(e: EmoteModel): void;
  /** Nick Song's 'nick-face' should show on this pid now. */
  nickFace?(pid: string): void;
  /** The viewer's snapshot location changed (emotes were dropped; clear per-place effects). */
  placeChanged?(): void;
}

export interface EmoteModel {
  pid: string;
  x: number;
  y: number;
  target?: string;
  /** performance.now() when it was shown. */
  t0: number;
}

export interface DisplayPin {
  view: PinView;
  /** Optimistic drop not yet confirmed by the server. */
  local: boolean;
}

export interface SocialCursor {
  readonly sx: number;
  readonly sy: number;
  readonly over: boolean;
  readonly mouse: boolean;
}

export interface SocialController {
  // --- input (the renderer forwards its pointer events)
  pointerDown(p: SocialPointer): void;
  pointerMove(p: SocialPointer): void;
  pointerUp(p: SocialPointer): void;
  pointerOver(): void;
  pointerOut(): void;
  /** Asked FIRST on every primary tap on the town (world px + the pointer); true = consumed. */
  onTap(wx: number, wy: number, p: SocialPointer): boolean;
  /** Per frame, before drawing: emote expiry, long-press progress, radial auto-close, Q re-aim. Returns the long-press
   *  progress ring to draw (world px, k in 0..1), else null. */
  tick(t: number): { wx: number; wy: number; k: number } | null;

  // --- actions (also reachable through socialActions / the pie)
  point(t: SocialTarget): void;
  pin(t: SocialTarget): void;
  unpin(id: string): void;
  clear(scope: 'mine' | 'all'): void;
  nickFace(): void;
  /** What a gesture at a world point is aimed at. */
  targetAt(wx: number, wy: number): SocialTarget;

  // --- model (for drawing)
  /** Pins to show now (server minus optimistic removals, plus optimistic drops). `known` = server ids the
   *  renderer already draws; `adopted` maps an optimistic id to the server id that confirmed it. */
  displayPins(t: number, known: ReadonlySet<string>): { list: DisplayPin[]; adopted: ReadonlyMap<string, string> };
  /** Publish the dock counters for a displayPins list. */
  publishCounts(list: readonly DisplayPin[]): void;
  /** The icon to show on a pin: the dropper's cast id, or (unknown / legacy) how this client draws them. */
  iconOf(v: PinView): string;
  canRemove(v: PinView): boolean;
  nameOf(pid: string): string;
  /** Hover tooltip text for a drawn pin. */
  hoverText(v: PinView): { text: string; removable: boolean };
  /** The snapshot location is ours (pins may show). */
  here(): boolean;
  /** performance.now() when we entered the current place (pins arriving soon after were already there). */
  placeSince(): number;
  /** The pin model changed since clean() (or optimistic drops are waiting). */
  needsLayout(): boolean;
  markDirty(): void;
  clean(): void;
  /**
   * The LIVE emote map (pid -> model), not a copy. The controller removes entries itself: tick(t) expires every
   * emote whose emoteAge has reached EMOTE_POINT_MS, and snapshots / place changes / destroy clear it, each
   * calling surface.emoteRemoved first. Iterate it synchronously within a frame (dropEmote may be called while
   * iterating; JS Map iteration tolerates deleting entries); never cache it or iterate across an await. Copy it
   * (`[...ctl.emotes().values()]`) to keep a list.
   */
  emotes(): ReadonlyMap<string, EmoteModel>;
  /** Age of an emote at t (the debug hold freezes it at half its life). */
  emoteAge(e: EmoteModel, t: number): number;
  /** Drop one emote early (e.g. the renderer has no sprite for it); calls surface.emoteRemoved. Safe while iterating emotes(). */
  dropEmote(pid: string): void;
  cursor(): SocialCursor;
  /** A touch press is being decided (no hover). */
  pressing(): boolean;
  /** Debug log (e2e): `seen` entries, at most 200. */
  noteSeen(s: string): void;
  /** window.__ctSocial members that do not depend on the renderer. */
  debug(): { seen(): string[]; hold(on: boolean): void; radial(): unknown; pie(): unknown };
  destroy(): void;
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
  /** The long-press has opened the pie menu. */
  opened?: boolean;
}

const touchLikeOf = (p: SocialPointer) => p.wasTouch || p.event?.pointerType === 'touch' || p.event?.pointerType === 'pen';

export function createSocialController(ctx: SocialControllerCtx, surface: SocialSurface): SocialController {
  const conn = ctx.conn;
  const offs: (() => void)[] = [];
  const emotes = new Map<string, EmoteModel>();
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
  const radialAt = 0;
  /** Last touch activity: browsers follow a touch with emulated mouse events ("ghost clicks"). */
  let lastTouchAt = -1e9;
  /** (debug hook) pids whose pointing hand has been drawn. */
  const debugSeen: string[] = [];
  /** (debug hook) keep gestures on screen (slow test machines take seconds per screenshot). */
  let debugHold = false;
  let qHeld = false;
  let lastPoint = { t: 0, x: NaN, y: NaN, pid: null as string | null };
  const cursor = { sx: 0, sy: 0, over: false, mouse: true };
  let dirty = true;

  // remembered pin colour
  try {
    socialMode.set((m) => ({ ...m, color: loadPinColor(window.localStorage, m.color) }));
  } catch {
    // no storage
  }

  const now = () => performance.now();
  const me = () => ctx.myPid();
  const ready = () => {
    const pid = me();
    return !!pid && !!ctx.positionOf(pid);
  };
  const nameOf = (pid: string) => conn.lobbyView.get()?.members.find((m) => m.pid === pid)?.displayName ?? 'Someone';
  const clampCoord = (v: number) => Math.max(-64, Math.min(4096, Math.round(v * 10) / 10));

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

  /** Nick Song's 'nick-face' (the palette shows it only to nicksong; the server re-checks). */
  function nickFace() {
    const pid = me();
    if (!pid || !ready()) return;
    if (!emoteBucket.take(now())) return;
    conn.send('social:emote', { kind: 'nick-face' });
    surface.nickFace?.(pid);
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
    nickFace,
    cancel: () => {
      closeRadial('cancel');
      if (socialMode.get().mode !== 'idle') socialMode.set((m) => ({ ...m, mode: 'idle' }));
    },
  });
  offs.push(() => socialActions.register(null));

  // v2.2 point / pin pie menu (right-drag; touch long-press): radial.ts + ui/social/PieMenu.tsx
  const pie: PieController = createPie({
    point,
    pin: (t, c) => {
      if (socialMode.get().color !== c) socialMode.set((m) => ({ ...m, color: c }));
      try {
        savePinColor(window.localStorage, c);
      } catch {
        // storage blocked
      }
      pin(t);
    },
    unpin,
    color: () => socialMode.get().color,
    log: (s) => void (debugSeen.length < 200 && debugSeen.push(s)),
  });
  offs.push(() => pie.destroy());
  /** Who / what is under a press, for the pie's wedges and captions. */
  function pieInfo(wx: number, wy: number, t: SocialTarget): PieTargetInfo {
    const hit = surface.pinAt(wx, wy, 4 / surface.cssZoom());
    const removable = hit && !hit.id.startsWith('~') && canRemove(hit.view) ? { id: hit.id, mine: hit.view.by === me(), byName: nameOf(hit.view.by) } : null;
    return { name: t.pid ? nameOf(t.pid) : null, self: !!t.pid && t.pid === me(), removable };
  }

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
        pie.close('moved');
        for (const e of emotes.values()) surface.emoteRemoved?.(e);
        emotes.clear();
        surface.placeChanged?.();
      }
      server = s.pins ?? [];
      dirty = true;
    }),
  );
  offs.push(
    conn.events.on('social:emote', (ev: EmoteEvent) => {
      if (ev.kind === 'nick-face') {
        if (ev.pid !== me()) surface.nickFace?.(ev.pid); // ours was shown the instant we sent it
        return;
      }
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

  function pointerDown(p: SocialPointer) {
    const ev = p.event;
    cursor.mouse = !p.wasTouch && ev?.pointerType !== 'touch' && ev?.pointerType !== 'pen';
    if (p.button === 0 || stagePick.get()) return; // primary: the renderer asks onTap()
    if (!ready()) return;
    const w = surface.worldAt(p.sx, p.sy);
    if (p.button === 2) {
      // a quick still click points (as before); a drag / hold opens the pie menu (radial.ts)
      const t = targetAt(w.x, w.y);
      const c = surface.clientOf(p.sx, p.sy);
      pie.rightPress({ cx: c.x, cy: c.y, target: t, info: pieInfo(w.x, w.y, t) });
    } else if (p.button === 1) {
      ev?.preventDefault?.(); // no autoscroll
      pin(targetAt(w.x, w.y));
    }
  }
  function pointerMove(p: SocialPointer) {
    cursor.sx = p.sx;
    cursor.sy = p.sy;
    cursor.over = true;
    if (press && press.id === p.id) {
      press.moved = Math.max(press.moved, Math.hypot(p.sx - press.sx, p.sy - press.sy));
      if (press.state === 'long') {
        const c = surface.clientOf(p.sx, p.sy);
        pie.move(c.x, c.y);
      } else press.state = pressState(press.downAt, now(), press.moved, press.state);
    }
  }
  function pointerUp(p: SocialPointer) {
    if (p.wasTouch) lastTouchAt = now();
    if (!press || press.id !== p.id) return;
    const pr = press;
    press = null;
    const st = pressState(pr.downAt, now(), pr.moved, pr.state);
    if (st === 'long') {
      // the pie menu: a wedge under the finger commits; lifting in the middle leaves it for a tap
      const c = surface.clientOf(p.sx, p.sy);
      pie.release(c.x, c.y);
      return;
    }
    if (st === 'cancelled') return;
    // a short tap: your pin -> remove it; else the town's normal tap
    const hit = surface.pinAt(pr.wx, pr.wy, 8 / surface.cssZoom());
    if (hit && canRemove(hit.view)) {
      unpin(hit.id);
      return;
    }
    replayTap(pr.sx, pr.sy);
  }

  function closeRadial(why = '') {
    if (!socialRadial.get()) return;
    if (debugSeen.length < 200) debugSeen.push(`radial-close:${why}`);
    socialRadial.set(null);
  }

  function replayTap(sx: number, sy: number) {
    if (ctx.passTap) return ctx.passTap(sx, sy);
    if (!surface.replayTap) return;
    replaying = true;
    try {
      surface.replayTap(sx, sy);
    } finally {
      replaying = false;
    }
  }

  const keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && (socialRadial.get() || pie.busy() || socialMode.get().mode !== 'idle')) {
      closeRadial('esc');
      pie.close('esc');
      socialMode.set((m) => ({ ...m, mode: 'idle' }));
      e.stopImmediatePropagation(); // don't also leave the cottage
      return;
    }
    if (isTyping(e) || e.repeat || stagePick.get()) return;
    if (e.code === 'KeyQ') {
      qHeld = true;
      if (cursor.over && cursor.mouse) {
        const w = surface.worldAt(cursor.sx, cursor.sy);
        point(targetAt(w.x, w.y));
      }
    } else if (e.code === 'KeyF') {
      if (cursor.over && cursor.mouse) {
        const w = surface.worldAt(cursor.sx, cursor.sy);
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

  function onTap(wx: number, wy: number, p: SocialPointer): boolean {
    if (replaying) return false;
    const ev = p.event;
    const touchLike = touchLikeOf(p);
    // The renderer may also report touches that land on HUD elements (Phaser's window listeners): those
    // taps belong to the button under the finger (e.g. the radial's), never to the town.
    const target = ev?.target;
    if (target && !surface.isSurface(target)) return true;
    cursor.mouse = !touchLike;
    if (touchLike) lastTouchAt = now();
    else if (now() - lastTouchAt < 800) return true; // the emulated click after a touch: already handled
    if (socialRadial.get()) {
      closeRadial(`tap:${touchLike ? 'touch' : 'mouse'}`);
      return true; // a tap elsewhere just closes the radial
    }
    if (pie.busy()) {
      pie.close(`tap:${touchLike ? 'touch' : 'mouse'}`);
      return true; // a tap / click off the pie menu just closes it
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
      const hit = surface.pinAt(wx, wy, 0);
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
    const c = surface.clientOf(p.sx, p.sy);
    press = { id: p.id, downAt: now(), sx: p.sx, sy: p.sy, cx: c.x, cy: c.y, wx, wy, moved: 0, state: 'pending' };
    return true;
  }

  // -------------------------------------------------------------------------------------
  // emotes

  function showEmote(ev: EmoteEvent) {
    const old = emotes.get(ev.pid);
    if (old) surface.emoteRemoved?.(old);
    const e: EmoteModel = { pid: ev.pid, x: ev.x, y: ev.y, ...(ev.target ? { target: ev.target } : {}), t0: now() };
    emotes.set(ev.pid, e);
    surface.emoteAdded?.(e);
  }

  // -------------------------------------------------------------------------------------
  // pins

  function displayPins(t: number, known: ReadonlySet<string>): { list: DisplayPin[]; adopted: ReadonlyMap<string, string> } {
    for (const [id, until] of hidden) if (t > until) hidden.delete(id);
    const pid = me();
    const rec = reconcileLocal(locals, server, pid, known, t);
    locals = rec.waiting;
    const list: DisplayPin[] = [];
    for (const v of server) if (!hidden.has(v.id)) list.push({ view: v, local: false });
    if (pid) {
      const character = ctx.characterOf(pid);
      for (const l of locals) list.push({ view: { id: l.id, by: pid, character, color: l.color, target: l.target, at: Date.now() + l.t }, local: true });
    }
    return { list, adopted: rec.adopted };
  }

  function iconOf(v: PinView): string {
    const m = castManifest();
    if (!m || m.sheets[v.character]) return v.character;
    return ctx.characterOf(v.by);
  }

  // -------------------------------------------------------------------------------------
  // per frame

  function dropEmote(pid: string) {
    const e = emotes.get(pid);
    if (!e) return;
    surface.emoteRemoved?.(e);
    emotes.delete(pid);
  }
  const emoteAge = (e: EmoteModel, t: number) => (debugHold ? Math.min(t - e.t0, EMOTE_POINT_MS / 2) : t - e.t0);

  function tick(t: number): { wx: number; wy: number; k: number } | null {
    let ring: { wx: number; wy: number; k: number } | null = null;
    // emotes expire here (emoteAlpha(age, EMOTE_POINT_MS) is 0 from then on), so renderers never have to
    for (const [pid, e] of emotes) if (emoteAge(e, t) >= EMOTE_POINT_MS) dropEmote(pid);
    // long-press progress / radial
    if (press && press.state !== 'cancelled') {
      press.state = pressState(press.downAt, t, press.moved, press.state);
      const age = t - press.downAt;
      if (press.state === 'long' && !press.opened) {
        press.opened = true;
        const tg = targetAt(press.wx, press.wy);
        pie.openTouch({ cx: press.cx, cy: press.cy, target: tg, info: pieInfo(press.wx, press.wy, tg) });
        try {
          navigator.vibrate?.(12);
        } catch {
          // no haptics
        }
      } else if (press.state === 'pending' && age > 110) {
        ring = { wx: press.wx, wy: press.wy, k: Math.min(1, (age - 110) / (LONG_PRESS_MS - 110)) };
      }
    }
    // the radial closes itself if ignored, or when we change place
    if (socialRadial.get() && !press && (t - radialAt > 8000 || snapLoc !== ctx.me().location)) closeRadial(t - radialAt > 8000 ? 'timeout' : 'moved');
    // hold Q: re-aim when the cursor moves to something else
    if (qHeld && cursor.over && cursor.mouse && t - lastPoint.t > 650) {
      const w = surface.worldAt(cursor.sx, cursor.sy);
      const tg = targetAt(w.x, w.y);
      if (tg.pid !== lastPoint.pid || (tg.pid === null && Math.hypot(tg.x - lastPoint.x, tg.y - lastPoint.y) > 20)) point(tg);
    }
    return ring;
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerOver: () => void (cursor.over = true),
    pointerOut: () => void (cursor.over = false),
    onTap,
    tick,
    point,
    pin,
    unpin,
    clear,
    nickFace,
    targetAt,
    displayPins,
    publishCounts(list) {
      const pid = me();
      const mine = list.filter((p) => p.view.by === pid).length;
      const info = socialInfo.get();
      if (info.mine !== mine || info.here !== list.length) socialInfo.set({ mine, here: list.length });
    },
    iconOf,
    canRemove,
    nameOf,
    hoverText(v) {
      const removable = canRemove(v);
      const mine = v.by === me();
      const target = v.target.kind === 'person' ? v.target.pid : null;
      const text = pinLabel({ byName: nameOf(v.by), mine, targetName: target ? nameOf(target) : null, targetIsMe: target === me() }) + (removable ? ' · click to remove' : '');
      return { text, removable };
    },
    here: () => snapLoc !== null && snapLoc === ctx.me().location,
    placeSince: () => locSince,
    needsLayout: () => dirty || locals.length > 0,
    markDirty: () => void (dirty = true),
    clean: () => void (dirty = false),
    emotes: () => emotes,
    emoteAge,
    dropEmote,
    cursor: () => cursor,
    pressing: () => press !== null,
    noteSeen(s) {
      if (!debugSeen.includes(s)) debugSeen.push(s);
    },
    debug: () => ({
      seen: () => [...debugSeen],
      hold: (on: boolean) => void (debugHold = on),
      radial: () => socialRadial.get(),
      pie: () => pieMenu.get(),
    }),
    destroy() {
      for (const off of offs.splice(0)) off();
      for (const e of emotes.values()) surface.emoteRemoved?.(e);
      emotes.clear();
      socialRadial.set(null);
      socialHover.set(null);
      socialInfo.set({ mine: 0, here: 0 });
      socialMode.set((m) => ({ ...m, mode: 'idle' }));
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
