import { parseCommaSeparatedValues } from '../common/cors.helpers';

const NODE_ENVS = ['development', 'test', 'staging', 'production'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];

const PLACEHOLDER_MARKERS = [
  'replace_with',
  'replace-with',
  'change_me',
  'change-me',
  'changeme',
  'placeholder',
  'dummy',
  'please_replace',
] as const;

const FORBIDDEN_PRODUCTION_SECRET_PATTERNS = [
  /^local[-_]/,
  /^docker[-_]/,
  /^dev[-_]/,
  /^demo[-_]/,
  /^production[-_](storage[-_]system|webhook|carrier|mfa)/,
  /aardvarkland:aardvarkland@/,
] as const;

export interface Env {
  NODE_ENV: NodeEnv;
  PORT: number;
  APP_VERSION: string;
  RELEASE_SHA: string;
  DATABASE_URL: string;
  DATABASE_DIRECT_URL: string | null;
  DATABASE_POOL_MAX: number;
  DATABASE_STATEMENT_TIMEOUT_MS: number;
  DATABASE_LOCK_TIMEOUT_MS: number;
  REQUEST_BODY_LIMIT: string;
  JWT_SECRET: string;
  JWT_KEY_ID: string;
  JWT_PREVIOUS_SECRETS: string[];
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_ACCESS_TOKEN_TTL_SECONDS: number;
  WEBHOOK_SHARED_SECRET: string | null;
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: number;
  CARRIER_CREDENTIAL_ENCRYPTION_KEY: string | null;
  CARRIER_CREDENTIAL_ENCRYPTION_KEY_ID: string;
  CARRIER_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS: SecretKeyMaterial[];
  CARRIER_ADAPTER_MODE: 'mock' | 'sandbox' | 'production' | 'credential';
  CARRIER_HTTP_TIMEOUT_MS: number;
  ENABLE_SWAGGER: boolean;
  CORS_ALLOWED_ORIGINS: string[];
  SECURITY_HSTS_ENABLED: boolean;
  SECURITY_HSTS_MAX_AGE_SECONDS: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_AUTH_LOGIN_MAX: number;
  RATE_LIMIT_AUTH_REFRESH_MAX: number;
  RATE_LIMIT_WEBHOOK_MAX: number;
  RATE_LIMIT_BACKEND: 'memory' | 'postgres';
  RATE_LIMIT_FAIL_OPEN: boolean;
  TRUST_PROXY_HOPS: number;
  HEALTH_OUTBOX_MAX_AGE_SECONDS: number;
  HEALTH_QUEUE_WORKER_MAX_AGE_SECONDS: number;
  HEALTH_REQUIRE_QUEUE_WORKER: boolean;
  HEALTH_CONSISTENCY_CHECK_ENABLED: boolean;
  HEALTH_CONSISTENCY_MAX_ERRORS: number;
  WMS_BACKUP_STATUS_PATH: string;
  HEALTH_BACKUP_MAX_AGE_SECONDS: number;
  HEALTH_REQUIRE_BACKUP_STATUS: boolean;
  HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS: number;
  HEALTH_REQUIRE_RESTORE_DRILL: boolean;
  STARTUP_PREFLIGHT_STRICT: boolean;
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: number;
  RETENTION_CLEANUP_ENABLED: boolean;
  RETENTION_CLEANUP_INTERVAL_SECONDS: number;
  RETENTION_CLEANUP_BATCH_SIZE: number;
  RETENTION_AUDIT_LOG_DAYS: number;
  RETENTION_AUTH_LOGIN_ATTEMPT_DAYS: number;
  RETENTION_RATE_LIMIT_BUCKET_DAYS: number;
  RETENTION_REFRESH_SESSION_DAYS: number;
  RETENTION_IDEMPOTENCY_DAYS: number;
  RETENTION_OUTBOX_SENT_DAYS: number;
  RETENTION_INBOX_TERMINAL_DAYS: number;
  RETENTION_PRINT_JOB_DAYS: number;
  RETENTION_INTEGRATION_LOG_DAYS: number;
  RETENTION_INTEGRATION_DEAD_LETTER_DAYS: number;
  EXTERNAL_HTTP_ALLOWED_HOSTS: string[];
  AUTH_FAILED_LOGIN_BACKOFF_ENABLED: boolean;
  AUTH_FAILED_LOGIN_BACKOFF_THRESHOLD: number;
  AUTH_FAILED_LOGIN_BACKOFF_BASE_SECONDS: number;
  AUTH_FAILED_LOGIN_BACKOFF_MAX_SECONDS: number;
  AUTH_FAILED_LOGIN_BACKOFF_WINDOW_SECONDS: number;
  JWT_REFRESH_TOKEN_TTL_SECONDS: number;
  MFA_TOTP_ISSUER: string;
  MFA_SECRET_ENCRYPTION_KEY: string;
  MFA_SECRET_ENCRYPTION_KEY_ID: string;
  MFA_PREVIOUS_SECRET_ENCRYPTION_KEYS: SecretKeyMaterial[];
  PRIVILEGED_MFA_ENFORCEMENT: 'warn' | 'block';
  STRUCTURED_LOGS_ENABLED: boolean;
  OPERATIONAL_ALERT_DELIVERY_ENABLED: boolean;
  OPERATIONAL_ALERT_CHANNELS: string[];
  OPERATIONAL_ALERT_DEDUPE_MINUTES: number;
  OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE: string;
  OPERATIONAL_ALERT_WEBHOOK_URL: string | null;
  OPERATIONAL_ALERT_WEBHOOK_SECRET: string | null;
  OPERATIONAL_ALERT_SMTP_HOST: string | null;
  OPERATIONAL_ALERT_SMTP_PORT: number;
  OPERATIONAL_ALERT_SMTP_SECURE: boolean;
  OPERATIONAL_ALERT_SMTP_USERNAME: string | null;
  OPERATIONAL_ALERT_SMTP_PASSWORD: string | null;
  OPERATIONAL_ALERT_SMTP_FROM: string | null;
  OPERATIONAL_ALERT_SMTP_TO: string | null;
  SLOW_ROUTE_WARN_MS: number;
  SLOW_ROUTE_CRITICAL_MS: number;
  HTTP_5XX_RATE_WARN_PER_MINUTE: number;
  INTEGRATION_CIRCUIT_BREAKER_ENABLED: boolean;
  INTEGRATION_CIRCUIT_BREAKER_FAILURE_THRESHOLD: number;
  INTEGRATION_CIRCUIT_BREAKER_COOLDOWN_SECONDS: number;
}

export interface SecretKeyMaterial {
  keyId: string;
  secret: string;
}

export function validateEnv(config: Record<string, unknown>): Env {
  const nodeEnv = readOptionalString(config, 'NODE_ENV', 'development');

  if (!isNodeEnv(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
  }

  const port = Number(config['PORT'] ?? 4001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const appVersion = readOptionalString(config, 'APP_VERSION', '1.0.0').trim();
  if (appVersion.length === 0 || appVersion.length > 80) {
    throw new Error('APP_VERSION must be between 1 and 80 characters long');
  }

  const releaseSha = readOptionalString(config, 'RELEASE_SHA', 'local-dev').trim();
  if (releaseSha.length === 0 || releaseSha.length > 120) {
    throw new Error('RELEASE_SHA must be between 1 and 120 characters long');
  }

  const databaseUrl = readOptionalString(config, 'DATABASE_URL', '');

  if (databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required');
  }

  assertNoProductionPlaceholder('DATABASE_URL', databaseUrl, nodeEnv);

  const databaseDirectUrl = readNullableString(config, 'DATABASE_DIRECT_URL');
  if (databaseDirectUrl) {
    assertNoProductionPlaceholder('DATABASE_DIRECT_URL', databaseDirectUrl, nodeEnv);
  }

  const databasePoolMax = readOptionalNumber(config, 'DATABASE_POOL_MAX', 20);
  if (!Number.isInteger(databasePoolMax) || databasePoolMax < 1 || databasePoolMax > 500) {
    throw new Error('DATABASE_POOL_MAX must be an integer between 1 and 500');
  }

  const databaseStatementTimeoutMs = readOptionalNumber(
    config,
    'DATABASE_STATEMENT_TIMEOUT_MS',
    nodeEnv === 'production' || nodeEnv === 'staging' ? 60_000 : 0,
  );
  if (
    !Number.isInteger(databaseStatementTimeoutMs) ||
    databaseStatementTimeoutMs < 0 ||
    databaseStatementTimeoutMs > 600_000
  ) {
    throw new Error('DATABASE_STATEMENT_TIMEOUT_MS must be an integer between 0 and 600000');
  }

  const databaseLockTimeoutMs = readOptionalNumber(
    config,
    'DATABASE_LOCK_TIMEOUT_MS',
    nodeEnv === 'production' || nodeEnv === 'staging' ? 10_000 : 0,
  );
  if (!Number.isInteger(databaseLockTimeoutMs) || databaseLockTimeoutMs < 0 || databaseLockTimeoutMs > 120_000) {
    throw new Error('DATABASE_LOCK_TIMEOUT_MS must be an integer between 0 and 120000');
  }

  const requestBodyLimit = readOptionalString(config, 'REQUEST_BODY_LIMIT', '1mb').trim().toLowerCase();
  if (!/^\d+(b|kb|mb)?$/.test(requestBodyLimit)) {
    throw new Error('REQUEST_BODY_LIMIT must be a size like 512kb or 1mb');
  }

  const jwtSecret = readOptionalString(config, 'JWT_SECRET', '');

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  assertNoProductionPlaceholder('JWT_SECRET', jwtSecret, nodeEnv);

  const jwtKeyId = readOptionalString(config, 'JWT_KEY_ID', 'jwt-current-v1').trim();
  if (jwtKeyId.length === 0 || jwtKeyId.length > 80) {
    throw new Error('JWT_KEY_ID must be between 1 and 80 characters long');
  }

  const jwtPreviousSecrets = parseCommaSeparatedValues(readOptionalString(config, 'JWT_PREVIOUS_SECRETS', ''));
  for (const previousSecret of jwtPreviousSecrets) {
    if (previousSecret.length < 32) {
      throw new Error('JWT_PREVIOUS_SECRETS entries must be at least 32 characters long');
    }
    assertNoProductionPlaceholder('JWT_PREVIOUS_SECRETS', previousSecret, nodeEnv);
  }

  const jwtAccessTokenTtlSeconds = readOptionalNumber(config, 'JWT_ACCESS_TOKEN_TTL_SECONDS', 900);

  if (
    !Number.isInteger(jwtAccessTokenTtlSeconds) ||
    jwtAccessTokenTtlSeconds < 60 ||
    jwtAccessTokenTtlSeconds > 86400
  ) {
    throw new Error('JWT_ACCESS_TOKEN_TTL_SECONDS must be an integer between 60 and 86400');
  }

  const webhookSharedSecret = readNullableString(config, 'WEBHOOK_SHARED_SECRET');
  if (webhookSharedSecret && webhookSharedSecret.length < 32) {
    throw new Error('WEBHOOK_SHARED_SECRET must be at least 32 characters long when configured');
  }
  if (nodeEnv === 'production' && !webhookSharedSecret) {
    throw new Error('WEBHOOK_SHARED_SECRET is required in production');
  }
  if (webhookSharedSecret) {
    assertNoProductionPlaceholder('WEBHOOK_SHARED_SECRET', webhookSharedSecret, nodeEnv);
  }

  const carrierCredentialEncryptionKey = readNullableString(config, 'CARRIER_CREDENTIAL_ENCRYPTION_KEY');
  if (carrierCredentialEncryptionKey && carrierCredentialEncryptionKey.length < 32) {
    throw new Error('CARRIER_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters long when configured');
  }
  if (nodeEnv === 'production' && !carrierCredentialEncryptionKey) {
    throw new Error('CARRIER_CREDENTIAL_ENCRYPTION_KEY is required in production');
  }
  if (carrierCredentialEncryptionKey) {
    assertNoProductionPlaceholder('CARRIER_CREDENTIAL_ENCRYPTION_KEY', carrierCredentialEncryptionKey, nodeEnv);
  }

  const carrierCredentialEncryptionKeyId = readOptionalString(
    config,
    'CARRIER_CREDENTIAL_ENCRYPTION_KEY_ID',
    'carrier-current-v1',
  ).trim();
  if (carrierCredentialEncryptionKeyId.length === 0 || carrierCredentialEncryptionKeyId.length > 80) {
    throw new Error('CARRIER_CREDENTIAL_ENCRYPTION_KEY_ID must be between 1 and 80 characters long');
  }

  const carrierCredentialPreviousEncryptionKeys = parseSecretKeyRing(
    readOptionalString(config, 'CARRIER_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS', ''),
    'CARRIER_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS',
    nodeEnv,
  );

  const carrierAdapterMode = readOptionalString(config, 'CARRIER_ADAPTER_MODE', nodeEnv === 'production' ? 'credential' : 'mock').toLowerCase();
  if (!['mock', 'sandbox', 'production', 'credential'].includes(carrierAdapterMode)) {
    throw new Error('CARRIER_ADAPTER_MODE must be one of: mock, sandbox, production, credential');
  }
  if (nodeEnv === 'production' && carrierAdapterMode === 'mock') {
    throw new Error('CARRIER_ADAPTER_MODE cannot be mock in production');
  }

  const carrierHttpTimeoutMs = readOptionalNumber(config, 'CARRIER_HTTP_TIMEOUT_MS', 15_000);
  if (!Number.isInteger(carrierHttpTimeoutMs) || carrierHttpTimeoutMs < 1_000 || carrierHttpTimeoutMs > 120_000) {
    throw new Error('CARRIER_HTTP_TIMEOUT_MS must be an integer between 1000 and 120000');
  }

  const webhookSignatureToleranceSeconds = readOptionalNumber(config, 'WEBHOOK_SIGNATURE_TOLERANCE_SECONDS', 300);
  if (
    !Number.isInteger(webhookSignatureToleranceSeconds) ||
    webhookSignatureToleranceSeconds < 30 ||
    webhookSignatureToleranceSeconds > 86_400
  ) {
    throw new Error('WEBHOOK_SIGNATURE_TOLERANCE_SECONDS must be an integer between 30 and 86400');
  }

  const corsAllowedOrigins = parseCommaSeparatedValues(readOptionalString(config, 'CORS_ALLOWED_ORIGINS', ''));
  if (nodeEnv === 'production' && corsAllowedOrigins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS cannot contain * in production');
  }

  const hstsMaxAgeSeconds = readOptionalNumber(config, 'SECURITY_HSTS_MAX_AGE_SECONDS', 31_536_000);
  if (!Number.isInteger(hstsMaxAgeSeconds) || hstsMaxAgeSeconds < 0 || hstsMaxAgeSeconds > 63_072_000) {
    throw new Error('SECURITY_HSTS_MAX_AGE_SECONDS must be an integer between 0 and 63072000');
  }

  const enableSwagger = readOptionalBoolean(config, 'ENABLE_SWAGGER', nodeEnv !== 'production');
  if (nodeEnv === 'production' && enableSwagger) {
    throw new Error('ENABLE_SWAGGER must be false in production');
  }

  const rateLimitWindowMs = readOptionalNumber(config, 'RATE_LIMIT_WINDOW_MS', 60_000);
  if (!Number.isInteger(rateLimitWindowMs) || rateLimitWindowMs < 1_000 || rateLimitWindowMs > 86_400_000) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be an integer between 1000 and 86400000');
  }

  const rateLimitMax = readOptionalNumber(config, 'RATE_LIMIT_MAX', 600);
  if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1 || rateLimitMax > 100_000) {
    throw new Error('RATE_LIMIT_MAX must be an integer between 1 and 100000');
  }

  const rateLimitAuthLoginMax = readOptionalNumber(config, 'RATE_LIMIT_AUTH_LOGIN_MAX', Math.min(rateLimitMax, 20));
  if (!Number.isInteger(rateLimitAuthLoginMax) || rateLimitAuthLoginMax < 1 || rateLimitAuthLoginMax > 100_000) {
    throw new Error('RATE_LIMIT_AUTH_LOGIN_MAX must be an integer between 1 and 100000');
  }

  const rateLimitAuthRefreshMax = readOptionalNumber(config, 'RATE_LIMIT_AUTH_REFRESH_MAX', Math.min(rateLimitMax, 120));
  if (!Number.isInteger(rateLimitAuthRefreshMax) || rateLimitAuthRefreshMax < 1 || rateLimitAuthRefreshMax > 100_000) {
    throw new Error('RATE_LIMIT_AUTH_REFRESH_MAX must be an integer between 1 and 100000');
  }

  const rateLimitWebhookMax = readOptionalNumber(config, 'RATE_LIMIT_WEBHOOK_MAX', rateLimitMax);
  if (!Number.isInteger(rateLimitWebhookMax) || rateLimitWebhookMax < 1 || rateLimitWebhookMax > 100_000) {
    throw new Error('RATE_LIMIT_WEBHOOK_MAX must be an integer between 1 and 100000');
  }

  const trustProxyHops = readOptionalNumber(config, 'TRUST_PROXY_HOPS', 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  }

  const rateLimitBackend = readOptionalString(
    config,
    'RATE_LIMIT_BACKEND',
    nodeEnv === 'production' ? 'postgres' : 'memory',
  );
  if (rateLimitBackend !== 'memory' && rateLimitBackend !== 'postgres') {
    throw new Error('RATE_LIMIT_BACKEND must be either memory or postgres');
  }
  if (nodeEnv === 'production' && rateLimitBackend !== 'postgres') {
    throw new Error('RATE_LIMIT_BACKEND must be postgres in production');
  }

  const rateLimitFailOpen = readOptionalBoolean(config, 'RATE_LIMIT_FAIL_OPEN', nodeEnv !== 'production');
  if (nodeEnv === 'production' && rateLimitFailOpen) {
    throw new Error('RATE_LIMIT_FAIL_OPEN must be false in production');
  }

  const healthOutboxMaxAgeSeconds = readOptionalNumber(config, 'HEALTH_OUTBOX_MAX_AGE_SECONDS', 300);
  if (
    !Number.isInteger(healthOutboxMaxAgeSeconds) ||
    healthOutboxMaxAgeSeconds < 5 ||
    healthOutboxMaxAgeSeconds > 86_400
  ) {
    throw new Error('HEALTH_OUTBOX_MAX_AGE_SECONDS must be an integer between 5 and 86400');
  }

  const healthQueueWorkerMaxAgeSeconds = readOptionalNumber(config, 'HEALTH_QUEUE_WORKER_MAX_AGE_SECONDS', 300);
  if (
    !Number.isInteger(healthQueueWorkerMaxAgeSeconds) ||
    healthQueueWorkerMaxAgeSeconds < 5 ||
    healthQueueWorkerMaxAgeSeconds > 86_400
  ) {
    throw new Error('HEALTH_QUEUE_WORKER_MAX_AGE_SECONDS must be an integer between 5 and 86400');
  }
  const healthRequireQueueWorker = readOptionalBoolean(config, 'HEALTH_REQUIRE_QUEUE_WORKER', nodeEnv === 'production');

  const healthConsistencyCheckEnabled = readOptionalBoolean(
    config,
    'HEALTH_CONSISTENCY_CHECK_ENABLED',
    nodeEnv === 'production' || nodeEnv === 'staging',
  );
  const healthConsistencyMaxErrors = readOptionalNumber(config, 'HEALTH_CONSISTENCY_MAX_ERRORS', 0);
  if (
    !Number.isInteger(healthConsistencyMaxErrors) ||
    healthConsistencyMaxErrors < 0 ||
    healthConsistencyMaxErrors > 1000
  ) {
    throw new Error('HEALTH_CONSISTENCY_MAX_ERRORS must be an integer between 0 and 1000');
  }

  const wmsBackupStatusPath = readOptionalString(config, 'WMS_BACKUP_STATUS_PATH', '.runtime/backup-status.json').trim();
  if (wmsBackupStatusPath.length === 0 || wmsBackupStatusPath.length > 260) {
    throw new Error('WMS_BACKUP_STATUS_PATH must be between 1 and 260 characters long');
  }

  const healthBackupMaxAgeSeconds = readOptionalNumber(config, 'HEALTH_BACKUP_MAX_AGE_SECONDS', 108_000);
  if (
    !Number.isInteger(healthBackupMaxAgeSeconds) ||
    healthBackupMaxAgeSeconds < 60 ||
    healthBackupMaxAgeSeconds > 2_592_000
  ) {
    throw new Error('HEALTH_BACKUP_MAX_AGE_SECONDS must be an integer between 60 and 2592000');
  }
  const healthRequireBackupStatus = readOptionalBoolean(config, 'HEALTH_REQUIRE_BACKUP_STATUS', nodeEnv === 'production');

  const healthRestoreDrillMaxAgeSeconds = readOptionalNumber(config, 'HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS', 604_800);
  if (
    !Number.isInteger(healthRestoreDrillMaxAgeSeconds) ||
    healthRestoreDrillMaxAgeSeconds < 60 ||
    healthRestoreDrillMaxAgeSeconds > 7_776_000
  ) {
    throw new Error('HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS must be an integer between 60 and 7776000');
  }
  const healthRequireRestoreDrill = readOptionalBoolean(
    config,
    'HEALTH_REQUIRE_RESTORE_DRILL',
    nodeEnv === 'production' || nodeEnv === 'staging',
  );

  const startupPreflightStrict = readOptionalBoolean(
    config,
    'STARTUP_PREFLIGHT_STRICT',
    nodeEnv === 'production' || nodeEnv === 'staging',
  );

  const gracefulShutdownTimeoutMs = readOptionalNumber(config, 'GRACEFUL_SHUTDOWN_TIMEOUT_MS', 15_000);
  if (
    !Number.isInteger(gracefulShutdownTimeoutMs) ||
    gracefulShutdownTimeoutMs < 1_000 ||
    gracefulShutdownTimeoutMs > 120_000
  ) {
    throw new Error('GRACEFUL_SHUTDOWN_TIMEOUT_MS must be an integer between 1000 and 120000');
  }

  const retentionCleanupEnabled = readOptionalBoolean(
    config,
    'RETENTION_CLEANUP_ENABLED',
    nodeEnv === 'production' || nodeEnv === 'staging',
  );
  const retentionCleanupIntervalSeconds = readOptionalNumber(config, 'RETENTION_CLEANUP_INTERVAL_SECONDS', 21_600);
  if (
    !Number.isInteger(retentionCleanupIntervalSeconds) ||
    retentionCleanupIntervalSeconds < 300 ||
    retentionCleanupIntervalSeconds > 604_800
  ) {
    throw new Error('RETENTION_CLEANUP_INTERVAL_SECONDS must be an integer between 300 and 604800');
  }
  const retentionCleanupBatchSize = readOptionalNumber(config, 'RETENTION_CLEANUP_BATCH_SIZE', 500);
  if (!Number.isInteger(retentionCleanupBatchSize) || retentionCleanupBatchSize < 10 || retentionCleanupBatchSize > 10_000) {
    throw new Error('RETENTION_CLEANUP_BATCH_SIZE must be an integer between 10 and 10000');
  }
  const retentionAuditLogDays = readRetentionDays(config, 'RETENTION_AUDIT_LOG_DAYS', 365);
  const retentionAuthLoginAttemptDays = readRetentionDays(config, 'RETENTION_AUTH_LOGIN_ATTEMPT_DAYS', 30);
  const retentionRateLimitBucketDays = readRetentionDays(config, 'RETENTION_RATE_LIMIT_BUCKET_DAYS', 2);
  const retentionRefreshSessionDays = readRetentionDays(config, 'RETENTION_REFRESH_SESSION_DAYS', 60);
  const retentionIdempotencyDays = readRetentionDays(config, 'RETENTION_IDEMPOTENCY_DAYS', 45);
  const retentionOutboxSentDays = readRetentionDays(config, 'RETENTION_OUTBOX_SENT_DAYS', 30);
  const retentionInboxTerminalDays = readRetentionDays(config, 'RETENTION_INBOX_TERMINAL_DAYS', 30);
  const retentionPrintJobDays = readRetentionDays(config, 'RETENTION_PRINT_JOB_DAYS', 90);
  const retentionIntegrationLogDays = readRetentionDays(config, 'RETENTION_INTEGRATION_LOG_DAYS', 90);
  const retentionIntegrationDeadLetterDays = readRetentionDays(config, 'RETENTION_INTEGRATION_DEAD_LETTER_DAYS', 180);

  const externalHttpAllowedHosts = parseCommaSeparatedValues(readOptionalString(config, 'EXTERNAL_HTTP_ALLOWED_HOSTS', ''));
  if (nodeEnv === 'production' && externalHttpAllowedHosts.includes('*')) {
    throw new Error('EXTERNAL_HTTP_ALLOWED_HOSTS cannot contain * in production');
  }
  for (const host of externalHttpAllowedHosts) {
    if (!isAllowedHostToken(host)) {
      throw new Error('EXTERNAL_HTTP_ALLOWED_HOSTS can contain host names only, not URLs or paths');
    }
  }

  const authFailedLoginBackoffEnabled = readOptionalBoolean(
    config,
    'AUTH_FAILED_LOGIN_BACKOFF_ENABLED',
    nodeEnv === 'production',
  );

  const authFailedLoginBackoffThreshold = readOptionalNumber(config, 'AUTH_FAILED_LOGIN_BACKOFF_THRESHOLD', 5);
  if (
    !Number.isInteger(authFailedLoginBackoffThreshold) ||
    authFailedLoginBackoffThreshold < 2 ||
    authFailedLoginBackoffThreshold > 50
  ) {
    throw new Error('AUTH_FAILED_LOGIN_BACKOFF_THRESHOLD must be an integer between 2 and 50');
  }

  const authFailedLoginBackoffBaseSeconds = readOptionalNumber(config, 'AUTH_FAILED_LOGIN_BACKOFF_BASE_SECONDS', 30);
  if (
    !Number.isInteger(authFailedLoginBackoffBaseSeconds) ||
    authFailedLoginBackoffBaseSeconds < 1 ||
    authFailedLoginBackoffBaseSeconds > 3600
  ) {
    throw new Error('AUTH_FAILED_LOGIN_BACKOFF_BASE_SECONDS must be an integer between 1 and 3600');
  }

  const authFailedLoginBackoffMaxSeconds = readOptionalNumber(config, 'AUTH_FAILED_LOGIN_BACKOFF_MAX_SECONDS', 900);
  if (
    !Number.isInteger(authFailedLoginBackoffMaxSeconds) ||
    authFailedLoginBackoffMaxSeconds < authFailedLoginBackoffBaseSeconds ||
    authFailedLoginBackoffMaxSeconds > 86_400
  ) {
    throw new Error('AUTH_FAILED_LOGIN_BACKOFF_MAX_SECONDS must be between AUTH_FAILED_LOGIN_BACKOFF_BASE_SECONDS and 86400');
  }

  const authFailedLoginBackoffWindowSeconds = readOptionalNumber(config, 'AUTH_FAILED_LOGIN_BACKOFF_WINDOW_SECONDS', 900);
  if (
    !Number.isInteger(authFailedLoginBackoffWindowSeconds) ||
    authFailedLoginBackoffWindowSeconds < 60 ||
    authFailedLoginBackoffWindowSeconds > 86_400
  ) {
    throw new Error('AUTH_FAILED_LOGIN_BACKOFF_WINDOW_SECONDS must be an integer between 60 and 86400');
  }

  const jwtRefreshTokenTtlSeconds = readOptionalNumber(config, 'JWT_REFRESH_TOKEN_TTL_SECONDS', 2_592_000);
  if (
    !Number.isInteger(jwtRefreshTokenTtlSeconds) ||
    jwtRefreshTokenTtlSeconds < 3_600 ||
    jwtRefreshTokenTtlSeconds > 31_536_000
  ) {
    throw new Error('JWT_REFRESH_TOKEN_TTL_SECONDS must be an integer between 3600 and 31536000');
  }

  const mfaTotpIssuer = readOptionalString(config, 'MFA_TOTP_ISSUER', 'Aardvarkland').trim();
  if (mfaTotpIssuer.length === 0 || mfaTotpIssuer.length > 120) {
    throw new Error('MFA_TOTP_ISSUER must be between 1 and 120 characters long');
  }

  const mfaSecretEncryptionKey = readNullableString(config, 'MFA_SECRET_ENCRYPTION_KEY') ?? (nodeEnv === 'production' ? '' : jwtSecret);
  if (mfaSecretEncryptionKey.length < 32) {
    throw new Error('MFA_SECRET_ENCRYPTION_KEY must be at least 32 characters long');
  }
  if (nodeEnv === 'production' && mfaSecretEncryptionKey === jwtSecret) {
    throw new Error('MFA_SECRET_ENCRYPTION_KEY must be separate from JWT_SECRET in production');
  }
  assertNoProductionPlaceholder('MFA_SECRET_ENCRYPTION_KEY', mfaSecretEncryptionKey, nodeEnv);

  const mfaSecretEncryptionKeyId = readOptionalString(config, 'MFA_SECRET_ENCRYPTION_KEY_ID', 'mfa-default-v1').trim();
  if (mfaSecretEncryptionKeyId.length === 0 || mfaSecretEncryptionKeyId.length > 80) {
    throw new Error('MFA_SECRET_ENCRYPTION_KEY_ID must be between 1 and 80 characters long');
  }

  const mfaPreviousSecretEncryptionKeys = parseSecretKeyRing(
    readOptionalString(config, 'MFA_PREVIOUS_SECRET_ENCRYPTION_KEYS', ''),
    'MFA_PREVIOUS_SECRET_ENCRYPTION_KEYS',
    nodeEnv,
  );

  const privilegedMfaEnforcement = readOptionalString(
    config,
    'PRIVILEGED_MFA_ENFORCEMENT',
    nodeEnv === 'production' || nodeEnv === 'staging' ? 'block' : 'warn',
  ).toLowerCase();
  if (privilegedMfaEnforcement !== 'warn' && privilegedMfaEnforcement !== 'block') {
    throw new Error('PRIVILEGED_MFA_ENFORCEMENT must be warn or block');
  }

  const structuredLogsEnabled = readOptionalBoolean(
    config,
    'STRUCTURED_LOGS_ENABLED',
    nodeEnv === 'production' || nodeEnv === 'staging',
  );

  const operationalAlertDeliveryEnabled = readOptionalBoolean(
    config,
    'OPERATIONAL_ALERT_DELIVERY_ENABLED',
    nodeEnv === 'production' || nodeEnv === 'staging',
  );
  const operationalAlertChannels = parseCommaSeparatedValues(
    readOptionalString(
      config,
      'OPERATIONAL_ALERT_CHANNELS',
      nodeEnv === 'production' || nodeEnv === 'staging' ? 'windows-event-log,log' : 'log',
    ),
  ).map((channel) => channel.toLowerCase());
  const allowedAlertChannels = new Set(['log', 'windows-event-log', 'webhook', 'smtp']);
  for (const channel of operationalAlertChannels) {
    if (!allowedAlertChannels.has(channel)) {
      throw new Error('OPERATIONAL_ALERT_CHANNELS can contain log, windows-event-log, webhook, or smtp');
    }
  }
  const operationalAlertDedupeMinutes = readOptionalNumber(config, 'OPERATIONAL_ALERT_DEDUPE_MINUTES', 15);
  if (
    !Number.isInteger(operationalAlertDedupeMinutes) ||
    operationalAlertDedupeMinutes < 1 ||
    operationalAlertDedupeMinutes > 1440
  ) {
    throw new Error('OPERATIONAL_ALERT_DEDUPE_MINUTES must be an integer between 1 and 1440');
  }
  const operationalAlertWindowsEventSource = readOptionalString(
    config,
    'OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE',
    'Aardvarkland-WMS',
  ).trim();
  if (operationalAlertWindowsEventSource.length === 0 || operationalAlertWindowsEventSource.length > 80) {
    throw new Error('OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE must be between 1 and 80 characters long');
  }
  const operationalAlertWebhookUrl = readNullableString(config, 'OPERATIONAL_ALERT_WEBHOOK_URL');
  if (operationalAlertWebhookUrl) {
    assertUrl('OPERATIONAL_ALERT_WEBHOOK_URL', operationalAlertWebhookUrl);
  }
  const operationalAlertWebhookSecret = readNullableString(config, 'OPERATIONAL_ALERT_WEBHOOK_SECRET');
  const operationalAlertSmtpHost = readNullableString(config, 'OPERATIONAL_ALERT_SMTP_HOST');
  const operationalAlertSmtpPort = readOptionalNumber(config, 'OPERATIONAL_ALERT_SMTP_PORT', 25);
  if (
    !Number.isInteger(operationalAlertSmtpPort) ||
    operationalAlertSmtpPort < 1 ||
    operationalAlertSmtpPort > 65535
  ) {
    throw new Error('OPERATIONAL_ALERT_SMTP_PORT must be an integer between 1 and 65535');
  }
  const operationalAlertSmtpSecure = readOptionalBoolean(config, 'OPERATIONAL_ALERT_SMTP_SECURE', false);
  const operationalAlertSmtpUsername = readNullableString(config, 'OPERATIONAL_ALERT_SMTP_USERNAME');
  const operationalAlertSmtpPassword = readNullableString(config, 'OPERATIONAL_ALERT_SMTP_PASSWORD');
  const operationalAlertSmtpFrom = readNullableString(config, 'OPERATIONAL_ALERT_SMTP_FROM');
  const operationalAlertSmtpTo = readNullableString(config, 'OPERATIONAL_ALERT_SMTP_TO');

  const slowRouteWarnMs = readOptionalNumber(config, 'SLOW_ROUTE_WARN_MS', 1000);
  if (!Number.isInteger(slowRouteWarnMs) || slowRouteWarnMs < 1 || slowRouteWarnMs > 120_000) {
    throw new Error('SLOW_ROUTE_WARN_MS must be an integer between 1 and 120000');
  }
  const slowRouteCriticalMs = readOptionalNumber(config, 'SLOW_ROUTE_CRITICAL_MS', 3000);
  if (
    !Number.isInteger(slowRouteCriticalMs) ||
    slowRouteCriticalMs < slowRouteWarnMs ||
    slowRouteCriticalMs > 300_000
  ) {
    throw new Error('SLOW_ROUTE_CRITICAL_MS must be between SLOW_ROUTE_WARN_MS and 300000');
  }
  const http5xxRateWarnPerMinute = readOptionalNumber(config, 'HTTP_5XX_RATE_WARN_PER_MINUTE', 10);
  if (
    !Number.isInteger(http5xxRateWarnPerMinute) ||
    http5xxRateWarnPerMinute < 1 ||
    http5xxRateWarnPerMinute > 10_000
  ) {
    throw new Error('HTTP_5XX_RATE_WARN_PER_MINUTE must be an integer between 1 and 10000');
  }

  const integrationCircuitBreakerEnabled = readOptionalBoolean(
    config,
    'INTEGRATION_CIRCUIT_BREAKER_ENABLED',
    true,
  );
  const integrationCircuitBreakerFailureThreshold = readOptionalNumber(
    config,
    'INTEGRATION_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
    5,
  );
  if (
    !Number.isInteger(integrationCircuitBreakerFailureThreshold) ||
    integrationCircuitBreakerFailureThreshold < 1 ||
    integrationCircuitBreakerFailureThreshold > 100
  ) {
    throw new Error('INTEGRATION_CIRCUIT_BREAKER_FAILURE_THRESHOLD must be an integer between 1 and 100');
  }

  const integrationCircuitBreakerCooldownSeconds = readOptionalNumber(
    config,
    'INTEGRATION_CIRCUIT_BREAKER_COOLDOWN_SECONDS',
    300,
  );
  if (
    !Number.isInteger(integrationCircuitBreakerCooldownSeconds) ||
    integrationCircuitBreakerCooldownSeconds < 1 ||
    integrationCircuitBreakerCooldownSeconds > 86_400
  ) {
    throw new Error('INTEGRATION_CIRCUIT_BREAKER_COOLDOWN_SECONDS must be an integer between 1 and 86400');
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    APP_VERSION: appVersion,
    RELEASE_SHA: releaseSha,
    DATABASE_URL: databaseUrl,
    DATABASE_DIRECT_URL: databaseDirectUrl,
    DATABASE_POOL_MAX: databasePoolMax,
    DATABASE_STATEMENT_TIMEOUT_MS: databaseStatementTimeoutMs,
    DATABASE_LOCK_TIMEOUT_MS: databaseLockTimeoutMs,
    REQUEST_BODY_LIMIT: requestBodyLimit,
    JWT_SECRET: jwtSecret,
    JWT_KEY_ID: jwtKeyId,
    JWT_PREVIOUS_SECRETS: jwtPreviousSecrets,
    JWT_ISSUER: readOptionalString(config, 'JWT_ISSUER', 'aardvarkland-storage-system'),
    JWT_AUDIENCE: readOptionalString(config, 'JWT_AUDIENCE', 'aardvarkland-storage-system-api'),
    JWT_ACCESS_TOKEN_TTL_SECONDS: jwtAccessTokenTtlSeconds,
    WEBHOOK_SHARED_SECRET: webhookSharedSecret,
    WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: webhookSignatureToleranceSeconds,
    CARRIER_CREDENTIAL_ENCRYPTION_KEY: carrierCredentialEncryptionKey,
    CARRIER_CREDENTIAL_ENCRYPTION_KEY_ID: carrierCredentialEncryptionKeyId,
    CARRIER_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS: carrierCredentialPreviousEncryptionKeys,
    CARRIER_ADAPTER_MODE: carrierAdapterMode as Env['CARRIER_ADAPTER_MODE'],
    CARRIER_HTTP_TIMEOUT_MS: carrierHttpTimeoutMs,
    ENABLE_SWAGGER: enableSwagger,
    CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
    SECURITY_HSTS_ENABLED: readOptionalBoolean(config, 'SECURITY_HSTS_ENABLED', nodeEnv === 'production'),
    SECURITY_HSTS_MAX_AGE_SECONDS: hstsMaxAgeSeconds,
    RATE_LIMIT_WINDOW_MS: rateLimitWindowMs,
    RATE_LIMIT_MAX: rateLimitMax,
    RATE_LIMIT_AUTH_LOGIN_MAX: rateLimitAuthLoginMax,
    RATE_LIMIT_AUTH_REFRESH_MAX: rateLimitAuthRefreshMax,
    RATE_LIMIT_WEBHOOK_MAX: rateLimitWebhookMax,
    RATE_LIMIT_BACKEND: rateLimitBackend,
    RATE_LIMIT_FAIL_OPEN: rateLimitFailOpen,
    TRUST_PROXY_HOPS: trustProxyHops,
    HEALTH_OUTBOX_MAX_AGE_SECONDS: healthOutboxMaxAgeSeconds,
    HEALTH_QUEUE_WORKER_MAX_AGE_SECONDS: healthQueueWorkerMaxAgeSeconds,
    HEALTH_REQUIRE_QUEUE_WORKER: healthRequireQueueWorker,
    HEALTH_CONSISTENCY_CHECK_ENABLED: healthConsistencyCheckEnabled,
    HEALTH_CONSISTENCY_MAX_ERRORS: healthConsistencyMaxErrors,
    WMS_BACKUP_STATUS_PATH: wmsBackupStatusPath,
    HEALTH_BACKUP_MAX_AGE_SECONDS: healthBackupMaxAgeSeconds,
    HEALTH_REQUIRE_BACKUP_STATUS: healthRequireBackupStatus,
    HEALTH_RESTORE_DRILL_MAX_AGE_SECONDS: healthRestoreDrillMaxAgeSeconds,
    HEALTH_REQUIRE_RESTORE_DRILL: healthRequireRestoreDrill,
    STARTUP_PREFLIGHT_STRICT: startupPreflightStrict,
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: gracefulShutdownTimeoutMs,
    RETENTION_CLEANUP_ENABLED: retentionCleanupEnabled,
    RETENTION_CLEANUP_INTERVAL_SECONDS: retentionCleanupIntervalSeconds,
    RETENTION_CLEANUP_BATCH_SIZE: retentionCleanupBatchSize,
    RETENTION_AUDIT_LOG_DAYS: retentionAuditLogDays,
    RETENTION_AUTH_LOGIN_ATTEMPT_DAYS: retentionAuthLoginAttemptDays,
    RETENTION_RATE_LIMIT_BUCKET_DAYS: retentionRateLimitBucketDays,
    RETENTION_REFRESH_SESSION_DAYS: retentionRefreshSessionDays,
    RETENTION_IDEMPOTENCY_DAYS: retentionIdempotencyDays,
    RETENTION_OUTBOX_SENT_DAYS: retentionOutboxSentDays,
    RETENTION_INBOX_TERMINAL_DAYS: retentionInboxTerminalDays,
    RETENTION_PRINT_JOB_DAYS: retentionPrintJobDays,
    RETENTION_INTEGRATION_LOG_DAYS: retentionIntegrationLogDays,
    RETENTION_INTEGRATION_DEAD_LETTER_DAYS: retentionIntegrationDeadLetterDays,
    EXTERNAL_HTTP_ALLOWED_HOSTS: externalHttpAllowedHosts,
    AUTH_FAILED_LOGIN_BACKOFF_ENABLED: authFailedLoginBackoffEnabled,
    AUTH_FAILED_LOGIN_BACKOFF_THRESHOLD: authFailedLoginBackoffThreshold,
    AUTH_FAILED_LOGIN_BACKOFF_BASE_SECONDS: authFailedLoginBackoffBaseSeconds,
    AUTH_FAILED_LOGIN_BACKOFF_MAX_SECONDS: authFailedLoginBackoffMaxSeconds,
    AUTH_FAILED_LOGIN_BACKOFF_WINDOW_SECONDS: authFailedLoginBackoffWindowSeconds,
    JWT_REFRESH_TOKEN_TTL_SECONDS: jwtRefreshTokenTtlSeconds,
    MFA_TOTP_ISSUER: mfaTotpIssuer,
    MFA_SECRET_ENCRYPTION_KEY: mfaSecretEncryptionKey,
    MFA_SECRET_ENCRYPTION_KEY_ID: mfaSecretEncryptionKeyId,
    MFA_PREVIOUS_SECRET_ENCRYPTION_KEYS: mfaPreviousSecretEncryptionKeys,
    PRIVILEGED_MFA_ENFORCEMENT: privilegedMfaEnforcement as Env['PRIVILEGED_MFA_ENFORCEMENT'],
    STRUCTURED_LOGS_ENABLED: structuredLogsEnabled,
    OPERATIONAL_ALERT_DELIVERY_ENABLED: operationalAlertDeliveryEnabled,
    OPERATIONAL_ALERT_CHANNELS: operationalAlertChannels,
    OPERATIONAL_ALERT_DEDUPE_MINUTES: operationalAlertDedupeMinutes,
    OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE: operationalAlertWindowsEventSource,
    OPERATIONAL_ALERT_WEBHOOK_URL: operationalAlertWebhookUrl,
    OPERATIONAL_ALERT_WEBHOOK_SECRET: operationalAlertWebhookSecret,
    OPERATIONAL_ALERT_SMTP_HOST: operationalAlertSmtpHost,
    OPERATIONAL_ALERT_SMTP_PORT: operationalAlertSmtpPort,
    OPERATIONAL_ALERT_SMTP_SECURE: operationalAlertSmtpSecure,
    OPERATIONAL_ALERT_SMTP_USERNAME: operationalAlertSmtpUsername,
    OPERATIONAL_ALERT_SMTP_PASSWORD: operationalAlertSmtpPassword,
    OPERATIONAL_ALERT_SMTP_FROM: operationalAlertSmtpFrom,
    OPERATIONAL_ALERT_SMTP_TO: operationalAlertSmtpTo,
    SLOW_ROUTE_WARN_MS: slowRouteWarnMs,
    SLOW_ROUTE_CRITICAL_MS: slowRouteCriticalMs,
    HTTP_5XX_RATE_WARN_PER_MINUTE: http5xxRateWarnPerMinute,
    INTEGRATION_CIRCUIT_BREAKER_ENABLED: integrationCircuitBreakerEnabled,
    INTEGRATION_CIRCUIT_BREAKER_FAILURE_THRESHOLD: integrationCircuitBreakerFailureThreshold,
    INTEGRATION_CIRCUIT_BREAKER_COOLDOWN_SECONDS: integrationCircuitBreakerCooldownSeconds,
  };
}

function assertNoProductionPlaceholder(key: string, value: string, nodeEnv: NodeEnv): void {
  if (nodeEnv !== 'production' && nodeEnv !== 'staging') {
    return;
  }

  const normalized = value.trim().toLowerCase();
  const hasPlaceholderMarker = PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));

  if (hasPlaceholderMarker) {
    throw new Error(`${key} contains a placeholder value and must be rotated before ${nodeEnv}`);
  }

  const hasForbiddenSampleValue = FORBIDDEN_PRODUCTION_SECRET_PATTERNS.some((pattern) => pattern.test(normalized));
  if (hasForbiddenSampleValue) {
    throw new Error(`${key} contains a known local/dev sample value and must be rotated before ${nodeEnv}`);
  }
}

function isNodeEnv(value: string): value is NodeEnv {
  return NODE_ENVS.includes(value as NodeEnv);
}

function isAllowedHostToken(value: string): boolean {
  if (value === '*') {
    return true;
  }
  return /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(value) && !value.includes('/');
}

function assertUrl(key: string, value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
  } catch {
    throw new Error(`${key} must be a valid http or https URL`);
  }
}

function parseSecretKeyRing(value: string, key: string, nodeEnv: NodeEnv): SecretKeyMaterial[] {
  const entries = parseCommaSeparatedValues(value);
  const result: SecretKeyMaterial[] = [];

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`${key} entries must use key-id:secret format`);
    }

    const keyId = entry.slice(0, separatorIndex).trim();
    const secret = entry.slice(separatorIndex + 1).trim();
    if (keyId.length === 0 || keyId.length > 80) {
      throw new Error(`${key} key ids must be between 1 and 80 characters long`);
    }
    if (secret.length < 32) {
      throw new Error(`${key} secrets must be at least 32 characters long`);
    }
    assertNoProductionPlaceholder(key, secret, nodeEnv);
    result.push({ keyId, secret });
  }

  return result;
}

function readOptionalString(
  config: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = config[key];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`);
  }

  return value;
}

function readRetentionDays(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = readOptionalNumber(config, key, fallback);
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    throw new Error(`${key} must be an integer between 1 and 3650`);
  }
  return value;
}

function readOptionalNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = config[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number`);
  }

  return parsed;
}

function readOptionalBoolean(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = config[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a boolean`);
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${key} must be a boolean`);
}

function readNullableString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];

  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`);
  }

  return value;
}
