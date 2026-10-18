import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { verdictLabels, type Verdict } from '@beforeyou/contracts';
import { config, type PageState } from '../../src/config';
import './style.css';
function Panel() {
  const [tab, setTab] = useState<{ id?: number; url?: string }>({});
  const [state, setState] = useState<PageState>({ phase: 'waiting', message: 'Loading this page…' });
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(config.mode === 'demo');
  const [error, setError] = useState('');
  const origin = (() => { try { return new URL(tab.url ?? '').origin; } catch { return ''; } })();
  const supported = config.supportedOrigins.includes(origin);
  async function refresh(id = tab.id) {
    if (id === undefined) return;
    const result = await browser.runtime.sendMessage({ type: 'refresh', tabId: id });
    if (result.ok) { setState(result.state); setError(''); } else setError(result.error);
  }
  useEffect(() => { void browser.runtime.sendMessage({ type: 'auth_status' }).then(result => setSignedIn(result.signedIn)); void browser.tabs.query({ active: true, currentWindow: true }).then(async tabs => { const active = tabs[0]; if (!active) return; setTab(active); try { const o = new URL(active.url ?? '').origin; const saved = (await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins; setAllowed(Array.isArray(saved) && saved.includes(o) && await browser.permissions.contains({ origins: [`${o}/*`] })); } catch { /* Unsupported browser page. */ } await refresh(active.id); }); }, []);
  useEffect(() => { const timer = setInterval(() => { void refresh(); }, 3000); return () => clearInterval(timer); }, [tab.id]);
  async function grant() {
    setError('');
    if (!supported) return;
    const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
    if (granted) { const saved = (await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins; await browser.storage.local.set({ allowedSiteOrigins: [...new Set([...(Array.isArray(saved) ? saved : []), origin])] }); }
    setAllowed(granted);
    if (granted && tab.id !== undefined) { await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content-scripts/observe.js'] }); await refresh(); }
  }
  async function retry() { setBusy(true); try { const result = await browser.runtime.sendMessage({ type: 'retry_check', tabId: tab.id }); if (!result.ok) throw new Error(result.error); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : 'The check could not restart.'); } finally { setBusy(false); } }
  async function signIn() { setBusy(true); setError(''); try { const result = await browser.runtime.sendMessage({ type: 'sign_in' }); if (!result.ok) throw new Error(result.error); setSignedIn(true); setState({ phase: 'waiting', message: 'Open an allowed page containing a consequential request.' }); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in could not complete.'); } finally { setBusy(false); } }
  return <main><header><span className="mark" aria-hidden="true">⌕</span><strong>Before You</strong></header>{config.mode === 'demo' && <p className="demo">Demo data · Local simulation</p>}<p className="eyebrow">THIS PAGE</p><h1>{state.verdict ? verdictLabels[state.verdict as Verdict] : state.phase === 'checking' ? 'Checking the request' : 'Page check'}</h1>{state.finding && <p className="finding">{state.finding}</p>}<p className="muted">{state.message}</p>{!supported && <p className="notice">This site is outside the supported-site list. No page content is collected.</p>}{supported && !allowed && <><p className="notice">Allow this site to automatically check visible payment, identity, permission, and download requests. Entered form values and cookies are excluded.</p><button onClick={() => void grant()}>Allow {origin.replace(/^https?:\/\//, '')}</button></>}{allowed && <p className="permission">✓ Site access allowed</p>}{state.caseId && <a className="primary" href={`${config.webOrigin}/?case=${state.caseId}`} target="_blank" rel="noreferrer">View case details <span>↗</span></a>}{config.mode === 'live' && !config.supabaseUrl && <p className="muted">Application sign-in is not configured.</p>}{error && <p role="alert" className="error">{error}</p>}<div className="actions"><button className="secondary" disabled={busy} onClick={() => void (state.phase === 'failed' ? retry() : refresh())}>{state.phase === 'failed' ? 'Retry check' : 'Refresh'}</button>{config.mode === 'live' && !signedIn && <button className="secondary" disabled={busy || !config.supabaseUrl} title={!config.supabaseUrl ? 'Application sign-in is not configured.' : undefined} onClick={() => void signIn()}>{busy ? 'Connecting…' : 'Sign in'}</button>}{config.mode === 'live' && signedIn && <button className="secondary" onClick={async () => { await browser.runtime.sendMessage({ type: 'sign_out' }); setSignedIn(false); setState({ phase: 'waiting', message: 'Sign in to check allowed sites.' }); }}>Sign out</button>}</div><footer><a href={config.webOrigin} target="_blank" rel="noreferrer">Open dashboard ↗</a>{allowed && <button className="link" onClick={async () => { const saved = (await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins; await browser.storage.local.set({ allowedSiteOrigins: (Array.isArray(saved) ? saved : []).filter(value => value !== origin) }); if (origin !== new URL(config.apiOrigin).origin) await browser.permissions.remove({ origins: [`${origin}/*`] }); setAllowed(false); }}>Remove site access</button>}</footer></main>;
}
createRoot(document.getElementById('root')!).render(<Panel />);
