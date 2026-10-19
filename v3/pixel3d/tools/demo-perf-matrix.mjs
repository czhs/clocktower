// Runs tools/demo-perf.mjs over the perf matrix and prints one table row per scenario (render-host).
//   node tools/demo-perf-matrix.mjs --tag base [--throttle 1|4] [--only square,house] [--tiers high,low] [--tods noon,night]
//        [--secs 5] [--variants ",rtopt=0"] [--shots] (a still per scenario, for before/after diffs: shots/perf-runtime/<tag>/<name>.png)
// JSON per scenario: shots/perf-runtime/<tag>/<name>.json; the table: shots/perf-runtime/<tag>/table.md
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const tag = opt('tag', 'run'), throttle = opt('throttle', '1'), secs = opt('secs', '5');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(ROOT, 'shots/perf-runtime', tag);
fs.mkdirSync(dir, { recursive: true });
// square = the spawn on the square's south side; row = the west lane between the cottages; house = inside house-8
const SPOTS = { square: '', row: 'at=7.5,18.5', house: 'in=house-8' };
const only = opt('only', 'square,row,house').split(','), tiers = opt('tiers', 'high,low').split(','), tods = opt('tods', 'noon,night').split(',');
const rows = [];
const hdr = '| scenario | thr | fps | frame ms mean/p95/max | CPU ms mean/p95/max | updaters ms | synced ms mean/p95/max | calls | tris | prog | ready ms (build/compile) | alloc KB/f | err |';
console.log(hdr);
// --variants ",rtopt=0": each scenario runs once per variant (extra URL params), back to back (A/B under the same load)
const variants = opt('variants', '').split(',');
for (const spot of only) for (const tier of tiers) for (const tod of tods) for (const vq of variants) {
  const name = `${spot}-${tier}-${tod}-t${throttle}${vq ? '-' + vq.replace(/[^\w]+/g, '') : ''}`;
  const q = [SPOTS[spot], `quality=${tier}`, `tod=${tod === 'noon' ? 12.5 : 23}`, 'paused=1', 'npcs=3', vq].filter(Boolean).join('&');
  const a = ['tools/demo-perf.mjs', '--q', q, '--secs', secs, '--throttle', throttle, '--json', path.join(dir, name + '.json'), '--label', name];
  if (args.includes('--shots')) a.push('--shot', path.join(dir, name + '.png'));
  if (args.includes('--alloc')) a.push('--alloc');
  const r = spawnSync('node', a, { cwd: ROOT, encoding: 'utf8', timeout: 400000 });
  let o;
  try { o = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')); } catch { console.log(`| ${name} | FAILED ${r.stderr?.slice(0, 200)} |`); continue; }
  const f = (m) => (m ? `${m.mean}/${m.p95}/${m.max}` : '-');
  const row = `| ${name} | ${throttle}x | ${o.realtime?.fps} | ${f(o.realtime?.frameMs)} | ${f(o.realtime?.cpuMs)} | ${o.realtime?.updatersMs?.mean} | ${f(o.synced)} | ${o.scene?.calls} | ${Math.round((o.scene?.tris ?? 0) / 1000)}k | ${o.scene?.programs} | ${o.load?.readyMs} (${o.load?.buildMs}/${o.load?.compileMs}) | ${o.alloc?.kbPerFrame ?? '-'} | ${o.errors?.length ?? '?'} |`;
  console.log(row); rows.push(row);
}
fs.writeFileSync(path.join(dir, 'table.md'), [hdr, '|' + '---|'.repeat(13), ...rows].join('\n') + '\n');
