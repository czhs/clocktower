// v3 WP7 (v3-qa). Drives the mock-world harness (apps/client/src/game3d/harness/main.ts) on SwiftShader at the lowest
// quality and few frames (docs/v3/INTEGRATION.md §6.3, Q10 default: look only, never perf numbers from the host):
//   - every scenario in tests/v3/scenarios (or $HARNESS_SCENARIOS=a,b): replay, take each still when the page pauses
//     on it (__harness.pending → screenshot → __harness.ack()), no page error / CSP violation / fallback;
//   - `projection`: coords.ts worldToCss vs the drawn 1-texel marker at pixel scales 2, 3, 4 (§1.5);
//   - `cycles`: 5 mount/destroy cycles + 2 tier rebuilds + 1 injected frame-loop crash (the former
//     scripts/v3/smoke-mount.mjs, §1.3 leak test: hooks / canvases / boot mark cleared, JS heap growth < 10 MB).
// Stills and summary.json go to tests/v3/shots/<UTC date>/ (gitignored). Config: tests/v3/harness.config.ts.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATE = new Date().toISOString().slice(0, 10);
const SHOTS = path.join(HERE, 'shots', DATE);
const ALL = readdirSync(path.join(HERE, 'scenarios'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(HERE, 'scenarios', f), 'utf8')) as { name: string; mode?: string; viewport?: [number, number]; shots: { name: string }[] });
const only = (process.env.HARNESS_SCENARIOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const pick = (name: string) => !only.length || only.includes(name);
const summary: Record<string, unknown> = {};

type Hook = { done: boolean; error: string | null; ready: boolean; t: number; pending: { name: string } | null; shots: { name: string; t: number; cameraApplied?: boolean }[]; perf: { frames: number[]; readyMs: number | null }; fallbacks: string[]; consoleErrors: string[]; result: unknown };
const hook = (page: Page) => page.evaluate(() => (window as unknown as { __harness?: Hook }).__harness ?? null);

function watch(page: Page, sink: string[]) {
  page.on('pageerror', (e) => sink.push(`pageerror ${e.message.slice(0, 300)}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') sink.push(`console.error ${t.slice(0, 300)}`);
    if (/Content Security Policy|Refused to (load|execute|apply|create|evaluate)|Trusted/i.test(t)) sink.push(`csp ${t.slice(0, 300)}`);
    if (m.type() === 'warning' && /\[town\] piece .* failed/.test(t)) sink.push(`piece ${t.slice(0, 300)}`);
  });
}

/** Run the harness page until __harness.done, taking every still it pauses on. */
async function drive(page: Page, url: string, budgetMs: number): Promise<Hook> {
  await page.goto(url);
  const t0 = Date.now();
  for (;;) {
    const h = await hook(page);
    if (h?.pending) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `${h.pending.name}.png`) });
      await page.evaluate(() => (window as unknown as { __harness: Hook & { ack(): void } }).__harness.ack());
      continue;
    }
    if (h?.done) return h;
    if (Date.now() - t0 > budgetMs) throw new Error(`harness ${url}: not done after ${budgetMs} ms (ready ${h?.ready}, t ${h?.t}, shots ${h?.shots.map((s) => s.name).join(',')})`);
    await page.waitForTimeout(250);
  }
}

test.afterAll(() => {
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync(path.join(SHOTS, 'summary.json'), JSON.stringify(summary, null, 1));
});

for (const s of ALL.filter((x) => x.mode !== 'projection' && pick(x.name))) {
  test(`scenario ${s.name}`, async ({ page }) => {
    const errors: string[] = [];
    watch(page, errors);
    if (s.viewport) await page.setViewportSize({ width: s.viewport[0], height: s.viewport[1] });
    const h = await drive(page, `/v3-harness.html?scenario=${s.name}&tier=low&fps=15`, 540_000);
    const frames = h.perf.frames;
    summary[s.name] = { error: h.error, readyMs: h.perf.readyMs, frames: frames.length, shots: h.shots, fallbacks: h.fallbacks, result: h.result, errors };
    expect(h.error, 'harness error').toBeNull();
    expect(h.shots.map((x) => x.name), 'every still taken').toEqual(s.shots.map((x) => x.name));
    expect(h.fallbacks, 'no Classic fallback requested').toEqual([]);
    expect([...errors, ...h.consoleErrors], 'no page error / CSP violation / piece warning').toEqual([]);
  });
}

test('projection: worldToCss lands on the drawn texel at scales 2, 3, 4', async ({ page }) => {
  test.skip(!pick('projection'), 'not selected');
  const errors: string[] = [];
  watch(page, errors);
  const h = await drive(page, '/v3-harness.html?scenario=projection', 300_000);
  const r = h.result as { ok: boolean; gpu: string | null; samples: { scale: number; ok: boolean; err: number | null; naiveErr: number | null; block: unknown; expected: unknown }[] } | null;
  summary.projection = { error: h.error, result: r, errors };
  expect(h.error).toBeNull();
  expect(r?.gpu ?? '', 'SwiftShader only').toMatch(/SwiftShader/i);
  expect([...new Set(r!.samples.map((x) => x.scale))].sort()).toEqual([2, 3, 4]);
  for (const x of r!.samples) expect(x.block, `marker drawn (scale ${x.scale})`).not.toBeNull();
  // and the drawn texel is the one under the projected point (centre distance ≤ half a texel diagonal + 0.5 px)
  for (const x of r!.samples) expect(x.err!, `scale ${x.scale}: ${JSON.stringify(x)}`).toBeLessThanOrEqual((x.scale * Math.SQRT2) / 2 + 0.5);
  const bad = r!.samples.filter((x) => !x.ok);
  expect(bad, `worldToCss outside the drawn texel ±0.5 CSS px: ${JSON.stringify(bad)}`).toEqual([]);
  expect(errors).toEqual([]);
});

test('cycles: 5 mount/destroy + 2 tier rebuilds + 1 crash; no leaks', async ({ page }) => {
  test.skip(!pick('cycles'), 'not selected');
  const errors: string[] = [];
  watch(page, errors);
  // SwiftShader on a shared host: one town build is ~1-2 min, so 8 mounts need a long budget
  test.setTimeout(2_400_000);
  const h = await drive(page, '/v3-harness.html?mode=cycles&cycles=5&fps=15', 2_300_000);
  const r = h.result as { ok: boolean; checks: Record<string, boolean | null>; heapGrowth: number | null; results: unknown[] } | null;
  summary.cycles = { error: h.error, result: r, errors };
  expect(h.error).toBeNull();
  expect(r?.checks, JSON.stringify(r?.results)).toBeTruthy();
  for (const [k, v] of Object.entries(r!.checks)) expect(v, `cycles check ${k} (${JSON.stringify(r!.results).slice(0, 1500)})`).not.toBe(false);
  // the injected frame-loop throw logs one '[town3d] failed' line; nothing else may error
  expect(errors.filter((e) => !/\[town3d\] failed|injected frame-loop throw/.test(e))).toEqual([]);
});
