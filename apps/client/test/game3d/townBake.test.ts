// v3.3 perf (v33-bake): the createTree bake / replay (docs/perf-v3/bake.md). The pinned vendor patch and its drift
// failure, the binary format, the call key, and the end-to-end bit-exact check (scripts/v3/bake-town.mjs --verify:
// every recorded tree replayed through the CLIENT's recorder + replay and compared with a live createTree, incl. the
// re-sort at the vote camera's 45-degree yaw).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { patchVendor } from '../../build/pixel3dImports';
import { CREATE_TREE_PIN, createTreeSource, patchTrees, sha16, vendorTreeHash } from '../../build/townBake';
import { BodyWriter, decodeBake, encodeBake, treeKey, type BakeHeader } from '../../src/game3d/vendor/bakeFormat';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const TREES = `${ROOT}v3/pixel3d/src/world/trees.js`;
const trees = readFileSync(TREES, 'utf8');

describe('createTree patch', () => {
  it('pins the current vendor createTree source', () => {
    const src = createTreeSource(trees);
    expect(src).not.toBeNull();
    expect(sha16(src!)).toBe(CREATE_TREE_PIN);
  });

  it('wraps createTree with the replay hook and appends the assembly', () => {
    const out = patchTrees(trees)!;
    expect(out).not.toBeNull();
    expect(out).toContain('function __ctCreateTreeRaw(engine, opts = {}) {');
    expect(out).toContain('function __ctAssembleTree(engine, opts, d) {');
    expect(out.match(/export function createTree\(/g)).toHaveLength(1);
    expect(out).toContain('group.userData.__ctLeaves = leaves');
    // the inert path (no hook) still runs the vendor body unchanged
    const body = createTreeSource(trees)!.split('\n');
    const ud = body.findIndex((l) => l.includes('group.userData.tree = {'));
    expect(ud).toBeGreaterThan(10);
    expect(out).toContain(body.slice(1, ud + 1).join('\n'));
  });

  it('fails loudly when the vendor changes createTree', () => {
    const drifted = trees.replace('const crownBlend = kind === \'pine\' ? 0 : 0.35;', 'const crownBlend = kind === \'pine\' ? 0 : 0.36;');
    expect(drifted).not.toBe(trees);
    expect(patchTrees(drifted)).toBeNull();
    expect(() => patchVendor('/x/v3/pixel3d/src/world/trees.js', drifted)).toThrow(/trees\.js changed/);
    expect(patchVendor('/x/v3/pixel3d/src/world/trees.js', trees)).toContain('__ctAssembleTree');
  });
});

describe('bake format', () => {
  it('round-trips typed arrays 8-aligned with the header', () => {
    const w = new BodyWriter();
    const a = w.add(new Uint16Array([1, 2, 3]));
    const b = w.add(new Float64Array([Math.PI, -0.1]));
    const c = w.add(new Float32Array([1.5, 2.5, 3.5, 4.5]));
    expect(b[1] % 8).toBe(0);
    expect(c[1] % 8).toBe(0);
    const header: BakeHeader = { v: 1, vendorHash: 'h', generator: 't', three: '170', keys: {} };
    const bytes = encodeBake(header, w.bytes());
    const dec = decodeBake(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(dec.header.vendorHash).toBe('h');
    expect([...dec.view(a)]).toEqual([1, 2, 3]);
    expect([...dec.view(b)]).toEqual([Math.PI, -0.1]);
    expect([...dec.view(c)]).toEqual([1.5, 2.5, 3.5, 4.5]);
    expect(() => decodeBake(new ArrayBuffer(16))).toThrow(/magic/);
  });

  it('keys a call by its data options + texel size (order-free; position / add excluded)', () => {
    const k = treeKey({ kind: 'bush', seed: 3, palette: { hi: '#fff', mid: '#000' }, position: { x: 1 }, add: false }, 12 / 360);
    expect(treeKey({ add: true, palette: { mid: '#000', hi: '#fff' }, seed: 3, kind: 'bush', position: { x: 9 } }, 12 / 360)).toBe(k);
    expect(treeKey({ kind: 'bush', seed: 3, palette: { hi: '#fff', mid: '#000' }, height: undefined }, 12 / 360)).toBe(k);
    expect(treeKey({ kind: 'bush', seed: 3, palette: { hi: '#fff', mid: '#000' } }, 12 / 300)).not.toBe(k);
    expect(treeKey({ kind: 'bush', seed: 4, palette: { hi: '#fff', mid: '#000' } }, 12 / 360)).not.toBe(k);
  });

  it('vendor hash is deterministic', () => {
    expect(vendorTreeHash(ROOT, '0.170.0')).toBe(vendorTreeHash(ROOT, '0.170.0'));
    expect(vendorTreeHash(ROOT, '0.170.0')).not.toBe(vendorTreeHash(ROOT, '0.171.0'));
  });
});

describe('bake replay is bit-exact (vendor headless in Node)', () => {
  it('scripts/v3/bake-town.mjs --verify: every tree of the low town at lowH 300 replays identically', () => {
    const r = spawnSync(process.execPath, [`${ROOT}scripts/v3/bake-town.mjs`, '--verify', '--lowH=300', '--quality=low', '--tod=noon'], { encoding: 'utf8', timeout: 170_000 });
    expect(r.stderr).not.toMatch(/DRIFT/);
    expect(r.status).toBe(0);
    const summary = JSON.parse(r.stdout) as { verified: number; drift: number; keys: number };
    expect(summary.drift).toBe(0);
    expect(summary.verified).toBe(summary.keys);
    expect(summary.keys).toBeGreaterThan(50);
  }, 180_000);
});
