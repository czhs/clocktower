import type { DirectoryPhase, VoiceUsageView } from '@ct/protocol';

// Response shapes of the admin console API (/api/admin/*). Mirrored by
// apps/client/src/ui/admin/types.ts — keep both in sync (see CONTRACT-REQUEST in ./schemas.ts).
// None of these ever carry passphrases (except the one-time rotation response), passphrase
// lookups/verifiers/salts, session tokens or token hashes.

export interface AdminAccountView {
  id: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
  gamesPlayed: number;
  gamesWon: number;
  gamesStorytold: number;
  activeSessions: number;
  /** From ADMIN_ACCOUNT_IDS (read-only here). */
  isAdmin: boolean;
  /** The requesting admin's own account. */
  isYou: boolean;
  /** Lobby the account currently holds a seat in (live, in-memory). */
  lobby: { id: string; name: string } | null;
}

export interface AdminAccountsPage {
  accounts: AdminAccountView[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminLobbyView {
  id: string;
  name: string;
  phase: DirectoryPhase;
  players: number;
  maxPlayers: number | null;
  connected: number;
  storytellerName: string | null;
  hostName: string | null;
  createdAt: string | null;
}

export interface AdminOverview {
  system: {
    env: string;
    version: string;
    node: string;
    startedAt: string;
    uptimeSec: number;
    memory: { rssMb: number; heapUsedMb: number };
    cpu: { load1: number; cores: number };
  };
  totals: { accounts: number; activeSessions: number; matches: number; matchesCompleted: number; lobbies: number; activeGames: number };
  lobbies: AdminLobbyView[];
  voice: VoiceUsageView;
  recentErrors: { at: number; message: string }[];
}

export interface AdminAuditView {
  id: number;
  at: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  detail: Record<string, unknown> | null;
}

export interface AdminRotateResponse {
  account: AdminAccountView;
  /** Shown to the admin exactly once; never stored or logged. */
  passphrase: string;
}

export interface AdminBulkDeleteResponse {
  deleted: { id: string; displayName: string }[];
  skipped: { id: string; displayName: string | null; reason: string }[];
}

/** (records) GET /api/admin/games — one saved game (the full record: GET /api/admin/games/:id). */
export interface AdminGameView {
  matchId: string;
  lobbyId: string;
  lobbyName: string | null;
  script: string | null;
  status: 'finished' | 'abandoned';
  startedAt: string;
  endedAt: string;
  durationSec: number;
  playerCount: number;
  winner: 'good' | 'evil' | null;
  reason: string | null;
  storytellerName: string | null;
  storytellerAccountId: string | null;
}

export interface AdminGamesPage {
  games: AdminGameView[];
  total: number;
}
