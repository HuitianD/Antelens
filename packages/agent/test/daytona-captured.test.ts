import {createHash,randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import type {StoredPageCapture} from '@beforeyou/contracts';
const fake=vi.hoisted(()=>({create:vi.fn(),delete:vi.fn(),execute:vi.fn(),upload:vi.fn(),download:vi.fn()}));
vi.mock('@daytona/sdk',()=>({Daytona:class{create=fake.create;delete=fake.delete;}}));
import {DaytonaCapturedBrowser} from '../src/daytona-captured.js';
const config={factoryApiKey:'fixture',anthropicApiKey:'fixture',claudeModelId:'fixture',daytonaApiKey:'fixture',daytonaSnapshot:'fixture',allowedDomains:[]};
function capture():StoredPageCapture{
 const bundle={schemaVersion:'1' as const,pageUrl:'http://127.0.0.1:4080/fixtures/SC-01',title:'Rental',capturedAt:new Date().toISOString(),visibleText:'$40 fee and $29/month membership',blocks:[{kind:'paragraph' as const,text:'$40 fee and $29/month membership'}],fieldLabels:[],viewport:{width:1280,height:900}};
 return {id:randomUUID(),caseId:randomUUID(),sourceEventId:randomUUID(),installationId:randomUUID(),bundle,bundleHash:createHash('sha256').update(JSON.stringify(bundle)).digest('hex'),receivedAt:new Date().toISOString(),dataOrigin:'synthetic'};
}
describe('offline captured bundle adapter (mock SDK transport; not live verification)',()=>{
 it('rejects navigation and corrupt stored content before creating a sandbox',async()=>{
  fake.create.mockReset();const data=capture();const browser=new DaytonaCapturedBrowser(config,randomUUID(),data);
  await expect(browser.observe('https://unapproved.example')).rejects.toThrow('only its captured page');
  const corrupt=new DaytonaCapturedBrowser(config,randomUUID(),{...data,bundleHash:'0'.repeat(64)});
  await expect(corrupt.observe(data.bundle.pageUrl)).rejects.toThrow('hash');expect(fake.create).not.toHaveBeenCalled();
 });
 it('forces networkBlockAll, transfers bytes, rejects mismatched evidence and deletes exactly once',async()=>{
  const data=capture();fake.delete.mockReset().mockResolvedValue(undefined);fake.upload.mockReset().mockResolvedValue(undefined);fake.execute.mockReset().mockResolvedValue({exitCode:0});
  fake.download.mockImplementation(async(path:string)=>path.endsWith('.json')?Buffer.from(JSON.stringify({captureHash:'wrong',networkRequests:0})):Buffer.from([137,80,78,71,13,10,26,10]));
  fake.create.mockReset().mockResolvedValue({id:'mock-sandbox',fs:{createFolder:async()=>{},uploadFile:fake.upload,downloadFile:fake.download},process:{executeCommand:fake.execute}});
  const browser=new DaytonaCapturedBrowser(config,randomUUID(),data);
  await expect(browser.observe(data.bundle.pageUrl)).rejects.toThrow('did not match');
  expect(fake.create.mock.calls[0][0]).toMatchObject({networkBlockAll:true,snapshot:'fixture'});
  expect(fake.upload.mock.calls[0][0]).toEqual(Buffer.from(JSON.stringify(data.bundle)));
  expect(fake.execute.mock.calls[0][0]).not.toContain(data.bundle.pageUrl);
  await browser.close();await browser.close();expect(fake.delete).toHaveBeenCalledTimes(1);
 });
 it('cleans up provisioning that finishes after cancellation without executing content',async()=>{
  let ready!:(sandbox:unknown)=>void;fake.create.mockReset().mockImplementation(()=>new Promise(resolve=>{ready=resolve;}));fake.delete.mockReset().mockResolvedValue(undefined);fake.execute.mockReset();
  const data=capture(),browser=new DaytonaCapturedBrowser(config,randomUUID(),data);
  const rejected=expect(browser.observe(data.bundle.pageUrl)).rejects.toThrow('cancelled');
  const closed=browser.close();ready({id:'late-mock-sandbox'});await closed;await rejected;
  expect(fake.execute).not.toHaveBeenCalled();expect(fake.delete).toHaveBeenCalledTimes(1);
 });
});
