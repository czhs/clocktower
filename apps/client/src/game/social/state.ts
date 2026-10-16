import type { PinColor } from '@ct/protocol';
import { createStore } from '../../net/store';

// Shared between the emote/pin dock (apps/client/src/ui/social) and the in-world social layer.
export interface SocialMode {
  /** 'idle' = taps walk as usual; 'point' / 'pin' = the next tap on the town points / drops a pin. */
  mode: 'idle' | 'point' | 'pin';
  /** Colour for the next pin (remembered per browser by the palette). */
  color: PinColor;
}
export const socialMode = createStore<SocialMode>({ mode: 'idle', color: 'gold' });

/** What a gesture is aimed at: a person (pid) or a spot (world px). */
export interface SocialTarget {
  x: number;
  y: number;
  pid: string | null;
}

/** Touch long-press: the tiny two-button radial at the finger (CSS px, viewport coords). */
export interface SocialRadial {
  sx: number;
  sy: number;
  target: SocialTarget;
  /** The button under the finger while it is still down (drag-to-choose). */
  hot: 'point' | 'pin' | null;
}
export const socialRadial = createStore<SocialRadial | null>(null);

/** Hovered pin tooltip (CSS px, viewport coords of the pin head's top). */
export interface SocialHover {
  sx: number;
  sy: number;
  text: string;
  /** One of yours (or you are the Storyteller): clicking removes it. */
  removable: boolean;
}
export const socialHover = createStore<SocialHover | null>(null);

/** Live counts for the dock. */
export const socialInfo = createStore<{ mine: number; here: number }>({ mine: 0, here: 0 });

/** Actions the in-world layer registers for the dock / radial (no-ops until the town is up). */
export interface SocialActions {
  point(t: SocialTarget): void;
  pin(t: SocialTarget): void;
  clear(scope: 'mine' | 'all'): void;
  /** Close the radial / disarm the dock mode. */
  cancel(): void;
  /** (v2.2) Nick Song's 'nick-face' emote (the server refuses it for anyone else). */
  nickFace?(): void;
}
let actions: SocialActions | null = null;
export const socialActions = {
  register(a: SocialActions | null) {
    actions = a;
  },
  get: (): SocialActions | null => actions,
};
