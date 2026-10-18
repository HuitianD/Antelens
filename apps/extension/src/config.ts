declare const __APP_MODE__: string;
export const config = {
  mode: __APP_MODE__,
  apiOrigin: import.meta.env.VITE_API_ORIGIN || 'http://127.0.0.1:4000',
  webOrigin: import.meta.env.VITE_WEB_ORIGIN || 'http://127.0.0.1:3000',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  googleSignIn:import.meta.env.VITE_GOOGLE_SIGN_IN_ENABLED==='true',
  captureOrigin:import.meta.env.VITE_CAPTURE_ORIGIN||'http://127.0.0.1:4080',
  capturePath:import.meta.env.VITE_CAPTURE_PATH||'/fixtures/SC-01',
  supportedOrigins: (String(import.meta.env.VITE_SUPPORTED_ORIGINS || 'http://127.0.0.1:4000,http://localhost:4000')).split(',').map((value: string) => value.trim()).filter(Boolean),
};
export interface PageState { phase: 'waiting' | 'checking' | 'ready' | 'limited' | 'failed' | 'no_action'; message: string; sourceEventId?: string; caseId?: string; verdict?: string; finding?: string;captureId?:string;runId?:string;inspectedInDaytona?:boolean;ownerId?:string;pageUrl?:string;caseTitle?:string;association?:'standalone'|'linked_email' }
