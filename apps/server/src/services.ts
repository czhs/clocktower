// OWNED BY lobby-auth. Composition root for persistent services: database, accounts/sessions,
// lobby directory, stats, voice usage. `registerHttpRoutes` mounts /api/auth, /api/me,
// /api/lobbies (+SSE stream), /api/admin.
import express, { type Express } from 'express';
import { matchMaker } from '@colyseus/core';
import {
  openRepositories,
  type AccountsRepo,
  type Database,
  type SessionsRepo,
  type StatsRepo,
} from '@ct/db';
import type { VoiceUsageStore } from '@ct/voice';
import type { AppConfig } from './config.js';
import type { GameModule, Logger, ModuleFactory, VoiceModule, WorldModule } from './rooms/modules.js';
import { createAuthService, type AuthService } from './auth/service.js';
import { RateLimiter, type BucketSpec } from './auth/rateLimit.js';
import { authRouter, errorMiddleware, mutationGuard } from './auth/http.js';
import { createTicketService, type TicketService } from './directory/tickets.js';
import { LobbyDirectory } from './directory/service.js';
import { lobbiesRouter } from './directory/http.js';
import { adminRouter } from './admin/http.js';

export interface RateLimitConfig {
  /** per client IP */
  signIn: BucketSpec;
  /** per client IP */
  createAccount: BucketSpec;
  /** per account */
  createLobby: BucketSpec;
  /** per account */
  ticket: BucketSpec;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  signIn: { capacity: 8, refillPerSec: 1 / 15 }, // burst 8, then 4/min
  createAccount: { capacity: 5, refillPerSec: 1 / 120 }, // burst 5, then 1 per 2 min
  createLobby: { capacity: 4, refillPerSec: 1 / 30 },
  ticket: { capacity: 20, refillPerSec: 1 },
};

export interface ServiceOptions {
  rateLimits?: Partial<RateLimitConfig>;
  /** scrypt N override (tests only; production uses the default). */
  scryptN?: number;
  /** Override room creation (unit tests without a Colyseus server). */
  createRoom?: (lobbyId: string) => Promise<{ roomId: string }>;
  /** SSE heartbeat interval override (tests). */
  sseHeartbeatMs?: number;
  /** Replace the gameplay module factories (tests drive the lobby lifecycle with fakes). */
  moduleFactories?: { game?: ModuleFactory<GameModule>; world?: ModuleFactory<WorldModule>; voice?: ModuleFactory<VoiceModule> };
  /** Waiting-room disconnect grace override in seconds (tests). */
  waitingGraceSec?: number;
}

export interface Services {
  config: AppConfig;
  log: Logger;
  database: Database;
  accounts: AccountsRepo;
  sessions: SessionsRepo;
  stats: StatsRepo;
  /** Voice teammate: participant-ms accounting per env/month. */
  voiceUsage: VoiceUsageStore;
  auth: AuthService;
  tickets: TicketService;
  directory: LobbyDirectory;
  limits: { signIn: RateLimiter; createAccount: RateLimiter; createLobby: RateLimiter; ticket: RateLimiter };
  options: ServiceOptions;
  close(): Promise<void>;
}

let current: Services | null = null;

/** Process-wide services singleton (rooms read it; Colyseus room options must stay serialisable). */
export function getServices(): Services {
  if (!current) throw new Error('services not initialised');
  return current;
}

export async function createServices(config: AppConfig, log: Logger, options: ServiceOptions = {}): Promise<Services> {
  const repos = openRepositories(config.databasePath);
  log.info('database ready', { env: config.env });
  const auth = createAuthService({
    accounts: repos.accounts,
    sessions: repos.sessions,
    pepper: config.passphrasePepper,
    sessionTtlMs: config.sessionTtlDays * 86_400_000,
    adminAccountIds: config.adminAccountIds,
    log,
    scryptN: options.scryptN,
  });
  const tickets = createTicketService(config.sessionSecret);
  const directory = new LobbyDirectory({
    log,
    tickets,
    lobbyMaxCount: config.lobbyMaxCount,
    playerMaxPerLobby: config.playerMaxPerLobby,
    createRoom: options.createRoom ?? (async (lobbyId) => matchMaker.createRoom('game', { lobbyId })),
  });
  const rl = { ...DEFAULT_RATE_LIMITS, ...options.rateLimits };
  const purge = setInterval(() => {
    try {
      auth.purgeExpired();
    } catch (e) {
      log.warn('session purge failed', { err: e instanceof Error ? e.message : String(e) });
    }
  }, 3_600_000);
  purge.unref();

  const services: Services = {
    config,
    log,
    database: repos.database,
    accounts: repos.accounts,
    sessions: repos.sessions,
    stats: repos.stats,
    voiceUsage: repos.voiceUsage,
    auth,
    tickets,
    directory,
    limits: {
      signIn: new RateLimiter(rl.signIn),
      createAccount: new RateLimiter(rl.createAccount),
      createLobby: new RateLimiter(rl.createLobby),
      ticket: new RateLimiter(rl.ticket),
    },
    options,
    close: async () => {
      clearInterval(purge);
      repos.database.close();
      if (current === services) current = null;
    },
  };
  current = services;
  return services;
}

export function registerHttpRoutes(app: Express, services: Services): void {
  const api = express.Router();
  api.use(mutationGuard(services));
  api.use(authRouter(services));
  api.use(lobbiesRouter(services, { heartbeatMs: services.options.sseHeartbeatMs }));
  api.use(adminRouter(services));
  api.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such API route' });
  });
  app.use('/api', api);
  // Also catches body-parser errors (malformed JSON / too large) raised by express.json().
  app.use(errorMiddleware(services));
}
