// OWNED BY playtest. Shared harness for apps/server/test/playtest*.test.ts: scripted bot playtests of
// the full Trouble Brewing loop through the REAL
// in-process server: HTTP accounts/lobbies/tickets -> Colyseus GameRoom with the real Game, World
// and Voice modules -> colyseus.js clients for 1 Storyteller + N players.
//
// The Storyteller bot drives the game exactly like the Storyteller panel does (st:command only):
// random/manual setup, walking the night queue with visit_home -> prompt_player -> send_info /
// resolve_step -> leave_home, dawn/day, nominations, clockwise votes (incl. ghost votes),
// executions, bedtime countdown, until a win condition. Player bots answer prompts, nominate,
// raise hands while the clock hand runs and fire Slayer shots.
//
// Secrecy is asserted on every message every non-ST client receives (structural whitelist of the
// player projection, forbidden keys, night snapshots/voice grants scoped to the own home, no night
// deaths before dawn, no account ids, no cross-lobby data), and every ST night visit is checked to
// leave the streams of all non-visited players unchanged (only identical world snapshots).
// (v2.2, WP4) Clients take the compact 'world:snap2' stream: snapshots are checked decoded, and the
// raw frames too (scanWire).
import {
  CHARACTER_INFO,
  type S2CMessages,
  type ServerErrorMsg,
  type CharacterId,
  type DayView,
  type GamePhase,
  type LobbyRoomView,
  type NightStepView,
  type PlayerGameView,
  type PromptView,
  type StCommand,
  type StorytellerGameView,
  type Snap2Frame,
  type WorldSnapshot,
  SNAP_RESET,
} from '@ct/protocol';
import net from 'node:net';
import { mulberry32 } from '@ct/rules';
import { expect } from 'vitest';
import { createGameModule, type GameModuleOptions } from '../src/game/index.js';
import { createLobby, makeAccount, sleep, startTestServer, TestClient, waitFor, type TestServer } from '../src/rooms/testkit.js';

export const VOTE_STEP_MS = 200;
const NIGHTISH: GamePhase[] = ['first_night', 'night', 'dawn'];
const DARK: GamePhase[] = ['first_night', 'night'];

/** Process-wide playtest state (each vitest file runs in its own fork). */
export const env = {
  srv: null as unknown as TestServer,
  /** Per-lobby GameModule options (read by the module at start(), so they can be set after creation). */
  optsByLobby: new Map<string, GameModuleOptions>(),
  games: [] as Game[],
};

export const LIVEKIT_TEST_ENV = {
  // Voice "configured" against an unreachable LiveKit: tokens are minted locally (so grants flow
  // and can be checked for secrecy); server-API calls fail fast and are only logged as warnings.
  LIVEKIT_URL: 'ws://127.0.0.1:9',
  LIVEKIT_API_KEY: 'playtestkey',
  LIVEKIT_API_SECRET: 'playtest-secret-0123456789abcdef0123456789',
};

/** Playtest port range (CLAUDE.md). Other sandboxes may run these files concurrently. */
const PORT_MIN = 3310;
const PORT_MAX = 3319;

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

/** First free port in the playtest range, starting at `preferred`. */
export async function playtestPort(preferred: number): Promise<number> {
  const n = PORT_MAX - PORT_MIN + 1;
  for (let i = 0; i < n * 3; i++) {
    const p = PORT_MIN + ((preferred - PORT_MIN + i) % n);
    if (await portFree(p)) return p;
    if (i % n === n - 1) await sleep(500);
  }
  throw new Error('no free playtest port in 3310-3319');
}

export async function startPlaytestServer(preferredPort: number, extraEnv: Record<string, string> = {}): Promise<TestServer> {
  // Other forks/sandboxes may grab a port between the probe and listen(): retry on EADDRINUSE.
  let port = preferredPort;
  for (let attempt = 0; ; attempt++) {
    port = await playtestPort(port);
    try {
      env.srv = await startTestServer(port, {
        rateLimits: { ticket: { capacity: 1000, refillPerSec: 1000 } },
        moduleFactories: {
          game: (host) => {
            const o: GameModuleOptions = { voteStepMs: VOTE_STEP_MS, bedtimeSeconds: 1 };
            env.optsByLobby.set(host.lobbyId, o);
            return createGameModule(host, o);
          },
        },
        env: { LOBBY_MAX_COUNT: '32', ...LIVEKIT_TEST_ENV, ...extraEnv },
      });
      return env.srv;
    } catch (e) {
      if (attempt >= 20 || !String((e as Error)?.message ?? e).includes('EADDRINUSE')) throw e;
      port = PORT_MIN + ((port - PORT_MIN + 1) % (PORT_MAX - PORT_MIN + 1));
      await sleep(100 + Math.floor(Math.random() * 300));
    }
  }
}

export async function stopPlaytestServer() {
  const all = env.games.flatMap((g) => [g.st, ...g.players.map((p) => p.c)]);
  await Promise.all(all.map((c) => c.leave(true)));
  await env.srv?.close();
}

// ------------------------------------------------------------------------------------ harness

export type Ans = { seats?: number[]; character?: CharacterId; yes?: boolean };

/** Client-side token bucket so bots stay under the room's per-pid message budget (20, 10/s). */
export class Bucket {
  private tokens: number;
  private at = Date.now();
  constructor(
    private cap = 14,
    private rate = 7,
  ) {
    this.tokens = cap;
  }
  async take() {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(this.cap, this.tokens + ((now - this.at) / 1000) * this.rate);
      this.at = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await sleep(Math.ceil(((1 - this.tokens) / this.rate) * 1000) + 5);
    }
  }
}

export interface Player {
  seat: number;
  pid: string;
  name: string;
  cookie: string;
  accountId: string;
  c: TestClient;
  /** Earlier connections (kept for the secrecy scan). */
  past: TestClient[];
  /** Index into c.messages where this match started (rematch). */
  since?: number;
  online: boolean;
  bucket: Bucket;
  /** nominationId -> hand to raise when the vote starts. */
  votePlan: Map<string, boolean>;
  voted: Set<string>;
}

export interface Initial {
  character: CharacterId;
  believed: CharacterId;
  alignment: 'good' | 'evil';
}

export interface NightHooks {
  /** Override a player's answer to a night prompt. */
  answer?: (g: Game, p: Player, step: NightStepView, prompt: PromptView) => Ans | undefined;
  /** Extra resolve_step fields (starpassSeat / redirectSeat / seats). */
  resolve?: (g: Game, step: NightStepView) => { seats?: number[]; starpassSeat?: number; redirectSeat?: number } | undefined;
  /** Seats whose streams may legitimately change while the ST is visiting this step's player. */
  windowExceptions?: (g: Game, step: NightStepView) => number[];
  /** Runs after the prompt reached the player; return true to skip the visit-window check. */
  onPrompted?: (g: Game, p: Player, step: NightStepView, prompt: PromptView) => Promise<boolean>;
}

export interface DayPolicy {
  /** From this day on, the living Demon is nominated (good wins unless the Scarlet Woman catches it). */
  demonDay?: number;
  /** Day 1 gets a second nomination that fails to reach the threshold. */
  secondNomination?: boolean;
}

export function fp(v: StorytellerGameView): string {
  return JSON.stringify({ ...v, players: v.players.map(({ connected: _c, ...rest }) => rest) });
}
export function stepOf(v: StorytellerGameView, id: string): NightStepView | undefined {
  return v.nightQueue.find((s) => s.id === id);
}
export function nomOf(d: DayView | null | undefined, id: string) {
  return d?.nominations.find((n) => n.id === id);
}
export function typeOf(c: CharacterId) {
  return CHARACTER_INFO[c].type;
}

export class Game {
  readonly players: Player[] = [];
  st!: TestClient;
  readonly stPast: TestClient[] = [];
  stCookie = '';
  stPid = '';
  stAccountId = '';
  lobbyId = '';
  readonly initial = new Map<number, Initial>();
  readonly rng: () => number;
  readonly stBucket = new Bucket();
  joined: { name: string; cookie: string; accountId: string; c: TestClient }[] = [];
  visitsChecked = 0;
  /** Seats whose character/alignment the ST corrected (role checks relaxed in the secrecy scan). */
  readonly relaxedRoles = new Set<number>();
  /** The ST made deaths/revivals public at night (kill with announce, undo, set_alive). */
  nightAliveChangesOk = false;
  /** 0 for the first match in this lobby, 1 after a rematch, ... */
  matchIndex = 0;
  constructor(
    readonly prefix: string,
    readonly n: number,
    readonly seed: number,
    readonly bedtimeSeconds: number,
  ) {
    this.rng = mulberry32(seed);
  }

  bySeat(seat: number): Player {
    const p = this.players.find((x) => x.seat === seat);
    if (!p) throw new Error(`${this.prefix}: no player in seat ${seat}`);
    return p;
  }
  online(): Player[] {
    return this.players.filter((p) => p.online);
  }
  stView(): StorytellerGameView {
    const v = this.st.last('game:view');
    if (!v || v.kind !== 'storyteller') throw new Error(`${this.prefix}: no storyteller view`);
    return v;
  }
  pv(p: Player): PlayerGameView {
    const v = p.c.last('game:view');
    if (!v || v.kind !== 'player') throw new Error(`${this.prefix}: no player view for seat ${p.seat}`);
    return v;
  }
  /** The game is over, or a detected game end awaits the Storyteller's confirmation. */
  finished(): boolean {
    const v = this.stView();
    return v.phase === 'finished' || !!v.pendingResult;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rng() * arr.length)]!;
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }

  /** Send one ST command (as the panel would) and wait until it took effect (or failed). */
  async cmd(c: StCommand, o: { until?: (v: StorytellerGameView) => boolean; error?: RegExp; timeoutMs?: number } = {}): Promise<StorytellerGameView> {
    await this.stBucket.take();
    const st = this.st;
    const errBefore = st.of('error').length;
    const before = fp(this.stView());
    st.send('st:command', c);
    const r = await waitFor<{ err?: ServerErrorMsg; v?: StorytellerGameView }>(
      () => {
        const err = st.of('error').slice(errBefore).find((e) => e.for === 'st:command');
        if (err) return { err };
        if (o.error) return undefined;
        const v = this.stView();
        return (o.until ? o.until(v) : fp(v) !== before) ? { v } : undefined;
      },
      o.timeoutMs ?? 6000,
      `${this.prefix} ST ${c.type}`,
    );
    if (r.err) {
      if (o.error) {
        expect(r.err.message).toMatch(o.error);
        return this.stView();
      }
      throw new Error(`${this.prefix}: ST ${c.type} rejected: ${r.err.code} ${r.err.message}`);
    }
    return r.v!;
  }

  async act(p: Player, type: 'game:nominate' | 'game:vote' | 'game:promptResponse' | 'game:slayerShot', payload: unknown) {
    await p.bucket.take();
    p.c.sendRaw(type, payload);
  }

  /** Wait for a player-side error for `forType` received after index `since`. */
  async playerError(p: Player, forType: string, since: number, re: RegExp) {
    const e = await waitFor(() => p.c.of('error').slice(since).find((x) => x.for === forType), 3000, `${p.name} error for ${forType}`);
    expect(e.message).toMatch(re);
    return e;
  }

  async allPhase(phase: GamePhase, timeoutMs = 5000) {
    await waitFor(() => this.online().every((p) => p.c.last('game:view')?.phase === phase), timeoutMs, `${this.prefix}: all players in ${phase}`);
  }
}

/** Raise/lower hands as soon as a planned nomination's vote starts (the clock hand is running). */
export function attachBot(p: Player) {
  p.c.room.onMessage('*', (type: string | number, payload: unknown) => {
    if (type !== 'game:view') return;
    const v = payload as PlayerGameView;
    if (v.kind !== 'player') return;
    for (const n of v.day?.nominations ?? []) {
      const plan = p.votePlan.get(n.id);
      if (n.status !== 'voting' || plan === undefined || p.voted.has(n.id) || p.seat in n.votes) continue;
      p.voted.add(n.id);
      p.c.send('game:vote', { nominationId: n.id, vote: plan });
    }
  });
}

export interface Account {
  name: string;
  cookie: string;
  accountId: string;
}

export async function newGame(
  prefix: string,
  n: number,
  seed: number,
  opts: Partial<GameModuleOptions> = {},
  /** Reuse these accounts for the first seats (e.g. a player moving from lobby A to lobby B). */
  existing: Account[] = [],
  names?: string[],
): Promise<Game> {
  const g = new Game(prefix, n, seed, opts.bedtimeSeconds ?? 1);
  env.games.push(g);
  const host = await makeAccount(env.srv, `${prefix}-ST`);
  g.stCookie = host.cookie;
  g.stAccountId = host.account.id;
  const lobby = await createLobby(env.srv, host.cookie, { name: `${prefix} town`, takeStoryteller: true });
  g.lobbyId = lobby.id;
  const o = env.optsByLobby.get(lobby.id);
  if (!o) throw new Error('game module options not registered');
  Object.assign(o, { seed }, opts);
  g.st = await TestClient.join(env.srv, host.cookie, lobby.id, 'storyteller', `${prefix}-ST`);
  for (let i = 0; i < n; i++) {
    let acct = existing[i];
    if (!acct) {
      const name = names?.[i] ?? `${prefix}-P${i + 1}`;
      const a = await makeAccount(env.srv, name);
      acct = { name, cookie: a.cookie, accountId: a.account.id };
    }
    const c = await TestClient.join(env.srv, acct.cookie, lobby.id, 'player', acct.name);
    g.joined.push({ ...acct, c });
  }
  await g.st.view((v) => v.members.length === n + 1, 8000);
  for (const j of g.joined) j.c.send('lobby:ready', { ready: true });
  await g.st.view((v) => v.canStart, 8000);
  g.stPid = g.st.pid!;
  return g;
}

/** lobby:start -> setup (random or manual) -> begin_first_night. */
/** Wait for a message of `type` received after index `since` on this client. */
export function waitAfter<K extends keyof S2CMessages>(c: TestClient, since: number, type: K, pred: (x: S2CMessages[K]) => boolean = () => true, timeoutMs = 5000) {
  return waitFor(
    () =>
      c.messages
        .slice(since)
        .filter((m) => m.type === type)
        .map((m) => m.payload as S2CMessages[K])
        .find(pred),
    timeoutMs,
    `${c.name}: ${String(type)} (after #${since})`,
  );
}

export async function startGame(
  g: Game,
  assignment?: CharacterId[],
  hooks: { beforeAssign?: () => Promise<void>; beforeFirstNight?: () => Promise<void> } = {},
) {
  const since = new Map(g.joined.map((j) => [j.c, j.c.messages.length]));
  const stSince = g.st.messages.length;
  g.st.send('lobby:start', {});
  for (const j of g.joined) {
    const v = (await waitAfter(j.c, since.get(j.c)!, 'game:view', (x) => x.kind === 'player', 8000)) as PlayerGameView;
    const p: Player = {
      seat: v.you.seat,
      pid: v.you.pid,
      // The server's per-lobby label (duplicate display names get a suffix).
      name: v.players.find((x) => x.seat === v.you.seat)!.name,
      cookie: j.cookie,
      accountId: j.accountId,
      c: j.c,
      past: [],
      online: true,
      bucket: new Bucket(),
      votePlan: new Map(),
      voted: new Set(),
      since: since.get(j.c)!,
    };
    expect(p.pid).toBe(j.c.pid);
    attachBot(p);
    g.players.push(p);
  }
  g.players.sort((a, b) => a.seat - b.seat);
  expect(g.players.map((p) => p.seat)).toEqual([...Array(g.n).keys()]);
  await waitAfter(g.st, stSince, 'game:view', (v) => v.kind === 'storyteller' && v.phase === 'setup');
  expect(g.stView().phase).toBe('setup');
  expect(g.stView().grimoire).toEqual([]);

  await hooks.beforeAssign?.();
  if (assignment) {
    expect(assignment).toHaveLength(g.n);
    await g.cmd(
      { type: 'assign_characters', assignments: assignment.map((character, seat) => ({ seat, character })), demonBluffs: [], allowNonstandard: true },
      { until: (v) => !!v.charactersAssigned },
    );
  } else {
    await g.cmd({ type: 'random_setup' }, { until: (v) => !!v.charactersAssigned });
  }
  const sv = g.stView();
  expect(sv.grimoire).toHaveLength(g.n);
  expect(sv.demonBluffs).toHaveLength(3);
  if (!assignment) {
    const counts = { townsfolk: 0, outsiders: 0, minions: 0, demons: 0 };
    for (const e of sv.grimoire) {
      const t = typeOf(e.character);
      counts[t === 'outsider' ? 'outsiders' : t === 'minion' ? 'minions' : t === 'demon' ? 'demons' : 'townsfolk']++;
    }
    expect(counts).toEqual(sv.setupCounts);
  }
  for (const e of sv.grimoire) g.initial.set(e.seat, { character: e.character, believed: e.believedCharacter, alignment: e.alignment });
  // Nobody learns anything during setup.
  await sleep(100);
  for (const p of g.players) expect(g.pv(p).you.role).toBeNull();

  await hooks.beforeFirstNight?.();
  await g.cmd({ type: 'begin_first_night' }, { until: (v) => v.phase === 'first_night' });
  await g.allPhase('first_night');
  for (const p of g.players) {
    const init = g.initial.get(p.seat)!;
    await waitFor(() => g.pv(p).you.role, 3000, 'role revealed');
    expect(g.pv(p).you.role).toEqual({
      character: init.believed,
      characterType: typeOf(init.believed),
      alignment: CHARACTER_INFO[init.believed].alignment,
    });
    // Everyone is sent to bed in their own home.
    await waitAfter(p.c, p.since ?? 0, 'world:teleport', (t) => t.location === `bld:house-${p.seat}`);
  }
}

// ------------------------------------------------------------------------------------- nights

/** lobby:view minus volatile fields (timestamps, the Storyteller's connection flag). */
function lobbyKey(g: Game, v: LobbyRoomView | undefined): string {
  if (!v) return '';
  return JSON.stringify({
    ...v,
    lobby: { ...v.lobby, updatedAt: 0 },
    members: v.members.map((x) => (x.pid === g.stPid ? { ...x, connected: true } : x)),
  });
}

export function lastEntities(c: TestClient): string {
  return JSON.stringify(c.last('world:snapshot')?.entities ?? null);
}

export function defaultAnswer(g: Game, p: Player, step: NightStepView, prompt: PromptView): Ans {
  if (prompt.kind === 'yes_no') return { yes: true };
  if (prompt.kind === 'acknowledge') return {};
  if (prompt.kind === 'choose_character') return { character: prompt.characterOptions?.[0] ?? 'chef' };
  const sv = g.stView();
  const min = prompt.minTargets ?? 1;
  const legal = sv.grimoire.filter((e) => (prompt.allowSelf || e.seat !== p.seat) && (prompt.allowDead || e.publicAlive !== false));
  const role = step.actingAs ?? step.character;
  let pref = legal;
  if (role === 'imp')
    pref = legal.filter(
      (e) => e.alive && e.seat !== p.seat && e.alignment === 'good' && !e.protectedTonight && e.character !== 'soldier' && e.character !== 'mayor',
    );
  else if (role === 'poisoner' || role === 'monk') pref = legal.filter((e) => e.alive && e.alignment === 'good');
  if (pref.length < min) pref = legal;
  return { seats: g.shuffle(pref.map((e) => e.seat)).slice(0, min) };
}

export async function checkEvilInfo(g: Game, kind: 'minion_info' | 'demon_info') {
  const sv = g.stView();
  const demons = sv.grimoire.filter((e) => typeOf(e.character) === 'demon').map((e) => e.seat);
  const minions = sv.grimoire.filter((e) => typeOf(e.character) === 'minion').map((e) => e.seat);
  for (const seat of kind === 'minion_info' ? minions : demons) {
    const p = g.bySeat(seat);
    const team = await waitFor(() => g.pv(p).you.evilTeam, 3000, `${kind} for seat ${seat}`);
    expect(team.demonSeats).toEqual(demons);
    expect(team.minionSeats).toEqual(minions);
    if (kind === 'demon_info') expect(team.bluffs).toEqual(sv.demonBluffs);
  }
}

export async function runStep(g: Game, step: NightStepView, hooks: NightHooks) {
  const done = (v: StorytellerGameView) => {
    if (v.phase === 'finished' || v.pendingResult) return true;
    const s = stepOf(v, step.id);
    return !s || s.status === 'resolved' || s.status === 'skipped';
  };
  if (step.seat === null) {
    await g.cmd({ type: 'resolve_step', stepId: step.id }, { until: done });
    if (step.character === 'minion_info' || step.character === 'demon_info') await checkEvilInfo(g, step.character);
    return;
  }
  const p = g.bySeat(step.seat);
  const exceptions = new Set([p.seat, ...(hooks.windowExceptions?.(g, step) ?? [])]);
  const marks = new Map(
    g.online()
      .filter((o) => !exceptions.has(o.seat))
      .map((o) => [o, { idx: o.c.messages.length, widx: o.c.wire.length, ents: lastEntities(o.c), lobby: lobbyKey(g, o.c.last('lobby:view')) }]),
  );
  let skipWindow = false;
  const visitCues = p.c.of('sound').filter((s) => s.cue === 'visit').length;

  // Physically walk (fast travel) into the home.
  await g.cmd({ type: 'visit_home', seat: p.seat }, { until: (v) => v.visitingSeat === p.seat });
  await waitFor(() => g.pv(p).storytellerVisitingYou, 3000, 'visited player sees the ST');
  await waitFor(() => p.c.of('sound').filter((s) => s.cue === 'visit').length > visitCues, 3000, 'visit cue');
  await waitFor(() => p.c.last('world:snapshot')?.entities.some((e) => e.id === g.stPid), 3000, 'ST visible in the visited home');

  let cur = stepOf(g.stView(), step.id)!;
  if (cur.prompt && cur.status !== 'answered' && !done(g.stView())) {
    const spec = cur.prompt;
    await g.cmd({ type: 'prompt_player', seat: p.seat, prompt: spec }, { until: (v) => stepOf(v, step.id)?.status === 'prompted' });
    const prompt = await waitFor(() => g.pv(p).prompts.find((q) => q.title === spec.title), 3000, 'prompt reaches the player');
    if (hooks.onPrompted) skipWindow = await hooks.onPrompted(g, p, cur, prompt);
    // (A hook may already have answered, e.g. while the Storyteller was offline.)
    if (g.pv(p).prompts.some((q) => q.id === prompt.id)) {
      const ans = hooks.answer?.(g, p, cur, prompt) ?? defaultAnswer(g, p, cur, prompt);
      await g.act(p, 'game:promptResponse', { promptId: prompt.id, ...ans });
    }
    await waitFor(() => stepOf(g.stView(), step.id)?.status === 'answered', 3000, 'answer reaches the ST');
    await waitFor(() => !g.pv(p).prompts.some((q) => q.id === prompt.id), 3000, 'prompt cleared');
  }
  cur = stepOf(g.stView(), step.id)!;
  if (cur.suggestedInfo && !done(g.stView())) {
    const info = cur.suggestedInfo;
    const before = g.pv(p).info.length;
    await g.cmd({ type: 'send_info', seat: p.seat, info });
    await waitFor(() => g.pv(p).info.length > before && g.pv(p).info.at(-1)!.text === info.text, 3000, 'info reaches the player');
  }
  if (!done(g.stView())) {
    const extra = hooks.resolve?.(g, stepOf(g.stView(), step.id)!) ?? {};
    await g.cmd({ type: 'resolve_step', stepId: step.id, ...extra }, { until: done });
  }
  if (g.finished()) return;
  await g.cmd({ type: 'leave_home' }, { until: (v) => v.visitingSeat === null });
  await waitFor(() => !g.pv(p).storytellerVisitingYou, 3000, 'visit ended for the player');
  await waitFor(() => !(p.c.last('world:snapshot')?.entities.some((e) => e.id === g.stPid) ?? false), 3000, 'ST left the home');
  if (skipWindow || g.finished()) return;
  // Late (wrong) flushes would land within a tick or two.
  await sleep(150);
  for (const [o, m] of marks) {
    for (const msg of o.c.messages.slice(m.idx)) {
      // The Storyteller's own connection status is public lobby info (e.g. an ST page refresh).
      if (msg.type === 'lobby:view' && lobbyKey(g, msg.payload as LobbyRoomView) === m.lobby) continue;
      if (msg.type !== 'world:snapshot')
        throw new Error(
          `${g.prefix}: seat ${o.seat} received '${msg.type}' while the ST visited seat ${p.seat}: ${JSON.stringify(msg.payload).slice(0, 300)}`,
        );
      expect(JSON.stringify((msg.payload as WorldSnapshot).entities), `seat ${o.seat} snapshot during visit to ${p.seat}`).toBe(m.ents);
    }
    // (v2.2, WP4) On the wire: nothing new was indexed for them (no new id / location string).
    for (const f of o.c.wire.slice(m.widx)) expect(f.payload[4] ?? null, `seat ${o.seat} snap2 defs during visit to ${p.seat}`).toBeNull();
  }
  g.visitsChecked++;
}

export async function runNight(g: Game, hooks: NightHooks = {}) {
  for (let guard = 0; guard < 100; guard++) {
    const v = g.stView();
    if (g.finished()) return;
    if (!NIGHTISH.includes(v.phase)) throw new Error(`${g.prefix}: runNight during ${v.phase}`);
    const step = v.nightQueue.find((s) => s.status !== 'resolved' && s.status !== 'skipped');
    if (!step) return;
    await runStep(g, step, hooks);
  }
  throw new Error(`${g.prefix}: night queue did not finish`);
}

// --------------------------------------------------------------------------------------- days

export async function toDay(g: Game, viaDawn: boolean) {
  if (g.finished()) return;
  const deadBefore = new Set(g.stView().players.filter((x) => !x.alive).map((x) => x.seat));
  if (viaDawn) await g.cmd({ type: 'advance_phase', to: 'dawn' }, { until: (v) => v.phase === 'dawn' });
  await g.cmd({ type: 'advance_phase', to: 'day' }, { until: (v) => v.phase === 'day' || (v.phase === 'finished' || !!v.pendingResult) });
  if (g.finished()) return;
  await g.allPhase('day');
  const sv = g.stView();
  expect(sv.pendingDeaths ?? []).toEqual([]);
  for (const e of sv.grimoire) expect(e.publicAlive, `seat ${e.seat} public status at dawn`).toBe(e.alive);
  const newlyDead = sv.grimoire.filter((e) => !e.alive && !deadBefore.has(e.seat));
  for (const p of g.online()) {
    await waitFor(() => sv.grimoire.every((e) => g.pv(p).players.find((x) => x.seat === e.seat)!.alive === e.alive), 3000, 'deaths published');
    for (const d of newlyDead) expect(g.pv(p).announcements.some((a) => a.text === `${g.bySeat(d.seat).name} is dead.`)).toBe(true);
    expect(g.pv(p).you.canNominate).toBe(g.pv(p).you.alive);
  }
}

export async function nominate(g: Game, nominator: Player, nomineeSeat: number): Promise<string> {
  const before = g.stView().day?.nominations.length ?? 0;
  await g.act(nominator, 'game:nominate', { nomineeSeat });
  const v = await waitFor(
    () => {
      const v = g.stView();
      return (v.day?.nominations.length ?? 0) > before || (v.phase === 'finished' || !!v.pendingResult) ? v : undefined;
    },
    3000,
    'nomination',
  );
  const n = v.day!.nominations.at(-1)!;
  expect(n.nominatorSeat).toBe(nominator.seat);
  expect(n.nomineeSeat).toBe(nomineeSeat);
  return n.id;
}

/** Run one clockwise vote. `yes` = seats that raise a hand (dead ones without a ghost vote are refused). */
export async function vote(g: Game, nomId: string, yes: Set<number>) {
  const sv = g.stView();
  const canVote = new Map(sv.players.map((x) => [x.seat, x.alive || x.ghostVoteAvailable]));
  const errIdx = new Map(g.players.map((p) => [p.seat, p.c.of('error').length]));
  for (const p of g.players) if (yes.has(p.seat)) p.votePlan.set(nomId, true);
  await g.cmd({ type: 'start_vote', nominationId: nomId }, { until: (v) => nomOf(v.day, nomId)?.status === 'voting' });
  const n = await waitFor(
    () => {
      const x = nomOf(g.stView().day, nomId);
      return x && x.status === 'tallied' ? x : undefined;
    },
    g.n * VOTE_STEP_MS + 6000,
    'vote tally',
  );
  for (const e of sv.players) expect(n.votes[e.seat], `${g.prefix} vote of seat ${e.seat}`).toBe(yes.has(e.seat) && canVote.get(e.seat) === true);
  expect(n.voteCount).toBe(Object.values(n.votes).filter(Boolean).length);
  for (const p of g.players) {
    if (!yes.has(p.seat) || canVote.get(p.seat)) continue;
    await g.playerError(p, 'game:vote', errIdx.get(p.seat)!, /ghost vote/i); // second ghost vote refused
  }
  const after = g.stView();
  for (const e of sv.players) {
    const used = yes.has(e.seat) && !e.alive && e.ghostVoteAvailable;
    if (used) expect(after.players.find((x) => x.seat === e.seat)!.ghostVoteAvailable).toBe(false);
  }
  for (const p of g.online()) await waitFor(() => JSON.stringify(nomOf(g.pv(p).day, nomId)?.votes) === JSON.stringify(n.votes), 3000, 'public votes');
  return n;
}

export async function execute(g: Game, seat: number) {
  await g.cmd({ type: 'execute', seat }, { until: (v) => v.day?.executedSeat === seat || (v.phase === 'finished' || !!v.pendingResult) });
  if (g.finished()) return;
  const name = g.bySeat(seat).name;
  for (const p of g.online()) {
    await waitFor(() => g.pv(p).players.find((x) => x.seat === seat)!.alive === false, 3000, 'execution is public');
    expect(g.pv(p).announcements.some((a) => a.text === `${name} has been executed and is dead.`)).toBe(true);
  }
}

export function chooseNominee(g: Game, policy: DayPolicy): number | null {
  const sv = g.stView();
  const alive = sv.grimoire.filter((e) => e.alive);
  const demon = alive.find((e) => typeOf(e.character) === 'demon');
  if (demon && policy.demonDay !== undefined && sv.dayNumber >= policy.demonDay) return demon.seat;
  const cands = alive.filter((e) => e.character !== 'saint' && typeOf(e.character) !== 'demon' && !(e.character === 'virgin' && !e.abilityUsed));
  const good = cands.filter((e) => e.alignment === 'good');
  const pool = good.length ? good : cands;
  if (!pool.length) return demon?.seat ?? null;
  return g.pick(pool).seat;
}

export function chooseNominator(g: Game, nomineeSeat: number, exclude: number[] = []): Player {
  const sv = g.stView();
  const ok = sv.players.filter((x) => x.alive && !x.nominatedToday && x.seat !== nomineeSeat && !exclude.includes(x.seat));
  return g.bySeat(g.pick(ok).seat);
}

export async function runDay(g: Game, policy: DayPolicy) {
  const dayNumber = g.stView().dayNumber;
  await g.cmd({ type: 'set_nominations_open', open: true }, { until: (v) => v.day?.nominationsOpen === true });
  const nominee = chooseNominee(g, policy);
  if (nominee === null) {
    await g.cmd({ type: 'execute', seat: null }, { until: (v) => v.day?.nominationsOpen === false });
    return;
  }
  const nomId = await nominate(g, chooseNominator(g, nominee), nominee);
  let sv = g.stView();
  if (sv.phase === 'finished' || sv.pendingResult || sv.day?.executedSeat != null) return; // Virgin fired
  // Everyone but the nominee raises a hand, dead players included (ghost votes; spent ones refused).
  await vote(g, nomId, new Set(g.players.map((p) => p.seat).filter((s) => s !== nominee)));
  if (policy.secondNomination && dayNumber === 1) {
    sv = g.stView();
    const cands = sv.grimoire.filter(
      (e) => e.alive && !sv.players.find((x) => x.seat === e.seat)!.wasNominatedToday && e.character !== 'saint' && e.character !== 'virgin',
    );
    if (cands.length) {
      const second = g.pick(cands).seat;
      const nominator = chooseNominator(g, second);
      const id2 = await nominate(g, nominator, second);
      const n2 = await vote(g, id2, new Set([nominator.seat]));
      expect(n2.voteCount).toBe(1);
      expect(g.stView().day!.onTheBlock?.seat).toBe(nominee); // not enough to replace the block
    }
  }
  sv = g.stView();
  const block = sv.day?.onTheBlock ?? null;
  if (block) await execute(g, block.seat);
  else await g.cmd({ type: 'execute', seat: null }, { until: (v) => v.day?.nominationsOpen === false });
}

export async function toNight(g: Game, mode: 'bedtime' | 'direct') {
  if (g.finished()) return;
  if (mode === 'direct') {
    await g.cmd({ type: 'advance_phase', to: 'night' }, { until: (v) => v.phase === 'night' || (v.phase === 'finished' || !!v.pendingResult) });
  } else {
    const bells = new Map(g.online().map((p) => [p, p.c.of('sound').filter((s) => s.cue === 'bell').length]));
    await g.cmd({ type: 'advance_phase', to: 'bedtime' }, { until: (v) => v.phase !== 'day' || !!v.pendingResult });
    if (g.finished()) return;
    for (const [p, n] of bells) await waitFor(() => p.c.of('sound').filter((s) => s.cue === 'bell').length > n, 3000, 'bedtime bell');
    // The countdown expires on its own and night falls (players auto-return home).
    await waitFor(() => g.stView().phase !== 'bedtime', (g.bedtimeSeconds + 5) * 1000, 'bedtime countdown');
  }
  if (g.finished()) return;
  await g.allPhase('night');
  for (const p of g.online()) expect(g.pv(p).day).toBeNull();
}

export async function playToEnd(g: Game, policy: DayPolicy = {}, hooks: NightHooks = {}) {
  for (let cycle = 0; cycle < 16 && !g.finished(); cycle++) {
    await runNight(g, hooks);
    if (g.finished()) break;
    await toDay(g, cycle % 2 === 1);
    if (g.finished()) break;
    await runDay(g, policy);
    if (g.finished()) break;
    await toNight(g, cycle % 2 === 0 ? 'bedtime' : 'direct');
  }
  expect(g.finished()).toBe(true);
}

// -------------------------------------------------------------------------------- end of game

export function matchRows(g: Game) {
  return env.srv.services.database.sqlite.prepare('SELECT * FROM matches WHERE lobby_id = ? ORDER BY started_at, rowid').all(g.lobbyId) as Record<
    string,
    unknown
  >[];
}

export async function verifyFinished(g: Game, expected: { winner?: 'good' | 'evil'; reason?: RegExp } = {}) {
  const pending = g.stView().pendingResult;
  if (pending) {
    // Detected game end: nobody has been told yet; play is paused until the ST confirms.
    for (const p of g.online()) {
      expect(g.pv(p).phase).not.toBe('finished');
      expect(g.pv(p).result).toBeNull();
    }
    await g.cmd({ type: 'confirm_result' }, { until: (v) => v.phase === 'finished' });
  }
  const sv = await waitFor(
    () => {
      const v = g.stView();
      return v.phase === 'finished' && v.result ? v : undefined;
    },
    5000,
    'finished',
  );
  const result = sv.result!;
  if (expected.winner) expect(result.winner).toBe(expected.winner);
  if (expected.reason) expect(result.reason).toMatch(expected.reason);
  expect(result.reveal).toHaveLength(g.n);
  for (const r of result.reveal) {
    const e = sv.grimoire.find((x) => x.seat === r.seat)!;
    expect(r).toEqual({ seat: r.seat, pid: g.bySeat(r.seat).pid, name: g.bySeat(r.seat).name, character: e.character, alignment: e.alignment, alive: e.alive });
  }
  for (const p of g.online()) {
    const v = await waitFor(() => (g.pv(p).phase === 'finished' ? g.pv(p) : undefined), 5000, `${p.name} sees the end`);
    expect(v.result).toEqual(result);
    expect(v.prompts).toEqual([]);
    expect(v.announcements.some((a) => a.kind === 'game_over')).toBe(true);
    await p.c.view((lv) => lv.lobby.phase === 'finished', 5000);
  }
  await g.st.view((lv) => lv.lobby.phase === 'finished', 5000);

  // Stats: exactly one finalised match row and one row per seated player.
  const k = g.matchIndex;
  await waitFor(() => matchRows(g).length === k + 1 && matchRows(g)[k]!.ended_at !== null, 5000, 'match recorded');
  const m = matchRows(g)[k]!;
  expect(m).toMatchObject({ winner: result.winner, reason: result.reason, storyteller_account_id: g.stAccountId });
  const rows = env.srv.services.database.sqlite.prepare('SELECT * FROM match_players WHERE match_id = ?').all(m.id) as Record<string, unknown>[];
  expect(rows).toHaveLength(g.n);
  for (const r of result.reveal) {
    const p = g.bySeat(r.seat);
    const row = rows.find((x) => x.account_id === p.accountId)!;
    expect(row).toMatchObject({
      seat: r.seat,
      starting_character: g.initial.get(r.seat)!.character,
      final_character: r.character,
      alignment: r.alignment,
      won: r.alignment === result.winner ? 1 : 0,
      alive: r.alive ? 1 : 0,
    });
  }
  // The result is final: overrides after the end are refused and nothing is recorded twice.
  await g.cmd({ type: 'declare_winner', winner: result.winner === 'good' ? 'evil' : 'good', reason: 'late override' }, { error: /over/ });
  await g.cmd({ type: 'undo_last' }, { error: /over/ });
  await g.cmd({ type: 'announce', text: 'Thanks for playing!' }, { until: (v) => v.announcements.some((a) => a.text === 'Thanks for playing!') });
  await sleep(200);
  expect(matchRows(g)).toHaveLength(k + 1);
  expect(matchRows(g)[k]).toEqual(m);
  expect(g.stView().result).toEqual(result);
  const recorded = env.srv.log.lines.filter((l) => l.includes('"match recorded"') && l.includes(g.lobbyId));
  expect(recorded).toHaveLength(k + 1);
  return result;
}

// ---------------------------------------------------------------------------------- secrecy

const PLAYER_VIEW_KEYS = [
  'announcements',
  'bedtimeOvertime',
  'clock', // (v2.1, auto-st) public town clock
  'day',
  'dayNumber',
  'gathering',
  'info',
  'kind',
  'phase',
  'phaseEndsAt',
  'players',
  'prompts',
  'result',
  'spyGrimoire',
  'storytellerMode', // (v2.1, auto-st)
  'storytellerVisitingYou',
  'you',
];
const YOU_KEYS = ['alive', 'butlerMasterSeat', 'canNominate', 'canSlayerShot', 'evilTeam', 'ghostVoteAvailable', 'pid', 'role', 'seat'];
const PUBLIC_KEYS = ['alive', 'connected', 'ghostVoteAvailable', 'name', 'nominatedToday', 'pid', 'seat', 'wasNominatedToday'];
const FORBIDDEN_KEYS = [
  'grimoire',
  'nightQueue',
  'demonBluffs',
  'alerts',
  'log',
  'accountId',
  'pendingDeaths',
  'isRedHerring',
  'isButlerMaster',
  'believedCharacter',
  'poisoned',
  'drunk',
  'protectedTonight',
  'reminders',
  'visitingSeat',
  'suggestion',
  'suggestedInfo',
  'travelSpeedMult',
  'canUndo',
  'setupCounts',
  'timerPaused',
  'abilityUsed',
];

export function keysOf(value: unknown, out = new Set<string>(), skip = 'spyGrimoire'): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out, skip);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (k === skip) continue;
      out.add(k);
      keysOf(v, out, skip);
    }
  return out;
}

/**
 * (v2.2, WP4) Raw 'world:snap2' frames of one connection: no foreign ids, and the string table is
 * filled lazily: every string a frame defines is used by an entity in that same frame (so the table
 * never names anyone the viewer was not sent; the decoded snapshots are checked in scanPlayer).
 */
export function scanWire(where: string, frames: { payload: Snap2Frame }[], foreign: string[]) {
  let size = 0;
  for (const { payload: f } of frames) {
    const json = JSON.stringify(f);
    for (const x of foreign) if (json.includes(x)) throw new Error(`${where} world:snap2: contains foreign/secret id ${x}`);
    const [kind, , , ents, defs] = f as [number, number, number, (number[] | null)?, (string[] | null)?];
    if (kind === SNAP_RESET) size = 0;
    const used = new Set<number>();
    for (let i = 0; i + 4 < (ents ?? []).length; i += 5) used.add(ents![i]!).add(ents![i + 4]!);
    for (let k = 0; k < (defs ?? []).length; k++) expect(used.has(size + k), `${where} world:snap2 def '${defs![k]}' unused in its frame`).toBe(true);
    size += defs?.length ?? 0;
  }
}

/** Every message one player ever received must be consistent with what they may know. */
export function scanPlayer(g: Game, p: Player, foreign: string[]) {
  for (const c of [...p.past, p.c]) scanWire(`${g.prefix} seat ${p.seat}`, c.wire, foreign);
  const init = g.initial.get(p.seat)!;
  const msgs = [...p.past.flatMap((c) => c.messages), ...p.c.messages.slice(p.since ?? 0)];
  let phase: GamePhase | null = null;
  let dayAlive: string | null = null;
  let checkedViews = 0;
  for (const m of msgs) {
    const where = `${g.prefix} seat ${p.seat} ${m.type}`;
    const keys = keysOf(m.payload);
    for (const k of FORBIDDEN_KEYS) if (keys.has(k)) throw new Error(`${where}: forbidden key '${k}': ${JSON.stringify(m.payload).slice(0, 300)}`);
    const json = JSON.stringify(m.payload);
    for (const f of foreign) if (json.includes(f)) throw new Error(`${where}: contains foreign/secret id ${f}`);
    if (m.type === 'game:view') {
      const v = m.payload as PlayerGameView;
      checkedViews++;
      expect(v.kind, where).toBe('player');
      expect(Object.keys(v).sort(), where).toEqual(PLAYER_VIEW_KEYS);
      expect(Object.keys(v.you).sort(), where).toEqual(YOU_KEYS);
      for (const x of v.players) expect(Object.keys(x).sort(), where).toEqual(PUBLIC_KEYS);
      expect(v.you.seat, where).toBe(p.seat);
      expect(v.you.pid, where).toBe(p.pid);
      phase = v.phase;
      if (v.phase !== 'finished') expect(v.result, where).toBeNull();
      if (v.phase === 'setup') expect(v.you.role, where).toBeNull();
      if (v.you.role && !g.relaxedRoles.has(p.seat)) {
        const allowed = [init.believed, ...(init.alignment === 'evil' ? (['imp'] as CharacterId[]) : [])];
        expect(allowed, where).toContain(v.you.role.character);
        expect(v.you.role.alignment, where).toBe(CHARACTER_INFO[v.you.role.character].alignment);
        expect(v.you.role.characterType, where).toBe(typeOf(v.you.role.character));
      }
      if (init.alignment === 'good' && !g.relaxedRoles.has(p.seat)) expect(v.you.evilTeam ?? null, where).toBeNull();
      if (init.character !== 'spy') expect(v.spyGrimoire ?? null, where).toBeNull();
      if (init.believed !== 'butler') expect(v.you.butlerMasterSeat ?? null, where).toBeNull();
      for (const i of v.info) expect(i.id.startsWith(`i${p.seat}-`), where).toBe(true);
      for (const q of v.prompts) expect(q.id.startsWith(`q${p.seat}-`), where).toBe(true);
      if (!DARK.includes(v.phase) && v.phase !== 'dawn') {
        expect(v.storytellerVisitingYou, where).toBe(false);
      }
      // Night deaths stay hidden until the day starts.
      const alive = JSON.stringify(v.players.map((x) => x.alive));
      if (NIGHTISH.includes(v.phase)) {
        if (dayAlive !== null && !g.nightAliveChangesOk) expect(alive, `${where}: public alive changed at night`).toBe(dayAlive);
      } else dayAlive = alive;
    } else if (m.type === 'world:snapshot' && phase && DARK.includes(phase)) {
      for (const e of (m.payload as WorldSnapshot).entities) expect([p.pid, g.stPid], `${where} night entity`).toContain(e.id);
    } else if (m.type === 'voice:grant' && phase && DARK.includes(phase)) {
      const gr = m.payload as { zone: string; purpose: string };
      if (gr.purpose === 'zone') expect(gr.zone, where).toBe(`bld:house-${p.seat}`);
    } else if (m.type === 'sound') {
      expect(['bell', 'dawn', 'toll', 'door', 'visit'], where).toContain((m.payload as { cue: string }).cue);
    }
  }
  expect(checkedViews).toBeGreaterThan(1);
}

export function scanGame(g: Game) {
  const others = env.games.filter((x) => x !== g);
  const foreign = [
    ...others.flatMap((x) => [x.lobbyId, x.stPid, ...x.players.map((p) => p.pid)]),
    ...env.games.flatMap((x) => [x.stAccountId, ...x.players.map((p) => p.accountId)]),
  ].filter((s) => s && s.length >= 6);
  for (const p of g.players) scanPlayer(g, p, foreign);
  // The ST stream must not contain other lobbies' data or account ids either.
  for (const c of [...g.stPast, g.st]) {
    scanWire(`${g.prefix} ST`, c.wire, foreign);
    for (const m of c.messages) {
      const json = JSON.stringify(m.payload);
      for (const f of foreign) if (json.includes(f)) throw new Error(`${g.prefix} ST ${m.type}: contains ${f}`);
    }
  }
  // Client-caused transport errors (oversized frame from the malicious-client test) are expected.
  const CLIENT_CAUSED = ['colyseus: Max payload size exceeded'];
  const errors = env.srv.log.lines.filter((l) => {
    const j = JSON.parse(l) as { level: string; msg: string };
    return j.level === 'error' && !CLIENT_CAUSED.includes(j.msg);
  });
  expect(errors, errors.join('\n')).toEqual([]);
}

