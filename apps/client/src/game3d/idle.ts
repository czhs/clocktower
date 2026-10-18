// v3.2 perf (docs/perf-v3/fullstack.md lever 2): the "something changed" signal for idle rendering. The frame loop
// (perf.ts runFrameLoop idleFps / isIdle, via engineHost.start) draws at V3_IDLE_FPS while this says idle, and at the
// full rate (V3_MAX_FPS, or the cpu tier's cap) otherwise. Idle = for IDLE_LINGER_MS none of:
//   - per drawn frame (observe): the camera moved (view-projection or texel-snap offset), a pose changed or somebody is
//     walking (own avatar or a remote; a remote appeared / vanished), the shown hour moved (dawn / dusk easing), or
//     something animates by itself (a camera transition, a vote or open nomination: the clock hand, somebody talking:
//     the talk clip and label ring);
//   - events (wake): any keyboard / pointer / wheel / touch input, a lobby / game / chat state change, a chat bubble,
//     a teleport, a sound cue, a door use, a poof / placement fade, a voice presence change, a resize.
// Ambient motion (wind, water, fireflies, idle breathing) is not a change: it simply steps at 30 Hz while idle.
// Nothing is ever stale: idle still draws every 33 ms, so a change that no rule here catches costs smoothness, not
// correctness. Off under ct.debug.fps / ct.debug.v3idle = '0' (perf.ts idleEnabled).
import type { RoomConnection } from '../net/room';
import { voicePresence } from '../voice/VoiceClient';
import type { ProjectionState } from './coords';
import type { Scene3dState } from './contract';
import type { Core3d } from './net/core';
import { ActivityWatch, idleEnabled, type ActivityFrame } from './perf';

export interface IdleSignal {
  /** Pass to engineHost.start (undefined when idle rendering is off). */
  readonly isIdle: (() => boolean) | undefined;
  /** Once per drawn frame, after the render (the projection of that frame). */
  observe(state: Scene3dState, proj: ProjectionState): void;
  wake(): void;
  debug(): { on: boolean; idle: boolean; reason: string; detail: string; wake: string; wakes: number };
  destroy(): void;
}

const INPUT_EVENTS = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'wheel', 'touchstart', 'touchmove', 'resize'] as const;

export function createIdleSignal(o: { conn: RoomConnection; core: Pick<Core3d, 'on' | 'view' | 'safeInput'>; talking: () => boolean; storage: Pick<Storage, 'getItem'> | null; now?: () => number }): IdleSignal {
  const on = idleEnabled(o.storage);
  const watch = new ActivityWatch(o.now ?? (() => performance.now()));
  const offs: (() => void)[] = [];
  let lastWake = 'none';
  let wakes = 0;
  const waker = (src: string) => () => {
    lastWake = src;
    wakes++;
    watch.wake();
  };
  if (on) {
    const c = o.conn;
    offs.push(c.lobbyView.subscribe(waker('lobby')), c.gameView.subscribe(waker('game')), c.chat.subscribe(waker('chat')));
    for (const ev of ['chat:message', 'world:teleport', 'sound'] as const) offs.push(c.events.on(ev, waker(ev)));
    offs.push(o.core.on('placed', waker('placed')), o.core.on('poof', waker('poof')), o.core.on('door', waker('door')));
    offs.push(voicePresence.subscribe(waker('voice')));
    if (typeof window !== 'undefined') {
      const input = waker('input');
      const opt = { capture: true, passive: true } as const;
      for (const ev of INPUT_EVENTS) window.addEventListener(ev, input, opt);
      offs.push(() => {
        for (const ev of INPUT_EVENTS) window.removeEventListener(ev, input, opt);
      });
    }
  }
  const frame: ActivityFrame = { me: null, remotes: new Map(), hour: 0, viewProj: [], offsetX: 0, offsetY: 0, busy: false };
  return {
    isIdle: on ? () => watch.idle() : undefined,
    observe(state, proj) {
      if (!on) return;
      const si = o.core.safeInput();
      frame.me = state.me;
      frame.remotes = state.remotes;
      frame.hour = state.hour;
      frame.viewProj = proj.viewProj;
      frame.offsetX = proj.offset.x;
      frame.offsetY = proj.offset.y;
      frame.busy = o.core.view.transitioning || si.voting || si.nominationOpen || o.talking();
      watch.observe(frame);
    },
    wake: () => watch.wake(),
    debug: () => ({ on, idle: on && watch.idle(), reason: watch.reason, detail: watch.reason === 'pose' ? watch.detail : '', wake: lastWake, wakes }),
    destroy() {
      for (const off of offs.splice(0)) off();
    },
  };
}
