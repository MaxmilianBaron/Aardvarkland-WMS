import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { lockPostgresRowById, PrismaService, withTransactionRetry } from '../database';
import { calculateCountVariance, makeCycleCountPlanCode } from './cycle-counts.helpers';
import {
  CycleCountApprovalResponse,
  CycleCountPlanResponse,
  CycleCountPlanStatus,
  CycleCountReleaseResponse,
  CycleCountScopeType,
  CycleCountTaskResponse,
  CycleCountTaskStatus,
} from './cycle-counts.types';
import { ApproveCycleCountDto } from './dto/approve-cycle-count.dto';
import { CreateCycleCountPlanDto } from './dto/create-cycle-count-plan.dto';
import { ReleaseCycleCountPlanDto } from './dto/release-cycle-count-plan.dto';
import { SubmitCycleCountDto } from './dto/submit-cycle-count.dto';

@Injectable()
export class CycleCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(warehouseReference: string): Promise<CycleCountPlanResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const plans = await this.client.cycleCountPlan.findMany({
      where: { warehouseId: warehouse.id },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map(toPlanResponse);
  }

  async createPlan(
    warehouseReference: string,
    dto: CreateCycleCountPlanDto,
    actor: AuthenticatedUser,
  ): Promise<CycleCountPlanResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const plan = await this.client.cycleCountPlan.create({
      data: {
        warehouseId: warehouse.id,
        code: normalizeCode(dto.code ?? makeCycleCountPlanCode()),
        status: CycleCountPlanStatus.DRAFT,
        scopeType: dto.scopeType ?? CycleCountScopeType.LOCATION,
        scopeReference: normalizeNullableString(dto.scopeReference),
        createdByUserId: actor.id,
        metadata: dto.metadata ?? undefined,
      },
    });

    await this.writeAudit(
      actor,
      warehouse.id,
      'cycle_count.plan_created',
      'cycle_count_plan',
      plan.id,
      {
        code: plan.code,
        scopeType: plan.scopeType,
        scopeReference: plan.scopeReference,
      },
    );

    return toPlanResponse(plan);
  }

  async releasePlan(
    warehouseReference: string,
    planReference: string,
    dto: ReleaseCycleCountPlanDto,
    actor: AuthenticatedUser,
  ): Promise<CycleCountReleaseResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: CycleCountTransactionClient) => {
      const plan = await this.resolvePlanWithClient(tx, warehouse.id, planReference);

      if (plan.status !== CycleCountPlanStatus.DRAFT) {
        throw new ConflictException('Cycle count plan must be DRAFT before release');
      }

      const quants = await this.findQuantsForPlan(tx, warehouse.id, plan);

      if (quants.length === 0) {
        throw new ConflictException('No stock quants match the cycle count plan scope');
      }

      let tasksCreated = 0;
      let freezesCreated = 0;

      for (const quant of quants) {
        const task = await tx.warehouseTask.create({
          data: {
            warehouseId: warehouse.id,
            type: 'COUNT',
            status: 'OPEN',
            skuId: quant.skuId,
            fromLocationId: quant.locationId,
            quantity: quant.quantity,
            priority: 80,
            metadata: {
              cycleCountPlanId: plan.id,
              stockQuantId: quant.id,
              blindCount: true,
              releaseMetadata: dto.metadata ?? null,
            },
          },
        });
        await tx.cycleCountTask.create({
          data: {
            warehouseId: warehouse.id,
            planId: plan.id,
            warehouseTaskId: task.id,
            locationId: quant.locationId,
            skuId: quant.skuId,
            stockQuantId: quant.id,
            expectedQuantity: quant.quantity,
            status: CycleCountTaskStatus.OPEN,
            metadata: {
              blindCount: true,
              releaseMetadata: dto.metadata ?? null,
            },
          },
        });
        await tx.stockFreeze.create({
          data: {
            warehouseId: warehouse.id,
            planId: plan.id,
            locationId: quant.locationId,
            skuId: quant.skuId,
            stockQuantId: quant.id,
            status: 'ACTIVE',
            reason: 'CYCLE_COUNT',
            createdByUserId: actor.id,
          },
        });
        tasksCreated += 1;
        freezesCreated += 1;
      }

      const updatedPlan = await tx.cycleCountPlan.update({
        where: { id: plan.id },
        data: {
          status: CycleCountPlanStatus.RELEASED,
          releasedByUserId: actor.id,
          releasedAt: new Date(),
          metadata: mergeMetadata(plan.metadata, { releaseMetadata: dto.metadata ?? null }),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'cycle_count.plan_released',
          resourceType: 'cycle_count_plan',
          resourceId: plan.id,
          metadata: { tasksCreated, freezesCreated },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'CYCLE_COUNT_RELEASED',
          aggregateType: 'cycle_count_plan',
          aggregateId: plan.id,
          payload: { warehouseId: warehouse.id, tasksCreated, freezesCreated },
        },
      });

      return {
        plan: toPlanResponse(updatedPlan),
        tasksCreated,
        freezesCreated,
      };
    });
  }

  async listTasks(
    warehouseReference: string,
    planReference: string,
  ): Promise<CycleCountTaskResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const plan = await this.resolvePlan(warehouse.id, planReference);
    const tasks = await this.client.cycleCountTask.findMany({
      where: { warehouseId: warehouse.id, planId: plan.id },
      orderBy: { createdAt: 'asc' },
    });

    return tasks.map(toTaskResponse);
  }

  async submitTask(
    warehouseReference: string,
    taskReference: string,
    dto: SubmitCycleCountDto,
    actor: AuthenticatedUser,
  ): Promise<CycleCountTaskResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: CycleCountTransactionClient) => {
      const countTask = await this.resolveCountTaskWithClient(tx, warehouse.id, taskReference);

      if (!['OPEN', 'IN_PROGRESS'].includes(countTask.status)) {
        throw new ConflictException('Cycle count task cannot be submitted from current status');
      }

      if (countTask.warehouseTaskId) {
        await lockPostgresRowById(tx, 'warehouse_tasks', countTask.warehouseTaskId);
      }

      const varianceQuantity = calculateCountVariance(
        countTask.expectedQuantity,
        dto.countedQuantity,
      );
      const updatedTask = await tx.cycleCountTask.update({
        where: { id: countTask.id },
        data: {
          countedQuantity: dto.countedQuantity,
          varianceQuantity,
          status: CycleCountTaskStatus.SUBMITTED,
          countedByUserId: actor.id,
          submittedAt: new Date(),
          metadata: mergeMetadata(countTask.metadata, {
            submitMetadata: dto.metadata ?? null,
          }),
        },
      });

      if (countTask.warehouseTaskId) {
        await tx.warehouseTask.update({
          where: { id: countTask.warehouseTaskId },
          data: {
            status: 'DONE',
            completedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }

      await tx.cycleCountPlan.update({
        where: { id: countTask.planId },
        data: {
          status:
            varianceQuantity === 0
              ? CycleCountPlanStatus.COUNTING
              : CycleCountPlanStatus.RECONCILING,
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'CYCLE_COUNT_SUBMITTED',
          aggregateType: 'cycle_count_task',
          aggregateId: countTask.id,
          payload: {
            warehouseId: warehouse.id,
            countedQuantity: dto.countedQuantity,
            expectedQuantity: countTask.expectedQuantity,
            varianceQuantity,
          },
        },
      });

      return toTaskResponse(updatedTask);
    });
  }

  async approveTask(
    warehouseReference: string,
    taskReference: string,
    dto: ApproveCycleCountDto,
    actor: AuthenticatedUser,
  ): Promise<CycleCountApprovalResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: CycleCountTransactionClient) => {
      const countTask = await this.resolveCountTaskWithClient(tx, warehouse.id, taskReference);

      if (countTask.status !== CycleCountTaskStatus.SUBMITTED) {
        throw new ConflictException('Cycle count task must be SUBMITTED before approval');
      }

      let adjustmentCreated = false;
      const variance =
        countTask.varianceQuantity ??
        calculateCountVariance(countTask.expectedQuantity, countTask.countedQuantity ?? 0);

      if (variance !== 0) {
        if (!countTask.stockQuantId || !countTask.skuId || countTask.countedQuantity === null) {
          throw new ConflictException(
            'Variance approval requires stock quant, SKU, and counted quantity',
          );
        }

        await lockPostgresRowById(tx, 'stock_quants', countTask.stockQuantId);
        const stockQuant = await tx.stockQuant.findFirst({ where: { id: countTask.stockQuantId } });

        if (!stockQuant) {
          throw new NotFoundException('Stock quant was not found');
        }

        if (stockQuant.reservedQuantity > countTask.countedQuantity) {
          throw new ConflictException('Cannot approve count below currently reserved quantity');
        }

        await tx.stockQuant.update({
          where: { id: stockQuant.id },
          data: {
            quantity: countTask.countedQuantity,
            version: { increment: 1 },
          },
        });
        await tx.stockMovement.create({
          data: {
            warehouseId: warehouse.id,
            skuId: countTask.skuId,
            stockQuantId: stockQuant.id,
            actorUserId: actor.id,
            type: 'ADJUST',
            quantity: variance,
            fromLocationId: variance < 0 ? countTask.locationId : null,
            toLocationId: variance > 0 ? countTask.locationId : null,
            referenceType: 'cycle_count_task',
            referenceId: countTask.id,
            metadata: {
              reason: dto.reason ?? 'Cycle count variance approved',
              expectedQuantity: countTask.expectedQuantity,
              countedQuantity: countTask.countedQuantity,
              varianceQuantity: variance,
              approvalMetadata: dto.metadata ?? null,
            },
          },
        });
        adjustmentCreated = true;
      }

      const updatedTask = await tx.cycleCountTask.update({
        where: { id: countTask.id },
        data: {
          status: CycleCountTaskStatus.APPROVED,
          approvedByUserId: actor.id,
          approvedAt: new Date(),
          metadata: mergeMetadata(countTask.metadata, {
            approvalReason: dto.reason ?? null,
            approvalMetadata: dto.metadata ?? null,
          }),
        },
      });
      await tx.stockFreeze.updateMany({
        where: { planId: countTask.planId, stockQuantId: countTask.stockQuantId, status: 'ACTIVE' },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });

      const openTasks = await tx.cycleCountTask.findMany({
        where: {
          planId: countTask.planId,
          status: {
            in: [
              CycleCountTaskStatus.OPEN,
              CycleCountTaskStatus.IN_PROGRESS,
              CycleCountTaskStatus.SUBMITTED,
            ],
          },
        },
      });
      const planCompleted = openTasks.length === 0;

      if (planCompleted) {
        await tx.cycleCountPlan.update({
          where: { id: countTask.planId },
          data: {
            status: CycleCountPlanStatus.APPROVED,
            approvedByUserId: actor.id,
            approvedAt: new Date(),
          },
        });
        await tx.stockFreeze.updateMany({
          where: { planId: countTask.planId, status: 'ACTIVE' },
          data: { status: 'RELEASED', releasedAt: new Date() },
        });
      }

      await tx.outboxEvent.create({
        data: {
          type: adjustmentCreated ? 'CYCLE_COUNT_VARIANCE_APPROVED' : 'CYCLE_COUNT_APPROVED',
          aggregateType: 'cycle_count_task',
          aggregateId: countTask.id,
          payload: {
            warehouseId: warehouse.id,
            varianceQuantity: variance,
            adjustmentCreated,
            planCompleted,
          },
        },
      });

      return {
        task: toTaskResponse(updatedTask),
        adjustmentCreated,
        planCompleted,
      };
    });
  }

  private async findQuantsForPlan(
    tx: CycleCountTransactionClient,
    warehouseId: string,
    plan: CycleCountPlanRecord,
  ): Promise<StockQuantRecord[]> {
    if (plan.scopeType === CycleCountScopeType.ALL) {
      return tx.stockQuant.findMany({
        where: { warehouseId, status: { in: ['AVAILABLE', 'RESERVED'] } },
      });
    }

    if (plan.scopeType === CycleCountScopeType.LOCATION) {
      if (!plan.scopeReference) {
        throw new ConflictException('LOCATION cycle count requires a scope reference');
      }
      const location = await this.resolveLocationWithClient(tx, warehouseId, plan.scopeReference);
      return tx.stockQuant.findMany({
        where: { warehouseId, locationId: location.id, status: { in: ['AVAILABLE', 'RESERVED'] } },
      });
    }

    if (plan.scopeType === CycleCountScopeType.SKU) {
      if (!plan.scopeReference) {
        throw new ConflictException('SKU cycle count requires a scope reference');
      }
      const sku = await this.resolveSkuWithClient(tx, plan.scopeReference);
      return tx.stockQuant.findMany({
        where: { warehouseId, skuId: sku.id, status: { in: ['AVAILABLE', 'RESERVED'] } },
      });
    }

    if (plan.scopeType === CycleCountScopeType.ZONE) {
      if (!plan.scopeReference) {
        throw new ConflictException('ZONE cycle count requires a scope reference');
      }
      return tx.stockQuant.findMany({
        where: {
          warehouseId,
          status: { in: ['AVAILABLE', 'RESERVED'] },
          location: { is: { zone: normalizeCode(plan.scopeReference) } },
        },
      });
    }

    throw new ConflictException(`Unsupported cycle count scope ${plan.scopeType}`);
  }

  private async resolveWarehouse(reference: string): Promise<WarehouseRecord> {
    const warehouse = await this.client.warehouse.findFirst({ where: warehouseWhere(reference) });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolvePlan(warehouseId: string, reference: string): Promise<CycleCountPlanRecord> {
    return this.resolvePlanWithClient(this.client, warehouseId, reference);
  }

  private async resolvePlanWithClient(
    tx: CycleCountTransactionClient,
    warehouseId: string,
    reference: string,
  ): Promise<CycleCountPlanRecord> {
    const plan = await tx.cycleCountPlan.findFirst({
      where: {
        warehouseId,
        OR: [{ id: reference }, { code: normalizeCode(reference) }],
      },
    });

    if (!plan) {
      throw new NotFoundException('Cycle count plan was not found');
    }

    return plan;
  }

  private async resolveCountTaskWithClient(
    tx: CycleCountTransactionClient,
    warehouseId: string,
    reference: string,
  ): Promise<CycleCountTaskRecord> {
    const task = await tx.cycleCountTask.findFirst({
      where: {
        warehouseId,
        OR: [{ id: reference }, { warehouseTaskId: reference }],
      },
    });

    if (!task) {
      throw new NotFoundException('Cycle count task was not found');
    }

    return task;
  }

  private async resolveLocationWithClient(
    tx: CycleCountTransactionClient,
    warehouseId: string,
    reference: string,
  ): Promise<LocationRecord> {
    const location = await tx.warehouseLocation.findFirst({
      where: {
        warehouseId,
        OR: [
          { id: reference },
          { code: normalizeCode(reference) },
          { barcode: normalizeCode(reference) },
        ],
      },
    });

    if (!location) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return location;
  }

  private async resolveSkuWithClient(
    tx: CycleCountTransactionClient,
    reference: string,
  ): Promise<SkuRecord> {
    const sku = await tx.sku.findFirst({
      where: {
        OR: [{ id: reference }, { code: normalizeCode(reference) }, { barcode: reference.trim() }],
      },
    });

    if (!sku) {
      throw new NotFoundException('SKU was not found');
    }

    return sku;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType,
        resourceId,
        metadata,
      },
    });
  }


  private transaction<T>(fn: (client: CycleCountTransactionClient) => Promise<T>): Promise<T> {
    return withTransactionRetry(() => this.client.$transaction(fn));
  }

  private get client(): CycleCountPrismaClient {
    return this.prisma as unknown as CycleCountPrismaClient;
  }
}

function toPlanResponse(plan: CycleCountPlanRecord): CycleCountPlanResponse {
  return {
    id: plan.id,
    warehouseId: plan.warehouseId,
    code: plan.code,
    status: plan.status as CycleCountPlanStatus,
    scopeType: plan.scopeType,
    scopeReference: plan.scopeReference ?? null,
    metadata: plan.metadata ?? null,
    releasedAt: plan.releasedAt ?? null,
    approvedAt: plan.approvedAt ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function toTaskResponse(task: CycleCountTaskRecord): CycleCountTaskResponse {
  return {
    id: task.id,
    planId: task.planId,
    warehouseTaskId: task.warehouseTaskId ?? null,
    locationId: task.locationId,
    skuId: task.skuId ?? null,
    stockQuantId: task.stockQuantId ?? null,
    expectedQuantity: task.expectedQuantity ?? null,
    countedQuantity: task.countedQuantity ?? null,
    varianceQuantity: task.varianceQuantity ?? null,
    status: task.status as CycleCountTaskStatus,
    metadata: task.metadata ?? null,
    submittedAt: task.submittedAt ?? null,
    approvedAt: task.approvedAt ?? null,
  };
}

function warehouseWhere(reference: string): Record<string, unknown> {
  return isUuid(reference)
    ? { OR: [{ id: reference }, { code: normalizeCode(reference) }] }
    : { code: normalizeCode(reference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mergeMetadata(metadata: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  return { ...toRecord(metadata), ...extra };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface CycleCountPrismaClient extends CycleCountTransactionClient {
  $transaction<T>(fn: (client: CycleCountTransactionClient) => Promise<T>): Promise<T>;
}

interface CycleCountTransactionClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  warehouse: { findFirst(args: Record<string, unknown>): Promise<WarehouseRecord | null> };
  warehouseLocation: { findFirst(args: Record<string, unknown>): Promise<LocationRecord | null> };
  sku: { findFirst(args: Record<string, unknown>): Promise<SkuRecord | null> };
  stockQuant: {
    findFirst(args: Record<string, unknown>): Promise<StockQuantRecord | null>;
    findMany(args: Record<string, unknown>): Promise<StockQuantRecord[]>;
    update(args: Record<string, unknown>): Promise<StockQuantRecord>;
  };
  warehouseTask: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  cycleCountPlan: {
    create(args: Record<string, unknown>): Promise<CycleCountPlanRecord>;
    findFirst(args: Record<string, unknown>): Promise<CycleCountPlanRecord | null>;
    findMany(args: Record<string, unknown>): Promise<CycleCountPlanRecord[]>;
    update(args: Record<string, unknown>): Promise<CycleCountPlanRecord>;
  };
  cycleCountTask: {
    create(args: Record<string, unknown>): Promise<CycleCountTaskRecord>;
    findFirst(args: Record<string, unknown>): Promise<CycleCountTaskRecord | null>;
    findMany(args: Record<string, unknown>): Promise<CycleCountTaskRecord[]>;
    update(args: Record<string, unknown>): Promise<CycleCountTaskRecord>;
  };
  stockFreeze: {
    create(args: Record<string, unknown>): Promise<unknown>;
    updateMany(args: Record<string, unknown>): Promise<unknown>;
  };
  stockMovement: { create(args: Record<string, unknown>): Promise<unknown> };
  auditLog: { create(args: Record<string, unknown>): Promise<unknown> };
  outboxEvent: { create(args: Record<string, unknown>): Promise<unknown> };
}

interface WarehouseRecord {
  id: string;
  code: string;
}

interface LocationRecord {
  id: string;
  code: string;
}

interface SkuRecord {
  id: string;
  code: string;
}

interface StockQuantRecord {
  id: string;
  warehouseId: string;
  locationId: string;
  skuId: string;
  quantity: number;
  reservedQuantity: number;
  status: string;
  metadata?: unknown;
}

interface CycleCountPlanRecord {
  id: string;
  warehouseId: string;
  code: string;
  status: string;
  scopeType: string;
  scopeReference: string | null;
  metadata: unknown;
  releasedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CycleCountTaskRecord {
  id: string;
  warehouseId: string;
  planId: string;
  warehouseTaskId: string | null;
  locationId: string;
  skuId: string | null;
  stockQuantId: string | null;
  expectedQuantity: number | null;
  countedQuantity: number | null;
  varianceQuantity: number | null;
  status: string;
  metadata: unknown;
  submittedAt: Date | null;
  approvedAt: Date | null;
}
