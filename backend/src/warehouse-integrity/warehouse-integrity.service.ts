import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database';
import { evaluateWarehouseIntegritySnapshot } from './warehouse-integrity.helpers';
import { WarehouseIntegrityResponse } from './warehouse-integrity.types';

@Injectable()
export class WarehouseIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async checkWarehouse(warehouseReference: string): Promise<WarehouseIntegrityResponse> {
    const client = this.prisma as unknown as WarehouseIntegrityPrismaClient;
    const warehouse = await client.warehouse.findFirst({
      where: warehouseWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    const [
      stockQuants,
      reservations,
      outboundOrders,
      outboundOrderLines,
      shipments,
      shipmentPackages,
      carrierLabels,
      stockFreezes,
      handlingUnits,
      warehouseTasks,
      warehouseOrders,
      warehouseOrderLines,
      stockMovements,
    ] = await Promise.all([
      client.stockQuant.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          warehouseId: true,
          locationId: true,
          skuId: true,
          handlingUnitId: true,
          status: true,
          quantity: true,
          reservedQuantity: true,
        },
      }),
      client.reservation.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          stockQuantId: true,
          skuId: true,
          outboundOrderId: true,
          outboundOrderLineId: true,
          quantity: true,
          status: true,
        },
      }),
      client.outboundOrder.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          status: true,
        },
      }),
      client.outboundOrderLine.findMany({
        where: { order: { warehouseId: warehouse.id } },
        select: {
          id: true,
          orderId: true,
          lineNumber: true,
          sku: true,
          orderedQuantity: true,
          pickedQuantity: true,
        },
      }),
      client.shipment.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          shipmentNumber: true,
          carrier: true,
          status: true,
        },
      }),
      client.shipmentPackage.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          shipmentId: true,
          status: true,
        },
      }),
      client.carrierLabel.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          shipmentId: true,
          packageId: true,
          status: true,
        },
      }),
      client.stockFreeze.findMany({
        where: { warehouseId: warehouse.id, status: 'ACTIVE' },
        select: {
          id: true,
          status: true,
          stockQuantId: true,
          locationId: true,
          skuId: true,
        },
      }),
      client.handlingUnit.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          status: true,
          currentLocationId: true,
          parentId: true,
        },
      }),
      client.warehouseTask.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          type: true,
          status: true,
          quantity: true,
          reservationId: true,
          handlingUnitId: true,
          fromLocationId: true,
          toLocationId: true,
          assignedAt: true,
          startedAt: true,
          completedAt: true,
          failureReason: true,
        },
      }),
      client.warehouseOrder.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          status: true,
        },
      }),
      client.warehouseOrderLine.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          warehouseOrderId: true,
          requestedQuantity: true,
          allocatedQuantity: true,
          completedQuantity: true,
          status: true,
        },
      }),
      client.stockMovement.findMany({
        where: { warehouseId: warehouse.id },
        select: {
          id: true,
          stockQuantId: true,
          reservationId: true,
          taskId: true,
          type: true,
          quantity: true,
          fromLocationId: true,
          toLocationId: true,
          referenceType: true,
          referenceId: true,
        },
      }),
    ]);

    const packageIds = shipmentPackages.map((pkg) => pkg.id);
    const packageContents = packageIds.length
      ? await client.packageContent.findMany({
          where: { packageId: { in: packageIds } },
          select: {
            id: true,
            packageId: true,
            outboundOrderLineId: true,
            sku: true,
            quantity: true,
          },
        })
      : [];

    return evaluateWarehouseIntegritySnapshot({
      warehouseId: warehouse.id,
      stockQuants,
      reservations,
      outboundOrders,
      outboundOrderLines,
      packageContents,
      shipments,
      shipmentPackages,
      carrierLabels,
      stockFreezes,
      handlingUnits,
      warehouseTasks,
      warehouseOrders,
      warehouseOrderLines,
      stockMovements,
    });
  }
}

function warehouseWhere(reference: string): Record<string, unknown> {
  const normalized = reference.trim();
  const byCode = { code: normalized };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return byCode;
  }

  return {
    OR: [{ id: normalized }, byCode],
  };
}

interface WarehouseIntegrityPrismaClient {
  warehouse: FindFirstDelegate<WarehouseRecord>;
  stockQuant: FindManyDelegate<StockQuantRecord>;
  reservation: FindManyDelegate<ReservationRecord>;
  outboundOrder: FindManyDelegate<OutboundOrderRecord>;
  outboundOrderLine: FindManyDelegate<OutboundOrderLineRecord>;
  packageContent: FindManyDelegate<PackageContentRecord>;
  shipment: FindManyDelegate<ShipmentRecord>;
  shipmentPackage: FindManyDelegate<ShipmentPackageRecord>;
  carrierLabel: FindManyDelegate<CarrierLabelRecord>;
  stockFreeze: FindManyDelegate<StockFreezeRecord>;
  handlingUnit: FindManyDelegate<HandlingUnitRecord>;
  warehouseTask: FindManyDelegate<WarehouseTaskRecord>;
  warehouseOrder: FindManyDelegate<WarehouseOrderRecord>;
  warehouseOrderLine: FindManyDelegate<WarehouseOrderLineRecord>;
  stockMovement: FindManyDelegate<StockMovementRecord>;
}

interface FindFirstDelegate<TRecord> {
  findFirst(args: { where: Record<string, unknown> }): Promise<TRecord | null>;
}

interface FindManyDelegate<TRecord> {
  findMany(args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }): Promise<TRecord[]>;
}

interface WarehouseRecord {
  id: string;
}

interface StockQuantRecord {
  id: string;
  warehouseId: string;
  locationId: string | null;
  skuId: string | null;
  handlingUnitId: string | null;
  status: string | null;
  quantity: number;
  reservedQuantity: number;
}

interface ReservationRecord {
  id: string;
  stockQuantId: string | null;
  skuId: string | null;
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
  quantity: number;
  status: string;
}

interface OutboundOrderRecord {
  id: string;
  status: string;
}

interface OutboundOrderLineRecord {
  id: string;
  orderId: string;
  lineNumber: string;
  sku: string;
  orderedQuantity: number;
  pickedQuantity: number;
}

interface PackageContentRecord {
  id: string;
  packageId: string;
  outboundOrderLineId: string | null;
  sku: string;
  quantity: number;
}

interface ShipmentRecord {
  id: string;
  shipmentNumber: string;
  carrier: string | null;
  status: string;
}

interface ShipmentPackageRecord {
  id: string;
  shipmentId: string;
  status: string;
}

interface CarrierLabelRecord {
  id: string;
  shipmentId: string | null;
  packageId: string | null;
  status: string;
}

interface StockFreezeRecord {
  id: string;
  status: string;
  stockQuantId: string | null;
  locationId: string | null;
  skuId: string | null;
}

interface HandlingUnitRecord {
  id: string;
  status: string;
  currentLocationId: string | null;
  parentId: string | null;
}

interface WarehouseTaskRecord {
  id: string;
  type: string;
  status: string;
  quantity: number | null;
  reservationId: string | null;
  handlingUnitId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
}

interface WarehouseOrderRecord {
  id: string;
  status: string;
}

interface WarehouseOrderLineRecord {
  id: string;
  warehouseOrderId: string;
  requestedQuantity: number;
  allocatedQuantity: number | null;
  completedQuantity: number | null;
  status: string;
}

interface StockMovementRecord {
  id: string;
  stockQuantId: string | null;
  reservationId: string | null;
  taskId: string | null;
  type: string;
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  referenceType: string | null;
  referenceId: string | null;
}
