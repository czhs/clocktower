import { afterEach, describe, expect, it } from 'vitest';
import { townLayout, townMap } from '@ct/assets';
import type { PlayerGameView } from '@ct/protocol';
import { ambientMix, surfaceAt } from '../src/game/sound/areas';
import { preferredFormats } from '../src/game/sound/codec';
import { GameCueTracker } from '../src/game/sound/cues';
import { MAX_VOICES, SoundEngine } from '../src/game/sound/engine';
import { createFakeAudio } from '../src/game/sound/fakeAudio';
import { SoundDirector } from '../src/game/sound/world';

const flush = () => new Promise((r) => setImmediate(r));

function setup() {
  const fake = createFakeAudio();
  const engine = new SoundEngine({ createContext: () => fake.ctx, fetchBytes: (u) => fake.fetchBytes(u), formats: () => ['ogg', 'm4a'], baseUrl: '/audio/', seed: 1 });
  return { fake, engine };
}

const fountain = townMap.objects.find((o) => o.kind === 'fountain')!;
const atFountain = { x: (fountain.x + 1.5) * 16, y: (fountain.y + 1.5) * 16 };
const square = { x: townLayout.square.cx, y: townLayout.square.cy };

describe('sound engine', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('nothing is fetched or played before the first gesture unlocks audio', async () => {
    const { fake, engine } = setup();
    expect(engine.play('door')).toBe(false);
    engine.setLoop('wind', 1);
    await flush();
    expect(fake.fetched).toEqual([]);
    engine.unlock();
    await flush();
    expect(fake.fetched.length).toBeGreaterThan(0);
    expect(fake.fetched.every((u) => !u.includes('/amb/'))).toBe(true); // loops are never preloaded
  });

  it('loops load lazily by area and are released when far away', async () => {
    const { fake, engine } = setup();
    engine.unlock();
    const dir = new SoundDirector(engine, 1);
    let t = 0;
    const run = async (p: { x: number; y: number }, seconds: number, phase = 'day') => {
      for (let i = 0; i < seconds * 10; i++) {
        dir.frame({ me: { id: 'me', ...p, location: 'outdoors' }, others: [], phase }, (t += 0.1));
        fake.advance(0.1);
        await flush();
      }
    };
    await run(square, 2);
    const amb = () => fake.fetched.filter((u) => u.includes('/amb/'));
    expect(amb()).toEqual(['/audio/amb/wind.ogg']);
    await run(atFountain, 2);
    expect(amb()).toContain('/audio/amb/fountain.ogg');
    expect(engine.activeLoops()).toContain('fountain');
    expect(amb()).not.toContain('/audio/amb/crickets.ogg'); // day: no night creatures
    await run(square, 45);
    expect(engine.activeLoops()).not.toContain('fountain');
    expect(engine.loadedFiles()).not.toContain('amb/fountain');
    await run(square, 2, 'night');
    expect(engine.activeLoops()).toContain('crickets');
  });

  it('caps concurrent voices', async () => {
    const { engine } = setup();
    engine.unlock();
    await flush();
    for (let i = 0; i < 40; i++) engine.play('step-cobble', { variant: (i % 4) + 1 });
    expect(engine.activeVoices()).toBeLessThanOrEqual(4); // per-clip cap
    const ids = ['door', 'bell', 'toll', 'dawn', 'gavel', 'ghost', 'tick', 'tick-yes', 'click', 'step-grass', 'step-wood', 'step-gravel'] as const;
    for (let i = 0; i < 60; i++) engine.play(ids[i % ids.length]!, { variant: 1 });
    expect(engine.activeVoices()).toBeLessThanOrEqual(MAX_VOICES);
  });

  it('ducks ambience smoothly while someone speaks, and recovers', () => {
    const { fake, engine } = setup();
    engine.unlock();
    engine.setDuck(1);
    expect(fake.log.some((l) => /gain\.target\(0\.45,[0-9.]+,0\.08\)/.test(l))).toBe(true);
    engine.setDuck(0);
    expect(fake.log.some((l) => /gain\.target\(1,[0-9.]+,0\.6\)/.test(l))).toBe(true);
  });

  it('persists volumes in localStorage and defaults ambience low', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const a = setup().engine;
    expect(a.getAmbientVolume()).toBe(0.25);
    a.setAmbientVolume(0.6);
    a.setSfxVolume(2);
    expect(store.get('ct.ambientVolume')).toBe('0.6');
    expect(store.get('ct.sfxVolume')).toBe('1');
    const b = setup().engine;
    expect(b.getAmbientVolume()).toBe(0.6);
    expect(b.getSfxVolume()).toBe(1);
  });

  it('works without localStorage', () => {
    const { engine } = setup();
    expect(() => engine.setAmbientVolume(0.3)).not.toThrow();
    expect(engine.getAmbientVolume()).toBe(0.3);
  });
});

describe('sound formats', () => {
  it('prefers Opus only when the browser is sure, else AAC', () => {
    const chrome = (m: string) => (m.includes('opus') ? 'probably' : 'maybe');
    const safari = (m: string) => (m.includes('mp4') ? 'maybe' : '');
    const safariMaybeOgg = (m: string) => 'maybe' + (m ? '' : '');
    expect(preferredFormats(chrome)).toEqual(['ogg', 'm4a']);
    expect(preferredFormats(safari)).toEqual(['m4a', 'ogg']);
    expect(preferredFormats(safariMaybeOgg)).toEqual(['m4a', 'ogg']);
    expect(preferredFormats(null)).toEqual(['m4a', 'ogg']);
  });

  it('falls back to the other format when decoding fails', async () => {
    const fake = createFakeAudio();
    const engine = new SoundEngine({
      createContext: () => fake.ctx,
      fetchBytes: (u) => (u.endsWith('.ogg') ? Promise.reject(new Error('nope')) : fake.fetchBytes(u)),
      formats: () => ['ogg', 'm4a'],
      baseUrl: '/audio/',
    });
    engine.unlock();
    await engine.load('sfx/door');
    expect(engine.loadedFiles()).toContain('sfx/door');
    expect(fake.fetched).toContain('/audio/sfx/door.m4a');
  });
});

describe('sound areas', () => {
  it('maps ground codes to footstep surfaces', () => {
    expect(surfaceAt(square.x, square.y)).toBe('cobble');
    const cottage = townLayout.buildings.find((b) => b.kind === 'house')!;
    const inside = { x: (cottage.interiorDoor.x + 0.5) * 16, y: (cottage.interiorDoor.y + 0.5) * 16 - 16 };
    expect(surfaceAt(inside.x, inside.y)).toBe('wood');
  });

  it('ambience depends on the public phase: crows by day, crickets and owls at night', () => {
    const day = ambientMix('outdoors', square.x, square.y, 'day');
    const night = ambientMix('outdoors', square.x, square.y, 'night');
    expect(day.loops.crickets.level).toBe(0);
    expect(night.loops.crickets.level).toBeGreaterThan(0);
    expect(day.calls.owlsPerMin).toBe(0);
    expect(night.calls.owlsPerMin).toBeGreaterThan(0);
    const home = ambientMix('bld:house-5', 0, 0, 'night');
    expect(home.loops.crickets.lowpass).toBeLessThan(5000); // muffled through the walls
    expect(home.loops.tavern.level).toBe(0);
  });

  it('v2 has no tavern: no tavern murmur anywhere', () => {
    expect(ambientMix('outdoors', square.x, square.y, 'day').loops.tavern.level).toBe(0);
  });
});

describe('game cues', () => {
  const base = (): PlayerGameView => ({
    kind: 'player',
    phase: 'day',
    dayNumber: 2,
    phaseEndsAt: null,
    players: [1, 2, 3].map((seat) => ({ pid: `p${seat}`, seat, name: `P${seat}`, alive: true, ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true })),
    you: { pid: 'p1', seat: 1, alive: true, ghostVoteAvailable: true, canNominate: true, role: null },
    day: { nominationsOpen: true, nominations: [], onTheBlock: null, executedSeat: null },
    prompts: [],
    info: [],
    announcements: [{ id: 'old', at: 0, kind: 'execution', text: 'old' }],
    storytellerVisitingYou: false,
    result: null,
  });

  it('first view only seeds; then ticks, gavel and ghost follow public changes', () => {
    const tr = new GameCueTracker();
    const v = base();
    expect(tr.next(v)).toEqual([]); // old execution announcement: no gavel on (re)join
    const nom = { id: 'n', nominatorSeat: 1, nomineeSeat: 2, status: 'voting' as const, votes: {} as Record<number, boolean>, currentVoterSeat: 3, voteCount: 0, threshold: 2 };
    v.day = { ...v.day!, nominations: [{ ...nom }] };
    expect(tr.next(v)).toEqual([]);
    v.day = { ...v.day, nominations: [{ ...nom, votes: { 3: true } }] };
    expect(tr.next(v).map((c) => c.cue)).toEqual(['tick-yes']);
    v.day = { ...v.day, nominations: [{ ...nom, votes: { 3: true, 1: false } }] };
    expect(tr.next(v).map((c) => c.cue)).toEqual(['tick']);
    expect(tr.next({ ...v })).toEqual([]); // identical re-send: silence
    v.announcements = [...v.announcements, { id: 'x', at: 1, kind: 'execution', text: 'P2 executed' }];
    v.players = v.players.map((p) => (p.seat === 2 ? { ...p, alive: false } : p));
    const cues = tr.next(v);
    expect(cues.map((c) => c.cue)).toEqual(['gavel', 'ghost']);
    expect(cues[1]!.delay).toBeGreaterThan(1);
  });

  it('never reads private view fields', () => {
    const tr = new GameCueTracker();
    const v = base();
    tr.next(v);
    expect(tr.next({ ...v, storytellerVisitingYou: true, prompts: [{ id: 'q', kind: 'acknowledge', title: 'x' }], info: [{ id: 'i', day: 1, phase: 'night', text: 'secret' }] })).toEqual([]);
  });
});

describe('attachSound: voice ducking', () => {
  it('dips ambience while anyone in earshot speaks and releases after a short hold', async () => {
    const { createStore, Emitter } = await import('../src/net/store');
    const { attachSound } = await import('../src/game/sound');
    const { fake, engine } = setup();
    engine.unlock();
    const voice = createStore({ anyoneSpeaking: false, level: 0 });
    const local = createStore({ pid: 'me', x: square.x, y: square.y, location: 'outdoors' as const });
    let frame: ((ms: number) => void) | null = null;
    const detach = attachSound(
      { events: new Emitter() as never, gameView: createStore(null) },
      { engine, local, remotes: new Map(), voice, uiRoot: null, schedule: (fn) => ((frame = fn), () => undefined) },
    );
    const duckTargets = () => fake.log.filter((l) => /^gain#\d+\.gain\.target\((0\.45|1),[0-9.]+,(0\.08|0\.6)\)$/.test(l));
    frame!(0);
    voice.set({ anyoneSpeaking: true, level: 1 });
    frame!(100);
    expect(duckTargets().at(-1)).toMatch(/target\(0\.45,/);
    voice.set({ anyoneSpeaking: false, level: 0 });
    frame!(300); // still within the hold
    expect(duckTargets().at(-1)).toMatch(/target\(0\.45,/);
    frame!(900);
    expect(duckTargets().at(-1)).toMatch(/target\(1,/);
    detach();
  });
});
