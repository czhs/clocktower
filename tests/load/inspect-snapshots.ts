// Diagnostic (qa-deploy): one lobby, 4 wandering bots for 4 s; prints snapshot entity counts and
// server corrections so load-test byte rates can be sanity-checked.
import { makeBots } from '../support/bot.js';
import { startServer } from '../support/server.js';

const server = await startServer({ mode: 'source' });
try {
  const bots = await makeBots(4, 'insp-', server.url, server.wsUrl);
  const L = await bots[0]!.createLobby('Inspect', 5);
  for (const b of bots) await b.join(L);
  await new Promise((r) => setTimeout(r, 1000));
  for (const b of bots) b.startWandering(10);
  await new Promise((r) => setTimeout(r, 4000));
  for (const b of bots) b.stopActivity();
  for (const b of bots) {
    const snaps = b.recorder.ofType<any>('world:snapshot');
    const counts = snaps.map((s) => s.entities.length);
    const tp = b.recorder.ofType<any>('world:teleport');
    const last = snaps.at(-1);
    console.log(b.name, 'snapshots', snaps.length, 'entities/snapshot min..max', Math.min(...counts), Math.max(...counts),
      'teleports', tp.length, tp.slice(0, 3).map((t) => t.reason).join(','), 'bytes/snapshot', Math.round(b.recorder.rxBytes / Math.max(1, b.recorder.rxFrames)),
      'self', JSON.stringify(last?.entities.find((e: any) => e.id === b.pid)), 'botpos', JSON.stringify(b.pos));
  }
  console.log('sample snapshot', JSON.stringify(bots[0]!.recorder.ofType<any>('world:snapshot').at(-1)).slice(0, 400));
  for (const b of bots) await b.leave();
} finally {
  await server.stop();
}
