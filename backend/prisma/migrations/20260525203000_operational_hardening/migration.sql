CREATE TABLE IF NOT EXISTS "operational_incident_states" (
  "incident_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "note" TEXT,
  "acknowledged_by_user_id" UUID,
  "acknowledged_at" TIMESTAMPTZ(3),
  "resolved_by_user_id" UUID,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_incident_states_pkey" PRIMARY KEY ("incident_key"),
  CONSTRAINT "operational_incident_states_status_chk" CHECK ("status" IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  CONSTRAINT "operational_incident_states_ack_user_fkey"
    FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "operational_incident_states_resolved_user_fkey"
    FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "operational_incident_states_status_updated_at_idx"
  ON "operational_incident_states"("status", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "operational_alert_deliveries" (
  "alert_key" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "last_status" TEXT NOT NULL,
  "last_sent_at" TIMESTAMPTZ(3),
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "dedupe_until" TIMESTAMPTZ(3),
  "error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_alert_deliveries_pkey" PRIMARY KEY ("alert_key", "channel"),
  CONSTRAINT "operational_alert_deliveries_status_chk" CHECK ("last_status" IN ('sent', 'skipped', 'failed'))
);

CREATE INDEX IF NOT EXISTS "operational_alert_deliveries_seen_idx"
  ON "operational_alert_deliveries"("last_seen_at" DESC);

CREATE INDEX IF NOT EXISTS "operational_alert_deliveries_dedupe_idx"
  ON "operational_alert_deliveries"("dedupe_until");

CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx"
  ON "audit_logs"("action", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"
  ON "audit_logs"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "label_print_jobs_status_created_at_idx"
  ON "label_print_jobs"("status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "outbox_events_status_created_at_idx"
  ON "outbox_events"("status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "stock_quants_warehouse_status_updated_at_idx"
  ON "stock_quants"("warehouse_id", "status", "updated_at" DESC);
