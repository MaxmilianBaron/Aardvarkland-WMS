import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccessControlModule } from './access-control';
import { DecisionSupportModule } from './decision-support';
import { AllocationModule } from './allocation';
import { AnalyticsModule } from './analytics';
import { AppController } from './app.controller';
import { AuthModule } from './auth';
import { AuditModule } from './audit';
import { CarriersModule } from './carriers';
import { ClientsModule } from './clients';
import { ConfigurationRulesModule } from './configuration-rules';
import { ControlTowerModule } from './control-tower';
import { CycleCountsModule } from './cycle-counts';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { EnterpriseOpsModule } from './enterprise-ops';
import { ExceptionsModule } from './exceptions';
import { FulfillmentModule } from './fulfillment';
import { HealthModule } from './health/health.module';
import { IdempotencyModule } from './idempotency';
import { InboundModule } from './inbound';
import { IntegrationsModule } from './integrations';
import { InventoryModule } from './inventory';
import { JobsModule } from './jobs';
import { LabelsModule } from './labels';
import { NotificationsModule } from './notifications';
import { ObservabilityModule } from './observability';
import { OperationsRuntimeModule } from './operations-runtime';
import { OutboundModule } from './outbound';
import { OutboxModule } from './outbox';
import { ParcelsModule } from './parcels';
import { ProductsModule } from './products';
import { ProductMasterModule } from './product-master';
import { PutawayModule } from './putaway';
import { QualityModule } from './quality';
import { RealtimeModule } from './realtime';
import { ReliabilityModule } from './reliability';
import { ReplenishmentModule } from './replenishment';
import { ReturnsModule } from './returns';
import { RfWorkflowsModule } from './rf-workflows';
import { ReservationsModule } from './reservations';
import { ScannersModule } from './scanners';
import { ShippingModule } from './shipping';
import { SlottingModule } from './slotting';
import { TraceabilityModule } from './traceability';
import { TrackingEventsModule } from './tracking-events';
import { UsersModule } from './users';
import { WarehouseOrdersModule } from './warehouse-orders';
import { WarehouseTasksModule } from './warehouse-tasks';
import { WavePickingModule } from './wave-picking';
import { WarehouseIntegrityModule } from './warehouse-integrity/warehouse-integrity.module';
import { WarehousesModule } from './warehouses';
import { WorkflowModule } from './workflow';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    EnterpriseOpsModule,
    ConfigurationRulesModule,
    OperationsRuntimeModule,
    AuthModule,
    AuditModule,
    UsersModule,
    ProductsModule,
    ProductMasterModule,
    WarehousesModule,
    ParcelsModule,
    InventoryModule,
    ReservationsModule,
    WarehouseTasksModule,
    WarehouseOrdersModule,
    AllocationModule,
    WavePickingModule,
    SlottingModule,
    WarehouseIntegrityModule,
    WorkflowModule,
    PutawayModule,
    QualityModule,
    FulfillmentModule,
    ShippingModule,
    CarriersModule,
    ClientsModule,
    RfWorkflowsModule,
    ReplenishmentModule,
    ReturnsModule,
    ObservabilityModule,
    ControlTowerModule,
    CycleCountsModule,
    TraceabilityModule,
    TrackingEventsModule,
    InboundModule,
    OutboundModule,
    ScannersModule,
    LabelsModule,
    ExceptionsModule,
    RealtimeModule,
    ReliabilityModule,
    AnalyticsModule,
    NotificationsModule,
    DecisionSupportModule,
    IntegrationsModule,
    IdempotencyModule,
    OutboxModule,
    JobsModule,
    AccessControlModule,
    HealthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
