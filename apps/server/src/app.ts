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

  // Static SPA (v2.2 WP6). Cache policy:
  // - /assets/* are Vite's content-hashed outputs: immutable for a year (Cloudflare keeps the
  //   longer origin TTL). The deploy keeps the previous release's assets for one more release so
  //   open tabs can still lazy-load their old chunks.
  // - other public/ files (/landing, /audio, /tutorial, /art, favicon) keep their names across
  //   releases: one day, then served stale for up to a week while revalidating (ETag).
  //   JSON manifests and index.html are always revalidated.
  // - Unknown paths fall back to index.html only for navigations (no file extension, HTML
  //   acceptable) so /lobby/<id> share links work; a missing file (e.g. an old chunk) is a real,
  //   uncacheable 404 instead of an HTML page that the edge would cache under a .js URL.
  // /api, /healthz, /matchmake and /internal never reach these handlers' caching.
  if (clientDist && existsSync(clientDist)) {
    const root = path.resolve(clientDist); // serve-static hands setHeaders absolute paths
    const assetsDir = path.join(root, 'assets') + path.sep;
    const indexHtml = path.join(root, 'index.html');
    app.use(
      express.static(root, {
        index: false,
        cacheControl: false,
        setHeaders(res, filePath) {
          let cc: string;
          if (filePath.startsWith(assetsDir)) cc = 'public, max-age=31536000, immutable';
          else if (filePath === indexHtml || filePath.endsWith('.json')) cc = 'no-cache';
          else cc = 'public, max-age=86400, stale-while-revalidate=604800';
          res.setHeader('Cache-Control', cc);
        },
      }),
    );
    const notOurs = /^\/(api|healthz|matchmake|internal)\b/;
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || notOurs.test(req.path)) return next();
      const navigation = !path.posix.extname(req.path) && !req.path.startsWith('/assets/') && req.accepts('html') === 'html';
      if (navigation) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexHtml);
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).type('text/plain').send('Not found');
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
