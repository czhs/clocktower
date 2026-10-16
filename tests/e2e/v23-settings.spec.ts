// (v2.3 settings/ux) The ⚙ Settings dialog in a real browser: every section renders, the choices are
// persisted in the owners' localStorage keys (ct.fxQuality, ct.reducedMotion, ct.voice.prefs …),
// push-to-talk can be rebound from Settings, Reset to defaults restores them, Esc closes and gives
// focus back to the gear, and the phone layout is one scrolling sheet with a chip row.
// Screenshots: docs/screenshots/v23-settings-*.png.
import path from 'node:path';
import { devices, expect, test, type Page } from '@playwright/test';
import { makeBots } from '../support/bot';

const SHOTS = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/screenshots');
const SECTIONS = [
  ['audio', 'Audio & voice'],
  ['graphics', 'Graphics'],
  ['chat', 'Chat & social'],
  ['controls', 'Controls'],
  ['privacy', 'Privacy & safety'],
  ['about', 'About'],
] as const;

const ls = (page: Page, k: string) => page.evaluate((key) => localStorage.getItem(key), k);
const quiet = () => {
  localStorage.setItem('ct.intro.seen.v1', '1');
  localStorage.setItem('ct.hint.move.v1', '1');
  localStorage.setItem('ct.hint.social.v1', '1');
  localStorage.setItem('ct.help.seen.v1', '1');
  localStorage.setItem('ct.debug.fps', '20');
};

test('settings dialog: sections, persistence, rebinding, reset, phone sheet', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const url = baseURL!;
  const bots = await makeBots(2, 'Set ', url, url.replace(/^http/, 'ws'));
  const id = await bots[0]!.createLobby('Settings check', 15, true);
  await bots[0]!.join(id, 'storyteller');
  await bots[1]!.join(id);

  // ---- desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.3.1' } });
  await ctx.addInitScript(quiet);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Tester' } })).ok()).toBe(true);
  await page.goto(`${url}/lobby/${id}`);
  const gear = page.getByRole('button', { name: 'Settings' });
  await expect(gear).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await gear.click();
  const dlg = page.getByRole('dialog', { name: 'Settings' });
  await expect(dlg).toBeVisible();
  for (const [sid, label] of SECTIONS) {
    await dlg.getByRole('tab', { name: label }).click();
    await expect(dlg.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
    await expect(dlg.getByRole('heading', { name: label })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, `v23-settings-${sid}.png`) });
  }

  // graphics + motion persist in the keys the town polls
  await dlg.getByRole('tab', { name: 'Graphics' }).click();
  await dlg.getByRole('radiogroup', { name: 'Graphics quality' }).getByRole('radio', { name: 'Low' }).click();
  await dlg.getByRole('radiogroup', { name: 'Reduced motion' }).getByRole('radio', { name: 'On' }).click();
  await dlg.getByRole('radiogroup', { name: 'Talking outlines' }).getByRole('radio', { name: 'Always on top' }).click();
  expect(await ls(page, 'ct.fxQuality')).toBe('low');
  expect(await ls(page, 'ct.reducedMotion')).toBe('1');
  expect(await ls(page, 'ct.talkOutline')).toBe('top');

  // push-to-talk rebinding from Settings (the voice client's prefs); Esc during capture only cancels
  await dlg.getByRole('tab', { name: 'Audio & voice' }).click();
  await dlg.getByRole('button', { name: /Change/ }).click();
  await expect(dlg.getByRole('button', { name: /Press a key/ })).toBeVisible();
  await page.keyboard.press('KeyB');
  await expect(dlg.getByRole('button', { name: /B\s*Change/ })).toBeVisible();
  expect(JSON.parse((await ls(page, 'ct.voice.prefs')) ?? '{}').pttKey).toBe('KeyB');
  await dlg.getByRole('button', { name: /Change/ }).click();
  await expect(dlg.getByRole('button', { name: /Press a key/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg.getByRole('button', { name: /B\s*Change/ })).toBeVisible();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('switch', { name: 'Join busy rooms muted' }).click();
  expect(JSON.parse((await ls(page, 'ct.voice.prefs')) ?? '{}').crowdMute).toBe(false);
  await page.screenshot({ path: path.join(SHOTS, 'v23-settings-audio-changed.png') });

  // reset to defaults (asks first)
  await dlg.getByRole('button', { name: 'Reset to defaults' }).click();
  await page.screenshot({ path: path.join(SHOTS, 'v23-settings-reset-confirm.png') });
  await dlg.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await ls(page, 'ct.fxQuality')).toBeNull();
  expect(await ls(page, 'ct.reducedMotion')).toBeNull();
  const vp = JSON.parse((await ls(page, 'ct.voice.prefs')) ?? '{}');
  expect([vp.pttKey, vp.crowdMute]).toEqual(['KeyV', true]);

  // Esc closes and focus returns to the gear; the last section is remembered
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Settings');
  await gear.click();
  await expect(dlg.getByRole('tab', { name: 'Audio & voice' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  await ctx.close();

  // ---- phone
  const { defaultBrowserType: _d, ...iphone } = devices['iPhone 13'];
  const phone = await browser.newContext({ ...iphone, extraHTTPHeaders: { 'X-Forwarded-For': '10.98.3.2' } });
  await phone.addInitScript(quiet);
  const pp = await phone.newPage();
  expect((await pp.request.post(`${url}/api/auth/create`, { data: { displayName: 'Phoner' } })).ok()).toBe(true);
  await pp.goto(`${url}/lobby/${id}`);
  const pgear = pp.getByRole('button', { name: 'Settings' });
  await expect(pgear).toBeVisible({ timeout: 30_000 });
  await pp.waitForTimeout(1500);
  await pgear.click();
  const pd = pp.getByRole('dialog', { name: 'Settings' });
  await expect(pd).toBeVisible();
  // all sections are in one scrolling sheet
  for (const [, label] of SECTIONS) await expect(pd.getByRole('heading', { name: label })).toHaveCount(1);
  const box = await pd.boundingBox();
  expect(box && box.width).toBeGreaterThan(380);
  await pp.screenshot({ path: path.join(SHOTS, 'v23-settings-phone.png') });
  await pd.getByRole('tab', { name: 'Privacy & safety' }).click();
  await pp.waitForTimeout(300);
  await pp.screenshot({ path: path.join(SHOTS, 'v23-settings-phone-privacy.png') });
  await pd.getByRole('button', { name: 'Done' }).click();
  await expect(pd).toHaveCount(0);
  await phone.close();
  await Promise.all(bots.map((b) => b.leave()));
});
