// UI DENSITY: the whole mock game screen (scenes/ui-hud.js ?game=1) with the screen tier at D=2 and NO group change
// (owner: UI lead; docs/UI.md "Density" compat path). ?uidensity=2&uiscreen=hd makes L.screen the D=2 screen view, so
// every group's screen drawer gets the D=2 faces and frames; 1x sprites draw block-scaled (same size); prepareHD()
// attaches the HD swatches / pin glyph / glove / toolbar glyphs. World tiers stay 1x. Compare with ?scene=ui-hud&game=1.
//   tools/shot.sh ui-density-hud shots/ui-hd/hud-whole-d2.png --size 1280x720 --t 1
import hudScene from './ui-hud.js';
import { tokens } from '../src/ui/kit.js';
import { prepareHD } from '../src/ui/hd/art.js';

export default async function build(engine, params) {
  if (!params.has('uidensity')) params.set('uidensity', '2');
  if (!params.has('uiscreen')) params.set('uiscreen', 'hd');
  if (!params.has('game')) params.set('game', '1');
  for (const tod of new Set([params.get('tod') ?? 'noon', 'noon'])) prepareHD(tokens(tod));   // memo keys are token values
  await hudScene(engine, params);
}
