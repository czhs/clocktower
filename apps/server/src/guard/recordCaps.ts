// (v2.3 security, sec-host — HOST-04) Hard size cap for a game record before it is written to SQLite.
// The recorder already caps each high-volume list (GameRecorder.enforceCaps); this is the final
// backstop on the serialized size: while the record is over `maxBytes`, the largest top-level list is
// halved (keeping its first and last quarters) and a warning is added.
import { DEFAULT_HOST_LIMITS, getHostLimits } from './hostLimits.js';

export const RECORD_MAX_BYTES = DEFAULT_HOST_LIMITS.recordMaxBytes;

const KEEP = new Set(['seats', 'warnings']);

export function capRecordBytes<R extends { warnings: string[] }>(record: R, maxBytes = getHostLimits().recordMaxBytes): R {
  const rec = record as unknown as Record<string, unknown>;
  for (let guard = 0; guard < 40; guard++) {
    const size = Buffer.byteLength(JSON.stringify(record));
    if (size <= maxBytes) return record;
    let key: string | null = null;
    let len = 16;
    for (const [k, v] of Object.entries(rec)) {
      if (!KEEP.has(k) && Array.isArray(v) && v.length > len) {
        key = k;
        len = v.length;
      }
    }
    if (key === null) break;
    const arr = rec[key] as unknown[];
    const drop = Math.ceil(arr.length / 2);
    arr.splice(Math.floor((arr.length - drop) / 2), drop);
    record.warnings.push(`record over ${Math.round(maxBytes / 1048576)} MiB (${size} bytes): dropped ${drop} middle entries of '${key}'`);
  }
  return record;
}
