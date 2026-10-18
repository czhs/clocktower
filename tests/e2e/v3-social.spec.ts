// v3 WP7 (v3-qa) — v3-social (docs/v3/INTEGRATION.md §6.2, WP4 "Tests"): in a v3 lobby another player (a protocol
// bot standing next to us) points, drops a pin and speaks; the 3D page draws each one where the projection says:
//   - the pin tip (__ctSocial.pins()) within 6 CSS px of __ctCamera.worldToScreen(pin);
//   - the point emote is shown on the speaker's avatar (__ctSocial.emotes(): hand drawn, at the pointed spot);
//   - the chat bubble (__ctCamera.bubbles()) centred within 6 CSS px over the speaker's feet x, above the feet;
//   - chat text is drawn as text (no markup).
// Project `v3` only (scripts/v3/e2e.sh).
import { expect, test } from '@playwright/test';
import { makeBots } from '../support/bot';
import { FrameTap, type Player, requireV3Hooks, selfEntity, setE2eWorld, v3Context, v3Shot, waitV3Ready, watchConsole } from './helpers';

test.beforeAll(() => setE2eWorld('v3'));
test.afterAll(() => setE2eWorld('v2'));

type W2S = (x: number, y: number, h?: number) => { x: number; y: number } | null;

test('v3 social: pin, point and bubble land on the projection', async ({ browser, baseURL }) => {
  test.setTimeout(360_000);
  const url = baseURL!;
  const [st, friend] = await makeBots(2, 'Social ', url, url.replace(/^http/, 'ws'));
  const id = await st!.createLobby('v3 social', 15, true, { world: 'v3' });
  await st!.join(id, 'storyteller');
  await friend!.join(id);
  const ctx = await v3Context(browser);
  const page = await ctx.newPage();
  const errors: string[] = [];
  watchConsole(page, 'social', errors);
  const tap = new FrameTap('Socialite', page);
  const p: Player = { name: 'Socialite', page, ctx, tap };
  try {
    expect((await page.request.post(`${url}/api/auth/create`, { data: { displayName: 'Socialite' } })).ok()).toBe(true);
    await page.goto(`${url}/lobby/${id}`);
    const pid = await tap.until(() => tap.last('lobby:view')?.youPid as string | undefined, 30_000, 'lobby:view');
    await waitV3Ready(page, 240_000, 'social');
    await requireV3Hooks(page, 'WP2 avatars + WP4 overlay / social view', ['avatar', 'bubbles'], ['pins', 'emotes']);
    const me = await tap.until(() => selfEntity(p, pid), 30_000, 'own entity');
    const hide = page.getByRole('button', { name: 'Hide lobby details', exact: true });
    if (await hide.isVisible().catch(() => false)) await hide.click();
    // the friend stands where we can see them (players spawn on the same tile ring)
    const fpid = friend!.pid!;
    const fr = await tap.until(() => selfEntity(p, fpid), 30_000, "friend's entity");
    await expect
      .poll(() => page.evaluate((who) => !!(window as unknown as { __ctCamera?: { avatar?: (p: string) => unknown } }).__ctCamera?.avatar?.(who), fpid), { timeout: 120_000, message: "the friend's avatar is drawn (WP2 avatar(pid))" })
      .toBe(true);
    const w2s = (x: number, y: number, h = 0) => page.evaluate(({ x, y, h }) => ((window as unknown as { __ctCamera: { worldToScreen: W2S } }).__ctCamera.worldToScreen(x, y, h)), { x, y, h });

    // ---- pin: a place pin next to us
    const spot = { x: Math.round(me.x + 24), y: Math.round(me.y - 8) };
    friend!.send('social:pin', { target: { kind: 'place', x: spot.x, y: spot.y }, color: 'gold' });
    type Pin = { visible: boolean; x: number | null; y: number | null; kind: string };
    const pin = await (async () => {
      let found: Pin | undefined;
      await expect
        .poll(
          async () => {
            const pins = (await page.evaluate(() => ((window as unknown as { __ctSocial?: { pins?: () => unknown[] } }).__ctSocial?.pins?.() ?? []) as Pin[])) as Pin[];
            found = pins.find((q) => q.kind === 'place' && q.visible);
            return !!found;
          },
          { timeout: 30_000, message: '__ctSocial.pins(): the place pin is drawn' },
        )
        .toBe(true);
      return found!;
    })();
    const at = (await w2s(spot.x, spot.y))!;
    expect(at, 'pin spot projects').not.toBeNull();
    expect(Math.hypot(pin.x! - at.x, pin.y! - at.y), `pin tip ${pin.x},${pin.y} vs worldToScreen ${at.x},${at.y}`).toBeLessThanOrEqual(6);

    // ---- point: the friend points at the same spot
    friend!.send('social:emote', { kind: 'point', x: spot.x, y: spot.y });
    await expect
      .poll(
        () => page.evaluate((who) => ((window as unknown as { __ctSocial?: { emotes?: () => { pid: string; hand: boolean; x: number; y: number }[] } }).__ctSocial?.emotes?.() ?? []).find((e) => e.pid === who) ?? null, fpid),
        { timeout: 20_000, message: "__ctSocial.emotes(): the friend's point is shown" },
      )
      .toMatchObject({ hand: true, x: spot.x, y: spot.y });

    // ---- bubble: the friend speaks (zone chat); text only
    const text = '<b>Look</b> over there!';
    friend!.send('chat:send', { text });
    type Bubble = { pid: string; text: string; box: { x: number; y: number; width: number; height: number } };
    let bubble: Bubble | undefined;
    await expect
      .poll(
        async () => {
          bubble = ((await page.evaluate(() => (window as unknown as { __ctCamera?: { bubbles?: () => unknown[] } }).__ctCamera?.bubbles?.() ?? [])) as Bubble[]).find((b) => b.pid === fpid);
          return bubble?.text.replace(/\s+/g, ' ').trim() ?? null;
        },
        { timeout: 30_000, message: "__ctCamera.bubbles(): the friend's bubble" },
      )
      .toBe(text);
    const fnow = selfEntity(p, fpid) ?? fr;
    const feet = (await w2s(fnow.x, fnow.y))!;
    const cx = bubble!.box.x + bubble!.box.width / 2;
    expect(Math.abs(cx - feet.x), `bubble centre x ${cx} vs feet x ${feet.x}`).toBeLessThanOrEqual(6);
    expect(bubble!.box.y + bubble!.box.height, 'bubble sits above the feet').toBeLessThan(feet.y);
    expect(await page.locator('.ct-game-canvas b').count(), 'chat text is never markup').toBe(0);
    await v3Shot(page, 'v3-social.png');
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await Promise.all([st!.leave(), friend!.leave()]);
  }
});
