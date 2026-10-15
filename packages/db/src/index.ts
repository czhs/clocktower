// @ct/db — SQLite (WAL, foreign keys) + Drizzle schema, startup migrations, repositories and
// online backups. One DB file per environment (DATABASE_URL). Owned by lobby-auth.
export { openDatabase, resolveDatabasePath, runMigrations, type Database, type Drizzle } from './database.js';
export { MIGRATIONS, type Migration } from './migrations.js';
export * as schema from './schema.js';
export {
  createAccountsRepo,
  DuplicateLookupError,
  type AccountCredentials,
  type AccountRecord,
  type AccountsRepo,
  type NewAccount,
} from './repos/accounts.js';
export { createSessionsRepo, type SessionRecord, type SessionsRepo } from './repos/sessions.js';
export { createStatsRepo, type MatchResult, type MatchStart, type StatsRepo } from './repos/stats.js';
export { createVoiceUsageRepo, usageMonth, type VoiceUsageStore } from './repos/voiceUsage.js';
export {
  createAdminRepo,
  type AdminAccountQuery,
  type AdminAccountRow,
  type AdminAccountSort,
  type AdminRepo,
  type AuditEntry,
  type AuditEntryInput,
} from './repos/admin.js';

import { openDatabase, type Database } from './database.js';
import { createAccountsRepo, type AccountsRepo } from './repos/accounts.js';
import { createSessionsRepo, type SessionsRepo } from './repos/sessions.js';
import { createStatsRepo, type StatsRepo } from './repos/stats.js';
import { createVoiceUsageRepo, type VoiceUsageStore } from './repos/voiceUsage.js';

export interface Repositories {
  database: Database;
  accounts: AccountsRepo;
  sessions: SessionsRepo;
  stats: StatsRepo;
  voiceUsage: VoiceUsageStore;
}

/** Opens (and migrates) the database and builds every repository on it. */
export function openRepositories(url: string): Repositories {
  const database = openDatabase(url);
  return {
    database,
    accounts: createAccountsRepo(database),
    sessions: createSessionsRepo(database),
    stats: createStatsRepo(database),
    voiceUsage: createVoiceUsageRepo(database),
  };
}
