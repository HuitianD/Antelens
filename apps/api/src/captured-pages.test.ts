import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PageCaptureInputSchema,redactCaptureText} from '@beforeyou/contracts';
import {assertCaptureScope,assertOfflineProviders} from './captured-pages.js';

test('offline capture ingress rejects unapproved pages, executable data and client provenance (offline)',()=>{
 const env={CAPTURE_ALLOWED_ORIGIN:'http://127.0.0.1:4080',CAPTURE_ALLOWED_PATH:'/fixtures/SC-01'};
 assert.doesNotThrow(()=>assertCaptureScope('http://127.0.0.1:4080/fixtures/SC-01',env));
 for(const url of ['https://unapproved.example/fixtures/SC-01','http://127.0.0.1:4080/fixtures/SC-02','http://127.0.0.1:4080/fixtures/SC-01?token=secret','http://user:secret@127.0.0.1:4080/fixtures/SC-01'])assert.throws(()=>assertCaptureScope(url,env));
 const input={clientCaptureId:randomUUID(),installationId:randomUUID(),caseId:randomUUID(),bundle:{schemaVersion:'1',pageUrl:'http://127.0.0.1:4080/fixtures/SC-01',title:'Controlled rental',capturedAt:new Date().toISOString(),visibleText:'Application fee $40. Membership $29/month.',blocks:[{kind:'paragraph',text:'Application fee $40. Membership $29/month.'}],fieldLabels:['Email'],viewport:{width:1280,height:900}}};
 assert.equal(PageCaptureInputSchema.safeParse(input).success,true);
 for(const extra of [{html:'<script>run()</script>'},{cookies:'session=secret'},{formValues:{email:'private@example.com'}},{ownerId:randomUUID()},{provenance:{execution:'live'}}])assert.equal(PageCaptureInputSchema.safeParse({...input,bundle:{...input.bundle,...extra}}).success,false);
 assert.equal(PageCaptureInputSchema.safeParse({...input,ownerId:randomUUID()}).success,false);
 assert.equal(PageCaptureInputSchema.safeParse({...input,bundle:{...input.bundle,pageUrl:input.bundle.pageUrl+'?code=private'}}).success,false);
});
test('captured inspection fails closed without real providers and removes visible token-like strings',()=>{
 assert.throws(()=>assertOfflineProviders({BROWSER_RUNTIME:'local_controlled'}),/cannot use a local fallback/);
 const text='Rental $29/month Bearer example-private-token eyJabcdefghij.abcdefghijk.abcdefghijk sk-ant-12345678901234567890 ?access_token=private-value';
 const redacted=redactCaptureText(text);
 assert.match(redacted,/Rental \$29\/month/);
 for(const secret of ['example-private-token','eyJabcdefghij','12345678901234567890','private-value'])assert.equal(redacted.includes(secret),false);
});
