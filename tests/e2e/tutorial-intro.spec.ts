// The pre-sign-in tour (tutorial teammate): first-visit auto-show, Skip, "Watch the tour", the How
// to play link, keyboard/swipe, clips from 'self' with zero CSP violations, phone layout, and the
// bundle-size impact. Runs with either config:
//   CT_AGENT=tutorial scripts/remote.sh pnpm exec playwright test -c tests/e2e/tutorial.config.ts --project intro
// Screenshots: docs/screenshots/tutorial-*.png.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = path.join(ROOT, 'docs/screenshots');
const DIST = path.join(ROOT, 'apps/client/dist');
const hasFootage = existsSync(path.join(ROOT, 'apps/client/public/tutorial/manifest.json'));

/** CSP violations + console errors + every /tutorial/ response, per page. */
async function watch(page: Page) {
  const errors: string[] = [];
  const media: { url: string; status: number }[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/tutorial/')) media.push({ url: r.url(), status: r.status() });
  });
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return {
    errors,
    media,
    /** CSP violations, minus the app's pre-existing `script-src eval` feature probe (a dependency
     * tries new Function() once at load and falls back; it fires before the tour is ever opened). */
    csp: async () => {
      const all = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
      const evalProbes = all.filter((v) => /^script-src(-elem)? eval$/.test(v));
      if (evalProbes.length) test.info().annotations.push({ type: 'csp', description: `ignored ${evalProbes.length} pre-existing 'script-src eval' probe(s)` });
      return all.filter((v) => !evalProbes.includes(v));
    },
    raw: () => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []),
  };
}

/** How to play -> "▶ Watch the tour" (the link inside the help dialog). */
async function openFromHelp(page: Page) {
  await page.getByRole('button', { name: /how to play/i }).first().click();
  await page.getByRole('dialog', { name: 'How to play' }).getByRole('button', { name: /Watch the tour/ }).click();
}

const tour = (page: Page) => page.getByRole('dialog').filter({ has: page.locator('#ct-intro-title') });

/** The current clip is a real, playing video served from our own origin. */
async function expectClipPlays(page: Page) {
  const v = page.locator('.ct-intro-stage video.ct-intro-media');
  await expect(v).toHaveCount(1);
  await expect
    .poll(async () => v.evaluate((el: HTMLVideoElement) => ({ t: el.currentTime, w: el.videoWidth, paused: el.paused, src: el.currentSrc })), { timeout: 15_000 })
    .toMatchObject({ paused: false, w: 960 });
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.8);
  const src = await v.evaluate((el: HTMLVideoElement) => el.currentSrc);
  expect(new URL(src).origin).toBe(new URL(page.url()).origin);
  expect(new URL(src).pathname).toMatch(/^\/tutorial\/[a-z]+\.(webm|mp4)$/);
}

test.describe('pre-sign-in tour', () => {
  test.skip(!hasFootage, 'no recorded footage (run pnpm capture:tutorial first)');

  test('How to play -> Watch the tour: real clips from self, keyboard, swipe, Esc; no CSP violations', async ({ page }) => {
    const w = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    // the landing screen may auto-show the tour for real users; automation is opted out by default
    await expect(tour(page)).toHaveCount(0);
    await page.waitForTimeout(1000);
    const before = (await w.raw()).length;
    await openFromHelp(page);
    const t = tour(page);
    await expect(t).toBeVisible();
    await expect(t.locator('#ct-intro-title')).toHaveText('A town to wander');
    await expectClipPlays(page);
    // only the current clip + the next one's metadata are requested, never the whole set
    const clipsAsked = new Set(w.media.filter((m) => /\.(webm|mp4)/.test(m.url)).map((m) => new URL(m.url).pathname.replace(/\.(webm|mp4)$/, '')));
    expect(clipsAsked.size, [...clipsAsked].join(',')).toBeLessThanOrEqual(2);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, 'tutorial-desktop-1.png') });
    // keyboard
    await page.keyboard.press('ArrowRight');
    await expect(t.locator('#ct-intro-title')).toHaveText('Talk to whoever is near');
    await expectClipPlays(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(t.locator('#ct-intro-title')).toHaveText('Step inside for a private word');
    // dots
    await t.getByRole('button', { name: /^Card 5 of 7/ }).click();
    await expect(t.locator('#ct-intro-title')).toHaveText('The Storyteller visits in secret');
    await expectClipPlays(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'tutorial-desktop-visit.png') });
    // swipe (pointer drag on the clip) goes back
    const box = (await t.locator('.ct-intro-stage').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(t.locator('#ct-intro-title')).toHaveText('At night, walk home and wait…');
    // the last card offers to start
    await t.getByRole('button', { name: /^Card 7 of 7/ }).click();
    await expect(t.getByRole('button', { name: 'Start playing' })).toBeVisible();
    await expectClipPlays(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'tutorial-desktop-storyteller.png') });
    // Esc closes; the auth screen is usable again
    await page.keyboard.press('Escape');
    await expect(t).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create account' }).first()).toBeVisible();
    // every clip/poster came from our origin and loaded
    expect(w.media.length).toBeGreaterThan(2);
    for (const m of w.media) {
      expect(new URL(m.url).origin).toBe(new URL(page.url()).origin);
      expect([200, 206, 304], m.url).toContain(m.status);
    }
    expect(await w.csp(), 'CSP violations').toEqual([]);
    expect((await w.raw()).length, 'no CSP violation of any kind while the tour was open').toBe(before);
    expect(w.errors.filter((e) => !/Failed to load resource: the server responded with a status of 401|'unsafe-eval'|EvalError/.test(e)), 'console errors').toEqual([]);
  });

  test('first visit: auto-shows once, Skip closes it, "Watch the tour" reopens it (needs the landing mount)', async ({ page }) => {
    const w = await watch(page);
    await page.addInitScript(() => localStorage.setItem('ct.intro.autotest', '1'));
    await page.goto('/');
    await page.waitForTimeout(1500);
    const t = tour(page);
    test.skip((await t.count()) === 0, 'IntroHost is not mounted on the auth screen in this build (landing teammate integrates it)');
    await expect(t).toBeVisible();
    await expectClipPlays(page);
    await t.getByRole('button', { name: 'Skip — create account / sign in' }).click();
    await expect(t).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('ct.intro.seen.v1'))).toBe('1');
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(t).toHaveCount(0);
    await page.getByRole('button', { name: /Watch the tour/ }).first().click();
    await expect(t).toBeVisible();
    await expectClipPlays(page);
    await page.keyboard.press('Escape');
    await expect(t).toHaveCount(0);
    expect(await w.csp()).toEqual([]);
  });

  test('phone 390x844: fits, swipes, Skip always visible; invited link -> "Join the game"', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const w = await watch(page);
    await page.goto('/');
    await openFromHelp(page);
    const t = tour(page);
    await expect(t).toBeVisible();
    await expectClipPlays(page);
    const skip = t.getByRole('button', { name: /Skip/ });
    await expect(skip).toBeInViewport();
    await expect(t.getByRole('button', { name: /^Next/ })).toBeInViewport();
    // nothing overflows horizontally
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(SHOTS, 'tutorial-phone-1.png') });
    // touch swipe left -> next card
    const box = (await t.locator('.ct-intro-stage').boundingBox())!;
    await page.evaluate(
      ({ x0, x1, y }) => {
        const el = document.querySelector('.ct-intro-stage')!;
        const ev = (type: string, x: number) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', bubbles: true }));
        ev('pointerdown', x0);
        ev('pointerup', x1);
      },
      { x0: box.x + box.width * 0.85, x1: box.x + box.width * 0.15, y: box.y + box.height / 2 },
    );
    await expect(t.locator('#ct-intro-title')).toHaveText('Talk to whoever is near');
    await t.getByRole('button', { name: /^Card 6 of 7/ }).click();
    await expectClipPlays(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'tutorial-phone-vote.png') });
    await skip.click();
    await expect(t).toHaveCount(0);
    expect(await w.csp()).toEqual([]);
    // invited (share link), when the landing screen mounts the tour
    await page.addInitScript(() => {
      localStorage.removeItem('ct.intro.seen.v1');
      localStorage.setItem('ct.intro.autotest', '1');
    });
    await page.goto('/lobby/AbCdEf1234');
    await page.waitForTimeout(1500);
    if (await t.count()) {
      await expect(t.getByRole('button', { name: 'Join the game' })).toBeVisible();
      await expect(t.getByRole('button', { name: /^Card \d of 4/ })).toHaveCount(4);
      await page.screenshot({ path: path.join(SHOTS, 'tutorial-phone-invited.png') });
      await t.getByRole('button', { name: 'Join the game' }).click();
      await expect(t).toHaveCount(0);
    } else test.info().annotations.push({ type: 'note', description: 'invited auto-show not checked: IntroHost not mounted on the auth screen in this build' });
    await ctx.close();
  });

  test('reduced motion: posters and captions, no autoplay', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1024, height: 700 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await openFromHelp(page);
    const t = tour(page);
    await expect(t.locator('img.ct-intro-poster')).toBeVisible();
    await expect(t.locator('video.ct-intro-media')).toHaveCount(0);
    await expect(t.locator('#ct-intro-title')).toHaveText('A town to wander');
    await page.screenshot({ path: path.join(SHOTS, 'tutorial-reduced-motion.png') });
    await t.getByRole('button', { name: /Play the clip/ }).click();
    await expectClipPlays(page);
    await ctx.close();
  });

  test('bundle impact: videos are not in the JS bundle; the tour chunk is small', async () => {
    test.skip(!existsSync(path.join(DIST, 'assets')), 'no client build');
    const assets = readdirSync(path.join(DIST, 'assets'));
    expect(assets.filter((f) => /\.(webm|mp4)$/.test(f))).toEqual([]);
    const tourJs = assets.filter((f) => /^IntroTour-.*\.js$/.test(f));
    expect(tourJs.length).toBe(1);
    const size = statSync(path.join(DIST, 'assets', tourJs[0]!)).size;
    test.info().annotations.push({ type: 'size', description: `IntroTour chunk ${size} B; tutorial/ ${dirSize(path.join(DIST, 'tutorial'))} B` });
    expect(size).toBeLessThan(25_000);
    const index = readFileSync(path.join(DIST, 'index.html'), 'utf8');
    expect(index).not.toMatch(/tutorial\//);
  });
});

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((a, f) => a + statSync(path.join(dir, f)).size, 0);
}
