// OWNED BY voice/sec-voice (v2.3 VOICE-12): static files reject cache-busting query strings.
import http from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { staticQueryGuard } from '../src/cost/staticQuery.js';

describe('VOICE-12: static files reject cache-busting query strings', () => {
  it('400 for ?x on static files, the tutorial ?v=<generatedAt> passes, navigations untouched', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ct-sq-'));
    mkdirSync(path.join(root, 'assets'));
    mkdirSync(path.join(root, 'tutorial'));
    writeFileSync(path.join(root, 'assets', 'index-abc.js'), 'x'.repeat(10_000));
    writeFileSync(path.join(root, 'tutorial', 'town.mp4'), 'v'.repeat(5_000));
    writeFileSync(path.join(root, 'tutorial', 'manifest.json'), JSON.stringify({ generatedAt: '2026-10-15T17:14:00.000Z', clips: {} }));
    const app = express();
    app.use(staticQueryGuard(root));
    app.use(express.static(root));
    app.use((_req, res) => void res.send('<html>spa</html>'));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(3388, '127.0.0.1', r));
    try {
      const get = async (p: string) => {
        const r = await fetch(`http://127.0.0.1:3388${p}`);
        return { status: r.status, len: (await r.text()).length, cc: r.headers.get('cache-control') };
      };
      expect((await get('/assets/index-abc.js')).len).toBe(10_000);
      expect(await get('/assets/index-abc.js?x=1')).toMatchObject({ status: 400, cc: 'no-store' });
      expect((await get('/assets/index-abc.js?x=1')).len).toBeLessThan(20);
      expect((await get('/tutorial/town.mp4?v=2026-10-15T17%3A14%3A00.000Z')).status).toBe(200);
      expect((await get('/tutorial/town.mp4?v=random')).status).toBe(400);
      expect((await get('/tutorial/town.mp4?v=2026-10-15T17%3A14%3A00.000Z&x=1')).status).toBe(400);
      expect((await get('/lobby/amber-fox-lantern?ref=chat')).status).toBe(200);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(root, { recursive: true, force: true });
    }
  });
});
