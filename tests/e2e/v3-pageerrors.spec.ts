// v3.1 (fixes) — v3-pageerrors: the HIGH tier page stays free of page errors while avatars are built, dropped and
// rebuilt. v3.0 dev smoke saw an uncaught "TypeError: Cannot read properties of undefined (reading 'isReady')" from
// three's compileAsync poll on an avatar disposed mid-compile (docs/RELEASE-v3.md known issues); the avatar pre-warm
// now uses avatars/precompile.ts. 8 protocol bots join a v3 lobby, the page loads at the high tier (ct.fxQuality
// 'high'), then bots leave and new ones join in waves while the page is still building / pre-compiling bodies, so
// bodies are disposed during their pre-compile. Asserts: no `pageerror` at all, no console error mentioning
// `isReady`. Project `v3` only (scripts/v3/e2e.sh); meant for CT_GL=gpu (KHR_parallel_shader_compile), also runs on
// SwiftShader (no parallel compile: the poll resolves at once, the race is narrower).
import { expect, test } from '@playwright/test';
import { makeBots, type Bot } from '../support/bot';
import { FrameTap, setE2eWorld, v3Context, v3Info, waitAvatarsSettled, waitV3Ready } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

test('v3 page errors: high-tier avatar builds with join / leave churn raise no page error', async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  const url = baseURL!;
  const ws = url.replace(/^http/, 'ws');
  const first = await makeBots(8, 'Churn ', url, ws);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const ctx = await v3Context(browser, { viewport: { width: 1280, height: 720 }, extra: { 'ct.fxQuality': 'high' } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${e.message.slice(0, 300)}\n${(e.stack ?? '').slice(0, 600)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  const tap = new FrameTap('Churner', page);
  const joined: Bot[] = [];
  try {
    const id = await first[0]!.createLobby('v3 page errors', 15, false, { world: 'v3' });
    for (const b of first) {
      await b.join(id);
      joined.push(b);
    }
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Churner' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    await tap.until(() => tap.last('lobby:view')?.youPid, 30_000, 'lobby:view');
    const info = await waitV3Ready(page, 240_000, 'churn');
    test.info().annotations.push({ type: 'v3-tier', description: `${info.tier} gpu=${info.gpu}` });
    console.log('[v3-pageerrors] ready', JSON.stringify(info));
    if (process.env.CT_GL !== 'swiftshader') expect(info.tier, 'the high tier on the GPU').toBe('high');
    // Without KHR_parallel_shader_compile every program is ready at the synchronous check (no compile window: the
    // context-loss case below then reports 'no compile window seen'; the unit test covers it). three's own
    // compileAsync always waited one 10 ms tick there, which is how v3.0 hit the error on this kind of GPU.
    const khr = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('.ct-game-canvas > canvas');
      const gl = (c?.getContext('webgl2') ?? c?.getContext('webgl')) as WebGLRenderingContext | null | undefined;
      return gl?.getSupportedExtensions()?.includes('KHR_parallel_shader_compile') ?? null;
    });
    test.info().annotations.push({ type: 'v3-khr-parallel-compile', description: String(khr) });
    console.log('[v3-pageerrors] KHR_parallel_shader_compile', khr);

    // churn while the page builds: every wave, two bots leave (bodies built, building or pre-compiling are dropped)
    // and two fresh bots join (new builds + pre-compiles)
    for (let wave = 0; wave < 4; wave++) {
      await page.waitForTimeout(1200);
      for (const b of joined.splice(0, 2)) await b.leave().catch(() => undefined);
      const fresh = await makeBots(2, `Wave${wave} `, url, ws);
      for (const b of fresh) {
        await b.join(id);
        joined.push(b);
      }
    }
    await waitAvatarsSettled(page, 240_000, 'churn');
    // one more drop right after the last builds landed, then outlast the pre-warm deadline (3 s) + poll timers
    for (const b of joined.splice(0, 2)) await b.leave().catch(() => undefined);
    await page.waitForTimeout(6000);

    // the hard case: the whole scene is torn down (context-loss rebuild = renderer.dispose(), which also clears the
    // renderer's material properties) WHILE a body is pre-compiling. Three new bots join; the page loses its GL
    // context from inside the page the moment an avatar reports `compiling` (no round-trip delay).
    const armed = page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const t0 = performance.now();
          const tick = () => {
            const list = ((window as unknown as { __ctCamera?: { avatars3d?: () => { key: string; compiling?: boolean }[] } }).__ctCamera?.avatars3d?.() ?? []) as { key: string; compiling?: boolean }[];
            const hit = list.find((e) => e.compiling);
            if (hit) {
              const c = document.querySelector<HTMLCanvasElement>('.ct-game-canvas > canvas');
              const gl = (c?.getContext('webgl2') ?? c?.getContext('webgl')) as WebGLRenderingContext | null | undefined;
              const ext = gl?.getExtension('WEBGL_lose_context');
              if (!ext) return resolve('no WEBGL_lose_context');
              ext.loseContext();
              return resolve(`lost while ${hit.key} compiled`);
            }
            if (performance.now() - t0 > 90_000) return resolve('no compile window seen');
            setTimeout(tick, 0);
          };
          tick();
        }),
    );
    let lossNote: string | null = null;
    void armed.then((n) => (lossNote = n));
    // rounds of fresh joiners (new cast picks = new programs to compile) until the loss fired
    for (let round = 0; round < 6 && lossNote === null; round++) {
      const late = await makeBots(3, `Late${round} `, url, ws);
      for (const b of late) {
        await b.join(id);
        joined.push(b);
      }
      for (let i = 0; i < 8 && lossNote === null; i++) await page.waitForTimeout(500);
      if (lossNote === null) for (const b of joined.splice(0, 3)) await b.leave().catch(() => undefined);
    }
    lossNote ??= await armed;
    test.info().annotations.push({ type: 'v3-loss-during-compile', description: lossNote });
    console.log('[v3-pageerrors]', lossNote);
    if (lossNote!.startsWith('lost')) {
      await expect.poll(async () => (await v3Info(page))?.ready ?? false, { timeout: 120_000, message: 'rebuilt after the context loss' }).toBe(true);
      await waitAvatarsSettled(page, 240_000, 'after loss');
    }
    await page.waitForTimeout(6000);
    console.log('[v3-pageerrors] after churn', JSON.stringify(await v3Info(page)));
    console.log('[v3-pageerrors] pre-warm', JSON.stringify(await page.evaluate(() => (window as unknown as { __ctCamera?: { avatarsWarm?: () => unknown } }).__ctCamera?.avatarsWarm?.() ?? null)));
    if (consoleErrors.length) console.log('[v3-pageerrors] console errors (not all fatal):\n' + consoleErrors.join('\n'));
    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors.filter((t) => /isReady/.test(t)), 'isReady console errors').toEqual([]);
  } finally {
    for (const b of joined) await b.leave().catch(() => undefined);
    await ctx.close();
  }
});
