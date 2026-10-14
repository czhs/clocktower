// LEAD-OWNED bootstrap for the dev/prod services: one HTTP port serves the SPA, JSON API, SSE
// directory and Colyseus WebSockets (so Tailscale Funnel only needs to expose a single port).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createLogger } from './log.js';
import { startAppServer } from './app.js';

const VERSION = process.env.CT_VERSION ?? 'dev';

async function main() {
  const config = loadConfig();
  const log = createLogger('server');
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/server.js and src/index.ts both sit one level below apps/server.
  const clientDist = config.clientDist || path.resolve(here, '../../client/dist');

  const running = await startAppServer(config, log, { clientDist, version: VERSION, greet: false });
  log.info('listening', { host: config.host, port: config.port, env: config.env, version: VERSION });

  // Colyseus installs SIGTERM/SIGINT handlers itself (graceful room disposal); we only close
  // our services afterwards.
  running.gameServer.onShutdown(async () => {
    log.info('shutdown');
    await running.services.close();
  });
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
