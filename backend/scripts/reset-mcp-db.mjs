import 'dotenv/config';

import { spawn } from 'node:child_process';
import { cwd, env, exit } from 'node:process';

const databaseUrl = env.DATABASE_URL ?? '';
const nodeEnv = env.NODE_ENV ?? 'development';

if (nodeEnv === 'production') {
  throw new Error('Refusing to reset MCP database when NODE_ENV=production.');
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for MCP database reset.');
}

if (!isLocalDatabaseUrl(databaseUrl)) {
  throw new Error(`Refusing to reset non-local MCP database: ${redactDatabaseUrl(databaseUrl)}`);
}

await run('node', ['./node_modules/prisma/build/index.js', 'migrate', 'reset', '--force']);
await run('node', ['./node_modules/prisma/build/index.js', 'generate']);
await run('node', ['./node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], {
  ALLOW_DEMO_SEED: 'true',
});

function isLocalDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1', 'postgres'].includes(url.hostname);
  } catch {
    return false;
  }
}

function redactDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid url>';
  }
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd(),
      env: { ...env, ...extraEnv },
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    exit(1);
  });
}
