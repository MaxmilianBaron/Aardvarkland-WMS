import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { AccessGuard } from './guards/access.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccessGuard,
    },
  ],
})
export class AccessControlModule {}
