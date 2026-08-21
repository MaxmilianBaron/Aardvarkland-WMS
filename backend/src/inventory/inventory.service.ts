import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import {
  OwnerClientRecord,
  OwnerScopePrismaClient,
  OwnerScopeService,
} from '../clients/owner-scope.service';
import { normalizeOffsetPagination } from '../common';
import { lockPostgresRowById, PrismaService, withTransactionRetry } from '../database';
import { Prisma, Warehouse, WarehouseLocation } from '../generated/prisma/client';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { BlockStockDto } from './dto/block-stock.dto';
import { ListStockBalancesQueryDto } from './dto/list-stock-balances-query.dto';
import { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto';
import { ListStockQuantsQueryDto } from './dto/list-stock-quants-query.dto';
import { MoveStockDto } from './dto/move-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { UnblockStockDto } from './dto/unblock-stock.dto';
import { withStockAdjustmentReasonMetadata } from './stock-adjustment-reason-codes';
import { assertNoBlockingStockFreeze } from './stock-freeze.helpers';
import { lockStockQuantIdentity } from './stock-quant-identity.helpers';
import { rebuildStockBalancesFromMovements, StockLedgerMovementInput } from './stock-balance-rebuild.helpers';
import {
  InventoryLocationResponse,
  InventorySkuResponse,
  StockBalanceRebuildPreviewResponse,
  StockBalanceResponse,
  StockConsistencyIssueResponse,
  StockConsistencyResponse,
  StockMovementResponse,
  StockMovementType,
  StockOperationResponse,
  StockQuantResponse,
  StockQuantStatus,
} from './inventory.types';

const DEFAULT_LIST_TAKE = 100;
const BLOCK_TARGET_STATUSES = new Set<StockQuantStatus>([
  StockQuantStatus.BLOCKED,
  StockQuantStatus.DAMAGED,
  StockQuantStatus.QUARANTINE,
]);
const UNBLOCK_SOURCE_STATUSES = BLOCK_TARGET_STATUSES;
const UNBLOCK_TARGET_STATUSES = new Set<StockQuantStatus>([
  StockQuantStatus.AVAILABLE,
  StockQuantStatus.RESERVED,
]);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerScope: OwnerScopeService,
  ) {}

  async findQuants(
    warehouseReference: string,
    query: ListStockQuantsQueryDto,
  ): Promise<StockQuantResponse[]> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const page = normalizeOffsetPagination(query, { defaultTake: DEFAULT_LIST_TAKE, maxTake: 500 });
    const sku = query.skuReference ? await this.resolveSku(client, query.skuReference) : null;
    const location = query.locationReference
      ? await this.resolveLocation(client, warehouse.id, query.locationReference)
      : null;
    const batch = normalizeOptionalString(query.batch);
    const ownedQuantIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId: warehouse.id,
      clientReference: query.ownerClientReference,
      resourceType: 'STOCK_QUANT',
    });
    const where: StockQuantWhereInput = {
      warehouseId: warehouse.id,
      ...(ownedQuantIds ? { id: { in: ownedQuantIds } } : {}),
      ...(sku ? { skuId: sku.id } : {}),
      ...(location ? { locationId: location.id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(batch === undefined ? {} : { batch }),
      ...(query.expiringBefore ? { expiryDate: { lte: new Date(query.expiringBefore) } } : {}),
      ...(query.includeZero ? {} : { quantity: { gt: 0 } }),
    };

    const quants = await client.stockQuant.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: page.take,
      skip: page.skip,
    });

    return this.toQuantResponses(client, quants);
  }

  async findQuant(warehouseReference: string, quantReference: string): Promise<StockQuantResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const quant = await this.resolveQuant(client, warehouse.id, quantReference);

    return this.toQuantResponse(client, quant);
  }

  async findBalances(
    warehouseReference: string,
    query: ListStockBalancesQueryDto,
  ): Promise<StockBalanceResponse[]> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const page = normalizeOffsetPagination(query, { defaultTake: DEFAULT_LIST_TAKE, maxTake: 500 });
    const sku = query.skuReference ? await this.resolveSku(client, query.skuReference) : null;
    const location = query.locationReference
      ? await this.resolveLocation(client, warehouse.id, query.locationReference)
      : null;
    const batch = normalizeOptionalString(query.batch);
    const ownedQuantIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId: warehouse.id,
      clientReference: query.ownerClientReference,
      resourceType: 'STOCK_QUANT',
    });
    const where: StockQuantWhereInput = {
      warehouseId: warehouse.id,
      ...(ownedQuantIds ? { id: { in: ownedQuantIds } } : {}),
      ...(sku ? { skuId: sku.id } : {}),
      ...(location ? { locationId: location.id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(batch === undefined ? {} : { batch }),
      ...(query.expiringBefore ? { expiryDate: { lte: new Date(query.expiringBefore) } } : {}),
      ...(query.includeZero ? {} : { quantity: { gt: 0 } }),
    };
    const quants = await client.stockQuant.findMany({
      where,
      orderBy: [{ skuId: 'asc' }, { locationId: 'asc' }, { updatedAt: 'desc' }],
      take: page.take,
      skip: page.skip,
    });

    return this.toBalanceResponses(client, groupStockBalances(quants));
  }

  async checkConsistency(warehouseReference: string): Promise<StockConsistencyResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const [quants, activeReservations] = await Promise.all([
      client.stockQuant.findMany({
        where: { warehouseId: warehouse.id },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      client.reservation.findMany({
        where: { warehouseId: warehouse.id, status: 'ACTIVE' },
      }),
    ]);
    const issues: StockConsistencyIssueResponse[] = [];
    const quantsById = mapById(quants);
    const activeReservedByQuantId = new Map<string, number>();

    for (const reservation of activeReservations) {
      const quantity = toNumber(reservation.quantity);

      if (quantity <= 0) {
        issues.push({
          type: 'ACTIVE_RESERVATION_NON_POSITIVE_QUANTITY',
          severity: 'ERROR',
          message: 'Active reservation must have quantity greater than zero.',
          reservationId: reservation.id,
          stockQuantId: reservation.stockQuantId,
          actual: quantity,
        });
      }

      if (!quantsById.has(reservation.stockQuantId)) {
        issues.push({
          type: 'ACTIVE_RESERVATION_MISSING_QUANT',
          severity: 'ERROR',
          message: 'Active reservation points to a missing stock quant.',
          reservationId: reservation.id,
          stockQuantId: reservation.stockQuantId,
          actual: quantity,
        });
      }

      activeReservedByQuantId.set(
        reservation.stockQuantId,
        (activeReservedByQuantId.get(reservation.stockQuantId) ?? 0) + quantity,
      );
    }

    for (const quant of quants) {
      const quantity = toNumber(quant.quantity);
      const reservedQuantity = getQuantReservedQuantity(quant);
      const activeReservedQuantity = activeReservedByQuantId.get(quant.id) ?? 0;

      if (quantity < 0) {
        issues.push({
          type: 'NEGATIVE_QUANT_QUANTITY',
          severity: 'ERROR',
          message: 'Stock quant quantity cannot be negative.',
          stockQuantId: quant.id,
          skuId: quant.skuId,
          locationId: quant.locationId,
          actual: quantity,
        });
      }

      if (reservedQuantity < 0) {
        issues.push({
          type: 'NEGATIVE_RESERVED_QUANTITY',
          severity: 'ERROR',
          message: 'Stock quant reserved quantity cannot be negative.',
          stockQuantId: quant.id,
          skuId: quant.skuId,
          locationId: quant.locationId,
          actual: reservedQuantity,
        });
      }

      if (reservedQuantity > quantity) {
        issues.push({
          type: 'RESERVED_EXCEEDS_ON_HAND',
          severity: 'ERROR',
          message: 'Reserved quantity cannot be greater than on-hand quantity.',
          stockQuantId: quant.id,
          skuId: quant.skuId,
          locationId: quant.locationId,
          expected: quantity,
          actual: reservedQuantity,
        });
      }

      if (reservedQuantity !== activeReservedQuantity) {
        issues.push({
          type: 'RESERVED_QUANTITY_MISMATCH',
          severity: 'ERROR',
          message: 'Stock quant reserved quantity does not match active reservation quantity.',
          stockQuantId: quant.id,
          skuId: quant.skuId,
          locationId: quant.locationId,
          expected: activeReservedQuantity,
          actual: reservedQuantity,
        });
      }
    }

    return {
      status: issues.length === 0 ? 'OK' : 'ISSUES',
      warehouseId: warehouse.id,
      checkedAt: new Date(),
      quantCount: quants.length,
      activeReservationCount: activeReservations.length,
      issueCount: issues.length,
      issues,
    };
  }


  async rebuildBalancePreview(warehouseReference: string): Promise<StockBalanceRebuildPreviewResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const rows = await this.prisma.$queryRawUnsafe<StockLedgerMovementInput[]>(
      `SELECT
         m.warehouse_id AS "warehouseId",
         m.owner_client_id AS "ownerClientId",
         m.sku_id AS "skuId",
         sq.lot_id AS "lotId",
         m.from_location_id AS "fromLocationId",
         m.to_location_id AS "toLocationId",
         m.type::text AS "type",
         m.quantity AS "quantity",
         m.metadata AS "metadata"
       FROM stock_movements m
       LEFT JOIN stock_quants sq ON sq.id = m.stock_quant_id
       WHERE m.warehouse_id = $1::uuid
       ORDER BY m.occurred_at ASC, m.created_at ASC`,
      warehouse.id,
    );
    const result = rebuildStockBalancesFromMovements(rows);
    return {
      generatedAt: new Date().toISOString(),
      movementCount: rows.length,
      balanceCount: result.balances.length,
      balances: result.balances,
      issues: result.issues,
    };
  }

  async findMovements(
    warehouseReference: string,
    query: ListStockMovementsQueryDto,
  ): Promise<StockMovementResponse[]> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const page = normalizeOffsetPagination(query, { defaultTake: DEFAULT_LIST_TAKE, maxTake: 500 });
    const sku = query.skuReference ? await this.resolveSku(client, query.skuReference) : null;
    const quant = query.quantReference
      ? await this.resolveQuant(client, warehouse.id, query.quantReference)
      : null;
    const location = query.locationReference
      ? await this.resolveLocation(client, warehouse.id, query.locationReference)
      : null;
    const occurredAt = toDateRange(query.occurredFrom, query.occurredTo);
    const reference = normalizeOptionalString(query.reference);
    const idempotencyKey = normalizeOptionalString(query.idempotencyKey);
    const ownedQuantIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId: warehouse.id,
      clientReference: query.ownerClientReference,
      resourceType: 'STOCK_QUANT',
    });
    const ownerQuantFilter = ownedQuantIds
      ? quant
        ? ownedQuantIds.includes(quant.id)
          ? { stockQuantId: quant.id }
          : { stockQuantId: { in: [] } }
        : { stockQuantId: { in: ownedQuantIds } }
      : quant
        ? { stockQuantId: quant.id }
        : {};
    const where: StockMovementWhereInput = {
      warehouseId: warehouse.id,
      ...(query.type ? { type: query.type } : {}),
      ...(sku ? { skuId: sku.id } : {}),
      ...ownerQuantFilter,
      ...(location ? { OR: [{ fromLocationId: location.id }, { toLocationId: location.id }] } : {}),
      ...(reference === undefined
        ? {}
        : { OR: [{ referenceType: reference }, { referenceId: reference }] }),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      ...(occurredAt ? { occurredAt } : {}),
    };

    const movements = await client.stockMovement.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: page.take,
      skip: page.skip,
    });

    return this.toMovementResponses(client, movements);
  }

  async findMovement(
    warehouseReference: string,
    movementReference: string,
  ): Promise<StockMovementResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const movement = await this.resolveMovement(client, warehouse.id, movementReference);

    return this.toMovementResponse(client, movement);
  }

  async receive(
    warehouseReference: string,
    dto: ReceiveStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockOperationResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const existingOperation = await this.findIdempotentOperation(
      client,
      warehouse.id,
      StockMovementType.RECEIVE,
      dto.idempotencyKey,
    );

    if (existingOperation) {
      return existingOperation;
    }

    const sku = await this.resolveSku(client, dto.skuReference);
    const location = await this.resolveLocation(client, warehouse.id, dto.locationReference);
    const status = dto.status ?? StockQuantStatus.AVAILABLE;
    const batch = normalizeNullableString(dto.batch);
    const expiry = toOptionalDate(dto.expiry) ?? null;
    const result = await this.transaction(client, async (tx) => {
      await assertNoBlockingStockFreeze(tx, {
        warehouseId: warehouse.id,
        locationId: location.id,
        skuId: sku.id,
        operation: 'receive stock',
      });
      const owner = await this.resolveOperationOwner(
        tx,
        warehouse.id,
        this.ownerScope.readOwnerClientReference({
          ownerClientReference: dto.ownerClientReference,
          metadata: dto.metadata,
        }),
        [],
      );
      const quant = await this.incrementOrCreateQuant(tx, {
        warehouseId: warehouse.id,
        skuId: sku.id,
        locationId: location.id,
        status,
        ownerClientId: owner?.id ?? null,
        lotId: null,
        batch,
        expiry,
        quantity: dto.quantity,
      });
      const movement = await this.createStockMovement(tx, {
        warehouseId: warehouse.id,
        quantId: quant.id,
        skuId: sku.id,
        type: StockMovementType.RECEIVE,
        quantityDelta: dto.quantity,
        quantity: dto.quantity,
        toLocationId: location.id,
        actorUserId: actor.id,
        reference: normalizeNullableString(dto.reference),
        idempotencyKey: normalizeNullableString(dto.idempotencyKey),
        metadata: toJsonInput(dto.metadata),
      });

      if (owner) {
        await this.linkOwnerResources(tx, warehouse.id, owner, [
          {
            resourceType: 'STOCK_QUANT',
            resourceId: quant.id,
            metadata: { source: 'inventory.receive' },
          },
          {
            resourceType: 'STOCK_MOVEMENT',
            resourceId: movement.id,
            metadata: { source: 'inventory.receive', stockQuantId: quant.id },
          },
        ]);
      }

      await this.writeMovementAudit(tx, actor, warehouse.id, movement);

      return { movement, quant };
    });

    return this.toOperationResponse(client, result.quant, result.movement);
  }

  async move(
    warehouseReference: string,
    dto: MoveStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockOperationResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const existingOperation = await this.findIdempotentOperation(
      client,
      warehouse.id,
      StockMovementType.MOVE,
      dto.idempotencyKey,
    );

    if (existingOperation) {
      return existingOperation;
    }

    const destination = await this.resolveLocation(client, warehouse.id, dto.toLocationReference);
    const sourceQuant = await this.resolveMoveSourceQuant(client, warehouse.id, dto);

    if (sourceQuant.locationId === destination.id) {
      throw new ConflictException('Source and destination locations must be different');
    }

    const result = await this.transaction(client, async (tx) => {
      const currentSourceQuant = await this.resolveQuant(tx, warehouse.id, sourceQuant.id);
      await assertNoBlockingStockFreeze(tx, {
        warehouseId: warehouse.id,
        locationId: destination.id,
        skuId: currentSourceQuant.skuId,
        operation: 'move stock into destination',
      });
      await this.decrementQuant(tx, currentSourceQuant, dto.quantity, {
        preserveReservedQuantity: true,
      });
      const targetQuant = await this.incrementOrCreateQuant(tx, {
        warehouseId: warehouse.id,
        skuId: currentSourceQuant.skuId,
        locationId: destination.id,
        status: currentSourceQuant.status,
        ownerClientId: currentSourceQuant.ownerClientId ?? null,
        lotId: currentSourceQuant.lotId ?? null,
        batch: currentSourceQuant.batch,
        expiry: readDateCandidate(currentSourceQuant, ['expiry', 'expiryDate', 'expiresAt']),
        quantity: dto.quantity,
      });
      const movement = await this.createStockMovement(tx, {
        warehouseId: warehouse.id,
        quantId: targetQuant.id,
        skuId: currentSourceQuant.skuId,
        type: StockMovementType.MOVE,
        quantityDelta: 0,
        quantity: dto.quantity,
        fromLocationId: currentSourceQuant.locationId,
        toLocationId: destination.id,
        actorUserId: actor.id,
        reference: normalizeNullableString(dto.reference),
        idempotencyKey: normalizeNullableString(dto.idempotencyKey),
        metadata: toJsonInput(
          withStockAdjustmentReasonMetadata(dto.metadata, dto.reasonCode, dto.reason),
        ),
      });

      const owner = await this.resolveOperationOwner(
        tx,
        warehouse.id,
        this.ownerScope.readOwnerClientReference({
          ownerClientReference: dto.ownerClientReference,
          metadata: dto.metadata,
        }),
        [{ resourceType: 'STOCK_QUANT', resourceId: currentSourceQuant.id }],
      );
      if (owner) {
        await this.linkOwnerResources(tx, warehouse.id, owner, [
          {
            resourceType: 'STOCK_QUANT',
            resourceId: targetQuant.id,
            metadata: { source: 'inventory.move', sourceStockQuantId: currentSourceQuant.id },
          },
          {
            resourceType: 'STOCK_MOVEMENT',
            resourceId: movement.id,
            metadata: { source: 'inventory.move', stockQuantId: targetQuant.id },
          },
        ]);
      }

      await this.writeMovementAudit(tx, actor, warehouse.id, movement);

      return { movement, quant: targetQuant };
    });

    return this.toOperationResponse(client, result.quant, result.movement);
  }

  async adjust(
    warehouseReference: string,
    dto: AdjustStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockOperationResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const existingOperation = await this.findIdempotentOperation(
      client,
      warehouse.id,
      StockMovementType.ADJUST,
      dto.idempotencyKey,
    );

    if (existingOperation) {
      return existingOperation;
    }

    assertAdjustmentQuantityInput(dto);
    const target = await this.resolveAdjustTarget(client, warehouse.id, dto);
    const result = await this.transaction(client, async (tx) => {
      const quant = target.quant
        ? await this.resolveQuant(tx, warehouse.id, target.quant.id)
        : await this.incrementOrCreateQuant(tx, {
            warehouseId: warehouse.id,
            skuId: target.skuId,
            locationId: target.locationId,
            status: target.status,
            ownerClientId: target.ownerClientId,
            lotId: target.lotId,
            batch: target.batch,
            expiry: target.expiry,
            quantity: 0,
          });
      await this.lockQuantForUpdate(tx, quant.id);
      const lockedQuant = await this.resolveQuant(tx, warehouse.id, quant.id);
      await assertNoBlockingStockFreeze(tx, {
        warehouseId: warehouse.id,
        stockQuantId: lockedQuant.id,
        locationId: lockedQuant.locationId,
        skuId: lockedQuant.skuId,
        operation: 'adjust stock',
      });
      const currentQuantity = toNumber(lockedQuant.quantity);
      const nextQuantity =
        dto.quantity === undefined ? currentQuantity + (dto.quantityDelta ?? 0) : dto.quantity;

      if (nextQuantity < 0) {
        throw new ConflictException('Adjustment would make stock quantity negative');
      }

      if (nextQuantity < getQuantReservedQuantity(lockedQuant)) {
        throw new ConflictException('Adjustment would make reserved stock exceed on-hand stock');
      }

      const quantityDelta = nextQuantity - currentQuantity;
      const updatedQuant = await tx.stockQuant.update({
        where: { id: lockedQuant.id },
        data: { quantity: nextQuantity },
      });
      const movement = await this.createStockMovement(tx, {
        warehouseId: warehouse.id,
        quantId: updatedQuant.id,
        skuId: updatedQuant.skuId,
        type: StockMovementType.ADJUST,
        quantityDelta,
        quantity: Math.abs(quantityDelta),
        toLocationId: updatedQuant.locationId,
        actorUserId: actor.id,
        reference: normalizeNullableString(dto.reference),
        idempotencyKey: normalizeNullableString(dto.idempotencyKey),
        metadata: toJsonInput(
          withStockAdjustmentReasonMetadata(dto.metadata, dto.reasonCode, dto.reason),
        ),
      });

      const owner = await this.resolveOperationOwner(
        tx,
        warehouse.id,
        this.ownerScope.readOwnerClientReference({
          ownerClientReference: dto.ownerClientReference,
          metadata: dto.metadata,
        }),
        target.quant ? [{ resourceType: 'STOCK_QUANT', resourceId: target.quant.id }] : [],
      );
      if (owner) {
        await this.linkOwnerResources(tx, warehouse.id, owner, [
          {
            resourceType: 'STOCK_QUANT',
            resourceId: updatedQuant.id,
            metadata: { source: 'inventory.adjust' },
          },
          {
            resourceType: 'STOCK_MOVEMENT',
            resourceId: movement.id,
            metadata: { source: 'inventory.adjust', stockQuantId: updatedQuant.id },
          },
        ]);
      }

      await this.writeMovementAudit(tx, actor, warehouse.id, movement);

      return { movement, quant: updatedQuant };
    });

    return this.toOperationResponse(client, result.quant, result.movement);
  }

  async block(
    warehouseReference: string,
    quantReference: string,
    dto: BlockStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockOperationResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const existingOperation = await this.findIdempotentOperation(
      client,
      warehouse.id,
      StockMovementType.BLOCK,
      dto.idempotencyKey,
    );

    if (existingOperation) {
      return existingOperation;
    }

    const targetStatus = dto.targetStatus ?? StockQuantStatus.BLOCKED;

    if (!BLOCK_TARGET_STATUSES.has(targetStatus)) {
      throw new ConflictException('Block target status must be BLOCKED, DAMAGED, or QUARANTINE');
    }

    const sourceQuant = await this.resolveQuant(client, warehouse.id, quantReference);
    const result = await this.transaction(client, async (tx) =>
      this.transferQuantStatus(tx, {
        warehouseId: warehouse.id,
        sourceQuant,
        quantity: dto.quantity,
        targetStatus,
        movementType: StockMovementType.BLOCK,
        actor,
        reference: dto.reference,
        idempotencyKey: dto.idempotencyKey,
        metadata: withReasonMetadata(dto.metadata, dto.reason),
      }),
    );

    return this.toOperationResponse(client, result.quant, result.movement);
  }

  async unblock(
    warehouseReference: string,
    quantReference: string,
    dto: UnblockStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockOperationResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const existingOperation = await this.findIdempotentOperation(
      client,
      warehouse.id,
      StockMovementType.UNBLOCK,
      dto.idempotencyKey,
    );

    if (existingOperation) {
      return existingOperation;
    }

    const targetStatus = dto.targetStatus ?? StockQuantStatus.AVAILABLE;

    if (!UNBLOCK_TARGET_STATUSES.has(targetStatus)) {
      throw new ConflictException('Unblock target status must be AVAILABLE or RESERVED');
    }

    const sourceQuant = await this.resolveQuant(client, warehouse.id, quantReference);

    if (!UNBLOCK_SOURCE_STATUSES.has(sourceQuant.status)) {
      throw new ConflictException('Only BLOCKED, DAMAGED, or QUARANTINE stock can be unblocked');
    }

    const result = await this.transaction(client, async (tx) =>
      this.transferQuantStatus(tx, {
        warehouseId: warehouse.id,
        sourceQuant,
        quantity: dto.quantity,
        targetStatus,
        movementType: StockMovementType.UNBLOCK,
        actor,
        reference: dto.reference,
        idempotencyKey: dto.idempotencyKey,
        metadata: withReasonMetadata(dto.metadata, dto.reason),
      }),
    );

    return this.toOperationResponse(client, result.quant, result.movement);
  }

  private transaction<T>(
    client: InventoryPrismaClient,
    fn: (client: InventoryTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withTransactionRetry(() => client.$transaction(fn));
  }

  private getClient(): InventoryPrismaClient {
    const client = this.prisma as unknown as Record<string, unknown>;

    if (
      !hasDelegate(client, 'stockQuant') ||
      !hasDelegate(client, 'stockMovement') ||
      !hasDelegate(client, 'reservation') ||
      !hasDelegate(client, 'sku')
    ) {
      throw new ServiceUnavailableException(
        'Inventory Prisma models are not available. Apply the StockQuant, StockMovement, Reservation, and Sku migrations and regenerate Prisma client.',
      );
    }

    return this.prisma;
  }

  private async resolveWarehouse(
    client: InventoryTransactionClient,
    warehouseReference: string,
  ): Promise<Warehouse> {
    const warehouse = await client.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveLocation(
    client: InventoryTransactionClient,
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

  private async resolveSku(
    client: InventoryTransactionClient,
    skuReference: string,
  ): Promise<InventorySkuRecord> {
    const sku = await client.sku.findFirst({
      where: skuReferenceWhere(skuReference),
    });

    if (!sku) {
      throw new NotFoundException('SKU was not found');
    }

    return sku;
  }

  private async resolveQuant(
    client: InventoryTransactionClient,
    warehouseId: string,
    quantReference: string,
  ): Promise<StockQuantRecord> {
    const normalizedReference = quantReference.trim();
    const uuidReference = extractUuid(normalizedReference);
    const quant = uuidReference
      ? await client.stockQuant.findFirst({
          where: { warehouseId, id: uuidReference },
        })
      : await client.stockQuant.findFirst({
          where: { warehouseId, externalReference: normalizedReference },
        });

    if (!quant) {
      throw new NotFoundException('Stock quant was not found');
    }

    return quant;
  }

  private async resolveMovement(
    client: InventoryTransactionClient,
    warehouseId: string,
    movementReference: string,
  ): Promise<StockMovementRecord> {
    const normalizedReference = movementReference.trim();
    const uuidReference = extractUuid(normalizedReference);
    const where = uuidReference
      ? { warehouseId, id: uuidReference }
      : {
          warehouseId,
          OR: [{ referenceType: normalizedReference }, { referenceId: normalizedReference }],
        };
    const movement = await client.stockMovement.findFirst({ where });

    if (!movement) {
      throw new NotFoundException('Stock movement was not found');
    }

    return movement;
  }

  private async resolveMoveSourceQuant(
    client: InventoryTransactionClient,
    warehouseId: string,
    dto: MoveStockDto,
  ): Promise<StockQuantRecord> {
    const quantReference = dto.quantReference ?? dto.fromStockQuantId;

    if (quantReference) {
      return this.resolveQuant(client, warehouseId, quantReference);
    }

    if (!dto.skuReference || !dto.fromLocationReference) {
      throw new ConflictException(
        'skuReference and fromLocationReference are required when quantReference/fromStockQuantId is omitted',
      );
    }

    const sku = await this.resolveSku(client, dto.skuReference);
    const location = await this.resolveLocation(client, warehouseId, dto.fromLocationReference);
    const where: StockQuantWhereInput = {
      warehouseId,
      skuId: sku.id,
      locationId: location.id,
      status: dto.status ?? StockQuantStatus.AVAILABLE,
      quantity: { gt: 0 },
      ...(dto.batch === undefined ? {} : { batch: normalizeNullableString(dto.batch) }),
      ...(dto.expiry === undefined ? {} : { expiryDate: toOptionalDate(dto.expiry) ?? null }),
    };
    const quant = await client.stockQuant.findFirst({
      where,
      orderBy: [{ createdAt: 'asc' }],
    });

    if (!quant) {
      throw new NotFoundException('Source stock quant was not found');
    }

    return quant;
  }

  private async resolveAdjustTarget(
    client: InventoryTransactionClient,
    warehouseId: string,
    dto: AdjustStockDto,
  ): Promise<AdjustQuantTarget> {
    if (dto.quantReference) {
      const quant = await this.resolveQuant(client, warehouseId, dto.quantReference);

      return {
        warehouseId,
        quant,
        skuId: quant.skuId,
        locationId: quant.locationId,
        status: quant.status,
        ownerClientId: quant.ownerClientId ?? null,
        lotId: quant.lotId ?? null,
        batch: quant.batch,
        expiry: readDateCandidate(quant, ['expiry', 'expiryDate', 'expiresAt']),
      };
    }

    if (!dto.skuReference || !dto.locationReference) {
      throw new ConflictException(
        'skuReference and locationReference are required when quantReference is omitted',
      );
    }

    const sku = await this.resolveSku(client, dto.skuReference);
    const location = await this.resolveLocation(client, warehouseId, dto.locationReference);
    const status = dto.status ?? StockQuantStatus.AVAILABLE;
    const batch = normalizeNullableString(dto.batch);
    const expiry = toOptionalDate(dto.expiry) ?? null;
    const quant = await client.stockQuant.findFirst({
      where: {
        warehouseId,
        skuId: sku.id,
        locationId: location.id,
        status,
        batch,
        expiryDate: expiry,
      },
    });

    return {
      warehouseId,
      quant,
      skuId: sku.id,
      locationId: location.id,
      status,
      ownerClientId: quant?.ownerClientId ?? null,
      lotId: quant?.lotId ?? null,
      batch,
      expiry,
    };
  }

  private async findIdempotentOperation(
    client: InventoryTransactionClient,
    warehouseId: string,
    type: StockMovementType,
    rawIdempotencyKey: string | undefined,
  ): Promise<StockOperationResponse | null> {
    const idempotencyKey = normalizeOptionalString(rawIdempotencyKey);

    if (idempotencyKey === undefined) {
      return null;
    }

    const movement = await client.stockMovement.findFirst({
      where: { warehouseId, idempotencyKey },
      orderBy: { createdAt: 'desc' },
    });

    if (!movement) {
      return null;
    }

    if (movement.type !== type) {
      throw new ConflictException(
        'Idempotency key has already been used for another movement type',
      );
    }

    if (!movement.stockQuantId) {
      throw new ConflictException('Idempotent stock movement is missing a quant reference');
    }

    const quant = await this.resolveQuant(client, warehouseId, movement.stockQuantId);

    return this.toOperationResponse(client, quant, movement);
  }

  private async incrementOrCreateQuant(
    client: InventoryTransactionClient,
    input: QuantIdentityInput & { quantity: number },
  ): Promise<StockQuantRecord> {
    await lockStockQuantIdentity(client, input);

    const existingQuant = await client.stockQuant.findFirst({
      where: quantIdentityWhere(input),
    });

    if (existingQuant) {
      return client.stockQuant.update({
        where: { id: existingQuant.id },
        data: { quantity: { increment: input.quantity } },
      });
    }

    return client.stockQuant.create({
      data: {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        locationId: input.locationId,
        status: input.status,
        ownerClientId: input.ownerClientId,
        lotId: input.lotId,
        batch: input.batch,
        expiryDate: input.expiry,
        quantity: input.quantity,
      },
    });
  }

  private async decrementQuant(
    client: InventoryTransactionClient,
    quant: StockQuantRecord,
    quantity: number,
    options: DecrementQuantOptions = {},
  ): Promise<StockQuantRecord> {
    await this.lockQuantForUpdate(client, quant.id);
    const lockedQuant = await this.resolveQuant(client, quant.warehouseId, quant.id);
    await assertNoBlockingStockFreeze(client, {
      warehouseId: lockedQuant.warehouseId,
      stockQuantId: lockedQuant.id,
      locationId: lockedQuant.locationId,
      skuId: lockedQuant.skuId,
      operation: 'decrement stock',
    });
    const currentQuantity = toNumber(lockedQuant.quantity);

    if (currentQuantity < quantity) {
      throw new ConflictException('Insufficient stock quantity');
    }

    if (options.preserveReservedQuantity) {
      const reservedQuantity = getQuantReservedQuantity(lockedQuant);

      if (currentQuantity - quantity < reservedQuantity) {
        throw new ConflictException('Insufficient unreserved stock quantity');
      }
    }

    return client.stockQuant.update({
      where: { id: lockedQuant.id },
      data: { quantity: { decrement: quantity } },
    });
  }

  private async transferQuantStatus(
    client: InventoryTransactionClient,
    input: TransferQuantStatusInput,
  ): Promise<StockOperationInternalResult> {
    const sourceQuant = await this.resolveQuant(client, input.warehouseId, input.sourceQuant.id);
    const sourceQuantity = toNumber(sourceQuant.quantity);
    const quantity = input.quantity ?? sourceQuantity;

    if (quantity <= 0) {
      throw new ConflictException('Stock quantity must be greater than zero');
    }

    if (sourceQuant.status === input.targetStatus) {
      throw new ConflictException('Source quant already has the requested status');
    }

    await this.decrementQuant(client, sourceQuant, quantity, {
      preserveReservedQuantity: sourceQuant.status === StockQuantStatus.AVAILABLE,
    });
    const targetQuant = await this.incrementOrCreateQuant(client, {
      warehouseId: input.warehouseId,
      skuId: sourceQuant.skuId,
      locationId: sourceQuant.locationId,
      status: input.targetStatus,
      ownerClientId: sourceQuant.ownerClientId ?? null,
      lotId: sourceQuant.lotId ?? null,
      batch: sourceQuant.batch,
      expiry: readDateCandidate(sourceQuant, ['expiry', 'expiryDate', 'expiresAt']),
      quantity,
    });
    const movement = await this.createStockMovement(client, {
      warehouseId: input.warehouseId,
      quantId: targetQuant.id,
      skuId: sourceQuant.skuId,
      type: input.movementType,
      quantityDelta: 0,
      quantity,
      fromLocationId: sourceQuant.locationId,
      toLocationId: sourceQuant.locationId,
      actorUserId: input.actor.id,
      reference: normalizeNullableString(input.reference),
      idempotencyKey: normalizeNullableString(input.idempotencyKey),
      metadata: toJsonInput(input.metadata),
    });

    const owner = await this.resolveOperationOwner(client, input.warehouseId, null, [
      { resourceType: 'STOCK_QUANT', resourceId: sourceQuant.id },
    ]);
    if (owner) {
      await this.linkOwnerResources(client, input.warehouseId, owner, [
        {
          resourceType: 'STOCK_QUANT',
          resourceId: targetQuant.id,
          metadata: {
            source: `inventory.${String(input.movementType).toLowerCase()}`,
            sourceStockQuantId: sourceQuant.id,
          },
        },
        {
          resourceType: 'STOCK_MOVEMENT',
          resourceId: movement.id,
          metadata: {
            source: `inventory.${String(input.movementType).toLowerCase()}`,
            stockQuantId: targetQuant.id,
          },
        },
      ]);
    }

    await this.writeMovementAudit(client, input.actor, input.warehouseId, movement);

    return { movement, quant: targetQuant };
  }

  private async resolveOperationOwner(
    client: InventoryTransactionClient,
    warehouseId: string,
    explicitClientReference: string | null | undefined,
    sourceResources: Array<{ resourceType: string; resourceId: string | null | undefined }>,
  ): Promise<OwnerClientRecord | null> {
    const ownerClient = client as unknown as OwnerScopePrismaClient;
    const inheritedOwner = await this.ownerScope.resolveSingleOwnerFromResources({
      warehouseId,
      resources: sourceResources,
      client: ownerClient,
    });

    if (!explicitClientReference) return inheritedOwner;

    const explicitOwner = await this.ownerScope.resolveOwnerClient({
      warehouseId,
      clientReference: explicitClientReference,
      client: ownerClient,
    });
    if (!explicitOwner) throw new ConflictException('Owner client reference is required.');

    if (inheritedOwner && inheritedOwner.id !== explicitOwner.id) {
      throw new ConflictException('Explicit owner client conflicts with source stock ownership.');
    }

    return explicitOwner;
  }

  private async linkOwnerResources(
    client: InventoryTransactionClient,
    warehouseId: string,
    owner: OwnerClientRecord,
    resources: Array<{
      resourceType: string;
      resourceId: string | null | undefined;
      metadata?: Record<string, unknown> | null;
    }>,
  ): Promise<void> {
    const ownerClient = client as unknown as OwnerScopePrismaClient;
    for (const resource of resources) {
      await this.ownerScope.linkResourceToResolvedClient({
        warehouseId,
        clientId: owner.id,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        metadata: { inheritedOwnerClientCode: owner.code, ...(resource.metadata ?? {}) },
        client: ownerClient,
      });
    }
  }

  private lockQuantForUpdate(client: InventoryTransactionClient, quantId: string): Promise<void> {
    return lockPostgresRowById(client, 'stock_quants', quantId);
  }

  private async createStockMovement(
    client: InventoryTransactionClient,
    input: CreateStockMovementInput,
  ): Promise<StockMovementRecord> {
    const baseData: Record<string, unknown> = {
      warehouseId: input.warehouseId,
      stockQuantId: input.quantId,
      skuId: input.skuId,
      type: input.type,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      actorUserId: input.actorUserId,
      referenceType: input.reference ? input.type : null,
      referenceId: input.reference,
      sourceSystem: input.idempotencyKey ? 'WMS' : null,
      idempotencyKey: input.idempotencyKey,
      metadata: withMovementDeltaMetadata(input.metadata, input.quantityDelta),
      occurredAt: new Date(),
    };
    const attempts = [
      compactRecord({
        ...baseData,
        quantity: input.quantity,
      }),
    ];
    let lastError: unknown;

    for (const data of attempts) {
      try {
        return await client.stockMovement.create({ data });
      } catch (error: unknown) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private async writeMovementAudit(
    client: InventoryTransactionClient,
    actor: AuthenticatedUser,
    warehouseId: string,
    movement: StockMovementRecord,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action: 'stock_movement.created',
        resourceType: 'stock_movement',
        resourceId: movement.id,
        metadata: {
          type: movement.type,
          skuId: movement.skuId,
          stockQuantId: movement.stockQuantId,
          quantityDelta: getMovementQuantityDelta(movement),
          quantity: nullableNumber(movement.quantity),
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          idempotencyKey: movement.idempotencyKey,
        },
      },
    });
  }

  private async toOperationResponse(
    client: InventoryTransactionClient,
    quant: StockQuantRecord,
    movement: StockMovementRecord,
  ): Promise<StockOperationResponse> {
    const [quantResponse, movementResponse] = await Promise.all([
      this.toQuantResponse(client, quant),
      this.toMovementResponse(client, movement),
    ]);

    return {
      quant: quantResponse,
      movement: movementResponse,
    };
  }

  private async toQuantResponse(
    client: InventoryTransactionClient,
    quant: StockQuantRecord,
  ): Promise<StockQuantResponse> {
    const responses = await this.toQuantResponses(client, [quant]);
    const response = responses[0];

    if (!response) {
      throw new NotFoundException('Stock quant was not found');
    }

    return response;
  }

  private async toQuantResponses(
    client: InventoryTransactionClient,
    quants: StockQuantRecord[],
  ): Promise<StockQuantResponse[]> {
    const [skus, locations] = await Promise.all([
      this.findSkusByIds(client, uniqueStrings(quants.map((quant) => quant.skuId))),
      this.findLocationsByIds(client, uniqueStrings(quants.map((quant) => quant.locationId))),
    ]);

    return quants.map((quant) =>
      toStockQuantResponse(
        quant,
        skus.get(quant.skuId) ?? null,
        locations.get(quant.locationId) ?? null,
      ),
    );
  }

  private async toBalanceResponses(
    client: InventoryTransactionClient,
    balances: StockBalanceRecord[],
  ): Promise<StockBalanceResponse[]> {
    const [skus, locations] = await Promise.all([
      this.findSkusByIds(client, uniqueStrings(balances.map((balance) => balance.skuId))),
      this.findLocationsByIds(client, uniqueStrings(balances.map((balance) => balance.locationId))),
    ]);

    return balances.map((balance) => {
      const sku = skus.get(balance.skuId) ?? null;
      const location = locations.get(balance.locationId) ?? null;

      return {
        ...balance,
        sku: sku ? toSkuResponse(sku) : null,
        location: location ? toLocationResponse(location) : null,
      };
    });
  }

  private async toMovementResponse(
    client: InventoryTransactionClient,
    movement: StockMovementRecord,
  ): Promise<StockMovementResponse> {
    const responses = await this.toMovementResponses(client, [movement]);
    const response = responses[0];

    if (!response) {
      throw new NotFoundException('Stock movement was not found');
    }

    return response;
  }

  private async toMovementResponses(
    client: InventoryTransactionClient,
    movements: StockMovementRecord[],
  ): Promise<StockMovementResponse[]> {
    const skuIds = uniqueStrings(movements.map((movement) => movement.skuId));
    const locationIds = uniqueStrings(
      movements.flatMap((movement) => [movement.fromLocationId, movement.toLocationId]),
    );
    const [skus, locations] = await Promise.all([
      this.findSkusByIds(client, skuIds),
      this.findLocationsByIds(client, locationIds),
    ]);

    return movements.map((movement) =>
      toStockMovementResponse(
        movement,
        skus.get(movement.skuId) ?? null,
        movement.fromLocationId ? (locations.get(movement.fromLocationId) ?? null) : null,
        movement.toLocationId ? (locations.get(movement.toLocationId) ?? null) : null,
      ),
    );
  }

  private async findSkusByIds(
    client: InventoryTransactionClient,
    skuIds: string[],
  ): Promise<Map<string, InventorySkuRecord>> {
    if (skuIds.length === 0) {
      return new Map<string, InventorySkuRecord>();
    }

    const skus = await client.sku.findMany({
      where: { id: { in: skuIds } },
    });

    return mapById(skus);
  }

  private async findLocationsByIds(
    client: InventoryTransactionClient,
    locationIds: string[],
  ): Promise<Map<string, WarehouseLocation>> {
    if (locationIds.length === 0) {
      return new Map<string, WarehouseLocation>();
    }

    const locations = await client.warehouseLocation.findMany({
      where: { id: { in: locationIds } },
    });

    return mapById(locations);
  }
}

function toStockQuantResponse(
  quant: StockQuantRecord,
  sku: InventorySkuRecord | null,
  location: WarehouseLocation | null,
): StockQuantResponse {
  return {
    id: quant.id,
    warehouseId: quant.warehouseId,
    skuId: quant.skuId,
    locationId: quant.locationId,
    status: quant.status,
    batch: quant.batch,
    expiry: readDateCandidate(quant, ['expiry', 'expiryDate', 'expiresAt']),
    quantity: toNumber(quant.quantity),
    reservedQuantity: getQuantReservedQuantity(quant),
    availableQuantity: getQuantAvailableQuantity(quant),
    sku: sku ? toSkuResponse(sku) : null,
    location: location ? toLocationResponse(location) : null,
    createdAt: toDate(quant.createdAt),
    updatedAt: toDate(quant.updatedAt),
  };
}

function toStockMovementResponse(
  movement: StockMovementRecord,
  sku: InventorySkuRecord | null,
  fromLocation: WarehouseLocation | null,
  toLocation: WarehouseLocation | null,
): StockMovementResponse {
  return {
    id: movement.id,
    warehouseId: movement.warehouseId,
    quantId: movement.stockQuantId,
    skuId: movement.skuId,
    type: movement.type,
    quantityDelta: getMovementQuantityDelta(movement),
    quantity: nullableNumber(movement.quantity),
    fromLocationId: movement.fromLocationId,
    toLocationId: movement.toLocationId,
    sku: sku ? toSkuResponse(sku) : null,
    fromLocation: fromLocation ? toLocationResponse(fromLocation) : null,
    toLocation: toLocation ? toLocationResponse(toLocation) : null,
    actorUserId: movement.actorUserId,
    reference: movement.referenceId ?? movement.referenceType,
    idempotencyKey: movement.idempotencyKey,
    metadata: movement.metadata,
    occurredAt: toDate(movement.occurredAt),
    createdAt: toDate(movement.createdAt),
  };
}

function toSkuResponse(sku: InventorySkuRecord): InventorySkuResponse {
  return {
    id: sku.id,
    code: sku.code ?? sku.sku ?? sku.id,
    name: sku.name ?? sku.description ?? null,
    productId: sku.productId ?? null,
  };
}

function toLocationResponse(location: WarehouseLocation): InventoryLocationResponse {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
  };
}

function groupStockBalances(quants: StockQuantRecord[]): StockBalanceRecord[] {
  const balances = new Map<string, StockBalanceRecord>();

  for (const quant of quants) {
    const expiry = readDateCandidate(quant, ['expiry', 'expiryDate', 'expiresAt']);
    const key = [
      quant.warehouseId,
      quant.skuId,
      quant.locationId,
      quant.status,
      quant.ownerClientId ?? '',
      quant.lotId ?? '',
      quant.batch ?? '',
      expiry ? expiry.toISOString().slice(0, 10) : '',
    ].join('|');
    const existing = balances.get(key);
    const quantity = toNumber(quant.quantity);
    const reservedQuantity = getQuantReservedQuantity(quant);
    const availableQuantity = getQuantAvailableQuantity(quant);

    if (existing) {
      existing.quantity += quantity;
      existing.reservedQuantity += reservedQuantity;
      existing.availableQuantity += availableQuantity;
      existing.quantCount += 1;
      continue;
    }

    balances.set(key, {
      warehouseId: quant.warehouseId,
      skuId: quant.skuId,
      locationId: quant.locationId,
      status: quant.status,
      ownerClientId: quant.ownerClientId ?? null,
      lotId: quant.lotId ?? null,
      batch: quant.batch,
      expiry,
      quantity,
      reservedQuantity,
      availableQuantity,
      quantCount: 1,
    });
  }

  return [...balances.values()];
}

function getQuantReservedQuantity(quant: StockQuantRecord): number {
  return nullableNumber(quant.reservedQuantity) ?? nullableNumber(quant.quantityReserved) ?? 0;
}

function getQuantAvailableQuantity(quant: StockQuantRecord): number {
  if (quant.status !== StockQuantStatus.AVAILABLE) {
    return 0;
  }

  return Math.max(toNumber(quant.quantity) - getQuantReservedQuantity(quant), 0);
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return { code: normalizeReference(reference) };
}

function locationReferenceWhere(
  warehouseId: string,
  reference: string,
): Prisma.WarehouseLocationWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return {
    warehouseId,
    code: normalizeReference(reference),
  };
}

function skuReferenceWhere(reference: string): SkuWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return { code: normalizeReference(reference) };
}

function quantIdentityWhere(input: QuantIdentityInput): StockQuantWhereInput {
  return {
    warehouseId: input.warehouseId,
    skuId: input.skuId,
    locationId: input.locationId,
    status: input.status,
    ownerClientId: input.ownerClientId,
    lotId: input.lotId,
    batch: input.batch,
    expiryDate: input.expiry,
  };
}

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? undefined : normalized;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function toOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim().length === 0) {
    return null;
  }

  return new Date(value);
}

function toDateRange(
  occurredFrom: string | undefined,
  occurredTo: string | undefined,
): Record<string, Date> | undefined {
  if (!occurredFrom && !occurredTo) {
    return undefined;
  }

  return {
    ...(occurredFrom ? { gte: new Date(occurredFrom) } : {}),
    ...(occurredTo ? { lte: new Date(occurredTo) } : {}),
  };
}

function toJsonInput(
  value: Record<string, unknown> | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

function withReasonMetadata(
  metadata: Record<string, unknown> | undefined,
  reason: string | undefined,
): Record<string, unknown> | undefined {
  const normalizedReason = normalizeOptionalString(reason);

  if (normalizedReason === undefined) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    reason: normalizedReason,
  };
}

function withMovementDeltaMetadata(
  metadata: Prisma.InputJsonValue | undefined,
  quantityDelta: number | undefined,
): Prisma.InputJsonValue | undefined {
  if (quantityDelta === undefined) {
    return metadata;
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { quantityDelta };
  }

  return {
    ...(metadata as Record<string, unknown>),
    quantityDelta,
  };
}

function getMovementQuantityDelta(movement: StockMovementRecord): number | null {
  const directQuantityDelta = nullableNumber(movement.quantityDelta);

  if (directQuantityDelta !== null) {
    return directQuantityDelta;
  }

  if (
    movement.metadata &&
    typeof movement.metadata === 'object' &&
    !Array.isArray(movement.metadata)
  ) {
    return nullableNumber(
      (movement.metadata as Record<string, unknown>)['quantityDelta'] as NumericValue,
    );
  }

  return nullableNumber(movement.quantity);
}

function assertAdjustmentQuantityInput(dto: AdjustStockDto): void {
  const hasQuantity = dto.quantity !== undefined;
  const hasQuantityDelta = dto.quantityDelta !== undefined;

  if (hasQuantity === hasQuantityDelta) {
    throw new ConflictException('Provide exactly one of quantity or quantityDelta');
  }
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }

  return compacted;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter(isPresentString))];
}

function isPresentString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function mapById<T extends { id: string }>(records: T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

function readDateCandidate(record: Record<string, unknown>, fields: string[]): Date | null {
  for (const field of fields) {
    const value = record[field];

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string' && value.length > 0) {
      return new Date(value);
    }
  }

  return null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNumber(value: NumericValue): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  if (typeof value.toNumber === 'function') {
    return value.toNumber();
  }

  return Number(value.toString());
}

function nullableNumber(value: NumericValue | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toNumber(value);
}

function hasDelegate(client: Record<string, unknown>, name: string): boolean {
  const delegate = client[name];

  return typeof delegate === 'object' && delegate !== null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function extractUuid(value: string): string | null {
  const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

  return match?.[0] ?? null;
}

type NumericValue = number | string | NumberLike;
type StockQuantWhereInput = Record<string, unknown>;
type StockMovementWhereInput = Record<string, unknown>;
type SkuWhereInput = Record<string, unknown>;

interface NumberLike {
  toNumber?: () => number;
  toString: () => string;
}

interface QuantIdentityInput {
  warehouseId: string;
  skuId: string;
  locationId: string;
  status: StockQuantStatus;
  ownerClientId: string | null;
  lotId: string | null;
  batch: string | null;
  expiry: Date | null;
}

interface AdjustQuantTarget extends QuantIdentityInput {
  quant: StockQuantRecord | null;
}

interface CreateStockMovementInput {
  warehouseId: string;
  quantId: string | null;
  skuId: string;
  type: StockMovementType;
  quantityDelta?: number;
  quantity?: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  actorUserId: string | null;
  reference: string | null;
  idempotencyKey: string | null;
  metadata?: Prisma.InputJsonValue;
}

interface TransferQuantStatusInput {
  warehouseId: string;
  sourceQuant: StockQuantRecord;
  quantity: number | undefined;
  targetStatus: StockQuantStatus;
  movementType: typeof StockMovementType.BLOCK | typeof StockMovementType.UNBLOCK;
  actor: AuthenticatedUser;
  reference: string | undefined;
  idempotencyKey: string | undefined;
  metadata: Record<string, unknown> | undefined;
}

interface DecrementQuantOptions {
  preserveReservedQuantity?: boolean;
}

interface StockOperationInternalResult {
  quant: StockQuantRecord;
  movement: StockMovementRecord;
}

interface StockBalanceRecord {
  warehouseId: string;
  skuId: string;
  locationId: string;
  status: StockQuantStatus;
  ownerClientId: string | null;
  lotId: string | null;
  batch: string | null;
  expiry: Date | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  quantCount: number;
}

interface InventorySkuRecord extends Record<string, unknown> {
  id: string;
  code?: string;
  sku?: string;
  name?: string | null;
  description?: string | null;
  productId?: string | null;
}

interface StockQuantRecord extends Record<string, unknown> {
  id: string;
  warehouseId: string;
  skuId: string;
  locationId: string;
  status: StockQuantStatus;
  ownerClientId?: string | null;
  lotId?: string | null;
  batch: string | null;
  expiry?: Date | string | null;
  expiryDate?: Date | string | null;
  quantity: NumericValue;
  reservedQuantity?: NumericValue | null;
  quantityReserved?: NumericValue | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ReservationRecord extends Record<string, unknown> {
  id: string;
  warehouseId: string;
  stockQuantId: string;
  quantity: NumericValue;
  status: string;
}

interface StockMovementRecord extends Record<string, unknown> {
  id: string;
  warehouseId: string;
  stockQuantId: string | null;
  skuId: string;
  type: StockMovementType;
  quantityDelta?: NumericValue | null;
  quantity?: NumericValue | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  actorUserId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  metadata: unknown;
  occurredAt: Date | string;
  createdAt: Date | string;
}

interface InventoryTransactionClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  warehouse: {
    findFirst(args: { where: Prisma.WarehouseWhereInput }): Promise<Warehouse | null>;
  };
  warehouseLocation: {
    findFirst(args: {
      where: Prisma.WarehouseLocationWhereInput;
    }): Promise<WarehouseLocation | null>;
    findMany(args: { where: Prisma.WarehouseLocationWhereInput }): Promise<WarehouseLocation[]>;
  };
  sku: {
    findFirst(args: { where: SkuWhereInput }): Promise<InventorySkuRecord | null>;
    findMany(args: { where: SkuWhereInput }): Promise<InventorySkuRecord[]>;
  };
  stockQuant: {
    findFirst(args: {
      where: StockQuantWhereInput;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
    }): Promise<StockQuantRecord | null>;
    findMany(args: {
      where: StockQuantWhereInput;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
      take?: number;
      skip?: number;
    }): Promise<StockQuantRecord[]>;
    create(args: { data: Record<string, unknown> }): Promise<StockQuantRecord>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<StockQuantRecord>;
  };
  stockMovement: {
    findFirst(args: {
      where: StockMovementWhereInput;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
    }): Promise<StockMovementRecord | null>;
    findMany(args: {
      where: StockMovementWhereInput;
      orderBy?: Record<string, unknown> | Array<Record<string, unknown>>;
      take?: number;
      skip?: number;
    }): Promise<StockMovementRecord[]>;
    create(args: { data: Record<string, unknown> }): Promise<StockMovementRecord>;
  };
  reservation: {
    findMany(args: { where: Record<string, unknown> }): Promise<ReservationRecord[]>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

interface InventoryPrismaClient extends InventoryTransactionClient {
  $transaction<T>(fn: (client: InventoryTransactionClient) => Promise<T>): Promise<T>;
}
