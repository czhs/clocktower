export { townLayout, townMap, PROP_DEFS, G, BLOCKING_GROUND, interiorBuildingAt, MAP_W, MAP_H, TOWN_W, TOWN_H, PLAZA, CIRCLE } from './layout.js';
export type { BuildingStyle, LightDef, MapObject, PropDef, TownMap } from './layout.js';
export { CHARACTER_PRESETS, PRESET_IDS, presetById, presetSheetKey } from './presets.js';
export type { CharacterPreset } from './presets.js';
export { CAST, PLAYABLE, PLAYABLE_IDS, castById, CAST_FW, CAST_FH, CAST_ANCHOR, CAST_DIRS, CAST_FRAMES, CAST_HD_SCALE } from './cast.js';
export type { CastMember, CastKind, CastDir } from './cast.js';
export { layoutFor } from './hollowmere/layoutFor.js'; // (v3 WP5a) pure; never imports the v3 data
