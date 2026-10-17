// Renderer-free input + facing rules, shared by the Phaser town (TownScene) and the v3 3D town (game3d/).
// (v3 WP0: extracted verbatim from TownScene.ts; no behaviour change.)
import type { Facing } from '@ct/protocol';

export type Dir8 = 'down' | 'down-right' | 'right' | 'up-right' | 'up' | 'up-left' | 'left' | 'down-left';
export const DIR8: readonly Dir8[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
export type KeyDir = 'up' | 'down' | 'left' | 'right';

export const fromFacing = (f: Facing): Dir8 => f;

/** 8-way direction of a vector (screen coords, y down). */
export function dir8(vx: number, vy: number): Dir8 {
  const a = Math.atan2(vy, vx);
  const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return DIR8[k]!;
}

/** Server facing (4-way) for an 8-way direction. */
export function toFacing(d: Dir8, vx: number, vy: number): Facing {
  if (d === 'left' || d === 'right' || d === 'up' || d === 'down') return d;
  return Math.abs(vx) > Math.abs(vy) + 0.01 ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down';
}

/** Movement key (by KeyboardEvent.code; the touch joystick sends the same arrow codes). */
export function keyDir(code: string): KeyDir | null {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'up';
    case 'KeyS':
    case 'ArrowDown':
      return 'down';
    case 'KeyA':
    case 'ArrowLeft':
      return 'left';
    case 'KeyD':
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}

/** The key went to a text field (or carries a modifier): it is not a movement key. */
export function isTyping(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = (e.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  const a = document.activeElement as HTMLElement | null;
  for (const n of [el, a]) {
    if (!n) continue;
    const tag = n.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable) return true;
  }
  return false;
}

/** The (unnormalised) key vector of the held movement keys. */
export function keyVector(keys: ReadonlySet<KeyDir | string>): { vx: number; vy: number } {
  let vx = 0;
  let vy = 0;
  if (keys.has('left')) vx -= 1;
  if (keys.has('right')) vx += 1;
  if (keys.has('up')) vy -= 1;
  if (keys.has('down')) vy += 1;
  return { vx, vy };
}
