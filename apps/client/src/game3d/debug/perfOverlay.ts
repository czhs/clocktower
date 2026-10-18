// v3 WP1 (v3-core). The real-device perf readout (docs/v3/INTEGRATION.md §6.3): with localStorage['ct.debug.v3perf']
// = '1' (production-safe, opt-in like ct.debug.camera) a small DOM box over the 3D town shows the tier, pixel scale,
// p50 / p95 frame time over the last 600 visible frames, draw calls, programs and the GPU string, with a "Copy"
// button that puts the same numbers (JSON) on the clipboard for docs/test-results.md.
// DOM only: textContent (never innerHTML), CSSOM styles; refreshed twice a second, not per frame.

export interface V3Stats {
  ready: boolean;
  tier: 'low' | 'high';
  pixelScale: number;
  calls: number;
  tris: number;
  programs: number | null;
  frameMs: { p50: number; p95: number };
  gpu: string | null;
  building: string[];
  life: { walkers: number; doors: number; folk: boolean } | null;
}

export const PERF_REFRESH_MS = 500;

/** The overlay's text lines (pure, unit tested). */
export function perfLines(s: V3Stats, frames: number, size: { w: number; h: number }): string[] {
  return [
    `v3 ${s.tier}${s.ready ? '' : ' (building)'} · ×${s.pixelScale} · ${size.w}×${size.h}`,
    `p50 ${s.frameMs.p50.toFixed(1)} ms · p95 ${s.frameMs.p95.toFixed(1)} ms (${frames} fr)`,
    `calls ${s.calls} · tris ${s.tris} · programs ${s.programs ?? '?'}`,
    `${s.gpu ?? 'GPU unknown'}`,
  ];
}

/** The clipboard text: one JSON line with the stats, the frame count, the canvas size and the user agent. */
export function perfReport(s: V3Stats, frames: number, size: { w: number; h: number }, ua: string): string {
  return JSON.stringify({ at: new Date().toISOString(), ...s, frames, canvas: size, ua });
}

export interface PerfOverlay {
  destroy(): void;
}

export function createPerfOverlay(parent: HTMLElement, read: () => { stats: V3Stats; frames: number; size: { w: number; h: number } }, doc: Document = document): PerfOverlay {
  const box = doc.createElement('div');
  box.className = 'ct-v3-perf';
  const s = box.style;
  s.position = 'absolute';
  s.left = '8px';
  s.top = '8px';
  s.zIndex = '6';
  s.padding = '4px 6px';
  s.font = '11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace';
  s.color = '#e4d8ba';
  s.background = 'rgba(18,14,22,0.82)';
  s.border = '1px solid rgba(228,216,186,0.35)';
  s.pointerEvents = 'auto';
  s.maxWidth = 'calc(100% - 16px)';
  s.whiteSpace = 'pre';
  s.overflow = 'hidden';
  s.textOverflow = 'ellipsis';
  const text = doc.createElement('div');
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Copy';
  const bs = btn.style;
  bs.marginTop = '3px';
  bs.font = 'inherit';
  bs.padding = '0 6px';
  box.append(text, btn);
  parent.appendChild(box);
  let last = '';
  const refresh = () => {
    try {
      const r = read();
      const t = perfLines(r.stats, r.frames, r.size).join('\n');
      if (t !== last) {
        last = t;
        text.textContent = t;
      }
    } catch {
      /* the engine is being rebuilt */
    }
  };
  const copy = (e: Event) => {
    e.stopPropagation();
    try {
      const r = read();
      const report = perfReport(r.stats, r.frames, r.size, typeof navigator !== 'undefined' ? navigator.userAgent : '');
      void navigator.clipboard?.writeText(report).then(
        () => (btn.textContent = 'Copied'),
        () => (btn.textContent = 'Copy failed'),
      );
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    } catch {
      btn.textContent = 'Copy failed';
    }
  };
  // presses on the box must not walk / point in the town below
  const stop = (e: Event) => e.stopPropagation();
  box.addEventListener('pointerdown', stop);
  btn.addEventListener('click', copy);
  refresh();
  const timer = setInterval(refresh, PERF_REFRESH_MS);
  return {
    destroy() {
      clearInterval(timer);
      box.removeEventListener('pointerdown', stop);
      btn.removeEventListener('click', copy);
      box.remove();
    },
  };
}
