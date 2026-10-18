import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {loadEnvLocal} from '../../../scripts/load-env-local.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {supabaseBackendKey,supabaseServiceHeaders} from '@beforeyou/db';

export interface CheckpointCheck {capability:string;status:'ready'|'blocked'|'failed';message:string}
export interface CheckpointReport {checks:CheckpointCheck[];exitCode:0|1|2}
interface DatabaseClient {query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;release():void}
interface DatabasePool {connect():Promise<DatabaseClient>;end():Promise<void>}
interface CheckpointOptions {setupPrivateBucket?:boolean;fetch?:typeof globalThis.fetch;poolFactory?:(connectionString:string)=>DatabasePool;expectedMigrations?:{hash:string;createdAt:number}[]}
const REQUIRED=['SUPABASE_URL','DATABASE_URL','SUPABASE_STORAGE_BUCKET','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const TABLES=['connections','source_events','cases','case_sources','investigation_runs','investigation_steps','artifacts','evidence','assessments','review_events','activity_events','outbox_events','browser_installations','oauth_states','idempotency_records','page_captures'];
function missing(value:string|undefined){return !value||value.includes('your-')||value.includes('<project');}
function role(key:string):string|undefined{try{return JSON.parse(Buffer.from(key.split('.')[1]??'','base64url').toString()).role as string|undefined;}catch{return undefined;}}
async function migrations(){const directory=new URL('../../../packages/db/migrations/',import.meta.url);const journal=JSON.parse(await readFile(new URL('meta/_journal.json',directory),'utf8')) as {entries:{tag:string;when:number}[]};return Promise.all(journal.entries.map(async entry=>({createdAt:entry.when,hash:createHash('sha256').update(await readFile(new URL(`${entry.tag}.sql`,directory),'utf8')).digest('hex')})));}

/** Read-only unless --setup-private-bucket was explicitly selected for live development. */
export async function checkSupabase(env:NodeJS.ProcessEnv,options:CheckpointOptions={}):Promise<CheckpointReport>{
 const checks:CheckpointCheck[]=[];
 const add=(capability:string,status:CheckpointCheck['status'],message:string)=>checks.push({capability,status,message});
 const absent=REQUIRED.filter(name=>missing(env[name]));
 const backendKey=supabaseBackendKey(env);
 if(missing(backendKey))absent.push('SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)');
 if(env.APP_MODE!=='live')add('Configuration','blocked','Set APP_MODE=live for the explicitly selected Supabase development project.');
 if(absent.length)add('Configuration','blocked',`Missing fields: ${absent.join(', ')}.`);
 if(options.setupPrivateBucket&&env.NODE_ENV==='production')add('Storage setup','blocked','Bucket setup is restricted to the designated development runtime. Run the read-only check in production.');
 if(checks.length)return {checks,exitCode:2};
 let origin:string;
 try{
  const url=new URL(env.SUPABASE_URL!);const publicUrl=new URL(env.NEXT_PUBLIC_SUPABASE_URL!);const database=new URL(env.DATABASE_URL!);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error();
  if(url.origin!==publicUrl.origin)throw new Error();
  if(!['postgres:','postgresql:'].includes(database.protocol)||!database.hostname)throw new Error();
  if(database.hostname.endsWith('.pooler.supabase.com')&&database.port==='6543'){add('Database','blocked','Use the direct or session-pool database connection; the transaction-pool port is unsuitable for the persistent worker.');return {checks,exitCode:2};}
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(env.SUPABASE_STORAGE_BUCKET!))throw new Error();
  if(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.startsWith('sb_secret_')||role(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)==='service_role'){add('Public configuration','blocked','A privileged key is configured in the browser-public field. Replace it with the project publishable or legacy anon key.');return {checks,exitCode:2};}
  if(role(backendKey!)==='anon'){add('Backend configuration','blocked','The backend field contains a legacy anon key. Use the project secret or service-role key.');return {checks,exitCode:2};}
  origin=url.origin;
 }catch{add('Configuration','blocked','Check URL formats, matching backend/public project URLs, and the evidence bucket name. Values are redacted.');return {checks,exitCode:2};}
 const fetcher=options.fetch??globalThis.fetch;
 const apiKey=backendKey!;
 const storageHeaders=supabaseServiceHeaders(apiKey);
 const pool=(options.poolFactory??(connectionString=>new Pool({connectionString,max:1,connectionTimeoutMillis:8000,statement_timeout:8000,query_timeout:10000})))(env.DATABASE_URL!);
 let databaseReady=false;
 const databaseCheck=async()=>{let client:DatabaseClient|undefined;try{
  client=await pool.connect();
  await client.query('BEGIN READ ONLY');
  const version=await client.query("SELECT current_setting('server_version_num')::int AS version, to_regclass('beforeyou_migrations.__drizzle_migrations') IS NOT NULL AS has_migrations");
  if(Number(version.rows[0]?.version)<130000){add('Database','failed','PostgreSQL 13 or newer is required by the pinned durable queue.');return;}
  add('Database','ready','A bounded read-only PostgreSQL query succeeded.');
  if(!version.rows[0]?.has_migrations){add('Migrations','blocked','Tracked schema is absent. The agent will run pnpm db:migrate against this selected project.');return;}
  const expected=options.expectedMigrations??await migrations();
  const applied=await client.query('SELECT hash,created_at FROM beforeyou_migrations.__drizzle_migrations');
  const unmatched=expected.filter(m=>!applied.rows.some(row=>Number(row.created_at)===m.createdAt&&row.hash===m.hash));
  if(unmatched.length){add('Migrations','blocked','The database migration registry does not match all tracked migration hashes. Apply missing migrations; never rewrite an applied migration.');return;}
  add('Migrations','ready',`All ${expected.length} tracked migration hashes match the database registry.`);
  const tables=await client.query("SELECT c.relname AS name,c.relrowsecurity AS rls,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_access,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[TABLES]);
  if(tables.rows.length!==TABLES.length||tables.rows.some(row=>!row.rls||row.anon_access||row.authenticated_access)){add('Ownership schema','failed','Expected private tables, RLS, or browser-role restrictions are missing. Do not connect user data until repaired.');return;}
  add('Ownership schema','ready',`${TABLES.length} application tables have RLS enabled and no direct anon/authenticated table privileges. Authenticated cross-user API tests remain a separate gate.`);
  databaseReady=true;
 }catch{add('Database','failed','Database connection or read-only verification failed. Check network reachability, database password, privileges, and the direct/session-pool connection. Raw errors are redacted.');}
 finally{if(client){await client.query('ROLLBACK').catch(()=>{});client.release();}await pool.end().catch(()=>{});}};
 const authCheck=async()=>{try{const response=await fetcher(`${origin}/auth/v1/settings`,{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},signal:AbortSignal.timeout(8000)});if(!response.ok){add('Supabase Auth',response.status===401||response.status===403?'blocked':'failed',response.status===401||response.status===403?'The public project key was rejected. Confirm the selected project and publishable key.':`Auth settings probe returned HTTP ${response.status}.`);return;}const body:unknown=await response.json();if(!body||typeof body!=='object'||!('external' in body)||typeof body.external!=='object')throw new Error();add('Supabase Auth','ready','Auth settings are reachable using the public project key. User sign-in and ownership isolation are not claimed by this probe.');}catch{add('Supabase Auth','failed','Auth reachability check failed or timed out. Check project availability and network access.');}};
 await Promise.all([databaseCheck(),authCheck()]);
 try{
  const bucketUrl=`${origin}/storage/v1/bucket/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET!)}`;
  let response=await fetcher(bucketUrl,{headers:storageHeaders,signal:AbortSignal.timeout(8000)});
  let body=await response.json().catch(()=>null) as {id?:string;public?:boolean;statusCode?:string|number}|null;
  const absent=response.status===404||String(body?.statusCode)==='404';
  if(absent&&options.setupPrivateBucket){
   if(!databaseReady||checks.some(c=>c.capability==='Supabase Auth'&&c.status!=='ready'))add('Private evidence bucket','blocked','Bucket creation is deferred until database migrations, ownership restrictions, and Auth checks pass.');
   else{const created=await fetcher(`${origin}/storage/v1/bucket`,{method:'POST',headers:{...storageHeaders,'Content-Type':'application/json'},body:JSON.stringify({id:env.SUPABASE_STORAGE_BUCKET,name:env.SUPABASE_STORAGE_BUCKET,public:false,file_size_limit:8*1024*1024,allowed_mime_types:['image/png','image/jpeg']}),signal:AbortSignal.timeout(8000)});if(!created.ok&&created.status!==409){add('Private evidence bucket','failed',`Private bucket creation was rejected (HTTP ${created.status}). No existing bucket was changed.`);}else{response=await fetcher(bucketUrl,{headers:storageHeaders,signal:AbortSignal.timeout(8000)});body=await response.json().catch(()=>null) as {id?:string;public?:boolean}|null;if(response.ok&&body?.id===env.SUPABASE_STORAGE_BUCKET&&body?.public===false)add('Private evidence bucket','ready','Private evidence bucket created and verified with an 8 MiB image limit.');else add('Private evidence bucket','failed','Bucket creation could not be verified as private.');}}
  }else if(absent)add('Private evidence bucket','blocked','The configured evidence bucket is absent. The agent can run check:supabase --setup-private-bucket after the read-only database/Auth checks pass.');
  else if(!response.ok)add('Private evidence bucket',response.status===401||response.status===403?'blocked':'failed',`Storage verification was rejected (HTTP ${response.status}). Confirm the backend secret/service-role key and project access.`);
  else if(body?.id!==env.SUPABASE_STORAGE_BUCKET||typeof body?.public!=='boolean')add('Private evidence bucket','failed','Storage returned an unexpected bucket response; no privacy claim can be made.');
  else if(body?.public)add('Private evidence bucket','failed','The evidence bucket is public. This verifier will not change an existing bucket; choose a private bucket before connecting user data.');
  else add('Private evidence bucket','ready','The configured evidence bucket exists and is private. No object was uploaded or signed.');
 }catch{add('Private evidence bucket','failed','Storage verification failed or timed out. Raw provider responses are redacted.');}
 return {checks,exitCode:checks.some(c=>c.status==='failed')?1:checks.some(c=>c.status==='blocked')?2:0};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const envPath=fileURLToPath(new URL('../../../.env.local',import.meta.url));
 if(existsSync(envPath))try{loadEnvLocal(envPath);}catch{console.error('BLOCKED: the ignored environment file could not be read.');process.exitCode=2;}
 if(!process.exitCode){const flags=process.argv.slice(2).filter(arg=>arg!=='--');if(flags.some(flag=>flag!=='--setup-private-bucket')){console.error('Usage: pnpm --filter @beforeyou/api check:supabase [--setup-private-bucket]');process.exitCode=2;}else{
  console.log('Supabase checkpoint · values and provider errors are redacted · read-only unless bucket setup is explicitly requested');
  try{const report=await checkSupabase(process.env,{setupPrivateBucket:flags.includes('--setup-private-bucket')});for(const check of report.checks)console.log(`${check.status}: ${check.capability} — ${check.message}`);process.exitCode=report.exitCode;}catch{console.error('FAILED: checkpoint could not complete; no raw configuration or provider response was printed.');process.exitCode=1;}
 }}
}
