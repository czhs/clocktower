import type { Alignment, CharacterId, DirectoryPhase, StoryEntry, VoiceUsageView } from '@ct/protocol';

// MIRROR of apps/server/src/admin/types.ts (response shapes of /api/admin/*). Keep in sync.
// CONTRACT-REQUEST (lead): move these into packages/protocol/src/admin.ts and import from there.
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
  /** (v2.3 OPS-1) Suspension in force (null = none). */
  suspended?: { reason: string; until: string | null; at: string } | null;
  /** (v2.3 OPS-1) A last network is known (enables "Block network"); the address itself is never shown here. */
  networkKnown?: boolean;
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
  /** (v2.3 OPS-2/4) */
  ops?: AdminOpsView;
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

/** (records) GET /api/admin/games — one saved game. */
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

/**
 * (records) The parts of the full game record (GET /api/admin/games/:id, GameRecordV1 in
 * apps/server/src/records/types.ts, spec docs/game-records.md) the Games tab renders.
 */
export interface AdminGameRecord {
  version: number;
  matchId: string;
  status: 'finished' | 'abandoned';
  storyteller: { displayName: string; label: string; accountId: string | null } | null;
  seats: {
    seat: number;
    label: string;
    accountId: string | null;
    startingCharacter: CharacterId | null;
    finalCharacter: CharacterId | null;
    finalAlignment: Alignment | null;
    aliveAtEnd: boolean;
    won: boolean | null;
    death: { cause: string; day: number; night: number } | null;
  }[];
  result: { winner: Alignment; reason: string } | null;
  abandon: { reason: string } | null;
  timeline: StoryEntry[];
}

/** (v2.3 OPS-2/4) Panic switches + safety status (GET /api/admin/ops, AdminOverview.ops). */
export interface AdminOpsView {
  signups: { mode: 'open' | 'code' | 'closed'; codeSet: boolean; fromEnv: boolean };
  maintenance: { on: boolean; message: string; fromEnv: boolean };
  /** sec-voice kill switch (VOICE_DISABLED env wins). */
  voice: { on: boolean; disabledBy: 'env' | 'admin' | 'unknown' | null; reason: string | null };
  openReports: number;
  /** From the backup unit's `.last-backup` marker next to the DB (null = never written). */
  lastBackup: { at: string; ok: boolean; detail: string } | null;
}

export interface AdminIpBlockView {
  key: string;
  at: string | null;
  until: string | null;
  reason: string;
  adminAccountId: string;
}

export interface AdminReportLine {
  id: string;
  fromName: string;
  text: string;
  scope: string;
  at: number;
  fromAccountId: string;
}

export interface AdminReportView {
  id: number;
  at: string | null;
  reason: string;
  note: string | null;
  lobbyId: string;
  reporter: { accountId: string; name: string | null };
  target: { accountId: string; name: string | null; suspended: boolean };
  context: {
    lobby?: { id: string; name: string; phase: string };
    members?: { pid: string; name: string }[];
    lines?: AdminReportLine[];
  } | null;
  status: 'open' | 'resolved';
  resolvedAt: string | null;
  resolution: string | null;
}

/** (v2.3 sec-ops) GET /api/admin/settings ("Security & limits"). Mirrors apps/server/src/settings/registry.ts SettingView. */
export interface AdminSettingView {
  id: string;
  group: string;
  label: string;
  help: string;
  type: 'bool' | 'enum' | 'int' | 'duration' | 'string';
  value: boolean | number | string | null;
  default: boolean | number | string | null;
  min?: number;
  max?: number;
  options?: readonly string[];
  unit?: string;
  locked: boolean;
  envVar?: string;
  isSet?: boolean;
  sensitive: boolean;
  dangerous: boolean;
  applies: 'live' | 'restart';
  owner: string;
  isDefault: boolean;
}

export interface AdminSettingsPage {
  groups: { id: string; label: string }[];
  settings: AdminSettingView[];
  degraded: boolean;
}
