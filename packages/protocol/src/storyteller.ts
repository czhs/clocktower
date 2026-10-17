import { z } from 'zod';
import { DayClockCommand } from './clock.js';
import {
  CHARACTER_COUNT,
  CharacterIdSchema,
  PROMPT_KINDS,
  type Alignment,
  type AnnouncementView,
  type CharacterId,
  type DayView,
  type GamePhase,
  type GameResult,
  type InfoView,
  type PromptView,
  type PublicPlayerView,
} from './game.js';
import type { LocationId } from './world.js';

// ---------------------------------------------------------------------------------------
// Storyteller contracts. Co-owned by rules-storyteller (additive changes; log them in
// docs/architecture.md). StorytellerGameView is sent ONLY to the seated Storyteller client.

export interface GrimoireEntry {
  seat: number;
  pid: string;
  name: string;
  character: CharacterId;
  /** Drunk: the Townsfolk they believe they are. Otherwise equals character. */
  believedCharacter: CharacterId;
  alignment: Alignment;
  alive: boolean;
  ghostVoteAvailable: boolean;
  poisoned: boolean;
  drunk: boolean;
  protectedTonight: boolean;
  reminders: string[];
  /** (additive) Alive status as currently known to players (night deaths publish at day). */
  publicAlive?: boolean;
  /** (additive) Fortune Teller's red herring. */
  isRedHerring?: boolean;
  /** (additive) The Butler's current master. */
  isButlerMaster?: boolean;
  /** (additive) Once-per-game ability spent (Slayer shot, Virgin triggered). */
  abilityUsed?: boolean;
  /** (additive, gameplay) Prompts currently open for this player. */
  openPrompts?: PromptView[];
  /** (additive, gameplay) Recently sent prompts (open or answered), newest last; re-sendable. */
  sentPrompts?: { id: string; title: string; open: boolean }[];
  /** (additive, gameplay) Info this player has received (newest last, at most 20); re-sendable. */
  info?: InfoView[];
}

/**
 * (additive, gameplay) Where each player physically is, for the Storyteller's stage diagram.
 *   home      inside their own home          seated   on their circle spot (gathered)
 *   walking   outdoors, moving themselves    escorted the server is walking them (auto-walk)
 *   outdoors  outdoors, standing             inside   inside another building (`building`)
 */
export type StagePresence = 'home' | 'seated' | 'walking' | 'escorted' | 'outdoors' | 'inside';

export interface StagePlayerView {
  seat: number;
  pid: string;
  presence: StagePresence;
  /** Building id when presence is 'inside' (or 'home'). */
  building: string | null;
  frozen: boolean;
}

export interface StageView {
  players: StagePlayerView[];
  /** Door overrides: buildingId -> true locked / false forced open (absent = phase default). */
  doors: Record<string, boolean>;
  /** Storyteller's own location. */
  storytellerLocation: LocationId | null;
}

export type NightStepStatus = 'pending' | 'visiting' | 'prompted' | 'answered' | 'resolved' | 'skipped';

export interface NightStepView {
  id: string;
  seat: number | null; // null for "minion info"/"demon info" style group steps
  character: CharacterId | 'minion_info' | 'demon_info' | 'dusk' | 'dawn';
  status: NightStepStatus;
  /** Engine's suggested resolution text (truthful unless drunk/poisoned; ST may override). */
  suggestion?: string;
  /** Player's answer to the ST prompt, if any. */
  response?: { seats?: number[]; character?: CharacterId; yes?: boolean };
  /** (additive) Character the player wakes as (the Drunk wakes as their believed Townsfolk). */
  actingAs?: CharacterId;
  /** (additive) Player is drunk/poisoned: ability has no effect; ST may give false info. */
  impaired?: boolean;
  /** (additive) Ready-to-send prompt for this step (ST may edit before sending). */
  prompt?: PromptSpecInput;
  /** (additive) Engine-computed truthful info for this step (ST may edit before sending). */
  suggestedInfo?: InfoSpecInput;
  /** (additive) Registration ambiguity / adjudication notes (Spy, Recluse, Mayor bounce...). */
  notes?: string[];
}

export interface StorytellerGameView {
  kind: 'storyteller';
  /** (v2.1) The town clock (public; see clock.ts). */
  clock?: import('./clock.js').DayClockView | null;
  /** (v2.1) 'auto' never has a Storyteller view; present for symmetry. */
  storytellerMode?: import('./clock.js').StorytellerMode;
  phase: GamePhase;
  dayNumber: number;
  phaseEndsAt: number | null;
  players: PublicPlayerView[];
  grimoire: GrimoireEntry[];
  demonBluffs: CharacterId[];
  nightQueue: NightStepView[];
  day: DayView | null;
  announcements: AnnouncementView[];
  /** Seat whose home the ST is currently in (night visit), else null. */
  visitingSeat: number | null;
  travelSpeedMult: number;
  /** Rules-engine warnings for the ST (e.g. "Saint executed: evil wins unless overridden"). */
  alerts: string[];
  log: { at: number; text: string }[];
  result: GameResult | null;
  /** (additive) Configured bedtime countdown in seconds. */
  bedtimeSeconds?: number;
  /** (additive) Seats that died tonight but are not yet published (published when day starts). */
  pendingDeaths?: number[];
  /** (additive) Whether undo_last has a snapshot to restore. */
  canUndo?: boolean;
  /** (additive) Setup distribution for this player count (Baron already applied when assigned). */
  setupCounts?: { townsfolk: number; outsiders: number; minions: number; demons: number };
  /** (additive) True once characters are assigned (setup phase). */
  charactersAssigned?: boolean;
  /** (additive) Whether the Storyteller is connected (bedtime countdown pauses while not). */
  timerPaused?: boolean;
  /**
   * (additive) A game-ending result the engine detected (Saint executed, Mayor win, Demon dead,
   * two alive) awaiting the Storyteller: confirm_result ends the game, override_result continues.
   * Players see nothing until it is confirmed; undo_last still works meanwhile.
   */
  pendingResult?: { winner: Alignment; reason: string } | null;
  /** (additive, gameplay) The nomination circle is gathered. */
  gathering?: boolean;
  /** (additive, gameplay) Bedtime countdown over; stragglers are being walked home. */
  bedtimeOvertime?: boolean;
  /** (additive, gameplay) Bedtime countdown held by the Storyteller (bedtime_timer pause). */
  timerHeld?: boolean;
  /** (additive, gameplay) Remaining bedtime ms while the countdown is paused/held. */
  bedtimeRemainingMs?: number | null;
  /** (additive, gameplay) This bedtime leads into the FIRST night (rang from setup). */
  bedtimeFirstNight?: boolean;
  /** (additive, gameplay) Physical presence of every player (from the world module). */
  stage?: StageView | null;  /** (additive, gameplay) Storyteller settings (generic toggles; see `set_setting`). */
  settings?: StSettings;
}

/** (additive, gameplay) Storyteller settings. Add new toggles here (optional in StSettingsPatch). */
export interface StSettings {
  /** Door tags: players' icons hang on the door of the building they are in (daytime only). */
  doorTags: boolean;
  /** Seconds the vote clock hand spends on each seat. */
  voteSeconds: number;
  /**
   * (additive, records) Mid-game pamphlets: the Storyteller may release a PUBLIC-ONLY "Pamphlet: Day N"
   * (story:release crier_day / crier_game). Off by default; the end-of-game story is always available.
   */
  pamphlets?: boolean;
}
export const DEFAULT_ST_SETTINGS: StSettings = { doorTags: true, voteSeconds: 3, pamphlets: false };

const Seat = z.number().int().min(0).max(14);

export const PromptSpec = z.object({
  kind: z.enum(PROMPT_KINDS),
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  minTargets: z.number().int().min(0).max(15).optional(),
  maxTargets: z.number().int().min(0).max(15).optional(),
  allowSelf: z.boolean().optional(),
  allowDead: z.boolean().optional(),
  characterOptions: z.array(CharacterIdSchema).max(CHARACTER_COUNT).optional(),
  stepId: z.string().max(64).optional(),
});
export type PromptSpecInput = z.input<typeof PromptSpec>;

export const InfoSpec = z.object({
  text: z.string().min(1).max(500),
  seats: z.array(Seat).max(15).optional(),
  characters: z.array(CharacterIdSchema).max(CHARACTER_COUNT).optional(),
  number: z.number().int().min(0).max(99).optional(),
  yes: z.boolean().optional(),
  stepId: z.string().max(64).optional(),
});
export type InfoSpecInput = z.input<typeof InfoSpec>;

/** (additive, gameplay) A partial StSettings update (every key optional). */
export const StSettingsPatch = z
  .object({ doorTags: z.boolean().optional(), voteSeconds: z.number().min(0.5).max(15).optional(), pamphlets: z.boolean().optional() })
  .strict();
export type StSettingsPatch = z.infer<typeof StSettingsPatch>;

/** (additive, gameplay) Phases the Storyteller can force (`gather` = day + circle). */
export const FORCE_PHASES = ['setup', 'first_night', 'day', 'gather', 'bedtime', 'night', 'dawn'] as const;
export type ForcePhase = (typeof FORCE_PHASES)[number];

/** (additive, gameplay) Who a stage command applies to. */
export const StageWho = z.union([z.array(Seat).min(1).max(15), z.literal('all')]);
export type StageWho = z.infer<typeof StageWho>;

/** (additive, gameplay) Where a teleport / walk goes. 'storyteller' = next to the Storyteller. */
export const StageTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('seat') }),
  z.object({ kind: z.literal('home') }),
  z.object({ kind: z.literal('square') }),
  z.object({ kind: z.literal('storyteller') }),
  z.object({ kind: z.literal('building'), buildingId: z.string().min(1).max(32) }),
  z.object({ kind: z.literal('point'), x: z.number().finite().min(0).max(4096), y: z.number().finite().min(0).max(4096) }),
]);
export type StageTarget = z.infer<typeof StageTarget>;

/**
 * (additive, v2) Where the Storyteller teleports THEMSELVES (click-to-teleport): a map point (px; the
 * server picks the nearest free OUTDOOR spot) or the inside of a building (houses: the visit point,
 * so at night this IS a home visit).
 */
export const StSelfTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), x: z.number().finite().min(0).max(4096), y: z.number().finite().min(0).max(4096) }),
  z.object({ kind: z.literal('building'), buildingId: z.string().min(1).max(32) }),
]);
export type StSelfTarget = z.infer<typeof StSelfTarget>;

/** All ST actions, sent as C2S 'st:command'. Server rejects unless sender is the lobby's ST. */
export const StCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('random_setup') }),
  z.object({
    type: z.literal('assign_characters'),
    assignments: z.array(z.object({ seat: Seat, character: CharacterIdSchema })).min(5).max(15),
    drunkBelievesSeatCharacter: CharacterIdSchema.optional(),
    redHerringSeat: Seat.optional(),
    demonBluffs: z.array(CharacterIdSchema).max(3),
    /** (additive) Accept a distribution that differs from the standard setup table. */
    allowNonstandard: z.boolean().optional(),
  }),
  z.object({ type: z.literal('begin_first_night') }),
  z.object({ type: z.literal('advance_phase'), to: z.enum(['day', 'bedtime', 'night', 'dawn']) }),
  z.object({ type: z.literal('set_bedtime_seconds'), seconds: z.number().int().min(10).max(300) }),
  z.object({ type: z.literal('set_nominations_open'), open: z.boolean() }),
  z.object({ type: z.literal('start_vote'), nominationId: z.string().max(64) }),
  z.object({ type: z.literal('cancel_nomination'), nominationId: z.string().max(64) }),
  z.object({ type: z.literal('execute'), seat: Seat.nullable() }),
  z.object({ type: z.literal('kill'), seat: Seat, cause: z.string().max(80).optional(), announce: z.boolean() }),
  z.object({
    type: z.literal('set_alive'),
    seat: Seat,
    alive: z.boolean(),
    /** (additive) When reviving: also give back a spent ghost vote. */
    restoreGhostVote: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('set_status'),
    seat: Seat,
    poisoned: z.boolean().optional(),
    drunk: z.boolean().optional(),
    protectedTonight: z.boolean().optional(),
  }),
  z.object({ type: z.literal('set_ghost_vote'), seat: Seat, available: z.boolean() }),
  z.object({
    type: z.literal('change_character'),
    seat: Seat,
    character: CharacterIdSchema,
    alignment: z.enum(['good', 'evil']).optional(),
    notify: z.boolean(),
  }),
  z.object({ type: z.literal('add_reminder'), seat: Seat, token: z.string().min(1).max(40) }),
  z.object({ type: z.literal('remove_reminder'), seat: Seat, token: z.string().min(1).max(40) }),
  z.object({ type: z.literal('prompt_player'), seat: Seat, prompt: PromptSpec }),
  z.object({ type: z.literal('send_info'), seat: Seat, info: InfoSpec }),
  z.object({
    type: z.literal('resolve_step'),
    stepId: z.string().max(64),
    /** (additive) ST-chosen targets overriding/replacing the player's answer. */
    seats: z.array(Seat).max(3).optional(),
    /** (additive) Imp self-kill: which Minion becomes the Imp (Scarlet Woman still has priority). */
    starpassSeat: Seat.optional(),
    /** (additive) Mayor bounce: the player who dies instead of the Mayor. */
    redirectSeat: Seat.optional(),
    /**
     * (additive, multi-script) A character the resolution needs: the Courtier's and Gambler's
     * guesses, the character the Pit-Hag creates, the character the Cerenovus makes someone mad
     * about, the ability the Philosopher takes.
     */
    character: CharacterIdSchema.optional(),
  }),
  z.object({ type: z.literal('skip_step'), stepId: z.string().max(64) }),
  z.object({ type: z.literal('visit_home'), seat: Seat }),
  z.object({ type: z.literal('leave_home') }),
  z.object({ type: z.literal('announce'), text: z.string().min(1).max(300) }),
  z.object({ type: z.literal('set_travel_speed'), mult: z.number().min(1).max(4) }),
  z.object({ type: z.literal('declare_winner'), winner: z.enum(['good', 'evil']), reason: z.string().max(200) }),
  z.object({ type: z.literal('undo_last') }),
  /** (additive) Accept the pending game-ending result (the game finishes and is recorded). */
  z.object({ type: z.literal('confirm_result') }),
  /** (additive) Reject the pending game-ending result; the game continues. */
  z.object({ type: z.literal('override_result') }),
  /** (additive) Strike one counted vote (e.g. a Butler who voted without their master). */
  z.object({ type: z.literal('strike_vote'), nominationId: z.string().max(64), seat: Seat }),
  /** (additive) Change the Fortune Teller's red herring (must be a good player) or clear it. */
  z.object({ type: z.literal('set_red_herring'), seat: Seat.nullable() }),
  /** (additive) Change the Townsfolk the Drunk believes they are (the player is told). */
  z.object({ type: z.literal('set_drunk_belief'), seat: Seat, character: CharacterIdSchema }),

  // ---- (additive, gameplay 2026-10-15) "props": the Storyteller can override anything. The rules
  // engine only advises (alerts); none of these is gated on engine readiness.
  /** Jump to any phase. 'gather' = day + nomination circle. Skips block execution / Mayor checks. */
  z.object({ type: z.literal('force_phase'), to: z.enum(FORCE_PHASES) }),
  /** Mark (or dissolve) the nomination circle around the clock tower. */
  z.object({ type: z.literal('gather'), on: z.boolean() }),
  /** Start a vote on ANY nomination (pending, tallied or cancelled: votes reset); replaces a running vote. */
  z.object({ type: z.literal('force_vote'), nominationId: z.string().max(64) }),
  /** Create a nomination regardless of the rules (dead nominator, repeats, nominations closed). */
  z.object({ type: z.literal('create_nomination'), nominatorSeat: Seat, nomineeSeat: Seat, startVote: z.boolean().optional() }),
  /** End the running vote now: 'tally' locks every remaining hand and counts; 'cancel' discards it. */
  z.object({ type: z.literal('close_vote'), mode: z.enum(['tally', 'cancel']) }),
  /** Put a player on the block (with a vote count) or clear the block. */
  z.object({ type: z.literal('set_block'), seat: Seat.nullable(), votes: z.number().int().min(0).max(30).optional() }),
  /** Set one recorded vote of a nomination (adds or removes a counted vote). */
  z.object({ type: z.literal('set_vote'), nominationId: z.string().max(64), seat: Seat, vote: z.boolean() }),
  /** Execute (or declare no execution) ignoring the one-per-day rule and a running vote. */
  z.object({ type: z.literal('force_execute'), seat: Seat.nullable() }),
  /** Bedtime countdown: pause (hold), resume, extend by / restart with `seconds`. */
  z.object({ type: z.literal('bedtime_timer'), action: z.enum(['pause', 'resume', 'extend', 'restart']), seconds: z.number().int().min(1).max(600).optional() }),
  /** Re-send a prompt (open or answered) as a fresh prompt. */
  z.object({ type: z.literal('resend_prompt'), seat: Seat, promptId: z.string().min(1).max(64) }),
  /** Re-send a piece of info as a fresh copy. */
  z.object({ type: z.literal('resend_info'), seat: Seat, infoId: z.string().min(1).max(64) }),
  /** Teleport players (explicit Storyteller action; the only player teleport besides forced nightfall). */
  z.object({ type: z.literal('teleport'), who: StageWho, to: StageTarget }),
  /** Walk players (server-driven, normal walking speed) to a target; `to: null` stops the walk. */
  z.object({ type: z.literal('walk_to'), who: StageWho, to: StageTarget.nullable() }),
  /** Freeze / unfreeze player movement (server rejects their moves and door use). */
  z.object({ type: z.literal('freeze'), who: StageWho, frozen: z.boolean() }),
  /** Pause / resume the vote clock hand. */
  z.object({ type: z.literal('vote_clock'), action: z.enum(['pause', 'resume']) }),
  /** Change Storyteller settings (only the given keys); applies immediately, server-authoritative. */
  z.object({ type: z.literal('set_setting'), settings: StSettingsPatch }),
  /** Lock / force-open any door for players, or return it to the phase default. */
  z.object({ type: z.literal('door_lock'), buildingId: z.string().min(1).max(32), lock: z.enum(['locked', 'unlocked', 'default']) }),
  /** (additive, v2) Storyteller click-to-teleport of themselves (seated Storyteller only; also allowed while waiting). */
  z.object({ type: z.literal('teleport_self'), to: StSelfTarget }),
  // (v2.1) the town clock (clock.ts)
  DayClockCommand,
]);
export type StCommand = z.infer<typeof StCommand>;
