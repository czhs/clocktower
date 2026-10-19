// (v3 URL paths, user decision 2026-10-18; docs/v3/INTEGRATION.md §11, §8 WP8) qa-deploy helper. `/` is now the
// v3 app (every lobby created there is a Hollowmere lobby); the v2 app lives at `/v2/`.
//
//   CT_E2E_BASE_PATH=/v2   the app path the Classic (v2) suite should open: `appUrl('/')` = '/v2/',
//                          `appUrl('/lobby/x')` = '/v2/lobby/x'. Unset = '' (the v3 app at `/`).
//
// The Classic suite opens '/' through tests/e2e/helpers.ts (createAccount / newPlayer) and a few specs' own
// `page.goto(`${url}/…`)`; those are listed as a CONTRACT-REQUEST (docs/v3/INTEGRATION.md §8 WP8) to route through
// `appUrl`. A bot-made lobby (API, no `world` → 'v2') opened at `/lobby/x` moves to `/v2/lobby/x` by itself.
import { expect, type Page } from '@playwright/test';
import type { WorldId } from '../../packages/protocol/src/index.js';

function normalise(p: string | undefined): string {
  const t = (p ?? '').trim().replace(/\/+$/, '');
  if (!t) return '';
  if (!/^\/[A-Za-z0-9_-]+$/.test(t)) throw new Error(`CT_E2E_BASE_PATH must look like /v2, got ${JSON.stringify(p)}`);
  return t;
}

/** The app prefix for this run ('' or '/v2'). */
export const APP_BASE = normalise(process.env.CT_E2E_BASE_PATH);

/** An in-app path inside this run's app (CT_E2E_BASE_PATH). */
export const appUrl = (path: string): string => `${APP_BASE}${path.startsWith('/') ? path : `/${path}`}`;

/** An in-app path inside a given world's app (independent of CT_E2E_BASE_PATH): v3 → '/…', v2 → '/v2/…'. */
export const worldUrl = (world: WorldId, path: string): string => `${world === 'v2' ? '/v2' : ''}${path.startsWith('/') ? path : `/${path}`}`;

/** The world the address bar shows (the client's rule, ui/common/appWorld.ts). */
export const worldOfUrl = (url: string): WorldId => {
  const p = new URL(url).pathname;
  return p === '/v2' || p.startsWith('/v2/') ? 'v2' : 'v3';
};

/**
 * Open `world`'s app and create a lobby from the UI (finder → Create lobby → Create; there is no Town choice any more:
 * the path decides). Returns the id once the waiting room is up; asserts the server made it in that world.
 */
export async function createLobbyAt(page: Page, world: WorldId, name: string): Promise<string> {
  await page.goto(worldUrl(world, '/'));
  await expect(page.getByRole('heading', { name: 'Lobby finder' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Create lobby' }).first().click();
  const form = page.getByRole('dialog', { name: 'Create lobby' });
  await expect(form).toBeVisible();
  await expect(form.getByRole('radiogroup', { name: 'Town' }), 'no Town choice: the URL path picks the world').toHaveCount(0);
  await form.getByLabel('Lobby name').fill(name);
  const created = page.waitForResponse((r) => r.url().endsWith('/api/lobbies') && r.request().method() === 'POST', { timeout: 30_000 });
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  const res = await created;
  expect(res.status(), await res.text()).toBeLessThan(300);
  const sent = res.request().postDataJSON() as { world?: WorldId };
  expect(sent.world, 'the create request carries the path world').toBe(world);
  const body = (await res.json()) as { lobby: { id: string; world?: WorldId } };
  expect(body.lobby.world ?? 'v2', 'the server made the lobby in the path world').toBe(world);
  await expect(page.getByRole('dialog', { name: 'Waiting room' })).toBeVisible({ timeout: 60_000 });
  expect(new URL(page.url()).pathname, 'the lobby stays inside its app').toBe(worldUrl(world, `/lobby/${body.lobby.id}`));
  return body.lobby.id;
}
