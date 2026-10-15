// Regression (ux): the FIRST "I'm ready" click must send exactly one `lobby:ready` frame and the
// server must mark the member ready — no retries. Six browsers (ST + 5 players) join through the
// share link, as in the M3 round.
import { expect, test } from '@playwright/test';
import { createAccount, type Player } from './helpers';

const suffix = Math.random().toString(36).slice(2, 6);

test('first Ready click is sent once and acknowledged (ST + 5 players)', async ({ browser }) => {
  test.setTimeout(900_000);
  const all: Player[] = [];
  try {
    const st = await createAccount(browser, `RdyST ${suffix}`);
    all.push(st);
    await st.page.getByRole('button', { name: /create lobby/i }).first().click();
    const dialog = st.page.getByRole('dialog', { name: 'Create lobby' });
    await dialog.getByLabel('Lobby name').fill(`Ready ${suffix}`);
    await dialog.getByLabel(/storyteller seat/i).check();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await st.page.waitForURL(/\/lobby\/[A-Za-z0-9_-]{4,32}$/);
    const path = new URL(st.page.url()).pathname;

    for (let i = 0; i < 5; i++) {
      const p = await createAccount(browser, `Rdy${i} ${suffix}`);
      all.push(p);
      await p.page.goto(path);
      const ready = p.page.getByRole('button', { name: "I'm ready" });
      await expect(ready).toBeEnabled({ timeout: 30_000 });
      const before = p.tap.sent('lobby:ready').length;
      await ready.click();
      // The click is reflected immediately (optimistic) and then confirmed by the server.
      await expect(p.page.getByRole('button', { name: 'Not ready' })).toBeVisible({ timeout: 5_000 });
      await expect.poll(() => p.tap.sent('lobby:ready').length - before, { timeout: 3_000, message: `${p.name}: lobby:ready frames after one click` }).toBe(1);
      await p.page.waitForTimeout(1500);
      expect(p.tap.sent('lobby:ready').length - before, `${p.name}: no duplicate/missing frames`).toBe(1);
      const pid = p.tap.last('lobby:view')?.youPid;
      await p.tap.until(() => p.tap.last('lobby:view')?.members.find((m: { pid: string; ready: boolean }) => m.pid === pid)?.ready, 5_000, 'server marks me ready');
    }
    await st.tap.until(() => st.tap.last('lobby:view')?.canStart, 10_000, 'ST can start');
  } finally {
    for (const p of all) await p.ctx.close().catch(() => undefined);
  }
});
