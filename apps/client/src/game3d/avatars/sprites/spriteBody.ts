// v3.3 sprites (default at the low tier; ct.debug.v3sprites=0|1 forces either way). An AvatarBody drawn as
// ONE camera-facing quad that samples a baked sheet (bake.ts) and is lit by the vendor look shader (material.ts),
// plus a shadow-only proxy (proxy.ts) drawn into the sun's shadow map. The layer treats it like a rig body.
//
// Animation without the vendor Character: facing = the movement direction (or the held face) quantised to 8 facings
// relative to the camera yaw, stepped one 45° direction per 1/15 s like the Character (atlas.ts stepFacing); the
// locomotion drawing follows the distance travelled (stride wheel: phase += ds / cycle, the bake's cycle length);
// standing = the idle keys on the bake's timing; the clips the game holds come from baked timelines (clips.ts
// wantClips): 'die' (the collapse, held), 'vote' (held), 'talk' (loop, standing), 'ghost' / 'ghost-spent' ('clips'
// ghosts: the loop shown standing AND moving, like the rig's slide), the shared ghost's standing idle (FK legs + hover).
// Feet: the figure stands at the ground under its root, sunk toward a lower foot like the rig's hip dip (atlas.ts
// stepOffset) on the dais steps and the tower stair. Not drawn by any camera but the game's (water reflections).
// Lost vs the rig (docs/perf-v3/sprites.md §3): acceleration lean / chest-head lag / chain (scarf, tail) swing,
// planted-foot IK during the glide, fur / feather terminator hints.
import * as THREE from 'three';
import { dir8 } from '../../../game/rules/input';
import { COLOR_ONLY_LAYER, loadSpecCaps, propMaterial } from '../../vendor/characters';
import type { AvatarBody, BodyFrameCtx } from '../body';
import { ghostModeOf, type GhostMode, type SpecCaps } from '../castMap';
import type { ClipWant } from '../clips';
import { createTintUniforms, patchTint, setColourTint, setFade, setGhostTint, setRim } from '../ghostTint';
import { TINT_HOVER_M } from '../rigBody';
import { RECT_STRIDE, cycleDrawing, FACINGS, facingIndex, facingYaw, farSideOf, stepFacing, stepOffset, timelineCell, timelineKey } from './atlas';
import { getSheet, releaseSheet, type SheetCamera, type SpriteSheet } from './bake';
import { createProxyDepthMaterial, createSpriteDepthMaterial, createSpriteMaterial, createSpriteUniforms, type ProxyUniforms } from './material';

/**
 * The shadow proxies' (never drawn) colour material: invisible, so the game's colour / normal passes skip the proxies
 * in their render lists; visible only while three renders the shadow map (renderer.shadowMap.render, wrapped once per
 * renderer; three tests shadow casters against the MAIN camera's layers, so a dedicated layer cannot do this).
 */
const proxyColorMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false, visible: false });
const wrapped = new WeakSet<object>();
function wrapShadowRender(renderer: { shadowMap?: { render?: (...a: unknown[]) => void } } | null | undefined): boolean {
  const sm = renderer?.shadowMap;
  if (!sm || typeof sm.render !== 'function') return false;
  if (wrapped.has(sm)) return true;
  const orig = sm.render;
  sm.render = function (this: unknown, ...a: unknown[]) {
    proxyColorMat.visible = true;
    try {
      orig.apply(this, a);
    } finally {
      proxyColorMat.visible = false;
    }
  };
  wrapped.add(sm);
  return true;
}

export interface SpriteBodyOptions {
  x: number;
  z: number;
  face?: number;
  heightAt(x: number, z: number): number;
  tint: string | null;
  /** Bake priority (the own avatar first). */
  prio?: number;
  /** A lantern carrier: a spec without a lantern of its own gets the rig body's small lantern prop at the hand. */
  lantern?: boolean;
  /** v3.4: a sheet already in hand (peekSheet / a background bake): no bake is requested. */
  sheet?: SpriteSheet;
}

interface PixelCam {
  cam: THREE.OrthographicCamera;
  yaw: number;
  pitch: number;
  readonly texelWorld: number;
  readonly forward: THREE.Vector3;
  snapWorld(p: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3;
}
interface EngineLike {
  camera: PixelCam;
  sun?: THREE.DirectionalLight & { shadow: THREE.DirectionalLightShadow };
  uniforms: { uSunDir: { value: THREE.Vector3 } };
}

export function sheetCameraOf(engine: unknown): SheetCamera {
  const c = (engine as EngineLike).camera;
  c.cam.updateMatrixWorld();
  return { texel: c.texelWorld, pitch: c.pitch, yaw: c.yaw, quat: c.cam.getWorldQuaternion(new THREE.Quaternion()) };
}

/** Stats of the live sprite bodies (debug readout). fallbacks = frames that showed a stand-in pose (should stay 0). */
export const spriteDebug = { bodies: 0, rebakes: 0, mismatchFrames: 0, fallbacks: 0, force: {} as Record<string, string> };

const TURN_HOLD_S = 1 / 15;
const UP = new THREE.Vector3(0, 1, 0);

export async function createSpriteBody(engine: unknown, specId: string, o: SpriteBodyOptions): Promise<AvatarBody> {
  const E = engine as EngineLike;
  const caps: SpecCaps = await loadSpecCaps(specId);
  let sheet = o.sheet ?? (await getSheet(engine as object, specId, sheetCameraOf(engine), o.prio ?? 0));
  if ((sheet as unknown as { _disposed?: boolean })._disposed) throw new Error('sprite sheet already released');
  sheet.refs++;
  sheet.everRef = true;
  const ghostMode: GhostMode = ghostModeOf(caps);

  const S = createSpriteUniforms(sheet);
  const U = createTintUniforms();
  setColourTint(U, o.tint);
  const mat = createSpriteMaterial(engine, sheet, S);
  patchTint(mat, U);
  const geo = new THREE.PlaneGeometry(1, 1);
  const z4 = new Float32Array(12);
  geo.setAttribute('color', new THREE.BufferAttribute(z4, 3));
  geo.setAttribute('toneHi', new THREE.BufferAttribute(z4, 3));
  geo.setAttribute('toneSh', new THREE.BufferAttribute(z4, 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `sprite:${specId}`;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  // shadow: the proxy (baked bone matrices), or the prototype's plane caster when the sheet has no proxy
  const planeDepth = createSpriteDepthMaterial(S);
  mesh.customDepthMaterial = planeDepth;
  const P: ProxyUniforms = { uPxBones: { value: sheet.proxy?.bones ?? sheet.texB }, uPxDraw: { value: 0 } };
  const proxyDepth = createProxyDepthMaterial(P);
  const proxyOk = wrapShadowRender((engine as { renderer?: { shadowMap?: { render?: (...a: unknown[]) => void } } }).renderer);
  const proxy = new THREE.Mesh(sheet.proxy?.geo ?? new THREE.BufferGeometry(), proxyColorMat);
  proxy.name = `sprite-shadow:${specId}`;
  proxy.frustumCulled = false;
  proxy.customDepthMaterial = proxyDepth;
  const applyCaster = () => {
    const has = !!sheet.proxy && proxyOk;
    proxy.visible = has;
    proxy.castShadow = has && !far;
    mesh.castShadow = !has && !far;
    if (has) {
      proxy.geometry = sheet.proxy!.geo;
      P.uPxBones.value = sheet.proxy!.bones;
    }
  };
  const holder = new THREE.Group();
  holder.name = `avatar:sprite:${specId}`;
  holder.add(mesh, proxy);
  // the rig body's lantern prop (rigBody.ts: a carrier whose spec has no lantern socket holds a small box lantern)
  let prop: THREE.Mesh | null = null;
  if (o.lantern && sheet.lanternIsHand && sheet.lanterns) {
    prop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), propMaterial(engine, 0xffc66a, 'ct-avatar-lantern'));
    patchTint(prop.material as THREE.Material, U);
    prop.name = 'avatar-lantern';
    holder.add(prop);
  }
  spriteDebug.bodies++;

  // ------------------------------------------------------------------ per-pass uniforms
  const feet = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const v4 = new THREE.Vector4();
  let clock = 0;
  const lookU = () => (mat.userData as { look: { uniforms: Record<string, { value: unknown }> } }).look.uniforms;
  const obr = mat.onBeforeRender.bind(mat);
  mat.onBeforeRender = (...a: Parameters<THREE.Material['onBeforeRender']>) => {
    obr(...a);
    const L = lookU();
    // self-shadow hull of the baked rig at the feet (look.js 'hull'), cloud anchor, glow clock
    const H = L.uCharHull?.value as THREE.Vector4 | undefined;
    const Sf = L.uCharSelf?.value as THREE.Vector3 | undefined;
    if (H && Sf && Sf.z > 0) {
      H.set(feet.x, feet.y, feet.z, sheet.hull.r);
      Sf.x = feet.y + sheet.hull.top;
    }
    (L.uCharAnchor?.value as THREE.Vector3 | undefined)?.copy(feet).add(tmp.set(0, 0.5, 0));
    if (L.uCharTime) L.uCharTime.value = clock;
  };
  mesh.onBeforeRender = (_r, _s, camera) => {
    const cam = camera as THREE.OrthographicCamera;
    // only the game camera draws sprites: a mirrored water-reflection camera would see the quad from the wrong side
    S.uSprHide.value = camera === E.camera.cam ? 0 : 1;
    const fwd = E.camera.forward;
    S.uSprBack.value.copy(fwd).multiplyScalar(-1).normalize();
    S.uSprDepthK.value = 1 / Math.max(1e-3, (cam.far ?? 400) - (cam.near ?? 0.1));
    const sm = E.sun?.shadow?.matrix;
    if (sm) S.uSprShadowD.value.copy(v4.set(S.uSprBack.value.x, S.uSprBack.value.y, S.uSprBack.value.z, 0).applyMatrix4(sm));
  };

  // ------------------------------------------------------------------ animation state
  let hover = 0;
  let crown = 0;
  let dead = false;
  let level: 1 | 2 = 1;
  let lastX = o.x;
  let lastZ = o.z;
  let moving = false;
  let phase = 0;
  let targetYaw = o.face ?? 0;
  let facing = facingIndex(targetYaw, E.camera.yaw);
  let turnAt = 0;
  let idleT0 = 0;
  let action: string | null = null;
  let actionT0 = 0;
  let loop: string | null = null;
  let loopT0 = 0;
  let frameName = 'idle|down|0';
  let base = 0;
  let far = false;
  let disposed = false;
  let mismatchSince = -1;
  let rebaking = false;
  let ghostFallback = false;
  // feet on steps: cached per root position / facing
  let stepKey = '';
  let stepY = 0;

  const emotesOf = (sh: SpriteSheet) => ({ talk: sh.clips.talk ? 'talk' : null, vote: sh.holds.vote !== undefined ? 'vote' : null, point: null, die: sh.clips.die ? 'die' : null, ghost: sh.clips.ghost ? 'ghost' : null, signature: null });
  const clipNamesOf = (sh: SpriteSheet) => [...Object.keys(sh.clips), ...Object.keys(sh.holds)];
  // per sheet, not per read (the layer reads them every frame)
  let emotes = emotesOf(sheet);
  let clipNames = clipNamesOf(sheet);

  const setCell = (b: number, clip: string, n: number) => {
    base = b;
    const r = sheet.rects;
    const i = (b + facing) * RECT_STRIDE;
    S.uSprCell.value.set(r[i]!, r[i + 1]!, r[i + 2]!, r[i + 3]!);
    S.uSprAnchor.value.set(r[i + 4]!, r[i + 5]!, sheet.cam.texel, 0);
    P.uPxDraw.value = Math.floor(b / FACINGS);
    const y = facingYaw(facing, E.camera.yaw);
    frameName = `${clip}|${dir8(Math.sin(y), Math.cos(y))}|${n}`;
  };
  const showTimeline = (name: string, t: number) => {
    const tl = sheet.clips[name]!;
    setCell(timelineCell(tl, t), name, timelineKey(t, tl.keys, tl.length, tl.loop));
  };

  const swapSheet = (next: SpriteSheet) => {
    const old = sheet;
    sheet = next;
    sheet.refs++;
    sheet.everRef = true;
    S.uSprA.value = next.texA;
    S.uSprB.value = next.texB;
    S.uSprHi.value = next.palette.hi;
    S.uSprMid.value = next.palette.mid;
    S.uSprSh.value = next.palette.sh;
    S.uSprSunAxis.value.w = 1 / Math.cos(next.cam.pitch);
    applyCaster();
    emotes = emotesOf(next);
    clipNames = clipNamesOf(next);
    releaseSheet(engine as object, old);
  };

  const applyGhost = () => {
    ghostFallback = false;
    if (ghostMode === 'shared') {
      const g = lookU().uCharGhost?.value as THREE.Vector4 | undefined;
      if (g) g.x = dead ? level : 0;
      S.uSprHalo.value = dead && level === 1 ? 1 : 0;
      hover = dead ? (caps.ghostHover ?? 0) : 0;
      crown = dead && level === 1 ? (caps.ghostHalo ?? 0) : 0;
    } else if (ghostMode === 'clips' && sheet.clips.ghost) {
      // the rig: the held ghost loop (its own ghost tones via plane C) + the 50 % tint, no hover
      setGhostTint(U, dead ? 0.5 : 0);
      hover = 0;
    } else {
      // 'tint' ghosts (and a 'clips' spec whose ghost loop is missing: counted in spriteDebug.fallbacks)
      ghostFallback = dead && ghostMode === 'clips';
      setGhostTint(U, dead ? (ghostMode === 'clips' ? 0.5 : 1) : 0);
      hover = dead ? TINT_HOVER_M : 0;
    }
  };

  const body: AvatarBody = {
    kind: 'rig',
    texture: `v3:${specId}`, // the §6.1 key (the e2e checks it); `sprite` tells a sprite from a rig
    sprite: true,
    specId,
    get heightM() {
      return sheet.heightM;
    },
    get widthM() {
      return sheet.widthM;
    },
    holder,
    ghostMode,
    get clipNames() {
      return clipNames;
    },
    get emotes() {
      return emotes;
    },
    emoteClips: [],
    get hoverM() {
      return hover;
    },
    get crownM() {
      return crown;
    },
    place(_t, X, Z, face, isMoving, jump) {
      const dx = X - lastX;
      const dz = Z - lastZ;
      const d = Math.hypot(dx, dz);
      if (!jump && d > 1e-4 && d < 3) {
        phase += d / Math.max(0.05, sheet.move?.cycle ?? 1);
        targetYaw = Math.atan2(dx, dz);
      } else if (face !== null && !isMoving) targetYaw = face;
      if (jump) {
        facing = facingIndex(targetYaw, E.camera.yaw);
        phase = 0;
      }
      if (moving && !isMoving) idleT0 = clock;
      moving = isMoving && !jump;
      lastX = X;
      lastZ = Z;
    },
    setGhost(isDead, lv) {
      dead = isDead;
      level = lv;
      applyGhost();
    },
    setClips(next: ClipWant) {
      if (next.action !== action) {
        action = next.action;
        actionT0 = clock;
      }
      if (next.loop !== loop) {
        loop = next.loop;
        loopT0 = clock;
      }
    },
    playOnce() {
      return false; // the game plays no one-shot emotes on avatars (layer.playEmote is debug-only)
    },
    setFade(a) {
      setFade(U, a);
    },
    setRim(hex) {
      setRim(U, hex);
    },
    setLod(isFar) {
      if (isFar === far) return;
      far = isFar;
      if (far) mesh.layers.set(COLOR_ONLY_LAYER);
      else mesh.layers.set(0);
      applyCaster();
    },
    update(t, _dt, _ctx: BodyFrameCtx) {
      if (disposed) return;
      clock = t;
      const cam = E.camera;
      // facing: one 45° step per turn hold
      if (t - turnAt >= TURN_HOLD_S) {
        const nf = stepFacing(facing, targetYaw, cam.yaw);
        if (nf !== facing) {
          facing = nf;
          turnAt = t;
        }
      }
      // drawing
      let forced = spriteDebug.force[specId];
      if (forced !== undefined && dead && ghostMode === 'shared' && sheet.byName[`ghostIdle|${forced}`] !== undefined) forced = `ghostIdle|${forced}`;
      const C = sheet.clips;
      if (forced !== undefined && sheet.byName[forced] !== undefined) setCell(sheet.byName[forced]!, forced, 0);
      else if (action && action === 'die' && C.die) showTimeline('die', t - actionT0);
      else if (action && sheet.holds[action] !== undefined) setCell(sheet.holds[action]!, action, 0);
      else if (dead && ghostMode === 'clips' && loop && C[loop]) showTimeline(loop, t - loopT0);
      else if (moving && sheet.move) {
        const n = cycleDrawing(phase, sheet.move.poses);
        setCell(sheet.move.cells[n]!, sheet.move.run ? 'run' : 'walk', n);
      } else if (loop && C[loop] && !dead) showTimeline(loop, t - loopT0);
      else if (dead && ghostMode === 'shared' && C.ghostIdle) showTimeline('ghostIdle', t - idleT0);
      else showTimeline('idle', t - idleT0);
      if (ghostFallback || (action && action !== 'die' && sheet.holds[action] === undefined) || (action === 'die' && !C.die)) spriteDebug.fallbacks++;
      // place: feet on the camera's texel grid (sunk toward a lower foot on steps), quad facing the camera
      const fy = facingYaw(facing, cam.yaw);
      const sk = `${lastX.toFixed(3)},${lastZ.toFixed(3)},${facing},${cam.yaw.toFixed(3)}`;
      const h0 = o.heightAt(lastX, lastZ);
      if (sk !== stepKey) {
        stepKey = sk;
        const spread = Math.min(0.2, Math.max(0.05, (sheet.hull.r - 0.12) * 0.45));
        const lx = Math.cos(fy) * spread;
        const lz = -Math.sin(fy) * spread;
        stepY = stepOffset(h0, o.heightAt(lastX + lx, lastZ + lz), o.heightAt(lastX - lx, lastZ - lz));
      }
      feet.set(lastX, h0 + stepY, lastZ);
      tmp.copy(feet);
      tmp.y += hover;
      cam.snapWorld(tmp, mesh.position);
      cam.cam.getWorldQuaternion(mesh.quaternion);
      proxy.position.copy(mesh.position);
      proxy.quaternion.setFromAxisAngle(UP, fy);
      if (prop && body.lanternAnchor(prop.position)) prop.position.y -= 0.12;
      // far half (look.js farSide with the sun tie-break) for the displayed facing
      const sd = E.uniforms.uSunDir.value;
      S.uSprFar.value = farSideOf(fy, cam.forward, sd);
      // plane caster fallback: horizontal axis perpendicular to the sun
      tmp.set(sd.x, 0, sd.z);
      if (tmp.lengthSq() > 1e-6) {
        tmp.normalize().cross(UP);
        S.uSprSunAxis.value.set(tmp.x, tmp.y, tmp.z, S.uSprSunAxis.value.w);
      }
      // a different texel size / pitch / yaw (vote camera, resize, a room): re-bake once the camera held 0.5 s
      const mism = Math.abs(cam.texelWorld - sheet.cam.texel) > 1e-6 || Math.abs(cam.pitch - sheet.cam.pitch) > 1e-4 || Math.abs(cam.yaw - sheet.cam.yaw) > 1e-4;
      if (mism) {
        spriteDebug.mismatchFrames++;
        if (mismatchSince < 0) mismatchSince = t;
        if (!rebaking && t - mismatchSince > 0.5) {
          rebaking = true;
          spriteDebug.rebakes++;
          getSheet(engine as object, specId, sheetCameraOf(engine), (o.prio ?? 0) + 5)
            .then((s) => {
              if (!disposed && s !== sheet) swapSheet(s);
            })
            .catch((e) => console.warn('[sprites] re-bake failed', e))
            .finally(() => {
              rebaking = false;
              mismatchSince = -1;
            });
        }
      } else mismatchSince = -1;
    },
    frame() {
      return frameName;
    },
    lanternAnchor(out) {
      const l = sheet.lanterns?.[Math.floor(base / FACINGS)] ?? sheet.lanterns?.[0];
      if (!l) return false;
      out.copy(l).applyAxisAngle(UP, facingYaw(facing, E.camera.yaw)).add(feet);
      out.y += hover;
      return true;
    },
    compileRoots() {
      return prop ? [mesh, prop] : [mesh];
    },
    lookInfo() {
      return { sprite: true, sheet: sheet.key, source: sheet.source, facing, phase: +phase.toFixed(3), action, loop, hover, crown, far, stepY: +stepY.toFixed(3), proxy: !!sheet.proxy, ghostK: U.uCtGhost.value.x, rim: U.uCtRim.value.w, stats: sheet.stats };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      spriteDebug.bodies--;
      releaseSheet(engine as object, sheet);
      geo.dispose();
      mat.dispose();
      planeDepth.dispose();
      proxyDepth.dispose();
      if (prop) {
        prop.geometry.dispose();
        (prop.material as THREE.Material).dispose();
      }
      holder.removeFromParent();
    },
  };
  applyCaster();
  return body;
}
