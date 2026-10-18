import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createLiveAgent } from '../packages/agent/src/index.js';
import { assertAssessmentProposal, type Evidence, type InvestigationRun } from '../packages/contracts/src/index.js';
import { loadEnvLocal } from '../scripts/load-env-local.js';
loadEnvLocal(new URL('../.env.local', import.meta.url).pathname);
const required=['FACTORY_API_KEY','ANTHROPIC_API_KEY','CLAUDE_MODEL_ID','DAYTONA_API_KEY','DAYTONA_SNAPSHOT','INVESTIGATION_ALLOWED_DOMAINS','CONTROLLED_FIXTURE_ORIGIN'] as const;
const missing=required.filter(name=>!process.env[name]);
if(missing.length){console.error(`blocked: missing_configuration: ${missing.join(', ')}. See docs/integrations.md. No live provider calls were made.`);process.exitCode=2;}
else {
  const dataset=JSON.parse(await readFile(new URL('./dataset.v1.json',import.meta.url),'utf8')) as {version:string;scenarios:Array<{id:string;name:string;expected:string;impacts:string[];claim:string;observation:string}>};
  const agent=createLiveAgent({factoryApiKey:process.env.FACTORY_API_KEY!,anthropicApiKey:process.env.ANTHROPIC_API_KEY!,anthropicWorkspaceId:process.env.ANTHROPIC_WORKSPACE_ID?.trim()||undefined,claudeModelId:process.env.CLAUDE_MODEL_ID!,daytonaApiKey:process.env.DAYTONA_API_KEY!,daytonaSnapshot:process.env.DAYTONA_SNAPSHOT!,allowedDomains:process.env.INVESTIGATION_ALLOWED_DOMAINS!.split(',').map(s=>s.trim()),droidExecPath:process.env.DROID_EXEC_PATH,timeoutMs:120000,maxSteps:24});
  const rows=[];
  const reportDir=new URL(`./results/live-${Date.now()}/`,import.meta.url);await mkdir(reportDir,{recursive:true});
  for(const scenario of dataset.scenarios){
    const caseId=randomUUID(),runId=randomUUID(),sourceId=randomUUID(),ownerId=randomUUID(),now=new Date().toISOString();
    const source={id:sourceId,title:scenario.name,content:scenario.claim,links:scenario.id==='SC-07'?[]:[`${process.env.CONTROLLED_FIXTURE_ORIGIN}/fixtures/${scenario.id}`]};
    const evidence:Evidence[]=[{id:randomUUID(),caseId,runId:null,sourceEventId:sourceId,stepId:null,kind:'message_excerpt',observedAt:now,sourceLabel:'Controlled synthetic message',displayUrl:null,excerpt:scenario.claim,artifactId:null,contentHash:createHash('sha256').update(scenario.claim).digest('hex'),provenance:{dataOrigin:'synthetic',execution:'live'}}];
    const previousSource = scenario.id === 'SC-02' ? { id: randomUUID(), title: 'Original rental application', content: 'Your application fee is $40.', links: [`${process.env.CONTROLLED_FIXTURE_ORIGIN}/fixtures/SC-01`] } : null;
    const sources = previousSource ? [previousSource, source] : [source];
    if (previousSource) evidence.push({ id: randomUUID(), caseId, runId: null, sourceEventId: previousSource.id, stepId: null, kind: 'message_excerpt', observedAt: now, sourceLabel: 'Original controlled synthetic message', displayUrl: null, excerpt: previousSource.content, artifactId: null, contentHash: createHash('sha256').update(previousSource.content).digest('hex'), provenance: { dataOrigin: 'synthetic', execution: 'live' } });
    try{
      const triage=await agent.triage({source,candidateCases:previousSource ? [{ id: caseId, title: 'Rental application: stated $40 fee versus observed $29 recurring membership', sourceEventIds: [previousSource.id] }] : []});
      if(triage.outcome==='no_action'){rows.push({id:scenario.id,runId,triage,status:scenario.expected==='enforced_boundary'?'unsupported':scenario.expected==='no_action'?'passed':'failed',evidence});continue;}
      const result=await agent.investigate({ownerId,caseId,runId,sourceRevision:previousSource?2:1,dataOrigin:'synthetic',sources,existingEvidence:evidence,saveEvidence:async capture=>{
        const id=randomUUID();let artifactId:string|null=null;
        if(capture.artifactBytes){artifactId=id;await writeFile(new URL(`${id}.png`,reportDir),capture.artifactBytes,{mode:0o600});}
        const saved:Evidence={id,caseId,runId,sourceEventId:capture.sourceEventId,stepId:capture.stepId,kind:capture.kind,observedAt:new Date().toISOString(),sourceLabel:capture.sourceLabel,displayUrl:capture.displayUrl,excerpt:capture.excerpt,artifactId,contentHash:capture.contentHash,provenance:capture.provenance};evidence.push(saved);return saved;
      }});
      const run:InvestigationRun={id:runId,caseId,sourceRevision:previousSource?2:1,trigger:previousSource?'new_evidence':'new_source',status:'checking',attempt:1,startedAt:now,finishedAt:null,modelId:result.modelId,promptVersion:'investigation-1.0.0',policyVersion:'navigation-1.0.0',toolVersion:'browser-1.0.0',provenance:{dataOrigin:'synthetic',execution:'live'},limitations:result.limitations,error:null};
      const finalStatus=result.limitations.length?'limited':'complete';
      assertAssessmentProposal({proposal:result.proposal,run,evidence,sourceEventIds:sources.map(item=>item.id),mode:'live',finalStatus});
      const actual=scenario.expected==='limited'?finalStatus:result.proposal.verdict;
      rows.push({id:scenario.id,runId,sessionId:result.sessionId,status:scenario.expected==='enforced_boundary'?'unsupported':actual===scenario.expected?'passed':'failed',actual,proposal:result.proposal,evidence});
    }catch(error){rows.push({id:scenario.id,runId,status:'failed',reason:error instanceof Error?error.message:'Provider failed',evidence});}
  }
  const result={datasetVersion:dataset.version,provenance:{dataOrigin:'synthetic',execution:'live'},rows,summary:{passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,unsupported:rows.filter(r=>r.status==='unsupported').length}};
  await writeFile(new URL('report.json',reportDir),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result.summary));if(result.summary.failed)process.exitCode=1;
}
