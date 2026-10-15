import { z } from 'zod';
import {
  CharacterIdSchema,
  PROMPT_KINDS,
  type Alignment,
  type AnnouncementView,
  type CharacterId,
  type DayView,
  type GamePhase,
  type GameResult,
  type PublicPlayerView,
} from './game.js';

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
}

const Seat = z.number().int().min(0).max(14);

export const PromptSpec = z.object({
  kind: z.enum(PROMPT_KINDS),
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  minTargets: z.number().int().min(0).max(15).optional(),
  maxTargets: z.number().int().min(0).max(15).optional(),
  allowSelf: z.boolean().optional(),
  allowDead: z.boolean().optional(),
  characterOptions: z.array(CharacterIdSchema).max(22).optional(),
  stepId: z.string().max(64).optional(),
});
export type PromptSpecInput = z.input<typeof PromptSpec>;

export const InfoSpec = z.object({
  text: z.string().min(1).max(500),
  seats: z.array(Seat).max(15).optional(),
  characters: z.array(CharacterIdSchema).max(22).optional(),
  number: z.number().int().min(0).max(99).optional(),
  yes: z.boolean().optional(),
  stepId: z.string().max(64).optional(),
});
export type InfoSpecInput = z.input<typeof InfoSpec>;

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
]);
export type StCommand = z.infer<typeof StCommand>;
