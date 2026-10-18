// v3 WP1 (v3-core). The 3D town's camera and its View3d (docs/v3/INTEGRATION.md §1.4, §1.5, §3 "Camera").
//
// Outdoors (fixed yaw 0, pitch 30°; Q2 default): rest on the square while the viewer is in it; outside it lean
// 0.85 from the square toward the viewer, smoothed 1 − e^(−5·dt), clamped to the town; the focus is snapped to
// the texel grid (PixelCamera.snapWorld). viewHeight comes from the vendor zoom ladder: 12 m (the gameplay preset)
// on a 16:9 screen, the next stop up when a narrow (portrait) screen would not show the whole square. During a
// nomination / vote, on the square, the vendor's vote framing (plaza centre, 19 m; §9.1 user request 1).
// Inside: the room's dollhouse view (from the built interior when WP3 provides it, else from the §2.3 room).
//
// View3d: worldToScreen / screenToWorld / cssPerPx over coords.ts (the only projection maths) and input/pick.ts.
import * as THREE from 'three';
import { PLAZA } from '@ct/assets';
import { locationAt, type LocationId, type TownLayout } from '@ct/protocol';
import { cssToRay, houseOfLocation, interiorMap, interiorOrigin, INTERIOR_ROOMS, locToM, PX_PER_M, rayAtHeight, ROOM_T, worldToCss, type ProjectionState } from '../coords';
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
}

export interface CameraGoalInput {
  layout: TownLayout;
  /** Default: @ct/assets PLAZA. */
  plaza?: Plaza;
  /** The viewer (px) once placed, else null (rest on the square). */
  me: { x: number; y: number; location: LocationId } | null;
  aspect: number;
  /** A nomination / vote is open (the vote framing applies on the square). */
  voting: boolean;
  /** The built interior's camera for the viewer's room (WP3), when known. */
  interior?: CameraShot | null;
}

/** Where the camera wants to be this frame (pure; v2 TownScene.updateCamera in metres). */
export function cameraGoal(i: CameraGoalInput): CameraShot {
  const { layout } = i;
  const me = i.me;
  const pl = i.plaza ?? PLAZA;
  if (me && me.location !== 'outdoors') return i.interior ?? interiorShot(me.location, i.aspect) ?? restShot(pl, i.aspect);
  const restX = pl.cx / PX_PER_M;
  const restZ = pl.cy / PX_PER_M;
  const inSq = !!me && Math.hypot((me.x - pl.cx) / pl.rx, (me.y - 8 - pl.cy) / pl.ry) <= 1.08;
  if (i.voting && (inSq || !me)) return { X: restX, Y: 0, Z: restZ, viewHeight: Math.max(VOTE_VIEW_HEIGHT, fitViewHeight(i.aspect)) };
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
  /** House pick proxies (WP3: oriented boxes from the drawn town); default = layout footprints. */
  proxies?: readonly HouseProxy[];
  /** The built interior's camera (WP3), when that room is built. */
  interiorCamera?(location: LocationId): CameraShot | null;
}

export interface CameraFrameInput {
  me: { x: number; y: number; location: LocationId } | null;
  voting: boolean;
  /** Jump to the goal (teleport, location change, first frame). */
  snap: boolean;
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
  /** The current focus (m) and viewHeight. */
  shot(): CameraShot {
    return { X: this.focus.x, Y: this.focus.y, Z: this.focus.z, viewHeight: this.vh };
  }

  /** Once per frame before the render. */
  step(dt: number, f: CameraFrameInput): void {
    const s = this.scene;
    if (!s) return;
    const e = s.host.engine;
    const aspect = e.height > 0 ? e.width / e.height : 16 / 9;
    const loc = f.me?.location ?? 'outdoors';
    const interior = loc !== 'outdoors' ? (s.interiorCamera?.(loc) ?? null) : null;
    const g = cameraGoal({ layout: this.layout, plaza: this.plaza, me: f.me, aspect, voting: f.voting, interior });
    const jump = f.snap || !this.init || dt <= 0 || loc !== this.shown;
    this.shown = loc;
    if (jump) this.focus.set(g.X, g.Y, g.Z);
    else {
      const k = 1 - Math.exp(-dt * SMOOTH_RATE);
      this.focus.x += (g.X - this.focus.x) * k;
      this.focus.y += (g.Y - this.focus.y) * k;
      this.focus.z += (g.Z - this.focus.z) * k;
    }
    this.init = true;
    this.vh = g.viewHeight; // ladder stops: a jump, never a continuous crawl
    this.lens.viewHeight = this.vh;
    e.camera.set(this.lens); // first: the snap grid depends on viewHeight
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
    const Y = location === 'outdoors' ? s.heightAt(m.X, m.Z) + heightM : INTERIOR_FLOOR_Y + heightM;
    return worldToCss(s.host.projection(), m.X, Y, m.Z);
  }

  screenToWorld(cssX: number, cssY: number): PickResult | null {
    const s = this.scene;
    if (!s) return null;
    return pickScreen(s.host.projection(), { layout: this.layout, heightAt: s.heightAt, proxies: this.proxies, shown: this.shown }, cssX, cssY);
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
    const i = houseOfLocation(this.shown);
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
      if (this.shown !== 'outdoors' && room && i !== null) {
        try {
          p = interiorMap(i, room.interior).toPx(hit);
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
