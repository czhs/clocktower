import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import { tileCenterPx, type LocationId, type PlayerGameView, type S2CMessages } from '@ct/protocol';
import { createStore, Emitter } from '../src/net/store';
import type { LocalPlayerState } from '../src/net/localPlayer';
import { attachSound, type SoundConn } from '../src/game/sound';
import { SoundEngine } from '../src/game/sound/engine';
import { createFakeAudio } from '../src/game/sound/fakeAudio';

// Night-leak test (required by docs/world-audit.md §4 and docs/audio.md): for a player the
// Storyteller does NOT visit, everything the sound system does during a night with ST visits to
// other houses must be identical to a night with no visits at all — same files fetched, same
// nodes, same parameter automation, same sources started at the same times.
//
// The busy night deliberately feeds the client MORE than the server ever sends a non-visited
// player (the ST and other occupants inside other homes and walking outdoors, in the shared
// remote-entity map; repeated identical game views at visit times), so a sound path that keys
// off any of that would show up as a difference. A control run proves the harness is sensitive:
// for the visited player the same busy night does sound different (visit cue, the ST's steps).

const L = townLayout;
const house = (seat: number) => L.buildings.find((b) => b.id === `house-${seat}`)!;
const px = (p: { x: number; y: number }) => tileCenterPx(L, p);
const loc = (seat: number): LocationId => `bld:house-${seat}`;
const FPS = 30;
const SECONDS = 95;

function view(phase: PlayerGameView['phase'], extra: Partial<PlayerGameView> = {}): PlayerGameView {
  const players = [1, 2, 3, 5, 7].map((seat) => ({
    pid: `p${seat}`,
    seat,
    name: `P${seat}`,
    alive: true,
    ghostVoteAvailable: true,
    nominatedToday: false,
    wasNominatedToday: false,
    connected: true,
  }));
  return {
    kind: 'player',
    phase,
    dayNumber: 1,
    phaseEndsAt: null,
    players,
    you: { pid: 'me', seat: 0, alive: true, ghostVoteAvailable: true, canNominate: true, role: null },
    day: null,
    prompts: [],
    info: [],
    announcements: [],
    storytellerVisitingYou: false,
    result: null,
    ...extra,
  };
}

const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** Wander around a point (deterministic). */
const wander = (c: { x: number; y: number }, t: number, r = 14) => ({ x: c.x + Math.sin(t * 1.3) * r, y: c.y + Math.cos(t * 0.9) * r * 0.6 });

interface Run {
  log: string[];
  fetched: string[];
  starts: string[];
}

/**
 * Simulate one evening → night → morning for the player in `mySeat`'s home.
 * busy = the Storyteller visits houses 3 and 7 (and walks outdoors between them).
 */
async function simulate(mySeat: number, busy: boolean): Promise<Run> {
  const fake = createFakeAudio();
  const engine = new SoundEngine({ createContext: () => fake.ctx, fetchBytes: (u) => fake.fetchBytes(u), formats: () => ['ogg', 'm4a'], baseUrl: '/audio/', seed: 42 });
  const events = new Emitter<S2CMessages>();
  const gameView = createStore<PlayerGameView | null>(view('day'));
  const conn: SoundConn = { events: events as unknown as SoundConn['events'], gameView };
  const meId = `p${mySeat}`;
  const local = createStore<LocalPlayerState>({ pid: meId, x: L.square.cx - 60, y: L.square.cy, location: 'outdoors' });
  const remotes = new Map<string, { x: number; y: number; location: LocationId }>();
  let frameFn: ((ms: number) => void) | null = null;
  engine.unlock(); // the player's first click
  const detach = attachSound(conn, { engine, local, remotes, voice: null, uiRoot: null, seed: 7, schedule: (fn) => ((frameFn = fn), () => (frameFn = null)) });

  const home = house(mySeat);
  const door = px(home.door);
  const inDoor = px(home.interiorDoor);
  const bed = px(home.bed!);
  const sq = { x: L.square.cx, y: L.square.cy };
  const fired = new Set<string>();
  const once = (k: string, fn: () => void) => {
    if (!fired.has(k)) {
      fired.add(k);
      fn();
    }
  };
  const nomination = (votes: Record<number, boolean>) => ({
    nominationsOpen: true,
    nominations: [{ id: 'n1', nominatorSeat: 1, nomineeSeat: 2, status: 'voting' as const, votes, currentVoterSeat: null, voteCount: 0, threshold: 3 }],
    onTheBlock: null,
    executedSeat: null,
  });

  for (let f = 0; f < SECONDS * FPS; f++) {
    const t = f / FPS;
    // --- the local player (identical in both runs) -------------------------------------------
    if (t < 10) local.set({ pid: meId, ...wander(sq, t, 50), location: 'outdoors' });
    else if (t < 15) local.set({ pid: meId, ...lerp(wander(sq, 10, 50), door, (t - 10) / 5), location: 'outdoors' });
    else if (t < 20) {
      once('door-in', () => events.emit('world:teleport', { ...inDoor, location: loc(mySeat), reason: 'door', seq: 1 }));
      local.set({ pid: meId, ...lerp(inDoor, bed, (t - 15) / 5), location: loc(mySeat) });
    } else local.set({ pid: meId, ...bed, location: loc(mySeat) });

    // --- other players: visible together in the square by day (identical) --------------------
    remotes.clear();
    if (t < 12) {
      remotes.set('p1', { ...wander({ x: sq.x + 30, y: sq.y }, t), location: 'outdoors' });
      remotes.set('p2', { ...wander({ x: sq.x - 20, y: sq.y + 20 }, t * 1.1), location: 'outdoors' });
    }
    // --- public timeline (identical) ----------------------------------------------------------
    if (t >= 10) once('bedtime', () => (gameView.set(view('bedtime')), events.emit('sound', { cue: 'bell' })));
    if (t >= 20) once('night', () => gameView.set(view('night')));
    if (t >= 70) once('dawn', () => (gameView.set(view('dawn')), events.emit('sound', { cue: 'dawn' })));
    if (t >= 75)
      once('day', () => {
        const v = view('day', { announcements: [{ id: 'a1', at: 1, kind: 'death', text: 'P7 is dead.' }] });
        v.players.find((p) => p.seat === 7)!.alive = false;
        gameView.set(v);
        events.emit('sound', { cue: 'toll' });
      });
    if (t >= 80) once('vote0', () => gameView.set({ ...gameView.get()!, day: nomination({}) }));
    if (t >= 81) once('vote1', () => gameView.set({ ...gameView.get()!, day: nomination({ 1: true }) }));
    if (t >= 82) once('vote2', () => gameView.set({ ...gameView.get()!, day: nomination({ 1: true, 3: false }) }));
    if (t >= 84)
      once('exec', () => {
        const prev = gameView.get()!;
        const v: PlayerGameView = { ...prev, players: prev.players.map((p) => (p.seat === 2 ? { ...p, alive: false } : p)), announcements: [...prev.announcements, { id: 'a2', at: 2, kind: 'execution', text: 'P2 has been executed and is dead.' }] };
        gameView.set(v);
        events.emit('sound', { cue: 'toll' });
      });

    // --- the Storyteller's busy night (only in the busy run) ---------------------------------
    if (busy) {
      const vp3 = px(house(3).visitPoint!);
      const vp7 = px(house(7).visitPoint!);
      if (t >= 21 && t < 70) {
        // occupants of other homes, as a leaky snapshot would show them
        remotes.set('p3', { ...px(house(3).bed!), location: loc(3) });
        remotes.set('p7', { ...px(house(7).bed!), location: loc(7) });
      }
      if (t >= 25 && t < 40) {
        remotes.set('st', { ...wander(vp3, t, 18), location: loc(3) });
        if (mySeat === 3) once('visit3', () => events.emit('sound', { cue: 'visit' })); // server: visited player only
        once('reemit1', () => gameView.set({ ...gameView.get()! })); // identical view re-sent
      } else if (t >= 40 && t < 45) {
        remotes.set('st', { ...lerp(px(house(3).door), px(house(7).door), (t - 40) / 5), location: 'outdoors' });
      } else if (t >= 45 && t < 60) {
        remotes.set('st', { ...wander(vp7, t, 18), location: loc(7) });
        if (mySeat === 7) once('visit7', () => events.emit('sound', { cue: 'visit' }));
        once('reemit2', () => gameView.set({ ...gameView.get()! }));
      } else if (t >= 60 && t < 66) {
        // Worst case for distance-based hearing: the ST in ANOTHER location but at coordinates right
        // next to our bed (interiors share one coordinate space), walking and passing door spots.
        const other = mySeat === 3 ? 7 : 3;
        remotes.set('st', { ...wander(bed, t, 20), location: loc(other) });
        if (t >= 63) remotes.set('st2', { ...lerp(inDoor, bed, (t - 63) / 3), location: 'outdoors' });
      }
    }

    frameFn!(t * 1000);
    fake.advance(1 / FPS);
    await new Promise((r) => setImmediate(r)); // let fetch/decode promises settle
  }
  detach();
  return { log: fake.log, fetched: fake.fetched, starts: fake.starts() };
}

describe('sound: night-leak', () => {
  it('a non-visited player hears exactly the same night with or without ST visits elsewhere', async () => {
    const quiet = await simulate(5, false);
    const busy = await simulate(5, true);
    // sanity: the scenario actually exercised the sound system
    expect(quiet.starts.some((s) => s.startsWith('cue/bell@'))).toBe(true);
    expect(quiet.starts.some((s) => s.startsWith('step/'))).toBe(true);
    expect(quiet.starts.some((s) => s.startsWith('amb/crickets@'))).toBe(true);
    expect(quiet.starts.some((s) => s.startsWith('sfx/gavel@'))).toBe(true);
    expect(quiet.starts.some((s) => s.startsWith('sfx/ghost@'))).toBe(true);
    expect(quiet.starts.filter((s) => s.startsWith('sfx/tick')).length).toBe(2);
    expect(quiet.starts.some((s) => s.startsWith('cue/visit@'))).toBe(false);
    // the actual guarantee: identical everything
    expect(busy.fetched).toEqual(quiet.fetched);
    expect(busy.starts).toEqual(quiet.starts);
    expect(busy.log).toEqual(quiet.log);
  }, 60_000);

  it('control: the visited player does hear the visit (the harness detects differences)', async () => {
    const quiet = await simulate(3, false);
    const busy = await simulate(3, true);
    expect(busy.starts.some((s) => s.startsWith('cue/visit@'))).toBe(true);
    // the Storyteller walking around inside the visited home is audible there
    const nightSteps = (r: Run) => r.starts.filter((s) => s.startsWith('step/') && Number(s.split('@')[1]) > 21 && Number(s.split('@')[1]) < 70);
    expect(nightSteps(quiet)).toEqual([]);
    expect(nightSteps(busy).length).toBeGreaterThan(5);
    expect(busy.log).not.toEqual(quiet.log);
  }, 60_000);

  it('another non-visited home (house 1) is equally unaffected', async () => {
    const quiet = await simulate(1, false);
    const busy = await simulate(1, true);
    expect(busy.log).toEqual(quiet.log);
  }, 60_000);
});
