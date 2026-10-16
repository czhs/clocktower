// LEAD-OWNED: builds the single-port server (SPA + JSON API + SSE directory + Colyseus WS).
// Used by index.ts (dev/prod services) and by the integration tests (via rooms/bootstrap.ts),
// so tests exercise the same HTTP stack as production.
import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import express from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { AppConfig } from './config.js';
import type { Logger } from './rooms/modules.js';
import { createServices, registerHttpRoutes, type ServiceOptions, type Services } from './services.js';
import { GameRoom } from './rooms/GameRoom.js';
import { securityHeaders } from './securityHeaders.js';
import { registerInternalRoutes } from './guard/internal.js';
import { installSocketBudget, type RawSocketServer } from './guard/socketBudget.js';
import { getHostLimits, onHostLimitsChange, type HostLimits } from './guard/hostLimits.js';
import { staticQueryGuard } from './cost/staticQuery.js';

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
  // SR-7 + v2.3 WEB-2/3/4: CSP (LiveKit pinned to LIVEKIT_URL), COOP/CORP, Permissions-Policy, HSTS.
  // Trusted Types (WEB-2): verified by tests/security/web-tt.test.ts against the built client.
  app.use(securityHeaders({ publicOrigin: config.publicOrigin, livekitUrl: config.livekit.url, trustedTypes: () => services.settings.get<boolean>('web.trustedTypes') })); // (v2.3 sec-ops) live admin setting
  app.use(express.json({ limit: '32kb' }));
  // v2.3 HOST-07: public /healthz is `{ok:true}` only; the exact version and the deploy guard's
  // active-game count are on loopback-only /internal/* routes (404 through the tunnel).
  registerInternalRoutes(app, {
    env: config.env,
    version,
    activeGames: () => services.directory.list().filter((l) => l.phase !== 'waiting' && l.phase !== 'finished').length,
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
    // Link previews (Open Graph / Twitter card) need absolute URLs, so index.html carries a
    // %PUBLIC_ORIGIN% placeholder that is filled from APP_PUBLIC_ORIGIN when served (no host is
    // baked into the client build). Read once; a deploy restarts the server.
    const indexBody = readFileSync(indexHtml, 'utf8').replaceAll('%PUBLIC_ORIGIN%', config.publicOrigin);
    app.use(staticQueryGuard(root)); // (v2.3 VOICE-12) no cache-busting query strings on static files
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
        res.type('html').send(indexBody);
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).type('text/plain').send('Not found');
    });
  } else if (clientDist) {
    log.warn('client dist not found; API-only mode', { clientDist });
  }

  const server = http.createServer(app);
  // v2.3 HOST-09: tighter than Node's defaults (60 s / 300 s). WS upgrades and SSE responses are not
  // subject to requestTimeout (it bounds receiving the request only).
  // Live settings (guard/hostLimits.ts): re-applied on change; timeouts affect new connections.
  const applyHttpLimits = (l: HostLimits) => {
    server.headersTimeout = l.httpHeadersTimeoutMs;
    server.requestTimeout = l.httpRequestTimeoutMs;
    server.maxConnections = l.httpMaxConnections;
  };
  applyHttpLimits(getHostLimits());
  const offHttpLimits = onHostLimitsChange(applyHttpLimits);
  const transport = new WebSocketTransport({
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
  });
  // v2.3 HOST-11: per-socket frame/byte budget, metered before Colyseus decodes anything.
  installSocketBudget((transport as unknown as { wss: RawSocketServer }).wss, log);
  const gameServer = new Server({
    transport,
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
      offHttpLimits();
      await gameServer.gracefullyShutdown(false).catch(() => undefined);
      await services.close();
    },
  };
}
