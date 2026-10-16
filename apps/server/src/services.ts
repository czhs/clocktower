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
import { authRouter, errorMiddleware, HttpError, mutationGuard } from './auth/http.js';
import { Revocations } from './auth/revocation.js'; // (v2.3 AUTH-1)
import { ScryptGate } from './auth/limits.js'; // (v2.3 AUTH-2)
import { accountRouter } from './auth/account.js'; // (v2.3 AUTH-5/6)
import { createTicketService, type TicketService } from './directory/tickets.js';
import { LobbyDirectory } from './directory/service.js';
import { lobbiesRouter } from './directory/http.js';
import { adminRouter } from './admin/http.js';
import { createModeration, type ModerationService } from './moderation/service.js'; // (v2.3 OPS)
import { moderationGate } from './moderation/gate.js'; // (v2.3 OPS)
import { createSettings, type SettingsRegistry } from './settings/index.js'; // (v2.3 sec-ops settings registry)

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
  /** (v2.3 AUTH-1) Session revocations fan out to live rooms and SSE streams. */
  revocations: Revocations;
  /** (v2.3 AUTH-2) Global scrypt concurrency gate (sign-up, sign-in, step-up re-authentication). */
  scryptGate: ScryptGate;
  /** (v2.3 OPS-1/2/6) suspensions, network blocks, ops switches, lobby moderation, reports. */
  moderation: ModerationService;
  /** (v2.3 sec-ops) typed security / limits settings (admin console "Security & limits"). */
  settings: SettingsRegistry;
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
  const settings = createSettings(repos.database, config, log); // (v2.3 sec-ops) before anything that reads a knob
  log.info('database ready', { env: config.env });
  const revocations = new Revocations((e) => log.warn('revocation listener failed', { err: e instanceof Error ? e.message : String(e) }));
  const scryptGate = new ScryptGate({
    slots: settings.get<number>('auth.scryptSlots'), // (v2.3 settings; restart)
    maxQueue: settings.get<number>('auth.scryptQueue'),
    perRange: settings.get<number>('auth.scryptPerRange'),
    refuse: (why) =>
      why === 'range'
        ? new HttpError(429, 'rate_limited', 'Too many attempts, please wait a moment', 2)
        : new HttpError(503, 'rate_limited', 'The server is busy, please try again in a moment', 2),
  });
  const auth = createAuthService({
    revocations,
    sessionMaxMs: settings.get<number>('sessions.maxDays') * 86_400_000, // (v2.3 settings; env SESSION_MAX_DAYS wins)
    accounts: repos.accounts,
    sessions: repos.sessions,
    pepper: config.passphrasePepper,
    sessionTtlMs: settings.get<number>('sessions.idleDays') * 86_400_000, // (v2.3 settings; env SESSION_TTL_DAYS wins)
    adminIdleMs: settings.get<number>('admin.idleHours') * 3_600_000, // (v2.3 settings)
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
  revocations.subscribe((accountId, sid) => directory.revokeAccount(accountId, sid)); // (v2.3 AUTH-1)
  const moderation = createModeration({ database: repos.database, config, log, settings }); // (v2.3 OPS)
  // (v2.3 settings) per-network sign-up / sign-in buckets from the registry (read at start); tests may override.
  const rl = {
    ...DEFAULT_RATE_LIMITS,
    signIn: { capacity: settings.get<number>('auth.signinPerIpBurst'), refillPerSec: settings.get<number>('auth.signinPerIpPerMinute') / 60 },
    createAccount: { capacity: settings.get<number>('auth.signupPerIpBurst'), refillPerSec: 1 / (settings.get<number>('auth.signupPerIpMinutes') * 60) },
    ...options.rateLimits,
  };
  const purge = setInterval(() => {
    try {
      auth.purgeExpired();
      moderation.purge(); // (v2.3 OPS) expired blocks/suspensions, reports 90 d after resolution
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
    revocations,
    scryptGate,
    moderation,
    settings,
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
  api.use(moderationGate(services)); // (v2.3 OPS-1/2) network blocks, sign-up mode, maintenance
  api.use(authRouter(services));
  api.use(accountRouter(services)); // (v2.3 AUTH-5/6) /api/me/export, /api/me/delete
  api.use(lobbiesRouter(services, { heartbeatMs: services.options.sseHeartbeatMs }));
  api.use(adminRouter(services));
  api.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such API route' });
  });
  app.use('/api', api);
  // Also catches body-parser errors (malformed JSON / too large) raised by express.json().
  app.use(errorMiddleware(services));
}
