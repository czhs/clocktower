// OWNED BY voice (v2.3 sec-voice). Voice cost / abuse limits read from the process environment.
// Kept here (not in config.ts) so the voice area owns its knobs; every value is validated and
// falls back to its default when missing or invalid (a warning names the key, never the value
// of a secret — none of these are secrets except the webhook URL, which is never logged).
//
//   VOICE_DISABLED=1            kill switch from the environment (admin cannot switch it back on)
//   VOICE_MAX_CONCURRENT=64     voice participants in this process (all lobbies; 4 lobbies x 16)
//   VOICE_MAX_PER_LOBBY=16      voice participants per lobby
//   VOICE_MAX_PER_IP=4          voice participants per client IP (IPv6: per /64)
//   VOICE_IDLE_MIN=20           no talking / moving / room activity for this long -> voice off (0 = never)
//   VOICE_WAITING_MAX_MIN=60    continuous voice in a lobby without a game -> voice off (0 = never)
//   VOICE_RECONCILE_SEC=60      LiveKit room listing cadence (usage + orphan sweep), 15..600
//   VOICE_ALERT_WEBHOOK=https://…  optional JSON POST at 70/90/100 % of the monthly allowance
//   VOICE_ANNOUNCE_MAX_MIN=5    hard cap on one Storyteller announcement (0 = no cap)
//   VOICE_TEST_AUTO_OPT_IN=1    TEST ONLY: grant voice without the client opting in (e2e / playtest
//                               harnesses use voice:grant frames as an acoustic-zone oracle). Refused
//                               when LIVEKIT_ROOM_PREFIX is 'prod'.

export interface VoiceEnv {
  disabled: boolean;
  maxConcurrent: number;
  maxPerLobby: number;
  maxPerIp: number;
  idleMs: number;
  waitingMaxMs: number;
  reconcileMs: number;
  alertWebhook: string | null;
  announceMaxMs: number;
  testAutoOptIn: boolean;
}

export const VOICE_ENV_DEFAULTS: VoiceEnv = {
  disabled: false,
  maxConcurrent: 64,
  maxPerLobby: 16,
  maxPerIp: 4,
  idleMs: 20 * 60_000,
  waitingMaxMs: 60 * 60_000,
  reconcileMs: 60_000,
  alertWebhook: null,
  announceMaxMs: 5 * 60_000,
  testAutoOptIn: false,
};

type Warn = (msg: string, fields?: Record<string, unknown>) => void;

function int(env: NodeJS.ProcessEnv, key: string, def: number, min: number, max: number, warn: Warn): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    warn('voice: ignoring invalid setting', { key, min, max });
    return def;
  }
  return n;
}

function flag(env: NodeJS.ProcessEnv, key: string): boolean {
  const v = (env[key] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function readVoiceEnv(env: NodeJS.ProcessEnv = process.env, warn: Warn = () => undefined): VoiceEnv {
  let alertWebhook: string | null = null;
  const hook = (env.VOICE_ALERT_WEBHOOK ?? '').trim();
  if (hook) {
    try {
      const u = new URL(hook);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'))) alertWebhook = u.toString();
      else warn('voice: VOICE_ALERT_WEBHOOK must be an https URL; alerts are log-only');
    } catch {
      warn('voice: VOICE_ALERT_WEBHOOK is not a URL; alerts are log-only');
    }
  }
  const prefix = env.LIVEKIT_ROOM_PREFIX ?? '';
  let testAutoOptIn = flag(env, 'VOICE_TEST_AUTO_OPT_IN');
  if (testAutoOptIn && prefix === 'prod') {
    warn('voice: VOICE_TEST_AUTO_OPT_IN refused with the prod room prefix');
    testAutoOptIn = false;
  }
  return {
    disabled: flag(env, 'VOICE_DISABLED'),
    maxConcurrent: int(env, 'VOICE_MAX_CONCURRENT', VOICE_ENV_DEFAULTS.maxConcurrent, 0, 1000, warn),
    maxPerLobby: int(env, 'VOICE_MAX_PER_LOBBY', VOICE_ENV_DEFAULTS.maxPerLobby, 0, 64, warn),
    maxPerIp: int(env, 'VOICE_MAX_PER_IP', VOICE_ENV_DEFAULTS.maxPerIp, 0, 64, warn),
    idleMs: int(env, 'VOICE_IDLE_MIN', 20, 0, 24 * 60, warn) * 60_000,
    waitingMaxMs: int(env, 'VOICE_WAITING_MAX_MIN', 60, 0, 24 * 60, warn) * 60_000,
    reconcileMs: int(env, 'VOICE_RECONCILE_SEC', 60, 15, 600, warn) * 1000,
    alertWebhook,
    announceMaxMs: int(env, 'VOICE_ANNOUNCE_MAX_MIN', 5, 0, 60, warn) * 60_000,
    testAutoOptIn,
  };
}
