import { z } from 'zod';

// ---------------------------------------------------------------------------------------
// (v2.1, lead) The town clock + automatic (Storyteller-less) games.
//
// DAY CLOCK: a public countdown shown on the clock tower's face (and as a small HUD chip): how long
// until the next stage of the day — 'discussion' (until nominations open), 'nominations' (until the
// nomination window closes and the execution, if any, happens) — or the 'bedtime' walk home. Part of
// every game view as `clock` (public; identical for every viewer).
//   * Human Storyteller games: the ST sets / pauses / extends / clears it (StCommand 'day_clock');
//     the clock never forces anything — it is a prop. (The ST still moves the phases.)
//   * Automatic games: the server's AutoStoryteller runs the day by it and moves the phases when it
//     reaches zero. Players can PROPOSE an extension (+1..+10 min); everyone alive (ghosts too) votes;
//     a strict majority of the votes cast within the proposal window (30 s) passes it.

export const CLOCK_STAGES = ['discussion', 'nominations', 'bedtime'] as const;
export type ClockStage = (typeof CLOCK_STAGES)[number];

export interface ClockProposalView {
  id: string;
  /** Proposer pid. */
  by: string;
  minutes: number;
  /** Server ms when voting closes. */
  closesAt: number;
  yes: string[];
  no: string[];
  /** Votes needed to pass right now (strict majority of eligible voters). */
  needed: number;
}

export interface DayClockView {
  stage: ClockStage;
  /** Server ms when it reaches zero (null while paused / unset). */
  endsAt: number | null;
  /** While paused: ms left. */
  remainingMs: number | null;
  paused: boolean;
  /** Total length of this stage (ms), for drawing the dial. */
  totalMs: number;
  /** Automatic games: the open extension proposal (at most one at a time). */
  proposal?: ClockProposalView | null;
}

/** StCommand 'day_clock' (human games): set a stage countdown, pause/resume, add time, or clear. */
export const DayClockCommand = z.object({
  type: z.literal('day_clock'),
  action: z.enum(['set', 'pause', 'resume', 'add', 'clear']),
  stage: z.enum(CLOCK_STAGES).optional(),
  minutes: z.number().min(0.25).max(60).optional(),
});

/** C2S 'clock:propose' (automatic games): propose extending the clock. */
export const ClockProposeMsg = z.object({ minutes: z.number().int().min(1).max(10) });
/** C2S 'clock:vote' (automatic games). */
export const ClockVoteMsg = z.object({ id: z.string().min(1).max(32), yes: z.boolean() });

/** Lobby mode: a human Storyteller (default) or the automatic one (no Storyteller seat). */
export const STORYTELLER_MODES = ['human', 'auto'] as const;
export type StorytellerMode = (typeof STORYTELLER_MODES)[number];

/** Default automatic-game timings (minutes); the host may change them in lobby settings. */
export const AUTO_DEFAULTS = { discussionMin: 5, nominationsMin: 4, bedtimeSec: 45, nightSec: 60 } as const;
export const AutoTimings = z.object({
  discussionMin: z.number().min(1).max(30),
  nominationsMin: z.number().min(1).max(20),
  bedtimeSec: z.number().int().min(15).max(180),
  nightSec: z.number().int().min(20).max(300),
});
export type AutoTimings = z.infer<typeof AutoTimings>;
