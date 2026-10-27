import { Injectable } from '@nestjs/common';

import { AnalyticsService, AnalyticsOverview } from '../analytics';
import { getRuntimeDelegate, safeRuntimeFindMany } from '../analytics/prisma-runtime';
import { PrismaService } from '../database';
import { ParcelStatus } from '../generated/prisma/client';
import {
  DecisionSupportEngineMetadata,
  ExceptionTriageRecommendation,
  ExceptionTriageResponse,
  OpsSummaryResponse,
} from './decision-support.types';
import { ExceptionTriageDto, ExceptionTriageFocus } from './dto/exception-triage.dto';
import { OpsSummaryDto } from './dto/ops-summary.dto';

type DynamicRecord = Record<string, unknown>;

const DECISION_SUPPORT_ENGINE: DecisionSupportEngineMetadata = {
  externalCalls: false,
  mode: 'local-rule-based',
  version: '0.1.0',
};

const OPEN_EXCEPTION_STATUSES = new Set(['OPEN', 'IN_PROGRESS']);
const HIGH_RISK_SEVERITIES = new Set(['CRITICAL', 'HIGH']);

@Injectable()
export class DecisionSupportService {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  async createOpsSummary(
    warehouseReference: string,
    dto: OpsSummaryDto = {},
  ): Promise<OpsSummaryResponse> {
    const overview = await this.analyticsService.getOverview(warehouseReference, {
      days: dto.lookbackDays,
    });
    const signals = buildOperationalSignals(overview);
    const risks = buildOperationalRisks(overview);
    const recommendedActions =
      dto.includeRecommendations === false ? [] : buildRecommendedActions(overview, risks);
    const openExceptions = overview.exceptions.available ? (overview.exceptions.open ?? 0) : null;

    return {
      generatedAt: new Date(),
      warehouse: overview.warehouse,
      engine: DECISION_SUPPORT_ENGINE,
      summary: buildSummary(overview, risks),
      metrics: {
        activeLocations: overview.locations.active,
        exceptionRatio: overview.parcels.exceptionRatio,
        openExceptions,
        parcelsTotal: overview.parcels.total,
        parcelsUpdatedInWindow: overview.parcels.updatedInWindow,
      },
      signals,
      risks,
      recommendedActions,
    };
  }

  async triageExceptions(
    warehouseReference: string,
    dto: ExceptionTriageDto = {},
  ): Promise<ExceptionTriageResponse> {
    const overview = await this.analyticsService.getOverview(warehouseReference);
    const limit = dto.limit ?? 20;
    const focus = dto.focus ?? ExceptionTriageFocus.Open;
    const records = await this.findExceptionRecords(overview.warehouse.id, limit, focus);

    if (records === null) {
      return {
        generatedAt: new Date(),
        warehouse: overview.warehouse,
        engine: DECISION_SUPPORT_ENGINE,
        source: {
          available: false,
          scanned: 0,
        },
        recommendations: [],
      };
    }

    const exceptionRecords = records
      .map(toRecord)
      .filter((record): record is DynamicRecord => record !== null)
      .filter((record) => matchesFocus(record, focus))
      .slice(0, limit);

    return {
      generatedAt: new Date(),
      warehouse: overview.warehouse,
      engine: DECISION_SUPPORT_ENGINE,
      source: {
        available: true,
        scanned: exceptionRecords.length,
      },
      recommendations: exceptionRecords.map(buildTriageRecommendation),
    };
  }

  private async findExceptionRecords(
    warehouseId: string,
    limit: number,
    focus: ExceptionTriageFocus,
  ): Promise<unknown[] | null> {
    const delegate = getRuntimeDelegate(this.prisma, 'wmsException');
    const statusFiltered = await safeRuntimeFindMany(delegate, {
      where: {
        warehouseId,
        ...(focus === ExceptionTriageFocus.All
          ? {}
          : { status: { in: Array.from(OPEN_EXCEPTION_STATUSES) } }),
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    });

    if (statusFiltered !== null) {
      return statusFiltered;
    }

    const orderedFallback = await safeRuntimeFindMany(delegate, {
      where: { warehouseId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return (
      orderedFallback ??
      (await safeRuntimeFindMany(delegate, {
        where: { warehouseId },
        take: limit,
      }))
    );
  }
}

function buildOperationalSignals(overview: AnalyticsOverview): string[] {
  const signals = [
    `${overview.parcels.total} parcels tracked in warehouse ${overview.warehouse.code}`,
    `${overview.parcels.updatedInWindow} parcels changed in the last ${overview.window.days} days`,
    `${overview.locations.active} active locations from ${overview.locations.total} configured locations`,
  ];
  const exceptionParcels = countParcelStatus(overview, ParcelStatus.EXCEPTION);
  const outboundWork =
    countParcelStatus(overview, ParcelStatus.PICKING) +
    countParcelStatus(overview, ParcelStatus.PACKED);

  if (exceptionParcels > 0) {
    signals.push(`${exceptionParcels} parcels are currently in EXCEPTION status`);
  }

  if (outboundWork > 0) {
    signals.push(`${outboundWork} parcels are in picking or packed states`);
  }

  if (overview.exceptions.available) {
    signals.push(`${overview.exceptions.open ?? 0} open WMS exceptions detected`);
  }

  return signals;
}

function buildOperationalRisks(overview: AnalyticsOverview): string[] {
  const risks: string[] = [];

  if (overview.parcels.exceptionRatio >= 0.1) {
    risks.push('Parcel exception ratio is above 10 percent.');
  }

  if ((overview.exceptions.open ?? 0) > 0) {
    risks.push('Open exceptions require supervisor triage.');
  }

  if (overview.locations.inactive > 0) {
    risks.push('Inactive locations exist and may reduce available warehouse capacity.');
  }

  if ((overview.labelJobs.failed ?? 0) > 0) {
    risks.push('Failed label print jobs can block packing or shipping.');
  }

  if ((overview.notifications.failed ?? 0) > 0) {
    risks.push('Failed notifications can hide operational events from downstream systems.');
  }

  return risks;
}

function buildRecommendedActions(overview: AnalyticsOverview, risks: string[]): string[] {
  const actions: string[] = [];

  if (risks.length === 0) {
    actions.push('Keep monitoring parcel flow and location utilization.');
  }

  if (overview.parcels.exceptionRatio >= 0.1 || (overview.exceptions.open ?? 0) > 0) {
    actions.push('Run exception triage and assign each open exception to an owner.');
  }

  if (overview.locations.inactive > 0) {
    actions.push('Review inactive locations before wave planning or replenishment.');
  }

  if ((overview.labelJobs.failed ?? 0) > 0) {
    actions.push('Check printer connectivity and requeue failed label jobs.');
  }

  if ((overview.notifications.failed ?? 0) > 0) {
    actions.push('Retry failed notifications after verifying integration credentials.');
  }

  return actions;
}

function buildSummary(overview: AnalyticsOverview, risks: string[]): string {
  const riskText =
    risks.length === 0
      ? 'No critical operational risks were detected by the local rule engine.'
      : risks[0];

  return `Warehouse ${overview.warehouse.code} has ${overview.parcels.total} parcels, ${overview.locations.active} active locations, and ${overview.parcels.updatedInWindow} parcel updates in the last ${overview.window.days} days. ${riskText}`;
}

function buildTriageRecommendation(record: DynamicRecord): ExceptionTriageRecommendation {
  const severity = normalizeUpper(readFirstString(record, ['severity', 'priority'])) ?? 'MEDIUM';
  const status = normalizeUpper(readFirstString(record, ['status'])) ?? 'OPEN';
  const descriptor = buildDescriptor(record);
  const rule = chooseTriageRule(severity, descriptor);
  const exceptionId = readFirstString(record, ['id', 'exceptionId']) ?? 'unknown';
  const signals = [`status=${status}`, `severity=${severity}`, ...rule.signals];

  return {
    exceptionId,
    category: rule.category,
    confidence: rule.confidence,
    priority: severityToPriority(severity),
    recommendedAction: rule.action,
    severity,
    signals,
    summary: descriptor || `Exception ${exceptionId}`,
  };
}

function chooseTriageRule(
  severity: string,
  descriptor: string,
): { action: string; category: string; confidence: number; signals: string[] } {
  const text = descriptor.toUpperCase();

  if (HIGH_RISK_SEVERITIES.has(severity)) {
    return {
      action: 'Escalate to shift lead, freeze affected workflow, and confirm customer impact.',
      category: 'HIGH_RISK',
      confidence: 0.86,
      signals: ['high_severity'],
    };
  }

  if (text.includes('LABEL') || text.includes('PRINT')) {
    return {
      action: 'Verify label template and printer state, then requeue the label job.',
      category: 'LABELING',
      confidence: 0.78,
      signals: ['label_or_print_signal'],
    };
  }

  if (text.includes('ADDRESS') || text.includes('RECIPIENT')) {
    return {
      action: 'Route to customer service for address validation before shipping.',
      category: 'ADDRESS',
      confidence: 0.74,
      signals: ['address_signal'],
    };
  }

  if (text.includes('DAMAGE') || text.includes('DAMAGED')) {
    return {
      action: 'Move goods to quarantine and request damage inspection.',
      category: 'DAMAGE',
      confidence: 0.76,
      signals: ['damage_signal'],
    };
  }

  if (text.includes('LOCATION') || text.includes('STOCK') || text.includes('INVENTORY')) {
    return {
      action: 'Assign inventory control to verify location, stock, and parcel scan history.',
      category: 'INVENTORY',
      confidence: 0.72,
      signals: ['inventory_signal'],
    };
  }

  return {
    action: 'Assign to warehouse operations for manual review and add a resolution note.',
    category: 'GENERAL',
    confidence: 0.58,
    signals: ['fallback_rule'],
  };
}

function matchesFocus(record: DynamicRecord, focus: ExceptionTriageFocus): boolean {
  if (focus === ExceptionTriageFocus.All) {
    return true;
  }

  const severity = normalizeUpper(readFirstString(record, ['severity', 'priority']));

  if (focus === ExceptionTriageFocus.HighRisk) {
    return severity === undefined || HIGH_RISK_SEVERITIES.has(severity);
  }

  const status = normalizeUpper(readFirstString(record, ['status']));

  return status === undefined || OPEN_EXCEPTION_STATUSES.has(status);
}

function buildDescriptor(record: DynamicRecord): string {
  return [
    readFirstString(record, ['code', 'type', 'category', 'reason']),
    readFirstString(record, ['title', 'message', 'description']),
    readFirstString(record, ['trackingNumber', 'parcelTrackingNumber', 'resourceReference']),
  ]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(' - ');
}

function countParcelStatus(overview: AnalyticsOverview, status: ParcelStatus): number {
  return overview.parcels.byStatus.find((item) => item.status === status)?.count ?? 0;
}

function severityToPriority(severity: string): 'low' | 'medium' | 'high' | 'critical' {
  if (severity === 'CRITICAL') {
    return 'critical';
  }

  if (severity === 'HIGH') {
    return 'high';
  }

  if (severity === 'LOW') {
    return 'low';
  }

  return 'medium';
}

function readFirstString(record: DynamicRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeUpper(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase();
}

function toRecord(value: unknown): DynamicRecord | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return value as DynamicRecord;
}
