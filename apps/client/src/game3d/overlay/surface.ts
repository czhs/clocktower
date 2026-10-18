// v3 WP4 (v3-overlay). The overlay's DOM: one root over the 3D canvas, holding
//
//   * the FX canvas: a 2D canvas at CSS-pixel resolution (`image-rendering: pixelated`, smoothing off),
//     redrawn only on frames where something is drawn on it. Every sprite of the v3 UI atlases (pins, hands,
//     pings, trails, seat markers, guides, boards, bubble frames, poofs) is blitted there scaled by the integer
//     UI scale `px` at whole-CSS-px positions: texel-crisp art, but anchored within 0.5 CSS px of the projected
//     point and on the same grid as the DOM text (a texel-resolution canvas snapped both to its own texel
//     grid, up to px/2 off). Animation frames cost a drawImage instead of a DOM mutation;
//   * text elements (names, bubble text, house names, tooltips): positioned with transform only (place.ts).
//
// The root is `position:absolute; inset:0` inside the town parent (under the HUD siblings) with
// `pointer-events:none`: every tap reaches the canvas, and the social view / board tooltips hit-test their
// drawn shapes in screen space. Page CSS px (View3d / AvatarRegistry) become root-local px by subtracting
// the root's page origin, which is re-read only on resize / scroll (never in the per-frame path).
import type { Frame } from './atlas';
import type { OverlayStats } from './place';

export interface FxCanvas {
  /** Start a frame: clears what the last frame drew (if anything). */
  begin(px: number, w: number, h: number): void;
  /** Blit a frame (scaled ×px) with its anchor (texels) at root-local CSS px (x, y). */
  blit(f: Frame | null, x: number, y: number, ax: number, ay: number, alpha?: number): boolean;
  /** Blit a frame scaled to dw×dh texels with its top-left at root-local CSS px (x, y). */
  blitTo(f: Frame | null, x: number, y: number, dw: number, dh: number, alpha?: number): boolean;
  /** Nine-slice a frame into a box (texels) with its top-left at root-local CSS px (x, y). */
  nine(f: Frame | null, x: number, y: number, w: number, h: number, ins: { l: number; t: number; r: number; b: number }, alpha?: number): boolean;
  /** Plain texel rect (fallback art). */
  rect(x: number, y: number, w: number, h: number, color: string, alpha?: number): void;
  /** Blit a frame (top-left at CSS px x, y) clipped to a disc (centre offset + radius in texels). */
  blitDisc(f: Frame | null, x: number, y: number, dcx: number, dcy: number, r: number, alpha?: number): boolean;
  /**
   * A 1-texel pixel ellipse outline (fallback rings, progress arcs), centre in CSS px, radii in texels;
   * `sweep` (0..1) draws only that fraction, clockwise from 12 o'clock.
   */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string, alpha?: number, sweep?: number): void;
  /** One texel = this many CSS px. */
  readonly px: number;
  /** Something was drawn this frame. */
  drew(): boolean;
  destroy(): void;
}

export interface OverlaySurface {
  root: HTMLElement;
  fx: FxCanvas;
  /** Root size (CSS px). */
  size(): { w: number; h: number };
  /** Page CSS px -> root-local CSS px (in place into `out`). */
  toLocal(x: number, y: number, out: { x: number; y: number }): { x: number; y: number };
  /** Root-local -> page CSS px. */
  toPage(x: number, y: number): { x: number; y: number };
  /** A text element under the root (styled via CSSOM; text set with textContent only). */
  text(kind: 'label' | 'bubble' | 'callout' | 'tip'): HTMLElement;
  destroy(): void;
}

const FONT = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';

/** Label font size (CSS px) at a UI scale: v2's 10.5-12.6 px band, a touch larger on big screens. */
export const labelFontPx = (px: number): number => Math.min(14, Math.max(11, 3 + 4 * px));
/** Bubble font size (CSS px): v2 FONT_CSS 12. */
export const bubbleFontPx = (px: number): number => Math.min(14, Math.max(12, 6 + 2 * px));

export function createSurface(parent: HTMLElement, stats: OverlayStats): OverlaySurface {
  const doc = parent.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'ct-v3-overlay';
  const rs = root.style;
  rs.position = 'absolute';
  rs.left = '0';
  rs.top = '0';
  rs.right = '0';
  rs.bottom = '0';
  rs.pointerEvents = 'none';
  rs.overflow = 'hidden';
  rs.userSelect = 'none';
  rs.contain = 'strict';
  const canvas = doc.createElement('canvas');
  const cs = canvas.style;
  cs.position = 'absolute';
  cs.left = '0';
  cs.top = '0';
  cs.imageRendering = 'pixelated';
  cs.pointerEvents = 'none';
  root.appendChild(canvas);
  parent.appendChild(root);
  stats.content += 2;

  // ---- geometry (read on resize / scroll only)
  const origin = { x: 0, y: 0, w: 0, h: 0 };
  const measure = () => {
    const r = root.getBoundingClientRect();
    origin.x = r.left;
    origin.y = r.top;
    origin.w = r.width;
    origin.h = r.height;
  };
  measure();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  ro?.observe(root);
  const win = doc.defaultView;
  win?.addEventListener('resize', measure);
  win?.addEventListener('scroll', measure, true);

  // ---- FX canvas (CSS px resolution; every sprite scaled by the integer texel size px)
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  let px = 1;
  let cw = 0;
  let ch = 0;
  let drewLast = false;
  let drewNow = false;
  const S = Math.round; // CSS px -> whole CSS px
  const alphaOf = (a: number | undefined) => (a === undefined ? 1 : Math.max(0, Math.min(1, a)));
  const fx: FxCanvas = {
    get px() {
      return px;
    },
    begin(npx, w, h) {
      px = Math.max(1, Math.round(npx));
      const nw = Math.max(1, Math.ceil(w));
      const nh = Math.max(1, Math.ceil(h));
      if (nw !== cw || nh !== ch) {
        cw = nw;
        ch = nh;
        canvas.width = nw; // also clears
        canvas.height = nh;
        cs.width = `${nw}px`;
        cs.height = `${nh}px`;
        if (ctx) ctx.imageSmoothingEnabled = false;
        drewLast = false;
      } else if (drewLast && ctx) ctx.clearRect(0, 0, cw, ch);
      drewLast = false;
      drewNow = false;
    },
    blit(f, x, y, ax, ay, alpha) {
      if (!f || !ctx) return false;
      const a = alphaOf(alpha);
      if (a <= 0) return false;
      ctx.globalAlpha = a;
      ctx.drawImage(f.img, f.x, f.y, f.w, f.h, S(x) - ax * px, S(y) - ay * px, f.w * px, f.h * px);
      drewNow = drewLast = true;
      return true;
    },
    blitTo(f, x, y, dw, dh, alpha) {
      if (!f || !ctx) return false;
      const a = alphaOf(alpha);
      if (a <= 0) return false;
      ctx.globalAlpha = a;
      ctx.drawImage(f.img, f.x, f.y, f.w, f.h, S(x), S(y), Math.round(dw) * px, Math.round(dh) * px);
      drewNow = drewLast = true;
      return true;
    },
    nine(f, x, y, w, h, ins, alpha) {
      if (!f || !ctx) return false;
      const a = alphaOf(alpha);
      if (a <= 0) return false;
      ctx.globalAlpha = a;
      const X = S(x);
      const Y = S(y);
      const W = Math.max(ins.l + ins.r, Math.round(w));
      const H = Math.max(ins.t + ins.b, Math.round(h));
      const sw0 = ins.l;
      const sw1 = f.w - ins.l - ins.r;
      const sh0 = ins.t;
      const sh1 = f.h - ins.t - ins.b;
      const dw1 = W - ins.l - ins.r;
      const dh1 = H - ins.t - ins.b;
      let sy = f.y;
      let dy = Y;
      for (let r = 0; r < 3; r++) {
        const shr = r === 0 ? sh0 : r === 1 ? sh1 : ins.b;
        const dhr = r === 0 ? sh0 : r === 1 ? dh1 : ins.b;
        let sx = f.x;
        let dx = X;
        for (let c = 0; c < 3; c++) {
          const swc = c === 0 ? sw0 : c === 1 ? sw1 : ins.r;
          const dwc = c === 0 ? sw0 : c === 1 ? dw1 : ins.r;
          if (swc > 0 && shr > 0 && dwc > 0 && dhr > 0) ctx.drawImage(f.img, sx, sy, swc, shr, dx, dy, dwc * px, dhr * px);
          sx += swc;
          dx += dwc * px;
        }
        sy += shr;
        dy += dhr * px;
      }
      drewNow = drewLast = true;
      return true;
    },
    rect(x, y, w, h, color, alpha) {
      if (!ctx) return;
      ctx.globalAlpha = alphaOf(alpha);
      ctx.fillStyle = color;
      ctx.fillRect(S(x), S(y), Math.round(w) * px, Math.round(h) * px);
      drewNow = drewLast = true;
    },
    blitDisc(f, x, y, dcx, dcy, r, alpha) {
      if (!f || !ctx) return false;
      const a = alphaOf(alpha);
      if (a <= 0) return false;
      const X = S(x);
      const Y = S(y);
      ctx.save();
      ctx.globalAlpha = a;
      // the disc as whole texels (a texel is in when its centre is): crisp, like the texel-resolution art
      ctx.beginPath();
      for (let ty = Math.floor(dcy - r); ty <= Math.ceil(dcy + r); ty++) {
        const dy = ty + 0.5 - dcy;
        if (Math.abs(dy) > r) continue;
        const half = Math.sqrt(r * r - dy * dy);
        const tx0 = Math.ceil(dcx - half - 0.5);
        const tx1 = Math.floor(dcx + half - 0.5);
        if (tx1 >= tx0) ctx.rect(X + tx0 * px, Y + ty * px, (tx1 - tx0 + 1) * px, px);
      }
      ctx.clip();
      ctx.drawImage(f.img, f.x, f.y, f.w, f.h, X, Y, f.w * px, f.h * px);
      ctx.restore();
      drewNow = drewLast = true;
      return true;
    },
    ellipse(cx, cy, rx, ry, color, alpha, sweep = 1) {
      if (!ctx || rx < 1 || ry < 1 || sweep <= 0) return;
      ctx.globalAlpha = alphaOf(alpha);
      ctx.fillStyle = color;
      const X = S(cx);
      const Y = S(cy);
      // midpoint-style: one texel per step around the ellipse (crisp, no anti-aliasing)
      const n = Math.max(16, Math.round((rx + ry) * 4));
      const m = Math.round(n * Math.min(1, sweep));
      let lx = NaN;
      let ly = NaN;
      for (let i = 0; i < m; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const ex = Math.round(Math.cos(a) * rx);
        const ey = Math.round(Math.sin(a) * ry);
        if (ex === lx && ey === ly) continue;
        lx = ex;
        ly = ey;
        ctx.fillRect(X + ex * px, Y + ey * px, px, px);
      }
      drewNow = drewLast = true;
    },
    drew: () => drewNow,
    destroy() {
      canvas.width = canvas.height = 0;
    },
  };

  const text = (kind: 'label' | 'bubble' | 'callout' | 'tip'): HTMLElement => {
    const el = doc.createElement(kind === 'bubble' ? 'div' : 'span');
    el.className = `ct-v3-${kind}`;
    const s = el.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.visibility = 'hidden';
    s.whiteSpace = kind === 'bubble' ? 'pre' : 'nowrap';
    s.fontFamily = FONT;
    s.pointerEvents = 'none';
    s.willChange = 'transform';
    s.lineHeight = kind === 'bubble' ? '1.15' : '1';
    s.textAlign = 'center';
    root.appendChild(el);
    stats.content++;
    return el;
  };

  return {
    root,
    fx,
    size: () => ({ w: origin.w, h: origin.h }),
    toLocal(x, y, out) {
      out.x = x - origin.x;
      out.y = y - origin.y;
      return out;
    },
    toPage: (x, y) => ({ x: x + origin.x, y: y + origin.y }),
    text,
    destroy() {
      ro?.disconnect();
      win?.removeEventListener('resize', measure);
      win?.removeEventListener('scroll', measure, true);
      fx.destroy();
      root.remove();
    },
  };
}
