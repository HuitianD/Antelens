import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const extension=resolve('apps/extension/.output/chrome-mv3');
const userDataDir=await mkdtemp(join(tmpdir(),'beforeyou-extension-review-'));
const context=await chromium.launchPersistentContext(userDataDir,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:390,height:660}});
try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).hostname;
  const page=await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.getByText('Page check',{exact:true}).waitFor();
  await page.getByText('Open an allowed page containing a consequential request.', { exact: true }).waitFor();
  if (await page.getByRole('alert').count()) throw new Error('The panel reported an unexpected error');
  await page.screenshot({path:'apps/extension/review/panel.png',fullPage:true});
  const hosts=await worker.evaluate(()=>chrome.runtime.getManifest().host_permissions);
  if(hosts.some(host=>host==='https://*/*'))throw new Error('Broad required site permission found');
  const scripts=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());
  if(scripts.length)throw new Error('Page observation was registered without user permission');
  console.log(JSON.stringify({extensionLoaded:true,panelRendered:true,requiredHosts:hosts,automaticScriptsBeforeGrant:scripts.length}));
}finally{await context.close();await rm(userDataDir,{recursive:true,force:true});}
