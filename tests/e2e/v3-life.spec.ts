// v3 WP7 (v3-qa) — v3-life (docs/v3/INTEGRATION.md §3.1 "Life", §6.2, WP3 "Tests"): in a social-deduction game a door
// that opens by itself, a scripted walker or a bell from fake data misleads players. With nobody moving for 60 s in a
// v3 lobby, the 3D town's stage reports no game door write and no open door, the vendor life piece runs without
// walkers / door drivers / folk / ambient townsfolk / bench folk, and the tower rings no bell (no phase change).
// Reads WP3's __ctCamera.stage() (§8 WP3 "API (as built)"). Project `v3` only (scripts/v3/e2e.sh).
import { expect, test } from '@playwright/test';
import { makeBots } from '../support/bot';
import { requireV3Hooks, setE2eWorld, v3Context, waitV3Ready, watchConsole } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

type Stage = {
  bells?: number;
  doors?: { open?: string[]; writes?: Record<string, number>; angles?: Record<string, number> };
  life?: { walkers?: number; doors?: number; folk?: boolean | number; ambient?: boolean | number; benchFolk?: boolean | number };
};

test('v3 life: no door moves, no walkers / folk and no bell without a game event (60 s)', async ({ browser, baseURL }) => {
  test.setTimeout(420_000);
  const url = baseURL!;
  const [st] = await makeBots(1, 'Life ', url, url.replace(/^http/, 'ws'));
  const id = await st!.createLobby('v3 life', 15, true, { world: 'v3' });
  await st!.join(id, 'storyteller');
  const ctx = await v3Context(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  watchConsole(page, 'life', errors);
  const stage = () => page.evaluate(() => ((window as unknown as { __ctCamera?: { stage?: () => unknown } }).__ctCamera?.stage?.() ?? null) as Stage | null);
  try {
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Watcher' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    await waitV3Ready(page, 240_000, 'life');
    await requireV3Hooks(page, 'WP3 stage', ['stage']);
    const s0 = await stage();
    expect(s0, '__ctCamera.stage() (WP3 debug member) is installed').not.toBeNull();
    // a pivot's rest yaw is whatever the vendor built (not necessarily 0): compare against the first sample
    const a0 = s0!.doors?.angles ?? {};
    const drift = (s: Stage | null) => Math.max(0, ...Object.entries(s?.doors?.angles ?? {}).map(([k, v]) => Math.abs(Number(v) - Number(a0[k] ?? v))));
    expect(Object.keys(a0).length, 'the stage reports the door pivots').toBeGreaterThan(0);
    expect(s0!.doors?.open ?? [], 'no door open at rest').toEqual([]);
    const samples: string[] = [];
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(5000);
      const s = await stage();
      samples.push(JSON.stringify({ k, writes: s?.doors?.writes, open: s?.doors?.open, bells: s?.bells, life: s?.life, drift: drift(s) }));
      expect(drift(s), `a door pivot moved without a game setDoor (${samples.join(' ')})`).toBeLessThan(1e-3);
      expect(s?.doors?.open ?? [], 'no door opened by itself').toEqual([]);
    }
    const s1 = (await stage())!;
    test.info().annotations.push({ type: 'stage', description: JSON.stringify(s1) });
    expect(s1.doors?.writes, 'no door write while nobody used a door').toEqual(s0!.doors?.writes);
    expect(s1.bells ?? 0, 'no bell without a phase change').toBe(s0!.bells ?? 0);
    expect(s1.life, 'vendor life piece in game mode (lifeOff=walkers,doors,folk,cycle,ambient)').toMatchObject({ walkers: 0, doors: 0 });
    expect(!!s1.life?.folk, 'no folk').toBe(false);
    expect(!!s1.life?.ambient, 'no ambient townsfolk').toBe(false);
    expect(!!s1.life?.benchFolk, 'no bench folk').toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await st!.leave();
  }
});
