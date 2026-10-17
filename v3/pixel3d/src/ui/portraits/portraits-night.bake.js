// Night copy of the portraits atlas (owner: portraits group): world-anchored icons (tier A) switch token sets with the
// scene preset (docs/UI.md §2.7), so the alive disc/ring and the halo gold follow TOKENS.night. Same frame names.
//   tools/uibake.sh portraits:portraits-night   ->  out/ui/portraits-night.{png,json}
import { tokens } from '../kit.js';
import day, { portraitFrames, portraitsMeta } from './bake.js';

export default {
  ...day,
  image: 'portraits-night.png',
  async frames({ engine }) { return portraitFrames(engine, tokens('night')); },
  async meta({ engine }) { return portraitsMeta(engine, 'night'); },
};
