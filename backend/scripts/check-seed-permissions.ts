import 'dotenv/config';

import { Client } from 'pg';

const REQUIRED_PERMISSIONS = [
  'warehouse.read',
  'inventory.read',
  'outbox.read',
  'metrics.read',
  'integrity.read',
  'job.read',
  'job.manage',
] as const;

async function main() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for permission seed verification.');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ code: string }>(
      'SELECT code FROM permissions WHERE code = ANY($1::text[])',
      [REQUIRED_PERMISSIONS],
    );
    const existing = new Set(result.rows.map((row) => row.code));
    const missing = REQUIRED_PERMISSIONS.filter((permission) => !existing.has(permission));
    if (missing.length > 0) {
      throw new Error(`Missing required permissions: ${missing.join(', ')}`);
    }
    console.log(`Permission seed check OK (${REQUIRED_PERMISSIONS.length} required permissions).`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
