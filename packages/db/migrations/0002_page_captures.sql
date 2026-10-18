CREATE TABLE page_captures (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 case_id uuid NOT NULL,
 source_event_id uuid NOT NULL,
 installation_id uuid NOT NULL,
 client_capture_id uuid NOT NULL,
 bundle_hash text NOT NULL CHECK (bundle_hash ~ '^[a-f0-9]{64}$'),
 dto jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id),
 UNIQUE(owner_id,installation_id,client_capture_id),
 FOREIGN KEY(owner_id,case_id) REFERENCES cases(owner_id,id),
 FOREIGN KEY(owner_id,source_event_id) REFERENCES source_events(owner_id,id),
 FOREIGN KEY(installation_id) REFERENCES browser_installations(id)
);
--> statement-breakpoint
CREATE INDEX page_captures_case_created ON page_captures(owner_id,case_id,created_at,id);
--> statement-breakpoint
ALTER TABLE browser_installations ADD CONSTRAINT browser_installations_owner_id_unique UNIQUE(owner_id,id);
--> statement-breakpoint
ALTER TABLE page_captures ADD CONSTRAINT page_captures_installation_owner_fk FOREIGN KEY(owner_id,installation_id) REFERENCES browser_installations(owner_id,id);
--> statement-breakpoint
ALTER TABLE page_captures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON page_captures FROM anon,authenticated;
--> statement-breakpoint
CREATE TRIGGER page_captures_immutable BEFORE UPDATE OR DELETE ON page_captures FOR EACH ROW EXECUTE FUNCTION reject_immutable_update();
