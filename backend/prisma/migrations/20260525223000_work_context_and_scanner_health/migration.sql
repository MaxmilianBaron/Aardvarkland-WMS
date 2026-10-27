CREATE TABLE "user_work_contexts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "zone" TEXT,
    "shift_code" TEXT,
    "rf_mode" TEXT NOT NULL DEFAULT 'DESKTOP',
    "scanner_device_reference" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_work_contexts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_work_contexts_user_id_key" ON "user_work_contexts"("user_id");
CREATE INDEX "user_work_contexts_warehouse_id_idx" ON "user_work_contexts"("warehouse_id");

ALTER TABLE "user_work_contexts"
    ADD CONSTRAINT "user_work_contexts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_work_contexts"
    ADD CONSTRAINT "user_work_contexts_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
