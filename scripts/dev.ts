import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const mode=process.argv[2];
if(mode!=='demo'&&mode!=='live')throw new Error('Select demo or live explicitly.');
await import('./load-env-local.js').then(m=>m.loadEnvLocal());
if(mode==='live'){
 const {validateLiveConfiguration}=await import('./runtime-config.js');
 validateLiveConfiguration();
}
const env={...process.env,APP_MODE:mode,NEXT_PUBLIC_APP_MODE:mode,WEB_ORIGIN:process.env.WEB_ORIGIN||'http://127.0.0.1:3000',API_ORIGIN:process.env.API_ORIGIN||'http://127.0.0.1:4000',NEXT_PUBLIC_API_ORIGIN:process.env.API_ORIGIN||'http://127.0.0.1:4000',DEMO_DATA_PATH:resolve('.local/demo-state.json')};
console.log(mode==='demo'?'Before You · Demo data · Synthetic sources and simulated investigations. Local state persists in .local/demo-state.json.':'Before You · Live mode · Real authentication and configured providers.');
console.log('Dashboard: http://127.0.0.1:3000');
const children=['api','worker','web'].map(name=>spawn('pnpm',['--filter',`@beforeyou/${name}`,'dev'],{env,stdio:'inherit'}));
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),300).unref()}
for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>{if(!stopping)stop(code||0)})}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
