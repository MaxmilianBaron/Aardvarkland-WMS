import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';

import { assertStrongPassword } from '../src/auth/password-policy';
import { PrismaClient } from '../src/generated/prisma/client';

const databaseUrl = process.env['DATABASE_URL'];
const nodeEnv = process.env['NODE_ENV'] ?? 'development';

const allowDemoSeed = process.env['ALLOW_DEMO_SEED'] === 'true' || nodeEnv !== 'production';

if (!allowDemoSeed) {
  throw new Error('Refusing to run demo seed in production without ALLOW_DEMO_SEED=true.');
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
let seedDb = prisma;
const rejectSeedPasswordPlaceholders = nodeEnv === 'production' || nodeEnv === 'staging';
const configuredAdminInitialPassword = process.env['ADMIN_INITIAL_PASSWORD'];

if (rejectSeedPasswordPlaceholders && !configuredAdminInitialPassword) {
  throw new Error('ADMIN_INITIAL_PASSWORD is required for staging and production seed runs.');
}

const adminInitialPassword = configuredAdminInitialPassword ?? 'Local-Seed-42!';
const seedDemoOperatorUser =
  process.env['SEED_DEMO_OPERATOR_USER'] === 'true' && nodeEnv !== 'production';
const demoOperatorEmail = process.env['DEMO_OPERATOR_EMAIL'] ?? 'demo-operator@example.com';
const demoOperatorPassword = process.env['DEMO_OPERATOR_PASSWORD'] ?? 'Warehouse-Operator-42!';

assertStrongPassword(adminInitialPassword, { rejectPlaceholders: rejectSeedPasswordPlaceholders });
if (seedDemoOperatorUser) {
  assertStrongPassword(demoOperatorPassword, { rejectPlaceholders: true });
}

const permissions = [
  { code: 'warehouse.read', description: 'Read warehouse master data.' },
  { code: 'warehouse.manage', description: 'Manage warehouses and locations.' },
  { code: 'parcel.read', description: 'Read parcel core records.' },
  { code: 'parcel.manage', description: 'Create and update parcel core records.' },
  { code: 'tracking.read', description: 'Read parcel tracking events.' },
  { code: 'tracking.manage', description: 'Create parcel tracking events.' },
  { code: 'inbound.read', description: 'Read inbound shipments.' },
  { code: 'inbound.manage', description: 'Create and update inbound shipments.' },
  { code: 'outbound.read', description: 'Read outbound orders.' },
  { code: 'outbound.manage', description: 'Create and update outbound orders.' },
  { code: 'product.read', description: 'Read product and SKU master data.' },
  { code: 'product.manage', description: 'Create and update product and SKU master data.' },
  { code: 'inventory.read', description: 'Read stock quants and stock movements.' },
  { code: 'inventory.move', description: 'Receive, move, and put away stock through operational workflows.' },
  { code: 'inventory.adjust', description: 'Adjust, block, unblock, quarantine, and change inventory state.' },
  { code: 'inventory.manage', description: 'Legacy broad inventory management permission for administrators only.' },
  { code: 'reservation.read', description: 'Read stock reservations.' },
  { code: 'reservation.manage', description: 'Create and manage stock reservations.' },
  { code: 'task.read', description: 'Read warehouse tasks.' },
  { code: 'task.manage', description: 'Create and progress warehouse tasks.' },
  { code: 'fulfillment.manage', description: 'Run picking, packing, and shipping workflows.' },
  { code: 'scanner.read', description: 'Read scanner devices.' },
  { code: 'scanner.manage', description: 'Create scanners and log scans.' },
  { code: 'label.read', description: 'Read label templates and print jobs.' },
  { code: 'label.print', description: 'Create allowed label print jobs.' },
  { code: 'label.queue.manage', description: 'Retry, cancel, reassign, and reprint queued label jobs.' },
  { code: 'label.template.manage', description: 'Create and manage label templates.' },
  { code: 'label.manage', description: 'Legacy broad label management permission for administrators only.' },
  { code: 'exception.read', description: 'Read WMS exceptions.' },
  { code: 'exception.manage', description: 'Create and update WMS exceptions.' },
  { code: 'realtime.read', description: 'Subscribe to realtime warehouse events.' },
  { code: 'analytics.read', description: 'Read warehouse analytics snapshots.' },
  { code: 'notification.read', description: 'Read warehouse notifications.' },
  { code: 'notification.manage', description: 'Create and update warehouse notifications.' },
  { code: 'decision-support.use', description: 'Use local rule-based decision support endpoints.' },
  { code: 'integration.read', description: 'Read integration endpoint configuration.' },
  { code: 'integration.manage', description: 'Create and update integration endpoints.' },
  { code: 'idempotency.read', description: 'Read idempotency processing records.' },
  { code: 'idempotency.manage', description: 'Create idempotency processing records.' },
  { code: 'outbox.read', description: 'Read pending outbox events.' },
  { code: 'outbox.manage', description: 'Dispatch and retry outbox events.' },
  { code: 'inbox.read', description: 'Read idempotent inbound integration events.' },
  { code: 'inbox.manage', description: 'Receive and mark inbound integration events.' },
  { code: 'rf.read', description: 'Read RF scanner workflow sessions.' },
  { code: 'rf.manage', description: 'Run RF scanner workflow sessions and task exceptions.' },
  { code: 'cycle-count.read', description: 'Read cycle count plans and tasks.' },
  { code: 'cycle-count.manage', description: 'Create, release, submit, and approve cycle counts.' },
  { code: 'replenishment.read', description: 'Read replenishment rules and demands.' },
  {
    code: 'replenishment.manage',
    description: 'Create replenishment rules, evaluate demand, and confirm replenishment tasks.',
  },
  { code: 'packing.read', description: 'Read packing stations.' },
  { code: 'packing.manage', description: 'Create and manage packing stations.' },
  { code: 'shipment.read', description: 'Read shipments and packages.' },
  { code: 'shipment.manage', description: 'Create, stage, and ship warehouse shipments.' },
  { code: 'carrier.read', description: 'Read carrier adapter profiles and tracking events.' },
  {
    code: 'carrier.manage',
    description: 'Create labels, void labels, close manifests, and sync tracking.',
  },
  { code: 'wave.read', description: 'Read pick waves, carts, totes, and wave task plans.' },
  { code: 'wave.manage', description: 'Create, release, assign, and complete pick waves.' },
  {
    code: 'control-tower.read',
    description: 'Read operational control tower snapshots and risks.',
  },
  { code: 'slotting.read', description: 'Read SKU velocity, slotting rules, and recommendations.' },
  {
    code: 'slotting.manage',
    description: 'Manage slotting rules, velocity scoring, and recommendations.',
  },
  {
    code: 'client.read',
    description: 'Read 3PL clients, client warehouse links, and SKU aliases.',
  },
  {
    code: 'client.manage',
    description: 'Create and manage 3PL clients, ownership links, and SKU aliases.',
  },
  {
    code: 'billing.read',
    description: 'Read client billing event ledgers, invoices, exports, and billing summaries.',
  },
  {
    code: 'billing.manage',
    description:
      'Create, generate, invoice, finalize, void, and export client billing ledger events.',
  },
  { code: 'metrics.read', description: 'Read WMS business metrics.' },
  { code: 'integrity.read', description: 'Read warehouse integrity and invariant checks.' },
  { code: 'workflow.read', description: 'Read and validate WMS workflow transition rules.' },
  {
    code: 'automation.read',
    description: 'Read automation devices, WCS commands, and device events.',
  },
  {
    code: 'automation.manage',
    description: 'Register automation devices and manage WCS command queues.',
  },
  { code: 'yard.read', description: 'Read dock doors, trailer yard state, and dock appointments.' },
  {
    code: 'yard.manage',
    description: 'Schedule dock appointments, check in trailers, and assign dock doors.',
  },
  { code: 'cross-dock.read', description: 'Read cross-dock plans and flow-through opportunities.' },
  { code: 'cross-dock.manage', description: 'Create, release, and progress cross-dock plans.' },
  { code: 'vas.read', description: 'Read VAS service catalog, kit BOMs, and VAS work tasks.' },
  {
    code: 'vas.manage',
    description: 'Manage VAS services, kitting BOMs, and value-added work tasks.',
  },
  { code: 'job.read', description: 'Read background job health.' },
  { code: 'job.manage', description: 'Run background jobs and operational maintenance tasks.' },
  { code: 'user.read', description: 'Read users and role assignments.' },
  { code: 'user.manage', description: 'Manage users, roles, and permissions.' },
  { code: 'audit.read', description: 'Read audit logs.' },
  {
    code: 'tenant.rls.disable',
    description: 'Bypass tenant RLS for trusted platform administration paths.',
  },
];

async function runSeed() {
  const warehouse = await seedDb.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      code: 'MAIN',
      name: 'Main Warehouse',
      timezone: 'Europe/Prague',
    },
  });

  const receivingDock = await seedDb.warehouseLocation.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'RCV-01',
      },
    },
    update: {},
    create: {
      warehouseId: warehouse.id,
      code: 'RCV-01',
      name: 'Receiving Dock 01',
      type: 'RECEIVING',
      zone: 'INBOUND',
    },
  });

  const storageAisle = await seedDb.warehouseLocation.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'A-01',
      },
    },
    update: {},
    create: {
      warehouseId: warehouse.id,
      code: 'A-01',
      name: 'Storage Aisle A-01',
      type: 'STORAGE',
      zone: 'STORAGE-A',
    },
  });

  const parcelOne = await seedDb.parcel.upsert({
    where: {
      warehouseId_trackingNumber: {
        warehouseId: warehouse.id,
        trackingNumber: 'PKG-100001',
      },
    },
    update: {
      currentLocationId: storageAisle.id,
      status: 'STORED',
    },
    create: {
      warehouseId: warehouse.id,
      currentLocationId: storageAisle.id,
      trackingNumber: 'PKG-100001',
      status: 'STORED',
      externalReference: 'ERP-100001',
      customerReference: 'CUST-100001',
      recipientName: 'Jane Receiver',
      carrier: 'CARRIER_A',
      serviceLevel: 'STANDARD',
      weightGrams: 1250,
      metadata: {
        source: 'seed',
      },
    },
  });

  const parcelTwo = await seedDb.parcel.upsert({
    where: {
      warehouseId_trackingNumber: {
        warehouseId: warehouse.id,
        trackingNumber: 'PKG-100002',
      },
    },
    update: {
      currentLocationId: storageAisle.id,
      status: 'RECEIVED',
    },
    create: {
      warehouseId: warehouse.id,
      currentLocationId: storageAisle.id,
      trackingNumber: 'PKG-100002',
      status: 'RECEIVED',
      externalReference: 'ERP-100002',
      customerReference: 'CUST-100002',
      recipientName: 'John Receiver',
      carrier: 'INTERNAL',
      serviceLevel: 'EXPRESS',
      weightGrams: 840,
      metadata: {
        source: 'seed',
      },
    },
  });

  const storageBin = await seedDb.warehouseLocation.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'A-01-01',
      },
    },
    update: {
      parentId: storageAisle.id,
    },
    create: {
      warehouseId: warehouse.id,
      parentId: storageAisle.id,
      code: 'A-01-01',
      name: 'Storage Aisle A-01 Shelf 01',
      type: 'STORAGE',
      zone: 'STORAGE-A',
    },
  });

  const packingStation = await seedDb.warehouseLocation.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'PACK-01',
      },
    },
    update: {},
    create: {
      warehouseId: warehouse.id,
      code: 'PACK-01',
      name: 'Packing Station 01',
      type: 'PACKING',
      zone: 'PACKING',
    },
  });

  await seedDb.packingStation.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'PACK-01',
      },
    },
    update: {
      locationId: packingStation.id,
      status: 'ACTIVE',
    },
    create: {
      warehouseId: warehouse.id,
      locationId: packingStation.id,
      code: 'PACK-01',
      name: 'Packing Station 01',
      status: 'ACTIVE',
      metadata: {
        source: 'seed',
      },
    },
  });

  await seedDb.warehouseLocation.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'SHIP-01',
      },
    },
    update: {},
    create: {
      warehouseId: warehouse.id,
      code: 'SHIP-01',
      name: 'Shipping Dock 01',
      type: 'SHIPPING',
      zone: 'OUTBOUND',
    },
  });

  const quarantineLocation = await seedDb.warehouseLocation.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'QUAR-01',
      },
    },
    update: {},
    create: {
      warehouseId: warehouse.id,
      code: 'QUAR-01',
      name: 'Quarantine 01',
      type: 'QUARANTINE',
      zone: 'QUALITY',
    },
  });

  for (const permission of permissions) {
    await seedDb.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: permission,
    });
  }

  const adminRole = await seedDb.role.upsert({
    where: { code: 'WMS_ADMIN' },
    update: {
      name: 'Správce systému',
      description: 'Plný systémový přístup k uživatelům, rolím, skladům, integracím a administraci.',
    },
    create: {
      code: 'WMS_ADMIN',
      name: 'Správce systému',
      description: 'Plný systémový přístup k uživatelům, rolím, skladům, integracím a administraci.',
    },
  });

  const allPermissions = await seedDb.permission.findMany({
    where: {
      code: { in: permissions.map((permission) => permission.code) },
    },
  });

  const permissionByCode = new Map(allPermissions.map((permission) => [permission.code, permission.id]));

  async function syncRolePermissions(roleId: string, permissionCodes: string[]): Promise<void> {
    const rows = permissionCodes
      .map((code) => {
        const permissionId = permissionByCode.get(code);
        return permissionId ? { roleId, permissionId } : null;
      })
      .filter((row): row is { roleId: string; permissionId: string } => row !== null);

    const syncedPermissionIds = rows.map((row) => row.permissionId);

    await seedDb.rolePermission.deleteMany({
      where: {
        roleId,
        ...(syncedPermissionIds.length > 0 ? { permissionId: { notIn: syncedPermissionIds } } : {}),
      },
    });

    if (rows.length > 0) {
      await seedDb.rolePermission.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
  }

  await syncRolePermissions(adminRole.id, permissions.map((permission) => permission.code));

  const roleTemplates = [
    {
      code: 'WAREHOUSE_WORKER',
      name: 'Skladník',
      description: 'Pracovní role pro běžnou skladovou práci: RF skenování, příjem, úkoly, balení a základní zásoby.',
      permissionCodes: [
        'warehouse.read', 'product.read', 'inbound.read', 'inbound.manage', 'inventory.read', 'inventory.move',
        'outbound.read', 'task.read', 'task.manage', 'packing.read', 'packing.manage',
        'shipment.read', 'shipment.manage', 'label.read', 'label.print', 'carrier.read',
        'rf.read', 'rf.manage', 'realtime.read',
      ],
    },
    {
      code: 'WAREHOUSE_MANAGER',
      name: 'Vedoucí skladu',
      description: 'Provozní role pro řízení skladu, výjimek, vln, kapacity lidí a termínů.',
      permissionCodes: [
        'warehouse.read', 'product.read', 'inbound.read', 'inbound.manage', 'outbound.read', 'outbound.manage',
        'inventory.read', 'inventory.move', 'inventory.adjust', 'task.read', 'task.manage', 'wave.read', 'wave.manage',
        'packing.read', 'packing.manage', 'shipment.read', 'shipment.manage', 'carrier.read',
        'carrier.manage', 'label.read', 'label.print', 'label.queue.manage', 'control-tower.read', 'analytics.read',
        'exception.read', 'exception.manage', 'integration.read', 'scanner.read', 'scanner.manage',
        'rf.read', 'rf.manage', 'cycle-count.read', 'cycle-count.manage', 'integrity.read', 'realtime.read',
      ],
    },
  ];

  for (const template of roleTemplates) {
    const role = await seedDb.role.upsert({
      where: { code: template.code },
      update: { name: template.name, description: template.description },
      create: { code: template.code, name: template.name, description: template.description },
    });

    await syncRolePermissions(role.id, template.permissionCodes);
  }

  const workerRole = await seedDb.role.findUnique({ where: { code: 'WAREHOUSE_WORKER' } });
  const managerRole = await seedDb.role.findUnique({ where: { code: 'WAREHOUSE_MANAGER' } });

  if (!workerRole || !managerRole) {
    throw new Error('Required warehouse roles were not seeded.');
  }

  const adminPasswordHash = await hash(adminInitialPassword);
  const existingAdminUser = await seedDb.user.findUnique({
    where: { email: 'admin@example.com' },
  });
  const adminUser = existingAdminUser
    ? await seedDb.user.update({
        where: { id: existingAdminUser.id },
        data: {
          displayName: 'Správce systému',
          ...(existingAdminUser.passwordHash ? {} : { passwordHash: adminPasswordHash }),
        },
      })
    : await seedDb.user.create({
        data: {
          email: 'admin@example.com',
          displayName: 'Správce systému',
          passwordHash: adminPasswordHash,
        },
      });

  if (!existingAdminUser) {
    await seedDb.auditLog.create({
      data: {
        actorUserId: adminUser.id,
        warehouseId: warehouse.id,
        action: 'user.created',
        resourceType: 'user',
        resourceId: adminUser.id,
        metadata: {
          email: adminUser.email,
          source: 'seed',
        },
      },
    });
  }

  await seedDb.userRole.upsert({
    where: {
      userId_roleId_warehouseId: {
        userId: adminUser.id,
        roleId: adminRole.id,
        warehouseId: warehouse.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      warehouseId: warehouse.id,
    },
  });

  if (nodeEnv !== 'production') {
    const localMcpUsers = [
      {
        email: 'mcp-skladnik@aardvarkland.local',
        displayName: 'MCP Skladník',
        roleId: workerRole.id,
      },
      {
        email: 'mcp-vedouci@aardvarkland.local',
        displayName: 'MCP Vedoucí',
        roleId: managerRole.id,
      },
      {
        email: 'mcp-vedouci-shift@aardvarkland.local',
        displayName: 'MCP Vedoucí směny',
        roleId: managerRole.id,
      },
      {
        email: 'mcp-spravce@aardvarkland.local',
        displayName: 'MCP Správce',
        roleId: adminRole.id,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        email: `mcp-skladnik-${String(index + 1).padStart(2, '0')}@aardvarkland.local`,
        displayName: `MCP Skladník ${String(index + 1).padStart(2, '0')}`,
        roleId: workerRole.id,
      })),
    ];

    for (const localMcpUser of localMcpUsers) {
      const user = await seedDb.user.upsert({
        where: { email: localMcpUser.email },
        update: {
          displayName: localMcpUser.displayName,
          passwordHash: await hash('Mcp-Local-42!'),
          status: 'ACTIVE',
        },
        create: {
          email: localMcpUser.email,
          displayName: localMcpUser.displayName,
          passwordHash: await hash('Mcp-Local-42!'),
          status: 'ACTIVE',
        },
      });

      await seedDb.userRole.upsert({
        where: {
          userId_roleId_warehouseId: {
            userId: user.id,
            roleId: localMcpUser.roleId,
            warehouseId: warehouse.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: localMcpUser.roleId,
          warehouseId: warehouse.id,
        },
      });
    }
  }

  let workflowUser = adminUser;

  if (seedDemoOperatorUser) {
    const demoOperatorUser = await seedDb.user.upsert({
      where: { email: demoOperatorEmail.trim().toLowerCase() },
      update: {
        displayName: 'Demo Operator',
        passwordHash: await hash(demoOperatorPassword),
      },
      create: {
        email: demoOperatorEmail.trim().toLowerCase(),
        displayName: 'Demo Operator',
        passwordHash: await hash(demoOperatorPassword),
      },
    });

    await seedDb.userRole.upsert({
      where: {
        userId_roleId_warehouseId: {
          userId: demoOperatorUser.id,
          roleId: adminRole.id,
          warehouseId: warehouse.id,
        },
      },
      update: {},
      create: {
        userId: demoOperatorUser.id,
        roleId: adminRole.id,
        warehouseId: warehouse.id,
      },
    });
    workflowUser = demoOperatorUser;
  }

  const coreProduct = await seedDb.product.upsert({
    where: { code: 'PROD-ABC-123' },
    update: {
      name: 'Demo product ABC',
      description: 'Seed product for core WMS inventory flow.',
      status: 'ACTIVE',
      metadata: { source: 'seed' },
    },
    create: {
      code: 'PROD-ABC-123',
      name: 'Demo product ABC',
      description: 'Seed product for core WMS inventory flow.',
      status: 'ACTIVE',
      metadata: { source: 'seed' },
    },
  });

  const coreSku = await seedDb.sku.upsert({
    where: { code: 'ABC-123' },
    update: {
      productId: coreProduct.id,
      name: 'ABC-123 Each',
      barcode: '8590000001234',
      uom: 'EA',
      weightGrams: 250,
      status: 'ACTIVE',
      metadata: { source: 'seed' },
    },
    create: {
      productId: coreProduct.id,
      code: 'ABC-123',
      name: 'ABC-123 Each',
      barcode: '8590000001234',
      uom: 'EA',
      weightGrams: 250,
      status: 'ACTIVE',
      metadata: { source: 'seed' },
    },
  });

  const handlingUnit = await seedDb.handlingUnit.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'HU-100001',
      },
    },
    update: {
      currentLocationId: storageBin.id,
      type: 'PALLET',
      status: 'OPEN',
      metadata: { source: 'seed' },
    },
    create: {
      warehouseId: warehouse.id,
      currentLocationId: storageBin.id,
      code: 'HU-100001',
      type: 'PALLET',
      status: 'OPEN',
      metadata: { source: 'seed' },
    },
  });

  const stockExpiry = new Date('2027-01-01T00:00:00.000Z');
  const existingCoreQuant = await seedDb.stockQuant.findFirst({
    where: {
      warehouseId: warehouse.id,
      skuId: coreSku.id,
      locationId: storageBin.id,
      status: 'AVAILABLE',
      batch: 'LOT-2026-05',
      expiryDate: stockExpiry,
    },
  });
  const coreQuant = existingCoreQuant
    ? await seedDb.stockQuant.update({
        where: { id: existingCoreQuant.id },
        data: {
          handlingUnitId: handlingUnit.id,
          quantity: 48,
          reservedQuantity: 0,
          externalReference: 'SEED-STOCK-ABC-123',
          metadata: { source: 'seed' },
        },
      })
    : await seedDb.stockQuant.create({
        data: {
          warehouseId: warehouse.id,
          locationId: storageBin.id,
          skuId: coreSku.id,
          handlingUnitId: handlingUnit.id,
          quantity: 48,
          reservedQuantity: 0,
          status: 'AVAILABLE',
          batch: 'LOT-2026-05',
          expiryDate: stockExpiry,
          externalReference: 'SEED-STOCK-ABC-123',
          metadata: { source: 'seed' },
        },
      });

  await seedDb.stockMovement.upsert({
    where: {
      sourceSystem_idempotencyKey: {
        sourceSystem: 'SEED',
        idempotencyKey: 'seed-receive-abc-123',
      },
    },
    update: {
      warehouseId: warehouse.id,
      skuId: coreSku.id,
      stockQuantId: coreQuant.id,
      actorUserId: workflowUser.id,
      type: 'RECEIVE',
      quantity: 48,
      toLocationId: storageBin.id,
      referenceType: 'seed',
      referenceId: 'SEED-STOCK-ABC-123',
      metadata: { source: 'seed', quantityDelta: 48 },
    },
    create: {
      warehouseId: warehouse.id,
      skuId: coreSku.id,
      stockQuantId: coreQuant.id,
      actorUserId: workflowUser.id,
      type: 'RECEIVE',
      quantity: 48,
      toLocationId: storageBin.id,
      referenceType: 'seed',
      referenceId: 'SEED-STOCK-ABC-123',
      sourceSystem: 'SEED',
      idempotencyKey: 'seed-receive-abc-123',
      metadata: { source: 'seed', quantityDelta: 48 },
    },
  });

  const existingPickTask = await seedDb.warehouseTask.findFirst({
    where: {
      warehouseId: warehouse.id,
      type: 'PICK',
      status: 'OPEN',
      skuId: coreSku.id,
      outboundOrderId: null,
    },
  });

  if (existingPickTask) {
    await seedDb.warehouseTask.update({
      where: { id: existingPickTask.id },
      data: {
        fromLocationId: storageBin.id,
        toLocationId: packingStation.id,
        assignedUserId: workflowUser.id,
        handlingUnitId: handlingUnit.id,
        quantity: 5,
        metadata: { source: 'seed', demo: true },
      },
    });
  } else {
    await seedDb.warehouseTask.create({
      data: {
        warehouseId: warehouse.id,
        type: 'PICK',
        status: 'OPEN',
        skuId: coreSku.id,
        fromLocationId: storageBin.id,
        toLocationId: packingStation.id,
        assignedUserId: workflowUser.id,
        handlingUnitId: handlingUnit.id,
        quantity: 5,
        metadata: { source: 'seed', demo: true },
      },
    });
  }

  const existingSeedOutboxEvent = await seedDb.outboxEvent.findFirst({
    where: {
      type: 'STOCK_SEEDED',
      aggregateType: 'stock_quant',
      aggregateId: coreQuant.id,
    },
  });

  if (!existingSeedOutboxEvent) {
    await seedDb.outboxEvent.create({
      data: {
        type: 'STOCK_SEEDED',
        aggregateType: 'stock_quant',
        aggregateId: coreQuant.id,
        payload: {
          warehouseCode: warehouse.code,
          sku: coreSku.code,
          quantity: coreQuant.quantity,
          source: 'seed',
        },
      },
    });
  }

  await seedDb.trackingEvent.upsert({
    where: {
      id:
        (
          await seedDb.trackingEvent.findFirst({
            where: {
              warehouseId: warehouse.id,
              parcelId: parcelOne.id,
              type: 'RECEIVED',
              message: 'Parcel received at RCV-01',
            },
            select: { id: true },
          })
        )?.id ?? '00000000-0000-0000-0000-000000000000',
    },
    update: {
      locationId: receivingDock.id,
      actorUserId: workflowUser.id,
    },
    create: {
      warehouseId: warehouse.id,
      parcelId: parcelOne.id,
      locationId: receivingDock.id,
      actorUserId: workflowUser.id,
      type: 'RECEIVED',
      message: 'Parcel received at RCV-01',
      metadata: { source: 'seed' },
    },
  });

  await seedDb.trackingEvent.upsert({
    where: {
      id:
        (
          await seedDb.trackingEvent.findFirst({
            where: {
              warehouseId: warehouse.id,
              parcelId: parcelOne.id,
              type: 'MOVED',
              message: 'Parcel moved to A-01',
            },
            select: { id: true },
          })
        )?.id ?? '00000000-0000-0000-0000-000000000001',
    },
    update: {
      locationId: storageAisle.id,
      actorUserId: workflowUser.id,
    },
    create: {
      warehouseId: warehouse.id,
      parcelId: parcelOne.id,
      locationId: storageAisle.id,
      actorUserId: workflowUser.id,
      type: 'MOVED',
      message: 'Parcel moved to A-01',
      metadata: { source: 'seed' },
    },
  });

  const seededException = await seedDb.wmsException.findFirst({
    where: {
      warehouseId: warehouse.id,
      parcelId: parcelOne.id,
      code: 'DAMAGED_LABEL',
    },
  });

  if (seededException) {
    await seedDb.wmsException.update({
      where: { id: seededException.id },
      data: {
        locationId: quarantineLocation.id,
        createdByUserId: workflowUser.id,
        status: 'OPEN',
        severity: 'HIGH',
        title: 'Damaged label detected',
        description: 'Parcel label is partially unreadable and needs reprint.',
        metadata: { source: 'seed' },
      },
    });
  } else {
    await seedDb.wmsException.create({
      data: {
        warehouseId: warehouse.id,
        parcelId: parcelOne.id,
        locationId: quarantineLocation.id,
        createdByUserId: workflowUser.id,
        code: 'DAMAGED_LABEL',
        title: 'Damaged label detected',
        description: 'Parcel label is partially unreadable and needs reprint.',
        status: 'OPEN',
        severity: 'HIGH',
        metadata: { source: 'seed' },
      },
    });
  }

  const inboundShipment = await seedDb.inboundShipment.upsert({
    where: {
      warehouseId_shipmentNumber: {
        warehouseId: warehouse.id,
        shipmentNumber: 'ASN-100001',
      },
    },
    update: {
      status: 'RECEIVING',
      supplierName: 'Supplier CZ s.r.o.',
      supplierReference: 'SUP-CZ-001',
      purchaseOrderReference: 'PO-2026-00042',
      externalReference: 'ERP-IN-100001',
      dockLocationId: receivingDock.id,
      expectedAt: new Date('2026-05-10T08:00:00.000Z'),
      appointmentStartAt: new Date('2026-05-10T07:45:00.000Z'),
      appointmentEndAt: new Date('2026-05-10T08:30:00.000Z'),
      metadata: { source: 'seed' },
    },
    create: {
      warehouseId: warehouse.id,
      dockLocationId: receivingDock.id,
      shipmentNumber: 'ASN-100001',
      status: 'RECEIVING',
      supplierName: 'Supplier CZ s.r.o.',
      supplierReference: 'SUP-CZ-001',
      purchaseOrderReference: 'PO-2026-00042',
      externalReference: 'ERP-IN-100001',
      expectedAt: new Date('2026-05-10T08:00:00.000Z'),
      appointmentStartAt: new Date('2026-05-10T07:45:00.000Z'),
      appointmentEndAt: new Date('2026-05-10T08:30:00.000Z'),
      metadata: { source: 'seed' },
    },
  });

  await seedDb.inboundShipmentLine.upsert({
    where: {
      shipmentId_lineNumber: {
        shipmentId: inboundShipment.id,
        lineNumber: '1',
      },
    },
    update: {
      sku: coreSku.code,
      description: 'Seed inbound SKU line',
      expectedQuantity: 48,
      receivedQuantity: 0,
      parcelId: parcelTwo.id,
      metadata: { source: 'seed' },
    },
    create: {
      shipmentId: inboundShipment.id,
      lineNumber: '1',
      sku: coreSku.code,
      description: 'Seed inbound SKU line',
      expectedQuantity: 48,
      receivedQuantity: 0,
      parcelId: parcelTwo.id,
      metadata: { source: 'seed' },
    },
  });

  const outboundOrder = await seedDb.outboundOrder.upsert({
    where: {
      warehouseId_orderNumber: {
        warehouseId: warehouse.id,
        orderNumber: 'SO-100001',
      },
    },
    update: {
      status: 'CREATED',
      customerReference: 'CUST-100001',
      recipientName: 'Jane Receiver',
      carrier: 'CARRIER_A',
      serviceLevel: 'STANDARD',
      shipBy: new Date('2026-05-11T14:00:00.000Z'),
      metadata: { source: 'seed' },
    },
    create: {
      warehouseId: warehouse.id,
      orderNumber: 'SO-100001',
      status: 'CREATED',
      customerReference: 'CUST-100001',
      recipientName: 'Jane Receiver',
      carrier: 'CARRIER_A',
      serviceLevel: 'STANDARD',
      shipBy: new Date('2026-05-11T14:00:00.000Z'),
      metadata: { source: 'seed' },
    },
  });

  await seedDb.outboundOrderLine.upsert({
    where: {
      orderId_lineNumber: {
        orderId: outboundOrder.id,
        lineNumber: '1',
      },
    },
    update: {
      sku: coreSku.code,
      description: 'Seed outbound SKU line',
      orderedQuantity: 5,
      pickedQuantity: 0,
      parcelId: parcelOne.id,
      metadata: { source: 'seed' },
    },
    create: {
      orderId: outboundOrder.id,
      lineNumber: '1',
      sku: coreSku.code,
      description: 'Seed outbound SKU line',
      orderedQuantity: 5,
      pickedQuantity: 0,
      parcelId: parcelOne.id,
      metadata: { source: 'seed' },
    },
  });

  await seedDb.scannerDevice.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'SCAN-01',
      },
    },
    update: {
      name: 'Receiving handheld 01',
      status: 'ACTIVE',
      assignedZone: 'INBOUND',
      metadata: { platform: 'android', appVersion: '0.1.0', source: 'seed' },
    },
    create: {
      warehouseId: warehouse.id,
      code: 'SCAN-01',
      name: 'Receiving handheld 01',
      status: 'ACTIVE',
      assignedZone: 'INBOUND',
      metadata: { platform: 'android', appVersion: '0.1.0', source: 'seed' },
    },
  });

  await seedDb.labelTemplate.upsert({
    where: {
      warehouseId_code: {
        warehouseId: warehouse.id,
        code: 'PARCEL-ZPL-DEFAULT',
      },
    },
    update: {
      name: 'Default parcel ZPL label',
      type: 'PARCEL',
      content: '^XA^FO40,40^A0N,40,40^FD{{trackingNumber}}^FS^XZ',
      isActive: true,
      metadata: { language: 'ZPL', size: '100x150mm', source: 'seed' },
    },
    create: {
      warehouseId: warehouse.id,
      code: 'PARCEL-ZPL-DEFAULT',
      name: 'Default parcel ZPL label',
      type: 'PARCEL',
      content: '^XA^FO40,40^A0N,40,40^FD{{trackingNumber}}^FS^XZ',
      isActive: true,
      metadata: { language: 'ZPL', size: '100x150mm', source: 'seed' },
    },
  });

  const existingNotification = await seedDb.notification.findFirst({
    where: {
      warehouseId: warehouse.id,
      title: 'Demo WMS task',
    },
  });

  if (existingNotification) {
    await seedDb.notification.update({
      where: { id: existingNotification.id },
      data: {
        userId: workflowUser.id,
        type: 'TASK',
        status: 'UNREAD',
        message: 'Review the damaged label exception before shipping.',
        metadata: { source: 'seed' },
      },
    });
  } else {
    await seedDb.notification.create({
      data: {
        warehouseId: warehouse.id,
        userId: workflowUser.id,
        type: 'TASK',
        status: 'UNREAD',
        title: 'Demo WMS task',
        message: 'Review the damaged label exception before shipping.',
        metadata: { source: 'seed' },
      },
    });
  }

  await seedDb.integrationEndpoint.upsert({
    where: { code: 'ERP_MAIN' },
    update: {
      name: 'Main ERP',
      type: 'ERP',
      baseUrl: 'https://erp.example.local/api',
      authType: 'API_KEY',
      status: 'INACTIVE',
      config: { timeoutMs: 5000, owner: 'ops', source: 'seed' },
    },
    create: {
      code: 'ERP_MAIN',
      name: 'Main ERP',
      type: 'ERP',
      baseUrl: 'https://erp.example.local/api',
      authType: 'API_KEY',
      status: 'INACTIVE',
      config: { timeoutMs: 5000, owner: 'ops', source: 'seed' },
    },
  });

  await seedDb.auditLog.create({
    data: {
      actorUserId: adminUser.id,
      warehouseId: warehouse.id,
      action: 'seed.initialized',
      resourceType: 'system',
      metadata: {
        roles: ['WAREHOUSE_WORKER', 'WAREHOUSE_MANAGER', 'WMS_ADMIN'],
        permissions: permissions.map((permission) => permission.code),
      },
    },
  });
}

async function main() {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SELECT set_config('app.rls_disabled', '1', true)");
      const previousSeedDb = seedDb;
      seedDb = tx as typeof prisma;

      try {
        await runSeed();
      } finally {
        seedDb = previousSeedDb;
      }
    },
    { timeout: 300000 },
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
