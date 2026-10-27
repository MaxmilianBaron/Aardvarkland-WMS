import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from '../../auth/auth.service';
import { PUBLIC_ROUTE_KEY } from '../access-control.constants';
import { AuthenticatedRequest } from '../authenticated-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.getBearerToken(request);

    const verification = await this.authService.verifyAccessTokenContext(token);
    request.user = verification.user;
    request.auth = verification.auth;

    return true;
  }

  private getBearerToken(request: AuthenticatedRequest): string {
    const authorization = request.headers['authorization'];
    const value = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!value) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const [scheme, token] = value.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    return token;
  }
}
