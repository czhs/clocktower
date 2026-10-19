// (v3.2 perf, lever 5; docs/perf-v3/fullstack.md §4/§7) Serves the build-time `<file>.br` / `<file>.gz`
// siblings written by apps/client/build/precompress.mjs (brotli q11 / gzip 9; the edge compressed at
// ≈ brotli q4). Mounted in app.ts right before express.static; anything it does not answer falls
// through to express.static (identity) unchanged.
//
// - Negotiation: Accept-Encoding with q-values; br preferred over gzip at equal q; `br;q=0` never gets
//   br; `*` covers codings not listed. No acceptable coding or no sibling on disk: identity.
// - Every compressible response (js/mjs/css/json/svg) carries `Vary: Accept-Encoding`, identity included.
// - Headers: the original file's Content-Type (as express sets it), Content-Encoding, the compressed
//   Content-Length, the same Cache-Control as the identity file (cacheControl(filePath)), and a
//   distinct weak ETag per variant (`W/"<size>-<mtime>-br"`) + Last-Modified, so conditional GETs
//   (If-None-Match / If-Modified-Since) answer 304 for the variant the client holds.
// - Range requests are served identity by express.static (the encoded variant is never ranged).
//   Browsers do not send Range for scripts/styles; media (ogg/png) is never precompressed.
// - A direct request for a sibling (`x.js.br`) is a 404 like any missing file, so a compressed body is
//   never served under a .br URL with a wrong type. Dotfiles and traversal never resolve (the path is
//   resolved under root and checked; NUL / malformed percent-encoding fall through).
// - HEAD: headers only.
import { createReadStream, statSync, type Stats } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';

/** Keep in sync with COMPRESSIBLE in apps/client/build/precompress.mjs. */
export const COMPRESSIBLE = /\.(js|mjs|css|json|svg)$/i;

export type Coding = 'br' | 'gzip';

/** Pick the content coding for an Accept-Encoding header among the codings that exist on disk. */
export function negotiateEncoding(header: string | undefined, available: readonly Coding[]): Coding | null {
  if (!header || available.length === 0) return null;
  const q = new Map<string, number>();
  for (const part of header.split(',')) {
    const [rawName, ...params] = part.trim().split(';');
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;
    let weight = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
      if (m) weight = Number(m[1]);
    }
    if (!Number.isFinite(weight)) weight = 0;
    // a repeated coding keeps its highest weight
    q.set(name, Math.max(q.get(name) ?? 0, Math.min(1, weight)));
  }
  const star = q.get('*');
  const weightOf = (c: Coding) => q.get(c) ?? (c === 'gzip' ? q.get('x-gzip') : undefined) ?? star ?? 0;
  let best: Coding | null = null;
  let bestQ = 0;
  for (const c of (['br', 'gzip'] as const).filter((x) => available.includes(x))) {
    const w = weightOf(c);
    if (w > bestQ) {
      best = c;
      bestQ = w;
    }
  }
  return best;
}

const statFile = (p: string): Stats | null => {
  try {
    const s = statSync(p);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
};

export interface PrecompressedOptions {
  /** Cache-Control for a file (absolute path of the ORIGINAL file), shared with express.static's setHeaders. */
  cacheControl(filePath: string): string;
}

export function precompressedStatic(root: string, opts: PrecompressedOptions): RequestHandler {
  const base = path.resolve(root);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel: string;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    if (rel.includes('\0') || rel.split('/').some((seg) => seg.startsWith('.'))) return next();
    const file = path.resolve(base, '.' + rel);
    if (!file.startsWith(base + path.sep)) return next();

    // A precompressed sibling is not a resource of its own.
    const sibling = /\.(br|gz)$/i.exec(file);
    if (sibling && COMPRESSIBLE.test(file.slice(0, -sibling[0].length)) && statFile(file.slice(0, -sibling[0].length))) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).type('text/plain').send('Not found');
      return;
    }

    if (!COMPRESSIBLE.test(file)) return next();
    res.vary('Accept-Encoding');
    if (req.headers.range !== undefined) return next();
    const original = statFile(file);
    if (!original) return next();

    const variants: Record<Coding, { ext: string; stat: Stats | null }> = {
      br: { ext: 'br', stat: statFile(`${file}.br`) },
      gzip: { ext: 'gz', stat: statFile(`${file}.gz`) },
    };
    const coding = negotiateEncoding(req.headers['accept-encoding'], (['br', 'gzip'] as const).filter((c) => variants[c].stat));
    if (!coding) return next();
    const { ext, stat } = variants[coding];
    const s = stat!;

    res.type(path.extname(file));
    res.setHeader('Content-Encoding', coding);
    res.setHeader('Cache-Control', opts.cacheControl(file));
    res.setHeader('ETag', `W/"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}-${ext}"`);
    res.setHeader('Last-Modified', s.mtime.toUTCString());
    if (req.fresh) {
      res.removeHeader('Content-Encoding');
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Length', String(s.size));
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.status(200);
    const stream = createReadStream(`${file}.${ext}`);
    stream.on('error', (err) => {
      if (!res.headersSent) {
        for (const h of ['Content-Encoding', 'Content-Length', 'ETag', 'Last-Modified']) res.removeHeader(h);
        next(err);
      } else res.destroy(err);
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  };
}
