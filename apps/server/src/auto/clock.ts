// OWNED BY auto-st. The town clock (packages/protocol/src/clock.ts): a public countdown shown on the
// clock tower's face. One DayClock per game (GameModule). Pure state + time arithmetic; no I/O.
//
//   * Human games: the Storyteller's StCommand 'day_clock' sets / pauses / resumes / extends / clears
//     it. It is a prop: reaching zero does nothing. It is cleared when the day ends (the phase leaves
//     'day'). During bedtime the view mirrors the engine's bedtime countdown instead (stage 'bedtime').
//   * Automatic games: the AutoStoryteller (./storyteller.ts) runs the day by it.
import type { ClockStage, DayClockView } from '@ct/protocol';
import type { GameState } from '@ct/rules';

export class DayClock {
  stage: ClockStage | null = null;
  /** Server ms when it reaches zero (null while paused / unset). */
  endsAt: number | null = null;
  /** While paused: ms left. */
  pausedRemainingMs: number | null = null;
  /** Length of this stage (initial length + extensions), for the dial. */
  totalMs = 0;

  get isSet(): boolean {
    return this.stage !== null;
  }

  get paused(): boolean {
    return this.stage !== null && this.pausedRemainingMs !== null;
  }

  set(stage: ClockStage, ms: number, now: number, paused = false): void {
    const len = Math.max(0, Math.round(ms));
    this.stage = stage;
    this.totalMs = len;
    if (paused) {
      this.endsAt = null;
      this.pausedRemainingMs = len;
    } else {
      this.endsAt = now + len;
      this.pausedRemainingMs = null;
    }
  }

  clear(): void {
    this.stage = null;
    this.endsAt = null;
    this.pausedRemainingMs = null;
    this.totalMs = 0;
  }

  /** ms left (0 when expired; null when unset). */
  remaining(now: number): number | null {
    if (this.stage === null) return null;
    if (this.pausedRemainingMs !== null) return this.pausedRemainingMs;
    return Math.max(0, (this.endsAt ?? now) - now);
  }

  /** A running (not paused) clock that reached zero. */
  expired(now: number): boolean {
    return this.stage !== null && this.pausedRemainingMs === null && this.endsAt !== null && now >= this.endsAt;
  }

  pause(now: number): boolean {
    if (this.stage === null || this.pausedRemainingMs !== null) return false;
    this.pausedRemainingMs = Math.max(0, (this.endsAt ?? now) - now);
    this.endsAt = null;
    return true;
  }

  resume(now: number): boolean {
    if (this.stage === null || this.pausedRemainingMs === null) return false;
    this.endsAt = now + this.pausedRemainingMs;
    this.pausedRemainingMs = null;
    return true;
  }

  /** Add time to the current stage (an expired clock restarts from zero + ms). */
  add(ms: number, now: number): boolean {
    if (this.stage === null) return false;
    const d = Math.round(ms);
    if (this.pausedRemainingMs !== null) this.pausedRemainingMs = Math.max(0, this.pausedRemainingMs + d);
    else this.endsAt = Math.max(now, this.endsAt ?? now) + d;
    this.totalMs = Math.max(this.totalMs + d, this.remaining(now) ?? 0);
    return true;
  }

  /** Shorten a running stage to at most `ms` left (the dial total is kept). */
  capRemaining(ms: number, now: number): boolean {
    const left = this.remaining(now);
    if (left === null || left <= ms) return false;
    if (this.pausedRemainingMs !== null) this.pausedRemainingMs = ms;
    else this.endsAt = now + ms;
    return true;
  }

  view(): DayClockView | null {
    if (this.stage === null) return null;
    return {
      stage: this.stage,
      endsAt: this.pausedRemainingMs !== null ? null : this.endsAt,
      remainingMs: this.pausedRemainingMs,
      paused: this.pausedRemainingMs !== null,
      totalMs: this.totalMs,
    };
  }
}

/**
 * The bedtime countdown mirrored into the clock (stage 'bedtime'): human and automatic games alike.
 * `totalMs` is the bedtime length, or the time that was left when the countdown was last (re)set if
 * that is longer (the Storyteller extended / restarted it), memoised so the view stays stable between
 * ticks (identical JSON = no re-send). Overtime (stragglers being walked home): remainingMs 0.
 */
export class BedtimeMirror {
  private key = '';
  private total = 0;

  view(s: GameState, now: number): DayClockView | null {
    if (s.phase !== 'bedtime') {
      this.key = '';
      return null;
    }
    const base = s.bedtimeSeconds * 1000;
    if (s.bedtimeOvertime) return { stage: 'bedtime', endsAt: null, remainingMs: 0, paused: false, totalMs: Math.max(base, this.total) };
    const key = `${s.phaseEndsAt}|${s.bedtimePausedRemainingMs}|${s.bedtimeSeconds}`;
    const left = s.phaseEndsAt !== null ? Math.max(0, s.phaseEndsAt - now) : (s.bedtimePausedRemainingMs ?? base);
    if (key !== this.key) {
      // A resume after a pause keeps the dial; a longer new countdown widens it.
      this.total = this.key === '' ? Math.max(base, left) : Math.max(this.total, base, left);
      this.key = key;
    }
    if (s.phaseEndsAt !== null) return { stage: 'bedtime', endsAt: s.phaseEndsAt, remainingMs: null, paused: false, totalMs: this.total };
    return { stage: 'bedtime', endsAt: null, remainingMs: left, paused: true, totalMs: this.total };
  }
}
