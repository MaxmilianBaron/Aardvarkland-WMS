import { normalizeOptionalResourceCode } from './clients.helpers';

export type OwnershipIntegritySeverity = 'INFO' | 'WARNING' | 'ERROR';

export type OwnershipIntegrityIssueCode =
  | 'DUPLICATE_RESOURCE_OWNER'
  | 'INHERITED_OWNER_MISSING_PARENT'
  | 'INHERITED_OWNER_MISMATCH';

export interface OwnershipLinkForIntegrity {
  id?: string | null;
  clientId: string;
  warehouseId?: string | null;
  resourceType: string;
  resourceId: string;
  metadata?: unknown;
}

export interface OwnershipIntegrityIssue {
  code: OwnershipIntegrityIssueCode;
  severity: OwnershipIntegritySeverity;
  resourceType: string;
  resourceId: string;
  clientId?: string | null;
  expectedClientId?: string | null;
  actualClientId?: string | null;
  relatedResourceType?: string | null;
  relatedResourceId?: string | null;
  linkIds: string[];
  message: string;
}

export interface OwnershipIntegritySummary {
  totalLinks: number;
  issueCount: number;
  issues: OwnershipIntegrityIssue[];
}

export function evaluateOwnershipIntegrity(links: OwnershipLinkForIntegrity[]): OwnershipIntegritySummary {
  const normalizedLinks = links.map(normalizeOwnershipLink).filter((link): link is NormalizedOwnershipLink => Boolean(link));
  const issues: OwnershipIntegrityIssue[] = [];
  const byResource = groupByResource(normalizedLinks);

  for (const group of byResource.values()) {
    const first = group[0];
    if (!first) continue;
    const clientIds = Array.from(new Set(group.map((link) => link.clientId).filter(Boolean)));
    if (clientIds.length > 1) {
      issues.push({
        code: 'DUPLICATE_RESOURCE_OWNER',
        severity: 'ERROR',
        resourceType: first.resourceType,
        resourceId: first.resourceId,
        actualClientId: clientIds.join(','),
        linkIds: group.map((link) => link.id).filter(Boolean),
        message: `Resource ${first.resourceType}:${first.resourceId} has multiple client owners.`,
      });
    }
  }

  for (const link of normalizedLinks) {
    const inheritedFrom = readInheritedFrom(link.metadata);
    if (!inheritedFrom) continue;

    const parent = byResource.get(resourceKey(inheritedFrom.resourceType, inheritedFrom.resourceId))?.[0] ?? null;
    if (!parent) {
      issues.push({
        code: 'INHERITED_OWNER_MISSING_PARENT',
        severity: 'WARNING',
        resourceType: link.resourceType,
        resourceId: link.resourceId,
        clientId: link.clientId,
        relatedResourceType: inheritedFrom.resourceType,
        relatedResourceId: inheritedFrom.resourceId,
        linkIds: [link.id].filter(Boolean),
        message: `Resource ${link.resourceType}:${link.resourceId} inherits ownership from ${inheritedFrom.resourceType}:${inheritedFrom.resourceId}, but the parent ownership link is missing.`,
      });
      continue;
    }

    if (parent.clientId !== link.clientId) {
      issues.push({
        code: 'INHERITED_OWNER_MISMATCH',
        severity: 'ERROR',
        resourceType: link.resourceType,
        resourceId: link.resourceId,
        expectedClientId: parent.clientId,
        actualClientId: link.clientId,
        relatedResourceType: parent.resourceType,
        relatedResourceId: parent.resourceId,
        linkIds: [link.id, parent.id].filter(Boolean),
        message: `Resource ${link.resourceType}:${link.resourceId} is owned by ${link.clientId}, but inherited parent ${parent.resourceType}:${parent.resourceId} is owned by ${parent.clientId}.`,
      });
    }
  }

  issues.sort(compareOwnershipIssues);
  return { totalLinks: normalizedLinks.length, issueCount: issues.length, issues };
}

function normalizeOwnershipLink(link: OwnershipLinkForIntegrity): NormalizedOwnershipLink | null {
  const resourceType = normalizeOptionalResourceCode(link.resourceType);
  const resourceId = link.resourceId?.trim();
  const clientId = link.clientId?.trim();
  if (!resourceType || !resourceId || !clientId) return null;
  return {
    id: link.id?.trim() ?? '',
    clientId,
    resourceType,
    resourceId,
    metadata: link.metadata,
  };
}

function groupByResource(links: NormalizedOwnershipLink[]): Map<string, NormalizedOwnershipLink[]> {
  const groups = new Map<string, NormalizedOwnershipLink[]>();
  for (const link of links) {
    const key = resourceKey(link.resourceType, link.resourceId);
    const group = groups.get(key) ?? [];
    group.push(link);
    groups.set(key, group);
  }
  return groups;
}

function readInheritedFrom(metadata: unknown): InheritedResourceReference | null {
  const record = toRecord(metadata);
  const flatType = normalizeOptionalResourceCode(readString(record['inheritedFromResourceType']));
  const flatId = readString(record['inheritedFromResourceId'])?.trim();
  if (flatType && flatId) return { resourceType: flatType, resourceId: flatId };

  const nested = toRecord(record['inheritedFrom']);
  const nestedType = normalizeOptionalResourceCode(readString(nested['resourceType']));
  const nestedId = readString(nested['resourceId'])?.trim();
  return nestedType && nestedId ? { resourceType: nestedType, resourceId: nestedId } : null;
}

function compareOwnershipIssues(a: OwnershipIntegrityIssue, b: OwnershipIntegrityIssue): number {
  const severityOrder: Record<OwnershipIntegritySeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };
  return (
    severityOrder[a.severity] - severityOrder[b.severity] ||
    a.code.localeCompare(b.code) ||
    a.resourceType.localeCompare(b.resourceType) ||
    a.resourceId.localeCompare(b.resourceId)
  );
}

function resourceKey(resourceType: string, resourceId: string): string {
  return `${resourceType}::${resourceId}`;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

interface NormalizedOwnershipLink {
  id: string;
  clientId: string;
  resourceType: string;
  resourceId: string;
  metadata?: unknown;
}

interface InheritedResourceReference {
  resourceType: string;
  resourceId: string;
}
