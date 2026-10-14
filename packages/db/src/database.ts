import { mkdirSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations.js';
import * as schema from './schema.js';

export type Drizzle = BetterSQLite3Database<typeof schema>;

export interface Database {
  /** Raw better-sqlite3 handle (for pragmas, backups and hand-tuned statements). */
  sqlite: BetterSqlite3.Database;
  db: Drizzle;
  path: string;
  /** Online, consistent copy of the live DB (safe while serving; WAL-aware). */
  backupTo(destPath: string): void;
  close(): void;
}

/** Accepts `file:./x.db`, `./x.db` or `:memory:`. */
export function resolveDatabasePath(url: string): string {
  const p = url.replace(/^file:/, '');
  return p === ':memory:' ? p : path.resolve(p);
}

export function openDatabase(url: string, opts: { migrations?: readonly Migration[] } = {}): Database {
  const file = resolveDatabasePath(url);
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new BetterSqlite3(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  runMigrations(sqlite, opts.migrations ?? MIGRATIONS);
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    path: file,
    backupTo(destPath: string) {
      const dest = path.resolve(destPath);
      mkdirSync(path.dirname(dest), { recursive: true });
      // VACUUM INTO produces a compact, transactionally consistent snapshot without blocking
      // writers for long; it refuses to overwrite an existing file (by design).
      sqlite.prepare('VACUUM INTO ?').run(dest);
    },
    close() {
      if (sqlite.open) sqlite.close();
    },
  };
}

/** Applies pending migrations in order; each in its own transaction. Returns ids applied. */
export function runMigrations(sqlite: BetterSqlite3.Database, migrations: readonly Migration[] = MIGRATIONS): number[] {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at INTEGER NOT NULL)',
  );
  const applied = new Set(
    (sqlite.prepare('SELECT id FROM _migrations').all() as { id: number }[]).map((r) => r.id),
  );
  const ids: number[] = [];
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  for (const m of sorted) {
    if (applied.has(m.id)) continue;
    sqlite.transaction(() => {
      sqlite.exec(m.sql);
      sqlite.prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, Date.now());
    })();
    ids.push(m.id);
  }
  return ids;
}
