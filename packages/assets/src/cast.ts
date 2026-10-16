// The character roster (v2). Players pick ONE of these (no custom characters) and nobody else in
// the same lobby may have it. Art: packages/assets/scripts/cast/<id>.ts draws each one as v1-style
// pixel art in 8 directions; generated/cast.png + cast.json hold the sheets. `Cosmetics.preset`
// stores the id (the layered cosmetic fields are legacy and ignored for rendering).

export type CastKind = 'villager' | 'mascot' | 'storyteller' | 'npc';
export interface CastMember {
  /** /^[a-z0-9][a-z0-9-]{0,31}$/ */
  id: string;
  name: string;
  blurb: string;
  kind: CastKind;
  /** CMU course (mascots). */
  course?: string;
  /** Carries a light: a warm glow is drawn around them at dusk/night. */
  lantern?: boolean;
  /**
   * Photo-real, not pixel art: art/<id>.png (8 directions × 5 poses at CAST_HD_SCALE) goes into
   * generated/cast-hd.png, which the town and portraits draw smoothed; cast.png gets a downscale.
   */
  hd?: boolean;
}

export const CAST: readonly CastMember[] = [
  // the fun villagers
  { id: 'frog', name: 'Sir Croaksworth', blurb: 'A knight sworn to a pond that no longer exists.', kind: 'villager' },
  { id: 'mushroom', name: 'Brother Morel', blurb: 'Blesses the square, sheds spores when nervous.', kind: 'villager' },
  { id: 'fox', name: 'Ginger', blurb: 'Keeps the inn, and every rumour that passes through it.', kind: 'villager' },
  { id: 'owl', name: 'Archivist Hoot', blurb: 'Has read every ledger twice. Remembers who lied.', kind: 'villager' },
  { id: 'crow', name: 'Mortimer', blurb: 'Gravedigger. Very calm about it.', kind: 'villager' },
  { id: 'moth', name: 'Lumen', blurb: 'Lights the lamps at dusk; cannot resist them.', kind: 'villager', lantern: true },
  { id: 'goat', name: 'Magistrate Billings', blurb: 'Presides over every trial. Eats the evidence.', kind: 'villager' },
  { id: 'skeleton-chef', name: 'Bones', blurb: 'The baker. Nobody asks how long he has been dead.', kind: 'villager' },
  { id: 'rabbit', name: 'Clover', blurb: 'Herbalist. Knows which leaf heals and which one doesn’t.', kind: 'villager' },
  { id: 'mole', name: 'Old Delve', blurb: 'Blacksmith. Works by feel; trusts nobody he can see.', kind: 'villager' },
  { id: 'snail', name: 'Tinker Pell', blurb: 'Fixes clocks. Slowly. Perfectly.', kind: 'villager' },
  { id: 'toad', name: 'Toadley', blurb: 'Merchant of fine goods and finer excuses.', kind: 'villager' },
  { id: 'green-hood', name: 'Wisp', blurb: 'A small wanderer in a green hood. Eyes like lanterns.', kind: 'villager' },
  { id: 'nicksong', name: 'Nick Song', blurb: 'Shaggy hair, sly smirk, never looks up from his phone. Suspiciously pleased.', kind: 'villager' },
  { id: 'brianbi', name: 'brianbi', blurb: 'Lost his right shoe somewhere in town. Will not say where.', kind: 'villager', hd: true },
  // CMU course mascots
  { id: 'honk', name: 'Honk', blurb: 'A grey goose with contracts to check.', kind: 'mascot', course: '15-122' },
  { id: 'chonk', name: 'Chonk', blurb: 'A goose the size of a person. Nobody argues.', kind: 'mascot', course: '15-122' },
  { id: 'polly', name: 'Polly', blurb: 'The Polymorphic Parrot, in her λ tee.', kind: 'mascot', course: '15-150' },
  { id: 'clarabelle', name: 'Clarabelle', blurb: 'The Parallel Cow. Does two things at once.', kind: 'mascot', course: '15-210' },
  { id: 'requin', name: 'Requin', blurb: 'A French shark in a beret. Bombs are personal.', kind: 'mascot', course: '15-213' },
  { id: 'progress', name: 'Progress', blurb: 'A green frog who always takes a step.', kind: 'mascot', course: '15-312' },
  { id: 'preservation', name: 'Preservation', blurb: 'A blue frog who never changes type.', kind: 'mascot', course: '15-312' },
  { id: 'opal', name: 'Opal', blurb: 'The Optimizing Otter. Dead code fears her.', kind: 'mascot', course: '15-411' },
  { id: 'cilantro', name: 'Cilantro', blurb: 'A giraffe in a blue hoodie and a green scarf.', kind: 'mascot', course: '15-251' },
  { id: 'mincut', name: 'Mincut', blurb: 'A red panda who finds the weakest link.', kind: 'mascot', course: '15-451' },
  { id: 'maxflow', name: 'Maxflow', blurb: 'A big soft fox. Pushes as much as will fit.', kind: 'mascot', course: '15-451' },
  { id: 'theo-rem', name: 'Theo Rem', blurb: 'A hedgehog. Q.E.D.', kind: 'mascot', course: '21-127' },
  { id: 'greenting', name: 'Greenting', blurb: 'A round green creature. Nobody knows what it is.', kind: 'mascot', course: 'UCT' },
  // not selectable
  { id: 'storyteller', name: 'Storyteller', blurb: 'Hooded, lantern-lit, always watching.', kind: 'storyteller', lantern: true },
  { id: 'npc-sweeper', name: 'Sweeper', blurb: '', kind: 'npc' },
  { id: 'npc-vendor', name: 'Vendor', blurb: '', kind: 'npc' },
  { id: 'npc-elder', name: 'Elder', blurb: '', kind: 'npc' },
  { id: 'npc-porter', name: 'Porter', blurb: '', kind: 'npc' },
];

/** Characters a player may pick. */
export const PLAYABLE: readonly CastMember[] = CAST.filter((c) => c.kind === 'villager' || c.kind === 'mascot');
export const PLAYABLE_IDS: ReadonlySet<string> = new Set(PLAYABLE.map((c) => c.id));
export const castById = (id: string | null | undefined): CastMember | undefined => (id ? CAST.find((c) => c.id === id) : undefined);

/** Sheet geometry (shared by the generator and the client). */
export const CAST_FW = 32;
export const CAST_FH = 40;
export const CAST_ANCHOR = { x: 16, y: 38 } as const;
export const CAST_DIRS = ['down', 'down-right', 'right', 'up-right', 'up', 'up-left', 'left', 'down-left'] as const;
export type CastDir = (typeof CAST_DIRS)[number];
export const CAST_FRAMES = ['idle', 'walk1', 'walk2', 'walk3', 'walk4'] as const;
/** HD sheets (generated/cast-hd.*) are this many times the 32x40 frame; same anchor, scaled. */
export const CAST_HD_SCALE = 5;
