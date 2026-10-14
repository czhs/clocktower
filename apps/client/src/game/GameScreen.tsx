import type { ComponentChildren } from 'preact';
import type { AccountView } from '@ct/protocol';
import type { RoomConnection } from '../net/room';

// OWNED BY world-art (stub). Mounts the Phaser town for this lobby; renders `children`
// (HUD, Storyteller panel, voice panel, chat — composed by main.tsx) above the canvas.
export function GameScreen(props: { conn: RoomConnection; account: AccountView; children?: ComponentChildren }) {
  return <div class="town-placeholder">{props.children}</div>;
}
