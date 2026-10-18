import {chromium,expect,type Page} from '@playwright/test';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadEnvLocal} from './load-env-local.js';
import {supabaseBackendKey,supabaseServiceHeaders} from '../packages/db/src/index.js';
import {redactCaptureText,type CaseDetail,type AcceptedPageCapture} from '../packages/contracts/src/index.js';

// Explicit live checkpoint. The test account is confirmed through the admin API without sending mail.
// No owner password, API response, source observation or provider result is mocked.
loadEnvLocal();
if(!process.argv.includes('--run')){console.error('BLOCKED: pass --run for the real Supabase/Chrome/Daytona/Claude checkpoint. It creates labeled development data.');process.exit(2);}
const directory=resolve('.local/standalone-checkpoint');
await mkdir(directory,{recursive:true,mode:0o700});
let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
let currentPanel:Page|undefined;
let account:{ownerId:string;email:string;password:string};
const report:{checks:string[];runs:unknown[];caseId?:string;ownerId?:string;passed?:boolean;failure?:string}={checks:[],runs:[]};
const apiOrigin=process.env.API_ORIGIN||'http://127.0.0.1:4000';
const webOrigin=process.env.WEB_ORIGIN||'http://127.0.0.1:3000';
const fixtureOrigin=process.env.CAPTURE_ALLOWED_ORIGIN!;
let stage='preflight';
let token='';
async function api(path:string){const response=await fetch(`${apiOrigin}/v1${path}`,{headers:{Authorization:`Bearer ${token}`,Origin:webOrigin}});if(!response.ok)throw new Error(`Authenticated checkpoint request failed (HTTP ${response.status}) at ${path.split('?')[0]}.`);return (await response.json()).data;}
function pass(message:string){report.checks.push(message);console.log(`PASS ${message}`);}
try{
 const health=await(await fetch(`${apiOrigin}/health/live`)).json();if(health.mode!=='live')throw new Error('This checkpoint requires an authenticated live API.');
 stage='test-account';
 try{account=JSON.parse(await readFile(`${directory}/account.json`,'utf8'));}
 catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;
  const email=`beforeyou.capture.${randomUUID()}@example.test`,password=`By!9a${randomBytes(24).toString('base64url')}`;
  const response=await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`,{method:'POST',headers:{...supabaseServiceHeaders(supabaseBackendKey()!),'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{label:'Controlled standalone extension checkpoint'}}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Development test-account creation failed (HTTP ${response.status}).`);
  const user=await response.json();if(typeof user.id!=='string')throw new Error('The test-account response had no user ID.');
  account={ownerId:user.id,email,password};await writeFile(`${directory}/account.json`,JSON.stringify(account),{mode:0o600});
 }
 report.ownerId=account.ownerId;
 const auth=await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
 if(!auth.ok)throw new Error(`Test-account session could not start (HTTP ${auth.status}).`);token=(await auth.json()).access_token;
 expect((await api('/messages?source=gmail')).items).toHaveLength(0);
 pass('isolated real authenticated owner has zero Gmail sources');
 stage='chromium';
 const extension=resolve('apps/extension/.output/chrome-mv3');
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:!process.argv.includes('--headed'),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).host;
 if(!process.argv.includes('--review-only')){
 const site=await context.newPage();await site.goto(`${fixtureOrigin}/fixtures/SC-01?monthlyFee=29`);
 const fixtureTab=await worker.evaluate(async()=>{const tabs=await (globalThis as any).chrome.tabs.query({});return tabs.find((tab:any)=>tab.url?.includes('/fixtures/SC-01'))??tabs.find((tab:any)=>tab.active);});
 if(!fixtureTab?.id)throw new Error('The controlled Chrome tab was not found.');
 // The toolbar popup is presented as a test tab. Only active-tab selection is adapted; all actual Chrome capture/permission APIs execute unchanged.
 await context.addInitScript(({tab})=>{if(location.protocol==='chrome-extension:'){const api=(globalThis as any).chrome;const query=api.tabs.query.bind(api.tabs);api.tabs.query=(filter:any)=>filter.active&&filter.currentWindow?Promise.resolve([tab]):query(filter);}}, {tab:{...fixtureTab,url:site.url(),title:await site.title()}});
 async function panel():Promise<Page>{const page=await context!.newPage();currentPanel=page;await page.goto(`chrome-extension://${extensionId}/popup.html`);return page;}
 let popup=await panel();
 stage='extension-sign-in';
 await popup.getByLabel('Email',{exact:true}).fill(account.email);await popup.getByLabel('Password',{exact:true}).fill(account.password);await popup.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(popup.getByRole('button',{name:'Allow this site',exact:true})).toBeVisible({timeout:15000});
 pass('production extension signs in through real Supabase Auth');
 stage='site-grant';await popup.getByRole('button',{name:'Allow this site',exact:true}).click();
 console.log('Awaiting actual Chrome controlled-site permission.');
 await expect(popup.getByRole('button',{name:'Check this page',exact:true})).toBeEnabled({timeout:process.argv.includes('--headed')?60000:10000});
 await expect(popup.locator('.email-link')).not.toHaveAttribute('open','');
 await popup.getByText('Link to an email · Optional',{exact:true}).click();
 await expect(popup.getByText('No email cases are available.',{exact:false})).toBeVisible();
 await expect(popup.getByRole('button',{name:'Check this page',exact:true})).toBeEnabled();
 await popup.getByText('Link to an email · Optional',{exact:true}).click();
 await popup.setViewportSize({width:390,height:844});await popup.screenshot({path:`${directory}/standalone-ready.png`});
 pass('explicit controlled-site grant and standalone check work with zero email cases; email linking is collapsed');
 async function capture(page:Page,label:string):Promise<AcceptedPageCapture>{
  const receiptPromise=context!.waitForEvent('response',{predicate:r=>r.url()===`${apiOrigin}/v1/browser/captures`&&r.request().method()==='POST'});
  await page.getByRole('button',{name:label,exact:true}).click();
  const response=await receiptPromise;
  if(response.status()!==202)throw new Error(`Captured-page ingress failed (HTTP ${response.status()}).`);
  return (await response.json()).data;
 }
 async function completed(receipt:AcceptedPageCapture):Promise<CaseDetail>{
  const deadline=Date.now()+Number(process.env.INVESTIGATION_TIMEOUT_MS||180000)+30000;
  let last='';
  while(Date.now()<deadline){
   const run=(await api(`/runs/${receipt.runId}`)).run;
   const evidence=(await api(`/cases/${receipt.caseId}`)).evidence.filter((e:any)=>e.runId===run.id);
   const status=JSON.stringify({runId:run.id,status:run.status,evidence:evidence.map(e=>e.kind)});if(status!==last){console.log(status);last=status;}
   if(!['queued','checking'].includes(run.status)){
    if(run.status==='failed'||run.status==='cancelled')throw new Error(`Real run ended ${run.status}: ${run.error?.code??'no error code'}.`);
    const detail:CaseDetail=await api(`/cases/${receipt.caseId}`);
    expect(detail.currentAssessment?.runId).toBe(run.id);expect(detail.sources.every(source=>source.kind==='browser')).toBe(true);
    expect(detail.evidence.some(e=>e.runId===run.id&&e.kind==='page_excerpt'&&e.excerpt&&e.inspection?.captureId===receipt.captureId)).toBe(true);
    expect(detail.evidence.some(e=>e.runId===run.id&&e.kind==='screenshot'&&e.artifactId&&e.inspection?.captureId===receipt.captureId)).toBe(true);
    const providerResponse=await fetch(`${process.env.SUPABASE_URL}/rest/v1/investigation_runs?owner_id=eq.${account.ownerId}&id=eq.${run.id}&select=sandbox_id,provider_session_id`,{headers:supabaseServiceHeaders(supabaseBackendKey()!)});
    if(!providerResponse.ok)throw new Error('Provider receipt lookup failed.');const provider=(await providerResponse.json())[0];expect(provider.sandbox_id).toBeTruthy();expect(provider.provider_session_id).toBeTruthy();
    const finding=detail.currentAssessment!.finding;expect(`${finding.headline} ${finding.consequence??''}`).not.toMatch(/\b(email|fraud|scam|discrepancy)\b/i);
    report.runs.push({receipt,run,assessment:detail.currentAssessment,evidence:evidence.map(e=>({id:e.id,kind:e.kind,excerpt:e.excerpt,artifactId:e.artifactId,contentHash:e.contentHash,inspection:e.inspection})),provider});
    return detail;
   }
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error('The persisted run did not reach a terminal state within its configured budget.');
 }
 stage='first-capture';const first=await capture(popup,'Check this page');report.caseId=first.caseId;await popup.close();
 const initial=await completed(first);pass('real Chrome capture creates a browser-only case, Daytona evidence and Claude assessment while popup is closed');
 stage='restore-popup';popup=await panel();
 await expect(popup.getByRole('heading',{name:'Checking captured content',exact:true})).not.toBeVisible({timeout:10000});
 await expect(popup.getByRole('status')).toHaveText('Captured page inspected in Daytona',{timeout:10000});
 await expect(popup.getByRole('button',{name:'Recheck this page',exact:true})).toBeEnabled();
 await popup.screenshot({path:`${directory}/completed-reopened.png`});pass('reopened extension reaches the actual saved terminal state');
 stage='changed-fee-recheck';await popup.close();await site.goto(`${fixtureOrigin}/fixtures/SC-01?monthlyFee=39`);popup=await panel();
 await expect(popup.getByRole('button',{name:'Recheck this page',exact:true})).toBeEnabled({timeout:10000});
 const second=await capture(popup,'Recheck this page');expect(second.caseId).toBe(first.caseId);await popup.close();
 const updated=await completed(second);expect(updated.currentAssessment!.version).toBe(initial.currentAssessment!.version+1);
 const currentPage=updated.evidence.find(e=>e.kind==='page_excerpt'&&e.runId===second.runId)!;expect(currentPage.excerpt).toContain('$39');
 expect((await api(`/cases/${first.caseId}/assessments`)).items).toHaveLength(2);
 expect((await api('/messages?source=gmail')).items).toHaveLength(0);
 const otherCase=JSON.parse(await readFile('.local/capture-checkpoint/fee-29.json','utf8')).caseId;
 const denied=await fetch(`${apiOrigin}/v1/cases/${otherCase}`,{headers:{Authorization:`Bearer ${token}`,Origin:webOrigin}});expect(denied.status).toBe(404);
 pass('changed-fee recheck preserves browser case identity, real evidence, history and ownership');
 }else{
  const previous=JSON.parse(await readFile(`${directory}/report.json`,'utf8'));expect(previous.ownerId).toBe(account.ownerId);Object.assign(report,previous);delete report.failure;report.passed=false;
 }
 stage='dashboard';const dashboard=await context.newPage();await dashboard.goto(`${webOrigin}/?case=${report.caseId}`);
 await dashboard.getByLabel('Email',{exact:true}).fill(account.email);await dashboard.getByLabel('Password',{exact:true}).fill(account.password);await dashboard.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(dashboard.getByRole('dialog',{name:'Case detail',exact:true})).toBeVisible({timeout:15000});
 await expect(dashboard.getByRole('heading',{name:'Message says',exact:true})).not.toBeVisible();
 await expect(dashboard.locator('.page-column blockquote')).toContainText('$39');
 await expect.poll(()=>dashboard.locator('.page-column .screenshot-preview img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(1280);
 await dashboard.screenshot({path:`${directory}/browser-case-desktop.png`});
 await dashboard.setViewportSize({width:390,height:844});expect(await dashboard.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await dashboard.screenshot({path:`${directory}/browser-case-mobile.png`});
 pass('actual authenticated dashboard renders browser-only evidence and private Daytona screenshot at desktop/mobile widths');
 report.passed=true;
}catch(error){
 if(currentPanel&&!currentPanel.isClosed()){
  await currentPanel.screenshot({path:`${directory}/failure.png`}).catch(()=>{});
  console.error('Extension visible state:',(await currentPanel.locator('body').innerText().catch(()=>'' )).slice(0,1800));
  const worker=context?.serviceWorkers()[0];if(worker)console.error('Grant diagnostic:',await worker.evaluate(async()=>({permissions:await(globalThis as any).chrome.permissions.getAll(),explicit:await(globalThis as any).chrome.storage.local.get('allowedSiteOrigins')})).catch(()=>({unavailable:true})));
 }
 let message=redactCaptureText(error instanceof Error?error.message:'Unknown checkpoint failure');for(const secret of [account?.password,supabaseBackendKey(),process.env.ANTHROPIC_API_KEY,process.env.DAYTONA_API_KEY].filter(Boolean) as string[])message=message.split(secret).join('[redacted]');report.failure=`${stage}: ${message.slice(0,700)}`;console.error(report.failure);process.exitCode=1;
}
finally{await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2),{mode:0o600});await context?.close();}
