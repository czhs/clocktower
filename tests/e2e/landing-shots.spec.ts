// Landing (sign-in) screen: screenshots at the three reference sizes, strict-CSP check, load timing
// and the auth flows' accessible names. Owned by the landing teammate.
//
//   LANDING_TAG=after pnpm test:e2e landing-shots      -> docs/screenshots/landing-<tag>-<size>.png
//
// The tour (apps/client/src/ui/intro) is marked as seen first so it does not cover the screen; one
// extra test checks that a first-time visitor gets it (when the component exists).
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/screenshots');
const TAG = process.env.LANDING_TAG ?? 'after';
const SIZES = [
  { n: 'd1440', w: 1440, h: 900, mobile: false },
  { n: 'd1280', w: 1280, h: 720, mobile: false },
  { n: 'm390', w: 390, h: 844, mobile: true },
] as const;

let ipNo = 0;
const fakeIp = () => `10.88.${(process.pid + ++ipNo) % 250}.${ipNo % 250}`;

async function open(browser: Browser, s: (typeof SIZES)[number], opts: { tourSeen?: boolean; reduced?: boolean } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 1,
    isMobile: s.mobile,
    hasTouch: s.mobile,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
    extraHTTPHeaders: { 'X-Forwarded-For': fakeIp() },
  });
  await ctx.addInitScript((seen: boolean) => {
    (window as any).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as any).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    try {
      if (seen) localStorage.setItem('ct.intro.seen.v1', '1');
      // The tour skips its first-visit auto-show under automation unless a spec opts in.
      else localStorage.setItem('ct.intro.autotest', '1');
    } catch {
      /* ignore */
    }
  }, opts.tourSeen !== false);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content.Security.Policy|Refused to/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { ctx, page, errors };
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Let the hero layers fade in.
  await page.waitForTimeout(1800);
}

/** CSP violations, minus the known pre-existing one: msgpackr (colyseus, main bundle) probes
 * `new Function('')` inside try/catch to pick its decoder, which CSP reports as `script-src eval`
 * while the app works normally. Anything else (img/style/font/media/connect...) fails the test. */
async function cspViolations(page: Page): Promise<string[]> {
  const all = await page.evaluate(() => (window as any).__csp as string[]);
  const probes = all.filter((v) => /^script-src(-elem)? eval$/.test(v));
  if (probes.length) console.log(`[landing] ignored ${probes.length} known msgpackr eval-probe report(s)`);
  return all.filter((v) => !/^script-src(-elem)? eval$/.test(v));
}

mkdirSync(OUT, { recursive: true });

for (const s of SIZES) {
  test(`landing screenshots ${s.n}`, async ({ browser }) => {
    const { ctx, page, errors } = await open(browser, s);
    const t0 = Date.now();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
    const interactiveMs = Date.now() - t0;
    await settle(page);
    const perf = await page.evaluate(() => {
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1;
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const landing = res.filter((r) => r.name.includes('/landing/'));
      const sum = (a: PerformanceResourceTiming[]) => a.reduce((n, r) => n + (r.encodedBodySize || 0), 0);
      return { fcp: Math.round(fcp), landingBytes: sum(landing), landingFiles: landing.map((r) => r.name.split('/landing/')[1]), totalBytes: sum(res) };
    });
    console.log(`[landing ${s.n}] interactive=${interactiveMs}ms fcp=${perf.fcp}ms landing=${perf.landingBytes}B (${perf.landingFiles.length} files: ${perf.landingFiles.join(', ')}) totalResources=${perf.totalBytes}B`);
    await page.screenshot({ path: path.join(OUT, `landing-${TAG}-${s.n}.png`) });
    if (!s.mobile) {
      // Desktop parallax: the separated planes loaded and follow the pointer.
      await expect(page.locator('.ct-hero.planes-ready')).toHaveCount(1);
      await page.mouse.move(40, 40);
      await page.mouse.move(s.w - 40, s.h - 40, { steps: 8 });
      await page.waitForTimeout(600);
      const moved = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-depth]')).filter((el) => /translate3d\((?!0px, 0px)/.test(el.style.transform)).length,
      );
      expect(moved).toBeGreaterThan(2);
    }

    // Create account form + passphrase reveal (accessible names the other specs rely on).
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Display name').fill(`Lantern ${s.n}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `landing-${TAG}-${s.n}-create.png`) });
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByLabel('Your passphrase')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter the town' })).toBeDisabled();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `landing-${TAG}-${s.n}-reveal.png`) });
    await page.getByLabel('I have saved my passphrase somewhere safe').check();
    await page.getByRole('button', { name: 'Enter the town' }).click();
    await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();

    expect(await cspViolations(page)).toEqual([]);
    expect(errors.filter((e) => !/401|Unauthorized|Failed to load resource/i.test(e))).toEqual([]);
    await ctx.close();
  });
}

test('sign-in form and invited path', async ({ browser }) => {
  const { ctx, page, errors } = await open(browser, SIZES[0]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in with passphrase' }).click();
  await expect(page.getByLabel('Passphrase', { exact: true })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `landing-${TAG}-d1440-signin.png`) });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'How to play' })).toBeVisible();

  // Shared lobby link while signed out: short "invited" path with a prominent join action.
  await page.goto('/lobby/abcd1234');
  await expect(page.getByText(/invited/i).first()).toBeVisible();
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `landing-${TAG}-d1440-invited.png`) });
  expect(await cspViolations(page)).toEqual([]);
  expect(errors.filter((e) => !/401|Unauthorized|Failed to load resource/i.test(e))).toEqual([]);
  await ctx.close();
});

test('invited path on a phone', async ({ browser }) => {
  const { ctx, page } = await open(browser, SIZES[2]);
  await page.goto('/lobby/abcd1234');
  await expect(page.getByText(/invited/i).first()).toBeVisible();
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `landing-${TAG}-m390-invited.png`) });
  expect(await cspViolations(page)).toEqual([]);
  await ctx.close();
});

test('reduced motion: static hero, still usable', async ({ browser }) => {
  const { ctx, page } = await open(browser, SIZES[1], { reduced: true });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await settle(page);
  await page.mouse.move(100, 100);
  await page.mouse.move(1200, 700);
  await page.waitForTimeout(300);
  // No parallax transform is applied while reduced motion is requested.
  const moved = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-depth]')).some((el) => {
      const t = getComputedStyle(el).transform;
      return t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
    }),
  );
  expect(moved).toBe(false);
  expect(await cspViolations(page)).toEqual([]);
  await ctx.close();
});

test('first visit opens the tour; Watch the tour reopens it', async ({ browser }) => {
  test.skip(!existsSync(path.join(ROOT, 'apps/client/src/ui/intro/index.ts')), 'tour component (ui/intro) not in this tree yet');
  const { ctx, page } = await open(browser, SIZES[0], { tourSeen: false });
  await page.goto('/');
  const tour = page.locator('.ct-intro[role="dialog"]');
  await expect(tour).toBeVisible();
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `landing-${TAG}-d1440-tour.png`) });
  await page.keyboard.press('Escape');
  await expect(tour).toBeHidden();
  // Seen now: the landing stays usable and the link brings the tour back.
  await page.getByRole('button', { name: /watch the tour/i }).click();
  await expect(tour).toBeVisible();
  await tour.locator('.ct-intro-skip').click();
  await expect(tour).toBeHidden();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  expect(await cspViolations(page)).toEqual([]);
  await ctx.close();
});
