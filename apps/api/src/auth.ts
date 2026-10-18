import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { ApiConfig } from './config.js';
import { DomainError, DEMO_OWNER } from '@beforeyou/fixtures';
const verifiers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function authenticate(config: ApiConfig, authorization: string | undefined): Promise<{
    ownerId: string;
    expiresAt: number;
}> {
    if (config.mode === 'demo')
        return { ownerId: DEMO_OWNER, expiresAt: Date.now() + 3600000 };
    if (!authorization?.startsWith('Bearer '))
        throw new DomainError('AUTH_REQUIRED', 'Sign in to continue.', 401);
    const token = authorization.slice(7);
    const issuer = `${config.supabaseUrl}/auth/v1`;
    try {
        let jwks = verifiers.get(issuer);
        if (!jwks) {
            jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 5000 });
            verifiers.set(issuer, jwks);
        }
        const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'], requiredClaims: ['sub', 'exp', 'iat'] });
        if (!payload.sub)
            throw new Error('Missing owner');
        return { ownerId: payload.sub, expiresAt: (payload.exp ?? 0) * 1000 };
    }
    catch {
        // Supabase Auth validates legacy HMAC tokens and revocation without exposing the signing secret.
        const response = await fetch(`${issuer}/user`, { headers: { Authorization: `Bearer ${token}`, apikey: config.supabaseKey! }, signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (!response)
            throw new DomainError('PROVIDER_UNAVAILABLE', 'Sign-in verification is temporarily unavailable.', 503);
        if (!response.ok)
            throw new DomainError('AUTH_REQUIRED', 'Your session has expired. Sign in again.', 401);
        const user = await response.json() as {
            id?: string;
        };
        if (!user.id)
            throw new DomainError('AUTH_REQUIRED', 'Sign in to continue.', 401);
        const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
            exp?: number;
            iss?: string;
            aud?: string;
        };
        if (claims.iss !== issuer || claims.aud !== 'authenticated' || !claims.exp || claims.exp * 1000 <= Date.now())
            throw new DomainError('AUTH_REQUIRED', 'Your session has expired.', 401);
        return { ownerId: user.id, expiresAt: claims.exp * 1000 };
    }
}
