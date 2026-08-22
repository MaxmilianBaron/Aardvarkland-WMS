import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { Public } from '../access-control/decorators/public.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { getClientIpAddress } from '../common';
import { Env } from '../config';
import { AuthService } from './auth.service';
import { AuthRequestMetadata } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateWorkContextDto } from './dto/update-work-context.dto';
import { RevokeRefreshTokenDto } from './dto/revoke-refresh-token.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';

interface AuthHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: AuthHttpRequest) {
    return this.authService.login(dto, this.toRequestMetadata(request));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() request: AuthHttpRequest) {
    return this.authService.refresh(dto, this.toRequestMetadata(request));
  }

  @Post('revoke')
  @ApiBearerAuth()
  revokeRefreshToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RevokeRefreshTokenDto,
  ) {
    return this.authService.revokeRefreshToken(user, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('me/password')
  @ApiBearerAuth()
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user, dto);
  }

  @Get('me/mfa')
  @ApiBearerAuth()
  getMfaStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMfaStatus(user);
  }

  @Get('me/work-context')
  @ApiBearerAuth()
  getWorkContext(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getWorkContext(user);
  }

  @Put('me/work-context')
  @ApiBearerAuth()
  updateWorkContext(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateWorkContextDto,
  ) {
    return this.authService.updateWorkContext(user, dto);
  }

  @Post('me/mfa/setup')
  @ApiBearerAuth()
  startMfaSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.startMfaSetup(user);
  }

  @Post('me/mfa/verify')
  @ApiBearerAuth()
  verifyMfaSetup(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyMfaDto) {
    return this.authService.verifyMfaSetup(user, dto);
  }

  @Post('me/mfa/disable')
  @ApiBearerAuth()
  disableMfa(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyMfaDto) {
    return this.authService.disableMfa(user, dto);
  }

  @RequireWarehousePermissions('warehouse.read')
  @Get('me/warehouses/:warehouseId/access')
  @ApiBearerAuth()
  getMyWarehouseAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('warehouseId') warehouseId: string,
  ) {
    return user.warehouses.find((warehouse) => warehouse.warehouseId === warehouseId);
  }

  private toRequestMetadata(request: AuthHttpRequest): AuthRequestMetadata {
    const ipAddress = getClientIpAddress(request, {
      trustProxyHops: this.config.get('TRUST_PROXY_HOPS', { infer: true }),
    });

    return {
      ipAddress: ipAddress === 'unknown' ? null : ipAddress,
      userAgent: readHeader(request.headers, 'user-agent') ?? null,
    };
  }
}

function readHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key];
  return Array.isArray(value) ? value[0] : value;
}
