// OWNED BY lobby-auth (playtest phase). Server-side validation of Cosmetics.preset against the
// generated preset manifest in @ct/assets. null/undefined (= layered customization, and every
// account stored before presets existed) is always valid.
import { PRESET_IDS } from '@ct/assets';

export function isAllowedPreset(preset: string | null | undefined): boolean {
  return preset === null || preset === undefined || PRESET_IDS.has(preset);
}
