import {
  ACCESSORIES,
  GHOST_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_PALETTES,
  OUTFITS,
  SKIN_TONES,
  type Cosmetics,
} from '@ct/protocol';

// Cosmetic editor. world-art's sprite-based CosmeticPreview (apps/client/src/game/CosmeticPreview.tsx)
// did not exist when this was written; `SwatchPreview` is a lightweight stand-in. To switch,
// replace the <SwatchPreview> usage below with <CosmeticPreview cosmetics={value} />.

const SKIN: Record<Cosmetics['skin'], string> = {
  porcelain: '#f3dccb',
  fair: '#e8c4a2',
  olive: '#c69c6d',
  tan: '#b07d4f',
  brown: '#7d5232',
  umber: '#4e3220',
};
const HAIR: Record<Cosmetics['hairColor'], string> = {
  black: '#1b1716',
  brown: '#5a3a22',
  auburn: '#8a3b1f',
  blonde: '#d8b45e',
  grey: '#8e8c88',
  white: '#e8e4dc',
};
const PALETTE: Record<Cosmetics['palette'], string> = {
  crimson: '#8f2430',
  forest: '#2f5a35',
  midnight: '#26305c',
  ochre: '#a7782a',
  plum: '#5d2f5a',
  slate: '#4d5866',
};

const FIELDS: { key: keyof Cosmetics; label: string; options: readonly string[] }[] = [
  { key: 'skin', label: 'Skin', options: SKIN_TONES },
  { key: 'hair', label: 'Hair', options: HAIR_STYLES },
  { key: 'hairColor', label: 'Hair colour', options: HAIR_COLORS },
  { key: 'outfit', label: 'Outfit', options: OUTFITS },
  { key: 'palette', label: 'Palette', options: OUTFIT_PALETTES },
  { key: 'accessory', label: 'Accessory', options: ACCESSORIES },
  { key: 'ghost', label: 'Ghost', options: GHOST_STYLES },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SwatchPreview({ value }: { value: Cosmetics }) {
  const hairShown = value.hair !== 'bald';
  return (
    <div class="ct-swatch" aria-label="Appearance preview" role="img">
      <div class="ct-swatch-figure">
        {hairShown && <div class={`ct-swatch-hair ct-hair-${value.hair}`} style={{ background: HAIR[value.hairColor] }} />}
        <div class="ct-swatch-head" style={{ background: SKIN[value.skin] }} />
        <div class="ct-swatch-body" style={{ background: PALETTE[value.palette] }} />
      </div>
      <div class="ct-swatch-caption">
        {cap(value.outfit)}
        {value.accessory !== 'none' ? ` · ${value.accessory}` : ''}
        <br />
        <span class="muted">ghost: {value.ghost}</span>
      </div>
    </div>
  );
}

export function CosmeticEditor({
  value,
  onChange,
  disabled,
}: {
  value: Cosmetics;
  onChange: (c: Cosmetics) => void;
  disabled?: boolean;
}) {
  return (
    <div class="ct-cosmetics">
      <SwatchPreview value={value} />
      <div class="ct-cosmetics-fields">
        {FIELDS.map((f) => (
          <label key={f.key} class="ct-field-inline">
            <span>{f.label}</span>
            <select
              value={value[f.key]}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, [f.key]: (e.currentTarget as HTMLSelectElement).value } as Cosmetics)}
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {cap(o)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
