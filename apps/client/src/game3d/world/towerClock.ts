// v3 WP3 (v3-stage). The clock tower as the Storyteller's timer (user request in flight 2, docs/v3/INTEGRATION.md
// §9.1): the tower dial + an in-universe digital readout show the game's stage countdown (`game.clock`,
// DayClockView: set / paused / extended by the Storyteller from the ST panel, or by the automatic storyteller),
// and fall back to the time-of-day hands when no timer runs. Pure: no three, no vendor.
//
// The vendor clock tower does not expose a timer face yet (src/town/pieces/clocktower.js api = {setTime, ring,
// setDoor, setLit, time}; createTime gates setTime / ring). Until the pixel3d session publishes the API requested
// in §9.2 (`setTimer(plan | null)`), vendor/town.ts towerTimerApi() returns null and the stage keeps the hours on
// the time-of-day hands; nothing here fakes a readout.
import type { ClockStage, DayClockView } from '@ct/protocol';

export interface TowerTimerPlan {
  stage: ClockStage;
  /** ms left (>= 0) */
  remainingMs: number;
  totalMs: number;
  paused: boolean;
  /** 0..1 of the stage elapsed (the dial sweep) */
  progress: number;
  /** "m:ss" (or "h:mm:ss" from one hour), the in-universe digital readout text */
  readout: string;
}

/** "m:ss" / "h:mm:ss" of a duration, rounded UP to the second (a countdown shows 0:01 until it is really over). */
export function timerReadout(ms: number): string {
  const s = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * The timer the tower should show for this game view, or null (no clock / cleared / not counting: the hands show
 * the time of day). `serverNow` = net/serverTime serverNow().
 */
export function towerTimer(clock: DayClockView | null | undefined, serverNow: number): TowerTimerPlan | null {
  if (!clock || !(clock.totalMs > 0)) return null;
  let remainingMs: number;
  if (clock.paused) {
    if (clock.remainingMs == null) return null;
    remainingMs = clock.remainingMs;
  } else {
    if (clock.endsAt == null) return null;
    remainingMs = clock.endsAt - serverNow;
  }
  remainingMs = Math.max(0, Math.min(clock.totalMs, remainingMs));
  return {
    stage: clock.stage,
    remainingMs,
    totalMs: clock.totalMs,
    paused: !!clock.paused,
    progress: 1 - remainingMs / clock.totalMs,
    readout: timerReadout(remainingMs),
  };
}

/**
 * The whole second towerTimer(clock, serverNow) would show (its readout's second), or -1 when it would return null.
 * Allocation-free: the stage recomputes the plan only when the clock object or this number changes.
 */
export function timerTick(clock: DayClockView | null | undefined, serverNow: number): number {
  if (!clock || !(clock.totalMs > 0)) return -1;
  let ms: number;
  if (clock.paused) {
    if (clock.remainingMs == null) return -1;
    ms = clock.remainingMs;
  } else {
    if (clock.endsAt == null) return -1;
    ms = clock.endsAt - serverNow;
  }
  ms = Math.max(0, Math.min(clock.totalMs, ms));
  return Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
}

/** Key of what the tower shows (the stage writes the vendor api only when it changed: once a second at most). */
export function timerKey(p: TowerTimerPlan | null): string {
  return p ? `${p.stage}|${p.paused ? 'p' : 'r'}|${p.readout}|${p.totalMs}` : 'tod';
}
