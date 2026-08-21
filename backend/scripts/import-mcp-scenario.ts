import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv, env } from 'node:process';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

type Scenario = {
  scenarioId: string;
  warehouse: { code: string; name: string };
  locations: Array<{ code: string; type: string }>;
  products: Array<{ sku: string; ean?: string; name: string; unit?: string; defaultLocation?: string }>;
  inboundShipments: Array<{
    asn: string;
    supplier?: string;
    dock?: string;
    lines: Array<{ sku: string; quantity: number }>;
  }>;
  outboundOrders: Array<{
    order: string;
    channel?: string;
    priority?: string;
    lines: Array<{ sku: string; quantity: number }>;
  }>;
};

const databaseUrl = env.DATABASE_URL;
const nodeEnv = env.NODE_ENV ?? 'development';

if (nodeEnv === 'production') {
  throw new Error('Refusing to import MCP scenario when NODE_ENV=production.');
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to import MCP scenario.');
}

if (!isLocalDatabaseUrl(databaseUrl)) {
  throw new Error(`Refusing to import MCP scenario into non-local database: ${redactDatabaseUrl(databaseUrl)}`);
}

const scenarioPath = resolve(argv[2] ?? '../MCP/scenarios/eshop-electro-lite.json');
const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8')) as Scenario;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

void main();

async function main() {
  try {
    const result = await importScenario(scenario);
    console.log(JSON.stringify({ ok: true, scenarioId: scenario.scenarioId, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function importScenario(input: Scenario) {
  const warehouse = await prisma.warehouse.upsert({
    where: { code: input.warehouse.code },
    update: { name: input.warehouse.name, status: 'ACTIVE' },
    create: {
      code: input.warehouse.code,
      name: input.warehouse.name,
      timezone: 'Europe/Prague',
      status: 'ACTIVE',
    },
  });

  const locations = new Map<string, { id: string; code: string }>();
  for (const location of input.locations) {
    const saved = await prisma.warehouseLocation.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: location.code } },
      update: {
        name: location.code,
        type: mapLocationType(location.type),
        zone: location.code.split('-')[0] || null,
        isActive: true,
      },
      create: {
        warehouseId: warehouse.id,
        code: location.code,
        name: location.code,
        type: mapLocationType(location.type),
        zone: location.code.split('-')[0] || null,
        barcode: `AARD1:LOC:${warehouse.code}:${location.code}`,
        pickSequence: location.code.includes('A-') ? 10 : location.code.includes('B-') ? 20 : 0,
      },
    });
    locations.set(saved.code, saved);
  }

  const fallbackLocation = locations.get(input.locations[0]?.code ?? '') ?? await prisma.warehouseLocation.findFirstOrThrow({ where: { warehouseId: warehouse.id } });
  const packingLocation = locations.get('PACK-01') ?? fallbackLocation;

  const skus = new Map<string, { id: string; code: string; defaultLocationCode: string }>();
  for (const product of input.products) {
    const savedProduct = await prisma.product.upsert({
      where: { code: `MCP-${product.sku}` },
      update: {
        name: product.name,
        description: product.name,
        status: 'ACTIVE',
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
      },
      create: {
        code: `MCP-${product.sku}`,
        name: product.name,
        description: product.name,
        status: 'ACTIVE',
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
      },
    });

    const savedSku = await prisma.sku.upsert({
      where: { code: product.sku },
      update: {
        productId: savedProduct.id,
        name: product.name,
        barcode: product.ean ?? null,
        uom: product.unit ?? 'ks',
        status: 'ACTIVE',
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId, defaultLocation: product.defaultLocation },
      },
      create: {
        productId: savedProduct.id,
        code: product.sku,
        name: product.name,
        barcode: product.ean ?? null,
        uom: product.unit ?? 'ks',
        status: 'ACTIVE',
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId, defaultLocation: product.defaultLocation },
      },
    });
    skus.set(savedSku.code, { ...savedSku, defaultLocationCode: product.defaultLocation ?? fallbackLocation.code });

    const stockLocation = locations.get(product.defaultLocation ?? '') ?? fallbackLocation;
    const existingQuant = await prisma.stockQuant.findFirst({
      where: {
        warehouseId: warehouse.id,
        skuId: savedSku.id,
        locationId: stockLocation.id,
        status: 'AVAILABLE',
        externalReference: `MCP-STOCK-${savedSku.code}`,
      },
    });

    const quant = existingQuant
      ? await prisma.stockQuant.update({
          where: { id: existingQuant.id },
          data: { quantity: 25, reservedQuantity: 0, metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId } },
        })
      : await prisma.stockQuant.create({
          data: {
            warehouseId: warehouse.id,
            skuId: savedSku.id,
            locationId: stockLocation.id,
            quantity: 25,
            reservedQuantity: 0,
            status: 'AVAILABLE',
            externalReference: `MCP-STOCK-${savedSku.code}`,
            metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
          },
        });

    const movement = await prisma.stockMovement.findFirst({
      where: { warehouseId: warehouse.id, stockQuantId: quant.id, referenceId: `MCP-STOCK-${savedSku.code}` },
    });
    if (!movement) {
      await prisma.stockMovement.create({
        data: {
          warehouseId: warehouse.id,
          skuId: savedSku.id,
          stockQuantId: quant.id,
          type: 'RECEIVE',
          quantity: 25,
          toLocationId: stockLocation.id,
          referenceType: 'mcp-scenario',
          referenceId: `MCP-STOCK-${savedSku.code}`,
          sourceSystem: 'MCP_SCENARIO',
          idempotencyKey: `mcp-scenario-stock-${savedSku.code}`,
          metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
        },
      });
    }
  }

  for (const inbound of input.inboundShipments) {
    const dockLocation = locations.get(inbound.dock ?? '') ?? fallbackLocation;
    const shipment = await prisma.inboundShipment.upsert({
      where: { warehouseId_shipmentNumber: { warehouseId: warehouse.id, shipmentNumber: inbound.asn } },
      update: {
        status: 'RECEIVING',
        supplierName: inbound.supplier ?? null,
        dockLocationId: dockLocation.id,
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
      },
      create: {
        warehouseId: warehouse.id,
        shipmentNumber: inbound.asn,
        status: 'RECEIVING',
        supplierName: inbound.supplier ?? null,
        dockLocationId: dockLocation.id,
        expectedAt: new Date(),
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
      },
    });

    for (const [index, line] of inbound.lines.entries()) {
      await prisma.inboundShipmentLine.upsert({
        where: { shipmentId_lineNumber: { shipmentId: shipment.id, lineNumber: String(index + 1) } },
        update: {
          sku: line.sku,
          description: skus.get(line.sku)?.code ?? line.sku,
          expectedQuantity: line.quantity,
          receivedQuantity: 0,
          metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
        },
        create: {
          shipmentId: shipment.id,
          lineNumber: String(index + 1),
          sku: line.sku,
          description: skus.get(line.sku)?.code ?? line.sku,
          expectedQuantity: line.quantity,
          receivedQuantity: 0,
          metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
        },
      });
    }
  }

  for (const outbound of input.outboundOrders) {
    const order = await prisma.outboundOrder.upsert({
      where: { warehouseId_orderNumber: { warehouseId: warehouse.id, orderNumber: outbound.order } },
      update: {
        status: 'CREATED',
        carrier: 'MCP_CARRIER',
        serviceLevel: outbound.priority === 'High' ? 'EXPRESS' : 'STANDARD',
        customerReference: outbound.channel ?? 'MCP-E2E',
        shipBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
      },
      create: {
        warehouseId: warehouse.id,
        orderNumber: outbound.order,
        status: 'CREATED',
        carrier: 'MCP_CARRIER',
        serviceLevel: outbound.priority === 'High' ? 'EXPRESS' : 'STANDARD',
        customerReference: outbound.channel ?? 'MCP-E2E',
        recipientName: 'MCP Test Receiver',
        shipBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
      },
    });

    for (const [index, line] of outbound.lines.entries()) {
      await prisma.outboundOrderLine.upsert({
        where: { orderId_lineNumber: { orderId: order.id, lineNumber: String(index + 1) } },
        update: {
          sku: line.sku,
          description: skus.get(line.sku)?.code ?? line.sku,
          orderedQuantity: line.quantity,
          pickedQuantity: 0,
          metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
        },
        create: {
          orderId: order.id,
          lineNumber: String(index + 1),
          sku: line.sku,
          description: skus.get(line.sku)?.code ?? line.sku,
          orderedQuantity: line.quantity,
          pickedQuantity: 0,
          metadata: { source: 'mcp-scenario', scenarioId: input.scenarioId },
        },
      });

      // Pick tasks are intentionally not pre-created here. A realistic WMS shift
      // must create them through allocation/release so reservations and task
      // state stay in sync.
    }
  }

  await prisma.packingStation.upsert({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: 'PACK-01' } },
    update: { name: 'MCP Packing 01', status: 'ACTIVE', locationId: packingLocation.id },
    create: { warehouseId: warehouse.id, code: 'PACK-01', name: 'MCP Packing 01', status: 'ACTIVE', locationId: packingLocation.id },
  });

  return {
    warehouseCode: warehouse.code,
    locations: locations.size,
    skus: skus.size,
    inboundShipments: input.inboundShipments.length,
    outboundOrders: input.outboundOrders.length,
  };
}

function mapLocationType(type: string) {
  const normalized = type.toLowerCase();
  if (normalized === 'receiving') return 'RECEIVING';
  if (normalized === 'pick') return 'PICKING';
  if (normalized === 'packing') return 'PACKING';
  if (normalized === 'shipping') return 'SHIPPING';
  if (normalized === 'quality') return 'QUARANTINE';
  return 'STORAGE';
}

function isLocalDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1', 'postgres'].includes(url.hostname);
  } catch {
    return false;
  }
}

function redactDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid url>';
  }
}
