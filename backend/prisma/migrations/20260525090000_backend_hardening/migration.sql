ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "auth_login_attempts" (
    "id" UUID NOT NULL,
    "email_hash" TEXT NOT NULL,
    "user_id" UUID,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "first_failed_at" TIMESTAMP(3),
    "last_failed_at" TIMESTAMP(3),
    "locked_until" TIMESTAMP(3),
    "last_ip_hash" TEXT,
    "last_user_agent_hash" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_login_attempts_email_hash_key" ON "auth_login_attempts"("email_hash");
CREATE INDEX "auth_login_attempts_locked_until_idx" ON "auth_login_attempts"("locked_until");
CREATE INDEX "auth_login_attempts_user_id_last_failed_at_idx" ON "auth_login_attempts"("user_id", "last_failed_at");

ALTER TABLE "auth_login_attempts" ADD CONSTRAINT "auth_login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
