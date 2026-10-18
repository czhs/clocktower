// v3 WP2: build queue order, billboard frames + cylindrical orientation, townsfolk rules, the tint material wrapper,
// lantern hours, the vendor motion reset on teleports, the spec ghost-hover probe.
import castJson from '@ct/assets/generated/cast.json';
import castHdJson from '@ct/assets/generated/cast-hd.json';
import { inSquare, tileCenterPx } from '@ct/protocol';
import { townLayout } from '@ct/assets';
import { townLayoutV3, npcHomesV3 } from '@ct/assets/hollowmere';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { nextBuild } from '../../src/game3d/avatars/queue';
import { BILLBOARD_HEIGHT_M, billboardArt, billboardHeadM, cellUv, cylinderFacing, frameCell, frameIndex, ghostFrameIndex, GHOST_BOB, type CastHdManifest, type CastSheetManifest } from '../../src/game3d/avatars/billboardFrames';
import { createDriver, resetMotion, specCapsOf, type CharacterHandle } from '../../src/game3d/vendor/characters';
import { createNpcFolk, npcClear, npcHomesFor, NPC_HOMES_V2 } from '../../src/game3d/avatars/npcs';
import { createTintUniforms, patchTint, patchTintTree, RIM_BAND, RIM_EDGE, RIM_FLAT, RIM_K, setColourTint, setFade, setGhostTint, setRim, TINT_GLSL_BODY, TINT_GLSL_HEAD } from '../../src/game3d/avatars/ghostTint';
import { lanternHour, syncLantern, type LightPool } from '../../src/game3d/avatars/lanterns';

const CAST = castJson as unknown as CastSheetManifest;
const HD = castHdJson as unknown as CastHdManifest;

describe('build queue', () => {
  const c = (key: string, o: Partial<{ self: boolean; npc: boolean; here: boolean; dist: number }> = {}) => ({ key, self: false, npc: false, here: true, dist: 100, ...o });
  it('own player first, then players here by distance, then elsewhere, then townsfolk', () => {
    expect(nextBuild([c('a', { dist: 5 }), c('me', { self: true, dist: 0 })])?.key).toBe('me');
    expect(nextBuild([c('far', { dist: 300 }), c('near', { dist: 20 }), c('npc', { npc: true, dist: 1 })])?.key).toBe('near');
    expect(nextBuild([c('away', { here: false, dist: Infinity }), c('npc', { npc: true, dist: 1 })])?.key).toBe('away');
    expect(nextBuild([c('npc-away', { npc: true, here: false }), c('npc-here', { npc: true })])?.key).toBe('npc-here');
    expect(nextBuild([])).toBeNull();
  });
  it('ties keep the input order', () => {
    expect(nextBuild([c('x', { dist: Infinity }), c('y', { dist: Infinity })])?.key).toBe('x');
  });
});

describe('billboard frames', () => {
  it('brianbi draws from the HD sheet with HD ghost rows; nicksong from cast.png with cast-ghosts', () => {
    const b = billboardArt('brianbi', CAST, HD)!;
    expect(b).toMatchObject({ sheet: 'cast-hd', ghostSheet: 'cast-hd', ghostKey: 'brianbi/ghost', spentKey: 'brianbi/ghost-spent', cellW: 160, cellH: 200 });
    const n = billboardArt('nicksong', CAST, HD)!;
    expect(n).toMatchObject({ sheet: 'cast', ghostSheet: 'cast-ghosts', ghostKey: 'nicksong/ghost', cellW: 32, cellH: 40 });
    expect(billboardArt('nobody', CAST, HD)).toBeNull();
  });
  it('frame names keep the v2 `<key>|<dir8>|<n>` format', () => {
    const b = billboardArt('brianbi', CAST, HD)!;
    expect(frameCell(b.sheet, 'brianbi', 'right', 3, CAST, HD)).toMatchObject({ name: 'brianbi|right|3', x: 2 * 160, y: (0 + 3) * 200, w: 160, h: 200 });
    expect(frameCell(b.sheet, 'brianbi/ghost', 'down-right', 4, CAST, HD)?.name).toBe('brianbi/ghost|down-right|0');
    const n = billboardArt('nicksong', CAST, HD)!;
    const pos = CAST.sheets.nicksong!;
    expect(frameCell(n.sheet, 'nicksong', 'up', 2, CAST, HD)).toMatchObject({ name: 'nicksong|up|2', x: pos.x + 2 * 32, y: pos.y + 4 * 40 });
    const g = CAST.ghosts!;
    expect(frameCell('cast-ghosts', 'nicksong/ghost', 'left', 2, CAST, HD)).toMatchObject({ x: g.sheets['nicksong/ghost']!.x, y: g.sheets['nicksong/ghost']!.y + 6 * g.cellHeight + g.rowOffset[2]! });
  });
  it('walk frames cycle 1..4 while moving; idle, reduced motion hold 0', () => {
    const b = billboardArt('brianbi', CAST, HD)!;
    expect(frameIndex(false, 1.3, b, false)).toBe(0);
    expect(frameIndex(true, 1.3, b, true)).toBe(0);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(frameIndex(true, i / 20, b, false));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
    expect(ghostFrameIndex(0.3, true)).toBe(0);
    expect(new Set(Array.from({ length: 16 }, (_, i) => ghostFrameIndex(i / 5, false)))).toEqual(new Set(GHOST_BOB));
  });
  it('cell UVs (flipY: v up)', () => {
    expect(cellUv({ x: 0, y: 0, w: 32, h: 40 }, 320, 400)).toEqual({ u0: 0, u1: 0.1, v0: 0.9, v1: 1 });
  });
});

describe('billboard orientation (cylindrical)', () => {
  // the gameplay camera: yaw 0, pitch 30° down, looking north (-Z) from the south
  const cam = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 200);
  const pitch = Math.PI / 6;
  cam.position.set(0, Math.sin(pitch) * 50, Math.cos(pitch) * 50);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const screenY = (v: THREE.Vector3) => -v.clone().project(cam).y * 6; // ortho half-height 6 m -> metres on screen, y down

  it('turns about Y only and reports the pitch', () => {
    const f = cylinderFacing(cam.quaternion);
    expect(f.yaw).toBeCloseTo(0);
    expect(f.cosPitch).toBeCloseTo(Math.cos(pitch));
    const side = new THREE.Camera();
    side.position.set(10, 5, 0);
    side.lookAt(0, 0, 0);
    side.updateMatrixWorld(true);
    expect(cylinderFacing(side.quaternion).yaw).toBeCloseTo(Math.PI / 2); // faces +X, towards that camera
  });

  for (const id of ['brianbi', 'nicksong']) {
    it(`${id}: the reported vertical head height projects onto the drawn head top, at v2's on-screen size`, () => {
      const art = billboardArt(id, CAST, HD)!;
      const f = cylinderFacing(cam.quaternion);
      const s = BILLBOARD_HEIGHT_M / art.cellH;
      // the billboard mesh: feet at the origin, rotated about Y, stretched by 1 / cos(pitch) (billboard.ts)
      const mesh = new THREE.Object3D();
      mesh.rotation.set(0, f.yaw, 0);
      mesh.scale.y = 1 / f.cosPitch;
      mesh.position.set(3, 0, 2);
      mesh.updateMatrixWorld(true);
      const headTop = new THREE.Vector3(0, art.anchor.y * s, 0).applyMatrix4(mesh.matrixWorld);
      const feet = new THREE.Vector3(0, 0, 0).applyMatrix4(mesh.matrixWorld);
      const headM = billboardHeadM(art, f.cosPitch);
      const anchorPt = new THREE.Vector3(3, headM, 2); // what anchorOf projects (feet + vertical height)
      expect(screenY(anchorPt)).toBeCloseTo(screenY(headTop), 5);
      expect(screenY(feet) - screenY(headTop)).toBeCloseTo(art.anchor.y * s, 5); // = the camera-facing size (v2)
      expect(headTop.z).toBeCloseTo(2, 6); // upright: the top does not lean north into a wall
    });
  }
});

describe('vendor motion reset (teleports)', () => {
  const v3 = () => new THREE.Vector3();
  const sod = <T extends THREE.Vector2 | THREE.Vector3>(v: T) => ({ value: v, reset(x: T) { this.value.copy(x as never); } });
  const fakeHandle = () => {
    let fn: ((t: number) => { pos: THREE.Vector3; face?: number }) | null = null;
    const gaitResets: unknown[] = [];
    const ch = {
      drive(f: typeof fn) { fn = f; },
      _s: { prevPos: new THREE.Vector3(1, 0, 1), vel: new THREE.Vector3(180, 0, 0), prevVelF: new THREE.Vector3(50, 0, 0), velF: sod(new THREE.Vector3(60, 0, 0)), lean: sod(new THREE.Vector2(14, 3)), heading: 0, desired: 0, facingYaw: 0.5 },
      gait: { reset: (p: THREE.Vector3, yaw: number) => void gaitResets.push([p.toArray(), yaw]) },
      opts: { ground: null },
      _chains: [{ init: true, cached: true, links: [{ dir: v3() }] }],
      state: { clip: 'idle', frame: 0 },
    };
    return { h: { ch } as unknown as CharacterHandle, ch, gaitResets, sample: (t: number) => fn!(t) };
  };
  it('a reset puts the Character at rest at the new spot (no velocity kick, lean, run, chain swing)', () => {
    const { h, ch, gaitResets, sample } = fakeHandle();
    const d = createDriver(h, () => 0.5);
    d.push(1, 1, 1, null);
    d.reset(1.02, 210, 30, Math.PI);
    expect(ch._s.prevPos.toArray()).toEqual([210, 0.5, 30]);
    expect(ch._s.vel.length()).toBe(0);
    expect(ch._s.prevVelF.length()).toBe(0);
    expect(ch._s.velF.value.length()).toBe(0);
    expect(ch._s.lean.value.length()).toBe(0);
    expect(ch._s.desired).toBeCloseTo(Math.PI);
    expect(gaitResets).toEqual([[[210, 0.5, 30], 0.5]]);
    expect(ch._chains[0]).toMatchObject({ init: false, cached: false, links: [{ dir: null }] });
    // the drive now samples the new spot only (the next step's velocity is 0)
    const a = sample(1.0);
    expect([a.pos.x, a.pos.z, a.face]).toEqual([210, 30, Math.PI]);
  });
  it('is a no-op before the first update (no sim yet), and the drive reuses its result object', () => {
    const { h, ch, sample } = fakeHandle();
    delete (ch as { _s?: unknown })._s;
    expect(() => resetMotion(h, 1, 2, null, () => 0)).not.toThrow();
    const d = createDriver(h, () => 0);
    d.push(0, 1, 1, null);
    d.push(1, 2, 1, null);
    expect(sample(0.5)).toBe(sample(0.7)); // one scratch object (the vendor clones .pos)
    expect(sample(0.5).face).toBeUndefined();
  });
  it('the probe reads the shared ghost hover and halo (rig.js ghostOpts defaults)', () => {
    expect(specCapsOf({ ghost: { hover: 0.14, halo: { lift: 0.2 } }, clips: {} })).toMatchObject({ ghost: true, ghostHover: 0.14, ghostHalo: 0.2 });
    expect(specCapsOf({ ghost: { hover: 0.14 }, clips: {} })).toMatchObject({ ghostHover: 0.14, ghostHalo: 0.12 });
    expect(specCapsOf({ ghost: { halo: false }, clips: {} })).toMatchObject({ ghostHover: 0, ghostHalo: 0 });
    expect(specCapsOf({ clips: { ghost: { loop: true } } })).toMatchObject({ ghost: false, ghostHover: 0, ghostHalo: 0 });
  });
});

describe('townsfolk', () => {
  it('v3 homes are the exported Hollowmere homes; v2 keeps TownScene’s', async () => {
    expect(await npcHomesFor('v3')).toBe(npcHomesV3);
    expect(await npcHomesFor('v2')).toBe(NPC_HOMES_V2);
  });
  it('v3: no NPC spawns or steps into the town square (the voting circle)', () => {
    const clear = npcClear(townLayoutV3, 'v3');
    const sq = townLayoutV3.square;
    expect(clear({ x: sq.cx + sq.r + 20, y: sq.cy }, { x: sq.cx + sq.r - 10, y: sq.cy })).toBe(false);
    const folk = createNpcFolk(townLayoutV3, 'v3', npcHomesV3);
    expect(folk.list.map((n) => n.id)).toEqual(Object.keys(npcHomesV3).sort());
    for (const n of folk.list) expect(inSquare(townLayoutV3, n.x, n.y), n.id).toBe(false);
    // a Brianbi chasing every NPC for 30 s never pushes one into the square or past its leash
    const t0 = 1000;
    for (let k = 0; k < 600; k++) {
      const chasers = folk.list.map((n) => ({ x: n.x + 20, y: n.y - 10 }));
      folk.step(0.05, t0 + k * 50, chasers, folk.list.length);
      for (const n of folk.list) {
        expect(inSquare(townLayoutV3, n.x, n.y), `${n.id} at step ${k}`).toBe(false);
        expect(Math.hypot(n.x - n.home.x, n.y - n.home.y)).toBeLessThanOrEqual(48.01);
      }
    }
    expect(folk.list.some((n) => n.avoiding)).toBe(true);
  });
  it('v2 keeps the v2 rule (the square is not forbidden there) and parks NPCs beyond `active`', () => {
    const folk = createNpcFolk(townLayout, 'v2', NPC_HOMES_V2);
    expect(folk.list).toHaveLength(4);
    const before = folk.list.map((n) => ({ x: n.x, y: n.y }));
    for (let k = 0; k < 100; k++) folk.step(0.05, 5000 + k * 50, [], 0);
    expect(folk.list.map((n) => ({ x: n.x, y: n.y }))).toEqual(before);
    // the v2 rule allows the square (v2 behaviour unchanged): a free square tile next to its centre is clear
    const sq = townLayout.square;
    const a = tileCenterPx(townLayout, { x: Math.floor(sq.cx / 16), y: Math.floor((sq.cy + 48) / 16) });
    const b = { x: a.x + 4, y: a.y };
    expect(npcClear(townLayout, 'v3')(a, b)).toBe(false);
    expect(npcClear(townLayout, 'v2')(a, b)).toBe(true);
  });
});

describe('tint wrapper', () => {
  const toonish = () => {
    const m = new THREE.MeshLambertMaterial();
    m.userData.toon = {};
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() { /*toon*/');
    };
    m.customProgramCacheKey = () => 'char:abc';
    return m;
  };
  const fakeShader = () => ({ uniforms: {} as Record<string, unknown>, vertexShader: 'void main() {}', fragmentShader: '#include <common>\nvoid main() {\n  vec3 outgoingLight = vec3(1.0);\n  #include <opaque_fragment>\n}' });

  it('chains the material’s own hook, injects before opaque_fragment, keeps one program per vendor key', () => {
    const U = createTintUniforms();
    const m = toonish();
    expect(patchTint(m, U)).toBe(true);
    const sh = fakeShader();
    m.onBeforeCompile(sh as never, {} as never);
    expect(sh.fragmentShader).toContain('/*toon*/');
    expect(sh.fragmentShader).toContain('uniform vec4 uCtGhost;');
    expect(sh.fragmentShader.indexOf(TINT_GLSL_BODY.trim().slice(0, 20))).toBeLessThan(sh.fragmentShader.indexOf('#include <opaque_fragment>'));
    expect(sh.uniforms.uCtGhost).toBe(U.uCtGhost);
    expect(m.customProgramCacheKey()).toBe('char:abc|ct-tint2');
    // idempotent; a second avatar of the same spec shares the key
    expect(patchTint(m, U)).toBe(true);
    expect(m.customProgramCacheKey()).toBe('char:abc|ct-tint2');
    const m2 = toonish();
    patchTint(m2, createTintUniforms());
    expect(m2.customProgramCacheKey()).toBe(m.customProgramCacheKey());
  });
  it('leaves non-toon materials alone', () => {
    const g = new THREE.Group();
    const plain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const toon = new THREE.Mesh(new THREE.BoxGeometry(), toonish());
    g.add(plain, toon);
    expect(patchTintTree(g, createTintUniforms())).toBe(1);
  });
  it('ghost strength -> dithered alpha; colour tint on / off (uniforms only, no recompile)', () => {
    const U = createTintUniforms();
    setGhostTint(U, 1);
    expect(U.uCtGhost.value.x).toBe(1);
    expect(U.uCtGhost.value.y).toBeCloseTo(0.6);
    setGhostTint(U, 0.5);
    expect(U.uCtGhost.value.y).toBeCloseTo(0.8);
    setGhostTint(U, 0);
    expect(U.uCtGhost.value.toArray()).toEqual([0, 1, 1, 0]);
    setFade(U, 0.25);
    setGhostTint(U, 1);
    expect(U.uCtGhost.value.z).toBe(0.25); // the ghost look keeps a running fade
    setFade(U, 2);
    expect(U.uCtGhost.value.z).toBe(1);
    setColourTint(U, '#c8343f');
    expect(U.uCtTint.value.w).toBeGreaterThan(0);
    setColourTint(U, null);
    expect(U.uCtTint.value.w).toBe(0);
  });
  it('talking rim: a uniform (off by default), silhouette band on rigs, flat lift on billboards', () => {
    const U = createTintUniforms();
    expect(U.uCtRim.value.w).toBe(0);
    expect(U.uCtGhost.value.w).toBe(0);
    setRim(U, '#ff0000');
    expect(U.uCtRim.value.x).toBeCloseTo(1);
    expect(U.uCtRim.value.w).toBeCloseTo(RIM_K);
    setRim(U, null);
    expect(U.uCtRim.value.w).toBe(0);
    expect(createTintUniforms(true).uCtGhost.value.w).toBe(1);
    expect(TINT_GLSL_HEAD).toContain('uniform vec4 uCtRim;');
    expect(TINT_GLSL_BODY).toContain('uCtRim.w > 0.0');
    // visible: full strength, a wide band (|n.z| < 0.65) plus a flat lift of the whole figure
    expect(RIM_K).toBe(1);
    expect(TINT_GLSL_BODY).toContain(`${RIM_FLAT.toFixed(2)} + ${RIM_BAND.toFixed(2)} * step(${RIM_EDGE.toFixed(2)},`);
    // the rim is bound at compile time like the other two (one program for every avatar of a vendor key)
    const m = new THREE.MeshLambertMaterial();
    m.userData.toon = {};
    patchTint(m, U);
    const sh = { uniforms: {} as Record<string, unknown>, vertexShader: '', fragmentShader: '#include <common>\nvoid main() {\n  #include <opaque_fragment>\n}' };
    m.onBeforeCompile(sh as never, {} as never);
    expect(sh.uniforms.uCtRim).toBe(U.uCtRim);
  });
});

describe('lanterns', () => {
  it('dark from 19:45 to 06:15', () => {
    expect(lanternHour(12)).toBe(false);
    expect(lanternHour(19.7)).toBe(false);
    expect(lanternHour(19.75)).toBe(true);
    expect(lanternHour(23)).toBe(true);
    expect(lanternHour(3)).toBe(true);
    expect(lanternHour(6.25)).toBe(false);
  });
  it('borrows while it should shine, releases otherwise, retries an exhausted pool', () => {
    let free = 0;
    let released = 0;
    const pool: LightPool = { borrowLight: () => (free-- > 0 ? { release: () => void released++ } : null) };
    const slot = { lease: null as null | { release(): void } };
    const anchor = () => ({ x: 1, y: 2, z: 3 });
    syncLantern(slot, pool, true, anchor);
    expect(slot.lease).toBeNull(); // exhausted
    free = 1;
    syncLantern(slot, pool, true, anchor);
    expect(slot.lease).not.toBeNull();
    syncLantern(slot, pool, true, anchor);
    expect(released).toBe(0);
    syncLantern(slot, pool, false, anchor);
    expect(slot.lease).toBeNull();
    expect(released).toBe(1);
    syncLantern(slot, null, true, anchor);
    expect(slot.lease).toBeNull();
  });
});
