// v3 WP2 (v3-avatars). An avatar drawn by a pixel3d character rig (docs/v3/INTEGRATION.md §4). Vendor calls go
// through game3d/vendor/characters.ts only.
//
//   holder (THREE.Group, in the scene)
//     └─ handle.root (the vendor Character root: driven by drive(t), texel-snapped by the pixel camera)
//
// The holder is at the origin (+ the ghost hover) for living characters: the Character's own drive puts it at
// the feet. For 'clips' ghosts the driver slides (the Character stays where it died, so its gait never leaves
// the held ghost loop) and the holder carries the motion instead (feet − slide anchor).
import * as THREE from 'three';
import { dir8 } from '../../game/rules/input';
import {
  charState,
  COLOR_ONLY_LAYER,
  createDriver,
  isLoopClip,
  loadSpecCaps,
  propMaterial,
  setGhostLevel,
  socketOf,
  spawnCharacter,
  suppressSpecLights,
  type CharacterHandle,
  type Driver,
} from '../vendor/characters';
import type { AvatarBody, BodyFrameCtx } from './body';
import { ghostModeOf, type GhostMode } from './castMap';
import { clipTransition, NO_CLIPS, type ClipWant } from './clips';
import { createTintUniforms, patchTint, patchTintTree, setColourTint, setFade, setGhostTint, type TintUniforms } from './ghostTint';

/** Hover of a 'tint' ghost (m). */
export const TINT_HOVER_M = 0.15;
/** How long a looping clip played as a one-shot emote runs before idle returns (s). */
export const LOOP_EMOTE_S = 1.6;

export interface RigBodyOptions {
  /** Feet (m) at creation. */
  x: number;
  z: number;
  face?: number;
  heightAt(x: number, z: number): number;
  /** Low tier: no FX motes / smears. */
  lite: boolean;
  /** Stand-in colour (CSS hex) or null. */
  tint: string | null;
  /** Add a lantern prop on the hand when the rig has no lantern socket of its own. */
  lantern: boolean;
}

/** Sockets / bones the vendor cast use for a carried lantern (storyteller: lanternLight; moth: lantern). */
const LANTERN_SOCKETS = ['lanternLight', 'lanternGlow', 'lantern', 'glass'];
const HAND_SOCKETS = ['handR', 'handL'];

/** Build a rig body. Rejects when the spec or the rig build fails (the layer then tries the stand-in). */
export async function createRigBody(engine: unknown, specId: string, o: RigBodyOptions): Promise<AvatarBody> {
  const caps = await loadSpecCaps(specId);
  const handle = await spawnCharacter(engine, specId, { x: o.x, z: o.z, face: o.face ?? 0, heightAt: o.heightAt, lite: o.lite });
  try {
    return wrapHandle(engine, specId, handle, ghostModeOf(caps), o);
  } catch (e) {
    handle.dispose();
    throw e;
  }
}

function wrapHandle(engine: unknown, specId: string, handle: CharacterHandle, ghostMode: GhostMode, o: RigBodyOptions): AvatarBody {
  suppressSpecLights(handle);
  const U: TintUniforms = createTintUniforms();
  const patched = patchTintTree(handle.root, U);
  setColourTint(U, o.tint);
  const holder = new THREE.Group();
  holder.name = `avatar:${specId}`;
  holder.add(handle.root);
  const driver: Driver = createDriver(handle, o.heightAt);
  driver.reset(0, o.x, o.z, o.face ?? null);

  // size: the rig's bind-pose box (m)
  const box = new THREE.Box3().setFromObject(handle.root, false);
  const heightM = handle.height || (Number.isFinite(box.max.y - box.min.y) ? box.max.y - box.min.y : 1.3);
  const widthM = Number.isFinite(box.max.x - box.min.x) ? Math.max(0.4, Math.min(1.6, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.8)) : heightM * 0.6;

  // lantern: the rig's own socket, else a small prop on a hand
  let lanternAt: THREE.Object3D | null = o.lantern ? socketOf(handle, ...LANTERN_SOCKETS) : null;
  let prop: THREE.Mesh | null = null;
  if (o.lantern && !lanternAt) {
    const hand = socketOf(handle, ...HAND_SOCKETS);
    prop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), propMaterial(engine, 0xffc66a, 'ct-avatar-lantern'));
    patchTint(prop.material as THREE.Material, U);
    prop.name = 'avatar-lantern';
    prop.position.set(0, hand ? -0.12 : 0.55, hand ? 0 : 0.25);
    (hand ?? handle.root).add(prop);
    lanternAt = prop;
  }

  // LOD bookkeeping: each mesh's own layer mask, restored when it comes near again
  const meshes: { o: THREE.Object3D; mask: number }[] = [];
  handle.root.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) meshes.push({ o: x, mask: x.layers.mask });
  });
  let far = false;

  let hover = 0;
  let dead = false;
  let applied: ClipWant = NO_CLIPS;
  let want: ClipWant = NO_CLIPS;
  let onceUntil = -1;
  let lastX = o.x;
  let lastZ = o.z;
  let disposed = false;

  const playAll = (names: string[]) => {
    for (const n of names) handle.play(n);
  };
  const refreshHolder = () => {
    const a = driver.slideAnchor;
    if (a) holder.position.set(lastX - a.x, o.heightAt(lastX, lastZ) - o.heightAt(a.x, a.z) + hover, lastZ - a.z);
    else holder.position.set(0, hover, 0);
  };
  const applyClips = () => {
    playAll(clipTransition(applied, want));
    applied = want;
  };

  const body: AvatarBody = {
    kind: 'rig',
    texture: `v3:${specId}`,
    specId,
    heightM,
    widthM,
    holder,
    ghostMode,
    clipNames: handle.clips,
    emotes: handle.emotes,
    emoteClips: handle.emoteClips,
    get hoverM() {
      return hover;
    },
    place(t, X, Z, face, _moving, jump) {
      if (jump) driver.reset(t, X, Z, face);
      else driver.push(t, X, Z, face);
      lastX = X;
      lastZ = Z;
      refreshHolder();
    },
    setGhost(isDead, level) {
      dead = isDead;
      if (ghostMode === 'shared') setGhostLevel(handle, dead ? level : null);
      else if (ghostMode === 'clips') {
        driver.setSlide(dead);
        setGhostTint(U, dead ? 0.5 : 0);
      } else {
        setGhostTint(U, dead ? 1 : 0);
        hover = dead ? TINT_HOVER_M : 0;
      }
      refreshHolder();
    },
    setClips(next) {
      want = next;
      if (onceUntil < 0) applyClips();
    },
    playOnce(clip, t) {
      if (disposed || clip === 'idle') return false;
      if (applied.action) return false; // never break a held vote / collapse
      handle.play(clip);
      // a one-shot returns to the current loop / idle by itself; a loop clip is ended by us after LOOP_EMOTE_S
      onceUntil = isLoopClip(handle, clip) ? t + LOOP_EMOTE_S : -1;
      return true;
    },
    setFade(a) {
      setFade(U, a);
    },
    setLod(isFar) {
      if (isFar === far) return;
      far = isFar;
      for (const m of meshes) {
        if (far) m.o.layers.set(COLOR_ONLY_LAYER);
        else m.o.layers.mask = m.mask;
      }
    },
    update(t, _dt, _ctx: BodyFrameCtx) {
      if (disposed) return;
      if (onceUntil >= 0 && t >= onceUntil) {
        onceUntil = -1;
        playAll(['idle', ...(want.loop ? [want.loop] : []), ...(want.action ? [want.action] : [])]);
        applied = want;
      } else if (onceUntil < 0 && (applied.action !== want.action || applied.loop !== want.loop)) applyClips();
      handle.update(t);
    },
    frame() {
      const s = charState(handle);
      return `${s.clip}|${dir8(Math.sin(s.yaw), Math.cos(s.yaw))}|${s.n}`;
    },
    lanternAnchor(out) {
      if (!lanternAt) return false;
      lanternAt.getWorldPosition(out);
      return true;
    },
    lookInfo() {
      const g = U.uCtGhost.value;
      return { patched, ghostK: g.x, alpha: +g.y.toFixed(2), fade: +g.z.toFixed(2), tint: U.uCtTint.value.w, hover, sliding: driver.sliding, vendorGhost: (handle.ch as { ghost?: number | null }).ghost ?? null, far };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geos = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      handle.root.traverse((x) => {
        const m = x as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.geometry) geos.add(m.geometry);
        for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (mm) mats.add(mm);
      });
      try {
        handle.dispose();
      } catch (e) {
        console.warn('[avatars] character dispose failed', e);
      }
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      holder.removeFromParent();
    },
  };
  return body;
}
