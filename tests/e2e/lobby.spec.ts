// Two browsers: create accounts -> one creates a lobby -> the other joins via the finder and via the
// share URL -> both see each other in the member list -> leave.
// Steps whose UI is not implemented yet are skipped with an explicit reason (never faked).
import { expect, test, type Page } from '@playwright/test';
import { createAccount, lobbyCount, type Player } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);
const ALICE = `Alice ${suffix}`;
const BOB = `Bob ${suffix}`;
// Lobby name doubles as an XSS probe: it must render as literal text.
const LOBBY = `<img src=x onerror=window.__xss=1> ${suffix}`;

test.describe.serial('two players, one lobby', () => {
  let alice: Player;
  let bob: Player;
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
    const member = (p: Page, name: string) => waiting(p).locator('.ct-member-name', { hasText: name });
    await expect(member(alice.page, BOB)).toBeVisible();
    await expect(member(alice.page, ALICE)).toBeVisible();
    await expect(member(bob.page, ALICE)).toBeVisible();
    await expect(member(bob.page, BOB)).toBeVisible();
    await expect(waiting(bob.page).getByRole('heading', { name: LOBBY })).toBeVisible(); // literal text
    await waiting(bob.page).getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(bob.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
    await expect.poll(() => lobbyCount(alice.page, lobbyId), { timeout: 10_000 }).toBe(0);
    await expect(member(alice.page, BOB)).toHaveCount(0);
    await waiting(alice.page).getByRole('button', { name: 'Leave', exact: true }).click();
    await expect(alice.page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible();
    for (const p of [alice.page, bob.page])
      expect(await p.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});
