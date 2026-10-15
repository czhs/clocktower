import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { townLayout } from '@ct/assets';
import { tileCenterPx, type AccountView } from '@ct/protocol';
import { localPlayer } from '../net/localPlayer';
import type { RoomConnection } from '../net/room';
import { useStore } from '../net/store';
import { HowToPlayHost, openHelp } from '../ui/common/HowToPlay';
import { applyAmbientVolume, SettingsButton } from '../ui/common/Settings';
import { goTo } from '../ui/lobby/finder';
import { attachSound, unlockAudio } from './audio';
import './game.css';

// Mounts the Phaser town for this lobby; renders `children` (HUD, Storyteller panel, voice panel,
// chat — composed by main.tsx) above the canvas, plus the door prompt, phase caption, connection
// banner and (on touch devices) an on-screen joystick + "use door" button.

type Prompt = { key: string; text: string; locked?: boolean };

export function GameScreen(props: { conn: RoomConnection; account: AccountView; children?: ComponentChildren }) {
  const host = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
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
        game = createTownGame(el, { conn: props.conn, setPrompt, setCaption });
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
      {prompt?.text && !touch && (
        <div class={`ct-game-prompt${prompt.locked ? ' locked' : ''}`} aria-live="polite">
          {!prompt.locked && <kbd>{prompt.key}</kbd>}
          <span>{prompt.text}</span>
        </div>
      )}
      {touch && status === 'ready' && <TouchControls prompt={prompt?.text ? prompt : null} />}
      {status === 'ready' && <FirstSteps touch={touch} />}
      <HomeCompass conn={props.conn} />
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
 * you have walked a few steps (remembered per browser). */
function FirstSteps({ touch }: { touch: boolean }) {
  const me = useStore(localPlayer);
  const [done, setDone] = useState(() => hintSeen(MOVE_HINT_KEY));
  const start = useRef<{ x: number; y: number } | null>(null);
  const [youFaded, setYouFaded] = useState(false);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setYouFaded(true), 10_000);
    return () => clearTimeout(t);
  }, [done]);
  useEffect(() => {
    if (done || !me.pid) return;
    if (!start.current) start.current = { x: me.x, y: me.y };
    const moved = Math.hypot(me.x - start.current.x, me.y - start.current.y);
    if (moved > 8 && !youFaded) setYouFaded(true);
    if (moved > 3 * townLayout.tileSize) {
      markHint(MOVE_HINT_KEY);
      const t = setTimeout(() => setDone(true), 1200);
      return () => clearTimeout(t);
    }
  }, [me, done, youFaded]);
  if (done || !me.pid) return null;
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
            <b>Drag the joystick</b> to walk · at a door, <b>tap the door button</b>
          </>
        ) : (
          <>
            Walk with <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> or the arrow keys · at a door press <kbd>E</kbd> · <kbd>Enter</kbd> to chat
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
  const game = useStore(conn.gameView);
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
      <SettingsButton onLeave={game ? leave : undefined} leaveLabel={finished ? 'Back to lobbies' : 'Leave game'} />
      <button class="ct-tb-icon" onClick={openHelp} aria-label="How to play" title="How to play">
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

/** Points from the local player to their own cottage door (players only, outdoors). */
function HomeCompass({ conn }: { conn: RoomConnection }) {
  const game = useStore(conn.gameView);
  const me = useStore(localPlayer);
  if (!game || game.kind !== 'player' || game.phase === 'finished' || !me.pid) return null;
  const seat = game.you.seat;
  const house = L.buildings.find((b) => b.houseIndex === seat);
  if (!house) return null;
  const bedtime = game.phase === 'bedtime';
  const homeLoc = `bld:${house.id}`;
  if (me.location === homeLoc) {
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
  if (me.location !== 'outdoors') {
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
  const door = tileCenterPx(L, house.door);
  const dx = door.x - me.x;
  const dy = door.y - me.y;
  const steps = Math.round(Math.hypot(dx, dy) / L.tileSize);
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
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
      if (f.startsWith('game:') || f.startsWith('st:') || f.startsWith('chat:')) return;
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

function TouchControls({ prompt }: { prompt: Prompt | null }) {
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

  const canUse = !!prompt && !prompt.locked;
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
      {prompt && (
        <button
          class={`ct-touch-use${canUse ? '' : ' locked'}`}
          disabled={!canUse}
          aria-label={prompt.text}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!canUse) return;
            key('keydown', 'KeyE');
            key('keyup', 'KeyE');
          }}
          onClick={(e) => {
            // Keyboard / screen-reader activation (pointer taps are handled on pointerdown).
            if ((e as MouseEvent).detail === 0 && canUse) {
              key('keydown', 'KeyE');
              key('keyup', 'KeyE');
            }
          }}
        >
          <span class="ct-touch-use-icon" aria-hidden="true">
            {canUse ? '⌂' : '✕'}
          </span>
          <span class="ct-touch-use-text">{prompt.text}</span>
        </button>
      )}
    </>
  );
}
