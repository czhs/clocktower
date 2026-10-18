// (v3 WP6, v3-ui) Attaches the v3 DOM skin (./v3skin.ts) to a lobby connection and drives its look from the
// §3.1 game hour. Static (lobby chunk), three-free. docs/v3/INTEGRATION.md §5.
//
// The look follows the hour: tokens day < 16:00, golden < 19:45, else night; the `-night` atlases are used
// when the hour is ≥ 19:45 or < 06:15 (the same rule as the tokens' night set).
// Mount: `useV3Skin(conn)` in a component that lives exactly as long as the lobby connection (ref-counted, so
// several mounts of the same connection are fine). The one mount that covers a whole game is LobbyRoute's
// `InLobby` (CONTRACT-REQUEST(lead), docs/v3/INTEGRATION.md §5 "Skin lifetime"): the WaitingRoom / SocialPalette
// mounts alone leave gaps whenever GameScreen leaves `status === 'ready'` after game start (an in-place renderer
// swap, a perf / error fallback, a mid-game reload or rejoin before the town is ready). Nothing here is sent
// anywhere; nothing is stored.
import { useEffect } from 'preact/hooks';
import type { DayClockView, GamePhase, LobbyRoomView, PlayerGameView, StorytellerGameView } from '@ct/protocol';
import { serverNow } from '../../net/serverTime';
import type { Store } from '../../net/store';
import { loadV3Atlas, v3AtlasPending, v3AtlasRef, v3Skin, type SkinLook, type V3SkinState } from './v3skin';
import { setPortraitAlt, type PortraitAlt } from './castPortrait';
import { worldOfLobby } from '../lobby/finder';
import { syncWorldPath } from './appWorld';

// ------------------------------------------------------------------------------------ hour (§3.1)

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Stage progress p (0..1) of the day clock (§3.1); 0 without a clock. */
export function clockProgress(clock: DayClockView | null | undefined, now: number): number {
  if (!clock || !(clock.totalMs > 0)) return 0;
  if (clock.paused) return clamp01(1 - (clock.remainingMs ?? clock.totalMs) / clock.totalMs);
  if (clock.endsAt != null) return clamp01(1 - (clock.endsAt - now) / clock.totalMs);
  return 0;
}

/** Phase-entry time for the dawn ease, per phase change (module-level: one attached lobby at a time). */
const DAWN_EASE_MS = 20_000;

/**
 * The §3.1 game hour for the DOM skin (no 1.5 s smoothing: the skin switches in whole looks).
 * `phaseSince` = when this client saw the phase start (only the dawn ease uses it).
 */
export function skinHour(phase: GamePhase | 'waiting', game: Pick<PlayerGameView, 'clock' | 'day'> | null, now: number, phaseSince = now): number {
  switch (phase) {
    case 'waiting':
    case 'setup':
      return 10;
    case 'day': {
      const clock = game?.clock ?? null;
      const stage = clock?.stage ?? (game?.day?.nominationsOpen ? 'nominations' : 'discussion');
      const p = clockProgress(clock, now);
      if (stage === 'nominations') return 15 + 3 * p;
      if (stage === 'bedtime') return 18.5 + 1.25 * p;
      return 11 + 4 * p;
    }
    case 'bedtime':
      return 18.5 + 1.25 * (game?.clock?.stage === 'bedtime' ? clockProgress(game.clock, now) : 0);
    case 'first_night':
    case 'night':
      return 23;
    case 'dawn':
      return 6.25 + 1.75 * clamp01((now - phaseSince) / DAWN_EASE_MS);
    case 'finished':
      return 12.5;
  }
}

/** Token set for an hour: day < 16:00, golden < 19:45, else night (and the small hours are night too). */
export function lookOf(hour: number): SkinLook {
  if (isNightHour(hour)) return 'night';
  return hour < 16 ? 'day' : 'golden';
}
/** The `-night` atlas rule: ≥ 19:45 or < 06:15. */
export const isNightHour = (hour: number): boolean => hour >= 19.75 || hour < 6.25;

// ------------------------------------------------------------------------------------ attach

type Conn = { lobbyView: Store<LobbyRoomView | null>; gameView: Store<PlayerGameView | StorytellerGameView | null> };

interface Attached {
  conn: Conn;
  users: number;
  detach: () => void;
}
let attached: Attached | null = null;

function applyRoot(s: V3SkinState): void {
  if (typeof document === 'undefined') return;
  const d = document.documentElement.dataset;
  if (s.on) {
    d.graphics = 'v3';
    d.tod = s.look;
  } else {
    delete d.graphics;
    delete d.tod;
  }
}

/** Until the lazy atlas chunk installs the v3 strip (./v3portrait.ts), portraits in a v3 lobby wait for it
 * (silhouette, never a v2 flash). */
export const PENDING_PORTRAITS: PortraitAlt = { req: () => null, cell: () => null, load: () => Promise.resolve(), pending: () => v3AtlasPending(), stepMs: () => 140 };
let portraitsInstalled = false;

function start(conn: Conn): () => void {
  let phase: GamePhase | 'waiting' = 'waiting';
  let since = Date.now();
  let live = true;
  const update = () => {
    if (!live) return;
    const view = conn.lobbyView.get();
    // (v3 URL paths) the lobby's world decides which app the address bar shows (/ = v3, /v2/ = v2): an old v2
    // share link opened at / moves to /v2/lobby/x in place (no reload; the connection is untouched)
    if (view) syncWorldPath(worldOfLobby(view));
    const on = worldOfLobby(view) === 'v3';
    const g = conn.gameView.get();
    const ph: GamePhase | 'waiting' = g?.phase ?? 'waiting';
    if (ph !== phase) {
      phase = ph;
      since = Date.now();
    }
    const hour = skinHour(ph, g, serverNow(), since);
    const look = lookOf(hour);
    const night = isNightHour(hour);
    const prev = v3Skin.get();
    // only a look change touches the store (consumers repaint on it); the hour itself rides along
    if (prev.on === on && prev.look === look && prev.night === night) return;
    const next = { ...prev, on, look, night, hour };
    v3Skin.set(next);
    applyRoot(next);
    if (!on) return void v3AtlasRef()?.unskin();
    if (!portraitsInstalled && !v3AtlasRef()) setPortraitAlt(PENDING_PORTRAITS);
    portraitsInstalled = true;
    void loadV3Atlas().then((a) => {
      if (!a || !live || !v3Skin.get().on) return;
      // night atlases on demand; repaint consumers once each data set lands
      return a.ready(v3Skin.get().night).then((fresh) => {
        const s = v3Skin.get();
        if (!live || !s.on) return;
        a.skin(s.look);
        if (fresh) v3Skin.set((x) => ({ ...x, rev: x.rev + 1 }));
      });
    });
  };
  const offL = conn.lobbyView.subscribe(update);
  const offG = conn.gameView.subscribe(update);
  // the clock moves the hour without a view change (a look changes at most every few game minutes)
  const timer = setInterval(update, 5000);
  update();
  return () => {
    live = false;
    offL();
    offG();
    clearInterval(timer);
    const off = { ...v3Skin.get(), on: false, look: 'day' as const, night: false, hour: 10 };
    v3Skin.set(off);
    applyRoot(off);
    v3AtlasRef()?.unskin();
  };
}

/** Attach the skin to a lobby connection (ref-counted); returns the release function. */
export function attachV3Skin(conn: Conn): () => void {
  if (attached && attached.conn !== conn) {
    // a new lobby replaces the old one (leaving one lobby and joining another in one page)
    attached.detach();
    attached = null;
  }
  if (!attached) attached = { conn, users: 0, detach: start(conn) };
  const mine = attached;
  mine.users++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--mine.users > 0 || attached !== mine) return;
    mine.detach();
    attached = null;
  };
}

/** Preact: keep the v3 skin attached while this component is mounted. */
export function useV3Skin(conn: Conn | null | undefined): void {
  useEffect(() => (conn ? attachV3Skin(conn) : undefined), [conn]);
}
