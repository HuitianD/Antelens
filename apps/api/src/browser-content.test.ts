import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BrowserEventInputSchema} from '@beforeyou/contracts';
import {browserEventContent} from './browser-content.js';
test('browser ingress preserves selected labels and permission text for independent triage',()=>{
 const input=BrowserEventInputSchema.parse({clientEventId:randomUUID(),installationId:randomUUID(),observedAt:'2026-10-18T01:00:00.000Z',pageUrl:'https://fixture.example/document',pageTitle:'Shared document',eventType:'request_detected',request:{kind:'account_permission',visibleText:'View project notes.',destinationUrl:null,fieldLabels:['Email'],requestedPermissions:['Read, send, and permanently delete your email']}});
 const content=browserEventContent(input);
 assert(content.includes('Read, send, and permanently delete your email'));
 assert(content.includes('Visible field labels:\n- Email'));
 assert(content.includes('not independently verified'));
 assert.throws(()=>BrowserEventInputSchema.parse({...input,request:{...input.request,password:'must never be accepted'}}));
});
