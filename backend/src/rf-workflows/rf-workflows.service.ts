import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { calculateCountVariance } from '../cycle-counts/cycle-counts.helpers';
import { CycleCountPlanStatus, CycleCountTaskStatus } from '../cycle-counts/cycle-counts.types';
import { lockPostgresRowById, PrismaService, withTransactionRetry } from '../database';
import { assertNoBlockingStockFreeze, StockFreezeClient } from '../inventory/stock-freeze.helpers';
import { CancelRfSessionDto } from './dto/cancel-rf-session.dto';
import { ReportRfExceptionDto } from './dto/report-rf-exception.dto';
import { ScanRfStepDto } from './dto/scan-rf-step.dto';
import { StartRfSessionDto } from './dto/start-rf-session.dto';
import { SyncRfOfflineQueueDto, RfOfflineScanDto } from './dto/sync-rf-offline-queue.dto';
import {
  getInitialStepForTask,
  getNextStepAfterScan,
  isExpectedScan,
  workflowFromTaskType,
} from './rf-workflows.helpers';
import {
  RfExceptionCode,
  RfExceptionResponse,
  RfExpectedScan,
  RfInstructionResponse,
  RfOfflineSyncResponse,
  RfQueueResponse,
  RfQueueTaskResponse,
  RfStepKey,
  RfTaskSummary,
  RfWorkflowType,
  ScannerSessionStatus,
} from './rf-workflows.types';

const taskInclude = {
  fromLocation: true,
  toLocation: true,
  sku: true,
  handlingUnit: true,
};

@Injectable()
export class RfWorkflowsService {
  private offlineSchemaReady?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  async getQueue(
    warehouseReference: string,
    options: {
      workflow?: string;
      zone?: string;
      assignedToMe?: boolean;
      limit?: number;
      actor?: AuthenticatedUser;
    } = {},
  ): Promise<RfQueueResponse> {
    await this.ensureOfflineSchema();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 12), 1), 50);
    const where: Record<string, unknown> = {
      warehouseId: warehouse.id,
      status: { in: ['OPEN', 'ASSIGNED', 'BLOCKED'] },
    };

    if (options.workflow) {
      where['type'] = normalizeCode(options.workflow);
    }

    if (options.assignedToMe && options.actor?.id) {
      where['assignedUserId'] = options.actor.id;
    }

    if (options.zone?.trim()) {
      const zone = options.zone.trim();
      where['OR'] = [
        { fromLocation: { is: { zone } } },
        { toLocation: { is: { zone } } },
        { fromLocation: { is: { code: zone } } },
        { toLocation: { is: { code: zone } } },
      ];
    }

    const queue = await this.client.warehouseTask.findMany({
      where,
      include: taskInclude,
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
    const offlineQueue = await this.getOfflineQueueStats(warehouse.id);

    return {
      warehouseId: warehouse.id,
      generatedAt: new Date(),
      filters: {
        workflow: options.workflow,
        zone: options.zone,
        assignedToMe: options.assignedToMe,
      },
      tasks: queue.map((task) => toQueueTask(task)),
      offlineQueue,
    };
  }

  async resumeSession(
    warehouseReference: string,
    sessionReference: string,
  ): Promise<RfInstructionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const session = await this.resolveSession(warehouse.id, sessionReference);

    if (session.status !== ScannerSessionStatus.ACTIVE) {
      throw new ConflictException('Only an active RF session can be resumed');
    }

    const updatedSession = await this.client.scannerSession.update({
      where: { id: session.id },
      data: { heartbeatAt: new Date() },
    });
    const task = updatedSession.taskId
      ? await this.resolveTask(warehouse.id, updatedSession.taskId)
      : null;
    const step = await this.getOpenStep(updatedSession.id);

    return this.toInstruction(updatedSession, task, step);
  }

  async cancelSession(
    warehouseReference: string,
    sessionReference: string,
    dto: CancelRfSessionDto,
    actor: AuthenticatedUser,
  ): Promise<RfInstructionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const session = await this.resolveSession(warehouse.id, sessionReference);
    const updatedSession = await this.client.scannerSession.update({
      where: { id: session.id },
      data: {
        status: ScannerSessionStatus.CANCELLED,
        currentStepKey: null,
        heartbeatAt: new Date(),
        completedAt: new Date(),
        metadata: mergeMetadata(session.metadata, {
          cancelReason: dto.reason ?? null,
          cancelledByUserId: actor.id,
          cancelledAt: new Date().toISOString(),
          ...(dto.metadata ?? {}),
        }),
      },
    });
    const task = updatedSession.taskId
      ? await this.resolveTask(warehouse.id, updatedSession.taskId)
      : null;

    await this.writeAudit(
      actor,
      warehouse.id,
      'rf.session_cancelled',
      'scanner_session',
      session.id,
      {
        reason: dto.reason ?? null,
        taskId: task?.id ?? null,
      },
    );

    return this.toInstruction(updatedSession, task, null);
  }

  async syncOfflineQueue(
    warehouseReference: string,
    dto: SyncRfOfflineQueueDto,
    actor: AuthenticatedUser,
  ): Promise<RfOfflineSyncResponse> {
    await this.ensureOfflineSchema();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const scanner = dto.scannerDeviceReference
      ? await this.resolveScanner(warehouse.id, dto.scannerDeviceReference)
      : null;
    const items: RfOfflineSyncResponse['items'] = [];

    for (const offlineScan of dto.scans) {
      const result = await this.ingestOfflineScan(
        warehouse.id,
        offlineScan,
        scanner?.id ?? null,
        dto.dryRun === true,
        actor,
      );
      items.push(result);
    }

    await this.writeAudit(
      actor,
      warehouse.id,
      'rf.offline_queue_synced',
      'warehouse',
      warehouse.id,
      {
        received: dto.scans.length,
        scannerDeviceId: scanner?.id ?? null,
        dryRun: dto.dryRun === true,
        synced: items.filter((item) => item.status === 'SYNCED').length,
        failed: items.filter((item) => item.status === 'FAILED').length,
        duplicates: items.filter((item) => item.status === 'DUPLICATE').length,
      },
    );

    return {
      warehouseId: warehouse.id,
      dryRun: dto.dryRun === true,
      received: dto.scans.length,
      synced: items.filter((item) => item.status === 'SYNCED').length,
      queued: items.filter((item) => item.status === 'QUEUED').length,
      failed: items.filter((item) => item.status === 'FAILED').length,
      duplicates: items.filter((item) => item.status === 'DUPLICATE').length,
      items,
    };
  }

  async startSession(
    warehouseReference: string,
    dto: StartRfSessionDto,
    actor: AuthenticatedUser,
  ): Promise<RfInstructionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const scanner = dto.scannerDeviceReference
      ? await this.resolveScanner(warehouse.id, dto.scannerDeviceReference)
      : null;
    const task = dto.taskReference ? await this.resolveTask(warehouse.id, dto.taskReference) : null;
    const workflow = dto.workflow ?? (task ? workflowFromTaskType(task.type) : RfWorkflowType.MOVE);

    const session = await this.client.scannerSession.create({
      data: {
        warehouseId: warehouse.id,
        scannerDeviceId: scanner?.id ?? null,
        userId: actor.id,
        taskId: task?.id ?? null,
        workflow,
        status: ScannerSessionStatus.ACTIVE,
        metadata: toJson(dto.metadata),
      },
    });

    if (scanner) {
      await this.client.scannerDevice.update({
        where: { id: scanner.id },
        data: { lastSeenAt: new Date() },
      });
    }

    const firstStep = task
      ? getInitialStepForTask(task)
      : {
          key: RfStepKey.COMPLETE_TASK,
          instruction: 'Vyber task nebo naskenuj lokaci/SKU podle workflow.',
          expected: { type: 'NONE', value: null } as RfExpectedScan,
        };

    const step = await this.createStep(session.id, warehouse.id, task?.id ?? null, firstStep, 1);
    const updatedSession = await this.client.scannerSession.update({
      where: { id: session.id },
      data: { currentStepKey: step.stepKey },
    });

    await this.writeAudit(
      actor,
      warehouse.id,
      'rf.session_started',
      'scanner_session',
      session.id,
      {
        scannerDeviceId: scanner?.id ?? null,
        taskId: task?.id ?? null,
        workflow,
      },
    );

    return this.toInstruction(updatedSession, task, step);
  }

  async startTask(
    warehouseReference: string,
    taskReference: string,
    dto: StartRfSessionDto,
    actor: AuthenticatedUser,
  ): Promise<RfInstructionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: RfTransactionClient) => {
      const task = await this.resolveTaskWithClient(tx, warehouse.id, taskReference);
      await lockPostgresRowById(tx, 'warehouse_tasks', task.id);
      const lockedTask = await this.resolveTaskWithClient(tx, warehouse.id, task.id);

      if (!['OPEN', 'ASSIGNED', 'BLOCKED'].includes(lockedTask.status)) {
        throw new ConflictException('Task cannot be started from the current status');
      }

      const updatedTask = await tx.warehouseTask.update({
        where: { id: lockedTask.id },
        data: {
          status: 'IN_PROGRESS',
          assignedUserId: lockedTask.assignedUserId ?? actor.id,
          assignedAt: lockedTask.assignedAt ?? new Date(),
          startedAt: lockedTask.startedAt ?? new Date(),
          version: { increment: 1 },
        },
        include: taskInclude,
      });

      const scanner = dto.scannerDeviceReference
        ? await this.resolveScannerWithClient(tx, warehouse.id, dto.scannerDeviceReference)
        : null;
      const workflow = dto.workflow ?? workflowFromTaskType(updatedTask.type);
      const session = await tx.scannerSession.create({
        data: {
          warehouseId: warehouse.id,
          scannerDeviceId: scanner?.id ?? null,
          userId: actor.id,
          taskId: updatedTask.id,
          workflow,
          status: ScannerSessionStatus.ACTIVE,
          metadata: toJson(dto.metadata),
        },
      });
      const firstStep = getInitialStepForTask(updatedTask);
      const step = await tx.scannerWorkflowStep.create({
        data: stepCreateData(session.id, warehouse.id, updatedTask.id, firstStep, 1),
      });
      const updatedSession = await tx.scannerSession.update({
        where: { id: session.id },
        data: { currentStepKey: step.stepKey },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'rf.task_started',
          resourceType: 'warehouse_task',
          resourceId: updatedTask.id,
          metadata: {
            scannerDeviceId: scanner?.id ?? null,
            workflow,
            previousStatus: lockedTask.status,
          },
        },
      });

      return this.toInstruction(updatedSession, updatedTask, step);
    });
  }

  async getSession(
    warehouseReference: string,
    sessionReference: string,
  ): Promise<RfInstructionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const session = await this.resolveSession(warehouse.id, sessionReference);
    const task = session.taskId ? await this.resolveTask(warehouse.id, session.taskId) : null;
    const step = await this.getOpenStep(session.id);

    return this.toInstruction(session, task, step);
  }

  async heartbeat(
    warehouseReference: string,
    sessionReference: string,
  ): Promise<RfInstructionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const session = await this.resolveSession(warehouse.id, sessionReference);
    const updatedSession = await this.client.scannerSession.update({
      where: { id: session.id },
      data: { heartbeatAt: new Date() },
    });
    const task = updatedSession.taskId
      ? await this.resolveTask(warehouse.id, updatedSession.taskId)
      : null;
    const step = await this.getOpenStep(updatedSession.id);

    return this.toInstruction(updatedSession, task, step);
  }

  async scan(
    warehouseReference: string,
    sessionReference: string,
    dto: ScanRfStepDto,
    actor: AuthenticatedUser,
  ): Promise<RfInstructionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: RfTransactionClient) => {
      const session = await this.resolveSessionWithClient(tx, warehouse.id, sessionReference);

      if (session.status !== ScannerSessionStatus.ACTIVE) {
        throw new ConflictException('RF session is not active');
      }

      const task = session.taskId
        ? await this.resolveTaskWithClient(tx, warehouse.id, session.taskId)
        : null;
      const step = await this.getOpenStepWithClient(tx, session.id);

      if (!step) {
        throw new ConflictException('RF session has no open step');
      }

      const expected = expectedFromStep(step);
      const scannedValue =
        dto.scannedValue?.trim() ?? (dto.quantity === undefined ? '' : String(dto.quantity));

      if (!isExpectedScan(expected, scannedValue)) {
        const retryStep = await tx.scannerWorkflowStep.update({
          where: { id: step.id },
          data: {
            scannedValue,
            quantity: dto.quantity ?? null,
            errorCode: 'SCAN_MISMATCH',
            metadata: toJson(dto.metadata),
          },
        });

        return this.toInstruction(session, task, retryStep, 'SCAN_MISMATCH');
      }

      const completedStep = await tx.scannerWorkflowStep.update({
        where: { id: step.id },
        data: {
          status: 'COMPLETED',
          scannedValue,
          quantity: dto.quantity ?? null,
          metadata: toJson(dto.metadata),
          completedAt: new Date(),
        },
      });

      const maybeNextStep = task ? getNextStepAfterScan(task, completedStep.stepKey) : null;

      if (maybeNextStep) {
        const nextStep = await tx.scannerWorkflowStep.create({
          data: stepCreateData(
            session.id,
            warehouse.id,
            task?.id ?? null,
            maybeNextStep,
            completedStep.sequence + 1,
          ),
        });
        const updatedSession = await tx.scannerSession.update({
          where: { id: session.id },
          data: { currentStepKey: nextStep.stepKey, heartbeatAt: new Date() },
        });

        return this.toInstruction(updatedSession, task, nextStep);
      }

      const updatedSession = await tx.scannerSession.update({
        where: { id: session.id },
        data: {
          status: ScannerSessionStatus.COMPLETED,
          currentStepKey: null,
          heartbeatAt: new Date(),
          completedAt: new Date(),
        },
      });

      await this.completeTaskAfterRfScan(tx, warehouse.id, task, dto, actor);
      await tx.outboxEvent.create({
        data: {
          type: 'RF_WORKFLOW_COMPLETED',
          aggregateType: 'scanner_session',
          aggregateId: session.id,
          payload: {
            warehouseId: warehouse.id,
            taskId: task?.id ?? null,
            workflow: session.workflow,
            completedStepKey: completedStep.stepKey,
          },
        },
      });

      return this.toInstruction(updatedSession, task, null);
    });
  }

  async reportTaskException(
    warehouseReference: string,
    taskReference: string,
    dto: ReportRfExceptionDto,
    actor: AuthenticatedUser,
  ): Promise<RfExceptionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: RfTransactionClient) => {
      const task = await this.resolveTaskWithClient(tx, warehouse.id, taskReference);
      await lockPostgresRowById(tx, 'warehouse_tasks', task.id);
      const lockedTask = await this.resolveTaskWithClient(tx, warehouse.id, task.id);
      const code = dto.code ?? RfExceptionCode.SHORT_PICK;
      const taskStatus =
        dto.taskStatus ?? (code === RfExceptionCode.SHORT_PICK ? 'FAILED' : 'BLOCKED');
      const releasedReservedQuantity = await this.releaseTaskReservationIfRequested(
        tx,
        lockedTask,
        dto,
      );

      const exception = await tx.wmsException.create({
        data: {
          warehouseId: warehouse.id,
          locationId: lockedTask.fromLocationId ?? lockedTask.toLocationId ?? null,
          createdByUserId: actor.id,
          severity: code === RfExceptionCode.SHORT_PICK ? 'HIGH' : 'MEDIUM',
          status: 'OPEN',
          code,
          title: dto.title?.trim() || defaultExceptionTitle(code),
          description: normalizeNullableString(dto.description),
          metadata: toJson({
            taskId: lockedTask.id,
            outboundOrderId: lockedTask.outboundOrderId ?? null,
            outboundOrderLineId: lockedTask.outboundOrderLineId ?? null,
            reservationId: lockedTask.reservationId ?? null,
            shortQuantity: dto.shortQuantity ?? null,
            releasedReservedQuantity,
            rfMetadata: dto.metadata ?? null,
          }),
        },
      });

      const updatedTask = await tx.warehouseTask.update({
        where: { id: lockedTask.id },
        data: {
          status: taskStatus,
          failureReason: code,
          version: { increment: 1 },
          metadata: mergeMetadata(lockedTask.metadata, {
            lastRfExceptionCode: code,
            lastRfExceptionId: exception.id,
            lastRfExceptionAt: new Date().toISOString(),
          }),
        },
      });

      let orderStatus: string | null = null;
      if (lockedTask.outboundOrderId && tx.outboundOrder) {
        const order = await tx.outboundOrder.update({
          where: { id: lockedTask.outboundOrderId },
          data: {
            status: 'EXCEPTION',
            metadata: mergeMetadata(null, {
              lastRfExceptionCode: code,
              lastRfExceptionId: exception.id,
            }),
          },
        });
        orderStatus = order.status;
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'rf.exception_reported',
          resourceType: 'warehouse_task',
          resourceId: lockedTask.id,
          metadata: {
            code,
            exceptionId: exception.id,
            taskStatus,
            releasedReservedQuantity,
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'EXCEPTION_RAISED',
          aggregateType: 'warehouse_task',
          aggregateId: lockedTask.id,
          payload: {
            exceptionId: exception.id,
            warehouseId: warehouse.id,
            taskId: lockedTask.id,
            code,
            releasedReservedQuantity,
          },
        },
      });

      return {
        exceptionId: exception.id,
        taskId: lockedTask.id,
        taskStatus: updatedTask.status,
        orderId: lockedTask.outboundOrderId ?? null,
        orderStatus,
        releasedReservedQuantity,
      };
    });
  }

  private async completeTaskAfterRfScan(
    tx: RfTransactionClient,
    warehouseId: string,
    task: WarehouseTaskRecord | null,
    dto: ScanRfStepDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!task) {
      return;
    }

    if (task.type === 'PICK') {
      await this.completePickTask(tx, warehouseId, task, dto, actor);
      return;
    }

    if (task.type === 'COUNT') {
      const submitted = await this.submitCycleCountFromRf(tx, warehouseId, task, dto, actor);

      if (submitted) {
        return;
      }
    }

    await tx.warehouseTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        version: { increment: 1 },
        metadata: mergeMetadata(task.metadata, {
          rfCompletedAt: new Date().toISOString(),
          rfQuantity: dto.quantity ?? null,
        }),
      },
    });
  }

  private async submitCycleCountFromRf(
    tx: RfTransactionClient,
    warehouseId: string,
    task: WarehouseTaskRecord,
    dto: ScanRfStepDto,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    if (!tx.cycleCountTask || !tx.cycleCountPlan) {
      return false;
    }

    const countTask = await tx.cycleCountTask.findFirst({
      where: {
        warehouseId,
        warehouseTaskId: task.id,
      },
    });

    if (!countTask) {
      if (hasCycleCountMetadata(task.metadata)) {
        throw new NotFoundException('Cycle count task was not found for RF count');
      }

      return false;
    }

    if (
      countTask.status !== CycleCountTaskStatus.OPEN &&
      countTask.status !== CycleCountTaskStatus.IN_PROGRESS
    ) {
      throw new ConflictException('Cycle count task cannot be submitted from current status');
    }

    const countedQuantity = resolveRfCountedQuantity(dto);

    if (countedQuantity === null) {
      throw new ConflictException('RF cycle count requires a counted quantity');
    }

    await lockPostgresRowById(tx, 'warehouse_tasks', task.id);
    const submittedAt = new Date();
    const varianceQuantity = calculateCountVariance(countTask.expectedQuantity, countedQuantity);

    await tx.cycleCountTask.update({
      where: { id: countTask.id },
      data: {
        countedQuantity,
        varianceQuantity,
        status: CycleCountTaskStatus.SUBMITTED,
        countedByUserId: actor.id,
        submittedAt,
        metadata: mergeMetadata(countTask.metadata, {
          rfSubmittedAt: submittedAt.toISOString(),
          rfWarehouseTaskId: task.id,
          rfQuantity: countedQuantity,
          rfMetadata: dto.metadata ?? null,
        }),
      },
    });
    await tx.warehouseTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: submittedAt,
        version: { increment: 1 },
        metadata: mergeMetadata(task.metadata, {
          rfCompletedAt: submittedAt.toISOString(),
          rfQuantity: countedQuantity,
          cycleCountTaskId: countTask.id,
        }),
      },
    });
    await tx.cycleCountPlan.update({
      where: { id: countTask.planId },
      data: {
        status:
          varianceQuantity === 0 ? CycleCountPlanStatus.COUNTING : CycleCountPlanStatus.RECONCILING,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action: 'cycle_count.rf_submitted',
        resourceType: 'cycle_count_task',
        resourceId: countTask.id,
        metadata: {
          warehouseTaskId: task.id,
          countedQuantity,
          expectedQuantity: countTask.expectedQuantity,
          varianceQuantity,
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        type: 'CYCLE_COUNT_SUBMITTED',
        aggregateType: 'cycle_count_task',
        aggregateId: countTask.id,
        payload: {
          warehouseId,
          countedQuantity,
          expectedQuantity: countTask.expectedQuantity,
          varianceQuantity,
          source: 'RF_WORKFLOW',
        },
      },
    });

    return true;
  }

  private async completePickTask(
    tx: RfTransactionClient,
    warehouseId: string,
    task: WarehouseTaskRecord,
    dto: ScanRfStepDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!task.outboundOrderId || !task.outboundOrderLineId || !task.reservationId) {
      throw new ConflictException(
        'PICK task requires outbound order, line, and reservation context',
      );
    }

    if (
      !tx.reservation ||
      !tx.stockQuant ||
      !tx.outboundOrderLine ||
      !tx.outboundOrder ||
      !tx.stockMovement
    ) {
      throw new ConflictException('RF pick confirmation requires full inventory delegates');
    }

    const quantity = dto.quantity ?? task.quantity ?? 0;

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ConflictException('Pick quantity must be a positive integer');
    }

    const reservation = await tx.reservation.findFirst({ where: { id: task.reservationId } });

    if (!reservation || reservation.status !== 'ACTIVE') {
      throw new ConflictException('Active reservation was not found for RF pick');
    }

    await lockPostgresRowById(tx, 'stock_quants', reservation.stockQuantId);
    const stockQuant = await tx.stockQuant.findFirst({ where: { id: reservation.stockQuantId } });

    if (!stockQuant) {
      throw new NotFoundException('Stock quant was not found for RF pick');
    }

    await assertNoBlockingStockFreeze(tx, {
      warehouseId,
      stockQuantId: stockQuant.id,
      locationId: stockQuant.locationId,
      skuId: stockQuant.skuId,
      operation: 'RF pick confirmation',
    });

    if (
      stockQuant.quantity < quantity ||
      stockQuant.reservedQuantity < quantity ||
      reservation.quantity < quantity
    ) {
      throw new ConflictException('RF pick quantity exceeds available reserved stock');
    }

    const line = await tx.outboundOrderLine.findFirst({ where: { id: task.outboundOrderLineId } });

    if (!line) {
      throw new NotFoundException('Outbound order line was not found for RF pick');
    }

    if (line.pickedQuantity + quantity > line.orderedQuantity) {
      throw new ConflictException('RF pick quantity exceeds remaining outbound quantity');
    }

    await tx.stockQuant.update({
      where: { id: stockQuant.id },
      data: {
        quantity: { decrement: quantity },
        reservedQuantity: { decrement: quantity },
        version: { increment: 1 },
      },
    });
    await tx.reservation.update({
      where: { id: reservation.id },
      data:
        quantity >= reservation.quantity
          ? { status: 'PICKED' }
          : { quantity: { decrement: quantity } },
    });
    await tx.outboundOrderLine.update({
      where: { id: line.id },
      data: { pickedQuantity: { increment: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        warehouseId,
        skuId: reservation.skuId,
        stockQuantId: stockQuant.id,
        reservationId: reservation.id,
        taskId: task.id,
        actorUserId: actor.id,
        type: 'PICK',
        quantity,
        fromLocationId: stockQuant.locationId,
        referenceType: 'outbound_order',
        referenceId: task.outboundOrderId,
        metadata: {
          source: 'rf-workflow',
          outboundOrderLineId: line.id,
          scanMetadata: dto.metadata ?? null,
        },
      },
    });
    await tx.warehouseTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });

    const remainingLines = await tx.outboundOrderLine.findMany({
      where: { orderId: task.outboundOrderId },
    });
    const fullyPicked = remainingLines.every((candidate) =>
      candidate.id === line.id
        ? candidate.pickedQuantity + quantity >= candidate.orderedQuantity
        : candidate.pickedQuantity >= candidate.orderedQuantity,
    );

    if (fullyPicked) {
      const order = await tx.outboundOrder.findFirst({ where: { id: task.outboundOrderId } });
      await tx.outboundOrder.update({
        where: { id: task.outboundOrderId },
        data: {
          status: 'PICKED',
          metadata: mergeMetadata(order?.metadata ?? null, {
            fulfillmentStatus: 'PICKED',
            fulfillmentUpdatedAt: new Date().toISOString(),
            completedByRfSession: true,
          }),
        },
      });
    }
  }

  private async releaseTaskReservationIfRequested(
    tx: RfTransactionClient,
    task: WarehouseTaskRecord,
    dto: ReportRfExceptionDto,
  ): Promise<number> {
    if (!dto.releaseReservation || !task.reservationId || !tx.reservation || !tx.stockQuant) {
      return 0;
    }

    const reservation = await tx.reservation.findFirst({ where: { id: task.reservationId } });

    if (!reservation || reservation.status !== 'ACTIVE') {
      return 0;
    }

    const quantityToRelease = Math.min(
      dto.shortQuantity ?? reservation.quantity,
      reservation.quantity,
    );

    if (quantityToRelease <= 0) {
      return 0;
    }

    await lockPostgresRowById(tx, 'stock_quants', reservation.stockQuantId);
    const stockQuant = await tx.stockQuant.findFirst({ where: { id: reservation.stockQuantId } });

    if (!stockQuant) {
      throw new NotFoundException('Stock quant was not found for RF reservation release');
    }

    await assertNoBlockingStockFreeze(tx, {
      warehouseId: stockQuant.warehouseId,
      stockQuantId: stockQuant.id,
      locationId: stockQuant.locationId,
      skuId: stockQuant.skuId,
      operation: 'RF reservation release',
    });
    await tx.stockQuant.update({
      where: { id: reservation.stockQuantId },
      data: { reservedQuantity: { decrement: quantityToRelease } },
    });
    await tx.reservation.update({
      where: { id: reservation.id },
      data:
        quantityToRelease >= reservation.quantity
          ? { status: 'RELEASED' }
          : { quantity: { decrement: quantityToRelease } },
    });

    return quantityToRelease;
  }

  private async ingestOfflineScan(
    warehouseId: string,
    offlineScan: RfOfflineScanDto,
    scannerDeviceId: string | null,
    dryRun: boolean,
    actor: AuthenticatedUser,
  ): Promise<RfOfflineSyncResponse['items'][number]> {
    const idempotencyKey = offlineScan.idempotencyKey.trim();
    if (dryRun) {
      return {
        idempotencyKey,
        status: 'QUEUED',
        sessionId: offlineScan.sessionReference ?? null,
        taskId: offlineScan.taskReference ?? null,
        errorCode: null,
        errorMessage: null,
      };
    }

    const session = offlineScan.sessionReference
      ? await this.tryResolveSession(warehouseId, offlineScan.sessionReference)
      : null;
    const task = offlineScan.taskReference
      ? await this.tryResolveTask(warehouseId, offlineScan.taskReference)
      : null;
    const inserted = await this.client.$queryRawUnsafe<RfOfflineQueueRow[]>(
      `INSERT INTO rf_offline_scan_queue
        (warehouse_id, session_id, task_id, scanner_device_id, idempotency_key, step_key, scanned_value, quantity, status, payload, metadata, recorded_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, 'QUEUED', $9::jsonb, $10::jsonb, COALESCE($11::timestamptz, now()))
       ON CONFLICT (warehouse_id, idempotency_key) DO NOTHING
       RETURNING *`,
      warehouseId,
      session?.id ?? null,
      task?.id ?? session?.taskId ?? null,
      scannerDeviceId,
      idempotencyKey,
      offlineScan.stepKey ?? null,
      offlineScan.scannedValue ?? null,
      offlineScan.quantity ?? null,
      JSON.stringify(offlineScan),
      JSON.stringify(offlineScan.metadata ?? {}),
      offlineScan.recordedAt ?? null,
    );

    if (inserted.length === 0) {
      await this.client.$executeRawUnsafe(
        `UPDATE rf_offline_scan_queue
         SET status = CASE WHEN status = 'SYNCED' THEN 'SYNCED' ELSE 'DUPLICATE' END,
             updated_at = now()
         WHERE warehouse_id = $1::uuid AND idempotency_key = $2`,
        warehouseId,
        idempotencyKey,
      );
      const existing = await this.client.$queryRawUnsafe<RfOfflineQueueRow[]>(
        `SELECT * FROM rf_offline_scan_queue WHERE warehouse_id = $1::uuid AND idempotency_key = $2 LIMIT 1`,
        warehouseId,
        idempotencyKey,
      );
      return offlineQueueItem(idempotencyKey, existing[0] ?? null, 'DUPLICATE', null, null);
    }

    if (!session) {
      return offlineQueueItem(idempotencyKey, inserted[0] ?? null, 'QUEUED', null, null);
    }

    try {
      const instruction = await this.scan(
        warehouseId,
        session.id,
        {
          scannedValue: offlineScan.scannedValue,
          quantity: offlineScan.quantity,
          metadata: {
            ...(offlineScan.metadata ?? {}),
            offlineReplay: true,
            offlineRecordedAt: offlineScan.recordedAt ?? null,
            offlineIdempotencyKey: idempotencyKey,
          },
        },
        actor,
      );
      const hasMismatch = instruction.step.errorCode !== null;
      const status = hasMismatch ? 'FAILED' : 'SYNCED';
      await this.client.$executeRawUnsafe(
        `UPDATE rf_offline_scan_queue
         SET status = $3,
             error_code = $4,
             error_message = $5,
             synced_at = CASE WHEN $3 = 'SYNCED' THEN now() ELSE synced_at END,
             updated_at = now()
         WHERE warehouse_id = $1::uuid AND idempotency_key = $2`,
        warehouseId,
        idempotencyKey,
        status,
        instruction.step.errorCode,
        hasMismatch ? instruction.step.instruction : null,
      );
      return {
        idempotencyKey,
        status,
        sessionId: session.id,
        taskId: task?.id ?? session.taskId ?? null,
        errorCode: instruction.step.errorCode,
        errorMessage: hasMismatch ? instruction.step.instruction : null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Offline scan replay failed';
      await this.client.$executeRawUnsafe(
        `UPDATE rf_offline_scan_queue
         SET status = 'FAILED', error_code = 'REPLAY_FAILED', error_message = $3, updated_at = now()
         WHERE warehouse_id = $1::uuid AND idempotency_key = $2`,
        warehouseId,
        idempotencyKey,
        message.slice(0, 500),
      );
      return {
        idempotencyKey,
        status: 'FAILED',
        sessionId: session.id,
        taskId: task?.id ?? session.taskId ?? null,
        errorCode: 'REPLAY_FAILED',
        errorMessage: message,
      };
    }
  }

  private async tryResolveSession(
    warehouseId: string,
    reference: string,
  ): Promise<ScannerSessionRecord | null> {
    try {
      return await this.resolveSession(warehouseId, reference);
    } catch {
      return null;
    }
  }

  private async tryResolveTask(
    warehouseId: string,
    reference: string,
  ): Promise<WarehouseTaskRecord | null> {
    try {
      return await this.resolveTask(warehouseId, reference);
    } catch {
      return null;
    }
  }

  private async getOfflineQueueStats(
    warehouseId: string,
  ): Promise<RfQueueResponse['offlineQueue']> {
    await this.ensureOfflineSchema();
    const rows = await this.client.$queryRawUnsafe<OfflineStatsRow[]>(
      `SELECT
         count(*) FILTER (WHERE status = 'QUEUED') AS queued,
         count(*) FILTER (WHERE status = 'FAILED') AS failed,
         count(*) FILTER (WHERE status = 'SYNCED' AND synced_at >= now() - interval '24 hours') AS synced_today
       FROM rf_offline_scan_queue
       WHERE warehouse_id = $1::uuid`,
      warehouseId,
    );
    const row = rows[0];
    return {
      queued: Number(row?.queued ?? 0),
      failed: Number(row?.failed ?? 0),
      syncedToday: Number(row?.synced_today ?? 0),
    };
  }

  private ensureOfflineSchema(): Promise<void> {
    this.offlineSchemaReady ??= this.createOfflineSchema();
    return this.offlineSchemaReady;
  }

  private async createOfflineSchema(): Promise<void> {
    await this.client.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS rf_offline_scan_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      session_id uuid NULL,
      task_id uuid NULL,
      scanner_device_id uuid NULL,
      idempotency_key text NOT NULL,
      step_key text NULL,
      scanned_value text NULL,
      quantity integer NULL,
      status text NOT NULL DEFAULT 'QUEUED',
      error_code text NULL,
      error_message text NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      synced_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT rf_offline_scan_queue_status_check CHECK (status IN ('QUEUED','SYNCED','FAILED','DUPLICATE'))
    )`);
    await this.client.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS rf_offline_scan_queue_unique_idempotency
       ON rf_offline_scan_queue (warehouse_id, idempotency_key)`,
    );
    await this.client.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS rf_offline_scan_queue_status_idx
       ON rf_offline_scan_queue (warehouse_id, status, created_at)`,
    );
  }

  private async createStep(
    sessionId: string,
    warehouseId: string,
    taskId: string | null,
    step: { key: string; instruction: string; expected: RfExpectedScan },
    sequence: number,
  ): Promise<RfStepRecord> {
    return this.client.scannerWorkflowStep.create({
      data: stepCreateData(sessionId, warehouseId, taskId, step, sequence),
    });
  }

  private async getOpenStep(sessionId: string): Promise<RfStepRecord | null> {
    return this.client.scannerWorkflowStep.findFirst({
      where: { sessionId, status: 'OPEN' },
      orderBy: { sequence: 'asc' },
    });
  }

  private getOpenStepWithClient(
    tx: RfTransactionClient,
    sessionId: string,
  ): Promise<RfStepRecord | null> {
    return tx.scannerWorkflowStep.findFirst({
      where: { sessionId, status: 'OPEN' },
      orderBy: { sequence: 'asc' },
    });
  }

  private async resolveWarehouse(reference: string): Promise<WarehouseRecord> {
    const warehouse = await this.client.warehouse.findFirst({ where: warehouseWhere(reference) });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveScanner(
    warehouseId: string,
    reference: string,
  ): Promise<ScannerDeviceRecord> {
    return this.resolveScannerWithClient(this.client, warehouseId, reference);
  }

  private async resolveScannerWithClient(
    tx: RfTransactionClient,
    warehouseId: string,
    reference: string,
  ): Promise<ScannerDeviceRecord> {
    const scanner = await tx.scannerDevice.findFirst({
      where: {
        warehouseId,
        ...(isUuid(reference)
          ? { OR: [{ id: reference }, { code: normalizeCode(reference) }] }
          : { code: normalizeCode(reference) }),
      },
    });

    if (!scanner) {
      throw new NotFoundException('Scanner device was not found');
    }

    return scanner;
  }

  private async resolveTask(warehouseId: string, reference: string): Promise<WarehouseTaskRecord> {
    return this.resolveTaskWithClient(this.client, warehouseId, reference);
  }

  private async resolveTaskWithClient(
    tx: RfTransactionClient,
    warehouseId: string,
    reference: string,
  ): Promise<WarehouseTaskRecord> {
    const task = await tx.warehouseTask.findFirst({
      where: {
        warehouseId,
        ...(isUuid(reference)
          ? { OR: [{ id: reference }, { externalReference: reference }] }
          : { externalReference: reference }),
      },
      include: taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Warehouse task was not found');
    }

    return task;
  }

  private async resolveSession(
    warehouseId: string,
    reference: string,
  ): Promise<ScannerSessionRecord> {
    return this.resolveSessionWithClient(this.client, warehouseId, reference);
  }

  private async resolveSessionWithClient(
    tx: RfTransactionClient,
    warehouseId: string,
    reference: string,
  ): Promise<ScannerSessionRecord> {
    const session = await tx.scannerSession.findFirst({
      where: { warehouseId, id: reference },
    });

    if (!session) {
      throw new NotFoundException('RF session was not found');
    }

    return session;
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

  private toInstruction(
    session: ScannerSessionRecord,
    task: WarehouseTaskRecord | null,
    step: RfStepRecord | null,
    errorCode: string | null = null,
  ): RfInstructionResponse {
    const expected = step
      ? expectedFromStep(step)
      : ({ type: 'NONE', value: null } as RfExpectedScan);
    const status = session.status as ScannerSessionStatus;

    return {
      sessionId: session.id,
      status,
      workflow: session.workflow as RfWorkflowType,
      task: task ? toTaskSummary(task) : null,
      step: {
        key: step?.stepKey ?? null,
        sequence: step?.sequence ?? null,
        instruction: step?.instruction ?? 'RF workflow dokončen.',
        expected,
        errorCode: errorCode ?? step?.errorCode ?? null,
      },
      nextActions: status === ScannerSessionStatus.ACTIVE ? ['SCAN', 'REPORT_EXCEPTION'] : [],
      metadata: session.metadata ?? null,
    };
  }

  private transaction<T>(fn: (client: RfTransactionClient) => Promise<T>): Promise<T> {
    return withTransactionRetry(() => this.client.$transaction(fn));
  }

  private get client(): RfPrismaClient {
    return this.prisma as unknown as RfPrismaClient;
  }
}

function stepCreateData(
  sessionId: string,
  warehouseId: string,
  taskId: string | null,
  step: { key: string; instruction: string; expected: RfExpectedScan },
  sequence: number,
): Record<string, unknown> {
  return {
    sessionId,
    warehouseId,
    taskId,
    stepKey: step.key,
    sequence,
    status: 'OPEN',
    instruction: step.instruction,
    expectedType: step.expected.type,
    expectedValue: step.expected.value,
    metadata: { alternatives: step.expected.alternatives ?? [] },
  };
}

function expectedFromStep(step: RfStepRecord): RfExpectedScan {
  const metadata = toRecord(step.metadata);
  const alternatives = Array.isArray(metadata['alternatives'])
    ? metadata['alternatives'].filter((value): value is string => typeof value === 'string')
    : [];

  return {
    type: isExpectedType(step.expectedType) ? step.expectedType : 'NONE',
    value: step.expectedValue ?? null,
    alternatives,
  };
}

function toTaskSummary(task: WarehouseTaskRecord): RfTaskSummary {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    quantity: task.quantity ?? null,
    skuCode: task.sku?.code ?? null,
    fromLocationCode: task.fromLocation?.code ?? null,
    toLocationCode: task.toLocation?.code ?? null,
    handlingUnitCode: task.handlingUnit?.code ?? null,
  };
}

function toQueueTask(task: WarehouseTaskRecord): RfQueueTaskResponse {
  return {
    ...toTaskSummary(task),
    priority: task.priority ?? 100,
    dueAt: task.dueAt ?? null,
    externalReference: task.externalReference ?? null,
    assignedUserId: task.assignedUserId ?? null,
    workflow: workflowFromTaskType(task.type),
    suggestedAction:
      task.status === 'BLOCKED' ? 'WAIT' : task.status === 'IN_PROGRESS' ? 'RESUME' : 'START',
  };
}

function offlineQueueItem(
  idempotencyKey: string,
  row: RfOfflineQueueRow | null,
  status: RfOfflineSyncResponse['items'][number]['status'],
  errorCode: string | null,
  errorMessage: string | null,
): RfOfflineSyncResponse['items'][number] {
  return {
    idempotencyKey,
    status,
    sessionId: row?.session_id ?? null,
    taskId: row?.task_id ?? null,
    errorCode: errorCode ?? row?.error_code ?? null,
    errorMessage: errorMessage ?? row?.error_message ?? null,
  };
}

function defaultExceptionTitle(code: RfExceptionCode): string {
  const titles: Record<RfExceptionCode, string> = {
    [RfExceptionCode.SHORT_PICK]: 'Short pick reported from RF',
    [RfExceptionCode.WRONG_ITEM]: 'Wrong item scanned from RF',
    [RfExceptionCode.WRONG_LOCATION]: 'Wrong location scanned from RF',
    [RfExceptionCode.DAMAGED_STOCK]: 'Damaged stock reported from RF',
    [RfExceptionCode.MISSING_HU]: 'Missing handling unit reported from RF',
    [RfExceptionCode.BARCODE_NOT_RECOGNIZED]: 'Barcode was not recognized from RF',
  };

  return titles[code];
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

function resolveRfCountedQuantity(dto: ScanRfStepDto): number | null {
  if (dto.quantity !== undefined) {
    return dto.quantity;
  }

  const scannedValue = dto.scannedValue?.trim();

  if (!scannedValue || !/^\d+$/.test(scannedValue)) {
    return null;
  }

  const quantity = Number(scannedValue);

  return Number.isSafeInteger(quantity) ? quantity : null;
}

function hasCycleCountMetadata(metadata: unknown): boolean {
  const record = toRecord(metadata);

  return (
    typeof record['cycleCountPlanId'] === 'string' ||
    typeof record['stockQuantId'] === 'string' ||
    typeof record['cycleCountTaskId'] === 'string'
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toJson(value: Record<string, unknown> | undefined | null): unknown {
  return value ?? undefined;
}

function mergeMetadata(metadata: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  return { ...toRecord(metadata), ...extra };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isExpectedType(value: unknown): value is RfExpectedScan['type'] {
  return (
    value === 'LOCATION' ||
    value === 'SKU' ||
    value === 'HANDLING_UNIT' ||
    value === 'QUANTITY' ||
    value === 'NONE'
  );
}

interface RfPrismaClient extends RfTransactionClient {
  $transaction<T>(fn: (client: RfTransactionClient) => Promise<T>): Promise<T>;
}

interface RfTransactionClient extends StockFreezeClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  warehouse: {
    findFirst(args: Record<string, unknown>): Promise<WarehouseRecord | null>;
  };
  scannerDevice: {
    findFirst(args: Record<string, unknown>): Promise<ScannerDeviceRecord | null>;
    update(args: Record<string, unknown>): Promise<ScannerDeviceRecord>;
  };
  scannerSession: {
    create(args: Record<string, unknown>): Promise<ScannerSessionRecord>;
    findFirst(args: Record<string, unknown>): Promise<ScannerSessionRecord | null>;
    update(args: Record<string, unknown>): Promise<ScannerSessionRecord>;
  };
  scannerWorkflowStep: {
    create(args: Record<string, unknown>): Promise<RfStepRecord>;
    findFirst(args: Record<string, unknown>): Promise<RfStepRecord | null>;
    update(args: Record<string, unknown>): Promise<RfStepRecord>;
  };
  warehouseTask: {
    findFirst(args: Record<string, unknown>): Promise<WarehouseTaskRecord | null>;
    findMany(args: Record<string, unknown>): Promise<WarehouseTaskRecord[]>;
    update(args: Record<string, unknown>): Promise<WarehouseTaskRecord>;
  };
  cycleCountPlan?: {
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  cycleCountTask?: {
    findFirst(args: Record<string, unknown>): Promise<CycleCountTaskRecord | null>;
    update(args: Record<string, unknown>): Promise<CycleCountTaskRecord>;
  };
  wmsException: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
  outboundOrder?: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<{ id: string; status: string; metadata?: unknown } | null>;
    update(
      args: Record<string, unknown>,
    ): Promise<{ id: string; status: string; metadata?: unknown }>;
  };
  reservation?: {
    findFirst(args: Record<string, unknown>): Promise<ReservationRecord | null>;
    update(args: Record<string, unknown>): Promise<ReservationRecord>;
  };
  stockQuant?: {
    findFirst(args: Record<string, unknown>): Promise<StockQuantRecord | null>;
    update(args: Record<string, unknown>): Promise<unknown>;
  };
  stockFreeze?: {
    findFirst(args: Record<string, unknown>): Promise<StockFreezeRecord | null>;
  };
  outboundOrderLine?: {
    findFirst(args: Record<string, unknown>): Promise<OutboundOrderLineRecord | null>;
    findMany(args: Record<string, unknown>): Promise<OutboundOrderLineRecord[]>;
    update(args: Record<string, unknown>): Promise<OutboundOrderLineRecord>;
  };
  stockMovement?: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  auditLog: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  outboxEvent: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
}

interface RfOfflineQueueRow {
  id: string;
  warehouse_id: string;
  session_id: string | null;
  task_id: string | null;
  scanner_device_id: string | null;
  idempotency_key: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
}

interface OfflineStatsRow {
  queued: number | string | bigint;
  failed: number | string | bigint;
  synced_today: number | string | bigint;
}

interface WarehouseRecord {
  id: string;
  code: string;
}

interface ScannerDeviceRecord {
  id: string;
  code: string;
}

interface ScannerSessionRecord {
  id: string;
  warehouseId: string;
  scannerDeviceId: string | null;
  userId: string;
  taskId: string | null;
  workflow: string;
  status: string;
  currentStepKey: string | null;
  metadata: unknown;
}

interface RfStepRecord {
  id: string;
  sessionId: string;
  stepKey: string;
  sequence: number;
  status: string;
  instruction: string;
  expectedType: string | null;
  expectedValue: string | null;
  errorCode: string | null;
  metadata: unknown;
}

interface WarehouseTaskRecord {
  id: string;
  warehouseId: string;
  type: string;
  status: string;
  assignedUserId: string | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  quantity: number | null;
  skuId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
  reservationId: string | null;
  metadata: unknown;
  priority: number;
  dueAt: Date | null;
  externalReference: string | null;
  createdAt?: Date;
  fromLocation?: { code: string; barcode?: string | null; zone?: string | null } | null;
  toLocation?: { code: string; barcode?: string | null; zone?: string | null } | null;
  sku?: { code: string; barcode?: string | null } | null;
  handlingUnit?: { code: string } | null;
}

interface ReservationRecord {
  id: string;
  stockQuantId: string;
  skuId: string;
  quantity: number;
  status: string;
}

interface StockQuantRecord {
  id: string;
  warehouseId: string;
  locationId: string;
  skuId: string;
  quantity: number;
  reservedQuantity: number;
}

interface StockFreezeRecord {
  id: string;
  warehouseId: string;
  planId?: string | null;
  locationId?: string | null;
  skuId?: string | null;
  stockQuantId?: string | null;
  status?: string | null;
  reason?: string | null;
}

interface CycleCountTaskRecord {
  id: string;
  warehouseId: string;
  planId: string;
  warehouseTaskId: string | null;
  expectedQuantity: number | null;
  countedQuantity: number | null;
  varianceQuantity: number | null;
  status: string;
  metadata: unknown;
}

interface OutboundOrderLineRecord {
  id: string;
  orderId: string;
  orderedQuantity: number;
  pickedQuantity: number;
}
