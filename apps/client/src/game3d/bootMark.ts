// v3 WP0 (v3-lead). Writing the boot guard's marks (docs/v3/INTEGRATION.md §1.2 "Boot guard"). Split from
// bootGuard.ts (which only READS them, in the main bundle for chooseRenderer) so this code ships only in
// the lazy 3D chunk.
import { BOOT_WINDOW_MS, BOOTING_KEY, BOOTS_KEY, currentTab, readBooting, readBoots, STABLE_MS, storage, type GuardStorage } from './bootGuard';

function writeBooting(s: GuardStorage, marks: Record<string, number>, now: number): void {
  const out: Record<string, string> = {};
  // other tabs' marks expire with the boot window (a closed crashed tab must not block forever)
  for (const [k, t] of Object.entries(marks)) if (k !== '*' && now - t < BOOT_WINDOW_MS) out[k] = new Date(t).toISOString();
  if (Object.keys(out).length) s.setItem(BOOTING_KEY, JSON.stringify(out));
  else s.removeItem(BOOTING_KEY);
}

/** Mark a 3D boot of `tab` (call right before `new Engine`). Returns its id (the boot time). */
export function markBooting(now = Date.now(), s: GuardStorage | null = storage(), tab: string = currentTab()): number {
  if (!s) return now;
  try {
    const marks = readBooting(s);
    marks[tab] = now;
    writeBooting(s, marks, now);
    const boots = readBoots(s, now);
    boots.push(now);
    s.setItem(BOOTS_KEY, JSON.stringify(boots.slice(-20)));
  } catch {
    /* storage blocked / full: the guard is best effort */
  }
  return now;
}

/** Drop `tab`'s booting mark (a legacy shared mark too); the boots history is untouched. */
export function clearBooting(s: GuardStorage | null = storage(), tab: string = currentTab(), now = Date.now()): void {
  if (!s) return;
  try {
    const marks = readBooting(s);
    delete marks[tab];
    writeBooting(s, marks, now);
  } catch {
    /* best effort */
  }
}

/** The boot `id` ran stably (10 s of frames), was destroyed cleanly or unloaded cleanly: it no longer counts as unclean. */
export function markStable(id: number, s: GuardStorage | null = storage(), now = Date.now(), tab: string = currentTab()): void {
  if (!s) return;
  clearBooting(s, tab, now);
  try {
    const boots = readBoots(s, now).filter((t) => t !== id);
    if (boots.length) s.setItem(BOOTS_KEY, JSON.stringify(boots));
    else s.removeItem(BOOTS_KEY);
  } catch {
    /* best effort */
  }
}

type UnloadTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Tracks one boot: counts stable visible frame time and clears the mark after STABLE_MS, on a clean
 * destroy (finish), or on `pagehide` once a frame has rendered (an OOM / GPU-process kill fires no
 * pagehide). `frame(dtMs)` is fed by the render loop, `rendered()` after the warm-up frames.
 */
export class BootTracker {
  private stableMs = 0;
  private done = false;
  private drawn = false;
  private ok = false;
  private readonly onPageHide = () => {
    if (this.drawn) this.finish();
  };
  constructor(
    readonly id: number,
    private s: GuardStorage | null = storage(),
    private target: UnloadTarget | null = typeof window !== 'undefined' ? window : null,
    private tab: string = currentTab(),
  ) {
    this.target?.addEventListener('pagehide', this.onPageHide);
  }
  /** A frame was drawn (the warm-up): from now on a clean unload clears the mark. */
  rendered(): void {
    this.drawn = true;
  }
  /** Feed one rendered frame. Hidden-tab gaps (> 250 ms) do not count towards STABLE_MS. */
  frame(dtMs: number): void {
    if (this.done) return;
    this.drawn = true;
    if (!(dtMs > 0) || dtMs > 250) return;
    this.stableMs += dtMs;
    if (this.stableMs >= STABLE_MS) this.finish();
  }
  /** A clean destroy (not a crash swap). */
  finish(): void {
    if (this.done) return;
    this.close();
    this.ok = true;
    markStable(this.id, this.s, Date.now(), this.tab);
  }
  /**
   * A caught crash (JS error / context loss -> Classic in place): not an OOM, so the next load may try v3
   * again (the mark goes), but the boot stays counted: two within 10 minutes block v3.
   */
  crashed(): void {
    if (this.done) return;
    this.close();
    clearBooting(this.s, this.tab);
  }
  /** Stop listening without changing the marks. */
  dispose(): void {
    if (!this.done) this.close();
  }
  private close(): void {
    this.done = true;
    this.target?.removeEventListener('pagehide', this.onPageHide);
  }
  /** The mark was cleared as clean (stable frames, clean destroy or clean unload). */
  get stable(): boolean {
    return this.ok;
  }
}
