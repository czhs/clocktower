import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { tileCenterPx, type AccountView, type BuildingDef, type WorldId } from '@ct/protocol';
import { localPlayer, type LocalPlayerState } from '../net/localPlayer';
import type { RoomConnection } from '../net/room';
import { currentLayout } from '../net/layout'; // (v3) the lobby's layout
import { shallowEqual, useStore, useStoreSelector } from '../net/store';
import { HowToPlayHost, openHelp } from '../ui/common/HowToPlay';
import { openRulebook, RulebookHost } from '../ui/rulebook'; // rulebook Grimoire (lazy chunk)
import { applyAmbientVolume, SettingsButton } from '../ui/common/Settings';
import { goTo } from '../ui/lobby/finder';
import { attachSound, unlockAudio } from './audio';
import { TrailingGate, type GateResult } from './hudRate';
// (v2.4 perf P2) lazy: one chunk with the in-town panels, prefetched by LobbyRoute next to Phaser
import { ClockChip, Notebook, SocialPalette, Story } from '../ui/common/lazyTown';
import { AbortGame } from '../ui/clock/AbortGame';
import { LobbySafety } from '../ui/lobby/moderation'; // (v2.3 OPS-6) in-game report / mute / remove
// (v3 WP0) renderer choice: static, three-free (the 3D town itself is the lazy chunk town3d)
import { chooseRendererHere, onGraphicsChange, rememberAutoFallback } from '../game3d/select';
import { resetBootGuard } from '../game3d/bootGuard';
import type { FallbackReason, RendererKind, Tier, TownBridge3d, TownHandle } from '../game3d/contract';
import { TownLoading } from '../ui/common/townLoading'; // (v3 WP8) the v3 loading scene (lobby chunk)
import { publishRender } from '../ui/common/graphicsStatus'; // (v3 WP6) what actually draws, for the Settings status line
import './game.css';

// Mounts the Phaser town for this lobby; renders `children` (HUD, Storyteller panel, voice panel,
// chat — composed by main.tsx) above the canvas, plus the door prompt, phase caption, connection
// banner and (on touch devices) an on-screen joystick + "use door" button.

type Prompt = { key: string; text: string; locked?: boolean };
type Inside = { buildingId: string; name: string; others: string[]; canLeave: boolean; lockedReason?: string };

export function GameScreen(props: { conn: RoomConnection; account: AccountView; children?: ComponentChildren }) {
  const host = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [inside, setInside] = useState<Inside | null>(null);
  const leaveRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const touch = useTouchDevice();

  // (v3 WP0) which renderer draws the town: chooseRenderer (game3d/select.ts) on mount, then in-place swaps
  // (crash / perf fallback, Graphics setting). The lobby's world is fixed, so it is read once.
  const world = props.conn.lobbyView.get()?.world ?? props.conn.lobbyView.get()?.lobby.world;
  const [render, setRender] = useState<Render>(() => pickRenderer(world));
  const [notice, setNotice] = useState<GraphicsNoticeKind | null>(() => (render.row === 4 ? 'boot-guard' : null));
  useEffect(
    () =>
      onGraphicsChange(() => {
        const c = pickRenderer(world);
        setRender((r) => (r.kind === c.kind && r.tier === c.tier ? r : c));
      }),
    [world],
  );

  // (v3 WP6) the Settings status line forgets the mounted town on unmount
  useEffect(() => () => publishRender(null), []);

  // Effect A (per connection): ambience + sound + the audio unlock. A renderer swap never restarts it.
  useEffect(() => {
    applyAmbientVolume();
    const detachSound = attachSound(props.conn);
    const gesture = () => unlockAudio();
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    return () => {
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      detachSound();
    };
  }, [props.conn]);

  // Effect B (per connection + renderer): load and mount the town; destroy() on swap / unmount.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let game: TownHandle | null = null;
    let cancelled = false;
    setStatus('loading');
    publishRender({ kind: render.kind, tier: render.tier, ...(render.fallback ? { fallback: render.fallback } : {}) });
    const fallback = (reason: FallbackReason) => {
      if (cancelled) return;
      if (reason === 'perf') rememberAutoFallback();
      setNotice(reason === 'perf' ? 'perf' : 'error');
      setRender({ kind: 'classic', tier: 'low', row: 0, fallback: reason });
    };
    const bridge: TownBridge3d = {
      conn: props.conn,
      setPrompt,
      setCaption,
      setInside,
      registerLeave: (fn) => (leaveRef.current = fn),
      requestFallback: fallback,
    };
    const mount =
      render.kind === 'v3'
        ? importTown3d().then(({ createTownGame3d }) => () => createTownGame3d(el, bridge, { tier: render.tier }))
        : import('./TownGame').then(({ createTownGame }) => () => createTownGame(el, bridge));
    mount
      .then((create) => {
        if (cancelled) return;
        try {
          game = create();
        } catch (e) {
          if (render.kind === 'v3') {
            console.error('[town3d] mount failed', e);
            return fallback('error');
          }
          throw e;
        }
        // the 3D build + shader warm-up stay behind "Lighting the lamps…" (INTEGRATION.md §1.2/§1.3); a
        // rejected `ready` already requested the Classic fallback, which re-runs this effect
        const ready = game.ready;
        if (!ready) return setStatus('ready');
        ready.then(
          () => {
            if (!cancelled) setStatus('ready');
          },
          () => undefined,
        );
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (render.kind === 'v3') {
          console.error('[town3d] chunk failed', e);
          return fallback('error');
        }
        setStatus('error');
      });
    return () => {
      cancelled = true;
      game?.destroy();
      // every renderer's opt-in debug hooks go with it (a swap must not leave the other renderer's members
      // behind; the DEV-only hooks never exist in production builds, tests/security/web-client.test.ts)
      const w = window as unknown as Record<string, unknown>;
      delete w.__ctCamera;
      delete w.__ctSocial;
    };
  }, [props.conn, render]);

  return (
    <div class={`ct-game${touch ? ' ct-touch' : ''}`}>
      <div class="ct-game-canvas" ref={host} onContextMenu={(e) => e.preventDefault()} />
      {status === 'loading' &&
        (world === 'v3' ? (
          // (v3 WP8) the Hollowmere loading scene with real progress (town chunk → pieces → warm-up / first frame);
          // v2 lobbies keep the plain line
          <TownLoading renderer={render.kind} />
        ) : (
          <div class="ct-game-loading" role="status">
            <span class="ct-spinner" aria-hidden="true" />
            Lighting the lamps…
          </div>
        ))}
      {status === 'error' && (
        <div class="ct-game-loading ct-game-failed" role="alert">
          <p>The town failed to load.</p>
          <button class="primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      {caption && (
        <div class="ct-game-caption" role="status" aria-live="polite">
          {caption}
        </div>
      )}
      {prompt?.text && !inside && (
        <div class={`ct-game-prompt${prompt.locked ? ' locked' : ''}`} aria-live="polite">
          {!prompt.locked && prompt.key && <kbd>{prompt.key}</kbd>}
          <span>{prompt.text}</span>
        </div>
      )}
      {inside && <InsidePanel inside={inside} prompt={prompt} onLeave={() => leaveRef.current?.()} />}
      {touch && status === 'ready' && <TouchControls />}
      {status === 'ready' && <SocialPalette conn={props.conn} touch={touch} />}
      {status === 'ready' && <Notebook conn={props.conn} touch={touch} />}
      {status === 'ready' && <Story conn={props.conn} touch={touch} />}
      {status === 'ready' && <FirstSteps touch={touch} />}
      <HomeCompass conn={props.conn} />
      {status === 'ready' && <ClockChip conn={props.conn} />}
      <Toolbar conn={props.conn} />
      <ErrorToasts conn={props.conn} />
      <ConnectionBanner conn={props.conn} />
      {notice && (
        <GraphicsNotice
          kind={notice}
          onClose={() => setNotice(null)}
          onTryV3={() => {
            resetBootGuard();
            setNotice(null);
            setRender(pickRenderer(world));
          }}
        />
      )}
      {props.children}
      <HowToPlayHost touch={touch} />
      <RulebookMount conn={props.conn} />
    </div>
  );
}

// ------------------------------------------------------------------------------------ first steps

const MOVE_HINT_KEY = 'ct.hint.move.v1';
const hintSeen = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};
const markHint = (k: string) => {
  try {
    localStorage.setItem(k, '1');
  } catch {
    // ignore
  }
};

/** First visit: a "this is you" marker over your character and a controls hint that fade once
 * you have walked a few steps (remembered per browser). The per-frame localPlayer store is read in
 * a subscription, not rendered: this re-renders only when the marker / hint change. */
function FirstSteps({ touch }: { touch: boolean }) {
  const [done, setDone] = useState(() => hintSeen(MOVE_HINT_KEY));
  const hasPid = useStoreSelector(localPlayer, (lp) => !done && !!lp.pid);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [youFaded, setYouFaded] = useState(false);
  // The Storyteller mostly fast-travels, so the "walked 3 tiles" dismissal may never fire: fade anyway.
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => (markHint(MOVE_HINT_KEY), setDone(true)), 20_000);
    return () => clearTimeout(t);
  }, [done]);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setYouFaded(true), 10_000);
    return () => clearTimeout(t);
  }, [done]);
  useEffect(() => {
    if (done || !hasPid) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let marked = false;
    let faded = false;
    const step = (me: LocalPlayerState) => {
      if (!me.pid) return;
      if (!start.current) start.current = { x: me.x, y: me.y };
      const moved = Math.hypot(me.x - start.current.x, me.y - start.current.y);
      if (moved > 8 && !faded) {
        faded = true;
        setYouFaded(true);
      }
      if (moved > 3 * currentLayout().tileSize) {
        if (!marked) markHint(MOVE_HINT_KEY);
        marked = true;
        // (as before: the hint goes 1.2 s after the last move beyond 3 tiles)
        clearTimeout(t);
        t = setTimeout(() => setDone(true), 1200);
      }
    };
    step(localPlayer.get());
    const off = localPlayer.subscribe(step);
    return () => {
      off();
      clearTimeout(t);
    };
  }, [done, hasPid]);
  if (done || !hasPid) return null;
  return (
    <>
      {!youFaded && (
        <div class="ct-you" aria-hidden="true">
          <span>You</span>
          <i>▼</i>
        </div>
      )}
      <div class="ct-hint" role="status">
        {touch ? (
          <>
            <b>Tap a cottage</b> to walk there and go in · or drag the joystick
          </>
        ) : (
          <>
            <b>Click a cottage</b> to go in, or walk with <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> — walk into a door to enter · <kbd>Enter</kbd> to chat · <kbd>?</kbd> all keys
          </>
        )}
        <button class="ct-hint-close" aria-label="Dismiss hint" onClick={() => (markHint(MOVE_HINT_KEY), setDone(true))}>
          ✕
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------ toolbar

/** Top-right: How to play, Leave / Back to lobbies, and Play again (ST or host) after a game. */
function Toolbar({ conn }: { conn: RoomConnection }) {
  const lobby = useStore(conn.lobbyView);
  const game = useStoreSelector(conn.gameView, (g) => (g ? { phase: g.phase } : null), shallowEqual);
  const me = lobby?.members.find((m) => m.pid === lobby.youPid);
  const finished = game?.phase === 'finished' || lobby?.lobby.phase === 'finished';
  const canRematch = !!game && finished && !!lobby?.youAdmin;
  const leave = () => {
    if (finished || confirm('Leave the town? Your seat is kept — use “Rejoin my seat” in the lobby finder to come back.')) goTo('/');
  };
  return (
    <div class={`ct-toolbar${game ? '' : ' ct-toolbar-waiting'}`} role="toolbar" aria-label="Game menu">
      {canRematch && (
        <button class="primary" onClick={() => conn.send('lobby:start', {})} title="Return everyone to the waiting room for another game">
          Play again
        </button>
      )}
      <AbortGame conn={conn} />
      <LobbySafety conn={conn} />
      <SettingsButton conn={conn} onLeave={game ? leave : undefined} leaveLabel={finished ? 'Back to lobbies' : 'Leave game'} />
      <button class="ct-tb-rulebook" onClick={openRulebook} aria-label="Rulebook" title="Rulebook: every script's rules and characters">
        <span class="ct-tb-glyph" aria-hidden="true">
          ❦
        </span>{' '}
        <span class="ct-tb-label">Rules</span>
      </button>
      <button class="ct-tb-icon" onClick={openHelp} aria-label="How to play" title="How to play · keyboard shortcuts (?)">
        ?
      </button>
      {/* While waiting, the lobby sheet has its own Leave button. */}
      {game && (
        <button class="ct-tb-leave" onClick={leave} aria-label={finished ? 'Back to lobbies' : 'Leave game'} title={finished ? 'Back to lobbies' : 'Leave (your seat is kept)'}>
          <span class="ct-tb-glyph" aria-hidden="true">
            ⇦
          </span>{' '}
          <span class="ct-tb-label">{finished ? 'Lobbies' : 'Leave'}</span>
        </button>
      )}
    </div>
  );
}

/** The rulebook, opened on this lobby's script, with the viewer's own character highlighted. */
function RulebookMount({ conn }: { conn: RoomConnection }) {
  const script = useStoreSelector(conn.lobbyView, (l) => l?.lobby.script);
  const mine = useStoreSelector(conn.gameView, (g) => (g && 'you' in g ? g.you.role?.character : undefined));
  return <RulebookHost script={script} mine={mine} />;
}

// ------------------------------------------------------------------------------------ home compass

/** What the compass shows, from the per-frame local position: re-render only when it changes
 * (whole steps, the arrow angle in 5° steps, home / inside / outdoors). */
type CompassFix = { at: 'home' } | { at: 'inside' } | { at: 'out'; steps: number; deg: number } | null;
function compassFix(me: LocalPlayerState, house: BuildingDef | undefined): CompassFix {
  if (!me.pid || !house) return null;
  if (me.location === `bld:${house.id}`) return { at: 'home' };
  if (me.location !== 'outdoors') return { at: 'inside' };
  const L = currentLayout();
  const door = tileCenterPx(L, house.door);
  const dx = door.x - me.x;
  const dy = door.y - me.y;
  const steps = Math.round(Math.hypot(dx, dy) / L.tileSize);
  const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 5) * 5;
  return { at: 'out', steps, deg };
}

/** v2.4: the compass while walking changes ≤ 2x/s (game/hudRate.ts); home / inside / outdoors at once. */
const COMPASS_MIN_MS = 500;
function useCompassFix(house: BuildingDef | undefined): CompassFix {
  const [fix, setFix] = useState<CompassFix>(() => compassFix(localPlayer.get(), house));
  useEffect(() => {
    const gate = new TrailingGate<CompassFix>(compassFix(localPlayer.get(), house), COMPASS_MIN_MS, shallowEqual, (a, b) => a?.at !== b?.at);
    setFix(gate.value);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = (r: GateResult<CompassFix>) => {
      if (r.emit) setFix(r.value);
      if (timer) clearTimeout(timer);
      timer = r.wakeInMs > 0 ? setTimeout(() => apply(gate.flush(performance.now())), r.wakeInMs) : null;
    };
    const off = localPlayer.subscribe((lp) => apply(gate.offer(compassFix(lp, house), performance.now())));
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [house]);
  return fix;
}

/** Points from the local player to their own cottage door (players only, outdoors). */
function HomeCompass({ conn }: { conn: RoomConnection }) {
  const game = useStoreSelector(
    conn.gameView,
    (g) => (g && g.kind === 'player' && g.phase !== 'finished' ? { seat: g.you.seat, bedtime: g.phase === 'bedtime' } : null),
    shallowEqual,
  );
  const house = game ? currentLayout().buildings.find((b) => b.houseIndex === game.seat) : undefined;
  const fix = useCompassFix(house);
  if (!game || !house || !fix) return null;
  const bedtime = game.bedtime;
  if (fix.at === 'home') {
    if (!bedtime) return null;
    return (
      <div class="ct-compass ct-compass-home" role="status">
        <span class="ct-compass-arrow" aria-hidden="true">
          ⌂
        </span>
        You are home — safe for the night
      </div>
    );
  }
  if (fix.at === 'inside') {
    if (!bedtime) return null;
    return (
      <div class="ct-compass urgent" role="status">
        <span class="ct-compass-arrow" aria-hidden="true">
          ⌂
        </span>
        Leave this building and head home
      </div>
    );
  }
  const { steps, deg } = fix;
  return (
    <div class={`ct-compass${bedtime ? ' urgent' : ''}`} role="status" aria-label={`Your home, ${house.name}`}>
      <span class="ct-compass-arrow" aria-hidden="true" style={{ transform: `rotate(${deg}deg)` }}>
        ➜
      </span>
      <span>
        {bedtime ? 'Go home' : 'Your home'} <small>· {steps <= 1 ? 'here' : `${steps} steps`}</small>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------------------------ graphics (v3)

type Render = { kind: RendererKind; tier: Tier; row: number; /** set when this render is a runtime fallback */ fallback?: FallbackReason };
function pickRenderer(world: WorldId | undefined): Render {
  const c = chooseRendererHere(world);
  return { kind: c.renderer, tier: c.tier, row: c.row };
}

type Town3dModule = typeof import('../game3d/TownGame3d');
/**
 * The 3D town chunk. A chunk-load error goes straight to Classic in place (no in-page retry, INTEGRATION.md §9.3 /
 * §11 C1): Chromium keeps a failed module fetch in its module map (the same URL rejects again at once, without a
 * request), and a fresh-URL copy (`?retry=`) is a second module instance whose own sub-chunks (houses, characters,
 * foliage, …) still import `town3d-*.js` by its plain, failed URL. A page reload (or "[Try v3 again]" after one)
 * picks the chunk up again.
 */
function importTown3d(): Promise<Town3dModule> {
  return import('../game3d/TownGame3d');
}

type GraphicsNoticeKind = 'boot-guard' | 'perf' | 'error';
const GRAPHICS_NOTICE: Record<GraphicsNoticeKind, string> = {
  'boot-guard': 'v3 graphics stopped last time — showing the Classic town.',
  perf: 'Switched to Classic graphics for speed.',
  error: 'The 3D town failed — switched to Classic graphics.',
};

/** A toast after a renderer fallback (row 4 boot guard, perf, crash). */
function GraphicsNotice({ kind, onClose, onTryV3 }: { kind: GraphicsNoticeKind; onClose: () => void; onTryV3: () => void }) {
  useEffect(() => {
    if (kind === 'boot-guard') return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [kind]);
  return (
    <div class="ct-toasts" aria-live="polite">
      <div class="ct-toast" role="status">
        <span>{GRAPHICS_NOTICE[kind]}</span>
        {kind === 'boot-guard' && <button onClick={onTryV3}>Try v3</button>}
        <button aria-label="Dismiss" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ errors

/** Server rejections that no other panel displays (HUD shows game:*, Grimoire st:*, chat chat:*,
 * waiting room lobby:* while waiting). */
function ErrorToasts({ conn }: { conn: RoomConnection }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    let n = 0;
    return conn.events.on('error', (e) => {
      const f = e.for ?? '';
      if (f.startsWith('game:') || f.startsWith('st:') || f.startsWith('chat:') || f.startsWith('clock:')) return;
      const waiting = !conn.gameView.get() && conn.lobbyView.get()?.lobby.phase === 'waiting';
      if (waiting && (!f || f.startsWith('lobby:'))) return;
      const id = ++n;
      setItems((xs) => [...xs.slice(-2), { id, text: e.message }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000);
    });
  }, [conn]);
  if (!items.length) return null;
  return (
    <div class="ct-toasts" aria-live="assertive">
      {items.map((t) => (
        <div key={t.id} class="ct-toast" role="alert">
          <span>{t.text}</span>
          <button aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------ connection

function ConnectionBanner({ conn }: { conn: RoomConnection }) {
  const status = useStore(conn.status);
  // Only show "reconnecting" if it lasts a moment (brief blips are invisible to players).
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status !== 'reconnecting') return setShow(false);
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [status]);
  if (status === 'closed')
    return (
      <div class="ct-conn ct-conn-lost" role="alert">
        <span>Disconnected from the lobby.</span>
        <button class="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!show) return null;
  return (
    <div class="ct-conn" role="status" aria-live="polite">
      <span class="ct-spinner" aria-hidden="true" />
      Connection lost — reconnecting… your seat is kept.
    </div>
  );
}

// ------------------------------------------------------------------------------------ touch input

/** True on touch-first devices (coarse pointer), or as soon as the user touches the screen. */
function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (touch) return;
    const on = (e: PointerEvent) => e.pointerType === 'touch' && setTouch(true);
    window.addEventListener('pointerdown', on);
    return () => window.removeEventListener('pointerdown', on);
  }, [touch]);
  return touch;
}

type Dir = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
const STICK_R = 46; // px the knob may travel from centre
const DEAD = 10;

/** The town reads movement from window key events (TownScene.keyDir), so the stick emits the
 * same synthetic arrow-key downs/ups a keyboard would. */
function key(type: 'keydown' | 'keyup', code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
}

function TouchControls() {
  const held = useRef(new Set<Dir>());
  const active = useRef<number | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);

  const apply = (next: Set<Dir>) => {
    for (const d of held.current) if (!next.has(d)) key('keyup', d);
    for (const d of next) if (!held.current.has(d)) key('keydown', d);
    held.current = next;
  };
  const release = () => {
    active.current = null;
    setKnob(null);
    apply(new Set());
  };
  useEffect(() => {
    const hidden = () => document.hidden && release();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', release);
      apply(new Set());
    };
  }, []);

  const track = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    setKnob({ x: dx, y: dy });
    const next = new Set<Dir>();
    if (d >= DEAD) {
      // 8-way: a component counts once it is > ~22.5° off the other axis.
      const nx = dx / Math.max(d, 1);
      const ny = dy / Math.max(d, 1);
      if (nx > 0.38) next.add('ArrowRight');
      if (nx < -0.38) next.add('ArrowLeft');
      if (ny > 0.38) next.add('ArrowDown');
      if (ny < -0.38) next.add('ArrowUp');
    }
    apply(next);
  };

  return (
    <>
      <div
        class={`ct-touch-stick${knob ? ' active' : ''}`}
        role="application"
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          if (active.current !== null) return;
          (document.activeElement as HTMLElement | null)?.blur?.();
          active.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          track(e);
          e.preventDefault();
        }}
        onPointerMove={(e) => e.pointerId === active.current && track(e)}
        onPointerUp={(e) => e.pointerId === active.current && release()}
        onPointerCancel={(e) => e.pointerId === active.current && release()}
      >
        <div class="ct-touch-knob" style={knob ? { transform: `translate(${knob.x}px, ${knob.y}px)` } : undefined} />
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------ inside a cottage

/** Inside a cottage: where you are, who is in here with you (they hear you, nobody else does) and Leave. */
function InsidePanel({ inside, prompt, onLeave }: { inside: Inside; prompt: Prompt | null; onLeave: () => void }) {
  const others = inside.others;
  return (
    <div class="ct-inside" role="status" aria-live="polite">
      <div class="ct-inside-title">{inside.name}</div>
      <div class="ct-inside-who">
        {others.length ? (
          <>
            In here with <b>{others.join(', ')}</b> — only you {others.length === 1 ? 'two' : 'here'} can hear each other
          </>
        ) : (
          <>Nobody else is here — only people inside can hear you</>
        )}
      </div>
      {prompt?.locked && prompt.text && <div class="ct-inside-note">{prompt.text}</div>}
      <button class="primary ct-inside-leave" disabled={!inside.canLeave} title={inside.canLeave ? 'Walk back out (or walk down through the doorway)' : inside.lockedReason} onClick={onLeave}>
        {inside.canLeave ? 'Leave' : inside.lockedReason ?? 'Locked'}
      </button>
    </div>
  );
}
