// v3 perf(stage): one line per tier of tests/perf/v3-frame.ts results (calls, JS ms split, three CPU hot spots).
//   node scripts/perf/v3-stage-sum.cjs test-results/<run>/v3-frame.json [...]
const path = require('node:path');
for (const f of process.argv.slice(2)) {
  let j;
  try {
    j = require(path.resolve(f));
  } catch (e) {
    console.log(f, 'missing', e.message);
    continue;
  }
  for (const t of j.tiers) {
    if (t.error) {
      console.log(f, t.tier, 'ERROR', String(t.error).slice(0, 200));
      continue;
    }
    const s = t.base?.split?.perFrame ?? {};
    const p = (k) => (s[k] ? `${s[k].p50}/${s[k].p95}` : '-');
    const m = (k) => (s[k] ? s[k].mean.toFixed(2) : '-');
    const c = t.cpu?.inclusiveMsPerFrame ?? {};
    const sc = t.base?.split?.stageCalls;
    console.log(
      [
        `${path.basename(path.dirname(f))} ${t.tier} ${(j.viewport ?? []).join('x')} ${j.phase ?? ''} gl=${j.gl ?? ''}`,
        `calls p50/p95=${p('calls')} mean=${m('calls')} shadowCalls p50/p95=${p('shadowCalls')} mean=${m('shadowCalls')} tris mean=${s.tris ? Math.round(s.tris.mean) : '-'} programs=${p('programs')} synced p50=${t.base?.synced?.total?.p50 ?? '-'} mean=${t.base?.synced?.total?.mean?.toFixed?.(2) ?? '-'}`,
        `stageCalls=${JSON.stringify(sc ? Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, v.p50])) : null)}`,
        `mean ms: raf=${m('raf')} renderAt=${m('renderAt')} pipe=${m('pipe')} upd=${m('upd')} mw=${m('mw')} shadow=${m('shadow')} color=${m('color')} normal=${m('normal')} post=${m('post')} game=${m('game')}`,
        `p50/p95: raf=${p('raf')} renderAt=${p('renderAt')}`,
        `cpu incl ms/frame: setProgram=${c['setProgram@three']} upload=${c['upload@three']} projectObject=${c['projectObject@three']} updateMatrixWorld=${c['updateMatrixWorld@three']} gc=${t.cpu?.bucketsMsPerFrame?.['(garbage collector)']} three=${t.cpu?.bucketsMsPerFrame?.three}`,
        `census: nodes=${t.census?.counts?.nodes} autoUpd=${t.census?.counts?.matrixAutoUpdate} meshes=${t.census?.counts?.meshes} visMeshes=${t.census?.visible?.meshes} casters=${t.census?.counts?.casters} visCasters=${t.census?.visible?.casters}`,
      ].join('\n   '),
    );
  }
}
