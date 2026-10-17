// Role icons: one 32×32 plaque per character (generated/roles/<id>.png, read by the client's
// RoleIcon). Original art: a chamfered iron plaque (the same octagon as RoleIcon's CSS fallback),
// a ring in the team colour, and a hand-drawn emblem (./motifs.ts) chosen from the character's idea.
// Deterministic: no randomness beyond the positional dither.
import { CHARACTER_IDS, CHARACTER_INFO, type CharacterId, type CharacterType } from '@ct/protocol';
import { col, dpick, Img, mix, type Color, type RGBA } from '../lib/img.js';
import { MOTIFS } from './motifs.js';

export const ROLE_ICON_SIZE = 32;

/** Emblem + colours per character: [motif, main colour, accent colour]. */
export const ROLE_ART: Record<CharacterId, readonly [motif: string, main: string, accent: string]> = {
  // ---------------------------------------------------------------- Trouble Brewing
  washerwoman: ['shirt', '#d8cfb8', '#7fa8d8'],
  librarian: ['book', '#6a3a2a', '#d5b56a'],
  investigator: ['magnifier', '#8a6a48', '#9fc4d8'],
  chef: ['pot', '#7a7a86', '#e08a3a'],
  empath: ['heart', '#c8504a', '#f0a0a0'],
  fortune_teller: ['crystalball', '#6a8ac8', '#d8b8f0'],
  undertaker: ['shovel', '#8a8a96', '#6a4a2a'],
  monk: ['hood', '#8a6a3a', '#d5b56a'],
  ravenkeeper: ['raven', '#4a4466', '#d5b56a'],
  virgin: ['lily', '#f3ead2', '#5a8a4a'],
  slayer: ['crossbow', '#6a4a2a', '#8a6a48'],
  soldier: ['shield', '#4a6a9a', '#d5b56a'],
  mayor: ['tophat', '#4a4466', '#9a3a3a'],
  butler: ['bell', '#d5b56a', '#6a5a3a'],
  drunk: ['bottle', '#4a7a4a', '#c8504a'],
  recluse: ['lantern', '#5a5a66', '#e0b050'],
  saint: ['halo', '#8a8ac0', '#d5b56a'],
  poisoner: ['flask', '#5aa04a', '#2a5a2a'],
  spy: ['eye', '#5a3a5a', '#7a9a5a'],
  scarlet_woman: ['mask', '#b8322a', '#e08080'],
  baron: ['coronet', '#d5b56a', '#9a2a3a'],
  imp: ['horns', '#a8302a', '#e0d0b0'],
  // ---------------------------------------------------------------- Bad Moon Rising
  grandmother: ['yarn', '#b06a8a', '#8a8a96'],
  sailor: ['anchor', '#4a6a9a', '#d5b56a'],
  chambermaid: ['candle', '#e8dcc0', '#f0b040'],
  exorcist: ['cross', '#c8c0e0', '#e08a3a'],
  innkeeper: ['mug', '#8a5a2a', '#f3ead2'],
  gambler: ['dice', '#9a2a2a', '#f3ead2'],
  gossip: ['speech', '#6a8ac8', '#f3ead2'],
  courtier: ['goblet', '#8a6aa8', '#9a2a4a'],
  professor: ['mortarboard', '#5a5478', '#d5b56a'],
  minstrel: ['note', '#6a8ac8', '#d5b56a'],
  tea_lady: ['teacup', '#7aa88a', '#c8504a'],
  pacifist: ['dove', '#e8e4d8', '#5a8a4a'],
  fool: ['jester', '#c8a03a', '#7a3a9a'],
  tinker: ['gear', '#9a8a6a', '#6a5a3a'],
  moonchild: ['moon', '#c8c0e0', '#d5b56a'],
  goon: ['fist', '#a0705a', '#8a8a96'],
  lunatic: ['spiral', '#8a6ac8', '#e0d050'],
  godfather: ['signet', '#2a2638', '#9a2a2a'],
  devils_advocate: ['scales', '#9a2a2a', '#c8504a'],
  assassin: ['dagger', '#3a3450', '#4a3a2a'],
  mastermind: ['chess', '#5a2a3a', '#d5b56a'],
  zombuul: ['skull', '#9ab07a', '#c8504a'],
  pukka: ['snake', '#5a8a3a', '#c8b040'],
  shabaloth: ['maw', '#7a2a3a', '#c8504a'],
  po: ['flame', '#e0a040', '#b8322a'],
  // ---------------------------------------------------------------- Sects & Violets
  clockmaker: ['clock', '#d5b56a', '#d5b56a'],
  dreamer: ['cloud', '#8a8ac8', '#e0d070'],
  snake_charmer: ['flute', '#8a6a3a', '#4a9a6a'],
  mathematician: ['abacus', '#6a4a2a', '#c8504a'],
  flowergirl: ['bouquet', '#5a8a4a', '#d870a0'],
  town_crier: ['horn', '#d5b56a', '#8a3a3a'],
  oracle: ['eye', '#4a6a9a', '#a070d0'],
  savant: ['scroll', '#e8dcc0', '#9a2a2a'],
  seamstress: ['needle', '#9a9aa8', '#c8504a'],
  philosopher: ['owl', '#8a6a48', '#d5b56a'],
  artist: ['palette', '#b08a5a', '#4a8ac8'],
  juggler: ['juggle', '#8a3a9a', '#4a9ad8'],
  sage: ['leaf', '#5a9a4a', '#3a6a2a'],
  mutant: ['drop', '#6ab04a', '#c8e070'],
  sweetheart: ['heart', '#e070a0', '#ffd0e0'],
  barber: ['scissors', '#9a9aa8', '#c8504a'],
  klutz: ['boot', '#8a5a3a', '#c8504a'],
  evil_twin: ['mirror', '#7a3a4a', '#d5b56a'],
  witch: ['witchhat', '#3a2a50', '#7a5ac8'],
  cerenovus: ['brain', '#d08aa0', '#9a3a5a'],
  pit_hag: ['cauldron', '#3a3a46', '#7ac84a'],
  fang_gu: ['fang', '#6a2a3a', '#c8504a'],
  vigormortis: ['hand', '#e8e0c8', '#8a8a96'],
  no_dashii: ['tentacle', '#4a7a6a', '#a0e0c0'],
  vortox: ['spiral', '#a8302a', '#e0a040'],
  // ---------------------------------------------------------------- Travellers
  scapegoat: ['goat', '#a08a6a', '#3a3450'],
  gunslinger: ['pistol', '#8a8a96', '#6a4a2a'],
  beggar: ['bowl', '#8a6a48', '#d5b56a'],
  bureaucrat: ['stamp', '#6a4a2a', '#b8322a'],
  thief: ['sack', '#7a6a4a', '#d5b56a'],
  apprentice: ['hammer', '#8a8a96', '#8a5a2a'],
  matron: ['key', '#d5b56a', '#d5b56a'],
  judge: ['gavel', '#6a3a2a', '#8a5a2a'],
  bishop: ['mitre', '#e8dcc0', '#9a2a3a'],
  voudon: ['doll', '#a08a6a', '#3a3450'],
  barista: ['mug', '#5a3a2a', '#e8dcc0'],
  harlot: ['fan', '#b8322a', '#d5b56a'],
  butcher: ['cleaver', '#8a8a96', '#6a4a2a'],
  bone_collector: ['bone', '#e8e0c8', '#e8e0c8'],
  deviant: ['grin', '#c8a03a', '#7a3a9a'],
  // ---------------------------------------------------------------- Fabled
  doomsayer: ['hourglass', '#d5b56a', '#e0c070'],
  angel: ['wings', '#d5b56a', '#f3ead2'],
  buddhist: ['lotus', '#e0a0b0', '#5a8a7a'],
  hells_librarian: ['book', '#7a2a2a', '#e0a040'],
  revolutionary: ['flag', '#b8322a', '#b8322a'],
  fiddler: ['violin', '#8a4a2a', '#9a9aa8'],
  toymaker: ['top', '#c8504a', '#4a8ac8'],
  fibbin: ['quill', '#e8dcc0', '#3a3450'],
  duchess: ['coronet', '#d8a0c0', '#4a8ac8'],
  sentinel: ['tower', '#7a7a86', '#e0b050'],
  spirit_of_ivory: ['ghost', '#e8e4d8', '#e8e4d8'],
  djinn: ['genielamp', '#d5b56a', '#8ac8e0'],
  // ---------------------------------------------------------------- Homebrew
  wizard: ['staff', '#6a4a2a', '#8ac8f0'],
  plague_doctor: ['beak', '#7a7088', '#c8a03a'],
};

/** Ring colours by type (good = teal family, evil = wine family; matches RoleIcon.css). */
const RING: Record<CharacterType, readonly [Color, Color]> = {
  townsfolk: ['#41676a', '#6a9a9a'],
  outsider: ['#4f6a8a', '#7a98b8'],
  minion: ['#814953', '#b06a74'],
  demon: ['#9a2a2a', '#d0504a'],
  traveller: ['#41676a', '#814953'], // half good, half evil: alignment is decided per game
  fabled: ['#a8863a', '#e0c070'],
};

const INK = '#1a1420';
const IVORY = '#f3ead2';
const STEEL = '#8a8a96';
const BLOOD = '#b8322a';
const BRASS = '#d5b56a';
const OUTER = '#0b0714';
const IRON = '#454250';
const IRON_HI = '#626979';
const FIELD = ['#17151f', '#1f1c2a', '#2a2736'] as const;

/** Inside the chamfered octagon (corner cut `c`) of an n×n square, inset by `i`. */
function inOctagon(x: number, y: number, n: number, i: number, c: number): boolean {
  const lo = i;
  const hi = n - 1 - i;
  if (x < lo || y < lo || x > hi || y > hi) return false;
  const cc = Math.max(0, c - i);
  const dx = Math.min(x - lo, hi - x);
  const dy = Math.min(y - lo, hi - y);
  return dx + dy >= cc;
}

export function drawPlaque(type: CharacterType): Img {
  const n = ROLE_ICON_SIZE;
  const img = new Img(n, n);
  const [ringA, ringB] = RING[type];
  const corner = 7;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!inOctagon(x, y, n, 0, corner)) continue;
      if (!inOctagon(x, y, n, 1, corner)) img.set(x, y, OUTER);
      else if (!inOctagon(x, y, n, 3, corner)) img.set(x, y, x + y < n - 2 ? IRON_HI : IRON);
      else if (!inOctagon(x, y, n, 5, corner)) {
        // team ring; travellers split down the middle
        const base = type === 'traveller' ? (x < n / 2 ? ringA : ringB) : ringA;
        const lit = inOctagon(x, y, n, 4, corner) ? mix(base, IVORY, 0.12) : col(base);
        img.set(x, y, x + y < n - 2 ? mix(lit, type === 'traveller' ? lit : ringB, 0.35) : lit);
      } else if (!inOctagon(x, y, n, 6, corner)) img.set(x, y, OUTER);
      else {
        // dark field, a little lighter towards the upper middle
        const nx = (x - n / 2) / (n / 2);
        const ny = (y - n / 2.4) / (n / 2);
        img.set(x, y, dpick(FIELD, 1 - Math.min(1, Math.sqrt(nx * nx + ny * ny)), x, y));
      }
    }
  return img;
}

/** Map an emblem character to a colour for the given main/accent colours. */
function swatch(ch: string, main: Color, accent: Color): RGBA | null {
  switch (ch) {
    case '#':
      return col(main);
    case '+':
      return mix(main, '#fff1cc', 0.32);
    case '-':
      return mix(main, '#160d2a', 0.42);
    case 'o':
      return col(accent);
    case '*':
      return mix(accent, '#fff1cc', 0.35);
    case 'w':
      return col(IVORY);
    case 'k':
      return col(INK);
    case 'g':
      return col(STEEL);
    case 'r':
      return col(BLOOD);
    case 'y':
      return col(BRASS);
    default:
      return null;
  }
}

/** The emblem as its own image (outlined), cropped to its pixels. */
export function drawEmblem(motif: string, main: Color, accent: Color): Img {
  const rows = MOTIFS[motif];
  if (!rows) throw new Error(`unknown role motif '${motif}'`);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const img = new Img(w + 2, h + 2);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = swatch(row[x]!, main, accent);
      if (c) img.set(x + 1, y + 1, c);
    }
  });
  img.outline({ color: OUTER });
  return img;
}

/** Crop to the opaque bounding box. */
function crop(img: Img): Img {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.alpha(x, y) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return new Img(1, 1);
  const out = new Img(x1 - x0 + 1, y1 - y0 + 1);
  out.copy(img, 0, 0, x0, y0, out.w, out.h);
  return out;
}

export function drawRoleIcon(id: CharacterId): Img {
  const [motif, main, accent] = ROLE_ART[id];
  const plaque = drawPlaque(CHARACTER_INFO[id].type);
  const emblem = crop(drawEmblem(motif, main, accent));
  const n = ROLE_ICON_SIZE;
  // centre in the field (the field is 6..25; the emblem may overlap the ring slightly at most)
  const dx = Math.round((n - emblem.w) / 2);
  const dy = Math.round((n - emblem.h) / 2);
  plaque.blit(emblem, dx, dy);
  return plaque;
}

/** Every character's icon, in catalogue order. */
export function drawRoleIcons(): { id: CharacterId; img: Img }[] {
  return CHARACTER_IDS.map((id) => ({ id, img: drawRoleIcon(id) }));
}
