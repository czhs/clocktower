// Gameplay layer entry (v3 WP0s): the layer is split into
//   * core.ts       renderer-free rules (server-driven walk/freeze, door overrides, door-tag publish,
//                   the gameplayState HUD store, Storyteller pick input, per-frame GameplayFrame) — no Phaser;
//   * phaserView.ts the Phaser drawing of a GameplayFrame (seat markers, vote clock, hands, hints, pick
//                   crosshair) and `createGameplayLayer(scene, ctx)`, the TownScene hook.
// The v3 3D town uses core.ts directly. Existing importers of './gameplay' keep working through this barrel.
export { createGameplayLayer, type GameplayCtx, type GameplayLayer } from './phaserView';
export {
  createGameplayCore,
  type DrivenPose,
  type GameplayConn,
  type GameplayCore,
  type GameplayCoreCtx,
  type GameplayFrame,
  type GameplayHint,
  type SeatMarker,
  type VoterHand,
} from './core';
export { gameplayState, INITIAL_GAMEPLAY_STATE, type GameplayState } from './state';
export { stagePick, type StagePick } from './pick';
export { doorTagsStore, MAX_ICONS, type DoorBoardView, type DoorTagView } from './doorTags';
