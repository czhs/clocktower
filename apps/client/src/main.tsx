import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { CLOSE_CODES, type AccountView } from '@ct/protocol';
import { api, ApiFailure } from './net/api';
import { CLIENT_CLOSE, RoomConnection } from './net/room';
import { useStore } from './net/store';
import { AuthScreen } from './ui/auth/AuthScreen';
import { HomeScreen } from './ui/lobby/HomeScreen';
import { WaitingRoom } from './ui/lobby/WaitingRoom';
import { GameScreen } from './game/GameScreen';
import { AdminScreen } from './ui/admin/AdminScreen';
import { Hud } from './ui/hud';
import { StorytellerPanel } from './ui/storyteller';
import { VoicePanel } from './ui/voice';
import { ChatPanel } from './ui/chat';
import './ui/common/theme.css';

// LEAD-OWNED shell: session bootstrap + tiny path router.
//   /               account home + lobby finder (or auth when signed out)
//   /lobby/:id      join/restore that lobby; town is rendered behind the waiting-room overlay
//   /admin          admin status (server enforces ADMIN_ACCOUNT_IDS)

export type Route = { name: 'home' } | { name: 'lobby'; id: string; intent: 'player' | 'storyteller' } | { name: 'admin' };

function parseRoute(): Route {
  const m = location.pathname.match(/^\/lobby\/([A-Za-z0-9_-]{4,32})\/?$/);
  if (m) return { name: 'lobby', id: m[1]!, intent: 'player' };
  if (location.pathname === '/admin') return { name: 'admin' };
  return { name: 'home' };
}

export function navigate(route: Route) {
  const path = route.name === 'lobby' ? `/lobby/${route.id}` : route.name === 'admin' ? '/admin' : '/';
  history.pushState(route, '', path);
  window.dispatchEvent(new CustomEvent('ct:navigate', { detail: route }));
}

function LobbyRoute({ id, intent, account }: { id: string; intent: 'player' | 'storyteller'; account: AccountView }) {
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
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
  }, [id, intent]);
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
  const lobby = useStore(conn.lobbyView);
  const game = useStore(conn.gameView);
  const waiting = !game && (!lobby || lobby.lobby.phase === 'waiting');
  return (
    <div class="screen">
      <GameScreen conn={conn} account={account}>
        <Hud conn={conn} account={account} />
        <StorytellerPanel conn={conn} account={account} />
        <VoicePanel conn={conn} account={account} />
        <ChatPanel conn={conn} account={account} />
      </GameScreen>
      {waiting && <WaitingRoom conn={conn} account={account} onLeave={() => navigate({ name: 'home' })} />}
    </div>
  );
}

function App() {
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>(parseRoute());
  useEffect(() => {
    api
      .me()
      .then(setAccount)
      .catch(() => setAccount(null));
    const onPop = () => setRoute(parseRoute());
    const onNav = (e: Event) => setRoute((e as CustomEvent<Route>).detail);
    window.addEventListener('popstate', onPop);
    window.addEventListener('ct:navigate', onNav);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('ct:navigate', onNav);
    };
  }, []);

  if (account === undefined) return <div class="screen center">Loading…</div>;
  if (account === null) return <AuthScreen onSignedIn={setAccount} />;
  if (route.name === 'lobby') return <LobbyRoute key={route.id} id={route.id} intent={route.intent} account={account} />;
  if (route.name === 'admin') return <AdminScreen account={account} />;
  return (
    <HomeScreen
      account={account}
      onAccountChange={setAccount}
      onSignedOut={() => setAccount(null)}
      onJoin={(id, intent) => navigate({ name: 'lobby', id, intent })}
    />
  );
}

render(<App />, document.getElementById('app')!);
