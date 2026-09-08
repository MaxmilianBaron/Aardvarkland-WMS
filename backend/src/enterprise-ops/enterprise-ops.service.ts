import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import {
  AssignDockDoorDto,
  AutomationHeartbeatDto,
  CompleteAutomationCommandDto,
  ConfirmVasTaskDto,
  CreateCrossDockPlanDto,
  CreateDockDoorDto,
  CreateKitBomDto,
  CreateVasServiceDto,
  CreateVasTaskDto,
  CreateWebhookSubscriptionDto,
  EnqueueAutomationCommandDto,
  RecordDomainEventDto,
  RegisterAutomationDeviceDto,
  ScheduleDockAppointmentDto,
  YardTrailerCheckInDto,
} from './dto/enterprise-ops.dto';
import {
  buildDomainEventKey,
  nextAutomationCommandStatus,
  nextCrossDockPlanStatus,
  nextDockAppointmentStatus,
  nextVasTaskStatus,
  nextYardTrailerStatus,
  normalizeEnterpriseCode,
} from './enterprise-ops.helpers';
import {
  AutomationCommandResponse,
  AutomationCommandStatus,
  AutomationDeviceResponse,
  AutomationDeviceStatus,
  CrossDockPlanResponse,
  DockAppointmentResponse,
  DockDoorResponse,
  DomainEventResponse,
  VasServiceResponse,
  KitBomResponse,
  VasTaskResponse,
  WebhookDeliveryAttemptResponse,
  WebhookSubscriptionResponse,
  YardTrailerResponse,
} from './enterprise-ops.types';

type SqlClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

@Injectable()
export class EnterpriseOpsService {
  constructor(private readonly prisma: PrismaService) {}

  listAutomationDevices(warehouseId: string): Promise<AutomationDeviceResponse[]> {
    return this.withTenant(async (client) => {
      const rows = await this.query<AutomationDeviceRow>(
        client,
        `SELECT * FROM automation_devices WHERE warehouse_id = $1::uuid ORDER BY code ASC`,
        warehouseId,
      );
      return rows.map(toAutomationDeviceResponse);
    });
  }

  registerAutomationDevice(
    warehouseId: string,
    dto: RegisterAutomationDeviceDto,
    actor: AuthenticatedUser,
  ): Promise<AutomationDeviceResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<AutomationDeviceRow>(
        client,
        `INSERT INTO automation_devices
          (warehouse_id, owner_client_id, code, device_type, status, zone, capabilities, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
         ON CONFLICT (warehouse_id, code) DO UPDATE SET
           owner_client_id = EXCLUDED.owner_client_id,
           device_type = EXCLUDED.device_type,
           status = EXCLUDED.status,
           zone = EXCLUDED.zone,
           capabilities = EXCLUDED.capabilities,
           metadata = EXCLUDED.metadata,
           updated_at = now()
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        normalizeEnterpriseCode(dto.code),
        normalizeEnterpriseCode(dto.deviceType),
        normalizeEnterpriseCode(dto.status ?? AutomationDeviceStatus.ACTIVE),
        nullable(dto.zone),
        json(dto.capabilities ?? {}),
        json(dto.metadata ?? {}),
      );
      const device = requiredRow(rows, 'Automation device was not saved.');
      await this.writeAudit(
        client,
        actor,
        'automation_device.upserted',
        'automation_device',
        device.id,
        warehouseId,
        dto.ownerClientId ?? null,
        {
          code: device.code,
          deviceType: device.device_type,
        },
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: device.owner_client_id,
        eventType: 'automation.device.upserted',
        resourceType: 'automation_device',
        resourceId: device.id,
        payload: { code: device.code, deviceType: device.device_type, status: device.status },
      });
      return toAutomationDeviceResponse(device);
    });
  }

  recordAutomationHeartbeat(
    warehouseId: string,
    deviceId: string,
    dto: AutomationHeartbeatDto,
  ): Promise<AutomationDeviceResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<AutomationDeviceRow>(
        client,
        `UPDATE automation_devices SET
           status = COALESCE($1, status),
           last_heartbeat_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
         WHERE id = $3::uuid AND warehouse_id = $4::uuid
         RETURNING *`,
        dto.status ? normalizeEnterpriseCode(dto.status) : null,
        json({ heartbeatTelemetry: dto.telemetry ?? {}, heartbeatAt: new Date().toISOString() }),
        deviceId,
        warehouseId,
      );
      const device = requiredRow(rows, 'Automation device was not found.');
      await this.recordAutomationEvent(client, {
        warehouseId,
        ownerClientId: device.owner_client_id,
        deviceId: device.id,
        eventType: 'HEARTBEAT',
        severity: 'INFO',
        payload: dto.telemetry ?? {},
      });
      return toAutomationDeviceResponse(device);
    });
  }

  enqueueAutomationCommand(
    warehouseId: string,
    dto: EnqueueAutomationCommandDto,
    actor: AuthenticatedUser,
  ): Promise<AutomationCommandResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<AutomationCommandRow>(
        client,
        `INSERT INTO automation_commands
          (warehouse_id, owner_client_id, device_id, command_type, status, priority, correlation_id, payload, not_before_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'QUEUED', $5, $6, $7::jsonb, $8::timestamptz)
         ON CONFLICT (correlation_id) WHERE correlation_id IS NOT NULL DO UPDATE SET
           payload = EXCLUDED.payload,
           priority = GREATEST(automation_commands.priority, EXCLUDED.priority),
           updated_at = now()
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        dto.deviceId ?? null,
        normalizeEnterpriseCode(dto.commandType),
        dto.priority ?? 50,
        nullable(dto.correlationId),
        json(dto.payload ?? {}),
        dto.notBeforeAt ? new Date(dto.notBeforeAt) : null,
      );
      const command = requiredRow(rows, 'Automation command was not queued.');
      await this.writeAudit(
        client,
        actor,
        'automation_command.queued',
        'automation_command',
        command.id,
        warehouseId,
        command.owner_client_id,
        {
          commandType: command.command_type,
          correlationId: command.correlation_id,
        },
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: command.owner_client_id,
        eventType: 'automation.command.queued',
        resourceType: 'automation_command',
        resourceId: command.id,
        payload: {
          commandType: command.command_type,
          deviceId: command.device_id,
          priority: command.priority,
        },
      });
      return toAutomationCommandResponse(command);
    });
  }

  claimNextAutomationCommand(
    warehouseId: string,
    deviceId?: string,
  ): Promise<AutomationCommandResponse | null> {
    return this.withTenant(async (client) => {
      const rows = await this.query<AutomationCommandRow>(
        client,
        `WITH next_command AS (
           SELECT id FROM automation_commands
           WHERE warehouse_id = $1::uuid
             AND status IN ('QUEUED', 'FAILED')
             AND ($2::uuid IS NULL OR device_id = $2::uuid OR device_id IS NULL)
             AND (not_before_at IS NULL OR not_before_at <= now())
           ORDER BY priority DESC, created_at ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE automation_commands SET
           status = 'CLAIMED',
           device_id = COALESCE(device_id, $2::uuid),
           attempts = attempts + 1,
           claimed_at = now(),
           updated_at = now()
         WHERE id IN (SELECT id FROM next_command)
         RETURNING *`,
        warehouseId,
        deviceId ?? null,
      );
      const command = rows[0];
      if (!command) return null;
      await this.recordAutomationEvent(client, {
        warehouseId,
        ownerClientId: command.owner_client_id,
        deviceId: command.device_id,
        commandId: command.id,
        eventType: 'COMMAND_CLAIMED',
        severity: 'INFO',
        payload: { commandType: command.command_type, attempts: command.attempts },
      });
      return toAutomationCommandResponse(command);
    });
  }

  completeAutomationCommand(
    warehouseId: string,
    commandId: string,
    dto: CompleteAutomationCommandDto,
  ): Promise<AutomationCommandResponse> {
    return this.withTenant(async (client) => {
      const existing = await this.findAutomationCommand(client, warehouseId, commandId);
      const status = dto.errorMessage
        ? nextAutomationCommandStatus({
            current: existing.status as AutomationCommandStatus,
            action: 'FAIL',
          })
        : nextAutomationCommandStatus({
            current: existing.status as AutomationCommandStatus,
            action: 'COMPLETE',
          });
      const rows = await this.query<AutomationCommandRow>(
        client,
        `UPDATE automation_commands SET
           status = $1,
           completed_at = CASE WHEN $1 = 'COMPLETED' THEN now() ELSE completed_at END,
           error_message = $2,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
         WHERE id = $4::uuid AND warehouse_id = $5::uuid
         RETURNING *`,
        status,
        dto.errorMessage ?? null,
        json({ result: dto.result ?? null }),
        commandId,
        warehouseId,
      );
      const command = requiredRow(rows, 'Automation command was not updated.');
      await this.recordAutomationEvent(client, {
        warehouseId,
        ownerClientId: command.owner_client_id,
        deviceId: command.device_id,
        commandId: command.id,
        eventType:
          status === AutomationCommandStatus.COMPLETED ? 'COMMAND_COMPLETED' : 'COMMAND_FAILED',
        severity: status === AutomationCommandStatus.COMPLETED ? 'INFO' : 'ERROR',
        payload: { result: dto.result ?? null, errorMessage: dto.errorMessage ?? null },
      });
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: command.owner_client_id,
        eventType:
          status === AutomationCommandStatus.COMPLETED
            ? 'automation.command.completed'
            : 'automation.command.failed',
        resourceType: 'automation_command',
        resourceId: command.id,
        payload: { status, result: dto.result ?? null, errorMessage: dto.errorMessage ?? null },
      });
      return toAutomationCommandResponse(command);
    });
  }

  listDockDoors(warehouseId: string): Promise<DockDoorResponse[]> {
    return this.withTenant(async (client) => {
      const rows = await this.query<DockDoorRow>(
        client,
        `SELECT * FROM dock_doors WHERE warehouse_id = $1::uuid ORDER BY code ASC`,
        warehouseId,
      );
      return rows.map(toDockDoorResponse);
    });
  }

  createDockDoor(
    warehouseId: string,
    dto: CreateDockDoorDto,
    actor: AuthenticatedUser,
  ): Promise<DockDoorResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<DockDoorRow>(
        client,
        `INSERT INTO dock_doors (warehouse_id, code, status, door_type, zone, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (warehouse_id, code) DO UPDATE SET
           status = EXCLUDED.status,
           door_type = EXCLUDED.door_type,
           zone = EXCLUDED.zone,
           metadata = EXCLUDED.metadata,
           updated_at = now()
         RETURNING *`,
        warehouseId,
        normalizeEnterpriseCode(dto.code),
        normalizeEnterpriseCode(dto.status ?? 'ACTIVE'),
        normalizeEnterpriseCode(dto.doorType ?? 'STANDARD'),
        nullable(dto.zone),
        json(dto.metadata ?? {}),
      );
      const dockDoor = requiredRow(rows, 'Dock door was not saved.');
      await this.writeAudit(
        client,
        actor,
        'dock_door.upserted',
        'dock_door',
        dockDoor.id,
        warehouseId,
        null,
        { code: dockDoor.code },
      );
      return toDockDoorResponse(dockDoor);
    });
  }

  scheduleDockAppointment(
    warehouseId: string,
    dto: ScheduleDockAppointmentDto,
    actor: AuthenticatedUser,
  ): Promise<DockAppointmentResponse> {
    return this.withTenant(async (client) => {
      assertDateWindow(dto.plannedStartAt, dto.plannedEndAt);
      const rows = await this.query<DockAppointmentRow>(
        client,
        `INSERT INTO dock_appointments
          (warehouse_id, owner_client_id, appointment_number, direction, status, planned_start_at, planned_end_at, dock_door_id, carrier, external_reference, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'SCHEDULED', $5::timestamptz, $6::timestamptz, $7::uuid, $8, $9, $10::jsonb)
         ON CONFLICT (warehouse_id, appointment_number) DO UPDATE SET
           owner_client_id = EXCLUDED.owner_client_id,
           direction = EXCLUDED.direction,
           planned_start_at = EXCLUDED.planned_start_at,
           planned_end_at = EXCLUDED.planned_end_at,
           dock_door_id = EXCLUDED.dock_door_id,
           carrier = EXCLUDED.carrier,
           external_reference = EXCLUDED.external_reference,
           metadata = EXCLUDED.metadata,
           updated_at = now()
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        normalizeEnterpriseCode(dto.appointmentNumber),
        dto.direction,
        new Date(dto.plannedStartAt),
        new Date(dto.plannedEndAt),
        dto.dockDoorId ?? null,
        nullable(dto.carrier),
        nullable(dto.externalReference),
        json(dto.metadata ?? {}),
      );
      const appointment = requiredRow(rows, 'Dock appointment was not scheduled.');
      await this.writeAudit(
        client,
        actor,
        'dock_appointment.scheduled',
        'dock_appointment',
        appointment.id,
        warehouseId,
        appointment.owner_client_id,
        {
          appointmentNumber: appointment.appointment_number,
        },
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: appointment.owner_client_id,
        eventType: 'yard.appointment.scheduled',
        resourceType: 'dock_appointment',
        resourceId: appointment.id,
        payload: { direction: appointment.direction, plannedStartAt: appointment.planned_start_at },
      });
      return toDockAppointmentResponse(appointment);
    });
  }

  checkInTrailer(
    warehouseId: string,
    dto: YardTrailerCheckInDto,
    actor: AuthenticatedUser,
  ): Promise<{ trailer: YardTrailerResponse; appointment: DockAppointmentResponse | null }> {
    return this.withTenant(async (client) => {
      const rows = await this.query<YardTrailerRow>(
        client,
        `INSERT INTO yard_trailers
          (warehouse_id, owner_client_id, trailer_number, carrier, status, dock_door_id, checked_in_at, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, now(), $7::jsonb)
         ON CONFLICT (warehouse_id, trailer_number) DO UPDATE SET
           owner_client_id = EXCLUDED.owner_client_id,
           carrier = COALESCE(EXCLUDED.carrier, yard_trailers.carrier),
           status = EXCLUDED.status,
           dock_door_id = COALESCE(EXCLUDED.dock_door_id, yard_trailers.dock_door_id),
           checked_in_at = COALESCE(yard_trailers.checked_in_at, now()),
           metadata = COALESCE(yard_trailers.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = now()
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        normalizeEnterpriseCode(dto.trailerNumber),
        nullable(dto.carrier),
        nextYardTrailerStatus('CHECK_IN'),
        dto.dockDoorId ?? null,
        json(dto.metadata ?? {}),
      );
      const trailer = requiredRow(rows, 'Trailer was not checked in.');
      let appointment: DockAppointmentRow | null = null;
      if (dto.appointmentId) {
        const appointmentRows = await this.query<DockAppointmentRow>(
          client,
          `UPDATE dock_appointments SET
             status = $1,
             trailer_id = $2::uuid,
             dock_door_id = COALESCE(dock_door_id, $3::uuid),
             updated_at = now()
           WHERE id = $4::uuid AND warehouse_id = $5::uuid
           RETURNING *`,
          nextDockAppointmentStatus('CHECK_IN'),
          trailer.id,
          dto.dockDoorId ?? null,
          dto.appointmentId,
          warehouseId,
        );
        appointment = appointmentRows[0] ?? null;
      }
      await this.writeAudit(
        client,
        actor,
        'yard_trailer.checked_in',
        'yard_trailer',
        trailer.id,
        warehouseId,
        trailer.owner_client_id,
        {
          trailerNumber: trailer.trailer_number,
        },
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: trailer.owner_client_id,
        eventType: 'yard.trailer.checked_in',
        resourceType: 'yard_trailer',
        resourceId: trailer.id,
        payload: { trailerNumber: trailer.trailer_number, appointmentId: appointment?.id ?? null },
      });
      return {
        trailer: toYardTrailerResponse(trailer),
        appointment: appointment ? toDockAppointmentResponse(appointment) : null,
      };
    });
  }

  assignDockDoor(
    warehouseId: string,
    appointmentId: string,
    dto: AssignDockDoorDto,
    actor: AuthenticatedUser,
  ): Promise<DockAppointmentResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<DockAppointmentRow>(
        client,
        `UPDATE dock_appointments SET
           dock_door_id = $1::uuid,
           trailer_id = COALESCE($2::uuid, trailer_id),
           status = $3,
           updated_at = now()
         WHERE id = $4::uuid AND warehouse_id = $5::uuid
         RETURNING *`,
        dto.dockDoorId,
        dto.trailerId ?? null,
        nextDockAppointmentStatus('ASSIGN_DOCK'),
        appointmentId,
        warehouseId,
      );
      const appointment = requiredRow(rows, 'Dock appointment was not found.');
      if (dto.trailerId) {
        await this.execute(
          client,
          `UPDATE yard_trailers SET status = $1, dock_door_id = $2::uuid, updated_at = now()
           WHERE id = $3::uuid AND warehouse_id = $4::uuid`,
          nextYardTrailerStatus('ASSIGN_DOCK'),
          dto.dockDoorId,
          dto.trailerId,
          warehouseId,
        );
      }
      await this.writeAudit(
        client,
        actor,
        'dock_appointment.dock_assigned',
        'dock_appointment',
        appointment.id,
        warehouseId,
        appointment.owner_client_id,
        {
          dockDoorId: dto.dockDoorId,
        },
      );
      return toDockAppointmentResponse(appointment);
    });
  }

  createCrossDockPlan(
    warehouseId: string,
    dto: CreateCrossDockPlanDto,
    actor: AuthenticatedUser,
  ): Promise<CrossDockPlanResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<CrossDockPlanRow>(
        client,
        `INSERT INTO cross_dock_plans
          (warehouse_id, owner_client_id, status, priority, inbound_shipment_id, outbound_order_id, reason_code, metadata)
         VALUES ($1::uuid, $2::uuid, 'PLANNED', $3, $4::uuid, $5::uuid, $6, $7::jsonb)
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        dto.priority ?? 50,
        dto.inboundShipmentId ?? null,
        dto.outboundOrderId ?? null,
        nullable(dto.reasonCode),
        json(dto.metadata ?? {}),
      );
      const plan = requiredRow(rows, 'Cross-dock plan was not created.');
      for (const line of dto.lines) {
        await this.execute(
          client,
          `INSERT INTO cross_dock_plan_lines
            (warehouse_id, owner_client_id, plan_id, sku_id, lot_id, expected_quantity, allocated_quantity, from_location_id, to_location_id, metadata)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 0, $7::uuid, $8::uuid, $9::jsonb)`,
          warehouseId,
          plan.owner_client_id,
          plan.id,
          line.skuId,
          line.lotId ?? null,
          line.quantity,
          line.fromLocationId ?? null,
          line.toLocationId ?? null,
          json(line.metadata ?? {}),
        );
      }
      await this.writeAudit(
        client,
        actor,
        'cross_dock_plan.created',
        'cross_dock_plan',
        plan.id,
        warehouseId,
        plan.owner_client_id,
        {
          lineCount: dto.lines.length,
        },
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: plan.owner_client_id,
        eventType: 'cross_dock.plan.created',
        resourceType: 'cross_dock_plan',
        resourceId: plan.id,
        payload: { priority: plan.priority, lines: dto.lines.length },
      });
      return toCrossDockPlanResponse(plan);
    });
  }

  releaseCrossDockPlan(
    warehouseId: string,
    planId: string,
    actor: AuthenticatedUser,
  ): Promise<CrossDockPlanResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<CrossDockPlanRow>(
        client,
        `UPDATE cross_dock_plans SET status = $1, updated_at = now()
         WHERE id = $2::uuid AND warehouse_id = $3::uuid AND status = 'PLANNED'
         RETURNING *`,
        nextCrossDockPlanStatus('RELEASE'),
        planId,
        warehouseId,
      );
      const plan = requiredRow(rows, 'Cross-dock plan was not found or cannot be released.');
      await this.writeAudit(
        client,
        actor,
        'cross_dock_plan.released',
        'cross_dock_plan',
        plan.id,
        warehouseId,
        plan.owner_client_id,
        {},
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: plan.owner_client_id,
        eventType: 'cross_dock.plan.released',
        resourceType: 'cross_dock_plan',
        resourceId: plan.id,
        payload: { status: plan.status },
      });
      return toCrossDockPlanResponse(plan);
    });
  }

  createVasService(
    warehouseId: string,
    dto: CreateVasServiceDto,
    actor: AuthenticatedUser,
  ): Promise<VasServiceResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<VasServiceRow>(
        client,
        `INSERT INTO vas_service_catalog
          (warehouse_id, owner_client_id, code, name, service_type, status, default_duration_seconds, instructions, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (warehouse_id, code) DO UPDATE SET
           owner_client_id = EXCLUDED.owner_client_id,
           name = EXCLUDED.name,
           service_type = EXCLUDED.service_type,
           status = EXCLUDED.status,
           default_duration_seconds = EXCLUDED.default_duration_seconds,
           instructions = EXCLUDED.instructions,
           metadata = EXCLUDED.metadata,
           updated_at = now()
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        normalizeEnterpriseCode(dto.code),
        dto.name.trim(),
        normalizeEnterpriseCode(dto.serviceType),
        normalizeEnterpriseCode(dto.status ?? 'ACTIVE'),
        dto.defaultDurationSeconds ?? null,
        nullable(dto.instructions),
        json(dto.metadata ?? {}),
      );
      const service = requiredRow(rows, 'VAS service was not saved.');
      await this.writeAudit(
        client,
        actor,
        'vas_service.upserted',
        'vas_service',
        service.id,
        warehouseId,
        service.owner_client_id,
        { code: service.code },
      );
      return toVasServiceResponse(service);
    });
  }

  createKitBom(
    warehouseId: string,
    dto: CreateKitBomDto,
    actor: AuthenticatedUser,
  ): Promise<KitBomResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<KitBomRow>(
        client,
        `INSERT INTO kit_bom_headers
          (warehouse_id, owner_client_id, kit_sku_id, code, status, version, metadata)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'ACTIVE', $5, $6::jsonb)
         ON CONFLICT (warehouse_id, code, version) DO UPDATE SET
           owner_client_id = EXCLUDED.owner_client_id,
           kit_sku_id = EXCLUDED.kit_sku_id,
           metadata = EXCLUDED.metadata,
           updated_at = now()
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        dto.kitSkuId,
        normalizeEnterpriseCode(dto.code),
        dto.version ?? 1,
        json(dto.metadata ?? {}),
      );
      const bom = requiredRow(rows, 'Kit BOM was not saved.');
      await this.execute(client, `DELETE FROM kit_bom_lines WHERE bom_id = $1::uuid`, bom.id);
      for (const line of dto.lines) {
        await this.execute(
          client,
          `INSERT INTO kit_bom_lines
            (warehouse_id, owner_client_id, bom_id, component_sku_id, quantity_per_kit, scrap_percent, metadata)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb)`,
          warehouseId,
          bom.owner_client_id,
          bom.id,
          line.componentSkuId,
          line.quantityPerKit,
          line.scrapPercent ?? 0,
          json(line.metadata ?? {}),
        );
      }
      await this.writeAudit(
        client,
        actor,
        'kit_bom.upserted',
        'kit_bom',
        bom.id,
        warehouseId,
        bom.owner_client_id,
        { lineCount: dto.lines.length },
      );
      return toKitBomResponse(bom);
    });
  }

  createVasTask(
    warehouseId: string,
    dto: CreateVasTaskDto,
    actor: AuthenticatedUser,
  ): Promise<VasTaskResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<VasTaskRow>(
        client,
        `INSERT INTO vas_tasks
          (warehouse_id, owner_client_id, service_id, warehouse_task_id, status, target_resource_type, target_resource_id, quantity, instructions, metadata)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OPEN', $5, $6, $7, $8, $9::jsonb)
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        dto.serviceId ?? null,
        dto.warehouseTaskId ?? null,
        normalizeEnterpriseCode(dto.targetResourceType),
        dto.targetResourceId,
        dto.quantity,
        nullable(dto.instructions),
        json(dto.metadata ?? {}),
      );
      const task = requiredRow(rows, 'VAS task was not created.');
      await this.writeAudit(
        client,
        actor,
        'vas_task.created',
        'vas_task',
        task.id,
        warehouseId,
        task.owner_client_id,
        {
          targetResourceType: task.target_resource_type,
          targetResourceId: task.target_resource_id,
        },
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: task.owner_client_id,
        eventType: 'vas.task.created',
        resourceType: 'vas_task',
        resourceId: task.id,
        payload: { targetResourceType: task.target_resource_type, quantity: task.quantity },
      });
      return toVasTaskResponse(task);
    });
  }

  confirmVasTask(
    warehouseId: string,
    taskId: string,
    dto: ConfirmVasTaskDto,
    actor: AuthenticatedUser,
  ): Promise<VasTaskResponse> {
    return this.withTenant(async (client) => {
      const rows = await this.query<VasTaskRow>(
        client,
        `UPDATE vas_tasks SET
           status = $1,
           completed_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
         WHERE id = $3::uuid AND warehouse_id = $4::uuid AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
         RETURNING *`,
        nextVasTaskStatus('COMPLETE'),
        json({ result: dto.result ?? {} }),
        taskId,
        warehouseId,
      );
      const task = requiredRow(rows, 'VAS task was not found or cannot be completed.');
      await this.writeAudit(
        client,
        actor,
        'vas_task.completed',
        'vas_task',
        task.id,
        warehouseId,
        task.owner_client_id,
        {},
      );
      await this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: task.owner_client_id,
        eventType: 'vas.task.completed',
        resourceType: 'vas_task',
        resourceId: task.id,
        payload: { status: task.status, result: dto.result ?? {} },
      });
      return toVasTaskResponse(task);
    });
  }

  recordDomainEvent(warehouseId: string, dto: RecordDomainEventDto): Promise<DomainEventResponse> {
    return this.withTenant(async (client) =>
      this.recordDomainEventInTransaction(client, {
        warehouseId,
        ownerClientId: dto.ownerClientId ?? null,
        eventType: dto.eventType,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        schemaVersion: dto.schemaVersion,
        payload: dto.payload ?? {},
        metadata: dto.metadata ?? {},
      }),
    );
  }

  listDomainEvents(warehouseId: string): Promise<DomainEventResponse[]> {
    return this.withTenant(async (client) => {
      const rows = await this.query<DomainEventRow>(
        client,
        `SELECT * FROM domain_events WHERE warehouse_id = $1::uuid ORDER BY occurred_at DESC LIMIT 200`,
        warehouseId,
      );
      return rows.map(toDomainEventResponse);
    });
  }

  createWebhookSubscription(
    warehouseId: string,
    dto: CreateWebhookSubscriptionDto,
    actor: AuthenticatedUser,
  ): Promise<WebhookSubscriptionResponse> {
    return this.withTenant(async (client) => {
      const eventTypes = dto.eventTypes.map(normalizeEnterpriseCode);
      const rows = await this.query<WebhookSubscriptionRow>(
        client,
        `INSERT INTO webhook_subscriptions
          (warehouse_id, owner_client_id, name, target_url, event_types, status, secret_ref, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::text[], $6, $7, $8::jsonb)
         ON CONFLICT (warehouse_id, name) DO UPDATE SET
           owner_client_id = EXCLUDED.owner_client_id,
           target_url = EXCLUDED.target_url,
           event_types = EXCLUDED.event_types,
           status = EXCLUDED.status,
           secret_ref = EXCLUDED.secret_ref,
           metadata = EXCLUDED.metadata,
           updated_at = now()
         RETURNING *`,
        warehouseId,
        dto.ownerClientId ?? null,
        dto.name.trim(),
        dto.targetUrl.trim(),
        eventTypes,
        normalizeEnterpriseCode(dto.status ?? 'ACTIVE'),
        nullable(dto.secretRef),
        json(dto.metadata ?? {}),
      );
      const subscription = requiredRow(rows, 'Webhook subscription was not saved.');
      await this.writeAudit(
        client,
        actor,
        'webhook_subscription.upserted',
        'webhook_subscription',
        subscription.id,
        warehouseId,
        subscription.owner_client_id,
        {
          eventTypes,
        },
      );
      return toWebhookSubscriptionResponse(subscription);
    });
  }

  replayDomainEvent(
    warehouseId: string,
    eventId: string,
  ): Promise<WebhookDeliveryAttemptResponse[]> {
    return this.withTenant(async (client) => {
      const event = await this.findDomainEvent(client, warehouseId, eventId);
      await this.enqueueWebhookDeliveries(client, event, true);
      const rows = await this.query<WebhookDeliveryAttemptRow>(
        client,
        `SELECT * FROM webhook_delivery_attempts WHERE domain_event_id = $1::uuid ORDER BY created_at DESC`,
        event.id,
      );
      return rows.map(toWebhookDeliveryAttemptResponse);
    });
  }

  private async findAutomationCommand(
    client: SqlClient,
    warehouseId: string,
    commandId: string,
  ): Promise<AutomationCommandRow> {
    const rows = await this.query<AutomationCommandRow>(
      client,
      `SELECT * FROM automation_commands WHERE id = $1::uuid AND warehouse_id = $2::uuid LIMIT 1`,
      commandId,
      warehouseId,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Automation command was not found.');
    return row;
  }

  private async findDomainEvent(
    client: SqlClient,
    warehouseId: string,
    eventId: string,
  ): Promise<DomainEventRow> {
    const rows = await this.query<DomainEventRow>(
      client,
      `SELECT * FROM domain_events WHERE id = $1::uuid AND warehouse_id = $2::uuid LIMIT 1`,
      eventId,
      warehouseId,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Domain event was not found.');
    return row;
  }

  private async recordAutomationEvent(
    client: SqlClient,
    input: {
      warehouseId: string;
      ownerClientId: string | null;
      deviceId?: string | null;
      commandId?: string | null;
      eventType: string;
      severity: string;
      payload?: unknown;
    },
  ): Promise<void> {
    await this.execute(
      client,
      `INSERT INTO automation_events
        (warehouse_id, owner_client_id, device_id, command_id, event_type, severity, payload)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb)`,
      input.warehouseId,
      input.ownerClientId,
      input.deviceId ?? null,
      input.commandId ?? null,
      normalizeEnterpriseCode(input.eventType),
      normalizeEnterpriseCode(input.severity),
      json(input.payload ?? {}),
    );
  }

  private async recordDomainEventInTransaction(
    client: SqlClient,
    input: {
      warehouseId: string;
      ownerClientId?: string | null;
      eventType: string;
      resourceType: string;
      resourceId: string;
      schemaVersion?: number;
      payload?: unknown;
      metadata?: unknown;
    },
  ): Promise<DomainEventResponse> {
    const eventType = normalizeEnterpriseCode(input.eventType);
    const resourceType = normalizeEnterpriseCode(input.resourceType);
    const schemaVersion = input.schemaVersion ?? 1;
    const payload = input.payload ?? {};
    const eventKey = buildDomainEventKey({
      eventType,
      resourceType,
      resourceId: input.resourceId,
      schemaVersion,
      payload,
    });
    const rows = await this.query<DomainEventRow>(
      client,
      `INSERT INTO domain_events
        (warehouse_id, owner_client_id, event_type, resource_type, resource_id, schema_version, event_key, payload, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       ON CONFLICT (event_key) DO UPDATE SET
         metadata = COALESCE(domain_events.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         published_at = NULL
       RETURNING *`,
      input.warehouseId,
      input.ownerClientId ?? null,
      eventType,
      resourceType,
      input.resourceId,
      schemaVersion,
      eventKey,
      json(payload),
      json(input.metadata ?? {}),
    );
    const event = requiredRow(rows, 'Domain event was not recorded.');
    await this.enqueueWebhookDeliveries(client, event, false);
    return toDomainEventResponse(event);
  }

  private async enqueueWebhookDeliveries(
    client: SqlClient,
    event: DomainEventRow,
    replay: boolean,
  ): Promise<void> {
    await this.execute(
      client,
      `INSERT INTO webhook_delivery_attempts
        (warehouse_id, owner_client_id, subscription_id, domain_event_id, status, attempt_number, metadata)
       SELECT
         s.warehouse_id,
         s.owner_client_id,
         s.id,
         $1::uuid,
         'PENDING',
         CASE WHEN $5 THEN COALESCE((
           SELECT max(existing.attempt_number) + 1
           FROM webhook_delivery_attempts existing
           WHERE existing.subscription_id = s.id AND existing.domain_event_id = $1::uuid
         ), 1) ELSE 1 END,
         jsonb_build_object('targetUrl', s.target_url, 'replay', $5)
       FROM webhook_subscriptions s
       WHERE s.warehouse_id = $2::uuid
         AND s.status = 'ACTIVE'
         AND ($3::uuid IS NULL OR s.owner_client_id IS NULL OR s.owner_client_id = $3::uuid)
         AND (cardinality(s.event_types) = 0 OR $4 = ANY(s.event_types))
       ON CONFLICT DO NOTHING`,
      event.id,
      event.warehouse_id,
      event.owner_client_id,
      event.event_type,
      replay,
    );
  }

  private async writeAudit(
    client: SqlClient,
    actor: AuthenticatedUser,
    action: string,
    resourceType: string,
    resourceId: string,
    warehouseId: string,
    ownerClientId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.execute(
      client,
      `INSERT INTO audit_logs (actor_user_id, warehouse_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)`,
      actor.id,
      warehouseId,
      action,
      resourceType,
      resourceId,
      json({ ...metadata, ownerClientId }),
    );
  }

  private withTenant<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    return this.prisma.withTenantRls((client) => operation(client as SqlClient));
  }

  private query<T>(client: SqlClient, query: string, ...values: unknown[]): Promise<T[]> {
    return client.$queryRawUnsafe<T[]>(query, ...values);
  }

  private execute(client: SqlClient, query: string, ...values: unknown[]): Promise<unknown> {
    return client.$executeRawUnsafe(query, ...values);
  }
}

function assertDateWindow(start: string, end: string): void {
  if (new Date(start).getTime() >= new Date(end).getTime()) {
    throw new ConflictException('plannedStartAt must be before plannedEndAt.');
  }
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function requiredRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new ConflictException(message);
  return row;
}

function toAutomationDeviceResponse(row: AutomationDeviceRow): AutomationDeviceResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    code: row.code,
    deviceType: row.device_type,
    status: row.status as AutomationDeviceStatus,
    zone: row.zone,
    lastHeartbeatAt: row.last_heartbeat_at,
    capabilities: row.capabilities,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAutomationCommandResponse(row: AutomationCommandRow): AutomationCommandResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    deviceId: row.device_id,
    commandType: row.command_type,
    status: row.status as AutomationCommandStatus,
    priority: row.priority,
    correlationId: row.correlation_id,
    payload: row.payload,
    attempts: row.attempts,
    notBeforeAt: row.not_before_at,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDockDoorResponse(row: DockDoorRow): DockDoorResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    code: row.code,
    status: row.status as DockDoorResponse['status'],
    doorType: row.door_type,
    zone: row.zone,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDockAppointmentResponse(row: DockAppointmentRow): DockAppointmentResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    appointmentNumber: row.appointment_number,
    direction: row.direction,
    status: row.status as DockAppointmentResponse['status'],
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    dockDoorId: row.dock_door_id,
    trailerId: row.trailer_id,
    carrier: row.carrier,
    externalReference: row.external_reference,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toYardTrailerResponse(row: YardTrailerRow): YardTrailerResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    trailerNumber: row.trailer_number,
    carrier: row.carrier,
    status: row.status as YardTrailerResponse['status'],
    dockDoorId: row.dock_door_id,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    dwellMinutes: row.dwell_minutes,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCrossDockPlanResponse(row: CrossDockPlanRow): CrossDockPlanResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    status: row.status as CrossDockPlanResponse['status'],
    priority: row.priority,
    inboundShipmentId: row.inbound_shipment_id,
    outboundOrderId: row.outbound_order_id,
    reasonCode: row.reason_code,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVasServiceResponse(row: VasServiceRow): VasServiceResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    code: row.code,
    name: row.name,
    serviceType: row.service_type,
    status: row.status,
    defaultDurationSeconds: row.default_duration_seconds,
    instructions: row.instructions,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toKitBomResponse(row: KitBomRow): KitBomResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    kitSkuId: row.kit_sku_id,
    code: row.code,
    status: row.status,
    version: row.version,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVasTaskResponse(row: VasTaskRow): VasTaskResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    serviceId: row.service_id,
    warehouseTaskId: row.warehouse_task_id,
    status: row.status as VasTaskResponse['status'],
    targetResourceType: row.target_resource_type,
    targetResourceId: row.target_resource_id,
    quantity: row.quantity,
    instructions: row.instructions,
    completedAt: row.completed_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDomainEventResponse(row: DomainEventRow): DomainEventResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    eventType: row.event_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    schemaVersion: row.schema_version,
    eventKey: row.event_key,
    payload: row.payload,
    metadata: row.metadata,
    occurredAt: row.occurred_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function toWebhookSubscriptionResponse(row: WebhookSubscriptionRow): WebhookSubscriptionResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    name: row.name,
    targetUrl: row.target_url,
    eventTypes: row.event_types ?? [],
    status: row.status,
    secretRef: row.secret_ref,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWebhookDeliveryAttemptResponse(
  row: WebhookDeliveryAttemptRow,
): WebhookDeliveryAttemptResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    subscriptionId: row.subscription_id,
    domainEventId: row.domain_event_id,
    status: row.status as WebhookDeliveryAttemptResponse['status'],
    attemptNumber: row.attempt_number,
    responseStatusCode: row.response_status_code,
    errorMessage: row.error_message,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface BaseWarehouseRow {
  id: string;
  warehouse_id: string;
  owner_client_id: string | null;
  metadata: unknown;
  created_at: Date;
  updated_at: Date;
}

interface AutomationDeviceRow extends BaseWarehouseRow {
  code: string;
  device_type: string;
  status: string;
  zone: string | null;
  last_heartbeat_at: Date | null;
  capabilities: unknown;
}

interface AutomationCommandRow extends BaseWarehouseRow {
  device_id: string | null;
  command_type: string;
  status: string;
  priority: number;
  correlation_id: string | null;
  payload: unknown;
  attempts: number;
  not_before_at: Date | null;
  claimed_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
}

interface DockDoorRow extends Omit<BaseWarehouseRow, 'owner_client_id'> {
  code: string;
  status: string;
  door_type: string;
  zone: string | null;
}

interface DockAppointmentRow extends BaseWarehouseRow {
  appointment_number: string;
  direction: string;
  status: string;
  planned_start_at: Date;
  planned_end_at: Date;
  dock_door_id: string | null;
  trailer_id: string | null;
  carrier: string | null;
  external_reference: string | null;
}

interface YardTrailerRow extends BaseWarehouseRow {
  trailer_number: string;
  carrier: string | null;
  status: string;
  dock_door_id: string | null;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
  dwell_minutes: number | null;
}

interface CrossDockPlanRow extends BaseWarehouseRow {
  status: string;
  priority: number;
  inbound_shipment_id: string | null;
  outbound_order_id: string | null;
  reason_code: string | null;
}

interface VasServiceRow extends BaseWarehouseRow {
  code: string;
  name: string;
  service_type: string;
  status: string;
  default_duration_seconds: number | null;
  instructions: string | null;
}

interface KitBomRow extends BaseWarehouseRow {
  kit_sku_id: string;
  code: string;
  status: string;
  version: number;
}

interface VasTaskRow extends BaseWarehouseRow {
  service_id: string | null;
  warehouse_task_id: string | null;
  status: string;
  target_resource_type: string;
  target_resource_id: string;
  quantity: number;
  instructions: string | null;
  completed_at: Date | null;
}

interface DomainEventRow extends BaseWarehouseRow {
  event_type: string;
  resource_type: string;
  resource_id: string;
  schema_version: number;
  event_key: string;
  payload: unknown;
  occurred_at: Date;
  published_at: Date | null;
}

interface WebhookSubscriptionRow extends BaseWarehouseRow {
  name: string;
  target_url: string;
  event_types: string[];
  status: string;
  secret_ref: string | null;
}

interface WebhookDeliveryAttemptRow extends BaseWarehouseRow {
  subscription_id: string;
  domain_event_id: string;
  status: string;
  attempt_number: number;
  response_status_code: number | null;
  error_message: string | null;
  next_retry_at: Date | null;
}
