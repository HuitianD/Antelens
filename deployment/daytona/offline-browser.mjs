// Reviewed renderer for inert captured-page data. No captured scripts or model-generated code run here.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = await import('/opt/beforeyou/node_modules/playwright/index.mjs');
const [bundlePath, outputPath] = process.argv.slice(2);
if (!/^\/tmp\/beforeyou-[a-z0-9-]+\/bundle\.json$/.test(bundlePath ?? '') || !/^\/tmp\/beforeyou-[a-z0-9-]+\/result$/.test(outputPath ?? '')) throw new Error('Invalid renderer paths.');
const bytes = await readFile(bundlePath);
if (bytes.length > 64000) throw new Error('Capture bundle exceeds the renderer limit.');
const bundle = JSON.parse(bytes.toString('utf8'));
const kinds = new Set(['heading', 'paragraph', 'list_item', 'field_label', 'table_row']);
if (bundle.schemaVersion !== '1' || typeof bundle.title !== 'string' || bundle.title.length > 300 || !Array.isArray(bundle.blocks) || bundle.blocks.length > 160 || bundle.blocks.some(b => !kinds.has(b.kind) || typeof b.text !== 'string' || b.text.length > 2000)) throw new Error('Invalid inert capture bundle.');
const escaped = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${escaped(bundle.title)}</title><style>*{box-sizing:border-box}body{margin:0;padding:38px;background:#e9edf1;color:#293643;font:17px/1.7 Arial,sans-serif}header{font-size:12px;color:#526d83;margin:0 0 20px}main{max-width:1000px;background:#f9fbfc;border:1px solid #d2dee8;border-radius:14px;padding:32px}h1{font:34px/1.2 Georgia,serif;margin:0 0 26px}h2{font-size:22px;margin:23px 0 13px}p{margin:14px 0;white-space:pre-wrap;overflow-wrap:anywhere}.field{padding:9px 12px;border:1px solid #c7d6e4;border-radius:6px;font-size:14px;color:#526d83}.row{border-bottom:1px solid #dce3e9;padding:12px 0}footer{font-size:12px;color:#607184;margin-top:20px}</style></head><body><header>Captured page inspected in Daytona</header><main><h1>${escaped(bundle.title)}</h1>${bundle.blocks.map(b => b.kind === 'heading' ? `<h2>${escaped(b.text)}</h2>` : `<p class="${b.kind === 'field_label' ? 'field' : b.kind === 'table_row' ? 'row' : ''}">${escaped(b.text)}</p>`).join('')}</main><footer>Offline reconstruction of captured visible content. No live website, unseen steps, or sender verification.</footer></body></html>`;
const browser = await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
try {
  const context = await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',acceptDownloads:false,viewport:{width:1280,height:900}});
  let networkRequests = 0;
  await context.route('**/*', route => {networkRequests++; return route.abort('blockedbyclient');});
  const page = await context.newPage();
  await page.setContent(html,{waitUntil:'domcontentloaded',timeout:15000});
  const observed = await page.locator('main').innerText();
  const fieldLabels = await page.locator('.field').allTextContents();
  const screenshot = await page.screenshot({type:'png',fullPage:false});
  await writeFile(`${outputPath}.png`,screenshot);
  await writeFile(`${outputPath}.json`,JSON.stringify({schemaVersion:'1',inspectionMode:'captured_page_daytona',label:'Captured page inspected in Daytona',captureHash:createHash('sha256').update(bytes).digest('hex'),title:bundle.title,visibleText:observed,fieldLabels,networkRequests,screenshotHash:createHash('sha256').update(screenshot).digest('hex'),browserVersion:browser.version(),inspectedAt:new Date().toISOString()}));
  console.log(JSON.stringify({ok:true,networkRequests}));
} finally {await browser.close();}
