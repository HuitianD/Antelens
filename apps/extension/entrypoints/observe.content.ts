import { browser } from 'wxt/browser';
export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'], registration: 'runtime',
  main(ctx) {
    let previous = ''; let timer: ReturnType<typeof setTimeout> | undefined;
    async function observe() {
      const container = document.querySelector('main,article,form') ?? document.body;
      if (!container) return;
      const texts: string[] = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const p = n.parentElement;
        if (!p || p.closest('input,textarea,select,script,style,noscript,[contenteditable],[hidden],[aria-hidden="true"]') || !p.getClientRects().length || getComputedStyle(p).visibility === 'hidden') continue;
        texts.push(n.textContent ?? '');
        if (texts.join(' ').length > 8000) break;
      }
      const visibleText = texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
      const kind = /install|executable|download|\.exe\b/i.test(visibleText) ? 'download' : /permission|access your|manage your|read and delete/i.test(visibleText) ? 'account_permission' : /passport|identity document|social security|upload.*id/i.test(visibleText) ? 'identity_submission' : /payment|pay\b|fee\b|\$\d|checkout/i.test(visibleText) ? 'payment' : null;
      if (!kind) return;
      const labelText = (element: Element) => { const clone = element.cloneNode(true) as Element; clone.querySelectorAll('input,textarea,select,[contenteditable],script,style').forEach(node => node.remove()); return (clone.textContent ?? '').trim().slice(0, 200); };
      const fieldLabels = [...container.querySelectorAll('label')].filter(el => el.getClientRects().length > 0).map(labelText).filter(Boolean).slice(0, 100);
      const request = { kind, visibleText, destinationUrl: null, fieldLabels, requestedPermissions: kind === 'account_permission' ? [...container.querySelectorAll('li')].map(labelText).filter(Boolean).slice(0, 100) : [] };
      const hash = JSON.stringify(request);
      if (hash === previous) return;
      const eventType = previous ? 'page_changed' : 'request_detected';
      previous = hash;
      await browser.runtime.sendMessage({ type: 'observation', payload: { clientEventId: crypto.randomUUID(), observedAt: new Date().toISOString(), pageUrl: location.origin + location.pathname, pageTitle: document.title.slice(0, 1000), eventType, request } }).then(result => { if (!result?.ok) previous = ''; }).catch(() => { previous = ''; });
    }
    const rescan = (message: { type?: string }) => { if (message.type === 'beforeyou:rescan') { previous = ''; void observe(); } };
    browser.runtime.onMessage.addListener(rescan);
    const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => void observe(), 1000); });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    void observe();
    ctx.onInvalidated(() => { browser.runtime.onMessage.removeListener(rescan); observer.disconnect(); clearTimeout(timer); });
  },
});
