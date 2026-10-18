import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Daytona, type Sandbox } from '@daytona/sdk';
import { loadEnvLocal } from '../../../scripts/load-env-local.js';

loadEnvLocal(fileURLToPath(new URL('../../../.env.local',import.meta.url)));
const required=['DAYTONA_API_KEY','DAYTONA_SNAPSHOT'].filter(key=>!process.env[key]);
if(required.length){console.error(`BLOCKED: missing ${required.join(', ')}. No sandbox created.`);process.exit(2);}
const directory=fileURLToPath(new URL('../../../.local/daytona-offline-probe/',import.meta.url));
await mkdir(directory,{recursive:true,mode:0o700});
const daytona=new Daytona({apiKey:process.env.DAYTONA_API_KEY!,requestTimeoutMs:30000});
const report:{startedAt:string;sandboxId?:string;stage:string;checks:unknown[];deleted:boolean;passed:boolean;failure?:string}={startedAt:new Date().toISOString(),stage:'create',checks:[],deleted:false,passed:false};
let sandbox:Sandbox|undefined;
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
try{
 console.log('Creating offline probe sandbox from the configured snapshot. No egress allowlist or proxy is added.');
 sandbox=await daytona.create({snapshot:process.env.DAYTONA_SNAPSHOT!,networkBlockAll:true,labels:{application:'beforeyou',purpose:'offline-page-probe'},autoStopInterval:5,autoDeleteInterval:10},{timeout:90});
 report.sandboxId=sandbox.id;report.checks.push({stage:'create',sandboxId:sandbox.id,networkBlockAll:sandbox.networkBlockAll});
 console.log(`Sandbox ready: ${sandbox.id}; networkBlockAll=${sandbox.networkBlockAll}`);
 report.stage='upload';
 const remote=`/tmp/beforeyou-${randomUUID()}`;
 await sandbox.fs.createFolder(remote,'700');
 await sandbox.fs.uploadFile(await readFile(new URL('../../../deployment/daytona/offline-browser.mjs',import.meta.url)),`${remote}/inspect.mjs`,30);
 for(const fee of [29,39]){
  const bundle=Buffer.from(JSON.stringify({schemaVersion:'1',title:'Controlled rental application',pageUrl:'http://127.0.0.1:4080/rental',blocks:[{kind:'heading',text:'Application charges'},{kind:'paragraph',text:'Application fee: $40.'},{kind:'paragraph',text:`Required tenant membership: $${fee} per month, renewing automatically until cancelled.`},{kind:'field_label',text:'Applicant name (value excluded)'},{kind:'paragraph',text:'Controlled synthetic fixture. No payment is available.'}]}));
  await sandbox.fs.uploadFile(bundle,`${remote}/bundle.json`,30);
  const roundtrip=await sandbox.fs.downloadFile(`${remote}/bundle.json`,30);
  if(hash(roundtrip)!==hash(bundle))throw new Error('Uploaded bundle hash did not survive SDK roundtrip.');
  report.stage=`render-${fee}`;
  const result=await sandbox.process.executeCommand(`node ${remote}/inspect.mjs ${remote}/bundle.json ${remote}/result`,'/opt/beforeyou',undefined,45);
  if(result.exitCode!==0){console.error('Renderer diagnostic:',result.result.slice(0,1400));throw new Error('Installed offline renderer failed.');}
  report.stage=`download-${fee}`;
  const observationBytes=await sandbox.fs.downloadFile(`${remote}/result.json`,30);
  const screenshot=await sandbox.fs.downloadFile(`${remote}/result.png`,30);
  const observation=JSON.parse(observationBytes.toString('utf8'));
  if(!observation.visibleText?.includes(`$${fee} per month`)||observation.networkRequests!==0||observation.captureHash!==hash(bundle)||observation.screenshotHash!==hash(screenshot)||!screenshot.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Downloaded evidence failed content, network, hash, or PNG checks.');
  await writeFile(`${directory}/fee-${fee}.json`,observationBytes,{mode:0o600});
  await writeFile(`${directory}/fee-${fee}.png`,screenshot,{mode:0o600});
  report.checks.push({stage:'inspect',fee,captureHash:observation.captureHash,screenshotHash:observation.screenshotHash,networkRequests:observation.networkRequests,browserVersion:observation.browserVersion,pngBytes:screenshot.length});
  console.log(`PASS: SDK upload/roundtrip, installed Chromium rendering, JSON/PNG download; membership $${fee}; external requests=0.`);
 }
 const checks=report.checks.filter((c:any)=>c.stage==='inspect') as {captureHash:string;screenshotHash:string}[];
 if(checks.length!==2||checks[0]!.captureHash===checks[1]!.captureHash||checks[0]!.screenshotHash===checks[1]!.screenshotHash)throw new Error('Changed fee did not change both captured evidence hashes.');
 report.passed=true;report.stage='complete';
}catch(error){report.failure=error instanceof Error?error.message.replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,250):'Unknown probe failure';console.error(`FAILED at ${report.stage}: ${report.failure}`);process.exitCode=1;}
finally{
 if(sandbox)try{await daytona.delete(sandbox,60,true);report.deleted=true;console.log('Probe sandbox deletion confirmed.');}catch{report.deleted=false;report.passed=false;console.error('Sandbox cleanup could not be confirmed.');process.exitCode=1;}
 await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2),{mode:0o600});
}
