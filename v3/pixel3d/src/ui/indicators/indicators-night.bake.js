// Night token set of the indicators atlas (owner: indicators): `tools/uibake.sh indicators:indicators-night`
// → out/ui/indicators-night.{png,json}. Same frame names / layout as out/ui/indicators.* (world-anchored UI switches
// token set with the scene preset, docs/UI.md §2.7).
import { framesFor, metaFor, paletteAudit } from './bake.js';

export default {
  image: 'indicators-night.png',
  width: 256,
  async frames(env) { return framesFor(env.kit.tokens('night'), env.kit); },
  meta(env) { return { ...metaFor(env.kit.tokens('night')), tokenSet: 'night', paletteAudit: paletteAudit(env.kit.tokens('night'), env.kit) }; },
};
