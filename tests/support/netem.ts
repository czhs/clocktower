// In-process "netem" (qa-deploy): a TCP proxy that adds latency, jitter and loss-like stalls to
// everything between a client and the test server (HTTP, SSE and WebSockets alike), without root
// (`tc qdisc netem` needs sudo on hshi-u1).
//
// TCP never drops bytes, so "packet loss" is modelled the way an application experiences it: the
// stream stalls for a retransmission timeout (200-600 ms) and then delivers in order. Ordering per
// direction is always preserved (each chunk is released no earlier than the previous one).
import net from 'node:net';

export interface NetemOptions {
  /** one-way base latency in ms (applied in both directions => RTT ≈ 2x) */
  latencyMs?: number;
  /** uniform ± jitter in ms */
  jitterMs?: number;
  /** probability per chunk of a retransmission-like stall */
  lossRate?: number;
  /** stall duration range for a "lost" chunk, ms */
  stallMs?: [number, number];
}

export interface NetemStats {
  chunks: number;
  stalls: number;
  connections: number;
  /** client requests that reached the proxy after the server had already closed that connection */
  writesAfterUpstreamClosed: { at: number; kind: 'ws-upgrade' | 'http'; head: string }[];
}

export interface NetemProxy {
  port: number;
  url: string;
  wsUrl: string;
  stats: NetemStats;
  /** Abruptly reset every proxied connection (simulates a network drop / NAT rebinding). */
  dropAll(): void;
  close(): Promise<void>;
}

export async function startNetem(targetPort: number, opts: NetemOptions = {}, listenPort = 0): Promise<NetemProxy> {
  const latency = opts.latencyMs ?? 0;
  const jitter = opts.jitterMs ?? 0;
  const loss = opts.lossRate ?? 0;
  const [stallMin, stallMax] = opts.stallMs ?? [200, 600];
  const stats: NetemStats = { chunks: 0, stalls: 0, connections: 0, writesAfterUpstreamClosed: [] };
  const sockets = new Set<net.Socket>();

  // One FIFO queue + one drain timer per direction. (Scheduling each chunk with its own setTimeout
  // can REORDER chunks whose computed release times tie — Node orders timers by duration bucket —
  // which corrupts HTTP/WebSocket streams. That was a real harness bug, found 2026-10-14.)
  const pipe = (from: net.Socket, to: net.Socket) => {
    const queue: { at: number; chunk: Buffer | null }[] = []; // chunk null = end-of-stream
    let releaseAt = 0;
    let timer: NodeJS.Timeout | null = null;
    const drain = () => {
      timer = null;
      const now = Date.now();
      while (queue.length && queue[0]!.at <= now) {
        const { chunk } = queue.shift()!;
        if (to.destroyed) continue;
        if (chunk === null) to.end();
        else to.write(chunk);
      }
      if (queue.length) timer = setTimeout(drain, Math.max(0, queue[0]!.at - Date.now()));
    };
    const enqueue = (chunk: Buffer | null, delay: number) => {
      releaseAt = Math.max(releaseAt, Date.now() + Math.max(0, delay));
      queue.push({ at: releaseAt, chunk });
      if (!timer) timer = setTimeout(drain, Math.max(0, queue[0]!.at - Date.now()));
    };
    from.on('data', (chunk: Buffer) => {
      stats.chunks++;
      let delay = latency + (jitter ? (Math.random() * 2 - 1) * jitter : 0);
      if (loss && Math.random() < loss) {
        stats.stalls++;
        delay += stallMin + Math.random() * (stallMax - stallMin);
      }
      enqueue(chunk, delay);
    });
    from.on('end', () => enqueue(null, 0));
    from.on('error', () => to.destroy());
    from.on('close', () => setTimeout(() => to.destroy(), Math.max(0, releaseAt - Date.now()) + 5));
  };

  const server = net.createServer((client) => {
    stats.connections++;
    const upstream = net.connect(targetPort, '127.0.0.1');
    let upstreamClosed = false;
    upstream.on('end', () => (upstreamClosed = true));
    upstream.on('close', () => (upstreamClosed = true));
    client.on('data', (chunk) => {
      if (!upstreamClosed) return;
      const head = chunk.subarray(0, 120).toString('latin1');
      stats.writesAfterUpstreamClosed.push({ at: Date.now(), kind: /upgrade: websocket/i.test(chunk.subarray(0, 2048).toString('latin1')) ? 'ws-upgrade' : 'http', head: head.split('\r\n')[0]! });
    });
    sockets.add(client);
    sockets.add(upstream);
    client.on('close', () => sockets.delete(client));
    upstream.on('close', () => sockets.delete(upstream));
    pipe(client, upstream);
    pipe(upstream, client);
  });
  await new Promise<void>((resolve) => server.listen(listenPort, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    stats,
    dropAll() {
      for (const s of sockets) s.resetAndDestroy();
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
