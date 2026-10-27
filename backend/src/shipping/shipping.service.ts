import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { normalizeOffsetPagination } from '../common';
import { OwnerClientRecord, OwnerScopePrismaClient, OwnerScopeService } from '../clients/owner-scope.service';
import { lockPostgresRowById, PrismaService, withTransactionRetry } from '../database';
import { AddShipmentPackageDto } from './dto/add-shipment-package.dto';
import { CreatePackingStationDto } from './dto/create-packing-station.dto';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { GenerateCarrierLabelDto } from './dto/generate-carrier-label.dto';
import { ListShipmentPackagesQueryDto } from './dto/list-shipment-packages-query.dto';
import { ListShipmentsQueryDto } from './dto/list-shipments-query.dto';
import { ShipShipmentDto } from './dto/ship-shipment.dto';
import { StageShipmentDto } from './dto/stage-shipment.dto';
import { makePackageCode, makeShipmentNumber, makeTrackingNumber } from './shipping.helpers';
import {
  CarrierLabelResponse,
  CarrierLabelStatus,
  PackingStationResponse,
  PackingStationStatus,
  ShipmentPackageResponse,
  ShipmentPackageStatus,
  ShipmentResponse,
  ShipmentStatus,
} from './shipping.types';

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async listStations(warehouseReference: string): Promise<PackingStationResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const stations = await this.client.packingStation.findMany({
      where: { warehouseId: warehouse.id },
      orderBy: { code: 'asc' },
    });

    return stations.map(toStationResponse);
  }

  async createStation(
    warehouseReference: string,
    dto: CreatePackingStationDto,
    actor: AuthenticatedUser,
  ): Promise<PackingStationResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const location = dto.locationReference
      ? await this.resolveLocation(warehouse.id, dto.locationReference)
      : null;
    const station = await this.client.packingStation.create({
      data: {
        warehouseId: warehouse.id,
        code: normalizeCode(dto.code),
        name: dto.name.trim(),
        locationId: location?.id ?? null,
        status: PackingStationStatus.ACTIVE,
        metadata: dto.metadata ?? undefined,
      },
    });


    await this.writeAudit(
      actor,
      warehouse.id,
      'packing.station_created',
      'packing_station',
      station.id,
      {
        code: station.code,
      },
    );

    return toStationResponse(station);
  }

  async listShipments(
    warehouseReference: string,
    query: ListShipmentsQueryDto = {},
  ): Promise<ShipmentResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = query.outboundOrderReference
      ? await this.resolveOutboundOrder(warehouse.id, query.outboundOrderReference)
      : null;
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 200 });
    const ownedShipmentIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId: warehouse.id,
      clientReference: query.ownerClientReference,
      resourceType: 'SHIPMENT',
    });
    const shipments = await this.client.shipment.findMany({
      where: compactRecord({
        warehouseId: warehouse.id,
        status: query.status ? normalizeCode(query.status) : undefined,
        carrier: query.carrier ? normalizeNullableString(query.carrier) : undefined,
        outboundOrderId: order?.id ?? undefined,
        id: ownedShipmentIds ? { in: ownedShipmentIds } : undefined,
      }),
      orderBy: { createdAt: 'desc' },
      take: pagination.take,
      skip: pagination.skip,
    });

    return shipments.map(toShipmentResponse);
  }

  async listPackages(
    warehouseReference: string,
    shipmentReference: string,
    query: ListShipmentPackagesQueryDto = {},
  ): Promise<ShipmentPackageResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const shipment = await this.resolveShipment(warehouse.id, shipmentReference);
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 200 });
    const packages = await this.client.shipmentPackage.findMany({
      where: compactRecord({
        warehouseId: warehouse.id,
        shipmentId: shipment.id,
        status: query.status ? normalizeCode(query.status) : undefined,
      }),
      orderBy: { createdAt: 'desc' },
      take: pagination.take,
      skip: pagination.skip,
    });

    return packages.map(toPackageResponse);
  }

  async createShipment(
    warehouseReference: string,
    dto: CreateShipmentDto,
    actor: AuthenticatedUser,
  ): Promise<ShipmentResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = dto.outboundOrderReference
      ? await this.resolveOutboundOrder(warehouse.id, dto.outboundOrderReference)
      : null;
    const station = dto.packingStationReference
      ? await this.resolvePackingStation(warehouse.id, dto.packingStationReference)
      : null;
    const owner = await this.resolveOperationOwner(this.client, warehouse.id, dto.ownerClientReference, [
      { resourceType: 'OUTBOUND_ORDER', resourceId: order?.id ?? null },
    ]);
    const shipment = await this.client.shipment.create({
      data: {
        warehouseId: warehouse.id,
        shipmentNumber: normalizeCode(dto.shipmentNumber ?? makeShipmentNumber()),
        outboundOrderId: order?.id ?? null,
        packingStationId: station?.id ?? null,
        status: ShipmentStatus.PACKING,
        carrier: normalizeNullableString(dto.carrier ?? order?.carrier ?? null),
        serviceLevel: normalizeNullableString(dto.serviceLevel ?? order?.serviceLevel ?? null),
        metadata: dto.metadata ?? undefined,
      },
    });

    if (owner) {
      await this.linkOwnerResources(this.client, warehouse.id, owner, [
        { resourceType: 'SHIPMENT', resourceId: shipment.id, metadata: { source: 'shipment.create', outboundOrderId: order?.id ?? null } },
      ]);
    }

    await this.writeAudit(actor, warehouse.id, 'shipment.created', 'shipment', shipment.id, {
      shipmentNumber: shipment.shipmentNumber,
      outboundOrderId: order?.id ?? null,
    });
    await this.client.outboxEvent.create({
      data: {
        type: 'SHIPMENT_CREATED',
        aggregateType: 'shipment',
        aggregateId: shipment.id,
        payload: { warehouseId: warehouse.id, shipmentNumber: shipment.shipmentNumber },
      },
    });

    return toShipmentResponse(shipment);
  }

  async addPackage(
    warehouseReference: string,
    shipmentReference: string,
    dto: AddShipmentPackageDto,
    actor: AuthenticatedUser,
  ): Promise<ShipmentPackageResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: ShippingTransactionClient) => {
      const shipment = await this.resolveShipmentWithClient(tx, warehouse.id, shipmentReference);
      const owner = await this.resolveOperationOwner(tx, warehouse.id, dto.ownerClientReference, [
        { resourceType: 'SHIPMENT', resourceId: shipment.id },
        { resourceType: 'OUTBOUND_ORDER', resourceId: shipment.outboundOrderId },
      ]);

      if (!['DRAFT', 'PACKING'].includes(shipment.status)) {
        throw new ConflictException(
          'Shipment package can only be added while shipment is DRAFT/PACKING',
        );
      }

      if (shipment.outboundOrderId) {
        await lockPostgresRowById(tx, 'outbound_orders', shipment.outboundOrderId);
      }

      const existingPackages = await tx.shipmentPackage.findMany({
        where: { shipmentId: shipment.id },
      });
      const existingOrderPackages = shipment.outboundOrderId
        ? await tx.shipmentPackage.findMany({
            where: { outboundOrderId: shipment.outboundOrderId },
          })
        : existingPackages;
      const contentPlan = await this.buildPackageContentPlan(
        tx,
        shipment,
        existingOrderPackages,
        dto.contents ?? [],
      );
      const packageCode = normalizeCode(
        dto.packageCode ?? makePackageCode(shipment.shipmentNumber, existingPackages.length + 1),
      );
      const trackingNumber = makeTrackingNumber(shipment.carrier, packageCode);
      const pack = await tx.shipmentPackage.create({
        data: {
          warehouseId: warehouse.id,
          shipmentId: shipment.id,
          outboundOrderId: shipment.outboundOrderId,
          packageCode,
          status: ShipmentPackageStatus.PACKED,
          packageType: normalizeCode(dto.packageType ?? 'CARTON'),
          weightGrams: dto.weightGrams ?? null,
          lengthCm: dto.lengthCm ?? null,
          widthCm: dto.widthCm ?? null,
          heightCm: dto.heightCm ?? null,
          trackingNumber,
          packedAt: new Date(),
          metadata: dto.metadata ?? undefined,
        },
      });

      for (const content of contentPlan.contents) {
        await tx.packageContent.create({
          data: {
            packageId: pack.id,
            outboundOrderLineId: content.outboundOrderLineId,
            sku: content.sku,
            quantity: content.quantity,
            metadata: content.metadata ?? undefined,
          },
        });
      }

      if (shipment.outboundOrderId) {
        const order = await tx.outboundOrder.findFirst({ where: { id: shipment.outboundOrderId } });
        const fullyPacked = isOrderFullyPackedAfterPlan(contentPlan);
        await tx.outboundOrder.update({
          where: { id: shipment.outboundOrderId },
          data: {
            status: fullyPacked ? 'PACKED' : 'PACKING',
            metadata: mergeMetadata(order?.metadata ?? null, {
              fulfillmentStatus: fullyPacked ? 'PACKED' : 'PACKING',
              packedViaShipmentId: shipment.id,
              lastPackedPackageId: pack.id,
              packedAt: new Date().toISOString(),
            }),
          },
        });
      }

      if (owner) {
        await this.linkOwnerResources(tx, warehouse.id, owner, [
          { resourceType: 'SHIPMENT_PACKAGE', resourceId: pack.id, metadata: { source: 'shipment.add_package', shipmentId: shipment.id } },
        ]);
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'shipment.package_added',
          resourceType: 'shipment_package',
          resourceId: pack.id,
          metadata: { shipmentId: shipment.id, packageCode },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'PACKAGE_PACKED',
          aggregateType: 'shipment_package',
          aggregateId: pack.id,
          payload: {
            warehouseId: warehouse.id,
            shipmentId: shipment.id,
            packageCode,
            trackingNumber,
          },
        },
      });

      return toPackageResponse(pack);
    });
  }

  async generateLabel(
    warehouseReference: string,
    shipmentReference: string,
    dto: GenerateCarrierLabelDto,
    actor: AuthenticatedUser,
  ): Promise<CarrierLabelResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const shipment = await this.resolveShipment(warehouse.id, shipmentReference);
    const pack = dto.packageReference
      ? await this.resolvePackage(warehouse.id, dto.packageReference)
      : null;

    if (pack && pack.shipmentId !== shipment.id) {
      throw new ConflictException('Package does not belong to this shipment');
    }

    const owner = await this.resolveOperationOwner(this.client, warehouse.id, dto.ownerClientReference, [
      { resourceType: 'SHIPMENT_PACKAGE', resourceId: pack?.id ?? null },
      { resourceType: 'SHIPMENT', resourceId: shipment.id },
      { resourceType: 'OUTBOUND_ORDER', resourceId: shipment.outboundOrderId },
    ]);
    const trackingNumber =
      dto.trackingNumber ??
      pack?.trackingNumber ??
      makeTrackingNumber(shipment.carrier, shipment.shipmentNumber);
    const labelReference = normalizeCode(`LBL-${trackingNumber}`);
    const label = await this.client.carrierLabel.create({
      data: {
        warehouseId: warehouse.id,
        shipmentId: shipment.id,
        packageId: pack?.id ?? null,
        labelReference,
        status: CarrierLabelStatus.GENERATED,
        carrier: shipment.carrier,
        serviceLevel: shipment.serviceLevel,
        trackingNumber,
        labelFormat: normalizeCode(dto.labelFormat ?? 'ZPL'),
        payload: {
          shipmentNumber: shipment.shipmentNumber,
          packageCode: pack?.packageCode ?? null,
          trackingNumber,
          carrier: shipment.carrier,
          serviceLevel: shipment.serviceLevel,
          customPayload: dto.payload ?? null,
        },
      },
    });

    if (owner) {
      await this.linkOwnerResources(this.client, warehouse.id, owner, [
        {
          resourceType: 'CARRIER_LABEL',
          resourceId: label.id,
          metadata: { source: 'shipment.generate_label', shipmentId: shipment.id, packageId: pack?.id ?? null },
        },
      ]);
    }

    await this.writeAudit(
      actor,
      warehouse.id,
      'carrier_label.generated',
      'carrier_label',
      label.id,
      {
        shipmentId: shipment.id,
        packageId: pack?.id ?? null,
        trackingNumber,
      },
    );

    return toLabelResponse(label);
  }

  async stageShipment(
    warehouseReference: string,
    shipmentReference: string,
    dto: StageShipmentDto,
    actor: AuthenticatedUser,
  ): Promise<ShipmentResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const stagedLocation = dto.stagedLocationReference
      ? await this.resolveLocation(warehouse.id, dto.stagedLocationReference)
      : null;

    return this.transaction(async (tx: ShippingTransactionClient) => {
      const shipment = await this.resolveShipmentWithClient(tx, warehouse.id, shipmentReference);

      if (!['PACKING', 'DRAFT'].includes(shipment.status)) {
        throw new ConflictException('Shipment can only be staged from DRAFT/PACKING');
      }

      await this.assertShipmentReadyToStage(tx, shipment);

      const updatedShipment = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.STAGED,
          stagedLocationId: stagedLocation?.id ?? shipment.stagedLocationId ?? null,
          stagedAt: new Date(),
          metadata: mergeMetadata(shipment.metadata, { stageMetadata: dto.metadata ?? null }),
        },
      });
      await tx.shipmentPackage.updateMany({
        where: { shipmentId: shipment.id, status: ShipmentPackageStatus.PACKED },
        data: { status: ShipmentPackageStatus.STAGED },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'shipment.staged',
          resourceType: 'shipment',
          resourceId: shipment.id,
          metadata: { stagedLocationId: stagedLocation?.id ?? null },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'SHIPMENT_STAGED',
          aggregateType: 'shipment',
          aggregateId: shipment.id,
          payload: { warehouseId: warehouse.id, stagedLocationId: stagedLocation?.id ?? null },
        },
      });

      return toShipmentResponse(updatedShipment);
    });
  }

  async shipShipment(
    warehouseReference: string,
    shipmentReference: string,
    dto: ShipShipmentDto,
    actor: AuthenticatedUser,
  ): Promise<ShipmentResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    return this.transaction(async (tx: ShippingTransactionClient) => {
      const shipment = await this.resolveShipmentWithClient(tx, warehouse.id, shipmentReference);

      if (!['STAGED', 'LOADING'].includes(shipment.status)) {
        throw new ConflictException('Shipment must be staged/loading before ship confirmation');
      }

      await this.assertShipmentReadyToShip(tx, shipment, dto.allowShipWithoutLabel ?? false);

      const shippedAt = dto.shippedAt ? new Date(dto.shippedAt) : new Date();
      const trackingReference = dto.trackingReference ?? shipment.trackingReference ?? null;
      const updatedShipment = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: ShipmentStatus.SHIPPED,
          trackingReference,
          shippedAt,
          metadata: mergeMetadata(shipment.metadata, { shipMetadata: dto.metadata ?? null }),
        },
      });
      await tx.shipmentPackage.updateMany({
        where: {
          shipmentId: shipment.id,
          status: {
            in: [
              ShipmentPackageStatus.PACKED,
              ShipmentPackageStatus.STAGED,
              ShipmentPackageStatus.LOADED,
            ],
          },
        },
        data: { status: ShipmentPackageStatus.SHIPPED },
      });
      await tx.carrierLabel.updateMany({
        where: { shipmentId: shipment.id, status: CarrierLabelStatus.GENERATED },
        data: { status: CarrierLabelStatus.PRINTED, printedAt: shippedAt },
      });

      if (shipment.outboundOrderId) {
        const order = await tx.outboundOrder.findFirst({ where: { id: shipment.outboundOrderId } });
        await tx.outboundOrder.update({
          where: { id: shipment.outboundOrderId },
          data: {
            status: 'SHIPPED',
            shippedAt,
            metadata: mergeMetadata(order?.metadata ?? null, {
              fulfillmentStatus: 'SHIPPED',
              shippedViaShipmentId: shipment.id,
              shippedAt: shippedAt.toISOString(),
            }),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'shipment.shipped',
          resourceType: 'shipment',
          resourceId: shipment.id,
          metadata: { trackingReference, shippedAt: shippedAt.toISOString() },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'SHIPMENT_SHIPPED',
          aggregateType: 'shipment',
          aggregateId: shipment.id,
          payload: {
            warehouseId: warehouse.id,
            trackingReference,
            shippedAt: shippedAt.toISOString(),
          },
        },
      });

      return toShipmentResponse(updatedShipment);
    });
  }

  private async resolveOperationOwner(
    client: ShippingTransactionClient,
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
      throw new ConflictException('Explicit owner client conflicts with parent resource ownership.');
    }

    return explicitOwner;
  }

  private async linkOwnerResources(
    client: ShippingTransactionClient,
    warehouseId: string,
    owner: OwnerClientRecord,
    resources: Array<{ resourceType: string; resourceId: string | null | undefined; metadata?: Record<string, unknown> | null }>,
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

  private async resolveWarehouse(reference: string): Promise<WarehouseRecord> {
    const warehouse = await this.client.warehouse.findFirst({ where: warehouseWhere(reference) });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveLocation(warehouseId: string, reference: string): Promise<LocationRecord> {
    const location = await this.client.warehouseLocation.findFirst({
      where: {
        warehouseId,
        OR: locationReferenceOr(reference),
      },
    });

    if (!location) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return location;
  }

  private async resolvePackingStation(
    warehouseId: string,
    reference: string,
  ): Promise<PackingStationRecord> {
    const station = await this.client.packingStation.findFirst({
      where: { warehouseId, OR: referenceOr(reference, { code: normalizeCode(reference) }) },
    });

    if (!station) {
      throw new NotFoundException('Packing station was not found');
    }

    return station;
  }

  private async resolveOutboundOrder(
    warehouseId: string,
    reference: string,
  ): Promise<OutboundOrderRecord> {
    const order = await this.client.outboundOrder.findFirst({
      where: { warehouseId, OR: referenceOr(reference, { orderNumber: normalizeCode(reference) }) },
    });

    if (!order) {
      throw new NotFoundException('Outbound order was not found');
    }

    return order;
  }

  private async resolveShipment(warehouseId: string, reference: string): Promise<ShipmentRecord> {
    return this.resolveShipmentWithClient(this.client, warehouseId, reference);
  }

  private async resolveShipmentWithClient(
    tx: ShippingTransactionClient,
    warehouseId: string,
    reference: string,
  ): Promise<ShipmentRecord> {
    const shipment = await tx.shipment.findFirst({
      where: { warehouseId, OR: referenceOr(reference, { shipmentNumber: normalizeCode(reference) }) },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment was not found');
    }

    return shipment;
  }

  private async resolvePackage(
    warehouseId: string,
    reference: string,
  ): Promise<ShipmentPackageRecord> {
    const pack = await this.client.shipmentPackage.findFirst({
      where: { warehouseId, OR: referenceOr(reference, { packageCode: normalizeCode(reference) }) },
    });

    if (!pack) {
      throw new NotFoundException('Shipment package was not found');
    }

    return pack;
  }

  private async buildPackageContentPlan(
    tx: ShippingTransactionClient,
    shipment: ShipmentRecord,
    existingPackages: ShipmentPackageRecord[],
    contents: AddShipmentPackageDto['contents'],
  ): Promise<PackageContentPlan> {
    const rawContents = contents ?? [];

    if (!shipment.outboundOrderId) {
      return {
        contents: rawContents.map((content) => ({
          outboundOrderLineId: normalizeNullableString(content.outboundOrderLineReference),
          sku: normalizeCode(content.sku),
          quantity: content.quantity,
          metadata: content.metadata,
        })),
        orderLines: [],
        alreadyPackedByLine: new Map(),
        newlyPackedByLine: new Map(),
      };
    }

    if (rawContents.length === 0) {
      throw new ConflictException('Package contents are required for outbound-order shipments');
    }

    if (!tx.outboundOrderLine?.findMany || !tx.packageContent?.findMany) {
      throw new ConflictException(
        'Packing validation requires outbound order lines and package contents',
      );
    }

    const orderLines = await tx.outboundOrderLine.findMany({
      where: { orderId: shipment.outboundOrderId },
      orderBy: { lineNumber: 'asc' },
    });

    if (orderLines.length === 0) {
      throw new ConflictException('Outbound order has no packable lines');
    }

    const existingPackageIds = existingPackages.map((pack) => pack.id);
    const existingContents = existingPackageIds.length
      ? await tx.packageContent.findMany({ where: { packageId: { in: existingPackageIds } } })
      : [];
    const alreadyPackedByLine = sumPackageContentsByLine(existingContents);
    const newlyPackedByLine = new Map<string, number>();
    const plannedContents: PlannedPackageContent[] = [];

    for (const content of rawContents) {
      const line = resolvePackageContentLine(orderLines, content);
      const normalizedSku = normalizeCode(content.sku);

      if (normalizeCode(line.sku) !== normalizedSku) {
        throw new ConflictException(
          `Package content SKU ${normalizedSku} does not match outbound line ${line.lineNumber}`,
        );
      }

      if (line.pickedQuantity <= 0) {
        throw new ConflictException(
          `Outbound line ${line.lineNumber} has no picked quantity to pack`,
        );
      }

      const alreadyPacked = alreadyPackedByLine.get(line.id) ?? 0;
      const plannedPacked = newlyPackedByLine.get(line.id) ?? 0;
      const remainingPickedQuantity = line.pickedQuantity - alreadyPacked - plannedPacked;

      if (content.quantity > remainingPickedQuantity) {
        throw new ConflictException(
          `Package content for line ${line.lineNumber} exceeds picked quantity. Requested ${content.quantity}, remaining picked quantity ${Math.max(remainingPickedQuantity, 0)}.`,
        );
      }

      newlyPackedByLine.set(line.id, plannedPacked + content.quantity);
      plannedContents.push({
        outboundOrderLineId: line.id,
        sku: normalizedSku,
        quantity: content.quantity,
        metadata: content.metadata,
      });
    }

    return {
      contents: plannedContents,
      orderLines,
      alreadyPackedByLine,
      newlyPackedByLine,
    };
  }

  private async assertShipmentReadyToStage(
    tx: ShippingTransactionClient,
    shipment: ShipmentRecord,
  ): Promise<void> {
    const packages = await tx.shipmentPackage.findMany({
      where: { shipmentId: shipment.id, status: ShipmentPackageStatus.PACKED },
    });

    if (packages.length === 0) {
      throw new ConflictException('Shipment cannot be staged without packed packages');
    }

    if (shipment.outboundOrderId) {
      await this.assertOutboundOrderPacked(tx, shipment, packages);
    }
  }

  private async assertShipmentReadyToShip(
    tx: ShippingTransactionClient,
    shipment: ShipmentRecord,
    allowShipWithoutLabel = false,
  ): Promise<void> {
    const packages = await tx.shipmentPackage.findMany({
      where: {
        shipmentId: shipment.id,
        status: { in: [ShipmentPackageStatus.STAGED, ShipmentPackageStatus.LOADED] },
      },
    });

    if (packages.length === 0) {
      throw new ConflictException('Shipment cannot be shipped without staged or loaded packages');
    }

    if (!allowShipWithoutLabel && carrierRequiresLabel(shipment.carrier)) {
      const labels = await tx.carrierLabel.findMany({
        where: {
          shipmentId: shipment.id,
          status: { in: [CarrierLabelStatus.GENERATED, CarrierLabelStatus.PRINTED] },
        },
      });
      const hasShipmentLevelLabel = labels.some((label) => !label.packageId);
      const labelledPackageIds = new Set(labels.map((label) => label.packageId).filter(isString));
      const missingPackageLabel = packages.some(
        (pack) => !hasShipmentLevelLabel && !labelledPackageIds.has(pack.id),
      );

      if (missingPackageLabel) {
        throw new ConflictException('Shipment cannot be shipped until every package has a label');
      }
    }

    if (shipment.outboundOrderId) {
      await this.assertOutboundOrderPacked(tx, shipment, packages);
    }
  }

  private async assertOutboundOrderPacked(
    tx: ShippingTransactionClient,
    shipment: ShipmentRecord,
    packages: ShipmentPackageRecord[],
  ): Promise<void> {
    if (!shipment.outboundOrderId) {
      return;
    }

    if (!tx.outboundOrderLine?.findMany || !tx.packageContent?.findMany) {
      throw new ConflictException('Outbound packing validation is unavailable');
    }

    const orderLines = await tx.outboundOrderLine.findMany({
      where: { orderId: shipment.outboundOrderId },
      orderBy: { lineNumber: 'asc' },
    });
    const packageIds = packages.map((pack) => pack.id);
    const contents = packageIds.length
      ? await tx.packageContent.findMany({ where: { packageId: { in: packageIds } } })
      : [];
    const packedByLine = sumPackageContentsByLine(contents);

    for (const line of orderLines) {
      if (line.pickedQuantity <= 0) {
        continue;
      }

      const packedQuantity = packedByLine.get(line.id) ?? 0;

      if (packedQuantity < line.pickedQuantity) {
        throw new ConflictException(
          `Outbound line ${line.lineNumber} is not fully packed. Picked ${line.pickedQuantity}, packed ${packedQuantity}.`,
        );
      }
    }
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
      data: { actorUserId: actor.id, warehouseId, action, resourceType, resourceId, metadata },
    });
  }


  private transaction<T>(fn: (client: ShippingTransactionClient) => Promise<T>): Promise<T> {
    return withTransactionRetry(() => this.client.$transaction(fn));
  }

  private get client(): ShippingPrismaClient {
    return this.prisma as unknown as ShippingPrismaClient;
  }
}

function toStationResponse(station: PackingStationRecord): PackingStationResponse {
  return {
    id: station.id,
    warehouseId: station.warehouseId,
    code: station.code,
    name: station.name,
    locationId: station.locationId ?? null,
    status: station.status as PackingStationStatus,
    metadata: station.metadata ?? null,
  };
}

function toShipmentResponse(shipment: ShipmentRecord): ShipmentResponse {
  return {
    id: shipment.id,
    warehouseId: shipment.warehouseId,
    shipmentNumber: shipment.shipmentNumber,
    outboundOrderId: shipment.outboundOrderId ?? null,
    packingStationId: shipment.packingStationId ?? null,
    stagedLocationId: shipment.stagedLocationId ?? null,
    status: shipment.status as ShipmentStatus,
    carrier: shipment.carrier ?? null,
    serviceLevel: shipment.serviceLevel ?? null,
    trackingReference: shipment.trackingReference ?? null,
    metadata: shipment.metadata ?? null,
    stagedAt: shipment.stagedAt ?? null,
    loadedAt: shipment.loadedAt ?? null,
    shippedAt: shipment.shippedAt ?? null,
  };
}

function toPackageResponse(pack: ShipmentPackageRecord): ShipmentPackageResponse {
  return {
    id: pack.id,
    warehouseId: pack.warehouseId,
    shipmentId: pack.shipmentId,
    outboundOrderId: pack.outboundOrderId ?? null,
    packageCode: pack.packageCode,
    status: pack.status as ShipmentPackageStatus,
    packageType: pack.packageType,
    weightGrams: pack.weightGrams ?? null,
    lengthCm: pack.lengthCm ?? null,
    widthCm: pack.widthCm ?? null,
    heightCm: pack.heightCm ?? null,
    trackingNumber: pack.trackingNumber ?? null,
    metadata: pack.metadata ?? null,
  };
}

function toLabelResponse(label: CarrierLabelRecord): CarrierLabelResponse {
  return {
    id: label.id,
    warehouseId: label.warehouseId,
    shipmentId: label.shipmentId ?? null,
    packageId: label.packageId ?? null,
    labelReference: label.labelReference,
    status: label.status as CarrierLabelStatus,
    carrier: label.carrier ?? null,
    serviceLevel: label.serviceLevel ?? null,
    trackingNumber: label.trackingNumber ?? null,
    labelFormat: label.labelFormat,
    payload: label.payload ?? null,
  };
}


function referenceOr(reference: string, fallback: Record<string, unknown>): Record<string, unknown>[] {
  return isUuid(reference) ? [{ id: reference }, fallback] : [fallback];
}

function locationReferenceOr(reference: string): Record<string, unknown>[] {
  const normalized = normalizeCode(reference);
  return isUuid(reference)
    ? [{ id: reference }, { code: normalized }, { barcode: normalized }]
    : [{ code: normalized }, { barcode: normalized }];
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

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }

  return compacted;
}

function sumPackageContentsByLine(contents: PackageContentRecord[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const content of contents) {
    if (!content.outboundOrderLineId) {
      continue;
    }

    totals.set(
      content.outboundOrderLineId,
      (totals.get(content.outboundOrderLineId) ?? 0) + content.quantity,
    );
  }

  return totals;
}

function resolvePackageContentLine(
  orderLines: OutboundOrderLineRecord[],
  content: NonNullable<AddShipmentPackageDto['contents']>[number],
): OutboundOrderLineRecord {
  const reference = normalizeNullableString(content.outboundOrderLineReference);

  if (reference) {
    const referencedLine = orderLines.find(
      (line) => line.id === reference || line.lineNumber === reference,
    );

    if (!referencedLine) {
      throw new ConflictException(`Outbound order line ${reference} was not found`);
    }

    return referencedLine;
  }

  const skuLines = orderLines.filter(
    (line) => normalizeCode(line.sku) === normalizeCode(content.sku),
  );

  if (skuLines.length === 1) {
    const [line] = skuLines;

    if (line) {
      return line;
    }
  }

  if (skuLines.length > 1) {
    throw new ConflictException(
      `Multiple outbound lines use SKU ${normalizeCode(content.sku)}; outboundOrderLineReference is required`,
    );
  }

  throw new ConflictException(`No outbound line was found for SKU ${normalizeCode(content.sku)}`);
}

function isOrderFullyPackedAfterPlan(plan: PackageContentPlan): boolean {
  if (plan.orderLines.length === 0) {
    return false;
  }

  return plan.orderLines.every((line) => {
    if (line.pickedQuantity <= 0) {
      return true;
    }

    const packedQuantity =
      (plan.alreadyPackedByLine.get(line.id) ?? 0) + (plan.newlyPackedByLine.get(line.id) ?? 0);

    return packedQuantity >= line.pickedQuantity;
  });
}

function carrierRequiresLabel(carrier: string | null): boolean {
  const normalized = normalizeNullableString(carrier)?.toUpperCase();

  if (!normalized) {
    return false;
  }

  return !['INTERNAL', 'PICKUP', 'WILL_CALL', 'CUSTOMER_PICKUP'].includes(normalized);
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

interface ShippingPrismaClient extends ShippingTransactionClient {
  $transaction<T>(fn: (client: ShippingTransactionClient) => Promise<T>): Promise<T>;
}

interface ShippingTransactionClient {
  warehouse: { findFirst(args: Record<string, unknown>): Promise<WarehouseRecord | null> };
  warehouseLocation: { findFirst(args: Record<string, unknown>): Promise<LocationRecord | null> };
  packingStation: {
    create(args: Record<string, unknown>): Promise<PackingStationRecord>;
    findFirst(args: Record<string, unknown>): Promise<PackingStationRecord | null>;
    findMany(args: Record<string, unknown>): Promise<PackingStationRecord[]>;
  };
  outboundOrder: {
    findFirst(args: Record<string, unknown>): Promise<OutboundOrderRecord | null>;
    update(args: Record<string, unknown>): Promise<OutboundOrderRecord>;
  };
  outboundOrderLine?: {
    findMany(args: Record<string, unknown>): Promise<OutboundOrderLineRecord[]>;
  };
  shipment: {
    create(args: Record<string, unknown>): Promise<ShipmentRecord>;
    findFirst(args: Record<string, unknown>): Promise<ShipmentRecord | null>;
    findMany(args: Record<string, unknown>): Promise<ShipmentRecord[]>;
    update(args: Record<string, unknown>): Promise<ShipmentRecord>;
  };
  shipmentPackage: {
    create(args: Record<string, unknown>): Promise<ShipmentPackageRecord>;
    findFirst(args: Record<string, unknown>): Promise<ShipmentPackageRecord | null>;
    findMany(args: Record<string, unknown>): Promise<ShipmentPackageRecord[]>;
    updateMany(args: Record<string, unknown>): Promise<unknown>;
  };
  packageContent: {
    create(args: Record<string, unknown>): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<PackageContentRecord[]>;
  };
  carrierLabel: {
    create(args: Record<string, unknown>): Promise<CarrierLabelRecord>;
    findMany(args: Record<string, unknown>): Promise<CarrierLabelRecord[]>;
    updateMany(args: Record<string, unknown>): Promise<unknown>;
  };
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
interface PackingStationRecord {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  locationId: string | null;
  status: string;
  metadata: unknown;
}
interface OutboundOrderRecord {
  id: string;
  warehouseId: string;
  orderNumber: string;
  status: string;
  carrier: string | null;
  serviceLevel: string | null;
  metadata: unknown;
}
interface OutboundOrderLineRecord {
  id: string;
  orderId: string;
  lineNumber: string;
  sku: string;
  orderedQuantity: number;
  pickedQuantity: number;
}

interface ShipmentRecord {
  id: string;
  warehouseId: string;
  shipmentNumber: string;
  outboundOrderId: string | null;
  packingStationId: string | null;
  stagedLocationId: string | null;
  status: string;
  carrier: string | null;
  serviceLevel: string | null;
  trackingReference: string | null;
  metadata: unknown;
  stagedAt: Date | null;
  loadedAt: Date | null;
  shippedAt: Date | null;
}
interface ShipmentPackageRecord {
  id: string;
  warehouseId: string;
  shipmentId: string;
  outboundOrderId: string | null;
  packageCode: string;
  status: string;
  packageType: string;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  trackingNumber: string | null;
  metadata: unknown;
}
interface PackageContentRecord {
  id: string;
  packageId: string;
  outboundOrderLineId: string | null;
  sku: string;
  quantity: number;
}

interface PlannedPackageContent {
  outboundOrderLineId: string | null;
  sku: string;
  quantity: number;
  metadata: Record<string, unknown> | undefined;
}

interface PackageContentPlan {
  contents: PlannedPackageContent[];
  orderLines: OutboundOrderLineRecord[];
  alreadyPackedByLine: Map<string, number>;
  newlyPackedByLine: Map<string, number>;
}

interface CarrierLabelRecord {
  id: string;
  warehouseId: string;
  shipmentId: string | null;
  packageId: string | null;
  labelReference: string;
  status: string;
  carrier: string | null;
  serviceLevel: string | null;
  trackingNumber: string | null;
  labelFormat: string;
  payload: unknown;
}
