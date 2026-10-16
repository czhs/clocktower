// LEAD-OWNED (lazy chunk, v2.2 perf WP3): everything after "join a lobby" — the Colyseus connection
// (colyseus.js + schema + msgpackr), the town screen, HUD, voice, chat and the waiting room. main.tsx
// loads this chunk on demand (prefetched on the home screen). The Storyteller panel is a further
// chunk that only the seated Storyteller ever downloads.
import { useEffect, useState } from 'preact/hooks';
import { CLOSE_CODES, type AccountView } from '@ct/protocol';
import { ApiFailure } from '../../net/api';
import { CLIENT_CLOSE, RoomConnection } from '../../net/room';
import { useStoreSelector } from '../../net/store';
import { GameScreen } from '../../game/GameScreen';
import { Hud } from '../hud';
import { VoicePanel } from '../voice';
import { ChatPanel } from '../chat';
import { lazyComponent, whenIdle } from '../common/lazy';
import { navigate } from '../common/route';
import { WaitingRoom } from './WaitingRoom';

const StorytellerPanel = lazyComponent(() => import('../storyteller').then((m) => m.StorytellerPanel));

/** Start fetching Phaser + the town code now, in parallel with the join (GameScreen imports it too). */
const warmTown = () => void import('../../game/TownGame').catch(() => undefined);

export function LobbyRoute({ id, intent, account }: { id: string; intent: 'player' | 'storyteller'; account: AccountView }) {
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    warmTown();
    const c = new RoomConnection(id);
    let alive = true;
    c.connect(intent)
      .then(() => alive && setConn(c))
      .catch((e: unknown) => alive && setError(e instanceof ApiFailure ? e.body.message : String((e as Error)?.message ?? e)));
    const offClosed = c.events.on('closed', ({ code }) => {
      if (code === CLOSE_CODES.kicked) setError('You were removed from this lobby.');
      else if (code === CLOSE_CODES.replaced) setError('This account joined the lobby from another tab or device.');
      else if (code === CLOSE_CODES.lobbyClosed) setError('This lobby was closed.');
      else if (code === CLIENT_CLOSE.lobbyGone)
        setError('This lobby no longer exists. The server may have restarted; any game in progress could not be recovered. Your account and stats are safe.');
      else setError('Lost connection to the lobby and could not reconnect. Check your internet connection, then try again.');
    });
    return () => {
      alive = false;
      offClosed();
      void c.leave();
    };
    // Only the lobby id identifies the connection: an intent change for the same lobby (e.g. the
    // route re-parsed on popstate) must not tear down and re-join (two sockets for one account).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (error)
    return (
      <div class="screen center">
        <div class="panel">
          <p>{error}</p>
          <button class="primary" onClick={() => navigate({ name: 'home' })}>Back to lobbies</button>{' '}
          <button onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    );
  if (!conn) return <div class="screen center">Joining lobby…</div>;
  return <InLobby conn={conn} account={account} />;
}

function InLobby({ conn, account }: { conn: RoomConnection; account: AccountView }) {
  // (selectors: this shell re-renders only when the waiting sheet comes or goes, not on every view)
  const hasGame = useStoreSelector(conn.gameView, (g) => !!g);
  const lobbyWaiting = useStoreSelector(conn.lobbyView, (l) => !l || l.lobby.phase === 'waiting');
  const waiting = !hasGame && lobbyWaiting;
  return (
    <div class="screen">
      <GameScreen conn={conn} account={account}>
        <Hud conn={conn} account={account} />
        <StorytellerSlot conn={conn} account={account} />
        <VoicePanel conn={conn} account={account} />
        <ChatPanel conn={conn} account={account} />
      </GameScreen>
      {waiting && <WaitingRoom conn={conn} account={account} onLeave={() => navigate({ name: 'home' })} />}
    </div>
  );
}

/** The Storyteller panel renders only for a StorytellerGameView; its chunk is fetched (on idle) as
 * soon as this member holds the Storyteller seat, so it is warm when the game starts. */
function StorytellerSlot({ conn, account }: { conn: RoomConnection; account: AccountView }) {
  const isSt = useStoreSelector(conn.gameView, (g) => g?.kind === 'storyteller');
  const stSeat = useStoreSelector(conn.lobbyView, (l) => !!l && l.members.some((m) => m.pid === l.youPid && m.role === 'storyteller'));
  useEffect(() => {
    if (stSeat || isSt) return whenIdle(() => void StorytellerPanel.preload());
  }, [stSeat, isSt]);
  return isSt ? <StorytellerPanel conn={conn} account={account} /> : null;
}
