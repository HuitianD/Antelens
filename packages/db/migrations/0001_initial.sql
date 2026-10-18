-- PostgreSQL / Supabase. Service-role operations still use explicit owner predicates.
CREATE TABLE connections (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('gmail','browser')),
  provider_account_id text NOT NULL, status text NOT NULL CHECK (status IN ('not_connected','connecting','connected','needs_attention','disconnected')),
  dto jsonb NOT NULL, encrypted_credentials text, sync_cursor text, sync_config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,id), UNIQUE(owner_id,kind,provider_account_id), CHECK (dto->>'id'=id::text)
);
--> statement-breakpoint
CREATE UNIQUE INDEX one_active_gmail_per_owner ON connections(owner_id) WHERE kind='gmail' AND status IN ('connecting','connected','needs_attention');
--> statement-breakpoint
CREATE TABLE source_events (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, connection_id uuid NOT NULL, external_id text NOT NULL, external_thread_id text,
  kind text NOT NULL CHECK (kind IN ('gmail','browser')), disposition text NOT NULL CHECK (disposition IN ('pending','action_required','no_action')),
  processing_status text NOT NULL CHECK (processing_status IN ('queued','checking','complete','failed')), dto jsonb NOT NULL,
  content text NOT NULL, original_url text, links jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,id), UNIQUE(connection_id,external_id), FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id), CHECK (dto->>'id'=id::text)
);
--> statement-breakpoint
CREATE INDEX source_events_owner_created ON source_events(owner_id,created_at DESC,id);
--> statement-breakpoint
CREATE TABLE cases (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, source_revision integer NOT NULL CHECK(source_revision>0), record_version integer NOT NULL CHECK(record_version>0),
  current_assessment_id uuid, active_run_id uuid, dto jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,id), CHECK(dto->>'id'=id::text)
);
--> statement-breakpoint
CREATE INDEX cases_owner_updated ON cases(owner_id,updated_at DESC,id);
--> statement-breakpoint
CREATE TABLE case_sources (
  owner_id uuid NOT NULL, case_id uuid NOT NULL, source_event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(case_id,source_event_id),
  FOREIGN KEY(owner_id,case_id) REFERENCES cases(owner_id,id), FOREIGN KEY(owner_id,source_event_id) REFERENCES source_events(owner_id,id)
);
--> statement-breakpoint
CREATE TABLE investigation_runs (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, case_id uuid NOT NULL, source_revision integer NOT NULL CHECK(source_revision>0),
  status text NOT NULL CHECK(status IN ('queued','checking','complete','limited','failed','cancelled')), dto jsonb NOT NULL,
  lease_generation integer NOT NULL DEFAULT 0 CHECK(lease_generation>=0), lease_expires_at timestamptz, provider_session_id text, sandbox_id text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,id), UNIQUE(owner_id,case_id,id), FOREIGN KEY(owner_id,case_id) REFERENCES cases(owner_id,id), CHECK(dto->>'id'=id::text)
);
--> statement-breakpoint
CREATE UNIQUE INDEX one_active_run_per_case ON investigation_runs(case_id) WHERE status IN ('queued','checking');
--> statement-breakpoint
CREATE INDEX runs_case_created ON investigation_runs(owner_id,case_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE investigation_steps (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, run_id uuid NOT NULL, step_index integer NOT NULL CHECK(step_index>=0), dto jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,step_index), FOREIGN KEY(owner_id,run_id) REFERENCES investigation_runs(owner_id,id)
);
--> statement-breakpoint
CREATE TABLE artifacts (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, case_id uuid NOT NULL, storage_key text NOT NULL, mime_type text NOT NULL, byte_length bigint NOT NULL CHECK(byte_length>=0),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), retain_until timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,id), FOREIGN KEY(owner_id,case_id) REFERENCES cases(owner_id,id)
);
--> statement-breakpoint
CREATE TABLE evidence (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, case_id uuid NOT NULL, run_id uuid, source_event_id uuid, artifact_id uuid,
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'), dto jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,case_id) REFERENCES cases(owner_id,id), FOREIGN KEY(owner_id,case_id,run_id) REFERENCES investigation_runs(owner_id,case_id,id),
  FOREIGN KEY(owner_id,source_event_id) REFERENCES source_events(owner_id,id), FOREIGN KEY(owner_id,artifact_id) REFERENCES artifacts(owner_id,id), CHECK(dto->>'id'=id::text)
);
--> statement-breakpoint
CREATE TABLE assessments (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, case_id uuid NOT NULL, run_id uuid NOT NULL, version integer NOT NULL CHECK(version>0), source_revision integer NOT NULL CHECK(source_revision>0),
  dto jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,id), UNIQUE(owner_id,case_id,id), UNIQUE(case_id,version), UNIQUE(run_id),
  FOREIGN KEY(owner_id,case_id,run_id) REFERENCES investigation_runs(owner_id,case_id,id), CHECK(dto->>'id'=id::text)
);
--> statement-breakpoint
ALTER TABLE cases ADD CONSTRAINT cases_current_assessment_fk FOREIGN KEY(owner_id,id,current_assessment_id) REFERENCES assessments(owner_id,case_id,id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE cases ADD CONSTRAINT cases_active_run_fk FOREIGN KEY(owner_id,id,active_run_id) REFERENCES investigation_runs(owner_id,case_id,id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE TABLE review_events (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, case_id uuid NOT NULL, assessment_id uuid NOT NULL, status text NOT NULL CHECK(status IN ('viewed','verification_requested')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,assessment_id,status), FOREIGN KEY(owner_id,case_id,assessment_id) REFERENCES assessments(owner_id,case_id,id)
);
--> statement-breakpoint
CREATE TABLE activity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, owner_id uuid NOT NULL, type text NOT NULL, case_id uuid, source_revision integer, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(owner_id,case_id) REFERENCES cases(owner_id,id)
);
--> statement-breakpoint
CREATE INDEX activity_owner_cursor ON activity_events(owner_id,id);
--> statement-breakpoint
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, topic text NOT NULL, dedupe_key text NOT NULL, payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
  delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,topic,dedupe_key)
);
--> statement-breakpoint
CREATE INDEX outbox_undelivered ON outbox_events(created_at) WHERE delivered_at IS NULL;
--> statement-breakpoint
CREATE TABLE browser_installations (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, client_installation_id uuid NOT NULL, connection_id uuid NOT NULL, display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,client_installation_id), FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id)
);
--> statement-breakpoint
CREATE TABLE oauth_states (
  state_hash text PRIMARY KEY, owner_id uuid NOT NULL, pkce_verifier text NOT NULL, return_to text NOT NULL, expires_at timestamptz NOT NULL, taken_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE idempotency_records (
  owner_id uuid NOT NULL, route text NOT NULL, key text NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,route,key)
);
-- No UPDATE path exists for captured observations, published assessments or review history.
--> statement-breakpoint
CREATE FUNCTION reject_immutable_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable record cannot be updated'; END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_evidence BEFORE UPDATE ON evidence FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER immutable_assessments BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER immutable_review_events BEFORE UPDATE ON review_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();
-- All tables are private by default. Read policies on product tables use the verified Supabase user.
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['connections','source_events','cases','case_sources','investigation_runs','investigation_steps','artifacts','evidence','assessments','review_events','activity_events','outbox_events','browser_installations','oauth_states','idempotency_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated',table_name);
  END LOOP;
END $$;
-- Public DTOs are delivered by the authenticated API. Supabase clients receive no table grants,
-- especially for credential, raw source, storage-path or lease columns.
