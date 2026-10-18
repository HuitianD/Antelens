import { z } from 'zod';
import { DomainError } from '@beforeyou/fixtures';
const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
export interface ApiConfig {
    mode: 'demo' | 'live';
    host: string;
    port: number;
    webOrigin: string;
    apiOrigin: string;
    allowedOrigins: string[];
    supabaseUrl?: string;
    supabaseKey?: string;
    databaseUrl?: string;
}
export function loadConfig(env = process.env): ApiConfig {
    const mode = z.enum(['demo', 'live']).parse(env.APP_MODE ?? 'demo');
    const host = env.API_HOST ?? (mode === 'demo' ? '127.0.0.1' : '0.0.0.0');
    const port = z.coerce.number().int().min(1).max(65535).parse(env.API_PORT ?? env.PORT ?? 4000);
    const webOrigin = env.WEB_ORIGIN ?? 'http://127.0.0.1:3000', apiOrigin = env.API_ORIGIN ?? 'http://127.0.0.1:4000';
    if (mode === 'demo' && (env.NODE_ENV === 'production' || !loopback.has(host) || !loopback.has(new URL(webOrigin).hostname) || !loopback.has(new URL(apiOrigin).hostname)))
        throw new Error('Demo authentication is only available in an explicitly local development runtime.');
    if (mode === 'live') {
        const missing = ['SUPABASE_URL', 'DATABASE_URL'].filter(key => !env[key]);
        if(!(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY))missing.push('SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)');
        if (missing.length)
            throw new Error(`Live API blocked: missing ${missing.join(', ')}.`);
    }
    return { mode, host, port, webOrigin, apiOrigin, allowedOrigins: [webOrigin, apiOrigin, ...(mode === 'demo' ? ['http://127.0.0.1:3000', 'http://localhost:3000'] : []), ...(env.ALLOWED_EXTENSION_ORIGINS ?? '').split(',').filter(Boolean)], supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, databaseUrl: env.DATABASE_URL };
}
export function guardRequest(config: ApiConfig, headers: Record<string, unknown>, mutation: boolean) {
    const origin = typeof headers.origin === 'string' ? headers.origin : undefined;
    if (origin && !config.allowedOrigins.includes(origin))
        throw new DomainError('FORBIDDEN', 'This request origin is not allowed.', 403);
    if (config.mode === 'demo') {
        const host = String(headers.host ?? '').split(':')[0];
        if (!loopback.has(host))
            throw new DomainError('FORBIDDEN', 'Demo access requires a loopback host.', 403);
        // Non-browser clients may omit Origin. Browser cross-site navigation is rejected even when it omits Origin.
        if (mutation && headers['sec-fetch-site'] === 'cross-site')
            throw new DomainError('FORBIDDEN', 'Cross-site demo mutations are not allowed.', 403);
    }
}
