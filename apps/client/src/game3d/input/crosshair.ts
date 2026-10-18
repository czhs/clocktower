// v3 WP1 (v3-core). The Storyteller's map-point pick in the 3D town (docs/v3/INTEGRATION.md §3 "ST pick"): while a
// Storyteller panel has armed `stagePick` (gameplay core frame().picking), a DOM crosshair + the pick's label follow
// the pointer over the town; the click goes through input/pointer.ts -> gameplay core pickAt; Escape cancels (core).
// DOM only (Preact-free, textContent; CSSOM styles, allowed by style-src 'self'); pointer-events:none.

export interface Crosshair {
  /** Per frame: the active pick label (null = hidden) and the pointer (page CSS px). */
  update(label: string | null, cursor: { x: number; y: number; over: boolean }): void;
  destroy(): void;
}

export function createCrosshair(parent: HTMLElement, doc: Document = document): Crosshair {
  const root = doc.createElement('div');
  root.className = 'ct-v3-pick';
  root.setAttribute('aria-hidden', 'true');
  const s = root.style;
  s.position = 'fixed';
  s.left = '0';
  s.top = '0';
  s.pointerEvents = 'none';
  s.zIndex = '5';
  s.display = 'none';
  s.willChange = 'transform';
  const mark = doc.createElement('div');
  const ms = mark.style;
  ms.position = 'absolute';
  ms.left = '-9px';
  ms.top = '-9px';
  ms.width = '16px';
  ms.height = '16px';
  ms.border = '1px solid #e4d8ba';
  ms.borderRadius = '50%';
  ms.boxShadow = '0 0 0 1px rgba(33,31,44,0.85)';
  const dot = doc.createElement('div');
  const ds = dot.style;
  ds.position = 'absolute';
  ds.left = '-1px';
  ds.top = '-1px';
  ds.width = '2px';
  ds.height = '2px';
  ds.background = '#e4d8ba';
  const label = doc.createElement('div');
  const ls = label.style;
  ls.position = 'absolute';
  ls.left = '12px';
  ls.top = '-22px';
  ls.whiteSpace = 'nowrap';
  ls.font = '12px/1.3 var(--ct-font-ui, sans-serif)';
  ls.color = '#e4d8ba';
  ls.background = 'rgba(33,31,44,0.85)';
  ls.padding = '0 4px 1px';
  root.append(mark, dot, label);
  parent.appendChild(root);
  let shownLabel: string | null = null;
  let lastX = NaN;
  let lastY = NaN;
  let shown = false;
  const prevCursor = parent.style.cursor;
  return {
    update(text, cursor) {
      const on = text !== null && cursor.over;
      if (text !== shownLabel) {
        shownLabel = text;
        label.textContent = text ?? '';
        parent.style.cursor = text !== null ? 'crosshair' : prevCursor;
      }
      if (on !== shown) {
        shown = on; // a style write only when it changes (this runs every frame on every mount)
        s.display = on ? 'block' : 'none';
      }
      if (!on) return;
      if (Math.abs(cursor.x - lastX) < 0.5 && Math.abs(cursor.y - lastY) < 0.5) return;
      lastX = cursor.x;
      lastY = cursor.y;
      s.transform = `translate3d(${Math.round(cursor.x)}px, ${Math.round(cursor.y)}px, 0)`;
    },
    destroy() {
      root.remove();
      parent.style.cursor = prevCursor;
    },
  };
}
