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

export const CreateAccountRequest = z.object({ displayName: DisplayName });
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
  | 'internal';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
