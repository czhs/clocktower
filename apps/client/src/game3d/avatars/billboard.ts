// v3 WP2 (v3-avatars). Flat v2-sprite billboards (docs/v3/INTEGRATION.md §4 "Billboards"; Q3 lead default):
// brianbi (photo-real, cast-hd.*) and nicksong (cast.*), and the last-resort body for any cast id whose rig and
// stand-in both failed. A camera-facing quad, 1.3 m tall, anchored at the feet, 8 directions from the v2 frames,
// on the COLOR_ONLY layer (no outline pass, no shadow), lit like up-facing ground by the toon ramp.
// Frame names keep the v2 format `<key>|<dir8>|<n>`.
//
// No v3/assets/sprites/<id>.json bake exists for nicksong or brianbi (the contract's preferred source); when one
// lands, add it here as a third SheetKind.
import * as THREE from 'three';
import castJson from '@ct/assets/generated/cast.json';
import castHdJson from '@ct/assets/generated/cast-hd.json';
import { castGhostsUrl, castHdUrl, castUrl } from '@ct/assets/runtime';
import { dir8, type Dir8 } from '../../game/rules/input';
import { billboardMaterial, COLOR_ONLY_LAYER } from '../vendor/characters';
import type { AvatarBody, BodyFrameCtx } from './body';
import {
  BILLBOARD_HEIGHT_M,
  billboardArt,
  cellUv,
  frameCell,
  frameIndex,
  ghostFrameIndex,
  type BillboardArt,
  type CastHdManifest,
  type CastSheetManifest,
  type SheetKind,
} from './billboardFrames';
import { createTintUniforms, patchTint, setColourTint, setFade, setGhostTint } from './ghostTint';
import { TINT_HOVER_M } from './rigBody';

const CAST = castJson as unknown as CastSheetManifest;
const CAST_HD = castHdJson as unknown as CastHdManifest;

/** Whether a cast id has v2 sprite art for a billboard. */
export function hasBillboardArt(id: string): boolean {
  return !!billboardArt(id, CAST, CAST_HD);
}

// ------------------------------------------------------------------------------------ textures (per engine)

interface SheetTex {
  tex: THREE.Texture;
  w: number;
  h: number;
}
const sheetCache = new WeakMap<object, Map<SheetKind, Promise<SheetTex>>>();

function sheetUrl(k: SheetKind): string {
  return k === 'cast-hd' ? castHdUrl : k === 'cast-ghosts' ? castGhostsUrl : castUrl;
}

function loadSheet(engine: object, k: SheetKind): Promise<SheetTex> {
  let m = sheetCache.get(engine);
  if (!m) sheetCache.set(engine, (m = new Map()));
  let p = m.get(k);
  if (!p) {
    p = new Promise<SheetTex>((resolve, reject) => {
      new THREE.ImageLoader().load(
        sheetUrl(k),
        (img) => {
          const tex = new THREE.Texture(img);
          tex.colorSpace = THREE.SRGBColorSpace;
          if (k === 'cast-hd') {
            // photo-real art, minified ~8x into the low-res target: smooth + mipmaps (as v2 draws it smoothed)
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.generateMipmaps = true;
          } else {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
          }
          tex.needsUpdate = true;
          resolve({ tex, w: img.width, h: img.height });
        },
        undefined,
        () => reject(new Error(`billboard sheet ${k} failed to load`)),
      );
    });
    p.catch(() => m!.delete(k)); // a later billboard retries
    m.set(k, p);
  }
  return p;
}

/** Free the sheet textures of one engine (layer destroy). */
export function releaseBillboardSheets(engine: object): void {
  const m = sheetCache.get(engine);
  if (!m) return;
  sheetCache.delete(engine);
  for (const p of m.values()) p.then((s) => s.tex.dispose()).catch(() => undefined);
}

// ------------------------------------------------------------------------------------ body

export interface BillboardOptions {
  heightAt(x: number, z: number): number;
  /** Stand-in colour (CSS hex) or null. */
  tint: string | null;
}

const PROGRAM_KEY = 'ct-avatar-billboard';

/** Build a billboard body for a cast id; rejects when there is no art for it or the sheet cannot load. */
export async function createBillboardBody(engine: object, id: string, o: BillboardOptions): Promise<AvatarBody> {
  const art: BillboardArt | null = billboardArt(id, CAST, CAST_HD);
  if (!art) throw new Error(`no v2 sprite art for '${id}'`);
  const living = await loadSheet(engine, art.sheet);
  let ghost: SheetTex | null = null;
  const ghostSheet = art.ghostSheet;
  if (ghostSheet) ghost = await loadSheet(engine, ghostSheet).catch(() => null); // no ghost art: the tint covers it

  const s = BILLBOARD_HEIGHT_M / art.cellH; // m per sheet px
  const w = art.cellW * s;
  const h = art.cellH * s;
  // quad with the feet (anchor px) at the origin
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(w / 2 - art.anchor.x * s, h / 2 - (art.cellH - art.anchor.y) * s, 0);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const U = createTintUniforms();
  setColourTint(U, o.tint);
  const mat = billboardMaterial(engine, { map: living.tex, programKey: PROGRAM_KEY }) as THREE.MeshLambertMaterial;
  patchTint(mat, U);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `billboard:${id}`;
  mesh.layers.set(COLOR_ONLY_LAYER);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const holder = new THREE.Group();
  holder.name = `avatar:billboard:${id}`;
  holder.add(mesh);

  let dir: Dir8 = 'down';
  let moving = false;
  let dead = false;
  let level: 1 | 2 = 1;
  let hover = 0;
  let lastX = NaN;
  let lastZ = NaN;
  let frameName = '';
  let cellKey = '';
  let disposed = false;
  const inset = art.sheet === 'cast-hd' ? 0.5 : 0;

  const setCell = (sheet: SheetKind, key: string, n: number) => {
    const c = frameCell(sheet, key, dir, n, CAST, CAST_HD);
    if (!c) return;
    frameName = c.name;
    const k = `${c.sheet}|${c.x}|${c.y}`;
    if (k === cellKey) return;
    cellKey = k;
    const tex = c.sheet === art.sheet ? living : ghost;
    if (!tex) return;
    if (mat.map !== tex.tex) mat.map = tex.tex; // same program: only the bound texture changes
    const r = cellUv(c, tex.w, tex.h, inset);
    // PlaneGeometry uv order: (0,1) (1,1) (0,0) (1,0)
    uv.setXY(0, r.u0, r.v1);
    uv.setXY(1, r.u1, r.v1);
    uv.setXY(2, r.u0, r.v0);
    uv.setXY(3, r.u1, r.v0);
    uv.needsUpdate = true;
  };
  setCell(art.sheet, art.key, 0);

  const body: AvatarBody = {
    kind: 'billboard',
    texture: `v3-billboard:${id}`,
    specId: null,
    heightM: BILLBOARD_HEIGHT_M * (art.anchor.y / art.cellH),
    widthM: w * 0.6,
    holder,
    ghostMode: 'tint',
    clipNames: [],
    emotes: {},
    emoteClips: [],
    get hoverM() {
      return hover;
    },
    place(_t, X, Z, face, isMoving, jump) {
      const dx = X - lastX;
      const dz = Z - lastZ;
      if (!jump && isMoving && Number.isFinite(dx) && Math.hypot(dx, dz) > 1e-4) dir = dir8(dx, dz);
      else if (face !== null && !isMoving) dir = dir8(Math.sin(face), Math.cos(face));
      moving = isMoving && !jump;
      lastX = X;
      lastZ = Z;
      holder.position.set(X, o.heightAt(X, Z) + hover, Z);
    },
    setGhost(isDead, lv) {
      dead = isDead;
      level = lv;
      const ghostArt = dead && !!ghost && !!art.ghostKey;
      setGhostTint(U, dead ? (ghostArt ? 0.35 : 1) : 0);
      hover = dead ? TINT_HOVER_M : 0;
      cellKey = '';
      if (Number.isFinite(lastX)) holder.position.y = o.heightAt(lastX, lastZ) + hover;
    },
    setClips() {
      /* billboards have no clips: hands / collapses are drawn by the overlay (WP4) */
    },
    playOnce() {
      return false;
    },
    setFade(a) {
      setFade(U, a);
    },
    setLod() {
      /* already colour-only, no shadow */
    },
    update(t, _dt, ctx: BodyFrameCtx) {
      if (disposed) return;
      mesh.quaternion.copy(ctx.camQuat); // face the (orthographic) pixel camera
      if (dead && ghost && art.ghostKey) {
        const key = level === 2 && art.spentKey ? art.spentKey : art.ghostKey;
        setCell(ghostSheet!, key, ghostSheet === 'cast-ghosts' ? ghostFrameIndex(t, ctx.still) : 0);
      } else setCell(art.sheet, art.key, frameIndex(moving && !dead, t, art, ctx.still));
    },
    frame() {
      return frameName;
    },
    lanternAnchor() {
      return false;
    },
    lookInfo() {
      return { ghostK: U.uCtGhost.value.x, alpha: +U.uCtGhost.value.y.toFixed(2), tint: U.uCtTint.value.w, hover, ghostArt: dead && !!ghost && !!art.ghostKey };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geo.dispose();
      mat.dispose(); // the sheet textures are shared per engine (releaseBillboardSheets)
      holder.removeFromParent();
    },
  };
  return body;
}
