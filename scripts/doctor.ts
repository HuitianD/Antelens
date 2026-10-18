import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {integrations,missing} from './runtime-config.js';
import {loadEnvLocal} from './load-env-local.js';
if(existsSync('.env.local'))loadEnvLocal('.env.local');
let blocked=false;
console.log('Before You diagnostics · secret values are never printed');
console.log(`Runtime: ${process.version}; required Node 24.22.0 LTS. Mode: ${process.env.APP_MODE||'demo (default)'}`);
if(Number(process.versions.node.split('.')[0])!==24){console.log('unavailable: select the pinned Node version in .nvmrc');blocked=true}
for(const [name,keys]of Object.entries(integrations)){const absent=missing(keys);if(absent.length){console.log(`${name}: missing_configuration — ${absent.join(', ')}. See docs/integrations.md.`);blocked=true}else console.log(`${name}: needs_authorization — configuration present; live provider probe is still required.`)}
const cli=spawnSync('pnpm',['--filter','@beforeyou/agent','exec','droid','--version'],{encoding:'utf8',timeout:5000});
console.log(`Droid CLI: ${cli.status===0?'installed; entitlement unverified':'unavailable — install the pinned CLI in the worker runtime'}`);
if(cli.status!==0)blocked=true;
for(const [name,url]of [['API','http://127.0.0.1:4000/health/live'],['Web','http://127.0.0.1:3000']]){try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});console.log(`${name}: ${r.ok?'ready':'unavailable'} (HTTP ${r.status})`);if(!r.ok)blocked=true}catch{console.log(`${name}: unavailable — local service is not running`);blocked=true}}
if(blocked){console.log('Live release: BLOCKED. Credential-free demo remains available with pnpm dev.');process.exitCode=2}
