// Multi-script games through the REAL server (HTTP + Colyseus + the real Game module): every
// official script deals its own characters with a legal distribution, a custom script is dealt by
// hand, storylines stay on Trouble Brewing, the host can change the script in the waiting room (and
// only there), and Travellers can be seated, re-aligned and are kept out of nominations.
import { charactersOfScript, type CharacterId, type LobbySummary, type PlayerGameView, type ScriptId, type StorytellerGameView } from '@ct/protocol';
import { countTypes, setupCounts } from '@ct/rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, makeAccount, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';

const PORT = 3319; // rules range 3310-3319 (CLAUDE.md)
const PLAYERS = 7;
let srv: TestServer;
const clients: TestClient[] = [];

beforeAll(async () => {
  srv = await startTestServer(PORT, { rateLimits: { ticket: { capacity: 1000, refillPerSec: 1000 }, createLobby: { capacity: 100, refillPerSec: 100 } }, env: { LOBBY_MAX_COUNT: '20' } });
}, 30_000);
afterAll(async () => {
  await Promise.all(clients.map((c) => c.leave(true)));
  await srv?.close();
}, 30_000);

async function join(lobbyId: string, label: string, cookie?: string, intent: 'player' | 'storyteller' = 'player') {
  const acct = cookie ? { cookie } : await makeAccount(srv, label);
  const c = await TestClient.join(srv, acct.cookie, lobbyId, intent, label);
  clients.push(c);
  await c.view();
  return c;
}

/** A human-Storyteller lobby on `script` with PLAYERS ready players; `start` begins the game. */
async function lobby(script: ScriptId, opts: { start?: boolean; mode?: 'human' | 'auto' } = {}) {
  const host = await makeAccount(srv, `host-${script}-${clients.length}`);
  const mode = opts.mode ?? 'human';
  const r = await api<{ lobby: LobbySummary }>(srv, 'POST', '/api/lobbies', {
    cookie: host.cookie,
    body: { name: `Deal ${clients.length}`, maxPlayers: 10, script, storytellerMode: mode, takeStoryteller: mode === 'human' },
  });
  expect(r.status).toBe(201);
  expect(r.body.lobby.script).toBe(script);
  const st = await join(r.body.lobby.id, 'ST', host.cookie, mode === 'human' ? 'storyteller' : 'player');
  const ps: TestClient[] = [];
  for (let i = 0; i < PLAYERS - (mode === 'auto' ? 1 : 0); i++) ps.push(await join(r.body.lobby.id, `P${i}`));
  for (const p of mode === 'auto' ? [st, ...ps] : ps) p.send('lobby:ready', { ready: true });
  if (opts.start ?? true) {
    await st.view((v) => v.canStart, 5000);
    st.send('lobby:start', {});
    await waitFor(() => st.last('game:view'), 5000, 'game view');
  }
  return { st, ps, id: r.body.lobby.id };
}

const stView = (st: TestClient) => st.last('game:view') as StorytellerGameView;
const errorFor = (c: TestClient, type: string, from = 0) => waitFor(() => c.of('error').slice(from).find((e) => e.for === type), 3000, `${c.name}: error for ${type}`);
const dealt = (st: TestClient) =>
  waitFor(() => (stView(st)?.grimoire.length && stView(st).grimoire.every((g) => g.character) ? stView(st).grimoire.map((g) => g.character) : undefined), 5000, 'dealt');

describe('character dealing per script (real server)', () => {
  for (const script of ['trouble-brewing', 'bad-moon-rising', 'sects-and-violets'] as const) {
    it(`${script}: a random deal uses only ${script} characters, with a legal distribution`, async () => {
      const { st } = await lobby(script);
      const pool = charactersOfScript(script);
      // several deals: the pool check is statistical, so look at more than one
      for (let round = 0; round < 4; round++) {
        st.send('st:command', { type: 'random_setup' });
        const chars = await dealt(st);
        expect(chars).toHaveLength(PLAYERS);
        for (const c of chars) expect(pool, `${c} dealt on ${script}`).toContain(c);
        expect(new Set(chars).size).toBe(PLAYERS);
        expect(countTypes(chars)).toEqual(setupCounts(PLAYERS, chars));
      }
      expect(st.of('error')).toEqual([]);
    }, 30_000);
  }

  it('storylines are refused off Trouble Brewing', async () => {
    const { st } = await lobby('bad-moon-rising');
    st.send('st:command', { type: 'deal_preset', storyline: 'beginners-lantern' });
    expect((await errorFor(st, 'st:command')).message).toMatch(/Trouble Brewing/);
  }, 30_000);

  it('custom script: no random deal; any characters (incl. homebrew) by hand', async () => {
    const { st } = await lobby('custom');
    st.send('st:command', { type: 'random_setup' });
    expect((await errorFor(st, 'st:command')).message).toMatch(/custom script/i);
    const chars: CharacterId[] = ['imp', 'godfather', 'wizard', 'plague_doctor', 'clockmaker', 'grandmother', 'empath'];
    const seats = stView(st).players.map((p) => p.seat);
    const before = st.of('error').length;
    st.send('st:command', { type: 'assign_characters', assignments: seats.map((seat, i) => ({ seat, character: chars[i]! })), demonBluffs: [], allowNonstandard: true });
    expect((await dealt(st)).sort()).toEqual([...chars].sort());
    expect(st.of('error').slice(before)).toEqual([]);
  }, 30_000);

  it('an automatic game cannot start on a custom script', async () => {
    const { st } = await lobby('custom', { start: false, mode: 'auto' });
    const v = await st.view((x) => x.startBlockers.some((b) => /official script/.test(b)), 5000);
    expect(v.canStart).toBe(false);
  }, 30_000);
});

describe('changing the script in the waiting room', () => {
  it('the host changes it; others cannot; storylines are cleared off TB; refused once the game runs', async () => {
    const { st, ps } = await lobby('trouble-brewing', { start: false, mode: 'auto' });
    st.send('lobby:settings', { autoStoryline: 'beginners-lantern' });
    await st.view((v) => v.autoStorylineChoice === 'beginners-lantern', 3000);
    st.send('lobby:settings', { script: 'sects-and-violets' });
    const v = await st.view((x) => x.lobby.script === 'sects-and-violets', 3000);
    expect(v.autoStorylineChoice ?? null).toBeNull(); // the TB storyline was dropped
    await ps[0]!.view((x) => x.lobby.script === 'sects-and-violets', 3000); // everyone sees it
    // a storyline on a non-TB script is refused
    let from = st.of('error').length;
    st.send('lobby:settings', { autoStoryline: 'beginners-lantern' });
    expect((await errorFor(st, 'lobby:settings', from)).message).toMatch(/Trouble Brewing/);
    // only the host
    ps[0]!.send('lobby:settings', { script: 'bad-moon-rising' });
    expect((await errorFor(ps[0]!, 'lobby:settings')).code).toBe('forbidden');
    // the game uses the new script
    await st.view((x) => x.canStart, 5000);
    st.send('lobby:start', {});
    const roles = await waitFor(
      () => {
        const all = [st, ...ps].map((c) => (c.last('game:view') as PlayerGameView | undefined)?.you.role?.character);
        return all.every(Boolean) ? (all as CharacterId[]) : undefined;
      },
      70_000,
      'roles revealed',
    );
    const snv = charactersOfScript('sects-and-violets');
    // what a player is told can differ (e.g. a Mutant is not told otherwise, but nobody is told a TB character)
    for (const c of roles) expect(snv, c).toContain(c);
    // in game: refused
    from = st.of('error').length;
    st.send('lobby:settings', { script: 'trouble-brewing' });
    expect((await errorFor(st, 'lobby:settings', from)).code).toBe('phase');
  }, 120_000);
});

describe('Travellers in a real game', () => {
  it('a Traveller can be seated at setup, re-aligned, is told their character, and cannot be nominated', async () => {
    const { st, ps } = await lobby('trouble-brewing');
    const seats = stView(st).players.map((p) => p.seat);
    // 6 seated characters (standard for 6: 3/1/1/1) + 1 Traveller on top
    const chars: CharacterId[] = ['imp', 'poisoner', 'butler', 'chef', 'empath', 'monk', 'scapegoat'];
    st.send('st:command', { type: 'assign_characters', assignments: seats.map((seat, i) => ({ seat, character: chars[i]! })), demonBluffs: [] });
    await waitFor(() => st.of('error').length || (stView(st).grimoire.length > 0 && stView(st).grimoire.every((g) => g.character)), 5000, 'assign answered');
    expect(st.of('error')).toEqual([]);
    expect((await dealt(st)).sort()).toEqual([...chars].sort());
    const tSeat = seats[6]!;
    st.send('st:command', { type: 'change_character', seat: tSeat, character: 'scapegoat', alignment: 'evil', notify: false });
    await waitFor(() => stView(st).grimoire.find((g) => g.seat === tSeat)?.alignment === 'evil', 3000, 'traveller evil');
    st.send('st:command', { type: 'begin_first_night' });
    const traveller = ps.find((p) => (p.last('game:view') as PlayerGameView | undefined)?.you.seat === tSeat)!;
    await waitFor(() => (traveller.last('game:view') as PlayerGameView).you.role?.character === 'scapegoat', 5000, 'traveller told');
    expect((traveller.last('game:view') as PlayerGameView).you.role?.alignment).toBe('evil');
    // day: a Traveller is exiled, never nominated for execution
    st.send('st:command', { type: 'force_phase', to: 'day' });
    await waitFor(() => stView(st).phase === 'day', 5000, 'day');
    st.send('st:command', { type: 'set_nominations_open', open: true });
    const nominator = ps.find((p) => p !== traveller)!;
    await waitFor(() => (nominator.last('game:view') as PlayerGameView).phase === 'day', 5000, 'player day');
    nominator.send('game:nominate', { nomineeSeat: tSeat });
    expect((await errorFor(nominator, 'game:nominate')).message).toMatch(/exiled, not executed/);
  }, 60_000);
});

describe('Travellers made by the Storyteller (set_traveller) and exile', () => {
  it('a random deal skips the Traveller seat: legal distribution for the others, Traveller keeps character + secret alignment', async () => {
    const { st, ps } = await lobby('bad-moon-rising');
    const tSeat = stView(st).players.at(-1)!.seat;
    st.send('st:command', { type: 'set_traveller', seat: tSeat, character: 'matron', alignment: 'evil' });
    await waitFor(() => stView(st).travellers?.some((t) => t.seat === tSeat), 3000, 'traveller set');
    expect(stView(st).setupCounts).toEqual(setupCounts(PLAYERS - 1)); // the distribution is for 6
    for (let round = 0; round < 3; round++) {
      st.send('st:command', { type: 'random_setup' });
      await dealt(st);
      const g = stView(st).grimoire;
      const t = g.find((e) => e.seat === tSeat)!;
      expect(t).toMatchObject({ character: 'matron', alignment: 'evil' });
      const others = g.filter((e) => e.seat !== tSeat).map((e) => e.character);
      for (const c of others) expect(charactersOfScript('bad-moon-rising')).toContain(c);
      expect(countTypes(others)).toEqual(setupCounts(PLAYERS - 1, others));
    }
    expect(st.of('error')).toEqual([]);
    // first night: the Traveller is told their character and alignment; everyone sees the Traveller character (not the alignment)
    st.send('st:command', { type: 'begin_first_night' });
    const traveller = ps.find((p) => (p.last('game:view') as PlayerGameView | undefined)?.you.seat === tSeat)!;
    await waitFor(() => (traveller.last('game:view') as PlayerGameView).you.role?.character === 'matron', 5000, 'traveller told');
    expect((traveller.last('game:view') as PlayerGameView).you.role?.alignment).toBe('evil');
    const other = ps.find((p) => p !== traveller)!;
    const pub = await waitFor(() => (other.last('game:view') as PlayerGameView).players.find((p) => p.seat === tSeat)?.traveller, 5000, 'public traveller');
    expect(pub).toBe('matron');
    expect(JSON.stringify((other.last('game:view') as PlayerGameView).players)).not.toContain('evil');
  }, 60_000);

  it('a Traveller cannot be executed or force-nominated; a majority exiles them (dead players vote free)', async () => {
    const { st, ps } = await lobby('trouble-brewing');
    const tSeat = stView(st).players.at(-1)!.seat;
    st.send('st:command', { type: 'set_traveller', seat: tSeat, character: 'gunslinger', alignment: 'good' });
    st.send('st:command', { type: 'random_setup' });
    await dealt(st);
    st.send('st:command', { type: 'begin_first_night' });
    st.send('st:command', { type: 'force_phase', to: 'day' });
    await waitFor(() => stView(st).phase === 'day', 5000, 'day');
    let from = st.of('error').length;
    st.send('st:command', { type: 'force_execute', seat: tSeat });
    expect((await errorFor(st, 'st:command', from)).message).toMatch(/exiled, not executed/);
    from = st.of('error').length;
    st.send('st:command', { type: 'create_nomination', nominatorSeat: 0, nomineeSeat: tSeat });
    expect((await errorFor(st, 'st:command', from)).message).toMatch(/exiled, not executed/);
    // one regular player dies first: they still vote on the exile, without spending the ghost vote
    const deadSeat = stView(st).players.find((p) => p.seat !== tSeat)!.seat;
    st.send('st:command', { type: 'kill', seat: deadSeat, announce: true });
    await waitFor(() => stView(st).players.find((p) => p.seat === deadSeat)?.alive === false, 5000, 'dead');
    st.send('st:command', { type: 'exile_call', seat: tSeat, startVote: true });
    const ex = await waitFor(() => stView(st).exile?.status === 'voting' && stView(st).exile, 5000, 'exile open');
    expect(ex.threshold).toBe(Math.floor((PLAYERS - 1) / 2) + 1); // more than half the 6 living
    // players raise their own hands (the dead one too); the Traveller cannot be nominated meanwhile
    const bySeat = (seat: number) => ps.find((p) => (p.last('game:view') as PlayerGameView).you.seat === seat)!;
    const voters = stView(st).players.filter((p) => p.seat !== tSeat).slice(0, ex.threshold - 1).map((p) => p.seat);
    if (!voters.includes(deadSeat)) voters[0] = deadSeat;
    for (const seat of voters) bySeat(seat).send('game:exileHand', { vote: true });
    await waitFor(() => stView(st).exile!.hands.length === voters.length, 5000, 'hands');
    for (const c of ps) await waitFor(() => (c.last('game:view') as PlayerGameView).exile?.hands.length === voters.length, 5000, 'public hands');
    // the Storyteller has full control: one more hand set by the ST reaches the threshold
    const extra = stView(st).players.find((p) => p.seat !== tSeat && !voters.includes(p.seat))!.seat;
    st.send('st:command', { type: 'exile_hand', seat: extra, vote: true });
    await waitFor(() => stView(st).exile!.hands.length === ex.threshold, 5000, 'threshold');
    st.send('st:command', { type: 'exile_tally' });
    await waitFor(() => stView(st).exile?.status === 'tallied', 5000, 'tallied');
    expect(stView(st).exile).toMatchObject({ exiled: true, voteCount: ex.threshold });
    const t = stView(st).players.find((p) => p.seat === tSeat)!;
    expect(t).toMatchObject({ alive: false, exiled: true });
    expect(stView(st).players.find((p) => p.seat === deadSeat)!.ghostVoteAvailable).toBe(true); // not spent
    expect(stView(st).day?.executedSeat ?? null).toBeNull(); // an exile is not the day's execution
  }, 60_000);
});

describe('the Storyteller runs a human lobby', () => {
  it('a host who is a regular player cannot change or police the lobby; the Storyteller can', async () => {
    const hostAcct = await makeAccount(srv, 'plain-host');
    const r = await api<{ lobby: LobbySummary }>(srv, 'POST', '/api/lobbies', { cookie: hostAcct.cookie, body: { name: 'Admin test', maxPlayers: 10, script: 'trouble-brewing' } });
    const host = await join(r.body.lobby.id, 'Host', hostAcct.cookie);
    const other = await join(r.body.lobby.id, 'Other');
    const hv = await host.view((v) => v.members.length === 2);
    expect(hv.members.find((m) => m.pid === hv.youPid)?.isHost).toBe(true);
    expect(hv.youAdmin).toBe(false); // no Storyteller seated: nobody runs the lobby yet
    host.send('lobby:settings', { script: 'bad-moon-rising' });
    expect((await errorFor(host, 'lobby:settings')).code).toBe('forbidden');
    host.send('lobby:kick', { pid: other.pid! });
    expect((await errorFor(host, 'lobby:kick')).code).toBe('forbidden');
    // a regular player's one option: take the open Storyteller seat
    other.send('lobby:claimStoryteller', {});
    const ov = await other.view((v) => v.members.find((m) => m.pid === v.youPid)?.role === 'storyteller');
    expect(ov.youAdmin).toBe(true);
    expect((await host.view((v) => v.members.some((m) => m.role === 'storyteller'))).youAdmin).toBe(false);
    other.send('lobby:settings', { script: 'bad-moon-rising' });
    await host.view((v) => v.lobby.script === 'bad-moon-rising', 3000);
  }, 30_000);
});

