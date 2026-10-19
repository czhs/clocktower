// v3 WP2 (v3-avatars; WP0 stub replaced). The typed wrapper over pixel3d's runtime characters
// (src/demo/characters.js createCharacter, src/demo/roster.js loadSpec, src/chars/character.js Character) and the
// two vendor pieces the billboards need (toon material, the COLOR_ONLY render layer). One of the only modules that
// import '@pixel3d/*' (apps/client/test/game3d/boundary.test.ts); everything in game3d/avatars goes through here.
//
// Rules (docs/v3/INTEGRATION.md §1.3 step 5, §4):
//   - always an explicit `ground` (the handle otherwise reads window.__demo); never listCharacters() (demo NPCs);
//   - the handle runs on its own clock (characters.js "LOCAL CLOCK"), ch.drive(fn) gets ENGINE time;
//   - locomotion comes only from the drive velocity (LegGait): we feed positions, never pick walk / run;
//   - spec.lights would add PointLights (light count -> program recompiles): suppressed, lanterns borrow a light
//     from the town's constant pool instead (WP3).
// CONTRACT-REQUEST(pixel3d): createCharacter({ lights: false }) instead of reaching into ch._lights (§9.2).
// CONTRACT-REQUEST(pixel3d): a public Character.teleport(pos, face) instead of resetMotion() reaching into ch._s (§9.2).
import * as THREE from 'three';
import { createCharacter, type Pixel3dCharacterHandle } from '@pixel3d/demo/characters.js';
// untyped vendor modules (pixel3d.d.ts '@pixel3d/*' wildcard): namespace imports, typed at the call sites
import * as roster from '@pixel3d/demo/roster.js';
import * as pipelineMod from '@pixel3d/core/PixelPipeline.js';
import * as toonMod from '@pixel3d/materials/toon.js';

const loadSpec = roster.loadSpec as (id: string) => Promise<{ spec: unknown }>;
const toonMaterial = toonMod.toonMaterial as (engine: unknown, opts: Record<string, unknown>) => THREE.Material;
const LAYERS = pipelineMod.LAYERS as { COLOR_ONLY?: number } | undefined;
import type { SpecCaps } from '../avatars/castMap';

export type CharacterHandle = Pixel3dCharacterHandle;

/** Render layer of objects that skip the normal (outline) pass; the sun's shadow camera does not see it either. */
export const COLOR_ONLY_LAYER: number = LAYERS?.COLOR_ONLY ?? 1;

// ------------------------------------------------------------------------------------ specs

interface VendorSpec {
  ghost?: boolean | { hover?: number; halo?: false | { lift?: number } } | null;
  clips?: Record<string, { loop?: boolean } | undefined>;
  height?: number;
  lights?: unknown[];
}

/** The capability probe of a loaded spec (castMap.ts ghostModeOf reads it). */
export function specCapsOf(spec: VendorSpec): SpecCaps {
  const g = spec.ghost && typeof spec.ghost === 'object' ? spec.ghost : null;
  return {
    ghost: !!spec.ghost,
    // rig.js ghostOpts defaults: hover 0, halo { lift 0.12 } unless halo: false
    ghostHover: spec.ghost ? Math.max(0, g?.hover ?? 0) : 0,
    ghostHalo: spec.ghost && g?.halo !== false ? Math.max(0, (g?.halo && typeof g.halo === 'object' ? g.halo.lift : undefined) ?? 0.12) : 0,
    clips: Object.keys(spec.clips ?? {}),
    ...(typeof spec.height === 'number' ? { height: spec.height } : {}),
    lights: Array.isArray(spec.lights) ? spec.lights.length : 0,
  };
}

/** Import a spec module (cached by the vendor) and probe it; rejects when it is missing or broken. */
export async function loadSpecCaps(id: string): Promise<SpecCaps> {
  const { spec } = (await loadSpec(id)) as { spec: VendorSpec };
  return specCapsOf(spec);
}

/** Start importing spec modules now (the lobby / the mount, before the town build). Never throws. */
export function preloadSpecs(ids: Iterable<string>): void {
  for (const id of new Set(ids)) loadSpec(id).catch(() => undefined);
}

// ------------------------------------------------------------------------------------ spawn

export interface SpawnOptions {
  /** Feet position (m); Y is taken from the ground. */
  x: number;
  z: number;
  /** pixel3d yaw (0 = facing +Z / south). */
  face?: number;
  heightAt(x: number, z: number): number;
  /** Low tier: no FX motes, no smears. */
  lite?: boolean;
}

/** Objects the vendor added to engine.scene for a handle (its FX motes / smear groups), for the shader pre-warm. */
const extras = new WeakMap<CharacterHandle, THREE.Object3D[]>();
export function extrasOf(h: CharacterHandle): readonly THREE.Object3D[] {
  return extras.get(h) ?? [];
}

/** Debug: rig builds and the synchronous part of the vendor's createCharacter (ms). */
export const spawnStats = { n: 0, last: 0, max: 0 };

export async function spawnCharacter(engine: unknown, id: string, o: SpawnOptions): Promise<CharacterHandle> {
  // FX points / smear groups go straight into engine.scene (fx.js / smear.js): diff the scene's children around the
  // build (one build in flight at a time, so nothing else of ours lands in between)
  const scene = (engine as { scene?: THREE.Scene | null }).scene ?? null;
  const before = scene ? new Set(scene.children) : null;
  await loadSpec(id); // the import first: `ms` below is then (almost only) the synchronous rig build
  const t0 = performance.now();
  const hp = createCharacter(engine, id, {
    position: new THREE.Vector3(o.x, o.heightAt(o.x, o.z), o.z),
    face: o.face ?? 0,
    ground: { heightAt: (x, z) => o.heightAt(x, z) },
    fx: !o.lite,
    smears: !o.lite,
  });
  const h = await hp;
  const syncMs = performance.now() - t0; // the import is cached: the rest is the synchronous build
  spawnStats.n++;
  spawnStats.last = +syncMs.toFixed(1);
  spawnStats.max = Math.max(spawnStats.max, spawnStats.last);
  if (scene && before) extras.set(h, scene.children.filter((c) => !before.has(c) && c !== h.root && !c.name.startsWith('avatar')));
  return h;
}

/** The Character inside a handle (the vendor runtime object; only the members we touch). */
/** The Character's fixed-step simulation state (character.js _resetSim; only what resetMotion touches). */
interface VendorSim {
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  prevVelF: THREE.Vector3;
  velF: { reset(x: THREE.Vector3): unknown; value: THREE.Vector3 };
  lean: { reset(x: THREE.Vector2): unknown; value: THREE.Vector2 };
  heading: number;
  desired: number;
  facingYaw: number;
}
interface VendorCharacter {
  _s?: VendorSim;
  gait?: { reset(pos: THREE.Vector3, yaw: number, ground: unknown): void } | null;
  opts?: { ground?: unknown };
  _chains?: { init: boolean; cached: boolean; links: { dir: unknown }[] }[];
  ghost?: number | null;
  state: { clip: string; frame: number | string; keyIndex?: number; facing?: number; facingYaw?: number; mode?: string; run?: boolean; speed?: number; action?: string | null };
  rig: { sockets?: Record<string, THREE.Object3D | undefined>; bones?: Record<string, THREE.Object3D | undefined>; height?: number };
  bones?: Record<string, THREE.Object3D | undefined>;
  spec: VendorSpec;
  _lights?: unknown[] | null;
}
const charOf = (h: CharacterHandle) => h.ch as unknown as VendorCharacter;

/**
 * Keep the Character from adding the spec's PointLights (created lazily on its first update, Character
 * _clockUniforms): a new light changes NUM_POINT_LIGHTS and recompiles every lit program. Call before the
 * first update.
 */
export function suppressSpecLights(h: CharacterHandle): void {
  const ch = charOf(h);
  if (!ch._lights) ch._lights = [];
}

/**
 * A teleport for the vendor Character's motion state: Character._step derives the velocity from the drive's
 * position difference, so a jump (a Storyteller poof of 48 px = 3 m in one 60 Hz step ≈ 180 m/s; a door into an
 * interior, X ≥ 200 m, ≈ 10 000 m/s) would kick the filtered velocity, the acceleration lean (up to 14°), the gait
 * (run / stride wheel) and the heading for a few steps. This puts the sim at rest at the new spot: prevPos = pos,
 * velocity / filtered velocity / lean zeroed, the gait's feet re-planted there, the secondary chains re-seeded.
 * No-op before the Character's first update (no sim yet). `yaw` (pixel3d, 0 = +Z) = the facing to keep, or null.
 */
export function resetMotion(h: CharacterHandle, x: number, z: number, yaw: number | null, heightAt: (x: number, z: number) => number): void {
  const ch = charOf(h);
  const s = ch._s;
  if (!s) return;
  const y = heightAt(x, z);
  s.prevPos.set(x, y, z);
  s.vel.set(0, 0, 0);
  s.prevVelF.set(0, 0, 0);
  s.velF.reset(ZERO3.set(0, 0, 0));
  s.lean.reset(ZERO2.set(0, 0));
  if (yaw !== null) {
    s.heading = yaw;
    s.desired = yaw;
  }
  ch.gait?.reset(new THREE.Vector3(x, y, z), s.facingYaw, ch.opts?.ground ?? null);
  for (const c of ch._chains ?? []) {
    c.init = false;
    c.cached = false;
    for (const L of c.links) L.dir = null;
  }
}
const ZERO3 = new THREE.Vector3();
const ZERO2 = new THREE.Vector2();

/** Debug: the sim's motion (smoke checks after a teleport): |lean| (degrees) and |velocity| (m/s). */
export function motionOf(h: CharacterHandle): { lean: number; vel: number } | null {
  const s = charOf(h)._s;
  return s ? { lean: +s.lean.value.length().toFixed(2), vel: +Math.hypot(s.vel.x, s.vel.z).toFixed(2) } : null;
}

/** A named socket (rig.sockets) or bone of the rig, or null. */
export function socketOf(h: CharacterHandle, ...names: string[]): THREE.Object3D | null {
  const ch = charOf(h);
  for (const n of names) {
    const s = ch.rig?.sockets?.[n] ?? ch.rig?.bones?.[n] ?? ch.bones?.[n];
    if (s) return s;
  }
  return null;
}

/** The vendor shared ghost level (spec.ghost only): 1 ghost, 2 spent, null = living. */
export function setGhostLevel(h: CharacterHandle, level: 1 | 2 | null): void {
  charOf(h).ghost = level;
}

/** Whether a clip of the handle's spec is a loop clip (loop clips replace idle until play('idle')). */
export function isLoopClip(h: CharacterHandle, name: string): boolean {
  return !!charOf(h).spec?.clips?.[name]?.loop;
}

export interface CharState {
  clip: string;
  /** Displayed key index (gait drawings: the stride bucket). */
  n: number;
  /** Displayed facing yaw (radians, 0 = +Z). */
  yaw: number;
  mode: string;
  /** The gait is in its run cycle. */
  run: boolean;
}
export function charState(h: CharacterHandle): CharState {
  const s = charOf(h).state;
  const n = typeof s.keyIndex === 'number' && s.keyIndex >= 0 ? s.keyIndex : Number(String(s.frame).split(/[:|]/).pop()) || 0;
  return { clip: s.clip ?? 'idle', n, yaw: s.facingYaw ?? 0, mode: s.mode ?? 'idle', run: !!s.run };
}

// ------------------------------------------------------------------------------------ drive

/**
 * Drive a handle along a recorded track. The Character samples drive(t) at its own fixed simulation
 * steps (and re-samples the past on a re-simulation), so the track keeps timed samples (ENGINE time) and
 * interpolates between them; facing and the gait (walk / run / idle) follow from the velocity (the
 * vendor's LegGait): we never pick a locomotion clip.
 */
export interface Track {
  /** Record the feet position (m) at engine time t (call once per frame, t increasing). */
  push(t: number, x: number, z: number): void;
  /** Forget the past (a teleport: no slide from the old spot). */
  reset(t: number, x: number, z: number): void;
}

/** WP0's simple form (the stub's own avatar in TownGame3d). */
export function driveAlong(h: CharacterHandle, heightAt: (x: number, z: number) => number, keepS = 2): Track {
  const d = createDriver(h, heightAt, keepS);
  return { push: (t, x, z) => d.push(t, x, z, null), reset: (t, x, z) => d.reset(t, x, z, null) };
}

export interface Driver {
  /** Record the feet (m) at engine time t; `face` = a yaw to hold while standing (null: follow the velocity). */
  push(t: number, x: number, z: number, face: number | null): void;
  /** Forget the past (teleports, location changes) and put the Character's motion at rest there (resetMotion). */
  reset(t: number, x: number, z: number, face: number | null): void;
  /**
   * Slide mode ('clips' ghosts): the Character stays where the slide started, so its gait never leaves idle
   * and the held loop clip shows, while the caller moves the handle's holder group by (feet − slideAnchor).
   */
  setSlide(on: boolean): void;
  readonly sliding: boolean;
  /** Where the Character itself stands while sliding (m), else null. */
  readonly slideAnchor: { x: number; z: number } | null;
}

export function createDriver(h: CharacterHandle, heightAt: (x: number, z: number) => number, keepS = 2): Driver {
  const ts: number[] = [];
  const xs: number[] = [];
  const zs: number[] = [];
  const fs: (number | null)[] = [];
  let anchor: { x: number; z: number } | null = null;
  // scratch results (the drive runs at every 60 Hz step; the vendor's _sample clones out.pos)
  const S = { x: 0, z: 0, face: null as number | null };
  const B = { x: 0, z: 0, face: null as number | null };
  const out: { pos: THREE.Vector3; face?: number } = { pos: new THREE.Vector3(), face: undefined };
  const sampleAt = (t: number, r: { x: number; z: number; face: number | null }) => {
    const n = ts.length;
    const set = (x: number, z: number, face: number | null) => {
      r.x = x;
      r.z = z;
      r.face = face;
      return r;
    };
    if (!n) return set(0, 0, null);
    if (t >= ts[n - 1]!) return set(xs[n - 1]!, zs[n - 1]!, fs[n - 1]!);
    if (t <= ts[0]!) return set(xs[0]!, zs[0]!, fs[0]!);
    for (let i = n - 1; i > 0; i--) {
      if (ts[i - 1]! <= t && t <= ts[i]!) {
        const k = ts[i] === ts[i - 1] ? 1 : (t - ts[i - 1]!) / (ts[i]! - ts[i - 1]!);
        return set(xs[i - 1]! + (xs[i]! - xs[i - 1]!) * k, zs[i - 1]! + (zs[i]! - zs[i - 1]!) * k, fs[i - 1]!);
      }
    }
    return set(xs[n - 1]!, zs[n - 1]!, fs[n - 1]!);
  };
  /** While sliding the Character stands still, so its facing would freeze: face the slide's motion instead. */
  let slideFace: number | null = null;
  h.ch.drive((t) => {
    const s = sampleAt(t, S);
    const p = anchor ?? s;
    out.pos.set(p.x, heightAt(p.x, p.z), p.z);
    out.face = undefined; // the vendor reads `d.face !== undefined`
    if (s.face !== null) out.face = s.face;
    else if (anchor) {
      const b = sampleAt(t - 0.1, B);
      const dx = s.x - b.x;
      const dz = s.z - b.z;
      if (dx * dx + dz * dz > 1e-6) slideFace = Math.atan2(dx, dz); // pixel3d yaw: 0 = +Z, +PI/2 = +X
      if (slideFace !== null) out.face = slideFace;
    }
    return out;
  });
  const push = (t: number, x: number, z: number, face: number | null) => {
    const n = ts.length;
    if (n && t <= ts[n - 1]!) {
      xs[n - 1] = x;
      zs[n - 1] = z;
      fs[n - 1] = face;
      return;
    }
    ts.push(t);
    xs.push(x);
    zs.push(z);
    fs.push(face);
    while (ts.length > 2 && ts[0]! < t - keepS) {
      ts.shift();
      xs.shift();
      zs.shift();
      fs.shift();
    }
  };
  return {
    push,
    reset(t, x, z, face) {
      ts.length = xs.length = zs.length = fs.length = 0;
      push(t, x, z, face);
      if (anchor) anchor = { x, z };
      // the Character itself jumps too (to the slide anchor while sliding): no velocity kick
      resetMotion(h, x, z, face, heightAt);
    },
    setSlide(on) {
      if (on === !!anchor) return;
      if (on) {
        const n = ts.length;
        anchor = n ? { x: xs[n - 1]!, z: zs[n - 1]! } : { x: 0, z: 0 };
      } else anchor = null;
      slideFace = null;
    },
    get sliding() {
      return !!anchor;
    },
    get slideAnchor() {
      return anchor;
    },
  };
}

// ------------------------------------------------------------------------------------ materials

export interface BillboardMaterialOptions {
  map: THREE.Texture;
  /** One program for every billboard (identical GLSL; uniforms stay per material). */
  programKey: string;
}

/**
 * A toon material for a flat sprite quad: textured albedo, alpha-tested, lit like up-facing ground (the town's
 * time-of-day ramp, cast shadows, lantern pools) so a billboard sits in the same light as the 3D cast. The
 * billboard mesh lives on COLOR_ONLY_LAYER (no normal / outline pass, no shadow).
 */
export function billboardMaterial(engine: unknown, o: BillboardMaterialOptions): THREE.Material {
  const mat = toonMaterial(engine, {
    map: o.map,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    outline: 'none',
    ramp: { hi: new THREE.Color(1, 1, 1), sh: new THREE.Color(0.62, 0.66, 0.82) },
    // lit as world-up (viewMatrix[1] = world +Y in view space): the sun's ramp, never the quad's own normal
    lightNormal: 'viewMatrix[1].xyz',
  }) as THREE.Material;
  mat.customProgramCacheKey = () => o.programKey;
  return mat;
}

/** A plain toon material (props: the stand-in's lantern), sharing one program per key. */
export function propMaterial(engine: unknown, color: THREE.ColorRepresentation, programKey: string): THREE.Material {
  const mat = toonMaterial(engine, { color }) as THREE.Material;
  mat.customProgramCacheKey = () => programKey;
  return mat;
}
