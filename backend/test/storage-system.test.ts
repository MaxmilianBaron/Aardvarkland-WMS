import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

import { getHomePageHtml } from '../src/app-home.page';
import { validateEnv } from '../src/config/env';

test('package metadata is product scoped', () => {
  const pkg = JSON.parse(readFileSync(join(cwd(), 'package.json'), 'utf8')) as {
    name?: string;
    description?: string;
  };

  assert.equal(pkg.name, '@aardvarkland-inc/storage-system-backend');
  assert.equal(pkg.description, 'Aardvarkland Storage System backend API.');
});

test('environment defaults use backend runtime values', () => {
  const env = validateEnv({
    DATABASE_URL: 'postgresql://aardvarkland:aardvarkland@localhost:5432/aardvarkland_storage',
    JWT_SECRET: 'local-storage-system-secret-32-chars',
    MFA_SECRET_ENCRYPTION_KEY: 'local-storage-system-mfa-key-32-chars',
  });

  assert.equal(env.PORT, 4001);
  assert.equal(env.JWT_ISSUER, 'aardvarkland-storage-system');
  assert.equal(env.JWT_AUDIENCE, 'aardvarkland-storage-system-api');
  assert.equal(env.MFA_TOTP_ISSUER, 'Aardvarkland');
  assert.equal(env.DATABASE_DIRECT_URL, null);
  assert.equal(env.DATABASE_POOL_MAX, 20);
  assert.equal(env.DATABASE_STATEMENT_TIMEOUT_MS, 0);
  assert.equal(env.DATABASE_LOCK_TIMEOUT_MS, 0);
  assert.equal(env.REQUEST_BODY_LIMIT, '1mb');
  assert.equal(env.JWT_KEY_ID, 'jwt-current-v1');
  assert.deepEqual(env.JWT_PREVIOUS_SECRETS, []);
  assert.equal(env.HEALTH_OUTBOX_MAX_AGE_SECONDS, 300);
  assert.equal(env.HEALTH_QUEUE_WORKER_MAX_AGE_SECONDS, 300);
  assert.equal(env.WMS_BACKUP_STATUS_PATH, '.runtime/backup-status.json');
  assert.equal(env.HEALTH_BACKUP_MAX_AGE_SECONDS, 108000);
  assert.equal(env.HEALTH_REQUIRE_BACKUP_STATUS, false);
  assert.equal(env.HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS, 604800);
  assert.equal(env.HEALTH_REQUIRE_RESTORE_DRILL, false);
  assert.equal(env.RETENTION_CLEANUP_ENABLED, false);
  assert.equal(env.RETENTION_CLEANUP_INTERVAL_SECONDS, 21600);
  assert.equal(env.RETENTION_CLEANUP_BATCH_SIZE, 500);
  assert.equal(env.RETENTION_AUDIT_LOG_DAYS, 365);
  assert.equal(env.RETENTION_AUTH_LOGIN_ATTEMPT_DAYS, 30);
  assert.equal(env.RETENTION_RATE_LIMIT_BUCKET_DAYS, 2);
  assert.equal(env.RETENTION_REFRESH_SESSION_DAYS, 60);
  assert.equal(env.RETENTION_IDEMPOTENCY_DAYS, 45);
  assert.equal(env.RETENTION_OUTBOX_SENT_DAYS, 30);
  assert.equal(env.RETENTION_INBOX_TERMINAL_DAYS, 30);
  assert.equal(env.RETENTION_PRINT_JOB_DAYS, 90);
  assert.equal(env.RETENTION_INTEGRATION_LOG_DAYS, 90);
  assert.equal(env.RETENTION_INTEGRATION_DEAD_LETTER_DAYS, 180);
  assert.deepEqual(env.EXTERNAL_HTTP_ALLOWED_HOSTS, []);
  assert.equal(env.AUTH_FAILED_LOGIN_BACKOFF_ENABLED, false);
  assert.equal(env.AUTH_FAILED_LOGIN_BACKOFF_THRESHOLD, 5);
  assert.equal(env.AUTH_FAILED_LOGIN_BACKOFF_BASE_SECONDS, 30);
  assert.equal(env.AUTH_FAILED_LOGIN_BACKOFF_MAX_SECONDS, 900);
  assert.equal(env.PRIVILEGED_MFA_ENFORCEMENT, 'warn');
  assert.equal(env.STRUCTURED_LOGS_ENABLED, false);
  assert.equal(env.OPERATIONAL_ALERT_DELIVERY_ENABLED, false);
  assert.deepEqual(env.OPERATIONAL_ALERT_CHANNELS, ['log']);
  assert.equal(env.OPERATIONAL_ALERT_DEDUPE_MINUTES, 15);
  assert.equal(env.OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE, 'Aardvarkland-WMS');
  assert.equal(env.OPERATIONAL_ALERT_WEBHOOK_URL, null);
  assert.equal(env.OPERATIONAL_ALERT_SMTP_HOST, null);
  assert.equal(env.OPERATIONAL_ALERT_SMTP_PORT, 25);
  assert.equal(env.OPERATIONAL_ALERT_SMTP_SECURE, false);
  assert.equal(env.OPERATIONAL_ALERT_SMTP_TO, null);
  assert.equal(env.SLOW_ROUTE_WARN_MS, 1000);
  assert.equal(env.SLOW_ROUTE_CRITICAL_MS, 3000);
  assert.equal(env.HTTP_5XX_RATE_WARN_PER_MINUTE, 10);
  assert.equal(env.INTEGRATION_CIRCUIT_BREAKER_ENABLED, true);
});

test('production environment rejects unsafe placeholders and wildcard outbound hosts', () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://wms_app:rotated-db-password-42@db.internal:5432/aardvarkland_storage',
      JWT_SECRET: 'rotated-jwt-secret-for-production-pilot-42',
      MFA_SECRET_ENCRYPTION_KEY: 'rotated-mfa-secret-for-production-pilot-42',
      WEBHOOK_SHARED_SECRET: 'rotated-webhook-secret-for-production-42',
      CARRIER_CREDENTIAL_ENCRYPTION_KEY: 'rotated-carrier-key-for-production-42',
      RATE_LIMIT_BACKEND: 'postgres',
      RATE_LIMIT_FAIL_OPEN: 'false',
      CARRIER_ADAPTER_MODE: 'credential',
      ENABLE_SWAGGER: 'false',
      EXTERNAL_HTTP_ALLOWED_HOSTS: '*',
    }),
    /EXTERNAL_HTTP_ALLOWED_HOSTS cannot contain \* in production/,
  );
});

test('production environment rejects local and docker sample secrets', () => {
  assert.throws(
    () => validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://wms_app:rotated-db-password-42@db.internal:5432/aardvarkland_storage',
      JWT_SECRET: 'docker-storage-system-secret-at-least-32-chars',
      MFA_SECRET_ENCRYPTION_KEY: 'rotated-mfa-secret-for-production-pilot-42',
      WEBHOOK_SHARED_SECRET: 'rotated-webhook-secret-for-production-42',
      CARRIER_CREDENTIAL_ENCRYPTION_KEY: 'rotated-carrier-key-for-production-42',
      RATE_LIMIT_BACKEND: 'postgres',
      RATE_LIMIT_FAIL_OPEN: 'false',
      CARRIER_ADAPTER_MODE: 'credential',
      ENABLE_SWAGGER: 'false',
    }),
    /JWT_SECRET contains a known local\/dev sample value/,
  );
});

test('application module keeps current product modules', () => {
  const appModuleText = readFileSync(join(cwd(), 'src', 'app.module.ts'), 'utf8');
  const removedToken = ['sp', 'rint'].join('');

  assert.equal(appModuleText.toLowerCase().includes(removedToken), false);
  assert.equal(appModuleText.includes('EnterpriseValuePackModule'), false);
  assert.equal(appModuleText.includes('EnterprisePlatformModule'), false);
  assert.match(appModuleText, /OperationsRuntimeModule/);
  assert.match(appModuleText, /ConfigurationRulesModule/);
});

test('root status page uses the public product name', () => {
  assert.match(getHomePageHtml(), /<h1>Aardvarkland<\/h1>/);
  assert.doesNotMatch(getHomePageHtml(), /Aardvarkland WMS/);
});
