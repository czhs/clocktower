// v3 WP2: the avatar layer's orchestration with fake bodies (no WebGL): build queue (one in flight, own first),
// fallback chain (rig -> tinted stand-in -> billboard), location visibility, deaths -> ghost looks (a revived
// 'clips' ghost keeps its body), raised hands, cast changes (a discarded build keeps the queue busy), lanterns (none
// for ghosts), the shader pre-warm (hidden until compiled), selfReady's timeout, the AvatarRegistry and __ctCamera.
import type { LocationId, PlayerGameView, PublicPlayerView } from '@ct/protocol';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pose, Scene3dState, View3d } from '../../src/game3d/contract';
import type { AvatarBody } from '../../src/game3d/avatars/body';

interface FakeBody extends AvatarBody {
  log: string[];
  placed: { X: number; Z: number; jump: boolean } | null;
  ghost: { dead: boolean; level: number } | null;
  clips: { action: string | null; loop: string | null };
  disposed: boolean;
}
const made: { kind: string; id: string; tint: string | null; body: FakeBody }[] = [];
let failRigs = new Set<string>();
let failBillboards = new Set<string>();
const pending: (() => void)[] = [];
let deferBuilds = false;

function fakeBody(kind: 'rig' | 'billboard', id: string, ghostMode: AvatarBody['ghostMode']): FakeBody {
  const b: FakeBody = {
    kind,
    texture: kind === 'rig' ? `v3:${id}` : `v3-billboard:${id}`,
    specId: kind === 'rig' ? id : null,
    heightM: 1.25,
    widthM: 0.8,
    holder: new THREE.Group(),
    ghostMode,
    clipNames: kind === 'rig' ? ['idle', 'talk', 'vote', 'die', 'point', 'ghost', 'ghost-spent'] : [],
    emotes: kind === 'rig' ? { talk: 'talk', vote: 'vote', point: 'point', die: 'die', ghost: 'ghost' } : {},
    emoteClips: kind === 'rig' ? ['talk', 'vote', 'point', 'die', 'ghost'] : [],
    hoverM: 0,
    crownM: 0,
    log: [],
    placed: null,
    ghost: null,
    clips: { action: null, loop: null },
    disposed: false,
    place(_t, X, Z, _f, _m, jump) {
      b.placed = { X, Z, jump };
    },
    setGhost(dead, level) {
      b.ghost = { dead, level };
      b.log.push(`ghost:${dead}:${level}`);
    },
    setClips(w) {
      b.clips = w;
    },
    playOnce(clip) {
      b.log.push(`once:${clip}`);
      return true;
    },
    setLod() {},
    setRim(hex) {
      b.log.push(`rim:${hex}`);
    },
    setFade(a) {
      b.log.push(`fade:${a.toFixed(2)}`);
    },
    update() {},
    frame: () => `${id}|down|0`,
    lanternAnchor: (out) => (out.set(1, 1, 1), true),
    dispose() {
      b.disposed = true;
    },
  };
  return b;
}
const settle = <T,>(v: () => T) =>
  new Promise<T>((res, rej) => {
    const go = () => {
      try {
        res(v());
      } catch (e) {
        rej(e);
      }
    };
    if (deferBuilds) pending.push(go);
    else go();
  });

vi.mock('../../src/game3d/avatars/rigBody', () => ({
  TINT_HOVER_M: 0.15,
  createRigBody: (_e: unknown, spec: string, o: { tint: string | null }) =>
    settle(() => {
      if (failRigs.has(spec)) throw new Error(`rig ${spec} broken`);
      const body = fakeBody('rig', spec, spec === 'frog' ? 'clips' : spec === 'cilantro' ? 'shared' : 'tint');
      made.push({ kind: 'rig', id: spec, tint: o.tint, body });
      return body;
    }),
}));
vi.mock('../../src/game3d/avatars/billboard', () => ({
  hasBillboardArt: (id: string) => id !== 'no-art',
  releaseBillboardSheets: () => undefined,
  createBillboardBody: (_e: unknown, id: string, o: { tint: string | null }) =>
    settle(() => {
      if (failBillboards.has(id)) throw new Error(`billboard ${id} broken`);
      const body = fakeBody('billboard', id, 'tint');
      made.push({ kind: 'billboard', id, tint: o.tint, body });
      return body;
    }),
}));
const preloaded: string[] = [];
vi.mock('../../src/game3d/vendor/characters', () => ({ preloadSpecs: (ids: Iterable<string>) => void preloaded.push(...ids) }));

const { createAvatarLayer, preloadIdOf } = await import('../../src/game3d/avatars/layer');

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

const pose = (pid: string, x: number, y: number, location: LocationId = 'outdoors', moving = false): Pose => ({ pid, x, y, location, facing: 'down', moving });
const pub = (pid: string, seat: number, alive = true, ghost = true): PublicPlayerView => ({ pid, seat, name: pid, alive, ghostVoteAvailable: ghost, nominatedToday: false, wasNominatedToday: false, connected: true });

function makeState(): Scene3dState {
  return {
    me: pose('me', 360, 440),
    myPid: 'me',
    amStoryteller: false,
    remotes: new Map(),
    members: new Map([['me', { name: 'Me', castId: 'frog', seat: 0, role: 'player' as const }]]),
    game: null,
    phase: 'waiting',
    layout: townLayoutV3,
    world: 'v3',
    tier: 'high',
    reducedMotion: false,
    hour: 12,
  };
}
const view: View3d = {
  worldToScreen: (p, _loc, h = 0) => ({ x: p.x, y: p.y - h * 16 }),
  screenToWorld: () => null,
  cssPerPx: () => 1,
};
const engine = { scene: new THREE.Scene(), camera: { cam: new THREE.OrthographicCamera(), target: new THREE.Vector3(22, 0, 27) } };

beforeEach(() => {
  made.length = 0;
  failRigs = new Set();
  failBillboards = new Set();
  pending.length = 0;
  deferBuilds = false;
  preloaded.length = 0;
  engine.scene.clear();
});

const mk = (o: Record<string, unknown> = {}) => createAvatarLayer({ engine, tier: 'high', view, npcs: false, ...o });

describe('avatar layer', () => {
  it('builds the own avatar first, one at a time, and shows only the viewer’s location', async () => {
    deferBuilds = true;
    const L = mk();
    const s = makeState();
    (s.remotes as Map<string, Pose>).set('a', pose('a', 380, 440));
    (s.remotes as Map<string, Pose>).set('b', pose('b', 100, 100, 'bld:house-3'));
    (s.members as Map<string, unknown>).set('a', { name: 'A', castId: 'cilantro', seat: 1, role: 'player' });
    (s.members as Map<string, unknown>).set('b', { name: 'B', castId: 'owl', seat: 2, role: 'player' });
    L.update(s, 0, 1 / 60);
    L.update(s, 1 / 60, 1 / 60);
    expect(pending).toHaveLength(1); // one in flight
    pending.shift()!();
    await flush();
    expect(made.map((m) => m.id)).toEqual(['frog']);
    L.update(s, 2 / 60, 1 / 60);
    expect(made[0]!.body.placed).toEqual({ X: 360 / 16, Z: 440 / 16, jump: true }); // first placement: no slide
    pending.shift()!();
    await flush();
    L.update(s, 3 / 60, 1 / 60);
    pending.shift()!();
    await flush();
    expect(made.map((m) => m.id)).toEqual(['frog', 'cilantro', 'owl']); // here before elsewhere
    L.update(s, 4 / 60, 1 / 60);
    const by = (id: string) => made.find((m) => m.id === id)!.body;
    expect(by('frog').holder.visible).toBe(true);
    expect(by('cilantro').holder.visible).toBe(true);
    expect(by('owl').holder.visible).toBe(false); // in house-3, the viewer is outdoors
    expect(by('frog').placed).toEqual({ X: 360 / 16, Z: 440 / 16, jump: false });
    (s as { me: Pose }).me = pose('me', 360 + 60, 440); // a > 48 px jump (teleport): reset, no slide
    L.update(s, 5 / 60, 1 / 60);
    expect(by('frog').placed?.jump).toBe(true);
    await expect(L.selfReady()).resolves.toBeUndefined();
    expect(L.settled()).toBe(true);
    L.destroy();
    expect(made.every((m) => m.body.disposed)).toBe(true);
  });

  it('a broken rig falls back to the pin-tinted wanderer, then to a billboard; billboard ids draw flat', async () => {
    failRigs = new Set(['frog']);
    const L = mk();
    const s = makeState();
    (s.remotes as Map<string, Pose>).set('n', pose('n', 300, 440));
    (s.members as Map<string, unknown>).set('n', { name: 'N', castId: 'nicksong', seat: 1, role: 'player' });
    for (let i = 0; i < 4; i++) {
      L.update(s, i / 60, 1 / 60);
      await flush();
    }
    expect(made.map((m) => `${m.kind}:${m.id}`)).toEqual(['rig:wanderer', 'billboard:nicksong']);
    expect(made[0]!.tint).toMatch(/^#/);
    expect(L.registry.debug('n')?.texture).toBe('v3-billboard:nicksong');
    L.destroy();

    made.length = 0;
    failRigs = new Set(['frog', 'wanderer']);
    const L2 = mk();
    for (let i = 0; i < 3; i++) {
      L2.update(makeState(), i / 60, 1 / 60);
      await flush();
    }
    expect(made.map((m) => `${m.kind}:${m.id}`)).toEqual(['billboard:frog']);
    L2.destroy();
  });

  it('deaths: collapse when seen, then the ghost look; a revived clips ghost keeps its body and anchor', async () => {
    const L = mk();
    const s = makeState();
    const players = [pub('me', 0)];
    const game = { kind: 'player', phase: 'day', players, day: null } as unknown as PlayerGameView;
    s.game = game;
    s.phase = 'day';
    for (let i = 0; i < 3; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    const frog = made[0]!.body;
    expect(frog.ghost).toEqual({ dead: false, level: 1 });
    players[0] = pub('me', 0, false, true);
    L.update(s, 3, 1 / 60);
    expect(frog.clips).toEqual({ action: 'die', loop: null });
    expect(frog.ghost?.dead).toBe(false); // still collapsing
    L.update(s, 4.6, 1 / 60);
    expect(frog.ghost).toEqual({ dead: true, level: 1 });
    expect(frog.clips).toEqual({ action: null, loop: 'ghost' });
    players[0] = pub('me', 0, false, false);
    L.update(s, 5, 1 / 60);
    expect(frog.ghost).toEqual({ dead: true, level: 2 });
    expect(frog.clips.loop).toBe('ghost-spent');
    // revived (a rematch): the clips-mode body leaves its slide in place, no rebuild, never without an anchor
    players[0] = pub('me', 0, true, true);
    for (let i = 0; i < 4; i++) {
      L.update(s, 6 + i, 1 / 60);
      expect(L.registry.anchorOf('me')).not.toBeNull();
      await flush();
    }
    expect(frog.disposed).toBe(false);
    expect(made).toHaveLength(1);
    expect(frog.ghost).toEqual({ dead: false, level: 1 });
    expect(frog.clips).toEqual({ action: null, loop: null });
    L.destroy();
  });

  it('raised hands hold the vote clip; emotes resolve through the fallback chain', async () => {
    const L = mk();
    const s = makeState();
    s.phase = 'day';
    s.game = {
      kind: 'player',
      phase: 'day',
      players: [pub('me', 0), pub('x', 1)],
      day: { nominationsOpen: true, nominations: [{ id: 'n', nominatorSeat: 1, nomineeSeat: 1, status: 'voting', votes: {}, currentVoterSeat: 0, voteCount: 0, threshold: 1, handsRaised: [0] }], onTheBlock: null, executedSeat: null },
    } as unknown as PlayerGameView;
    for (let i = 0; i < 3; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    expect(made[0]!.body.clips).toEqual({ action: 'vote', loop: null });
    expect(L.playEmote('me', 'point')).toBe(true);
    expect(made[0]!.body.log).toContain('once:point');
    expect(L.playEmote('me', 'attack')).toBe(false);
    expect(L.playEmote('nobody', 'point')).toBe(false);
    L.fadeIn('me');
    L.update(s, 3, 1 / 60);
    L.update(s, 3.06, 1 / 60);
    L.update(s, 3.2, 1 / 60);
    expect(made[0]!.body.log.filter((x) => x.startsWith('fade:'))).toEqual(['fade:0.00', 'fade:0.50', 'fade:1.67']);
    L.setTalking('me', true);
    s.game = null;
    L.update(s, 4, 1 / 60);
    expect(made[0]!.body.clips).toEqual({ action: null, loop: 'talk' });
    L.destroy();
  });

  it('a changed cast id rebuilds; a departed player is disposed', async () => {
    const L = mk();
    const s = makeState();
    (s.remotes as Map<string, Pose>).set('a', pose('a', 380, 440));
    (s.members as Map<string, unknown>).set('a', { name: 'A', castId: 'owl', seat: 1, role: 'player' });
    for (let i = 0; i < 4; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    expect(made.map((m) => m.id)).toEqual(['frog', 'owl']);
    (s.members as Map<string, unknown>).set('a', { name: 'A', castId: 'goat', seat: 1, role: 'player' });
    for (let i = 0; i < 3; i++) {
      L.update(s, 5 + i, 1 / 60);
      await flush();
    }
    expect(made.map((m) => m.id)).toEqual(['frog', 'owl', 'goat']);
    expect(made[1]!.body.disposed).toBe(true);
    (s.remotes as Map<string, Pose>).delete('a');
    L.update(s, 9, 1 / 60);
    expect(made[2]!.body.disposed).toBe(true);
    expect(L.registry.anchorOf('a')).toBeNull();
    L.destroy();
  });

  it('registry: anchors, picks (nearest the camera wins), __ctCamera members', async () => {
    const L = mk();
    const s = makeState();
    (s.remotes as Map<string, Pose>).set('a', pose('a', 360, 450));
    (s.members as Map<string, unknown>).set('a', { name: 'A', castId: 'owl', seat: 1, role: 'player' });
    for (let i = 0; i < 4; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    const a = L.registry.anchorOf('me')!;
    expect(a.feet).toEqual({ x: 360, y: 440 });
    expect(a.headTopCss).toEqual({ x: 360, y: 440 - (1.25 + 0.1) * 16 }); // HEAD_PAD_M above the drawn head
    expect(a.heightM).toBeCloseTo(1.25);
    expect(L.registry.pidAt(360, 435)).toBe('a'); // both boxes overlap: 'a' stands further south
    expect(L.registry.pidAt(360, 425)).toBe('me'); // only the own box reaches up there
    expect(L.registry.pidAt(500, 500)).toBeNull();
    const dbg = L.debug!();
    expect((dbg.avatar as (p: string) => unknown)('me')).toMatchObject({ texture: 'v3:frog', x: 360, y: 440, width: 0.8 * 16, height: 1.25 * 16 });
    expect(dbg.npcs!()).toEqual([]);
    L.destroy();
  });

  it('talking: holds the talk loop and lights the rim (default / custom / none), uniforms only', async () => {
    const L = mk();
    const s = makeState();
    for (let i = 0; i < 3; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    const b = made.find((m) => m.id === 'frog')!.body;
    expect(b.log.filter((x) => x.startsWith('rim:'))).toEqual([]);
    L.setTalking('me', true);
    L.update(s, 4, 1 / 60);
    expect(b.clips.loop).toBe('talk');
    expect(b.log.at(-1)).toBe('rim:#ffe2a0');
    L.update(s, 5, 1 / 60);
    expect(b.log.filter((x) => x.startsWith('rim:')).length).toBe(1); // applied as a diff, not per frame
    L.setTalking('me', true, '#80c0ff');
    L.update(s, 6, 1 / 60);
    expect(b.log.at(-1)).toBe('rim:#80c0ff');
    L.setTalking('me', true, null); // clip only (talking outlines off)
    L.update(s, 7, 1 / 60);
    expect(b.log.at(-1)).toBe('rim:null');
    expect(b.clips.loop).toBe('talk');
    L.setTalking('me', true);
    L.update(s, 8, 1 / 60);
    L.setTalking('me', false);
    L.update(s, 9, 1 / 60);
    expect(b.log.at(-1)).toBe('rim:null');
    expect(b.clips.loop).toBeNull();
    L.destroy();
  });

  it('lanterns: the Storyteller borrows a pool light at night only, and releases it', async () => {
    let leases = 0;
    let released = 0;
    let anchored: unknown = null;
    const lights = {
      borrowLight: (anchor: () => { x: number; y: number; z: number } | null) => {
        leases++;
        anchored = anchor();
        return { release: () => void released++ };
      },
    };
    const L = mk({ lights });
    const s = makeState();
    (s.members as Map<string, unknown>).set('me', { name: 'ST', castId: 'storyteller', seat: null, role: 'storyteller' });
    for (let i = 0; i < 3; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    expect(leases).toBe(0);
    s.hour = 23;
    L.update(s, 4, 1 / 60);
    L.update(s, 5, 1 / 60);
    expect(leases).toBe(1);
    expect(anchored).toMatchObject({ x: 1, y: 1, z: 1 }); // the body's lantern socket (world m)
    expect(L.registry.isShown('me')).toBe(true);
    expect(L.registry.isShown('nobody')).toBe(false);
    s.hour = 9;
    L.update(s, 6, 1 / 60);
    expect(released).toBe(1);
    L.destroy();
  });

  it('lanterns: a dead moth (a ghost) releases its lease; a living one keeps it', async () => {
    let leases = 0;
    const lights = { borrowLight: () => (leases++, { release: () => void leases-- }) };
    const L = mk({ lights });
    const s = makeState();
    (s.members as Map<string, unknown>).set('me', { name: 'M', castId: 'moth', seat: 0, role: 'player' });
    const players = [pub('me', 0)];
    s.game = { kind: 'player', phase: 'night', players, day: null } as unknown as PlayerGameView;
    s.phase = 'night';
    s.hour = 23;
    for (let i = 0; i < 4; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    expect(leases).toBe(1);
    players[0] = pub('me', 0, false, true);
    L.update(s, 5, 1 / 60);
    expect(leases).toBe(0);
    players[0] = pub('me', 0, true, true);
    L.update(s, 6, 1 / 60);
    expect(leases).toBe(1);
    L.destroy();
    expect(leases).toBe(0);
  });

  it('a cast change during a build keeps the queue busy until the discarded build settles; preloads the mapped spec', async () => {
    deferBuilds = true;
    const L = mk();
    const s = makeState();
    (s.remotes as Map<string, Pose>).set('a', pose('a', 380, 440));
    (s.members as Map<string, unknown>).set('a', { name: 'A', castId: 'owl', seat: 1, role: 'player' });
    L.update(s, 0, 1 / 60);
    expect(pending).toHaveLength(1); // frog (own) in flight
    (s.members as Map<string, unknown>).set('me', { name: 'Me', castId: 'goat', seat: 0, role: 'player' });
    L.update(s, 1 / 60, 1 / 60); // the frog build is discarded ...
    L.update(s, 2 / 60, 1 / 60);
    expect(pending).toHaveLength(1); // ... but no second build starts beside it
    pending.shift()!();
    await flush();
    expect(made[0]!.body.disposed).toBe(true); // the discarded frog
    L.update(s, 3 / 60, 1 / 60);
    expect(pending).toHaveLength(1); // now the goat
    pending.shift()!();
    await flush();
    expect(made.map((m) => m.id)).toEqual(['frog', 'goat']);
    expect(preloaded).toEqual(['frog', 'owl', 'goat']);
    expect([preloadIdOf('brianbi'), preloadIdOf('nicksong'), preloadIdOf('no-such-cast'), preloadIdOf('fox')]).toEqual([null, null, 'wanderer', 'fox']);
    for (const f of pending.splice(0)) f();
    await flush();
    L.destroy();
  });

  it('a landed body is pre-compiled into a scratch render target and stays hidden until that resolves', async () => {
    let resolveCompile: (() => void) | null = null;
    const targets: unknown[] = [];
    let current: unknown = 'canvas';
    const renderer = {
      info: { programs: [] as unknown[] },
      getRenderTarget: () => current,
      setRenderTarget: (rt: unknown) => void (current = rt),
      compileAsync: (o: THREE.Object3D) => {
        targets.push(current);
        expect(o).toBeInstanceOf(THREE.Object3D);
        return new Promise<void>((r) => (resolveCompile = r));
      },
    };
    const eng = { ...engine, renderer };
    const L = createAvatarLayer({ engine: eng, tier: 'high', view, npcs: false });
    const s = makeState();
    for (let i = 0; i < 3; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    expect(made).toHaveLength(1);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBeInstanceOf(THREE.WebGLRenderTarget); // not the canvas
    expect(current).toBe('canvas'); // restored
    expect(made[0]!.body.holder.visible).toBe(false);
    expect(L.registry.anchorOf('me')).toBeNull();
    resolveCompile!();
    await flush();
    await flush();
    L.update(s, 3, 1 / 60);
    expect(made[0]!.body.holder.visible).toBe(true);
    expect(L.registry.anchorOf('me')).not.toBeNull();
    L.update(s, 4, 1 / 60);
    expect((L.debug!().avatarsWarm as () => Record<string, number>)()).toMatchObject({ builds: 1, compiled: 1, timedOut: 0, misses: 0, unchecked: 0 });
    L.destroy();
  });

  it('selfReady(timeout) gives up waiting for a stalled own build', async () => {
    deferBuilds = true;
    const L = mk();
    L.update(makeState(), 0, 1 / 60);
    let done = false;
    void L.selfReady(20).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 40));
    expect(done).toBe(true);
    for (const f of pending.splice(0)) f();
    await flush();
    L.destroy();
  });

  it('anchors include the ghost hover and the halo crown; the anchor object is reused', async () => {
    const L = mk();
    const s = makeState();
    for (let i = 0; i < 3; i++) {
      L.update(s, i, 1 / 60);
      await flush();
    }
    const b = made[0]!.body as { hoverM: number; crownM: number };
    const a1 = L.registry.anchorOf('me')!;
    const y1 = a1.headTopCss.y;
    Object.assign(b, { hoverM: 0.14, crownM: 0.12 });
    const a2 = L.registry.anchorOf('me')!;
    expect(a2).toBe(a1);
    expect(a2.headTopCss.y).toBeCloseTo(y1 - (0.14 + 0.12) * 16);
    expect(a2.heightM).toBeCloseTo(1.25 + 0.26);
    L.destroy();
  });
});
