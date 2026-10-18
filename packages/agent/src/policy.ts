import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class AgentError extends Error {
  constructor(public code: 'CONFIG_MISSING' | 'PROVIDER_ACCESS_DENIED' | 'PROVIDER_UNAVAILABLE' | 'TARGET_BLOCKED' | 'OUTPUT_INVALID' | 'INVESTIGATION_LIMITED' | 'SANDBOX_NETWORK_BLOCKED', message: string) { super(message); }
}
export { INVESTIGATION_POLICY_VERSION as POLICY_VERSION, INVESTIGATION_PROMPT_VERSION as PROMPT_VERSION, INVESTIGATION_TOOL_VERSION as TOOL_VERSION } from '@beforeyou/contracts';
export const TOOL_NAMES = ['get_case_context', 'start_browser', 'inspect_page', 'follow_step', 'capture_evidence', 'compare_claims', 'finish_investigation'] as const;
const actionWords = /(?:^|[\/_.?&=\-])(?:submit|send|transfer|enroll|cancel|update|login|signin|logout|signout|invite|invitation|confirm|unsubscribe|reset|resetpassword|magic|magiclink|accept|approve|grant|authorize|authorization|oauth|checkout-confirm|pay-now|purchase|delete|remove|activate|verify-email)(?:$|[\/_.?&=\-])/i;
const secretParams = /^(?:action|do|cmd|command|operation|intent|token|access_token|refresh_token|auth|code|otp|password|secret|signature|sig|key|session)$/i;
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    // Only global-unicast IPv6. Reject mapped addresses and local/reserved ranges.
    return /^[23][0-9a-f]{0,3}:/.test(a) && !a.startsWith('2001:db8:') && !a.startsWith('2001:0:') && !a.startsWith('2002:');
  }
  if (isIP(address) !== 4) return false;
  const [a = 0, b = 0] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}
export function validateTarget(raw: string, allowedDomains: readonly string[]): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AgentError('TARGET_BLOCKED', 'The destination is not a valid URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new AgentError('TARGET_BLOCKED', 'This destination is outside the permitted browsing scope.');
  if (!allowedDomains.includes(url.hostname.toLowerCase())) throw new AgentError('TARGET_BLOCKED', 'The destination is not on the supported-site allowlist.');
  if (isIP(url.hostname.replaceAll(/[\[\]]/g, '')) || actionWords.test(url.pathname) || [...url.searchParams.keys()].some(k => secretParams.test(k)) || actionWords.test(url.search)) throw new AgentError('TARGET_BLOCKED', 'This link may contain credentials or perform an account action.');
  if (/\.(?:exe|dmg|pkg|msi|bat|cmd|sh|ps1|crx|app|deb|rpm)(?:$|\?)/i.test(url.pathname)) throw new AgentError('TARGET_BLOCKED', 'Executable downloads are outside the investigation scope.');
  url.hash = '';
  return url;
}
export async function publicIPv4(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(r => !isPublicAddress(r.address))) throw new AgentError('TARGET_BLOCKED', 'The destination resolves to a private or reserved address.');
  const ipv4 = records.filter(r => r.family === 4).map(r => r.address);
  if (!ipv4.length) throw new AgentError('SANDBOX_NETWORK_BLOCKED', 'The supported-site firewall requires a public IPv4 destination.');
  return [...new Set(ipv4)];
}
export function redactedDisplayUrl(raw: string): string {
  try { const url = new URL(raw); return `${url.origin}${url.pathname}`; } catch { return 'Unavailable source'; }
}
const RESIDUAL_FACTORY_TOOLS = new Set(['ToolSearch']);

export function assertToolInventory(tools: ReadonlyArray<{ id: string; allowed: boolean }>, permittedIds: ReadonlySet<string>): void {
  if (tools.some(t => t.allowed && !permittedIds.has(t.id) && !RESIDUAL_FACTORY_TOOLS.has(t.id))) {
    throw new AgentError('PROVIDER_ACCESS_DENIED', 'The Droid runtime could not restrict its tools to the investigation policy.');
  }
}
