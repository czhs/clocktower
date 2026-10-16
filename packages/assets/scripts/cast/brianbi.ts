// brianbi: photo-real, from art/brianbi.png (see hd.ts and scripts/hd/import-brianbi.ts). His right
// foot is bare, so no direction is mirrored: every one comes from its own view.
import { smallFrame } from './hd.js';
import type { CharacterArt } from './types.js';

const art: CharacterArt = {
  id: 'brianbi',
  draw: (dir, frame) => smallFrame('brianbi', dir, frame),
  drawMirrored: (dir, frame) => smallFrame('brianbi', dir, frame),
};
export default art;
