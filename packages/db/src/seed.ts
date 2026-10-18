import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { PostgresRepository } from './repository.js';
import { ensureSyntheticConnection } from './synthetic-connection.js';

try { loadEnvFile(fileURLToPath(new URL('../../../.env.local', import.meta.url))); } catch { /* Optional local file. */ }
const ownerId = process.env.SEED_OWNER_ID;
const databaseUrl = process.env.DATABASE_URL;
if (process.env.APP_MODE !== 'live' || process.env.ALLOW_SYNTHETIC_SEED !== 'true' || !databaseUrl || !ownerId || !/^[0-9a-f-]{36}$/i.test(ownerId)) {
  console.error('BLOCKED: database seeding requires APP_MODE=live, DATABASE_URL, ALLOW_SYNTHETIC_SEED=true and SEED_OWNER_ID for an existing development Auth user. Demo fixtures are seeded by pnpm dev:demo.');
  process.exitCode = 2;
} else {
  const repository = new PostgresRepository(databaseUrl);
  try {
    await repository.transaction(ownerId, async (client) => {
      await ensureSyntheticConnection(client, ownerId);
    });
    console.log('Synthetic development fixture connection seeded idempotently. No observations or live results were fabricated.');
  } catch { console.error('Seed failed. Verify development owner and database configuration.'); process.exitCode = 1; }
  finally { await repository.close(); }
}
