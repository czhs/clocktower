// OWNED BY voice (v2.3 sec-voice). Live voice cost / abuse knobs. Every consumer reads them through
// voiceSettings() at the moment of use (never captured at import), so the admin settings registry
// (sec-ops: apps/server/src/settings/registry.ts) can change them at runtime.
//
// Defaults come from the environment (config.voice, VOICE_* keys, see ./env.ts, and
// VOICE_MONTHLY_MINUTES). A registry plugs in with setVoiceSettingsProvider(): its overrides are
// applied on top of the env defaults, EXCEPT where the env locks a value:
//   - VOICE_DISABLED=1 locks the kill switch on (the admin switch itself lives in ./control.ts);
//   - VOICE_TEST_AUTO_OPT_IN is env-only (test harnesses).
//
// Knob names (suggested registry keys -> env default):
//   voice.monthlyMinutes        VOICE_MONTHLY_MINUTES   (5000; 0 = voice off: everything is 'exhausted')
//   voice.maxConcurrent         VOICE_MAX_CONCURRENT    (64 = LOBBY_MAX_COUNT 4 x 16 seats; LiveKit free tier: 100; 0 = no cap)
//   voice.maxPerLobby           VOICE_MAX_PER_LOBBY     (16;  0 = no cap)
//   voice.maxPerIp              VOICE_MAX_PER_IP        (4;   0 = no cap)
//   voice.idleMinutes           VOICE_IDLE_MIN          (20;  0 = never; doubled in a game, paused at night)
//   voice.waitingMaxMinutes     VOICE_WAITING_MAX_MIN   (60;  0 = never)
//   voice.reconcileSeconds      VOICE_RECONCILE_SEC     (60;  15..600)
//   voice.alertWarnPct          (70)  voice.alertCriticalPct (90)   alert thresholds (exhausted = 100 %)
//   voice.alertWebhook          VOICE_ALERT_WEBHOOK     (https URL or empty)
//   voice.announceMaxMinutes    VOICE_ANNOUNCE_MAX_MIN  (5; 0 = no cap) hard cap on one Storyteller announcement
import { VOICE_ENV_DEFAULTS, type VoiceEnv } from './env.js';

export interface VoiceSettings {
  monthlyMinutes: number;
  maxConcurrent: number;
  maxPerLobby: number;
  maxPerIp: number;
  idleMs: number;
  waitingMaxMs: number;
  reconcileMs: number;
  alertWarnPct: number;
  alertCriticalPct: number;
  alertWebhook: string | null;
  announceMaxMs: number;
  /** env lock (read-only here). */
  envDisabled: boolean;
  /** env only (test harnesses). */
  testAutoOptIn: boolean;
}

export type VoiceSettingsOverrides = Partial<Omit<VoiceSettings, 'envDisabled' | 'testAutoOptIn'>>;

type Provider = () => VoiceSettingsOverrides | null | undefined;

let provider: Provider | null = null;

/** sec-ops registry: live overrides (called on every read; keep it cheap). null removes it. */
export function setVoiceSettingsProvider(p: Provider | null): void {
  provider = p;
}

const clampInt = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;

export function baseVoiceSettings(env: VoiceEnv | null | undefined, monthlyMinutes: number): VoiceSettings {
  const e = env ?? VOICE_ENV_DEFAULTS;
  return {
    monthlyMinutes,
    maxConcurrent: e.maxConcurrent,
    maxPerLobby: e.maxPerLobby,
    maxPerIp: e.maxPerIp,
    idleMs: e.idleMs,
    waitingMaxMs: e.waitingMaxMs,
    reconcileMs: e.reconcileMs,
    alertWarnPct: 70,
    alertCriticalPct: 90,
    alertWebhook: e.alertWebhook,
    announceMaxMs: e.announceMaxMs,
    envDisabled: e.disabled,
    testAutoOptIn: e.testAutoOptIn,
  };
}

/** Env defaults overlaid with the registry's live values (validated / clamped). */
export function resolveVoiceSettings(base: VoiceSettings): VoiceSettings {
  let o: VoiceSettingsOverrides | null | undefined = null;
  try {
    o = provider?.();
  } catch {
    o = null; // a broken provider must not take voice limits away: env defaults apply
  }
  if (!o) return base;
  const warn = clampInt(o.alertWarnPct, 1, 99, base.alertWarnPct);
  let webhook = base.alertWebhook;
  if (o.alertWebhook !== undefined) {
    webhook = null;
    if (typeof o.alertWebhook === 'string' && o.alertWebhook) {
      try {
        const u = new URL(o.alertWebhook);
        if (u.protocol === 'https:') webhook = u.toString();
      } catch {
        webhook = null;
      }
    }
  }
  return {
    ...base,
    monthlyMinutes: clampInt(o.monthlyMinutes, 0, 10_000_000, base.monthlyMinutes),
    maxConcurrent: clampInt(o.maxConcurrent, 0, 1000, base.maxConcurrent),
    maxPerLobby: clampInt(o.maxPerLobby, 0, 64, base.maxPerLobby),
    maxPerIp: clampInt(o.maxPerIp, 0, 64, base.maxPerIp),
    idleMs: clampInt(o.idleMs, 0, 24 * 3_600_000, base.idleMs),
    waitingMaxMs: clampInt(o.waitingMaxMs, 0, 24 * 3_600_000, base.waitingMaxMs),
    reconcileMs: clampInt(o.reconcileMs, 15_000, 600_000, base.reconcileMs),
    alertWarnPct: warn,
    alertCriticalPct: clampInt(o.alertCriticalPct, warn + 1, 100, Math.max(base.alertCriticalPct, warn + 1)),
    alertWebhook: webhook,
    announceMaxMs: clampInt(o.announceMaxMs, 0, 3_600_000, base.announceMaxMs),
  };
}
