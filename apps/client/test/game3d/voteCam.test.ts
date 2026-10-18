// v3 C1 (integrator). The voting-circle camera (user request in flight 1, docs/v3/INTEGRATION.md §9.1): the switch rule
// (nominations / a vote, on the square), the vendor's computed votecam fit (world/voteFrame.ts) checked through the
// REAL pixel3d PixelCamera (every seat and the facing dial inside the canvas, clear of the HUD keep-outs), the stepped
// transitions of the camera rig and the screen-relative keys under the turned camera.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { townLayoutV3 } from '@ct/assets/hollowmere';
import type { NominationView, PlayerGameView } from '@ct/protocol';
import { worldToCss, type ProjectionState } from '../../src/game3d/coords';
import { CameraRig, cameraMode, interiorShot, steppedPose, TRANS_S, TRANS_STEPS, turnKeys, type CameraPose, type CameraShot, type RigHost } from '../../src/game3d/input/camera';
import { voteCameraWanted } from '../../src/game3d/net/core';
import { chooseVoteFrame, contentPoints, facingDial, keepOuts, voteFrame, VOTE_PITCH, VOTE_PITCH_PORTRAIT, VOTE_YAWS, PREFER, type Dial, type V3 } from '../../src/game3d/world/voteFrame';

interface PCam {
  cam: THREE.OrthographicCamera;
  offset: THREE.Vector2;
  readonly texelWorld: number;
  yaw: number;
  pitch: number;
  viewHeight: number;
  target: THREE.Vector3;
  set(o: object): void;
  resize(w: number, h: number): void;
  update(): void;
  snapWorld(p: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3;
}
const { PixelCamera } = (await import('@pixel3d/core/PixelCamera.js')) as unknown as { PixelCamera: new (engine: unknown) => PCam };
const { seatPos } = (await import('@pixel3d/town/layout.js')) as unknown as { seatPos(i: number, n: number): { x: number; z: number } };

function fakeHost(o: { w: number; h: number; scale: number }) {
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
  const host: RigHost = {
    engine: engine as unknown as RigHost['engine'],
    projection(): ProjectionState {
      vp.multiplyMatrices(cam.cam.projectionMatrix, cam.cam.matrixWorldInverse);
      return { lowW: engine.lowW, lowH: engine.lowH, scale: engine.pixelScale, offset: { x: cam.offset.x, y: cam.offset.y }, snapScreen: true, height: engine.height, rect: { left: 0, top: 0 }, viewProj: vp.elements };
    },
  };
  return { host, cam, engine };
}

/** The vendor's 15 seat stones (layout.js seatPos), stone top 0.235 m (vendor/town.ts seatStones). */
const SEATS: V3[] = Array.from({ length: 15 }, (_, i) => ({ ...seatPos(i, 15), y: 0.235 }));
/** The clocktower.js dial constants (vendor/town.ts towerDials fallback). */
const DIALS: Dial[] = [
  { c: { x: 22.5, y: 5.45, z: 8.4 }, n: { x: 0, y: 0, z: 1 }, r: 1.42, k: 1 },
  { c: { x: 24.25, y: 5.45, z: 6.8 }, n: { x: 1, y: 0, z: 0 }, r: 1.22, k: 0.86 },
  { c: { x: 22.5, y: 5.45, z: 5.2 }, n: { x: 0, y: 0, z: -1 }, r: 1.22, k: 0.86 },
  { c: { x: 20.75, y: 5.45, z: 6.8 }, n: { x: -1, y: 0, z: 0 }, r: 1.22, k: 0.86 },
];

const nomination = (status: NominationView['status']): NominationView => ({ id: 'n1', nominatorSeat: 0, nomineeSeat: 1, status } as unknown as NominationView);
const dayView = (o: { open?: boolean; noms?: NominationView['status'][]; phase?: string } = {}): PlayerGameView =>
  ({ kind: 'player', phase: o.phase ?? 'day', players: [], day: { nominationsOpen: !!o.open, nominations: (o.noms ?? []).map(nomination) }, clock: null } as unknown as PlayerGameView);

describe('vote camera switch (net/core voteCameraWanted + input/camera cameraMode)', () => {
  it('nominations open, a pending or a voting nomination during the day: wanted', () => {
    expect(voteCameraWanted(null)).toBe(false);
    expect(voteCameraWanted(dayView())).toBe(false);
    expect(voteCameraWanted(dayView({ open: true }))).toBe(true);
    expect(voteCameraWanted(dayView({ noms: ['pending'] }))).toBe(true);
    expect(voteCameraWanted(dayView({ noms: ['tallied', 'voting'] }))).toBe(true);
    expect(voteCameraWanted(dayView({ noms: ['tallied', 'cancelled'] }))).toBe(false);
    expect(voteCameraWanted(dayView({ open: true, phase: 'night' }))).toBe(false);
    expect(voteCameraWanted(dayView({ noms: ['voting'], phase: 'bedtime' }))).toBe(false);
  });
  it('the frame applies only on the square; a room keeps its own camera', () => {
    expect(cameraMode({ me: { x: 360, y: 330, location: 'outdoors' }, voting: true })).toBe('vote');
    expect(cameraMode({ me: { x: 360, y: 230, location: 'outdoors' }, voting: true })).toBe('vote'); // on the circle's north arc
    expect(cameraMode({ me: { x: 650, y: 330, location: 'outdoors' }, voting: true })).toBe('follow');
    expect(cameraMode({ me: { x: 360, y: 330, location: 'outdoors' }, voting: false })).toBe('follow');
    expect(cameraMode({ me: { x: 1000, y: 100, location: 'bld:house-3' }, voting: true })).toBe('room');
    expect(cameraMode({ me: null, voting: true })).toBe('vote');
  });
});

describe('the vote frame fit (world/voteFrame.ts, a port of votecam.js voteFrame)', () => {
  const sizes = [
    { name: '960x540 x2', w: 960, h: 540, scale: 2 },
    { name: '1920x1080 x3', w: 1920, h: 1080, scale: 3 },
    { name: '390x844 portrait x2', w: 390, h: 844, scale: 2 },
  ];
  for (const sz of sizes)
    it(`every seat (feet .. raised hand) and the facing dial inside the canvas and clear of the HUD: ${sz.name}`, () => {
      const lowW = Math.ceil(sz.w / sz.scale);
      const lowH = Math.ceil(sz.h / sz.scale);
      const keep = keepOuts(lowW, lowH, sz.scale);
      const f = chooseVoteFrame({ lowW, lowH, seats: SEATS, dials: DIALS, keep });
      expect(f.pitch).toBeCloseTo(lowW < lowH ? VOTE_PITCH_PORTRAIT : VOTE_PITCH, 9);
      expect(VOTE_YAWS.map((y) => (y * Math.PI) / 180)).toContainEqual(f.yaw);
      // render it with the real pixel camera and project the content (the fit is exact up to the texel snap)
      const { host, cam } = fakeHost(sz);
      cam.set({ yaw: f.yaw, pitch: f.pitch, viewHeight: f.viewHeight });
      cam.set({ target: new THREE.Vector3(f.target.x, 0, f.target.z) });
      cam.update();
      const pr = host.projection();
      const slack = 2 * sz.scale; // one texel of snap either way
      const inKeep = (x: number, y: number) => keep.some((k) => x > k.x0 * sz.scale + slack && x < k.x1 * sz.scale - slack && y > k.y0 * sz.scale + slack && y < k.y1 * sz.scale - slack);
      for (const s of SEATS)
        for (const y of [s.y, s.y + 1.75 + 0.3]) {
          const c = worldToCss(pr, s.x, y, s.z);
          expect(c.x, `seat x at ${s.x},${s.z}`).toBeGreaterThan(-slack);
          expect(c.x).toBeLessThan(sz.w + slack);
          expect(c.y).toBeGreaterThan(-slack);
          expect(c.y).toBeLessThan(sz.h + slack);
          expect(inKeep(c.x, c.y), `seat under a HUD keep-out at ${c.x},${c.y}`).toBe(false);
        }
      const d = f.dial!;
      expect(d).toBe(facingDial(DIALS, f.yaw, f.pitch));
      for (const dy of [-d.r, d.r]) {
        const c = worldToCss(pr, d.c.x, d.c.y + dy, d.c.z);
        expect(c.y, 'dial in frame').toBeGreaterThan(-slack);
        expect(c.y).toBeLessThan(sz.h + slack);
        expect(inKeep(c.x, c.y), 'dial under a HUD keep-out').toBe(false);
      }
      // tighter than the old fixed shot (CAMERAS.vote viewHeight 19) on landscape screens
      if (lowW >= lowH) expect(f.viewHeight).toBeLessThan(19);
    });

  it('the chosen yaw is the tightest candidate (a later one must win by more than PREFER)', () => {
    const lowW = 480;
    const lowH = 270;
    const keep = keepOuts(lowW, lowH, 2);
    const all = VOTE_YAWS.map((y) => voteFrame({ yaw: (y * Math.PI) / 180, lowW, lowH, seats: SEATS, dials: DIALS, keep }));
    let want = all[0]!;
    for (const c of all.slice(1)) if (c.tw < want.tw * (1 - PREFER)) want = c;
    expect(chooseVoteFrame({ lowW, lowH, seats: SEATS, dials: DIALS, keep }).yaw).toBe(want.yaw);
  });

  it('the dial facing the camera: south face at yaw 0, a side face shares the frame at ±45', () => {
    expect(facingDial(DIALS, 0, VOTE_PITCH)!.n).toEqual({ x: 0, y: 0, z: 1 });
    const p = contentPoints({ yaw: Math.PI / 4, pitch: VOTE_PITCH, seats: SEATS, dials: DIALS });
    expect(p.pts.length).toBe(15 * (32 + 1) + 24);
    expect([DIALS[0], DIALS[3]]).toContainEqual(p.dial);
  });
});

describe('camera rig: stepped transitions into / out of the vote frame', () => {
  const shot: CameraShot = { X: 22.5, Y: 0, Z: 16, viewHeight: 15, yaw: Math.PI / 4, pitch: VOTE_PITCH };
  const rigWith = () => {
    const { host, cam } = fakeHost({ w: 960, h: 540, scale: 2 });
    const rig = new CameraRig(townLayoutV3);
    const asked: number[][] = [];
    rig.attach({
      host,
      heightAt: () => 0,
      voteCamera: (w, h, ps) => {
        asked.push([w, h, ps]);
        return shot;
      },
    });
    return { rig, cam, asked };
  };
  const me = { x: 360, y: 330, location: 'outdoors' as const };

  it('the vote frame comes in over TRANS_S in TRANS_STEPS whole poses, then holds; back out the same way', () => {
    const { rig, cam, asked } = rigWith();
    rig.step(0, { me, voting: false, snap: true });
    expect(rig.cameraMode()).toBe('follow');
    expect(cam.yaw).toBe(0);
    const poses = new Set<string>();
    for (let t = 0; t < TRANS_S + 0.2; t += 1 / 60) {
      rig.step(1 / 60, { me, voting: true, snap: false });
      poses.add(`${cam.yaw.toFixed(4)}|${cam.viewHeight.toFixed(3)}`);
    }
    expect(asked[0]).toEqual([480, 270, 2]);
    expect(rig.cameraMode()).toBe('vote');
    expect(rig.transitioning).toBe(false);
    expect(cam.yaw).toBeCloseTo(Math.PI / 4, 9);
    expect(cam.pitch).toBeCloseTo(VOTE_PITCH, 9);
    expect(cam.viewHeight).toBeCloseTo(15, 9);
    expect(poses.size).toBeLessThanOrEqual(TRANS_STEPS + 1); // stepped key poses, never a glide
    expect(rig.yaw()).toBeCloseTo(Math.PI / 4, 9);
    // the vote ends: back to the follow camera (yaw 0, the pitch of the town), stepped too
    rig.step(1 / 60, { me, voting: false, snap: false });
    expect(rig.transitioning).toBe(true);
    for (let t = 0; t < TRANS_S + 0.2; t += 1 / 60) rig.step(1 / 60, { me, voting: false, snap: false });
    expect(cam.yaw).toBeCloseTo(0, 9);
    expect(cam.pitch).toBeCloseTo(Math.PI / 6, 9);
  });

  it('reduced motion and teleports jump; off the square the follow camera stays', () => {
    const { rig, cam } = rigWith();
    rig.step(0, { me, voting: false, snap: true });
    rig.step(1 / 60, { me, voting: true, snap: false, still: true });
    expect(cam.yaw).toBeCloseTo(Math.PI / 4, 9);
    expect(rig.transitioning).toBe(false);
    rig.step(1 / 60, { me: { x: 650, y: 330, location: 'outdoors' }, voting: true, snap: true });
    expect(rig.cameraMode()).toBe('follow');
    expect(cam.yaw).toBe(0);
  });

  it('steppedPose: the first key pose at once, exact at the end, the yaw the short way', () => {
    const a: CameraPose = { X: 0, Y: 0, Z: 0, viewHeight: 12, yaw: -Math.PI * 0.9, pitch: Math.PI / 6 };
    const b: CameraPose = { X: 10, Y: 0, Z: 4, viewHeight: 15, yaw: Math.PI * 0.9, pitch: VOTE_PITCH };
    const out = { ...a };
    steppedPose(a, b, 0, out);
    expect(out.X).toBeGreaterThan(0);
    expect(out.X).toBeLessThan(10);
    expect(Math.abs(out.yaw)).toBeGreaterThan(Math.PI * 0.9 - 1e-9); // through ±pi, not through 0
    steppedPose(a, b, 1, out);
    expect(out).toEqual(b);
  });

  it('keys stay screen-relative under the turned camera', () => {
    const o = { vx: 0, vy: 0 };
    expect(turnKeys({ vx: 1, vy: 0 }, 0, o)).toEqual({ vx: 1, vy: 0 });
    // at yaw 45 "right" moves along the camera's screen right (cos, -sin) on the ground
    turnKeys({ vx: 1, vy: 0 }, Math.PI / 4, o);
    expect(o.vx).toBeCloseTo(Math.SQRT1_2, 9);
    expect(o.vy).toBeCloseTo(-Math.SQRT1_2, 9);
    // "up" (screen up, vy -1) moves away from the camera: forward = (-sin, -cos)
    turnKeys({ vx: 0, vy: -1 }, Math.PI / 4, o);
    expect(o.vx).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(o.vy).toBeCloseTo(-Math.SQRT1_2, 9);
  });
});

describe('camera rig: a room that is still building vs one whose build failed (review C1 fix round)', () => {
  const rigWith = (pending: { v: boolean }) => {
    const { host } = fakeHost({ w: 960, h: 540, scale: 2 });
    const rig = new CameraRig(townLayoutV3);
    rig.attach({ host, heightAt: () => 0, interiorCamera: () => null, interiorPending: () => pending.v });
    return rig;
  };
  const out = { x: 360, y: 330, location: 'outdoors' as const };
  const tower = { x: 360, y: 330, location: 'bld:clocktower' as const };

  it('holds the outdoor pose while the room builds, then falls back to the interior shot once the build settles without a room', () => {
    const pending = { v: true };
    const rig = rigWith(pending);
    rig.step(0, { me: out, voting: false, snap: true });
    const before = rig.shot();
    for (let i = 0; i < 5; i++) rig.step(1 / 60, { me: tower, voting: false, snap: false });
    expect(rig.shot()).toEqual(before);
    expect(rig.location()).toBe('outdoors');
    pending.v = false; // the build failed (stage.interiorPending false, interiorCamera still null)
    rig.step(1 / 60, { me: tower, voting: false, snap: false });
    expect(rig.location()).toBe('bld:clocktower');
    const want = interiorShot('bld:clocktower', 960 / 540);
    expect(want).not.toBeNull();
    expect(rig.shot().X).toBeCloseTo(want!.X, 6);
    expect(rig.shot().Z).toBeCloseTo(want!.Z, 6);
  });
});
