// v3.4: the sprite path as ONE lazily loaded chunk (avatars/layer.ts imports it only when sprites are on: the `low`
// tier or ct.debug.v3sprites=1), so `high` / `cpu` clients do not download it (town3d chunk budget, scripts/perf).
export { createSpriteBody, sheetCameraOf, spriteDebug } from './spriteBody';
export { getSheet, gpuStats, hasKit, setPersistHold, warmKit, peekSheet, peekStats, pumpBakes, releaseSheet, releaseSheets, sheetStats, storeStats, subtreeGeometryBytes, type SpriteSheet } from './bake';
