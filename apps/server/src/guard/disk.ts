// (v2.3 security, sec-host — HOST-04) Database size and free disk space for the admin overview.
// The SQLite DB lives on hshi-u1's root filesystem, shared with the OS, journald and other services;
// the admin console shows this so growth is noticed before the disk fills. sec-ops renders it.
import { statSync, statfsSync } from 'node:fs';
import path from 'node:path';

export interface DiskView {
  /** clocktower.db + -wal + -shm, bytes (null if unreadable). */
  dbBytes: number | null;
  /** Free / total bytes of the filesystem holding the DB (null if unavailable). */
  freeBytes: number | null;
  totalBytes: number | null;
  /** 'ok' | 'low' (< 10 GiB or < 10 % free) | 'critical' (< 2 GiB). */
  level: 'ok' | 'low' | 'critical' | 'unknown';
}

const GiB = 1024 ** 3;

export function diskView(databasePath: string): DiskView {
  let dbBytes: number | null = null;
  if (databasePath && databasePath !== ':memory:') {
    dbBytes = 0;
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        dbBytes += statSync(databasePath + suffix).size;
      } catch {
        /* missing -wal/-shm is normal */
      }
    }
  }
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  try {
    const fs = statfsSync(path.dirname(path.resolve(databasePath || '.')));
    freeBytes = fs.bavail * fs.bsize;
    totalBytes = fs.blocks * fs.bsize;
  } catch {
    /* unsupported */
  }
  let level: DiskView['level'] = 'unknown';
  if (freeBytes !== null && totalBytes) {
    level = freeBytes < 2 * GiB ? 'critical' : freeBytes < 10 * GiB || freeBytes / totalBytes < 0.1 ? 'low' : 'ok';
  }
  return { dbBytes, freeBytes, totalBytes, level };
}
