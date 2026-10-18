import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ActivityEventSchema, CaseDetailSchema } from '@beforeyou/contracts';
import { createDemoState, ingestDemo, processDemoJobs, caseDetail, viewedDemo, recheckDemo, publishDemo, DemoStore, idempotent, DomainError } from './store.js';
test('synthetic seed keeps newsletter separate and limited access without a favorable verdict', () => { const s = createDemoState(); assert.equal(s.cases.length, 5); assert.equal(s.sources.length, 6); assert.equal(s.sources.find(r => r.scenarioId === 'SC-07')?.source.disposition, 'no_action'); const limited = s.cases.find(c => c.latestRunStatus === 'limited')!; assert.equal(limited.currentAssessment, null); for (const c of s.cases)
    CaseDetailSchema.parse(caseDetail(s, c.id)); for (const e of s.events)
    ActivityEventSchema.parse(e); assert(s.assessments.every(a => a.provenance.execution === 'simulated')); });
test('duplicate source delivery has one effect and SC02 revises same case preserving the conflict', () => { const s = createDemoState(), original = s.sources.find(r => r.scenarioId === 'SC-01')!, caseId = original.caseIds[0]!, c = s.cases.find(c => c.id === caseId)!; const previous = c.currentAssessment!; viewedDemo(s, caseId, previous.id); assert.equal(c.reviewStatus, 'viewed'); const followup = ingestDemo(s, 'SC-02', 'followup-unique'); assert.equal(ingestDemo(s, 'SC-02', 'followup-unique').source.id, followup.source.id); processDemoJobs(s, true); assert.equal(followup.caseIds[0], caseId); assert.equal(c.freshness, 'stale'); for (let i = 0; i < 4; i++)
    processDemoJobs(s, true); assert.equal(c.currentAssessment?.version, 2); assert.equal(c.currentAssessment?.verdict, 'confirm_first'); assert.equal(c.currentAssessment?.supersedesAssessmentId, previous.id); assert.equal(c.reviewStatus, 'unreviewed'); viewedDemo(s, caseId, previous.id); assert.equal(c.reviewStatus, 'unreviewed'); assert.equal(s.cases.length, 5); });
test('a superseded run cannot overwrite a newer revision or lease generation', () => { const s = createDemoState(), c = s.cases[0]!; recheckDemo(s, c.id, 'user_recheck'); processDemoJobs(s, true); const old = s.runs.find(r => r.id === c.activeRunId)!; const generation = s.runGenerations[old.id]!; ingestDemo(s, 'SC-02', 'followup'); processDemoJobs(s, true); assert.equal(publishDemo(s, c, old, generation), false); assert.notEqual(c.activeRunId, old.id); for (let i = 0; i < 4; i++)
    processDemoJobs(s, true); assert.equal(c.currentAssessment?.sourceRevision, c.sourceRevision); });
test('recheck idempotency rejects changed input and terminal work is not reused', () => { const s = createDemoState(), c = s.cases[0]!, input = { reason: 'user_recheck' as const }; const run = idempotent(s, 'recheck', 'abc', input, () => recheckDemo(s, c.id, input.reason)); const repeat = idempotent(s, 'recheck', 'abc', input, () => recheckDemo(s, c.id, input.reason)); assert.equal(run.runId, repeat.runId); assert.throws(() => idempotent(s, 'recheck', 'abc', { reason: 'verification_requested' }, () => null), DomainError); for (let i = 0; i < 4; i++)
    processDemoJobs(s, true); assert.notEqual(recheckDemo(s, c.id, 'user_recheck').runId, run.runId); });
test('separate repository instances preserve worker completion and durable cursor across reopen', async () => { const dir = await mkdtemp(path.join(os.tmpdir(), 'beforeyou-demo-')); try {
    const file = path.join(dir, 'state.json'), api = new DemoStore(file), worker = new DemoStore(file);
    const source = await api.transaction(s => ingestDemo(s, 'SC-05', 'persisted'));
    const before = await api.read();
    for (let i = 0; i < 4; i++)
        await worker.transaction(s => processDemoJobs(s, true));
    const reopened = await new DemoStore(file).read(), message = reopened.sources.find(r => r.source.id === source.source.id)!;
    assert.equal(message.caseIds.length, 1);
    assert(reopened.cursor > before.cursor);
    assert.equal(reopened.cases.find(c => c.id === message.caseIds[0])?.currentAssessment?.verdict, 'pause_here');
}
finally {
    await rm(dir, { recursive: true, force: true });
} });

test('scheduled stages survive serialized worker restarts without immediate-mode shortcuts', t => {
    const epoch = Date.parse('2026-10-18T01:00:00.000Z');
    t.mock.timers.enable({apis:['Date'],now:epoch});
    let state=createDemoState();
    const cursor=state.cursor;
    const source=ingestDemo(state,'SC-02','timed-followup');
    const caseId=state.sources.find(r=>r.scenarioId==='SC-01')!.caseIds[0]!;
    const seen:string[]=[];
    for(let elapsed=0;elapsed<=6000;elapsed+=500){
        processDemoJobs(state);
        const item=state.cases.find(c=>c.id===caseId)!;
        const currentSource=state.sources.find(r=>r.source.id===source.source.id)!;
        seen.push(`${currentSource.source.processingStatus}:${item.latestRunStatus}`);
        if(item.activeRunId)assert.equal(item.freshness,'stale');
        // A restarted worker must recover the persisted stage, rather than restart a timer.
        state=JSON.parse(JSON.stringify(state));
        if(item.currentAssessment?.version===2)break;
        t.mock.timers.tick(500);
    }
    const item=state.cases.find(c=>c.id===caseId)!;
    assert.equal(item.currentAssessment?.version,2);
    assert.equal(item.currentAssessment?.verdict,'confirm_first');
    assert(seen.includes('queued:complete'));
    assert(seen.includes('complete:queued'));
    assert(seen.includes('complete:checking'));
    const events=state.events.filter(e=>Number(e.id)>cursor);
    const phases=['source.received','source.updated','investigation.queued','investigation.started','investigation.step_completed','assessment.published'];
    let previous=-1;
    for(const phase of phases){const index=events.findIndex(e=>e.type===phase);assert(index>previous,`${phase} must follow the prior persisted phase`);previous=index;}
    assert.equal(state.jobs.length,0);
});
