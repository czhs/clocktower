// v3 WP0 (v3-lead). coords.ts: px <-> metres (outdoors + all 15 interiors) and the pixel-camera projection
// (docs/v3/INTEGRATION.md §1.5, §2.3) — against hand-computed cases and a three.js camera set up exactly
// like pixel3d's PixelCamera.update (no WebGL needed).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  bandRoom,
  cssToNdc,
  cssToRay,
  doorwayTile,
  HOUSE_COUNT,
  INTERIOR_ROOMS,
  interiorMap,
  interiorOrigin,
  invert4,
  locToM,
  MARGIN,
  mToPx,
  ndcToCss,
  pixelScaleFor,
  pxToM,
  rayGround,
  ROOM_T,
  shaderOffset,
  tileFeetM,
  worldToCss,
  type ProjectionState,
} from '../../src/game3d/coords';

const VENDOR = fileURLToPath(new URL('../../../../v3/pixel3d/src/', import.meta.url));

describe('outdoors px <-> metres', () => {
  it('round-trips exactly (1e-9) and 16 px = 1 m, y-down px = +Z', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 360, y: 316 },
      { x: 719.99, y: 687.5 },
      { x: 13.37, y: 1.0001 },
    ]) {
      const m = pxToM(p);
      const back = mToPx(m);
      expect(Math.abs(back.x - p.x)).toBeLessThan(1e-9);
      expect(Math.abs(back.y - p.y)).toBeLessThan(1e-9);
    }
    expect(pxToM({ x: 32, y: 48 })).toEqual({ X: 2, Y: 0, Z: 3 });
    expect(tileFeetM(22, 27)).toEqual({ X: 22.5, Z: 27.875 });
  });
});

describe('interiors (§2.3)', () => {
  it('band rooms: stride 13 x 14, 12 x 12, pairwise disjoint with a free column, inside 112 x 43', () => {
    const rooms = Array.from({ length: HOUSE_COUNT }, (_, i) => bandRoom(i));
    for (const r of rooms) {
      expect(r.x).toBeGreaterThanOrEqual(47);
      expect(r.x + r.w).toBeLessThanOrEqual(112);
      expect(r.y + r.h).toBeLessThanOrEqual(43);
    }
    for (let a = 0; a < rooms.length; a++)
      for (let b = a + 1; b < rooms.length; b++) {
        const A = rooms[a]!;
        const B = rooms[b]!;
        const gapX = Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w));
        const gapY = Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h));
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(1);
      }
    expect(doorwayTile(bandRoom(0))).toEqual({ x: 53, y: 12 });
  });

  it.each(Array.from({ length: HOUSE_COUNT }, (_, i) => i))('house-%i: doorway centre -> doorway tile centre; round trip exact', (i) => {
    const map = interiorMap(i);
    const D = doorwayTile(map.room);
    const o = interiorOrigin(i);
    const d = INTERIOR_ROOMS[i]!.d;
    // the doorway gap centre is room-local (0, RD/2 + RT/2)
    const px = map.toPx({ X: o.X, Z: o.Z + d / 2 + ROOM_T / 2 });
    expect(px.x).toBeCloseTo((D.x + 0.5) * 16, 9);
    expect(px.y).toBeCloseTo((D.y + 0.5) * 16, 9);
    for (const p of [
      { x: (map.room.x + 1) * 16, y: (map.room.y + 3) * 16 + 7 },
      { x: (map.room.x + 11) * 16 + 15.5, y: (map.room.y + 11) * 16 },
    ]) {
      const back = map.toPx(map.toM(p));
      expect(Math.abs(back.x - p.x)).toBeLessThan(1e-9);
      expect(Math.abs(back.y - p.y)).toBeLessThan(1e-9);
    }
    // 1 m = 16 px inside too
    const a = map.toM({ x: 1000, y: 100 });
    const b = map.toM({ x: 1016, y: 132 });
    expect(b.X - a.X).toBeCloseTo(1, 12);
    expect(b.Z - a.Z).toBeCloseTo(2, 12);
    expect(locToM({ x: 1000, y: 100 }, `bld:house-${i}`)).toEqual(a);
  });

  it.each(Array.from({ length: HOUSE_COUNT }, (_, i) => i))('house-%i: floor + walls fit the 12 x 12 band (house-3, 10 m, with no slack)', (i) => {
    const map = interiorMap(i);
    const o = interiorOrigin(i);
    const { w, d } = INTERIOR_ROOMS[i]!;
    const tile = (X: number, Z: number) => {
      const p = map.toPx({ X, Z });
      return { x: p.x / 16 - map.room.x, y: p.y / 16 - map.room.y };
    };
    const nw = tile(o.X - w / 2 - ROOM_T, o.Z - d / 2 - ROOM_T);
    const se = tile(o.X + w / 2 + ROOM_T, o.Z + d / 2 + ROOM_T);
    expect(nw.x).toBeGreaterThanOrEqual(0);
    expect(nw.y).toBeGreaterThanOrEqual(0);
    expect(se.x).toBeLessThanOrEqual(12);
    expect(se.y).toBeLessThanOrEqual(12);
    if (i === 3) {
      // floor tiles 2..10 whole, walls on tiles 1 and 11
      expect(tile(o.X - w / 2, o.Z).x).toBeCloseTo(1.5, 9);
      expect(tile(o.X + w / 2, o.Z).x).toBeCloseTo(11.5, 9);
    }
  });

  it('outdoors / other buildings', () => {
    expect(locToM({ x: 16, y: 32 }, 'outdoors')).toEqual({ X: 1, Z: 2 });
    expect(locToM({ x: 16, y: 32 }, 'bld:tavern')).toBeNull();
  });

  it('the embedded room table and origin constants match the vendor sources', () => {
    for (let i = 0; i < HOUSE_COUNT; i++) {
      const src = readFileSync(`${VENDOR}town/interiors/house-${i}.js`, 'utf8');
      const m = /export const ROOM = \{\s*w: ([\d.]+), d: ([\d.]+)/.exec(src);
      expect(m, `house-${i} ROOM`).toBeTruthy();
      expect(Number(m![1])).toBe(INTERIOR_ROOMS[i]!.w);
      expect(Number(m![2])).toBe(INTERIOR_ROOMS[i]!.d);
      expect(/\bt: /.test(src.slice(m!.index, m!.index + 200))).toBe(false); // wall thickness stays the 0.3 default
    }
    const idx = readFileSync(`${VENDOR}town/interiors/index.js`, 'utf8');
    expect(idx).toContain('export const INTERIOR_ORIGIN = { x: 200, z: 20, spacing: 30 };');
    expect(idx).toContain('export const INTERIOR_TIE = new THREE.Vector3(0.0047, 0, 0.0071);');
    expect(readFileSync(`${VENDOR}town/interiors/kit.js`, 'utf8')).toContain('this.T = o.t ?? 0.3');
    expect(readFileSync(`${VENDOR}core/PixelCamera.js`, 'utf8')).toContain(`export const MARGIN = ${MARGIN};`);
  });
});

// A three.js camera exactly as PixelCamera.update builds it (ortho, MARGIN texels of padding per side).
function pixelCam(o: { target: THREE.Vector3; yaw?: number; pitch?: number; viewHeight?: number; lowW: number; lowH: number; snap?: boolean }) {
  const yaw = o.yaw ?? 0;
  const pitch = o.pitch ?? Math.PI / 6;
  const vh = o.viewHeight ?? 12;
  const t = vh / o.lowH;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 340);
  const halfW = (o.lowW / 2 + MARGIN) * t;
  const halfH = (o.lowH / 2 + MARGIN) * t;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.updateProjectionMatrix();
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const F = new THREE.Vector3(-cp * sy, -sp, -cp * cy);
  const R = new THREE.Vector3(cy, 0, -sy);
  const U = new THREE.Vector3(-sp * sy, cp, -sp * cy);
  const pos = o.target.clone().addScaledVector(F, -120);
  const offset = { x: 0, y: 0 };
  if (o.snap !== false) {
    const x = o.target.dot(R);
    const y = o.target.dot(U);
    const xs = Math.round(x / t) * t;
    const ys = Math.round(y / t) * t;
    offset.x = (x - xs) / t;
    offset.y = (y - ys) / t;
    pos.addScaledVector(R, xs - x).addScaledVector(U, ys - y);
  }
  cam.position.copy(pos);
  cam.up.copy(U);
  cam.lookAt(pos.clone().add(F));
  cam.updateMatrixWorld(true);
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  return { cam, offset, vp: vp.elements, t };
}

function state(c: ReturnType<typeof pixelCam>, lowW: number, lowH: number, scale: number, snapScreen: boolean, rect = { left: 10, top: 20 }): ProjectionState {
  return { lowW, lowH, scale, offset: c.offset, snapScreen, height: lowH * scale, rect, viewProj: c.vp };
}

describe('projection (§1.5)', () => {
  it('shaderOffset rounds to whole screen px only with snapScreen', () => {
    expect(shaderOffset({ offset: { x: 0.3, y: -0.2 }, snapScreen: true, scale: 3 })).toEqual({ x: 1 / 3, y: -1 / 3 });
    expect(shaderOffset({ offset: { x: 0.3, y: -0.2 }, snapScreen: false, scale: 3 })).toEqual({ x: 0.3, y: -0.2 });
  });

  it.each([2, 3, 4])('scale %i: NDC centre -> canvas centre minus the shader offset (hand-computed)', (scale) => {
    const lowW = 320;
    const lowH = 180;
    const base = { lowW, lowH, scale, height: lowH * scale, rect: { left: 10, top: 20 }, viewProj: new THREE.Matrix4().elements };
    // offset 0: the padded centre (lowW + 2M)/2 minus MARGIN = lowW/2 -> exactly the canvas centre
    const c0 = ndcToCss({ ...base, offset: { x: 0, y: 0 }, snapScreen: true }, { x: 0, y: 0 });
    expect(c0.x).toBeCloseTo(10 + (lowW / 2) * scale, 9);
    expect(c0.y).toBeCloseTo(20 + lowH * scale - (lowH / 2) * scale, 9);
    // offset (0.3, -0.2) texels: snapScreen rounds to whole px, else exact
    const off = { x: 0.3, y: -0.2 };
    const sn = ndcToCss({ ...base, offset: off, snapScreen: true }, { x: 0, y: 0 });
    expect(sn.x).toBeCloseTo(10 + (lowW / 2) * scale - Math.floor(0.3 * scale + 0.5), 9);
    expect(sn.y).toBeCloseTo(20 + (lowH / 2) * scale + Math.floor(-0.2 * scale + 0.5), 9);
    const ex = ndcToCss({ ...base, offset: off, snapScreen: false }, { x: 0, y: 0 });
    expect(ex.x).toBeCloseTo(10 + (lowW / 2 - 0.3) * scale, 9);
    expect(ex.y).toBeCloseTo(20 + (lowH / 2 - 0.2) * scale, 9);
    // the left edge of the padded frame is MARGIN texels off-canvas
    const edge = ndcToCss({ ...base, offset: { x: 0, y: 0 }, snapScreen: true }, { x: -1, y: 1 });
    expect(edge.x).toBeCloseTo(10 - MARGIN * scale, 9);
    expect(edge.y).toBeCloseTo(20 - MARGIN * scale, 9);
  });

  it.each([
    [2, true],
    [3, true],
    [4, true],
    [3, false],
  ] as const)('scale %i snap %s: the camera target lands on the canvas centre (± the shader offset); css <-> ndc inverts', (scale, snapScreen) => {
    const lowW = 320;
    const lowH = 180;
    const target = new THREE.Vector3(22.517, 0, 19.733);
    const c = pixelCam({ target, lowW, lowH });
    const s = state(c, lowW, lowH, scale, snapScreen);
    const css = worldToCss(s, target.x, target.y, target.z);
    const off = shaderOffset(s);
    // the snapped camera centre is the target minus offset texels; the shader adds off back
    expect(css.x).toBeCloseTo(10 + (lowW / 2 + c.offset.x - off.x) * scale, 6);
    expect(css.y).toBeCloseTo(20 + lowH * scale - (lowH / 2 + c.offset.y - off.y) * scale, 6);
    const n = cssToNdc(s, css.x, css.y);
    const back = ndcToCss(s, n);
    expect(back.x).toBeCloseTo(css.x, 9);
    expect(back.y).toBeCloseTo(css.y, 9);
  });

  it.each([2, 3, 4])('scale %i: a ground point 3 m right of the target moves right by 3 m / texelWorld texels', (scale) => {
    const lowW = 400;
    const lowH = 200;
    const target = new THREE.Vector3(10, 0, 10);
    const c = pixelCam({ target, lowW, lowH });
    const s = state(c, lowW, lowH, scale, true);
    const a = worldToCss(s, 10, 0, 10);
    const b = worldToCss(s, 13, 0, 10);
    expect(b.x - a.x).toBeCloseTo((3 / c.t) * scale, 6);
    expect(b.y - a.y).toBeCloseTo(0, 6);
    // 1 m up (+Y) moves up the screen by cos(pitch) m
    const up = worldToCss(s, 10, 1, 10);
    expect(a.y - up.y).toBeCloseTo((Math.cos(Math.PI / 6) / c.t) * scale, 6);
  });

  it('screen -> ground ray hits the original ground point (pick round trip), also at height', () => {
    const lowW = 320;
    const lowH = 180;
    const c = pixelCam({ target: new THREE.Vector3(22.5, 0, 19.75), lowW, lowH });
    const s = state(c, lowW, lowH, 3, true);
    for (const [X, Y, Z] of [
      [22.5, 0, 19.75],
      [18.2, 0, 24.1],
      [27.9, 0.6, 15.3],
    ] as const) {
      const css = worldToCss(s, X, Y, Z);
      const ray = cssToRay(s, css.x, css.y)!;
      const hit = rayGround(ray, () => Y, 2)!;
      expect(hit.X).toBeCloseTo(X, 6);
      expect(hit.Z).toBeCloseTo(Z, 6);
    }
  });

  it('invert4 inverts', () => {
    const m = new THREE.Matrix4().makeRotationY(0.7).setPosition(3, -2, 5).elements;
    const inv = invert4(m)!;
    const p = new THREE.Matrix4().fromArray(m).multiply(new THREE.Matrix4().fromArray(inv)).elements;
    for (let i = 0; i < 16; i++) expect(p[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 9);
    expect(invert4(new Array(16).fill(0))).toBeNull();
  });

  it('pixelScale: round(h/360), low tier round(h/300), never below 1', () => {
    expect(pixelScaleFor(1080, 'high')).toBe(3);
    expect(pixelScaleFor(1080, 'low')).toBe(4);
    expect(pixelScaleFor(540, 'high')).toBe(2);
    expect(pixelScaleFor(100, 'high')).toBe(1);
  });
});

// ------------------------------------------------------------------------------------------------ C1: the clock tower room
import { isTowerLocation, roomMapOf, TOWER_LOCATION, TOWER_ROOM } from '../../src/game3d/coords';
import { towerRoomV3, townLayoutV3 as v3Layout } from '@ct/assets/hollowmere';

describe('the clock tower room (bld:clocktower)', () => {
  it('TOWER_ROOM equals the exported towerRoomV3 anchor', () => {
    expect(TOWER_ROOM.anchorPx).toEqual(towerRoomV3.anchorPx);
    expect({ x: TOWER_ROOM.anchorM.X, z: TOWER_ROOM.anchorM.Z }).toEqual(towerRoomV3.anchorM);
    expect(isTowerLocation(TOWER_LOCATION)).toBe(true);
    expect(isTowerLocation('bld:house-1')).toBe(false);
  });
  it('the doorway tile centre is the exit spot; the interior door / visit point land in the room; round trip exact', () => {
    const b = v3Layout.buildings.find((x) => x.id === 'clocktower')!;
    const m = roomMapOf('bld:clocktower', b.interior)!;
    const D = { x: (b.interior.x + 6 + 0.5) * 16, y: (b.interior.y + 11 + 0.5) * 16 };
    expect(m.toM(D)).toEqual({ X: 650, Z: 22.5 });
    const door = m.toM({ x: (b.interiorDoor.x + 0.5) * 16, y: (b.interiorDoor.y + 0.875) * 16 });
    expect(door.X).toBeCloseTo(650, 6);
    expect(door.Z).toBeGreaterThan(20 - 2.75);
    expect(door.Z).toBeLessThan(22.5);
    const v = m.toM({ x: (b.visitPoint!.x + 0.5) * 16, y: (b.visitPoint!.y + 0.875) * 16 });
    expect(v.Z).toBeLessThan(20 - 0.6); // the visit point is up on the landing (z < -0.6 room-local)
    for (const p of [D, { x: 1800.25, y: 30.5 }]) {
      const q = m.toPx(m.toM(p));
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
    expect(locToM(D, 'bld:clocktower')).toEqual({ X: 650, Z: 22.5 });
  });
});
