// Night variant of the notebook atlas (owner: notebook group): the in-world book is tier A (world-anchored), so it
// follows the scene preset's token set (docs/UI.md §2.7).   tools/uibake.sh notebook:notebook-night
import { tokens } from '../kit.js';
import day from './bake.js';

export default {
  ...day,
  image: 'notebook-night.png',
  async frames(env) { return day.frames.call(this, { ...env, tod: 'night' }); },
  meta(env) { return day.meta.call(this, { ...env, tod: 'night' }); },
  files() { return {}; },        // the DOM skin is day-token only (out/ui/notebook.css from the day bake)
};
void tokens;
