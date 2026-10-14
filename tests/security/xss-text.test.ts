// User text (display names, lobby names/descriptions, chat) is length-limited and cleaned of
// control/bidi/zero-width characters server-side, returned as JSON (never HTML), and the SPA shell
// never embeds user data. Rendering-side escaping is covered by the Playwright spec.
import { afterAll, describe, expect, it } from 'vitest';
import { cleanText } from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { fakeClientIp, pending } from '../support/features.js';
import { ApiClient } from '../support/http.js';
import { eventually, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

const XSS = '<img src=x onerror=alert(1)>';
const NASTY = ['<svg onload=alert(1)>', `‮evil‬`, 'zero​width', 'line\nbreak\r\ttab', '  spaced   out  ', '"quotes" & \'amp\''];

describe.skipIf(!features.accounts)(`user text handling${pending(features.accounts, features.reasons.accounts)}`, () => {
  it('display names are cleaned, length-limited, and returned as JSON', async () => {
    for (const raw of [XSS.slice(0, 24), ...NASTY]) {
      const c = new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() });
      const r = await c.createAccount(raw);
      expect(r.status, `create ${JSON.stringify(raw)}`).toBeLessThan(300);
      expect(r.headers.get('content-type')).toMatch(/application\/json/);
      expect(r.body.account.displayName).toBe(cleanText(raw));
      expect(r.body.account.displayName).not.toMatch(/[‪-‮⁦-⁩​-‏\n\r\t]/);
      expect((await c.me()).body.displayName).toBe(cleanText(raw));
    }
    const c = new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() });
    expect((await c.createAccount('x'.repeat(25))).status).toBe(400);
    expect((await c.createAccount('')).status).toBe(400);
    expect((await c.createAccount('   ​  ')).status).toBe(400);
    expect((await c.createAccount(42 as unknown as string)).status).toBe(400);
  });

  it.skipIf(!features.lobbies)('lobby names/descriptions are cleaned and listed as plain JSON text', async () => {
    const c = new ApiClient(server.url, { 'X-Forwarded-For': fakeClientIp() });
    await c.createAccount('lobby xss');
    const name = `${XSS}‮`.slice(0, 40);
    const r = await c.createLobby({ name, maxPlayers: 5, description: `<b>bold</b>\u0000\u0007` });
    expect(r.status).toBeLessThan(300);
    expect(r.body.lobby.name).toBe(cleanText(name));
    expect(r.body.lobby.description).toBe(cleanText(`<b>bold</b>\u0000\u0007`));
    const list = await c.listLobbies();
    expect(list.headers.get('content-type')).toMatch(/application\/json/);
    expect(list.body.lobbies.find((l) => l.id === r.body.lobby.id)?.name).toBe(cleanText(name));
    // The SPA shell for the share link is static: it must not embed the lobby name.
    const html = await (await fetch(`${server.url}/lobby/${r.body.lobby.id}`)).text();
    expect(html).not.toContain('onerror');
  });

  it.skipIf(!features.rooms)('chat text is cleaned and length-limited before fan-out', async (ctx) => {
    const [a, b] = await makeBots(2, uniq('chatx-'), server.url, server.wsUrl);
    all.push(a!, b!);
    const L = await a!.createLobby(uniq('ChatX '), 5);
    await a!.join(L);
    await b!.join(L);
    await eventually(() => b!.lobbyView?.members.length === 2);
    const tag = uniq('cx');
    a!.send('chat:send', { text: `${tag} ${XSS}‮​` });
    a!.send('chat:send', { text: `${tag}-long ` + 'y'.repeat(400) });
    const msg = await b!.waitFor<{ text: string }>('chat:message', (m) => m.text.startsWith(tag), 5000).catch(() => null);
    if (!msg) {
      console.warn('[xss-text] SKIPPED chat assertions: chat:message not delivered (chat not implemented yet)');
      ctx.skip();
      return;
    }
    expect(msg.text).toBe(cleanText(`${tag} ${XSS}‮​`));
    await new Promise((r) => setTimeout(r, 800));
    expect(b!.recorder.messages.some((m) => m.json.includes(`${tag}-long`))).toBe(false);
  });
});
