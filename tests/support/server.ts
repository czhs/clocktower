// Test-server launcher (qa-deploy). Spawns the real server on 127.0.0.1:<3350-3399> with a temp
// SQLite DB and freshly generated secrets, waits for /healthz, and tears everything down.
//
//   const server = await startServer();            // source mode (tsx), always current code
//   const server = await startServer({ mode: 'dist' }); // built apps/server/dist/server.js
//   ... server.url, server.wsUrl, server.pid, server.logs()
//   await server.stop();
//
// Never binds 3000/3001 (prod/dev). Port range is qa-deploy's (CLAUDE.md): tests pick randomly
// from 3350-3389; e2e uses 3398; the load test's own server uses 3399.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Random ports for suite servers: a block NO test hardcodes (fixed ports live in 3310-3399), so a
// random pick can never collide with another file's fixed port in the parallel `pnpm test` run.
export const TEST_PORT_MIN = 3400;
export const TEST_PORT_MAX = 3449;

export interface TestServer {
  url: string;
  wsUrl: string;
  port: number;
  pid: number;
  dataDir: string;
  env: Record<string, string>;
  /** Combined stdout+stderr captured so far (JSON lines). */
  logs(): string;
  stop(): Promise<void>;
}

export interface StartOptions {
  mode?: 'source' | 'dist';
  port?: number;
  env?: Record<string, string>;
  /** Reuse this data dir (DB persists across restarts; not deleted on stop). Default: fresh temp dir. */
  dataDir?: string;
  /** ms to wait for /healthz (default 45s; tsx cold start on a busy host can be slow). */
  readyTimeoutMs?: number;
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

export async function pickPort(min = TEST_PORT_MIN, max = TEST_PORT_MAX): Promise<number> {
  for (let i = 0; i < 60; i++) {
    const p = min + Math.floor(Math.random() * (max - min + 1));
    if (p === 3000 || p === 3001) continue;
    if (await portFree(p)) return p;
  }
  throw new Error(`no free port in ${min}-${max}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Never leave orphaned test servers behind, even if the test process crashes or is interrupted.
const children = new Set<ChildProcess>();
process.once('exit', () => {
  for (const c of children) c.kill('SIGKILL');
});
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.once(sig, () => {
    for (const c of children) c.kill('SIGKILL');
    process.exit(130);
  });

export async function startServer(opts: StartOptions = {}): Promise<TestServer> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const port = opts.port ?? (await pickPort());
    try {
      return await launch(port, opts);
    } catch (err) {
      lastErr = err;
      if (opts.port) break; // fixed port: don't retry elsewhere
    }
  }
  throw lastErr;
}

async function launch(port: number, opts: StartOptions): Promise<TestServer> {
  if (port === 3000 || port === 3001) throw new Error('refusing to bind prod/dev port in tests');
  const mode = opts.mode ?? (process.env.CT_TEST_SERVER === 'dist' ? 'dist' : 'source');
  const ownDir = !opts.dataDir;
  const dataDir = opts.dataDir ?? mkdtempSync(path.join(os.tmpdir(), 'ct-test-'));
  // Unique per launch: /internal/version must echo it, so a port race can never make us talk to another
  // test file's server.
  const nonce = `test-${randomBytes(6).toString('hex')}`;
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NODE_ENV: 'test',
    APP_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    APP_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
    DATABASE_URL: `file:${path.join(dataDir, 'test.db')}`,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    PASSPHRASE_PEPPER: randomBytes(32).toString('hex'),
    COOKIE_SECURE: 'false',
    LOBBY_MAX_COUNT: '8',
    PLAYER_MAX_PER_LOBBY: '15',
    LOBBY_IDLE_TIMEOUT_SEC: '60',
    RECONNECT_GRACE_SEC: '30',
    LIVEKIT_URL: '',
    LIVEKIT_API_KEY: '',
    LIVEKIT_API_SECRET: '',
    LIVEKIT_ROOM_PREFIX: 'test',
    LOG_DIR: path.join(dataDir, 'logs'),
    // (v2.3 sec-host) optional per-socket budget peak tracing for sizing HOST-11 (see guard/socketBudget.ts)
    ...(process.env.CT_SOCKET_BUDGET_TRACE ? { CT_SOCKET_BUDGET_TRACE: process.env.CT_SOCKET_BUDGET_TRACE } : {}),
    ...opts.env,
    CT_VERSION: nonce,
  };
  const entry =
    mode === 'dist'
      ? ['--enable-source-maps', path.join(REPO_ROOT, 'apps/server/dist/server.js')]
      : ['--import', 'tsx', path.join(REPO_ROOT, 'apps/server/src/index.ts')];
  if (mode === 'dist' && !existsSync(entry[1]!)) throw new Error('apps/server/dist/server.js missing — run pnpm build');

  const child: ChildProcess = spawn(process.execPath, entry, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  let output = '';
  const append = (b: Buffer) => {
    output += b.toString();
    if (output.length > 4_000_000) output = output.slice(-2_000_000);
  };
  child.stdout!.on('data', append);
  child.stderr!.on('data', append);
  let exited: number | null = null;
  const exitPromise = new Promise<void>((resolve) =>
    child.once('exit', (code, sig) => {
      exited = code ?? (sig ? 128 : 0);
      resolve();
    }),
  );

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + (opts.readyTimeoutMs ?? 45_000);
  let ready = false;
  while (Date.now() < deadline && exited === null) {
    try {
      // v2.3 HOST-07: the exact version is on the loopback-only /internal/version (public /healthz is {ok:true}).
      const res = await fetch(`${url}/internal/version`, { signal: AbortSignal.timeout(1000) });
      if (res.ok && ((await res.json()) as { version?: string }).version === nonce) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  const stop = async () => {
    if (exited === null) {
      child.kill('SIGTERM');
      await Promise.race([exitPromise, sleep(8000)]);
      if (exited === null) {
        child.kill('SIGKILL');
        await Promise.race([exitPromise, sleep(2000)]);
      }
    }
    if (ownDir) rmSync(dataDir, { recursive: true, force: true });
  };
  if (!ready) {
    await stop();
    throw new Error(`test server on :${port} did not become healthy (exit=${exited}). Output:\n${output.slice(-3000)}`);
  }
  return {
    url,
    wsUrl: `ws://127.0.0.1:${port}`,
    port,
    pid: child.pid!,
    dataDir,
    env,
    logs: () => output,
    stop,
  };
}
