// v3.3 (release). GPU time of engine.renderAt per frame, for the low -> high promotion probe (game3d/promote.ts).
// EXT_disjoint_timer_query_webgl2 TIME_ELAPSED around the render; results are read back asynchronously (a few frames
// later, never a stall) and dropped on a disjoint event (GPU clock change / context switch). Only on while the probe
// runs (one query per frame then; nothing otherwise). A query that someone else already has open on this context
// (a perf probe wrapping the whole rAF callback) is never nested: that frame is just not timed.

/** The subset of WebGL2 this module touches (unit-testable with a fake). */
export interface TimerGl {
  createQuery(): WebGLQuery | null;
  deleteQuery(q: WebGLQuery | null): void;
  beginQuery(target: number, q: WebGLQuery): void;
  endQuery(target: number): void;
  getQuery(target: number, pname: number): WebGLQuery | null;
  getQueryParameter(q: WebGLQuery, pname: number): unknown;
  getParameter(pname: number): unknown;
  getExtension(name: string): unknown;
  isContextLost(): boolean;
  readonly QUERY_RESULT_AVAILABLE: number;
  readonly QUERY_RESULT: number;
  readonly CURRENT_QUERY: number;
}

const TIME_ELAPSED_EXT = 0x88bf;
const GPU_DISJOINT_EXT = 0x8fbb;
/** In-flight queries kept at most (older ones are abandoned: a driver that never answers must not grow a list). */
const MAX_PENDING = 8;

export interface GpuFrameTimer {
  /** Time the frames from now on (true) or stop (false; in-flight results still drain). */
  enable(on: boolean): void;
  readonly enabled: boolean;
  /** Around one render: begin() before, end() after. No-ops while disabled. */
  begin(): void;
  end(): void;
  /** GPU ms of the frames whose results arrived since the last call (non-blocking). */
  drain(): number[];
  dispose(): void;
}

/** null when the extension is not exposed (Firefox / Safari without the pref, some mobile GPUs). */
export function createGpuFrameTimer(gl: TimerGl): GpuFrameTimer | null {
  let ext: unknown = null;
  try {
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  } catch {
    ext = null;
  }
  if (!ext) return null;
  let on = false;
  let open: WebGLQuery | null = null;
  const pending: WebGLQuery[] = [];
  const del = (q: WebGLQuery | null) => {
    try {
      gl.deleteQuery(q);
    } catch {
      /* lost context */
    }
  };
  return {
    enable(v) {
      on = v;
    },
    get enabled() {
      return on;
    },
    begin() {
      if (!on || open || gl.isContextLost()) return;
      try {
        if (gl.getQuery(TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return; // someone else's query is open: do not nest
        const q = gl.createQuery();
        if (!q) return;
        gl.beginQuery(TIME_ELAPSED_EXT, q);
        open = q;
      } catch {
        open = null;
      }
    },
    end() {
      const q = open;
      if (!q) return;
      open = null;
      try {
        gl.endQuery(TIME_ELAPSED_EXT);
        pending.push(q);
        while (pending.length > MAX_PENDING) del(pending.shift()!);
      } catch {
        del(q);
      }
    },
    drain() {
      const out: number[] = [];
      if (!pending.length || gl.isContextLost()) return out;
      try {
        const disjoint = !!gl.getParameter(GPU_DISJOINT_EXT);
        while (pending.length) {
          const q = pending[0]!;
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
          pending.shift();
          const ns = Number(gl.getQueryParameter(q, gl.QUERY_RESULT));
          del(q);
          if (!disjoint && ns > 0) out.push(ns / 1e6);
        }
      } catch {
        /* a lost context mid-drain: nothing more to read */
      }
      return out;
    },
    dispose() {
      on = false;
      if (open) {
        try {
          gl.endQuery(TIME_ELAPSED_EXT);
        } catch {
          /* ignore */
        }
        del(open);
        open = null;
      }
      for (const q of pending.splice(0)) del(q);
    },
  };
}
