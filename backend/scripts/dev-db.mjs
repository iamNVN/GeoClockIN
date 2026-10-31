// Local PostgreSQL for `npm run dev`, with nothing to install: an embedded
// server on port 54329 keeping its data in backend/.local-db (gitignored).
// It matches DATABASE_URL in .env.example and stays out of the way when
// DATABASE_URL points at another server.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 54329;
const DATABASE = 'geoclockin';
const DATA_DIR = fileURLToPath(new URL('../.local-db', import.meta.url));
// Postgres needs these even when empty; some tools prune empty folders.
const REQUIRED_DIRS = ['pg_notify', 'pg_tblspc', 'pg_replslot', 'pg_twophase', 'pg_snapshots', 'pg_commit_ts', 'pg_logical/snapshots', 'pg_logical/mappings', 'pg_stat', 'pg_stat_tmp', 'pg_serial', 'pg_dynshmem'];

// Stay running: `concurrently -k` stops the other dev servers when one exits.
const stayRunning = () => setInterval(() => {}, 1 << 30);

const portInUse = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => socket.end(() => resolve(true)));
    socket.once('error', () => resolve(false));
  });

async function start() {
  const url = process.env.DATABASE_URL ?? '';
  if (url && !url.includes(`:${PORT}/`)) {
    console.log('DATABASE_URL points to another server, so the local database is not started.');
    return;
  }
  if (await portInUse(PORT)) {
    console.log(`A database is already running on port ${PORT}.`);
    return;
  }

  const initialised = existsSync(join(DATA_DIR, 'PG_VERSION'));
  if (initialised) {
    for (const dir of REQUIRED_DIRS) mkdirSync(join(DATA_DIR, dir), { recursive: true });
    // Left behind when the server was not shut down cleanly.
    rmSync(join(DATA_DIR, 'postmaster.pid'), { force: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: (message) => /FATAL|PANIC/.test(String(message)) && console.error(String(message).trim()),
  });
  if (!initialised) {
    console.log('Creating the local database (first run only)…');
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase(DATABASE).catch(() => {}); // already there
  console.log(`Local database ready on port ${PORT}.`);

  const stop = async () => {
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

try {
  await start();
} catch (err) {
  console.error(`The local database could not start: ${err.message ?? err}`);
}
stayRunning();
