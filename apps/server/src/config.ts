import { z } from 'zod';

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
  LOBBY_MAX_COUNT: z.coerce.number().int().min(1).max(64).default(4),
  PLAYER_MAX_PER_LOBBY: z.coerce.number().int().min(5).max(15).default(15),
  LOBBY_IDLE_TIMEOUT_SEC: z.coerce.number().int().min(10).default(600),
  RECONNECT_GRACE_SEC: z.coerce.number().int().min(5).default(300),
  ADMIN_ACCOUNT_IDS: z.string().default(''),
  LIVEKIT_URL: z.string().default(''),
  LIVEKIT_API_KEY: z.string().default(''),
  LIVEKIT_API_SECRET: z.string().default(''),
  LIVEKIT_ROOM_PREFIX: z.string().regex(/^[a-z0-9-]{1,16}$/).default('dev'),
  VOICE_MONTHLY_MINUTES: z.coerce.number().int().min(0).default(5000),
  LOG_DIR: z.string().default('./logs/dev'),
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
    cookieName: e.APP_ENV === 'production' ? 'ct_session' : `ct_session_${e.APP_ENV === 'test' ? 'test' : 'dev'}`,
    sessionTtlDays: e.SESSION_TTL_DAYS,
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
    logDir: e.LOG_DIR,
    clientDist: e.CLIENT_DIST,
  };
}
