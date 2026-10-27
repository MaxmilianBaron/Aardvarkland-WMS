import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { OwnerScopeService } from './owner-scope.service';
@Module({
  imports: [DatabaseModule],
  controllers: [ClientsController],
  providers: [ClientsService, OwnerScopeService],
  exports: [ClientsService, OwnerScopeService],
})
export class ClientsModule {}
