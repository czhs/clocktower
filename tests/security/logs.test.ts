// Server log audit (qa-deploy): play a full scripted game on a server with (fake) LiveKit credentials
// so voice grants are minted, then grep everything the server wrote to stdout/stderr (= journald)
// for passphrases, session tokens, join tickets, LiveKit tokens/secrets and character names tied to
// players. Also measures whether the logs carry enough context (lobby ids, pids, phases, errors) to
// debug a game night.
import { afterAll, describe, expect, it } from 'vitest';
import { CHARACTER_IDS, type VoiceGrant } from '../../packages/protocol/src/index.js';
import type { Bot } from '../support/bot.js';
import { pending } from '../support/features.js';
import { playFullGame, setupGame } from '../support/game.js';
import { sleep, suiteServer } from '../support/suite.js';

const LK_SECRET = 'qa-fake-livekit-secret-0123456789abcdef0123456789';
const { server, features } = await suiteServer({
  env: { LIVEKIT_URL: 'wss://qa-fake.livekit.invalid', LIVEKIT_API_KEY: 'APIqafakekey', LIVEKIT_API_SECRET: LK_SECRET, VOICE_TEST_AUTO_OPT_IN: '1' },
});
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

describe.skipIf(!features.rooms)(`server log audit over a full game${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('no credentials or Grimoire data in logs; logs carry lobby/pid/phase context', async () => {
    const g = (await setupGame(server.url, server.wsUrl, { players: 7 }))!;
    const bots = [g.st, ...g.players];
    all.push(...bots);
    for (const p of g.players) {
      p.exitBuildings = true;
      p.startWandering(8);
    }
    await playFullGame(g);
    for (const p of g.players) p.stopActivity();
    await sleep(800);
    const logs = server.logs();
    const lines = logs.split('\n').filter(Boolean);

    const grants = bots.flatMap((b) => b.recorder.ofType<VoiceGrant>('voice:grant'));
    const secrets: [string, string][] = [
      ...bots.map((b) => ['passphrase', b.passphrase!] as [string, string]),
      ...bots.map((b) => ['session token', b.api.sessionCookie()!.value] as [string, string]),
      ...bots.flatMap((b) => b.tickets.map((t) => ['join ticket', t] as [string, string])),
      ...bots.flatMap((b) => b.tickets.map((t) => ['ticket signature', t.split('.')[2]!] as [string, string])),
      ...grants.map((gr) => ['LiveKit token', gr.token] as [string, string]),
      ['LiveKit API secret', LK_SECRET],
      ['SESSION_SECRET', server.env.SESSION_SECRET!],
      ['PASSPHRASE_PEPPER', server.env.PASSPHRASE_PEPPER!],
    ];
    const hits = secrets.filter(([, v]) => v && v.length >= 8 && logs.includes(v)).map(([k]) => k);
    expect(hits, 'secrets found in server logs').toEqual([]);

    // Character names tied to players: any line naming a player (pid or display name) together with
    // that player's character id (true or believed).
    const tied: string[] = [];
    for (const e of g.stView()!.grimoire) {
      const p = g.players.find((x) => g.seatOf.get(x) === e.seat)!;
      for (const line of lines) {
        const names = [p.pid!, p.name].filter(Boolean);
        if (!names.some((n) => line.includes(n))) continue;
        for (const c of [e.character, e.believedCharacter]) if (line.includes(`"${c}"`) || line.includes(` ${c}`) || line.includes(`:${c}`)) tied.push(line.slice(0, 200));
      }
    }
    const anyCharacter = lines.filter((l) => CHARACTER_IDS.some((c) => new RegExp(`\\b${c}\\b`).test(l)));
    expect(tied, 'log lines tying a player to a character').toEqual([]);

    // Usefulness: structure and context.
    const parsed = lines.map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    });
    const json = parsed.filter(Boolean) as Record<string, unknown>[];
    const withLobby = json.filter((j) => 'lobbyId' in j).length;
    const withPid = json.filter((j) => 'pid' in j).length;
    const phaseLines = json.filter((j) => /phase/i.test(String(j.msg)) || 'phase' in j).length;
    const errors = json.filter((j) => j.level === 'error').map((j) => `${j.scope}: ${j.msg}`);
    const warns = json.filter((j) => j.level === 'warn').map((j) => `${j.scope}: ${j.msg}`);
    const msgs = [...new Set(json.map((j) => `${j.level}:${j.scope}:${j.msg}`))];
    console.log(
      `[logs] ${lines.length} lines (${json.length} JSON); with lobbyId ${withLobby}, with pid ${withPid}, phase-related ${phaseLines}; ` +
        `errors ${errors.length} ${JSON.stringify([...new Set(errors)].slice(0, 8))}; warns ${warns.length} ${JSON.stringify([...new Set(warns)].slice(0, 8))}; ` +
        `lines mentioning any character id (no player): ${anyCharacter.length}; distinct messages: ${JSON.stringify(msgs)}`,
    );
    expect(json.length / lines.length, 'logs are structured JSON lines').toBeGreaterThan(0.95);
    expect(withLobby, 'game events carry lobbyId').toBeGreaterThan(5);
  }, 120_000);
});
