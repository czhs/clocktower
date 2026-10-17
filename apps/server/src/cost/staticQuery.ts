// OWNED BY voice/sec-voice (v2.3 VOICE-12). Cloudflare caches static files by URL *including* the
// query string, so `/assets/index-….js?x=<random>` is a cache MISS that the origin (the home
// uplink) has to serve in full. Static files take no query parameters, except the intro tour's
// `/tutorial/<clip>?v=<generatedAt>` cache buster, which must match the current manifest.
// Anything else gets a tiny uncacheable 400. Navigations (no file extension) are untouched.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';

const NOT_STATIC = /^\/(api|healthz|matchmake|internal)(\/|$)/;

export function staticQueryGuard(root: string, now: () => number = Date.now): RequestHandler {
  const manifestPath = path.join(root, 'tutorial', 'manifest.json');
  let cached: { at: number; v: string | null } | null = null;
  const tutorialVersion = (): string | null => {
    const t = now();
    if (cached && t - cached.at < 60_000) return cached.v;
    let v: string | null = null;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { generatedAt?: unknown };
      v = typeof m.generatedAt === 'string' ? m.generatedAt : null;
    } catch {
      v = null;
    }
    cached = { at: t, v };
    return v;
  };
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const q = req.originalUrl.indexOf('?');
    if (q < 0) return next();
    const p = req.path;
    if (NOT_STATIC.test(p)) return next();
    const isFile = p.startsWith('/assets/') || path.posix.extname(p) !== '';
    if (!isFile) return next();
    const params = new URLSearchParams(req.originalUrl.slice(q + 1));
    const keys = [...params.keys()];
    if (p.startsWith('/tutorial/') && keys.length === 1 && keys[0] === 'v') {
      const v = tutorialVersion();
      if (v !== null && params.get('v') === v) return next();
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(400).type('text/plain').send('Bad request');
  };
}
