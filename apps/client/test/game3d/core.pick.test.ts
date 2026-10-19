// v3 WP1 (v3-core). screenToWorld / the two-stage pick (docs/v3/INTEGRATION.md §3 "ST taps"), the camera goal and
// the tap rules, over the REAL pixel3d PixelCamera (no WebGL: its update() only builds matrices).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { townLayout } from '@ct/assets';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import { isBlockedPx, tileCenterPx, type TownLayout } from '@ct/protocol';
import { cssToRay, interiorMap, PX_PER_M, worldToCss, type ProjectionState } from '../../src/game3d/coords';
import { CameraRig, cameraGoal, fitViewHeight, interiorShot, ladderCeil, VOTE_VIEW_HEIGHT, ZOOM_LADDER, type RigHost } from '../../src/game3d/input/camera';
import { layoutProxies, pickHouse, pickScreen, rayBoxEntry, type HouseProxy } from '../../src/game3d/input/pick';
import { resolveTap } from '../../src/game3d/input/tap';
import { doorSpots } from '../../src/game/rules/doors';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VENDOR = fileURLToPath(new URL('../../../../v3/pixel3d/src/', import.meta.url));

/** The real vendor camera (only matrices, no WebGL). */
interface PCam {
  cam: THREE.OrthographicCamera;
  offset: THREE.Vector2;
  readonly texelWorld: number;
  set(o: object): void;
  resize(w: number, h: number): void;
  update(): void;
  snapWorld(p: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3;
}
const { PixelCamera } = (await import('@pixel3d/core/PixelCamera.js')) as unknown as { PixelCamera: new (engine: unknown) => PCam };

/** A fake engine host around the real PixelCamera, projection() exactly as vendor/engineHost.ts builds it. */
function fakeHost(o: { w: number; h: number; scale: number; rect?: { left: number; top: number } }) {
  const engine = {
    time: 0,
    uniforms: { uCameraPos: { value: new THREE.Vector3() }, uCameraDir: { value: new THREE.Vector3() }, uTexelWorld: { value: 0 } },
    width: o.w,
    height: o.h,
    pixelScale: o.scale,
    lowW: Math.ceil(o.w / o.scale),
    lowH: Math.ceil(o.h / o.scale),
  } as unknown as Record<string, unknown> & { width: number; height: number; pixelScale: number; lowW: number; lowH: number; camera: PCam };
  const cam = new PixelCamera(engine);
  cam.resize(engine.lowW, engine.lowH);
  engine.camera = cam;
  const vp = new THREE.Matrix4();
  const rect = o.rect ?? { left: 0, top: 0 };
  const host: RigHost = {
    engine: engine as unknown as RigHost['engine'],
    projection(): ProjectionState {
      vp.multiplyMatrices(cam.cam.projectionMatrix, cam.cam.matrixWorldInverse);
      return { lowW: engine.lowW, lowH: engine.lowH, scale: engine.pixelScale, offset: { x: cam.offset.x, y: cam.offset.y }, snapScreen: true, height: engine.height, rect, viewProj: vp.elements };
    },
  };
  return { host, cam, engine };
}

const flat = () => 0;

/** Five camera states: rest on the square, leaning N / S / E / W toward the viewer, at scales 2 / 3 / 4 and two aspects. */
const STATES: { name: string; me: { x: number; y: number }; w: number; h: number; scale: number }[] = [
  { name: 'square rest 960x540 x2', me: { x: 360, y: 330 }, w: 960, h: 540, scale: 2 },
  { name: 'lean north 1280x960 x2', me: { x: 360, y: 120 }, w: 1280, h: 960, scale: 2 },
  { name: 'lean south 1920x1080 x3', me: { x: 380, y: 560 }, w: 1920, h: 1080, scale: 3 },
  { name: 'lean east 1440x1080 x3', me: { x: 620, y: 320 }, w: 1440, h: 1080, scale: 3 },
  { name: 'lean west 2560x1440 x4', me: { x: 110, y: 300 }, w: 2560, h: 1440, scale: 4 },
];

function rigAt(layout: TownLayout, s: (typeof STATES)[number], proxies?: HouseProxy[]) {
  const { host, cam } = fakeHost({ w: s.w, h: s.h, scale: s.scale, rect: { left: 7, top: 13 } });
  const rig = new CameraRig(layout);
  rig.attach({ host, heightAt: flat, ...(proxies ? { proxies } : {}) });
  rig.step(0, { me: { ...s.me, location: 'outdoors' }, voting: false, snap: true });
  cam.update();
  return { rig, host, cam };
}

describe('vendor baseline the camera relies on', () => {
  it('ZOOM_LADDER and the gameplay / vote presets match pixel3d', () => {
    const pc = readFileSync(`${VENDOR}core/PixelCamera.js`, 'utf8');
    expect(pc).toContain(`export const ZOOM_LADDER = [${ZOOM_LADDER.join(', ')}];`);
    const api = readFileSync(`${VENDOR}town/api.js`, 'utf8');
    expect(api).toMatch(/gameplay: \{ yaw: 0, viewHeight: 12,/);
    expect(api).toMatch(new RegExp(`vote: \\{ yaw: 0, viewHeight: ${VOTE_VIEW_HEIGHT},`));
  });
});

describe('camera goal (pure)', () => {
  it('ladder stops and the portrait fit', () => {
    expect(ladderCeil(12)).toBe(12);
    expect(ladderCeil(12.01)).toBe(15);
    expect(ladderCeil(1000)).toBe(90);
    expect(fitViewHeight(16 / 9)).toBe(12);
    expect(fitViewHeight(4 / 3)).toBe(15); // 18 m / 1.333 = 13.5 -> 15
    expect(fitViewHeight(390 / 844)).toBe(45); // phone portrait: capped
  });
  it('rests on the square inside it, leans 0.85 toward the viewer outside, clamps to the town', () => {
    const rest = cameraGoal({ layout: townLayoutV3, me: { x: 360, y: 320, location: 'outdoors' }, aspect: 16 / 9, voting: false });
    expect(rest).toMatchObject({ X: 22.5, Z: 19.5, viewHeight: 12 });
    const away = cameraGoal({ layout: townLayoutV3, me: { x: 520, y: 330, location: 'outdoors' }, aspect: 16 / 9, voting: false });
    expect(away.X).toBeCloseTo(22.5 + (520 / 16 - 22.5) * 0.85, 9);
    expect(away.Z).toBeCloseTo(19.5 + ((330 - 10) / 16 - 19.5) * 0.85, 9);
    const corner = cameraGoal({ layout: townLayoutV3, me: { x: 4, y: 4, location: 'outdoors' }, aspect: 16 / 9, voting: false });
    expect(corner.X).toBeCloseTo((12 * 16) / 9 / 2, 9); // half the visible width from the west edge
    expect(corner.Z).toBeCloseTo(12, 9); // half the ground depth (viewHeight / sin 30° / 2)
  });
  it('vote framing on the square during a nomination; not when away from it', () => {
    expect(cameraGoal({ layout: townLayoutV3, me: { x: 360, y: 320, location: 'outdoors' }, aspect: 16 / 9, voting: true })).toMatchObject({ X: 22.5, Z: 19.5, viewHeight: 19 });
    expect(cameraGoal({ layout: townLayoutV3, me: { x: 650, y: 330, location: 'outdoors' }, aspect: 16 / 9, voting: true }).viewHeight).toBe(12);
  });
  it('inside: the interior camera when given, else the room shot', () => {
    const given = { X: 1, Y: 0, Z: 2, viewHeight: 7 };
    expect(cameraGoal({ layout: townLayoutV3, me: { x: 0, y: 0, location: 'bld:house-5' }, aspect: 16 / 9, voting: false, interior: given })).toBe(given);
    const s = interiorShot('bld:house-5', 16 / 9)!;
    expect(s.X).toBeCloseTo(200 + 30 * 5 + 0.0047, 6);
    expect(s.viewHeight).toBeGreaterThan(5);
    expect(interiorShot('bld:tavern', 16 / 9)).toBeNull();
  });
});

describe('ray vs proxy boxes', () => {
  const box: HouseProxy = { id: 'b', center: [10, 10], half: [2, 1], y: [0, 3], ry: 0 };
  it('hits, misses and enters at the near face', () => {
    const down = { origin: { X: 10, Y: 10, Z: 10 }, dir: { X: 0, Y: -1, Z: 0 } };
    expect(rayBoxEntry(down, box)).toBeCloseTo(7, 9);
    expect(rayBoxEntry({ origin: { X: 13, Y: 10, Z: 10 }, dir: { X: 0, Y: -1, Z: 0 } }, box)).toBeNull();
    expect(rayBoxEntry({ origin: { X: 10, Y: 1, Z: 10 }, dir: { X: 1, Y: 0, Z: 0 } }, box)).toBe(0); // starts inside
  });
  it('rotation: a 90° box swaps its extents', () => {
    const r = { ...box, ry: Math.PI / 2 };
    expect(rayBoxEntry({ origin: { X: 11.5, Y: 10, Z: 10 }, dir: { X: 0, Y: -1, Z: 0 } }, r)).toBeNull(); // half x is now 1
    expect(rayBoxEntry({ origin: { X: 10, Y: 10, Z: 11.5 }, dir: { X: 0, Y: -1, Z: 0 } }, r)).not.toBeNull(); // half z is now 2
  });
  it('the nearest of several', () => {
    const far: HouseProxy = { ...box, id: 'far', y: [0, 1] };
    const near: HouseProxy = { ...box, id: 'near', y: [0, 5] };
    expect(pickHouse({ origin: { X: 10, Y: 10, Z: 10 }, dir: { X: 0, Y: -1, Z: 0 } }, [far, near])?.id).toBe('near');
  });
  it('layout proxies cover every building footprint', () => {
    const ps = layoutProxies(townLayoutV3);
    expect(ps.map((p) => p.id)).toEqual(townLayoutV3.buildings.map((b) => b.id));
    for (const [i, b] of townLayoutV3.buildings.entries()) {
      const p = ps[i]!;
      expect(p.center[0]).toBeCloseTo(b.footprint.x + b.footprint.w / 2, 9);
      expect(p.half[1]).toBeCloseTo(b.footprint.h / 2 + 0.35, 9);
    }
  });
});

describe('two-stage pick at five camera states (Hollowmere)', () => {
  const L = townLayoutV3;
  for (const s of STATES)
    it(s.name, () => {
      const { rig, host } = rigAt(L, s);
      const pr = host.projection();
      let roofs = 0;
      let lanes = 0;
      for (const b of L.buildings) {
        const f = b.footprint;
        // a roof click (house centre, 4.2 m up) means the house: its door tile
        const roof = worldToCss(pr, f.x + f.w / 2, 4.2, f.y + f.h / 2);
        const inView = (p: { x: number; y: number }) => p.x >= 7 && p.y >= 13 && p.x <= 7 + s.w && p.y <= 13 + s.h;
        if (inView(roof)) {
          const hit = rig.screenToWorld(roof.x, roof.y);
          // a taller house in front may legitimately take the click: it must still be a house door
          expect(hit?.houseId, `${b.id} roof`).toBeTruthy();
          if (hit?.houseId === b.id) {
            const d = tileCenterPx(L, b.door);
            expect(hit).toMatchObject({ x: d.x, y: d.y, location: 'outdoors' });
            roofs++;
          }
        }
        // a click on the lane 2.5 tiles in front of the door (outward) is that lane tile
        const n = b.doorNormal ?? [0, 1];
        const lane = { x: (b.door.x + 0.5 + n[0] * 2.5) * 16, y: (b.door.y + 0.875 + n[1] * 2.5) * 16 };
        if (isBlockedPx(L, lane.x, lane.y)) continue;
        const c = worldToCss(pr, lane.x / PX_PER_M, 0, lane.y / PX_PER_M);
        if (!inView(c)) continue;
        const hit = pickScreen(pr, { layout: L, heightAt: flat, proxies: layoutProxies(L), shown: 'outdoors' }, c.x, c.y);
        if (hit?.houseId) continue; // the lane tile lies inside another footprint's box margin (rotated neighbours)
        expect(hit, `${b.id} lane`).not.toBeNull();
        expect(Math.abs(hit!.x - lane.x), `${b.id} lane x`).toBeLessThan(0.6 * s.scale);
        expect(Math.abs(hit!.y - lane.y), `${b.id} lane y`).toBeLessThan(1.2 * s.scale);
        lanes++;
      }
      expect(roofs).toBeGreaterThan(0);
      expect(lanes).toBeGreaterThan(0);
    });

  it('a ground tap behind a house resolves to the ground, a tap on its roof to the house (the naive ground ray would land behind it)', () => {
    const { rig, host } = rigAt(L, STATES[0]!);
    const b = L.buildings.find((x) => x.id === 'house-5')!;
    const f = b.footprint;
    const pr = host.projection();
    const roof = worldToCss(pr, f.x + f.w / 2, 4.2, f.y + f.h / 2);
    const naive = cssToRay(pr, roof.x, roof.y)!;
    const t = -naive.origin.Y / naive.dir.Y;
    const groundZ = naive.origin.Z + naive.dir.Z * t;
    expect(groundZ).toBeLessThan(f.y); // north of the house: the reason for stage 1
    expect(rig.screenToWorld(roof.x, roof.y)?.houseId).toBe('house-5');
  });

  it('inside a house: the floor plane through the interior map', () => {
    const b = L.buildings.find((x) => x.id === 'house-5')!;
    const { host, cam } = fakeHost({ w: 960, h: 540, scale: 2 });
    const rig = new CameraRig(L);
    rig.attach({ host, heightAt: flat });
    const m = interiorMap(5, b.interior);
    const bed = tileCenterPx(L, b.bed!);
    rig.step(0, { me: { ...bed, location: 'bld:house-5' }, voting: false, snap: true });
    cam.update();
    const bm = m.toM(bed);
    const c = worldToCss(host.projection(), bm.X, 0, bm.Z);
    const hit = rig.screenToWorld(c.x, c.y)!;
    expect(hit.location).toBe('bld:house-5');
    expect(hit.x).toBeCloseTo(bed.x, 0);
    expect(hit.y).toBeCloseTo(bed.y, 0);
    // worldToScreen round trip, and null for another location
    const w = rig.worldToScreen(bed, 'bld:house-5')!;
    expect(w.x).toBeCloseTo(c.x, 6);
    expect(rig.worldToScreen(bed, 'outdoors')).toBeNull();
  });
});

describe('tap rules', () => {
  const L = townLayoutV3;
  const doors = doorSpots(L);
  const b5 = L.buildings.find((x) => x.id === 'house-5')!;
  const d5 = tileCenterPx(L, b5.door);
  const roofHit = { x: d5.x, y: d5.y, location: 'outdoors' as const, houseId: 'house-5' };
  const laneHit = { x: 300, y: 420, location: 'outdoors' as const };
  it('a roof pick enters that house (player walks, Storyteller teleports)', () => {
    expect(resolveTap({ layout: L, doors, location: 'outdoors', storyteller: false }, roofHit)).toEqual({ kind: 'walk', x: d5.x, y: d5.y, enter: 'house-5' });
    expect(resolveTap({ layout: L, doors, location: 'outdoors', storyteller: true }, roofHit)).toEqual({ kind: 'st-building', buildingId: 'house-5' });
  });
  it('a lane pick walks / teleports to the lane point', () => {
    expect(resolveTap({ layout: L, doors, location: 'outdoors', storyteller: false }, laneHit)).toEqual({ kind: 'walk', x: 300, y: 420, enter: null });
    expect(resolveTap({ layout: L, doors, location: 'outdoors', storyteller: true }, { ...laneHit, x: 300.4, y: 419.6 })).toEqual({ kind: 'st-point', x: 300, y: 420 });
  });
  it('a ground pick on a doorstep means the house (v2 tapTarget)', () => {
    expect(resolveTap({ layout: L, doors, location: 'outdoors', storyteller: false }, { x: d5.x + 3, y: d5.y + 2, location: 'outdoors' })).toMatchObject({ kind: 'walk', enter: 'house-5' });
  });
  it('inside: floor walks (also the Storyteller), the doorway walks out, nothing = nothing', () => {
    const bed = tileCenterPx(L, b5.bed!);
    const inside = { layout: L, doors, location: 'bld:house-5' as const };
    expect(resolveTap({ ...inside, storyteller: false }, { ...bed, location: 'bld:house-5' })).toMatchObject({ kind: 'inside', tap: { exit: false } });
    expect(resolveTap({ ...inside, storyteller: true }, { ...bed, location: 'bld:house-5' })).toMatchObject({ kind: 'inside' });
    const doorway = { x: (b5.interiorDoor.x + 0.5) * 16, y: (b5.interiorDoor.y + 1.5) * 16 };
    expect(resolveTap({ ...inside, storyteller: false }, { ...doorway, location: 'bld:house-5' })).toMatchObject({ kind: 'inside', tap: { exit: true } });
    expect(resolveTap({ ...inside, storyteller: true }, { x: 5, y: 5, location: 'bld:house-5' })).toEqual({ kind: 'none' });
    expect(resolveTap({ ...inside, storyteller: false }, null)).toEqual({ kind: 'none' });
  });
  it('v2 layout: footprint taps still mean the house', () => {
    const v2doors = doorSpots(townLayout);
    const b = townLayout.buildings[0]!;
    const f = b.footprint;
    expect(resolveTap({ layout: townLayout, doors: v2doors, location: 'outdoors', storyteller: false }, { x: (f.x + 1) * 16, y: (f.y + 1) * 16, location: 'outdoors' })).toMatchObject({ kind: 'walk', enter: b.id });
  });
});
