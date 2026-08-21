import 'dotenv/config';

import pg from 'pg';

const { Client } = pg;

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://aardvarkland:aardvarkland@localhost:5432/aardvarkland_storage?schema=public';

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query('SELECT 1');
  await client.end();
} catch {
  process.exitCode = 1;
}
