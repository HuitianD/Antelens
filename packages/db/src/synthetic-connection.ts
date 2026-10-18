import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ConnectionSummarySchema, type ConnectionSummary } from '@beforeyou/contracts';

export const SYNTHETIC_PROVIDER_ACCOUNT_ID = 'synthetic-controlled-fixtures';

export async function ensureSyntheticConnection(client: PoolClient, ownerId: string): Promise<ConnectionSummary> {
  const existing = await client.query('SELECT id,dto FROM connections WHERE owner_id=$1 AND kind=$2 AND provider_account_id=$3', [ownerId, 'gmail', SYNTHETIC_PROVIDER_ACCOUNT_ID]);
  if (existing.rows[0]) {
    const dto = ConnectionSummarySchema.parse({ ...existing.rows[0].dto as ConnectionSummary, status: 'connected' });
    await client.query("UPDATE connections SET status='connected',dto=$3,updated_at=now() WHERE owner_id=$1 AND id=$2", [ownerId, existing.rows[0].id, dto]);
    return dto;
  }
  const dto = ConnectionSummarySchema.parse({
    id: randomUUID(),
    kind: 'gmail',
    status: 'connected',
    accountLabel: 'Synthetic fixture mailbox (development only)',
    grantedScopes: [],
    lastSyncedAt: null,
    lastErrorCode: null,
  });
  await client.query(
    "INSERT INTO connections(id,owner_id,kind,provider_account_id,status,dto,sync_config) VALUES($1,$2,'gmail',$3,'connected',$4,$5)",
    [dto.id, ownerId, SYNTHETIC_PROVIDER_ACCOUNT_ID, dto, { synthetic: true }],
  );
  return dto;
}
