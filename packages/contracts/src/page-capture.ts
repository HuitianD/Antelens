import { z } from 'zod';

export const CAPTURE_LABEL = 'Captured page inspected in Daytona' as const;
export const CAPTURE_PROMPT_VERSION = 'captured-page-1.0.0' as const;
export const CAPTURE_TOOL_VERSION = 'offline-bundle-1.0.0' as const;
export const CAPTURE_LIMITATION = 'Offline inspection of captured visible content only. Live website state, unseen pages, actions, and sender identity were not verified.';
const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const CaptureBlockSchema = z.strictObject({kind:z.enum(['heading','paragraph','list_item','field_label','table_row']),text:z.string().min(1).max(2000)});
export const PageBundleSchema = z.strictObject({
 schemaVersion:z.literal('1'),pageUrl:z.url().max(2048).refine(value=>{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash;},'Capture URLs exclude credentials, query parameters and fragments.'),
 title:z.string().max(300),capturedAt:z.iso.datetime(),visibleText:z.string().min(1).max(8000),
 blocks:z.array(CaptureBlockSchema).min(1).max(160),fieldLabels:z.array(z.string().min(1).max(200)).max(100),
 viewport:z.strictObject({width:z.number().int().min(1).max(10000),height:z.number().int().min(1).max(10000)}),
}).superRefine((bundle,ctx)=>{if(bundle.blocks.reduce((sum,b)=>sum+b.text.length,0)>12000)ctx.addIssue({code:'custom',message:'Captured structure exceeds the text limit.'});});
export const PageCaptureInputSchema=z.strictObject({clientCaptureId:id,installationId:id,caseId:id,bundle:PageBundleSchema});
export const StoredPageCaptureSchema=z.strictObject({id,caseId:id,sourceEventId:id,installationId:id,bundle:PageBundleSchema,bundleHash:digest,receivedAt:z.iso.datetime(),dataOrigin:z.enum(['synthetic','user'])});
export const AcceptedPageCaptureSchema=z.strictObject({captureId:id,sourceEventId:id,caseId:id,runId:id,reused:z.boolean(),label:z.literal(CAPTURE_LABEL)});
export const BrowserSiteGrantInputSchema=z.strictObject({installationId:id,origin:z.url().refine(value=>new URL(value).origin===value),granted:z.boolean()});
export const CapturedInspectionSchema=z.strictObject({method:z.literal('captured_page_daytona'),label:z.literal(CAPTURE_LABEL),captureId:id,bundleHash:digest,sandboxId:z.string().min(1).max(100),capturedAt:z.iso.datetime(),inspectedAt:z.iso.datetime(),networkRequests:z.literal(0)});
export type PageBundle=z.infer<typeof PageBundleSchema>;
export type PageCaptureInput=z.infer<typeof PageCaptureInputSchema>;
export type StoredPageCapture=z.infer<typeof StoredPageCaptureSchema>;
export type AcceptedPageCapture=z.infer<typeof AcceptedPageCaptureSchema>;
export type CapturedInspection=z.infer<typeof CapturedInspectionSchema>;

/** Applied to selected visible text only; never reads storage, cookies, form values or page source. */
export function redactCaptureText(value:string):string {
 return value.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'[redacted token]')
  .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,'[redacted token]')
  .replace(/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{12,}|sb_secret_[A-Za-z0-9_-]{12,})\b/g,'[redacted token]')
  .replace(/([?&#](?:access_token|refresh_token|token|auth|code|key|secret|password|session)=)[^\s&#]+/gi,'$1[redacted]');
}
