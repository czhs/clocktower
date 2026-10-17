import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// (v3 WP0) The same resolution as apps/client/vite.config.ts: the read-only pixel3d vendor tree has no
// node_modules, so `three` / `three/addons/*` resolve to apps/client's single three@0.170.0, and
// '@pixel3d/' / '@v3assets/' point into v3/. Unit tests that import a game3d wrapper get the same copy.
const root = path.dirname(fileURLToPath(import.meta.url));
function packageDir(name: string, from: string): string {
  let d = path.dirname(createRequire(from).resolve(name));
  while (!existsSync(path.join(d, 'package.json'))) d = path.dirname(d);
  return d;
}
let threeDir: string | null = null;
try {
  threeDir = packageDir('three', path.join(root, 'apps/client/package.json'));
} catch {
  threeDir = null; // a sandbox without the client installed: tests that need three fail on their own
}
const v3Aliases = [
  ...(threeDir
    ? [
        { find: /^three$/, replacement: path.join(threeDir, 'build/three.module.js') },
        { find: /^three\/addons\/(.*)$/, replacement: path.join(threeDir, 'examples/jsm/$1') },
      ]
    : []),
  { find: /^@pixel3d\//, replacement: path.join(root, 'v3/pixel3d/src/') },
  { find: /^@v3assets\//, replacement: path.join(root, 'v3/assets/ui/') },
];

// Unit tests live next to each package (packages/*/test, apps/*/test) plus cross-cutting
// suites under tests/{unit,integration,security}. E2E (Playwright) and load tests run separately.
export default defineConfig({
  resolve: { alias: v3Aliases, dedupe: ['three'] },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],
    testTimeout: 20000,
    pool: 'forks',
  },
});
