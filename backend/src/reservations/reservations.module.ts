import { Module } from '@nestjs/common';

import { AllocationModule } from '../allocation';
import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [DatabaseModule, AllocationModule, ClientsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
