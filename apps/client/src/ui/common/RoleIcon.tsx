// Role icon by CharacterId (assets/art lead). Renders the original pixel-art plaque from
// packages/assets/generated/roles/<id>.png (gpt-6-astra art, post-processed on hshi-u1; 32x32 native)
// with nearest-neighbour scaling. Until an icon exists it falls back to a CSS plaque with the
// role's initial and the team ring colour, so it is always safe to render.
//
//   <RoleIcon id="empath" />                 32 px (native)
//   <RoleIcon id="imp" size={64} />          2x — use multiples of 32 for crisp pixels
//   <RoleIcon id={null} />                   unknown role ("?")
//   <RoleIcon id="spy" label={false} />      decorative (aria-hidden); default has role="img" + name
import { CHARACTER_INFO, type CharacterId } from '@ct/protocol';
import './RoleIcon.css';

const ICONS = import.meta.glob('../../../../../packages/assets/generated/roles/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urlFor = (id: string): string | undefined => ICONS[`../../../../../packages/assets/generated/roles/${id}.png`];

export function RoleIcon(props: { id: CharacterId | 'unknown' | null | undefined; size?: number; label?: boolean; class?: string }) {
  const id = props.id ?? 'unknown';
  const size = props.size ?? 32;
  const info = id === 'unknown' ? null : CHARACTER_INFO[id];
  const name = info?.name ?? 'Unknown character';
  const team = info ? (info.alignment === 'evil' ? 'evil' : 'good') : 'unknown';
  const url = urlFor(id);
  const hidden = props.label === false;
  const cls = `ct-role-icon ct-role-icon--${team}${props.class ? ` ${props.class}` : ''}`;
  if (url)
    return (
      <span class={cls} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden={hidden ? true : undefined} role={hidden ? undefined : 'img'} aria-label={hidden ? undefined : name} title={hidden ? undefined : name}>
        <img src={url} width={size} height={size} alt="" draggable={false} />
      </span>
    );
  return (
    <span
      class={`${cls} ct-role-icon--fallback`}
      style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.5)}px` }}
      aria-hidden={hidden ? true : undefined}
      role={hidden ? undefined : 'img'}
      aria-label={hidden ? undefined : name}
      title={hidden ? undefined : name}
    >
      {info ? info.name[0] : '?'}
    </span>
  );
}
