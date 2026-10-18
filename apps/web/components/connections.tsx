'use client';
import { useEffect,useState } from 'react';
import { z } from 'zod';
import { Globe2, Mail, Plug, RefreshCw } from 'lucide-react';
import { ConnectionSyncScopeSchema,SystemCapabilitiesSchema,type ConnectionSummary,type ConnectionSyncScope,type SystemCapabilities } from '@beforeyou/contracts';
import { isDemo,post,request } from '../lib/api';
import { time } from './presentation';
const statusNames={not_connected:'Not connected',connecting:'Connecting',connected:'Connected',needs_attention:'Reconnect required',disconnected:'Not connected'};
export function Connections({connections,onRefresh}:{connections:ConnectionSummary[];onRefresh:()=>void}){
 const [capabilities,setCapabilities]=useState<SystemCapabilities|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [scopes,setScopes]=useState<Record<string,ConnectionSyncScope>>({});
 useEffect(()=>{void request('/system/capabilities',SystemCapabilitiesSchema).then(r=>setCapabilities(r.data)).catch(e=>setError(e.message))},[]);
 useEffect(()=>{let active=true;void Promise.all(connections.filter(c=>c.kind==='gmail').map(async c=>[c.id,(await request(`/connections/${c.id}/scope`,ConnectionSyncScopeSchema)).data] as const)).then(values=>{if(active)setScopes(Object.fromEntries(values))}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[connections]);
 async function action(id:string,kind:'gmail'|'browser',disconnect=false){setBusy(id);setError('');try{if(disconnect)await request(`/connections/${id}`,z.unknown(),{method:'DELETE'});else if(isDemo)await post(`/demo/connections/${id}/reconnect`,z.unknown(),{});else if(kind==='gmail'){const r=await post('/connections/gmail/start',z.object({authorizationUrl:z.string().url(),expiresAt:z.string()}),{returnTo:'/connections'});window.location.assign(r.data.authorizationUrl)}onRefresh()}catch(e){setError((e as Error).message)}finally{setBusy('')}}
 return <div className="connections-page">{error&&<p role="alert" className="notice error">{error}</p>}{isDemo&&<p className="notice"><Plug size={16}/>Demo adapters only. Your mailbox and browser are not connected.</p>}
 {(['gmail','browser'] as const).map(kind=>{const c=connections.find(c=>c.kind===kind);const connected=c?.status==='connected';return <section className="connection-card" key={kind}><div className="connection-heading"><span className="connection-icon">{kind==='gmail'?<Mail/>:<Globe2/>}</span><div><h2>{kind==='gmail'?'Gmail':'Chrome extension'}</h2><p>{c?.accountLabel||'No account connected'}</p></div><span className={`status-chip ${connected?'ready':''}`}>{isDemo?'Demo source · ':''}{c?statusNames[c.status]:'Not connected'}</span></div>
 <p>{kind==='gmail'?'Initial import: up to 50 recent messages from the last 7 days, excluding Spam and Trash. New messages are checked in the background.':'Only supported sites with explicit permission are observed. The extension sends relevant visible request text and field labels; it excludes entered form values and cookies.'}</p>
 {kind==='gmail'&&<p className="scope">Google’s read-only Gmail permission covers your mailbox. The initial import limit is an application processing limit, not a narrower Google permission.</p>}
 {c&&scopes[c.id]?.excludedByCap&&<p className="notice">The initial import reached its 50-message limit. Older messages were not investigated.</p>}
 {c&&scopes[c.id]?.coverageGap&&<p className="notice">Some earlier mailbox changes could not be recovered. The most recent messages were synchronized; coverage of the gap is incomplete.</p>}
 <dl className="connection-details"><div><dt>Last successful sync</dt><dd>{c?.lastSyncedAt?time(c.lastSyncedAt):'No sync recorded'}</dd></div><div><dt>Access</dt><dd>{kind==='gmail'?'Read only · No sending':'Explicit site grants'}</dd></div></dl>
 {c?.lastErrorCode&&<p className="notice error">{c.lastErrorCode==='CONNECTION_EXPIRED'?'Your authorization has expired. Reconnect to continue.':'The source needs attention. Reconnect or retry the connection.'}</p>}
 <div className="button-row">{connected?<button className="soft-btn" disabled={busy===c.id} onClick={()=>void action(c.id,kind,true)}>{busy===c.id?'Disconnecting…':isDemo?'Disconnect demo source':'Disconnect'}</button>:kind==='gmail'||isDemo?<button className="primary-btn" disabled={Boolean(busy)} onClick={()=>void action(c?.id||'gmail',kind)}><RefreshCw size={14}/>{busy?'Connecting…':isDemo?'Reconnect demo source':c?.status==='needs_attention'?'Reconnect Gmail':'Connect Gmail'}</button>:<p className="muted">Install the built Chrome extension, then sign in and grant a supported site from its panel.</p>}</div>
 </section>})}
 <section className="connection-card"><h2>Integration readiness</h2><div className="capabilities">{capabilities?.capabilities.map(c=><div key={c.provider}><strong>{c.provider}</strong><span className="tag">{c.status.replaceAll('_',' ')}</span><p>{c.reason}</p></div>)||<p>Loading capability status…</p>}</div></section>
 </div>
}
