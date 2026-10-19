// v3 WP2 (v3-avatars) DEV ONLY: the avatar smoke page, loaded from the Vite dev server by avatarSmoke.mjs (never
// imported by the app, never in dist/). Builds Hollowmere, mounts the real avatar layer on a scripted
// Scene3dState with one player per v2 cast id (33) + the townsfolk (or, `opts`, a subset at another tier), and
// walks it through: all built (rig / billboard / stand-in), walking (programs before / after), a vote, talking
// (rim pixel check: luminance of each talker's box with the rim off / on), a door step + a Storyteller poof (the
// rig's motion stays at rest), every player dead and walking as a ghost, revival in place, night lanterns, a
// broken cast id (stand-in), destroy. Results on window.__avSmoke for the runner (and screenshots between phases).
import { inSquare, type Facing, type LocationId, type PlayerGameView, type PublicPlayerView } from '@ct/protocol';
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

export interface SmokeOptions {
  /** Engine + layer tier (default 'low'). 'high' = FX motes + smears, no LOD, the high light budget. */
  tier?: 'low' | 'high';
  /** Cast ids to field (default: all 33 + one unknown id). */
  ids?: string[];
  /** Cosmetic townsfolk (default true). */
  npcs?: boolean;
  /**
   * Cast ids (not among `ids`) that join one by one after everything else ran, at the camera target: each body must
   * be pre-compiled before its first drawn frame (that frame compiles no program). Use with a small `ids` set.
   */
  lateJoin?: string[];
}

export async function runAvatarSmoke(parent: HTMLElement, opts: SmokeOptions = {}): Promise<SmokeOut> {
  try {
    await run(parent, opts);
  } catch (e) {
    out.errors.push(`smoke threw: ${(e as Error)?.stack ?? e}`);
  }
  out.done = true;
  out.phase = 'done';
  return out;
}

async function run(parent: HTMLElement, opts: SmokeOptions): Promise<void> {
  const tier = opts.tier ?? 'low';
  const host = createEngineHost(parent, { tier, fpsLimit: 0 });
  const engine = host.engine;
  out.result.tier = tier;
  {
    const gl = engine.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.result.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }
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
  const layer = createAvatarLayer({ engine, tier, heightAt, lights, npcs: opts.npcs !== false });

  // 33 players: a 6-wide grid south of the dais, 28 px apart (the camera rests on it)
  const ids = opts.ids ?? [...CAST_IDS, 'no-such-cast'];
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
    tier,
    reducedMotion: false,
    hour: 12,
  };
  engine.camera.set({ target: new THREE.Vector3(C.x / 16, 0, C.y / 16), yaw: 0, pitch: Math.PI / 6, viewHeight: 12 });

  let t = 0;
  let npcsInSquare = 0;
  const dbg = layer.debug!();
  const list = () => (dbg.avatars3d as () => Record<string, unknown>[])();
  const frame = async (n = 1, move?: (i: number) => void, after?: () => void) => {
    for (let k = 0; k < n; k++) {
      t += 1 / 30;
      if (move) move(k);
      layer.update(state, t, 1 / 30);
      for (const n of (dbg.npcs as () => { x: number; y: number }[])()) if (inSquare(state.layout, n.x, n.y)) npcsInSquare++;
      host.renderNow(t);
      after?.(); // same task as the render: the drawing buffer is still readable
      await sleep(4); // let the compositor / screenshots in
    }
  };
  // mean luminance (0..255) of an avatar's screen box on the canvas, read right after a render
  const c2 = document.createElement('canvas');
  const g2 = c2.getContext('2d', { willReadFrequently: true })!;
  const lumaOf = (pid: string): number | null => {
    const b = layer.registry.debug(pid)?.screen;
    const cv = engine.renderer.domElement as HTMLCanvasElement;
    if (!b || b.w < 2 || b.h < 2) return null;
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const w = Math.max(1, Math.round(b.w * k));
    const h = Math.max(1, Math.round(b.h * k));
    c2.width = w;
    c2.height = h;
    g2.clearRect(0, 0, w, h);
    g2.drawImage(cv, (b.x - r.left) * k, (b.y - r.top) * k, w, h, 0, 0, w, h);
    const px = g2.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
    return sum / (px.length / 4);
  };
  const lookOf = (pid: string) => list().find((b) => b.key === pid)?.look as Record<string, unknown> | null | undefined;
  const frameOf = (pid: string) => String(list().find((b) => b.key === pid)?.frame ?? '');
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
  out.result.built = built.map((b) => ({ key: b.key, cast: b.cast, texture: b.texture, kind: b.kind, ghostMode: b.ghostMode, standin: b.standin, failed: b.failed, parked: b.parked, frame: b.frame }));
  out.result.warm = (dbg.avatarsWarm as () => unknown)();
  out.result.settled = layer.settled();
  out.result.selfAvatar = (dbg.avatar as (p: string) => unknown)('p0');
  out.result.programsAlive = host.info().programs;
  // program identities at 'alive': any later program is listed by name (which step compiled what)
  const progKeys = () => ((engine.renderer.info.programs ?? []) as { name?: string; cacheKey?: string }[]).map((p) => `${p.name ?? '?'}#${String(p.cacheKey ?? '').slice(-60)}`);
  const keysAlive = new Set(progKeys());
  const newPrograms = () => progKeys().filter((k) => !keysAlive.has(k));
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
      // '<frame>#<gait mode>' (rigs: the vendor gait mode, billboards: none)
      frames.get(b.key as string)!.add(`${String(b.frame)}#${String((b.look as { mode?: string } | null)?.mode ?? '')}`);
    }
  }
  out.result.walkFrames = Object.fromEntries([...frames].map(([k, v]) => [k, [...v].slice(0, 12)]));
  await frame(20, walk(0));
  out.result.programsWalk = host.info().programs;
  out.result.newProgramsWalk = newPrograms();
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

  // 3b. talking: the talk loop + the emissive rim on a few avatars (rig + billboard), uniforms only. Pixel check:
  // the same talk loop with the rim off (setTalking(pid, true, null)) and on; mean luminance of each box (crops
  // saved by the runner as rim-<pid>-off/on.png).
  const talkers = ['p1', 'p2', `p${ids.indexOf('brianbi')}`, `p${ids.indexOf('nicksong')}`].filter((p) => p !== 'p-1');
  // per talker: moved alone onto a clear spot in the camera's view (west of the walked group, where the grid stood
  // at the start: no roof or neighbour hides it; the camera never moves, so no new town programs compile), 3 frames
  // rim off then on, then back to its place
  const lumOff = new Map<string, number[]>();
  const lumOn = new Map<string, number[]>();
  const crops: Record<string, { off?: string; on?: string }> = {};
  const SPOT = { x: C.x - 60, y: C.y };
  for (const pid of talkers) {
    const p = pid === 'p0' ? me : remotes.get(pid);
    const home = p ? { x: p.x, y: p.y } : null;
    if (p) {
      p.x = SPOT.x;
      p.y = SPOT.y;
    }
    for (const [rim, into, tag] of [[null, lumOff, 'off'], [undefined, lumOn, 'on']] as const) {
      layer.setTalking(pid, true, rim);
      await frame(5);
      await frame(3, undefined, () => {
        const l = lumaOf(pid);
        if (l !== null) (into.get(pid) ?? into.set(pid, []).get(pid)!).push(l);
        (crops[pid] ??= {})[tag] = c2.toDataURL('image/png');
      });
    }
    if (p && home) {
      p.x = home.x;
      p.y = home.y;
    }
  }
  for (const pid of talkers) layer.setTalking(pid, true);
  await frame(6);
  const mean = (a: number[] | undefined) => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  out.result.rimLuma = talkers.map((pid) => {
    const off = mean(lumOff.get(pid));
    const on = mean(lumOn.get(pid));
    return { pid, kind: list().find((b) => b.key === pid)?.kind ?? null, off: off === null ? null : +off.toFixed(2), on: on === null ? null : +on.toFixed(2), delta: off === null || on === null ? null : +(on - off).toFixed(2) };
  });
  out.result.rimCrops = crops;
  out.result.talkLooks = list()
    .filter((b) => talkers.includes(b.key as string))
    .map((b) => ({ key: b.key, kind: b.kind, rim: (b.look as { rim?: number } | null)?.rim ?? null, frame: b.frame }));
  out.result.programsTalk = host.info().programs;
  out.result.newProgramsTalk = newPrograms();
  await shot('talking');
  for (const pid of talkers) layer.setTalking(pid, false);
  await frame(5);
  out.result.rimOff = list().filter((b) => talkers.includes(b.key as string)).every((b) => !(b.look as { rim?: number } | null)?.rim);

  // 3c. teleports: the own avatar through a door (outdoors -> bld:house-5 -> outdoors, an X jump of ≥ 200 m) and a
  // Storyteller poof of a remote (80 px): the vendor rig must stay at rest (no run, no lean, no velocity kick)
  const tele: { step: string; pid: string; frame: string; mode: unknown; run: unknown; lean: unknown; vel: unknown }[] = [];
  const probe = (step: string, pid: string) => {
    const l = lookOf(pid);
    tele.push({ step, pid, frame: frameOf(pid), mode: l?.mode ?? null, run: l?.run ?? null, lean: l?.lean ?? null, vel: l?.vel ?? null });
  };
  me.location = 'bld:house-5' as LocationId;
  await frame(2);
  probe('door-in+2', 'p0');
  await frame(3);
  probe('door-in+5', 'p0');
  me.location = 'outdoors';
  await frame(2);
  probe('door-out+2', 'p0');
  const p1 = remotes.get('p1');
  if (p1) {
    p1.x += 80;
    await frame(2);
    probe('poof+2', 'p1');
    p1.x -= 80;
    await frame(2);
    probe('poof-back+2', 'p1');
  }
  out.result.teleports = tele;
  await frame(10);

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
  out.result.ghostAnchors = ['p1', 'p2'].map((pid) => ({ pid, look: lookOf(pid), anchor: layer.registry.anchorOf(pid) }));
  out.result.programsGhost = host.info().programs;
  out.result.newProgramsGhost = newPrograms();
  out.result.glGhost = glErrors();
  await frame(10, walk(0));
  await shot('ghosts');

  // 5. revival in place (a rematch: every body stays, no anchor ever missing), then night lanterns
  const playerTextures = () => list().filter((b) => String(b.key).startsWith('p')).map((b) => `${b.key}=${b.texture}`).join(',');
  const texturesDead = playerTextures();
  players.forEach((p) => (p.alive = true));
  let anchorGaps = 0;
  const t1 = performance.now();
  for (let k = 0; k < 20; k++) {
    await frame(1);
    for (const b of list()) if (String(b.key).startsWith('p') && b.shown && !layer.registry.anchorOf(b.key as string)) anchorGaps++;
  }
  out.result.reviveMs = Math.round(performance.now() - t1);
  out.result.reviveAnchorGaps = anchorGaps;
  out.result.reviveSameBodies = playerTextures() === texturesDead && list().filter((b) => String(b.key).startsWith('p')).every((b) => !!b.texture && b.ghost === 'alive');
  state.hour = 23;
  await frame(10);
  out.result.leasesNight = leases;
  out.result.lanterns = list().filter((b) => b.lantern).map((b) => b.cast);
  out.result.programsRevived = host.info().programs;
  out.result.newProgramsRevived = newPrograms();
  state.hour = 12;
  await frame(5);
  out.result.leasesDay = leases;
  out.result.maxLeases = maxLeases;
  out.result.anchorsSeen = anchorsSeen;
  out.result.npcs = (dbg.npcs as () => unknown[])();
  out.result.npcsInSquare = npcsInSquare;
  out.result.scene = { holders: engine.scene.children.filter((c) => c.name.startsWith('avatar:')).length };

  // 5b. a late joiner (mid-game join / cast change): the pre-warm compiles its programs while it is still hidden,
  // so the frame that first draws it compiles nothing
  const lateJoin: Record<string, unknown>[] = [];
  for (const [li, lateId] of (opts.lateJoin ?? []).entries()) {
    const pid = `pLate${li}`;
    const before = host.info().programs;
    members.set(pid, { name: lateId, castId: lateId, seat: null, role: 'player' });
    remotes.set(pid, { pid, x: C.x + li * 40, y: C.y, location: 'outdoors', facing: 'down', moving: false });
    let pre = -1;
    let firstShowPre = -1;
    let firstShowPost = -1;
    let hiddenFrames = 0;
    const t2 = performance.now();
    while (firstShowPost < 0 && performance.now() - t2 < 120_000) {
      await frame(
        1,
        () => (pre = host.info().programs ?? -1),
        () => {
          const b = list().find((x) => x.key === pid);
          if (b?.texture && !b.shown) hiddenFrames++;
          if (b?.shown) {
            firstShowPre = pre;
            firstShowPost = host.info().programs ?? -1;
          }
        },
      );
    }
    const b = list().find((x) => x.key === pid);
    lateJoin.push({ id: lateId, texture: b?.texture ?? null, before, firstShowPre, firstShowPost, hiddenFrames, ms: Math.round(performance.now() - t2), warm: (dbg.avatarsWarm as () => unknown)() });
  }
  if (lateJoin.length) {
    out.result.lateJoin = lateJoin;
    await shot('late-join');
  }

  // 6. destroy
  const memBefore = { ...engine.renderer.info.memory };
  layer.destroy();
  await frame(3);
  out.result.memory = { before: memBefore, after: { ...engine.renderer.info.memory } };
  out.result.scene = { ...(out.result.scene as object), holdersAfter: engine.scene.children.filter((c) => c.name.startsWith('avatar:')).length };
  host.dispose();
  say('done');
}
