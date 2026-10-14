import { z } from 'zod';

// ---------------------------------------------------------------------------------------
// Game (rules) contracts. Co-owned: rules-storyteller may extend this file (additively) and
// must record contract changes in docs/architecture.md. The server NEVER sends the server-only
// GameState; it sends PlayerGameView / StorytellerGameView produced by @ct/rules projections.

export const CHARACTER_IDS = [
  // Townsfolk
  'washerwoman',
  'librarian',
  'investigator',
  'chef',
  'empath',
  'fortune_teller',
  'undertaker',
  'monk',
  'ravenkeeper',
  'virgin',
  'slayer',
  'soldier',
  'mayor',
  // Outsiders
  'butler',
  'drunk',
  'recluse',
  'saint',
  // Minions
  'poisoner',
  'spy',
  'scarlet_woman',
  'baron',
  // Demon
  'imp',
] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];
export const CharacterIdSchema = z.enum(CHARACTER_IDS);

export type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export type Alignment = 'good' | 'evil';

/**
 * setup       ST assigns characters in the Grimoire (players are in town, no roles yet)
 * first_night first night (players locked in homes)
 * day         discussion / nominations / votes
 * bedtime     bell rang, countdown to walk home (auto-return at expiry)
 * night       players locked in homes; ST visits
 * dawn        ST reviews night results before publishing deaths
 * finished    winner declared, full reveal
 */
export const GAME_PHASES = ['setup', 'first_night', 'day', 'bedtime', 'night', 'dawn', 'finished'] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export interface PublicPlayerView {
  pid: string;
  seat: number;
  name: string;
  alive: boolean;
  ghostVoteAvailable: boolean;
  nominatedToday: boolean;
  wasNominatedToday: boolean;
  connected: boolean;
}

/** What the player has been told about their own character (Drunk sees a Townsfolk). */
export interface MyRoleView {
  character: CharacterId;
  characterType: CharacterType;
  alignment: Alignment;
}

export interface NominationView {
  id: string;
  nominatorSeat: number;
  nomineeSeat: number;
  status: 'pending' | 'voting' | 'tallied' | 'cancelled';
  /** seat -> vote, filled as the clock hand passes; hidden votes are not supported. */
  votes: Record<number, boolean>;
  /** Seat whose vote is currently being collected (clockwise from nominee). */
  currentVoterSeat: number | null;
  voteCount: number;
  /** Votes needed to put the nominee on the block: ceil(alive/2), or > current block count. */
  threshold: number;
}

export interface DayView {
  nominationsOpen: boolean;
  nominations: NominationView[];
  onTheBlock: { seat: number; votes: number } | null;
  executedSeat: number | null;
}

export const PROMPT_KINDS = ['choose_players', 'choose_character', 'yes_no', 'acknowledge'] as const;
export type PromptKind = (typeof PROMPT_KINDS)[number];

export interface PromptView {
  id: string;
  kind: PromptKind;
  title: string;
  body?: string;
  minTargets?: number;
  maxTargets?: number;
  allowSelf?: boolean;
  allowDead?: boolean;
  characterOptions?: CharacterId[];
}

/** Structured private information delivered by the Storyteller (or the engine on ST approval). */
export interface InfoView {
  id: string;
  day: number;
  phase: GamePhase;
  text: string;
  seats?: number[];
  characters?: CharacterId[];
  number?: number;
  yes?: boolean;
}

export interface AnnouncementView {
  id: string;
  at: number;
  kind: 'phase' | 'death' | 'execution' | 'storyteller' | 'nomination' | 'game_over';
  text: string;
}

export interface GameResult {
  winner: Alignment;
  reason: string;
  reveal: { seat: number; pid: string; name: string; character: CharacterId; alignment: Alignment; alive: boolean }[];
}

export interface PlayerGameView {
  kind: 'player';
  phase: GamePhase;
  dayNumber: number;
  phaseEndsAt: number | null;
  players: PublicPlayerView[];
  you: {
    pid: string;
    seat: number;
    alive: boolean;
    ghostVoteAvailable: boolean;
    canNominate: boolean;
    role: MyRoleView | null;
  };
  day: DayView | null;
  prompts: PromptView[];
  info: InfoView[];
  announcements: AnnouncementView[];
  /** True only while the Storyteller is visiting THIS player's home. */
  storytellerVisitingYou: boolean;
  result: GameResult | null;
}

// Player C2S payloads
export const NominateMsg = z.object({ nomineeSeat: z.number().int().min(0).max(14) });
export const VoteMsg = z.object({ nominationId: z.string().min(1).max(64), vote: z.boolean() });
export const PromptResponseMsg = z.object({
  promptId: z.string().min(1).max(64),
  seats: z.array(z.number().int().min(0).max(14)).max(15).optional(),
  character: CharacterIdSchema.optional(),
  yes: z.boolean().optional(),
});
/** Public "I am the Slayer" shot; anyone may attempt, only a real healthy Slayer's shot can kill. */
export const SlayerShotMsg = z.object({ targetSeat: z.number().int().min(0).max(14) });
