// OWNED BY lobby-auth (stub from lead, M0). Composition root for persistent services:
// database, accounts/sessions, lobby directory, stats, voice usage. `registerHttpRoutes`
// mounts /api/auth, /api/me, /api/lobbies (+SSE stream), /api/admin.
import type { Express } from 'express';
import type { AppConfig } from './config.js';
import type { Logger } from './rooms/modules.js';

export interface Services {
  config: AppConfig;
  log: Logger;
  close(): Promise<void>;
}

let current: Services | null = null;

/** Process-wide services singleton (rooms read it; Colyseus room options must stay serialisable). */
export function getServices(): Services {
  if (!current) throw new Error('services not initialised');
  return current;
}

export async function createServices(config: AppConfig, log: Logger): Promise<Services> {
  current = { config, log, close: async () => undefined };
  return current;
}

export function registerHttpRoutes(_app: Express, _services: Services): void {}
