// v3 WP3 (v3-stage). Phase -> game hour (docs/v3/INTEGRATION.md §3.1). Pure: no three, no vendor.
//
//   p = stage progress from game.clock (DayClockView): paused -> 1 − remaining/total, running -> 1 − (endsAt − now)/total
//
//   waiting, setup            10:00
//   day: discussion           11:00 + 4·p   (→ 15:00)      no clock: 11:00, or 15:00 once nominations are open
//   day: nominations          15:00 + 3·p   (→ 18:00)
//   bedtime                   18:30 + 1.25·p (→ 19:45 dusk)
//   first_night, night        23:00
//   dawn                      06:15 → 08:00 over a fixed client-side 20 s ease from phase entry
//   finished                  12:30
//
// HourClock smooths the shown hour: a change of more than 1 h in one step eases over 1.5 s (reduced motion:
// instant); smaller changes (the clock running) are followed directly.
import type { DayClockView, GamePhase } from '@ct/protocol';

export type StagePhase = GamePhase | 'waiting' | 'finished';

export const HOURS = {
  waiting: 10,
  discussion: 11,
  nominations: 15,
  dayEnd: 18,
  bedtime: 18.5,
  dusk: 19.75,
  night: 23,
  dawn: 6.25,
  morning: 8,
  finished: 12.5,
} as const;
/** Dawn has no clock stage: a fixed client-side ease from phase entry. */
export const DAWN_EASE_MS = 20_000;
/** A jump larger than this (hours) eases instead of snapping. */
export const EASE_OVER_H = 1;
export const EASE_MS = 1500;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : Number.isFinite(x) ? x : 0);
const smooth = (x: number) => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};
/** Hours wrapped into [0, 24). */
export const wrapHour = (h: number) => ((h % 24) + 24) % 24;

/** Stage progress 0..1 of a day clock (§3.1). No clock / no countdown: 0. */
export function clockProgress(clock: DayClockView | null | undefined, serverNow: number): number {
  if (!clock || !(clock.totalMs > 0)) return 0;
  if (clock.paused) return clamp01(1 - (clock.remainingMs ?? clock.totalMs) / clock.totalMs);
  if (clock.endsAt != null) return clamp01(1 - (clock.endsAt - serverNow) / clock.totalMs);
  return 0;
}

export interface HourInput {
  phase: StagePhase;
  clock?: DayClockView | null;
  /** day.nominationsOpen (used only when no clock tells the stage). */
  nominationsOpen?: boolean;
  /** Server ms now (net/serverTime serverNow()). */
  serverNow: number;
  /** ms since the client saw the phase start (dawn ease). */
  sincePhaseMs: number;
}

/** The target hour of the current game stage (§3.1 table). */
export function stageHour(i: HourInput): number {
  switch (i.phase) {
    case 'waiting':
    case 'setup':
      return HOURS.waiting;
    case 'day': {
      const stage = i.clock?.stage;
      if (stage === 'nominations') return HOURS.nominations + 3 * clockProgress(i.clock, i.serverNow);
      if (stage === 'bedtime') return HOURS.bedtime + 1.25 * clockProgress(i.clock, i.serverNow);
      if (stage === 'discussion') return HOURS.discussion + 4 * clockProgress(i.clock, i.serverNow);
      return i.nominationsOpen ? HOURS.nominations : HOURS.discussion;
    }
    case 'bedtime':
      return HOURS.bedtime + 1.25 * (i.clock?.stage === 'bedtime' ? clockProgress(i.clock, i.serverNow) : 0);
    case 'first_night':
    case 'night':
      return HOURS.night;
    case 'dawn':
      return HOURS.dawn + (HOURS.morning - HOURS.dawn) * smooth(i.sincePhaseMs / DAWN_EASE_MS);
    case 'finished':
      return HOURS.finished;
    default:
      return HOURS.waiting;
  }
}

/**
 * Signed hour delta from `from` to `to` along the way the clock should travel: forward (the day goes on)
 * unless that is more than 14 h, then backward (e.g. finished 12:30 → a new lobby's 10:00).
 */
export function hourDelta(from: number, to: number): number {
  const f = wrapHour(to - from);
  return f <= 14 ? f : f - 24;
}

export interface HourClock {
  /** The shown hour for this frame (wrapped 0..24). */
  step(target: number, nowMs: number, reducedMotion: boolean): number;
  readonly hour: number;
  /** An ease is running. */
  readonly easing: boolean;
}

export function createHourClock(initial: number): HourClock {
  let shown = wrapHour(initial);
  let ease: { from: number; t0: number } | null = null;
  return {
    get hour() {
      return shown;
    },
    get easing() {
      return ease !== null;
    },
    step(target, nowMs, reducedMotion) {
      const goal = wrapHour(target);
      if (reducedMotion) {
        ease = null;
        shown = goal;
        return shown;
      }
      if (!ease && Math.abs(hourDelta(shown, goal)) > EASE_OVER_H) ease = { from: shown, t0: nowMs };
      if (ease) {
        const k = smooth((nowMs - ease.t0) / EASE_MS);
        // ease toward the (possibly still moving) target from where the jump started
        shown = wrapHour(ease.from + hourDelta(ease.from, goal) * k);
        if (k >= 1) {
          ease = null;
          shown = goal;
        }
        return shown;
      }
      shown = goal;
      return shown;
    },
  };
}

/** The time of day reads as dark (lanterns, dais night): the vendor's "it is night" ramps, 19:00-06:30. */
export function darkness(h: number): number {
  const x = wrapHour(h);
  if (x >= 12) return smooth((x - 19) / 1.5);
  return 1 - smooth((x - 5) / 1.5);
}
