// LEAD-OWNED bootstrap: one HTTP port serves the SPA, JSON API, SSE directory and Colyseus
// WebSockets (so Tailscale Funnel only needs to expose a single local port).
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { loadConfig } from './config.js';
import { createLogger } from './log.js';
import { createServices, registerHttpRoutes } from './services.js';
import { GameRoom } from './rooms/GameRoom.js';

const VERSION = process.env.CT_VERSION ?? 'dev';

async function main() {
  const config = loadConfig();
  const log = createLogger('server');
  const services = await createServices(config, log);

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
    res.json({ ok: true, env: config.env, version: VERSION });
  });

  registerHttpRoutes(app, services);

  // Static SPA (built by apps/client). Unknown non-API GETs fall back to index.html so
  // /lobby/<id> share links work.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = config.clientDist || path.resolve(here, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/(api|healthz|matchmake)\b).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    log.warn('client dist not found; API-only mode', { clientDist });
  }

  const server = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({ server, pingInterval: 5000, pingMaxRetries: 3 }),
  });
  gameServer.define('game', GameRoom);

  await gameServer.listen(config.port, config.host);
  log.info('listening', { host: config.host, port: config.port, env: config.env, version: VERSION });

  // Colyseus installs SIGTERM/SIGINT handlers itself (graceful room disposal); we only close
  // our services afterwards.
  gameServer.onShutdown(async () => {
    log.info('shutdown');
    await services.close();
  });
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
