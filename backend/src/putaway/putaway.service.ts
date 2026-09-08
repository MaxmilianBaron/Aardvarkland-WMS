import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import {
  HandlingUnit,
  Prisma,
  Sku,
  StockMovement,
  StockQuant,
  User,
  Warehouse,
  WarehouseLocation,
  WarehouseTask,
} from '../generated/prisma/client';
import { StockMovementType, StockQuantStatus } from '../inventory/inventory.types';
import { lockStockQuantIdentity } from '../inventory/stock-quant-identity.helpers';
import {
  WarehouseTaskResponse,
  WarehouseTaskStatus,
  WarehouseTaskType,
} from '../warehouse-tasks/warehouse-tasks.types';
import { ConfirmPutawayTaskDto } from './dto/confirm-putaway-task.dto';
import { CreatePutawayTaskDto } from './dto/create-putaway-task.dto';
import { SuggestPutawayDto } from './dto/suggest-putaway.dto';
import {
  PutawayConfirmResponse,
  PutawayLocationResponse,
  PutawayMovementResponse,
  PutawayQuantResponse,
  PutawaySkuResponse,
  PutawaySuggestionResponse,
  PutawayTaskResponse,
} from './putaway.types';

const taskInclude = {
  assignedUser: true,
  fromLocation: true,
  handlingUnit: true,
  sku: true,
  toLocation: true,
} satisfies Prisma.WarehouseTaskInclude;

@Injectable()
export class PutawayService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(
    warehouseReference: string,
    dto: SuggestPutawayDto,
  ): Promise<PutawaySuggestionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const sourceQuant = dto.stockQuantReference
      ? await this.resolveQuant(warehouse.id, dto.stockQuantReference)
      : null;
    const sku = sourceQuant ? null : await this.resolveSuggestionSku(dto);
    const skuId = sourceQuant?.skuId ?? sku!.id;
    const sourceLocation = await this.resolveSuggestionSourceLocation(
      warehouse.id,
      dto,
      sourceQuant,
    );
    const batch = sourceQuant ? sourceQuant.batch : normalizeNullableString(dto.batch);
    const expiry = sourceQuant ? sourceQuant.expiryDate : toOptionalDate(dto.expiry);
    const suggestion = await this.findSuggestedLocation({
      warehouseId: warehouse.id,
      skuId,
      sourceLocationId: sourceQuant?.locationId ?? sourceLocation?.id ?? null,
      batch,
      expiry,
    });

    return {
      warehouseId: warehouse.id,
      skuId,
      sourceLocationId: sourceQuant?.locationId ?? sourceLocation?.id ?? null,
      suggestedLocationId: suggestion.location.id,
      suggestedLocation: toLocationResponse(suggestion.location),
      strategy: suggestion.strategy,
      reason: suggestion.reason,
      sourceQuant: sourceQuant
        ? toQuantResponse(sourceQuant, sourceQuant.sku ?? null, sourceQuant.location ?? null)
        : null,
    };
  }

  async createTask(
    warehouseReference: string,
    dto: CreatePutawayTaskDto,
    actor: AuthenticatedUser,
  ): Promise<PutawayTaskResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const sourceQuant = await this.resolveQuant(warehouse.id, dto.stockQuantReference);
    const available = quantAvailableQuantity(sourceQuant);
    const quantity = dto.quantity ?? available;

    this.assertPutawayQuantity(sourceQuant, quantity);

    const targetLocation = dto.toLocationReference
      ? await this.resolveLocation(warehouse.id, dto.toLocationReference)
      : (
          await this.findSuggestedLocation({
            warehouseId: warehouse.id,
            skuId: sourceQuant.skuId,
            sourceLocationId: sourceQuant.locationId,
            batch: sourceQuant.batch,
            expiry: sourceQuant.expiryDate,
          })
        ).location;

    if (targetLocation.id === sourceQuant.locationId) {
      throw new ConflictException('Putaway target location must be different from source location');
    }

    const assignedUserId = dto.assignedUserReference
      ? (await this.resolveUser(dto.assignedUserReference)).id
      : null;
    const task = await this.prisma.warehouseTask.create({
      data: {
        warehouseId: warehouse.id,
        type: WarehouseTaskType.PUTAWAY,
        status: WarehouseTaskStatus.OPEN,
        assignedUserId,
        fromLocationId: sourceQuant.locationId,
        toLocationId: targetLocation.id,
        skuId: sourceQuant.skuId,
        handlingUnitId: sourceQuant.handlingUnitId,
        quantity,
        metadata: toJsonInput({
          ...(dto.metadata ?? {}),
          stockQuantId: sourceQuant.id,
          batch: sourceQuant.batch,
          expiry: sourceQuant.expiryDate ? sourceQuant.expiryDate.toISOString().slice(0, 10) : null,
          strategy: dto.toLocationReference ? 'MANUAL_TARGET' : 'SUGGESTED_TARGET',
        }),
      },
      include: taskInclude,
    });

    await this.writeAudit(actor, warehouse.id, 'putaway.task_created', task, {
      sourceStockQuantId: sourceQuant.id,
      targetLocationId: targetLocation.id,
      quantity,
    });

    return {
      task: toTaskResponse(task),
      sourceQuant: toQuantResponse(
        sourceQuant,
        sourceQuant.sku ?? null,
        sourceQuant.location ?? null,
      ),
      suggestedLocation: toLocationResponse(targetLocation),
    };
  }

  async confirmTask(
    warehouseReference: string,
    taskReference: string,
    dto: ConfirmPutawayTaskDto,
    actor: AuthenticatedUser,
  ): Promise<PutawayConfirmResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const idempotentResult = await this.findIdempotentConfirmation(
      warehouse.id,
      dto.idempotencyKey,
    );

    if (idempotentResult) {
      return idempotentResult;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTaskInClient(tx, warehouse.id, taskReference);

      if (task.type !== WarehouseTaskType.PUTAWAY) {
        throw new ConflictException('Only PUTAWAY tasks can be confirmed through putaway flow');
      }

      if (
        task.status !== WarehouseTaskStatus.OPEN &&
        task.status !== WarehouseTaskStatus.IN_PROGRESS
      ) {
        throw new ConflictException(`Cannot confirm PUTAWAY task in ${task.status} status`);
      }

      const sourceQuant = await this.resolveConfirmationSourceQuant(tx, warehouse.id, task, dto);
      const sourceLocationId = dto.fromLocationReference
        ? (await this.resolveLocationInClient(tx, warehouse.id, dto.fromLocationReference)).id
        : task.fromLocationId;

      if (sourceLocationId && sourceLocationId !== sourceQuant.locationId) {
        throw new ConflictException('Scanned source location does not match source stock quant');
      }

      const targetLocation = dto.toLocationReference
        ? await this.resolveLocationInClient(tx, warehouse.id, dto.toLocationReference)
        : task.toLocation;

      if (!targetLocation) {
        throw new ConflictException('Putaway task is missing a target location');
      }

      if (targetLocation.id === sourceQuant.locationId) {
        throw new ConflictException(
          'Putaway target location must be different from source location',
        );
      }

      const quantity = dto.quantity ?? task.quantity ?? quantAvailableQuantity(sourceQuant);
      this.assertPutawayQuantity(sourceQuant, quantity);

      const updatedSourceQuant = await tx.stockQuant.update({
        where: { id: sourceQuant.id },
        data: { quantity: { decrement: quantity } },
        include: { location: true, sku: true },
      });
      const targetQuant = await this.incrementOrCreateTargetQuant(
        tx,
        sourceQuant,
        targetLocation,
        quantity,
      );
      const movement = await tx.stockMovement.create({
        data: {
          warehouseId: warehouse.id,
          skuId: sourceQuant.skuId,
          stockQuantId: targetQuant.id,
          taskId: task.id,
          actorUserId: actor.id,
          type: StockMovementType.PUTAWAY,
          quantity,
          fromLocationId: sourceQuant.locationId,
          toLocationId: targetLocation.id,
          referenceType: 'PUTAWAY_TASK',
          referenceId: task.id,
          sourceSystem: dto.idempotencyKey ? 'WMS' : null,
          idempotencyKey: normalizeNullableString(dto.idempotencyKey),
          metadata: toJsonInput({
            ...(dto.metadata ?? {}),
            sourceStockQuantId: sourceQuant.id,
            targetStockQuantId: targetQuant.id,
            quantityDelta: 0,
          }),
        },
      });
      const updatedTask = await tx.warehouseTask.update({
        where: { id: task.id },
        data: {
          status: WarehouseTaskStatus.DONE,
          startedAt: task.startedAt ?? new Date(),
          completedAt: new Date(),
          fromLocationId: sourceQuant.locationId,
          toLocationId: targetLocation.id,
          quantity,
          metadata: toJsonInput(
            mergeMetadata(task.metadata, {
              putawayConfirmedAt: new Date().toISOString(),
              sourceStockQuantId: sourceQuant.id,
              targetStockQuantId: targetQuant.id,
              targetLocationId: targetLocation.id,
              idempotencyKey: normalizeNullableString(dto.idempotencyKey),
              confirmationMetadata: dto.metadata ?? null,
            }),
          ),
        },
        include: taskInclude,
      });

      await this.writeAuditInClient(
        tx,
        actor,
        warehouse.id,
        'putaway.task_confirmed',
        updatedTask,
        {
          sourceStockQuantId: sourceQuant.id,
          targetStockQuantId: targetQuant.id,
          movementId: movement.id,
          quantity,
        },
      );

      return { updatedTask, updatedSourceQuant, targetQuant, movement };
    });

    return {
      task: toTaskResponse(result.updatedTask),
      sourceQuant: toQuantResponse(
        result.updatedSourceQuant,
        result.updatedSourceQuant.sku ?? null,
        result.updatedSourceQuant.location ?? null,
      ),
      targetQuant: toQuantResponse(
        result.targetQuant,
        result.targetQuant.sku ?? null,
        result.targetQuant.location ?? null,
      ),
      movement: toMovementResponse(result.movement),
    };
  }

  private async findIdempotentConfirmation(
    warehouseId: string,
    rawIdempotencyKey: string | undefined,
  ): Promise<PutawayConfirmResponse | null> {
    const idempotencyKey = normalizeOptionalString(rawIdempotencyKey);

    if (!idempotencyKey) {
      return null;
    }

    const movement = await this.prisma.stockMovement.findFirst({
      where: {
        warehouseId,
        sourceSystem: 'WMS',
        idempotencyKey,
      },
    });

    if (!movement) {
      return null;
    }

    if (movement.type !== StockMovementType.PUTAWAY) {
      throw new ConflictException(
        'Idempotency key has already been used for another stock movement',
      );
    }

    if (!movement.taskId || !movement.stockQuantId) {
      throw new ConflictException('Idempotent putaway movement is missing task or target quant');
    }

    const task = await this.resolveTask(warehouseId, movement.taskId);
    const targetQuant = await this.resolveQuant(warehouseId, movement.stockQuantId);
    const sourceStockQuantId = readStringFromObject(movement.metadata, 'sourceStockQuantId');
    const sourceQuant = sourceStockQuantId
      ? await this.resolveQuant(warehouseId, sourceStockQuantId)
      : targetQuant;

    return {
      task: toTaskResponse(task),
      sourceQuant: toQuantResponse(
        sourceQuant,
        sourceQuant.sku ?? null,
        sourceQuant.location ?? null,
      ),
      targetQuant: toQuantResponse(
        targetQuant,
        targetQuant.sku ?? null,
        targetQuant.location ?? null,
      ),
      movement: toMovementResponse(movement),
    };
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveLocation(
    warehouseId: string,
    locationReference: string,
  ): Promise<WarehouseLocation> {
    return this.resolveLocationInClient(this.prisma, warehouseId, locationReference);
  }

  private async resolveLocationInClient(
    client: PutawayTransactionClient,
    warehouseId: string,
    locationReference: string,
  ): Promise<WarehouseLocation> {
    const location = await client.warehouseLocation.findFirst({
      where: locationReferenceWhere(warehouseId, locationReference),
    });

    if (!location) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return location;
  }

  private async resolveQuant(
    warehouseId: string,
    quantReference: string,
  ): Promise<StockQuantWithRelations> {
    const normalized = quantReference.trim();
    const quant = await this.prisma.stockQuant.findFirst({
      where: isUuid(normalized)
        ? { warehouseId, id: normalized }
        : { warehouseId, externalReference: normalized },
      include: { location: true, sku: true },
    });

    if (!quant) {
      throw new NotFoundException('Stock quant was not found');
    }

    return quant;
  }

  private async resolveQuantInClient(
    client: PutawayTransactionClient,
    warehouseId: string,
    quantReference: string,
  ): Promise<StockQuantWithRelations> {
    const normalized = quantReference.trim();
    const quant = await client.stockQuant.findFirst({
      where: isUuid(normalized)
        ? { warehouseId, id: normalized }
        : { warehouseId, externalReference: normalized },
      include: { location: true, sku: true },
    });

    if (!quant) {
      throw new NotFoundException('Stock quant was not found');
    }

    return quant;
  }

  private async resolveSuggestionSku(dto: SuggestPutawayDto): Promise<Sku> {
    if (!dto.skuReference) {
      throw new ConflictException('skuReference is required when stockQuantReference is omitted');
    }

    return this.resolveSku(dto.skuReference);
  }

  private async resolveSuggestionSourceLocation(
    warehouseId: string,
    dto: SuggestPutawayDto,
    sourceQuant: StockQuantWithRelations | null,
  ): Promise<WarehouseLocation | null> {
    if (sourceQuant) {
      return sourceQuant.location ?? null;
    }

    return dto.fromLocationReference
      ? this.resolveLocation(warehouseId, dto.fromLocationReference)
      : null;
  }

  private async resolveSku(skuReference: string): Promise<Sku> {
    const sku = await this.prisma.sku.findFirst({
      where: skuReferenceWhere(skuReference),
    });

    if (!sku) {
      throw new NotFoundException('SKU was not found');
    }

    return sku;
  }

  private async resolveUser(userReference: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: userReferenceWhere(userReference),
    });

    if (!user) {
      throw new NotFoundException('Assigned user was not found');
    }

    return user;
  }

  private async resolveTask(
    warehouseId: string,
    taskReference: string,
  ): Promise<WarehouseTaskWithRelations> {
    return this.resolveTaskInClient(this.prisma, warehouseId, taskReference);
  }

  private async resolveTaskInClient(
    client: PutawayTransactionClient,
    warehouseId: string,
    taskReference: string,
  ): Promise<WarehouseTaskWithRelations> {
    if (!isUuid(taskReference)) {
      throw new NotFoundException('Warehouse task was not found');
    }

    const task = await client.warehouseTask.findFirst({
      where: { warehouseId, id: taskReference },
      include: taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Warehouse task was not found');
    }

    return task;
  }

  private async resolveConfirmationSourceQuant(
    client: PutawayTransactionClient,
    warehouseId: string,
    task: WarehouseTaskWithRelations,
    dto: ConfirmPutawayTaskDto,
  ): Promise<StockQuantWithRelations> {
    const metadataStockQuantId = readStringFromObject(task.metadata, 'stockQuantId');
    const stockQuantReference = dto.stockQuantReference ?? metadataStockQuantId;

    if (stockQuantReference) {
      return this.resolveQuantInClient(client, warehouseId, stockQuantReference);
    }

    if (!task.skuId || !task.fromLocationId) {
      throw new ConflictException('Putaway task is missing source stock context');
    }

    const quant = await client.stockQuant.findFirst({
      where: {
        warehouseId,
        skuId: task.skuId,
        locationId: task.fromLocationId,
        status: StockQuantStatus.AVAILABLE,
        quantity: { gt: 0 },
      },
      orderBy: [{ createdAt: 'asc' }],
      include: { location: true, sku: true },
    });

    if (!quant) {
      throw new NotFoundException('Source stock quant was not found');
    }

    return quant;
  }

  private async findSuggestedLocation(input: PutawaySuggestionInput): Promise<PutawaySuggestion> {
    const consolidationQuant = await this.prisma.stockQuant.findFirst({
      where: {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        status: StockQuantStatus.AVAILABLE,
        quantity: { gt: 0 },
        batch: input.batch,
        expiryDate: input.expiry,
        ...(input.sourceLocationId ? { NOT: { locationId: input.sourceLocationId } } : {}),
      },
      include: { location: true },
      orderBy: [{ quantity: 'desc' }, { updatedAt: 'desc' }],
    });

    if (consolidationQuant?.location) {
      return {
        location: consolidationQuant.location,
        strategy: 'CONSOLIDATE_SAME_SKU_BATCH',
        reason: 'Existing stock with the same SKU, batch, and expiry is already stored there.',
      };
    }

    const emptyStorageLocation = await this.prisma.warehouseLocation.findFirst({
      where: {
        warehouseId: input.warehouseId,
        isActive: true,
        type: { in: ['STORAGE', 'PICKING'] },
        children: { none: {} },
        stockQuants: { none: { quantity: { gt: 0 } } },
        ...(input.sourceLocationId ? { NOT: { id: input.sourceLocationId } } : {}),
      },
      orderBy: [{ code: 'asc' }],
    });

    if (emptyStorageLocation) {
      return {
        location: emptyStorageLocation,
        strategy: 'EMPTY_STORAGE_BIN',
        reason: 'First active empty storage bin is available for putaway.',
      };
    }

    const firstStorageLocation = await this.prisma.warehouseLocation.findFirst({
      where: {
        warehouseId: input.warehouseId,
        isActive: true,
        type: { in: ['STORAGE', 'PICKING'] },
        children: { none: {} },
        ...(input.sourceLocationId ? { NOT: { id: input.sourceLocationId } } : {}),
      },
      orderBy: [{ code: 'asc' }],
    });

    if (!firstStorageLocation) {
      throw new NotFoundException('No active storage location is available for putaway');
    }

    return {
      location: firstStorageLocation,
      strategy: 'FIRST_STORAGE_BIN',
      reason:
        'No consolidation or empty bin candidate was found; first active storage bin is used.',
    };
  }

  private async incrementOrCreateTargetQuant(
    client: PutawayTransactionClient,
    sourceQuant: StockQuantWithRelations,
    targetLocation: WarehouseLocation,
    quantity: number,
  ): Promise<StockQuantWithRelations> {
    await lockStockQuantIdentity(client, {
      warehouseId: sourceQuant.warehouseId,
      skuId: sourceQuant.skuId,
      locationId: targetLocation.id,
      status: sourceQuant.status,
      ownerClientId: sourceQuant.ownerClientId ?? null,
      lotId: sourceQuant.lotId ?? null,
      batch: sourceQuant.batch,
      expiry: sourceQuant.expiryDate,
      handlingUnitId: sourceQuant.handlingUnitId,
    });

    const existing = await client.stockQuant.findFirst({
      where: {
        warehouseId: sourceQuant.warehouseId,
        skuId: sourceQuant.skuId,
        locationId: targetLocation.id,
        status: sourceQuant.status,
        ownerClientId: sourceQuant.ownerClientId ?? null,
        lotId: sourceQuant.lotId ?? null,
        batch: sourceQuant.batch,
        expiryDate: sourceQuant.expiryDate,
        handlingUnitId: sourceQuant.handlingUnitId,
      },
      include: { location: true, sku: true },
    });

    if (existing) {
      return client.stockQuant.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } },
        include: { location: true, sku: true },
      });
    }

    return client.stockQuant.create({
      data: {
        warehouseId: sourceQuant.warehouseId,
        skuId: sourceQuant.skuId,
        locationId: targetLocation.id,
        status: sourceQuant.status,
        ownerClientId: sourceQuant.ownerClientId ?? null,
        lotId: sourceQuant.lotId ?? null,
        batch: sourceQuant.batch,
        expiryDate: sourceQuant.expiryDate,
        handlingUnitId: sourceQuant.handlingUnitId,
        quantity,
        reservedQuantity: 0,
      },
      include: { location: true, sku: true },
    });
  }

  private assertPutawayQuantity(sourceQuant: StockQuantWithRelations, quantity: number): void {
    if (quantity <= 0) {
      throw new ConflictException('Putaway quantity must be greater than zero');
    }

    if (sourceQuant.status !== StockQuantStatus.AVAILABLE) {
      throw new ConflictException('Only AVAILABLE stock can be put away');
    }

    if (quantity > quantAvailableQuantity(sourceQuant)) {
      throw new ConflictException('Insufficient unreserved stock for putaway');
    }

    if (sourceQuant.handlingUnitId && quantity !== sourceQuant.quantity) {
      throw new ConflictException('Handling unit putaway must move the full source quant');
    }
  }

  private writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    task: WarehouseTask,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.writeAuditInClient(this.prisma, actor, warehouseId, action, task, extraMetadata);
  }

  private async writeAuditInClient(
    client: PutawayTransactionClient,
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    task: WarehouseTask,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'warehouse_task',
        resourceId: task.id,
        metadata: {
          type: task.type,
          status: task.status,
          fromLocationId: task.fromLocationId ?? null,
          toLocationId: task.toLocationId ?? null,
          skuId: task.skuId ?? null,
          quantity: task.quantity ?? null,
          ...extraMetadata,
        },
      },
    });
  }
}

function toTaskResponse(task: WarehouseTaskWithRelations): WarehouseTaskResponse {
  return {
    id: task.id,
    warehouseId: task.warehouseId,
    type: task.type,
    status: task.status,
    assignedUserId: task.assignedUserId ?? null,
    assignedUser: task.assignedUser
      ? {
          id: task.assignedUser.id,
          email: task.assignedUser.email,
          displayName: task.assignedUser.displayName,
        }
      : null,
    fromLocationId: task.fromLocationId ?? null,
    fromLocation: task.fromLocation ? toTaskLocationResponse(task.fromLocation) : null,
    toLocationId: task.toLocationId ?? null,
    toLocation: task.toLocation ? toTaskLocationResponse(task.toLocation) : null,
    skuId: task.skuId ?? null,
    sku: task.sku
      ? {
          id: task.sku.id,
          code: task.sku.code,
          name: task.sku.name,
          barcode: task.sku.barcode,
          uom: task.sku.uom,
        }
      : null,
    outboundOrderId: null,
    outboundOrderLineId: null,
    inboundShipmentId: null,
    inboundShipmentLineId: null,
    reservationId: null,
    quantity: task.quantity ?? null,
    handlingUnitId: task.handlingUnitId ?? null,
    handlingUnitReference: task.handlingUnit?.code ?? null,
    handlingUnit: task.handlingUnit
      ? {
          id: task.handlingUnit.id,
          code: task.handlingUnit.code,
          type: task.handlingUnit.type,
          status: task.handlingUnit.status,
        }
      : null,
    externalReference: null,
    failureReason: null,
    version: null,
    metadata: task.metadata ?? null,
    assignedAt: null,
    dueAt: null,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function toQuantResponse(
  quant: StockQuantWithRelations,
  sku: Sku | null,
  location: WarehouseLocation | null,
): PutawayQuantResponse {
  return {
    id: quant.id,
    warehouseId: quant.warehouseId,
    skuId: quant.skuId,
    locationId: quant.locationId,
    status: quant.status,
    batch: quant.batch,
    expiry: quant.expiryDate,
    quantity: quant.quantity,
    reservedQuantity: quant.reservedQuantity,
    availableQuantity: quantAvailableQuantity(quant),
    sku: sku ? toSkuResponse(sku) : null,
    location: location ? toLocationResponse(location) : null,
  };
}

function toMovementResponse(movement: StockMovement): PutawayMovementResponse {
  return {
    id: movement.id,
    warehouseId: movement.warehouseId,
    skuId: movement.skuId,
    stockQuantId: movement.stockQuantId,
    taskId: movement.taskId,
    type: movement.type,
    quantity: movement.quantity,
    fromLocationId: movement.fromLocationId,
    toLocationId: movement.toLocationId,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    idempotencyKey: movement.idempotencyKey,
    metadata: movement.metadata,
    occurredAt: movement.occurredAt,
    createdAt: movement.createdAt,
  };
}

function toSkuResponse(sku: Sku): PutawaySkuResponse {
  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    barcode: sku.barcode,
    uom: sku.uom,
  };
}

function toLocationResponse(location: WarehouseLocation): PutawayLocationResponse {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
    zone: location.zone,
  };
}

function toTaskLocationResponse(location: WarehouseLocation) {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    zone: location.zone,
  };
}

function quantAvailableQuantity(
  quant: Pick<StockQuant, 'quantity' | 'reservedQuantity' | 'status'>,
): number {
  if (quant.status !== StockQuantStatus.AVAILABLE) {
    return 0;
  }

  return Math.max(quant.quantity - quant.reservedQuantity, 0);
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  if (isUuid(reference)) {
    return { OR: [{ id: reference }, { code: normalizeCode(reference) }] };
  }

  return { code: normalizeCode(reference) };
}

function locationReferenceWhere(
  warehouseId: string,
  reference: string,
): Prisma.WarehouseLocationWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { warehouseId, code: normalizeCode(reference) };
}

function skuReferenceWhere(reference: string): Prisma.SkuWhereInput {
  const normalized = reference.trim();

  if (isUuid(normalized)) {
    return {
      OR: [{ id: normalized }, { code: normalizeCode(normalized) }],
    };
  }

  return { OR: [{ code: normalizeCode(normalized) }, { barcode: normalized }] };
}

function userReferenceWhere(reference: string): Prisma.UserWhereInput {
  const normalized = reference.trim();

  if (isUuid(normalized)) {
    return { id: normalized };
  }

  return { email: normalized.toLowerCase() };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  return normalizeOptionalString(value);
}

function toOptionalDate(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}

function toJsonInput(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function mergeMetadata(
  currentMetadata: unknown,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const current =
    currentMetadata && typeof currentMetadata === 'object' && !Array.isArray(currentMetadata)
      ? (currentMetadata as Record<string, unknown>)
      : {};

  return {
    ...current,
    ...updates,
  };
}

function readStringFromObject(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type PutawayTransactionClient = Prisma.TransactionClient;

type StockQuantWithRelations = StockQuant & {
  location?: WarehouseLocation | null;
  sku?: Sku | null;
};

type WarehouseTaskWithRelations = WarehouseTask & {
  assignedUser?: User | null;
  fromLocation?: WarehouseLocation | null;
  handlingUnit?: HandlingUnit | null;
  sku?: Sku | null;
  toLocation?: WarehouseLocation | null;
};

interface PutawaySuggestionInput {
  warehouseId: string;
  skuId: string;
  sourceLocationId: string | null;
  batch: string | null;
  expiry: Date | null;
}

interface PutawaySuggestion {
  location: WarehouseLocation;
  strategy: PutawaySuggestionResponse['strategy'];
  reason: string;
}
