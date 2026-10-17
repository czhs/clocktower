// Scene "ambient-props" (owner: props): the ambient stage (scenes/ambient-stage.js, its scripted game-speed walker
// and every stage param) with the "props" system dropped in along the walker's loop: a hanging shop sign over the
// start of the trail, a fountain and wind chimes beside it, three hanging street lamps, a garden gate the trail runs
// through, a scarecrow, a well with its bucket, and a bell gallows straddling the trail. Extra params:
//   ?systems=props        (default; other systems can be added: props,_ref-birds)
//   ?lamplighter=1        the walker is a lamplighter: lamps start unlit at golden / night and light as it passes
//   ?dusk=<t0>[:<gap>]    lamps light one after another from t0 (every gap s, default 0.6): "lamps at dusk"
//   ?douse=<id>:<t>,...   scheduled lamp douses (api.douse)
import buildStage from './ambient-stage.js';

export default async function build(engine, params) {
  const def = { systems: 'props' };
  const P = { get: (k) => params.get(k) ?? def[k] ?? null, has: (k) => params.has(k) || k in def };
  await buildStage(engine, P);
  const amb = window.__pixel.ambient;
  const props = amb?.get('props');
  if (!props) return;
  if (params.get('lamplighter') === '1') {
    props.api.setLamps('lamplighter');
    const w = amb.actors.list.find((a) => a.id === 'walker');
    if (w?.at) amb.actors.add({ id: 'walker', at: w.at, height: w.height, radius: w.radius, kind: 'lamplighter' });
  }
  const dusk = params.get('dusk');
  if (dusk) {
    const [t0, gap] = dusk.split(':').map(Number);
    props.api.setLamps('lamplighter');
    props.api.dusk(t0, gap || 0.6);
  }
  for (const tok of (params.get('douse') ?? '').split(',').filter(Boolean)) {
    const [id, t] = tok.split(':');
    props.api.douse(id, Number(t));
  }
  engine.stats.propsScene = { lamplighter: params.get('lamplighter') === '1', dusk: dusk ?? null, ids: props.api.ids };
}
