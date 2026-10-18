import {test,expect} from '@playwright/test';
import {collectVisiblePage} from '../../apps/extension/src/capture';
import {redactCaptureText,PageBundleSchema} from '../../packages/contracts/src/index';
import {fixturePage,scenarios} from '../../fixtures/src/index';

test('extension collector captures rendered fees and labels while excluding scripts, hidden data and entered values',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1280,height:900},bypassCSP:true});
 const page=await context.newPage();
 try{
  // Controlled HTML only: this privacy test needs neither live services nor provider credentials.
  await page.route('http://127.0.0.1:4080/**',route=>route.fulfill({contentType:'text/html',body:fixturePage(scenarios['SC-01']!,Number(new URL(route.request().url()).searchParams.get('monthlyFee')??29))}));
  await page.goto('http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=29');
  await page.evaluate(()=>{
   const main=document.querySelector('main')!;
   const box=document.createElement('div');box.innerHTML='<label>Contact email<input value="entered-private-value@example.com"></label><textarea>entered-private-message</textarea><input type="hidden" value="hidden-secret"><p hidden>hidden-sensitive-data</p><p style="display:none">css-hidden-secret</p><p aria-hidden="true">aria-hidden-secret</p><p style="position:fixed;top:10000px">offscreen-secret</p><script type="application/json">original-script-secret</script><p>Bearer visible-private-token</p>';main.prepend(box);
  });
  const capture=async()=>PageBundleSchema.parse(await page.evaluate(({collector,redactor})=>{
   const collect=new Function('return ('+collector+')')();const redact=new Function('return ('+redactor+')')();return collect(document,window,redact);
  },{collector:collectVisiblePage.toString(),redactor:redactCaptureText.toString()}));
  const first=await capture();const serialized=JSON.stringify(first);
  expect(first.pageUrl).toBe('http://127.0.0.1:4080/fixtures/SC-01');
  expect(first.visibleText).toContain('$29');expect(first.fieldLabels).toContain('Contact email');
  for(const secret of ['entered-private','hidden-secret','hidden-sensitive','css-hidden','aria-hidden-secret','offscreen-secret','original-script-secret','visible-private-token'])expect(serialized).not.toContain(secret);
  await page.goto('http://127.0.0.1:4080/fixtures/SC-01?monthlyFee=39');
  const changed=await capture();expect(changed.visibleText).toContain('$39');expect(changed.visibleText).not.toContain('$29');
 }finally{await context.close();}
});
