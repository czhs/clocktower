// OWNED BY voice. VoiceModule factory: wires the per-lobby VoiceCoordinator to process-wide
// services (config.livekit, usage store) and exposes admin helpers (usage view, active count).
import { townLayout } from '@ct/assets';
import type { VoiceUsageView } from '@ct/protocol';
import { buildUsageView, livekitHttpUrl, MemoryVoiceUsageStore, RoomServiceClient, type VoiceUsageStore } from '@ct/voice';
import type { RoomHost, VoiceModule } from '../rooms/modules.js';
import { getServices, type Services } from '../services.js';
import { createVoiceCoordinator, type LivekitSettings, type VoiceCoordinator, type VoiceDeps, type VoiceRoomService } from './coordinator.js';

export { createVoiceCoordinator, DEFAULT_TUNING } from './coordinator.js';
export type { LivekitSettings, VoiceCoordinator, VoiceDeps, VoiceRoomService, VoiceTuning } from './coordinator.js';

const NOT_CONFIGURED: LivekitSettings = { url: '', apiKey: '', apiSecret: '', roomPrefix: 'dev', configured: false };

/** Process-wide fallback when Services has no `voiceUsage` (lost on restart). */
const memoryUsage = new MemoryVoiceUsageStore();
let warnedFallback = false;

/** All live coordinators in this process (for the admin dashboard's active-participant count). */
const live = new Set<VoiceCoordinator>();

let sharedRoomService: { key: string; client: VoiceRoomService } | null = null;

function tryServices(): Services | null {
  try {
    return getServices();
  } catch {
    return null;
  }
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
  return buildUsageView({
    configured: lk.configured,
    now,
    store: getVoiceUsageStore(services),
    monthlyLimit: services?.config.voiceMonthlyMinutes ?? 0,
    activeParticipants: voiceActiveParticipants(now),
  });
}

export function createVoiceModule(host: RoomHost, overrides: Partial<VoiceDeps> = {}): VoiceModule & VoiceCoordinator {
  const services = tryServices();
  const livekit = overrides.livekit ?? services?.config.livekit ?? NOT_CONFIGURED;
  if (!services && !overrides.livekit) host.log.warn('voice: services not initialised; voice disabled');
  const deps: VoiceDeps = {
    livekit,
    monthlyMinutes: overrides.monthlyMinutes ?? services?.config.voiceMonthlyMinutes ?? 0,
    usage: overrides.usage ?? getVoiceUsageStore(services),
    roomService: overrides.roomService !== undefined ? overrides.roomService : roomServiceFor(livekit),
    layout: overrides.layout ?? townLayout,
    ...(overrides.tuning ? { tuning: overrides.tuning } : {}),
    ...(overrides.mint ? { mint: overrides.mint } : {}),
  };
  const c = createVoiceCoordinator(host, deps);
  live.add(c);
  const dispose = c.dispose;
  return Object.assign(c, {
    async dispose() {
      live.delete(c);
      await dispose();
    },
  });
}
