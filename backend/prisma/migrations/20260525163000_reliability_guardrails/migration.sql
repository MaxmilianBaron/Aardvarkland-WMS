-- Reliability guardrails for the WMS pilot.
-- CHECK constraints are added NOT VALID so existing pilot data can be reviewed
-- without blocking deployment; PostgreSQL still enforces them for new writes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_quants_quantity_non_negative_chk') THEN
    ALTER TABLE stock_quants
      ADD CONSTRAINT stock_quants_quantity_non_negative_chk CHECK (quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_quants_reserved_non_negative_chk') THEN
    ALTER TABLE stock_quants
      ADD CONSTRAINT stock_quants_reserved_non_negative_chk CHECK (reserved_quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_quants_reserved_not_above_quantity_chk') THEN
    ALTER TABLE stock_quants
      ADD CONSTRAINT stock_quants_reserved_not_above_quantity_chk CHECK (reserved_quantity <= quantity) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_quantity_positive_chk') THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_quantity_positive_chk CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_quantity_positive_chk') THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_quantity_positive_chk CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_idempotency_pair_chk') THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT stock_movements_idempotency_pair_chk CHECK (
        (source_system IS NULL AND idempotency_key IS NULL) OR
        (source_system IS NOT NULL AND idempotency_key IS NOT NULL)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_tasks_quantity_positive_chk') THEN
    ALTER TABLE warehouse_tasks
      ADD CONSTRAINT warehouse_tasks_quantity_positive_chk CHECK (quantity IS NULL OR quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_tasks_done_has_completed_at_chk') THEN
    ALTER TABLE warehouse_tasks
      ADD CONSTRAINT warehouse_tasks_done_has_completed_at_chk CHECK (
        status <> 'DONE'::"WarehouseTaskStatus" OR completed_at IS NOT NULL
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_print_jobs_copies_positive_chk') THEN
    ALTER TABLE label_print_jobs
      ADD CONSTRAINT label_print_jobs_copies_positive_chk CHECK (copies > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'label_print_jobs_printed_has_printed_at_chk') THEN
    ALTER TABLE label_print_jobs
      ADD CONSTRAINT label_print_jobs_printed_has_printed_at_chk CHECK (
        status <> 'PRINTED'::"LabelJobStatus" OR printed_at IS NOT NULL
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbox_events_attempts_non_negative_chk') THEN
    ALTER TABLE outbox_events
      ADD CONSTRAINT outbox_events_attempts_non_negative_chk CHECK (attempts >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbox_events_type_not_blank_chk') THEN
    ALTER TABLE outbox_events
      ADD CONSTRAINT outbox_events_type_not_blank_chk CHECK (length(btrim(type)) > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_dead_letters_attempts_positive_chk') THEN
    ALTER TABLE integration_dead_letters
      ADD CONSTRAINT integration_dead_letters_attempts_positive_chk CHECK (attempts > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_dead_letters_status_known_chk') THEN
    ALTER TABLE integration_dead_letters
      ADD CONSTRAINT integration_dead_letters_status_known_chk CHECK (
        status IN ('OPEN', 'RETRYING', 'REPLAYED', 'RESOLVED', 'IGNORED')
      ) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM mfa_totp_secrets
    WHERE verified_at IS NOT NULL AND disabled_at IS NULL
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS mfa_totp_secrets_one_active_verified_per_user_idx
      ON mfa_totp_secrets (user_id)
      WHERE verified_at IS NOT NULL AND disabled_at IS NULL;
  ELSE
    RAISE WARNING 'Skipped mfa_totp_secrets_one_active_verified_per_user_idx because duplicate active MFA secrets exist.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS outbox_events_status_updated_at_idx
  ON outbox_events (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS label_print_jobs_status_updated_at_idx
  ON label_print_jobs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS integration_dead_letters_open_updated_at_idx
  ON integration_dead_letters (updated_at DESC)
  WHERE status IN ('OPEN', 'RETRYING');
