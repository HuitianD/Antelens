import { fixturePage, scenarios } from './index.js';

/*
 * Controlled demo pages for the captured-page flow. Each page is self-contained HTML/CSS with no
 * external resources, every control is inert, and page text describes only the fictional site.
 * Expected evaluation directions live in docs/controlled-demo-pages.md, never in the pages.
 */

const NOTICE = 'Controlled demo scenario';

interface CapturePage { name: string; render: () => string }

function shell(title: string, css: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0}button:disabled,input:disabled{cursor:not-allowed}.demo-notice{display:inline-block;margin:0 0 18px;padding:3px 9px;border:1px solid currentColor;border-radius:999px;font:12px/1.5 system-ui,sans-serif;opacity:.75}${css}</style></head><body>${body}</body></html>`;
}
const notice = `<p class="demo-notice">${NOTICE}</p>`;

const receipt: CapturePage = {
  name: 'Bookstore order receipt',
  render: () => shell('Your receipt from Lantern Row Books', `
body{background:#efe9df;color:#2d2620;font:16px/1.6 Georgia,'Times New Roman',serif;padding:48px 16px}
main{max-width:560px;margin:auto;background:#fffdf8;border:1px solid #dcd2c2;padding:36px 40px;box-shadow:0 2px 0 #dcd2c2}
.mark{display:flex;align-items:center;gap:12px;margin-bottom:6px}.mark svg{flex:none}
h1{font-size:26px;margin:0;font-weight:normal;letter-spacing:.5px}
.meta{color:#6b5e50;font-size:14px;margin:0 0 24px}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{padding:9px 0;text-align:left;border-bottom:1px dashed #d6cbb9}td:last-child,th:last-child{text-align:right}
th{font-weight:normal;color:#6b5e50;font-size:13px;text-transform:none}
.total td{border-bottom:2px solid #2d2620;font-weight:bold;font-size:17px}
.status{margin-top:22px;padding:14px 16px;background:#f3eee4;border-left:3px solid #7a6a55;font-size:15px}
.status p{margin:4px 0}
footer{margin-top:26px;font-size:13px;color:#6b5e50;text-align:center}`,
  `<main>${notice}
<div class="mark"><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect x="3" y="5" width="12" height="24" rx="1" fill="#7a6a55"/><rect x="17" y="3" width="13" height="26" rx="1" fill="#b48a52"/><line x1="2" y1="31" x2="32" y2="31" stroke="#2d2620" stroke-width="2"/></svg><h1>Lantern Row Books</h1></div>
<p class="meta">Order receipt · Order LR-20481 · October 18, 2026</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>
<tr><td>A Field Guide to City Birds (paperback)</td><td>1</td><td>$11.00</td></tr>
<tr><td>Dot-grid notebook, A5</td><td>1</td><td>$6.00</td></tr>
<tr><td>Subtotal</td><td></td><td>$17.00</td></tr>
<tr><td>Sales tax</td><td></td><td>$1.50</td></tr>
<tr class="total"><td>Total paid</td><td></td><td>$18.50</td></tr>
<tr><td>Balance due</td><td></td><td>$0.00</td></tr>
</tbody></table>
<div class="status"><p>Payment status: Paid in full by card on October 18, 2026.</p><p>This was a one-time purchase. There is no subscription and nothing renews automatically.</p><p>Your order is complete. No further action is needed.</p></div>
<footer>Lantern Row Books · 112 Lantern Row · Thank you for shopping with us.</footer>
</main>`),
};

const reservation: CapturePage = {
  name: 'Reservation confirmation',
  render: () => shell('Complete your reservation — Fernhollow Stays', `
body{background:#f2f5f3;color:#1f2d27;font:15px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;margin:0}
header{background:#1f4d3b;color:#eaf3ee;padding:16px 28px;display:flex;align-items:center;gap:10px;font-weight:600;font-size:18px}
main{max-width:720px;margin:28px auto;padding:0 16px}
.card{background:#fff;border:1px solid #d5e0da;border-radius:12px;padding:24px 26px;margin-bottom:16px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:0 0 12px}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0 0}.summary div{background:#f6f9f7;border-radius:8px;padding:10px 12px}.summary span{display:block;font-size:12px;color:#5b6b63}
.pending{display:inline-block;background:#fdf1d8;color:#7a5410;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:600}
.uploads{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
.upload{border:2px dashed #b9cbc1;border-radius:10px;padding:22px 14px;text-align:center;background:#fbfdfc}
.upload label{display:block;font-weight:600;margin-bottom:8px}
button{background:#1f4d3b;color:#fff;border:0;border-radius:8px;padding:11px 18px;font:inherit;font-weight:600;opacity:.55}
@media(max-width:560px){.summary,.uploads{grid-template-columns:1fr}}`,
  `<header><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 20h18L12 2Z" fill="#9fd1b7"/><path d="M12 9 8 20h8l-4-11Z" fill="#eaf3ee"/></svg>Fernhollow Stays</header>
<main>${notice}
<section class="card"><h1>Complete your reservation</h1><p><span class="pending">Pending identity check</span> Your booking is held for 24 hours.</p>
<div class="summary"><div><span>Stay</span>Lakeside Cabin 4</div><div><span>Dates</span>Nov 14 – Nov 16, 2026</div><div><span>Total</span>$286.00</div></div></section>
<section class="card"><h2>Verify your identity</h2><p>To confirm your booking, upload photos of the front and the back of your driver's license.</p>
<div class="uploads"><div class="upload"><label for="license-front">Driver's license (front)</label><input id="license-front" type="file" disabled></div><div class="upload"><label for="license-back">Driver's license (back)</label><input id="license-back" type="file" disabled></div></div>
<button type="button" disabled>Upload and confirm booking</button></section>
</main>`),
};

const recovery: CapturePage = {
  name: 'Account support',
  render: () => shell('Restore access to your account — Quillmark Help Center', `
body{background:#f4f2fb;color:#221d38;font:15px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;margin:0}
header{background:#fff;border-bottom:1px solid #e1dcf2;padding:14px 28px;display:flex;align-items:center;gap:10px;font-weight:700;color:#4a37b5}
main{max-width:640px;margin:28px auto;padding:0 16px}
h1{font-size:24px;margin:0 0 8px}
.steps{background:#fff;border:1px solid #e1dcf2;border-radius:12px;padding:18px 22px;margin:16px 0}
.steps ol{margin:8px 0 0;padding-left:20px}.steps li{margin:6px 0}
.chat{background:#fff;border:1px solid #e1dcf2;border-radius:12px;overflow:hidden}
.chat-head{background:#4a37b5;color:#fff;padding:10px 16px;font-weight:600;font-size:14px}
.bubble{margin:14px 16px;max-width:80%;background:#efecfb;border-radius:12px 12px 12px 4px;padding:10px 14px}
.bubble strong{display:block;font-size:12px;color:#5d4fb0}
.reply{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #e1dcf2;align-items:flex-end}
.reply div{flex:1}.reply label{display:block;font-size:12px;color:#5f5a78;margin-bottom:4px}
input{width:100%;padding:9px 10px;border:1px solid #cfc8ea;border-radius:8px;font:inherit;background:#faf9fe}
button{background:#4a37b5;color:#fff;border:0;border-radius:8px;padding:10px 14px;font:inherit;font-weight:600;opacity:.55}`,
  `<header><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M4 18 16 3l2 2L6 20H4v-2Z" fill="#4a37b5"/></svg>Quillmark Help Center</header>
<main>${notice}
<h1>Restore access to your account</h1><p>Your account is temporarily locked. A support representative will restore access for you.</p>
<div class="steps"><strong>How to restore access</strong><ol><li>We sent a six-digit sign-in code to the phone number on your account.</li><li>Share that sign-in code with your support representative in the chat below.</li><li>Your representative will use the code to sign in and unlock your account.</li></ol></div>
<section class="chat" aria-label="Support chat"><div class="chat-head">Chat with support</div>
<div class="bubble"><strong>Jordan, Support Representative</strong>Hi! I can unlock your account right now. Please reply with the six-digit sign-in code you just received on your phone.</div>
<div class="reply"><div><label for="signin-code">Sign-in code for your representative</label><input id="signin-code" inputmode="numeric" autocomplete="off" disabled></div><button type="button" disabled>Send to representative</button></div></section>
</main>`),
};

const installer: CapturePage = {
  name: 'Interview next steps',
  render: () => shell('Technical assessment — Wrenfield Careers', `
body{background:#0f1720;color:#e4e9ef;font:15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;margin:0}
header{padding:18px 32px;border-bottom:1px solid #243140;display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.3px}
main{max-width:680px;margin:32px auto;padding:0 16px}
.demo-notice{color:#9fb3c8}
h1{font-size:26px;margin:0 0 6px}.sub{color:#9fb3c8;margin:0 0 22px}
.panel{background:#16212c;border:1px solid #243140;border-radius:12px;padding:22px 24px;margin-bottom:16px}
ol{padding-left:20px;margin:10px 0 0}li{margin:8px 0}
.file{display:flex;align-items:center;gap:12px;background:#0f1720;border:1px solid #2c3b4c;border-radius:10px;padding:12px 14px;margin-top:14px}
.file span{color:#9fb3c8;font-size:13px;display:block}
button{margin-left:auto;background:#3d8bfd;color:#fff;border:0;border-radius:8px;padding:10px 14px;font:inherit;font-weight:600;opacity:.55}`,
  `<header><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M2 5l4 12 5-9 5 9 4-12" fill="none" stroke="#3d8bfd" stroke-width="2.4" stroke-linejoin="round"/></svg>Wrenfield Careers</header>
<main>${notice}
<h1>Technical assessment</h1><p class="sub">Product Designer · Final interview · Thursday, October 22, 2026 at 10:00 AM</p>
<section class="panel"><strong>Before your interview</strong><ol>
<li>Download AssessmentLauncher.exe using the button below.</li>
<li>If your antivirus shows a warning, disable it before opening the file.</li>
<li>Right-click AssessmentLauncher.exe and choose Run as administrator.</li>
<li>Keep the launcher open for the full interview session.</li></ol>
<div class="file"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="5" y="3" width="18" height="22" rx="2" fill="none" stroke="#9fb3c8" stroke-width="1.6"/><path d="M14 9v8m-4-4 4 4 4-4" stroke="#9fb3c8" stroke-width="1.6" fill="none"/></svg><div>AssessmentLauncher.exe<span>Windows application · 48 MB</span></div><button type="button" disabled>Download</button></div></section>
<p class="sub">Questions about your interview? Reply to your recruiter's email.</p>
</main>`),
};

/** The rental page keeps its existing content and fee parameter; only the notice matches the other pages. */
export function rentalPage(monthlyFee = 29): string {
  return fixturePage(scenarios['SC-01']!, monthlyFee).replace('Controlled synthetic fixture · SC-01', NOTICE);
}

export const capturePages: Record<string, CapturePage> = { 'SC-10': receipt, 'SC-11': reservation, 'SC-12': recovery, 'SC-13': installer };

/** Exact paths the captured-page flow accepts. Query strings are stripped before capture. */
export const CONTROLLED_CAPTURE_PATHS = ['/fixtures/SC-01', ...Object.keys(capturePages).map(id => `/fixtures/${id}`)] as const;

export function scenarioIndexPage(): string {
  const links: [string, string][] = [
    ['/fixtures/SC-01?monthlyFee=29', 'Rental application'],
    ['/fixtures/SC-01?monthlyFee=39', 'Rental application (alternate fee)'],
    ...Object.entries(capturePages).map(([id, page]) => [`/fixtures/${id}`, page.name] as [string, string]),
  ];
  return shell('Demo scenarios', `body{font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;color:#1b1f26;background:#f5f6f8;padding:48px 16px}main{max-width:520px;margin:auto}h1{font-size:22px;margin:0 0 12px}ul{list-style:none;padding:0;margin:0;background:#fff;border:1px solid #e0e3e8;border-radius:10px}li+li{border-top:1px solid #e0e3e8}a{display:block;padding:12px 16px;color:#0b63d6;text-decoration:none}a:hover{background:#f3f6fb}`,
    `<main>${notice}<h1>Demo scenarios</h1><ul>${links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ul></main>`);
}
