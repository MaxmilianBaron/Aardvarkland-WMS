import {
  SlottingRecommendationReason,
  SlottingRecommendationStatus,
  SkuVelocityClass,
} from './slotting.types';

export interface VelocityScoreInput {
  picksLast30Days?: number | null;
  unitsPickedLast30Days?: number | null;
  replenishmentsLast30Days?: number | null;
}

export interface SlottingVelocityCandidate extends Required<VelocityScoreInput> {
  skuId?: string | null;
  skuCode: string;
  velocityScore: number;
  abcClass?: string | null;
}

export interface SlottingLocationCandidate {
  id: string;
  code: string;
  type: string;
  zone?: string | null;
  pickSequence?: number | null;
  isActive?: boolean | null;
}

export interface SlottingStockCandidate {
  skuId?: string | null;
  skuCode: string;
  locationId: string;
  locationCode: string;
  locationType: string;
  zone?: string | null;
  pickSequence?: number | null;
  quantity: number;
  reservedQuantity?: number | null;
}

export interface SlottingRuleCandidate {
  id?: string;
  code?: string;
  zone?: string | null;
  minVelocityScore?: number | null;
  maxVelocityScore?: number | null;
  targetLocationType?: string | null;
  maxPickSequence?: number | null;
  minPickFaceQuantity?: number | null;
}

export interface SlottingRecommendationDraft {
  skuId: string | null;
  skuCode: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  reason: SlottingRecommendationReason;
  priority: number;
  velocityScore: number;
  expectedTravelSavings: number | null;
  message: string;
  metadata: Record<string, unknown>;
}

export interface BuildSlottingRecommendationsInput {
  velocities: SlottingVelocityCandidate[];
  stock: SlottingStockCandidate[];
  locations: SlottingLocationCandidate[];
  rules?: SlottingRuleCandidate[];
  maxRecommendations?: number | null;
  minVelocityScore?: number | null;
  lowVelocityScore?: number | null;
}

const DEFAULT_MIN_VELOCITY_SCORE = 60;
const DEFAULT_LOW_VELOCITY_SCORE = 20;
const DEFAULT_MAX_RECOMMENDATIONS = 100;
const DEFAULT_PICK_SEQUENCE_LIMIT = 5000;

export function calculateVelocityScore(input: VelocityScoreInput): number {
  const picks = clampNonNegative(input.picksLast30Days);
  const units = clampNonNegative(input.unitsPickedLast30Days);
  const replenishments = clampNonNegative(input.replenishmentsLast30Days);
  const weightedScore = picks * 4 + units + replenishments * 6;
  return Math.min(100, weightedScore);
}

export function classifyVelocity(score: number): SkuVelocityClass {
  const safeScore = clampNonNegative(score);
  if (safeScore >= 75) return SkuVelocityClass.A;
  if (safeScore >= 45) return SkuVelocityClass.B;
  if (safeScore >= 15) return SkuVelocityClass.C;
  return SkuVelocityClass.D;
}

export function normalizeSlottingCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '-');
}

export function clampSlottingLimit(
  value: number | null | undefined,
  fallback = DEFAULT_MAX_RECOMMENDATIONS,
): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    return fallback;
  }
  return Math.min(value as number, 500);
}

export function canMutateSlottingRecommendation(status: string): boolean {
  return status === SlottingRecommendationStatus.OPEN;
}

export function buildSlottingRecommendations(
  input: BuildSlottingRecommendationsInput,
): SlottingRecommendationDraft[] {
  const maxRecommendations = clampSlottingLimit(input.maxRecommendations);
  const minVelocityScore = clampNonNegative(input.minVelocityScore ?? DEFAULT_MIN_VELOCITY_SCORE);
  const lowVelocityScore = clampNonNegative(input.lowVelocityScore ?? DEFAULT_LOW_VELOCITY_SCORE);
  const pickFaces = findTargetPickFaces(input.locations, input.rules);
  const reserveLocations = findReserveLocations(input.locations);
  const stockBySku = groupStockBySku(input.stock);
  const drafts: SlottingRecommendationDraft[] = [];

  for (const velocity of input.velocities) {
    const skuStock = stockBySku.get(velocity.skuCode) ?? [];
    const currentPickFaceStock = skuStock.filter((quant) => isPickFace(quant.locationType));
    const totalPickFaceAvailable = currentPickFaceStock.reduce(
      (sum, quant) => sum + availableQuantity(quant),
      0,
    );
    const bestCurrentPickFace = bestStockCandidate(currentPickFaceStock);
    const bestCurrentReserve = bestStockCandidate(
      skuStock.filter((quant) => !isPickFace(quant.locationType)),
    );
    const matchingRule = findMatchingRule(
      input.rules ?? [],
      velocity,
      bestCurrentPickFace ?? bestCurrentReserve,
    );
    const targetPickFace = pickBestTargetPickFace(pickFaces, matchingRule, skuStock);
    const targetReserve = pickBestReserveLocation(reserveLocations, skuStock);
    const targetMinPickFaceQuantity = matchingRule?.minPickFaceQuantity ?? 1;

    if (velocity.velocityScore >= minVelocityScore && targetPickFace) {
      const alreadyInGoodPickFace = currentPickFaceStock.some(
        (quant) =>
          quant.locationId === targetPickFace.id &&
          isGoodPickSequence(quant.pickSequence, matchingRule),
      );
      if (!alreadyInGoodPickFace && bestCurrentReserve) {
        drafts.push({
          skuId: velocity.skuId ?? null,
          skuCode: velocity.skuCode,
          fromLocationId: bestCurrentReserve.locationId,
          toLocationId: targetPickFace.id,
          reason: SlottingRecommendationReason.HIGH_VELOCITY_TO_PICK_FACE,
          priority: priorityForVelocity(velocity.velocityScore, 10),
          velocityScore: velocity.velocityScore,
          expectedTravelSavings: estimateTravelSavings(
            bestCurrentReserve.pickSequence,
            targetPickFace.pickSequence,
          ),
          message: `Move high-velocity SKU ${velocity.skuCode} closer to the pick path.`,
          metadata: {
            abcClass: velocity.abcClass ?? classifyVelocity(velocity.velocityScore),
            targetLocationCode: targetPickFace.code,
            sourceLocationCode: bestCurrentReserve.locationCode,
            ruleCode: matchingRule?.code ?? null,
          },
        });
      }

      if (totalPickFaceAvailable < targetMinPickFaceQuantity && bestCurrentReserve) {
        drafts.push({
          skuId: velocity.skuId ?? null,
          skuCode: velocity.skuCode,
          fromLocationId: bestCurrentReserve.locationId,
          toLocationId: bestCurrentPickFace?.locationId ?? targetPickFace.id,
          reason: SlottingRecommendationReason.PICK_FACE_BELOW_MIN,
          priority: priorityForVelocity(velocity.velocityScore, 20),
          velocityScore: velocity.velocityScore,
          expectedTravelSavings: estimateTravelSavings(
            bestCurrentReserve.pickSequence,
            targetPickFace.pickSequence,
          ),
          message: `Top up pick face for SKU ${velocity.skuCode}.`,
          metadata: {
            pickFaceAvailable: totalPickFaceAvailable,
            targetMinPickFaceQuantity,
            ruleCode: matchingRule?.code ?? null,
          },
        });
      }
    }

    if (velocity.velocityScore <= lowVelocityScore && targetReserve && bestCurrentPickFace) {
      drafts.push({
        skuId: velocity.skuId ?? null,
        skuCode: velocity.skuCode,
        fromLocationId: bestCurrentPickFace.locationId,
        toLocationId: targetReserve.id,
        reason: SlottingRecommendationReason.LOW_VELOCITY_TO_RESERVE,
        priority: 200 - Math.min(velocity.velocityScore, 100),
        velocityScore: velocity.velocityScore,
        expectedTravelSavings: null,
        message: `Move low-velocity SKU ${velocity.skuCode} out of premium pick-face space.`,
        metadata: {
          abcClass: velocity.abcClass ?? classifyVelocity(velocity.velocityScore),
          targetLocationCode: targetReserve.code,
          sourceLocationCode: bestCurrentPickFace.locationCode,
        },
      });
    }
  }

  return dedupeDrafts(drafts)
    .sort((a, b) =>
      a.priority === b.priority ? b.velocityScore - a.velocityScore : a.priority - b.priority,
    )
    .slice(0, maxRecommendations);
}

export function summarizeSlottingCandidates(input: BuildSlottingRecommendationsInput): {
  candidateSkus: number;
  highVelocitySkus: number;
  lowVelocitySkus: number;
  targetPickFaces: number;
  reserveLocations: number;
} {
  const minVelocityScore = clampNonNegative(input.minVelocityScore ?? DEFAULT_MIN_VELOCITY_SCORE);
  const lowVelocityScore = clampNonNegative(input.lowVelocityScore ?? DEFAULT_LOW_VELOCITY_SCORE);
  return {
    candidateSkus: input.velocities.length,
    highVelocitySkus: input.velocities.filter(
      (velocity) => velocity.velocityScore >= minVelocityScore,
    ).length,
    lowVelocitySkus: input.velocities.filter(
      (velocity) => velocity.velocityScore <= lowVelocityScore,
    ).length,
    targetPickFaces: findTargetPickFaces(input.locations, input.rules).length,
    reserveLocations: findReserveLocations(input.locations).length,
  };
}

function clampNonNegative(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value as number));
}

function groupStockBySku(stock: SlottingStockCandidate[]): Map<string, SlottingStockCandidate[]> {
  const result = new Map<string, SlottingStockCandidate[]>();
  for (const quant of stock) {
    const current = result.get(quant.skuCode) ?? [];
    current.push(quant);
    result.set(quant.skuCode, current);
  }
  return result;
}

function findTargetPickFaces(
  locations: SlottingLocationCandidate[],
  rules: SlottingRuleCandidate[] | undefined,
): SlottingLocationCandidate[] {
  const maxPickSequence = Math.min(
    ...[
      DEFAULT_PICK_SEQUENCE_LIMIT,
      ...(rules ?? []).map((rule) => rule.maxPickSequence).filter(isNumber),
    ],
  );
  return locations
    .filter((location) => (location.isActive ?? true) && isPickFace(location.type))
    .filter((location) => clampNonNegative(location.pickSequence) <= maxPickSequence)
    .sort((a, b) => clampNonNegative(a.pickSequence) - clampNonNegative(b.pickSequence));
}

function findReserveLocations(locations: SlottingLocationCandidate[]): SlottingLocationCandidate[] {
  return locations
    .filter((location) => (location.isActive ?? true) && !isPickFace(location.type))
    .sort((a, b) => clampNonNegative(b.pickSequence) - clampNonNegative(a.pickSequence));
}

function isPickFace(type: string): boolean {
  const normalized = type.toUpperCase();
  return (
    normalized === 'PICK' ||
    normalized === 'PICKING' ||
    normalized === 'PICK_FACE' ||
    normalized === 'BIN'
  );
}

function bestStockCandidate(stock: SlottingStockCandidate[]): SlottingStockCandidate | null {
  if (stock.length === 0) return null;
  return (
    [...stock].sort((a, b) => {
      const availableDiff = availableQuantity(b) - availableQuantity(a);
      if (availableDiff !== 0) return availableDiff;
      return clampNonNegative(a.pickSequence) - clampNonNegative(b.pickSequence);
    })[0] ?? null
  );
}

function pickBestTargetPickFace(
  locations: SlottingLocationCandidate[],
  rule: SlottingRuleCandidate | null,
  skuStock: SlottingStockCandidate[],
): SlottingLocationCandidate | null {
  const usedLocationIds = new Set(skuStock.map((stock) => stock.locationId));
  const candidates = locations.filter((location) => {
    if (usedLocationIds.has(location.id)) return false;
    if (rule?.zone && location.zone && location.zone.toUpperCase() !== rule.zone.toUpperCase())
      return false;
    if (
      rule?.targetLocationType &&
      location.type.toUpperCase() !== rule.targetLocationType.toUpperCase()
    )
      return false;
    return isGoodPickSequence(location.pickSequence, rule);
  });
  return candidates[0] ?? locations.find((location) => !usedLocationIds.has(location.id)) ?? null;
}

function pickBestReserveLocation(
  locations: SlottingLocationCandidate[],
  skuStock: SlottingStockCandidate[],
): SlottingLocationCandidate | null {
  const usedLocationIds = new Set(skuStock.map((stock) => stock.locationId));
  return locations.find((location) => !usedLocationIds.has(location.id)) ?? locations[0] ?? null;
}

function findMatchingRule(
  rules: SlottingRuleCandidate[],
  velocity: SlottingVelocityCandidate,
  currentStock: SlottingStockCandidate | null,
): SlottingRuleCandidate | null {
  return (
    rules.find((rule) => {
      if (
        rule.zone &&
        currentStock?.zone &&
        rule.zone.toUpperCase() !== currentStock.zone.toUpperCase()
      )
        return false;
      if (isNumber(rule.minVelocityScore) && velocity.velocityScore < rule.minVelocityScore)
        return false;
      if (isNumber(rule.maxVelocityScore) && velocity.velocityScore > rule.maxVelocityScore)
        return false;
      return true;
    }) ?? null
  );
}

function isGoodPickSequence(
  value: number | null | undefined,
  rule: SlottingRuleCandidate | null,
): boolean {
  const maxPickSequence = rule?.maxPickSequence ?? DEFAULT_PICK_SEQUENCE_LIMIT;
  return clampNonNegative(value) <= maxPickSequence;
}

function availableQuantity(stock: SlottingStockCandidate): number {
  return Math.max(0, stock.quantity - (stock.reservedQuantity ?? 0));
}

function priorityForVelocity(velocityScore: number, offset: number): number {
  return Math.max(1, offset + (100 - Math.min(100, Math.max(0, velocityScore))));
}

function estimateTravelSavings(
  fromSequence: number | null | undefined,
  toSequence: number | null | undefined,
): number | null {
  if (!isNumber(fromSequence) || !isNumber(toSequence)) return null;
  return Math.max(0, fromSequence - toSequence);
}

function dedupeDrafts(drafts: SlottingRecommendationDraft[]): SlottingRecommendationDraft[] {
  const seen = new Set<string>();
  const result: SlottingRecommendationDraft[] = [];
  for (const draft of drafts) {
    const key = [
      draft.skuCode,
      draft.reason,
      draft.fromLocationId ?? '',
      draft.toLocationId ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(draft);
  }
  return result;
}

function isNumber(value: number | null | undefined): value is number {
  return Number.isFinite(value);
}
