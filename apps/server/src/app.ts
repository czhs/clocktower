// LEAD-OWNED: builds the single-port server (SPA + JSON API + SSE directory + Colyseus WS).
// Used by index.ts (dev/prod services) and by the integration tests (via rooms/bootstrap.ts),
// so tests exercise the same HTTP stack as production.
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { AppConfig } from './config.js';
import type { Logger } from './rooms/modules.js';
import { createServices, registerHttpRoutes, type ServiceOptions, type Services } from './services.js';
import { GameRoom } from './rooms/GameRoom.js';

export interface RunningServer {
  port: number;
  url: string;
  services: Services;
  gameServer: Server;
  close(): Promise<void>;
}

export interface AppServerOptions extends ServiceOptions {
  /** Directory of the built client (apps/client/dist). Omit for API-only (tests). */
  clientDist?: string;
  version?: string;
  /** Print the Colyseus banner (off in tests). */
  greet?: boolean;
}

export async function startAppServer(config: AppConfig, log: Logger, options: AppServerOptions = {}): Promise<RunningServer> {
  const { clientDist, version = 'dev', greet = false, ...serviceOptions } = options;
  const services = await createServices(config, log, serviceOptions);

  const app = express();
  app.disable('x-powered-by');
  // Funnel / SSH forwarding terminate on loopback; trust only loopback proxies.
  app.set('trust proxy', 'loopback');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, env: config.env, version });
  });

  registerHttpRoutes(app, services);

  // Static SPA. Unknown non-API GETs fall back to index.html so /lobby/<id> share links work.
  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/(api|healthz|matchmake)\b).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else if (clientDist) {
    log.warn('client dist not found; API-only mode', { clientDist });
  }

  const server = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server, pingInterval: 5000, pingMaxRetries: 3 }),
    greet,
  });
  gameServer.define('game', GameRoom);
  await gameServer.listen(config.port, config.host);

  return {
    port: config.port,
    url: `http://${config.host}:${config.port}`,
    services,
    gameServer,
    async close() {
      await gameServer.gracefullyShutdown(false).catch(() => undefined);
      await services.close();
    },
  };
}
