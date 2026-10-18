import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pnpmCommand,stopChildTree} from './process-tools.js';
const mode=process.argv[2];
const capturedPage=process.argv.includes('--captured-page');
if(mode!=='demo'&&mode!=='live')throw new Error('Select demo or live explicitly.');
await import('./load-env-local.js').then(m=>m.loadEnvLocal());
if(mode==='live'){
 const {validateLiveConfiguration}=await import('./runtime-config.js');
 validateLiveConfiguration();
}
if(capturedPage){
 const required=['DAYTONA_API_KEY','DAYTONA_SNAPSHOT','FACTORY_API_KEY','ANTHROPIC_API_KEY','CLAUDE_MODEL_ID'];
 const missing=required.filter(key=>!process.env[key]);
 if(mode!=='live'||missing.length||process.env.CAPTURE_ALLOWED_ORIGIN!=='http://127.0.0.1:4080'){console.error('BLOCKED: captured-page demo requires live providers and CAPTURE_ALLOWED_ORIGIN=http://127.0.0.1:4080. No simulated fallback is available.');process.exit(2)}
}
const webOrigin=process.env.WEB_ORIGIN||'http://127.0.0.1:3000',apiOrigin=process.env.API_ORIGIN||'http://127.0.0.1:4000';
const env={...process.env,APP_MODE:mode,NEXT_PUBLIC_APP_MODE:mode,WEB_ORIGIN:webOrigin,API_ORIGIN:apiOrigin,NEXT_PUBLIC_API_ORIGIN:apiOrigin,PORT:process.env.PORT||new URL(webOrigin).port||'3000',API_PORT:process.env.API_PORT||new URL(apiOrigin).port||'4000',DEMO_DATA_PATH:resolve(process.env.DEMO_DATA_PATH||'.local/demo-state.json')};
console.log(mode==='demo'?'Before You · Demo data · Synthetic sources and simulated investigations. Local state persists in .local/demo-state.json.':'Before You · Live mode · Real authentication and configured providers.');
console.log(`Dashboard: ${webOrigin}`);
function launch(args:string[]){const command=pnpmCommand(args);return spawn(command.command,command.args,{env,stdio:'inherit',detached:process.platform!=='win32'})}
const children=['api','worker','web'].map(name=>launch(['--filter',`@beforeyou/${name}`,'dev']));
if(capturedPage){children.push(launch(['exec','tsx','scripts/fixture-host.ts']));console.log('Controlled capture page: http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29 · real offline Daytona inspection');}
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)if(child.pid)stopChildTree(child.pid);setTimeout(()=>process.exit(code),1000).unref()}
for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>{if(!stopping)stop(code||0)})}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
