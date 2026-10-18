// v3 WP0s (v3-core). Runtime import closure of a client module, by text scan (no bundler): follows static
// `import ... from` / `export ... from` / side-effect `import '...'`, dynamic `import('...')`, relative specifiers
// and `@ct/*` workspace packages (through each package.json `exports`). Type-only imports / re-exports are skipped
// (erased at build time). Used by the "never loads phaser / three" boundary tests of the renderer-free cores.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

/** Renderer libraries a renderer-free module must never reach (three via the vendor alias, too). */
export const RENDERER_SPEC = /^(?:phaser|three|@pixel3d)(?:\/|$)/;

/** Runtime module specifiers in a TS source (type-only imports / exports excluded). */
export function runtimeSpecifiers(code: string): string[] {
  const out: string[] = [];
  // import x from 'a' · import { a, type B } from 'a' · import 'a' · export * from 'a' · export { a } from 'a'
  const stat = /^[ \t]*(import|export)[ \t]+(type[ \t]+(?=[{*\w]))?(?:[^'";]*?\bfrom[ \t]*)?['"]([^'"\n]+)['"]/gm;
  for (const m of code.matchAll(stat)) if (!m[2]) out.push(m[3]!);
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g)) out.push(m[1]!);
  return out;
}

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

function resolveFile(base: string): string | null {
  const noJs = base.replace(/\.js$/, '');
  for (const c of [base, `${noJs}.ts`, `${noJs}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (isFile(c)) return c;
  return null;
}

/** `@ct/name[/sub]` -> the TS source its package.json `exports` points at (null for non-TS targets, e.g. JSON). */
function resolveWorkspace(spec: string): string | null {
  const m = /^@ct\/([^/]+)(?:\/(.+))?$/.exec(spec);
  if (!m) return null;
  const dir = path.join(REPO, 'packages', m[1]!);
  const pj = path.join(dir, 'package.json');
  if (!isFile(pj)) return null;
  const exp = (JSON.parse(readFileSync(pj, 'utf8')) as { exports?: Record<string, string> }).exports ?? {};
  const key = m[2] ? `./${m[2]}` : '.';
  let target = exp[key];
  if (!target) {
    for (const [k, v] of Object.entries(exp)) if (k.endsWith('/*') && key.startsWith(k.slice(0, -1))) target = v.replace('*', key.slice(k.length - 1));
  }
  if (!target || !/\.tsx?$/.test(target)) return null;
  return resolveFile(path.join(dir, target));
}

export interface ImportClosure {
  /** Every source file reached (repo-relative). */
  seen: string[];
  /** `file -> specifier` for every renderer import reached. */
  bad: string[];
  /** `file -> specifier` for relative / @ct specifiers that did not resolve to a source file. */
  unresolved: string[];
}

export function importClosure(entry: string, banned: RegExp = RENDERER_SPEC): ImportClosure {
  const seen = new Set<string>();
  const bad: string[] = [];
  const unresolved: string[] = [];
  const rel = (p: string) => path.relative(REPO, p).split(path.sep).join('/');
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
      if (banned.test(spec)) {
        bad.push(`${rel(file)} -> ${spec}`);
        continue;
      }
      // assets / data (Vite `?url` / `?raw`, images, JSON, CSS): not modules that can load a renderer
      if (spec.includes('?') || /\.(json|css|png|webp|svg|jpe?g|gif|mp3|ogg|wav|woff2?)$/.test(spec)) continue;
      let next: string | null = null;
      if (spec.startsWith('.')) next = resolveFile(path.resolve(path.dirname(file), spec));
      else if (spec.startsWith('@ct/')) {
        next = resolveWorkspace(spec);
      } else continue; // other bare packages (preact, zod, ...): not renderer code
      if (next) visit(next);
      else unresolved.push(`${rel(file)} -> ${spec}`);
    }
  };
  visit(entry);
  return { seen: [...seen].map(rel), bad, unresolved };
}
