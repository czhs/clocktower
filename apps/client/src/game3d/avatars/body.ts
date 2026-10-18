// v3 WP2 (v3-avatars). The one shape every drawn avatar has, whatever draws it: a pixel3d rig (rigBody.ts) or a
// flat v2-sprite billboard (billboard.ts). The layer (layer.ts) only talks to this interface. Metres inside.
import type * as THREE from 'three';
import type { GhostMode } from './castMap';
import type { ClipWant } from './clips';

export type BodyKind = 'rig' | 'billboard';

export interface BodyFrameCtx {
  /** Reduced motion: billboards hold frame 0 (v2 rule); rigs are unaffected (their gait is the motion). */
  still: boolean;
  /** The pixel camera's world quaternion (billboards face it). */
  camQuat: THREE.Quaternion;
}

export interface AvatarBody {
  readonly kind: BodyKind;
  /** __ctCamera.avatar().texture: 'v3:<specId>' | 'v3-billboard:<castId>'. */
  readonly texture: string;
  /** Built spec id (rigs), null for billboards. */
  readonly specId: string | null;
  /** Figure height (m, vertical, living, without hover) and an approximate width (m). */
  readonly heightM: number;
  readonly widthM: number;
  /** Added to the scene by the layer; moved only by the body. */
  readonly holder: THREE.Group;
  /** How this body shows death (castMap GhostMode, from the live probe). */
  readonly ghostMode: GhostMode;
  /** Clips the body can play (empty for billboards). */
  readonly clipNames: readonly string[];
  readonly emotes: Readonly<Record<string, string | null | undefined>>;
  readonly emoteClips: readonly string[];
  /** Current ghost hover (m): the body is drawn this far above its feet (anchors, pick box). */
  readonly hoverM: number;
  /** Extra drawn height above the head (m), e.g. the shared ghost's halo at level 1 (anchors, pick box top). */
  readonly crownM: number;
  /** Feet (m) at engine time t; `face` = a yaw to hold while standing (null: follow the motion); `jump` = no slide. */
  place(t: number, X: number, Z: number, face: number | null, moving: boolean, jump: boolean): void;
  /** Living (dead = false) or the ghost look (level 1 = ghost vote left, 2 = spent). */
  setGhost(dead: boolean, level: 1 | 2): void;
  /** The held action + loop the body should show (applied as a diff). */
  setClips(want: ClipWant): void;
  /** A one-shot emote clip (already resolved by clips.resolveEmote); false when it cannot play now. */
  playOnce(clip: string, t: number): boolean;
  /** Talking rim (CSS hex) or off (null): an additive emissive band on the silhouette (a uniform; ghostTint.ts). */
  setRim(hex: string | null): void;
  /** Teleport cross-fade: 0 invisible .. 1 opaque (a uniform; dithered). */
  setFade(a: number): void;
  /** Low-tier LOD: far characters skip the normal pass and cast no shadow. */
  setLod(far: boolean): void;
  /** Per frame, only while shown. */
  update(t: number, dt: number, ctx: BodyFrameCtx): void;
  /** __ctCamera.avatar().frame: '<id>|<dir8>|<n>' (billboards) or '<clip>|<dir8>|<n>' (rigs). */
  frame(): string;
  /** World position of the lantern (m) into `out`; false when this body carries none. */
  lanternAnchor(out: THREE.Vector3): boolean;
  dispose(): void;
  /**
   * The objects to pre-compile before the first show (the holder plus anything the vendor put straight into the
   * scene for this body: FX motes, smear groups). Absent = the holder only.
   */
  compileRoots?(): readonly THREE.Object3D[];
  /** Debug: the current look (tint / dither / hover / slide / vendor ghost level). */
  lookInfo?(): Record<string, unknown>;
}
