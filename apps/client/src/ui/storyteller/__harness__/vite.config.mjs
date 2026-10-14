// TEMPORARY harness build (rules-storyteller)
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: here + 'dist', emptyOutDir: true, target: 'es2022', cssCodeSplit: false,
    lib: { entry: here + 'main.tsx', formats: ['iife'], name: 'H', fileName: () => 'h.js' },
  },
  define: { 'process.env.NODE_ENV': '"production"' },
});
