CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "WmsClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

CREATE TYPE "BillingEventType" AS ENUM ('STORAGE_DAY', 'INBOUND_RECEIPT', 'OUTBOUND_ORDER', 'PICK', 'PACK', 'SHIP', 'CARRIER_LABEL', 'CYCLE_COUNT', 'REPLENISHMENT', 'MANUAL');

CREATE TYPE "BillingEventStatus" AS ENUM ('PENDING', 'BILLABLE', 'INVOICED', 'VOIDED');

CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOIDED');

CREATE TYPE "BillingCreditNoteStatus" AS ENUM ('DRAFT', 'FINALIZED', 'VOIDED');

CREATE TYPE "BillingPeriodStatus" AS ENUM ('OPEN', 'GENERATED', 'REVIEWED', 'CLOSED', 'REOPENED');

CREATE TYPE "SlottingRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "SlottingRecommendationStatus" AS ENUM ('OPEN', 'APPLIED', 'DISMISSED', 'EXPIRED');

CREATE TYPE "WarehouseLocationType" AS ENUM ('RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'SHIPPING', 'BUFFER', 'QUARANTINE');

CREATE TYPE "ParcelStatus" AS ENUM ('CREATED', 'RECEIVED', 'STORED', 'PICKING', 'PACKED', 'SHIPPED', 'EXCEPTION', 'CANCELLED');

CREATE TYPE "TrackingEventType" AS ENUM ('CREATED', 'RECEIVED', 'STORED', 'MOVED', 'PICKED', 'PACKED', 'SHIPPED', 'SCANNED', 'EXCEPTION_RAISED', 'EXCEPTION_RESOLVED', 'CANCELLED');

CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED');

CREATE TYPE "ExceptionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "InboundStatus" AS ENUM ('CREATED', 'EXPECTED', 'RECEIVING', 'RECEIVED', 'CLOSED', 'CANCELLED', 'EXCEPTION');

CREATE TYPE "OutboundStatus" AS ENUM ('DRAFT', 'CREATED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'SHIPPED', 'CANCELLED', 'EXCEPTION');

CREATE TYPE "ScannerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

CREATE TYPE "LabelTemplateType" AS ENUM ('PARCEL', 'LOCATION', 'CUSTOM');

CREATE TYPE "LabelJobStatus" AS ENUM ('QUEUED', 'PRINTING', 'PRINTED', 'FAILED', 'CANCELLED');

CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'ERROR', 'TASK');

CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DISCONTINUED');

CREATE TYPE "SkuStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "StockQuantStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'BLOCKED', 'DAMAGED', 'IN_TRANSIT', 'QUARANTINE');

CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'PUTAWAY', 'MOVE', 'RESERVE', 'PICK', 'PACK', 'SHIP', 'ADJUST', 'BLOCK', 'UNBLOCK', 'CANCEL_RESERVATION');

CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'PICKED', 'RELEASED', 'CANCELLED');

CREATE TYPE "HandlingUnitStatus" AS ENUM ('OPEN', 'CLOSED', 'IN_TRANSIT', 'SHIPPED', 'DAMAGED');

CREATE TYPE "WarehouseTaskType" AS ENUM ('RECEIVE', 'PUTAWAY', 'PICK', 'PACK', 'MOVE', 'REPLENISH', 'COUNT', 'LOAD');

CREATE TYPE "WarehouseTaskStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'FAILED', 'CANCELLED');

CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER');

CREATE TYPE "InboxEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DUPLICATE', 'IGNORED');

CREATE TYPE "LotStatus" AS ENUM ('ACTIVE', 'HOLD', 'QUARANTINED', 'RELEASED', 'EXPIRED', 'RECALLED', 'CONSUMED', 'ARCHIVED');

CREATE TYPE "LotQualityStatus" AS ENUM ('RELEASED', 'PENDING_QA', 'HOLD', 'REJECTED');

CREATE TYPE "SerialNumberStatus" AS ENUM ('EXPECTED', 'AVAILABLE', 'RESERVED', 'PICKED', 'PACKED', 'SHIPPED', 'BLOCKED', 'DAMAGED', 'RETURNED', 'SCRAPPED');

CREATE TYPE "WarehouseOrderType" AS ENUM ('MOVE', 'PUTAWAY', 'PICK', 'REPLENISH', 'COUNT', 'LOAD', 'ADJUSTMENT');

CREATE TYPE "WarehouseOrderStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'COMPLETED', 'CANCELLED', 'EXCEPTION');

CREATE TYPE "WarehouseOrderLineStatus" AS ENUM ('OPEN', 'ALLOCATED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'EXCEPTION');

CREATE TYPE "RefreshTokenSessionStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED', 'COMPROMISED');

CREATE TYPE "ScannerSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');

CREATE TYPE "RfWorkflowType" AS ENUM ('RECEIVE', 'PUTAWAY', 'PICK', 'PACK', 'MOVE', 'COUNT', 'REPLENISH', 'LOAD');

CREATE TYPE "RfStepStatus" AS ENUM ('OPEN', 'COMPLETED', 'FAILED', 'SKIPPED');

CREATE TYPE "StockFreezeStatus" AS ENUM ('ACTIVE', 'RELEASED');

CREATE TYPE "CycleCountPlanStatus" AS ENUM ('DRAFT', 'RELEASED', 'COUNTING', 'RECONCILING', 'APPROVED', 'CANCELLED');

CREATE TYPE "CycleCountTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TYPE "ReplenishmentRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "ReplenishmentStrategy" AS ENUM ('MIN_MAX', 'DEMAND_BASED', 'EMERGENCY', 'PICK_FACE_TOPUP');

CREATE TYPE "ReplenishmentDemandStatus" AS ENUM ('OPEN', 'TASK_CREATED', 'COMPLETED', 'CANCELLED');

CREATE TYPE "PackingStationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'PACKING', 'STAGED', 'LOADING', 'SHIPPED', 'CANCELLED', 'EXCEPTION');

CREATE TYPE "ShipmentPackageStatus" AS ENUM ('OPEN', 'PACKED', 'STAGED', 'LOADED', 'SHIPPED', 'CANCELLED');

CREATE TYPE "CarrierLabelStatus" AS ENUM ('QUEUED', 'GENERATED', 'PRINTED', 'FAILED', 'CANCELLED');

CREATE TYPE "CarrierCredentialStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ROTATED', 'REVOKED');

CREATE TYPE "CarrierTrackingStatus" AS ENUM ('ACCEPTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'CANCELLED', 'UNKNOWN');

CREATE TYPE "PickWaveStatus" AS ENUM ('DRAFT', 'PLANNED', 'RELEASED', 'PICKING', 'COMPLETED', 'CANCELLED', 'EXCEPTION');

CREATE TYPE "PickWaveOrderStatus" AS ENUM ('PLANNED', 'RELEASED', 'PICKING', 'PICKED', 'CANCELLED', 'EXCEPTION');

CREATE TYPE "PickCartStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED');

CREATE TYPE "PickToteStatus" AS ENUM ('EMPTY', 'ASSIGNED', 'FULL', 'CLOSED', 'CANCELLED');

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id","warehouse_id")
);

CREATE TABLE "wms_clients" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WmsClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_currency" TEXT NOT NULL DEFAULT 'EUR',
    "external_reference" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wms_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_warehouses" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_billing_profile" TEXT,
    "external_reference" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_sku_aliases" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "sku_id" UUID,
    "client_sku" TEXT NOT NULL,
    "client_barcode" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_sku_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_resource_links" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "external_reference" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_resource_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_client_access" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_client_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_rate_cards" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_rate_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_rates" (
    "id" UUID NOT NULL,
    "rate_card_id" UUID NOT NULL,
    "event_type" "BillingEventType" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'EA',
    "unit_price_minor" INTEGER NOT NULL,
    "min_charge_minor" INTEGER,
    "vat_rate_bps" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_number_sequences" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "client_id" UUID,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_number_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "storage_occupancy_snapshots" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "sku_id" UUID,
    "location_id" UUID,
    "stock_quant_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "handling_unit_count" INTEGER,
    "pallet_count" INTEGER,
    "snapshot_date" DATE NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_occupancy_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_period_closes" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "BillingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_period_closes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_events" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "event_type" "BillingEventType" NOT NULL,
    "status" "BillingEventStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_minor" INTEGER NOT NULL DEFAULT 0,
    "amount_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiced_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_invoices" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_total_minor" INTEGER NOT NULL DEFAULT 0,
    "total_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "finalized_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "billing_event_id" UUID,
    "line_number" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount_minor" INTEGER NOT NULL DEFAULT 0,
    "vat_rate_bps" INTEGER,
    "net_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "gross_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_credit_notes" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "status" "BillingCreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "reason_code" TEXT,
    "reason" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotal_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_total_minor" INTEGER NOT NULL DEFAULT 0,
    "total_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "finalized_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_credit_note_lines" (
    "id" UUID NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "invoice_line_id" UUID,
    "line_number" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount_minor" INTEGER NOT NULL DEFAULT 0,
    "vat_rate_bps" INTEGER,
    "net_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "tax_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "gross_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_credit_note_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Prague',
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_locations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WarehouseLocationType" NOT NULL,
    "barcode" TEXT,
    "zone" TEXT,
    "aisle" TEXT,
    "bay" TEXT,
    "level" TEXT,
    "bin" TEXT,
    "pick_sequence" INTEGER NOT NULL DEFAULT 0,
    "capacity_weight_grams" INTEGER,
    "capacity_volume_cm3" INTEGER,
    "bin_status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "bin_type" TEXT,
    "capacity_units" INTEGER,
    "capacity_handling_units" INTEGER,
    "capacity_pallets" INTEGER,
    "capacity_reserved_units" INTEGER NOT NULL DEFAULT 0,
    "capacity_reserved_volume_cm3" INTEGER NOT NULL DEFAULT 0,
    "capacity_reserved_weight_grams" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "parcels" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "current_location_id" UUID,
    "tracking_number" TEXT NOT NULL,
    "status" "ParcelStatus" NOT NULL DEFAULT 'CREATED',
    "external_reference" TEXT,
    "customer_reference" TEXT,
    "recipient_name" TEXT,
    "carrier" TEXT,
    "service_level" TEXT,
    "weight_grams" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tracking_events" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "parcel_id" UUID,
    "actor_user_id" UUID,
    "location_id" UUID,
    "type" "TrackingEventType" NOT NULL,
    "code" TEXT,
    "message" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wms_exceptions" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "parcel_id" UUID,
    "location_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "severity" "ExceptionSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wms_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbound_shipments" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "dock_location_id" UUID,
    "shipment_number" TEXT NOT NULL,
    "status" "InboundStatus" NOT NULL DEFAULT 'CREATED',
    "supplier_name" TEXT,
    "supplier_reference" TEXT,
    "purchase_order_reference" TEXT,
    "external_reference" TEXT,
    "expected_at" TIMESTAMP(3),
    "appointment_start_at" TIMESTAMP(3),
    "appointment_end_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbound_shipment_lines" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "parcel_id" UUID,
    "line_number" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "expected_quantity" INTEGER NOT NULL DEFAULT 1,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_shipment_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_orders" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "order_number" TEXT NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'CREATED',
    "customer_reference" TEXT,
    "recipient_name" TEXT,
    "carrier" TEXT,
    "service_level" TEXT,
    "ship_by" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbound_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "parcel_id" UUID,
    "line_number" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "ordered_quantity" INTEGER NOT NULL DEFAULT 1,
    "picked_quantity" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scanner_devices" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ScannerStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_zone" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanner_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "label_templates" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LabelTemplateType" NOT NULL DEFAULT 'PARCEL',
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "label_print_jobs" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "requested_by_user_id" UUID,
    "status" "LabelJobStatus" NOT NULL DEFAULT 'QUEUED',
    "printer_name" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB,
    "error_message" TEXT,
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_print_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "user_id" UUID,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skus" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "weight_grams" INTEGER,
    "status" "SkuStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "handling_units" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "current_location_id" UUID,
    "parent_id" UUID,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PALLET',
    "status" "HandlingUnitStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handling_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_quants" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "location_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "handling_unit_id" UUID,
    "lot_id" UUID,
    "quantity" INTEGER NOT NULL,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "status" "StockQuantStatus" NOT NULL DEFAULT 'AVAILABLE',
    "batch" TEXT,
    "expiry_date" DATE,
    "external_reference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_quants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "outbound_order_id" UUID,
    "outbound_order_line_id" UUID,
    "stock_quant_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "allocation_strategy" TEXT,
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_tasks" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "type" "WarehouseTaskType" NOT NULL,
    "status" "WarehouseTaskStatus" NOT NULL DEFAULT 'OPEN',
    "sku_id" UUID,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "assigned_user_id" UUID,
    "outbound_order_id" UUID,
    "outbound_order_line_id" UUID,
    "inbound_shipment_id" UUID,
    "inbound_shipment_line_id" UUID,
    "reservation_id" UUID,
    "handling_unit_id" UUID,
    "quantity" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "external_reference" TEXT,
    "failure_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "assigned_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "sku_id" UUID NOT NULL,
    "stock_quant_id" UUID,
    "reservation_id" UUID,
    "task_id" UUID,
    "actor_user_id" UUID,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "source_system" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "external_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_body" JSONB,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inbox_events" (
    "id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "InboxEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scanner_sessions" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "scanner_device_id" UUID,
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "workflow" "RfWorkflowType" NOT NULL,
    "status" "ScannerSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_step_key" TEXT,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanner_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scanner_workflow_steps" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "task_id" UUID,
    "step_key" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "RfStepStatus" NOT NULL DEFAULT 'OPEN',
    "instruction" TEXT NOT NULL,
    "expected_type" TEXT,
    "expected_value" TEXT,
    "scanned_value" TEXT,
    "quantity" INTEGER,
    "error_code" TEXT,
    "metadata" JSONB,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanner_workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stock_freezes" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "plan_id" UUID,
    "location_id" UUID,
    "sku_id" UUID,
    "stock_quant_id" UUID,
    "status" "StockFreezeStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "created_by_user_id" UUID,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_freezes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cycle_count_plans" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CycleCountPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "scope_type" TEXT NOT NULL DEFAULT 'LOCATION',
    "scope_reference" TEXT,
    "created_by_user_id" UUID,
    "released_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "metadata" JSONB,
    "released_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_count_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cycle_count_tasks" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "warehouse_task_id" UUID,
    "location_id" UUID NOT NULL,
    "sku_id" UUID,
    "stock_quant_id" UUID,
    "expected_quantity" INTEGER,
    "counted_quantity" INTEGER,
    "variance_quantity" INTEGER,
    "status" "CycleCountTaskStatus" NOT NULL DEFAULT 'OPEN',
    "counted_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cycle_count_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "replenishment_rules" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReplenishmentRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "strategy" "ReplenishmentStrategy" NOT NULL DEFAULT 'MIN_MAX',
    "sku_id" UUID NOT NULL,
    "pick_location_id" UUID NOT NULL,
    "source_zone" TEXT,
    "min_quantity" INTEGER NOT NULL,
    "max_quantity" INTEGER NOT NULL,
    "target_quantity" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replenishment_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "replenishment_demands" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "pick_location_id" UUID NOT NULL,
    "source_location_id" UUID,
    "stock_quant_id" UUID,
    "warehouse_task_id" UUID,
    "status" "ReplenishmentDemandStatus" NOT NULL DEFAULT 'OPEN',
    "required_quantity" INTEGER NOT NULL,
    "available_pick_quantity" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replenishment_demands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "packing_stations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location_id" UUID,
    "status" "PackingStationStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packing_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "shipment_number" TEXT NOT NULL,
    "outbound_order_id" UUID,
    "packing_station_id" UUID,
    "staged_location_id" UUID,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "carrier" TEXT,
    "service_level" TEXT,
    "tracking_reference" TEXT,
    "metadata" JSONB,
    "staged_at" TIMESTAMP(3),
    "loaded_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_packages" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "shipment_id" UUID NOT NULL,
    "outbound_order_id" UUID,
    "package_code" TEXT NOT NULL,
    "status" "ShipmentPackageStatus" NOT NULL DEFAULT 'OPEN',
    "package_type" TEXT NOT NULL DEFAULT 'CARTON',
    "weight_grams" INTEGER,
    "length_cm" INTEGER,
    "width_cm" INTEGER,
    "height_cm" INTEGER,
    "tracking_number" TEXT,
    "metadata" JSONB,
    "packed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_contents" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "outbound_order_line_id" UUID,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_contents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carrier_labels" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "shipment_id" UUID,
    "package_id" UUID,
    "label_reference" TEXT NOT NULL,
    "status" "CarrierLabelStatus" NOT NULL DEFAULT 'QUEUED',
    "carrier" TEXT,
    "service_level" TEXT,
    "tracking_number" TEXT,
    "label_format" TEXT NOT NULL DEFAULT 'ZPL',
    "payload" JSONB,
    "error_message" TEXT,
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_labels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_waves" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "wave_number" TEXT NOT NULL,
    "status" "PickWaveStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "strategy" TEXT NOT NULL DEFAULT 'SINGLE_ORDER',
    "carrier" TEXT,
    "service_level" TEXT,
    "zone" TEXT,
    "cutoff_at" TIMESTAMP(3),
    "metadata" JSONB,
    "released_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_waves_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_wave_orders" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "wave_id" UUID NOT NULL,
    "outbound_order_id" UUID NOT NULL,
    "status" "PickWaveOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "picked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_wave_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_wave_tasks" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "wave_id" UUID NOT NULL,
    "warehouse_task_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "zone" TEXT,
    "status" "WarehouseTaskStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_wave_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_carts" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "wave_id" UUID,
    "code" TEXT NOT NULL,
    "status" "PickCartStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assigned_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pick_totes" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "pick_cart_id" UUID,
    "wave_id" UUID,
    "outbound_order_id" UUID,
    "code" TEXT NOT NULL,
    "status" "PickToteStatus" NOT NULL DEFAULT 'EMPTY',
    "capacity_units" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_totes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sku_lots" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "sku_id" UUID NOT NULL,
    "lot_code" TEXT NOT NULL,
    "batch" TEXT,
    "supplier_lot" TEXT,
    "quality_status" "LotQualityStatus" NOT NULL DEFAULT 'RELEASED',
    "status" "LotStatus" NOT NULL DEFAULT 'ACTIVE',
    "manufactured_at" DATE,
    "expiry_date" DATE,
    "received_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "quarantined_at" TIMESTAMP(3),
    "quarantine_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "serial_numbers" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "sku_id" UUID NOT NULL,
    "lot_id" UUID,
    "stock_quant_id" UUID,
    "serial_number" TEXT NOT NULL,
    "status" "SerialNumberStatus" NOT NULL DEFAULT 'AVAILABLE',
    "first_received_at" TIMESTAMP(3),
    "last_seen_location_id" UUID,
    "inbound_shipment_line_id" UUID,
    "outbound_order_line_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serial_numbers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "serial_number_events" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "serial_number_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "stock_quant_id" UUID,
    "actor_user_id" UUID,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "serial_number_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_orders" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "order_number" TEXT NOT NULL,
    "order_type" "WarehouseOrderType" NOT NULL DEFAULT 'MOVE',
    "status" "WarehouseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "source_type" TEXT,
    "source_id" TEXT,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "due_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_order_lines" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "warehouse_order_id" UUID NOT NULL,
    "line_number" TEXT NOT NULL,
    "sku_id" UUID,
    "lot_id" UUID,
    "requested_quantity" INTEGER NOT NULL DEFAULT 1,
    "allocated_quantity" INTEGER NOT NULL DEFAULT 0,
    "completed_quantity" INTEGER NOT NULL DEFAULT 0,
    "serial_required" BOOLEAN NOT NULL DEFAULT false,
    "status" "WarehouseOrderLineStatus" NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "warehouse_order_tasks" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "warehouse_order_id" UUID NOT NULL,
    "warehouse_order_line_id" UUID,
    "warehouse_task_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_order_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_token_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "status" "RefreshTokenSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_session_id" UUID,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_token_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_totp_secrets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_ciphertext" JSONB NOT NULL,
    "secret_last4" TEXT,
    "label" TEXT,
    "verified_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_totp_secrets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "carrier_credentials" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "carrier" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'TEST',
    "status" "CarrierCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "account_number" TEXT,
    "secret_ciphertext" JSONB,
    "secret_fingerprint" TEXT,
    "secret_last4" TEXT,
    "key_version" TEXT NOT NULL DEFAULT 'v1',
    "last_rotated_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carrier_tracking_events" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "carrier" TEXT NOT NULL,
    "label_reference" TEXT,
    "tracking_number" TEXT,
    "shipment_id" UUID,
    "package_id" UUID,
    "external_event_id" TEXT,
    "status" "CarrierTrackingStatus" NOT NULL DEFAULT 'UNKNOWN',
    "event_code" TEXT,
    "message" TEXT,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carrier_tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "slotting_rules" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "SlottingRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "zone" TEXT,
    "min_velocity_score" INTEGER,
    "max_velocity_score" INTEGER,
    "target_location_type" "WarehouseLocationType",
    "max_pick_sequence" INTEGER,
    "min_pick_face_quantity" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slotting_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sku_velocities" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "sku_id" UUID,
    "sku_code" TEXT NOT NULL,
    "picks_last_30_days" INTEGER NOT NULL DEFAULT 0,
    "units_picked_last_30_days" INTEGER NOT NULL DEFAULT 0,
    "replenishments_last_30_days" INTEGER NOT NULL DEFAULT 0,
    "velocity_score" INTEGER NOT NULL DEFAULT 0,
    "abc_class" TEXT,
    "metadata" JSONB,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_velocities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "slotting_recommendations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "sku_id" UUID,
    "sku_code" TEXT NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "status" "SlottingRecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "velocity_score" INTEGER NOT NULL DEFAULT 0,
    "expected_travel_savings" INTEGER,
    "message" TEXT,
    "metadata" JSONB,
    "applied_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slotting_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_endpoints" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL DEFAULT 'NONE',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_dispatch_logs" (
    "id" UUID NOT NULL,
    "endpoint_id" UUID,
    "outbox_event_id" UUID,
    "event_type" TEXT NOT NULL,
    "destination_url" TEXT NOT NULL,
    "request_method" TEXT NOT NULL DEFAULT 'POST',
    "status_code" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error_message" TEXT,
    "request_body_hash" TEXT,
    "response_body" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_dispatch_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "warehouse_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_category_links" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_category_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_uoms" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EACH',
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_uoms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_uom_conversions" (
    "id" UUID NOT NULL,
    "from_uom" TEXT NOT NULL,
    "to_uom" TEXT NOT NULL,
    "multiplier" DECIMAL(18,6) NOT NULL,
    "product_id" UUID,
    "sku_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_uom_conversions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sku_barcodes" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID,
    "sku_id" UUID NOT NULL,
    "barcode" TEXT NOT NULL,
    "barcode_type" TEXT NOT NULL DEFAULT 'INTERNAL',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_barcodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sku_storage_requirements" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "temperature_min_celsius" DECIMAL(8,3),
    "temperature_max_celsius" DECIMAL(8,3),
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "hazardous" BOOLEAN NOT NULL DEFAULT false,
    "oversized" BOOLEAN NOT NULL DEFAULT false,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "requirements" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_storage_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sku_packaging_levels" (
    "id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "level_code" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "units_per_level" INTEGER NOT NULL,
    "parent_level_code" TEXT,
    "weight_grams" INTEGER,
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "volume_cm3" INTEGER,
    "barcode" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sku_packaging_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_client_ownerships" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "external_article_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_client_ownerships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_document_metadata" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "mime_type" TEXT,
    "checksum_sha256" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_document_metadata_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "return_orders" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "rma_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "customer_reference" TEXT,
    "external_reference" TEXT,
    "reason_code" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "return_order_lines" (
    "id" UUID NOT NULL,
    "return_order_id" UUID NOT NULL,
    "line_number" TEXT NOT NULL,
    "sku_id" UUID NOT NULL,
    "expected_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "inspected_quantity" INTEGER NOT NULL DEFAULT 0,
    "disposition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "return_inspections" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "return_order_id" UUID NOT NULL,
    "return_order_line_id" UUID NOT NULL,
    "disposition" TEXT NOT NULL,
    "inspected_quantity" INTEGER NOT NULL,
    "accepted_quantity" INTEGER NOT NULL DEFAULT 0,
    "rejected_quantity" INTEGER NOT NULL DEFAULT 0,
    "stock_quant_id" UUID,
    "notes" TEXT,
    "metadata" JSONB,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_inspections" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "sku_id" UUID,
    "lot_id" UUID,
    "stock_quant_id" UUID,
    "inspection_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "result" TEXT,
    "sample_quantity" INTEGER NOT NULL DEFAULT 1,
    "checklist" JSONB,
    "reason_code" TEXT,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "completed_by_user_id" UUID,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_sampling_rules" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "client_id" UUID,
    "sku_id" UUID,
    "lot_status" TEXT,
    "reason_code" TEXT,
    "sample_percent" DECIMAL(5,2) NOT NULL,
    "min_sample_quantity" INTEGER NOT NULL DEFAULT 1,
    "max_sample_quantity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quality_sampling_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_systems" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "system_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "owner_client_id" UUID,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_id_mappings" (
    "id" UUID NOT NULL,
    "external_system_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "owner_client_id" UUID,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "external_type" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_id_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_dead_letters" (
    "id" UUID NOT NULL,
    "endpoint_id" UUID,
    "outbox_event_id" UUID,
    "inbox_event_id" UUID,
    "event_type" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "error_message" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "next_retry_at" TIMESTAMP(3),
    "payload" JSONB,
    "metadata" JSONB,
    "fingerprint" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "replayed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "domain_events" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "event_type" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "event_key" TEXT NOT NULL,
    "payload" JSONB,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_subscriptions" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "name" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "event_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "secret_ref" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_delivery_attempts" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "subscription_id" UUID NOT NULL,
    "domain_event_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "request_signature" TEXT,
    "response_status_code" INTEGER,
    "error_message" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_delivery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_devices" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "code" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "zone" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "capabilities" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_commands" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "device_id" UUID,
    "command_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "correlation_id" TEXT,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "not_before_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_commands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_events" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "device_id" UUID,
    "command_id" UUID,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dock_doors" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "door_type" TEXT NOT NULL DEFAULT 'STANDARD',
    "zone" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dock_doors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "yard_trailers" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "trailer_number" TEXT NOT NULL,
    "carrier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "dock_door_id" UUID,
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "dwell_minutes" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yard_trailers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dock_appointments" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "appointment_number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "planned_start_at" TIMESTAMP(3) NOT NULL,
    "planned_end_at" TIMESTAMP(3) NOT NULL,
    "dock_door_id" UUID,
    "trailer_id" UUID,
    "carrier" TEXT,
    "external_reference" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dock_appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cross_dock_plans" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "inbound_shipment_id" UUID,
    "outbound_order_id" UUID,
    "reason_code" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cross_dock_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cross_dock_plan_lines" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "plan_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "lot_id" UUID,
    "expected_quantity" INTEGER NOT NULL,
    "allocated_quantity" INTEGER NOT NULL DEFAULT 0,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cross_dock_plan_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vas_service_catalog" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "default_duration_seconds" INTEGER,
    "instructions" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vas_service_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kit_bom_headers" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "kit_sku_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kit_bom_headers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kit_bom_lines" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "bom_id" UUID NOT NULL,
    "component_sku_id" UUID NOT NULL,
    "quantity_per_kit" INTEGER NOT NULL,
    "scrap_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kit_bom_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vas_tasks" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "owner_client_id" UUID,
    "service_id" UUID,
    "warehouse_task_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "target_resource_type" TEXT NOT NULL,
    "target_resource_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "instructions" TEXT,
    "completed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vas_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_integration_instances" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SANDBOX',
    "health" TEXT NOT NULL DEFAULT 'MISSING_CREDENTIALS',
    "credential_refs" JSONB,
    "supported_flows" JSONB,
    "metadata" JSONB,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_integration_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_integration_events" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "flow" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "request_hash" TEXT,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "replayable" BOOLEAN NOT NULL DEFAULT true,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_integration_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_edi_documents" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "partner_code" TEXT NOT NULL,
    "transaction_set" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "document_hash" TEXT NOT NULL,
    "raw_document_ref" TEXT,
    "mapped_entities" JSONB,
    "warnings" JSONB,
    "ack_status" TEXT NOT NULL DEFAULT 'PENDING',
    "replayable" BOOLEAN NOT NULL DEFAULT true,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_edi_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_print_stations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "assigned_stations" JSONB,
    "default_template" TEXT,
    "heartbeat_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_print_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_print_jobs" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "station_code" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT NOT NULL,
    "payload" JSONB,
    "last_error" TEXT,
    "reprint_of" UUID,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_print_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_rf_device_sessions" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "device_code" TEXT NOT NULL,
    "worker_code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "current_flow" TEXT NOT NULL,
    "offline_queue" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_rf_device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_return_workbench_cases" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "rma_number" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "inspection_notes" TEXT,
    "photo_refs" JSONB,
    "financial_impact" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_return_workbench_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_warehouse_layout_versions" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "layout" JSONB NOT NULL,
    "change_note" TEXT,
    "created_by_user_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_warehouse_layout_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_slotting_recommendations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "current_location" TEXT NOT NULL,
    "recommended_location" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "expected_travel_reduction_percent" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_slotting_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_labor_shift_snapshots" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "shift_code" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kpis" JSONB NOT NULL,
    "worker_rows" JSONB NOT NULL,
    "supervisor_actions" JSONB,

    CONSTRAINT "enterprise_labor_shift_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_billing_export_batches" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "client_code" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "invoice_count" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "warnings" JSONB,
    "approved_by" TEXT,
    "exported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_billing_export_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enterprise_customer_portal_access" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "visible_warehouses" JSONB NOT NULL,
    "report_permissions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_customer_portal_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

CREATE INDEX "user_roles_warehouse_id_idx" ON "user_roles"("warehouse_id");

CREATE UNIQUE INDEX "wms_clients_code_key" ON "wms_clients"("code");

CREATE INDEX "wms_clients_status_idx" ON "wms_clients"("status");

CREATE INDEX "client_warehouses_warehouse_id_is_active_idx" ON "client_warehouses"("warehouse_id", "is_active");

CREATE UNIQUE INDEX "client_warehouses_client_id_warehouse_id_key" ON "client_warehouses"("client_id", "warehouse_id");

CREATE INDEX "client_sku_aliases_warehouse_id_sku_id_idx" ON "client_sku_aliases"("warehouse_id", "sku_id");

CREATE INDEX "client_sku_aliases_client_barcode_idx" ON "client_sku_aliases"("client_barcode");

CREATE UNIQUE INDEX "client_sku_aliases_client_id_client_sku_key" ON "client_sku_aliases"("client_id", "client_sku");

CREATE INDEX "client_resource_links_client_id_resource_type_idx" ON "client_resource_links"("client_id", "resource_type");

CREATE INDEX "client_resource_links_warehouse_id_client_id_idx" ON "client_resource_links"("warehouse_id", "client_id");

CREATE UNIQUE INDEX "client_resource_links_warehouse_id_resource_type_resource_i_key" ON "client_resource_links"("warehouse_id", "resource_type", "resource_id");

CREATE INDEX "user_client_access_client_id_warehouse_id_is_active_idx" ON "user_client_access"("client_id", "warehouse_id", "is_active");

CREATE UNIQUE INDEX "user_client_access_user_id_client_id_warehouse_id_key" ON "user_client_access"("user_id", "client_id", "warehouse_id");

CREATE INDEX "client_rate_cards_warehouse_id_client_id_is_active_valid_fr_idx" ON "client_rate_cards"("warehouse_id", "client_id", "is_active", "valid_from");

CREATE INDEX "client_rates_event_type_idx" ON "client_rates"("event_type");

CREATE UNIQUE INDEX "client_rates_rate_card_id_event_type_unit_key" ON "client_rates"("rate_card_id", "event_type", "unit");

CREATE UNIQUE INDEX "invoice_number_sequences_warehouse_id_client_id_year_prefix_key" ON "invoice_number_sequences"("warehouse_id", "client_id", "year", "prefix");

CREATE INDEX "storage_occupancy_snapshots_warehouse_id_client_id_snapshot_idx" ON "storage_occupancy_snapshots"("warehouse_id", "client_id", "snapshot_date");

CREATE UNIQUE INDEX "storage_occupancy_snapshots_warehouse_id_client_id_sku_id_l_key" ON "storage_occupancy_snapshots"("warehouse_id", "client_id", "sku_id", "location_id", "stock_quant_id", "snapshot_date");

CREATE INDEX "billing_period_closes_warehouse_id_client_id_status_idx" ON "billing_period_closes"("warehouse_id", "client_id", "status");

CREATE UNIQUE INDEX "billing_period_closes_warehouse_id_client_id_period_start_p_key" ON "billing_period_closes"("warehouse_id", "client_id", "period_start", "period_end");

CREATE INDEX "billing_events_warehouse_id_status_occurred_at_idx" ON "billing_events"("warehouse_id", "status", "occurred_at");

CREATE INDEX "billing_events_client_id_status_occurred_at_idx" ON "billing_events"("client_id", "status", "occurred_at");

CREATE INDEX "billing_events_resource_type_resource_id_idx" ON "billing_events"("resource_type", "resource_id");

CREATE UNIQUE INDEX "billing_events_client_id_reference_key" ON "billing_events"("client_id", "reference");

CREATE INDEX "billing_invoices_warehouse_id_client_id_status_period_start_idx" ON "billing_invoices"("warehouse_id", "client_id", "status", "period_start");

CREATE UNIQUE INDEX "billing_invoices_client_id_invoice_number_key" ON "billing_invoices"("client_id", "invoice_number");

CREATE UNIQUE INDEX "billing_invoice_lines_billing_event_id_key" ON "billing_invoice_lines"("billing_event_id");

CREATE INDEX "billing_invoice_lines_invoice_id_idx" ON "billing_invoice_lines"("invoice_id");

CREATE INDEX "billing_invoice_lines_event_type_idx" ON "billing_invoice_lines"("event_type");

CREATE UNIQUE INDEX "billing_invoice_lines_invoice_id_line_number_key" ON "billing_invoice_lines"("invoice_id", "line_number");

CREATE INDEX "billing_credit_notes_warehouse_id_client_id_status_created__idx" ON "billing_credit_notes"("warehouse_id", "client_id", "status", "created_at");

CREATE INDEX "billing_credit_notes_invoice_id_idx" ON "billing_credit_notes"("invoice_id");

CREATE UNIQUE INDEX "billing_credit_notes_client_id_credit_note_number_key" ON "billing_credit_notes"("client_id", "credit_note_number");

CREATE INDEX "billing_credit_note_lines_invoice_line_id_idx" ON "billing_credit_note_lines"("invoice_line_id");

CREATE INDEX "billing_credit_note_lines_event_type_idx" ON "billing_credit_note_lines"("event_type");

CREATE UNIQUE INDEX "billing_credit_note_lines_credit_note_id_line_number_key" ON "billing_credit_note_lines"("credit_note_id", "line_number");

CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

CREATE INDEX "warehouse_locations_warehouse_id_type_idx" ON "warehouse_locations"("warehouse_id", "type");

CREATE INDEX "warehouse_locations_warehouse_id_zone_pick_sequence_idx" ON "warehouse_locations"("warehouse_id", "zone", "pick_sequence");

CREATE INDEX "warehouse_locations_parent_id_idx" ON "warehouse_locations"("parent_id");

CREATE UNIQUE INDEX "warehouse_locations_warehouse_id_code_key" ON "warehouse_locations"("warehouse_id", "code");

CREATE UNIQUE INDEX "warehouse_locations_warehouse_id_barcode_key" ON "warehouse_locations"("warehouse_id", "barcode");

CREATE INDEX "parcels_warehouse_id_status_idx" ON "parcels"("warehouse_id", "status");

CREATE INDEX "parcels_current_location_id_idx" ON "parcels"("current_location_id");

CREATE UNIQUE INDEX "parcels_warehouse_id_tracking_number_key" ON "parcels"("warehouse_id", "tracking_number");

CREATE INDEX "tracking_events_warehouse_id_occurred_at_idx" ON "tracking_events"("warehouse_id", "occurred_at");

CREATE INDEX "tracking_events_parcel_id_occurred_at_idx" ON "tracking_events"("parcel_id", "occurred_at");

CREATE INDEX "tracking_events_type_occurred_at_idx" ON "tracking_events"("type", "occurred_at");

CREATE INDEX "wms_exceptions_warehouse_id_status_idx" ON "wms_exceptions"("warehouse_id", "status");

CREATE INDEX "wms_exceptions_parcel_id_idx" ON "wms_exceptions"("parcel_id");

CREATE INDEX "wms_exceptions_location_id_idx" ON "wms_exceptions"("location_id");

CREATE INDEX "wms_exceptions_created_by_user_id_idx" ON "wms_exceptions"("created_by_user_id");

CREATE INDEX "wms_exceptions_severity_status_idx" ON "wms_exceptions"("severity", "status");

CREATE INDEX "inbound_shipments_warehouse_id_status_idx" ON "inbound_shipments"("warehouse_id", "status");

CREATE INDEX "inbound_shipments_warehouse_id_owner_client_id_idx" ON "inbound_shipments"("warehouse_id", "owner_client_id");

CREATE INDEX "inbound_shipments_dock_location_id_idx" ON "inbound_shipments"("dock_location_id");

CREATE INDEX "inbound_shipments_warehouse_id_appointment_start_at_idx" ON "inbound_shipments"("warehouse_id", "appointment_start_at");

CREATE INDEX "inbound_shipments_warehouse_id_supplier_reference_idx" ON "inbound_shipments"("warehouse_id", "supplier_reference");

CREATE INDEX "inbound_shipments_warehouse_id_purchase_order_reference_idx" ON "inbound_shipments"("warehouse_id", "purchase_order_reference");

CREATE UNIQUE INDEX "inbound_shipments_warehouse_id_shipment_number_key" ON "inbound_shipments"("warehouse_id", "shipment_number");

CREATE INDEX "inbound_shipment_lines_parcel_id_idx" ON "inbound_shipment_lines"("parcel_id");

CREATE UNIQUE INDEX "inbound_shipment_lines_shipment_id_line_number_key" ON "inbound_shipment_lines"("shipment_id", "line_number");

CREATE INDEX "outbound_orders_warehouse_id_status_idx" ON "outbound_orders"("warehouse_id", "status");

CREATE INDEX "outbound_orders_warehouse_id_owner_client_id_idx" ON "outbound_orders"("warehouse_id", "owner_client_id");

CREATE UNIQUE INDEX "outbound_orders_warehouse_id_order_number_key" ON "outbound_orders"("warehouse_id", "order_number");

CREATE INDEX "outbound_order_lines_parcel_id_idx" ON "outbound_order_lines"("parcel_id");

CREATE UNIQUE INDEX "outbound_order_lines_order_id_line_number_key" ON "outbound_order_lines"("order_id", "line_number");

CREATE INDEX "scanner_devices_warehouse_id_status_idx" ON "scanner_devices"("warehouse_id", "status");

CREATE UNIQUE INDEX "scanner_devices_warehouse_id_code_key" ON "scanner_devices"("warehouse_id", "code");

CREATE INDEX "label_templates_warehouse_id_type_idx" ON "label_templates"("warehouse_id", "type");

CREATE UNIQUE INDEX "label_templates_warehouse_id_code_key" ON "label_templates"("warehouse_id", "code");

CREATE INDEX "label_print_jobs_warehouse_id_status_idx" ON "label_print_jobs"("warehouse_id", "status");

CREATE INDEX "label_print_jobs_parcel_id_idx" ON "label_print_jobs"("parcel_id");

CREATE INDEX "notifications_warehouse_id_status_idx" ON "notifications"("warehouse_id", "status");

CREATE INDEX "notifications_user_id_status_idx" ON "notifications"("user_id", "status");

CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

CREATE INDEX "products_status_idx" ON "products"("status");

CREATE UNIQUE INDEX "skus_code_key" ON "skus"("code");

CREATE UNIQUE INDEX "skus_barcode_key" ON "skus"("barcode");

CREATE INDEX "skus_product_id_idx" ON "skus"("product_id");

CREATE INDEX "skus_status_idx" ON "skus"("status");

CREATE INDEX "handling_units_current_location_id_idx" ON "handling_units"("current_location_id");

CREATE INDEX "handling_units_parent_id_idx" ON "handling_units"("parent_id");

CREATE INDEX "handling_units_warehouse_id_status_idx" ON "handling_units"("warehouse_id", "status");

CREATE INDEX "handling_units_warehouse_id_owner_client_id_idx" ON "handling_units"("warehouse_id", "owner_client_id");

CREATE UNIQUE INDEX "handling_units_warehouse_id_code_key" ON "handling_units"("warehouse_id", "code");

CREATE INDEX "stock_quants_warehouse_id_status_idx" ON "stock_quants"("warehouse_id", "status");

CREATE INDEX "stock_quants_warehouse_id_owner_client_id_idx" ON "stock_quants"("warehouse_id", "owner_client_id");

CREATE INDEX "stock_quants_warehouse_id_owner_client_id_status_idx" ON "stock_quants"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "stock_quants_warehouse_id_sku_id_status_idx" ON "stock_quants"("warehouse_id", "sku_id", "status");

CREATE INDEX "stock_quants_location_id_idx" ON "stock_quants"("location_id");

CREATE INDEX "stock_quants_sku_id_expiry_date_idx" ON "stock_quants"("sku_id", "expiry_date");

CREATE INDEX "stock_quants_lot_id_idx" ON "stock_quants"("lot_id");

CREATE INDEX "stock_quants_handling_unit_id_idx" ON "stock_quants"("handling_unit_id");

CREATE INDEX "reservations_warehouse_id_status_idx" ON "reservations"("warehouse_id", "status");

CREATE INDEX "reservations_warehouse_id_owner_client_id_status_idx" ON "reservations"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "reservations_outbound_order_id_idx" ON "reservations"("outbound_order_id");

CREATE INDEX "reservations_outbound_order_line_id_idx" ON "reservations"("outbound_order_line_id");

CREATE INDEX "reservations_stock_quant_id_idx" ON "reservations"("stock_quant_id");

CREATE INDEX "reservations_sku_id_idx" ON "reservations"("sku_id");

CREATE INDEX "warehouse_tasks_warehouse_id_status_idx" ON "warehouse_tasks"("warehouse_id", "status");

CREATE INDEX "warehouse_tasks_warehouse_id_owner_client_id_status_idx" ON "warehouse_tasks"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "warehouse_tasks_warehouse_id_type_idx" ON "warehouse_tasks"("warehouse_id", "type");

CREATE INDEX "warehouse_tasks_warehouse_id_type_status_priority_idx" ON "warehouse_tasks"("warehouse_id", "type", "status", "priority");

CREATE INDEX "warehouse_tasks_warehouse_id_due_at_idx" ON "warehouse_tasks"("warehouse_id", "due_at");

CREATE INDEX "warehouse_tasks_assigned_user_id_status_idx" ON "warehouse_tasks"("assigned_user_id", "status");

CREATE INDEX "warehouse_tasks_sku_id_idx" ON "warehouse_tasks"("sku_id");

CREATE INDEX "warehouse_tasks_from_location_id_idx" ON "warehouse_tasks"("from_location_id");

CREATE INDEX "warehouse_tasks_to_location_id_idx" ON "warehouse_tasks"("to_location_id");

CREATE INDEX "warehouse_tasks_outbound_order_id_idx" ON "warehouse_tasks"("outbound_order_id");

CREATE INDEX "warehouse_tasks_reservation_id_idx" ON "warehouse_tasks"("reservation_id");

CREATE INDEX "stock_movements_warehouse_id_occurred_at_idx" ON "stock_movements"("warehouse_id", "occurred_at");

CREATE INDEX "stock_movements_warehouse_id_owner_client_id_occurred_at_idx" ON "stock_movements"("warehouse_id", "owner_client_id", "occurred_at");

CREATE INDEX "stock_movements_sku_id_occurred_at_idx" ON "stock_movements"("sku_id", "occurred_at");

CREATE INDEX "stock_movements_stock_quant_id_idx" ON "stock_movements"("stock_quant_id");

CREATE INDEX "stock_movements_reservation_id_idx" ON "stock_movements"("reservation_id");

CREATE INDEX "stock_movements_task_id_idx" ON "stock_movements"("task_id");

CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

CREATE UNIQUE INDEX "stock_movements_source_system_idempotency_key_key" ON "stock_movements"("source_system", "idempotency_key");

CREATE INDEX "idempotency_records_source_system_external_id_idx" ON "idempotency_records"("source_system", "external_id");

CREATE INDEX "idempotency_records_status_idx" ON "idempotency_records"("status");

CREATE UNIQUE INDEX "idempotency_records_source_system_idempotency_key_key" ON "idempotency_records"("source_system", "idempotency_key");

CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

CREATE INDEX "inbox_events_status_received_at_idx" ON "inbox_events"("status", "received_at");

CREATE INDEX "inbox_events_type_received_at_idx" ON "inbox_events"("type", "received_at");

CREATE UNIQUE INDEX "inbox_events_source_system_external_event_id_key" ON "inbox_events"("source_system", "external_event_id");

CREATE INDEX "scanner_sessions_warehouse_id_status_idx" ON "scanner_sessions"("warehouse_id", "status");

CREATE INDEX "scanner_sessions_scanner_device_id_status_idx" ON "scanner_sessions"("scanner_device_id", "status");

CREATE INDEX "scanner_sessions_user_id_status_idx" ON "scanner_sessions"("user_id", "status");

CREATE INDEX "scanner_sessions_task_id_status_idx" ON "scanner_sessions"("task_id", "status");

CREATE INDEX "scanner_workflow_steps_session_id_status_sequence_idx" ON "scanner_workflow_steps"("session_id", "status", "sequence");

CREATE INDEX "scanner_workflow_steps_warehouse_id_task_id_idx" ON "scanner_workflow_steps"("warehouse_id", "task_id");

CREATE INDEX "stock_freezes_warehouse_id_status_idx" ON "stock_freezes"("warehouse_id", "status");

CREATE INDEX "stock_freezes_plan_id_status_idx" ON "stock_freezes"("plan_id", "status");

CREATE INDEX "stock_freezes_location_id_status_idx" ON "stock_freezes"("location_id", "status");

CREATE INDEX "stock_freezes_stock_quant_id_status_idx" ON "stock_freezes"("stock_quant_id", "status");

CREATE INDEX "cycle_count_plans_warehouse_id_status_idx" ON "cycle_count_plans"("warehouse_id", "status");

CREATE UNIQUE INDEX "cycle_count_plans_warehouse_id_code_key" ON "cycle_count_plans"("warehouse_id", "code");

CREATE INDEX "cycle_count_tasks_warehouse_id_status_idx" ON "cycle_count_tasks"("warehouse_id", "status");

CREATE INDEX "cycle_count_tasks_plan_id_status_idx" ON "cycle_count_tasks"("plan_id", "status");

CREATE INDEX "cycle_count_tasks_warehouse_task_id_idx" ON "cycle_count_tasks"("warehouse_task_id");

CREATE INDEX "cycle_count_tasks_location_id_sku_id_idx" ON "cycle_count_tasks"("location_id", "sku_id");

CREATE INDEX "cycle_count_tasks_stock_quant_id_idx" ON "cycle_count_tasks"("stock_quant_id");

CREATE INDEX "replenishment_rules_warehouse_id_status_idx" ON "replenishment_rules"("warehouse_id", "status");

CREATE INDEX "replenishment_rules_warehouse_id_sku_id_idx" ON "replenishment_rules"("warehouse_id", "sku_id");

CREATE INDEX "replenishment_rules_pick_location_id_idx" ON "replenishment_rules"("pick_location_id");

CREATE UNIQUE INDEX "replenishment_rules_warehouse_id_code_key" ON "replenishment_rules"("warehouse_id", "code");

CREATE INDEX "replenishment_demands_warehouse_id_status_idx" ON "replenishment_demands"("warehouse_id", "status");

CREATE INDEX "replenishment_demands_rule_id_status_idx" ON "replenishment_demands"("rule_id", "status");

CREATE INDEX "replenishment_demands_warehouse_task_id_idx" ON "replenishment_demands"("warehouse_task_id");

CREATE INDEX "replenishment_demands_pick_location_id_idx" ON "replenishment_demands"("pick_location_id");

CREATE INDEX "packing_stations_warehouse_id_status_idx" ON "packing_stations"("warehouse_id", "status");

CREATE INDEX "packing_stations_location_id_idx" ON "packing_stations"("location_id");

CREATE UNIQUE INDEX "packing_stations_warehouse_id_code_key" ON "packing_stations"("warehouse_id", "code");

CREATE INDEX "shipments_warehouse_id_status_idx" ON "shipments"("warehouse_id", "status");

CREATE INDEX "shipments_warehouse_id_owner_client_id_status_idx" ON "shipments"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "shipments_outbound_order_id_idx" ON "shipments"("outbound_order_id");

CREATE INDEX "shipments_packing_station_id_idx" ON "shipments"("packing_station_id");

CREATE UNIQUE INDEX "shipments_warehouse_id_shipment_number_key" ON "shipments"("warehouse_id", "shipment_number");

CREATE INDEX "shipment_packages_shipment_id_status_idx" ON "shipment_packages"("shipment_id", "status");

CREATE INDEX "shipment_packages_warehouse_id_owner_client_id_status_idx" ON "shipment_packages"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "shipment_packages_outbound_order_id_idx" ON "shipment_packages"("outbound_order_id");

CREATE UNIQUE INDEX "shipment_packages_warehouse_id_package_code_key" ON "shipment_packages"("warehouse_id", "package_code");

CREATE INDEX "package_contents_package_id_idx" ON "package_contents"("package_id");

CREATE INDEX "package_contents_outbound_order_line_id_idx" ON "package_contents"("outbound_order_line_id");

CREATE INDEX "carrier_labels_warehouse_id_status_idx" ON "carrier_labels"("warehouse_id", "status");

CREATE INDEX "carrier_labels_warehouse_id_owner_client_id_status_idx" ON "carrier_labels"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "carrier_labels_shipment_id_idx" ON "carrier_labels"("shipment_id");

CREATE INDEX "carrier_labels_package_id_idx" ON "carrier_labels"("package_id");

CREATE UNIQUE INDEX "carrier_labels_warehouse_id_label_reference_key" ON "carrier_labels"("warehouse_id", "label_reference");

CREATE INDEX "pick_waves_warehouse_id_status_priority_idx" ON "pick_waves"("warehouse_id", "status", "priority");

CREATE INDEX "pick_waves_warehouse_id_owner_client_id_status_idx" ON "pick_waves"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "pick_waves_warehouse_id_cutoff_at_idx" ON "pick_waves"("warehouse_id", "cutoff_at");

CREATE INDEX "pick_waves_warehouse_id_carrier_idx" ON "pick_waves"("warehouse_id", "carrier");

CREATE UNIQUE INDEX "pick_waves_warehouse_id_wave_number_key" ON "pick_waves"("warehouse_id", "wave_number");

CREATE INDEX "pick_wave_orders_warehouse_id_status_idx" ON "pick_wave_orders"("warehouse_id", "status");

CREATE INDEX "pick_wave_orders_outbound_order_id_idx" ON "pick_wave_orders"("outbound_order_id");

CREATE UNIQUE INDEX "pick_wave_orders_wave_id_outbound_order_id_key" ON "pick_wave_orders"("wave_id", "outbound_order_id");

CREATE INDEX "pick_wave_tasks_warehouse_id_status_idx" ON "pick_wave_tasks"("warehouse_id", "status");

CREATE INDEX "pick_wave_tasks_warehouse_task_id_idx" ON "pick_wave_tasks"("warehouse_task_id");

CREATE UNIQUE INDEX "pick_wave_tasks_wave_id_warehouse_task_id_key" ON "pick_wave_tasks"("wave_id", "warehouse_task_id");

CREATE INDEX "pick_carts_warehouse_id_status_idx" ON "pick_carts"("warehouse_id", "status");

CREATE INDEX "pick_carts_wave_id_idx" ON "pick_carts"("wave_id");

CREATE INDEX "pick_carts_assigned_user_id_idx" ON "pick_carts"("assigned_user_id");

CREATE UNIQUE INDEX "pick_carts_warehouse_id_code_key" ON "pick_carts"("warehouse_id", "code");

CREATE INDEX "pick_totes_warehouse_id_status_idx" ON "pick_totes"("warehouse_id", "status");

CREATE INDEX "pick_totes_pick_cart_id_idx" ON "pick_totes"("pick_cart_id");

CREATE INDEX "pick_totes_wave_id_idx" ON "pick_totes"("wave_id");

CREATE INDEX "pick_totes_outbound_order_id_idx" ON "pick_totes"("outbound_order_id");

CREATE UNIQUE INDEX "pick_totes_warehouse_id_code_key" ON "pick_totes"("warehouse_id", "code");

CREATE INDEX "sku_lots_warehouse_id_owner_client_id_status_idx" ON "sku_lots"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "sku_lots_warehouse_id_sku_id_expiry_date_idx" ON "sku_lots"("warehouse_id", "sku_id", "expiry_date");

CREATE INDEX "sku_lots_supplier_lot_idx" ON "sku_lots"("supplier_lot");

CREATE UNIQUE INDEX "sku_lots_warehouse_id_sku_id_lot_code_key" ON "sku_lots"("warehouse_id", "sku_id", "lot_code");

CREATE INDEX "serial_numbers_warehouse_id_sku_id_status_idx" ON "serial_numbers"("warehouse_id", "sku_id", "status");

CREATE INDEX "serial_numbers_lot_id_idx" ON "serial_numbers"("lot_id");

CREATE INDEX "serial_numbers_stock_quant_id_idx" ON "serial_numbers"("stock_quant_id");

CREATE UNIQUE INDEX "serial_numbers_warehouse_id_serial_number_key" ON "serial_numbers"("warehouse_id", "serial_number");

CREATE INDEX "serial_number_events_serial_number_id_occurred_at_idx" ON "serial_number_events"("serial_number_id", "occurred_at");

CREATE INDEX "serial_number_events_warehouse_id_event_type_occurred_at_idx" ON "serial_number_events"("warehouse_id", "event_type", "occurred_at");

CREATE INDEX "warehouse_orders_warehouse_id_owner_client_id_status_idx" ON "warehouse_orders"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "warehouse_orders_warehouse_id_due_at_idx" ON "warehouse_orders"("warehouse_id", "due_at");

CREATE UNIQUE INDEX "warehouse_orders_warehouse_id_order_number_key" ON "warehouse_orders"("warehouse_id", "order_number");

CREATE INDEX "warehouse_order_lines_warehouse_id_status_idx" ON "warehouse_order_lines"("warehouse_id", "status");

CREATE INDEX "warehouse_order_lines_sku_id_idx" ON "warehouse_order_lines"("sku_id");

CREATE UNIQUE INDEX "warehouse_order_lines_warehouse_order_id_line_number_key" ON "warehouse_order_lines"("warehouse_order_id", "line_number");

CREATE INDEX "warehouse_order_tasks_warehouse_task_id_idx" ON "warehouse_order_tasks"("warehouse_task_id");

CREATE UNIQUE INDEX "warehouse_order_tasks_warehouse_order_id_warehouse_task_id_key" ON "warehouse_order_tasks"("warehouse_order_id", "warehouse_task_id");

CREATE UNIQUE INDEX "refresh_token_sessions_token_hash_key" ON "refresh_token_sessions"("token_hash");

CREATE INDEX "refresh_token_sessions_user_id_status_expires_at_idx" ON "refresh_token_sessions"("user_id", "status", "expires_at");

CREATE INDEX "refresh_token_sessions_family_id_created_at_idx" ON "refresh_token_sessions"("family_id", "created_at");

CREATE INDEX "mfa_totp_secrets_user_id_verified_at_idx" ON "mfa_totp_secrets"("user_id", "verified_at");

CREATE INDEX "rate_limit_buckets_reset_at_idx" ON "rate_limit_buckets"("reset_at");

CREATE INDEX "carrier_credentials_warehouse_id_status_idx" ON "carrier_credentials"("warehouse_id", "status");

CREATE INDEX "carrier_credentials_carrier_environment_idx" ON "carrier_credentials"("carrier", "environment");

CREATE UNIQUE INDEX "carrier_credentials_warehouse_id_carrier_environment_key" ON "carrier_credentials"("warehouse_id", "carrier", "environment");

CREATE INDEX "carrier_tracking_events_warehouse_id_carrier_occurred_at_idx" ON "carrier_tracking_events"("warehouse_id", "carrier", "occurred_at");

CREATE INDEX "carrier_tracking_events_tracking_number_occurred_at_idx" ON "carrier_tracking_events"("tracking_number", "occurred_at");

CREATE INDEX "carrier_tracking_events_label_reference_occurred_at_idx" ON "carrier_tracking_events"("label_reference", "occurred_at");

CREATE INDEX "carrier_tracking_events_shipment_id_occurred_at_idx" ON "carrier_tracking_events"("shipment_id", "occurred_at");

CREATE INDEX "carrier_tracking_events_package_id_occurred_at_idx" ON "carrier_tracking_events"("package_id", "occurred_at");

CREATE INDEX "carrier_tracking_events_status_occurred_at_idx" ON "carrier_tracking_events"("status", "occurred_at");

CREATE UNIQUE INDEX "carrier_tracking_events_warehouse_carrier_external_key" ON "carrier_tracking_events"("warehouse_id", "carrier", "external_event_id");

CREATE INDEX "slotting_rules_warehouse_id_status_idx" ON "slotting_rules"("warehouse_id", "status");

CREATE INDEX "slotting_rules_warehouse_id_zone_idx" ON "slotting_rules"("warehouse_id", "zone");

CREATE UNIQUE INDEX "slotting_rules_warehouse_id_code_key" ON "slotting_rules"("warehouse_id", "code");

CREATE INDEX "sku_velocities_warehouse_id_velocity_score_idx" ON "sku_velocities"("warehouse_id", "velocity_score");

CREATE INDEX "sku_velocities_sku_id_idx" ON "sku_velocities"("sku_id");

CREATE UNIQUE INDEX "sku_velocities_warehouse_id_sku_code_key" ON "sku_velocities"("warehouse_id", "sku_code");

CREATE INDEX "slotting_recommendations_warehouse_id_status_priority_idx" ON "slotting_recommendations"("warehouse_id", "status", "priority");

CREATE INDEX "slotting_recommendations_warehouse_id_sku_code_idx" ON "slotting_recommendations"("warehouse_id", "sku_code");

CREATE INDEX "slotting_recommendations_from_location_id_idx" ON "slotting_recommendations"("from_location_id");

CREATE INDEX "slotting_recommendations_to_location_id_idx" ON "slotting_recommendations"("to_location_id");

CREATE UNIQUE INDEX "integration_endpoints_code_key" ON "integration_endpoints"("code");

CREATE INDEX "integration_endpoints_status_idx" ON "integration_endpoints"("status");

CREATE INDEX "integration_endpoints_type_status_idx" ON "integration_endpoints"("type", "status");

CREATE INDEX "integration_dispatch_logs_endpoint_id_created_at_idx" ON "integration_dispatch_logs"("endpoint_id", "created_at");

CREATE INDEX "integration_dispatch_logs_outbox_event_id_idx" ON "integration_dispatch_logs"("outbox_event_id");

CREATE INDEX "integration_dispatch_logs_event_type_created_at_idx" ON "integration_dispatch_logs"("event_type", "created_at");

CREATE INDEX "integration_dispatch_logs_success_created_at_idx" ON "integration_dispatch_logs"("success", "created_at");

CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

CREATE INDEX "audit_logs_warehouse_id_created_at_idx" ON "audit_logs"("warehouse_id", "created_at");

CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

CREATE INDEX "product_categories_parent_id_idx" ON "product_categories"("parent_id");

CREATE INDEX "product_categories_status_idx" ON "product_categories"("status");

CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");

CREATE INDEX "product_category_links_category_id_idx" ON "product_category_links"("category_id");

CREATE UNIQUE INDEX "product_category_links_product_id_category_id_key" ON "product_category_links"("product_id", "category_id");

CREATE INDEX "product_uoms_kind_is_active_idx" ON "product_uoms"("kind", "is_active");

CREATE UNIQUE INDEX "product_uoms_code_key" ON "product_uoms"("code");

CREATE INDEX "product_uom_conversions_sku_id_is_active_idx" ON "product_uom_conversions"("sku_id", "is_active");

CREATE INDEX "product_uom_conversions_product_id_is_active_idx" ON "product_uom_conversions"("product_id", "is_active");

CREATE UNIQUE INDEX "product_uom_conversions_from_uom_to_uom_product_id_sku_id_key" ON "product_uom_conversions"("from_uom", "to_uom", "product_id", "sku_id");

CREATE INDEX "sku_barcodes_warehouse_id_barcode_idx" ON "sku_barcodes"("warehouse_id", "barcode");

CREATE INDEX "sku_barcodes_barcode_type_idx" ON "sku_barcodes"("barcode_type");

CREATE UNIQUE INDEX "sku_barcodes_sku_id_barcode_key" ON "sku_barcodes"("sku_id", "barcode");

CREATE UNIQUE INDEX "sku_storage_requirements_sku_id_key" ON "sku_storage_requirements"("sku_id");

CREATE INDEX "sku_storage_requirements_fragile_hazardous_oversized_idx" ON "sku_storage_requirements"("fragile", "hazardous", "oversized");

CREATE INDEX "sku_packaging_levels_sku_id_units_per_level_idx" ON "sku_packaging_levels"("sku_id", "units_per_level");

CREATE UNIQUE INDEX "sku_packaging_levels_sku_id_level_code_key" ON "sku_packaging_levels"("sku_id", "level_code");

CREATE INDEX "product_client_ownerships_client_id_status_idx" ON "product_client_ownerships"("client_id", "status");

CREATE UNIQUE INDEX "product_client_ownerships_product_id_client_id_key" ON "product_client_ownerships"("product_id", "client_id");

CREATE INDEX "product_document_metadata_product_id_document_type_idx" ON "product_document_metadata"("product_id", "document_type");

CREATE INDEX "return_orders_warehouse_id_owner_client_id_status_idx" ON "return_orders"("warehouse_id", "owner_client_id", "status");

CREATE INDEX "return_orders_external_reference_idx" ON "return_orders"("external_reference");

CREATE UNIQUE INDEX "return_orders_warehouse_id_rma_number_key" ON "return_orders"("warehouse_id", "rma_number");

CREATE INDEX "return_order_lines_sku_id_status_idx" ON "return_order_lines"("sku_id", "status");

CREATE UNIQUE INDEX "return_order_lines_return_order_id_line_number_key" ON "return_order_lines"("return_order_id", "line_number");

CREATE INDEX "return_inspections_warehouse_id_created_at_idx" ON "return_inspections"("warehouse_id", "created_at");

CREATE INDEX "return_inspections_return_order_line_id_idx" ON "return_inspections"("return_order_line_id");

CREATE INDEX "quality_inspections_warehouse_id_status_idx" ON "quality_inspections"("warehouse_id", "status");

CREATE INDEX "quality_inspections_sku_id_lot_id_idx" ON "quality_inspections"("sku_id", "lot_id");

CREATE INDEX "quality_inspections_stock_quant_id_idx" ON "quality_inspections"("stock_quant_id");

CREATE UNIQUE INDEX "quality_inspections_warehouse_id_inspection_number_key" ON "quality_inspections"("warehouse_id", "inspection_number");

CREATE INDEX "quality_sampling_rules_warehouse_id_is_active_idx" ON "quality_sampling_rules"("warehouse_id", "is_active");

CREATE INDEX "quality_sampling_rules_client_id_sku_id_idx" ON "quality_sampling_rules"("client_id", "sku_id");

CREATE INDEX "external_systems_system_type_status_idx" ON "external_systems"("system_type", "status");

CREATE INDEX "external_systems_owner_client_id_idx" ON "external_systems"("owner_client_id");

CREATE UNIQUE INDEX "external_systems_code_key" ON "external_systems"("code");

CREATE INDEX "external_id_mappings_resource_type_resource_id_idx" ON "external_id_mappings"("resource_type", "resource_id");

CREATE INDEX "external_id_mappings_warehouse_id_owner_client_id_idx" ON "external_id_mappings"("warehouse_id", "owner_client_id");

CREATE UNIQUE INDEX "external_id_mappings_external_system_id_resource_type_exter_key" ON "external_id_mappings"("external_system_id", "resource_type", "external_id");

CREATE INDEX "integration_dead_letters_status_created_at_idx" ON "integration_dead_letters"("status", "created_at");

CREATE INDEX "integration_dead_letters_event_type_created_at_idx" ON "integration_dead_letters"("event_type", "created_at");

CREATE INDEX "integration_dead_letters_outbox_event_id_idx" ON "integration_dead_letters"("outbox_event_id");

CREATE UNIQUE INDEX "integration_dead_letters_fingerprint_key" ON "integration_dead_letters"("fingerprint");

CREATE INDEX "domain_events_warehouse_id_event_type_created_at_idx" ON "domain_events"("warehouse_id", "event_type", "created_at");

CREATE INDEX "domain_events_resource_type_resource_id_idx" ON "domain_events"("resource_type", "resource_id");

CREATE INDEX "domain_events_owner_client_id_created_at_idx" ON "domain_events"("owner_client_id", "created_at");

CREATE UNIQUE INDEX "domain_events_event_key_key" ON "domain_events"("event_key");

CREATE INDEX "webhook_subscriptions_warehouse_id_status_idx" ON "webhook_subscriptions"("warehouse_id", "status");

CREATE UNIQUE INDEX "webhook_subscriptions_warehouse_id_name_key" ON "webhook_subscriptions"("warehouse_id", "name");

CREATE INDEX "webhook_delivery_attempts_status_next_retry_at_created_at_idx" ON "webhook_delivery_attempts"("status", "next_retry_at", "created_at");

CREATE INDEX "webhook_delivery_attempts_domain_event_id_idx" ON "webhook_delivery_attempts"("domain_event_id");

CREATE UNIQUE INDEX "webhook_delivery_attempts_subscription_id_domain_event_id_a_key" ON "webhook_delivery_attempts"("subscription_id", "domain_event_id", "attempt_number");

CREATE INDEX "automation_devices_warehouse_id_device_type_status_idx" ON "automation_devices"("warehouse_id", "device_type", "status");

CREATE INDEX "automation_devices_last_heartbeat_at_idx" ON "automation_devices"("last_heartbeat_at");

CREATE UNIQUE INDEX "automation_devices_warehouse_id_code_key" ON "automation_devices"("warehouse_id", "code");

CREATE INDEX "automation_commands_warehouse_id_status_priority_created_at_idx" ON "automation_commands"("warehouse_id", "status", "priority", "created_at");

CREATE INDEX "automation_commands_device_id_status_idx" ON "automation_commands"("device_id", "status");

CREATE INDEX "automation_events_device_id_created_at_idx" ON "automation_events"("device_id", "created_at");

CREATE INDEX "automation_events_warehouse_id_event_type_created_at_idx" ON "automation_events"("warehouse_id", "event_type", "created_at");

CREATE INDEX "dock_doors_warehouse_id_status_idx" ON "dock_doors"("warehouse_id", "status");

CREATE UNIQUE INDEX "dock_doors_warehouse_id_code_key" ON "dock_doors"("warehouse_id", "code");

CREATE INDEX "yard_trailers_warehouse_id_status_idx" ON "yard_trailers"("warehouse_id", "status");

CREATE INDEX "yard_trailers_dock_door_id_status_idx" ON "yard_trailers"("dock_door_id", "status");

CREATE UNIQUE INDEX "yard_trailers_warehouse_id_trailer_number_key" ON "yard_trailers"("warehouse_id", "trailer_number");

CREATE INDEX "dock_appointments_warehouse_id_status_planned_start_at_idx" ON "dock_appointments"("warehouse_id", "status", "planned_start_at");

CREATE INDEX "dock_appointments_dock_door_id_planned_start_at_idx" ON "dock_appointments"("dock_door_id", "planned_start_at");

CREATE UNIQUE INDEX "dock_appointments_warehouse_id_appointment_number_key" ON "dock_appointments"("warehouse_id", "appointment_number");

CREATE INDEX "cross_dock_plans_warehouse_id_status_priority_created_at_idx" ON "cross_dock_plans"("warehouse_id", "status", "priority", "created_at");

CREATE INDEX "cross_dock_plans_inbound_shipment_id_outbound_order_id_idx" ON "cross_dock_plans"("inbound_shipment_id", "outbound_order_id");

CREATE INDEX "cross_dock_plan_lines_plan_id_idx" ON "cross_dock_plan_lines"("plan_id");

CREATE INDEX "cross_dock_plan_lines_sku_id_lot_id_idx" ON "cross_dock_plan_lines"("sku_id", "lot_id");

CREATE INDEX "vas_service_catalog_warehouse_id_service_type_status_idx" ON "vas_service_catalog"("warehouse_id", "service_type", "status");

CREATE UNIQUE INDEX "vas_service_catalog_warehouse_id_code_key" ON "vas_service_catalog"("warehouse_id", "code");

CREATE INDEX "kit_bom_headers_kit_sku_id_status_idx" ON "kit_bom_headers"("kit_sku_id", "status");

CREATE UNIQUE INDEX "kit_bom_headers_warehouse_id_code_version_key" ON "kit_bom_headers"("warehouse_id", "code", "version");

CREATE INDEX "kit_bom_lines_bom_id_idx" ON "kit_bom_lines"("bom_id");

CREATE INDEX "kit_bom_lines_component_sku_id_idx" ON "kit_bom_lines"("component_sku_id");

CREATE INDEX "vas_tasks_warehouse_id_status_created_at_idx" ON "vas_tasks"("warehouse_id", "status", "created_at");

CREATE INDEX "vas_tasks_target_resource_type_target_resource_id_idx" ON "vas_tasks"("target_resource_type", "target_resource_id");

CREATE INDEX "enterprise_integration_instances_warehouse_id_category_mode_idx" ON "enterprise_integration_instances"("warehouse_id", "category", "mode");

CREATE UNIQUE INDEX "enterprise_integration_instances_warehouse_id_code_key" ON "enterprise_integration_instances"("warehouse_id", "code");

CREATE INDEX "enterprise_integration_events_warehouse_id_state_received_a_idx" ON "enterprise_integration_events"("warehouse_id", "state", "received_at");

CREATE INDEX "enterprise_integration_events_integration_id_external_id_idx" ON "enterprise_integration_events"("integration_id", "external_id");

CREATE INDEX "enterprise_edi_documents_warehouse_id_partner_code_transact_idx" ON "enterprise_edi_documents"("warehouse_id", "partner_code", "transaction_set", "state");

CREATE INDEX "enterprise_edi_documents_document_hash_idx" ON "enterprise_edi_documents"("document_hash");

CREATE INDEX "enterprise_print_stations_warehouse_id_status_idx" ON "enterprise_print_stations"("warehouse_id", "status");

CREATE UNIQUE INDEX "enterprise_print_stations_warehouse_id_code_key" ON "enterprise_print_stations"("warehouse_id", "code");

CREATE INDEX "enterprise_print_jobs_warehouse_id_state_queued_at_idx" ON "enterprise_print_jobs"("warehouse_id", "state", "queued_at");

CREATE INDEX "enterprise_print_jobs_station_code_idx" ON "enterprise_print_jobs"("station_code");

CREATE INDEX "enterprise_rf_device_sessions_warehouse_id_device_code_stat_idx" ON "enterprise_rf_device_sessions"("warehouse_id", "device_code", "state");

CREATE INDEX "enterprise_rf_device_sessions_worker_code_state_idx" ON "enterprise_rf_device_sessions"("worker_code", "state");

CREATE INDEX "enterprise_return_workbench_cases_warehouse_id_state_dispos_idx" ON "enterprise_return_workbench_cases"("warehouse_id", "state", "disposition");

CREATE UNIQUE INDEX "enterprise_return_workbench_cases_warehouse_id_rma_number_key" ON "enterprise_return_workbench_cases"("warehouse_id", "rma_number");

CREATE INDEX "enterprise_warehouse_layout_versions_warehouse_id_status_idx" ON "enterprise_warehouse_layout_versions"("warehouse_id", "status");

CREATE UNIQUE INDEX "enterprise_warehouse_layout_versions_warehouse_id_version_key" ON "enterprise_warehouse_layout_versions"("warehouse_id", "version");

CREATE INDEX "enterprise_slotting_recommendations_warehouse_id_priority_s_idx" ON "enterprise_slotting_recommendations"("warehouse_id", "priority", "state");

CREATE INDEX "enterprise_labor_shift_snapshots_warehouse_id_shift_code_sn_idx" ON "enterprise_labor_shift_snapshots"("warehouse_id", "shift_code", "snapshot_at");

CREATE INDEX "enterprise_billing_export_batches_warehouse_id_client_code__idx" ON "enterprise_billing_export_batches"("warehouse_id", "client_code", "state");

CREATE INDEX "enterprise_customer_portal_access_user_id_status_idx" ON "enterprise_customer_portal_access"("user_id", "status");

CREATE UNIQUE INDEX "enterprise_customer_portal_access_client_id_user_id_key" ON "enterprise_customer_portal_access"("client_id", "user_id");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_warehouses" ADD CONSTRAINT "client_warehouses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_sku_aliases" ADD CONSTRAINT "client_sku_aliases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_resource_links" ADD CONSTRAINT "client_resource_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_client_access" ADD CONSTRAINT "user_client_access_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_rate_cards" ADD CONSTRAINT "client_rate_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_rate_cards" ADD CONSTRAINT "client_rate_cards_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_rates" ADD CONSTRAINT "client_rates_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "client_rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_number_sequences" ADD CONSTRAINT "invoice_number_sequences_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_number_sequences" ADD CONSTRAINT "invoice_number_sequences_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storage_occupancy_snapshots" ADD CONSTRAINT "storage_occupancy_snapshots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storage_occupancy_snapshots" ADD CONSTRAINT "storage_occupancy_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_period_closes" ADD CONSTRAINT "billing_period_closes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_period_closes" ADD CONSTRAINT "billing_period_closes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_invoice_lines" ADD CONSTRAINT "billing_invoice_lines_billing_event_id_fkey" FOREIGN KEY ("billing_event_id") REFERENCES "billing_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_credit_notes" ADD CONSTRAINT "billing_credit_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "wms_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_credit_notes" ADD CONSTRAINT "billing_credit_notes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_credit_notes" ADD CONSTRAINT "billing_credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_credit_note_lines" ADD CONSTRAINT "billing_credit_note_lines_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "billing_credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_credit_note_lines" ADD CONSTRAINT "billing_credit_note_lines_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "billing_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_locations" ADD CONSTRAINT "warehouse_locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "parcels" ADD CONSTRAINT "parcels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parcels" ADD CONSTRAINT "parcels_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tracking_events" ADD CONSTRAINT "tracking_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wms_exceptions" ADD CONSTRAINT "wms_exceptions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wms_exceptions" ADD CONSTRAINT "wms_exceptions_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wms_exceptions" ADD CONSTRAINT "wms_exceptions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wms_exceptions" ADD CONSTRAINT "wms_exceptions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inbound_shipments" ADD CONSTRAINT "inbound_shipments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbound_shipments" ADD CONSTRAINT "inbound_shipments_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inbound_shipments" ADD CONSTRAINT "inbound_shipments_dock_location_id_fkey" FOREIGN KEY ("dock_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inbound_shipment_lines" ADD CONSTRAINT "inbound_shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "inbound_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inbound_shipment_lines" ADD CONSTRAINT "inbound_shipment_lines_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_order_lines" ADD CONSTRAINT "outbound_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "outbound_order_lines" ADD CONSTRAINT "outbound_order_lines_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scanner_devices" ADD CONSTRAINT "scanner_devices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "label_templates" ADD CONSTRAINT "label_templates_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "label_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skus" ADD CONSTRAINT "skus_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "handling_units" ADD CONSTRAINT "handling_units_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "handling_units" ADD CONSTRAINT "handling_units_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "handling_units" ADD CONSTRAINT "handling_units_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "handling_units" ADD CONSTRAINT "handling_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "handling_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_quants" ADD CONSTRAINT "stock_quants_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_quants" ADD CONSTRAINT "stock_quants_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_quants" ADD CONSTRAINT "stock_quants_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "warehouse_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_quants" ADD CONSTRAINT "stock_quants_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_quants" ADD CONSTRAINT "stock_quants_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "sku_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_quants" ADD CONSTRAINT "stock_quants_handling_unit_id_fkey" FOREIGN KEY ("handling_unit_id") REFERENCES "handling_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_outbound_order_id_fkey" FOREIGN KEY ("outbound_order_id") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_outbound_order_line_id_fkey" FOREIGN KEY ("outbound_order_line_id") REFERENCES "outbound_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_stock_quant_id_fkey" FOREIGN KEY ("stock_quant_id") REFERENCES "stock_quants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_outbound_order_id_fkey" FOREIGN KEY ("outbound_order_id") REFERENCES "outbound_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_outbound_order_line_id_fkey" FOREIGN KEY ("outbound_order_line_id") REFERENCES "outbound_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_inbound_shipment_id_fkey" FOREIGN KEY ("inbound_shipment_id") REFERENCES "inbound_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_inbound_shipment_line_id_fkey" FOREIGN KEY ("inbound_shipment_line_id") REFERENCES "inbound_shipment_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_tasks" ADD CONSTRAINT "warehouse_tasks_handling_unit_id_fkey" FOREIGN KEY ("handling_unit_id") REFERENCES "handling_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_quant_id_fkey" FOREIGN KEY ("stock_quant_id") REFERENCES "stock_quants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "warehouse_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shipment_packages" ADD CONSTRAINT "shipment_packages_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "carrier_labels" ADD CONSTRAINT "carrier_labels_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pick_waves" ADD CONSTRAINT "pick_waves_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_waves" ADD CONSTRAINT "pick_waves_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pick_wave_orders" ADD CONSTRAINT "pick_wave_orders_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "pick_waves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_wave_orders" ADD CONSTRAINT "pick_wave_orders_outbound_order_id_fkey" FOREIGN KEY ("outbound_order_id") REFERENCES "outbound_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_wave_tasks" ADD CONSTRAINT "pick_wave_tasks_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "pick_waves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_wave_tasks" ADD CONSTRAINT "pick_wave_tasks_warehouse_task_id_fkey" FOREIGN KEY ("warehouse_task_id") REFERENCES "warehouse_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_carts" ADD CONSTRAINT "pick_carts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_carts" ADD CONSTRAINT "pick_carts_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "pick_waves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pick_totes" ADD CONSTRAINT "pick_totes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pick_totes" ADD CONSTRAINT "pick_totes_pick_cart_id_fkey" FOREIGN KEY ("pick_cart_id") REFERENCES "pick_carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pick_totes" ADD CONSTRAINT "pick_totes_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "pick_waves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pick_totes" ADD CONSTRAINT "pick_totes_outbound_order_id_fkey" FOREIGN KEY ("outbound_order_id") REFERENCES "outbound_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sku_lots" ADD CONSTRAINT "sku_lots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sku_lots" ADD CONSTRAINT "sku_lots_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sku_lots" ADD CONSTRAINT "sku_lots_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "sku_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_stock_quant_id_fkey" FOREIGN KEY ("stock_quant_id") REFERENCES "stock_quants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_last_seen_location_id_fkey" FOREIGN KEY ("last_seen_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_inbound_shipment_line_id_fkey" FOREIGN KEY ("inbound_shipment_line_id") REFERENCES "inbound_shipment_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_outbound_order_line_id_fkey" FOREIGN KEY ("outbound_order_line_id") REFERENCES "outbound_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_number_events" ADD CONSTRAINT "serial_number_events_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "serial_number_events" ADD CONSTRAINT "serial_number_events_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_number_events" ADD CONSTRAINT "serial_number_events_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "serial_number_events" ADD CONSTRAINT "serial_number_events_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_number_events" ADD CONSTRAINT "serial_number_events_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_number_events" ADD CONSTRAINT "serial_number_events_stock_quant_id_fkey" FOREIGN KEY ("stock_quant_id") REFERENCES "stock_quants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "serial_number_events" ADD CONSTRAINT "serial_number_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_lines" ADD CONSTRAINT "warehouse_order_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_lines" ADD CONSTRAINT "warehouse_order_lines_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_lines" ADD CONSTRAINT "warehouse_order_lines_warehouse_order_id_fkey" FOREIGN KEY ("warehouse_order_id") REFERENCES "warehouse_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_lines" ADD CONSTRAINT "warehouse_order_lines_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_lines" ADD CONSTRAINT "warehouse_order_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "sku_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_tasks" ADD CONSTRAINT "warehouse_order_tasks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_tasks" ADD CONSTRAINT "warehouse_order_tasks_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "wms_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_tasks" ADD CONSTRAINT "warehouse_order_tasks_warehouse_order_id_fkey" FOREIGN KEY ("warehouse_order_id") REFERENCES "warehouse_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_tasks" ADD CONSTRAINT "warehouse_order_tasks_warehouse_order_line_id_fkey" FOREIGN KEY ("warehouse_order_line_id") REFERENCES "warehouse_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_order_tasks" ADD CONSTRAINT "warehouse_order_tasks_warehouse_task_id_fkey" FOREIGN KEY ("warehouse_task_id") REFERENCES "warehouse_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refresh_token_sessions" ADD CONSTRAINT "refresh_token_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refresh_token_sessions" ADD CONSTRAINT "refresh_token_sessions_replaced_by_session_id_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "refresh_token_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mfa_totp_secrets" ADD CONSTRAINT "mfa_totp_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carrier_credentials" ADD CONSTRAINT "carrier_credentials_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "slotting_rules" ADD CONSTRAINT "slotting_rules_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sku_velocities" ADD CONSTRAINT "sku_velocities_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sku_velocities" ADD CONSTRAINT "sku_velocities_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "slotting_recommendations" ADD CONSTRAINT "slotting_recommendations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "slotting_recommendations" ADD CONSTRAINT "slotting_recommendations_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "slotting_recommendations" ADD CONSTRAINT "slotting_recommendations_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "slotting_recommendations" ADD CONSTRAINT "slotting_recommendations_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "warehouse_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_dispatch_logs" ADD CONSTRAINT "integration_dispatch_logs_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "integration_endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
