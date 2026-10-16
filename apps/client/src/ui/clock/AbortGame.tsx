// OWNED BY clock-client (v2.1). "Abort game" for the HOST of a running AUTOMATIC game (there is no
// Storyteller to end it). Sends C2S 'lobby:abort' after a clear confirmation; the server records the
// game as abandoned and returns everyone to the waiting room. Renders nothing otherwise.
// Mount (lead): in the in-game Toolbar (GameScreen.tsx), before <SettingsButton>: <AbortGame conn={conn} />
import type { RoomConnection } from '../../net/room';
import { shallowEqual, useStore, useStoreSelector } from '../../net/store';
import { modeOf } from './logic';
import './clock.css';

/** Pure: may this viewer abort? (host, automatic game, game running and not finished) */
export function canAbort(lobby: { lobby: { phase: string }; members: { pid: string; isHost: boolean }[]; youPid: string } | null, game: { phase: string; storytellerMode?: string } | null): boolean {
  if (!lobby || !game || game.phase === 'finished') return false;
  if (modeOf(game) !== 'auto' && modeOf(lobby.lobby) !== 'auto') return false;
  return !!lobby.members.find((m) => m.pid === lobby.youPid)?.isHost;
}

export const ABORT_CONFIRM = 'End this game for everyone? Everybody returns to the waiting room and the game is recorded as abandoned.';

export function AbortGame({ conn }: { conn: RoomConnection }) {
  const lobby = useStore(conn.lobbyView);
  const game = useStoreSelector(conn.gameView, (g) => (g ? { phase: g.phase, storytellerMode: g.storytellerMode } : null), shallowEqual);
  if (!canAbort(lobby, game)) return null;
  return (
    <button
      class="ct-tb-abort"
      title="End this automatic game for everyone (you are the host)"
      aria-label="Abort game"
      onClick={() => {
        if (confirm(ABORT_CONFIRM)) conn.send('lobby:abort', {});
      }}
    >
      <span class="ct-tb-glyph" aria-hidden="true">
        ⏹
      </span>{' '}
      <span class="ct-tb-label">Abort game</span>
    </button>
  );
}
