import { z } from 'zod';
import { readVoiceEnv } from './voice/env.js'; // (v2.3 sec-voice) VOICE_* cost/abuse knobs

// LEAD-OWNED. All runtime configuration comes from the environment (.env.development /
// .env.production on hshi-u1, loaded by the systemd unit or `node --env-file`).

const bool = z
  .enum(['true', 'false', '1', '0', 'auto'])
  .transform((v) => (v === 'auto' ? 'auto' : v === 'true' || v === '1'));

const Env = z.object({
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_PUBLIC_ORIGIN: z.string().url().default('http://localhost:3001'),
  DATABASE_URL: z.string().default('file:./data/dev/clocktower.db'),
  SESSION_SECRET: z.string().min(32),
  PASSPHRASE_PEPPER: z.string().min(32),
  COOKIE_SECURE: bool.default('auto'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(3650).default(90), // (v2.3 AUTH-4) absolute session lifetime
  LOBBY_MAX_COUNT: z.coerce.number().int().min(1).max(64).default(4),
  PLAYER_MAX_PER_LOBBY: z.coerce.number().int().min(5).max(15).default(15),
  LOBBY_IDLE_TIMEOUT_SEC: z.coerce.number().int().min(10).default(600),
  RECONNECT_GRACE_SEC: z.coerce.number().int().min(5).default(300),
  ADMIN_ACCOUNT_IDS: z.string().default(''),
  LIVEKIT_URL: z.string().default(''),
  LIVEKIT_API_KEY: z.string().default(''),
  LIVEKIT_API_SECRET: z.string().default(''),
  LIVEKIT_ROOM_PREFIX: z.string().regex(/^[a-z0-9]{1,16}$/).default('dev'),
  VOICE_MONTHLY_MINUTES: z.coerce.number().int().min(0).default(5000),
  LOG_DIR: z.string().default('./logs/dev'),
  // v2.3 HOST-04: server-wide sign-up budget (burst = per hour). 0 = unlimited. Default 100, unlimited in tests.
  HOST_SIGNUP_PER_HOUR: z.coerce.number().int().min(0).optional(),
  // (v2.3 OPS-2, sec-ops) panic switches; when set they override the admin console's runtime values.
  OPS_SIGNUP_MODE: z.enum(['open', 'code', 'closed']).optional(),
  OPS_SIGNUP_CODE: z.string().min(6).max(128).optional(),
  OPS_MAINTENANCE: bool.optional(),
  OPS_MAINTENANCE_MESSAGE: z.string().max(200).optional(),
  /** epoch ms (or ISO date): every session created before it is deleted at start-up (global sign-out). */
  OPS_SESSIONS_NOT_BEFORE: z.string().optional(),
  CLIENT_DIST: z.string().default(''),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // Never print values (they may be secrets) — only which keys are wrong.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration for: ${keys}`);
  }
  const e = parsed.data;
  const httpsOrigin = e.APP_PUBLIC_ORIGIN.startsWith('https://');
  return {
    env: e.APP_ENV,
    host: e.HOST,
    port: e.PORT,
    publicOrigin: e.APP_PUBLIC_ORIGIN.replace(/\/$/, ''),
    databasePath: e.DATABASE_URL.replace(/^file:/, ''),
    sessionSecret: e.SESSION_SECRET,
    passphrasePepper: e.PASSPHRASE_PEPPER,
    cookieSecure: e.COOKIE_SECURE === 'auto' ? httpsOrigin : e.COOKIE_SECURE,
    // SR-8: '__Host-' (Secure, Path=/, no Domain) stops sibling *.chrisshi.com hosts tossing cookies.
    cookieName:
      e.APP_ENV === 'production'
        ? `${httpsOrigin ? '__Host-' : ''}ct_session`
        : `ct_session_${e.APP_ENV === 'test' ? 'test' : 'dev'}`,
    sessionTtlDays: e.SESSION_TTL_DAYS,
    sessionMaxDays: e.SESSION_MAX_DAYS, // (v2.3 AUTH-4)
    lobbyMaxCount: e.LOBBY_MAX_COUNT,
    playerMaxPerLobby: e.PLAYER_MAX_PER_LOBBY,
    lobbyIdleTimeoutSec: e.LOBBY_IDLE_TIMEOUT_SEC,
    reconnectGraceSec: e.RECONNECT_GRACE_SEC,
    adminAccountIds: new Set(e.ADMIN_ACCOUNT_IDS.split(',').map((s) => s.trim()).filter(Boolean)),
    livekit: {
      url: e.LIVEKIT_URL,
      apiKey: e.LIVEKIT_API_KEY,
      apiSecret: e.LIVEKIT_API_SECRET,
      roomPrefix: e.LIVEKIT_ROOM_PREFIX,
      configured: Boolean(e.LIVEKIT_URL && e.LIVEKIT_API_KEY && e.LIVEKIT_API_SECRET),
    },
    voiceMonthlyMinutes: e.VOICE_MONTHLY_MINUTES,
    voice: readVoiceEnv(env), // (v2.3 sec-voice) caps, idle limits, kill switch, alerts — see voice/env.ts
    logDir: e.LOG_DIR,
    signupPerHour: e.HOST_SIGNUP_PER_HOUR ?? (e.APP_ENV === 'test' ? 0 : 100),
    clientDist: e.CLIENT_DIST,
    // (v2.3 OPS-2, sec-ops) env overrides for the runtime ops switches (moderation/ops.ts).
    ops: {
      signupMode: e.OPS_SIGNUP_MODE,
      signupCode: e.OPS_SIGNUP_CODE,
      maintenance: e.OPS_MAINTENANCE === undefined || e.OPS_MAINTENANCE === 'auto' ? undefined : e.OPS_MAINTENANCE,
      maintenanceMessage: e.OPS_MAINTENANCE_MESSAGE,
      sessionsNotBefore: e.OPS_SESSIONS_NOT_BEFORE ? (/^\d+$/.test(e.OPS_SESSIONS_NOT_BEFORE) ? Number(e.OPS_SESSIONS_NOT_BEFORE) : Date.parse(e.OPS_SESSIONS_NOT_BEFORE)) : undefined,
    },
  };
}
