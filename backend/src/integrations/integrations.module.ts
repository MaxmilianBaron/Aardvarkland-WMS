import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { IntegrationDispatchService } from './integration-dispatch.service';
import { IntegrationEnterpriseController } from './integration-enterprise.controller';
import { IntegrationEnterpriseService } from './integration-enterprise.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IntegrationsController, IntegrationEnterpriseController],
  providers: [IntegrationsService, IntegrationDispatchService, IntegrationEnterpriseService],
  exports: [IntegrationsService, IntegrationDispatchService, IntegrationEnterpriseService],
})
export class IntegrationsModule {}
