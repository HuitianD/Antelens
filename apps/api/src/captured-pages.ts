import type { FastifyInstance, FastifyRequest } from 'fastify';
import { BrowserSiteGrantInputSchema, ConnectionSummarySchema, PageCaptureInputSchema, redactCaptureText } from '@beforeyou/contracts';
import type { PostgresRepository, RunConfiguration } from '@beforeyou/db';
import { DomainError } from '@beforeyou/fixtures';
import { CONTROLLED_CAPTURE_PATHS } from '@beforeyou/fixtures/capture-pages';

export function assertCaptureScope(pageUrl:string,env=process.env){
 const expected=env.CAPTURE_ALLOWED_ORIGIN;
 if(!expected)throw new DomainError('CONFIG_MISSING','The controlled capture site is not configured.',503);
 const url=new URL(pageUrl);
 // Exact controlled demo pages only; CAPTURE_ALLOWED_PATH can add one further configured path on the same origin.
 const allowed=new Set<string>([...CONTROLLED_CAPTURE_PATHS,...(env.CAPTURE_ALLOWED_PATH?[env.CAPTURE_ALLOWED_PATH]:[])]);
 if(url.origin!==expected||!allowed.has(url.pathname)||url.search||url.hash||url.username||url.password)throw new DomainError('TARGET_BLOCKED','Only the controlled demo pages can be captured.',403);
}
export function assertOfflineProviders(env=process.env){const missing=['DAYTONA_API_KEY','DAYTONA_SNAPSHOT','FACTORY_API_KEY','ANTHROPIC_API_KEY','CLAUDE_MODEL_ID'].filter(key=>!env[key]?.trim());if(missing.length)throw new DomainError('CONFIG_MISSING','Captured-page inspection requires configured Daytona and Claude providers. It cannot use a local fallback.',503);}

export function registerCapturedPages(app:FastifyInstance,repo:PostgresRepository,model:RunConfiguration){
 const owner=(r:FastifyRequest)=>(r as FastifyRequest&{ownerId:string}).ownerId;
 const ok=(r:FastifyRequest,data:unknown)=>({data,meta:{schemaVersion:'1',requestId:r.id}});
 app.post('/v1/browser/site-grants',async r=>{
  const input=BrowserSiteGrantInputSchema.parse(r.body);
  if(input.origin!==process.env.CAPTURE_ALLOWED_ORIGIN)throw new DomainError('TARGET_BLOCKED','This origin is outside the controlled capture site.',403);
  return repo.transaction(owner(r),async client=>{
   const found=await client.query("SELECT c.id,c.dto FROM browser_installations i JOIN connections c ON c.id=i.connection_id AND c.owner_id=i.owner_id WHERE i.owner_id=$1 AND i.id=$2 AND c.status='connected' FOR UPDATE OF c",[owner(r),input.installationId]);
   if(!found.rows[0])throw new DomainError('CONNECTION_REQUIRED','Register this browser before granting a site.',503);
   const connection=ConnectionSummarySchema.parse(found.rows[0].dto);
   connection.grantedScopes=input.granted?[...new Set([...connection.grantedScopes,input.origin])]:connection.grantedScopes.filter(value=>value!==input.origin);
   await client.query('UPDATE connections SET dto=$3,updated_at=now() WHERE owner_id=$1 AND id=$2',[owner(r),connection.id,connection]);
   await repo.emit(client,owner(r),{type:'connection.updated',caseId:null,sourceRevision:null,data:{connection}});
   return ok(r,{origin:input.origin,granted:input.granted});
  });
 });
 app.post('/v1/browser/captures',async(r,reply)=>{
  assertOfflineProviders();
  const input=PageCaptureInputSchema.parse(r.body);
  assertCaptureScope(input.bundle.pageUrl);
  if(Buffer.byteLength(JSON.stringify(input))>64000)throw new DomainError('VALIDATION_ERROR','The visible-page capture exceeds the supported size.');
  const texts=[input.bundle.title,input.bundle.visibleText,...input.bundle.fieldLabels,...input.bundle.blocks.map(b=>b.text)];
  if(texts.some(text=>redactCaptureText(text)!==text))throw new DomainError('VALIDATION_ERROR','The capture contained excluded token-like text. Recapture the controlled page.');
  if(input.bundle.blocks.some(block=>!input.bundle.visibleText.includes(block.text)&&!input.bundle.fieldLabels.includes(block.text)))throw new DomainError('VALIDATION_ERROR','The captured structure does not match its visible text.');
  return reply.status(202).send(ok(r,await repo.ingestCapturedPage(owner(r),input,model,'synthetic')));
 });
}
