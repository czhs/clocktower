// OWNED BY voice. Push-to-talk binding: a keyboard key OR a mouse button (middle / back / forward).
//
// Stored in ct.voice.prefs as the same `pttKey` string as before (back-compat: every existing
// stored KeyboardEvent.code keeps working): mouse buttons are encoded as 'Mouse1' / 'Mouse3' /
// 'Mouse4'. No KeyboardEvent.code starts with 'Mouse', so readers that only compare key codes
// (ui/hud/logic.ts shortcut guard) automatically ignore a mouse binding.
//
// Left (0) = walk / tap-to-go and right (2) = point / radial palette are never allowed.

export type PttBinding = { kind: 'key'; code: string } | { kind: 'mouse'; button: PttMouseButton };
export type PttMouseButton = 1 | 3 | 4;

export const PTT_DEFAULT = 'KeyV';
export const PTT_MOUSE_BUTTONS: readonly PttMouseButton[] = [1, 3, 4];

export function isPttMouseButton(b: number): b is PttMouseButton {
  return b === 1 || b === 3 || b === 4;
}

export function mouseCode(button: PttMouseButton): string {
  return `Mouse${button}`;
}

/** Parse a stored binding; null when invalid (callers fall back to PTT_DEFAULT). */
export function parsePtt(code: unknown): PttBinding | null {
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(code)) return null;
  const m = /^Mouse(\d)$/.exec(code);
  if (m) {
    const b = Number(m[1]);
    return isPttMouseButton(b) ? { kind: 'mouse', button: b } : null;
  }
  if (code.startsWith('Mouse')) return null;
  return { kind: 'key', code };
}

/** The stored code if valid, else the default. */
export function normalizePttCode(code: unknown): string {
  return parsePtt(code) ? (code as string) : PTT_DEFAULT;
}

const MOUSE_LABEL: Record<PttMouseButton, string> = { 1: 'Middle click', 3: 'Mouse 4 (back)', 4: 'Mouse 5 (forward)' };

/** Human label: 'V', 'Space', 'Middle click', 'Mouse 4 (back)'. */
export function pttLabel(code: string): string {
  const b = parsePtt(code);
  if (b?.kind === 'mouse') return MOUSE_LABEL[b.button];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/(Left|Right)$/, '');
}

/** MouseEvent.buttons bit for a MouseEvent.button. */
export function buttonsBit(button: PttMouseButton): number {
  return button === 1 ? 4 : button === 3 ? 8 : 16;
}

// ---------------------------------------------------------------------------------------------
// Window listeners for a mouse binding.

export interface MousePttHost {
  /** Current binding code (pref). */
  code(): string;
  /** Push-to-talk mode is on (mouse buttons are ignored otherwise; nothing is prevented). */
  active(): boolean;
  held(): boolean;
  set(held: boolean): void;
}

/** A back/forward history step this soon after a bound side button is treated as accidental. */
const NAV_GUARD_MS = 600;

/**
 * Hold the bound mouse button to talk. Suppresses the button's browser default only for the bound
 * button (and keeps it from the town): middle-click autoscroll / paste, back/forward navigation
 * (mousedown, mouseup, auxclick,
 * and as a last resort a popstate right after the button is undone before the app routes on it).
 * Releases on mouseup (delivered even outside the window while held), blur, a hidden tab, or a
 * mouse move that shows the button is no longer down (a missed mouseup never sticks).
 */
export function attachMousePtt(host: MousePttHost, w: Window = window): () => void {
  let navGuardUntil = 0;
  let undoing = 0;
  const bound = (): PttMouseButton | null => {
    if (!host.active()) return null;
    const b = parsePtt(host.code());
    return b?.kind === 'mouse' ? b.button : null;
  };
  const mine = (e: MouseEvent) => {
    const b = bound();
    if (b === null || e.button !== b) return false;
    // The town never sees the bound button (no walk / tap-to-go on middle or side clicks).
    e.stopPropagation();
    e.preventDefault();
    if (b === 3 || b === 4) navGuardUntil = performance.now() + NAV_GUARD_MS;
    return true;
  };
  const down = (e: MouseEvent) => {
    if (mine(e)) host.set(true);
  };
  const up = (e: MouseEvent) => {
    if (mine(e)) host.set(false);
  };
  const swallow = (e: MouseEvent) => void mine(e);
  // Pointer events: stop propagation only — preventDefault on pointerdown would cancel the
  // compatibility mousedown/mouseup this relies on (and pointerdown doesn't fire for a second
  // button pressed while another is held; mousedown does).
  const ptr = (e: PointerEvent) => {
    const b = bound();
    if (b !== null && e.button === b) e.stopPropagation();
  };
  const move = (e: MouseEvent) => {
    if (!host.held()) return;
    const b = bound();
    if (b !== null && (e.buttons & buttonsBit(b)) === 0) host.set(false);
  };
  // Any binding (key or mouse): a blurred window or hidden tab may never deliver the release.
  const release = () => {
    if (host.held()) host.set(false);
  };
  const vis = () => {
    if (document.visibilityState === 'hidden') release();
  };
  // Capture listener on window: runs before the app's own (bubble) popstate handler.
  const pop = (e: PopStateEvent) => {
    if (undoing > 0) {
      undoing--;
      e.stopImmediatePropagation();
      return;
    }
    if (performance.now() > navGuardUntil) return;
    e.stopImmediatePropagation();
    undoing++;
    // Which way we went is unknown; the side button's default goes back (3) or forward (4).
    w.history.go(bound() === 4 ? -1 : 1);
  };
  const opts = { capture: true } as const;
  w.addEventListener('mousedown', down, opts);
  w.addEventListener('mouseup', up, opts);
  w.addEventListener('auxclick', swallow, opts);
  w.addEventListener('pointerdown', ptr, opts);
  w.addEventListener('pointerup', ptr, opts);
  w.addEventListener('mousemove', move, { passive: true });
  w.addEventListener('blur', release);
  w.addEventListener('popstate', pop, opts);
  document.addEventListener('visibilitychange', vis);
  return () => {
    w.removeEventListener('mousedown', down, opts);
    w.removeEventListener('mouseup', up, opts);
    w.removeEventListener('auxclick', swallow, opts);
    w.removeEventListener('pointerdown', ptr, opts);
    w.removeEventListener('pointerup', ptr, opts);
    w.removeEventListener('mousemove', move);
    w.removeEventListener('blur', release);
    w.removeEventListener('popstate', pop, opts);
    document.removeEventListener('visibilitychange', vis);
  };
}
