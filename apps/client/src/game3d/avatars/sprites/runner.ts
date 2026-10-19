// v3.3 sprites: a frame-budget job runner for the sprite bakes (pure; unit-tested in avatars.sprites.test.ts).
//
// A bake is a generator that yields after each small unit of work (one simulation step, one atlas cell, a chunk of
// the shadow proxy) or yields a Promise (a spec import, a parallel shader compile, a GPU readback) it must wait for.
// `pump(budgetMs)` runs the queued jobs one after the other until the budget for this frame is spent (always at least
// one unit, so a bake makes progress even on a slow frame), so no frame stalls on a whole bake: the layer calls it
// once per frame before the render (layer.update), a watchdog timer covers frames without layer updates.
// Jobs run strictly one at a time, in priority order (higher first, then FIFO).

export type SliceStep = void | undefined | Promise<unknown>;
export type SliceGen<T> = Generator<SliceStep, T, unknown>;

interface Job {
  gen: SliceGen<unknown>;
  prio: number;
  seq: number;
  resolve(v: unknown): void;
  reject(e: unknown): void;
  /** waiting for a yielded promise */
  waiting: boolean;
  /** what to send into the generator next (the awaited value) or throw into it */
  send: { ok: boolean; v: unknown } | null;
}

export interface SliceRunner {
  enqueue<T>(gen: SliceGen<T>, prio?: number): Promise<T>;
  /** Run work for up to `budgetMs` (ms of wall time); returns the units run and the time spent. */
  pump(budgetMs: number): { units: number; ms: number };
  /** Queued + running jobs. */
  pending(): number;
}

export function createSliceRunner(now: () => number = () => performance.now(), onUnit?: (ms: number) => void): SliceRunner {
  const queue: Job[] = [];
  let seq = 0;
  const pick = (): Job | null => {
    let best: Job | null = null;
    for (const j of queue) if (!j.waiting && (!best || j.prio > best.prio || (j.prio === best.prio && j.seq < best.seq))) best = j;
    return best;
  };
  const finish = (j: Job) => {
    const i = queue.indexOf(j);
    if (i >= 0) queue.splice(i, 1);
  };
  /** the job currently started (strictly one at a time: a waiting started job blocks the others) */
  let current: Job | null = null;
  return {
    enqueue<T>(gen: SliceGen<T>, prio = 0): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push({ gen: gen as SliceGen<unknown>, prio, seq: seq++, resolve: resolve as (v: unknown) => void, reject, waiting: false, send: null });
      });
    },
    pump(budgetMs) {
      const t0 = now();
      let units = 0;
      for (;;) {
        if (current && !queue.includes(current)) current = null;
        const j = current ?? pick();
        if (!j || j.waiting) break;
        current = j;
        let r: IteratorResult<SliceStep, unknown>;
        const u0 = onUnit ? now() : 0;
        try {
          const s = j.send;
          j.send = null;
          r = s && !s.ok ? j.gen.throw(s.v) : j.gen.next(s?.v);
        } catch (e) {
          finish(j);
          current = null;
          j.reject(e);
          units++;
          if (now() - t0 >= budgetMs) break;
          continue;
        }
        units++;
        onUnit?.(now() - u0);
        if (r.done) {
          finish(j);
          current = null;
          j.resolve(r.value);
        } else if (r.value && typeof (r.value as Promise<unknown>).then === 'function') {
          j.waiting = true;
          (r.value as Promise<unknown>).then(
            (v) => {
              j.waiting = false;
              j.send = { ok: true, v };
            },
            (e) => {
              j.waiting = false;
              j.send = { ok: false, v: e };
            },
          );
          break;
        }
        if (now() - t0 >= budgetMs) break;
      }
      return { units, ms: now() - t0 };
    },
    pending() {
      return queue.length;
    },
  };
}
