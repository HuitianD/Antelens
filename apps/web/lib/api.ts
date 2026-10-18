import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ActivityEventSchema, ApiResponseSchema } from '@beforeyou/contracts';
export const isDemo = process.env.NEXT_PUBLIC_APP_MODE === 'demo';
export const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || 'http://127.0.0.1:4000';
let authClient:SupabaseClient|null=null;
export function auth(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return null;
 return authClient??=createClient(url,key,{auth:{flowType:'pkce',autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
}
async function headers(){const h:Record<string,string>={};if(!isDemo){const s=await auth()?.auth.getSession();if(s?.data.session)h.Authorization=`Bearer ${s.data.session.access_token}`}return h}
export async function request<T>(path:string,schema:z.ZodType<T>,init:RequestInit={}){
 // The Google authorization start response sets a short-lived HttpOnly nonce.
 // Include credentials across the web/API ports so the callback can bind state
 // to this browser. API authentication still requires the Supabase bearer token.
 const r=await fetch(`${apiOrigin}/v1${path}`,{...init,credentials:'include',headers:{...await headers(),...(init.body?{'Content-Type':'application/json'}:{}),...init.headers},cache:'no-store'});
 const body=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(body?.error?.message||`Request could not complete (${r.status}).`);
 return ApiResponseSchema(schema).parse(body);
}
export function post<T>(path:string,schema:z.ZodType<T>,body:unknown){return request(path,schema,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)})}
export async function stream(cursor:string,onEvent:(event:z.infer<typeof ActivityEventSchema>)=>void,signal:AbortSignal,onConnected:()=>void){
 const response=await fetch(`${apiOrigin}/v1/events`,{headers:{...await headers(),Accept:'text/event-stream',...(cursor?{'Last-Event-ID':cursor}:{})},signal});
 if(!response.ok||!response.body)throw new Error('Updates are unavailable.');onConnected();
 const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';
 try{while(!signal.aborted){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');let at;
 while((at=pending.indexOf('\n\n'))>=0){const chunk=pending.slice(0,at);pending=pending.slice(at+2);const data=chunk.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n');if(data)onEvent(ActivityEventSchema.parse(JSON.parse(data)))}}
 }finally{reader.releaseLock()}
}
