// v3 WP1 (v3-core). The 3D town's camera and its View3d (docs/v3/INTEGRATION.md §1.4, §1.5, §3 "Camera").
//
// Outdoors (fixed yaw 0, pitch 30°; Q2 default): rest on the square while the viewer is in it; outside it lean
// 0.85 from the square toward the viewer, smoothed 1 − e^(−5·dt), clamped to the town; the focus is snapped to
// the texel grid (PixelCamera.snapWorld). viewHeight comes from the vendor zoom ladder: 12 m (the gameplay preset)
// on a 16:9 screen, the next stop up when a narrow (portrait) screen would not show the whole square. During the
// nominations and a vote, on the square: the voting-circle frame (§9.1 user request 1: every seat + the tower dial,
// computed by the stage, world/voteFrame.ts, at its own yaw (0 / ±45°) and pitch (23°, portrait 30°); without a stage
// the old fixed shot, plaza centre at 19 m). Into / out of it the camera steps through TRANS_STEPS whole key poses
// over TRANS_S (the vendor votecam's stop-motion rule; reduced motion jumps). Keys stay screen-relative (`yaw()`).
// Inside: the room's dollhouse view (from the built interior when WP3 provides it, else from the §2.3 room).
//
// View3d: worldToScreen / screenToWorld / cssPerPx over coords.ts (the only projection maths) and input/pick.ts.
import * as THREE from 'three';
import { PLAZA } from '@ct/assets';
import { locationAt, type LocationId, type TownLayout } from '@ct/protocol';
import { cssToRay, houseOfLocation, interiorOrigin, INTERIOR_ROOMS, isTowerLocation, locToM, PX_PER_M, rayAtHeight, roomMapOf, ROOM_T, TOWER_ROOM, worldToCss, type ProjectionState } from '../coords';
import type { Px, View3d } from '../contract';
import { buildingOf, INTERIOR_FLOOR_Y, layoutProxies, pickScreen, type HouseProxy, type PickResult } from './pick';

/** pixel3d src/core/PixelCamera.js ZOOM_LADDER (vendor baseline; game3d/vendor may not be imported here). */
export const ZOOM_LADDER: readonly number[] = [5, 6, 7.5, 9, 10, 12, 15, 18, 22.5, 30, 45, 60, 90];
/** pixel3d town/api.js CAMERAS.gameplay.viewHeight. */
export const GAMEPLAY_VIEW_HEIGHT = 12;
/** pixel3d town/api.js CAMERAS.vote.viewHeight (target = the plaza centre). */
export const VOTE_VIEW_HEIGHT = 19;
export const PITCH = Math.PI / 6;
export const YAW = 0;
/** Outside the square the camera leans this far from the square toward the viewer (v2 updateCamera). */
export const LEAN = 0.85;
/** Smoothing rate (1/s): k = 1 − e^(−rate·dt). */
export const SMOOTH_RATE = 5;
/** The narrowest ground width (m) the outdoor view keeps visible: the whole square (r 9 m). */
export const MIN_VIEW_WIDTH_M = 18;
/** Never zoom out beyond this for the portrait fit. */
export const MAX_FIT_VIEW_HEIGHT = 45;

/** The smallest ladder stop ≥ v (the largest stop when none is). */
export function ladderCeil(v: number): number {
  for (const s of ZOOM_LADDER) if (s >= v - 1e-9) return s;
  return ZOOM_LADDER[ZOOM_LADDER.length - 1]!;
}

/** Outdoor viewHeight for a canvas aspect (w/h): the base stop, or the stop that keeps MIN_VIEW_WIDTH_M visible. */
export function fitViewHeight(aspect: number, base = GAMEPLAY_VIEW_HEIGHT): number {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9;
  return Math.min(MAX_FIT_VIEW_HEIGHT, ladderCeil(Math.max(base, MIN_VIEW_WIDTH_M / a)));
}

/** The square the camera rests on (world px, an ellipse): v2 PLAZA; Hollowmere's (townMapV3.plaza) is the same today. */
export interface Plaza {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface CameraShot {
  /** Ground focus (m). */
  X: number;
  Y: number;
  Z: number;
  viewHeight: number;
  /** radians; default YAW / PITCH */
  yaw?: number;
  pitch?: number;
}

/** Into / out of the vote frame: TRANS_STEPS whole key poses over TRANS_S (vendor votecam.js TRANS_S / TRANS_STEPS). */
export const TRANS_S = 0.75;
export const TRANS_STEPS = 4;
export type CameraMode = 'follow' | 'vote' | 'room';

export interface CameraGoalInput {
  layout: TownLayout;
  /** Default: @ct/assets PLAZA. */
  plaza?: Plaza;
  /** The viewer (px) once placed, else null (rest on the square). */
  me: { x: number; y: number; location: LocationId } | null;
  aspect: number;
  /** Nominations / a vote are on (net/core.ts voteCameraWanted): the vote framing applies on the square. */
  voting: boolean;
  /** The built interior's camera for the viewer's room (WP3), when known. */
  interior?: CameraShot | null;
  /** The stage's voting-circle frame (world/voteFrame.ts), when known; else the fixed plaza shot. */
  vote?: CameraShot | null;
}

/** On the square (the plaza ellipse × 1.08 around the feet - 8 px), or not placed yet. */
export function onSquare(me: CameraGoalInput['me'], pl: Plaza): boolean {
  return !me || Math.hypot((me.x - pl.cx) / pl.rx, (me.y - 8 - pl.cy) / pl.ry) <= 1.08;
}

/** Which camera applies: a room's, the vote frame (nominations / vote while on the square), or the follow camera. */
export function cameraMode(i: Pick<CameraGoalInput, 'me' | 'voting' | 'plaza'>): CameraMode {
  if (i.me && i.me.location !== 'outdoors') return 'room';
  return i.voting && onSquare(i.me, i.plaza ?? PLAZA) ? 'vote' : 'follow';
}

/** Where the camera wants to be this frame (pure; v2 TownScene.updateCamera in metres). */
export function cameraGoal(i: CameraGoalInput): CameraShot {
  const { layout } = i;
  const me = i.me;
  const pl = i.plaza ?? PLAZA;
  if (me && me.location !== 'outdoors') return i.interior ?? interiorShot(me.location, i.aspect) ?? restShot(pl, i.aspect);
  const restX = pl.cx / PX_PER_M;
  const restZ = pl.cy / PX_PER_M;
  const inSq = !!me && onSquare(me, pl);
  if (i.voting && (inSq || !me)) return i.vote ?? { X: restX, Y: 0, Z: restZ, viewHeight: Math.max(VOTE_VIEW_HEIGHT, fitViewHeight(i.aspect)) };
  const vh = fitViewHeight(i.aspect);
  let X = restX;
  let Z = restZ;
  if (me && !inSq) {
    X += (me.x / PX_PER_M - X) * LEAN;
    Z += ((me.y - 10) / PX_PER_M - Z) * LEAN;
  }
  // clamp to the town: half the visible width, and the ground depth (viewHeight / sin(pitch) / 2 = viewHeight)
  const tb = layout.townBounds;
  const k = layout.tileSize / PX_PER_M;
  const x0 = tb.x * k;
  const w = tb.w * k;
  const z0 = tb.y * k;
  const h = tb.h * k;
  const halfW = (vh * (i.aspect > 0 ? i.aspect : 16 / 9)) / 2;
  const halfD = vh / Math.sin(PITCH) / 2;
  const clamp = (c: number, lo: number, size: number, half: number) => (size <= half * 2 ? lo + size / 2 : Math.min(lo + size - half, Math.max(lo + half, c)));
  return { X: clamp(X, x0, w, halfW), Y: 0, Z: clamp(Z, z0, h, halfD), viewHeight: vh };
}

function restShot(pl: Plaza, aspect: number): CameraShot {
  return { X: pl.cx / PX_PER_M, Y: 0, Z: pl.cy / PX_PER_M, viewHeight: fitViewHeight(aspect) };
}

/**
 * The dollhouse view of house i's room without the built interior: centred a little behind the floor centre,
 * high enough for the back wall top and wide enough for the room (pixel3d interiors/index.js camera rule,
 * aspect-aware).
 */
export function interiorShot(loc: LocationId, aspect: number): CameraShot | null {
  // the clock tower's room before it is built: the vendor's framing (tower-interior.js camera: 3.4 m behind the
  // room's origin, viewHeight 8.2)
  if (isTowerLocation(loc)) return { X: TOWER_ROOM.origin.X, Y: 0, Z: TOWER_ROOM.origin.Z - 3.4, viewHeight: 8.2 };
  const i = houseOfLocation(loc);
  const dims = i === null ? undefined : INTERIOR_ROOMS[i];
  if (i === null || !dims) return null;
  const o = interiorOrigin(i);
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9;
  const wallH = 2.6;
  // screen height of the room at pitch 30°: floor depth · sin + wall height · cos (+ margin)
  const tall = (dims.d * Math.sin(PITCH) + wallH * Math.cos(PITCH) + 0.6) * 1.1;
  const wide = ((dims.w + 2 * ROOM_T + 0.6) / a) * 1.04;
  return { X: o.X, Y: 0, Z: o.Z - 0.6, viewHeight: Math.max(tall, wide) };
}

/** What the rig needs from the engine host (vendor/engineHost.ts EngineHost satisfies it). */
export interface RigHost {
  engine: {
    width: number;
    height: number;
    pixelScale: number;
    camera: {
      set(o: { target?: THREE.Vector3; yaw?: number; pitch?: number; viewHeight?: number }): void;
      readonly texelWorld: number;
      snapWorld?(p: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3;
    };
  };
  projection(): ProjectionState;
}

export interface RigScene {
  host: RigHost;
  heightAt(X: number, Z: number): number;
  /** Room floor height (m) at a world point (the clock tower's stair / landing); default flat INTERIOR_FLOOR_Y. */
  floorAt?(X: number, Z: number): number;
  /** House pick proxies (WP3: oriented boxes from the drawn town); default = layout footprints. */
  proxies?: readonly HouseProxy[];
  /** The built interior's camera (WP3), when that room is built. */
  interiorCamera?(location: LocationId): CameraShot | null;
  /** That room is still being built (WP3 stage.interiorPending); absent = assume it is while interiorCamera is null. */
  interiorPending?(location: LocationId): boolean;
  /** The voting-circle frame for a canvas of lowW x lowH texels at pixelScale (WP3 stage.voteCamera). */
  voteCamera?(lowW: number, lowH: number, pixelScale: number): CameraShot | null;
}

export interface CameraFrameInput {
  me: { x: number; y: number; location: LocationId } | null;
  voting: boolean;
  /** Jump to the goal (teleport, location change, first frame). */
  snap: boolean;
  /** Reduced motion: no stepped transitions (jump). */
  still?: boolean;
}

/** A camera pose (ground focus m, viewHeight, yaw / pitch radians). */
export interface CameraPose {
  X: number;
  Y: number;
  Z: number;
  viewHeight: number;
  yaw: number;
  pitch: number;
}

/**
 * Screen-relative keys under a turned camera: the held key vector (screen px directions, y down) as a world px
 * direction for a camera at `yaw` (screen right = (cos, -sin), screen down = (sin, cos) on the ground). Writes `out`.
 */
export function turnKeys(kv: { vx: number; vy: number }, yaw: number, out: { vx: number; vy: number }): { vx: number; vy: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.vx = kv.vx * c + kv.vy * s;
  out.vy = -kv.vx * s + kv.vy * c;
  return out;
}

const easeInOutSine = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2;
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The stepped pose `u` (0..1) of the way from `a` to `b` (vendor votecam.js stepPose): TRANS_STEPS whole key poses on
 * an inOutSine spacing, the first one at once; the yaw turns the short way; u >= 1 is exactly `b`. Writes into `out`.
 */
export function steppedPose(a: CameraPose, b: CameraPose, u: number, out: CameraPose): CameraPose {
  const k = Math.min(TRANS_STEPS, Math.floor(Math.max(0, u) * TRANS_STEPS) + 1);
  const e = u >= 1 ? 1 : easeInOutSine(k / (TRANS_STEPS + 1));
  out.X = a.X + (b.X - a.X) * e;
  out.Y = a.Y + (b.Y - a.Y) * e;
  out.Z = a.Z + (b.Z - a.Z) * e;
  out.viewHeight = a.viewHeight + (b.viewHeight - a.viewHeight) * e;
  out.yaw = u >= 1 ? b.yaw : a.yaw + wrapPi(b.yaw - a.yaw) * e;
  out.pitch = u >= 1 ? b.pitch : a.pitch + (b.pitch - a.pitch) * e;
  return out;
}

export class CameraRig implements View3d {
  private scene: RigScene | null = null;
  private proxies: readonly HouseProxy[];
  private readonly focus = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  /** Reused camera.set arguments (PixelCamera.set copies them): no per-frame literals. */
  private readonly lens: { yaw: number; pitch: number; viewHeight: number } = { yaw: YAW, pitch: PITCH, viewHeight: GAMEPLAY_VIEW_HEIGHT };
  private readonly aim: { target: THREE.Vector3 } = { target: this.tmp };
  private init = false;
  private shown: LocationId = 'outdoors';
  private vh = GAMEPLAY_VIEW_HEIGHT;
  private curYaw = YAW;
  private curPitch = PITCH;
  private mode: CameraMode = 'follow';
  /** rig clock (s, the sum of dt) for the stepped transitions */
  private clock = 0;
  private trans: { t0: number; from: CameraPose } | null = null;
  private lastGoalKey = '';
  private readonly goalPose: CameraPose = { X: 0, Y: 0, Z: 0, viewHeight: GAMEPLAY_VIEW_HEIGHT, yaw: YAW, pitch: PITCH };
  private readonly pose: CameraPose = { X: 0, Y: 0, Z: 0, viewHeight: GAMEPLAY_VIEW_HEIGHT, yaw: YAW, pitch: PITCH };
  /** A debug / harness camera override (__ctCamera.setCamera), shown instead of the goal while set. */
  private override: CameraShot | null = null;

  constructor(
    private readonly layout: TownLayout,
    private readonly plaza: Plaza = PLAZA,
  ) {
    this.proxies = layoutProxies(layout);
  }

  /** A (re)built engine: the next frame snaps. */
  attach(scene: RigScene): void {
    this.scene = scene;
    this.proxies = scene.proxies?.length ? scene.proxies : layoutProxies(this.layout);
    this.init = false;
  }
  detach(): void {
    this.scene = null;
  }
  get attached(): boolean {
    return !!this.scene;
  }

  /** The location the camera shows. */
  location(): LocationId {
    return this.shown;
  }
  /** The current focus (m), viewHeight, yaw and pitch. */
  shot(): CameraShot {
    return { X: this.focus.x, Y: this.focus.y, Z: this.focus.z, viewHeight: this.vh, yaw: this.curYaw, pitch: this.curPitch };
  }
  /** The camera's current yaw (radians): keys move screen-relative (net/core.ts rotates the key vector by it). */
  yaw(): number {
    return this.curYaw;
  }
  /** Which camera applies now ('vote' while the voting-circle frame is up). */
  cameraMode(): CameraMode {
    return this.mode;
  }
  /** Hold the camera on this shot (harness stills; null = back to the game camera, snapped). */
  setOverride(shot: CameraShot | null): void {
    this.override = shot ? { ...shot } : null;
    this.init = false;
  }
  /** A stepped transition is running (debug). */
  get transitioning(): boolean {
    return !!this.trans;
  }

  /** Once per frame before the render. */
  step(dt: number, f: CameraFrameInput): void {
    const s = this.scene;
    if (!s) return;
    const e = s.host.engine;
    const aspect = e.height > 0 ? e.width / e.height : 16 / 9;
    const loc = f.me?.location ?? 'outdoors';
    this.clock += Math.max(0, dt);
    const mode = cameraMode({ me: f.me, voting: f.voting, plaza: this.plaza });
    const interior = mode === 'room' ? (s.interiorCamera?.(loc) ?? null) : null;
    // a room that is still being built (the stage keeps the old place drawn): hold the camera where it is, so the
    // view never flies to an empty void for those frames; the shown location switches when the room is drawn
    // ... but only while it IS being built: a failed build (e.g. the tower room's coords guard) falls through to
    // cameraGoal's own interior framing instead of freezing on the outdoor pose for the whole visit
    if (mode === 'room' && s.interiorCamera && !interior && this.init && !this.override && loc !== this.shown && (s.interiorPending?.(loc) ?? true)) return;
    let vote: CameraShot | null = null;
    if (mode === 'vote' && s.voteCamera) {
      const ps = e.pixelScale > 0 ? e.pixelScale : 1;
      vote = s.voteCamera(Math.ceil(e.width / ps), Math.ceil(e.height / ps), ps);
    }
    const g = this.override ?? cameraGoal({ layout: this.layout, plaza: this.plaza, me: f.me, aspect, voting: f.voting, interior, vote });
    const gp = this.goalPose;
    gp.X = g.X;
    gp.Y = g.Y;
    gp.Z = g.Z;
    gp.viewHeight = g.viewHeight;
    gp.yaw = g.yaw ?? YAW;
    gp.pitch = g.pitch ?? PITCH;
    const jump = f.snap || !this.init || dt <= 0 || loc !== this.shown || !!this.override;
    const modeChanged = mode !== this.mode;
    // the vote frame itself changed (resize, the dial / seats re-fitted): step to it like a transition
    const goalKey = mode === 'vote' ? `${gp.X.toFixed(2)}|${gp.Z.toFixed(2)}|${gp.viewHeight.toFixed(2)}|${gp.yaw.toFixed(3)}|${gp.pitch.toFixed(3)}` : '';
    const reframed = mode === 'vote' && !modeChanged && goalKey !== this.lastGoalKey && this.lastGoalKey !== '';
    this.lastGoalKey = goalKey;
    this.shown = loc;
    const p = this.pose;
    if (jump || f.still) {
      this.trans = null;
      Object.assign(p, gp);
    } else {
      // into / out of the vote frame (or a re-fit of it): whole key poses, never a glide
      if ((modeChanged && (mode === 'vote' || this.mode === 'vote')) || reframed) this.trans = { t0: this.clock, from: { ...p } };
      if (this.trans) {
        const u = (this.clock - this.trans.t0) / TRANS_S;
        steppedPose(this.trans.from, gp, u, p);
        if (u >= 1) this.trans = null;
      } else if (mode === 'vote') Object.assign(p, gp);
      else {
        // follow / room: smoothed focus, the goal's lens
        const k = 1 - Math.exp(-dt * SMOOTH_RATE);
        p.X += (gp.X - p.X) * k;
        p.Y += (gp.Y - p.Y) * k;
        p.Z += (gp.Z - p.Z) * k;
        p.viewHeight = gp.viewHeight; // ladder stops: a jump, never a continuous crawl
        p.yaw = gp.yaw;
        p.pitch = gp.pitch;
      }
    }
    this.mode = mode;
    this.init = true;
    this.focus.set(p.X, p.Y, p.Z);
    this.vh = p.viewHeight;
    this.curYaw = p.yaw;
    this.curPitch = p.pitch;
    this.lens.viewHeight = p.viewHeight;
    this.lens.yaw = p.yaw;
    this.lens.pitch = p.pitch;
    e.camera.set(this.lens); // first: the snap grid depends on yaw / pitch / viewHeight
    this.aim.target = e.camera.snapWorld ? e.camera.snapWorld(this.focus, this.tmp) : this.tmp.copy(this.focus);
    e.camera.set(this.aim);
  }

  // ------------------------------------------------------------------ View3d
  worldToScreen(p: Px, location: LocationId, heightM = 0): { x: number; y: number } | null {
    if (!this.scene || location !== this.shown) return null;
    const c = this.project(p, location, heightM);
    if (!c) return null;
    const pr = this.scene.host.projection();
    const w = pr.lowW * pr.scale;
    if (c.x < pr.rect.left || c.y < pr.rect.top || c.x > pr.rect.left + w || c.y > pr.rect.top + pr.height) return null;
    return c;
  }

  /** worldToScreen without the location / on-canvas checks (debug hook; px in any mapped location). */
  project(p: Px, location: LocationId = locationAt(this.layout, p.x, p.y), heightM = 0): { x: number; y: number } | null {
    const s = this.scene;
    if (!s) return null;
    const room = buildingOf(this.layout, location)?.interior;
    const m = locToM(p, location, room);
    if (!m) return null;
    const Y = (location === 'outdoors' ? s.heightAt(m.X, m.Z) : (s.floorAt?.(m.X, m.Z) ?? INTERIOR_FLOOR_Y)) + heightM;
    return worldToCss(s.host.projection(), m.X, Y, m.Z);
  }

  screenToWorld(cssX: number, cssY: number): PickResult | null {
    const s = this.scene;
    if (!s) return null;
    return pickScreen(s.host.projection(), { layout: this.layout, heightAt: s.heightAt, proxies: this.proxies, shown: this.shown, ...(s.floorAt ? { floorAt: s.floorAt } : {}) }, cssX, cssY);
  }

  /**
   * __ctCamera.view(): the px AABB of the ground (or room floor) under the canvas corners, in the shown location's
   * px (interiors: the band room's px), and zoom = cssPerPx().
   */
  footprint(): { x: number; y: number; width: number; height: number; zoom: number } | null {
    const s = this.scene;
    if (!s) return null;
    const pr = s.host.projection();
    const w = pr.lowW * pr.scale;
    const xs: number[] = [];
    const ys: number[] = [];
    const room = buildingOf(this.layout, this.shown);
    for (const [cx, cy] of [
      [pr.rect.left, pr.rect.top],
      [pr.rect.left + w, pr.rect.top],
      [pr.rect.left, pr.rect.top + pr.height],
      [pr.rect.left + w, pr.rect.top + pr.height],
    ] as const) {
      const ray = cssToRay(pr, cx, cy);
      const hit = ray ? rayAtHeight(ray, this.shown === 'outdoors' ? 0 : INTERIOR_FLOOR_Y) : null;
      if (!hit) continue;
      let p = { x: hit.X * PX_PER_M, y: hit.Z * PX_PER_M };
      if (this.shown !== 'outdoors' && room) {
        try {
          p = roomMapOf(this.shown, room.interior)?.toPx(hit) ?? p;
        } catch {
          /* no 3D interior: metres as px */
        }
      }
      xs.push(p.x);
      ys.push(p.y);
    }
    if (!xs.length) return null;
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y, zoom: this.cssPerPx() };
  }

  cssPerPx(): number {
    const s = this.scene;
    if (!s) return 1;
    const tw = s.host.engine.camera.texelWorld;
    return tw > 0 ? s.host.engine.pixelScale / tw / PX_PER_M : 1;
  }
}
