import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import { loadEnvLocal } from '../../../scripts/load-env-local.js';
try { loadEnvLocal(fileURLToPath(new URL('../../../.env.local', import.meta.url))); } catch { /* Configuration can also come from the process environment. */ }
const url = process.env.DATABASE_URL;
if (!url || process.env.APP_MODE !== 'live') {
  console.error('BLOCKED: migrations require APP_MODE=live and DATABASE_URL for the explicitly selected development database. No database was changed.');
  process.exitCode = 2;
} else {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
  let client: PoolClient | undefined;
  let locked = false;
  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock(4815162342)'); locked = true;
    const migrationsFolder = fileURLToPath(new URL('../migrations/', import.meta.url));
    await client.query('CREATE SCHEMA IF NOT EXISTS beforeyou_migrations');
    await client.query('CREATE TABLE IF NOT EXISTS beforeyou_migrations.__drizzle_migrations(id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
    const prior = await client.query('SELECT hash,created_at FROM beforeyou_migrations.__drizzle_migrations');
    for (const migration of readMigrationFiles({ migrationsFolder })) {
      const applied = prior.rows.find((row) => Number(row.created_at) === migration.folderMillis);
      if (applied && applied.hash !== migration.hash) throw new Error('Tracked migration changed after application. Add a new migration instead.');
    }
    await migrate(drizzle(client), { migrationsFolder, migrationsSchema: 'beforeyou_migrations' });
    console.log('Tracked Drizzle migrations applied. Previously applied migrations were retained; no database reset occurred.');
  } catch (error) {
    // Never print connection strings, raw driver messages or credentials.
    console.error(error instanceof Error && error.message.startsWith('Tracked migration') ? error.message : 'Migration failed. Verify the selected database, PostgreSQL privileges, and network access. No failed migration was committed.');
    process.exitCode = 1;
  } finally {
    if (client) { if (locked) await client.query('SELECT pg_advisory_unlock(4815162342)').catch(() => {}); client.release(); }
    await pool.end();
  }
}
