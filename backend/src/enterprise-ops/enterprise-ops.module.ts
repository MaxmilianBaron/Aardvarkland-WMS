import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { EnterpriseOpsController } from './enterprise-ops.controller';
import { EnterpriseOpsService } from './enterprise-ops.service';

@Module({
  imports: [DatabaseModule],
  controllers: [EnterpriseOpsController],
  providers: [EnterpriseOpsService],
  exports: [EnterpriseOpsService],
})
export class EnterpriseOpsModule {}
