// Diagnostic (qa-deploy): isolate WebSocket join failures behind the netem proxy.
//   pnpm exec tsx tests/load/repro-netem-join.ts -- --latency 150 --jitter 50 --loss 0.03 --rounds 5
// Each round: 1 ST + 7 players join one lobby through the proxy; prints the first failing step,
// the proxy's raw view of failing connections (first response line from the server) and server
// log lines around it.
import net from 'node:net';
import { makeBots } from '../support/bot.js';
import { startNetem } from '../support/netem.js';
import { pickPort, startServer } from '../support/server.js';

const argv = process.argv.slice(2).filter((a) => a !== '--');
const num = (n: string, d: number) => (argv.includes(`--${n}`) ? Number(argv[argv.indexOf(`--${n}`) + 1]) : d);
const LAT = num('latency', 150);
const JIT = num('jitter', 50);
const LOSS = num('loss', 0.03);
const ROUNDS = num('rounds', 5);

const server = await startServer({ env: { LOBBY_MAX_COUNT: '40' } });
// Raw tap: a second proxy layer that records the first server response line per connection.
const tapPort = await pickPort();
const firstLines: { at: number; req: string; res: string }[] = [];
const tap = net.createServer((c) => {
  const u = net.connect(server.port, '127.0.0.1');
  let req = '';
  let res = '';
  c.on('data', (d) => {
    if (!req) req = d.subarray(0, 200).toString('latin1').split('\r\n')[0]!;
    u.write(d);
  });
  u.on('data', (d) => {
    if (!res) {
      res = d.subarray(0, 300).toString('latin1').split('\r\n').slice(0, 1).join(' ');
      firstLines.push({ at: Date.now(), req, res });
    }
    c.write(d);
  });
  c.on('end', () => u.end());
  u.on('end', () => c.end());
  c.on('error', () => u.destroy());
  u.on('error', () => c.destroy());
});
await new Promise<void>((r) => tap.listen(tapPort, '127.0.0.1', r));
const NO_TAP = argv.includes('--no-tap');
const proxy = await startNetem(NO_TAP ? server.port : tapPort, { latencyMs: LAT, jitterMs: JIT, lossRate: LOSS }, await pickPort());
console.log(`netem ${LAT}±${JIT} ms, loss ${LOSS}; server :${server.port}`);
let failures = 0;
for (let round = 1; round <= ROUNDS; round++) {
  const bots = await makeBots(8, `r${round}-`, proxy.url, proxy.wsUrl);
  const [st, ...players] = bots;
  const L = await st!.createLobby(`Repro ${round}`, 7, true);
  const steps: string[] = [];
  try {
    const t = Date.now();
    await st!.join(L, 'storyteller');
    steps.push(`st joined ${Date.now() - t}ms`);
    for (const [i, p] of players.entries()) {
      const t1 = Date.now();
      const ticket = await p.getTicket(L);
      const t2 = Date.now();
      await p.joinWithTicket(ticket);
      steps.push(`p${i} ticket ${t2 - t1}ms join ${Date.now() - t2}ms`);
    }
    console.log(`round ${round}: ok (${steps.join(', ')})`);
  } catch (e) {
    failures++;
    const at = Date.now();
    console.log(`round ${round}: FAILED after [${steps.join(', ')}]: ${(e as Error).name} ${(e as Error).message} code=${(e as any).code}`);
    console.log('  raw server first-lines in the last 3 s:', JSON.stringify(firstLines.filter((f) => f.at > at - 3000)));
    console.log('  server log tail:', server.logs().split('\n').filter(Boolean).slice(-6).map((l) => l.slice(0, 220)));
  }
  await Promise.all(bots.map((b) => b.leave().catch(() => undefined)));
}
console.log(`failures ${failures}/${ROUNDS}`);
await proxy.close();
tap.close();
await server.stop();
process.exit(0);
