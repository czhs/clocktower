// Host-level exposure checks — meaningful only when run ON hshi-u1 (where `pnpm test` runs via
// scripts/remote.sh). Verifies the dev service (3001) is loopback-only and never targeted by
// Tailscale Serve/Funnel, and prod (3000) is loopback-only. Skips elsewhere with a reason.
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { describe, expect, it } from 'vitest';

function sh(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

const onHost = os.platform() === 'linux' && os.hostname() === 'hshi-u1';
const hasTailscale = onHost && sh('tailscale', ['version']) !== null;

describe.skipIf(!onHost)(`hshi-u1 port exposure${onHost ? '' : ' [SKIPPED — not running on hshi-u1]'}`, () => {
  it('dev (3001) and prod (3000) listen on 127.0.0.1 only (if running)', () => {
    for (const port of [3000, 3001]) {
      const out = sh('ss', ['-Hltn', `sport = :${port}`]) ?? '';
      for (const line of out.split('\n').filter(Boolean)) {
        const local = line.trim().split(/\s+/)[3] ?? '';
        expect(local, `:${port} bound to ${local}`).toBe(`127.0.0.1:${port}`);
      }
    }
  });

  it.skipIf(!hasTailscale)('Tailscale Serve/Funnel config never targets the dev port', () => {
    const json = sh('tailscale', ['serve', 'status', '--json']) ?? '{}';
    expect(json).not.toMatch(/:3001\b/);
    const funnel = sh('tailscale', ['funnel', 'status', '--json']) ?? '{}';
    expect(funnel).not.toMatch(/:3001\b/);
  });

  it('dev is not reachable on the tailnet / LAN addresses', async () => {
    const addrs = Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => a!.address);
    for (const addr of addrs) {
      const ok = await fetch(`http://${addr}:3001/healthz`, { signal: AbortSignal.timeout(1500) }).then(
        () => true,
        () => false,
      );
      expect(ok, `dev reachable on ${addr}:3001`).toBe(false);
    }
  });
});
