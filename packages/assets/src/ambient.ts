// Ambient life: purely visual, non-colliding, deterministic decoration rendered by the client
// (TownScene). Everything here is derived from public map data and the wall clock / public phase
// only — never from other entities' positions — so it looks identical for every viewer and
// cannot leak night information.
//
// Chimney mouths and the clock face come from the generated building sprites
// (generated/ambient.json); everything else is defined here in pixel coordinates.
import { townLayout, townMap, TS } from './layout.js';

export interface AmbientCritter {
  kind: 'cat' | 'dog' | 'crow';
  /** Bottom-left of the sprite (like map objects), px. */
  x: number;
  y: number;
  flip?: boolean;
  /** Seconds per animation cycle (frame 0 most of the time, frame 1 briefly). */
  period: number;
}
export interface AmbientArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

const b = (id: string) => townLayout.buildings.find((x) => x.id === id)!;
const px = (t: number) => t * TS;
const obj = (kind: string) => townMap.objects.find((o) => o.kind === kind)!;

/** The square fountain (layout 'plazafountain', 48x48 sprite): basin water centre, basin radii and
 *  the top of the jet, world px. For the fountain sound, spray and ripples. */
const FOUNTAIN_OBJ = obj('plazafountain');
export const FOUNTAIN = {
  x: px(FOUNTAIN_OBJ.x) + 24,
  y: px(FOUNTAIN_OBJ.y + 1) - 14,
  rx: 18,
  ry: 6,
  jetX: px(FOUNTAIN_OBJ.x) + 24,
  jetY: px(FOUNTAIN_OBJ.y + 1) - 46,
};

function critters(): AmbientCritter[] {
  const out: AmbientCritter[] = [];
  const tavern = b('tavern');
  // the tavern dog dozes by the corner of the front wall
  out.push({ kind: 'dog', x: px(tavern.footprint.x + tavern.footprint.w) - 4, y: px(tavern.footprint.y + tavern.footprint.h) + 4, period: 3.2 });
  // a black cat on a doorstep and one in the churchyard
  const h3 = b('house-3');
  out.push({ kind: 'cat', x: px(h3.door.x) + 14, y: px(h3.door.y) + 6, period: 5.5 });
  out.push({ kind: 'cat', x: px(70), y: px(19) + 12, flip: true, period: 7 });
  // crows on the roofs: chapel, clock-tower battlement, a few cottages
  const ch = b('chapel');
  out.push({ kind: 'crow', x: px(ch.footprint.x) + 22, y: px(ch.footprint.y) + 6, period: 4.1 });
  out.push({ kind: 'crow', x: px(ch.footprint.x + ch.footprint.w) - 30, y: px(ch.footprint.y) + 8, flip: true, period: 5.3 });
  // the square: a crow on the cracked bell's cradle and one on the red stall's awning, a cat
  // curled on the fountain step (the tower crow moved off the battlement: the tower sprite is
  // being enlarged, so its height is not a fixed number any more)
  const bell = obj('bellcradle');
  out.push({ kind: 'crow', x: px(bell.x) + 26, y: px(bell.y + 1) - 30, period: 6.2 });
  const stall = obj('stall_red');
  out.push({ kind: 'crow', x: px(stall.x) + 8, y: px(stall.y + 1) - 41, flip: true, period: 5.1 });
  out.push({ kind: 'cat', x: FOUNTAIN.x - 34, y: px(FOUNTAIN_OBJ.y + 1) - 1, period: 6.4 });
  for (const [id, f, flip] of [
    ['house-1', 0.3, false],
    ['house-7', 0.6, true],
    ['house-12', 0.4, false],
  ] as const) {
    const h = b(id);
    out.push({ kind: 'crow', x: px(h.footprint.x) + Math.round(px(h.footprint.w) * f), y: px(h.footprint.y) + 4, flip, period: 4 + (id.length % 3) });
  }
  return out;
}

/** River/pond water tiles inside the town (for sparkles). */
function waterTiles(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let ty = 0; ty < townMap.height; ty++)
    for (let tx = 0; tx < townLayout.townBounds.w; tx++) if (townMap.ground[ty]![tx] === '~') out.push({ x: tx, y: ty });
  return out;
}

const ct = b('clocktower');

export const AMBIENT = {
  critters: critters(),
  /** Fireflies drift over the walled garden and the pond meadow at dusk/night. */
  fireflies: [
    { area: { x: px(9), y: px(11), w: px(23), h: px(9) }, count: 14 },
    { area: { x: px(6), y: px(72), w: px(22), h: px(14) }, count: 10 },
  ] as { area: AmbientArea; count: number }[],
  /** The square fountain (sound anchor; spray at the jet, ripples in the basin). */
  fountain: FOUNTAIN,
  /** Rings on the millpond (fish rising). */
  pond: { cx: px(16) + 8, cy: px(78) + 8, rx: px(5), ry: px(3) },
  water: waterTiles(),
  /** Bats circle the clock-tower spire at dusk and night. */
  bats: { cx: px(ct.footprint.x) + 40, cy: px(ct.footprint.y + ct.footprint.h) - 230, rx: 70, ry: 26, count: 5 },
  /** Night fog banks drifting across the town. */
  fog: { area: { x: 0, y: 0, w: px(townLayout.townBounds.w), h: px(townLayout.townBounds.h) }, count: 9 },
};
export type Ambient = typeof AMBIENT;
