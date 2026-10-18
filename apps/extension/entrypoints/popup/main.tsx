import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { verdictLabels, type Verdict } from '@beforeyou/contracts';
import { config, type PageState } from '../../src/config';
import './style.css';
function Panel() {
 const [tab,setTab]=useState<{id?:number;url?:string}>({});
 const [state,setState]=useState<PageState>({phase:'waiting',message:'Open the controlled rental page to check its captured content.'});
 const [allowed,setAllowed]=useState(false),[busy,setBusy]=useState(false),[signedIn,setSignedIn]=useState(config.mode==='demo'),[error,setError]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[caseId,setCaseId]=useState(''),[cases,setCases]=useState<{id:string;title:string}[]>([]);
 const origin=(()=>{try{return new URL(tab.url??'').origin;}catch{return '';}})();
 const supported=config.supportedOrigins.includes(origin);
 const captureSite=origin===config.captureOrigin&&new URL(tab.url??origin).pathname===config.capturePath;
 async function command(message:Record<string,unknown>){const r=await browser.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'The browser action could not complete.');return r;}
 async function loadCases(){try{const result=await command({type:'email_cases'});setCases(result.cases);}catch(e){setError((e as Error).message);}}
 async function refresh(id=tab.id){if(id===undefined)return;try{const r=await command({type:'refresh',tabId:id});setState(r.state);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void browser.runtime.sendMessage({type:'auth_status'}).then(r=>setSignedIn(Boolean(r.signedIn)));void browser.tabs.query({active:true,currentWindow:true}).then(async tabs=>{const active=tabs[0];if(!active)return;setTab(active);try{const site=new URL(active.url??'').origin;const saved=(await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins;setAllowed(Array.isArray(saved)&&saved.includes(site)&&await browser.permissions.contains({origins:[`${site}/*`]}));}catch{}await refresh(active.id);});},[]);
 useEffect(()=>{if(signedIn)void loadCases();},[signedIn]);
 useEffect(()=>{if(state.caseId&&cases.some(c=>c.id===state.caseId))setCaseId(state.caseId);},[state.caseId,cases]);
 useEffect(()=>{const timer=setInterval(()=>void refresh(),3000);return()=>clearInterval(timer);},[tab.id]);
 async function grant(){
  setError('');if(!supported||!signedIn)return;
  // Chrome requires permissions.request directly from the user's click, before any network await.
  const granted=await browser.permissions.request({origins:[`${origin}/*`]});
  if(!granted){setError('Site access was not granted.');return;}
  setBusy(true);
  try{if(captureSite)await command({type:'grant_site',origin,granted:true});const saved=(await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins;await browser.storage.local.set({allowedSiteOrigins:[...new Set([...(Array.isArray(saved)?saved:[]),origin])]});setAllowed(true);if(tab.id!==undefined)await browser.scripting.executeScript({target:{tabId:tab.id},files:['/content-scripts/observe.js']});}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function signIn(google=false){setBusy(true);setError('');try{await command(google?{type:'sign_in'}:{type:'sign_in',email,password});setSignedIn(true);await refresh();}catch(e){setError((e as Error).message);}finally{setPassword('');setBusy(false);}}
 async function checkPage(){if(!caseId||!allowed||!signedIn)return;setBusy(true);setError('');try{await command({type:'check_page',tabId:tab.id,caseId});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function removeGrant(){setError('');try{if(captureSite)await command({type:'grant_site',origin,granted:false});const saved=(await browser.storage.local.get('allowedSiteOrigins')).allowedSiteOrigins;await browser.storage.local.set({allowedSiteOrigins:(Array.isArray(saved)?saved:[]).filter(value=>value!==origin)});if(origin!==new URL(config.apiOrigin).origin)await browser.permissions.remove({origins:[`${origin}/*`]});setAllowed(false);}catch(e){setError((e as Error).message);}}
 return <main><header><span className="mark" aria-hidden="true">⌕</span><strong>Before You</strong></header>
  {config.mode==='demo'&&<p className="demo">Demo data · Local simulation</p>}
  {!signedIn&&config.mode==='live'?<section className="sign-in"><h1>Sign in to your workspace</h1><form onSubmit={e=>{e.preventDefault();void signIn();}}><label htmlFor="workspace-email">Email</label><input id="workspace-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/><label htmlFor="workspace-password">Password</label><input id="workspace-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><button disabled={busy||!config.supabaseUrl}>{busy?'Signing in…':'Sign in'}</button></form>{config.googleSignIn&&<button className="secondary" disabled={busy} onClick={()=>void signIn(true)}>Sign in with Google</button>}<p className="muted">Use the same application account that contains your rental email case.</p></section>:<>
   <p className="eyebrow">{origin.replace(/^https?:\/\//,'')||'This page'}</p><h1>{state.verdict?verdictLabels[state.verdict as Verdict]:state.phase==='checking'?'Checking captured content':'Page check'}</h1>
   {state.finding&&<p className="finding">{state.finding}</p>}<p className="muted" role="status">{state.message}</p>
   {!supported&&<p className="notice">This site is outside the supported-site list. No page content is collected.</p>}
   {supported&&!allowed&&<><p className="notice">Grant this controlled site before capturing visible content. Cookies, tokens, hidden content, entered values, and original scripts are excluded.</p><button disabled={busy} onClick={()=>void grant()}>Allow this site</button></>}
   {allowed&&<p className="permission">✓ Site access allowed</p>}
   {captureSite&&allowed&&<section className="capture-case"><label htmlFor="email-case">Associate with email case</label><select id="email-case" value={caseId} onChange={e=>setCaseId(e.target.value)}><option value="">Choose the rental email case</option>{cases.map(c=><option key={c.id} value={c.id}>{c.title.slice(0,150)} ({c.id.slice(0,6)})</option>)}</select>{!cases.length&&<p className="muted">No email cases are available for this account. <button className="link" onClick={()=>void loadCases()}>Reload cases</button></p>}<button disabled={busy||!caseId} title={!caseId?'Select the email case first.':undefined} onClick={()=>void checkPage()}>{busy?'Sending capture…':'Check this page'}</button><p className="muted">Daytona inspects an offline reconstruction of this captured content. The live website, unseen pages, and sender identity are not verified.</p></section>}
   {state.caseId&&<a className="primary" href={`${config.webOrigin}/?case=${state.caseId}`} target="_blank" rel="noreferrer">View case details <span>↗</span></a>}
   <div className="actions"><button className="secondary" disabled={busy} onClick={()=>void refresh()}>Refresh status</button>{config.mode==='live'&&<button className="secondary" onClick={async()=>{await command({type:'sign_out'});setSignedIn(false);setCases([]);setCaseId('');setState({phase:'waiting',message:'Sign in to check allowed sites.'});}}>Sign out</button>}</div>
  </>}
  {error&&<p role="alert" className="error">{error}</p>}
  <footer><a href={config.webOrigin} target="_blank" rel="noreferrer">Open dashboard ↗</a>{allowed&&signedIn&&<button className="link" onClick={()=>void removeGrant()}>Remove site access</button>}</footer>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Panel/>);
