import { browser } from 'wxt/browser';
import { BrowserEventInputSchema, BrowserInstallationSchema, CaseDetailSchema, MessageDetailSchema } from '@beforeyou/contracts';
import { access, authClient, signIn } from '../src/auth';
import { config, type PageState } from '../src/config';
export default defineBackground(() => {
  async function api(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const { token } = await access();
    const response = await fetch(`${config.apiOrigin}/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw new Error(response.status === 401 ? 'Your sign-in expired. Reconnect this browser.' : response.status === 403 ? 'This browser is not authorized. Check the allowed extension origin.' : 'The connection could not complete. Try again.');
    const result = await response.json(); return result.data ?? result;
  }
  async function installation() {
    const { owner } = await access();
    const saved = await browser.storage.local.get('clientInstallationId');
    const clientInstallationId = saved.clientInstallationId ?? crypto.randomUUID();
    await browser.storage.local.set({ clientInstallationId });
    const registration = BrowserInstallationSchema.parse(await api('/browser/installations', 'POST', { clientInstallationId, displayName: 'Chrome browser' }));
    await browser.storage.session.set({ signedInOwner: owner });
    return registration;
  }
  async function setState(tabId: number, state: PageState) { await browser.storage.session.set({ [`page:${tabId}`]: state }); }
  async function refresh(tabId: number) {
    const key = `page:${tabId}`;
    const state = (await browser.storage.session.get(key))[key] as PageState | undefined;
    if (!state?.sourceEventId) return state ?? { phase: 'waiting', message: 'Open an allowed page containing a consequential request.' };
    const source = MessageDetailSchema.parse(await api(`/messages/${state.sourceEventId}`));
    if (source.source.disposition === 'no_action') { const next: PageState = { ...state, phase: 'no_action', message: 'No consequential request was identified on this page.' }; await setState(tabId, next); return next; }
    if (source.source.processingStatus === 'failed') { const next: PageState = { ...state, phase: 'failed', message: 'The request could not be classified. Retry the check.' }; await setState(tabId, next); return next; }
    const caseId = source.caseIds[0];
    if (!caseId) return state;
    const detail = CaseDetailSchema.parse(await api(`/cases/${caseId}`));
    const assessment = detail.currentAssessment;
    const run = detail.case.latestRunStatus;
    const next: PageState = { ...state, caseId, phase: run === 'failed' ? 'failed' : run === 'limited' ? 'limited' : assessment ? 'ready' : 'checking', message: run === 'failed' ? 'The investigation could not complete.' : run === 'limited' ? 'Some requested steps could not be checked.' : assessment ? (detail.case.freshness === 'stale' ? 'Previous assessment · Rechecking' : 'Based on the observed steps') : 'Checking the accessible next steps…', verdict: assessment?.verdict, finding: assessment?.finding.headline };
    await setState(tabId, next); return next;
  }
  browser.runtime.onMessage.addListener((message, sender) => {
    return (async () => {
      if (message.type === 'observation') {
        const tabId = sender.tab?.id;
        if (tabId === undefined || !sender.url) throw new Error('Page observations require a browser tab.');
        const origin = new URL(sender.url).origin;
        const explicit = (await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins;
        if (!Array.isArray(explicit) || !explicit.includes(origin) || !config.supportedOrigins.includes(origin) || !await browser.permissions.contains({ origins: [`${origin}/*`] })) throw new Error('This site has not been allowed.');
        if (new URL(message.payload.pageUrl).origin !== origin) throw new Error('The observed page does not match the sending tab.');
        try {
          const registered = await installation();
          const payload = BrowserEventInputSchema.parse({ ...message.payload, installationId: registered.installationId });
          const accepted = await api('/browser/events', 'POST', payload) as { sourceEventId: string };
          if (!accepted.sourceEventId) throw new Error('The observation was not accepted.');
          await setState(tabId, { phase: 'checking', message: 'Checking the accessible next steps…', sourceEventId: accepted.sourceEventId });
          return { ok: true };
        } catch (error) { await setState(tabId, { phase: 'failed', message: error instanceof Error ? error.message : 'The observation could not be sent.' }); return { ok: false }; }
      }
      if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL(''))) throw new Error('This action is only available from the extension panel.');
      if (message.type === 'auth_status') { try { const identity = await access(); return { ok: true, signedIn: Boolean(identity.owner) }; } catch { return { ok: true, signedIn: false }; } }
      if (message.type === 'sign_in') { await signIn(); const stored = await browser.storage.session.get(null); await browser.storage.session.remove(Object.keys(stored).filter(key => key.startsWith('page:'))); await installation(); const tabs = await browser.tabs.query({}); for (const tab of tabs) if (tab.id !== undefined) await browser.tabs.sendMessage(tab.id, { type: 'beforeyou:rescan' }).catch(() => undefined); return { ok: true }; }
      if (message.type === 'sign_out') { if (config.mode !== 'demo') await authClient().auth.signOut(); await browser.storage.session.clear(); return { ok: true }; }
      if (message.type === 'retry_check') {
        const key = `page:${message.tabId}`;
        const state = (await browser.storage.session.get(key))[key] as PageState | undefined;
        if (state?.caseId) await api(`/cases/${state.caseId}/rechecks`, 'POST', { reason: 'user_recheck' });
        else await browser.tabs.sendMessage(message.tabId, { type: 'beforeyou:rescan' });
        return { ok: true };
      }
      if (message.type === 'refresh') return { ok: true, state: await refresh(message.tabId) };
      return { ok: false };
    })().catch(error => ({ ok: false, error: error instanceof Error ? error.message : 'The browser connection could not complete.' }));
  });
  browser.tabs.onRemoved.addListener(tabId => { void browser.storage.session.remove(`page:${tabId}`); });
  browser.tabs.onUpdated.addListener((tabId, info) => { if (info.url) void browser.storage.session.remove(`page:${tabId}`); });
  let reconciliation: Promise<void> = Promise.resolve();
  const scheduleReconciliation = () => { reconciliation = reconciliation.catch(() => undefined).then(reconcileScripts); return reconciliation; };
  browser.permissions.onRemoved.addListener(() => { void scheduleReconciliation(); });
  async function reconcileScripts() {
    const granted = await browser.permissions.getAll();
    const saved = (await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins;
    const explicit = Array.isArray(saved) ? saved : [];
    const matches = config.supportedOrigins.filter(origin => explicit.includes(origin)).map(origin => `${origin}/*`).filter(pattern => granted.origins?.includes(pattern));
    const current = await browser.scripting.getRegisteredContentScripts();
    if (current.some(script => script.id === 'beforeyou-observer')) await browser.scripting.unregisterContentScripts({ ids: ['beforeyou-observer'] });
    if (matches.length) await browser.scripting.registerContentScripts([{ id: 'beforeyou-observer', matches, js: ['/content-scripts/observe.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
  }
  browser.permissions.onAdded.addListener(() => { void scheduleReconciliation(); });
  browser.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.allowedSiteOrigins) void scheduleReconciliation(); });
  void scheduleReconciliation();
});
