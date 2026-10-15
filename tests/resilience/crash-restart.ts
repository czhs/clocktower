// Crash / restart resilience (qa-deploy). Runs ON hshi-u1.
//
//   pnpm exec tsx tests/resilience/crash-restart.ts -- --mode test   # own transient unit, kill -9
//   pnpm exec tsx tests/resilience/crash-restart.ts -- --mode dev    # sudo -n systemctl restart clocktower-dev.service
//
// test mode: the prod bundle runs as a transient `systemd-run --user` unit (Restart=always,
// RestartSec=1) on 127.0.0.1:3396 with a persistent temp data dir — the same supervision model as
// the real services. A real Chromium player + bot Storyteller/players play into day 1, then the
// main PID gets SIGKILL. We record: restart time, what the browser shows over 90 s (screenshots +
// visible status text), close codes, whether reconnect/ticket work, whether sessions survive, and
// what a reload shows.
// dev mode: the same observation against the dev service, restarted (SIGTERM) via the sudo rule.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { Bot, makeBots } from '../support/bot.js';
import { until } from '../support/game.js';
import { REPO_ROOT } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const MODE = (argv[argv.indexOf('--mode') + 1] ?? 'test') as 'test' | 'dev';
const PORT = MODE === 'dev' ? 3001 : 3396;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const UNIT = 'ct-qa-crash';
const ART = path.join(REPO_ROOT, 'tests/e2e/artifacts');
const OUT = path.join(REPO_ROOT, 'tests/resilience/results');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[crash ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

async function health(): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(800) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

async function shot(page: Page, name: string) {
  mkdirSync(ART, { recursive: true });
  await page.screenshot({ path: path.join(ART, `crash-${MODE}-${name}.png`) }).catch(() => undefined);
}

/** Visible status-ish text: phase bar, waiting-room header, errors, toasts, loading captions. */
async function visibleStatus(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const sel = ['.cth-phase', '.ct-waiting-head', '.ct-error', '[role=alert]', '.cth-toasts', '.ct-game-loading', '.screen.center', '.panel p', '.ct-conn', '.ct-banner'];
      const out: string[] = [];
      for (const s of sel) document.querySelectorAll(s).forEach((e) => out.push((e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
      return [...new Set(out.filter(Boolean))].join(' | ').slice(0, 400);
    })
    .catch((e) => `<evaluate failed: ${(e as Error).message}>`);
}

async function main() {
  const dataDir = MODE === 'test' ? mkdtempSync(path.join(os.tmpdir(), 'ct-crash-')) : '';
  if (MODE === 'test') {
    try {
      execFileSync('systemctl', ['--user', 'stop', UNIT], { stdio: 'ignore' });
    } catch {
      /* not running */
    }
    const env = {
      NODE_ENV: 'test', APP_ENV: 'test', HOST: '127.0.0.1', PORT: String(PORT), APP_PUBLIC_ORIGIN: BASE,
      DATABASE_URL: `file:${dataDir}/crash.db`, SESSION_SECRET: randomBytes(32).toString('hex'),
      PASSPHRASE_PEPPER: randomBytes(32).toString('hex'), COOKIE_SECURE: 'false', LOBBY_MAX_COUNT: '4',
      LIVEKIT_ROOM_PREFIX: 'test', LOG_DIR: `${dataDir}/logs`, CT_VERSION: 'crash-test',
    };
    sh('systemd-run', [
      '--user', `--unit=${UNIT}`, '--collect', '-p', 'Restart=always', '-p', 'RestartSec=1',
      `--working-directory=${REPO_ROOT}`, ...Object.entries(env).map(([k, v]) => `--setenv=${k}=${v}`),
      process.execPath, '--enable-source-maps', 'apps/server/dist/server.js',
    ]);
  }
  for (let i = 0; !(await health()); i++) {
    if (i > 60) throw new Error('server did not become healthy');
    await sleep(500);
  }
  log(`target ${BASE} (${MODE}) ${await health()}`);

  const report: Record<string, unknown> = { mode: MODE, at: new Date().toISOString(), target: BASE };
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.66.0.9' } });
  const page = await ctx.newPage();
  const consoleLines: string[] = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`.slice(0, 200)));
  const bots: Bot[] = [];
  try {
    // Browser player (UI) + bot Storyteller and 4 bot players.
    const name = `Crash ${Math.random().toString(36).slice(2, 6)}`;
    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Display name').fill(name);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('I have saved my passphrase somewhere safe').check();
    await page.getByRole('button', { name: 'Enter the town' }).click();
    await page.getByRole('heading', { name: 'Lobby finder' }).waitFor();
    const [st, ...players] = await makeBots(5, `crash${MODE}-`, BASE, WS);
    bots.push(st!, ...players);
    const lobbyId = await st!.createLobby('Crash test', 5, true);
    await st!.join(lobbyId, 'storyteller');
    await page.goto(`${BASE}/lobby/${lobbyId}`);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: "I'm ready" }).click();
      if (await page.getByRole('button', { name: 'Not ready' }).waitFor({ timeout: 4000 }).then(() => true, () => false)) break;
    }
    for (const p of players) await p.join(lobbyId);
    for (const p of players) p.send('lobby:ready', { ready: true });
    await until(() => st!.lobbyView?.canStart, 10_000, 'canStart (5 ready incl. browser)');
    st!.send('lobby:start', {});
    await until(() => (st!.gameView as any)?.kind === 'storyteller', 8000, 'game started');
    st!.send('st:command', { type: 'random_setup' });
    await until(() => (st!.gameView as any)?.grimoire?.length === 5, 8000, 'setup');
    st!.send('st:command', { type: 'begin_first_night' });
    await until(() => (st!.gameView as any)?.phase === 'first_night', 8000, 'night');
    for (const step of (st!.gameView as any).nightQueue) st!.send('st:command', { type: 'skip_step', stepId: step.id });
    st!.send('st:command', { type: 'advance_phase', to: 'day' });
    await until(() => (st!.gameView as any)?.phase === 'day', 8000, 'day');
    await page.getByText('Day 1').first().waitFor({ timeout: 15_000 });
    await sleep(1500);
    await shot(page, '0-before');
    report.before = await visibleStatus(page);

    // ---- the event
    const pidBefore = MODE === 'test' ? sh('systemctl', ['--user', 'show', '-p', 'MainPID', '--value', UNIT]) : sh('systemctl', ['show', '-p', 'MainPID', '--value', 'clocktower-dev.service']);
    const t0 = Date.now();
    if (MODE === 'test') sh('systemctl', ['--user', 'kill', '-s', 'SIGKILL', UNIT]);
    else sh('sudo', ['-n', '/usr/bin/systemctl', 'restart', 'clocktower-dev.service']);
    log(`${MODE === 'test' ? 'SIGKILL' : 'restart'} sent to pid ${pidBefore}`);
    let downSeen = false;
    let upAt = 0;
    const timeline: { t: number; status: string; health: boolean }[] = [];
    let lastStatus = '';
    for (let i = 0; i < 180; i++) {
      const h = await health();
      if (!h) downSeen = true;
      if (h && (downSeen || i > 4) && !upAt) upAt = Date.now();
      const s = await visibleStatus(page);
      if (s !== lastStatus) {
        timeline.push({ t: Date.now() - t0, status: s, health: !!h });
        lastStatus = s;
      }
      const el = Date.now() - t0;
      if (i === 6) await shot(page, '1-plus3s');
      if (el > 15_000 && !report.shot15) (report.shot15 = true), await shot(page, '2-plus15s');
      if (el > 45_000 && !report.shot45) (report.shot45 = true), await shot(page, '3-plus45s');
      if (el > 90_000) break;
      await sleep(500);
    }
    await shot(page, '4-plus90s');
    const pidAfter = MODE === 'test' ? sh('systemctl', ['--user', 'show', '-p', 'MainPID', '--value', UNIT]) : sh('systemctl', ['show', '-p', 'MainPID', '--value', 'clocktower-dev.service']);
    report.restart = {
      pidBefore,
      pidAfter,
      nRestarts: MODE === 'test' ? sh('systemctl', ['--user', 'show', '-p', 'NRestarts', '--value', UNIT]) : sh('systemctl', ['show', '-p', 'NRestarts', '--value', 'clocktower-dev.service']),
      healthyAfterMs: upAt ? upAt - t0 : null,
    };
    report.browserTimeline = timeline;

    // Bots: close codes, reconnect, tickets, sessions.
    report.bots = await Promise.all(
      bots.map(async (b) => {
        const close = b.lastCloseCode;
        const rec = await b.reconnect().then(
          () => 'reconnected',
          (e) => `reconnect failed: ${(e as Error).message}`,
        );
        const t = await b.api.ticket(lobbyId, 'reconnect');
        const me = await b.api.me();
        return { bot: b.name, closeCode: close, reconnect: rec, reconnectTicket: `${t.status} ${(t.body as any)?.error ?? ''}`, sessionStillValid: me.status === 200 };
      }),
    );
    const lobbies = await bots[0]!.api.listLobbies();
    report.lobbyAfter = lobbies.body.lobbies.find((l) => l.id === lobbyId) ?? 'gone';

    // What does a reload show?
    await page.reload();
    await sleep(4000);
    report.afterReload = { url: page.url(), status: await visibleStatus(page) };
    await shot(page, '5-after-reload');
    report.consoleTail = consoleLines.slice(-15);
  } finally {
    await browser.close();
    for (const b of bots) await b.leave(false).catch(() => undefined);
    if (MODE === 'test') {
      try {
        execFileSync('systemctl', ['--user', 'stop', UNIT], { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
      rmSync(dataDir, { recursive: true, force: true });
    }
  }
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `crash-${MODE}-${(report.at as string).replace(/[:.]/g, '-').slice(0, 19)}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  log(`wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  try {
    execFileSync('systemctl', ['--user', 'stop', UNIT], { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
