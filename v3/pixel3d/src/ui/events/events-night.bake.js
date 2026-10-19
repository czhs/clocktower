// Events atlas, night token set (owner: events group): tools/uibake.sh events:events-night -> out/ui/events-night.*
// Same frames and names as out/ui/events.* drawn with tokens('night') (world-anchored UI switches token set with the
// scene preset, docs/UI.md §2.7).
import base, { eventsMeta } from './bake.js';
import { tokens } from '../kit.js';
import { buildFrames } from './art.js';

export default {
  ...base,
  image: 'events-night.png',
  async frames() { return buildFrames(tokens('night')); },
  meta() { return eventsMeta('night'); },
};
