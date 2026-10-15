// LEAD-OWNED: builds the single-port server (SPA + JSON API + SSE directory + Colyseus WS).
// Used by index.ts (dev/prod services) and by the integration tests (via rooms/bootstrap.ts),
// so tests exercise the same HTTP stack as production.
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
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

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' wss://*.livekit.cloud https://*.livekit.cloud",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * SR-1: Colyseus reads /matchmake request bodies into memory without a size limit (and before
 * Express's body limit applies). Refuse anything but small JSON bodies up front. Must run after
 * `gameServer.listen()` so it wraps Colyseus's own request listener.
 */
const MATCHMAKE_MAX_BODY = 4096;

function limitMatchmakeBodies(server: http.Server) {
  const inner = server.listeners('request').slice() as http.RequestListener[];
  server.removeAllListeners('request');
  const refuse = (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (!res.headersSent) {
      res.writeHead(413, { Connection: 'close', 'Content-Type': 'application/json' });
      res.end('{"error":"bad_request","message":"Request too large"}');
    }
    req.destroy();
  };
  server.on('request', (req, res) => {
    if (req.method === 'POST' && req.url?.includes('/matchmake')) {
      const declared = req.headers['content-length'];
      if (declared !== undefined && !(Number(declared) >= 0 && Number(declared) <= MATCHMAKE_MAX_BODY)) {
        refuse(req, res);
        return;
      }
      // Chunked bodies (proxies, HTTP/2 -> HTTP/1.1 at the tunnel) carry no length: count as it streams.
      let seen = 0;
      req.on('data', (chunk: Buffer) => {
        seen += chunk.length;
        if (seen > MATCHMAKE_MAX_BODY) refuse(req, res);
      });
    }
    for (const l of inner) l.call(server, req, res);
  });
}

/** SR-4: Colyseus logs a stack trace per bad request; keep first lines only and cap the rate. */
function colyseusLogger(log: Logger) {
  let windowStart = 0;
  let count = 0;
  let dropped = 0;
  const fmt = (args: unknown[]) =>
    args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a.split('\n')[0] : JSON.stringify(a))).join(' ').slice(0, 300);
  // Everything Colyseus reports here is client-caused (bad seat reservation, oversize frame,
  // malformed matchmake call), so it is logged at warn: real server errors come from our own code.
  const emit = (_level: 'warn' | 'error', args: unknown[]) => {
    const now = Date.now();
    if (now - windowStart > 60_000) {
      if (dropped) log.warn('colyseus log lines suppressed', { dropped });
      windowStart = now;
      count = 0;
      dropped = 0;
    }
    if (++count > 5) {
      dropped++;
      return;
    }
    log.warn(`colyseus: ${fmt(args)}`);
  };
  return {
    debug: () => undefined,
    trace: () => undefined,
    info: () => undefined,
    warn: (...a: unknown[]) => emit('warn', a),
    error: (...a: unknown[]) => emit('error', a),
  };
}

export async function startAppServer(config: AppConfig, log: Logger, options: AppServerOptions = {}): Promise<RunningServer> {
  const { clientDist, version = 'dev', greet = false, ...serviceOptions } = options;
  const services = await createServices(config, log, serviceOptions);

  const app = express();
  app.disable('x-powered-by');
  // Funnel / SSH forwarding terminate on loopback; trust only loopback proxies.
  app.set('trust proxy', 'loopback');
  const https = config.publicOrigin.startsWith('https://');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    // SR-7: strict CSP (verified against the built client incl. Phaser + Colyseus; LiveKit
    // signalling/API on *.livekit.cloud). Fonts/images must be self-hosted.
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), microphone=(self)');
    if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, env: config.env, version });
  });
  // Host-only: lets the deploy script refuse to restart prod mid-game (games live in memory).
  // Requests through the tunnel carry X-Forwarded-For (req.ip = the real client), so they get 404.
  app.get('/internal/active-games', (req, res) => {
    const loopback = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (!loopback || req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) {
      res.status(404).json({ error: 'not_found', message: 'No such route' });
      return;
    }
    const activeGames = services.directory.list().filter((l) => l.phase !== 'waiting' && l.phase !== 'finished').length;
    res.json({ activeGames });
  });

  registerHttpRoutes(app, services);

  // Static SPA. Unknown non-API GETs fall back to index.html so /lobby/<id> share links work.
  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/(api|healthz|matchmake|internal)\b).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else if (clientDist) {
    log.warn('client dist not found; API-only mode', { clientDist });
  }

  const server = http.createServer(app);
  const gameServer = new Server({
    transport: new WebSocketTransport({
      server,
      pingInterval: 5000,
      pingMaxRetries: 3,
      // (v2, notebook — CONTRACT-REQUEST for lead review) was 4096: one 'notebook:save' frame carries a
      // whole private notebook (NOTEBOOK_MAX_BYTES = 20 KiB of JSON + msgpack framing). Every message
      // is still Zod-capped per field and token-bucket rate-limited per pid.
      maxPayload: 24 * 1024,
      // (No verifyClient pre-check: rejecting at the HTTP upgrade breaks colyseus.js's reconnect
      // retry after a network drop. Seat reservations are still enforced by the transport, and the
      // rate-limited logger below absorbs the log noise from junk upgrades — SR-4.)
    }),
    greet,
    logger: colyseusLogger(log),
  });
  gameServer.define('game', GameRoom);
  // SR-4/SR-5: only the two matchmaking methods the client uses; rooms are created by the lobby
  // directory in-process. CORS is same-origin only, without credentials.
  matchMaker.controller.exposedMethods = ['joinById', 'reconnect'];
  matchMaker.controller.getCorsHeaders = () => ({ 'Access-Control-Allow-Origin': config.publicOrigin });
  delete (matchMaker.controller.DEFAULT_CORS_HEADERS as Record<string, string>)['Access-Control-Allow-Credentials'];
  await gameServer.listen(config.port, config.host);
  limitMatchmakeBodies(server);

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
