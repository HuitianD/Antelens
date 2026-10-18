import { createClient } from '@supabase/supabase-js';
import { browser } from 'wxt/browser';
import { config } from './config';
let client:ReturnType<typeof createClient>|undefined;
export function authClient() {
  if (!config.supabaseUrl || !config.supabaseKey) throw new Error('Application sign-in is not configured.');
  return client??=createClient(config.supabaseUrl, config.supabaseKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: {
    async getItem(key) { const value = (await browser.storage.session.get(key))[key]; return typeof value === 'string' ? value : null; },
    async setItem(key, value) { await browser.storage.session.set({ [key]: value }); },
    async removeItem(key) { await browser.storage.session.remove(key); },
  } } });
}
export async function signIn() {
  const auth = authClient();
  const redirectTo = browser.identity.getRedirectURL('auth');
  const { data, error } = await auth.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) throw new Error('Sign-in could not start. Check the application connection.');
  const result = await browser.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  if (!result || !result.startsWith(redirectTo)) throw new Error('Sign-in was cancelled.');
  const code = new URL(result).searchParams.get('code');
  if (!code) throw new Error('Sign-in did not return an authorization code.');
  const session = await auth.auth.exchangeCodeForSession(code);
  if (session.error) throw new Error('Sign-in expired. Try again.');
}
export async function signInWithPassword(email:string,password:string){const result=await authClient().auth.signInWithPassword({email,password});if(result.error||!result.data.session)throw new Error('Sign-in could not complete. Check your workspace email and password.');}
export async function access() {
  if (config.mode === 'demo') return { owner: 'demo', token: '' };
  const { data, error } = await authClient().auth.getSession();
  if (error || !data.session) throw new Error('Sign in to Before You to connect this browser.');
  return { owner: data.session.user.id, token: data.session.access_token };
}
