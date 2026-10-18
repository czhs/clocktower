// v3 WP1 (v3-core). Keyboard input of the 3D town (docs/v3/INTEGRATION.md §3 "Touch joystick", "Escape leaves an
// interior"): window keydown / keyup by KeyboardEvent.code (WASD + arrows; the touch joystick dispatches the same
// arrow codes), ignored while typing in a field; window blur releases every key. Escape leaves the building you are
// in, but not while the Storyteller panel is picking a map point (the gameplay core cancels the pick then).
import { isTyping, keyDir, keyVector, type KeyDir } from '../../game/rules/input';

export interface KeyTarget {
  addEventListener(type: 'keydown' | 'keyup' | 'blur', fn: (e: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown' | 'keyup' | 'blur', fn: (e: KeyboardEvent) => void): void;
}

export interface KeyInputCtx {
  /** A movement key went down (tap routes end). */
  onMoveKey(): void;
  /** Escape outside a pick (leave the building). */
  onEscape(): void;
  /** A Storyteller pick is armed (Escape belongs to it). */
  picking(): boolean;
  /** Typing in a field (default: rules/input isTyping). */
  typing?(e: KeyboardEvent): boolean;
}

export interface KeyInput {
  /** The held key vector (unnormalised). */
  vector(): { vx: number; vy: number };
  held(): ReadonlySet<KeyDir>;
  clear(): void;
  destroy(): void;
}

export function createKeyInput(ctx: KeyInputCtx, target: KeyTarget = window): KeyInput {
  const keys = new Set<KeyDir>();
  const typing = ctx.typing ?? isTyping;
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const k = keyDir(e.code);
    if (k) {
      keys.add(k);
      ctx.onMoveKey();
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
    if (e.code === 'Escape' && !ctx.picking()) ctx.onEscape();
  };
  const up = (e: KeyboardEvent) => {
    const k = keyDir(e.code);
    if (k) keys.delete(k);
  };
  const blur = () => keys.clear();
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', blur);
  return {
    vector: () => keyVector(keys),
    held: () => keys,
    clear: () => keys.clear(),
    destroy() {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
      keys.clear();
    },
  };
}
