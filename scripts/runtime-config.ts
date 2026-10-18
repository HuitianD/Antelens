export const integrations={
 Supabase:['SUPABASE_URL','SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
 Gmail:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI','CREDENTIAL_ENCRYPTION_KEY'],
 Factory:['FACTORY_API_KEY','ANTHROPIC_API_KEY','CLAUDE_MODEL_ID'],
 Daytona:['DAYTONA_API_KEY','DAYTONA_SNAPSHOT'],
};
export function missing(names:string[]){return names.filter(name=>!name.split('|').some(option=>Boolean(process.env[option]?.trim())&&!process.env[option]?.includes('your-')))}
export function validateLiveConfiguration(){const absent=missing(integrations.Supabase);if(absent.length){console.error('BLOCKED: live authentication/database configuration missing: '+absent.join(', '));process.exit(2)}if(process.env.DEMO_AUTH_BYPASS==='true'){console.error('BLOCKED: demo authentication cannot run in live mode.');process.exit(2)}}
