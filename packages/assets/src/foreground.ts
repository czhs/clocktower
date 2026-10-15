// Foreground layer (assets-square): non-colliding overhead dressing drawn ABOVE characters with a
// slight parallax — overhanging boughs, bracket lanterns, hanging shop signs, laundry lines, the
// span of two stone archways and the square's bunting. Purely visual: no collision, never over a
// door tile or the voting circle, identical for every viewer (static public data).
//
// Coordinates are WORLD px (16-px tiles), sprite bottom-left anchored like map props: the sprite is
// drawn with its left edge at x and its bottom edge at y, extending up/right by w x h. Frames are
// the PROP_DEFS kinds of the same name (packed into objects.png like every other kind).
//
//   depthBias – px from the sprite bottom down to the ground point the element hangs over (its
//               height above the ground). A renderer that y-sorts can use y + depthBias as the
//               element's depth; a plain top layer can ignore it.
//   parallax  – extra scroll factor relative to the world (0 = locked to the ground; 0.06 moves 6%
//               further than the world as the camera pans), roughly proportional to height.

/** Sprite size + optional light of a foreground kind (merged into PROP_DEFS by layout.ts). */
export interface ForegroundDef {
  w: number;
  h: number;
  col: null;
  /** Light relative to the sprite's bottom-left corner, px (added to townMap.lights). */
  light?: { dx: number; dy: number; r: number; color: 'warm' | 'cool' | 'fire' | 'holy' };
}

export interface ForegroundItem {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depthBias?: number;
  parallax?: number;
}

export const FG_PROP_DEFS: Record<string, ForegroundDef> = {
  // square bunting, strung between the lamp posts of the south arc
  bunting: { w: 96, h: 24, col: null }, // level span, ends at (0,2) and (95,2)
  bunting_l: { w: 64, h: 48, col: null }, // falling to the right: (0,2) -> (63,34)
  bunting_r: { w: 64, h: 48, col: null }, // rising to the right: (0,34) -> (63,2)
  // overhanging boughs (green oak, autumn oak, bare dead branch)
  fg_branch: { w: 48, h: 32, col: null },
  fg_bough: { w: 48, h: 32, col: null },
  fg_deadbranch: { w: 48, h: 32, col: null },
  // hanging lantern: scroll bracket from the left edge, chain + lantern centred on x = 8
  fg_lantern: { w: 16, h: 32, col: null, light: { dx: 8, dy: -17, r: 60, color: 'warm' } },
  // hanging signs on iron arms (arm attaches at the right edge): tavern, curio shop
  fg_sign: { w: 32, h: 32, col: null },
  fg_sign2: { w: 32, h: 32, col: null },
  // laundry lines between cottage side walls
  fg_laundry: { w: 48, h: 24, col: null },
  fg_laundry2: { w: 64, h: 24, col: null },
  // archway spans (the piers are ordinary colliding 'archpier' props in layout.ts)
  fg_arch: { w: 80, h: 40, col: null },
  fg_arch_small: { w: 64, h: 40, col: null },
};

const T = 16;
const item = (kind: string, x: number, y: number, depthBias: number, parallax: number): ForegroundItem => {
  const d = FG_PROP_DEFS[kind];
  if (!d) throw new Error(`unknown foreground kind ${kind}`);
  return { kind, x, y, w: d.w, h: d.h, depthBias, parallax };
};

/** Where bunting ties onto a square lamp post (just under the lantern head), px. */
const tie = (lx: number, ly: number) => ({ x: lx * T + 8, y: (ly + 1) * T - 48 + 14 });

/** Arch piers (tile coordinates) — layout.ts places an 'archpier' prop on each. */
export const ARCH_PIERS: { x: number; y: number }[] = [
  // south entrance of the square: the road x 47..49 passes between them
  { x: 46, y: 64 },
  { x: 50, y: 64 },
  // where the west alley (x 17..18) meets the main road, between house-5 and the tavern
  { x: 16, y: 46 },
  { x: 19, y: 46 },
];
const PIER_H = 40;
const archSpan = (kind: string, leftPierX: number, pierY: number) => {
  const pierTop = (pierY + 1) * T - PIER_H;
  return item(kind, leftPierX * T, pierTop + 12, PIER_H - 12, 0.03);
};

function build(): ForegroundItem[] {
  const out: ForegroundItem[] = [];

  // --- Square bunting: a festoon across the south arc, lamp (41,56) -> (45,58) -> (51,58) -> (55,56)
  {
    const a = tie(41, 56);
    const b = tie(45, 58);
    const c = tie(51, 58);
    const d = tie(55, 56);
    out.push(item('bunting_l', a.x, a.y - 2 + 48, 20, 0.06));
    out.push(item('bunting', b.x, b.y - 2 + 24, 22, 0.06));
    out.push(item('bunting_r', c.x, d.y - 2 + 48, 20, 0.06));
  }

  // --- Archway spans over the square's south entrance and the west alley's main-road end
  out.push(archSpan('fg_arch', 46, 64));
  out.push(archSpan('fg_arch_small', 16, 46));
  // a lantern hangs from each keystone, above the walkway
  out.push(item('fg_lantern', 48 * T, (64 + 1) * T - PIER_H + 16, 24, 0.04));
  out.push(item('fg_lantern', 17 * T + 8, (46 + 1) * T - PIER_H + 16, 24, 0.04));

  // --- Overhanging boughs where trees crowd a path (sprite reaches over the path's near half)
  out.push(item('fg_branch', 29 * T - 4, 50 * T + 14, 40, 0.1)); // oak (29,53) over the main road
  out.push(item('fg_bough', 63 * T - 2, 50 * T + 14, 40, 0.1)); // autumn oak (63,53) over the main road
  out.push(item('fg_deadbranch', 40 * T - 6, 30 * T + 6, 36, 0.1)); // dead tree (40,33) over the north lane
  out.push(item('fg_branch', 48 * T + 8, 25 * T + 2, 40, 0.1)); // oak (51,26) over the north road
  out.push(item('fg_branch', 37 * T + 6, 58 * T + 2, 40, 0.1)); // park oak (38,61) toward the square

  // --- Hanging signs on iron arms (board over the walkway beside the facade corner)
  out.push(item('fg_sign', 32 * T - 30, 47 * T - 10, 14, 0.04)); // The Hanged Lantern, east end of the facade
  out.push(item('fg_sign2', 74 * T - 30, 30 * T - 10, 14, 0.04)); // Mortimer's Curios, west corner

  // --- Bracket lantern on the curio shop's east corner (north lane)
  out.push(item('fg_lantern', 81 * T - 4, 30 * T - 10, 10, 0.04));

  // --- Laundry lines strung between cottage side walls (over the alleys where they cross)
  out.push(item('fg_laundry', 21 * T, 28 * T - 2, 26, 0.05)); // house-1 | house-2 (north lane)
  out.push(item('fg_laundry2', 13 * T, 64 * T - 4, 26, 0.05)); // house-8 | house-9, over alley x 14..15
  out.push(item('fg_laundry', 68 * T, 64 * T - 4, 26, 0.05)); // house-11 | house-12, over alley x 69

  return out;
}

/** Every foreground element, in draw order (back to front). */
export const FOREGROUND: ForegroundItem[] = build();
