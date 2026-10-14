// Baseline checks that are valid even while gameplay modules are stubs: the real server boots on a
// test port with a temp DB, serves /healthz and security headers, and two isolated instances can run
// side by side (as dev and prod do on hshi-u1).
import { describe, expect, it } from 'vitest';
import { startServer } from '../support/server.js';
import { suiteServer } from '../support/suite.js';

const { server } = await suiteServer();

describe('test harness / server baseline', () => {
  it('serves /healthz with env=test and the injected version', async () => {
    const res = await fetch(`${server.url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, env: 'test', version: server.env.CT_VERSION });
    expect(server.env.CT_VERSION).toMatch(/^test-[0-9a-f]{12}$/);
  });

  it('sets security headers and hides X-Powered-By', async () => {
    const res = await fetch(`${server.url}/healthz`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('same-origin');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('binds loopback only (port in the qa range, never 3000/3001)', () => {
    expect(server.port).toBeGreaterThanOrEqual(3350);
    expect(server.port).toBeLessThanOrEqual(3399);
    expect(server.url.startsWith('http://127.0.0.1:')).toBe(true);
  });

  it('unknown /api routes never fall through to the SPA', async () => {
    const res = await fetch(`${server.url}/api/definitely-not-a-route`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('content-type') ?? '').not.toContain('text/html');
  });

  it('two server instances run side by side with independent state', async () => {
    const other = await startServer();
    try {
      expect(other.port).not.toBe(server.port);
      expect(other.dataDir).not.toBe(server.dataDir);
      expect(other.env.SESSION_SECRET).not.toBe(server.env.SESSION_SECRET);
      const [a, b] = await Promise.all([fetch(`${server.url}/healthz`), fetch(`${other.url}/healthz`)]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    } finally {
      await other.stop();
    }
    // the first instance is unaffected by the other's shutdown
    expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
  });

  it('a malformed WebSocket upgrade does not crash the server', async () => {
    const ws = new WebSocket(`${server.wsUrl}/nope/nope?sessionId=bad`);
    await new Promise<void>((resolve) => {
      ws.onclose = () => resolve();
      ws.onerror = () => resolve();
      setTimeout(resolve, 3000);
    });
    expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
  });
});
