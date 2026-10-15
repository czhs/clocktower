import type { PinColor } from '@ct/protocol';
import { createStore } from '../../net/store';

// Shared between the emote/pin palette (apps/client/src/ui/social) and the in-world social layer.
export interface SocialMode {
  /** 'idle' = taps walk as usual; 'point' / 'pin' = the next tap on the town points / drops a pin. */
  mode: 'idle' | 'point' | 'pin';
  /** Colour for the next pin (remembered per browser by the palette). */
  color: PinColor;
}
export const socialMode = createStore<SocialMode>({ mode: 'idle', color: 'gold' });
