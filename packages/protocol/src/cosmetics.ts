import { z } from 'zod';

// These enums are the contract between the account/lobby UI, the server, and the generated
// sprite sheets in packages/assets. world-art must generate a layer for every value.

export const SKIN_TONES = ['porcelain', 'fair', 'olive', 'tan', 'brown', 'umber'] as const;
export const HAIR_STYLES = ['bald', 'short', 'long', 'braid', 'bun', 'hood'] as const;
export const HAIR_COLORS = ['black', 'brown', 'auburn', 'blonde', 'grey', 'white'] as const;
export const OUTFITS = ['peasant', 'merchant', 'noble', 'cleric', 'smith', 'scholar'] as const;
export const OUTFIT_PALETTES = ['crimson', 'forest', 'midnight', 'ochre', 'plum', 'slate'] as const;
export const ACCESSORIES = ['none', 'hat', 'lantern', 'scarf', 'spectacles', 'satchel'] as const;
export const GHOST_STYLES = ['wisp', 'shroud', 'lantern', 'pale'] as const;

/**
 * Premade character id (astra-generated sprite sheets in @ct/assets, e.g. 'lamplighter').
 * When set, clients render that preset; the layered fields below are the "advanced
 * customization" fallback and are still stored so switching back is lossless. Ids are validated
 * against the generated preset manifest by the server.
 */
export const PresetId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);

export const Cosmetics = z.object({
  preset: PresetId.nullable().optional(),
  skin: z.enum(SKIN_TONES),
  hair: z.enum(HAIR_STYLES),
  hairColor: z.enum(HAIR_COLORS),
  outfit: z.enum(OUTFITS),
  palette: z.enum(OUTFIT_PALETTES),
  accessory: z.enum(ACCESSORIES),
  ghost: z.enum(GHOST_STYLES),
});
export type Cosmetics = z.infer<typeof Cosmetics>;

export const DEFAULT_COSMETICS: Cosmetics = {
  skin: 'fair',
  hair: 'short',
  hairColor: 'brown',
  outfit: 'peasant',
  palette: 'forest',
  accessory: 'none',
  ghost: 'wisp',
};
