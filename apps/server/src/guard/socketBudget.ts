// (v2.3 security, sec-host — HOST-11) Per-socket, PRE-DECODE frame/byte budget for game WebSockets.
//
// The per-pid token buckets in GameRoom run only after Colyseus has received, buffered and msgpack-
// decoded a frame, and they never disconnect. A single joined player could therefore stream 24 KiB
// frames as fast as their link allowed (measured: ~9 000 frames/s on loopback, ~1 core of the event
// loop, socket never closed). This meter sits on the raw `ws` socket — attached in the transport's
// 'connection' event, i.e. BEFORE Colyseus attaches its room 'message' listener — and counts frames
// and bytes of every incoming message. On overflow the socket stops being read, is closed with
// CLOSE_CODES.abuse (terminal: the client does not auto-reconnect) and is terminated shortly after.
//
// Sizing (legit worst cases): the client sends 'move' at most at 15 Hz (TownScene MOVE_HZ) and only
// while the pose changes; it drops moves and caps other queued messages at 20 while reconnecting
// (net/room.ts). The largest legit frame is a notebook save (<= 20 KiB, debounced). The worst burst is
// a TCP stall flush: everything sent during a long mobile-network stall arrives at once (60 s of
// moving = 900 small frames, ~40 KB). So the FRAME budget only guards against absurd rates (2000 burst,
// 200/s sustained; message-level abuse is sec-secrecy's violation score, SEC-7), and the BYTE budget
// (512 KiB burst, 96 KiB/s sustained) is what cuts large-frame floods. Peak usage per socket can be
// traced with CT_SOCKET_BUDGET_TRACE=<file> (JSON lines; tests/diagnostics only).
import { appendFileSync } from 'node:fs';
import { CLOSE_CODES } from '@ct/protocol';
import { DEFAULT_HOST_LIMITS, getHostLimits, type HostLimits } from './hostLimits.js';
import type { Logger } from '../rooms/modules.js';

export interface SocketBudgetSpec {
  /** Burst of frames, refilled at `framesPerSec`. */
  frameBurst: number;
  framesPerSec: number;
  /** Burst of payload bytes, refilled at `bytesPerSec`. */
  byteBurst: number;
  bytesPerSec: number;
}

export const DEFAULT_SOCKET_BUDGET: SocketBudgetSpec = {
  frameBurst: DEFAULT_HOST_LIMITS.socketFrameBurst,
  framesPerSec: DEFAULT_HOST_LIMITS.socketFramesPerSec,
  byteBurst: DEFAULT_HOST_LIMITS.socketByteBurst,
  bytesPerSec: DEFAULT_HOST_LIMITS.socketBytesPerSec,
};

/**
 * Live budget from the settings (guard/hostLimits.ts): changes apply to every socket immediately.
 * (v2.4 P3) Called for every incoming frame: the spec is rebuilt only when the host-limits snapshot
 * changes (setHostLimits / resetHostLimits always install a new frozen object), so the hot path
 * allocates nothing and still sees every change on the very next frame.
 */
let liveSpecFor: Readonly<HostLimits> | null = null;
let liveSpec: Readonly<SocketBudgetSpec> = DEFAULT_SOCKET_BUDGET;
export function liveSocketBudget(): SocketBudgetSpec {
  const l = getHostLimits();
  if (l !== liveSpecFor) {
    liveSpec = Object.freeze({ frameBurst: l.socketFrameBurst, framesPerSec: l.socketFramesPerSec, byteBurst: l.socketByteBurst, bytesPerSec: l.socketBytesPerSec });
    liveSpecFor = l;
  }
  return liveSpec;
}

type SpecSource = SocketBudgetSpec | (() => SocketBudgetSpec);
const specOf = (s: SpecSource): SocketBudgetSpec => (typeof s === 'function' ? s() : s);

/** Grace between the close frame and a hard terminate (a client that ignores the close). */
const TERMINATE_AFTER_MS = 1000;

/** The parts of a `ws` socket/server we use (the package is a transitive dependency only). */
export interface RawSocket {
  prependListener(event: 'message', fn: (data: unknown) => void): unknown;
  once?(event: 'close', fn: () => void): unknown;
  close(code?: number, reason?: string): void;
  terminate(): void;
}
export interface RawSocketServer {
  on(event: 'connection', fn: (ws: RawSocket) => void): unknown;
}

export interface SocketBudgetStats {
  /** Sockets closed for exceeding the budget since start. */
  closed: number;
}

/** Pure meter (unit-testable): returns false once the budget is exceeded. */
export class FrameMeter {
  private frames: number;
  private bytes: number;
  private at: number;
  /** Deepest the buckets were drawn down (for sizing; see CT_SOCKET_BUDGET_TRACE). */
  peakFrames = 0;
  peakBytes = 0;
  constructor(
    private readonly source: SpecSource,
    now = Date.now(),
  ) {
    const spec = specOf(source);
    this.frames = spec.frameBurst;
    this.bytes = spec.byteBurst;
    this.at = now;
  }
  take(size: number, now = Date.now()): boolean {
    const spec = specOf(this.source);
    const dt = Math.max(0, now - this.at) / 1000;
    this.at = now;
    this.frames = Math.min(spec.frameBurst, this.frames + dt * spec.framesPerSec);
    this.bytes = Math.min(spec.byteBurst, this.bytes + dt * spec.bytesPerSec);
    this.frames -= 1;
    this.bytes -= size;
    this.peakFrames = Math.max(this.peakFrames, spec.frameBurst - this.frames);
    this.peakBytes = Math.max(this.peakBytes, spec.byteBurst - this.bytes);
    return this.frames >= 0 && this.bytes >= 0;
  }
}

function frameSize(data: unknown): number {
  if (Buffer.isBuffer(data)) return data.length;
  if (Array.isArray(data)) return data.reduce((n: number, b: Buffer) => n + b.length, 0);
  if (data instanceof ArrayBuffer) return data.byteLength;
  return 0;
}

/**
 * Attach the budget to every socket of a `ws` server. Call right after constructing the Colyseus
 * WebSocketTransport (its `wss` property). Returns live stats.
 */
export function installSocketBudget(wss: RawSocketServer, log: Logger, spec: SpecSource = liveSocketBudget): SocketBudgetStats {
  const stats: SocketBudgetStats = { closed: 0 };
  let logWindow = 0;
  let logged = 0;
  wss.on('connection', (ws: RawSocket) => {
    const meter = new FrameMeter(spec);
    let tripped = false;
    const trace = process.env.CT_SOCKET_BUDGET_TRACE;
    if (trace)
      ws.once?.('close', () => {
        try {
          appendFileSync(trace, JSON.stringify({ peakFrames: Math.round(meter.peakFrames), peakBytes: Math.round(meter.peakBytes), tripped }) + '\n');
        } catch {
          /* diagnostics only */
        }
      });
    // prependListener: run before any listener Colyseus adds later (room join happens after this).
    ws.prependListener('message', (data: unknown) => {
      if (tripped) return;
      if (meter.take(frameSize(data))) return;
      tripped = true;
      stats.closed++;
      const now = Date.now();
      if (now - logWindow > 60_000) {
        logWindow = now;
        logged = 0;
      }
      if (++logged <= 5) log.warn('websocket closed: frame budget exceeded', { closedTotal: stats.closed });
      try {
        // Stop reading further frames from the kernel buffer; Colyseus sees the close as a leave.
        (ws as unknown as { pause?: () => void }).pause?.();
        ws.close(CLOSE_CODES.abuse, 'Too many messages');
      } catch {
        /* already closing */
      }
      setTimeout(() => {
        try {
          ws.terminate();
        } catch {
          /* gone */
        }
      }, TERMINATE_AFTER_MS).unref();
    });
  });
  return stats;
}
