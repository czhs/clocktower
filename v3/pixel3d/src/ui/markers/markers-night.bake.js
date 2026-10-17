// Night variant of the markers atlas (owner: markers group): world-anchored UI switches token sets with the scene preset
// (docs/UI.md §2.7), so the gold of the finger cuff / ping / trail / pick follows TOKENS.night.
//   tools/uibake.sh markers:markers-night   ->  out/ui/markers-night.{png,json}
import { tokens } from '../kit.js';
import { buildFrames } from './art.js';
import day, { markersMeta } from './bake.js';

export default {
  ...day,
  image: 'markers-night.png',
  async frames() { return buildFrames(tokens('night')); },
  meta() { return markersMeta('night'); },
};
