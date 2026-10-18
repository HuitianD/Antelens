import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if((process.env.APP_MODE||'demo')!=='demo'){console.error('BLOCKED: use the controlled-fixture ingestion path for live test accounts; demo seed never writes live user data.');process.exit(2)}
const origin=process.env.API_ORIGIN||'http://127.0.0.1:4000';
try{const result=await fetch(`${origin}/v1/demo/seed`,{method:'POST',headers:{Origin:process.env.WEB_ORIGIN||'http://127.0.0.1:3000'}});if(!result.ok)throw new Error(`HTTP ${result.status}`);console.log('Synthetic development records seeded idempotently.')}catch(error){console.error('BLOCKED: start pnpm dev:demo before seeding. '+String(error));process.exitCode=2}
