// v3 WP2 (v3-avatars). The avatar layer: every player (own + remote) and the cosmetic townsfolk, drawn as
// pixel3d rigs or v2-sprite billboards (docs/v3/INTEGRATION.md §3 rows "Own avatar", "Remote avatars", "Ghosts,
// deaths", "Phases ... raised hands", "Carried lanterns", "NPCs"; §4). Implements Layer3d + AvatarRegistry.
//
//   createAvatarLayer(svc) -> AvatarLayer        a LayerFactory (TownGame3d LAYERS) with optional extra services;
//                                                layer.registry is the AvatarRegistry (WP4 overlays, WP1 picks)
//
// Per frame (update, after net/ wrote Scene3dState):
//   1. sync entries with state.me / state.remotes / state.members (cast id changes rebuild the body);
//   2. start at most ONE build (queue.ts: own first, then by distance; one in flight); a failed rig falls back
//      to the tinted `wanderer` stand-in, then to a billboard (castMap.ts);
//   3. per entry: shown only in the viewer's location; feet = the pose px through coords.ts (no clamp); jumps
//      (> ST_JUMP_PX, location change, first placement) reset the track (no slide; WP4 draws the poof);
//      deaths (clips.ts stepDeath: 'die' held 1.5 s when seen) -> the ghost look of the body's GhostMode;
//      raised hands -> held 'vote'; lanterns at night borrow a pool light (lanterns.ts); low tier: LOD > 12 m;
//      body.update(t) only for shown bodies.
// Coordinates crossing the layer boundary are v2 px + LocationId (contract.ts); metres stay inside.
import { ST_JUMP_PX } from '../../game/rules/movement';
import type { Facing, LocationId } from '@ct/protocol';
import * as THREE from 'three';
import type { Anchor3d, AvatarDebug, AvatarRegistry, Layer3d, Pose, Px, Scene3dState, Tier, View3d } from '../contract';
import { preloadSpecs } from '../vendor/characters';
import type { AvatarBody } from './body';
import { createBillboardBody, hasBillboardArt, releaseBillboardSheets } from './billboard';
import { carriesLantern, castMap, fallbackCastId, STANDIN_SPEC, standinTint } from './castMap';
import { ghostLevel, newDeathState, raisedHands, resolveEmote, stepDeath, wantClips, type DeathState } from './clips';
import { syncLantern, lanternHour, type LanternSlot, type LightAnchorFn, type LightPool } from './lanterns';
import { createNpcFolk, DAYLIKE, npcHomesFor, type Npc, type NpcFolk } from './npcs';
import { fallbackView, pxToMetres } from './project';
import { nextBuild, type BuildCandidate } from './queue';
import { createRigBody } from './rigBody';
import { LOW_TIER_AMBIENCE } from '../../game/fx/tier';

/** Low tier: characters farther than this from the camera target skip the normal pass and cast no shadow (§4). */
export const LOD_FAR_M = 12;
/** A pid missing from `members` waits this long for its cast id before the pid-hash stand-in id is used. */
export const CAST_WAIT_MS = 2000;
/** Teleport cross-fade length (s). */
export const FADE_S = 0.12;

/** Structurally a TownGame3d Layer3dServices ({engine, bridge, tier}) plus the optional services WP2 can use. */
export interface AvatarServices {
  engine: unknown;
  tier: Tier;
  /** Town ground height (m) outdoors; interiors are flat at y = 0. Default: flat 0. */
  heightAt?: (X: number, Z: number) => number;
  /** WP1's view (anchors, picks). Default: a projection-only view over the engine camera (project.ts). */
  view?: View3d;
  /** WP3's constant light pool, for carried lanterns. Absent = lanterns stay dark. */
  lights?: LightPool | null;
  /** Draw the viewer's own avatar (default true). */
  self?: boolean;
  /** Cosmetic townsfolk (default true). */
  npcs?: boolean;
}

export interface AvatarLayer extends Layer3d {
  /** anchorOf / pidAt / debug(pid) over the drawn avatars (contract.ts AvatarRegistry). */
  readonly registry: AvatarRegistry;
  /** Play a game emote / safe clip on a player's avatar (clips.ts fallback chain); false if nothing plays. */
  playEmote(pid: string, name: string): boolean;
  /** Voice: hold the 'talk' loop while a player talks (living rigs with a talk clip only). */
  setTalking(pid: string, on: boolean): void;
  /** Resolves once the own avatar has a body (or could not get one), or the layer is destroyed. */
  selfReady(): Promise<void>;
  /** Whether every known player has a body or has definitively failed (warm-up / tests). */
  settled(): boolean;
  /**
   * Cross-fade an avatar in over FADE_S at its new spot (§3 "Own avatar": a teleport with reason ≠ 'correction';
   * wire to WP1 core.on('placed') for the own pid and to Storyteller poofs for remotes).
   */
  fadeIn(pid: string): void;
}

interface PoseLike {
  x: number;
  y: number;
  location: LocationId;
  facing: Facing;
  moving: boolean;
}

interface Entry {
  key: string;
  pid: string | null;
  npc: Npc | null;
  self: boolean;
  castId: string;
  firstSeen: number;
  body: AvatarBody | null;
  building: boolean;
  gen: number;
  failed: boolean;
  pose: PoseLike;
  /** last placement (px + location) for jump detection; null = next placement jumps */
  placed: { x: number; y: number; location: LocationId } | null;
  shown: boolean;
  death: DeathState;
  dead: boolean;
  ghostVote: boolean;
  /** what setGhost last applied: null = not yet */
  appliedGhost: string | null;
  lantern: LanternSlot;
  lanternAnchor: LightAnchorFn;
  carriesLantern: boolean;
  /** standin colour when the body is the tinted stand-in */
  tint: string | null;
  removed: boolean;
  /** an NPC that is not out right now (night, indoors viewer, beyond the low-tier count) */
  parked: boolean;
  /** build token while a build of this entry is in flight */
  token: number;
}

const FACE_YAW: Record<Facing, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

interface EngineLike {
  scene: THREE.Scene | null;
  camera: { cam: THREE.Camera; target: THREE.Vector3 } | null;
}

export function createAvatarLayer(svc: AvatarServices): AvatarLayer {
  const engine = svc.engine as EngineLike;
  const heightAt = svc.heightAt ?? (() => 0);
  /** Feet height: the town terrain outdoors; interiors (x ≥ 100 m, origins at 200 + 30 i) are flat. */
  const groundAt = (X: number, Z: number) => (X >= 100 ? 0 : heightAt(X, Z));
  const drawSelf = svc.self !== false;
  const lite = svc.tier === 'low';
  const entries = new Map<string, Entry>();
  const talking = new Set<string>();
  /** pid -> fade start (engine s); NaN = start on the next frame */
  const fades = new Map<string, number>();
  const raised = new Set<string>();
  const brianbis: { x: number; y: number }[] = [];
  let layoutRef: Scene3dState['layout'] | null = null;
  let view: (View3d & { frame?(): void }) | null = svc.view ?? null;
  let folk: NpcFolk | null = null;
  let folkWorld: string | null = null;
  /** token of the one build in flight (0 = none) */
  let inFlight = 0;
  let tokens = 0;
  let destroyed = false;
  let lastT = 0;
  let viewerLoc: LocationId = 'outdoors';
  let selfResolve: (() => void) | null = null;
  const selfP = new Promise<void>((r) => (selfResolve = r));
  const camQuat = new THREE.Quaternion();
  /** Scratch for lantern anchors (the pool copies it out at once). */
  const lanternAt = new THREE.Vector3();

  const doneSelf = () => {
    selfResolve?.();
    selfResolve = null;
  };

  const newEntry = (key: string, pid: string | null, npc: Npc | null, self: boolean, castId: string, pose: PoseLike): Entry => {
    const e: Entry = {
      key,
      pid,
      npc,
      self,
      castId,
      firstSeen: performance.now(),
      body: null,
      building: false,
      gen: 0,
      failed: false,
      pose: { ...pose },
      placed: null,
      shown: false,
      death: newDeathState(),
      dead: false,
      ghostVote: true,
      appliedGhost: null,
      lantern: { lease: null },
      lanternAnchor: () => (e.body && e.shown && e.body.lanternAnchor(lanternAt) ? lanternAt : null),
      carriesLantern: carriesLantern(castId),
      tint: null,
      removed: false,
      parked: false,
      token: 0,
    };
    return e;
  };

  const dropBody = (e: Entry) => {
    e.gen++; // an in-flight build for this entry is discarded when it lands
    if (e.building && e.token === inFlight) inFlight = 0; // the queue moves on at once
    e.building = false;
    if (e.lantern.lease) {
      e.lantern.lease.release();
      e.lantern.lease = null;
    }
    e.body?.dispose();
    e.body = null;
    e.appliedGhost = null;
    e.placed = null;
    e.tint = null;
  };

  // ------------------------------------------------------------------ builds
  type Attempt = { kind: 'rig'; spec: string; tint: string | null } | { kind: 'billboard'; id: string; tint: string | null };
  const attemptsFor = (e: Entry): Attempt[] => {
    const cm = castMap(e.castId);
    const pinTint = standinTint(e.pid ?? e.key);
    const standin: Attempt = { kind: 'rig', spec: STANDIN_SPEC, tint: pinTint };
    const out: Attempt[] = [];
    if (cm.spec) out.push({ kind: 'rig', spec: cm.spec, tint: null });
    if (cm.fallback === 'billboard' && hasBillboardArt(e.castId)) out.push({ kind: 'billboard', id: e.castId, tint: null });
    out.push(standin);
    if (cm.fallback !== 'billboard' && hasBillboardArt(e.castId)) out.push({ kind: 'billboard', id: e.castId, tint: null });
    return out;
  };

  const startBuild = (e: Entry) => {
    const token = ++tokens;
    inFlight = token;
    e.token = token;
    e.building = true;
    const gen = ++e.gen;
    const m = layoutRef ? pxToMetres(layoutRef, e.pose, e.pose.location) : null;
    const at = m ?? { X: 0, Z: 0 };
    const face = FACE_YAW[e.pose.facing] ?? 0;
    const attempts = attemptsFor(e);
    const run = async (): Promise<{ body: AvatarBody; tint: string | null } | null> => {
      for (const a of attempts) {
        try {
          if (a.kind === 'rig') {
            const body = await createRigBody(engine, a.spec, { x: at.X, z: at.Z, face, heightAt: groundAt, lite, tint: a.tint, lantern: e.carriesLantern });
            return { body, tint: a.tint };
          }
          const body = await createBillboardBody(engine as object, a.id, { heightAt: groundAt, tint: a.tint });
          return { body, tint: a.tint };
        } catch (err) {
          if (destroyed || e.removed || gen !== e.gen) return null;
          console.warn(`[avatars] ${a.kind} '${a.kind === 'rig' ? a.spec : a.id}' for cast '${e.castId}' failed:`, (err as Error)?.message ?? err);
        }
      }
      return null;
    };
    run()
      .then((r) => {
        if (destroyed || e.removed || gen !== e.gen) {
          r?.body.dispose();
          return;
        }
        e.building = false;
        if (!r) {
          e.failed = true;
          return;
        }
        e.body = r.body;
        e.tint = r.tint;
        e.placed = null;
        e.appliedGhost = null;
        r.body.holder.visible = false; // shown by the next update, once placed
        engine.scene?.add(r.body.holder);
      })
      .catch((err) => {
        e.building = false;
        e.failed = true;
        console.warn('[avatars] build failed', err);
      })
      .finally(() => {
        if (inFlight === token) inFlight = 0;
        if (e.self && (e.body || e.failed)) doneSelf();
      });
  };

  const pumpQueue = (me: Px | null) => {
    if (inFlight !== 0 || destroyed) return;
    const cands: (BuildCandidate & { e: Entry })[] = [];
    const now = performance.now();
    for (const e of entries.values()) {
      if (e.body || e.building || e.failed || e.removed || e.parked) continue;
      // a player without a cast id yet waits a little for the lobby view (no wrong first build)
      if (e.pid && !e.npc && e.castId === '' && now - e.firstSeen < CAST_WAIT_MS) continue;
      if (e.castId === '') e.castId = fallbackCastId(e.pid ?? e.key);
      const here = e.pose.location === viewerLoc;
      const dist = me && here ? Math.hypot(e.pose.x - me.x, e.pose.y - me.y) : Infinity;
      cands.push({ key: e.key, self: e.self, npc: !!e.npc, here, dist, e });
    }
    const next = nextBuild(cands);
    if (next) startBuild(next.e);
  };

  // ------------------------------------------------------------------ npcs
  const ensureFolk = (state: Scene3dState) => {
    if (svc.npcs === false || folkWorld === state.world) return;
    folkWorld = state.world;
    const layout = state.layout;
    npcHomesFor(state.world)
      .then((homes) => {
        if (destroyed || folkWorld !== state.world) return;
        folk = createNpcFolk(layout, state.world, homes);
        for (const n of folk.list) {
          const key = `npc:${n.id}`;
          if (!entries.has(key)) entries.set(key, newEntry(key, null, n, false, n.id, { x: n.x, y: n.y, location: 'outdoors', facing: 'down', moving: false }));
        }
      })
      .catch((err) => console.warn('[avatars] townsfolk unavailable', err));
  };

  // ------------------------------------------------------------------ per frame
  const upsertPlayer = (state: Scene3dState, pid: string, p: Pose, self: boolean, seen: Set<string>) => {
    seen.add(pid);
    const look = state.members.get(pid);
    const castId = look?.castId ?? '';
    let e = entries.get(pid);
    if (!e) {
      e = newEntry(pid, pid, null, self, castId, p);
      entries.set(pid, e);
      if (castId) preloadSpecs([castId]);
    } else if (castId && castId !== e.castId) {
      // a new character pick (or the cast id arriving after the pid-hash stand-in): rebuild
      const hadBody = !!e.body || e.building;
      e.castId = castId;
      e.carriesLantern = carriesLantern(castId);
      e.failed = false;
      if (hadBody) dropBody(e);
      preloadSpecs([castId]);
    }
    e.self = self;
    e.pose.x = p.x;
    e.pose.y = p.y;
    e.pose.location = p.location;
    e.pose.facing = p.facing;
    e.pose.moving = p.moving;
    if (look?.role === 'storyteller') e.carriesLantern = true;
  };

  const placeEntry = (e: Entry, t: number) => {
    const body = e.body!;
    const m = layoutRef ? pxToMetres(layoutRef, e.pose, e.pose.location) : null;
    if (!m) return false;
    const pl = e.placed;
    const jump = !pl || pl.location !== e.pose.location || Math.hypot(pl.x - e.pose.x, pl.y - e.pose.y) > ST_JUMP_PX;
    const face = e.pose.moving ? null : (FACE_YAW[e.pose.facing] ?? null);
    body.place(t, m.X, m.Z, face, e.pose.moving, jump);
    if (!pl) e.placed = { x: e.pose.x, y: e.pose.y, location: e.pose.location };
    else {
      pl.x = e.pose.x;
      pl.y = e.pose.y;
      pl.location = e.pose.location;
    }
    if (lite && engine.camera) {
      const dx = m.X - engine.camera.target.x;
      const dz = m.Z - engine.camera.target.z;
      body.setLod(e.pose.location === 'outdoors' && Math.hypot(dx, dz) > LOD_FAR_M);
    }
    return true;
  };

  const layer: AvatarLayer = {
    update(state, t, dt) {
      if (destroyed) return;
      lastT = t;
      layoutRef = state.layout;
      if (!view) view = fallbackView(engine, state.layout, () => heightAt);
      view.frame?.();
      viewerLoc = state.me?.location ?? 'outdoors';
      ensureFolk(state);

      // 1. players
      const seen = new Set<string>();
      if (drawSelf && state.me && state.myPid) upsertPlayer(state, state.myPid, state.me, true, seen);
      for (const [pid, p] of state.remotes) if (pid !== state.myPid) upsertPlayer(state, pid, p, false, seen);
      for (const e of [...entries.values()]) {
        if (e.npc || seen.has(e.key)) continue;
        e.removed = true;
        dropBody(e);
        entries.delete(e.key);
      }

      // 2. game state
      const pub = new Map<string, { alive: boolean; ghost: boolean }>();
      for (const p of state.game?.players ?? []) pub.set(p.pid, { alive: p.alive, ghost: p.ghostVoteAvailable });
      raisedHands(state.game, raised);
      const night = lanternHour(state.hour);
      const day = DAYLIKE.has(state.phase);

      // 3. townsfolk steering (only what this viewer sees outdoors)
      if (folk) {
        brianbis.length = 0;
        if (day && viewerLoc === 'outdoors')
          for (const e of entries.values()) if (!e.npc && e.castId === 'brianbi' && e.shown && e.pose.location === 'outdoors') brianbis.push(e.pose);
        const active = day && viewerLoc === 'outdoors' ? (lite ? LOW_TIER_AMBIENCE.townsfolk : folk.list.length) : 0;
        folk.step(dt, performance.now(), brianbis, active);
        folk.list.forEach((n, i) => {
          const e = entries.get(`npc:${n.id}`);
          if (!e) return;
          e.pose.x = n.x;
          e.pose.y = n.y;
          e.pose.moving = Math.hypot(n.dx, n.dy) > 0.01;
          // out only while active (never at night / for an indoor viewer / beyond the low-tier count)
          e.parked = i >= active;
        });
      }

      // 4. builds
      pumpQueue(state.me);

      // 5. bodies
      const cam = engine.camera?.cam;
      if (cam) camQuat.copy(cam.quaternion);
      const ctx = { still: state.reducedMotion, camQuat };
      for (const e of entries.values()) {
        const p = e.pid ? pub.get(e.pid) : undefined;
        e.dead = !!p && !p.alive;
        e.ghostVote = p ? p.ghost : true;
        const here = !e.parked && e.pose.location === viewerLoc;
        const body = e.body;
        const dying = stepDeath(e.death, e.dead, here && !!body && e.shown, !!body?.emotes.die, t);
        if (!body) {
          e.shown = false;
          continue;
        }
        // ghost look (after the collapse); a 'clips' body cannot leave its slide cleanly: revive = rebuild
        const ghostKey = e.dead && !dying ? `dead:${ghostLevel(e.ghostVote)}` : 'alive';
        if (ghostKey !== e.appliedGhost) {
          if (e.appliedGhost?.startsWith('dead') && ghostKey === 'alive' && body.ghostMode === 'clips') {
            dropBody(e);
            e.shown = false;
            continue;
          }
          body.setGhost(ghostKey !== 'alive', ghostLevel(e.ghostVote));
          e.appliedGhost = ghostKey;
        }
        const show = here && placeEntry(e, t);
        body.holder.visible = show;
        e.shown = show;
        syncLantern(e.lantern, svc.lights, show && night && e.carriesLantern, e.lanternAnchor);
        if (!show) continue;
        body.setClips(
          wantClips({
            dying,
            handUp: !!e.pid && raised.has(e.pid) && !dying,
            dead: e.dead,
            ghostMode: body.ghostMode,
            ghostVoteAvailable: e.ghostVote,
            talking: !!e.pid && talking.has(e.pid),
            clips: body.clipNames,
            emotes: body.emotes,
          }),
        );
        const f = e.pid ? fades.get(e.pid) : undefined;
        if (f !== undefined) {
          const start = Number.isNaN(f) ? t : f;
          if (Number.isNaN(f)) fades.set(e.pid!, t);
          const a = (t - start) / FADE_S;
          body.setFade(a);
          if (a >= 1) fades.delete(e.pid!);
        }
        body.update(t, dt, ctx);
      }
      if (drawSelf && !state.myPid) doneSelf();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const e of entries.values()) {
        e.removed = true;
        dropBody(e);
      }
      entries.clear();
      releaseBillboardSheets(engine as object);
      doneSelf();
    },

    debug() {
      return {
        avatar: (pid?: unknown) => (typeof pid === 'string' ? registry.debug(pid) : null),
        npcs: () =>
          [...entries.values()]
            .filter((e) => e.npc && e.shown)
            .map((e) => ({ id: e.npc!.id, x: e.npc!.x, y: e.npc!.y, home: { ...e.npc!.home }, avoiding: e.npc!.avoiding })),
        avatars3d: () =>
          [...entries.values()].map((e) => ({
            key: e.key,
            cast: e.castId,
            texture: e.body?.texture ?? null,
            kind: e.body?.kind ?? null,
            ghostMode: e.body?.ghostMode ?? null,
            standin: !!e.tint,
            shown: e.shown,
            dead: e.dead,
            ghost: e.appliedGhost,
            building: e.building,
            failed: e.failed,
            frame: e.body?.frame() ?? null,
            lantern: !!e.lantern.lease,
            look: e.body?.lookInfo?.() ?? null,
          })),
      };
    },

    registry: null as unknown as AvatarRegistry, // set below

    playEmote(pid, name) {
      const e = entries.get(pid);
      if (!e?.body || !e.shown) return false;
      const clip = resolveEmote({ emotes: e.body.emotes, emoteClips: e.body.emoteClips }, name);
      if (clip === 'idle') return false;
      return e.body.playOnce(clip, lastT);
    },

    fadeIn(pid) {
      fades.set(pid, NaN);
    },

    setTalking(pid, on) {
      if (on) talking.add(pid);
      else talking.delete(pid);
    },

    selfReady: () => selfP,

    settled() {
      for (const e of entries.values()) if (!e.npc && !e.body && !e.failed) return false;
      return true;
    },
  };

  const registry: AvatarRegistry & { isShown(pid: string): boolean } = {
    /** Drawn in the viewer's location this frame (has a body and is shown), regardless of the camera (WP4). */
    isShown(pid) {
      const e = entries.get(pid);
      return !!e && !e.npc && !!e.body && e.shown;
    },
    anchorOf(pid) {
      const e = entries.get(pid);
      if (!e || e.npc || !e.body || !e.shown || !view) return null;
      const h = e.body.heightM + e.body.hoverM;
      const head = view.worldToScreen(e.pose, e.pose.location, h);
      if (!head) return null;
      const a: Anchor3d = { feet: { x: e.pose.x, y: e.pose.y }, displayFeet: { x: e.pose.x, y: e.pose.y }, headTopCss: head, heightM: h };
      return a;
    },

    pidAt(cssX, cssY) {
      let best: string | null = null;
      let bestY = -Infinity;
      for (const e of entries.values()) {
        if (e.npc || !e.pid || !e.shown || !e.body) continue;
        const b = screenBox(e);
        if (!b) continue;
        if (cssX >= b.x && cssX <= b.x + b.w && cssY >= b.y && cssY <= b.y + b.h && e.pose.y > bestY) {
          best = e.pid;
          bestY = e.pose.y; // nearer the camera (south) wins at yaw 0
        }
      }
      return best;
    },

    debug(pid: string): AvatarDebug | null {
      const e = entries.get(pid);
      if (!e?.body) return null;
      const b = e.shown ? screenBox(e) : null;
      return {
        texture: e.body.texture,
        frame: e.body.frame(),
        width: e.body.widthM * 16,
        height: (e.body.heightM + e.body.hoverM) * 16,
        x: e.pose.x,
        y: e.pose.y,
        screen: b ?? { x: 0, y: 0, w: 0, h: 0 },
      };
    },
  };
  (layer as { registry: AvatarRegistry }).registry = registry;

  /** CSS box of an avatar (feet at the bottom centre, head top at the top). */
  const screenBox = (e: Entry): { x: number; y: number; w: number; h: number } | null => {
    if (!view || !e.body) return null;
    const feet = view.worldToScreen(e.pose, e.pose.location, e.body.hoverM);
    const head = view.worldToScreen(e.pose, e.pose.location, e.body.heightM + e.body.hoverM);
    if (!feet || !head) return null;
    const w = Math.max(4, e.body.widthM * 16 * view.cssPerPx());
    return { x: feet.x - w / 2, y: head.y, w, h: Math.max(4, feet.y - head.y) };
  };

  return layer;
}
