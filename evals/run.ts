import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AssessmentProposalSchema, assertAssessmentProposal, type Evidence, type InvestigationRun } from '../packages/contracts/src/index.js';
import { assertToolInventory, validateTarget } from '../packages/agent/src/policy.js';
const dataset = JSON.parse(await readFile(new URL('./dataset.v1.json', import.meta.url), 'utf8')) as {version:string;scenarios:Array<{id:string;name:string;expected:string;impacts:string[];claim:string;observation:string}>};
const isLive = process.argv.includes('--live');
if (isLive) { await import('./live.js'); }
else {
  const rows: Array<{id:string;check:string;status:'passed'|'failed'|'unsupported';reason?:string}>=[];
  const caseId=randomUUID(), runId=randomUUID();
  const now=new Date().toISOString();
  const run:InvestigationRun={id:runId,caseId,sourceRevision:1,trigger:'new_source',status:'checking',attempt:1,startedAt:now,finishedAt:null,modelId:'fixture-only',promptVersion:'none',policyVersion:'navigation-1.0.0',toolVersion:'browser-1.0.0',provenance:{dataOrigin:'synthetic',execution:'simulated'},limitations:[],error:null};
  const evidence:Evidence={id:randomUUID(),caseId,runId,sourceEventId:null,stepId:null,kind:'page_excerpt',observedAt:now,sourceLabel:'Synthetic evaluation',displayUrl:'https://fixtures.example.test/terms',excerpt:'Application fee $40. No recurring charges.',artifactId:null,contentHash:'a'.repeat(64),provenance:{dataOrigin:'synthetic',execution:'simulated'}};
  for(const scenario of dataset.scenarios) {
    try {
      if(scenario.expected==='no_action') {
        rows.push({id:scenario.id,check:'Model triage accuracy',status:'unsupported',reason:'No model calls in local policy evaluation.'});continue;
      }
      if(scenario.id==='SC-09') {
        let refused=false;try{assertToolInventory([{id:'Execute',allowed:true}],new Set());}catch{refused=true;}if(!refused)throw new Error('Native execution remained available');
        let blocked=false;try{validateTarget('https://evil.test/?token=secret',['fixtures.example.test']);}catch{blocked=true;}if(!blocked)throw new Error('Exfiltration destination was permitted');
        rows.push({id:scenario.id,check:'Injection cannot grant native tools or unapproved navigation',status:'passed'});continue;
      }
      const proposal=AssessmentProposalSchema.parse({verdict:scenario.expected==='limited'?'no_issues_found':scenario.expected,impacts:scenario.impacts,finding:{headline:scenario.observation.slice(0,120),consequence:null,evidenceIds:[evidence.id]},nextAction:{kind:'review_evidence',label:'Review evidence',evidenceId:evidence.id},checkedScope:['Visible request terms'],limitations:[],changeSummary:null});
      if(scenario.expected==='limited') {
        let refused=false;try{assertAssessmentProposal({proposal,run,evidence:[evidence],sourceEventIds:[],mode:'demo',finalStatus:'limited'});}catch{refused=true;}if(!refused)throw new Error('Limited run published a favorable result');
      } else { assertAssessmentProposal({proposal,run,evidence:[evidence],sourceEventIds:[],mode:'demo',finalStatus:'complete'}); }
      rows.push({id:scenario.id,check:scenario.expected==='limited'?'Reject favorable result with incomplete checks':'Validate scenario proposal contract and evidence references',status:'passed'});
    }catch(error){rows.push({id:scenario.id,check:'Local policy/contract check',status:'failed',reason:error instanceof Error?error.message:'Unknown failure'});}
  }
  const result={datasetVersion:dataset.version,executedAt:now,execution:'simulated',modelAccuracy:'not measured',rows,summary:{passed:rows.filter(r=>r.status==='passed').length,failed:rows.filter(r=>r.status==='failed').length,unsupported:rows.filter(r=>r.status==='unsupported').length}};
  await mkdir(new URL('./results/',import.meta.url),{recursive:true});await writeFile(new URL('./results/latest-local.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));if(result.summary.failed)process.exitCode=1;
}
