import {chromium,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.local/browsers');
const extension=resolve('apps/extension/.output/chrome-mv3');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).host;
 expect(id).toBe('oonbnpicjomfiddbiaegfdpdjiofdccn');
 const page=await context.newPage();
 await page.goto(`chrome-extension://${id}/popup.html`);
 await expect(page.getByRole('heading',{name:'Sign in to your workspace'})).toBeVisible();
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
 await mkdir('.local/extension-review',{recursive:true});
 await page.setViewportSize({width:420,height:740});
 await page.screenshot({path:'.local/extension-review/sign-in.png',fullPage:true});
 const response=await fetch('http://127.0.0.1:4000/v1/browser/captures',{method:'OPTIONS',headers:{Origin:`chrome-extension://${id}`,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
 expect(response.headers.get('access-control-allow-origin')).toBe(`chrome-extension://${id}`);
 const denied=await fetch('http://127.0.0.1:4000/v1/browser/captures',{method:'POST',headers:{Origin:`chrome-extension://${id}`,'Content-Type':'application/json'},body:'{}'});
 expect(denied.status).toBe(401);
 console.log('PASS actual unpacked extension ID, sign-in controls, exact-origin API CORS, and unauthenticated capture rejection. No account session or site grant was simulated.');
}finally{await context.close();}
