// v3 WP2 (v3-avatars) DEV ONLY: the avatar smoke page, loaded from the Vite dev server by avatarSmoke.mjs (never
// imported by the app, never in dist/). Builds Hollowmere, mounts the real avatar layer on a scripted
// Scene3dState with one player per v2 cast id (33) + the townsfolk, and walks it through: all built (rig /
// billboard / stand-in), walking, a vote, every player dead and walking as a ghost, night lanterns, a broken
// cast id (stand-in), destroy. Results on window.__avSmoke for the runner (and screenshots between phases).
import type { Facing, LocationId, PlayerGameView, PublicPlayerView } from '@ct/protocol';
import * as THREE from 'three';
import type { Pose, Scene3dState } from '../../contract';
import { createEngineHost } from '../../vendor/engineHost';
import { buildHollowmere, groundHeight } from '../../vendor/town';
import { CAST_IDS } from '../castMap';
import { createAvatarLayer } from '../layer';
import type { LightPool } from '../lanterns';

interface SmokeOut {
  phase: string;
  log: string[];
  errors: string[];
  result: Record<string, unknown>;
  done: boolean;
}

const out: SmokeOut = { phase: 'start', log: [], errors: [], result: {}, done: false };
(window as unknown as { __avSmoke: SmokeOut }).__avSmoke = out;
const say = (s: string) => out.log.push(`${Math.round(performance.now())} ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The runner screenshots while `phase` is a shot name, then sets __avSmokeGo. */
async function shot(name: string): Promise<void> {
  out.phase = `shot:${name}`;
  const w = window as unknown as { __avSmokeGo?: string };
  for (let i = 0; i < 600 && w.__avSmokeGo !== name; i++) await sleep(50);
}

export async function runAvatarSmoke(parent: HTMLElement): Promise<SmokeOut> {
  try {
    await run(parent);
  } catch (e) {
    out.errors.push(`smoke threw: ${(e as Error)?.stack ?? e}`);
  }
  out.done = true;
  out.phase = 'done';
  return out;
}

async function run(parent: HTMLElement): Promise<void> {
  const host = createEngineHost(parent, { tier: 'low', fpsLimit: 0 });
  const engine = host.engine;
  const town = await buildHollowmere(engine, { quality: 'low' });
  host.installRuntimeOpts();
  const heightAt = groundHeight(town);
  say('town built');

  // a lantern pool stand-in (WP3 owns the real one): counts leases, aims one existing PointLight
  let leases = 0;
  let maxLeases = 0;
  let anchorsSeen = 0;
  const lights: LightPool = {
    borrowLight(anchor) {
      leases++;
      maxLeases = Math.max(maxLeases, leases);
      anchorsSeen += anchor() ? 1 : 0;
      return { release: () => void leases-- };
    },
  };
  const layer = createAvatarLayer({ engine, tier: 'low', heightAt, lights, npcs: true });

  // 33 players: a 6-wide grid south of the dais, 28 px apart (the camera rests on it)
  const ids = [...CAST_IDS, 'no-such-cast'];
  const C = { x: 360, y: 430 };
  const posOf = (i: number) => ({ x: C.x + ((i % 6) - 2.5) * 46, y: C.y + (Math.floor(i / 6) - 2.5) * 38 });
  const members = new Map<string, { name: string; castId: string; seat: number | null; role: 'player' | 'storyteller' }>();
  const remotes = new Map<string, Pose>();
  ids.forEach((id, i) => {
    const pid = `p${i}`;
    members.set(pid, { name: id, castId: id, seat: id === 'storyteller' ? null : i % 15, role: id === 'storyteller' ? 'storyteller' : 'player' });
    const p = posOf(i);
    if (i > 0) remotes.set(pid, { pid, x: p.x, y: p.y, location: 'outdoors', facing: 'down', moving: false });
  });
  const me: Pose = { pid: 'p0', ...posOf(0), location: 'outdoors' as LocationId, facing: 'down' as Facing, moving: false };
  const players: PublicPlayerView[] = ids.map((_, i) => ({ pid: `p${i}`, seat: i, name: `p${i}`, alive: true, ghostVoteAvailable: true, nominatedToday: false, wasNominatedToday: false, connected: true }));
  const game = { kind: 'player', phase: 'day', dayNumber: 1, phaseEndsAt: null, players, you: { pid: 'p0', seat: 0, alive: true, ghostVoteAvailable: true, canNominate: true, role: null }, day: { nominationsOpen: true, nominations: [], onTheBlock: null, executedSeat: null }, prompts: [], info: [], announcements: [], storytellerVisitingYou: false, result: null } as unknown as PlayerGameView;
  const state: Scene3dState = {
    me,
    myPid: 'p0',
    amStoryteller: false,
    remotes,
    members,
    game,
    phase: 'day',
    layout: (await import('@ct/assets/hollowmere')).townLayoutV3,
    world: 'v3',
    tier: 'low',
    reducedMotion: false,
    hour: 12,
  };
  engine.camera.set({ target: new THREE.Vector3(C.x / 16, 0, C.y / 16), yaw: 0, pitch: Math.PI / 6, viewHeight: 12 });

  let t = 0;
  const dbg = layer.debug!();
  const list = () => (dbg.avatars3d as () => Record<string, unknown>[])();
  const frame = async (n = 1, move?: (i: number) => void) => {
    for (let k = 0; k < n; k++) {
      t += 1 / 30;
      if (move) move(k);
      layer.update(state, t, 1 / 30);
      host.renderNow(t);
      await sleep(4); // let the compositor / screenshots in
    }
  };
  const glErrors = () => {
    const gl = engine.renderer.getContext();
    const e = gl.getError();
    return e === gl.NO_ERROR ? null : e;
  };

  // 1. everything builds
  const t0 = performance.now();
  await frame(); // the first update creates the entries (settled() is trivially true before)
  const allBuilt = () => layer.settled() && list().every((b) => b.texture || b.failed);
  while (!allBuilt() && performance.now() - t0 < 300_000) await frame();
  await frame(10);
  const built = list();
  out.result.buildMs = Math.round(performance.now() - t0);
  out.result.built = built.map((b) => ({ key: b.key, cast: b.cast, texture: b.texture, kind: b.kind, ghostMode: b.ghostMode, standin: b.standin, failed: b.failed, frame: b.frame }));
  out.result.settled = layer.settled();
  out.result.selfAvatar = (dbg.avatar as (p: string) => unknown)('p0');
  out.result.programsAlive = host.info().programs;
  out.result.callsAlive = host.info().calls;
  out.result.glAlive = glErrors();
  out.result.anchor = layer.registry.anchorOf('p1');
  const a1 = layer.registry.anchorOf('p1');
  out.result.pickP1 = a1 ? layer.registry.pidAt(a1.headTopCss.x, a1.headTopCss.y + 8) : null;
  say(`built ${built.length} in ${out.result.buildMs} ms`);
  await shot('alive');

  // 2. walking east for 2 s: rig frames leave idle, billboards cycle 1..4
  const frames = new Map<string, Set<string>>();
  const walk = (dx: number) => () => {
    me.x += dx;
    me.moving = dx !== 0;
    for (const p of remotes.values()) {
      p.x += dx;
      p.moving = dx !== 0;
    }
  };
  for (let k = 0; k < 60; k++) {
    await frame(1, walk(2.5));
    for (const b of list()) {
      if (!frames.has(b.key as string)) frames.set(b.key as string, new Set());
      frames.get(b.key as string)!.add(String(b.frame));
    }
  }
  out.result.walkFrames = Object.fromEntries([...frames].map(([k, v]) => [k, [...v].slice(0, 6)]));
  await frame(20, walk(0));
  await shot('walking');

  // 3. a vote: hands up for the first 8 players
  game.day!.nominations.push({ id: 'n1', nominatorSeat: 1, nomineeSeat: 2, status: 'voting', votes: { 0: true, 1: true }, currentVoterSeat: 3, voteCount: 2, threshold: 9, handsRaised: [2, 3, 4, 5, 6, 7] });
  await frame(30);
  out.result.voteFrames = list().slice(0, 10).map((b) => `${b.cast}:${b.frame}`);
  await shot('vote');
  layer.fadeIn('p0');
  await frame(1);
  out.result.fadeStart = (list()[0]?.look as { fade?: number } | null)?.fade ?? null;
  await frame(6);
  out.result.fadeEnd = (list()[0]?.look as { fade?: number } | null)?.fade ?? null;
  game.day!.nominations[0]!.status = 'tallied';
  await frame(15);

  // 4. everybody dies (half with the ghost vote spent), then walks: every one must look like a ghost while walking
  players.forEach((p, i) => {
    p.alive = false;
    p.ghostVoteAvailable = i % 2 === 0;
  });
  await frame(60); // the 1.5 s collapse of everyone in view
  const ghostWalk = new Map<string, Set<string>>();
  for (let k = 0; k < 60; k++) {
    await frame(1, walk(-2.5));
    for (const b of list()) {
      if (!ghostWalk.has(b.key as string)) ghostWalk.set(b.key as string, new Set());
      ghostWalk.get(b.key as string)!.add(`${b.ghost}|${String(b.frame)}`);
    }
  }
  out.result.ghosts = list().map((b) => ({ key: b.key, cast: b.cast, ghostMode: b.ghostMode, ghost: b.ghost, kind: b.kind, look: b.look, frame: b.frame }));
  out.result.ghostWalk = Object.fromEntries([...ghostWalk].map(([k, v]) => [k, [...v].slice(0, 4)]));
  out.result.programsGhost = host.info().programs;
  out.result.glGhost = glErrors();
  await frame(10, walk(0));
  await shot('ghosts');

  // 5. night: lantern carriers borrow pool lights (alive again first: a rematch rebuilds 'clips' bodies)
  players.forEach((p) => (p.alive = true));
  await frame(2);
  const t1 = performance.now();
  while (!layer.settled() && performance.now() - t1 < 300_000) await frame();
  out.result.rebuildMs = Math.round(performance.now() - t1);
  await frame(20);
  state.hour = 23;
  await frame(10);
  out.result.leasesNight = leases;
  out.result.lanterns = list().filter((b) => b.lantern).map((b) => b.cast);
  out.result.programsRevived = host.info().programs;
  state.hour = 12;
  await frame(5);
  out.result.leasesDay = leases;
  out.result.maxLeases = maxLeases;
  out.result.anchorsSeen = anchorsSeen;
  out.result.npcs = (dbg.npcs as () => unknown[])();
  out.result.scene = { holders: engine.scene.children.filter((c) => c.name.startsWith('avatar:')).length };

  // 6. destroy
  const memBefore = { ...engine.renderer.info.memory };
  layer.destroy();
  await frame(3);
  out.result.memory = { before: memBefore, after: { ...engine.renderer.info.memory } };
  out.result.scene = { ...(out.result.scene as object), holdersAfter: engine.scene.children.filter((c) => c.name.startsWith('avatar:')).length };
  host.dispose();
  say('done');
}
