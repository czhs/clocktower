// Stylesheets (v2.4 perf P2): the entry carries only what the landing / sign-in / home screens need
// (index-base-*.css: help, auth, landing, lobby, role icons) and the theme (index-*.css, last). Every
// other sheet is imported by its own component and ships with that lazy chunk; ui/common/cssOrder.ts
// (imported first, before anything can start a dynamic import) inserts those chunk sheets BEFORE the
// theme, so the cascade is the single v2.1 bundle's (theme.css wins ties). Order + checks:
// apps/client/build/cssOrder.ts (the build fails if a sheet lands outside the scheme).
import './ui/common/cssOrder';
import './ui/common/help.css';
import './ui/auth/auth.css';
import './ui/auth/landing.css';
import './ui/lobby/lobby.css';
import './ui/common/RoleIcon.css';
import './ui/common/theme.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AccountView } from '@ct/protocol';
import { api, ApiFailure } from './net/api';
import { AuthScreen } from './ui/auth/AuthScreen';
import { HomeScreen } from './ui/lobby/HomeScreen';
import { lazyComponent, whenIdle } from './ui/common/lazy';
import { LoadingScreen, StatusScreen } from './ui/common/StatusScreen';
import { navigate, parseRoute, type Route } from './ui/common/route';
import { appWorld } from './ui/common/appWorld';
import { prefetchAllowed, prefetchTown3dForHome } from './ui/common/townPrefetch';
import { V3Loading } from './ui/common/v3loading';
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
      <p>
        The {what} could not be loaded.{' '}
        {navigator.onLine === false ? 'You seem to be offline: reconnect, then reload.' : 'The town may have just been updated, or the connection dropped. Reloading usually fixes it.'}
      </p>
      <button class="primary" onClick={() => location.reload()}>
        Reload
      </button>
    </div>
  </div>
);

// (v3 URL paths + WP8) `/` is the v3 app: its boot and join screens are the Hollowmere loading scene
// (ui/common/v3loading.tsx); the v2 app at /v2/ keeps the plain line. The later steps (layout, town chunk, pieces,
// warm-up) continue the same scene with real progress (ui/lobby/JoinPreview.tsx, ui/common/townLoading.tsx).
const booting = (v2Text: string, joining: boolean) =>
  appWorld() === 'v3' ? (
    <V3Loading frac={joining ? 0.06 : 0.03} label={joining ? 'Finding the lobby…' : 'Opening the town gates…'} parade={joining} />
  ) : (
    <LoadingScreen text={v2Text} />
  );

const LobbyRoute = lazyComponent(
  () => import('./ui/lobby/LobbyRoute').then((m) => m.LobbyRoute),
  (failed) => (failed ? loadFailed('lobby') : booting('Joining lobby…', true)),
  { reloadOnFail: true },
);
const AdminScreen = lazyComponent(
  () => import('./ui/admin/AdminScreen').then((m) => m.AdminScreen),
  (failed) => (failed ? loadFailed('admin page') : <LoadingScreen text="Loading…" />),
  { reloadOnFail: true },
);

function App() {
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [route, setRoute] = useState<Route>(parseRoute());
  // Session check failed for a reason other than "not signed in" (offline, server restarting during
  // a deploy, proxy error page): say so and retry, instead of showing the sign-up screen to a
  // returning player (who might then make a second account).
  const [unreachable, setUnreachable] = useState(0); // failed checks in a row
  const checkSession = () => {
    api
      .me()
      .then(setAccount)
      .catch((e: unknown) => {
        if (e instanceof ApiFailure && e.status === 401) setAccount(null);
        else setUnreachable((n) => n + 1);
      });
  };
  useEffect(() => {
    if (!unreachable) return;
    const retry = () => checkSession();
    const t = setTimeout(retry, 5000);
    window.addEventListener('online', retry);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', retry);
    };
  }, [unreachable]);
  useEffect(() => {
    checkSession();
    const onPop = () => setRoute(parseRoute());
    const onNav = (e: Event) => setRoute((e as CustomEvent<Route>).detail);
    window.addEventListener('popstate', onPop);
    window.addEventListener('ct:navigate', onNav);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('ct:navigate', onNav);
    };
  }, []);
  // Signed in on the home screen: fetch the lobby chunk while the user picks a lobby. (v3.2 perf) In the v3 app the
  // landing (signed out) and home screens also prefetch the lobby chunk and the 3D town when idle, unless this page
  // would draw Classic or the connection is slow / Save-Data (ui/common/townPrefetch.ts).
  const home = !!account && route.name === 'home';
  const landing = account === null || home;
  useEffect(() => {
    if (home) return whenIdle(() => void LobbyRoute.preload());
  }, [home]);
  useEffect(() => {
    if (!landing || appWorld() !== 'v3') return;
    return whenIdle(() => {
      if (!prefetchAllowed()) return;
      void LobbyRoute.preload();
      prefetchTown3dForHome();
    }, 4000);
  }, [landing]);

  if (account === undefined)
    return unreachable > 0 ? (
      <StatusScreen
        icon="⚠"
        title="Can't reach the town"
        message={
          navigator.onLine === false
            ? 'You seem to be offline. This page reconnects by itself once you are back online.'
            : 'The server may be restarting for an update. Trying again every few seconds…'
        }
        actions={[{ label: 'Try now', primary: true, onClick: checkSession }]}
      />
    ) : (
      booting('Loading…', false)
    );
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
