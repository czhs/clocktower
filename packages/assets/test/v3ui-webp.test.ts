// (v3 perf, net front) The v3 UI atlases ship as lossless WebP twins of the vendor PNGs (scripts/v3/ui-webp.ts,
// resolved by apps/client/vite.config.ts): they must decode to exactly the vendor PNG's RGBA, and every sheet the
// client imports as `@v3assets/<name>.png?url` must have one (else it silently falls back to the 3-4x bigger PNG).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { decodeWebP } from '../scripts/lib/encode.js';
import { V3_UI_SRC, V3_UI_WEBP, V3_UI_WEBP_DIR } from '../scripts/v3/ui-webp.js';

const CLIENT_SRC = join(V3_UI_SRC, '../../../apps/client/src');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) filesUnder(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

describe('v3 UI atlases: WebP lossless twins', () => {
  for (const name of V3_UI_WEBP)
    it(`${name}.webp decodes to exactly v3/assets/ui/${name}.png`, async () => {
      const file = join(V3_UI_WEBP_DIR, `${name}.webp`);
      expect(existsSync(file), `${file} missing: run scripts/v3/ui-webp.ts`).toBe(true);
      const buf = readFileSync(file);
      expect(buf.subarray(12, 16).toString('latin1')).toBe('VP8L'); // lossless bitstream, never lossy VP8
      const p = PNG.sync.read(readFileSync(join(V3_UI_SRC, `${name}.png`)));
      const w = await decodeWebP(buf);
      expect([w.width, w.height]).toEqual([p.width, p.height]);
      expect(Buffer.compare(w.data, p.data), `${name}: the vendor PNG changed; re-run scripts/v3/ui-webp.ts`).toBe(0);
    });

  it('every @v3assets PNG the client imports has a twin, and there are no stale twins', () => {
    const imported = new Set<string>();
    for (const f of filesUnder(CLIENT_SRC)) for (const m of readFileSync(f, 'utf8').matchAll(/['"]@v3assets\/([a-z0-9-]+)\.png\?url['"]/g)) imported.add(m[1]!);
    expect(imported.size).toBeGreaterThan(0);
    expect([...imported].filter((n) => !(V3_UI_WEBP as readonly string[]).includes(n))).toEqual([]);
    const present = readdirSync(V3_UI_WEBP_DIR).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
    expect(present).toEqual([...V3_UI_WEBP].sort());
  });
});
