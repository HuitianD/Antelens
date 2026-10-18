import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Daytona, type Sandbox } from '@daytona/sdk';
import { CAPTURE_LABEL, CapturedInspectionSchema, StoredPageCaptureSchema, type StoredPageCapture } from '@beforeyou/contracts';
import { AgentError } from './policy.js';
import { ObservationSchema, type InvestigationBrowser, type Observation } from './observation.js';
import type { AgentConfig } from './types.js';

/** Offline file transfer only. No original URL is navigated, and no local browser fallback exists. */
export class DaytonaCapturedBrowser implements InvestigationBrowser {
 private readonly daytona:Daytona;
 private creation?:Promise<Sandbox>;
 private deletion?:Promise<void>;
 private closing=false;
 private observation?:Promise<Observation>;
 private readonly capture:StoredPageCapture;
 constructor(private config:AgentConfig,private runId:string,capture:StoredPageCapture,private onCreated?:(id:string)=>Promise<void>){this.capture=StoredPageCaptureSchema.parse(capture);this.daytona=new Daytona({apiKey:config.daytonaApiKey,requestTimeoutMs:30000});}
 async observe(url:string):Promise<Observation>{
  if(this.closing)throw new AgentError('INVESTIGATION_LIMITED','The captured-page inspection has ended.');
  if(url!==this.capture.bundle.pageUrl)throw new AgentError('TARGET_BLOCKED','This run can inspect only its captured page bundle. Live navigation is unavailable.');
  this.observation??=this.inspect();return this.observation;
 }
 private async inspect():Promise<Observation>{
  const bytes=Buffer.from(JSON.stringify(this.capture.bundle));
  if(createHash('sha256').update(bytes).digest('hex')!==this.capture.bundleHash)throw new AgentError('OUTPUT_INVALID','The stored page capture hash does not match its bundle.');
  this.creation=this.daytona.create({snapshot:this.config.daytonaSnapshot,networkBlockAll:true,labels:{application:'beforeyou',runId:this.runId,purpose:'captured-page'},autoStopInterval:5,autoDeleteInterval:10},{timeout:90});
  const sandbox=await this.creation;
  if(this.closing)throw new AgentError('INVESTIGATION_LIMITED','The captured-page inspection was cancelled.');
  await this.onCreated?.(sandbox.id);
  const remote=`/tmp/beforeyou-${randomUUID()}`;
  await sandbox.fs.createFolder(remote,'700');
  await sandbox.fs.uploadFile(bytes,`${remote}/bundle.json`,30);
  await sandbox.fs.uploadFile(await readFile(new URL('../../../deployment/daytona/offline-browser.mjs',import.meta.url)),`${remote}/inspect.mjs`,30);
  const rendered=await sandbox.process.executeCommand(`node ${remote}/inspect.mjs ${remote}/bundle.json ${remote}/result`,'/opt/beforeyou',undefined,45);
  if(rendered.exitCode!==0)throw new AgentError('PROVIDER_UNAVAILABLE','Daytona could not render the captured bundle with its installed browser. No fallback was used.');
  const result=JSON.parse((await sandbox.fs.downloadFile(`${remote}/result.json`,30)).toString('utf8'));
  const screenshot=await sandbox.fs.downloadFile(`${remote}/result.png`,30);
  if(result.captureHash!==this.capture.bundleHash||result.networkRequests!==0||result.screenshotHash!==createHash('sha256').update(screenshot).digest('hex')||!screenshot.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new AgentError('OUTPUT_INVALID','Daytona returned evidence that did not match the offline capture.');
  return ObservationSchema.parse({title:result.title,visibleText:result.visibleText,url:this.capture.bundle.pageUrl,status:0,anchors:[],fieldLabels:result.fieldLabels,scriptedPage:false,loginRequired:false,captcha:false,blockedRequests:false,screenshot:screenshot.toString('base64'),inspection:CapturedInspectionSchema.parse({method:'captured_page_daytona',label:CAPTURE_LABEL,captureId:this.capture.id,bundleHash:this.capture.bundleHash,sandboxId:sandbox.id,capturedAt:this.capture.bundle.capturedAt,inspectedAt:result.inspectedAt,networkRequests:0})});
 }
 async close(){this.closing=true;const sandbox=await this.creation?.catch(()=>undefined);if(sandbox){this.deletion??=this.daytona.delete(sandbox,60,true);await this.deletion;}}
}
