// OWNED BY auto-st. The town clock + automatic (Storyteller-less) games. See docs/auto-storyteller.md.
//
// The GameModule (apps/server/src/game/index.ts) gains three optional capabilities, exposed here as
// an extension interface so the lead-owned GameModule contract (rooms/modules.ts) stays unchanged:
//   configureMode(mode, timings)  before start(): 'human' (default) or 'auto'
//   handleClock(pid, type, msg)   C2S 'clock:propose' / 'clock:vote' (automatic games)
//   storytellerMode()             the mode of the current game
//   prepareView()                 (v2.2) the Storyteller's pre-game settings (lobby-scoped)
import type { AutoTimings, C2SParsed, StPrepareView, StorylineId, StorytellerMode } from '@ct/protocol';
import type { GameModule } from '../rooms/modules.js';

export { DayClock, BedtimeMirror } from './clock.js';
export { ExtensionBallot, EXTENSION_RULES, majorityOf } from './extensions.js';
export { createAutoStoryteller, autoClockOptions, type AutoClockOptions, type AutoPort, type AutoStoryteller } from './storyteller.js';
export * as fate from './fate.js';

export type ClockMsgType = 'clock:propose' | 'clock:vote';

/** (v2.2) Extra per-game settings from the lobby. */
export interface ModeExtras {
  /** Automatic games: the storyline fate deals (null/absent = random). */
  storyline?: StorylineId | null;
}

export interface AutoCapableGame extends GameModule {
  configureMode(mode: StorytellerMode, timings: AutoTimings, extras?: ModeExtras): void;
  /** (v2.2) The seated Storyteller's pre-game settings (StCommand 'prepare'); sent ONLY to the Storyteller. */
  prepareView?(): StPrepareView;
  handleClock(pid: string, type: ClockMsgType, payload: C2SParsed<'clock:propose'> | C2SParsed<'clock:vote'>): void;
  storytellerMode(): StorytellerMode;
}

export function isAutoCapable(g: GameModule): g is AutoCapableGame {
  const x = g as Partial<AutoCapableGame>;
  return typeof x.configureMode === 'function' && typeof x.handleClock === 'function';
}

/** Timeline wording in automatic games: there is no human Storyteller. */
export function relabelForAuto(text: string): string {
  return text.replace(/\bThe Storyteller\b/g, 'The automatic Storyteller').replace(/\bthe Storyteller\b/g, 'the automatic Storyteller');
}
