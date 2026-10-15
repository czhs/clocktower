// Premade villager characters (the default appearance picker; layered cosmetics remain the
// "advanced customization" fallback). Contract: `Cosmetics.preset` holds one of these ids; the
// server validates against CHARACTER_PRESETS; clients render `preset/<id>` (alive) or
// `preset/<id>/ghost` (dead) from the characters atlas. Standalone sheets and portraits are also
// exported as generated/presets/<id>.png, <id>-ghost.png and <id>-portrait.png.
//
// Art: bold creature folk designed by gpt-6-astra (packages/assets/ai, jobs `bold-*`). Without an
// AI sheet a preset falls back to an interim composite of the procedural layers in `recipe`; its
// ghost is always derived from the final sheet (scripts/presets.ts ghostOf).
import type { Cosmetics } from '@ct/protocol';

export interface CharacterPreset {
  /** /^[a-z0-9][a-z0-9-]{0,31}$/ */
  id: string;
  name: string;
  blurb: string;
  /** Carries a light (lantern glow is rendered around the character at dusk/night). */
  lantern?: boolean;
  /** Art brief for the character (used by the AI design jobs). */
  look: string;
  /** Procedural layer recipe of the interim sheet (also the frame grid/anchor source for the AI jobs). */
  recipe: Omit<Cosmetics, 'preset' | 'ghost'>;
}

export const CHARACTER_PRESETS: readonly CharacterPreset[] = [
  { id: 'lantern-wanderer', name: 'Lantern Wanderer', blurb: 'A cloaked traveller whose head is a softly glowing lantern.', lantern: true, look: 'a tall cloaked wanderer whose head is a glowing iron lantern (warm flame inside), long dark cloak, walking staff', recipe: { skin: 'tan', hair: 'short', hairColor: 'brown', outfit: 'peasant', palette: 'ochre', accessory: 'lantern' } },
  { id: 'mushroom-priest', name: 'Mushroom Priest', blurb: 'A round red-capped mushroom in a tiny cassock, swinging a censer.', look: 'a round mushroom person with a big red spotted cap, small white cassock body, tiny censer on a chain', recipe: { skin: 'umber', hair: 'hood', hairColor: 'grey', outfit: 'smith', palette: 'slate', accessory: 'none' } },
  { id: 'skeleton-baker', name: 'Skeleton Baker', blurb: 'A cheerful skeleton in an apron and a floppy chef hat, loaf in hand.', look: 'a cheerful chunky skeleton with a big round skull, floppy white chef hat, flour-dusted apron, holding a loaf of bread', recipe: { skin: 'fair', hair: 'bun', hairColor: 'blonde', outfit: 'peasant', palette: 'crimson', accessory: 'scarf' } },
  { id: 'frog-knight', name: 'Frog Knight', blurb: 'A small green frog in dented armour with a leaf shield.', look: 'a small round green frog in dented steel armour with a big leaf shield and a tiny sword, wide frog mouth', recipe: { skin: 'olive', hair: 'braid', hairColor: 'auburn', outfit: 'scholar', palette: 'forest', accessory: 'satchel' } },
  { id: 'hooded-bean', name: 'Hooded Bean', blurb: 'A shy bean-shaped figure in a plum hood with two big eyes.', look: 'a shy bean-shaped figure fully wrapped in a plum hood and cloak, only two big white eyes visible, stubby feet', recipe: { skin: 'brown', hair: 'bald', hairColor: 'black', outfit: 'cleric', palette: 'plum', accessory: 'none' } },
  { id: 'moth-lamplighter', name: 'Moth Lamplighter', blurb: 'A fuzzy moth with feathery antennae who lights the square every dusk.', lantern: true, look: "a fuzzy cream-and-grey moth person with big feathery antennae and folded wings like a cape, carrying a lamplighter's pole with a small flame", recipe: { skin: 'brown', hair: 'short', hairColor: 'black', outfit: 'smith', palette: 'crimson', accessory: 'none' } },
  { id: 'owl-archivist', name: 'Owl Archivist', blurb: 'A round owl in spectacles, never without a scroll.', look: 'a round brown owl with big spectacles, ear tufts and a rolled scroll under one wing', recipe: { skin: 'porcelain', hair: 'bun', hairColor: 'brown', outfit: 'merchant', palette: 'plum', accessory: 'spectacles' } },
  { id: 'crow-gravedigger', name: 'Crow Gravedigger', blurb: 'A tall crow in a long coat, shovel over the shoulder.', look: 'a tall black crow person with a long grey coat and a spade over the shoulder, sharp beak', recipe: { skin: 'fair', hair: 'short', hairColor: 'grey', outfit: 'scholar', palette: 'midnight', accessory: 'spectacles' } },
  { id: 'cat-innkeeper', name: 'Cat Innkeeper', blurb: 'A chubby ginger cat in an apron, tankard always ready.', look: 'a chubby ginger cat with a striped tail, white apron and a foaming tankard', recipe: { skin: 'tan', hair: 'short', hairColor: 'auburn', outfit: 'merchant', palette: 'crimson', accessory: 'satchel' } },
  { id: 'snail-tinker', name: 'Snail Tinker', blurb: 'A snail whose shell is a backpack of gears and pots.', look: 'a friendly snail person whose spiral shell is a rattling backpack of gears, pots and tools, small goggles', recipe: { skin: 'olive', hair: 'long', hairColor: 'brown', outfit: 'peasant', palette: 'forest', accessory: 'hat' } },
  { id: 'toad-miller', name: 'Toad Miller', blurb: 'A flour-dusted toad hauling a sack of grain.', look: 'a squat warty toad dusted with flour, wide straw hat, hauling a sack of grain', recipe: { skin: 'umber', hair: 'long', hairColor: 'white', outfit: 'noble', palette: 'crimson', accessory: 'hat' } },
  { id: 'bat-bellringer', name: 'Bat Bellringer', blurb: 'A small bat with folded wings and a tiny brass hand bell.', look: 'a small round bat person with big ears, wings folded like a cloak, ringing a tiny brass hand bell', recipe: { skin: 'fair', hair: 'short', hairColor: 'blonde', outfit: 'peasant', palette: 'slate', accessory: 'hat' } },
  { id: 'mole-blacksmith', name: 'Mole Blacksmith', blurb: 'A burly mole with goggles, leather apron and hammer.', look: 'a burly dark velvet mole with brass goggles on its forehead, pink nose, heavy leather apron and a hammer', recipe: { skin: 'porcelain', hair: 'bald', hairColor: 'grey', outfit: 'cleric', palette: 'slate', accessory: 'spectacles' } },
  { id: 'rabbit-herbalist', name: 'Rabbit Herbalist', blurb: 'A rabbit with a flower crown and a satchel of herbs.', look: 'a white rabbit with long ears, a flower crown, green shawl and a satchel overflowing with herbs', recipe: { skin: 'tan', hair: 'braid', hairColor: 'black', outfit: 'peasant', palette: 'midnight', accessory: 'scarf' } },
  { id: 'fox-seamstress', name: 'Fox Seamstress', blurb: 'A fox with a tape-measure scarf and a big needle.', look: 'an orange fox with a tape-measure scarf, pincushion wristband and a big needle like a rapier, bushy tail', recipe: { skin: 'brown', hair: 'bun', hairColor: 'grey', outfit: 'smith', palette: 'ochre', accessory: 'satchel' } },
  { id: 'goat-magistrate', name: 'Goat Magistrate', blurb: 'A goat in a judge’s robe with curled horns and a gavel.', look: "an old goat with curled horns, white beard, black judge's robe with a white collar, holding a gavel", recipe: { skin: 'umber', hair: 'hood', hairColor: 'black', outfit: 'noble', palette: 'slate', accessory: 'lantern' } },
];

export const PRESET_IDS: ReadonlySet<string> = new Set(CHARACTER_PRESETS.map((p) => p.id));
export const presetById = (id: string | null | undefined): CharacterPreset | undefined => (id ? CHARACTER_PRESETS.find((p) => p.id === id) : undefined);
/** Atlas sheet keys of a preset. */
export const presetSheetKey = (id: string, ghost: boolean) => (ghost ? `preset/${id}/ghost` : `preset/${id}`);
