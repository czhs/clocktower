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

export const InfoSpec = z.object({
  text: z.string().min(1).max(500),
  seats: z.array(Seat).max(15).optional(),
  characters: z.array(CharacterIdSchema).max(22).optional(),
  number: z.number().int().min(0).max(99).optional(),
  yes: z.boolean().optional(),
  stepId: z.string().max(64).optional(),
});

/** All ST actions, sent as C2S 'st:command'. Server rejects unless sender is the lobby's ST. */
export const StCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('random_setup') }),
  z.object({
    type: z.literal('assign_characters'),
    assignments: z.array(z.object({ seat: Seat, character: CharacterIdSchema })).min(5).max(15),
    drunkBelievesSeatCharacter: CharacterIdSchema.optional(),
    redHerringSeat: Seat.optional(),
    demonBluffs: z.array(CharacterIdSchema).max(3),
  }),
  z.object({ type: z.literal('begin_first_night') }),
  z.object({ type: z.literal('advance_phase'), to: z.enum(['day', 'bedtime', 'night', 'dawn']) }),
  z.object({ type: z.literal('set_bedtime_seconds'), seconds: z.number().int().min(10).max(300) }),
  z.object({ type: z.literal('set_nominations_open'), open: z.boolean() }),
  z.object({ type: z.literal('start_vote'), nominationId: z.string().max(64) }),
  z.object({ type: z.literal('cancel_nomination'), nominationId: z.string().max(64) }),
  z.object({ type: z.literal('execute'), seat: Seat.nullable() }),
  z.object({ type: z.literal('kill'), seat: Seat, cause: z.string().max(80).optional(), announce: z.boolean() }),
  z.object({ type: z.literal('set_alive'), seat: Seat, alive: z.boolean() }),
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
  z.object({ type: z.literal('resolve_step'), stepId: z.string().max(64) }),
  z.object({ type: z.literal('skip_step'), stepId: z.string().max(64) }),
  z.object({ type: z.literal('visit_home'), seat: Seat }),
  z.object({ type: z.literal('leave_home') }),
  z.object({ type: z.literal('announce'), text: z.string().min(1).max(300) }),
  z.object({ type: z.literal('set_travel_speed'), mult: z.number().min(1).max(4) }),
  z.object({ type: z.literal('declare_winner'), winner: z.enum(['good', 'evil']), reason: z.string().max(200) }),
  z.object({ type: z.literal('undo_last') }),
]);
export type StCommand = z.infer<typeof StCommand>;
