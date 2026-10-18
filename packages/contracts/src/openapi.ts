import { z } from 'zod';
import {AcceptedPageCaptureSchema,PageCaptureInputSchema,BrowserSiteGrantInputSchema} from './page-capture';
import { AcceptedBrowserEventSchema, AcceptedRunSchema, ApiErrorSchema, ApiResponseSchema, AssessmentSchema, BrowserEventInputSchema, BrowserInstallationInputSchema, BrowserInstallationSchema, CaseDetailSchema, CaseSummarySchema, ConnectionSummarySchema, ConnectionSyncScopeSchema, DashboardSnapshotSchema, DisconnectionResultSchema, EvidenceDetailSchema, GoogleStartInputSchema, GoogleStartResponseSchema, MessageDetailSchema, MessageSummarySchema, PageSchema, RecheckInputSchema, RunDetailSchema, SystemCapabilitiesSchema, ViewedInputSchema, ActivityEventSchema } from './index';

/** Generated from the same executable schemas used at ingress and publication. */
export function createOpenApiDocument() {
  const schemas = { ApiError: ApiErrorSchema, DashboardSnapshot: DashboardSnapshotSchema, CaseDetail: CaseDetailSchema, Assessment: AssessmentSchema, MessageDetail: MessageDetailSchema, BrowserEventInput: BrowserEventInputSchema };
  const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' });
  const operation = (response: z.ZodType, body?: z.ZodType, accepted = false) => ({
    security: [{ bearerAuth: [] }],
    ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: json(body) } } } } : {}),
    responses: { [accepted ? '202' : '200']: { description: accepted ? 'Accepted' : 'Success', content: { 'application/json': { schema: json(ApiResponseSchema(response)) } } }, default: { description: 'Typed error', content: { 'application/json': { schema: json(ApiErrorSchema) } } } },
  });
  const document = {
    openapi: '3.1.0', info: { title: 'Antelens API', version: '1.0.0' }, servers: [{ url: 'http://127.0.0.1:4000' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas: Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, json(schema)])) },
    paths: {
      '/health/live': { get: { responses: { '200': { description: 'Process alive' } } } },
      '/v1/system/capabilities': { get: operation(SystemCapabilitiesSchema) },
      '/v1/dashboard': { get: operation(DashboardSnapshotSchema) },
      '/v1/cases': { get: operation(PageSchema(CaseSummarySchema)) },
      '/v1/cases/{id}': { get: operation(CaseDetailSchema) },
      '/v1/cases/{id}/assessments': { get: operation(PageSchema(AssessmentSchema)) },
      '/v1/cases/{id}/viewed': { post: operation(z.object({ reviewStatus: z.literal('viewed') }), ViewedInputSchema) },
      '/v1/cases/{id}/rechecks': { post: operation(AcceptedRunSchema, RecheckInputSchema, true) },
      '/v1/messages': { get: operation(PageSchema(MessageSummarySchema)) },
      '/v1/messages/{id}': { get: operation(MessageDetailSchema) },
      '/v1/evidence/{id}': { get: operation(EvidenceDetailSchema) },
      '/v1/runs/{id}': { get: operation(RunDetailSchema) },
      '/v1/activity': { get: operation(PageSchema(ActivityEventSchema)) },
      '/v1/connections': { get: operation(z.array(ConnectionSummarySchema)) },
      '/v1/connections/gmail/start': { post: operation(GoogleStartResponseSchema, GoogleStartInputSchema) },
      '/v1/connections/gmail/callback': { get: { security: [], responses: { '302': { description: 'Single-use OAuth state consumed; return to allowed Connections route' } } } },
      '/v1/connections/{id}': { delete: operation(DisconnectionResultSchema) },
      '/v1/connections/{id}/scope': { get: operation(ConnectionSyncScopeSchema) },
      '/v1/browser/installations': { post: operation(BrowserInstallationSchema, BrowserInstallationInputSchema) },
      '/v1/browser/events': { post: operation(AcceptedBrowserEventSchema, BrowserEventInputSchema, true) },
      '/v1/browser/site-grants': { post: operation(z.object({origin:z.url(),granted:z.boolean()}), BrowserSiteGrantInputSchema) },
      '/v1/browser/captures': { post: operation(AcceptedPageCaptureSchema, PageCaptureInputSchema, true) },
      '/v1/events': { get: { security: [{ bearerAuth: [] }], responses: { '200': { description: 'Durable owner-scoped event stream', content: { 'text/event-stream': { schema: { type: 'string' } } } } } } },
    },
  };
  // Every templated route declares its required path parameter as OpenAPI requires.
  for (const [path, item] of Object.entries(document.paths)) {
    if (path.includes('{id}')) Object.assign(item, { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] });
  }
  return document;
}
