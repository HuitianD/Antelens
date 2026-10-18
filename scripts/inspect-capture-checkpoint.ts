import {readFile,writeFile} from 'node:fs/promises';
import {PostgresRepository,supabaseBackendKey,supabaseServiceHeaders} from '../packages/db/src/index.js';
import {createHash} from 'node:crypto';
import {loadEnvLocal} from './load-env-local.js';
loadEnvLocal();
const fee=Number(process.argv.find(arg=>arg.startsWith('--fee='))?.slice(6)??29);
let path=`.local/capture-checkpoint/fee-${fee}.json`;
let report=JSON.parse(await readFile(path,'utf8'));
const repo=new PostgresRepository(process.env.DATABASE_URL!);
try{
 if(process.argv.includes('--latest-chrome')){
  const row=(await repo.pool.query("SELECT p.id,p.source_event_id,r.id AS run_id FROM page_captures p JOIN browser_installations i ON i.id=p.installation_id AND i.owner_id=p.owner_id JOIN investigation_runs r ON r.owner_id=p.owner_id AND r.dto->>'pageCaptureId'=p.id::text WHERE p.owner_id=$1 AND p.case_id=$2 AND i.display_name<>'Controlled capture checkpoint (backend)' ORDER BY r.created_at DESC,r.id DESC LIMIT 1",[report.ownerId,report.caseId])).rows[0];
  if(!row){console.log('BLOCKED: no capture from the signed-in Chrome extension has reached this rental case yet. Backend checkpoints are excluded.');process.exitCode=2;}
  else{report={...report,captureId:row.id,sourceEventId:row.source_event_id,runId:row.run_id,checkpoint:'Signed-in Chrome extension capture'};path='.local/capture-checkpoint/chrome-latest.json';}
  if(!row)throw Object.assign(new Error('Awaiting Chrome capture.'),{code:'CHROME_CAPTURE_PENDING'});
 }
 let last='',snapshot;
 const deadline=Date.now()+(process.argv.includes('--watch')?240000:0);
 do{
  const row=(await repo.pool.query('SELECT dto,sandbox_id,provider_session_id FROM investigation_runs WHERE owner_id=$1 AND id=$2',[report.ownerId,report.runId])).rows[0];
  const outbox=(await repo.pool.query("SELECT delivered_at IS NOT NULL AS delivered FROM outbox_events WHERE owner_id=$1 AND topic='investigate' AND payload->>'runId'=$2",[report.ownerId,report.runId])).rows[0];
  const evidence=(await repo.pool.query('SELECT dto FROM evidence WHERE owner_id=$1 AND run_id=$2 ORDER BY created_at',[report.ownerId,report.runId])).rows.map(r=>r.dto);
  const steps=(await repo.pool.query('SELECT dto FROM investigation_steps WHERE owner_id=$1 AND run_id=$2 ORDER BY step_index',[report.ownerId,report.runId])).rows.map(r=>r.dto);
  const detail=await repo.caseDetail(report.ownerId,report.caseId);
  const assessment=(await repo.pool.query('SELECT dto FROM assessments WHERE owner_id=$1 AND run_id=$2',[report.ownerId,report.runId])).rows[0]?.dto??null;
  snapshot={...report,status:row.dto.status,error:row.dto.error,outboxDelivered:outbox?.delivered??false,sandboxId:row.sandbox_id,providerSessionId:row.provider_session_id,steps:steps.map(s=>s.label),evidence:evidence.map(e=>({id:e.id,kind:e.kind,excerpt:e.excerpt,artifactId:e.artifactId,contentHash:e.contentHash,inspection:e.inspection})),assessment,caseVersion:detail.case.recordVersion,freshness:detail.case.freshness};
  const stage=JSON.stringify({status:snapshot.status,outboxDelivered:snapshot.outboxDelivered,steps:snapshot.steps,evidenceCount:evidence.length,sandboxCreated:Boolean(row.sandbox_id)});
  if(stage!==last){console.log(stage);last=stage;}
  if(!['queued','checking'].includes(row.dto.status))break;
  if(Date.now()>=deadline)break;
  await new Promise(resolve=>setTimeout(resolve,2000));
 }while(Date.now()<deadline);
 await writeFile(path,JSON.stringify(snapshot,null,2),{mode:0o600});
 if(['complete','limited'].includes(snapshot!.status)&&snapshot!.assessment?.runId===report.runId){
  console.log(JSON.stringify({status:snapshot!.status,version:snapshot!.assessment.version,finding:snapshot!.assessment.finding,checkedScope:snapshot!.assessment.checkedScope,offlineArtifacts:snapshot!.evidence.filter(e=>e.inspection).map(e=>({kind:e.kind,artifactId:e.artifactId,networkRequests:e.inspection.networkRequests,bundleHash:e.inspection.bundleHash})),providerSessionRecorded:Boolean(snapshot!.providerSessionId)},null,2));
  if(process.argv.includes('--artifacts'))for(const evidence of snapshot!.evidence.filter(e=>e.inspection&&e.artifactId)){
   const artifact=(await repo.pool.query('SELECT storage_key FROM artifacts WHERE owner_id=$1 AND id=$2',[report.ownerId,evidence.artifactId])).rows[0];
   const response=await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/authenticated/${process.env.SUPABASE_STORAGE_BUCKET}/${artifact.storage_key}`,{headers:supabaseServiceHeaders(supabaseBackendKey()!),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('The private stored screenshot could not be read.');
   const bytes=Buffer.from(await response.arrayBuffer());
   if(createHash('sha256').update(bytes).digest('hex')!==evidence.contentHash)throw new Error('The stored screenshot hash did not match its evidence record.');
   await writeFile(`.local/capture-checkpoint/fee-${fee}.png`,bytes,{mode:0o600});console.log('PASS private Supabase screenshot download and persisted content hash.');
  }
 }else process.exitCode=2;
}catch(error){if((error as {code?:string}).code!=='CHROME_CAPTURE_PENDING')throw error;}
finally{await repo.pool.end();}
