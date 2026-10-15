// Premade villager characters (the default appearance picker; layered cosmetics remain the
// "advanced customization" fallback). Contract: `Cosmetics.preset` holds one of these ids; the
// server validates against CHARACTER_PRESETS; clients render `preset/<id>` (alive) or
// `preset/<id>/ghost` (dead) from the characters atlas. Standalone sheets and portraits are also
// exported as generated/presets/<id>.png, <id>-ghost.png and <id>-portrait.png.
//
// INTERIM ART: until the gpt-6-astra preset jobs run (packages/assets/ai, blocked by the codex
// usage limit on 2026-10-14) each preset's sheet is composed from the existing procedural layers
// listed in `recipe`, and its ghost is derived from that sheet (pale, translucent, fading feet).
// Remastered sheets replace them under the same ids — nothing else changes.
import type { Cosmetics } from '@ct/protocol';

export interface CharacterPreset {
  /** /^[a-z0-9][a-z0-9-]{0,31}$/ */
  id: string;
  name: string;
  blurb: string;
  /** Carries a light (lantern glow is rendered around the character at dusk/night). */
  lantern?: boolean;
  /** Procedural layer recipe for the interim sheet. */
  recipe: Omit<Cosmetics, 'preset' | 'ghost'>;
}

export const CHARACTER_PRESETS: readonly CharacterPreset[] = [
  { id: 'lamplighter', name: 'Lamplighter', blurb: 'Keeps the square’s lamps burning from dusk to dawn.', lantern: true, recipe: { skin: 'tan', hair: 'short', hairColor: 'brown', outfit: 'peasant', palette: 'ochre', accessory: 'lantern' } },
  { id: 'gravedigger', name: 'Gravedigger', blurb: 'Knows every stone in the churchyard by name.', recipe: { skin: 'umber', hair: 'hood', hairColor: 'grey', outfit: 'smith', palette: 'slate', accessory: 'none' } },
  { id: 'baker', name: 'Baker', blurb: 'Up before the bell; smells of rye and woodsmoke.', recipe: { skin: 'fair', hair: 'bun', hairColor: 'blonde', outfit: 'peasant', palette: 'crimson', accessory: 'scarf' } },
  { id: 'herbalist', name: 'Herbalist', blurb: 'Gathers nightshade and feverfew at the forest edge.', recipe: { skin: 'olive', hair: 'braid', hairColor: 'auburn', outfit: 'scholar', palette: 'forest', accessory: 'satchel' } },
  { id: 'bell-ringer', name: 'Bell-Ringer', blurb: 'Climbs the clock tower to toll the hours.', recipe: { skin: 'brown', hair: 'bald', hairColor: 'black', outfit: 'cleric', palette: 'plum', accessory: 'none' } },
  { id: 'blacksmith', name: 'Blacksmith', blurb: 'Soot to the elbows, ears full of anvil-song.', recipe: { skin: 'brown', hair: 'short', hairColor: 'black', outfit: 'smith', palette: 'crimson', accessory: 'none' } },
  { id: 'seamstress', name: 'Seamstress', blurb: 'Notices every loose thread — and every lie.', recipe: { skin: 'porcelain', hair: 'bun', hairColor: 'brown', outfit: 'merchant', palette: 'plum', accessory: 'spectacles' } },
  { id: 'archivist', name: 'Archivist', blurb: 'Keeps the town ledgers and older secrets.', recipe: { skin: 'fair', hair: 'short', hairColor: 'grey', outfit: 'scholar', palette: 'midnight', accessory: 'spectacles' } },
  { id: 'innkeeper', name: 'Innkeeper', blurb: 'Pours the ale and hears every rumour first.', recipe: { skin: 'tan', hair: 'short', hairColor: 'auburn', outfit: 'merchant', palette: 'crimson', accessory: 'satchel' } },
  { id: 'shepherd', name: 'Shepherd', blurb: 'Counts sheep by day and shadows by night.', recipe: { skin: 'olive', hair: 'long', hairColor: 'brown', outfit: 'peasant', palette: 'forest', accessory: 'hat' } },
  { id: 'magistrate', name: 'Magistrate', blurb: 'Presides over every trial with a heavy gavel.', recipe: { skin: 'umber', hair: 'long', hairColor: 'white', outfit: 'noble', palette: 'crimson', accessory: 'hat' } },
  { id: 'miller', name: 'Miller', blurb: 'Dusted in flour, watches the sails turn.', recipe: { skin: 'fair', hair: 'short', hairColor: 'blonde', outfit: 'peasant', palette: 'slate', accessory: 'hat' } },
  { id: 'chaplain', name: 'Chaplain', blurb: 'Lights the chapel candles and keeps the vigil.', recipe: { skin: 'porcelain', hair: 'bald', hairColor: 'grey', outfit: 'cleric', palette: 'slate', accessory: 'spectacles' } },
  { id: 'fisher', name: 'Fisher', blurb: 'Casts nets in the millpond under the moon.', recipe: { skin: 'tan', hair: 'braid', hairColor: 'black', outfit: 'peasant', palette: 'midnight', accessory: 'scarf' } },
  { id: 'tinker', name: 'Tinker', blurb: 'Mends pots, clocks and the occasional alibi.', recipe: { skin: 'brown', hair: 'bun', hairColor: 'grey', outfit: 'smith', palette: 'ochre', accessory: 'satchel' } },
  { id: 'night-watch', name: 'Night Watch', blurb: 'Walks the lanes with a lantern after curfew.', lantern: true, recipe: { skin: 'umber', hair: 'hood', hairColor: 'black', outfit: 'noble', palette: 'slate', accessory: 'lantern' } },
];

export const PRESET_IDS: ReadonlySet<string> = new Set(CHARACTER_PRESETS.map((p) => p.id));
export const presetById = (id: string | null | undefined): CharacterPreset | undefined => (id ? CHARACTER_PRESETS.find((p) => p.id === id) : undefined);
/** Atlas sheet keys of a preset. */
export const presetSheetKey = (id: string, ghost: boolean) => (ghost ? `preset/${id}/ghost` : `preset/${id}`);
