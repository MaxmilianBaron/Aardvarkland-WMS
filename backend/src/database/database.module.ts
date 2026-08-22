import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { TenantRlsInterceptor } from './tenant-rls.interceptor';

@Module({
  providers: [PrismaService, TenantRlsInterceptor],
  exports: [PrismaService, TenantRlsInterceptor],
})
export class DatabaseModule {}
