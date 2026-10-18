import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {CaseDetailSchema,InvestigationRunSchema} from '@beforeyou/contracts';
import {captureReceipt,captureReceiptKey,restoreCaptureReceipt} from './capture-receipt.ts';
import {resolveCapturedState,captureTitle} from './capture-status.ts';
import type {PageState} from './config.ts';

test('popup/worker restart restores only this owner and exact page receipt, without storing evidence or verdict text',()=>{
 const owner=randomUUID(),state:PageState={ownerId:owner,pageUrl:'http://127.0.0.1:4080/fixtures/SC-01',caseId:randomUUID(),runId:randomUUID(),captureId:randomUUID(),sourceEventId:randomUUID(),association:'standalone',caseTitle:'Rental terms',phase:'checking',message:'Checking',finding:'Do not persist this finding',verdict:'confirm_first'};
 const receipt=captureReceipt(state)!;
 assert(!('finding'in receipt));assert(!('verdict'in receipt));
 assert.equal(restoreCaptureReceipt(receipt,owner,state.pageUrl!)?.runId,state.runId);
 assert.equal(restoreCaptureReceipt(receipt,randomUUID(),state.pageUrl!),undefined);
 assert.equal(restoreCaptureReceipt(receipt,owner,'http://127.0.0.1:4080/fixtures/unrelated'),undefined);
 assert.notEqual(captureReceiptKey(owner,state.pageUrl!),captureReceiptKey(owner,'http://127.0.0.1:4080/fixtures/unrelated'));
 assert.equal(captureReceiptKey(owner,state.pageUrl!),captureReceiptKey(owner,state.pageUrl!+'?monthlyFee=39'));
});
test('restored captures reach their own actual terminal state even if the case has another active run',()=>{
 const caseId=randomUUID(),runId=randomUUID(),captureId=randomUUID(),now=new Date().toISOString();
 const state:PageState={phase:'checking',message:'Checking',caseId,runId,captureId,association:'standalone'};
 const run=InvestigationRunSchema.parse({id:runId,caseId,sourceRevision:1,trigger:'new_source',status:'limited',attempt:1,startedAt:now,finishedAt:now,modelId:'mock-model',promptVersion:'test',policyVersion:'test',toolVersion:'test',provenance:{dataOrigin:'synthetic',execution:'simulated'},limitations:[],error:null,pageCaptureId:captureId});
 const detail=CaseDetailSchema.parse({case:{id:caseId,recordVersion:2,title:'Rental terms',sourceKinds:['browser'],sourceRevision:1,currentAssessment:null,activeRunId:randomUUID(),latestRunStatus:'checking',freshness:'current',reviewStatus:'unreviewed',updatedAt:now},sources:[],currentAssessment:null,activeRun:null,latestRun:null,journey:[],evidence:[],historyCursor:null});
 const finished=resolveCapturedState(state,detail,run);assert.equal(finished.phase,'limited');assert.equal(captureTitle(finished.phase),'Check finished');assert.equal(finished.finding,undefined);
 const failed=resolveCapturedState(state,detail,{...run,status:'failed'});assert.equal(failed.phase,'failed');assert.equal(captureTitle(failed.phase),'Check failed');
 assert.equal(resolveCapturedState(state,detail,{...run,status:'complete'}).phase,'ready');
 assert.equal(resolveCapturedState(state,detail,{...run,status:'cancelled'}).phase,'failed');
 assert.throws(()=>resolveCapturedState(state,detail,{...run,pageCaptureId:randomUUID()}),/does not match/);
});
