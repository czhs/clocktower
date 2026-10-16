import { z } from 'zod';
import { Cosmetics } from './cosmetics.js';
import { DisplayName } from './text.js';

// HTTP API (same origin, JSON). Session = HttpOnly cookie `ct_session` (`ct_session_dev` in dev).
//   POST /api/auth/create   CreateAccountRequest -> CreateAccountResponse (sets cookie)
//   POST /api/auth/signin   SignInRequest        -> AccountView (sets cookie)
//   POST /api/auth/signout  {}                   -> { ok: true }
//   GET  /api/me                                 -> AccountView | 401
//   PATCH /api/me           UpdateProfileRequest -> AccountView
//   GET  /api/me/stats                           -> StatsView
// Errors: { error: ApiErrorCode, message: string } with 4xx/5xx status.

export const CreateAccountRequest = z.object({
  displayName: DisplayName,
  /** (v2.3 OPS-2) Required only while the server's sign-up mode is 'code' (invite code from the host). */
  inviteCode: z.string().max(128).optional(),
});
export type CreateAccountRequest = z.infer<typeof CreateAccountRequest>;

export const SignInRequest = z.object({ passphrase: z.string().min(10).max(256) });
export type SignInRequest = z.infer<typeof SignInRequest>;

export const UpdateProfileRequest = z
  .object({ displayName: DisplayName.optional(), cosmetics: Cosmetics.optional() })
  .refine((v) => v.displayName !== undefined || v.cosmetics !== undefined, 'empty update');
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

export interface RoleHistoryEntry {
  matchId: string;
  character: string;
  alignment: 'good' | 'evil';
  won: boolean;
  endedAt: string;
}

export interface StatsView {
  matchesPlayed: number;
  matchesCompleted: number;
  wins: number;
  losses: number;
  goodWins: number;
  evilWins: number;
  timesExecuted: number;
  timesDied: number;
  nominationsMade: number;
  ghostVotesUsed: number;
  gamesStorytold: number;
  roleHistory: RoleHistoryEntry[];
  // (v2.2 stats, additive) the home-screen record. Only ever the signed-in account's own data:
  // nothing here names or identifies another player.
  /** Games you played (as a player) that were abandoned; never counted as a win or a loss. */
  gamesAbandoned: number;
  /** wins / (wins + losses) in 0..1; null before your first finished game. */
  winRate: number | null;
  /** Finished games you ended on the good / evil team. */
  goodGames: number;
  evilGames: number;
  /** Your most-played characters in finished games (most games first, at most 3). */
  topCharacters: CharacterTally[];
  /** The roster (town) character you used most, over every game you played. */
  favouriteAvatar: { avatarId: string; games: number } | null;
  /** Consecutive wins ending with your latest finished game (0 if it was a loss). */
  currentWinStreak: number;
  bestWinStreak: number;
  /** Your last games (played or told, finished or abandoned), newest first, at most 5. */
  recentGames: RecentGame[];
}

export interface CharacterTally {
  character: string;
  games: number;
  wins: number;
}

export interface RecentGame {
  matchId: string;
  /** ISO time the game ended (or was abandoned). */
  endedAt: string;
  /** The lobby's name at game start (user text: render escaped). */
  lobbyName: string | null;
  as: 'player' | 'storyteller';
  status: 'finished' | 'abandoned';
  /**
   * Your character at the end (player games only). For an abandoned game (no final reveal) this is
   * the character you were TOLD you are (a Drunk sees their Townsfolk), never Grimoire secrets.
   */
  character: string | null;
  alignment: 'good' | 'evil' | null;
  /** Your roster character in that game. */
  avatarId: string | null;
  /** The winning team (finished games only). */
  winner: 'good' | 'evil' | null;
  /** 'won' / 'lost' (player, finished), 'told' (Storyteller, finished), 'abandoned'. */
  result: 'won' | 'lost' | 'told' | 'abandoned';
}

export interface AccountView {
  id: string;
  displayName: string;
  cosmetics: Cosmetics;
  createdAt: string;
  isAdmin: boolean;
}

export interface CreateAccountResponse {
  account: AccountView;
  /** Shown exactly once. Never logged, never stored in plaintext. */
  passphrase: string;
}

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'lobby_full'
  | 'lobby_started'
  | 'lobby_limit'
  // (v2.3 OPS-1/2, sec-ops)
  | 'suspended'
  | 'blocked'
  | 'signups_closed'
  | 'invite_required'
  | 'maintenance'
  // (v2.3 AUTH-8, sec-auth) a sensitive admin action needs the admin's passphrase again
  | 'reauth_required'
  | 'internal';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
