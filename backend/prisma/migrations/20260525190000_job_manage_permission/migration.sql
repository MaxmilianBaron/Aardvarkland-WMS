INSERT INTO "permissions" ("id", "code", "description", "created_at", "updated_at")
VALUES ('f716f575-2f2a-4327-b779-780fb8f1ec2c', 'job.manage', 'Run background jobs and operational maintenance tasks.', NOW(), NOW())
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description",
    "updated_at" = NOW();

INSERT INTO "role_permissions" ("role_id", "permission_id", "created_at")
SELECT "roles"."id", "permissions"."id", NOW()
FROM "roles"
CROSS JOIN "permissions"
WHERE "roles"."code" = 'WMS_ADMIN'
  AND "permissions"."code" = 'job.manage'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
