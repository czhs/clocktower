// Chat speech bubbles over avatars (v2.2) — the Phaser side. Logic + rules: ./speech.ts.
//
// Contract with TownScene: created once in create(); update() every frame after the avatars have
// been posed (cheap no-op while nothing is shown); destroy() on shutdown.
//
// Secrecy: input is only the `chat:message` events this client already received; a bubble is drawn
// only over an avatar `anchorOf` says we are rendering right now (same place), and disappears when
// that avatar does. Nothing is sent anywhere. Text is drawn with Phaser Text (canvas fillText).
import type * as Phaser from 'phaser';
import type { ChatMessage } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';
import { serverNow } from '../../net/serverTime';
import { reducedMotion } from '../fx/motion';
import { bubbleAlpha, SPEECH, SpeechBook, stackBubbles, type BubbleBox } from './speech';

/** Something with the geometry of an avatar's name label (origin 0.5, 1): we stack above it. */
export interface LabelAnchor {
  readonly x: number;
  readonly y: number;
  readonly displayHeight: number;
}

export interface SpeechCtx {
  conn: RoomConnection;
  /** The name label of a pid whose avatar is drawn right now (incl. yourself), else null. */
  anchorOf(pid: string): LabelAnchor | null;
  /** This client's own pid: your own bubble is never the one that gives way. */
  myPid(): string | null;
  /** The low render tier is active (fewer bubbles). */
  lowTier(): boolean;
  /** Canvas px per CSS px (low tier draws the canvas smaller; default 1). */
  renderScale?(): number;
}

export interface SpeechLayer {
  update(): void;
  destroy(): void;
  /** Test/debug only (allocates): the bubbles drawn right now, oldest first, with their world-px boxes. */
  shown(): { pid: string; text: string; alpha: number; x: number; y: number; w: number; h: number }[];
}

// Above the name labels (5200) and the night layer (5000), below the letterbox mask (5300).
const DEPTH = 5250;
const FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';
/** On-screen sizes (CSS px). */
const FONT_CSS = 12;
const PAD_X_CSS = 5;
const PAD_Y_CSS = 3;
/** Gap between the name label and the tail tip (CSS px). */
const GAP_CSS = 1;
// Gothic UI palette (ui/common/theme.css): panel ink, brass edge, parchment text.
const C_PANEL = 0x211f2c;
const C_EDGE = 0x8a7448;
const C_HI = 0x343042;
const C_SHADOW = 0x0b0812;
const C_TEXT = '#e4d8ba';

interface Slot {
  g: Phaser.GameObjects.Graphics;
  t: Phaser.GameObjects.Text;
  rev: number;
  /** Text style last applied (resolution, font px). */
  res: number;
  font: number;
  /** Box geometry last drawn (w, h, unit, tail x). */
  dw: number;
  dh: number;
  du: number;
  dt: number;
  alpha: number;
  box: BubbleBox;
  /** Box size (world px) incl. border, excluding the tail. */
  w: number;
  h: number;
}

export function createSpeechLayer(scene: Phaser.Scene, ctx: SpeechCtx): SpeechLayer {
  const book = new SpeechBook();
  const slots: Slot[] = [];
  const boxes: BubbleBox[] = [];
  let shown = 0;
  const visible = (pid: string) => ctx.anchorOf(pid) !== null;
  const cap = () => (ctx.lowTier() ? SPEECH.maxBubblesLow : SPEECH.maxBubbles);

  const off = ctx.conn.events.on('chat:message', (m: ChatMessage) => {
    if (typeof m.at === 'number' && serverNow() - m.at > SPEECH.staleMs) return;
    book.add(m, performance.now(), visible, cap(), ctx.myPid());
  });

  function slot(i: number): Slot {
    let s = slots[i];
    if (!s) {
      const g = scene.add.graphics().setDepth(DEPTH).setVisible(false);
      const t = scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '8px', color: C_TEXT, align: 'center', lineSpacing: 0 })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH + 0.5)
        .setVisible(false);
      s = { g, t, rev: -1, res: 0, font: 0, dw: 0, dh: 0, du: 0, dt: 0, alpha: -1, box: { x: 0, y: 0, w: 0, h: 0, lift: 0 }, w: 0, h: 0 };
      slots[i] = s;
      boxes[i] = s.box;
    }
    return s;
  }

  function hide(s: Slot) {
    s.g.setVisible(false);
    s.t.setVisible(false);
    s.alpha = -1;
  }

  function update() {
    if (!book.list.length && !shown) return;
    const now = performance.now();
    book.prune(now, visible);
    book.trim(cap(), ctx.myPid());
    const n = book.list.length;
    const cam = scene.cameras.main;
    const zoom = cam.zoom; // canvas px per world px
    const css = zoom / Math.max(0.1, ctx.renderScale?.() ?? 1); // CSS px per world px
    const px = 1 / zoom; // one canvas px in world px
    const u = Math.max(1, Math.round(2 * (zoom / css))) * px; // border unit: ~2 CSS px, whole canvas px
    const res = Math.max(1, Math.ceil(zoom * (window.devicePixelRatio || 1)));
    const fontPx = Math.max(3, FONT_CSS / css);
    const still = reducedMotion();

    // 1. text + size (only when the message or the zoom changed)
    for (let i = 0; i < n; i++) {
      const b = book.list[i]!;
      const s = slot(i);
      let dirty = false;
      if (s.res !== res || Math.abs(s.font - fontPx) > 1e-3) {
        s.res = res;
        s.font = fontPx;
        s.t.setStyle({ fontFamily: FONT, fontSize: `${fontPx}px`, color: C_TEXT, align: 'center', resolution: res });
        dirty = true;
      }
      if (s.rev !== b.rev) {
        s.rev = b.rev;
        s.t.setText(b.text);
        dirty = true;
      }
      if (dirty) {
        s.w = Math.ceil((s.t.width + 2 * (PAD_X_CSS / css) + 2 * u) / px) * px;
        s.h = Math.ceil((s.t.height + 2 * (PAD_Y_CSS / css) + 2 * u) / px) * px;
      }
      const a = ctx.anchorOf(b.pid)!; // pruned above: present
      s.box.x = a.x;
      s.box.y = a.y - a.displayHeight - GAP_CSS / css;
      s.box.w = s.w;
      s.box.h = s.h + 2 * u; // + tail
    }
    // 2. stack newer bubbles above older ones they would cover
    stackBubbles(boxes, n, 2 * u, 200 / css);
    // 3. place (clamped into the view; the tail still points at the speaker)
    const view = cam.worldView;
    for (let i = 0; i < n; i++) {
      const b = book.list[i]!;
      const s = slots[i]!;
      const lifted = s.box.lift > 0.5;
      let cx = s.box.x;
      const half = s.w / 2;
      if (view.width > 2 * half) cx = Math.min(view.right - half - u, Math.max(view.left + half + u, cx));
      const left = Math.round((cx - half) / px) * px;
      const top = Math.round((s.box.y - s.box.lift - s.box.h) / px) * px;
      const tailX = lifted ? -1 : Math.round((s.box.x - left) / u) * u;
      if (s.dw !== s.w || s.dh !== s.h || s.du !== u || s.dt !== tailX) {
        s.dw = s.w;
        s.dh = s.h;
        s.du = u;
        s.dt = tailX;
        drawBox(s.g, s.w, s.h, u, tailX);
      }
      s.g.setPosition(left, top);
      s.t.setPosition(left + s.w / 2, top + s.h / 2);
      const alpha = bubbleAlpha(b, now, still);
      if (Math.abs(alpha - s.alpha) > 0.01) {
        s.alpha = alpha;
        s.g.setAlpha(alpha);
        s.t.setAlpha(alpha);
      }
      const d = DEPTH + i * 0.01;
      if (s.g.depth !== d) {
        s.g.setDepth(d);
        s.t.setDepth(d + 0.005);
      }
      if (!s.g.visible) {
        s.g.setVisible(true);
        s.t.setVisible(true);
      }
    }
    for (let i = n; i < shown; i++) hide(slots[i]!);
    shown = n;
  }

  return {
    update,
    shown: () =>
      book.list.slice(0, shown).map((b, i) => {
        const s = slots[i]!;
        return { pid: b.pid, text: b.text, alpha: s.alpha, x: s.g.x, y: s.g.y, w: s.w, h: s.h };
      }),
    destroy() {
      off();
      book.clear();
      for (const s of slots) {
        s.g.destroy();
        s.t.destroy();
      }
      slots.length = 0;
      boxes.length = 0;
      shown = 0;
    },
  };
}

/**
 * Pixel-art bubble at (0,0): drop shadow, brass edge with notched corners, ink panel, a top
 * highlight, and (unless tailX < 0) a two-step tail under the box pointing down at tailX.
 */
function drawBox(g: Phaser.GameObjects.Graphics, w: number, h: number, u: number, tailX: number) {
  g.clear();
  const tail = tailX >= 0;
  const tx = Math.min(w - 3 * u, Math.max(3 * u, tailX));
  // shadow (one unit down-right)
  g.fillStyle(C_SHADOW, 0.5);
  g.fillRect(2 * u, h, w - 2 * u, u);
  g.fillRect(w, 2 * u, u, h - u);
  if (tail) g.fillRect(tx, h + u, 2 * u, 2 * u);
  // edge (corners notched)
  g.fillStyle(C_EDGE, 1);
  g.fillRect(u, 0, w - 2 * u, h);
  g.fillRect(0, u, w, h - 2 * u);
  // panel
  g.fillStyle(C_PANEL, 0.96);
  g.fillRect(u, u, w - 2 * u, h - 2 * u);
  g.fillStyle(C_HI, 1);
  g.fillRect(2 * u, u, w - 4 * u, u);
  if (!tail) return;
  // tail: open the bottom edge, then two stepped rows down to a point
  g.fillStyle(C_EDGE, 1);
  g.fillRect(tx - 2 * u, h, 4 * u, u);
  g.fillRect(tx - u, h + u, 2 * u, u);
  g.fillStyle(C_PANEL, 0.96);
  g.fillRect(tx - u, h - u, 2 * u, 2 * u);
}
