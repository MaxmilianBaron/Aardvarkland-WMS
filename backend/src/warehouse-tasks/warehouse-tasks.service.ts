import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { OwnerScopeService } from '../clients/owner-scope.service';
import { normalizeOffsetPagination } from '../common';
import { lockPostgresRowById, PrismaService } from '../database';
import { Prisma, User, Warehouse, WarehouseLocation } from '../generated/prisma/client';
import { AssignWarehouseTaskDto } from './dto/assign-warehouse-task.dto';
import { CancelWarehouseTaskDto } from './dto/cancel-warehouse-task.dto';
import { ClaimNextWarehouseTaskDto } from './dto/claim-next-warehouse-task.dto';
import { ConfirmWarehouseTaskDto } from './dto/confirm-warehouse-task.dto';
import { CreateWarehouseTaskDto } from './dto/create-warehouse-task.dto';
import { ListWarehouseTasksQueryDto } from './dto/list-warehouse-tasks-query.dto';
import { FailWarehouseTaskDto } from './dto/fail-warehouse-task.dto';
import { StartWarehouseTaskDto } from './dto/start-warehouse-task.dto';
import {
  WarehouseTaskHandlingUnitResponse,
  WarehouseTaskLocationResponse,
  WarehouseTaskResponse,
  WarehouseTaskSkuResponse,
  WarehouseTaskStatus,
  WarehouseTaskType,
  WarehouseTaskUserResponse,
} from './warehouse-tasks.types';

const warehouseTaskInclude: WarehouseTaskInclude = {
  assignedUser: true,
  fromLocation: true,
  handlingUnit: true,
  sku: true,
  toLocation: true,
};

const allowedTransitions: Record<WarehouseTaskStatus, readonly WarehouseTaskStatus[]> = {
  [WarehouseTaskStatus.OPEN]: [
    WarehouseTaskStatus.ASSIGNED,
    WarehouseTaskStatus.IN_PROGRESS,
    WarehouseTaskStatus.BLOCKED,
    WarehouseTaskStatus.CANCELLED,
  ],
  [WarehouseTaskStatus.ASSIGNED]: [
    WarehouseTaskStatus.IN_PROGRESS,
    WarehouseTaskStatus.BLOCKED,
    WarehouseTaskStatus.CANCELLED,
  ],
  [WarehouseTaskStatus.IN_PROGRESS]: [
    WarehouseTaskStatus.DONE,
    WarehouseTaskStatus.BLOCKED,
    WarehouseTaskStatus.FAILED,
    WarehouseTaskStatus.CANCELLED,
  ],
  [WarehouseTaskStatus.BLOCKED]: [
    WarehouseTaskStatus.ASSIGNED,
    WarehouseTaskStatus.IN_PROGRESS,
    WarehouseTaskStatus.FAILED,
    WarehouseTaskStatus.CANCELLED,
  ],
  [WarehouseTaskStatus.DONE]: [],
  [WarehouseTaskStatus.FAILED]: [WarehouseTaskStatus.OPEN, WarehouseTaskStatus.CANCELLED],
  [WarehouseTaskStatus.CANCELLED]: [],
};

@Injectable()
export class WarehouseTasksService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async findMany(
    warehouseReference: string,
    query: ListWarehouseTasksQueryDto,
  ): Promise<WarehouseTaskResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const assignedUser = query.assignedUserReference
      ? await this.resolveUser(query.assignedUserReference)
      : null;
    const fromLocation = query.fromLocationReference
      ? await this.resolveLocation(warehouse.id, query.fromLocationReference)
      : null;
    const toLocation = query.toLocationReference
      ? await this.resolveLocation(warehouse.id, query.toLocationReference)
      : null;
    const sku = query.sku ? await this.resolveSku(query.sku) : null;
    const search = normalizeOptionalString(query.search);
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 500 });
    const ownedTaskIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId: warehouse.id,
      clientReference: query.ownerClientReference,
      resourceType: 'WAREHOUSE_TASK',
    });
    const tasks = await this.tasks.findMany({
      where: {
        warehouseId: warehouse.id,
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(ownedTaskIds ? { id: { in: ownedTaskIds } } : {}),
        ...(sku ? { skuId: sku.id } : {}),
        ...(assignedUser ? { assignedUserId: assignedUser.id } : {}),
        ...(fromLocation ? { fromLocationId: fromLocation.id } : {}),
        ...(toLocation ? { toLocationId: toLocation.id } : {}),
        ...(search ? { OR: taskSearchWhere(search) } : {}),
      },
      include: warehouseTaskInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: pagination.take,
      skip: pagination.skip,
    });

    return tasks.map(toWarehouseTaskResponse);
  }

  async findOne(warehouseReference: string, taskReference: string): Promise<WarehouseTaskResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const task = await this.resolveTask(warehouse.id, taskReference);

    return toWarehouseTaskResponse(task);
  }

  async create(
    warehouseReference: string,
    dto: CreateWarehouseTaskDto,
    actor: AuthenticatedUser,
  ): Promise<WarehouseTaskResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const status = dto.status ?? WarehouseTaskStatus.OPEN;

    if (status !== WarehouseTaskStatus.OPEN) {
      throw new ConflictException('Warehouse task must be created as OPEN');
    }

    const assignedUserId = dto.assignedUserReference
      ? (await this.resolveUser(dto.assignedUserReference)).id
      : null;
    const fromLocationId = dto.fromLocationReference
      ? (await this.resolveLocation(warehouse.id, dto.fromLocationReference)).id
      : null;
    const toLocationId = dto.toLocationReference
      ? (await this.resolveLocation(warehouse.id, dto.toLocationReference)).id
      : null;
    const skuId = dto.sku ? (await this.resolveSku(dto.sku)).id : null;
    const handlingUnitId = dto.handlingUnitReference
      ? (await this.resolveHandlingUnit(warehouse.id, dto.handlingUnitReference)).id
      : null;

    const task = await this.tasks.create({
      data: {
        warehouseId: warehouse.id,
        type: dto.type,
        status,
        assignedUserId,
        fromLocationId,
        toLocationId,
        skuId,
        quantity: dto.quantity,
        handlingUnitId,
        metadata: toJsonInput(dto.metadata),
      },
      include: warehouseTaskInclude,
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_task.created', task);

    return toWarehouseTaskResponse(task);
  }

  async claimNext(
    warehouseReference: string,
    dto: ClaimNextWarehouseTaskDto | undefined,
    actor: AuthenticatedUser,
  ): Promise<WarehouseTaskResponse> {
    const body: ClaimNextWarehouseTaskDto = dto ?? {};
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const assignedUserId = body.assignedUserReference
      ? (await this.resolveUser(body.assignedUserReference)).id
      : actor.id;

    return this.transaction(async (db) => {
      const where: QueryObject = {
        warehouseId: warehouse.id,
        status: WarehouseTaskStatus.OPEN,
        ...(body.type ? { type: body.type } : {}),
        ...(body.zone
          ? { fromLocation: { is: { zone: normalizeOptionalString(body.zone) } } }
          : {}),
      };
      const [candidate] = await this.getTaskDelegate(db).findMany({
        where,
        include: warehouseTaskInclude,
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        take: 1,
      });

      if (!candidate) {
        throw new NotFoundException('No open warehouse task is available to claim');
      }

      await lockPostgresRowById(db, 'warehouse_tasks', candidate.id);
      const task = await this.resolveTaskWithClient(db, warehouse.id, candidate.id);
      this.assertTransition(task.status, WarehouseTaskStatus.ASSIGNED);

      const updatedTask = await this.getTaskDelegate(db).update({
        where: { id: task.id },
        data: compactMutation({
          status: WarehouseTaskStatus.ASSIGNED,
          assignedUserId,
          assignedAt: new Date(),
          version: { increment: 1 },
          ...(body.metadata === undefined ? {} : { metadata: toJsonInput(body.metadata) }),
        }),
        include: warehouseTaskInclude,
      });

      await this.writeAuditWithClient(
        db,
        actor,
        warehouse.id,
        'warehouse_task.claimed',
        updatedTask,
        {
          previousStatus: task.status,
          claimedByUserId: assignedUserId,
        },
      );

      return toWarehouseTaskResponse(updatedTask);
    });
  }

  async assign(
    warehouseReference: string,
    taskReference: string,
    dto: AssignWarehouseTaskDto | undefined,
    actor: AuthenticatedUser,
  ): Promise<WarehouseTaskResponse> {
    const body: AssignWarehouseTaskDto = dto ?? {};
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const task = await this.resolveTask(warehouse.id, taskReference);
    this.assertTransition(task.status, WarehouseTaskStatus.ASSIGNED);

    const assignedUserId = body.assignedUserReference
      ? (await this.resolveUser(body.assignedUserReference)).id
      : actor.id;
    const updatedTask = await this.tasks.update({
      where: { id: task.id },
      data: compactMutation({
        status: WarehouseTaskStatus.ASSIGNED,
        assignedUserId,
        assignedAt: task.assignedAt ?? new Date(),
        version: { increment: 1 },
        ...(body.metadata === undefined ? {} : { metadata: toJsonInput(body.metadata) }),
      }),
      include: warehouseTaskInclude,
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_task.assigned', updatedTask, {
      previousStatus: task.status,
      assignedUserId,
    });

    return toWarehouseTaskResponse(updatedTask);
  }

  async start(
    warehouseReference: string,
    taskReference: string,
    dto: StartWarehouseTaskDto | undefined,
    actor: AuthenticatedUser,
  ): Promise<WarehouseTaskResponse> {
    const body: StartWarehouseTaskDto = dto ?? {};
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const task = await this.resolveTask(warehouse.id, taskReference);
    this.assertTransition(task.status, WarehouseTaskStatus.IN_PROGRESS);

    const assignedUserId = body.assignedUserReference
      ? (await this.resolveUser(body.assignedUserReference)).id
      : (task.assignedUserId ?? actor.id);
    const data: MutationObject = compactMutation({
      status: WarehouseTaskStatus.IN_PROGRESS,
      assignedUserId,
      assignedAt: task.assignedAt ?? new Date(),
      startedAt: task.startedAt ?? new Date(),
      version: { increment: 1 },
      ...(body.metadata === undefined ? {} : { metadata: toJsonInput(body.metadata) }),
    });
    const updatedTask = await this.tasks.update({
      where: { id: task.id },
      data,
      include: warehouseTaskInclude,
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_task.started', updatedTask, {
      previousStatus: task.status,
    });

    return toWarehouseTaskResponse(updatedTask);
  }

  async confirm(
    warehouseReference: string,
    taskReference: string,
    dto: ConfirmWarehouseTaskDto | undefined,
    actor: AuthenticatedUser,
  ): Promise<WarehouseTaskResponse> {
    const body: ConfirmWarehouseTaskDto = dto ?? {};
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const task = await this.resolveTask(warehouse.id, taskReference);
    this.assertTransition(task.status, WarehouseTaskStatus.DONE);

    const fromLocationId = body.fromLocationReference
      ? (await this.resolveLocation(warehouse.id, body.fromLocationReference)).id
      : undefined;
    const toLocationId = body.toLocationReference
      ? (await this.resolveLocation(warehouse.id, body.toLocationReference)).id
      : undefined;
    const skuId = body.sku ? (await this.resolveSku(body.sku)).id : undefined;
    const handlingUnitId = body.handlingUnitReference
      ? (await this.resolveHandlingUnit(warehouse.id, body.handlingUnitReference)).id
      : undefined;
    const data: MutationObject = {
      status: WarehouseTaskStatus.DONE,
      completedAt: new Date(),
      version: { increment: 1 },
      ...(fromLocationId === undefined ? {} : { fromLocationId }),
      ...(toLocationId === undefined ? {} : { toLocationId }),
      ...(skuId === undefined ? {} : { skuId }),
      ...(body.quantity === undefined ? {} : { quantity: body.quantity }),
      ...(handlingUnitId === undefined ? {} : { handlingUnitId }),
      ...(body.metadata === undefined ? {} : { metadata: toJsonInput(body.metadata) }),
    };
    const updatedTask = await this.tasks.update({
      where: { id: task.id },
      data,
      include: warehouseTaskInclude,
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_task.confirmed', updatedTask, {
      previousStatus: task.status,
      confirmation: {
        fromLocationId: fromLocationId ?? task.fromLocationId ?? null,
        toLocationId: toLocationId ?? task.toLocationId ?? null,
        skuId: skuId ?? task.skuId ?? null,
        quantity: body.quantity ?? task.quantity ?? null,
        handlingUnitId: handlingUnitId ?? task.handlingUnitId ?? null,
      },
    });

    return toWarehouseTaskResponse(updatedTask);
  }

  async fail(
    warehouseReference: string,
    taskReference: string,
    dto: FailWarehouseTaskDto,
    actor: AuthenticatedUser,
  ): Promise<WarehouseTaskResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const task = await this.resolveTask(warehouse.id, taskReference);
    this.assertTransition(task.status, WarehouseTaskStatus.FAILED);

    const reason = normalizeOptionalString(dto.reason);

    if (!reason) {
      throw new ConflictException('Failure reason is required');
    }

    const updatedTask = await this.tasks.update({
      where: { id: task.id },
      data: compactMutation({
        status: WarehouseTaskStatus.FAILED,
        failureReason: reason,
        completedAt: new Date(),
        version: { increment: 1 },
        ...(dto.metadata === undefined ? {} : { metadata: toJsonInput(dto.metadata) }),
      }),
      include: warehouseTaskInclude,
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_task.failed', updatedTask, {
      previousStatus: task.status,
      reason,
    });

    return toWarehouseTaskResponse(updatedTask);
  }

  async cancel(
    warehouseReference: string,
    taskReference: string,
    dto: CancelWarehouseTaskDto | undefined,
    actor: AuthenticatedUser,
  ): Promise<WarehouseTaskResponse> {
    const body: CancelWarehouseTaskDto = dto ?? {};
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const task = await this.resolveTask(warehouse.id, taskReference);
    this.assertTransition(task.status, WarehouseTaskStatus.CANCELLED);

    const reason = normalizeOptionalString(body.reason);
    const updatedTask = await this.tasks.update({
      where: { id: task.id },
      data: compactMutation({
        status: WarehouseTaskStatus.CANCELLED,
        failureReason: reason,
        version: { increment: 1 },
        ...(body.metadata === undefined ? {} : { metadata: toJsonInput(body.metadata) }),
      }),
      include: warehouseTaskInclude,
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_task.cancelled', updatedTask, {
      previousStatus: task.status,
      reason,
    });

    return toWarehouseTaskResponse(updatedTask);
  }

  private transaction<T>(fn: (db: WarehouseTaskPrismaClient) => Promise<T>): Promise<T> {
    const client = this.prisma as unknown as {
      $transaction<TValue>(fn: (db: WarehouseTaskPrismaClient) => Promise<TValue>): Promise<TValue>;
    };

    return client.$transaction(fn);
  }

  private getTaskDelegate(db: WarehouseTaskPrismaClient): WarehouseTaskDelegate {
    const delegate = db.warehouseTask;

    if (!delegate) {
      throw new ServiceUnavailableException(
        'Warehouse task persistence is not available. Run Prisma generate after the WarehouseTask schema is available.',
      );
    }

    return delegate;
  }

  private get db(): WarehouseTaskPrismaClient {
    return this.prisma as unknown as WarehouseTaskPrismaClient;
  }

  private get tasks(): WarehouseTaskDelegate {
    return this.getTaskDelegate(this.db);
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.db.warehouse.findFirst({
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
    const location = await this.db.warehouseLocation.findFirst({
      where: locationReferenceWhere(warehouseId, locationReference),
    });

    if (!location) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return location;
  }

  private async resolveUser(userReference: string): Promise<User> {
    const user = await this.db.user.findFirst({
      where: userReferenceWhere(userReference),
    });

    if (!user) {
      throw new NotFoundException('Assigned user was not found');
    }

    return user;
  }

  private async resolveSku(skuReference: string): Promise<SkuRecord> {
    const sku = await this.db.sku.findFirst({
      where: skuReferenceWhere(skuReference),
    });

    if (!sku) {
      throw new NotFoundException('SKU was not found');
    }

    return sku;
  }

  private async resolveHandlingUnit(
    warehouseId: string,
    handlingUnitReference: string,
  ): Promise<HandlingUnitRecord> {
    const handlingUnit = await this.db.handlingUnit.findFirst({
      where: handlingUnitReferenceWhere(warehouseId, handlingUnitReference),
    });

    if (!handlingUnit) {
      throw new NotFoundException('Handling unit was not found');
    }

    return handlingUnit;
  }

  private async resolveTaskWithClient(
    db: WarehouseTaskPrismaClient,
    warehouseId: string,
    taskReference: string,
  ): Promise<WarehouseTaskWithRelations> {
    if (!isUuid(taskReference)) {
      throw new NotFoundException('Warehouse task was not found');
    }

    const task = await this.getTaskDelegate(db).findFirst({
      where: { warehouseId, id: taskReference },
      include: warehouseTaskInclude,
    });

    if (!task) {
      throw new NotFoundException('Warehouse task was not found');
    }

    return task;
  }

  private resolveTask(
    warehouseId: string,
    taskReference: string,
  ): Promise<WarehouseTaskWithRelations> {
    return this.resolveTaskWithClient(this.db, warehouseId, taskReference);
  }

  private assertTransition(
    currentStatus: WarehouseTaskStatus,
    nextStatus: WarehouseTaskStatus,
  ): void {
    if (!allowedTransitions[currentStatus].includes(nextStatus)) {
      throw new ConflictException(
        `Cannot transition warehouse task from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private async writeAuditWithClient(
    db: WarehouseTaskPrismaClient,
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    task: WarehouseTaskRecord,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'warehouse_task',
        resourceId: task.id,
        metadata: {
          type: task.type,
          status: task.status,
          assignedUserId: task.assignedUserId ?? null,
          fromLocationId: task.fromLocationId ?? null,
          toLocationId: task.toLocationId ?? null,
          skuId: task.skuId ?? null,
          quantity: task.quantity ?? null,
          handlingUnitId: task.handlingUnitId ?? null,
          ...extraMetadata,
        },
      },
    });
  }

  private writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    task: WarehouseTaskRecord,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.writeAuditWithClient(this.db, actor, warehouseId, action, task, extraMetadata);
  }
}

function toWarehouseTaskResponse(task: WarehouseTaskWithRelations): WarehouseTaskResponse {
  return {
    id: task.id,
    warehouseId: task.warehouseId,
    type: task.type,
    status: task.status,
    assignedUserId: task.assignedUserId ?? null,
    assignedUser: task.assignedUser ? toUserResponse(task.assignedUser) : null,
    fromLocationId: task.fromLocationId ?? null,
    fromLocation: task.fromLocation ? toLocationResponse(task.fromLocation) : null,
    toLocationId: task.toLocationId ?? null,
    toLocation: task.toLocation ? toLocationResponse(task.toLocation) : null,
    skuId: task.skuId ?? null,
    sku: task.sku ? toSkuResponse(task.sku) : null,
    outboundOrderId: task.outboundOrderId ?? null,
    outboundOrderLineId: task.outboundOrderLineId ?? null,
    inboundShipmentId: task.inboundShipmentId ?? null,
    inboundShipmentLineId: task.inboundShipmentLineId ?? null,
    reservationId: task.reservationId ?? null,
    quantity: task.quantity ?? null,
    handlingUnitId: task.handlingUnitId ?? null,
    handlingUnitReference: task.handlingUnit?.code ?? null,
    handlingUnit: task.handlingUnit ? toHandlingUnitResponse(task.handlingUnit) : null,
    externalReference: task.externalReference ?? null,
    failureReason: task.failureReason ?? null,
    version: task.version ?? null,
    metadata: task.metadata ?? null,
    assignedAt: task.assignedAt ?? null,
    dueAt: task.dueAt ?? null,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function toUserResponse(user: User): WarehouseTaskUserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function toLocationResponse(location: WarehouseLocation): WarehouseTaskLocationResponse {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    zone: location.zone,
  };
}

function toSkuResponse(sku: SkuRecord): WarehouseTaskSkuResponse {
  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    barcode: sku.barcode,
    uom: sku.uom,
  };
}

function toHandlingUnitResponse(
  handlingUnit: HandlingUnitRecord,
): WarehouseTaskHandlingUnitResponse {
  return {
    id: handlingUnit.id,
    code: handlingUnit.code,
    type: handlingUnit.type,
    status: handlingUnit.status,
  };
}

function warehouseReferenceWhere(reference: string): QueryObject {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function locationReferenceWhere(warehouseId: string, reference: string): QueryObject {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return {
    warehouseId,
    code: normalizeCode(reference),
  };
}

function userReferenceWhere(reference: string): QueryObject {
  const normalized = reference.trim();

  if (isUuid(normalized)) {
    return { id: normalized };
  }

  return { email: normalized.toLowerCase() };
}

function skuReferenceWhere(reference: string): QueryObject {
  const normalized = reference.trim();

  if (isUuid(normalized)) {
    return {
      OR: [{ id: normalized }, { code: normalizeCode(normalized) }],
    };
  }

  return {
    OR: [{ code: normalizeCode(normalized) }, { barcode: normalized }],
  };
}

function handlingUnitReferenceWhere(warehouseId: string, reference: string): QueryObject {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return {
    warehouseId,
    code: normalizeCode(reference),
  };
}

function taskSearchWhere(search: string): QueryObject[] {
  const filters: QueryObject[] = [
    { sku: { is: { code: { contains: search, mode: 'insensitive' } } } },
    { sku: { is: { barcode: { contains: search, mode: 'insensitive' } } } },
    { handlingUnit: { is: { code: { contains: search, mode: 'insensitive' } } } },
  ];

  if (isUuid(search)) {
    filters.unshift({ id: search });
  }

  return filters;
}

function compactMutation(record: MutationObject): MutationObject {
  const compacted: MutationObject = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }

  return compacted;
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

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type SortOrder = 'asc' | 'desc';
type QueryObject = Record<string, unknown>;
type MutationObject = Record<string, unknown>;

interface WarehouseTaskPrismaClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  warehouse: FindFirstDelegate<Warehouse>;
  warehouseLocation: FindFirstDelegate<WarehouseLocation>;
  handlingUnit: FindFirstDelegate<HandlingUnitRecord>;
  sku: FindFirstDelegate<SkuRecord>;
  user: FindFirstDelegate<User>;
  auditLog: AuditLogDelegate;
  warehouseTask?: WarehouseTaskDelegate;
}

interface FindFirstDelegate<TRecord> {
  findFirst(args: { where: QueryObject }): Promise<TRecord | null>;
}

interface AuditLogDelegate {
  create(args: { data: MutationObject }): Promise<unknown>;
}

interface WarehouseTaskDelegate {
  findMany(args: {
    where: QueryObject;
    include: WarehouseTaskInclude;
    orderBy: Array<Record<string, SortOrder>>;
    take?: number;
    skip?: number;
  }): Promise<WarehouseTaskWithRelations[]>;
  findFirst(args: {
    where: QueryObject;
    include: WarehouseTaskInclude;
  }): Promise<WarehouseTaskWithRelations | null>;
  create(args: {
    data: MutationObject;
    include: WarehouseTaskInclude;
  }): Promise<WarehouseTaskWithRelations>;
  update(args: {
    where: { id: string };
    data: MutationObject;
    include: WarehouseTaskInclude;
  }): Promise<WarehouseTaskWithRelations>;
}

interface WarehouseTaskInclude {
  assignedUser: true;
  fromLocation: true;
  handlingUnit: true;
  sku: true;
  toLocation: true;
}

interface WarehouseTaskRecord {
  id: string;
  warehouseId: string;
  type: WarehouseTaskType;
  status: WarehouseTaskStatus;
  assignedUserId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  skuId?: string | null;
  outboundOrderId?: string | null;
  outboundOrderLineId?: string | null;
  inboundShipmentId?: string | null;
  inboundShipmentLineId?: string | null;
  reservationId?: string | null;
  quantity?: number | null;
  handlingUnitId?: string | null;
  externalReference?: string | null;
  failureReason?: string | null;
  version?: number | null;
  metadata?: unknown;
  assignedAt?: Date | null;
  dueAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WarehouseTaskWithRelations extends WarehouseTaskRecord {
  assignedUser?: User | null;
  fromLocation?: WarehouseLocation | null;
  handlingUnit?: HandlingUnitRecord | null;
  sku?: SkuRecord | null;
  toLocation?: WarehouseLocation | null;
}

interface SkuRecord {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
}

interface HandlingUnitRecord {
  id: string;
  code: string;
  type: string;
  status: string;
}
