// v3 WP7 (v3-qa). The mock-world harness's pure scenario player (src/game3d/harness/scenario.ts) and the harness build
// rules (docs/v3/INTEGRATION.md §6.3): every scenario file validates, snapshots come at 12 Hz with linear px
// interpolation, a shot pauses the batch, compact game states expand into valid views, and the harness never reaches
// the app build (dist/).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { entitiesAt, gameViewOf, lobbyViewOf, ScenarioPlayer, SNAPSHOT_HZ, validateScenario, type Scenario } from '../../src/game3d/harness/scenario';

const CLIENT = fileURLToPath(new URL('../../', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const SCEN_DIR = path.join(REPO, 'tests/v3/scenarios');
const scenarios = readdirSync(SCEN_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, s: JSON.parse(readFileSync(path.join(SCEN_DIR, f), 'utf8')) as Scenario }));

const tiny: Scenario = {
  name: 'tiny',
  world: 'v3',
  members: [
    { pid: 'me', name: 'You', cast: 'frog', seat: 0 },
    { pid: 'st', name: 'ST', cast: 'storyteller', role: 'storyteller' },
    { pid: 'a', name: 'A', cast: 'fox' },
  ],
  steps: [
    { at: 0, snapshot: { entities: [{ id: 'a', x: 0, y: 0 }] } },
    { at: 1000, snapshot: { entities: [{ id: 'a', x: 100, y: 0 }] } },
    { at: 1200, chat: { from: 'a', text: 'hi' } },
  ],
  shots: [{ at: 500, name: 'mid' }],
};

describe('harness scenarios (tests/v3/scenarios)', () => {
  it('has the §6.3 scenarios and every file validates', () => {
    const names = scenarios.map((x) => x.s.name).sort();
    expect(names).toEqual(expect.arrayContaining(['square-day-8', 'night-15', 'vote-12', 'interior-house-5', 'dusk-transition', 'phone-390x844', 'south-bay', 'projection']));
    for (const { file, s } of scenarios) {
      expect(validateScenario(s), file).toEqual([]);
      expect(`${s.name}.json`, 'file name = scenario name').toBe(file);
      if (s.mode !== 'projection') expect(() => new ScenarioPlayer(s), file).not.toThrow();
    }
  });

  it('shot names are unique across all scenarios (one still per name in tests/v3/shots/)', () => {
    const all = scenarios.flatMap((x) => x.s.shots.map((s) => s.name));
    expect(new Set(all).size).toBe(all.length);
  });

  it('rejects broken scenarios with a reason', () => {
    expect(validateScenario({ ...tiny, world: 'v4' as never })).toContain('world must be v2|v3 (got v4)');
    expect(validateScenario({ ...tiny, steps: [{ at: 5 }, { at: 1 }] }).join()).toMatch(/out of order/);
    expect(validateScenario({ ...tiny, steps: [{ at: 0, snapshot: { entities: [{ id: 'ghost', x: 0, y: 0 }] } }] }).join()).toMatch(/unknown entity ghost/);
    expect(validateScenario({ ...tiny, shots: [{ at: 0, name: 'Bad Name' }] }).join()).toMatch(/name must be/);
    expect(() => new ScenarioPlayer({ ...tiny, members: [] })).toThrow(/members or lobbyView required/);
  });
});

describe('ScenarioPlayer', () => {
  it('interpolates keyframes linearly in px and holds the last pose', () => {
    const keys = new Map([['a', [{ at: 0, e: { id: 'a', x: 0, y: 0 } }, { at: 1000, e: { id: 'a', x: 100, y: 50 } }]]]);
    expect(entitiesAt(keys, -1)).toEqual([]);
    const mid = entitiesAt(keys, 500)[0]!;
    expect(mid).toMatchObject({ id: 'a', x: 50, y: 25, location: 'outdoors', facing: 'right', moving: true });
    expect(entitiesAt(keys, 2000)[0]).toMatchObject({ x: 100, y: 50, moving: false });
    // a location change is a jump, not a slide through the wall
    const jump = new Map([['a', [{ at: 0, e: { id: 'a', x: 0, y: 0 } }, { at: 1000, e: { id: 'a', x: 900, y: 400, location: 'bld:house-1' as const } }]]]);
    expect(entitiesAt(jump, 999)[0]).toMatchObject({ x: 0, y: 0, location: 'outdoors', moving: false });
    expect(entitiesAt(jump, 1000)[0]).toMatchObject({ x: 900, location: 'bld:house-1' });
  });

  it('emits 12 Hz snapshots in time order, pauses at a shot, then continues', () => {
    let ack = 7;
    const p = new ScenarioPlayer(tiny, { now: () => 42, ackSeq: () => ack, self: () => ({ id: 'me', x: 1, y: 2, location: 'outdoors', facing: 'down', moving: false }) });
    const a = p.advance(2000);
    // snapshots at 0, 83.3, …, up to the shot at 500 (incl. 500 itself? no: 6·83.3 = 500 → the step order puts the snapshot first)
    const snaps = a.filter((e) => e.kind === 'event' && e.type === 'world:snapshot');
    expect(a.at(-1)).toMatchObject({ kind: 'shot', shot: { name: 'mid' } });
    expect(snaps.length).toBe(Math.floor(500 / (1000 / SNAPSHOT_HZ)) + 1);
    const s0 = (snaps[0] as { payload: { ackSeq: number; t: number; entities: { id: string }[] } }).payload;
    expect(s0.ackSeq).toBe(7);
    expect(s0.t).toBe(42);
    expect(s0.entities.map((e) => e.id)).toEqual(['me', 'a']); // own entity first, the scenario never moves it
    ack = 9;
    const b = p.advance(2000);
    const chat = b.find((e) => e.kind === 'event' && e.type === 'chat:message') as { payload: { fromPid: string; fromName: string; text: string } };
    expect(chat.payload).toMatchObject({ fromPid: 'a', fromName: 'A', text: 'hi' });
    expect(b.filter((e) => e.kind === 'event' && e.type === 'world:snapshot').length).toBe(2000 / (1000 / SNAPSHOT_HZ) - 6);
    expect(p.done).toBe(true);
    expect(p.duration).toBe(2200);
  });

  it('the same clock sequence gives the same messages (deterministic)', () => {
    const run = () => {
      const p = new ScenarioPlayer(scenarios.find((x) => x.s.name === 'square-day-8')!.s, { now: () => 0 });
      const out: string[] = [];
      for (let t = 0; t <= 10_000; t += 37) for (const e of p.advance(t)) out.push(JSON.stringify(e));
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('compact views', () => {
  it('lobbyViewOf seats players in order, the Storyteller has no seat, world is carried', () => {
    const lv = lobbyViewOf(tiny);
    expect(lv.youPid).toBe('me');
    expect(lv.world).toBe('v3');
    expect(lv.lobby.world).toBe('v3');
    expect(lv.members.map((m) => [m.pid, m.role, m.seat])).toEqual([
      ['me', 'player', 0],
      ['st', 'storyteller', null],
      ['a', 'player', 1],
    ]);
    expect(lv.members.find((m) => m.pid === 'a')!.cosmetics.preset).toBe('fox');
  });

  it('gameViewOf: nomination, dead players, clock and the Storyteller view', () => {
    const lv = lobbyViewOf(tiny);
    const g = gameViewOf(lv, { phase: 'day', dead: ['a'], nomination: { nominator: 0, nominee: 1, votes: { 0: true }, current: 1, hands: [1] }, clock: { stage: 'nominations', totalMs: 60_000, remainingMs: 30_000 } }, 1000);
    expect(g.kind).toBe('player');
    if (g.kind !== 'player') return;
    expect(g.players.map((p) => [p.pid, p.alive])).toEqual([
      ['me', true],
      ['a', false],
    ]);
    const n = g.day!.nominations[0]!;
    expect(n).toMatchObject({ status: 'voting', currentVoterSeat: 1, voteCount: 1, threshold: 1, handsRaised: [1] });
    expect((g as unknown as { clock: { endsAt: number; paused: boolean } }).clock).toMatchObject({ endsAt: 31_000, paused: false });
    const st = gameViewOf({ ...lv, youPid: 'st' }, { phase: 'night' }, 0);
    expect(st.kind).toBe('storyteller');
    expect(st.day).toBeNull();
  });
});

describe('harness build boundary (§6.3)', () => {
  it('the app build config never includes the harness page', () => {
    const app = readFileSync(path.join(CLIENT, 'vite.config.ts'), 'utf8');
    expect(app).not.toMatch(/v3-harness/);
    const h = readFileSync(path.join(CLIENT, 'vite.harness.config.ts'), 'utf8');
    expect(h).toMatch(/dist-harness/);
    expect(h).toMatch(/v3-harness\.html/);
  });

  it('a built dist/ (when present) contains no harness files', () => {
    const dist = path.join(CLIENT, 'dist');
    if (!existsSync(dist)) return;
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/v3-harness|harness/i.test(path.relative(dist, p))) bad.push(path.relative(dist, p));
      }
    };
    walk(dist);
    expect(bad).toEqual([]);
  });
});

describe('e2e world layouts (tests/v3/worlds.ts)', () => {
  it('layoutOf / plazaOf equal the real per-world modules', async () => {
    const { layoutOf, plazaOf } = await import('../../../../tests/v3/worlds');
    const { townLayoutV3, townMapV3 } = await import('@ct/assets/hollowmere');
    const { townLayout, PLAZA } = await import('@ct/assets');
    expect(layoutOf('v3')).toEqual(townLayoutV3);
    expect(plazaOf('v3')).toEqual(townMapV3.plaza);
    expect(layoutOf('v2')).toBe(townLayout);
    expect(layoutOf(undefined)).toBe(townLayout);
    expect(plazaOf('v2')).toEqual(PLAZA);
  });
});
