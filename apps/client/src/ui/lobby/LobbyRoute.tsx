// LEAD-OWNED (lazy chunk, v2.2 perf WP3): everything after "join a lobby" — the Colyseus connection
// (colyseus.js + schema + msgpackr), the town screen, HUD, voice, chat and the waiting room. main.tsx
// loads this chunk on demand (prefetched on the home screen). The Storyteller panel is a further
// chunk that only the seated Storyteller ever downloads.
import { useEffect, useRef, useState } from 'preact/hooks';
import { CLOSE_CODES, type AccountView } from '@ct/protocol';
import { ApiFailure } from '../../net/api';
import { CLIENT_CLOSE, RoomConnection } from '../../net/room';
import { useStoreSelector } from '../../net/store';
import { GameScreen } from '../../game/GameScreen';
import { Hud } from '../hud';
import { VoicePanel } from '../voice';
import { ChatPanel } from '../chat';
import { lazyComponent, whenIdle } from '../common/lazy';
import { preloadTownParts } from '../common/lazyTown';
import { navigate } from '../common/route';
import { lobbyErrorCopy, StatusScreen } from '../common/StatusScreen';
import { errorText } from './finder';
import { WaitingRoom } from './WaitingRoom';
import { JoiningLobby } from './JoinPreview'; // (v3 WP6) the join-by-id preview: lobby name + world badge
import { useV3Skin } from '../common/v3skinLobby'; // (v3 WP6) the v3 skin lives as long as the connection
import { ensureLayout, selectLayoutIfLoaded } from '../../net/layout';
import { mayUseV3 } from '../../game3d/select';
import type { WorldId } from '@ct/protocol';
import { syncWorldPath } from '../common/appWorld';

// A tab older than the last deploys may find this chunk gone: say so (the seat is kept) instead of
// silently showing a Storyteller no controls. Reloading restores the seat via the reconnect token.
const StorytellerPanel = lazyComponent(
  () => import('../storyteller').then((m) => m.StorytellerPanel),
  (failed) =>
    failed ? (
      <div class="ct-conn ct-conn-lost" role="alert">
        <span>The Storyteller tools could not be loaded (the town was probably just updated). Your seat is kept.</span>
        <button class="primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    ) : null,
);

/** Start fetching Phaser + the town code now, in parallel with the join (GameScreen imports it too),
 * and the in-town panels' chunk (v2.4: notebook, story, social palette, clock chip, storyline).
 * (v3) The 3D town chunk is fetched once lobby:view says the lobby is a v3 world (useLobbyLayout), not
 * here: a v2 join never downloads three.js. */
const warmTown = () => {
  void import('../../game/TownGame').catch(() => undefined);
  void preloadTownParts();
};

/** A lobby join/close failure: an ApiErrorCode or close reason (see lobbyErrorCopy) + fallback text. */
interface JoinError {
  code: string | undefined;
  message: string;
}

export function LobbyRoute({ id, intent, account }: { id: string; intent: 'player' | 'storyteller'; account: AccountView }) {
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const [error, setError] = useState<JoinError | null>(null);
  useEffect(() => {
    warmTown();
    const c = new RoomConnection(id);
    let alive = true;
    c.connect(intent)
      .then(() => alive && setConn(c))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiFailure) setError({ code: e.body.error, message: e.body.message });
        else if (navigator.onLine === false || e instanceof TypeError) setError({ code: 'connection_lost', message: '' });
        // (a Colyseus join error carries a server message, e.g. "Join ticket rejected (expired)")
        else setError({ code: undefined, message: (e as Error | null)?.message || errorText(e) });
      });
    const offClosed = c.events.on('closed', ({ code }) => {
      const reason =
        code === CLOSE_CODES.signedOut // (v2.3 AUTH-1)
          ? 'signed_out'
          : code === CLOSE_CODES.kicked
          ? 'kicked'
          : code === CLOSE_CODES.replaced
            ? 'replaced'
            : code === CLOSE_CODES.lobbyClosed
              ? 'lobby_closed'
              : code === CLIENT_CLOSE.lobbyGone
                ? 'lobby_gone'
                : 'connection_lost';
      setError({ code: reason, message: '' });
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
  if (error) {
    const copy = lobbyErrorCopy(error.code, error.message || 'Something went wrong. Please try again.');
    const home = { label: 'Back to lobbies', onClick: () => navigate({ name: 'home' }) };
    const retry = { label: 'Try again', onClick: () => location.reload() };
    // Only offer a retry where one can help (not after a kick, a closed lobby or a missing one).
    const actions =
      error.code === 'replaced'
        ? [{ label: 'Play in this tab', primary: true, onClick: () => location.reload() }, home]
        : error.code === 'unauthenticated' || error.code === 'signed_out'
          ? [{ label: 'Sign in again', primary: true, onClick: () => location.reload() }]
          : ['kicked', 'lobby_closed', 'lobby_gone', 'not_found', 'lobby_full', 'lobby_started'].includes(error.code ?? '')
            ? [{ ...home, primary: true }]
            : [{ ...retry, primary: true }, home];
    return <StatusScreen icon={copy.icon} title={copy.title} message={copy.message} actions={actions} />;
  }
  if (!conn) return <JoiningLobby id={id} />;
  return <InLobby id={id} conn={conn} account={account} />;
}

/**
 * (v3 WP0) The lobby's world is known from its first lobby:view: load that world's layout before the town
 * mounts (net/layout.ts: every consumer reads currentLayout() synchronously). v2 is immediate.
 */
function useLobbyLayout(conn: RoomConnection): 'pending' | 'ready' | 'error' {
  const world = useStoreSelector(conn.lobbyView, (l): WorldId | null => (l ? (l.world ?? l.lobby.world ?? 'v2') : null));
  const [state, setState] = useState<'pending' | 'ready' | 'error'>(() => (world && selectLayoutIfLoaded(world) ? 'ready' : 'pending'));
  useEffect(() => {
    if (!world) return;
    // (v3 WP8 URL paths) a join link for the other world (an old v2 share link at /lobby/x, a v3 link under /v2/):
    // the address bar moves to the lobby's own app in place (history.replaceState, no reload; the join goes on).
    // JoiningLobby does it earlier from the public summary when that answers first; this is the authoritative check.
    syncWorldPath(world);
    if (selectLayoutIfLoaded(world)) return setState('ready');
    let alive = true;
    setState('pending');
    if (world === 'v3' && mayUseV3()) void import('../../game3d/TownGame3d').catch(() => undefined); // prefetch
    ensureLayout(world).then(
      () => alive && setState('ready'),
      () => alive && setState('error'),
    );
    return () => {
      alive = false;
    };
  }, [world]);
  return state;
}

function InLobby({ id, conn, account }: { id: string; conn: RoomConnection; account: AccountView }) {
  const layout = useLobbyLayout(conn);
  // (v3 WP6 CONTRACT-REQUEST, lead) one skin ref for the whole connection: a renderer swap / fallback / rejoin
  // never flashes the v2 look (WaitingRoom / SocialPalette keep their own, now harmless, refs)
  useV3Skin(conn);
  if (layout === 'error')
    return (
      <StatusScreen
        icon="⚠"
        title="This town could not be loaded"
        message="The lobby uses a town this page cannot load (the server may have just been updated). Your seat is kept."
        actions={[
          { label: 'Try again', primary: true, onClick: () => location.reload() },
          { label: 'Back to lobbies', onClick: () => navigate({ name: 'home' }) },
        ]}
      />
    );
  if (layout !== 'ready') return <JoiningLobby id={id} />;
  return <InLobbyTown conn={conn} account={account} />;
}

function InLobbyTown({ conn, account }: { conn: RoomConnection; account: AccountView }) {
  // (selectors: this shell re-renders only when the waiting sheet comes or goes, not on every view)
  const hasGame = useStoreSelector(conn.gameView, (g) => !!g);
  const lobbyWaiting = useStoreSelector(conn.lobbyView, (l) => !l || l.lobby.phase === 'waiting');
  const waiting = !hasGame && lobbyWaiting;
  // Tab title: which lobby this tab is in; while the tab is in the background, it also tells a
  // player who wandered off during the wait that the game has started.
  const lobbyName = useStoreSelector(conn.lobbyView, (l) => l?.lobby.name ?? null);
  const [startedUnseen, setStartedUnseen] = useState(false);
  const wasWaiting = useRef(waiting);
  useEffect(() => {
    if (wasWaiting.current && !waiting && document.visibilityState === 'hidden') setStartedUnseen(true);
    wasWaiting.current = waiting;
  }, [waiting]);
  useEffect(() => {
    if (!startedUnseen) return;
    const seen = () => document.visibilityState === 'visible' && setStartedUnseen(false);
    document.addEventListener('visibilitychange', seen);
    return () => document.removeEventListener('visibilitychange', seen);
  }, [startedUnseen]);
  useEffect(() => {
    if (!lobbyName) return;
    const before = document.title;
    document.title = `${startedUnseen ? '● The game has begun · ' : ''}${lobbyName} · Clocktower Town`;
    return () => {
      document.title = before;
    };
  }, [lobbyName, startedUnseen]);
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
