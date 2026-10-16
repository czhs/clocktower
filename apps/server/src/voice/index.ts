// OWNED BY voice. VoiceModule factory: wires the per-lobby VoiceCoordinator to process-wide
// services (config.livekit, usage store) and exposes admin helpers (usage view, active count).
//
// v2.3 (sec-voice) process-wide pieces:
//   - registry of live coordinators (caps across lobbies, per-IP cap, orphan sweep authorisation);
//   - the LiveKit usage reconciler (VOICE-1/5), started lazily with the first lobby when LiveKit is
//     configured; coordinators then write heartbeat estimates into a buffer only used when LiveKit
//     cannot be listed;
//   - quota alerts (VOICE-8);
//   - the kill switch (VOICE-6, ./control.ts) — API for the admin console:
//       voiceControlState(), setVoiceDisabled(disabled, {reason}), voiceKill(), voiceRestore(),
//       configureVoiceFlagStore({ load, save })  (persisted flag; unreadable -> disabled).
import { townLayout } from '@ct/assets';
import type { VoiceUsageView } from '@ct/protocol';
import { buildUsageView, livekitHttpUrl, MemoryVoiceUsageStore, monthKeyUtc, msToMinutes, RoomServiceClient, type VoiceUsageStore } from '@ct/voice';
import type { Logger, RoomHost, VoiceModule } from '../rooms/modules.js';
import { getServices, type Services } from '../services.js';
import { createVoiceAlerts, type VoiceAlerts } from './alerts.js';
import { isVoiceDisabled, onVoiceControlChange, setVoiceEnvDisabled, voiceControlState } from './control.js';
import { createVoiceCoordinator, DEFAULT_TUNING, type LivekitSettings, type VoiceCoordinator, type VoiceDeps, type VoiceRoomService, type VoiceTuning } from './coordinator.js';
import { readVoiceEnv, type VoiceEnv } from './env.js';
import { baseVoiceSettings, resolveVoiceSettings, type VoiceSettings } from './settings.js';
import { forgetVoiceLobbyIps, forgetVoiceMemberIp, voiceMemberIp } from './ip.js';
import { createVoiceReconciler, HeartbeatBuffer, type ReconcileRoomService, type VoiceReconciler } from './reconciler.js';

export { createVoiceCoordinator, DEFAULT_LIMITS, DEFAULT_TUNING } from './coordinator.js';
export type { LivekitSettings, VoiceCoordinator, VoiceDeps, VoiceLimits, VoiceRoomService, VoiceTuning } from './coordinator.js';
export { configureVoiceFlagStore, setVoiceDisabled, voiceControlState, voiceKill, voiceRestore, type VoiceControlState, type VoiceFlagStore } from './control.js';
export { ipKeyFromJoin, noteVoiceMemberIp } from './ip.js';
export { setVoiceSettingsProvider, type VoiceSettings, type VoiceSettingsOverrides } from './settings.js';
export { createVoiceReconciler, HeartbeatBuffer } from './reconciler.js';

const NOT_CONFIGURED: LivekitSettings = { url: '', apiKey: '', apiSecret: '', roomPrefix: 'dev', configured: false };

/** Process-wide fallback when Services has no `voiceUsage` (lost on restart). */
const memoryUsage = new MemoryVoiceUsageStore();
let warnedFallback = false;

/** All live coordinators in this process (caps, admin counts, orphan sweep). */
const live = new Set<VoiceCoordinator>();

let sharedRoomService: { key: string; client: VoiceRoomService } | null = null;

function tryServices(): Services | null {
  try {
    return getServices();
  } catch {
    return null;
  }
}

let processEnv: VoiceEnv | null = null;
/** Voice knobs: `config.voice` (parsed with the rest of the config), else the process environment. */
export function getVoiceEnv(services: Services | null = tryServices(), log?: Logger): VoiceEnv {
  const fromConfig = (services?.config as { voice?: VoiceEnv } | undefined)?.voice;
  if (fromConfig) return fromConfig;
  processEnv ??= readVoiceEnv(process.env, (m, f) => log?.warn(m, f));
  return processEnv;
}

const wired = new WeakSet<object>();
/**
 * Live voice knobs: env defaults (config.voice + VOICE_MONTHLY_MINUTES) overlaid with the admin
 * settings registry (setVoiceSettingsProvider, ./settings.ts). Read at the moment of use.
 */
export function voiceSettings(services: Services | null = tryServices()): VoiceSettings {
  return resolveVoiceSettings(baseVoiceSettings(getVoiceEnv(services), services?.config.voiceMonthlyMinutes ?? 0));
}

/** Once per Services: VOICE_DISABLED -> kill switch (and log the test-only knob). */
export function wireVoiceServices(services: Services | null): void {
  if (!services || wired.has(services)) return;
  wired.add(services);
  const env = getVoiceEnv(services, services.log);
  setVoiceEnvDisabled(env.disabled);
  if (env.disabled) services.log.warn('voice: VOICE_DISABLED is set; voice is off');
  if (env.testAutoOptIn) services.log.warn('voice: VOICE_TEST_AUTO_OPT_IN is set (test harness mode: tokens without opt-in)');
  // The admin console's persisted voice switch is wired by sec-ops (moderation/service.ts calls
  // configureVoiceFlagStore + setVoiceDisabled on this module's control.ts).
}

/** Boot hook (apps/server/src/index.ts): kill switch wiring + LiveKit reconciler from the start. */
export function startVoiceBackground(services: Services): void {
  wireVoiceServices(services);
  const lk = services.config.livekit;
  const rs = roomServiceFor(lk);
  if (rs && lk.configured) ensureReconciler(services, lk, rs, getVoiceUsageStore(services));
}

/** The persistent usage store (lobby-auth: `services.voiceUsage`), or the in-memory fallback. */
export function getVoiceUsageStore(services: Services | null = tryServices()): VoiceUsageStore {
  const store = (services as (Services & { voiceUsage?: VoiceUsageStore }) | null)?.voiceUsage;
  if (store) return store;
  if (!warnedFallback && services) {
    warnedFallback = true;
    services.log.warn('voice: services.voiceUsage missing; using in-memory usage store (resets on restart)');
  }
  return memoryUsage;
}

function roomServiceFor(lk: LivekitSettings): VoiceRoomService | null {
  if (!lk.configured) return null;
  const key = `${lk.url}|${lk.apiKey}`;
  if (sharedRoomService?.key !== key) {
    sharedRoomService = { key, client: new RoomServiceClient(livekitHttpUrl(lk.url), lk.apiKey, lk.apiSecret) };
  }
  return sharedRoomService.client;
}

// -- registry --------------------------------------------------------------------------------

function holdersExcept(c: VoiceCoordinator | null): number {
  let n = 0;
  for (const o of live) if (o !== c) n += o.holders();
  return n;
}

function ipHoldersExcept(c: VoiceCoordinator | null, ip: string): number {
  let n = 0;
  for (const o of live) if (o !== c) n += o.holdersWithIp(ip);
  return n;
}

function coordinatorsOf(lobbyId: string): VoiceCoordinator[] {
  return [...live].filter((c) => c.lobbyId === lobbyId);
}

// -- reconciler + alerts (one per process) -----------------------------------------------------

let rec: { key: string; reconciler: VoiceReconciler; buffer: HeartbeatBuffer; alerts: VoiceAlerts } | null = null;

function ensureReconciler(services: Services, lk: LivekitSettings, rs: VoiceRoomService, usage: VoiceUsageStore): HeartbeatBuffer | null {
  if (!rs.listRooms) return null;
  const key = `${lk.url}|${lk.apiKey}|${lk.roomPrefix}`;
  if (rec?.key === key) return rec.buffer;
  rec?.reconciler.stop();
  const buffer = new HeartbeatBuffer(usage);
  const live = () => voiceSettings(services);
  const alerts = createVoiceAlerts({
    log: services.log,
    webhook: () => live().alertWebhook,
    thresholds: () => ({ warnPct: live().alertWarnPct, criticalPct: live().alertCriticalPct }),
  });
  const appEnv = services.config.env;
  const reconciler = createVoiceReconciler({
    prefix: lk.roomPrefix,
    env: appEnv,
    roomService: rs as ReconcileRoomService,
    usage,
    heartbeats: buffer,
    intervalMs: () => live().reconcileMs,
    now: () => Date.now(),
    log: services.log,
    authorize(lobbyId, identity, room) {
      const cs = coordinatorsOf(lobbyId);
      if (!cs.length) return 'orphan';
      return cs.some((c) => c.isAuthorized(identity, room)) ? 'ok' : 'unauthorized';
    },
    evictVia(lobbyId, room, identity) {
      const c = coordinatorsOf(lobbyId)[0];
      if (!c) return false;
      c.evict(room, identity);
      return true;
    },
    onMeasured(r) {
      const now = Date.now();
      const month = monthKeyUtc(now);
      alerts.check({
        env: appEnv,
        month,
        minutes: msToMinutes(usage.get(month).totalMs),
        limit: live().monthlyMinutes,
        liveParticipants: r.participants,
        maxConcurrent: live().maxConcurrent,
      });
    },
  });
  rec = { key, reconciler, buffer, alerts };
  reconciler.start();
  return buffer;
}

/** Run one LiveKit listing now (usage + orphan sweep). Resolves null when not running. */
export async function sweepOrphanVoiceRooms(): Promise<{ evicted: number } | null> {
  if (!rec) return null;
  const r = await rec.reconciler.runOnce();
  return { evicted: r.evicted.length };
}

// Kill switch: apply to every live lobby at once, then sweep LiveKit for stragglers.
onVoiceControlChange((s) => {
  for (const c of live) c.enforce(); // each lobby on its own clock
  if (s.disabled) void sweepOrphanVoiceRooms();
});

/** Sum of members with a recent "connected" heartbeat across all lobbies of this process. */
export function voiceActiveParticipants(now = Date.now()): number {
  let n = 0;
  for (const c of live) n += c.activeParticipants(now);
  return n;
}

/** Admin dashboard view (GET /api/admin/... — lobby-auth owns the route). */
export function voiceUsageView(now = Date.now()): VoiceUsageView {
  const services = tryServices();
  const lk = services?.config.livekit ?? NOT_CONFIGURED;
  wireVoiceServices(services);
  const env = voiceSettings(services);
  const ctl = voiceControlState();
  return {
    ...buildUsageView({
      configured: lk.configured,
      now,
      store: getVoiceUsageStore(services),
      monthlyLimit: env.monthlyMinutes,
      activeParticipants: voiceActiveParticipants(now),
    }),
    liveParticipants: rec?.reconciler.liveParticipants() ?? null,
    measured: Boolean(rec?.reconciler.measuring),
    disabled: ctl.disabled,
    disabledBy: ctl.disabledBy,
    disabledReason: ctl.reason,
    disabledAt: ctl.since,
    caps: {
      concurrent: env.maxConcurrent,
      perLobby: env.maxPerLobby,
      perIp: env.maxPerIp,
      idleMinutes: Math.round(env.idleMs / 60_000),
      waitingMaxMinutes: Math.round(env.waitingMaxMs / 60_000),
    },
  };
}

/**
 * TEST-ONLY knob: VOICE_TOKEN_TTL_SEC (30..600) shortens LiveKit join-token lifetime so expiry /
 * refresh can be exercised against the real LiveKit in minutes. Unset in dev/prod.
 */
function envTuning(): Partial<VoiceTuning> | null {
  const ttl = Number(process.env.VOICE_TOKEN_TTL_SEC ?? '');
  if (!Number.isInteger(ttl) || ttl < 30 || ttl > 600) return null;
  return { tokenTtlSec: ttl, refreshBeforeMs: Math.min(DEFAULT_TUNING.refreshBeforeMs, (ttl * 1000) / 2), auditWindowMs: ttl * 1000 + 10 * 60_000 };
}

export function createVoiceModule(host: RoomHost, overrides: Partial<VoiceDeps> = {}): VoiceModule & VoiceCoordinator {
  const services = tryServices();
  wireVoiceServices(services);
  const livekit = overrides.livekit ?? services?.config.livekit ?? NOT_CONFIGURED;
  if (!services && !overrides.livekit) host.log.warn('voice: services not initialised; voice disabled');
  const roomService = overrides.roomService !== undefined ? overrides.roomService : roomServiceFor(livekit);
  const usage = overrides.usage ?? getVoiceUsageStore(services);
  // The reconciler only runs against the real, shared RoomServiceClient (not injected test doubles).
  const buffer = overrides.roomService === undefined && roomService && livekit.configured && services ? ensureReconciler(services, livekit, roomService, usage) : null;
  let self: VoiceCoordinator | null = null;
  const deps: VoiceDeps = {
    livekit,
    monthlyMinutes: overrides.monthlyMinutes ?? (() => voiceSettings(services).monthlyMinutes),
    usage: buffer ?? usage,
    roomService,
    layout: overrides.layout ?? townLayout,
    ...(overrides.tuning ? { tuning: overrides.tuning } : envTuning() ? { tuning: envTuning()! } : {}),
    ...(overrides.mint ? { mint: overrides.mint } : {}),
    // Read on every use: the admin settings registry can change caps / idle limits live.
    limits: () => {
      const v = voiceSettings(services);
      const o = typeof overrides.limits === 'function' ? overrides.limits() : overrides.limits;
      return {
        maxPerLobby: v.maxPerLobby,
        maxConcurrent: v.maxConcurrent,
        maxPerIp: v.maxPerIp,
        idleMs: v.idleMs,
        waitingMaxMs: v.waitingMaxMs,
        autoOptIn: v.testAutoOptIn,
        announceMaxMs: v.announceMaxMs,
        ...o,
      };
    },
    isDisabled: overrides.isDisabled ?? isVoiceDisabled,
    otherHolders: overrides.otherHolders ?? (() => holdersExcept(self)),
    ipOf: overrides.ipOf ?? ((pid) => voiceMemberIp(host.lobbyId, pid)),
    otherIpHolders: overrides.otherIpHolders ?? ((ip) => ipHoldersExcept(self, ip)),
    ...(overrides.roomEpochs !== undefined ? { roomEpochs: overrides.roomEpochs } : {}),
    ...(overrides.newEpoch ? { newEpoch: overrides.newEpoch } : {}),
  };
  const c = createVoiceCoordinator(host, deps);
  self = c;
  live.add(c);
  const onEvent = c.onEvent;
  const dispose = c.dispose;
  return Object.assign(c, {
    onEvent(e: Parameters<VoiceCoordinator['onEvent']>[0]) {
      onEvent(e);
      if (e.type === 'member_left') forgetVoiceMemberIp(host.lobbyId, e.pid);
    },
    async dispose() {
      live.delete(c);
      // A game reset replaces the coordinator of the same lobby: keep its members' IPs.
      setTimeout(() => {
        if (!coordinatorsOf(host.lobbyId).length) forgetVoiceLobbyIps(host.lobbyId);
      }, 10_000).unref?.();
      await dispose();
    },
  });
}

/** Tests: stop the process-wide reconciler. */
export function stopVoiceReconcilerForTests(): void {
  rec?.reconciler.stop();
  rec = null;
}
