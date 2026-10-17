// OWNED BY clock-client (v2.1). Pure helpers behind the town-clock chip, the extension vote card,
// the automatic-game texts and the lobby mode / timings UI. No DOM, no Preact: unit-tested in
// apps/client/test/clock.logic.test.ts.
import {
  AUTO_DEFAULTS,
  type AutoTimings,
  type ClockProposalView,
  type DayClockView,
  type GamePhase,
  type StorytellerMode,
} from '@ct/protocol';

// ------------------------------------------------------------------------------- countdown

/** "3:12", "0:05", "1:02:03". Rounds UP to whole seconds (a countdown shows 0:00 only at zero). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * ms left on the clock (paused: the frozen remainder), or null when it is not set. A running clock
 * without endsAt but with remainingMs (bedtime overtime: remainingMs 0) uses the remainder.
 */
export function clockRemainingMs(c: DayClockView | null | undefined, now: number): number | null {
  if (!c) return null;
  if (c.paused || c.endsAt === null) return c.remainingMs === null || c.remainingMs === undefined ? null : Math.max(0, c.remainingMs);
  return Math.max(0, c.endsAt - now);
}

/** Below this the chip pulses (and the label turns urgent). */
export const URGENT_MS = 30_000;

export type ClockTone = 'discussion' | 'nominations' | 'bedtime' | 'paused';

export interface ClockLine {
  /** "Nominations open in", "Execution in", "Bedtime", "Paused", "Time for the execution"… */
  label: string;
  /** "3:12" (null = no countdown to show, e.g. the clock reached zero). */
  time: string | null;
  tone: ClockTone;
  /** Running and in the last 30 s. */
  urgent: boolean;
  /** Reached zero (the next stage is due). */
  due: boolean;
  /** Share of the stage left, 0..1 (for the mini dial). */
  fraction: number;
  /** Longer sentence for the tooltip / screen readers. */
  title: string;
}

/**
 * What the chip says. `onTheBlock` = somebody is on the block today (then the nominations stage ends
 * in an execution; otherwise "Nominations close").
 */
export function clockLine(c: DayClockView, now: number, opts: { onTheBlock?: boolean } = {}): ClockLine | null {
  const left = clockRemainingMs(c, now);
  if (left === null) return null;
  const time = formatCountdown(left);
  const fraction = c.totalMs > 0 ? Math.min(1, Math.max(0, left / c.totalMs)) : 0;
  const due = left <= 0;
  const block = !!opts.onTheBlock;
  const running: Record<DayClockView['stage'], [string, string, string]> = {
    // [label while counting, label at zero, tooltip noun]
    discussion: ['Nominations open in', 'Nominations open', 'until nominations open'],
    nominations: block ? ['Execution in', 'Time for the execution', 'until the execution'] : ['Nominations close in', 'Nominations close', 'until nominations close'],
    bedtime: ['Bedtime', 'Night falls', 'until night falls'],
  };
  const [label, dueLabel, noun] = running[c.stage];
  if (c.paused)
    return { label: 'Paused', time, tone: 'paused', urgent: false, due: false, fraction, title: `Town clock paused: ${time} ${noun}` };
  if (due) return { label: dueLabel, time: null, tone: c.stage, urgent: false, due: true, fraction: 0, title: dueLabel };
  return { label, time, tone: c.stage, urgent: left <= URGENT_MS, due: false, fraction, title: `Town clock: ${time} ${noun}` };
}

// ------------------------------------------------------------------------- extension proposal

export interface ProposalCardModel {
  id: string;
  minutes: number;
  /** "Ada proposes +2 min" / "You propose +2 min". */
  title: string;
  yes: number;
  no: number;
  needed: number;
  /** "3 of 5" (yes votes of the votes needed). */
  tally: string;
  /** Whole seconds left to vote (0 when closed). */
  secondsLeft: number;
  /** Share of the voting window left, 0..1 (window length assumed 30 s unless known). */
  fraction: number;
  /** Your recorded vote (or your pending tap). */
  my: 'yes' | 'no' | null;
  /** You made this proposal. */
  mine: boolean;
  /** Enough yes votes right now. */
  passing: boolean;
}

export const PROPOSAL_WINDOW_MS = 30_000;

export function proposalCard(
  p: ClockProposalView,
  ctx: { myPid: string | null; nameOf: (pid: string) => string; now: number; pending?: { id: string; yes: boolean } | null },
): ProposalCardModel {
  const mine = !!ctx.myPid && p.by === ctx.myPid;
  const recorded = ctx.myPid ? (p.yes.includes(ctx.myPid) ? 'yes' : p.no.includes(ctx.myPid) ? 'no' : null) : null;
  const pending = ctx.pending && ctx.pending.id === p.id ? (ctx.pending.yes ? 'yes' : 'no') : null;
  const my = pending ?? recorded;
  // count the pending tap so the tally reacts instantly (the server view confirms it a moment later)
  let yes = p.yes.length;
  let no = p.no.length;
  if (pending && pending !== recorded) {
    if (pending === 'yes') yes++;
    else no++;
    if (recorded === 'yes') yes--;
    else if (recorded === 'no') no--;
  }
  const leftMs = Math.max(0, p.closesAt - ctx.now);
  const needed = Math.max(1, p.needed);
  return {
    id: p.id,
    minutes: p.minutes,
    title: `${mine ? 'You propose' : `${ctx.nameOf(p.by)} proposes`} +${p.minutes} min`,
    yes,
    no,
    needed,
    tally: `${yes} of ${needed}`,
    secondsLeft: Math.ceil(leftMs / 1000),
    fraction: Math.min(1, leftMs / PROPOSAL_WINDOW_MS),
    my,
    mine,
    passing: yes >= needed,
  };
}

export interface ProposalOutcome {
  id: string;
  minutes: number;
  passed: boolean;
  text: string;
}

/** End of the clock as a comparable number (running: endsAt; paused: remaining), or null. */
function clockEnd(c: DayClockView): number | null {
  return c.paused ? c.remainingMs : c.endsAt;
}

/**
 * The proposal that was open in `prev` has closed in `next`: did it pass? Prefers the clock itself
 * (the end moved later by about the proposed minutes); falls back to the last tally when the stage
 * changed meanwhile. Null when no proposal closed.
 */
export function proposalOutcome(prev: DayClockView | null | undefined, next: DayClockView | null | undefined): ProposalOutcome | null {
  const p = prev?.proposal;
  if (!p) return null;
  if (next?.proposal?.id === p.id) return null;
  let passed: boolean;
  const a = prev ? clockEnd(prev) : null;
  const b = next ? clockEnd(next) : null;
  if (next && prev && next.stage === prev.stage && next.paused === prev.paused && a !== null && b !== null) {
    passed = b - a >= p.minutes * 60_000 * 0.5 || next.totalMs - prev.totalMs >= p.minutes * 60_000 * 0.5;
  } else passed = p.yes.length >= Math.max(1, p.needed);
  return { id: p.id, minutes: p.minutes, passed, text: passed ? `+${p.minutes} min added` : 'Not extended' };
}

/** Optional server hints the AutoStoryteller may add to DayClockView (all honoured when present). */
export interface ClockLimitHints {
  /** False = proposing is not allowed right now (see proposeBlockedReason). */
  canPropose?: boolean;
  proposeBlockedReason?: string | null;
  /** Extensions left today (0 = none). */
  extensionsLeft?: number;
  /** Minutes of extension left today (caps the offered increments). */
  extensionMinutesLeft?: number;
  /** Largest single proposal (default 10, the protocol maximum). */
  maxProposalMinutes?: number;
  /** Server ms until which you may not propose again (per-player cooldown). */
  cooldownUntil?: number | null;
}

export const EXTEND_OPTIONS = [1, 2, 5] as const;

/**
 * Mirrors the server's per-player / per-day extension rules (apps/server/src/auto/extensions.ts
 * EXTENSION_RULES) so the chip can disable "+ time" with a reason up front. The server stays the
 * authority: a rejection still arrives as an error and is shown on the chip.
 */
export const LOCAL_LIMITS = { perPlayerCooldownMs: 60_000, perPlayerPerDay: 3, maxMinutesPerDay: 20 } as const;

/** What this client has seen today (reset on a new day / reload: the server re-checks anyway). */
export interface LocalExtensionLog {
  /** Server ms of my last proposal. */
  myLastAt?: number | null;
  /** My proposals today. */
  myCount?: number;
  /** Minutes the town added today. */
  added?: number;
}

export interface ProposeState {
  /** Show the "+ time" affordance at all (automatic games, players, day/bedtime). */
  show: boolean;
  allowed: boolean;
  /** Why not (tooltip). */
  reason?: string;
  /** Increments offered and whether each may be proposed. */
  options: { minutes: number; ok: boolean }[];
}

export function proposeState(
  view: { kind: 'player' | 'storyteller'; phase: GamePhase; storytellerMode?: StorytellerMode; clock?: DayClockView | null; result?: unknown },
  now: number,
  local: LocalExtensionLog = {},
): ProposeState {
  const none: ProposeState = { show: false, allowed: false, options: [] };
  const c = view.clock;
  if (view.storytellerMode !== 'auto' || view.kind !== 'player' || !c || view.result) return none;
  if (view.phase !== 'day' && view.phase !== 'bedtime') return none;
  const h = c as DayClockView & ClockLimitHints;
  const townLeft = LOCAL_LIMITS.maxMinutesPerDay - (local.added ?? 0);
  const max = Math.min(10, h.maxProposalMinutes ?? 10, h.extensionMinutesLeft ?? 10, townLeft);
  const options = EXTEND_OPTIONS.map((minutes) => ({ minutes, ok: minutes <= max }));
  const block = (reason: string): ProposeState => ({ show: true, allowed: false, reason, options: options.map((o) => ({ ...o, ok: false })) });
  const left = clockRemainingMs(c, now);
  if (c.proposal) return block('A vote on more time is already running');
  if (c.stage === 'bedtime') return block("Bedtime can't be extended");
  if (c.paused) return block('The clock is paused');
  if (left === null || left <= 0) return block("Time's up");
  if (h.canPropose === false) return block(h.proposeBlockedReason || 'Not allowed right now');
  if (h.extensionsLeft !== undefined && h.extensionsLeft <= 0) return block('No more extensions today');
  const cooldownUntil = Math.max(h.cooldownUntil ?? 0, local.myLastAt != null ? local.myLastAt + LOCAL_LIMITS.perPlayerCooldownMs : 0);
  if ((local.myCount ?? 0) >= LOCAL_LIMITS.perPlayerPerDay) return block(`You can ask at most ${LOCAL_LIMITS.perPlayerPerDay} times a day`);
  if (cooldownUntil > now) return block(`You can propose again in ${Math.ceil((cooldownUntil - now) / 1000)} s`);
  if (max < 1) return block('No more extension time today');
  return { show: true, allowed: true, options };
}

// ---------------------------------------------------------------------- automatic-game texts

/**
 * Texts written for a human Storyteller, re-voiced for automatic games ("The town wakes you…").
 * Human games get the text unchanged. Known HUD / hint sentences get a natural rewrite; anything
 * else falls back to "the Storyteller" -> "the town".
 */
export function townSays(text: string, mode: StorytellerMode | undefined): string {
  if (mode !== 'auto') return text;
  for (const [re, out] of AUTO_TEXT) if (re.test(text)) return text.replace(re, out);
  return text.replace(/\bThe Storyteller's\b/g, "The town's").replace(/\bthe Storyteller's\b/g, "the town's").replace(/\bThe Storyteller\b/g, 'The town').replace(/\bthe Storyteller\b/g, 'the town');
}

const AUTO_TEXT: [RegExp, string][] = [
  [/^The Storyteller is preparing the Grimoire\. Your character arrives with the first night\.$/, 'The town is dealing the characters. Yours arrives with the first night.'],
  [/^Explore and chat: the Storyteller is preparing the game\.$/, 'Explore and chat: the game begins in a moment.'],
  [/^Night: wait at home\. The Storyteller may visit you\.$/, 'Night: wait at home. The town wakes you here if your character acts.'],
  [/^The Storyteller is visiting you: this conversation is private\.$/, 'The town wakes you: your choice is private.'],
  [/^The Storyteller is walking you to your seat…$/, 'Walking you to your seat…'],
  [/^The Storyteller is walking you home…$/, 'Walking you home…'],
  [/^The Storyteller is guiding you…$/, 'Walking you…'],
  [/^The Storyteller has paused your movement\.$/, 'Your movement is paused.'],
  [/^Nominations aren't open yet: the Storyteller opens them\.$/, "Nominations aren't open yet: they open when the town clock runs out."],
  [/^Please wait for the Storyteller\.$/, 'Please wait a moment.'],
  [/^The Storyteller is in your home: private$/, 'The town wakes you: private'],
];

// ------------------------------------------------------------------------------- lobby mode

/** A lobby summary / room view's mode (read defensively: older servers omit it). */
export function modeOf(x: unknown): StorytellerMode {
  return (x as { storytellerMode?: unknown } | null | undefined)?.storytellerMode === 'auto' ? 'auto' : 'human';
}

export const MODE_COPY: Record<StorytellerMode, { title: string; line: string; badge: string }> = {
  human: { title: 'Storyteller', line: 'A player runs the game: wakes people at night, paces the day.', badge: 'Storyteller' },
  auto: { title: 'Automatic', line: 'No Storyteller: the town clock paces the day, nights run themselves.', badge: 'Automatic' },
};

export type TimingKey = keyof AutoTimings;

export interface TimingField {
  key: TimingKey;
  label: string;
  hint: string;
  /** The values the stepper walks through (sensible, not every integer). */
  steps: readonly number[];
}

export const TIMING_FIELDS: readonly TimingField[] = [
  { key: 'discussionMin', label: 'Discussion', hint: 'Talk before nominations open', steps: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30] },
  { key: 'nominationsMin', label: 'Nominations', hint: 'Nominate and vote', steps: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20] },
  { key: 'bedtimeSec', label: 'Bedtime', hint: 'Walk home', steps: [15, 30, 45, 60, 90, 120, 180] },
  { key: 'nightSec', label: 'Night', hint: 'Night choices', steps: [20, 30, 45, 60, 90, 120, 180, 240, 300] },
];

/** Current timings from a lobby summary / room view (defaults for anything missing). */
export function timingsOf(...sources: unknown[]): AutoTimings {
  const out: AutoTimings = { ...AUTO_DEFAULTS };
  for (const s of sources) {
    const t = (s as { autoTimings?: Record<string, unknown> | null } | null | undefined)?.autoTimings;
    if (!t) continue;
    for (const f of TIMING_FIELDS) if (typeof t[f.key] === 'number') out[f.key] = t[f.key] as number;
  }
  return out;
}

/** One stepper click: the next sensible value up / down (snaps an odd current value onto the list). */
export function stepTiming(t: AutoTimings, key: TimingKey, dir: 1 | -1): AutoTimings {
  const steps = TIMING_FIELDS.find((f) => f.key === key)!.steps;
  const cur = t[key];
  const next = dir > 0 ? steps.find((v) => v > cur) : [...steps].reverse().find((v) => v < cur);
  return next === undefined ? t : { ...t, [key]: next };
}

export function canStep(t: AutoTimings, key: TimingKey, dir: 1 | -1): boolean {
  return stepTiming(t, key, dir) !== t;
}

/** "5 min", "45 s", "1 min 30 s", "2 min". */
export function formatTiming(key: TimingKey, value: number): string {
  if (key === 'discussionMin' || key === 'nominationsMin') {
    const whole = Math.floor(value);
    const sec = Math.round((value - whole) * 60);
    return sec ? `${whole} min ${sec} s` : `${whole} min`;
  }
  if (value < 60) return `${value} s`;
  const m = Math.floor(value / 60);
  const s = value % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** One-line summary for the waiting room ("Day 5 + 4 min · night 1 min"). */
export function timingsSummary(t: AutoTimings): string {
  return `Talk ${formatTiming('discussionMin', t.discussionMin)} · nominate ${formatTiming('nominationsMin', t.nominationsMin)} · bedtime ${formatTiming('bedtimeSec', t.bedtimeSec)} · night ${formatTiming('nightSec', t.nightSec)}`;
}
