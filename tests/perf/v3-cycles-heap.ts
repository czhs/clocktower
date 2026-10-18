// v3.1 (fixes) — what survives the harness `?mode=cycles` run (5 mount/destroy + 2 tier rebuilds + 1 crash).
// Opens the harness (a `vite preview` of apps/client/dist-harness, ideally built with `--minify false` so class names
// survive), waits for the cycles result, forces GC, takes a CDP heap snapshot and prints, for the named classes
// (Engine, WebGLRenderer, Scene, ...), how many are alive and the shortest retainer path of the first few from a GC
// root (weak edges ignored). Writes the result JSON (+ optional .heapsnapshot) under test-results/v3-cycles-heap/.
//
//   pnpm --filter @ct/client exec vite build -c vite.harness.config.ts --minify false
//   (pnpm --filter @ct/client exec vite preview -c vite.harness.config.ts --port 3487 --strictPort --host 127.0.0.1 &)
//   pnpm exec tsx tests/perf/v3-cycles-heap.ts --url http://127.0.0.1:3487 [--cycles 5] [--gl gpu|swiftshader]
//        [--classes Engine,WebGLRenderer] [--keep yes]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type CDPSession } from '@playwright/test';
import { REPO_ROOT } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const URL0 = arg('url', 'http://127.0.0.1:3487');
const CYCLES = Number(arg('cycles', '5'));
const GL = arg('gl', 'gpu');
const CLASSES = arg('classes', 'Engine,WebGLRenderer,Scene,PixelPipeline,PixelCamera,WebGLRenderTarget,ResizeObserver,HTMLCanvasElement,WebGL2RenderingContext').split(',');
const KEEP = arg('keep', 'no') === 'yes';
const OUT = path.resolve(REPO_ROOT, 'test-results/v3-cycles-heap');
const log = (...a: unknown[]) => console.log(`[cycles-heap ${new Date().toISOString().slice(11, 19)}]`, ...a);

interface Snap {
  nodeFields: string[];
  edgeFields: string[];
  nodeTypes: string[];
  edgeTypes: string[];
  nodes: number[];
  edges: number[];
  strings: string[];
}

async function snapshot(cdp: CDPSession): Promise<string> {
  const chunks: string[] = [];
  const on = (e: { chunk: string }) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', on);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false } as never);
  cdp.off('HeapProfiler.addHeapSnapshotChunk', on);
  return chunks.join('');
}

function analyse(raw: string) {
  const j = JSON.parse(raw) as { snapshot: { meta: { node_fields: string[]; edge_fields: string[]; node_types: [string[]]; edge_types: [string[]] } }; nodes: number[]; edges: number[]; strings: string[] };
  const s: Snap = { nodeFields: j.snapshot.meta.node_fields, edgeFields: j.snapshot.meta.edge_fields, nodeTypes: j.snapshot.meta.node_types[0], edgeTypes: j.snapshot.meta.edge_types[0], nodes: j.nodes, edges: j.edges, strings: j.strings };
  const NF = s.nodeFields.length;
  const EF = s.edgeFields.length;
  const nType = s.nodeFields.indexOf('type');
  const nName = s.nodeFields.indexOf('name');
  const nEdges = s.nodeFields.indexOf('edge_count');
  const nSelf = s.nodeFields.indexOf('self_size');
  const eType = s.edgeFields.indexOf('type');
  const eName = s.edgeFields.indexOf('name_or_index');
  const eTo = s.edgeFields.indexOf('to_node');
  const N = s.nodes.length / NF;
  const firstEdge = new Uint32Array(N + 1);
  for (let i = 0, e = 0; i < N; i++) {
    firstEdge[i] = e;
    e += s.nodes[i * NF + nEdges]! * EF;
  }
  firstEdge[N] = s.edges.length;
  const name = (i: number) => s.strings[s.nodes[i * NF + nName]!]!;
  const type = (i: number) => s.nodeTypes[s.nodes[i * NF + nType]!]!;
  const weak = s.edgeTypes.indexOf('weak');
  const shortcut = s.edgeTypes.indexOf('shortcut');
  const internal = s.edgeTypes.indexOf('internal');
  // BFS from the root (node 0) over strong edges: parent pointers
  const parent = new Int32Array(N).fill(-1);
  const parentEdge = new Int32Array(N).fill(-1);
  parent[0] = 0;
  const q = new Uint32Array(N);
  let qh = 0;
  let qt = 0;
  q[qt++] = 0;
  while (qh < qt) {
    const i = q[qh++]!;
    for (let e = firstEdge[i]!; e < firstEdge[i + 1]!; e += EF) {
      const t = s.edges[e + eType]!;
      if (t === weak || t === shortcut) continue;
      // a WeakMap table -> value edge is an ephemeron (the value lives only while the key does): the value is reached
      // through its key's own edge instead
      if (t === internal && s.strings[s.edges[e + eName]!]!.includes('part of key')) continue;
      const to = s.edges[e + eTo]! / NF;
      if (parent[to] !== -1) continue;
      parent[to] = i;
      parentEdge[to] = e;
      q[qt++] = to;
    }
  }
  const edgeLabel = (e: number) => {
    const t = s.edgeTypes[s.edges[e + eType]!]!;
    const v = s.edges[e + eName]!;
    return t === 'element' || t === 'hidden' ? `[${v}]` : `.${s.strings[v]}`;
  };
  const pathOf = (i: number) => {
    const out: string[] = [];
    let k = i;
    for (let guard = 0; k !== 0 && guard < 60; guard++) {
      const e = parentEdge[k]!;
      if (e < 0) return ['(unreachable from root)'];
      out.push(`${edgeLabel(e)} -> ${type(k)}:${name(k).slice(0, 60)}`);
      k = parent[k]!;
    }
    return out.reverse();
  };
  const want = new Set(CLASSES);
  const found: Record<string, { count: number; reachable: number; paths: string[][] }> = {};
  let total = 0;
  for (let i = 0; i < N; i++) {
    total += s.nodes[i * NF + nSelf]!;
    if (type(i) !== 'object' && type(i) !== 'native') continue;
    const nm = name(i);
    if (!want.has(nm)) continue;
    const f = (found[nm] ??= { count: 0, reachable: 0, paths: [] });
    f.count++;
    if (parent[i] !== -1) {
      f.reachable++;
      if (f.paths.length < 3) f.paths.push(pathOf(i));
      if (nm === 'Engine' || nm === 'WebGLRenderer') {
        // every direct retainer of a retained engine / renderer (edge + holder), to see more than the BFS path
        const ret: string[] = [];
        for (let k = 0; k < N && ret.length < 40; k++)
          for (let e = firstEdge[k]!; e < firstEdge[k + 1]!; e += EF)
            if (s.edges[e + eTo]! / NF === i && s.edges[e + eType]! !== weak) ret.push(`${type(k)}:${name(k).slice(0, 50)} ${edgeLabel(e)}`);
        (f as { retainers?: string[] }).retainers = ret;
      }
    }
  }
  return { nodes: N, totalMB: Math.round((total / 1048576) * 10) / 10, found };
}

function report(a: ReturnType<typeof analyse>) {
  log('snapshot nodes', a.nodes, 'self MB', a.totalMB);
  for (const [k, v] of Object.entries(a.found)) {
    log(`${k}: ${v.count} (reachable ${v.reachable})`);
    for (const p of v.paths) log('  path:\n    ' + p.join('\n    '));
    const r = (v as { retainers?: string[] }).retainers;
    if (r) log('  retainers:\n    ' + r.join('\n    '));
  }
  writeFileSync(path.join(OUT, 'analysis.json'), JSON.stringify(a, null, 1));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const offline = arg('snapshot', '');
  if (offline) {
    const { readFileSync } = await import('node:fs');
    report(analyse(readFileSync(path.resolve(REPO_ROOT, offline), 'utf8')));
    return;
  }
  const glArgs = GL === 'gpu' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ args: [...glArgs, '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => log('pageerror', e.message.slice(0, 200)));
    page.on('console', (m) => m.type() === 'error' && log('console.error', m.text().slice(0, 200)));
    await page.goto(`${URL0}/v3-harness.html?mode=cycles&cycles=${CYCLES}&fps=15`);
    const t0 = Date.now();
    for (;;) {
      const h = await page.evaluate(() => {
        const x = (window as unknown as { __harness?: { done?: boolean; t?: number; error?: string | null; result?: unknown } }).__harness;
        return x ? { done: !!x.done, t: x.t, error: x.error ?? null, result: x.done ? x.result : null } : null;
      });
      if (h?.done) {
        const r = h.result as { checks: unknown; heap0: number; heapGrowth: number; results: { i: number; kind: string; tier: string; heapMB: number }[] } | null;
        log('done', h.error ?? '', JSON.stringify(r?.checks), 'heap0', r?.heap0, 'growth', r?.heapGrowth);
        log('heaps', JSON.stringify(r?.results.map((x) => `${x.i}${x.kind[0]}${x.tier[0]}:${x.heapMB}`)));
        writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(h, null, 1));
        break;
      }
      if (Date.now() - t0 > 1_500_000) throw new Error('harness not done');
      await page.waitForTimeout(500);
    }
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
    await page.waitForTimeout(500);
    await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
    const raw = await snapshot(cdp);
    if (KEEP) writeFileSync(path.join(OUT, 'after-cycles.heapsnapshot'), raw);
    report(analyse(raw));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
