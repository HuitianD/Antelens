import { pgTable, uuid, text, integer, jsonb, timestamp, bigint, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core';
import type { ActivityEvent, Assessment, CaseSummary, ConnectionSummary, Evidence, InvestigationRun, JourneyStep, SourceEvent, StoredPageCapture } from '@beforeyou/contracts';

const owner = () => uuid('owner_id').notNull();
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey(), ownerId: owner(), kind: text('kind').notNull(), providerAccountId: text('provider_account_id').notNull(),
  status: text('status').notNull(), dto: jsonb('dto').$type<ConnectionSummary>().notNull(), encryptedCredentials: text('encrypted_credentials'),
  syncCursor: text('sync_cursor'), syncConfig: jsonb('sync_config').notNull().default({}), createdAt: created(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('connections_owner_id_unique').on(t.ownerId, t.id), uniqueIndex('connections_account_unique').on(t.ownerId, t.kind, t.providerAccountId)]);
export const sourceEvents = pgTable('source_events', {
  id: uuid('id').primaryKey(), ownerId: owner(), connectionId: uuid('connection_id').notNull(), externalId: text('external_id').notNull(), externalThreadId: text('external_thread_id'),
  kind: text('kind').notNull(), disposition: text('disposition').notNull(), processingStatus: text('processing_status').notNull(), dto: jsonb('dto').$type<SourceEvent>().notNull(),
  content: text('content').notNull(), originalUrl: text('original_url'), links: jsonb('links').$type<string[]>().notNull().default([]), createdAt: created(),
}, (t) => [uniqueIndex('source_events_owner_id_unique').on(t.ownerId, t.id), uniqueIndex('source_events_external_unique').on(t.connectionId, t.externalId), index('source_events_owner_created').on(t.ownerId, t.createdAt, t.id)]);
export const cases = pgTable('cases', {
  id: uuid('id').primaryKey(), ownerId: owner(), sourceRevision: integer('source_revision').notNull(), recordVersion: integer('record_version').notNull(),
  currentAssessmentId: uuid('current_assessment_id'), activeRunId: uuid('active_run_id'), dto: jsonb('dto').$type<CaseSummary>().notNull(), createdAt: created(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('cases_owner_id_unique').on(t.ownerId, t.id), index('cases_owner_updated').on(t.ownerId, t.updatedAt, t.id)]);
export const caseSources = pgTable('case_sources', { ownerId: owner(), caseId: uuid('case_id').notNull(), sourceEventId: uuid('source_event_id').notNull(), createdAt: created() }, (t) => [primaryKey({ columns: [t.caseId, t.sourceEventId] })]);
export const investigationRuns = pgTable('investigation_runs', {
  id: uuid('id').primaryKey(), ownerId: owner(), caseId: uuid('case_id').notNull(), sourceRevision: integer('source_revision').notNull(), status: text('status').notNull(),
  dto: jsonb('dto').$type<InvestigationRun>().notNull(), leaseGeneration: integer('lease_generation').notNull().default(0), leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  providerSessionId: text('provider_session_id'), sandboxId: text('sandbox_id'), createdAt: created(),
}, (t) => [uniqueIndex('runs_owner_id_unique').on(t.ownerId, t.id), index('runs_case_created').on(t.ownerId, t.caseId, t.createdAt)]);
export const investigationSteps = pgTable('investigation_steps', {
  id: uuid('id').primaryKey(), ownerId: owner(), runId: uuid('run_id').notNull(), stepIndex: integer('step_index').notNull(), dto: jsonb('dto').$type<JourneyStep>().notNull(), createdAt: created(),
}, (t) => [uniqueIndex('steps_run_index_unique').on(t.runId, t.stepIndex)]);
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey(), ownerId: owner(), caseId: uuid('case_id').notNull(), storageKey: text('storage_key').notNull(), mimeType: text('mime_type').notNull(),
  byteLength: bigint('byte_length', { mode: 'number' }).notNull(), contentHash: text('content_hash').notNull(), retainUntil: timestamp('retain_until', { withTimezone: true }).notNull(), createdAt: created(),
}, (t) => [uniqueIndex('artifacts_owner_id_unique').on(t.ownerId, t.id)]);
export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey(), ownerId: owner(), caseId: uuid('case_id').notNull(), runId: uuid('run_id'), sourceEventId: uuid('source_event_id'), artifactId: uuid('artifact_id'),
  contentHash: text('content_hash').notNull(), dto: jsonb('dto').$type<Evidence>().notNull(), createdAt: created(),
}, (t) => [uniqueIndex('evidence_owner_id_unique').on(t.ownerId, t.id)]);
export const assessments = pgTable('assessments', {
  id: uuid('id').primaryKey(), ownerId: owner(), caseId: uuid('case_id').notNull(), runId: uuid('run_id').notNull(), version: integer('version').notNull(), sourceRevision: integer('source_revision').notNull(),
  dto: jsonb('dto').$type<Assessment>().notNull(), createdAt: created(),
}, (t) => [uniqueIndex('assessments_owner_id_unique').on(t.ownerId, t.id), uniqueIndex('assessments_case_version_unique').on(t.caseId, t.version), uniqueIndex('assessments_run_unique').on(t.runId)]);
export const reviewEvents = pgTable('review_events', {
  id: uuid('id').primaryKey(), ownerId: owner(), caseId: uuid('case_id').notNull(), assessmentId: uuid('assessment_id').notNull(), status: text('status').notNull(), createdAt: created(),
}, (t) => [uniqueIndex('review_events_unique').on(t.ownerId, t.assessmentId, t.status)]);
export const activityEvents = pgTable('activity_events', {
  id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(), ownerId: owner(), type: text('type').notNull(), caseId: uuid('case_id'), sourceRevision: integer('source_revision'),
  payload: jsonb('payload').$type<ActivityEvent['data']>().notNull(), createdAt: created(),
}, (t) => [index('activity_owner_cursor').on(t.ownerId, t.id)]);
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey(), ownerId: owner(), topic: text('topic').notNull(), dedupeKey: text('dedupe_key').notNull(), payload: jsonb('payload').notNull(),
  attempts: integer('attempts').notNull().default(0), deliveredAt: timestamp('delivered_at', { withTimezone: true }), createdAt: created(),
}, (t) => [uniqueIndex('outbox_dedupe_unique').on(t.ownerId, t.topic, t.dedupeKey)]);
export const browserInstallations = pgTable('browser_installations', {
  id: uuid('id').primaryKey(), ownerId: owner(), clientInstallationId: uuid('client_installation_id').notNull(), connectionId: uuid('connection_id').notNull(), displayName: text('display_name').notNull(), createdAt: created(),
}, (t) => [uniqueIndex('browser_installations_owner_client_unique').on(t.ownerId, t.clientInstallationId)]);
export const oauthStates = pgTable('oauth_states', { stateHash: text('state_hash').primaryKey(), ownerId: owner(), pkceVerifier: text('pkce_verifier').notNull(), returnTo: text('return_to').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), takenAt: timestamp('taken_at', { withTimezone: true }), createdAt: created() });
export const pageCaptures = pgTable('page_captures', {id:uuid('id').primaryKey(),ownerId:owner(),caseId:uuid('case_id').notNull(),sourceEventId:uuid('source_event_id').notNull(),installationId:uuid('installation_id').notNull(),clientCaptureId:uuid('client_capture_id').notNull(),bundleHash:text('bundle_hash').notNull(),dto:jsonb('dto').$type<StoredPageCapture>().notNull(),createdAt:created()},t=>[uniqueIndex('page_captures_owner_id_unique').on(t.ownerId,t.id),uniqueIndex('page_captures_client_unique').on(t.ownerId,t.installationId,t.clientCaptureId),index('page_captures_case_created').on(t.ownerId,t.caseId,t.createdAt,t.id)]);
export const idempotencyRecords = pgTable('idempotency_records', { ownerId: owner(), route: text('route').notNull(), key: text('key').notNull(), requestHash: text('request_hash').notNull(), result: jsonb('result').notNull(), createdAt: created() }, (t) => [primaryKey({ columns: [t.ownerId, t.route, t.key] })]);
