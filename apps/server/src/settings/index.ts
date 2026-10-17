// (v2.3, sec-ops) Builds the settings registry on the DB's ops_flags table and wires the live hooks.
import { createModerationRepo, type Database } from '@ct/db';
import type { AppConfig } from '../config.js';
import type { Logger } from '../rooms/modules.js';
import { settingDefs, wireSettings } from './defs.js';
import { createSettingsRegistry, type SettingsRegistry, type SettingsStore } from './registry.js';
import { VOICE_ENV_DEFAULTS } from '../voice/env.js'; // (sec-voice)

export { SETTING_GROUPS, SettingError, type SettingsRegistry, type SettingView } from './registry.js';

/**
 * Env passed to the registry: the process env, plus values that reached the config through another
 * route (tests build configs from an object, not process.env) when they differ from the defaults.
 */
function registryEnv(config: AppConfig, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...env };
  const put = (k: string, v: unknown, def?: unknown) => {
    if (out[k] === undefined && v !== undefined && v !== def) out[k] = String(v);
  };
  put('SESSION_MAX_DAYS', config.sessionMaxDays, 90);
  put('SESSION_TTL_DAYS', config.sessionTtlDays, 30);
  put('OPS_SIGNUP_MODE', config.ops.signupMode);
  put('OPS_SIGNUP_CODE', config.ops.signupCode);
  put('OPS_MAINTENANCE', config.ops.maintenance);
  put('OPS_MAINTENANCE_MESSAGE', config.ops.maintenanceMessage);
  // (sec-voice) VOICE_* parsed into config (config.voice, voice/env.ts) — in-process test servers pass
  // them in the config env, not process.env.
  put('VOICE_MONTHLY_MINUTES', config.voiceMonthlyMinutes, 5000);
  put('VOICE_MAX_CONCURRENT', config.voice.maxConcurrent, VOICE_ENV_DEFAULTS.maxConcurrent);
  put('VOICE_MAX_PER_LOBBY', config.voice.maxPerLobby, VOICE_ENV_DEFAULTS.maxPerLobby);
  put('VOICE_MAX_PER_IP', config.voice.maxPerIp, VOICE_ENV_DEFAULTS.maxPerIp);
  put('VOICE_IDLE_MIN', config.voice.idleMs / 60_000, VOICE_ENV_DEFAULTS.idleMs / 60_000);
  put('VOICE_WAITING_MAX_MIN', config.voice.waitingMaxMs / 60_000, VOICE_ENV_DEFAULTS.waitingMaxMs / 60_000);
  put('VOICE_ANNOUNCE_MAX_MIN', config.voice.announceMaxMs / 60_000, VOICE_ENV_DEFAULTS.announceMaxMs / 60_000);
  put('VOICE_RECONCILE_SEC', config.voice.reconcileMs / 1000, VOICE_ENV_DEFAULTS.reconcileMs / 1000);
  put('VOICE_ALERT_WEBHOOK', config.voice.alertWebhook ?? undefined);
  return out;
}

export function createSettings(database: Database, config: AppConfig, log: Logger, opts: { env?: NodeJS.ProcessEnv; store?: SettingsStore } = {}): SettingsRegistry {
  const repo = createModerationRepo(database);
  const store: SettingsStore = opts.store ?? {
    load: () => repo.flags(),
    save: (key, value, admin) => repo.setFlag(key, value, admin, Date.now()),
  };
  let reg: SettingsRegistry | null = null;
  const registry = createSettingsRegistry({ defs: settingDefs(() => reg!), store, env: registryEnv(config, opts.env ?? process.env), log });
  reg = registry;
  wireSettings(registry);
  registry.applyAll();
  return registry;
}
