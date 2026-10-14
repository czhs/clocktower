// Per-bot message recorder + secrecy scanning helpers (qa-deploy).

export interface RecordedMessage {
  at: number;
  type: string;
  payload: unknown;
  /** JSON-serialised payload (what the scans search). */
  json: string;
}

export class Recorder {
  readonly messages: RecordedMessage[] = [];
  rxBytes = 0;
  txBytes = 0;
  rxFrames = 0;
  txFrames = 0;
  /** Per-type counts (kept even when messages are not retained). */
  readonly typeCounts: Record<string, number> = {};
  private listeners: ((m: RecordedMessage) => void)[] = [];

  constructor(
    readonly label: string,
    private keep = true,
  ) {}

  record(type: string, payload: unknown) {
    let json = '';
    if (this.keep || this.listeners.length) {
      try {
        json = JSON.stringify(payload) ?? 'undefined';
      } catch {
        json = String(payload);
      }
    }
    this.typeCounts[type] = (this.typeCounts[type] ?? 0) + 1;
    const m: RecordedMessage = { at: Date.now(), type, payload, json };
    if (this.keep) this.messages.push(m);
    for (const l of this.listeners) l(m);
  }

  onMessage(fn: (m: RecordedMessage) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  ofType<T = unknown>(type: string): T[] {
    return this.messages.filter((m) => m.type === type).map((m) => m.payload as T);
  }

  last<T = unknown>(type: string): T | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) if (this.messages[i]!.type === type) return this.messages[i]!.payload as T;
    return undefined;
  }

  countByType(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const m of this.messages) out[m.type] = (out[m.type] ?? 0) + 1;
    return out;
  }
}

export interface Leak {
  bot: string;
  type: string;
  needle: string;
  excerpt: string;
}

/** Search every recorded payload for any of the needles (case-sensitive substrings). */
export function findLeaks(recorders: Recorder[], needles: string[], filter?: (m: RecordedMessage) => boolean): Leak[] {
  const leaks: Leak[] = [];
  const ns = needles.filter((n) => n && n.length >= 3);
  for (const r of recorders) {
    for (const m of r.messages) {
      if (filter && !filter(m)) continue;
      for (const n of ns) {
        const i = m.json.indexOf(n);
        if (i >= 0) leaks.push({ bot: r.label, type: m.type, needle: n, excerpt: m.json.slice(Math.max(0, i - 60), i + n.length + 60) });
      }
    }
  }
  return leaks;
}

/** Recursively collect object keys present in any payload (to detect forbidden fields such as `grimoire`). */
export function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) collectKeys(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}
