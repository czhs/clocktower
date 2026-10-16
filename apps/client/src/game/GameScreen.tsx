import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { townLayout } from '@ct/assets';
import { tileCenterPx, type AccountView, type BuildingDef } from '@ct/protocol';
import { localPlayer, type LocalPlayerState } from '../net/localPlayer';
import type { RoomConnection } from '../net/room';
import { shallowEqual, useStore, useStoreSelector } from '../net/store';
import { HowToPlayHost, openHelp } from '../ui/common/HowToPlay';
import { applyAmbientVolume, SettingsButton } from '../ui/common/Settings';
import { goTo } from '../ui/lobby/finder';
import { attachSound, unlockAudio } from './audio';
import { SocialPalette } from '../ui/social/SocialPalette';
import { Notebook } from '../ui/notebook/Notebook';
import { Story } from '../ui/story/Story';
import { ClockChip } from '../ui/clock/ClockChip';
import { AbortGame } from '../ui/clock/AbortGame';
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

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let game: { destroy(): void } | null = null;
    let cancelled = false;
    import('./TownGame')
      .then(({ createTownGame }) => {
        if (cancelled) return;
        game = createTownGame(el, { conn: props.conn, setPrompt, setCaption, setInside, registerLeave: (fn) => (leaveRef.current = fn) });
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    applyAmbientVolume();
    const detachSound = attachSound(props.conn);
    const gesture = () => unlockAudio();
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      detachSound();
      game?.destroy();
    };
  }, [props.conn]);

  return (
    <div class={`ct-game${touch ? ' ct-touch' : ''}`}>
      <div class="ct-game-canvas" ref={host} onContextMenu={(e) => e.preventDefault()} />
      {status === 'loading' && (
        <div class="ct-game-loading" role="status">
          <span class="ct-spinner" aria-hidden="true" />
          Lighting the lamps…
        </div>
      )}
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
      {props.children}
      <HowToPlayHost touch={touch} />
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
      if (moved > 3 * townLayout.tileSize) {
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
  const canRematch = !!game && finished && !!me && (me.role === 'storyteller' || me.isHost);
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
      <SettingsButton onLeave={game ? leave : undefined} leaveLabel={finished ? 'Back to lobbies' : 'Leave game'} />
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

// ------------------------------------------------------------------------------------ home compass

const L = townLayout;

/** What the compass shows, from the per-frame local position: re-render only when it changes
 * (whole steps, the arrow angle in 5° steps, home / inside / outdoors). */
type CompassFix = { at: 'home' } | { at: 'inside' } | { at: 'out'; steps: number; deg: number } | null;
function compassFix(me: LocalPlayerState, house: BuildingDef | undefined): CompassFix {
  if (!me.pid || !house) return null;
  if (me.location === `bld:${house.id}`) return { at: 'home' };
  if (me.location !== 'outdoors') return { at: 'inside' };
  const door = tileCenterPx(L, house.door);
  const dx = door.x - me.x;
  const dy = door.y - me.y;
  const steps = Math.round(Math.hypot(dx, dy) / L.tileSize);
  const deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 5) * 5;
  return { at: 'out', steps, deg };
}

/** Points from the local player to their own cottage door (players only, outdoors). */
function HomeCompass({ conn }: { conn: RoomConnection }) {
  const game = useStoreSelector(
    conn.gameView,
    (g) => (g && g.kind === 'player' && g.phase !== 'finished' ? { seat: g.you.seat, bedtime: g.phase === 'bedtime' } : null),
    shallowEqual,
  );
  const house = game ? L.buildings.find((b) => b.houseIndex === game.seat) : undefined;
  const fix = useStoreSelector(localPlayer, (lp) => compassFix(lp, house), shallowEqual);
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
    <div class={`ct-compass${bedtime ? ' urgent' : ''}`} role="status" aria-label={`Your home, ${house.name}: ${steps} steps`}>
      <span class="ct-compass-arrow" aria-hidden="true" style={{ transform: `rotate(${deg}deg)` }}>
        ➜
      </span>
      <span>
        {bedtime ? 'Go home' : 'Your home'} <small>· {steps <= 1 ? 'here' : `${steps} steps`}</small>
      </span>
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
