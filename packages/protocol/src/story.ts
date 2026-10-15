// (v2, records) "The story": the play-by-play of one game (built server-side by
// apps/server/src/records) and the pamphlets the Storyteller may release to the town.
//
// Secrecy:
//   * `story:st` (StoryStView) goes ONLY to the seated Storyteller: it contains everything
//     (characters, night info, statuses), exactly like their Grimoire.
//   * `story:pamphlet` / `story:pamphlets` go to everyone in the lobby. A mid-game pamphlet
//     ("Pamphlet: Day N", kind 'day') exists only when the Storyteller turned the `pamphlets` setting
//     on (StSettings, default off) and is built ONLY from public facts (announcements every player
//     received, phase headers, public votes). The end-of-game pamphlet (kind 'final', "The story of
//     this game") carries the full story + grimoire reveal and can only be released after the game
//     end was confirmed. Releasing is always optional: the Storyteller may tell the story themselves.
//   * All text is plain text; clients render it escaped (never innerHTML).
import { z } from 'zod';
import { cleanText } from './text.js';
import type { Alignment, CharacterId, GamePhase } from './game.js';

/** Who an entry is about. seat null = the Storyteller. */
export interface StoryActor {
  seat: number | null;
  pid: string;
}

export const STORY_ENTRY_KINDS = [
  'setup', // characters assigned / the game begins
  'phase', // phase change (headers: Night N / Day N / bedtime / dawn)
  'night_step', // the Storyteller woke someone (with their choice + what they were shown)
  'info', // private info given outside a night step
  'nomination',
  'vote', // a tallied vote: who raised a hand (incl. ghost votes), tally, threshold, result
  'vote_changed', // a Storyteller vote override (strike / set)
  'execution',
  'death',
  'revival',
  'ability', // Slayer shot, Virgin, star-pass, Scarlet Woman, ...
  'role_change',
  'status', // poisoned / drunk / protected / butler master / ghost vote ...
  'visit', // the Storyteller entered a home at night
  'storyteller', // Storyteller overrides (force phase, undo, kill, ...)
  'announcement', // public announcement (verbatim, as every player saw it)
  'result_pending',
  'result_overridden',
  'end', // the game end (winner + reason) or the game was abandoned
] as const;
export type StoryEntryKind = (typeof STORY_ENTRY_KINDS)[number];

export interface StoryEntry {
  /** ms since the game started. */
  t: number;
  /** epoch ms. */
  at: number;
  day: number;
  night: number;
  phase: GamePhase;
  kind: StoryEntryKind;
  actors: StoryActor[];
  /** Structured details (seats, characters, votes, ...); kind-specific, see docs/game-records.md. */
  data: Record<string, unknown>;
  /** One readable sentence. */
  text: string;
  /** Undone by the Storyteller later (kept for the audit trail; omitted from pamphlets). */
  undone?: boolean;
}

/** A titled group of entries (a "Night 2" / "Day 2" header in the play-by-play). */
export interface StorySection {
  title: string;
  day: number;
  night: number;
  entries: StoryEntry[];
}

export interface PamphletLine {
  text: string;
  /** Optional emphasis for the renderer. */
  tone?: 'death' | 'execution' | 'vote' | 'storyteller' | 'end';
}

export interface Pamphlet {
  /** Unique within the game, e.g. 'p1'. */
  id: string;
  /** 'day' = public-only story of the day (previous day + the night just ended); 'final' = the full story + reveal. */
  kind: 'day' | 'final';
  title: string;
  /** The Storyteller's own headline / flavour line (optional, plain text). */
  headline?: string;
  flavour?: string;
  /** Set when released (absent in previews). */
  releasedAt?: number;
  day: number;
  sections: { title: string; lines: PamphletLine[] }[];
  /** kind 'final' only: the grimoire reveal. */
  reveal?: { seat: number; name: string; character: CharacterId; startingCharacter: CharacterId; alignment: Alignment; alive: boolean }[];
  winner?: Alignment;
  reason?: string;
  /** Content digest of the pamphlet as previewed (a release must quote it: what the Storyteller saw is what is sent). */
  digest: string;
}

export const PAMPHLET_KINDS = ['day', 'final'] as const;
export type PamphletKind = (typeof PAMPHLET_KINDS)[number];

/** The Storyteller's story view (ST only). */
export interface StoryStView {
  /** Changes whenever the story changes (story:get with the same rev gets no reply). */
  rev: number;
  phase: GamePhase;
  finished: boolean;
  /** Every entry so far, grouped by Night / Day headers. */
  soFar: StorySection[];
  /** The previous day + the night just ended (or the cycle in progress). null before the first night. */
  ofTheDay: { title: string; sections: StorySection[] } | null;
  /** Mid-game pamphlets are enabled (StSettings.pamphlets). */
  pamphletsEnabled: boolean;
  /** Exactly what each release would send (null = not available now: setting off / game not over). */
  previews: Record<PamphletKind, Pamphlet | null>;
  released: Pamphlet[];
}

const cleaned = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform(cleanText)
    .pipe(z.string().max(max));

export const StoryGetMsg = z.object({ rev: z.number().int().min(0).optional() }).strict();
export const StoryReleaseMsg = z
  .object({
    kind: z.enum(PAMPHLET_KINDS),
    /** Digest of the preview the Storyteller saw: the release is refused if the content changed. */
    digest: z.string().max(64),
    headline: cleaned(120).optional(),
    flavour: cleaned(300).optional(),
  })
  .strict();
export const StoryPamphletsMsg = z.object({}).strict();
