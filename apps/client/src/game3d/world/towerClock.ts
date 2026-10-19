// v3 WP3 (v3-stage) + C1 (integrator). The clock tower as the Storyteller's timer (user request in flight 2,
// docs/v3/INTEGRATION.md §9.1): while the game's stage countdown (`game.clock`, DayClockView: set / paused / extended by
// the Storyteller from the ST panel, or by the automatic storyteller) runs, the tower's four dials show it the v2 way
// (vendor pass B src/demo/towertimer.js drawDialFace: a stage-coloured wedge = the time left, one iron hand, pause
// bars, a flash at zero; drawn by vendor/town.ts createTowerFace over the piece's api.dials, its live hands hidden),
// and fall back to the time-of-day hands when no timer runs. The digital readout is the HUD clock chip (the user moved
// the in-universe readout into the HUD on the pixel3d side; the vendor's split-flap board is off). Pure: no three.
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

// ------------------------------------------------------------------------------------------------ the dial face (C1)

/** Wedge resolution (towertimer.js DIAL_STEPS: 2 deg). */
export const DIAL_STEPS = 180;
/** At zero the dials flash for this long (4 Hz), then hold 0 until DONE_HOLD_MS, then the hands come back. */
export const DONE_FLASH_MS = 6000;
export const DONE_HOLD_MS = 30_000;

export interface DialFace {
  mode: 'running' | 'paused' | 'done';
  stage: ClockStage;
  /** the wedge (time LEFT) in DIAL_STEPS steps: DIAL_STEPS = a full disc at the start, 0 = nothing left */
  q: number;
  flashOn: boolean;
  /** the dials glow (dusk to dawn): the vendor draws the wedge solid then */
  night: boolean;
}

/** The dials glow from 19:30 to 06:00 (towertimer.js dialsNight). */
export const dialsNight = (hour: number): boolean => hour >= 19.5 || hour < 6;

/**
 * What the tower's dials show for this clock (null = the time-of-day hands): running = the wedge of the time left,
 * paused = the dimmed wedge + pause bars, done (reached zero while running) = a flash for DONE_FLASH_MS, held until
 * DONE_HOLD_MS after zero. Writes into `out` when given (allocation-free per frame).
 */
export function dialFace(clock: DayClockView | null | undefined, serverNow: number, hour: number, out?: DialFace): DialFace | null {
  const p = towerTimer(clock, serverNow);
  if (!p || !clock) return null;
  const f = out ?? { mode: 'running', stage: 'discussion', q: 0, flashOn: false, night: false };
  f.stage = p.stage;
  f.night = dialsNight(hour);
  f.flashOn = false;
  if (p.paused) {
    f.mode = 'paused';
    f.q = Math.round((p.remainingMs / p.totalMs) * DIAL_STEPS);
    return f;
  }
  if (p.remainingMs > 0) {
    f.mode = 'running';
    f.q = Math.round((p.remainingMs / p.totalMs) * DIAL_STEPS);
    return f;
  }
  const since = clock.endsAt != null ? Math.max(0, serverNow - clock.endsAt) : 0;
  if (since > DONE_HOLD_MS) return null;
  f.mode = 'done';
  f.q = DIAL_STEPS;
  f.flashOn = since < DONE_FLASH_MS && Math.floor((since * 4) / 1000) % 2 === 0;
  return f;
}

/** Key of a dial face: the face geometry is rebuilt only when it changes ('tod' = the hands). */
export function dialFaceKey(f: DialFace | null): string {
  return f ? `${f.mode}|${f.stage}|${f.q}|${f.flashOn ? 1 : 0}|${f.night ? 1 : 0}` : 'tod';
}
