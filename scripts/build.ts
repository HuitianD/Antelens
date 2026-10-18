import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {pnpmCommand} from './process-tools.js';
const explicitViteKeys=new Set(Object.keys(process.env).filter(key=>key.startsWith('VITE_')));
if(process.env.APP_MODE==='demo'||process.env.DEMO_AUTH_BYPASS==='true'){console.error('BLOCKED: production build rejects demo authentication. Unset APP_MODE=demo.');process.exit(2)}
// Public deployment settings may be supplied in the ignored local file. The
// normal development APP_MODE value is overridden; an explicit bypass is not.
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(process.env.DEMO_AUTH_BYPASS==='true'){console.error('BLOCKED: production build rejects a configured demo authentication bypass.');process.exit(2)}
const env={...process.env,APP_MODE:'live',NEXT_PUBLIC_APP_MODE:'live',NODE_ENV:'production'};
// WXT owns apps/extension/.env.local. Root-file VITE defaults must not overwrite that dedicated public configuration.
// Explicit deployment/CLI settings still win as Vite expects.
for(const key of Object.keys(env))if(key.startsWith('VITE_')&&!explicitViteKeys.has(key))delete (env as Record<string,string|undefined>)[key];
for(const args of [['-r','--if-present','typecheck'],['-r','--if-present','build']]){const command=pnpmCommand(args);const result=spawnSync(command.command,command.args,{env,stdio:'inherit'});if(result.error||result.status!==0){console.error('Production build did not finish successfully.');process.exit(result.status??1)}}
