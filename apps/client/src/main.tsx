// Stylesheets first, in the cascade order of the single v2.1 bundle (theme.css last). Every sheet
// stays in the entry CSS even though most components now load lazily: chunk CSS would be appended
// after theme.css and silently change which rule wins (v2.2 perf WP3 splits JS only).
import './ui/common/help.css';
import './ui/auth/auth.css';
import './ui/auth/landing.css';
import './ui/lobby/lobby.css';
import './ui/social/social.css';
import './ui/common/RoleIcon.css';
import './ui/notebook/notebook.css';
import './ui/story/story.css';
import './ui/clock/clock.css';
import './game/game.css';
import './ui/admin/admin.css';
import './ui/hud/hud.css';
import './ui/storyteller/storyteller.css';
import './ui/voice/voice.css';
import './ui/chat/chat.css';
import './ui/common/theme.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import { api } from './net/api';
import { AuthScreen } from './ui/auth/AuthScreen';
import { HomeScreen } from './ui/lobby/HomeScreen';
import { lazyComponent, whenIdle } from './ui/common/lazy';
import { navigate, parseRoute, type Route } from './ui/common/route';
import { installUiSounds } from './game/audio';

// LEAD-OWNED shell: session bootstrap + tiny path router (ui/common/route.ts).
// The entry holds only what a visitor needs before joining a lobby (landing / sign-up / sign-in,
// account home + lobby finder). Everything after that is code-split (v2.2 perf WP3):
//   LobbyRoute   colyseus + the town screen, HUD, voice, chat, waiting room (prefetched on home);
//                Phaser (TownGame) and the Storyteller panel are further chunks below it
//   AdminScreen  /admin only

const loadFailed = (what: string) => (
  <div class="screen center">
    <div class="panel">
      <p>The {what} could not be loaded. Check your internet connection, then try again.</p>
      <button class="primary" onClick={() => location.reload()}>
        Try again
      </button>
    </div>
  </div>
);

const LobbyRoute = lazyComponent(
  () => import('./ui/lobby/LobbyRoute').then((m) => m.LobbyRoute),
  (failed) => (failed ? loadFailed('lobby') : <div class="screen center">Joining lobby…</div>),
);
const AdminScreen = lazyComponent(
  () => import('./ui/admin/AdminScreen').then((m) => m.AdminScreen),
  (failed) => (failed ? loadFailed('admin page') : <div class="screen center">Loading…</div>),
);

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
  // Signed in on the home screen: fetch the lobby chunk while the user picks a lobby.
  const home = !!account && route.name === 'home';
  useEffect(() => {
    if (home) return whenIdle(() => void LobbyRoute.preload());
  }, [home]);

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

// A direct /lobby/<id> (or /admin) link: fetch that chunk in parallel with the session check.
const first = parseRoute();
if (first.name === 'lobby') void LobbyRoute.preload();
else if (first.name === 'admin') void AdminScreen.preload();

installUiSounds();
render(<App />, document.getElementById('app')!);
