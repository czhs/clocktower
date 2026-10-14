import type { AccountView } from '@ct/protocol';
import type { RoomConnection } from '../net/room';

// OWNED BY world-art (stub). Mounts the Phaser town for this lobby and the overlay slots:
//   <Hud/> (ui/hud, rules-storyteller), <StorytellerPanel/> (ui/storyteller, rules-storyteller),
//   <VoicePanel/> (ui/voice, voice), chat.
export function GameScreen(_props: { conn: RoomConnection; account: AccountView }) {
  return <div class="town-placeholder" />;
}
