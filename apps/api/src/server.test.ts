import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { DemoStore, processDemoJobs } from '@beforeyou/fixtures';
import { DashboardSnapshotSchema, CaseDetailSchema, MessageDetailSchema } from '@beforeyou/contracts';
import { createServer } from './server.js';
import { loadConfig } from './config.js';
async function setup() { const dir = await mkdtemp(path.join(os.tmpdir(), 'beforeyou-api-')); const store = new DemoStore(path.join(dir, 'state.json')), app = await createServer(loadConfig({ APP_MODE: 'demo' }), store); return { app, store, close: async () => { await app.close(); await rm(dir, { recursive: true, force: true }); } }; }
const headers = { host: '127.0.0.1:4000', origin: 'http://localhost:3000' };
test('API saved snapshot, explicit source outcomes, and followup publication agree with canonical schemas', async () => { const { app, store, close } = await setup(); try {
    const snapshot = await app.inject({ url: '/v1/dashboard', headers });
    assert.equal(snapshot.statusCode, 200);
    const body = snapshot.json();
    DashboardSnapshotSchema.parse(body.data);
    assert.equal(body.data.counts.confirm_first, 2);
    assert.equal(body.data.counts.no_issues_found, 1);
    const accepted = await app.inject({ method: 'POST', url: '/v1/demo/events', headers: { ...headers, 'idempotency-key': 'test-followup' }, payload: { scenario: 'SC-02' } });
    assert.equal(accepted.statusCode, 202);
    for (let i = 0; i < 4; i++)
        await store.transaction(s => processDemoJobs(s, true));
    const message = await app.inject({ url: `/v1/messages/${accepted.json().data.sourceEventId}`, headers });
    MessageDetailSchema.parse(message.json().data);
    const detail = await app.inject({ url: `/v1/cases/${message.json().data.caseIds[0]}`, headers });
    CaseDetailSchema.parse(detail.json().data);
    assert.equal(detail.json().data.case.currentAssessment.version, 2);
}
finally {
    await close();
} });
test('local mutations reject hostile origins/hosts and invalid identifiers without exposing internals', async () => { const { app, close } = await setup(); try {
    for (const bad of [{ host: 'evil.example', origin: 'http://localhost:3000' }, { host: 'localhost:4000', origin: 'https://evil.example' }]) {
        const res = await app.inject({ method: 'POST', url: '/v1/demo/reset', headers: bad });
        assert.equal(res.statusCode, 403);
    }
    const invalid = await app.inject({ url: '/v1/cases/not-a-uuid', headers });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, 'VALIDATION_ERROR');
    assert(!invalid.body.includes('stack'));
    const missing = await app.inject({ url: `/v1/cases/${randomUUID()}`, headers });
    assert.equal(missing.statusCode, 404);
}
finally {
    await close();
} });
test('reading a case does not change its verdict or record viewed; viewed is assessment scoped', async () => { const { app, close } = await setup(); try {
    const snapshot = (await app.inject({ url: '/v1/dashboard', headers })).json().data;
    const c = snapshot.cases.items.find((c: {
        currentAssessment: unknown;
    }) => c.currentAssessment);
    const opened = await app.inject({ url: `/v1/cases/${c.id}`, headers });
    assert.equal(opened.json().data.case.reviewStatus, 'unreviewed');
    const viewed = await app.inject({ method: 'POST', url: `/v1/cases/${c.id}/viewed`, headers, payload: { assessmentId: c.currentAssessment.id } });
    assert.equal(viewed.statusCode, 200);
    const after = (await app.inject({ url: `/v1/cases/${c.id}`, headers })).json().data.case;
    assert.equal(after.reviewStatus, 'viewed');
    assert.equal(after.currentAssessment.verdict, c.currentAssessment.verdict);
}
finally {
    await close();
} });
test('production and nonloopback demo configuration fail closed', () => { assert.throws(() => loadConfig({ APP_MODE: 'demo', NODE_ENV: 'production' })); assert.throws(() => loadConfig({ APP_MODE: 'demo', API_HOST: '0.0.0.0' })); assert.throws(() => loadConfig({ APP_MODE: 'live' })); });

test('credentialed SSE replays the saved cursor and closes promptly during API shutdown', async () => {
    const {app,store,close}=await setup();
    const url=await app.listen({host:'127.0.0.1',port:0});
    const saved=await store.read();
    const controller=new AbortController();
    try {
        const response=await fetch(`${url}/v1/events`,{headers:{Origin:'http://127.0.0.1:3000','Last-Event-ID':String(saved.cursor-1)},signal:controller.signal});
        assert.equal(response.status,200);
        assert.equal(response.headers.get('access-control-allow-origin'),'http://127.0.0.1:3000');
        assert.equal(response.headers.get('access-control-allow-credentials'),'true');
        const reader=response.body!.getReader();
        let content='';
        while(!content.includes(`id: ${saved.cursor}\n`)) {
            const chunk=await reader.read();
            assert.equal(chunk.done,false);
            content+=new TextDecoder().decode(chunk.value);
        }
        const started=Date.now();
        await app.close();
        assert(Date.now()-started<1000,'SSE must not delay graceful shutdown');
        reader.releaseLock();
    } finally {controller.abort();await close();}
});
