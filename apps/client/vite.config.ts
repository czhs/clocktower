import { defineConfig } from 'vite';

// The production server (apps/server) serves dist/ on the same origin as the API and
// WebSockets. In dev, `pnpm --filter @ct/client dev` proxies API/WS to the dev server on 3001.
//
// (v2.2 perf WP3) The browser never validates messages (the server does), so the bundle resolves
// the bare `@ct/protocol` to its schema-free entry `@ct/protocol/client`: the same types and runtime
// values without zod. Client code (and @ct/voice/shared, @ct/assets) keeps importing '@ct/protocol'
// and typechecks against the full protocol; importing a schema at runtime fails this build
// ("… is not exported by …/client.ts").
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: { alias: [{ find: /^@ct\/protocol$/, replacement: '@ct/protocol/client' }] },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/healthz': 'http://127.0.0.1:3001',
      '/matchmake': 'http://127.0.0.1:3001',
      '^/[a-zA-Z0-9]{9}/[a-zA-Z0-9_-]+': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
});
