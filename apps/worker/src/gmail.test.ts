import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PostgresRepository,encryptCredentials} from '@beforeyou/db';
import {extractMessage,gmailTestModeEnabled,pollGmail,subjectMatchesGmailTest} from './gmail.js';
import type {SourceEvent} from '@beforeyou/contracts';

test('multipart Gmail content is text-only and attachments are never executed or used as message text',()=>{
  const data=extractMessage({mimeType:'multipart/mixed',parts:[{mimeType:'text/plain',body:{data:Buffer.from('Application fee $40. https://fixture.example/application').toString('base64url')}},{mimeType:'text/html',body:{data:Buffer.from('<script>stealSecrets()</script><a href="https://fixture.example/application">Review</a>').toString('base64url')}},{mimeType:'application/x-executable',body:{data:Buffer.from('secret executable').toString('base64url')}}]});
  assert.equal(data.content,'Application fee $40. https://fixture.example/application');assert.deepEqual(data.links,['https://fixture.example/application']);assert(!data.content.includes('stealSecrets'));
});
async function syncFixture(failSecond=false){
 const previous={fetch:globalThis.fetch,key:process.env.CREDENTIAL_ENCRYPTION_KEY,id:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET,testMode:process.env.GMAIL_TEST_MODE};
 process.env.CREDENTIAL_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');process.env.GOOGLE_CLIENT_ID='test';process.env.GOOGLE_CLIENT_SECRET='test';
 delete process.env.GMAIL_TEST_MODE;
 const owner=randomUUID(),connectionId=randomUUID(),events:string[]=[],sources:SourceEvent[]=[],urls:string[]=[];
 const connection={id:connectionId,owner_id:owner,dto:{id:connectionId,kind:'gmail',status:'connected',accountLabel:'test@example.test',grantedScopes:[],lastSyncedAt:null,lastErrorCode:null},encrypted_credentials:encryptCredentials({refreshToken:'fixture-refresh'}),sync_cursor:'10',sync_config:{initialCutoff:'2026-01-01T00:00:00.000Z',initialCap:50,initialComplete:false,startingCheckpoint:'10'}};
 const client={query:async(sql:string,args?:unknown[])=>{if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};if(sql.includes('SET sync_cursor'))events.push(`checkpoint:${args?.[2]}`);if(sql.includes("SET status='needs_attention'"))events.push('needs_attention');return {rows:[],rowCount:1};},release:()=>{}};
 const fake={pool:{query:async()=>({rows:[connection]}),connect:async()=>client},ingestSource:async(_owner:string,source:SourceEvent)=>{events.push(`ingest:${source.externalId}`);if(failSecond&&source.externalId==='m2')throw new Error('Simulated durable write failure');sources.push(source);return {source,reused:false};},transaction:async(_owner:string,fn:(c:typeof client)=>Promise<unknown>)=>fn(client),emit:async()=>{}} as unknown as PostgresRepository;
 globalThis.fetch=async(input)=>{const url=String(input);urls.push(url);let body:unknown;if(url.includes('oauth2.googleapis'))body={access_token:'fixture-access'};else if(url.endsWith('/profile'))body={historyId:'11'};else if(url.includes('/messages?'))body={messages:[{id:'m1'}]};else if(url.includes('/history?'))body={historyId:'12',history:[{messagesAdded:[{message:{id:'m2'}}]}]};else if(url.includes('/messages/')){const id=url.includes('/m1?')?'m1':'m2';body={id,threadId:'thread1',internalDate:'1770000000000',labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'Subject',value:'Application'},{name:'From',value:'fixture@example.test'}],body:{data:Buffer.from('Application fee $40').toString('base64url')}}};}else throw new Error('Unexpected provider request');return new Response(JSON.stringify(body),{status:200});};
 try{await pollGmail(fake);return {events,sources,urls};}finally{globalThis.fetch=previous.fetch;for(const [name,value] of [['CREDENTIAL_ENCRYPTION_KEY',previous.key],['GOOGLE_CLIENT_ID',previous.id],['GOOGLE_CLIENT_SECRET',previous.secret],['GMAIL_TEST_MODE',previous.testMode]] as const){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
}
test('initial Gmail import captures checkpoint before listing and durably replays arrivals before advancing',async()=>{const {events,sources,urls}=await syncFixture();assert.deepEqual(events,['ingest:m1','ingest:m2','checkpoint:12']);assert.equal(sources.length,2);assert(sources.every(s=>s.disposition==='pending'&&s.processingStatus==='queued'));assert(urls.findIndex(u=>u.endsWith('/profile'))<urls.findIndex(u=>u.includes('/messages?')));assert(urls.some(u=>u.includes('maxResults=51')&&u.includes('includeSpamTrash=false')));});
test('a failed durable source write does not advance the Gmail history checkpoint',async()=>{const {events}=await syncFixture(true);assert(events.includes('needs_attention'));assert(!events.some(e=>e.startsWith('checkpoint:')));});
test('test mode keeps only [BY-TEST] subjects, including replies, and a second poll does not create another source',async()=>{
  assert.equal(gmailTestModeEnabled({GMAIL_TEST_MODE:'true'} as NodeJS.ProcessEnv),true);
  assert.equal(gmailTestModeEnabled({} as NodeJS.ProcessEnv),false);
  assert.equal(subjectMatchesGmailTest('Re: [BY-TEST] Application fee'),true);
  assert.equal(subjectMatchesGmailTest('Weekly newsletter'),false);
  const previous={fetch:globalThis.fetch,key:process.env.CREDENTIAL_ENCRYPTION_KEY,id:process.env.GOOGLE_CLIENT_ID,secret:process.env.GOOGLE_CLIENT_SECRET,testMode:process.env.GMAIL_TEST_MODE};
  process.env.CREDENTIAL_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');process.env.GOOGLE_CLIENT_ID='test';process.env.GOOGLE_CLIENT_SECRET='test';process.env.GMAIL_TEST_MODE='true';
  const owner=randomUUID(),connectionId=randomUUID();
  const stored=new Map<string,SourceEvent>(),created:string[]=[];
  const connection={id:connectionId,owner_id:owner,dto:{id:connectionId,kind:'gmail',status:'connected',accountLabel:'person@example.test',grantedScopes:[],lastSyncedAt:null,lastErrorCode:null},encrypted_credentials:encryptCredentials({refreshToken:'fixture-refresh'}),sync_cursor:'10',sync_config:{initialCutoff:'2026-01-01T00:00:00.000Z',initialCap:50,initialComplete:false,startingCheckpoint:'10'}};
  const client={query:async(sql:string)=>{if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};return {rows:[],rowCount:1};},release:()=>{}};
  const message=(id:string,subject:string)=>({id,threadId:'thread-1',internalDate:'1770000000000',labelIds:['INBOX'],snippet:subject,payload:{mimeType:'text/plain',headers:[{name:'Subject',value:subject},{name:'From',value:'person@example.test'}],body:{data:Buffer.from(`Body for ${subject}`).toString('base64url')}}});
  const subjects:Record<string,string>={'m-match':'[BY-TEST] Application fee','m-reply':'Re: [BY-TEST] Application fee','m-other':'Weekly newsletter'};
  globalThis.fetch=async(input)=>{const url=String(input);let body:unknown;if(url.includes('oauth2.googleapis'))body={access_token:'fixture-access'};else if(url.endsWith('/profile'))body={historyId:'11'};else if(url.includes('/messages?')){assert(decodeURIComponent(url).includes('subject:"[BY-TEST]"'));body={messages:[{id:'m-match'},{id:'m-other'}]};}else if(url.includes('/history?'))body={historyId:'12',history:[{messagesAdded:[{message:{id:'m-reply'}},{message:{id:'m-match'}}]}]};else if(url.includes('/messages/')){const id=Object.keys(subjects).find(item=>url.includes(`/messages/${item}?`));if(!id)throw new Error('Unexpected message');body=message(id,subjects[id]!);}else throw new Error('Unexpected provider request');return new Response(JSON.stringify(body),{status:200});};
  const fake={pool:{query:async()=>({rows:[connection]}),connect:async()=>client},ingestSource:async(_owner:string,source:SourceEvent)=>{const existing=stored.get(source.externalId);if(existing)return {source:existing,reused:true};stored.set(source.externalId,source);created.push(source.externalId);return {source,reused:false};},transaction:async(_owner:string,fn:(c:typeof client)=>Promise<unknown>)=>fn(client),emit:async()=>{}} as unknown as PostgresRepository;
  try{
    await pollGmail(fake);
    assert.deepEqual(created,['m-match','m-reply']);
    assert(!stored.has('m-other'));
    assert([...stored.values()].every(source=>source.dataOrigin==='user'&&source.processingStatus==='queued'));
    connection.sync_config.initialComplete=true;connection.sync_cursor='12';
    await pollGmail(fake);
    assert.deepEqual(created,['m-match','m-reply']);
    assert.equal(stored.size,2);
  }finally{globalThis.fetch=previous.fetch;for(const [name,value] of [['CREDENTIAL_ENCRYPTION_KEY',previous.key],['GOOGLE_CLIENT_ID',previous.id],['GOOGLE_CLIENT_SECRET',previous.secret],['GMAIL_TEST_MODE',previous.testMode]] as const){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
