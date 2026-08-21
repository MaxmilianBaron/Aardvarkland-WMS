import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { normalizeOffsetPagination } from '../common';
import { OwnerClientRecord, OwnerScopePrismaClient, OwnerScopeService } from '../clients/owner-scope.service';
import { PrismaService } from '../database';
import { Parcel, Prisma, Warehouse } from '../generated/prisma/client';
import { CreateOutboundOrderDto } from './dto/create-outbound-order.dto';
import { ListOutboundOrdersQueryDto } from './dto/list-outbound-orders-query.dto';
import {
  UpdateOutboundOrderDto,
  UpdateOutboundOrderLineDto,
} from './dto/update-outbound-order.dto';
import {
  OutboundOrderLineResponse,
  OutboundOrderResponse,
  OutboundParcelResponse,
  OutboundStatus,
} from './outbound.types';

const outboundOrderInclude: OutboundOrderInclude = {
  lines: {
    include: { parcel: true },
    orderBy: { lineNumber: 'asc' },
  },
};

@Injectable()
export class OutboundService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async findMany(
    warehouseReference: string,
    query: ListOutboundOrdersQueryDto,
  ): Promise<OutboundOrderResponse[]> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 500 });
    const ownedOrderIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId: warehouse.id,
      clientReference: query.ownerClientReference,
      resourceType: 'OUTBOUND_ORDER',
    });
    const orders = await client.outboundOrder.findMany({
      where: {
        warehouseId: warehouse.id,
        ...(query.status ? { status: query.status } : {}),
        ...(ownedOrderIds ? { id: { in: ownedOrderIds } } : {}),
        ...(query.search
          ? {
              OR: [
                { orderNumber: { contains: query.search, mode: 'insensitive' } },
                { customerReference: { contains: query.search, mode: 'insensitive' } },
                { recipientName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: outboundOrderInclude,
      orderBy: { createdAt: 'desc' },
      take: pagination.take,
      skip: pagination.skip,
    });

    return orders.map(toOutboundOrderResponse);
  }

  async findOne(
    warehouseReference: string,
    orderReference: string,
  ): Promise<OutboundOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveOrder(warehouse.id, orderReference);

    return toOutboundOrderResponse(order);
  }

  async create(
    warehouseReference: string,
    dto: CreateOutboundOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OutboundOrderResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const ownerReference = this.ownerScope.readOwnerClientReference({
      ownerClientReference: dto.ownerClientReference,
      metadata: dto.metadata,
    });
    const owner = ownerReference
      ? await this.ownerScope.resolveOwnerClient({
          warehouseId: warehouse.id,
          clientReference: ownerReference,
        })
      : null;
    const lines = await Promise.all(
      (dto.lines ?? []).map(async (line, index) => ({
        lineNumber: normalizeLineNumber(line.lineNumber ?? `${index + 1}`),
        sku: line.sku.trim(),
        description: normalizeNullableString(line.description),
        orderedQuantity: line.orderedQuantity,
        pickedQuantity: line.pickedQuantity ?? 0,
        parcelId: line.parcelReference
          ? (await this.resolveParcel(warehouse.id, line.parcelReference)).id
          : null,
        metadata: toJsonInput(line.metadata),
      })),
    );

    try {
      const order = await client.outboundOrder.create({
        data: {
          warehouseId: warehouse.id,
          orderNumber: normalizeReference(dto.orderNumber),
          status: dto.status ?? OutboundStatus.CREATED,
          customerReference: normalizeNullableString(dto.customerReference),
          recipientName: normalizeNullableString(dto.recipientName),
          carrier: normalizeNullableString(dto.carrier),
          serviceLevel: normalizeNullableString(dto.serviceLevel),
          shipBy: toOptionalDate(dto.shipBy),
          metadata: toJsonInput(dto.metadata),
          ...(lines.length ? { lines: { create: lines } } : {}),
        },
        include: outboundOrderInclude,
      });

      if (owner) {
        await this.ownerScope.ensureOwnedResourceLinks({
          warehouseId: warehouse.id,
          clientId: owner.id,
          resources: [
            { resourceType: 'OUTBOUND_ORDER', resourceId: order.id, metadata: { source: 'outbound.create', orderNumber: order.orderNumber } },
            ...order.lines.map((line) => ({
              resourceType: 'OUTBOUND_ORDER_LINE',
              resourceId: line.id,
              metadata: { source: 'outbound.create', outboundOrderId: order.id, lineNumber: line.lineNumber },
            })),
          ],
          metadata: { inheritedOwnerClientCode: owner.code },
        });
      }

      await this.writeAudit(actor, warehouse.id, 'outbound_order.created', order);

      return toOutboundOrderResponse(order);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Outbound order number already exists in this warehouse');
      }

      throw error;
    }
  }

  async update(
    warehouseReference: string,
    orderReference: string,
    dto: UpdateOutboundOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OutboundOrderResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingOrder = await this.resolveOrder(warehouse.id, orderReference);
    const data = this.toOrderUpdateInput(dto);

    try {
      const order =
        Object.keys(data).length === 0
          ? existingOrder
          : await client.outboundOrder.update({
              where: { id: existingOrder.id },
              data,
              include: outboundOrderInclude,
            });

      for (const line of dto.lines ?? []) {
        await this.updateLine(warehouse.id, order.id, line);
      }

      const refreshedOrder = await this.resolveOrder(warehouse.id, order.id);
      await this.writeAudit(actor, warehouse.id, 'outbound_order.updated', refreshedOrder);

      return toOutboundOrderResponse(refreshedOrder);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Outbound order number or line number already exists');
      }

      throw error;
    }
  }

  private async linkOwnerResources(
    warehouseId: string,
    owner: OwnerClientRecord,
    resources: Array<{ resourceType: string; resourceId: string | null | undefined; metadata?: Record<string, unknown> | null }>,
  ): Promise<void> {
    const client = this.getClient() as unknown as OwnerScopePrismaClient;
    for (const resource of resources) {
      await this.ownerScope.linkResourceToResolvedClient({
        warehouseId,
        clientId: owner.id,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        metadata: { inheritedOwnerClientCode: owner.code, ...(resource.metadata ?? {}) },
        client,
      });
    }
  }

  private getClient(): OutboundPrismaClient {
    return this.prisma as unknown as OutboundPrismaClient;
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.getClient().warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveParcel(warehouseId: string, parcelReference: string): Promise<Parcel> {
    const parcel = await this.getClient().parcel.findFirst({
      where: parcelReferenceWhere(warehouseId, parcelReference),
    });

    if (!parcel) {
      throw new NotFoundException('Parcel was not found');
    }

    return parcel;
  }

  private async resolveOrder(
    warehouseId: string,
    orderReference: string,
  ): Promise<OutboundOrderWithLines> {
    const order = await this.getClient().outboundOrder.findFirst({
      where: orderReferenceWhere(warehouseId, orderReference),
      include: outboundOrderInclude,
    });

    if (!order) {
      throw new NotFoundException('Outbound order was not found');
    }

    return order;
  }

  private async resolveLine(
    orderId: string,
    lineReference: string,
  ): Promise<OutboundOrderLineWithParcel> {
    const line = await this.getClient().outboundOrderLine.findFirst({
      where: lineReferenceWhere(orderId, lineReference),
      include: { parcel: true },
    });

    if (!line) {
      throw new NotFoundException('Outbound order line was not found');
    }

    return line;
  }

  private toOrderUpdateInput(dto: UpdateOutboundOrderDto): Record<string, unknown> {
    return {
      ...(dto.orderNumber === undefined
        ? {}
        : { orderNumber: normalizeReference(dto.orderNumber) }),
      ...(dto.status === undefined ? {} : { status: dto.status }),
      ...(dto.customerReference === undefined
        ? {}
        : { customerReference: normalizeNullableString(dto.customerReference) }),
      ...(dto.recipientName === undefined
        ? {}
        : { recipientName: normalizeNullableString(dto.recipientName) }),
      ...(dto.carrier === undefined ? {} : { carrier: normalizeNullableString(dto.carrier) }),
      ...(dto.serviceLevel === undefined
        ? {}
        : { serviceLevel: normalizeNullableString(dto.serviceLevel) }),
      ...(dto.shipBy === undefined ? {} : { shipBy: toOptionalDate(dto.shipBy) }),
      ...(dto.shippedAt === undefined ? {} : { shippedAt: toOptionalDate(dto.shippedAt) }),
      ...(dto.metadata === undefined ? {} : { metadata: toJsonInput(dto.metadata) }),
    };
  }

  private async updateLine(
    warehouseId: string,
    orderId: string,
    dto: UpdateOutboundOrderLineDto,
  ): Promise<void> {
    if (!dto.lineReference) {
      throw new ConflictException('lineReference is required when updating outbound lines');
    }

    const line = await this.resolveLine(orderId, dto.lineReference);
    const parcelId = await this.resolveUpdateParcelId(warehouseId, dto);
    const data: Record<string, unknown> = {
      ...(dto.sku === undefined ? {} : { sku: dto.sku.trim() }),
      ...(dto.description === undefined
        ? {}
        : { description: normalizeNullableString(dto.description) }),
      ...(dto.orderedQuantity === undefined ? {} : { orderedQuantity: dto.orderedQuantity }),
      ...(dto.pickedQuantity === undefined ? {} : { pickedQuantity: dto.pickedQuantity }),
      ...(dto.metadata === undefined ? {} : { metadata: toJsonInput(dto.metadata) }),
      ...(parcelId === undefined ? {} : { parcelId }),
    };

    if (Object.keys(data).length > 0) {
      await this.getClient().outboundOrderLine.update({
        where: { id: line.id },
        data,
        include: { parcel: true },
      });
    }
  }

  private async resolveUpdateParcelId(
    warehouseId: string,
    dto: UpdateOutboundOrderLineDto,
  ): Promise<string | null | undefined> {
    if (dto.parcelReference === undefined) {
      return undefined;
    }

    if (dto.parcelReference === null || dto.parcelReference.length === 0) {
      return null;
    }

    return (await this.resolveParcel(warehouseId, dto.parcelReference)).id;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    order: OutboundOrder,
  ): Promise<void> {
    await this.getClient().auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'outbound_order',
        resourceId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          status: order.status,
        },
      },
    });
  }
}

function toOutboundOrderResponse(order: OutboundOrderWithLines): OutboundOrderResponse {
  return {
    id: order.id,
    warehouseId: order.warehouseId,
    orderNumber: order.orderNumber,
    status: order.status,
    customerReference: order.customerReference,
    recipientName: order.recipientName,
    carrier: order.carrier,
    serviceLevel: order.serviceLevel,
    shipBy: order.shipBy,
    shippedAt: order.shippedAt,
    metadata: order.metadata,
    lines: order.lines.map(toOutboundOrderLineResponse),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function toOutboundOrderLineResponse(line: OutboundOrderLineWithParcel): OutboundOrderLineResponse {
  return {
    id: line.id,
    orderId: line.orderId,
    lineNumber: line.lineNumber,
    sku: line.sku,
    description: line.description,
    orderedQuantity: line.orderedQuantity,
    pickedQuantity: line.pickedQuantity,
    parcel: line.parcel ? toOutboundParcelResponse(line.parcel) : null,
    metadata: line.metadata,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function toOutboundParcelResponse(parcel: Parcel): OutboundParcelResponse {
  return {
    id: parcel.id,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
  };
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return { code: normalizeReference(reference) };
}

function parcelReferenceWhere(warehouseId: string, reference: string): Prisma.ParcelWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { trackingNumber: normalizeReference(reference) }],
    };
  }

  return {
    warehouseId,
    trackingNumber: normalizeReference(reference),
  };
}

function orderReferenceWhere(warehouseId: string, reference: string): OutboundOrderWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { orderNumber: normalizeReference(reference) }],
    };
  }

  return {
    warehouseId,
    orderNumber: normalizeReference(reference),
  };
}

function lineReferenceWhere(orderId: string, reference: string): OutboundOrderLineWhereInput {
  if (isUuid(reference)) {
    return {
      orderId,
      OR: [{ id: reference }, { lineNumber: normalizeLineNumber(reference) }],
    };
  }

  return {
    orderId,
    lineNumber: normalizeLineNumber(reference),
  };
}

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeLineNumber(value: string): string {
  return value.trim();
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

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

interface OutboundPrismaClient {
  warehouse: {
    findFirst(args: { where: Prisma.WarehouseWhereInput }): Promise<Warehouse | null>;
  };
  parcel: {
    findFirst(args: { where: Prisma.ParcelWhereInput }): Promise<Parcel | null>;
  };
  outboundOrder: {
    findMany(args: {
      where: OutboundOrderWhereInput;
      include: OutboundOrderInclude;
      orderBy: { createdAt: 'desc' };
      take?: number;
      skip?: number;
    }): Promise<OutboundOrderWithLines[]>;
    findFirst(args: {
      where: OutboundOrderWhereInput;
      include: OutboundOrderInclude;
    }): Promise<OutboundOrderWithLines | null>;
    create(args: {
      data: Record<string, unknown>;
      include: OutboundOrderInclude;
    }): Promise<OutboundOrderWithLines>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include: OutboundOrderInclude;
    }): Promise<OutboundOrderWithLines>;
  };
  outboundOrderLine: {
    findFirst(args: {
      where: OutboundOrderLineWhereInput;
      include: OutboundOrderLineInclude;
    }): Promise<OutboundOrderLineWithParcel | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include: OutboundOrderLineInclude;
    }): Promise<OutboundOrderLineWithParcel>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

type OutboundOrderWhereInput = Record<string, unknown>;
type OutboundOrderLineWhereInput = Record<string, unknown>;

interface OutboundOrderInclude {
  lines: {
    include: OutboundOrderLineInclude;
    orderBy: { lineNumber: 'asc' };
  };
}

interface OutboundOrderLineInclude {
  parcel: true;
}

interface OutboundOrder {
  id: string;
  warehouseId: string;
  orderNumber: string;
  status: OutboundStatus;
  customerReference: string | null;
  recipientName: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  shipBy: Date | null;
  shippedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface OutboundOrderLine {
  id: string;
  orderId: string;
  lineNumber: string;
  sku: string;
  description: string | null;
  orderedQuantity: number;
  pickedQuantity: number;
  parcelId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface OutboundOrderLineWithParcel extends OutboundOrderLine {
  parcel: Parcel | null;
}

interface OutboundOrderWithLines extends OutboundOrder {
  lines: OutboundOrderLineWithParcel[];
}
