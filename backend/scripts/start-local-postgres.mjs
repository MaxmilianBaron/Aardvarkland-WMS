import 'dotenv/config';

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, '..');
const databaseDir = resolve(process.env.AARDVARKLAND_LOCAL_PG_DIR || join(backendRoot, '.local-postgres', 'data'));
const port = Number(process.env.POSTGRES_PORT || 5432);
const user = process.env.POSTGRES_USER || 'aardvarkland';
const password = process.env.POSTGRES_PASSWORD || 'aardvarkland';
const database = process.env.POSTGRES_DB || 'aardvarkland_storage';

function log(message) {
  process.stdout.write(`[local-postgres] ${message.trimEnd()}\n`);
}

function error(message) {
  process.stderr.write(`[local-postgres] ${String(message).trimEnd()}\n`);
}

async function ensureDatabase() {
  const client = new Client({
    host: 'localhost',
    port,
    user,
    password,
    database: 'postgres',
  });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`);
      log(`Created database ${database}.`);
    } else {
      log(`Database ${database} already exists.`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  mkdirSync(dirname(databaseDir), { recursive: true });

  const postgres = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: true,
    onLog: (message) => log(String(message)),
    onError: (message) => error(message),
  });

  if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
    log(`Initializing local PostgreSQL in ${databaseDir}.`);
    await postgres.initialise();
  }

  removeStalePostmasterPid();
  log(`Starting local PostgreSQL on localhost:${port}.`);
  await postgres.start();
  await ensureDatabase();
  log('Ready. Keep this window open while backend is running.');

  await new Promise((resolveSignal) => {
    const done = () => resolveSignal();
    process.on('SIGINT', done);
    process.on('SIGTERM', done);
    process.stdin.resume();
  });

  log('Stopping local PostgreSQL.');
  await postgres.stop();
}

main().catch((err) => {
  error(err instanceof Error ? err.stack || err.message : err);
  process.exitCode = 1;
});

function removeStalePostmasterPid() {
  const pidFile = join(databaseDir, 'postmaster.pid');
  if (!existsSync(pidFile)) return;

  const pid = Number(readFileSync(pidFile, 'utf8').split(/\r?\n/)[0]);
  if (Number.isInteger(pid) && pid > 0 && isProcessRunning(pid)) return;

  unlinkSync(pidFile);
  log(`Removed stale PostgreSQL pid file at ${pidFile}.`);
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
