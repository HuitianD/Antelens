import pg from 'pg';
import * as C from '@beforeyou/contracts';
import { loadEnvLocal } from '../../scripts/load-env-local.ts';
import { PostgresRepository } from './src/index.ts';

loadEnvLocal('../../.env.local');
const url = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString: url });
const latest = await pool.query(`SELECT DISTINCT ON (r.case_id) r.owner_id, r.case_id, r.status, r.dto->'error'->>'code' AS code
  FROM investigation_runs r WHERE r.dto->'provenance'->>'dataOrigin'='user' ORDER BY r.case_id, r.created_at DESC`);
const targets = latest.rows.filter((row) => row.status === 'failed' && row.code === 'OUTPUT_INVALID');
const repo = new PostgresRepository(url);
const model = { modelId: process.env.CLAUDE_MODEL_ID ?? 'not_configured', promptVersion: C.INVESTIGATION_PROMPT_VERSION, policyVersion: C.INVESTIGATION_POLICY_VERSION, toolVersion: C.INVESTIGATION_TOOL_VERSION, execution: 'live' as const };
let queued = 0;
for (const row of targets) { await repo.recheck(row.owner_id, row.case_id, { reason: 'user_recheck' }, model); queued += 1; }
console.log(`latest user-origin runs: ${latest.rows.length}; re-queued OUTPUT_INVALID failures: ${queued}`);
await pool.end(); await repo.close();
