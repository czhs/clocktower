// v3 WP4 (v3-overlay). Chat speech bubbles over the 3D avatars (v2.2 rules, social/speech.ts).
//
// Logic reused unchanged: SpeechBook (one bubble per speaker, cap 6 / 4 on the low tier, your own bubble
// never gives way), bubbleText / wrapLines / bubbleDurationMs / bubbleAlpha, and stackBubbles through
// anchors.layoutBubbles. Secrecy as in v2: input is only `chat:message` events this client already
// received; a bubble lives only while its speaker's avatar is drawn in the viewer's place (OverlayFrame.drawn,
// v2's sprite-visible rule, not camera culling) and goes away with it; while the speaker's head is off the
// canvas the bubble keeps its slot and timer and is just not drawn. 'storyteller' / 'system' never bubble.
//
// Drawing: the box is the indicators atlas' `bubble_nine` 9-slice (insets 3/3/3/4 incl. the 1-px shadow,
// kit.json meta.nineSlice) plus `bubble_tail` under the speaker, blitted on the FX canvas; the text is a
// DOM element (textContent only, never markup) placed over it, measured once per message. A speaker's person
// pins (social view, drawn earlier in the frame) stay visible: the bubble climbs over them.
import type { ChatMessage } from '@ct/protocol';
import { serverNow } from '../../net/serverTime';
import { bubbleAlpha, SPEECH, SpeechBook, type BubbleBox } from '../../game/social/speech';
import { layoutBubbles, stackBase, type BubbleIn, type BubbleOut } from './anchors';
import { newPlaceState, place, setShown, setStyle, type PlaceState } from './place';
import { bubbleFontPx } from './surface';
import type { OverlayEnv, OverlayFrame, OverlayView } from './types';

/** Bubble frame insets (texels; kit.json meta.nineSlice.frame_bubble) and text padding (indicators meta.bubble). */
const NINE = { l: 3, t: 3, r: 3, b: 4 };
const PAD_X = 5;
const TEXT_TOP = 3;
/** Tail rows below the box (bubble_tail is 5 tall, its rows 0..1 overlap the box edge). */
const TAIL_ROWS = 3;

interface Slot {
  el: HTMLElement;
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
  alpha: number;
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
  const slots: Slot[] = [];
  const items: BubbleIn[] = [];
  const boxes: BubbleBox[] = [];
  const outs: BubbleOut[] = [];
  let drawn: ReadonlySet<string> = new Set();
  /** book.list index of each laid-out (on-screen) bubble. */
  const idx: number[] = [];
  const baseBuf = { x: 0, y: 0 };
  let shownN = 0;
  const visible = (pid: string) => drawn.has(pid);
  const cap = () => (opts.lowTier() ? SPEECH.maxBubblesLow : SPEECH.maxBubbles);

  const off = deps.conn.events.on('chat:message', (m: ChatMessage) => {
    if (typeof m.at === 'number' && serverNow() - m.at > SPEECH.staleMs) return;
    book.add(m, performance.now(), visible, cap(), opts.myPid());
  });

  function slot(i: number): Slot {
    let s = slots[i];
    if (!s) {
      s = { el: surface.text('bubble'), st: newPlaceState(), rev: -1, font: 0, color: '', tw: 0, th: 0, bw: 0, bh: 0, alpha: -1, left: 0, top: 0 };
      slots[i] = s;
    }
    return s;
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
    // 1. content (writes), then 2. measure the changed ones (one layout read batch)
    const measure: Slot[] = [];
    for (let i = 0; i < n; i++) {
      const b = book.list[i]!;
      const s = slot(i);
      let dirty = false;
      if (s.rev !== b.rev) {
        s.rev = b.rev;
        s.el.textContent = b.text; // never markup
        stats.content++;
        dirty = true;
      }
      if (s.font !== font) {
        s.font = font;
        setStyle(s.el, 'fontSize', `${font}px`, stats);
        dirty = true;
      }
      if (s.color !== color) {
        s.color = color;
        setStyle(s.el, 'color', color, stats);
      }
      if (dirty) measure.push(s);
    }
    for (const s of measure) {
      s.tw = s.el.offsetWidth;
      s.th = s.el.offsetHeight;
      s.bw = Math.ceil(s.tw / px) + 2 * PAD_X;
      s.bh = Math.ceil(s.th / px) + TEXT_TOP + NINE.b + 1;
    }
    // 3. stack + clamp (only bubbles whose speaker's head projects this frame)
    let m = 0;
    for (let i = 0; i < n; i++) {
      const b = book.list[i]!;
      const s = slots[i]!;
      const a = f.byPid.get(b.pid);
      if (!a) {
        // drawn (pruned above otherwise) but off the canvas right now: keep it, draw nothing
        setShown(s.el, s.st, false, stats);
        s.alpha = -1;
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
    // 4. draw: frame + tail on the FX canvas, text over it
    const nine = atlas.frame('indicators', 'bubble_nine', f.night);
    const tail = atlas.frame('indicators', 'bubble_tail', f.night);
    for (let j = 0; j < m; j++) {
      const i = idx[j]!;
      const b = book.list[i]!;
      const s = slots[i]!;
      const o = outs[j]!;
      const alpha = bubbleAlpha(b, now, f.still);
      s.left = o.left;
      s.top = o.top;
      if (!f.fx.nine(nine, o.left, o.top, s.bw, s.bh, NINE, alpha)) {
        // atlas not decoded yet: a plain panel
        f.fx.rect(o.left, o.top, s.bw, s.bh - 1, f.tokens.bubbleEdge, alpha);
        f.fx.rect(o.left + px, o.top + px, s.bw - 2, s.bh - 3, f.tokens.bubble, alpha);
      }
      if (o.tailX >= 0) f.fx.blit(tail, o.left + o.tailX, o.top + (s.bh + TAIL_ROWS - 1) * px, 2, 4, alpha);
      place(s.el, s.st, o.left + PAD_X * px + (s.bw * px - 2 * PAD_X * px - s.tw) / 2, o.top + TEXT_TOP * px, stats);
      if (Math.abs(alpha - s.alpha) > 0.02 || (alpha === 0) !== (s.alpha === 0)) {
        s.alpha = alpha;
        setStyle(s.el, 'opacity', String(Math.round(alpha * 100) / 100), stats);
      }
    }
    for (let i = n; i < shownN; i++) {
      const s = slots[i]!;
      setShown(s.el, s.st, false, stats);
      s.alpha = -1;
    }
    shownN = n;
  }

  return {
    update,
    shown() {
      const px = surface.fx.px;
      const out: BubbleShown[] = [];
      for (const i of idx) {
        const b = book.list[i];
        const s = slots[i];
        if (!b || !s || i >= shownN) continue;
        const p = surface.toPage(s.left, s.top);
        out.push({ pid: b.pid, text: b.text, alpha: s.alpha, box: { x: p.x, y: p.y, width: s.bw * px, height: s.bh * px } });
      }
      return out;
    },
    destroy() {
      off();
      book.clear();
      for (const s of slots) s.el.remove();
      stats.content += slots.length;
      slots.length = 0;
      shownN = 0;
      idx.length = 0;
    },
  };
}
