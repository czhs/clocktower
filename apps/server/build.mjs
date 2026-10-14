// Bundles the server (and workspace packages) into dist/server.js. Third-party deps stay
// external and are resolved from node_modules installed ON the target host.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@ct/'));
external.push('better-sqlite3', 'livekit-server-sdk', 'drizzle-orm', 'drizzle-orm/*');

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.log('server bundle -> apps/server/dist/server.js');
