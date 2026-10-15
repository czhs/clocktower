import type { SelfControl } from '@ct/protocol';
import { createStore } from '../../net/store';

// Gameplay-layer state for the HUD (read-only for consumers; written by gameplay/index.ts every
// frame, but only when a field actually changes). Everything here is derived from the viewer's
// OWN snapshot / game view, i.e. information the viewer already has.

export interface GameplayState {
  /** Who moves the local avatar: the player ('free'), the server ('auto' walk) or nobody ('frozen'). */
  control: 'free' | 'auto' | 'frozen';
  /** Where a server 'auto' walk ends (from WorldSnapshot.you.goal), else null. */
  goal: SelfControl['goal'] | null;
  /** The viewer's own nomination-circle spot (feet px; players only), whether or not gathered. */
  ownSpot: { x: number; y: number } | null;
  /** Gathered, outdoors and within CIRCLE_SEATED_PX of ownSpot. */
  seated: boolean;
  /** Exterior door (feet px) of the viewer's own home `house-<seat>` (players only). */
  homeDoor: { x: number; y: number } | null;
  /** The viewer is inside their own home. */
  atHome: boolean;
}

export const INITIAL_GAMEPLAY_STATE: GameplayState = { control: 'free', goal: null, ownSpot: null, seated: false, homeDoor: null, atHome: false };

export const gameplayState = createStore<GameplayState>(INITIAL_GAMEPLAY_STATE);
