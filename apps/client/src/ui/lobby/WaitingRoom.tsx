import type { AccountView } from '@ct/protocol';
import type { RoomConnection } from '../../net/room';

// OWNED BY lobby-auth (stub). Overlay on top of the town while the lobby is waiting:
// members, ready states, ST seat, share URL, start button, lobby chat.
export function WaitingRoom(_props: { conn: RoomConnection; account: AccountView; onLeave: () => void }) {
  return null;
}
