// Static, reviewed browser program. No model-generated code is executed.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
// The Daytona image resolves the installed package. The local controlled-fixture runtime passes its own copy as a file URL.
const playwright = await import(process.env.BEFOREYOU_PLAYWRIGHT_MODULE || 'playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
if (!chromium) throw new Error('Playwright chromium is unavailable in this runtime.');
const input = JSON.parse(Buffer.from(process.argv[2], 'base64url').toString('utf8'));
const extraHTTPHeaders = Object.fromEntries(Object.entries(input.headers ?? {}).filter(([k, v]) => /^[a-z0-9-]+$/i.test(k) && typeof v === 'string' && v.length <= 200));
const blockedWords = /(?:^|[\/_.?&=\-])(?:submit|send|transfer|enroll|cancel|update|login|signin|logout|signout|invite|invitation|confirm|unsubscribe|reset|resetpassword|magic|magiclink|accept|approve|grant|authorize|authorization|oauth|purchase|delete|activate|verify-email)(?:$|[\/_.?&=\-])/i;
const sensitiveParams = /^(?:action|do|cmd|command|operation|intent|token|access_token|refresh_token|auth|code|otp|password|secret|signature|sig|key|session)$/i;
function permitted(raw) {
  const u = new URL(raw);
  return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && input.domains.includes(u.hostname) && !blockedWords.test(u.pathname + u.search) && ![...u.searchParams.keys()].some(k => sensitiveParams.test(k)) && !/\.(exe|dmg|pkg|msi|bat|cmd|sh|ps1|crx|app|deb|rpm)$/i.test(u.pathname);
}
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block', javaScriptEnabled: false, viewport: { width: 1280, height: 900 }, extraHTTPHeaders });
  let blocked = false;
  await context.route('**/*', async route => {
    const request = route.request();
    try {
      const u = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method()) || !permitted(request.url())) { blocked = true; return route.abort('blockedbyclient'); }
      const records = await lookup(u.hostname, { all: true, family: 4 });
      if (!records.length || records.some(r => isIP(r.address) !== 4 || !input.addresses.includes(r.address))) { blocked = true; return route.abort('blockedbyclient'); }
      return route.continue();
    } catch { blocked = true; return route.abort('blockedbyclient'); }
  });
  const page = await context.newPage();
  page.on('download', download => { void download.cancel(); });
  page.on('dialog', dialog => { void dialog.dismiss(); });
  page.on('popup', popup => { void popup.close(); });
  const response = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  if (!permitted(page.url())) throw new Error('TARGET_BLOCKED');
  // Observe text and labels only. Never return values or user-entered content.
  const observation = await page.evaluate(() => {
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,input,textarea,select,[contenteditable],[hidden],[aria-hidden="true"]') || !parent.getClientRects().length || getComputedStyle(parent).visibility === 'hidden') continue;
      texts.push(node.textContent || '');
      if (texts.join(' ').length > 16000) break;
    }
    const visibleText = texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 16000);
    const anchors = [...document.querySelectorAll('a[href]')].filter(e => e.getClientRects().length > 0).slice(0, 80).map((e, i) => ({ id: `link-${i}`, text: (e.textContent || '').trim().slice(0, 160), href: e.href }));
    const fieldLabels = [...document.querySelectorAll('label')].filter(e => e.getClientRects().length > 0).map(e => (e.textContent || '').trim().slice(0, 160)).slice(0, 100);
    const loginRequired = [...document.querySelectorAll('input')].some(e => e.type === 'password');
    const captcha = Boolean(document.querySelector('[class*="captcha"],iframe[src*="captcha"]'));
    const scriptedPage = Boolean(document.querySelector('script[src],script:not([type]),script[type="module"]'));
    return { title: document.title.slice(0, 300), visibleText, anchors, fieldLabels, loginRequired, captcha, scriptedPage };
  });
  // Mask all entry fields and editable elements, including defaults.
  const screenshot = await page.screenshot({ type: 'png', fullPage: false, mask: [page.locator('input,textarea,select,[contenteditable]')] });
  console.log(JSON.stringify({ ...observation, url: page.url(), status: response?.status() ?? 0, blockedRequests: blocked, screenshot: screenshot.toString('base64') }));
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof Error && error.message.includes('TARGET_BLOCKED') ? 'TARGET_BLOCKED' : 'SITE_UNREACHABLE' }));
  process.exitCode = 1;
} finally { await browser.close(); }
