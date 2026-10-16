// LEAD-OWNED. `@ct/protocol/client`: the schema-free browser entry (v2.2 perf WP3).
//
// The client never validates (the server does, with the Zod schemas in the full `@ct/protocol`),
// but importing any value from the full index drags zod (~240 KiB source) into the client bundle,
// because the schema modules build their schemas at module load. This entry exposes
//   * every TYPE of the full protocol (type-only re-exports: erased at build time, so the
//     schema modules are never loaded), and
//   * every runtime value that is not a schema: constants, enums, pure helpers.
// The client build aliases the bare `@ct/protocol` to this file (apps/client/vite.config.ts), so
// client code keeps `import … from '@ct/protocol'` and typechecks against the full protocol; a value
// that is missing here fails the client build loudly ("… is not exported by client.ts").
//
// MIRROR RULE: values that live in a zod-bearing module (game.ts, world.ts, …) are mirrored below,
// verbatim. packages/protocol/test/client-entry.test.ts fails when the two drift apart (deep-equal
// values, identical function source) or when a new non-schema value is not mirrored. Nothing here
// may import zod or a module that imports zod at runtime (the same test checks that).
// (Follow-up for the lead: move these definitions into zod-free modules that both entries re-export.)
import type { BuildingDef, CircleSpot, Facing, LocationId, TilePoint, TileRect, TownLayout } from './world.js';
import type { CharacterId, CharacterInfo } from './game.js';
import type { Cosmetics } from './cosmetics.js';
import type { NotebookData } from './notebook.js';
import type { StSettings } from './storyteller.js';

export type * from './text.js';
export type * from './cosmetics.js';
export type * from './auth.js';
export type * from './lobby.js';
export type * from './world.js';
export type * from './game.js';
export type * from './storyteller.js';
export type * from './voice.js';
export type * from './chat.js';
export type * from './social.js';
export type * from './clock.js';
export type * from './story.js';
export type * from './notebook.js';
export type * from './admin.js';
export type * from './messages.js';

// zod-free modules: re-exported as they are.
export * from './constants.js';
export * from './snapshotCodec.js'; // (v2.2, WP4) world:snap2 decoder
export * from './lobbyWords.js'; // (v2.2) simple-word lobby ids / names
export * from './storylines.js'; // (v2.2, rules-storyteller) preset setups (storylines)

// ------------------------------------------------------------------------------- text.ts

export function cleanText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// -------------------------------------------------------------------------- cosmetics.ts

export const SKIN_TONES = ['porcelain', 'fair', 'olive', 'tan', 'brown', 'umber'] as const;
export const HAIR_STYLES = ['bald', 'short', 'long', 'braid', 'bun', 'hood'] as const;
export const HAIR_COLORS = ['black', 'brown', 'auburn', 'blonde', 'grey', 'white'] as const;
export const OUTFITS = ['peasant', 'merchant', 'noble', 'cleric', 'smith', 'scholar'] as const;
export const OUTFIT_PALETTES = ['crimson', 'forest', 'midnight', 'ochre', 'plum', 'slate'] as const;
export const ACCESSORIES = ['none', 'hat', 'lantern', 'scarf', 'spectacles', 'satchel'] as const;
export const GHOST_STYLES = ['wisp', 'shroud', 'lantern', 'pale'] as const;

export const DEFAULT_COSMETICS: Cosmetics = {
  skin: 'fair',
  hair: 'short',
  hairColor: 'brown',
  outfit: 'peasant',
  palette: 'forest',
  accessory: 'none',
  ghost: 'wisp',
};

// ------------------------------------------------------------------------------ lobby.ts

export const SCRIPTS = ['trouble-brewing'] as const;

// ------------------------------------------------------------------------------ world.ts

export function tileIndex(layout: TownLayout, tx: number, ty: number): number {
  return ty * layout.widthTiles + tx;
}

export function isBlockedTile(layout: TownLayout, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= layout.widthTiles || ty >= layout.heightTiles) return true;
  return layout.collision[tileIndex(layout, tx, ty)] === 1;
}

export const BODY_HALF_W = 5;
export const BODY_H = 6;

export function isBlockedPx(layout: TownLayout, x: number, y: number): boolean {
  const ts = layout.tileSize;
  const pts: [number, number][] = [
    [x - BODY_HALF_W, y - BODY_H],
    [x + BODY_HALF_W, y - BODY_H],
    [x - BODY_HALF_W, y - 1],
    [x + BODY_HALF_W, y - 1],
  ];
  return pts.some(([px, py]) => isBlockedTile(layout, Math.floor(px / ts), Math.floor(py / ts)));
}

function inRect(r: TileRect, tx: number, ty: number): boolean {
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
}

export function locationAt(layout: TownLayout, x: number, y: number): LocationId {
  const tx = Math.floor(x / layout.tileSize);
  const ty = Math.floor(y / layout.tileSize);
  for (const b of layout.buildings) if (inRect(b.interior, tx, ty)) return `bld:${b.id}`;
  return 'outdoors';
}

export function inSquare(layout: TownLayout, x: number, y: number): boolean {
  const dx = x - layout.square.cx;
  const dy = y - layout.square.cy;
  return dx * dx + dy * dy <= layout.square.r * layout.square.r;
}

export function tileCenterPx(layout: TownLayout, p: TilePoint): { x: number; y: number } {
  // Positions are feet positions: horizontally centred, near the bottom of the tile.
  return { x: p.x * layout.tileSize + layout.tileSize / 2, y: p.y * layout.tileSize + layout.tileSize - 2 };
}

export const FACINGS = ['down', 'up', 'left', 'right'] as const;

export function homeBuilding(layout: TownLayout, seat: number | null | undefined): BuildingDef | undefined {
  if (seat === null || seat === undefined) return undefined;
  return layout.buildings.find((b) => b.kind === 'house' && b.houseIndex === seat);
}

export function seatOfBuilding(layout: TownLayout, buildingId: string): number | null {
  const b = layout.buildings.find((x) => x.id === buildingId);
  return b && b.kind === 'house' && b.houseIndex !== null ? b.houseIndex : null;
}

export function circleCentre(layout: TownLayout): { x: number; y: number } {
  if (layout.circle) return { x: layout.circle.cx, y: layout.circle.cy };
  return { x: layout.square.cx, y: layout.square.cy - layout.tileSize };
}

export function circleRadii(layout: TownLayout): { rx: number; ry: number } {
  if (layout.circle) return { rx: layout.circle.rx, ry: layout.circle.ry };
  const ts = layout.tileSize;
  return { rx: 6.5 * ts, ry: 5.75 * ts };
}

export function circleSpots(layout: TownLayout, seats: readonly number[]): CircleSpot[] {
  const sorted = [...new Set(seats)].sort((a, b) => a - b);
  const c = circleCentre(layout);
  const { rx, ry } = circleRadii(layout);
  const n = sorted.length;
  const deg = Math.PI / 180;
  const start = layout.circle?.startDeg !== undefined ? layout.circle.startDeg * deg : Math.PI / 4;
  const sweep = layout.circle?.sweepDeg !== undefined ? layout.circle.sweepDeg * deg : (3 * Math.PI) / 2;
  const arc = { start, sweep, full: sweep >= 2 * Math.PI - 1e-6 };
  const out: CircleSpot[] = [];
  const taken: { x: number; y: number }[] = [];
  const free = (x: number, y: number) =>
    !isBlockedPx(layout, x, y) && locationAt(layout, x, y) === 'outdoors' && taken.every((t) => Math.hypot(t.x - x, t.y - y) >= 12);
  sorted.forEach((seat, i) => {
    // Default: an open north arc leaves a landmark behind the gathering. A layout may instead give
    // the arc (v2 square: a full ring around the fountain). Vote order always runs clockwise.
    const th = arc.full ? arc.start + (arc.sweep * i) / Math.max(1, n) : arc.start + (arc.sweep * i) / Math.max(1, n - 1);
    const ix = Math.round(c.x + Math.sin(th) * rx);
    const iy = Math.round(c.y - Math.cos(th) * ry);
    let best = { x: ix, y: iy };
    search: for (let r = 0; r <= 40; r += 2) {
      const steps = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 2));
      for (let k = 0; k < steps; k++) {
        const a = (2 * Math.PI * k) / steps;
        const x = Math.round(ix + Math.cos(a) * r);
        const y = Math.round(iy + Math.sin(a) * r);
        if (free(x, y)) {
          best = { x, y };
          break search;
        }
      }
    }
    taken.push(best);
    // Face the middle of the ring (where the Storyteller stands).
    const fx = c.x - best.x;
    const fy = c.y - best.y;
    const facing: Facing = layout.circle?.startDeg === undefined ? 'down' : Math.abs(fx) > Math.abs(fy) * 1.5 ? (fx < 0 ? 'left' : 'right') : fy < 0 ? 'up' : 'down';
    out.push({ seat, x: best.x, y: best.y, facing });
  });
  return out;
}

export const CIRCLE_SEATED_PX = 12;

// ------------------------------------------------------------------------------- game.ts

export const CHARACTER_IDS = [
  // Townsfolk
  'washerwoman',
  'librarian',
  'investigator',
  'chef',
  'empath',
  'fortune_teller',
  'undertaker',
  'monk',
  'ravenkeeper',
  'virgin',
  'slayer',
  'soldier',
  'mayor',
  // Outsiders
  'butler',
  'drunk',
  'recluse',
  'saint',
  // Minions
  'poisoner',
  'spy',
  'scarlet_woman',
  'baron',
  // Demon
  'imp',
] as const;

export const GAME_PHASES = ['setup', 'first_night', 'day', 'bedtime', 'night', 'dawn', 'finished'] as const;

export const PROMPT_KINDS = ['choose_players', 'choose_character', 'yes_no', 'acknowledge'] as const;

export const CHARACTER_INFO: Record<CharacterId, CharacterInfo> = {
  washerwoman: { name: 'Washerwoman', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn that one of two players is a particular Townsfolk.' },
  librarian: { name: 'Librarian', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn that one of two players is a particular Outsider (or that there are none).' },
  investigator: { name: 'Investigator', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn that one of two players is a particular Minion.' },
  chef: { name: 'Chef', type: 'townsfolk', alignment: 'good', ability: 'First night: you learn how many pairs of evil players are sitting side by side.' },
  empath: { name: 'Empath', type: 'townsfolk', alignment: 'good', ability: 'Every night: you learn how many of your two closest living neighbours are evil.' },
  fortune_teller: { name: 'Fortune Teller', type: 'townsfolk', alignment: 'good', ability: 'Every night: pick two players and learn whether either is the Demon. One good player wrongly reads as a Demon to you.' },
  undertaker: { name: 'Undertaker', type: 'townsfolk', alignment: 'good', ability: 'Each night after the first: you learn which character was executed that day.' },
  monk: { name: 'Monk', type: 'townsfolk', alignment: 'good', ability: 'Each night after the first: pick another player. The Demon cannot kill them tonight.' },
  ravenkeeper: { name: 'Ravenkeeper', type: 'townsfolk', alignment: 'good', ability: 'If the Demon kills you at night, you wake up and learn the character of one player you pick.' },
  virgin: { name: 'Virgin', type: 'townsfolk', alignment: 'good', ability: 'The first time someone nominates you, if they are a Townsfolk they are executed on the spot.' },
  slayer: { name: 'Slayer', type: 'townsfolk', alignment: 'good', ability: 'Once per game, in daylight, publicly pick a player. If they are the Demon, they die.' },
  soldier: { name: 'Soldier', type: 'townsfolk', alignment: 'good', ability: 'The Demon cannot kill you.' },
  mayor: { name: 'Mayor', type: 'townsfolk', alignment: 'good', ability: 'If three players are alive and nobody is executed today, your team wins. If you would die at night, another player might die in your place.' },
  butler: { name: 'Butler', type: 'outsider', alignment: 'good', ability: 'Each night pick another player as your master. Tomorrow you may only vote if your master votes too.' },
  drunk: { name: 'Drunk', type: 'outsider', alignment: 'good', ability: 'You believe you are a Townsfolk, but your ability never works. You are not told you are the Drunk.' },
  recluse: { name: 'Recluse', type: 'outsider', alignment: 'good', ability: 'You may register as evil, or as a Minion or Demon, even after death.' },
  saint: { name: 'Saint', type: 'outsider', alignment: 'good', ability: 'If you are executed, your team loses.' },
  poisoner: { name: 'Poisoner', type: 'minion', alignment: 'evil', ability: 'Every night pick a player. Their ability fails tonight and through tomorrow.' },
  spy: { name: 'Spy', type: 'minion', alignment: 'evil', ability: 'Every night you look at the Grimoire. You may register as good, or as a Townsfolk or Outsider, even after death.' },
  scarlet_woman: { name: 'Scarlet Woman', type: 'minion', alignment: 'evil', ability: 'If five or more players are alive when the Demon dies, you become the Demon.' },
  baron: { name: 'Baron', type: 'minion', alignment: 'evil', ability: 'Setup gains two extra Outsiders.' },
  imp: { name: 'Imp', type: 'demon', alignment: 'evil', ability: 'Each night after the first pick a player: they die. If you pick yourself, a Minion becomes the Imp.' },
};

// ------------------------------------------------------------------------ storyteller.ts

export const DEFAULT_ST_SETTINGS: StSettings = { doorTags: true, voteSeconds: 3, pamphlets: false };

export const FORCE_PHASES = ['setup', 'first_night', 'day', 'gather', 'bedtime', 'night', 'dawn'] as const;

export const PREPARE_DEALS = ['manual', 'random', 'storyline'] as const;

// ----------------------------------------------------------------------------- social.ts

export const PIN_COLORS = ['gold', 'crimson', 'violet', 'teal', 'green', 'orange', 'white', 'black'] as const;
export const MAX_PINS_PER_MEMBER = 6;
export const EMOTE_POINT_MS = 3500;
export const NICK_FACE_MS = 3000;
export const NICK_FACE_CHARACTER = 'nicksong';
export const EMOTES = ['point', 'nick-face'] as const;

// ------------------------------------------------------------------------------ clock.ts

export const CLOCK_STAGES = ['discussion', 'nominations', 'bedtime'] as const;
export const STORYTELLER_MODES = ['human', 'auto'] as const;
export const AUTO_DEFAULTS = { discussionMin: 5, nominationsMin: 4, bedtimeSec: 45, nightSec: 60 } as const;

// ------------------------------------------------------------------------------ story.ts

export const STORY_ENTRY_KINDS = [
  'setup',
  'phase',
  'night_step',
  'info',
  'nomination',
  'vote',
  'vote_changed',
  'execution',
  'death',
  'revival',
  'ability',
  'role_change',
  'status',
  'visit',
  'storyteller',
  'announcement',
  'result_pending',
  'result_overridden',
  'end',
] as const;

export const PAMPHLET_KINDS = ['day', 'final'] as const;

// --------------------------------------------------------------------------- notebook.ts

export const NOTEBOOK_MAX_BYTES = 20 * 1024;
export const NOTEBOOK_TEXT_MAX = 8000;
export const NOTEBOOK_NOTE_MAX = 160;
export const NOTEBOOK_REV_MAX = 1_000_000_000;
export const NOTEBOOK_MARKS = ['trust', 'unsure', 'distrust'] as const;
export const EMPTY_NOTEBOOK: NotebookData = Object.freeze({ text: '', seats: [] }) as NotebookData;

export function notebookBytes(data: unknown): number {
  return utf8Length(JSON.stringify(data) ?? '');
}

export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

// ---------------------------------------------------------------------------- messages.ts

export const CLOSE_CODES = {
  kicked: 4101,
  replaced: 4102, // same account joined from another device (newest connection wins)
  lobbyClosed: 4103,
  unauthorized: 4104,
} as const;
export const TERMINAL_CLOSE_CODES: readonly number[] = Object.values(CLOSE_CODES);
