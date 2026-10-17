// Scene "ambient-fire" (owner: fire): the ambient stage (scenes/ambient-stage.js, its scripted game-speed walker and
// every stage param) with the "fire" system dropped in: a campfire on the dirt patch the walker runs through, a
// brazier by the broken pillar, a wall torch on the ruined wall, a forge hearth by the walker's stop, three candles on
// a stone. Extra params:
//   ?systems=fire          (default; other systems can be added: fire,_ref-birds)
//   ?events=<id>:<x|r><t>,...   scheduled extinguish (x) / relight (r), e.g. events=campfire:x6.0,campfire:r9.0
//   ?demo=1                a showcase schedule: the candles are snuffed and relit, the brazier dies and is relit
//   ?flare=<id>:<t>,...    forced flares (no walker needed)
//   ?shot=wide|flock|lamp|fire|forge   (fire = campfire close-up, forge = forge / candles / torch side), ?vh=
import buildStage from './ambient-stage.js';

const SHOTS = { fire: { shot: 'flock', vh: '5' }, forge: { shot: 'lamp', vh: '6' } };

export default async function build(engine, params) {
  const shot = params.get('shot');
  const def = { systems: 'fire', ...(SHOTS[shot] ?? {}) };
  const P = { get: (k) => (k === 'shot' && SHOTS[shot] ? SHOTS[shot].shot : params.get(k) ?? def[k] ?? null), has: (k) => params.has(k) || k in def };
  await buildStage(engine, P);
  const amb = window.__pixel.ambient;
  const fire = amb?.get('fire');
  if (!fire) return;
  const sched = [];
  for (const tok of (params.get('events') ?? '').split(',').filter(Boolean)) {
    const [id, ev] = tok.split(':');
    if (ev) sched.push({ id, t: Number(ev.slice(1)), on: ev[0] === 'r' });
  }
  if (params.get('demo') === '1') {
    sched.push({ id: 'candle', t: 5.0, on: false }, { id: 'candle', t: 8.0, on: true },
      { id: 'brazier', t: 9.0, on: false }, { id: 'brazier', t: 14.0, on: true });
  }
  if (sched.length) fire.api.schedule(sched);
  for (const tok of (params.get('flare') ?? '').split(',').filter(Boolean)) {
    const [id, t, lean] = tok.split(':');
    fire.api.flare(id, Number(t), Number(lean ?? 1));
  }
  engine.stats.fireSchedule = sched.map((e) => `${e.id}:${e.on ? 'r' : 'x'}${e.t}`).join(',');
}
