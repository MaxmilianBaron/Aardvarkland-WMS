ALTER TABLE "label_print_jobs"
    ADD COLUMN "idempotency_key" TEXT,
    ADD COLUMN "request_hash" TEXT;

CREATE UNIQUE INDEX "label_print_jobs_warehouse_id_idempotency_key_key"
    ON "label_print_jobs"("warehouse_id", "idempotency_key");

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "wms_printer_stations" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'TCP_9100',
    "host" TEXT,
    "port" INTEGER DEFAULT 9100,
    "windows_printer_name" TEXT,
    "dpi" INTEGER NOT NULL DEFAULT 203,
    "label_width_mm" INTEGER NOT NULL DEFAULT 100,
    "label_height_mm" INTEGER NOT NULL DEFAULT 150,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "default_template_code" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE ("warehouse_id", "code")
);

CREATE TABLE IF NOT EXISTS "wms_print_agents" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "version" TEXT,
    "hostname" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "auth_failed_count" INTEGER NOT NULL DEFAULT 0,
    "auth_locked_until" TIMESTAMPTZ,
    "token_last_failed_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE ("warehouse_id", "code")
);

ALTER TABLE "wms_print_agents" ADD COLUMN IF NOT EXISTS "auth_failed_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "wms_print_agents" ADD COLUMN IF NOT EXISTS "auth_locked_until" TIMESTAMPTZ;
ALTER TABLE "wms_print_agents" ADD COLUMN IF NOT EXISTS "token_last_failed_at" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "wms_print_jobs" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL,
    "printer_code" TEXT,
    "agent_code" TEXT,
    "template_code" TEXT,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "rendered_zpl" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "request_hash" TEXT,
    "error_message" TEXT,
    "requested_by_user_id" UUID,
    "claimed_at" TIMESTAMPTZ,
    "claim_expires_at" TIMESTAMPTZ,
    "printed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "wms_print_jobs" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
ALTER TABLE "wms_print_jobs" ADD COLUMN IF NOT EXISTS "request_hash" TEXT;
ALTER TABLE "wms_print_jobs" ADD COLUMN IF NOT EXISTS "claim_expires_at" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "wms_label_template_versions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL,
    "template_code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "layout" JSONB NOT NULL,
    "zpl" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE ("warehouse_id", "template_code", "version")
);

CREATE TABLE IF NOT EXISTS "wms_scan_events" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "warehouse_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "scanned_value" TEXT NOT NULL,
    "parser_kind" TEXT NOT NULL,
    "resolved_object_type" TEXT,
    "resolved_resource_id" TEXT,
    "resolved_code" TEXT,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "wms_print_jobs_queue_idx"
    ON "wms_print_jobs"("warehouse_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "wms_print_jobs_claim_lease_idx"
    ON "wms_print_jobs"("warehouse_id", "status", "claim_expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "wms_print_jobs_idempotency_key_idx"
    ON "wms_print_jobs"("warehouse_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "wms_print_agents_status_idx"
    ON "wms_print_agents"("warehouse_id", "status");
CREATE INDEX IF NOT EXISTS "wms_print_agents_auth_locked_idx"
    ON "wms_print_agents"("warehouse_id", "auth_locked_until")
    WHERE "auth_locked_until" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "wms_scan_events_created_idx"
    ON "wms_scan_events"("warehouse_id", "created_at" DESC);
