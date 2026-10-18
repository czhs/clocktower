// v3 WP2 (v3-avatars). Public surface of game3d/avatars (docs/v3/INTEGRATION.md §1.4, §8 WP2).
//
// Integration (TownGame3d, the lead / integrator):
//   import { createAvatarLayer } from './avatars';
//   const avatars = createAvatarLayer({ engine, tier, heightAt, view, lights });   // a Layer3d
//   LAYERS: avatars runs after net/ (it reads Scene3dState) and before overlay/ (WP4 reads avatars.registry)
//   await avatars.selfReady() before the shader warm-up (§3.1 "Order of construction": avatars' first builds)
//   the WP0 stub's own 'wanderer' (spawnCharacter / driveAlong in TownGame3d) is then removed: the layer draws
//   the own avatar from state.me (svc.self, default true).
export { createAvatarLayer, LOD_FAR_M, type AvatarLayer, type AvatarServices } from './layer';
export { castMap, carriesLantern, ghostModeOf, BILLBOARD_IDS, CAST_IDS, GHOST_BASELINE, SPEC_IDS, STANDIN_SPEC, type CastBody, type GhostMode, type SpecCaps } from './castMap';
export { resolveEmote, raisedHands, type GameEmote } from './clips';
export { lanternHour, type LightAnchorFn, type LightLease, type LightPool } from './lanterns';
export type { AvatarBody } from './body';
