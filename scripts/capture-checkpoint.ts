import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {PostgresRepository} from '../packages/db/src/index.js';
import {PageCaptureInputSchema,INVESTIGATION_PROMPT_VERSION,INVESTIGATION_POLICY_VERSION,INVESTIGATION_TOOL_VERSION} from '../packages/contracts/src/index.js';
import {loadEnvLocal} from './load-env-local.js';
import {chromium} from '@playwright/test';
import {collectVisiblePage} from '../apps/extension/src/capture.js';
import {redactCaptureText} from '../packages/contracts/src/index.js';

loadEnvLocal();
if(!process.env.DATABASE_URL)throw new Error('Database is not configured.');
const repo=new PostgresRepository(process.env.DATABASE_URL);
try{
 const rows=await repo.pool.query("SELECT DISTINCT c.id,c.owner_id,c.dto,se.dto AS source,co.sync_config FROM cases c JOIN case_sources cs ON cs.case_id=c.id AND cs.owner_id=c.owner_id JOIN source_events se ON se.id=cs.source_event_id AND se.owner_id=cs.owner_id JOIN connections co ON co.id=se.connection_id AND co.owner_id=se.owner_id WHERE se.kind='gmail' AND co.status='connected' AND se.content LIKE '%40%' AND se.content NOT LIKE '%29%' AND (se.dto->>'title' ILIKE '%rental%' OR se.dto->>'title' ILIKE '%application%') ORDER BY c.id");
 const candidates=rows.rows.filter(row=>row.source.dataOrigin==='user'&&!row.sync_config?.synthetic);
 console.log(JSON.stringify({eligibleGmailCases:candidates.map(row=>({caseId:row.id,title:row.dto.title,gmailSourceId:row.source.id,origin:row.source.dataOrigin})),syntheticCandidates:rows.rows.length-candidates.length},null,2));
 if(!process.argv.includes('--run'))process.exitCode=candidates.length?0:2;
 else{
  const selected=process.argv.find(arg=>arg.startsWith('--case='))?.slice(7);
  const row=candidates.find(item=>item.id===selected);
  if(!row)throw new Error('Pass --case=<eligible Gmail case ID> to explicitly choose an existing real Gmail case. No case was changed.');
  const fee=Number(process.argv.find(arg=>arg.startsWith('--fee='))?.slice(6)??29);
  if(![29,39].includes(fee))throw new Error('The checkpoint supports only the controlled $29/$39 change.');
  const browser=await chromium.launch();
  let bundle;
  try{
   const page=await browser.newPage({viewport:{width:1280,height:900},bypassCSP:true});
   await page.goto(`${process.env.CAPTURE_ALLOWED_ORIGIN}/fixtures/SC-01?monthlyFee=${fee}`);
   // tsx preserves function names using __name; provide that identity helper when serializing its compiled function.
   bundle=await page.evaluate(({collector,redactor})=>new Function('document','window','redact','__name','return ('+collector+')(document,window,redact)')(document,window,new Function('return ('+redactor+')')(),(fn:unknown)=>fn),{collector:collectVisiblePage.toString(),redactor:redactCaptureText.toString()});
  }finally{await browser.close();}
  const installationId=randomUUID(),connectionId=randomUUID();
  // A backend-only checkpoint installation is labelled separately from a user's Chrome installation.
  await repo.transaction(row.owner_id,async client=>{
   const connection={id:connectionId,kind:'browser',status:'connected',accountLabel:'Controlled capture checkpoint (backend)',grantedScopes:[process.env.CAPTURE_ALLOWED_ORIGIN!],lastSyncedAt:null,lastErrorCode:null};
   await client.query("INSERT INTO connections(id,owner_id,kind,provider_account_id,status,dto) VALUES($1,$2,'browser',$3,'connected',$4)",[connectionId,row.owner_id,`capture-checkpoint:${installationId}`,connection]);
   await client.query('INSERT INTO browser_installations(id,owner_id,connection_id,client_installation_id,display_name) VALUES($1,$2,$3,$4,$5)',[installationId,row.owner_id,connectionId,randomUUID(),'Controlled capture checkpoint (backend)']);
  });
  const input=PageCaptureInputSchema.parse({clientCaptureId:randomUUID(),installationId,caseId:row.id,bundle});
  const accepted=await repo.ingestCapturedPage(row.owner_id,input,{modelId:process.env.CLAUDE_MODEL_ID!,promptVersion:INVESTIGATION_PROMPT_VERSION,policyVersion:INVESTIGATION_POLICY_VERSION,toolVersion:INVESTIGATION_TOOL_VERSION,execution:'live'},'synthetic');
  await mkdir('.local/capture-checkpoint',{recursive:true,mode:0o700});
  const report={checkpoint:'Real local DOM collected with the extension collector, backend ingress; not a signed-in Chrome extension interaction',fee,ownerId:row.owner_id,...accepted};
  await writeFile(`.local/capture-checkpoint/fee-${fee}.json`,JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({stage:'queued',fee,...accepted},null,2));
 }
}finally{await repo.pool.end();}
