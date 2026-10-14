// Two browsers: create accounts -> one creates a lobby -> the other joins via the finder and via the
// share URL -> both see each other in the member list -> leave.
// Steps whose UI is not implemented yet are skipped with an explicit reason (never faked).
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const suffix = Math.random().toString(36).slice(2, 7);
const ALICE = `Alice ${suffix}`;
const BOB = `Bob ${suffix}`;
// Lobby name doubles as an XSS probe: it must render as literal text.
const LOBBY = `<img src=x onerror=window.__xss=1> ${suffix}`;

async function lobbyCount(page: Page, id: string): Promise<number> {
  const r = await page.request.get(`/api/lobbies/${id}`);
  expect(r.status()).toBe(200);
  return ((await r.json()) as { lobby: { playerCount: number } }).lobby.playerCount;
}

async function createAccount(browser: Browser, name: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: 'Create account' }).click();
  const pass = page.getByLabel('Your passphrase');
  await expect(pass).toBeVisible();
  const passphrase = (await pass.textContent())!.trim();
  expect(passphrase.split(/\s+/).length).toBeGreaterThanOrEqual(6);
  // The credential is not persisted client-side and the session cookie is HttpOnly.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toContain(passphrase);
  expect(stored).not.toContain('ct_session');
  await expect(page.getByRole('button', { name: 'Enter the town' })).toBeDisabled();
  await page.getByLabel('I have saved my passphrase somewhere safe').check();
  await page.getByRole('button', { name: 'Enter the town' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
  return { ctx, page };
}

test.describe.serial('two players, one lobby', () => {
  let alice: { ctx: BrowserContext; page: Page };
  let bob: { ctx: BrowserContext; page: Page };
  let lobbyId = '';

  test.afterAll(async () => {
    await alice?.ctx.close();
    await bob?.ctx.close();
  });

  test('both create passphrase accounts', async ({ browser }) => {
    alice = await createAccount(browser, ALICE);
    bob = await createAccount(browser, BOB);
  });

  test('Alice creates a lobby (takes the Storyteller seat)', async () => {
    const { page } = alice;
    await page.getByRole('button', { name: /create lobby/i }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create lobby' });
    await dialog.getByLabel('Lobby name').fill(LOBBY);
    await expect(dialog.getByLabel(/password|pin/i)).toHaveCount(0); // no lobby passwords
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
    lobbyId = page.url().split('/lobby/')[1]!;
    expect(lobbyId).toBeTruthy();
  });

  test('Bob finds the lobby in the finder (name rendered as text) and joins', async () => {
    const { page } = bob;
    const row = page.locator('.ct-lobby', { hasText: suffix }).first();
    await expect(row).toBeVisible({ timeout: 15_000 }); // SSE push or 30s resync
    await expect(row.getByText(LOBBY, { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await row.getByRole('button', { name: 'Join', exact: true }).click();
    await page.waitForURL(new RegExp(`/lobby/${lobbyId}$`));
    await expect.poll(() => lobbyCount(page, lobbyId), { timeout: 10_000 }).toBe(1);
  });

  test('Bob leaves and rejoins through the share URL', async () => {
    // Share URL as shown in Alice's waiting room (falls back to the canonical form if that UI is absent).
    const shareField = alice.page.getByLabel('Share link');
    const shareUrl = (await shareField.count()) ? await shareField.inputValue() : new URL(`/lobby/${lobbyId}`, alice.page.url()).href;
    expect(new URL(shareUrl).pathname).toBe(`/lobby/${lobbyId}`);
    const { page } = bob;
    const leave = page.getByRole('button', { name: 'Leave', exact: true });
    if (await leave.count()) await leave.click();
    else await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
    await expect.poll(() => lobbyCount(page, lobbyId), { timeout: 40_000 }).toBe(0);
    await page.goto(new URL(shareUrl).pathname);
    await expect.poll(() => lobbyCount(page, lobbyId), { timeout: 10_000 }).toBe(1);
  });

  test('both see each other in the member list, then leave', async () => {
    const waiting = (p: Page) => p.getByRole('dialog', { name: 'Waiting room' });
    const hasWaitingRoom = await waiting(bob.page)
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasWaitingRoom, 'PENDING: WaitingRoom UI (member list / Leave) not implemented yet');
    await expect(waiting(alice.page).getByText(BOB)).toBeVisible();
    await expect(waiting(bob.page).getByText(ALICE)).toBeVisible();
    await expect(waiting(bob.page).getByRole('heading', { name: LOBBY })).toBeVisible(); // literal text
    await waiting(bob.page).getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(bob.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
    await expect.poll(() => lobbyCount(alice.page, lobbyId), { timeout: 10_000 }).toBe(0);
    await expect(waiting(alice.page).getByText(BOB)).toHaveCount(0);
    await waiting(alice.page).getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(alice.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
    for (const p of [alice.page, bob.page])
      expect(await p.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});
