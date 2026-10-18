// v3 WP2: build queue order, billboard frames, townsfolk rules, the tint material wrapper, lantern hours.
import castJson from '@ct/assets/generated/cast.json';
import castHdJson from '@ct/assets/generated/cast-hd.json';
import { inSquare, tileCenterPx } from '@ct/protocol';
import { townLayout } from '@ct/assets';
import { townLayoutV3, npcHomesV3 } from '@ct/assets/hollowmere';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { nextBuild } from '../../src/game3d/avatars/queue';
import { billboardArt, cellUv, frameCell, frameIndex, ghostFrameIndex, GHOST_BOB, type CastHdManifest, type CastSheetManifest } from '../../src/game3d/avatars/billboardFrames';
import { createNpcFolk, npcClear, npcHomesFor, NPC_HOMES_V2 } from '../../src/game3d/avatars/npcs';
import { createTintUniforms, patchTint, patchTintTree, setColourTint, setFade, setGhostTint, TINT_GLSL_BODY } from '../../src/game3d/avatars/ghostTint';
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
    expect(m.customProgramCacheKey()).toBe('char:abc|ct-tint1');
    // idempotent; a second avatar of the same spec shares the key
    expect(patchTint(m, U)).toBe(true);
    expect(m.customProgramCacheKey()).toBe('char:abc|ct-tint1');
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
