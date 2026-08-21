import { AsyncLocalStorage } from 'node:async_hooks';

import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { Env } from '../config/env';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import {
  TenantRlsContext,
  applyTenantRlsContext,
  assertTenantRlsScope,
  hasTenantRlsScope,
  normalizeTenantRlsContext,
} from './tenant-rls.helpers';

const tenantContextStorage = new AsyncLocalStorage<TenantRlsContext>();

type TransactionCallback<T> = (client: unknown) => Promise<T>;
type RawSqlClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};
type TenantAwareDelegateName =
  | 'inboundShipment'
  | 'outboundOrder'
  | 'handlingUnit'
  | 'stockQuant'
  | 'reservation'
  | 'warehouseTask'
  | 'stockMovement'
  | 'shipment'
  | 'shipmentPackage'
  | 'carrierLabel'
  | 'pickWave'
  | 'skuLot'
  | 'serialNumber'
  | 'serialNumberEvent'
  | 'warehouseOrder'
  | 'warehouseOrderLine'
  | 'warehouseOrderTask'
  | 'parcel'
  | 'trackingEvent'
  | 'wmsException'
  | 'inboundShipmentLine'
  | 'outboundOrderLine'
  | 'scannerDevice'
  | 'labelTemplate'
  | 'labelPrintJob'
  | 'notification'
  | 'scannerSession'
  | 'scannerWorkflowStep'
  | 'stockFreeze'
  | 'cycleCountPlan'
  | 'cycleCountTask'
  | 'replenishmentRule'
  | 'replenishmentDemand'
  | 'packingStation'
  | 'packageContent'
  | 'pickWaveOrder'
  | 'pickWaveTask'
  | 'pickCart'
  | 'pickTote'
  | 'carrierCredential'
  | 'carrierTrackingEvent'
  | 'slottingRule'
  | 'skuVelocity'
  | 'slottingRecommendation'
  | 'returnOrder'
  | 'returnOrderLine'
  | 'returnInspection'
  | 'qualityInspection'
  | 'qualitySamplingRule'
  | 'externalIdMapping'
  | 'domainEvent'
  | 'webhookSubscription'
  | 'webhookDeliveryAttempt'
  | 'automationDevice'
  | 'automationCommand'
  | 'automationEvent'
  | 'dockDoor'
  | 'yardTrailer'
  | 'dockAppointment'
  | 'crossDockPlan'
  | 'crossDockPlanLine'
  | 'vasServiceCatalog'
  | 'kitBomHeader'
  | 'kitBomLine'
  | 'vasTask';

const TENANT_AWARE_DELEGATE_OPERATIONS = new Set<string>([
  'aggregate',
  'count',
  'create',
  'createMany',
  'createManyAndReturn',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    const adapter = new PrismaPg({
      connectionString: withDatabaseSessionOptions(config.get('DATABASE_URL', { infer: true }), {
        statementTimeoutMs: config.get('DATABASE_STATEMENT_TIMEOUT_MS', { infer: true }),
        lockTimeoutMs: config.get('DATABASE_LOCK_TIMEOUT_MS', { infer: true }),
      }),
    });

    const queryLogEnabled =
      process.env['PRISMA_QUERY_LOG'] === '1' ||
      (process.env['NODE_ENV'] === 'development' && process.env['PRISMA_QUERY_LOG'] !== '0');

    super({
      adapter,
      log: queryLogEnabled ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  runWithTenantContext<T>(context: TenantRlsContext, callback: () => T): T {
    return tenantContextStorage.run(normalizeTenantRlsContext(context), callback);
  }

  runWithoutTenantContext<T>(callback: () => T): T {
    return tenantContextStorage.run({}, callback);
  }

  getTenantContext(): TenantRlsContext | undefined {
    return tenantContextStorage.getStore();
  }

  async withTenantRls<T>(callback: TransactionCallback<T>, context?: TenantRlsContext): Promise<T> {
    const tenantContext = assertTenantRlsScope(context ?? this.getTenantContext());

    return super.$transaction(async (tx: unknown) => {
      await this.runWithoutTenantContext(() =>
        applyTenantRlsContext(tx as { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown> }, tenantContext),
      );
      return this.runWithoutTenantContext(() => callback(tx));
    });
  }

  override $queryRawUnsafe<T = unknown>(
    query: string,
    ...values: unknown[]
  ): Prisma.PrismaPromise<T> {
    const tenantContext = this.getScopedTenantContext();
    if (!tenantContext) {
      return super.$queryRawUnsafe<T>(query, ...values);
    }

    return this.withTenantRls(
      (tx) => (tx as RawSqlClient).$queryRawUnsafe<T>(query, ...values),
      tenantContext,
    ) as Prisma.PrismaPromise<T>;
  }

  override $executeRawUnsafe(
    query: string,
    ...values: unknown[]
  ): Prisma.PrismaPromise<number> {
    const tenantContext = this.getScopedTenantContext();
    if (!tenantContext) {
      return super.$executeRawUnsafe(query, ...values);
    }

    return this.withTenantRls(
      (tx) => (tx as RawSqlClient).$executeRawUnsafe<number>(query, ...values),
      tenantContext,
    ) as Prisma.PrismaPromise<number>;
  }

  override get inboundShipment(): PrismaClient['inboundShipment'] { return this.tenantAwareDelegate('inboundShipment', super.inboundShipment); }
  override get outboundOrder(): PrismaClient['outboundOrder'] { return this.tenantAwareDelegate('outboundOrder', super.outboundOrder); }
  override get handlingUnit(): PrismaClient['handlingUnit'] { return this.tenantAwareDelegate('handlingUnit', super.handlingUnit); }
  override get stockQuant(): PrismaClient['stockQuant'] { return this.tenantAwareDelegate('stockQuant', super.stockQuant); }
  override get reservation(): PrismaClient['reservation'] { return this.tenantAwareDelegate('reservation', super.reservation); }
  override get warehouseTask(): PrismaClient['warehouseTask'] { return this.tenantAwareDelegate('warehouseTask', super.warehouseTask); }
  override get stockMovement(): PrismaClient['stockMovement'] { return this.tenantAwareDelegate('stockMovement', super.stockMovement); }
  override get shipment(): PrismaClient['shipment'] { return this.tenantAwareDelegate('shipment', super.shipment); }
  override get shipmentPackage(): PrismaClient['shipmentPackage'] { return this.tenantAwareDelegate('shipmentPackage', super.shipmentPackage); }
  override get carrierLabel(): PrismaClient['carrierLabel'] { return this.tenantAwareDelegate('carrierLabel', super.carrierLabel); }
  override get pickWave(): PrismaClient['pickWave'] { return this.tenantAwareDelegate('pickWave', super.pickWave); }
  override get skuLot(): PrismaClient['skuLot'] { return this.tenantAwareDelegate('skuLot', super.skuLot); }
  override get serialNumber(): PrismaClient['serialNumber'] { return this.tenantAwareDelegate('serialNumber', super.serialNumber); }
  override get serialNumberEvent(): PrismaClient['serialNumberEvent'] { return this.tenantAwareDelegate('serialNumberEvent', super.serialNumberEvent); }
  override get warehouseOrder(): PrismaClient['warehouseOrder'] { return this.tenantAwareDelegate('warehouseOrder', super.warehouseOrder); }
  override get warehouseOrderLine(): PrismaClient['warehouseOrderLine'] { return this.tenantAwareDelegate('warehouseOrderLine', super.warehouseOrderLine); }
  override get warehouseOrderTask(): PrismaClient['warehouseOrderTask'] { return this.tenantAwareDelegate('warehouseOrderTask', super.warehouseOrderTask); }
  override get parcel(): PrismaClient['parcel'] { return this.tenantAwareDelegate('parcel', super.parcel); }
  override get trackingEvent(): PrismaClient['trackingEvent'] { return this.tenantAwareDelegate('trackingEvent', super.trackingEvent); }
  override get wmsException(): PrismaClient['wmsException'] { return this.tenantAwareDelegate('wmsException', super.wmsException); }
  override get inboundShipmentLine(): PrismaClient['inboundShipmentLine'] { return this.tenantAwareDelegate('inboundShipmentLine', super.inboundShipmentLine); }
  override get outboundOrderLine(): PrismaClient['outboundOrderLine'] { return this.tenantAwareDelegate('outboundOrderLine', super.outboundOrderLine); }
  override get scannerDevice(): PrismaClient['scannerDevice'] { return this.tenantAwareDelegate('scannerDevice', super.scannerDevice); }
  override get labelTemplate(): PrismaClient['labelTemplate'] { return this.tenantAwareDelegate('labelTemplate', super.labelTemplate); }
  override get labelPrintJob(): PrismaClient['labelPrintJob'] { return this.tenantAwareDelegate('labelPrintJob', super.labelPrintJob); }
  override get notification(): PrismaClient['notification'] { return this.tenantAwareDelegate('notification', super.notification); }
  override get scannerSession(): PrismaClient['scannerSession'] { return this.tenantAwareDelegate('scannerSession', super.scannerSession); }
  override get scannerWorkflowStep(): PrismaClient['scannerWorkflowStep'] { return this.tenantAwareDelegate('scannerWorkflowStep', super.scannerWorkflowStep); }
  override get stockFreeze(): PrismaClient['stockFreeze'] { return this.tenantAwareDelegate('stockFreeze', super.stockFreeze); }
  override get cycleCountPlan(): PrismaClient['cycleCountPlan'] { return this.tenantAwareDelegate('cycleCountPlan', super.cycleCountPlan); }
  override get cycleCountTask(): PrismaClient['cycleCountTask'] { return this.tenantAwareDelegate('cycleCountTask', super.cycleCountTask); }
  override get replenishmentRule(): PrismaClient['replenishmentRule'] { return this.tenantAwareDelegate('replenishmentRule', super.replenishmentRule); }
  override get replenishmentDemand(): PrismaClient['replenishmentDemand'] { return this.tenantAwareDelegate('replenishmentDemand', super.replenishmentDemand); }
  override get packingStation(): PrismaClient['packingStation'] { return this.tenantAwareDelegate('packingStation', super.packingStation); }
  override get packageContent(): PrismaClient['packageContent'] { return this.tenantAwareDelegate('packageContent', super.packageContent); }
  override get pickWaveOrder(): PrismaClient['pickWaveOrder'] { return this.tenantAwareDelegate('pickWaveOrder', super.pickWaveOrder); }
  override get pickWaveTask(): PrismaClient['pickWaveTask'] { return this.tenantAwareDelegate('pickWaveTask', super.pickWaveTask); }
  override get pickCart(): PrismaClient['pickCart'] { return this.tenantAwareDelegate('pickCart', super.pickCart); }
  override get pickTote(): PrismaClient['pickTote'] { return this.tenantAwareDelegate('pickTote', super.pickTote); }
  override get carrierCredential(): PrismaClient['carrierCredential'] { return this.tenantAwareDelegate('carrierCredential', super.carrierCredential); }
  override get carrierTrackingEvent(): PrismaClient['carrierTrackingEvent'] { return this.tenantAwareDelegate('carrierTrackingEvent', super.carrierTrackingEvent); }
  override get slottingRule(): PrismaClient['slottingRule'] { return this.tenantAwareDelegate('slottingRule', super.slottingRule); }
  override get skuVelocity(): PrismaClient['skuVelocity'] { return this.tenantAwareDelegate('skuVelocity', super.skuVelocity); }
  override get slottingRecommendation(): PrismaClient['slottingRecommendation'] { return this.tenantAwareDelegate('slottingRecommendation', super.slottingRecommendation); }
  override get returnOrder(): PrismaClient['returnOrder'] { return this.tenantAwareDelegate('returnOrder', super.returnOrder); }
  override get returnOrderLine(): PrismaClient['returnOrderLine'] { return this.tenantAwareDelegate('returnOrderLine', super.returnOrderLine); }
  override get returnInspection(): PrismaClient['returnInspection'] { return this.tenantAwareDelegate('returnInspection', super.returnInspection); }
  override get qualityInspection(): PrismaClient['qualityInspection'] { return this.tenantAwareDelegate('qualityInspection', super.qualityInspection); }
  override get qualitySamplingRule(): PrismaClient['qualitySamplingRule'] { return this.tenantAwareDelegate('qualitySamplingRule', super.qualitySamplingRule); }
  override get externalIdMapping(): PrismaClient['externalIdMapping'] { return this.tenantAwareDelegate('externalIdMapping', super.externalIdMapping); }
  override get domainEvent(): PrismaClient['domainEvent'] { return this.tenantAwareDelegate('domainEvent', super.domainEvent); }
  override get webhookSubscription(): PrismaClient['webhookSubscription'] { return this.tenantAwareDelegate('webhookSubscription', super.webhookSubscription); }
  override get webhookDeliveryAttempt(): PrismaClient['webhookDeliveryAttempt'] { return this.tenantAwareDelegate('webhookDeliveryAttempt', super.webhookDeliveryAttempt); }
  override get automationDevice(): PrismaClient['automationDevice'] { return this.tenantAwareDelegate('automationDevice', super.automationDevice); }
  override get automationCommand(): PrismaClient['automationCommand'] { return this.tenantAwareDelegate('automationCommand', super.automationCommand); }
  override get automationEvent(): PrismaClient['automationEvent'] { return this.tenantAwareDelegate('automationEvent', super.automationEvent); }
  override get dockDoor(): PrismaClient['dockDoor'] { return this.tenantAwareDelegate('dockDoor', super.dockDoor); }
  override get yardTrailer(): PrismaClient['yardTrailer'] { return this.tenantAwareDelegate('yardTrailer', super.yardTrailer); }
  override get dockAppointment(): PrismaClient['dockAppointment'] { return this.tenantAwareDelegate('dockAppointment', super.dockAppointment); }
  override get crossDockPlan(): PrismaClient['crossDockPlan'] { return this.tenantAwareDelegate('crossDockPlan', super.crossDockPlan); }
  override get crossDockPlanLine(): PrismaClient['crossDockPlanLine'] { return this.tenantAwareDelegate('crossDockPlanLine', super.crossDockPlanLine); }
  override get vasServiceCatalog(): PrismaClient['vasServiceCatalog'] { return this.tenantAwareDelegate('vasServiceCatalog', super.vasServiceCatalog); }
  override get kitBomHeader(): PrismaClient['kitBomHeader'] { return this.tenantAwareDelegate('kitBomHeader', super.kitBomHeader); }
  override get kitBomLine(): PrismaClient['kitBomLine'] { return this.tenantAwareDelegate('kitBomLine', super.kitBomLine); }
  override get vasTask(): PrismaClient['vasTask'] { return this.tenantAwareDelegate('vasTask', super.vasTask); }

  private getScopedTenantContext(): TenantRlsContext | undefined {
    const tenantContext = this.getTenantContext();
    return hasTenantRlsScope(tenantContext) ? tenantContext : undefined;
  }

  private tenantAwareDelegate<TDelegate extends object>(
    delegateName: TenantAwareDelegateName,
    delegate: TDelegate,
  ): TDelegate {
    const tenantContext = this.getScopedTenantContext();
    if (!tenantContext) {
      return delegate;
    }

    return new Proxy(delegate, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver);

        if (typeof value !== 'function') {
          return value;
        }

        if (typeof property !== 'string' || !TENANT_AWARE_DELEGATE_OPERATIONS.has(property)) {
          return value.bind(target);
        }

        return (...args: unknown[]) =>
          this.withTenantRls(async (tx) => {
            const txDelegate = (tx as Record<TenantAwareDelegateName, Record<string, (...operationArgs: unknown[]) => Promise<unknown>>>)[delegateName];
            return txDelegate[property]!(...args);
          }, tenantContext);
      },
    }) as TDelegate;
  }

  override $transaction = (async (arg: unknown, options?: unknown): Promise<unknown> => {
    if (typeof arg !== 'function') {
      return super.$transaction(arg as never, options as never);
    }

    const tenantContext = this.getTenantContext();
    if (!tenantContext) {
      return super.$transaction(arg as never, options as never);
    }

    return super.$transaction(async (tx: unknown) => {
      await this.runWithoutTenantContext(() =>
        applyTenantRlsContext(tx as { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown> }, tenantContext),
      );
      return this.runWithoutTenantContext(() => (arg as TransactionCallback<unknown>)(tx));
    }, options as never);
  }) as PrismaClient['$transaction'];
}

export function withDatabaseSessionOptions(
  connectionString: string,
  input: { statementTimeoutMs: number; lockTimeoutMs: number },
): string {
  const options: string[] = [];

  if (input.statementTimeoutMs > 0) {
    options.push(`-c statement_timeout=${Math.trunc(input.statementTimeoutMs)}`);
  }

  if (input.lockTimeoutMs > 0) {
    options.push(`-c lock_timeout=${Math.trunc(input.lockTimeoutMs)}`);
  }

  if (options.length === 0) {
    return connectionString;
  }

  const url = new URL(connectionString);
  const existingOptions = url.searchParams.get('options')?.trim();
  url.searchParams.set('options', [existingOptions, ...options].filter(Boolean).join(' '));
  return url.toString();
}
