// v3 WP7 (v3-qa) — v3-vote (docs/v3/INTEGRATION.md §3.2, §6.2, WP3 "Tests"): a 5-player game in a v3 lobby (the page is
// one of the players, the Storyteller and four players are protocol bots). A nomination goes to a vote; the page's
// dais (__ctCamera.dais()) shows 5 occupied stones on the server's round(k·15/n) % 15 stone mapping, the clock hand on
// the current voter's stone while voting, and a lit vote lamp for each resolved yes vote. SwiftShader stalls once on
// the first 'vote' frame (§8 WP3 notes, ≈ 20 s): the waits allow for it. Project `v3` only (scripts/v3/e2e.sh).
import { expect, test } from '@playwright/test';
import type { PlayerGameView, StorytellerGameView } from '../../packages/protocol/src/index';
import { makeBots } from '../support/bot';
import { until } from '../support/game';
import { FrameTap, inject, requireV3Hooks, setE2eWorld, v3Context, v3Shot, waitAvatarsSettled, waitV3Ready, watchConsole } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

type Dais = { phase: string; hand: number | null; seats: { stone: number; occupied: boolean; dead: boolean; voteHand: boolean }[] };
const N = 5;
const stoneOf = (k: number, n: number) => Math.round((k * 15) / n) % 15;

test('v3 vote: 5-player nomination drives the dais (seats, clock hand, vote lamps)', async ({ browser, baseURL }) => {
  test.setTimeout(480_000);
  const url = baseURL!;
  const bots = await makeBots(N, 'Vote ', url, url.replace(/^http/, 'ws'));
  const [st, ...players] = bots as [(typeof bots)[0], ...typeof bots];
  for (const b of bots) b.autoRespondEnabled = false;
  const ctx = await v3Context(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  watchConsole(page, 'vote', errors);
  // (diagnostics) every page warning / error and the 3D town's own log lines, in the run log
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error' || /\[town3d\]|\[avatars\]/.test(m.text())) console.log('[vote page]', m.type(), m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => console.log('[vote page] pageerror', String(e).slice(0, 300)));
  const tap = new FrameTap('Voter', page);
  const dais = () => page.evaluate(() => ((window as unknown as { __ctCamera?: { dais?: () => unknown } }).__ctCamera?.dais?.() ?? null) as Dais | null);
  try {
    const id = await st!.createLobby('v3 vote', N, true, { world: 'v3' });
    await st!.join(id, 'storyteller');
    for (const p of players) await p.join(id);
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Voter' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    await tap.until(() => tap.last('lobby:view')?.youPid, 30_000, 'lobby:view');
    await waitV3Ready(page, 240_000, 'vote');
    await requireV3Hooks(page, 'WP3 dais', ['dais']);
    console.log('[v3-vote] ready', await page.evaluate(() => JSON.stringify((window as unknown as { __ctCamera?: { camera3d?: () => unknown } }).__ctCamera?.camera3d?.() ?? null)));
    for (const p of players) p.send('lobby:ready', { ready: true });
    await inject(page, 'lobby:ready', { ready: true });
    await until(() => st!.lobbyView?.canStart, 15_000, 'canStart');
    const stView = () => st!.gameView as StorytellerGameView | undefined;
    const cmd = (c: unknown) => st!.send('st:command', c);
    st!.send('lobby:start', {});
    await until(() => stView()?.kind === 'storyteller', 10_000, 'ST view');
    cmd({ type: 'random_setup' });
    await until(() => (stView()?.grimoire?.length ?? 0) === N, 10_000, 'grimoire');
    cmd({ type: 'begin_first_night' });
    await until(() => stView()?.phase === 'first_night', 10_000, 'first night');
    for (const s of stView()?.nightQueue ?? []) if (s.status !== 'resolved' && s.status !== 'skipped') cmd({ type: 'skip_step', stepId: s.id });
    if ((stView() as { pendingResult?: unknown } | undefined)?.pendingResult) cmd({ type: 'override_result' });
    cmd({ type: 'advance_phase', to: 'day' });
    await until(() => stView()?.phase === 'day', 10_000, 'day');
    await tap.until(() => (tap.last('game:view') as PlayerGameView | undefined)?.phase === 'day', 30_000, 'page: day');

    // every avatar built before the vote (a SwiftShader rig build stalls the page's frames for seconds)
    const progress = () =>
      page.evaluate(() => {
        const c = (window as unknown as { __ctCamera?: { camera3d?: () => { frames: number; mode: string }; avatars3d?: () => { key: string; building: boolean; texture: string | null; parked: boolean }[] } }).__ctCamera;
        const a = c?.avatars3d?.() ?? [];
        return `frames ${c?.camera3d?.().frames} mode ${c?.camera3d?.().mode} avatars ${a.length} building ${a.filter((e) => e.building).map((e) => e.key).join(',')} built ${a.filter((e) => e.texture).length} parked ${a.filter((e) => e.parked).length}`;
      });
    test.info().annotations.push({ type: 'v3-progress-day', description: await progress() });
    await waitAvatarsSettled(page, 240_000, 'vote');
    test.info().annotations.push({ type: 'v3-progress-settled', description: await progress() });
    console.log('[v3-vote]', await progress());
    // the dais: N occupied stones on the server's stone mapping
    await expect.poll(async () => (await dais())?.seats.filter((s) => s.occupied).length ?? null, { timeout: 60_000, message: '__ctCamera.dais(): occupied stones' }).toBe(N);
    const d0 = (await dais())!;
    const want = Array.from({ length: N }, (_, k) => stoneOf(k, N)).sort((a, b) => a - b);
    expect(d0.seats.filter((s) => s.occupied).map((s) => s.stone).sort((a, b) => a - b), 'stones = round(k·15/n) % 15').toEqual(want);

    // a nomination and a vote: two bots vote yes
    cmd({ type: 'set_nominations_open', open: true });
    const [nominator, nominee, ...rest] = players;
    await until(() => (nominator!.gameView as PlayerGameView | undefined)?.day?.nominationsOpen, 10_000, 'nominations open');
    const nomineeSeat = (nominee!.gameView as PlayerGameView).you.seat;
    nominator!.send('game:nominate', { nomineeSeat });
    const nom = await until(() => stView()?.day?.nominations[0], 10_000, 'nomination');
    cmd({ type: 'start_vote', nominationId: nom.id });
    await until(() => stView()?.day?.nominations[0]?.status === 'voting', 10_000, 'voting');
    for (const v of [nominator!, rest[0]!]) v.send('game:vote', { nominationId: nom.id, vote: true });

    // while voting: the clock hand sits on the current voter's stone, and every resolved yes vote lights its lamp
    const seen = { hand: false, lamps: false, samples: [] as string[] };
    const t0 = Date.now();
    for (;;) {
      const d = await dais();
      const n = (tap.last('game:view') as PlayerGameView | undefined)?.day?.nominations.find((x) => x.id === nom.id);
      if (n?.status === 'voting' && d) {
        if (n.currentVoterSeat !== null && d.hand === stoneOf(n.currentVoterSeat, N)) seen.hand = true;
        const yes = Object.entries(n.votes).filter(([, v]) => v).map(([k]) => stoneOf(Number(k), N)).sort((a, b) => a - b);
        const lamps = d.seats.filter((x) => x.voteHand).map((x) => x.stone).sort((a, b) => a - b);
        if (yes.length && JSON.stringify(yes) === JSON.stringify(lamps)) seen.lamps = true;
        const diag = await page.evaluate(() => {
          const c = (window as unknown as { __ctCamera?: { camera3d?: () => { mode: string; yaw: number; frames: number }; stage?: () => { drawn?: string; phase?: string }; v3?: () => { frameMs: { p50: number; p95: number } } } }).__ctCamera;
          const cm = c?.camera3d?.();
          const f = c?.v3?.().frameMs;
          const st = c?.stage?.();
          return `${cm?.mode ?? '?'}@${cm?.yaw ?? '?'} frames ${cm?.frames ?? '?'} since ${(cm as { sinceFrameMs?: number } | undefined)?.sinceFrameMs ?? '?'} lc ${(cm as { lifecycle?: string } | undefined)?.lifecycle ?? '?'} p50 ${f?.p50 ?? '?'} drawn ${st?.drawn ?? '?'} ${document.visibilityState}`;
        });
        seen.samples.push(`voter ${n.currentVoterSeat} hand ${d.hand} yes ${yes} lamps ${lamps} [${diag}]`);
      }
      if (stView()?.day?.nominations.find((x) => x.id === nom.id)?.status === 'tallied' && n?.status !== 'voting') break;
      if (Date.now() - t0 > 180_000) throw new Error(`vote did not finish in 180 s (${seen.samples.slice(-6).join(' | ')})`);
      await page.waitForTimeout(400);
    }
    expect(seen.hand, `__ctCamera.dais().hand = stone of currentVoterSeat while voting (${seen.samples.slice(-8).join(' | ')})`).toBe(true);
    expect(seen.lamps, `vote lamps = the resolved yes voters' stones (${seen.samples.slice(-8).join(' | ')})`).toBe(true);
    // after the vote the hand goes away
    await expect.poll(async () => (await dais())?.hand ?? null, { timeout: 60_000, message: 'no clock hand after the tally' }).toBeNull();
    await v3Shot(page, 'v3-vote.png');
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all(bots.map((b) => b.leave()));
  }
});
