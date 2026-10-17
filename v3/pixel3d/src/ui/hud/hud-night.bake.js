// HUD atlas, night token set (owner: hud group): out/ui/hud-night.{png,json}  —  tools/uibake.sh hud:hud-night
// Same frames / names / meta as ./bake.js, drawn with tokens('night') (cooler ink, iron and text; docs/UI.md §2.7).
import base, { framesFor, audit } from './bake.js';
import { tokens } from '../kit.js';

export default {
  ...base,
  image: 'hud-night.png',
  async frames(env) { const T = tokens('night'); const f = framesFor(T); this._audit = audit(f, T); return f; },
  meta(env) { return { ...base.meta.call(this, { ...env, T: tokens('night') }), tokenSet: 'night' }; },
};
