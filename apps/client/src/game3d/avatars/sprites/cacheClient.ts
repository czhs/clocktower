// v3.3 sprites: the sheet cache as the bake store uses it. On the main thread: a module Worker would keep the packing
// / gzip / IndexedDB clones off it, but the site enforces Trusted Types with `trusted-types 'none'` (securityHeaders.ts
// WEB-2), so `new Worker(url)` is blocked and logs a console error; there is no way to probe that silently. Instead the
// store writes a sheet only while no bake is pending (bake.ts persist), and cache.ts (de)compresses in 64 KB pieces
// with a macrotask between them, so a store or a load never blocks a frame.
import { createSheetCache, type SheetCache } from './cache';

export function createCacheClient(): SheetCache {
  return createSheetCache();
}
