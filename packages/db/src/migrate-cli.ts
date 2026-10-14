// `pnpm db:migrate` — applies pending migrations to DATABASE_URL.
// `pnpm --filter @ct/db migrate backup <dest.db>` — online backup (VACUUM INTO) of DATABASE_URL.
import { openDatabase } from './database.js';

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL is required\n');
  process.exit(2);
}
const [cmd, dest] = process.argv.slice(2);
const database = openDatabase(url); // migrations run on open
try {
  if (cmd === 'backup') {
    if (!dest) throw new Error('usage: migrate-cli backup <dest.db>');
    database.backupTo(dest);
    process.stdout.write(`backup written: ${dest}\n`);
  } else {
    const rows = database.sqlite.prepare('SELECT id, name FROM _migrations ORDER BY id').all();
    process.stdout.write(`migrations applied: ${JSON.stringify(rows)}\n`);
  }
} finally {
  database.close();
}
