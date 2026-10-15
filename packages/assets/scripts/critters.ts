// Tiny ambient critters (purely visual, non-colliding): a black cat, a sleeping dog and a crow,
// two frames each. Placed and animated by the client from src/ambient.ts.
import { Img } from './lib/img.js';

const PAL: Record<string, string> = {
  o: '#0b0910', // outline
  k: '#24202c', // cat fur
  h: '#3d3747', // cat highlight
  y: '#e8c84a', // eyes
  p: '#a05a6a', // nose
  b: '#5a3e2a', // dog fur
  l: '#7a5638', // dog light fur
  e: '#1a120c', // dog eye/nose
  c: '#15121c', // crow
  g: '#6a6470', // beak
};

function fromRows(rows: string[]): Img {
  const img = new Img(rows[0]!.length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && img.set(x, y, PAL[ch] ?? '#ff00ff')));
  return img;
}

const CAT_0 = [
  '................',
  '................',
  '................',
  '................',
  '...o...o........',
  '..oko.oko.......',
  '..okkokkko......',
  '..okykkyko......',
  '..okkkpkko......',
  '...okkkko.......',
  '...okhkkko......',
  '..okhkkkkko.....',
  '..okhkkkkkko.oo.',
  '..okhkkkkkkookko',
  '..okkokkokkkkko.',
  '...oo.oo.oooo...',
];
const CAT_1 = [
  '................',
  '................',
  '................',
  '................',
  '...o...o........',
  '..oko.oko.......',
  '..okkokkko......',
  '..okokkoko......',
  '..okkkpkko...o..',
  '...okkkko...oko.',
  '...okhkkko..oko.',
  '..okhkkkkko.oko.',
  '..okhkkkkkkooko.',
  '..okhkkkkkkkko..',
  '..okkokkokkko...',
  '...oo.oo.ooo....',
];
const DOG_0 = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..oo............',
  '.obbo...........',
  '.obbbooooooooo..',
  'obebblllllbbbboo',
  'obbbbbbbbbbbbbbo',
  '.eolbbobbbbobbo.',
  '..ooooo.oooo.oo.',
];
const DOG_1 = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..oo............',
  '.obbo.........o.',
  '.obbbooooooooobo',
  'obobblllllbbbbo.',
  'obbbbbbbbbbbbbo.',
  '.eolbbobbbbobbo.',
  '..ooooo.oooo.oo.',
];
const CROW_0 = ['........', '...cc...', '..ccycg.', '.ccccc..', 'cccccc..', '.cccc...', '..c.c...', '........'];
const CROW_1 = ['c......c', 'cc.cc.cc', '.ccycccg', '..cccc..', '..cccc..', '...c.c..', '........', '........'];

export function drawCritters(): Map<string, Img> {
  const m = new Map<string, Img>();
  m.set('critter_cat_0', fromRows(CAT_0));
  m.set('critter_cat_1', fromRows(CAT_1));
  m.set('critter_dog_0', fromRows(DOG_0));
  m.set('critter_dog_1', fromRows(DOG_1));
  m.set('critter_crow_0', fromRows(CROW_0));
  m.set('critter_crow_1', fromRows(CROW_1));
  return m;
}
