// Retired (2026-10-17): the flat, front-facing big book (r1 of bookStyle 'big') was replaced by a REAL 3D book after the
// user's review ("The book should be a 3d sprite like the hand"). Nothing imports this file any more; it re-exports the
// 3D book's runtime so old imports keep resolving. See book3d.js (model, poses, live context), bake3d.js (port bake),
// port3d.js (drawing the baked sprites) and docs/UI.md §6 "3D big book". The flat frames bookbig_<phase>_<f> are gone
// from out/ui/notebook*.json; the port frames are bookbig_<dir>_<phase>_<f>.
export { book3dState as bigBookState, big3dFrameName as bigFrameName, BIG3D_PHASES as BIG_PHASES, BIG3D_FPS as BIG_FPS,
  BIG3D_TIMING as BIG_TIMING, HOLD_SEQ_3D as BIG_HOLD_SEQ, PLACE3D as PLACE_BIG3D } from './book3d.js';
