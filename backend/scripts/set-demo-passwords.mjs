import 'dotenv/config';

import { hash } from 'argon2';
import pg from 'pg';

const { Client } = pg;
const passwordArgument = process.argv.find((argument) => argument.startsWith('--password='));
const password = passwordArgument?.slice('--password='.length) || 'demo';
const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (nodeEnv === 'production') throw new Error('Refusing to set shared demo passwords in production.');
if (!password) throw new Error('Demo password must not be empty.');

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const passwordHash = await hash(password);
  const updated = await client.query(
    `UPDATE users
       SET password_hash = $1,
           session_version = session_version + 1,
           updated_at = NOW()
     WHERE status = 'ACTIVE'
     RETURNING id, email, display_name`,
    [passwordHash],
  );

  const accounts = await client.query(
    `SELECT u.email,
            u.display_name,
            COALESCE(string_agg(DISTINCT r.code, ', ' ORDER BY r.code), '') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.status = 'ACTIVE'
      GROUP BY u.id
      ORDER BY u.email`,
  );

  console.log(JSON.stringify({ updatedUsers: updated.rowCount, accounts: accounts.rows }, null, 2));
} finally {
  await client.end();
}
