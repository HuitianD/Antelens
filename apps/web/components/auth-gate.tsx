'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { auth, isDemo } from '../lib/api';
export function AuthGate({children}:{children:ReactNode}){
 const [ready,setReady]=useState(isDemo),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(isDemo)return;const client=auth();if(!client)return;void client.auth.getSession().then(({data})=>setReady(Boolean(data.session)));const sub=client.auth.onAuthStateChange((_event,session)=>setReady(Boolean(session)));return ()=>sub.data.subscription.unsubscribe()},[]);
 if(ready)return children;
 return <main className="auth-shell"><div className="auth-card"><span className="brand-mark"><Search/></span><h1>Ante<i>lens</i></h1><h2>Sign in to your workspace</h2>{!auth()?<p className="notice">Sign-in is not configured. Set the public Supabase URL and publishable key. Local fixture mode is available through <code>pnpm dev</code>.</p>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const result=await auth()!.auth.signInWithPassword({email,password});if(result.error)setError(result.error.message);setBusy(false)}}><label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<p role="alert">{error}</p>}<button className="primary-btn" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>}</div></main>
}
