// v3 WP4 (v3-overlay). Chat speech bubbles over the 3D avatars (v2.2 rules, social/speech.ts).
//
// Logic reused unchanged: SpeechBook (one bubble per speaker, cap 6 / 4 on the low tier, your own bubble
// never gives way), bubbleText / wrapLines / bubbleDurationMs / bubbleAlpha, and stackBubbles through
// anchors.layoutBubbles. Secrecy as in v2: input is only `chat:message` events this client already
// received; a bubble lives only while its speaker's avatar is drawn in the viewer's place (OverlayFrame.drawn,
// v2's sprite-visible rule, not camera culling) and goes away with it; while the speaker's head is off the
// canvas the bubble keeps its slot and timer and is just not drawn. 'storyteller' / 'system' never bubble.
//
// Drawing (lead decision D2, 2026-10-17): each bubble is ONE DOM element (surface.bubble()) stacked ABOVE
// the name labels (surface Z_ORDER), so no name shows through a bubble:
//   * the box is the indicators atlas' `bubble_nine` 9-slice as a CSS border-image (the frame cropped once
//     into a data: URL by atlas.url(); slice 3 3 4 3 incl. the 1-px shadow, kit.json meta.nineSlice
//     frame_bubble, `fill` for the middle), sized in whole texels (width / height / border widths × px);
//   * the text is the element's own Text node, set with textContent (never markup), measured once per
//     message on an invisible probe (one shared span, so the box's explicit size never feeds back), rounded
//     up to whole CSS px, and once more when the web fonts arrive or when it measured 0 (hidden town);
//   * the `bubble_tail` is a decorative child (aria-hidden), so it paints over the box's bottom edge (its
//     rows 0..2 open the gold line, indicators.json bubble_sample_1) and moves with the box.
// DOM writes: the box moves by transform only (place.ts); text / size / skin are written on change only
// (new message, UI scale, day↔night art); opacity is quantised to quarter steps (the atlas' 3-step dissolve),
// so a walking crowd with bubbles adds no non-transform writes (the D2 v3WalkDomMutPerSec budget).
// A speaker's person pins (social view, FX canvas) stay visible: the bubble climbs over them.
// Slots belong to a SPEAKER (SpeechBook keeps one bubble per pid), not to a list index: another bubble
// expiring, its speaker leaving or posting again never rewrites this one's element. Freed slots are reused.
// Paint order between bubbles = newest on top (a slot whose bubble got a new message moves to the end of
// the root once, like v2 drawing the list in order).
import type { ChatMessage } from '@ct/protocol';
import { serverNow } from '../../net/serverTime';
import { bubbleAlpha, SPEECH, SpeechBook, type BubbleBox } from '../../game/social/speech';
import { layoutBubbles, stackBase, type BubbleIn, type BubbleOut } from './anchors';
import { newPlaceState, place, setShown, setStyle, setText, type PlaceState } from './place';
import { bubbleFontPx, measureEl, type BubbleEl } from './surface';
import type { OverlayEnv, OverlayFrame, OverlayView } from './types';

/** Bubble frame insets (texels; kit.json meta.nineSlice.frame_bubble) and text padding (indicators meta.bubble). */
export const NINE = { l: 3, t: 3, r: 3, b: 4 };
const PAD_X = 5;
const TEXT_TOP = 3;
/**
 * Tail rows below the box: bubble_tail is 5 tall, its rows 0..2 lie on the box's gold line, outline and
 * shadow rows (bubble_sample_1: box 15 rows incl. shadow + 2 tail rows = 17).
 */
export const TAIL_ROWS = 2;
/** bubble_tail size and tip (indicators meta.anchors.bubble_tail), texels. */
const TAIL = { w: 7, h: 5, ax: 2, ay: 4 };
/** DOM opacity steps (the atlas' 3-step dissolve + full): a fade costs ≤ 4 writes, not one per frame. */
export const ALPHA_STEPS = 4;

interface Slot {
  el: BubbleEl;
  /** The speaker this slot shows ('' = free). */
  pid: string;
  /** Text needs measuring on the probe (new text / font / UI scale, web fonts arrived, or measured 0). */
  dirty: boolean;
  st: PlaceState;
  rev: number;
  font: number;
  color: string;
  /** Measured text size (CSS px). */
  tw: number;
  th: number;
  /** Box size (texels, excl. the tail). */
  bw: number;
  bh: number;
  /** Written geometry: box size (CSS px) and the texel size the borders / tail were sized for. */
  gw: number;
  gh: number;
  geomPx: number;
  /** Written box / tail skin (data: URL, or the fallback colour key). */
  skin: string;
  tailSkin: string;
  /** Tail: written offset (CSS px, relative to the box's padding box) and shown state. */
  tx: number;
  ty: number;
  tailOn: boolean | null;
  /** Exact alpha (debug) and the last written (quantised) opacity. */
  alpha: number;
  opacity: number;
  /** Last laid-out box (root-local CSS px), for the debug hook. */
  left: number;
  top: number;
}

export interface BubbleShown {
  pid: string;
  text: string;
  alpha: number;
  /** Page CSS px of the bubble box (without the tail). */
  box: { x: number; y: number; width: number; height: number };
}

export interface BubblesView extends OverlayView {
  shown(): BubbleShown[];
}

export function createBubblesView(env: OverlayEnv, opts: { lowTier(): boolean; myPid(): string | null }): BubblesView {
  const { surface, atlas, stats, deps } = env;
  const book = new SpeechBook();
  /** Every slot ever made (destroy) / the slot of each speaker with a live bubble / free slots. */
  const slots: Slot[] = [];
  const byPid = new Map<string, Slot>();
  const free: Slot[] = [];
  /** Slot of book.list[i] this frame. */
  const live: Slot[] = [];
  const dirty: Slot[] = [];
  let fontSeen = surface.fontEpoch();
  const items: BubbleIn[] = [];
  const boxes: BubbleBox[] = [];
  const outs: BubbleOut[] = [];
  let drawn: ReadonlySet<string> = new Set();
  /** book.list index of each laid-out (on-screen) bubble. */
  const idx: number[] = [];
  /** Slots shown last frame (hidden again when their bubble is gone). */
  let shownSlots: Slot[] = [];
  let nextShown: Slot[] = [];
  const baseBuf = { x: 0, y: 0 };
  let shownN = 0;
  /** The text sizing probe (created with the first measured bubble). */
  let probe: HTMLElement | null = null;
  let probeFont = 0;
  const visible = (pid: string) => drawn.has(pid);
  const cap = () => (opts.lowTier() ? SPEECH.maxBubblesLow : SPEECH.maxBubbles);

  const off = deps.conn.events.on('chat:message', (m: ChatMessage) => {
    if (typeof m.at === 'number' && serverNow() - m.at > SPEECH.staleMs) return;
    book.add(m, performance.now(), visible, cap(), opts.myPid());
  });

  function slotFor(pid: string): Slot {
    let s = byPid.get(pid);
    if (s) return s;
    s = free.pop();
    if (!s) {
      s = {
        el: surface.bubble(),
        pid: '',
        dirty: true,
        st: newPlaceState(),
        rev: -1,
        font: 0,
        color: '',
        tw: 0,
        th: 0,
        bw: 0,
        bh: 0,
        gw: -1,
        gh: -1,
        geomPx: 0,
        skin: '',
        tailSkin: '\0',
        tx: NaN,
        ty: NaN,
        tailOn: null,
        alpha: -1,
        opacity: -1,
        left: 0,
        top: 0,
      };
      slots.push(s);
    }
    s.pid = pid;
    s.rev = -1; // a reused slot shows a new message: its text is rewritten (its written styles stay valid)
    byPid.set(pid, s);
    return s;
  }

  /** Box geometry in whole texels (written only when the size or the UI scale changed). */
  function geometry(s: Slot, px: number) {
    const box = s.el.box;
    if (s.geomPx !== px) {
      s.geomPx = px;
      setStyle(box, 'borderWidth', `${NINE.t * px}px ${NINE.r * px}px ${NINE.b * px}px ${NINE.l * px}px`, stats);
      setStyle(box, 'paddingLeft', `${(PAD_X - NINE.l) * px}px`, stats);
      setStyle(box, 'paddingRight', `${(PAD_X - NINE.r) * px}px`, stats);
      setStyle(box, 'paddingTop', `${Math.max(0, TEXT_TOP - NINE.t) * px}px`, stats);
      setStyle(s.el.tail, 'width', `${TAIL.w * px}px`, stats);
      setStyle(s.el.tail, 'height', `${TAIL.h * px}px`, stats);
      s.tx = s.ty = NaN; // the tail offset is in CSS px: re-place it
    }
    const w = s.bw * px;
    const h = s.bh * px;
    if (s.gw !== w || s.gh !== h) {
      s.gw = w;
      s.gh = h;
      setStyle(box, 'width', `${w}px`, stats);
      setStyle(box, 'height', `${h}px`, stats);
      s.tx = s.ty = NaN; // the tail sits on the bottom edge
    }
  }

  /** Box + tail art (border-image / background-image), or plain token colours until the atlas decoded. */
  function skin(s: Slot, f: OverlayFrame, nine: string | null, tail: string | null) {
    const box = s.el.box;
    const key = nine ?? `${f.tokens.bubble}|${f.tokens.bubbleEdge}|${f.px}`;
    if (s.skin !== key) {
      s.skin = key;
      if (nine) {
        setStyle(box, 'borderImageSource', `url("${nine}")`, stats);
        setStyle(box, 'borderImageSlice', `${NINE.t} ${NINE.r} ${NINE.b} ${NINE.l} fill`, stats);
        setStyle(box, 'borderImageRepeat', 'stretch', stats);
        setStyle(box, 'borderColor', 'transparent', stats);
        setStyle(box, 'backgroundColor', 'transparent', stats);
        setStyle(box, 'outline', 'none', stats);
      } else {
        // plain panel while the atlas decodes: bubble fill (borders included) with a 1-texel edge ON the outer
        // edge (an outline pulled inside the border box; an inset box-shadow would sit inside the borders)
        setStyle(box, 'borderImageSource', 'none', stats);
        setStyle(box, 'borderColor', f.tokens.bubble, stats);
        setStyle(box, 'backgroundColor', f.tokens.bubble, stats);
        setStyle(box, 'outline', `${f.px}px solid ${f.tokens.bubbleEdge}`, stats);
        setStyle(box, 'outlineOffset', `-${f.px}px`, stats);
      }
    }
    const tkey = tail ?? '';
    if (s.tailSkin !== tkey) {
      s.tailSkin = tkey;
      setStyle(s.el.tail, 'backgroundImage', tail ? `url("${tail}")` : 'none', stats);
    }
  }

  function placeTail(s: Slot, tailX: number, px: number) {
    const tail = s.el.tail;
    const on = tailX >= 0 && s.tailSkin !== '';
    if (s.tailOn !== on) {
      s.tailOn = on;
      // display, not visibility: a child's `visible` would override the hidden box it belongs to
      tail.style.display = on ? '' : 'none';
      stats.visibility++;
    }
    if (!on) return;
    // tail tip (TAIL.ax, TAIL.ay) on the last tail row at tailX of the box's border box; the child's
    // containing block is the box's padding box (inside the border)
    const tx = tailX - TAIL.ax * px - NINE.l * px;
    const ty = (s.bh + TAIL_ROWS - 1 - TAIL.ay) * px - NINE.t * px;
    if (tx === s.tx && ty === s.ty) return;
    s.tx = tx;
    s.ty = ty;
    tail.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    stats.transforms++;
  }

  /** Text sizes of new / rescaled bubbles, read on the probe (one layout read per changed bubble). */
  function measure(list: Slot[], font: number, px: number) {
    if (!list.length) return;
    const p = (probe ??= surface.text('measure'));
    if (probeFont !== font) {
      probeFont = font;
      setStyle(p, 'fontSize', `${font}px`, stats);
    }
    for (const s of list) {
      const text = s.el.text.textContent ?? '';
      setText(p, text, stats);
      const m = measureEl(p);
      s.tw = m.w;
      s.th = m.h;
      s.dirty = s.tw === 0 && text !== ''; // hidden town: measure again on a later frame
      s.bw = Math.ceil(s.tw / px) + 2 * PAD_X;
      s.bh = Math.ceil(s.th / px) + TEXT_TOP + NINE.b + 1;
    }
  }

  function update(f: OverlayFrame) {
    drawn = f.drawn;
    if (!book.list.length && !shownN) return;
    const now = f.now;
    book.prune(now, visible);
    book.trim(cap(), opts.myPid());
    const n = book.list.length;
    const px = f.px;
    const font = bubbleFontPx(px);
    const color = f.tokens.text;
    const nine = n ? atlas.url('indicators', 'bubble_nine', f.night) : null;
    const tail = n ? atlas.url('indicators', 'bubble_tail', f.night) : null;
    // 0. slots of the bubbles that are gone (expired, trimmed, speaker left) go back to the free list
    //    (n ≤ 6: a plain scan, no allocation; done every frame, since one bubble can go while another arrives)
    for (const [pid, s] of byPid) {
      let alive = false;
      for (let i = 0; i < n && !alive; i++) alive = book.list[i]!.pid === pid;
      if (!alive) release(pid, s);
    }
    const fe = surface.fontEpoch();
    const fontsChanged = fe !== fontSeen;
    fontSeen = fe;
    // 1. content (writes), then 2. measure the changed ones on the probe
    dirty.length = 0;
    live.length = n;
    for (let i = 0; i < n; i++) {
      const b = book.list[i]!;
      const s = slotFor(b.pid);
      live[i] = s;
      if (s.geomPx !== px || fontsChanged) s.dirty = true;
      if (s.rev !== b.rev) {
        s.rev = b.rev;
        s.el.text.textContent = b.text; // never markup
        surface.root.appendChild(s.el.box); // newest message paints on top of the other bubbles
        stats.content += 2;
        s.dirty = true;
      }
      if (s.font !== font) {
        s.font = font;
        setStyle(s.el.box, 'fontSize', `${font}px`, stats);
        s.dirty = true;
      }
      if (s.color !== color) {
        s.color = color;
        setStyle(s.el.box, 'color', color, stats);
      }
      if (s.dirty) dirty.push(s);
    }
    measure(dirty, font, px);
    for (let i = 0; i < n; i++) {
      const s = live[i]!;
      geometry(s, px);
      skin(s, f, nine, tail);
    }
    // 3. stack + clamp (only bubbles whose speaker's head projects this frame)
    let m = 0;
    for (let i = 0; i < n; i++) {
      const b = book.list[i]!;
      const s = live[i]!;
      nextShown.push(s);
      const a = f.byPid.get(b.pid);
      if (!a) {
        // drawn (pruned above otherwise) but off the canvas right now: keep it, draw nothing
        setShown(s.el.box, s.st, false, stats);
        continue;
      }
      const base = stackBase(a.label, a.head, px, baseBuf);
      if (a.stackTop !== null) base.y = Math.min(base.y, a.stackTop - px); // over the speaker's person pins
      const it = (items[m] ??= { x: 0, y: 0, w: 0, h: 0, tail: 0 });
      it.x = base.x;
      it.y = base.y;
      it.w = s.bw * px;
      it.h = (s.bh + TAIL_ROWS) * px;
      it.tail = TAIL_ROWS * px;
      idx[m++] = i;
    }
    idx.length = m;
    layoutBubbles(items, m, f.w, px, boxes, outs, 200);
    // 4. place the boxes (transform only), their tails and the quantised opacity
    for (let j = 0; j < m; j++) {
      const i = idx[j]!;
      const b = book.list[i]!;
      const s = live[i]!;
      const o = outs[j]!;
      const alpha = bubbleAlpha(b, now, f.still);
      s.alpha = alpha;
      s.left = o.left;
      s.top = o.top;
      const q = Math.round(alpha * ALPHA_STEPS) / ALPHA_STEPS;
      if (q !== s.opacity) {
        s.opacity = q;
        setStyle(s.el.box, 'opacity', String(q), stats);
      }
      placeTail(s, o.tailX, px);
      place(s.el.box, s.st, o.left, o.top, stats);
    }
    // 5. hide what was shown last frame and has no bubble now (released slots)
    for (const s of shownSlots) if (s.pid === '') setShown(s.el.box, s.st, false, stats);
    const t = shownSlots;
    shownSlots = nextShown;
    nextShown = t;
    nextShown.length = 0;
    shownN = n;
  }

  function release(pid: string, s: Slot) {
    byPid.delete(pid);
    s.pid = '';
    s.alpha = -1;
    free.push(s);
  }

  return {
    update,
    shown() {
      const px = surface.fx.px;
      const out: BubbleShown[] = [];
      for (const i of idx) {
        const b = book.list[i];
        const s = live[i];
        if (!b || !s || i >= shownN || s.pid !== b.pid) continue;
        const p = surface.toPage(s.left, s.top);
        out.push({ pid: b.pid, text: b.text, alpha: s.alpha, box: { x: p.x, y: p.y, width: s.bw * px, height: s.bh * px } });
      }
      return out;
    },
    destroy() {
      off();
      book.clear();
      for (const s of slots) s.el.box.remove();
      stats.content += slots.length;
      slots.length = 0;
      byPid.clear();
      free.length = 0;
      live.length = 0;
      shownSlots.length = 0;
      if (probe) {
        probe.remove();
        stats.content++;
        probe = null;
      }
      shownN = 0;
      idx.length = 0;
    },
  };
}
