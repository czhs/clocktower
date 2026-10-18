// v3.3 sprites prototype (ct.debug.v3sprites=1). An AvatarBody drawn as ONE camera-facing quad that samples a
// baked sheet (bake.ts) and is lit by the vendor look shader (material.ts). The layer treats it like a rig body.
//
// Animation without the vendor Character: facing = the movement direction (or the held face) quantised to 8 facings
// relative to the camera yaw, stepped one 45° direction per 1/15 s like the Character (atlas.ts stepFacing); the
// locomotion drawing follows the distance travelled (stride wheel: phase += ds / cycle, the bake's cycle length);
// standing = the idle keys on the bake's timing; a held 'vote' shows the baked raised-hand pose.
// Lost vs the rig (docs/perf-v3/sprites.md): acceleration lean / chest-head lag / chain (scarf, tail) swing,
// planted-foot IK during the glide, emotes, 'clips' ghost loops (tinted instead), fur / feather terminator hints.
import * as THREE from 'three';
import { dir8 } from '../../../game/rules/input';
import { COLOR_ONLY_LAYER, loadSpecCaps } from '../../vendor/characters';
import type { AvatarBody, BodyFrameCtx } from '../body';
import { ghostModeOf, type GhostMode, type SpecCaps } from '../castMap';
import type { ClipWant } from '../clips';
import { createTintUniforms, patchTint, setColourTint, setFade, setGhostTint, setRim } from '../ghostTint';
import { TINT_HOVER_M } from '../rigBody';
import { cellOrigin, cycleDrawing, facingIndex, facingYaw, farSideOf, heldKeyAt, stepFacing } from './atlas';
import { getSheet, type SheetCamera, type SpriteSheet } from './bake';
import { createSpriteDepthMaterial, createSpriteMaterial, createSpriteUniforms } from './material';

export interface SpriteBodyOptions {
  x: number;
  z: number;
  face?: number;
  heightAt(x: number, z: number): number;
  tint: string | null;
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

/** Serialise bakes (one rig at a time, never two in one frame). */
let bakeChain: Promise<unknown> = Promise.resolve();
function queuedSheet(engine: object, spec: string, cam: SheetCamera): Promise<SpriteSheet> {
  const p = bakeChain.then(() => new Promise<void>((r) => requestAnimationFrame(() => r()))).then(() => getSheet(engine, spec, cam));
  bakeChain = p.catch(() => undefined);
  return p;
}

export function sheetCameraOf(engine: unknown): SheetCamera {
  const c = (engine as EngineLike).camera;
  c.cam.updateMatrixWorld();
  return { texel: c.texelWorld, pitch: c.pitch, yaw: c.yaw, quat: c.cam.getWorldQuaternion(new THREE.Quaternion()) };
}

/** Stats of the live sprite bodies (debug readout). */
export const spriteDebug = { bodies: 0, rebakes: 0, mismatchFrames: 0, force: {} as Record<string, string> };

const TURN_HOLD_S = 1 / 15;
const UP = new THREE.Vector3(0, 1, 0);

export async function createSpriteBody(engine: unknown, specId: string, o: SpriteBodyOptions): Promise<AvatarBody> {
  const E = engine as EngineLike;
  const caps: SpecCaps = await loadSpecCaps(specId);
  let sheet = await queuedSheet(engine as object, specId, sheetCameraOf(engine));
  sheet.refs++;
  const ghostMode: GhostMode = ghostModeOf(caps);

  const S = createSpriteUniforms(sheet);
  const U = createTintUniforms();
  setColourTint(U, o.tint);
  const mat = createSpriteMaterial(engine, sheet, S);
  patchTint(mat, U);
  const depthMat = createSpriteDepthMaterial(S);
  const geo = new THREE.PlaneGeometry(1, 1);
  const z4 = new Float32Array(12);
  geo.setAttribute('color', new THREE.BufferAttribute(z4, 3));
  geo.setAttribute('toneHi', new THREE.BufferAttribute(z4, 3));
  geo.setAttribute('toneSh', new THREE.BufferAttribute(z4, 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `sprite:${specId}`;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depthMat;
  const holder = new THREE.Group();
  holder.name = `avatar:sprite:${specId}`;
  holder.add(mesh);
  spriteDebug.bodies++;

  // ------------------------------------------------------------------ per-pass uniforms
  const feet = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const v4 = new THREE.Vector4();
  let clock = 0;
  const lookU = () => (mat.userData as { look: { uniforms: Record<string, { value: unknown }> } }).look.uniforms;
  const hookMaterial = (m: THREE.Material) => {
    const obr = m.onBeforeRender.bind(m);
    m.onBeforeRender = (...a: Parameters<THREE.Material['onBeforeRender']>) => {
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
  };
  hookMaterial(mat);
  mesh.onBeforeRender = (_r, _s, camera) => {
    const cam = camera as THREE.OrthographicCamera;
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
  let lastX = o.x;
  let lastZ = o.z;
  let moving = false;
  let phase = 0;
  let targetYaw = o.face ?? 0;
  let facing = facingIndex(targetYaw, E.camera.yaw);
  let turnAt = 0;
  let idleT0 = 0;
  let hold: string | null = null;
  let frameName = 'idle|down|0';
  let far = false;
  let disposed = false;
  let mismatchSince = -1;
  let rebaking = false;

  const setCell = (base: number, clip: string, n: number) => {
    const i = base + facing;
    const c = cellOrigin(i, sheet.grid, sheet.cell);
    S.uSprCell.value.set(c.x, c.y, sheet.cell.w, sheet.cell.h);
    const y = facingYaw(facing, E.camera.yaw);
    frameName = `${clip}|${dir8(Math.sin(y), Math.cos(y))}|${n}`;
  };

  const swapSheet = (next: SpriteSheet) => {
    const old = sheet;
    sheet = next;
    sheet.refs++;
    S.uSprA.value = next.rtA.texture;
    S.uSprB.value = next.rtB.texture;
    S.uSprAnchor.value.set(next.cell.w / 2, next.cell.below, next.cam.texel, 0);
    S.uSprHi.value = next.palette.hi;
    S.uSprMid.value = next.palette.mid;
    S.uSprSh.value = next.palette.sh;
    S.uSprSunAxis.value.w = 1 / Math.cos(next.cam.pitch);
    old.refs--;
  };

  const body: AvatarBody = {
    kind: 'rig',
    texture: `v3-sprite:${specId}`,
    specId,
    get heightM() {
      return sheet.heightM;
    },
    get widthM() {
      return sheet.widthM;
    },
    holder,
    ghostMode,
    clipNames: [],
    emotes: {},
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
    setGhost(isDead, level) {
      dead = isDead;
      if (ghostMode === 'shared') {
        const g = lookU().uCharGhost?.value as THREE.Vector4 | undefined;
        if (g) g.x = dead ? level : 0;
        S.uSprHalo.value = dead && level === 1 ? 1 : 0;
        hover = dead ? (caps.ghostHover ?? 0) : 0;
        crown = dead && level === 1 ? (caps.ghostHalo ?? 0) : 0;
      } else {
        // 'clips' ghosts have no baked ghost loop in the prototype: the 'tint' look
        setGhostTint(U, dead ? (ghostMode === 'clips' ? 0.5 : 1) : 0);
        hover = dead ? TINT_HOVER_M : 0;
      }
    },
    setClips(next: ClipWant) {
      hold = next.action && sheet.holds[next.action] !== undefined ? next.action : null;
    },
    playOnce() {
      return false; // no emotes in the prototype
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
      mesh.castShadow = !far;
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
      const forced = spriteDebug.force[specId];
      if (forced !== undefined && sheet.byName[forced] !== undefined) setCell(sheet.byName[forced]!, forced, 0);
      else if (hold) setCell(sheet.holds[hold]!, hold, 0);
      else if (moving && sheet.move) {
        const n = cycleDrawing(phase, sheet.move.poses);
        setCell(sheet.move.cells[n]!, sheet.move.run ? 'run' : 'walk', n);
      } else {
        const k = heldKeyAt(t - idleT0, sheet.idle.keys, sheet.idle.length);
        setCell(sheet.idle.cells[k] ?? 0, 'idle', k);
      }
      // place: feet on the camera's texel grid, quad facing the camera
      feet.set(lastX, o.heightAt(lastX, lastZ), lastZ);
      tmp.copy(feet);
      tmp.y += hover;
      cam.snapWorld(tmp, mesh.position);
      cam.cam.getWorldQuaternion(mesh.quaternion);
      // far half (look.js farSide with the sun tie-break) for the displayed facing
      const sd = E.uniforms.uSunDir.value;
      S.uSprFar.value = farSideOf(facingYaw(facing, cam.yaw), cam.forward, sd);
      // shadow plane: horizontal, perpendicular to the sun
      tmp.set(sd.x, 0, sd.z);
      if (tmp.lengthSq() > 1e-6) {
        tmp.normalize().cross(UP);
        S.uSprSunAxis.value.set(tmp.x, tmp.y, tmp.z, S.uSprSunAxis.value.w);
      }
      // a different texel size / pitch (vote camera, resize): re-bake once the camera has held still for 0.5 s
      const mism = Math.abs(cam.texelWorld - sheet.cam.texel) > 1e-6 || Math.abs(cam.pitch - sheet.cam.pitch) > 1e-4 || Math.abs(cam.yaw - sheet.cam.yaw) > 1e-4;
      if (mism) {
        spriteDebug.mismatchFrames++;
        if (mismatchSince < 0) mismatchSince = t;
        if (!rebaking && t - mismatchSince > 0.5) {
          rebaking = true;
          spriteDebug.rebakes++;
          queuedSheet(engine as object, specId, sheetCameraOf(engine))
            .then((s) => {
              if (!disposed) swapSheet(s);
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
      if (!sheet.lantern) return false;
      out.copy(sheet.lantern).applyAxisAngle(UP, facingYaw(facing, E.camera.yaw)).add(feet);
      out.y += hover;
      return true;
    },
    compileRoots() {
      return [holder];
    },
    lookInfo() {
      return { sprite: true, sheet: sheet.key, facing, phase: +phase.toFixed(3), hold, hover, crown, far, ghostK: U.uCtGhost.value.x, rim: U.uCtRim.value.w, stats: sheet.stats };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      spriteDebug.bodies--;
      sheet.refs--;
      geo.dispose();
      mat.dispose();
      depthMat.dispose();
      holder.removeFromParent();
    },
  };
  return body;
}
