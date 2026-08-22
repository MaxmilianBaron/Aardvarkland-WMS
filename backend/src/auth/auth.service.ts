import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { AuthenticatedUser } from '../access-control';
import { Env } from '../config';
import { PrismaService } from '../database';
import { UserStatus } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { assertStrongPassword } from './password-policy';
import {
  AccessTokenPayload,
  AccessTokenVerificationResult,
  AuthRequestMetadata,
  AuthResponse,
  MfaSetupResponse,
  MfaStatusResponse,
  WorkContextResponse,
  WorkContextWarehouse,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RevokeRefreshTokenDto } from './dto/revoke-refresh-token.dto';
import { UpdateWorkContextDto, WorkContextRfMode } from './dto/update-work-context.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import {
  buildOtpAuthUri,
  decryptMfaSecret,
  encryptMfaSecret,
  generateTotpSecret,
  verifyTotpCode,
} from './mfa-totp.helpers';
import { ChangePasswordDto } from './dto/change-password.dto';

interface RefreshSessionRow {
  id: string;
  user_id: string;
  family_id: string;
  status: string;
  expires_at: Date | string;
}

interface CreatedRefreshSessionRow {
  id: string;
  family_id: string;
  expires_at: Date | string;
}

interface AuthLoginAttemptRow {
  id: string;
  failed_count: number;
  first_failed_at: Date | string | null;
  last_failed_at: Date | string | null;
  locked_until: Date | string | null;
}

interface MfaSecretRow {
  id: string;
  user_id: string;
  secret_ciphertext: unknown;
  verified_at: Date | string | null;
  disabled_at: Date | string | null;
}

interface WorkContextRow {
  user_id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  zone: string | null;
  shift_code: string | null;
  rf_mode: string | null;
  scanner_device_reference: string | null;
  metadata: unknown;
  updated_at: Date | string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto, metadata: AuthRequestMetadata = {}): Promise<AuthResponse> {
    const email = normalizeEmail(dto.email);
    await this.assertLoginBackoffAllowsAttempt(email, metadata);
    const user = await this.usersService.findUserWithAccessByEmail(email);

    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.writeSecurityAudit(null, 'auth.login_failed', {
        emailHash: hashAuditValue(email),
        reason: 'user_not_found_or_inactive',
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      });
      await this.recordFailedLoginAttempt(email, null, 'user_not_found_or_inactive', metadata);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await verifyPassword(user.passwordHash, dto.password);

    if (!passwordMatches) {
      await this.writeSecurityAudit(user.id, 'auth.login_failed', {
        reason: 'invalid_password',
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      });
      await this.recordFailedLoginAttempt(email, user.id, 'invalid_password', metadata);
      throw new UnauthorizedException('Invalid credentials');
    }

    const activeMfaSecret = await this.findActiveMfaSecret(user.id);
    if (activeMfaSecret) {
      if (!dto.mfaCode) {
        await this.writeSecurityAudit(user.id, 'auth.mfa_challenge_required', {
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
        });
        throw new UnauthorizedException({
          code: 'MFA_CODE_REQUIRED',
          message: 'MFA code is required',
          details: [{ code: 'MFA_CODE_REQUIRED', message: 'MFA code is required' }],
        });
      }

      const secret = this.decryptMfaSecretPayload(activeMfaSecret.secret_ciphertext);

      if (!verifyTotpCode(secret, dto.mfaCode)) {
        await this.writeSecurityAudit(user.id, 'auth.login_failed', {
          reason: 'invalid_mfa_code',
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
        });
        await this.recordFailedLoginAttempt(email, user.id, 'invalid_mfa_code', metadata);
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    const authenticatedUser = this.usersService.toAuthenticatedUser(user);
    const privilegedMfaRequired = requiresPrivilegedMfa(authenticatedUser);
    if (privilegedMfaRequired && !activeMfaSecret) {
      await this.writeSecurityAudit(user.id, 'auth.mfa_enrollment_required', {
        roleCodes: authenticatedUser.warehouses.flatMap((warehouse) => warehouse.roleCodes),
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      });
    }

    await this.usersService.touchLastLogin(user.id);
    await this.clearFailedLoginAttempts(email);
    await this.writeSecurityAudit(user.id, 'auth.login_succeeded', {
      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,
      mfaSatisfied: Boolean(activeMfaSecret),
      mfaRequired: privilegedMfaRequired,
    });

    return this.buildAuthResponse(authenticatedUser, metadata, undefined, {
      activeMfaSecret: Boolean(activeMfaSecret),
      mfaSatisfied: Boolean(activeMfaSecret),
    });
  }

  async refresh(dto: RefreshTokenDto, metadata: AuthRequestMetadata = {}): Promise<AuthResponse> {
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const replacementRefreshToken = generateRefreshToken();
    const replacementHash = hashRefreshToken(replacementRefreshToken);
    const ttlSeconds = this.config.get('JWT_REFRESH_TOKEN_TTL_SECONDS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const rotated = await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaRawClient;
      const rows = await client.$queryRawUnsafe<RefreshSessionRow[]>(
        `
          SELECT id, user_id, family_id, status, expires_at
          FROM refresh_token_sessions
          WHERE token_hash = $1
          FOR UPDATE
        `,
        tokenHash,
      );
      const session = rows[0];

      if (!session) {
        await this.writeSecurityAudit(null, 'auth.refresh_failed', {
          reason: 'unknown_token',
          tokenHashPrefix: tokenHash.slice(0, 12),
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (session.status !== 'ACTIVE' || toDate(session.expires_at).getTime() <= Date.now()) {
        await client.$executeRawUnsafe(
          `UPDATE refresh_token_sessions SET status = 'COMPROMISED', revoked_at = NOW(), updated_at = NOW() WHERE family_id = $1::uuid`,
          session.family_id,
        );
        await this.writeSecurityAudit(session.user_id, 'auth.refresh_reuse_detected', {
          reason: session.status !== 'ACTIVE' ? 'non_active_session' : 'expired_session',
          sessionId: session.id,
          familyId: session.family_id,
          ipAddress: metadata.ipAddress ?? null,
          userAgent: metadata.userAgent ?? null,
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      const inserted = await client.$queryRawUnsafe<CreatedRefreshSessionRow[]>(
        `
          INSERT INTO refresh_token_sessions
            (id, user_id, token_hash, family_id, status, expires_at, ip_address, user_agent, metadata, created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'ACTIVE', $5, $6, $7, $8::jsonb, NOW(), NOW())
          RETURNING id, family_id, expires_at
        `,
        randomUUID(),
        session.user_id,
        replacementHash,
        session.family_id,
        expiresAt,
        metadata.ipAddress ?? null,
        metadata.userAgent ?? null,
        JSON.stringify({ rotatedFromSessionId: session.id }),
      );
      const created = inserted[0];
      if (!created) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      await client.$executeRawUnsafe(
        `
          UPDATE refresh_token_sessions
          SET status = 'ROTATED', revoked_at = NOW(), replaced_by_session_id = $2::uuid, updated_at = NOW()
          WHERE id = $1::uuid
        `,
        session.id,
        created.id,
      );

      return { userId: session.user_id, refreshToken: replacementRefreshToken, refreshExpiresAt: toDate(created.expires_at) };
    });

    const user = await this.usersService.findUserWithAccessById(rotated.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.writeSecurityAudit(rotated.userId, 'auth.refresh_failed', {
        reason: 'user_not_found_or_inactive',
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.writeSecurityAudit(user.id, 'auth.refresh_rotated', {
      ipAddress: metadata.ipAddress ?? null,
      userAgent: metadata.userAgent ?? null,
    });

    return this.buildAuthResponse(this.usersService.toAuthenticatedUser(user), metadata, {
      refreshToken: rotated.refreshToken,
      refreshExpiresAt: rotated.refreshExpiresAt,
    });
  }

  async revokeRefreshToken(
    user: AuthenticatedUser,
    dto: RevokeRefreshTokenDto,
  ): Promise<{ revoked: true; scope: 'single' | 'all' }> {
    if (dto.revokeAll) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE refresh_token_sessions SET status = 'REVOKED', revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND status = 'ACTIVE'`,
        user.id,
      );
      await this.writeSecurityAudit(user.id, 'auth.refresh_token_revoked', { scope: 'all' });
      return { revoked: true, scope: 'all' };
    }

    if (!dto.refreshToken) {
      throw new BadRequestException('refreshToken is required unless revokeAll is true');
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE refresh_token_sessions SET status = 'REVOKED', revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND token_hash = $2 AND status = 'ACTIVE'`,
      user.id,
      hashRefreshToken(dto.refreshToken),
    );
    await this.writeSecurityAudit(user.id, 'auth.refresh_token_revoked', { scope: 'single' });
    return { revoked: true, scope: 'single' };
  }

  async getMfaStatus(user: AuthenticatedUser): Promise<MfaStatusResponse> {
    const row = await this.findActiveMfaSecret(user.id);
    return { enabled: Boolean(row), verifiedAt: row?.verified_at ? toDate(row.verified_at) : null };
  }

  async getWorkContext(user: AuthenticatedUser): Promise<WorkContextResponse> {
    const availableWarehouses = await this.getAvailableWorkContextWarehouses(user);
    const defaultWarehouse = availableWarehouses[0];

    if (!defaultWarehouse) {
      throw new ForbiddenException('No warehouse is available for the current user');
    }

    const rows = await this.prisma.$queryRawUnsafe<WorkContextRow[]>(
      `
        SELECT
          wc.user_id,
          wc.warehouse_id,
          w.code AS warehouse_code,
          w.name AS warehouse_name,
          wc.zone,
          wc.shift_code,
          wc.rf_mode,
          wc.scanner_device_reference,
          wc.metadata,
          wc.updated_at
        FROM user_work_contexts wc
        JOIN warehouses w ON w.id = wc.warehouse_id
        WHERE wc.user_id = $1::uuid
        LIMIT 1
      `,
      user.id,
    );
    const row = rows[0];

    if (row && availableWarehouses.some((warehouse) => warehouse.id === row.warehouse_id || warehouse.code === row.warehouse_code)) {
      return toWorkContextResponse(user.id, row, availableWarehouses);
    }

    return {
      userId: user.id,
      warehouse: defaultWarehouse,
      zone: null,
      shiftCode: null,
      rfMode: WorkContextRfMode.DESKTOP,
      scannerDeviceReference: null,
      metadata: null,
      updatedAt: null,
      availableWarehouses,
    };
  }

  async updateWorkContext(
    user: AuthenticatedUser,
    dto: UpdateWorkContextDto,
  ): Promise<WorkContextResponse> {
    const availableWarehouses = await this.getAvailableWorkContextWarehouses(user);
    const warehouse = availableWarehouses.find((item) => matchesWarehouseReference(item, dto.warehouseId));

    if (!warehouse) {
      throw new ForbiddenException('Warehouse is not available for the current user');
    }

    const zone = normalizeNullableString(dto.zone);
    const shiftCode = normalizeNullableString(dto.shiftCode);
    const rfMode = dto.rfMode ?? WorkContextRfMode.DESKTOP;
    const scannerDeviceReference = normalizeNullableString(dto.scannerDeviceReference);
    const metadata = JSON.stringify(dto.metadata ?? { source: 'auth.work_context' });

    await this.prisma.$executeRawUnsafe(
      `
        INSERT INTO user_work_contexts
          (id, user_id, warehouse_id, zone, shift_code, rf_mode, scanner_device_reference, metadata, created_at, updated_at)
        VALUES
          ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET warehouse_id = EXCLUDED.warehouse_id,
            zone = EXCLUDED.zone,
            shift_code = EXCLUDED.shift_code,
            rf_mode = EXCLUDED.rf_mode,
            scanner_device_reference = EXCLUDED.scanner_device_reference,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
      `,
      randomUUID(),
      user.id,
      warehouse.id,
      zone,
      shiftCode,
      rfMode,
      scannerDeviceReference,
      metadata,
    );

    await this.writeSecurityAudit(user.id, 'auth.work_context_updated', {
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      zone,
      shiftCode,
      rfMode,
      scannerDeviceReference,
    });

    return this.getWorkContext(user);
  }

  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
  ): Promise<{ changed: true }> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });

    if (!row || !(await verifyPassword(row.passwordHash, dto.currentPassword))) {
      await this.writeSecurityAudit(user.id, 'auth.password_change_failed', {
        reason: 'invalid_current_password',
      });
      throw new UnauthorizedException('Current password is invalid');
    }

    if (await verifyPassword(row.passwordHash, dto.newPassword)) {
      throw new BadRequestException('New password must be different from current password');
    }

    assertStrongPassword(dto.newPassword, { rejectPlaceholders: true });

    const passwordHash = await hash(dto.newPassword);
    await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaRawClient;
      await client.$executeRawUnsafe(
        `
          UPDATE users
          SET password_hash = $2,
              session_version = session_version + 1,
              updated_at = NOW()
          WHERE id = $1::uuid
        `,
        user.id,
        passwordHash,
      );
      await this.revokeActiveRefreshSessions(client, user.id);
    });

    await this.writeSecurityAudit(user.id, 'auth.password_changed', {
      selfService: true,
      sessionsInvalidated: true,
    });

    return { changed: true };
  }

  async startMfaSetup(user: AuthenticatedUser): Promise<MfaSetupResponse> {
    const issuer = this.config.get('MFA_TOTP_ISSUER', { infer: true });
    const secret = generateTotpSecret();
    const encrypted = encryptMfaSecret(
      secret,
      this.getMfaEncryptionSecret(),
      this.config.get('MFA_SECRET_ENCRYPTION_KEY_ID', { infer: true }),
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE mfa_totp_secrets SET disabled_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND verified_at IS NULL AND disabled_at IS NULL`,
      user.id,
    );
    await this.prisma.$executeRawUnsafe(
      `
        INSERT INTO mfa_totp_secrets
          (id, user_id, secret_ciphertext, secret_last4, label, metadata, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, 'default', $5::jsonb, NOW(), NOW())
      `,
      randomUUID(),
      user.id,
      JSON.stringify(encrypted),
      secret.slice(-4),
      JSON.stringify({ issuer }),
    );
    await this.writeSecurityAudit(user.id, 'auth.mfa_setup_started', { issuer, keyId: encrypted.kid ?? null });

    return {
      secret,
      issuer,
      accountName: user.email,
      otpAuthUri: buildOtpAuthUri({ issuer, accountName: user.email, secret }),
    };
  }

  async verifyMfaSetup(user: AuthenticatedUser, dto: VerifyMfaDto): Promise<MfaStatusResponse> {
    const row = await this.findPendingMfaSecret(user.id);
    if (!row) {
      throw new BadRequestException('MFA setup has not been started');
    }

    const secret = this.decryptMfaSecretPayload(row.secret_ciphertext);
    if (!verifyTotpCode(secret, dto.code)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaRawClient;
      await client.$executeRawUnsafe(
        `UPDATE mfa_totp_secrets SET disabled_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND verified_at IS NOT NULL AND disabled_at IS NULL`,
        user.id,
      );
      await client.$executeRawUnsafe(
        `UPDATE mfa_totp_secrets SET verified_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
        row.id,
      );
      await this.bumpUserSessionVersion(client, user.id);
      await this.revokeActiveRefreshSessions(client, user.id);
    });
    await this.writeSecurityAudit(user.id, 'auth.mfa_enabled', { secretId: row.id, sessionsInvalidated: true });

    return this.getMfaStatus(user);
  }

  async disableMfa(user: AuthenticatedUser, dto: VerifyMfaDto): Promise<MfaStatusResponse> {
    const row = await this.findActiveMfaSecret(user.id);
    if (!row) {
      return { enabled: false, verifiedAt: null };
    }

    const secret = this.decryptMfaSecretPayload(row.secret_ciphertext);
    if (!verifyTotpCode(secret, dto.code)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaRawClient;
      await client.$executeRawUnsafe(
        `UPDATE mfa_totp_secrets SET disabled_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND disabled_at IS NULL`,
        user.id,
      );
      await this.bumpUserSessionVersion(client, user.id);
      await this.revokeActiveRefreshSessions(client, user.id);
    });
    await this.writeSecurityAudit(user.id, 'auth.mfa_disabled', { secretId: row.id, sessionsInvalidated: true });

    return { enabled: false, verifiedAt: null };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const verification = await this.verifyAccessTokenContext(token);
    return verification.user;
  }

  async verifyAccessTokenContext(token: string): Promise<AccessTokenVerificationResult> {
    const payload = await this.verifyToken(token);
    const user = await this.usersService.findUserWithAccessById(payload.sub);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid access token');
    }

    if ((payload.sessionVersion ?? 0) !== user.sessionVersion) {
      throw new UnauthorizedException('Invalid access token');
    }

    const authenticatedUser = this.usersService.toAuthenticatedUser(user);
    const mfaRequired = requiresPrivilegedMfa(authenticatedUser);
    const activeMfaSecret = Boolean(await this.findActiveMfaSecret(user.id));
    const mfaSatisfied = Boolean(payload.mfaSatisfied && activeMfaSecret);

    return {
      user: authenticatedUser,
      auth: {
        mfaRequired,
        mfaEnrolled: activeMfaSecret,
        mfaSatisfied,
        mfaEnrollmentRequired: mfaRequired && !activeMfaSecret,
        authTime: payload.authTime ? new Date(payload.authTime * 1000).toISOString() : null,
        tokenIssuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      },
    };
  }

  private getMfaEncryptionSecret(): string {
    return this.config.get('MFA_SECRET_ENCRYPTION_KEY', { infer: true });
  }

  private async buildAuthResponse(
    user: AuthenticatedUser,
    metadata: AuthRequestMetadata,
    refreshOverride?: { refreshToken: string; refreshExpiresAt: Date },
    mfaOverride?: { activeMfaSecret: boolean; mfaSatisfied: boolean },
  ): Promise<AuthResponse> {
    const expiresIn = this.config.get('JWT_ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const refreshTtlSeconds = this.config.get('JWT_REFRESH_TOKEN_TTL_SECONDS', { infer: true });
    const sessionVersion = await this.getUserSessionVersion(user.id);
    const activeMfaSecret = mfaOverride?.activeMfaSecret ?? Boolean(await this.findActiveMfaSecret(user.id));
    const mfaSatisfied = mfaOverride?.mfaSatisfied ?? activeMfaSecret;
    const mfaRequired = requiresPrivilegedMfa(user);
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      sessionVersion,
      mfaEnrolled: activeMfaSecret,
      mfaSatisfied,
      authTime: Math.floor(Date.now() / 1000),
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('JWT_SECRET', { infer: true }),
      issuer: this.config.get('JWT_ISSUER', { infer: true }),
      audience: this.config.get('JWT_AUDIENCE', { infer: true }),
      expiresIn,
      header: { alg: 'HS256', kid: this.config.get('JWT_KEY_ID', { infer: true }) },
    });

    const refresh = refreshOverride ?? await this.createRefreshSession(user, metadata, refreshTtlSeconds);

    return {
      accessToken,
      refreshToken: refresh.refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      refreshExpiresIn: Math.max(0, Math.floor((refresh.refreshExpiresAt.getTime() - Date.now()) / 1000)),
      mfaRequired,
      mfaSatisfied,
      mfaEnrollmentRequired: mfaRequired && !activeMfaSecret,
      user,
    };
  }

  private async createRefreshSession(
    user: AuthenticatedUser,
    metadata: AuthRequestMetadata,
    ttlSeconds: number,
  ): Promise<{ refreshToken: string; refreshExpiresAt: Date }> {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const rows = await this.prisma.$queryRawUnsafe<CreatedRefreshSessionRow[]>(
      `
        INSERT INTO refresh_token_sessions
          (id, user_id, token_hash, family_id, status, expires_at, ip_address, user_agent, metadata, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'ACTIVE', $5, $6, $7, $8::jsonb, NOW(), NOW())
        RETURNING id, family_id, expires_at
      `,
      randomUUID(),
      user.id,
      hashRefreshToken(refreshToken),
      randomUUID(),
      expiresAt,
      metadata.ipAddress ?? null,
      metadata.userAgent ?? null,
      JSON.stringify({ createdBy: 'login' }),
    );

    const created = rows[0];
    if (!created) {
      throw new BadRequestException('Refresh token session was not created');
    }

    return { refreshToken, refreshExpiresAt: toDate(created.expires_at) };
  }

  private async findActiveMfaSecret(userId: string): Promise<MfaSecretRow | null> {
    const rows = await this.prisma.$queryRawUnsafe<MfaSecretRow[]>(
      `
        SELECT id, user_id, secret_ciphertext, verified_at, disabled_at
        FROM mfa_totp_secrets
        WHERE user_id = $1::uuid AND verified_at IS NOT NULL AND disabled_at IS NULL
        ORDER BY verified_at DESC
        LIMIT 1
      `,
      userId,
    );
    return rows[0] ?? null;
  }

  private async findPendingMfaSecret(userId: string): Promise<MfaSecretRow | null> {
    const rows = await this.prisma.$queryRawUnsafe<MfaSecretRow[]>(
      `
        SELECT id, user_id, secret_ciphertext, verified_at, disabled_at
        FROM mfa_totp_secrets
        WHERE user_id = $1::uuid AND verified_at IS NULL AND disabled_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      userId,
    );
    return rows[0] ?? null;
  }

  private async getAvailableWorkContextWarehouses(
    user: AuthenticatedUser,
  ): Promise<WorkContextWarehouse[]> {
    const fromSession = uniqueWarehouses(
      user.warehouses.map((warehouse) => ({
        id: warehouse.warehouseId,
        code: warehouse.warehouseCode,
        name: warehouse.warehouseName,
      })),
    );

    if (!user.permissions.includes('*')) {
      return fromSession;
    }

    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string; code: string; name: string }>>(
      `
        SELECT id, code, name
        FROM warehouses
        WHERE status = 'ACTIVE'
        ORDER BY code ASC
        LIMIT 100
      `,
    );

    return uniqueWarehouses([...fromSession, ...rows]);
  }

  private async assertLoginBackoffAllowsAttempt(
    email: string,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    if (!this.isLoginBackoffEnabled()) {
      return;
    }

    const rows = await this.prisma.$queryRawUnsafe<AuthLoginAttemptRow[]>(
      `
        SELECT id, failed_count, first_failed_at, last_failed_at, locked_until
        FROM auth_login_attempts
        WHERE email_hash = $1
        LIMIT 1
      `,
      hashAuditValue(email),
    );
    const lockedUntil = rows[0]?.locked_until ? toDate(rows[0].locked_until) : null;

    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      await this.writeSecurityAudit(null, 'auth.login_backoff_rejected', {
        emailHash: hashAuditValue(email),
        lockedUntil: lockedUntil.toISOString(),
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      });
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private async recordFailedLoginAttempt(
    email: string,
    userId: string | null,
    reason: string,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    if (!this.isLoginBackoffEnabled()) {
      return;
    }

    const emailHash = hashAuditValue(email);
    const now = new Date();
    const threshold = this.config.get('AUTH_FAILED_LOGIN_BACKOFF_THRESHOLD', { infer: true });
    const windowSeconds = this.config.get('AUTH_FAILED_LOGIN_BACKOFF_WINDOW_SECONDS', { infer: true });
    const baseSeconds = this.config.get('AUTH_FAILED_LOGIN_BACKOFF_BASE_SECONDS', { infer: true });
    const maxSeconds = this.config.get('AUTH_FAILED_LOGIN_BACKOFF_MAX_SECONDS', { infer: true });

    const result = await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaRawClient;
      const rows = await client.$queryRawUnsafe<AuthLoginAttemptRow[]>(
        `
          SELECT id, failed_count, first_failed_at, last_failed_at, locked_until
          FROM auth_login_attempts
          WHERE email_hash = $1
          FOR UPDATE
        `,
        emailHash,
      );
      const row = rows[0];
      const previousLastFailedAt = row?.last_failed_at ? toDate(row.last_failed_at) : null;
      const withinWindow = previousLastFailedAt
        ? now.getTime() - previousLastFailedAt.getTime() <= windowSeconds * 1000
        : false;
      const failedCount = withinWindow ? Number(row?.failed_count ?? 0) + 1 : 1;
      const firstFailedAt = withinWindow && row?.first_failed_at ? toDate(row.first_failed_at) : now;
      const lockSeconds = failedCount >= threshold
        ? Math.min(maxSeconds, Math.trunc(baseSeconds * 2 ** Math.max(0, failedCount - threshold)))
        : 0;
      const lockedUntil = lockSeconds > 0 ? new Date(now.getTime() + lockSeconds * 1000) : null;
      const failureMetadata = JSON.stringify({
        reason,
        failedCount,
        windowSeconds,
        threshold,
      });

      if (row) {
        await client.$executeRawUnsafe(
          `
            UPDATE auth_login_attempts
            SET user_id = COALESCE($2::uuid, user_id),
                failed_count = $3,
                first_failed_at = $4,
                last_failed_at = $5,
                locked_until = $6,
                last_ip_hash = $7,
                last_user_agent_hash = $8,
                metadata = $9::jsonb,
                updated_at = NOW()
            WHERE email_hash = $1
          `,
          emailHash,
          userId,
          failedCount,
          firstFailedAt,
          now,
          lockedUntil,
          hashNullableAuditValue(metadata.ipAddress),
          hashNullableAuditValue(metadata.userAgent),
          failureMetadata,
        );
      } else {
        await client.$executeRawUnsafe(
          `
            INSERT INTO auth_login_attempts
              (id, email_hash, user_id, failed_count, first_failed_at, last_failed_at, locked_until, last_ip_hash, last_user_agent_hash, metadata, created_at, updated_at)
            VALUES
              ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW(), NOW())
          `,
          randomUUID(),
          emailHash,
          userId,
          failedCount,
          firstFailedAt,
          now,
          lockedUntil,
          hashNullableAuditValue(metadata.ipAddress),
          hashNullableAuditValue(metadata.userAgent),
          failureMetadata,
        );
      }

      return { failedCount, lockedUntil };
    });

    if (result.lockedUntil) {
      await this.writeSecurityAudit(userId, 'auth.login_backoff_locked', {
        emailHash,
        reason,
        failedCount: result.failedCount,
        lockedUntil: result.lockedUntil.toISOString(),
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
      });
    }
  }

  private async clearFailedLoginAttempts(email: string): Promise<void> {
    if (!this.isLoginBackoffEnabled()) {
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM auth_login_attempts WHERE email_hash = $1`,
      hashAuditValue(email),
    );
  }

  private isLoginBackoffEnabled(): boolean {
    return this.config.get('AUTH_FAILED_LOGIN_BACKOFF_ENABLED', { infer: true });
  }

  private decryptMfaSecretPayload(payload: unknown): string {
    const secrets = [
      this.config.get('MFA_SECRET_ENCRYPTION_KEY', { infer: true }),
      ...this.config.get('MFA_PREVIOUS_SECRET_ENCRYPTION_KEYS', { infer: true }).map((entry) => entry.secret),
    ];

    for (const secret of secrets) {
      try {
        return decryptMfaSecret(payload, secret);
      } catch {
        continue;
      }
    }

    throw new UnauthorizedException('Invalid MFA secret');
  }

  private async getUserSessionVersion(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ session_version: unknown }>>(
      `SELECT session_version FROM users WHERE id = $1::uuid`,
      userId,
    );
    return Number(rows[0]?.session_version ?? 0);
  }

  private bumpUserSessionVersion(client: PrismaRawClient, userId: string): Promise<unknown> {
    return client.$executeRawUnsafe(
      `UPDATE users SET session_version = session_version + 1, updated_at = NOW() WHERE id = $1::uuid`,
      userId,
    );
  }

  private revokeActiveRefreshSessions(client: PrismaRawClient, userId: string): Promise<unknown> {
    return client.$executeRawUnsafe(
      `UPDATE refresh_token_sessions SET status = 'REVOKED', revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND status = 'ACTIVE'`,
      userId,
    );
  }

  private async writeSecurityAudit(
    actorUserId: string | null,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId,
          warehouseId: null,
          action,
          resourceType: 'auth_security_event',
          resourceId: actorUserId,
          metadata: JSON.parse(JSON.stringify(metadata)),
        },
      });
    } catch (error: unknown) {
      this.logger.error(JSON.stringify({
        event: 'security_audit_write_failed',
        action,
        actorUserId,
        error: error instanceof Error ? error.message : 'unknown_error',
      }));
    }
  }

  private async verifyToken(token: string): Promise<AccessTokenPayload> {
    const secrets = [
      this.config.get('JWT_SECRET', { infer: true }),
      ...this.config.get('JWT_PREVIOUS_SECRETS', { infer: true }),
    ];

    for (const secret of secrets) {
      try {
        return await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
          secret,
          issuer: this.config.get('JWT_ISSUER', { infer: true }),
          audience: this.config.get('JWT_AUDIENCE', { infer: true }),
        });
      } catch {
        continue;
      }
    }

    throw new UnauthorizedException('Invalid access token');
  }
}

interface PrismaRawClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (passwordHash.length === 0) {
    return false;
  }

  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

function matchesWarehouseReference(warehouse: WorkContextWarehouse, reference: string): boolean {
  const normalized = normalizeReference(reference);
  return warehouse.id === reference || normalizeReference(warehouse.code) === normalized;
}

function uniqueWarehouses(warehouses: WorkContextWarehouse[]): WorkContextWarehouse[] {
  const seen = new Set<string>();
  return warehouses
    .filter((warehouse) => warehouse.id && warehouse.code)
    .filter((warehouse) => {
      const key = `${warehouse.id}:${normalizeReference(warehouse.code)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function toWorkContextResponse(
  userId: string,
  row: WorkContextRow,
  availableWarehouses: WorkContextWarehouse[],
): WorkContextResponse {
  return {
    userId,
    warehouse: {
      id: row.warehouse_id,
      code: row.warehouse_code,
      name: row.warehouse_name,
    },
    zone: row.zone,
    shiftCode: row.shift_code,
    rfMode: normalizeRfMode(row.rf_mode),
    scannerDeviceReference: row.scanner_device_reference,
    metadata: row.metadata ?? null,
    updatedAt: row.updated_at ? toDate(row.updated_at).toISOString() : null,
    availableWarehouses,
  };
}

function normalizeRfMode(value: string | null | undefined): WorkContextResponse['rfMode'] {
  if (value === WorkContextRfMode.MOBILE || value === WorkContextRfMode.TERMINAL) {
    return value;
  }
  return WorkContextRfMode.DESKTOP;
}

function requiresPrivilegedMfa(user: AuthenticatedUser): boolean {
  if (user.permissions.includes('*')) {
    return true;
  }

  return user.warehouses.some((warehouse) =>
    warehouse.roleCodes.some((roleCode) => roleCode === 'WMS_ADMIN' || roleCode === 'WAREHOUSE_MANAGER'),
  );
}

function generateRefreshToken(): string {
  return `rt_${randomBytes(48).toString('base64url')}`;
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashAuditValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashNullableAuditValue(value: string | null | undefined): string | null {
  return value ? hashAuditValue(value) : null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
