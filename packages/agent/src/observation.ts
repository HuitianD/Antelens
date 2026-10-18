import { z } from 'zod';
import { CapturedInspectionSchema } from '@beforeyou/contracts';

export const ObservationSchema = z.object({
  title: z.string().max(300), visibleText: z.string().max(16000), url: z.string().url(), status: z.number(),
  anchors: z.array(z.object({ id: z.string(), text: z.string(), href: z.string() })).max(80), fieldLabels: z.array(z.string()).max(100),
  scriptedPage: z.boolean(), loginRequired: z.boolean(), captcha: z.boolean(), blockedRequests: z.boolean(), screenshot: z.string().max(8_000_000),
  inspection: z.unknown().transform(value=>CapturedInspectionSchema.parse(value)).optional(),
});
export type Observation = z.infer<typeof ObservationSchema>;

/** A browser runtime opens one validated page and returns a schema-checked observation. */
export interface InvestigationBrowser {
  observe(url: string): Promise<Observation>;
  close(): Promise<void>;
}

/** Tunnel edges that serve an interstitial to browsers without this header. Harmless elsewhere. */
export function fixtureRequestHeaders(hostname: string): Record<string, string> {
  return /\.ngrok(?:-free)?\.(?:dev|app|io)$/.test(hostname) ? { 'ngrok-skip-browser-warning': '1' } : {};
}
