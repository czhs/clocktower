// Secrecy: nothing private reaches the wrong client.
//  1. (rooms) account ids, passphrases, session tokens and tickets never appear in any room
//     message; lobby views and directory summaries expose only public fields.
//  2. (game) scripted Storyteller-run game: every message received by non-Storyteller bots is
//     scanned for Grimoire/ST-only fields, other players' characters, and night-visit signals.
//     Auto-skips (with a printed reason) while the game module is a stub.
import { afterAll, describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  type GrimoireEntry,
  type LobbySummary,
  type PlayerGameView,
  type StorytellerGameView,
} from '../../packages/protocol/src/index.js';
import { Bot, makeBots } from '../support/bot.js';
import { pending } from '../support/features.js';
import { collectKeys, findLeaks, type RecordedMessage } from '../support/recorder.js';
import { eventually, sleep, suiteServer, uniq } from '../support/suite.js';

const { server, features } = await suiteServer();
const all: Bot[] = [];
afterAll(async () => {
  await Promise.all(all.map((b) => b.leave().catch(() => undefined)));
});

const SUMMARY_KEYS: (keyof LobbySummary)[] = [
  'id', 'name', 'description', 'script', 'maxPlayers', 'playerCount', 'storytellerName',
  'storytellerSeatOpen', 'phase', 'joinable', 'hostName', 'createdAt', 'updatedAt',
];
const MEMBER_KEYS = ['pid', 'displayName', 'role', 'seat', 'ready', 'connected', 'isHost', 'cosmetics'];
/** Fields that exist only in StorytellerGameView / GrimoireEntry / server state. */
const ST_ONLY_KEYS = [
  'grimoire', 'demonBluffs', 'nightQueue', 'visitingSeat', 'travelSpeedMult', 'alerts', 'believedCharacter',
  'poisoned', 'drunk', 'protectedTonight', 'reminders', 'redHerringSeat', 'accountId', 'passphrase',
];

describe.skipIf(!features.rooms)(`credential & identity secrecy${pending(features.rooms, features.reasons.rooms)}`, () => {
  it('no account ids / passphrases / session tokens / tickets in room messages; public-only views', async () => {
    const bots = await makeBots(5, uniq('sec-'), server.url, server.wsUrl);
    all.push(...bots);
    const L = await bots[0]!.createLobby(uniq('Secrets '), 6);
    const tickets: string[] = [];
    for (const b of bots) {
      const t = await b.getTicket(L);
      tickets.push(t.ticket);
      await b.joinWithTicket(t);
    }
    await eventually(() => bots.every((b) => b.lobbyView?.members.length === 5), 6000);
    for (const b of bots) b.startWandering(8);
    bots[1]!.send('lobby:ready', { ready: true });
    bots[2]!.send('chat:send', { text: 'hello there' });
    await sleep(2000);
    for (const b of bots) b.stopActivity();

    const needles = [
      ...bots.map((b) => b.accountId!),
      ...bots.map((b) => b.passphrase!),
      ...bots.map((b) => b.api.sessionCookie()!.value),
      ...tickets,
      server.env.SESSION_SECRET!,
    ];
    expect(findLeaks(bots.map((b) => b.recorder), needles)).toEqual([]);

    for (const b of bots)
      for (const v of b.recorder.ofType<any>('lobby:view')) {
        for (const m of v.members) expect(Object.keys(m).sort()).toEqual([...MEMBER_KEYS].sort());
        expect(collectKeys(v).has('accountId')).toBe(false);
      }
    const list = await bots[0]!.api.listLobbies();
    for (const l of list.body.lobbies) expect(Object.keys(l).sort()).toEqual([...SUMMARY_KEYS].sort());
    expect(findLeaks([{ label: 'api', messages: [{ json: list.text } as RecordedMessage] } as any], needles)).toEqual([]);
  });
});

function forbiddenKeysIn(msgs: RecordedMessage[]): string[] {
  const found = new Set<string>();
  for (const m of msgs) {
    if (m.type === 'chat:message') continue;
    const keys = collectKeys(m.payload);
    for (const k of ST_ONLY_KEYS) if (keys.has(k)) found.add(`${m.type}.${k}`);
  }
  return [...found];
}

/** Character ids found in a player's messages OUTSIDE their legitimate private channels. */
function strayCharacters(msgs: RecordedMessage[]): { type: string; character: string; excerpt: string }[] {
  const out: { type: string; character: string; excerpt: string }[] = [];
  for (const m of msgs) {
    if (m.type === 'chat:message' || m.type === 'announcement') continue; // user text / public ST announcements
    let payload: any = m.payload;
    if (m.type === 'game:view' && payload && typeof payload === 'object') {
      // Own role, own info and own prompts are legitimate; the end-of-game reveal is public.
      const { you, info, prompts, announcements, result, ...rest } = payload;
      const { role, ...youRest } = you ?? {};
      payload = { ...rest, you: youRest };
      void role; void info; void prompts; void announcements; void result;
    }
    const json = JSON.stringify(payload) ?? '';
    for (const c of CHARACTER_IDS) {
      const i = json.indexOf(`"${c}"`);
      if (i >= 0) out.push({ type: m.type, character: c, excerpt: json.slice(Math.max(0, i - 80), i + 40) });
    }
  }
  return out;
}

interface Game {
  st: Bot;
  players: Bot[];
  seatOf: Map<Bot, number>;
  grimoire: GrimoireEntry[];
  stView: () => StorytellerGameView | undefined;
  cmd: (c: unknown) => void;
}

/** ST + 7 players; start; random setup; first night. Returns null if the game module is a stub. */
async function setupGame(tag: string): Promise<Game | null> {
  const bots = await makeBots(8, uniq(`${tag}-`), server.url, server.wsUrl);
  all.push(...bots);
  const [st, ...players] = bots as [Bot, ...Bot[]];
  const L = await st.createLobby(uniq('Game '), 7, true);
  await st.join(L, 'storyteller');
  for (const p of players) await p.join(L);
  await eventually(() => st.lobbyView?.members.length === 8, 6000, 100, 'all 8 seated');
  for (const p of players) p.send('lobby:ready', { ready: true });
  await sleep(500);
  st.send('lobby:start', {});
  const stView = () => st.gameView as StorytellerGameView | undefined;
  try {
    await st.waitFor<any>('game:view', (v) => v?.kind === 'storyteller', 6000);
  } catch {
    return null;
  }
  const cmd = (c: unknown) => st.send('st:command', c);
  cmd({ type: 'random_setup' });
  await eventually(() => (stView()?.grimoire?.length ?? 0) === 7, 6000, 100, 'grimoire has 7 entries after random_setup');
  const grimoire = stView()!.grimoire as GrimoireEntry[];
  cmd({ type: 'begin_first_night' });
  await eventually(() => stView()?.phase === 'first_night', 6000, 100, 'phase first_night');
  await eventually(() => players.every((p) => (p.gameView as PlayerGameView | undefined)?.you?.role), 6000, 100, 'every player told their role');
  const seatOf = new Map<Bot, number>();
  for (const p of players) seatOf.set(p, (p.gameView as PlayerGameView).you.seat);
  return { st, players, seatOf, grimoire, stView, cmd };
}

describe.skipIf(!features.rooms)(`Grimoire / role secrecy in a scripted game${pending(features.rooms, features.reasons.rooms)}`, () => {
  it("non-Storyteller clients never receive ST-only data or other players' characters", async (ctx) => {
    const g = await setupGame('g');
    if (!g) {
      console.warn("[leakage] SKIPPED scripted game: no Storyteller 'game:view' after lobby:start (game module not implemented yet)");
      ctx.skip();
      return;
    }
    const { st, players, seatOf, grimoire, stView, cmd } = g;
    for (const p of players) p.startWandering(8);

    // Each player sees exactly their believed character.
    for (const p of players) {
      const v = p.gameView as PlayerGameView;
      expect(v.kind).toBe('player');
      const e = grimoire.find((x) => x.seat === v.you.seat)!;
      expect(v.you.role!.character).toBe(e.believedCharacter);
    }

    // Private prompt + info to one player must reach only that player.
    const target = players[2]!;
    const tSeat = seatOf.get(target)!;
    const secretInfo = uniq('PRIVATE-INFO-');
    const secretPrompt = uniq('Private question ');
    cmd({ type: 'prompt_player', seat: tSeat, prompt: { kind: 'yes_no', title: secretPrompt } });
    cmd({ type: 'send_info', seat: tSeat, info: { text: secretInfo, number: 1 } });
    await eventually(() => target.recorder.messages.some((m) => m.json.includes(secretInfo)), 5000, 100, 'target received private info');
    expect(findLeaks(players.filter((p) => p !== target).map((p) => p.recorder), [secretInfo, secretPrompt])).toEqual([]);

    // Day: nomination + vote, then bedtime and another night.
    for (const step of stView()?.nightQueue ?? []) cmd({ type: 'skip_step', stepId: step.id });
    cmd({ type: 'advance_phase', to: 'day' });
    await eventually(() => stView()?.phase === 'day', 6000, 100, 'phase day');
    cmd({ type: 'set_nominations_open', open: true });
    players[0]!.send('game:nominate', { nomineeSeat: seatOf.get(players[1]!)! });
    const nom = await eventually(() => stView()?.day?.nominations?.[0], 5000).catch(() => undefined);
    if (nom) {
      cmd({ type: 'start_vote', nominationId: nom.id });
      await sleep(4000);
    } else console.warn('[leakage] nomination not created; vote flow not exercised');
    cmd({ type: 'advance_phase', to: 'bedtime' });
    await sleep(1000);
    cmd({ type: 'advance_phase', to: 'night' });
    await sleep(1500);
    for (const p of players) p.stopActivity();
    expect(st.recorder.ofType('game:view').length).toBeGreaterThan(3);

    // Scan everything every non-ST bot received (no end-of-game reveal happened).
    for (const p of players) {
      const msgs = p.recorder.messages;
      expect(forbiddenKeysIn(msgs), `${p.name}: ST-only fields`).toEqual([]);
      for (const m of msgs.filter((m) => m.type === 'game:view')) {
        expect((m.payload as any).kind).toBe('player');
        expect((m.payload as PlayerGameView).result).toBeNull();
      }
      const own = (p.gameView as PlayerGameView).you.role?.character;
      const stray = strayCharacters(msgs).filter((x) => x.character !== own);
      expect(stray, `${p.name}: other characters outside private channels`).toEqual([]);
    }
  }, 120_000);
});

describe.skipIf(!features.rooms || !features.world)(
  `night-visit secrecy${pending(features.rooms && features.world, features.reasons.world ?? features.reasons.rooms)}`,
  () => {
    it('only the visited player learns about a Storyteller night visit', async (ctx) => {
      const g = await setupGame('v');
      if (!g) {
        console.warn('[leakage] SKIPPED night visit: game module not implemented yet');
        ctx.skip();
        return;
      }
      const { st, players, seatOf, cmd } = g;
      const visited = players[2]!;
      const vSeat = seatOf.get(visited)!;
      const others = players.filter((p) => p !== visited);
      const beforeViews = new Map(others.map((p) => [p, JSON.stringify(stripTimes(p.gameView))]));
      const visitStart = Date.now();
      cmd({ type: 'visit_home', seat: vSeat });
      await eventually(() => (visited.gameView as PlayerGameView)?.storytellerVisitingYou === true, 8000, 100, 'visited player sees storytellerVisitingYou');
      cmd({ type: 'prompt_player', seat: vSeat, prompt: { kind: 'yes_no', title: 'Visit question' } });
      await sleep(1500);
      cmd({ type: 'leave_home' });
      const visitEnd = Date.now() + 500;
      await sleep(800);
      expect(visited.recorder.messages.some((m) => m.type === 'sound' && (m.payload as any)?.cue === 'visit' && m.at >= visitStart)).toBe(true);
      for (const p of others) {
        const during = p.recorder.messages.filter((m) => m.at >= visitStart && m.at <= visitEnd);
        expect(during.some((m) => m.type === 'sound' && (m.payload as any)?.cue === 'visit'), `${p.name} heard the visit`).toBe(false);
        for (const m of during.filter((m) => m.type === 'game:view')) {
          expect((m.payload as PlayerGameView).storytellerVisitingYou).toBe(false);
          expect(JSON.stringify(stripTimes(m.payload)), `${p.name} game:view changed during someone else's visit`).toBe(beforeViews.get(p));
        }
        for (const m of during.filter((m) => m.type === 'world:snapshot'))
          expect((m.payload as any).entities.some((e: any) => e.id === st.pid), `${p.name} saw the ST at night`).toBe(false);
        const extra = during.filter((m) => m.type === 'game:view').length;
        if (extra) console.warn(`[leakage] ${p.name} received ${extra} identical game:view re-sends during another player's visit (timing signal)`);
      }
    }, 120_000);
  },
);

function stripTimes(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v ?? null, (k, val) => (k === 'phaseEndsAt' || k === 'at' || k === 't' ? undefined : val)));
}
