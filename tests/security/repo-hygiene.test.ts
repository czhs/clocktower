// Repo / supply-chain hygiene (security v2.3, area 1 — findings REPO-*; see
// docs/security-v2.3/01-repo-supply-chain.md). Pure filesystem checks: works in the hshi-u1
// sandboxes (which have no .git) and in CI. `it.fails` = a known finding whose fix lands in phase B;
// when the fix lands the test starts passing, vitest reports it, and it is flipped to `it`.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

// Directories that are never committed (see .gitignore) or are third-party / generated binaries.
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'data', 'logs', 'test-results', 'playwright-report', 'staging', '_staging', 'landing-staging', 'ai', 'eggs', 'security-v2.3']);
const TEXT_EXT = /\.(ts|tsx|mts|mjs|js|cjs|json|ya?ml|toml|md|sh|service|timer|example|env|txt|html|css|sudoers)$/;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile() && st.size < 2_000_000 && (TEXT_EXT.test(name) || name.startsWith('.env'))) yield full;
  }
}
// web-client.test.ts (sec-web) deny-lists host strings that must never reach the client bundle.
// CONTRACT-REQUEST (sec-web): build those strings at runtime (e.g. from ops.local.env) so the
// literal leaves the tree; then drop it from this set (secret-scan.sh/gitleaks flag it on commit).
const SELF = new Set(['.gitleaks.toml', 'scripts/secret-scan.sh', 'tests/security/repo-hygiene.test.ts', 'pnpm-lock.yaml', 'tests/security/web-client.test.ts']);

function scan(re: RegExp, allow?: RegExp): string[] {
  const hits: string[] = [];
  for (const f of walk(ROOT)) {
    const rel = path.relative(ROOT, f);
    if (SELF.has(rel)) continue;
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(re)) if (!allow || !allow.test(m[0])) hits.push(`${rel}:${i + 1}`);
    });
  }
  return hits;
}

const TAILNET = /\b[a-z0-9][a-z0-9-]*\.tail[0-9a-f]{4,}\.ts\.net\b/g;
const CGNAT = /(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?![\d])/g;
const HOME = /\/(?:home|Users)\/[a-z_][a-z0-9_-]{1,31}(?![a-z0-9_-])/g;
const HOME_OK = /\/(?:home|Users)\/(?:user|USER|username|runner|node|ubuntu|clocktower|admin|you|me|example)$/;

describe('REPO: secret-scan tooling is present', () => {
  it('gitleaks config, fallback scanner, hook, CI workflow, dependabot and SECURITY.md exist', () => {
    for (const f of ['.gitleaks.toml', 'scripts/secret-scan.sh', 'scripts/hooks/pre-push', 'scripts/install-hooks.sh', '.github/workflows/security.yml', '.github/dependabot.yml', 'SECURITY.md']) {
      expect(existsSync(path.join(ROOT, f)), f).toBe(true);
    }
  });
  it('CI pins every third-party action by full commit SHA', () => {
    const wf = read('.github/workflows/security.yml');
    const uses = [...wf.matchAll(/uses:\s*([^\s#]+)/g)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
    expect(wf).toMatch(/fetch-depth:\s*0/);
  });
  it('gitleaks allowlist only names exact fake values (anchored)', () => {
    const toml = read('.gitleaks.toml');
    const block = toml.slice(toml.indexOf('[[allowlists]]'));
    const values = [...block.matchAll(/'''\^([^']+)\$'''/g)].map((m) => m[1]!);
    expect(values.length).toBeGreaterThan(5);
    for (const v of values) expect(v, v).toMatch(/fake|perf|playtest|world-?audit|leak|test|change-me|other/i);
  });
});

describe('REPO: lockfile integrity', () => {
  const lock = read('pnpm-lock.yaml');
  it('every package resolves from the npm registry with an integrity hash (no git/tarball/exotic deps)', () => {
    expect(lock).not.toMatch(/resolution:\s*\{[^}]*(tarball|repo|commit|directory):/);
    expect(lock).not.toMatch(/(git\+|github:|codeload\.github)/);
    const resolutions = lock.match(/resolution: \{/g)?.length ?? 0;
    const integrity = lock.match(/resolution: \{integrity: sha512-/g)?.length ?? 0;
    expect(integrity).toBe(resolutions);
  });
  it('REPO-05: @pm2/io (auto-installed peer of @colyseus/core, loaded at runtime with require hooks) is not installed', () => {
    expect(lock).not.toMatch(/^ {2}'@pm2\/io@/m);
  });
});

describe('REPO-06: install hardening in pnpm config', () => {
  const ws = read('pnpm-workspace.yaml');
  it('minimumReleaseAge, strictDepBuilds and blockExoticSubdeps are set', () => {
    expect(ws).toMatch(/^minimumReleaseAge:\s*\d+/m);
    expect(ws).toMatch(/^strictDepBuilds:\s*true/m);
    expect(ws).toMatch(/^blockExoticSubdeps:\s*true/m);
  });
  it('sandbox installs use the frozen lockfile (scripts/remote-prepare.sh)', () => {
    expect(read('scripts/remote-prepare.sh')).toMatch(/pnpm install[^\n]*--frozen-lockfile/);
    expect(read('scripts/remote-prepare.sh')).not.toMatch(/pnpm install(?![^\n]*--frozen-lockfile)[^\n]*--reporter/);
  });
  it('deploy installs never fall back to a non-frozen install', () => {
    const rel = read('deploy/bin/install-release.sh');
    expect(rel).toMatch(/pnpm install --frozen-lockfile/);
    expect(rel).not.toMatch(/--no-frozen-lockfile/);
  });
  it('remote.sh only copies the lockfile back for explicit dependency commands', () => {
    const r = read('scripts/remote.sh');
    expect(r).toMatch(/elif \[\[ \$EXPLICIT == 1 \]\]; then\s+mv "\$LOCKTMP" "\$ROOT\/pnpm-lock\.yaml"/);
    expect(r).toMatch(/NOT copied/);
  });
  it('package.json has no duplicate pnpm settings block (pnpm-workspace.yaml is the single source)', () => {
    expect(JSON.parse(read('package.json')).pnpm).toBeUndefined();
  });
  it('audit triage is recorded (ignoreGhsas) and every ignored GHSA is justified in the findings file', () => {
    const ws = read('pnpm-workspace.yaml');
    const ids = [...ws.matchAll(/- (GHSA-[a-z0-9-]+)/g)].map((m) => m[1]!);
    expect(ids.sort()).toEqual(['GHSA-28wg-ghj8-5hjv', 'GHSA-2v37-7h3g-55p8', 'GHSA-67mh-4wv8-2f99', 'GHSA-mwcw-c2x4-8c55', 'GHSA-xwg4-73v4-xw9w']);
  });
});

describe('REPO-07: .gitignore covers secrets, data and local ops files', () => {
  const gi = read('.gitignore').split('\n').map((l) => l.trim());
  it('has patterns for sqlite/journal/backup/log/key/cert/cloudflared creds/.claude local/ops.local.env', () => {
    for (const p of ['*.sqlite', '*.sqlite3', '*.db-journal', '*.log', '*.bak', 'backups/', '*.pem', '*.key', '*.p12', '.claude/settings.local.json', 'ops.local.env', 'deploy/cloudflared/*.json']) {
      expect(gi, p).toContain(p);
    }
  });
});

describe('REPO-03: no private-infrastructure details in the tree', () => {
  it('ops scripts take the host from ops.local.env / CT_HOST, never a hardcoded default', () => {
    const scripts = ['scripts/remote.sh', 'scripts/pull.sh', 'scripts/deploy-hshi-u1.sh', 'scripts/setup-hshi-u1.sh', 'scripts/dev.sh', 'scripts/backup-db.sh', 'scripts/verify-public-endpoint.sh'];
    for (const f of scripts) {
      const src = read(f);
      expect(src, f).not.toMatch(/CT_HOST:-[^}]/);
      expect(src, f).toMatch(/ops-env\.sh/);
    }
    expect(read('deploy/bin/bootstrap.sh')).toMatch(/CT_PUBLIC_HOST:\?/);
    expect(read('ops.example.env')).toMatch(/^CT_HOST=build-host$/m);
  });
  it('CLAUDE.md and the host docs carry no host recon', () => {
    for (const f of ['CLAUDE.md', 'docs/HANDOFF.md', 'docs/security.md', 'docs/progress.md']) {
      expect(read(f), f).not.toMatch(/\blxd\b|playit|minecraft|ollama|0\.0\.0\.0:22|RTX|4090/i);
    }
  });
  it('no tailnet MagicDNS names', () => expect(scan(TAILNET)).toEqual([]));
  it('no Tailscale/CGNAT 100.64.0.0/10 addresses', () => expect(scan(CGNAT)).toEqual([]));
  it('no /home/<user> or /Users/<user> paths naming a real account', () => expect(scan(HOME, HOME_OK)).toEqual([]));
});
