// v3 WP0 (v3-lead). Vendor guard (docs/v3/INTEGRATION.md §1.3 step 6). The pixel3d tree is re-published
// by another session (rsync --delete) straight into the production bundle; our CSP + Trusted Types need
// no change only while its RUNTIME code has none of the patterns below. A re-publish that adds one fails
// here, before it ships (then review it and update the CSP / this list deliberately).
// Scope: v3/pixel3d/{src,characters,charkit}/**/*.js, excluding tools/, pipeline/ and *.mjs (offline tools).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PATCHES, patchVendor } from '../../build/pixel3dImports';

const V = fileURLToPath(new URL('../../../../v3/pixel3d/', import.meta.url));

function js(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === 'tools' || n === 'pipeline' || n === 'node_modules') continue;
      out.push(...js(p));
    } else if (n.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Strip // and /* *\/ comments (keeps strings; good enough for the patterns below). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const RULES: [string, RegExp][] = [
  ['eval(', /(^|[^\w.$])eval\s*\(/],
  ['Function(', /(^|[^\w.$])(new\s+)?Function\s*\(/],
  ['innerHTML', /\binnerHTML\b/],
  ['outerHTML', /\bouterHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['document.write', /document\.write(ln)?\s*\(/],
  ['new Worker', /new\s+(Shared)?Worker\s*\(/],
  ["setAttribute('style'", /setAttribute\(\s*['"]style['"]/],
  ['string setTimeout / setInterval', /set(Timeout|Interval)\s*\(\s*['"`]/],
  ['absolute URL in fetch / new URL / import', /(fetch|new\s+URL|import)\s*\(\s*['"`]https?:\/\//],
];

const files = [...js(path.join(V, 'src')), ...js(path.join(V, 'characters')), ...js(path.join(V, 'charkit'))];

describe('pixel3d vendor guard', () => {
  it('scans the runtime tree', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(`src${path.sep}core${path.sep}Engine.js`))).toBe(true);
  });

  it.each(RULES)('no %s in runtime vendor code', (_name, re) => {
    const hits: string[] = [];
    for (const f of files) {
      const lines = code(readFileSync(f, 'utf8')).split('\n');
      lines.forEach((l, i) => {
        if (re.test(l)) hits.push(`${path.relative(V, f)}:${i + 1}: ${l.trim().slice(0, 120)}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('build-time vendor rewrites (build/pixel3dImports.ts)', () => {
  it.each(PATCHES.map((p) => [p.file, p] as const))('%s: the known snippet is present and patches', (file, p) => {
    const src = readFileSync(path.join(V, 'src', file), 'utf8');
    const out = p.apply(src);
    expect(out, `${file}: ${p.what}`).not.toBeNull();
    expect(out).not.toBe(src);
  });

  it('the patched sources are what the game needs', () => {
    const read = (f: string) => patchVendor(path.join(V, 'src', f), readFileSync(path.join(V, 'src', f), 'utf8'))!;
    const api = read('town/api.js');
    expect(api).toContain("import.meta.glob(['./pieces/*.js', './life/index.js'])");
    expect(api).toContain('await __ctPieces[PATHS(id)]()');
    expect(api).not.toContain('await import(PATHS(id))');
    const chars = read('demo/characters.js');
    expect(chars).not.toMatch(/await import\(p\)/);
    expect(chars).toContain("'../chars/smear.js': () => import('../chars/smear.js')");
    expect(chars).not.toContain('new URL(`../../characters/${id}.js`, import.meta.url)');
    const roster = read('demo/roster.js');
    expect(roster).toMatch(/^import __ctRoster from '\.\/roster\.json';/);
    expect(roster).not.toContain("fetch(new URL('./roster.json'");
    expect(read('town/pieces/ground.js')).toContain('const ga = engine.__ctGrassArea ?? viewArea(engine, 3);');
    // not a target: untouched
    expect(patchVendor(path.join(V, 'src/core/Engine.js'), 'x')).toBeNull();
    expect(patchVendor('/elsewhere/town/api.js', 'x')).toBeNull();
  });

  it('a changed vendor snippet fails loudly', () => {
    expect(() => patchVendor(path.join(V, 'src/town/api.js'), 'export const nothing = 1;')).toThrow(/known snippet is missing/);
    expect(() => patchVendor(path.join(V, 'src/town/pieces/ground.js'), 'const ga = viewArea(engine, 4);')).toThrow(/ground\.js/);
  });
});
