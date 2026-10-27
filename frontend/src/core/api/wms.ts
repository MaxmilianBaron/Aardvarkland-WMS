import { apiRequest, RequestOptions } from './http';

export type MutationBody = Record<string, unknown>;
export type QueryParams = Record<string, string | number | boolean>;
export type ReadOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export const endpoints = {
  health: () => '/health',
  healthReady: () => '/health/ready',
  healthStartup: () => '/health/startup',
  reliabilityAlerts: () => '/operations/reliability/alerts',
  reliabilityAlertDeliveries: () => '/operations/reliability/alerts/deliveries',
  reliabilityAlertDeliver: () => '/operations/reliability/alerts/deliver',
  reliabilityIncidents: () => '/operations/reliability/incidents',
  reliabilityIncidentAcknowledge: (incidentKey: string) => `/operations/reliability/incidents/${encodeURIComponent(incidentKey)}/acknowledge`,
  reliabilityIncidentResolve: (incidentKey: string) => `/operations/reliability/incidents/${encodeURIComponent(incidentKey)}/resolve`,
  reliabilityRetention: () => '/operations/reliability/retention',
  reliabilityRetentionRun: () => '/operations/reliability/retention/run',
  reliabilityRecovery: () => '/operations/reliability/recovery',
  reliabilityStartupPreflightRefresh: () => '/operations/reliability/startup-preflight/refresh',
  me: () => '/auth/me',
  products: () => '/products',
  skus: () => '/products/skus',
  warehouses: () => '/warehouses',
  warehouse: (warehouseId: string) => `/warehouses/${warehouseId}`,
  warehouseIntegrity: (warehouseId: string) => `/warehouses/${warehouseId}/integrity/check`,
  locations: (warehouseId: string) => `/warehouses/${warehouseId}/locations`,
  location: (warehouseId: string, locationId: string) => `/warehouses/${warehouseId}/locations/${locationId}`,
  putawaySuggest: (warehouseId: string) => `/warehouses/${warehouseId}/putaway/suggest`,
  putawayTasks: (warehouseId: string) => `/warehouses/${warehouseId}/putaway/tasks`,
  putawayConfirmTask: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/putaway/tasks/${taskId}/confirm`,
  returns: (warehouseId: string) => `/warehouses/${warehouseId}/returns`,
  returnLineReceive: (warehouseId: string, returnId: string, lineId: string) => `/warehouses/${warehouseId}/returns/${returnId}/lines/${lineId}/receive`,
  returnLineInspect: (warehouseId: string, returnId: string, lineId: string) => `/warehouses/${warehouseId}/returns/${returnId}/lines/${lineId}/inspect`,
  qualityInspections: (warehouseId: string) => `/warehouses/${warehouseId}/quality/inspections`,
  qualityInspectionComplete: (warehouseId: string, inspectionId: string) => `/warehouses/${warehouseId}/quality/inspections/${inspectionId}/complete`,
  qualityQuarantineRelease: (warehouseId: string, quantId: string) => `/warehouses/${warehouseId}/quality/quarantine/${quantId}/release`,
  qualitySamplingRules: (warehouseId: string) => `/warehouses/${warehouseId}/quality/sampling-rules`,
  cycleCounts: (warehouseId: string) => `/warehouses/${warehouseId}/cycle-counts`,
  cycleCountRelease: (warehouseId: string, planId: string) => `/warehouses/${warehouseId}/cycle-counts/${planId}/release`,
  cycleCountTasks: (warehouseId: string, planId: string) => `/warehouses/${warehouseId}/cycle-counts/${planId}/tasks`,
  cycleCountTaskSubmit: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/cycle-counts/tasks/${taskId}/submit`,
  cycleCountTaskApprove: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/cycle-counts/tasks/${taskId}/approve`,
  analyticsOverview: (warehouseId: string) => `/warehouses/${warehouseId}/analytics/overview`,
  controlTower: (warehouseId: string) => `/warehouses/${warehouseId}/control-tower/overview`,
  inboundShipments: (warehouseId: string) => `/warehouses/${warehouseId}/inbound-shipments`,
  receiveInbound: (warehouseId: string, shipmentId: string) => `/warehouses/${warehouseId}/inbound-shipments/${shipmentId}/receive`,
  stockQuants: (warehouseId: string) => `/warehouses/${warehouseId}/inventory/quants`,
  stockBalances: (warehouseId: string) => `/warehouses/${warehouseId}/inventory/balances`,
  stockMovements: (warehouseId: string) => `/warehouses/${warehouseId}/inventory/movements`,
  receiveStock: (warehouseId: string) => `/warehouses/${warehouseId}/inventory/quants/receive`,
  moveStock: (warehouseId: string) => `/warehouses/${warehouseId}/inventory/quants/move`,
  adjustStock: (warehouseId: string) => `/warehouses/${warehouseId}/inventory/quants/adjust`,
  outboundOrders: (warehouseId: string) => `/warehouses/${warehouseId}/outbound-orders`,
  allocateOrder: (warehouseId: string, orderId: string) => `/warehouses/${warehouseId}/outbound-orders/${orderId}/allocate`,
  releasePicking: (warehouseId: string, orderId: string) => `/warehouses/${warehouseId}/outbound-orders/${orderId}/release-picking`,
  warehouseTasks: (warehouseId: string) => `/warehouses/${warehouseId}/tasks`,
  claimNextTask: (warehouseId: string) => `/warehouses/${warehouseId}/tasks/claim-next`,
  startTask: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/tasks/${taskId}/start`,
  confirmTask: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/tasks/${taskId}/confirm`,
  confirmPick: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/tasks/${taskId}/confirm-pick`,
  pickWaves: (warehouseId: string) => `/warehouses/${warehouseId}/pick-waves`,
  releasePickWave: (warehouseId: string, waveId: string) => `/warehouses/${warehouseId}/pick-waves/${waveId}/release`,
  rfSessions: (warehouseId: string) => `/warehouses/${warehouseId}/rf/sessions`,
  rfQueue: (warehouseId: string) => `/warehouses/${warehouseId}/rf/queue`,
  rfStartTask: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/rf/tasks/${taskId}/start`,
  rfScan: (warehouseId: string, sessionId: string) => `/warehouses/${warehouseId}/rf/sessions/${sessionId}/scan`,
  rfResumeSession: (warehouseId: string, sessionId: string) => `/warehouses/${warehouseId}/rf/sessions/${sessionId}/resume`,
  rfCancelSession: (warehouseId: string, sessionId: string) => `/warehouses/${warehouseId}/rf/sessions/${sessionId}/cancel`,
  rfOfflineSync: (warehouseId: string) => `/warehouses/${warehouseId}/rf/offline/sync`,
  rfTaskException: (warehouseId: string, taskId: string) => `/warehouses/${warehouseId}/rf/tasks/${taskId}/report-exception`,
  opsRfConsole: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/rf-console`,
  opsRfSessions: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/rf/sessions`,
  opsRfScans: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/rf/scans`,
  opsRfOfflineReplay: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/rf/offline-queue/replay`,
  opsRfExceptions: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/rf/exceptions`,
  opsIntegrationCommandCenter: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/command-center`,
  opsIntegrationEvents: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/events`,
  opsIntegrationEventRetry: (warehouseId: string, eventId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/events/${eventId}/retry`,
  opsIntegrationEventApply: (warehouseId: string, eventId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/events/${eventId}/apply`,
  opsIntegrationReconciliationRuns: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/reconciliation-runs`,
  opsIntegrationPrintTest: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/print/test-label`,
  opsConfigurationRules: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/configuration/rules`,
  opsConfigurationRuleEvaluate: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/configuration/rules/evaluate`,
  configurationTemplates: (warehouseId: string) => `/warehouses/${warehouseId}/configuration/templates`,
  configurationRules: (warehouseId: string) => `/warehouses/${warehouseId}/configuration/rules`,
  configurationRule: (warehouseId: string, ruleId: string) => `/warehouses/${warehouseId}/configuration/rules/${ruleId}`,
  configurationEffective: (warehouseId: string) => `/warehouses/${warehouseId}/configuration/effective`,
  configurationSimulate: (warehouseId: string) => `/warehouses/${warehouseId}/configuration/simulate`,
  parcels: (warehouseId: string) => `/warehouses/${warehouseId}/parcels`,
  packingStations: (warehouseId: string) => `/warehouses/${warehouseId}/packing-stations`,
  shipments: (warehouseId: string) => `/warehouses/${warehouseId}/shipments`,
  shipmentPackages: (warehouseId: string, shipmentId: string) => `/warehouses/${warehouseId}/shipments/${shipmentId}/packages`,
  shipmentLabels: (warehouseId: string, shipmentId: string) => `/warehouses/${warehouseId}/shipments/${shipmentId}/labels`,
  stageShipment: (warehouseId: string, shipmentId: string) => `/warehouses/${warehouseId}/shipments/${shipmentId}/stage`,
  shipShipment: (warehouseId: string, shipmentId: string) => `/warehouses/${warehouseId}/shipments/${shipmentId}/ship`,
  observabilityRuntime: () => '/observability/runtime',
  outboxDeadLetters: () => '/outbox/events/dead-letter',
  outboxDeadLetterRequeue: (eventId: string) => `/outbox/events/dead-letter/${eventId}/requeue`,
  integrationOpsSummary: () => '/integrations/enterprise/operations/summary',
  integrationEnterpriseDeadLetters: () => '/integrations/enterprise/dead-letters',
  integrationEnterpriseReplayDeadLetter: (deadLetterId: string) => `/integrations/enterprise/dead-letters/${deadLetterId}/replay`,
  integrationEnterpriseReconciliationRun: () => '/integrations/enterprise/reconciliation/run',
  integrationEnterpriseReconciliationReport: () => '/integrations/enterprise/reconciliation/report',
  auditLogs: () => '/audit/logs',
  auditLogsExport: () => '/audit/logs/export',
  auditLogsManifest: () => '/audit/logs/manifest',
  printStations: (warehouseId: string) => `/warehouses/${warehouseId}/print-stations`,
  printers: (warehouseId: string) => `/warehouses/${warehouseId}/printers`,
  printAgents: (warehouseId: string) => `/warehouses/${warehouseId}/print-agents`,
  runtimePrintJobs: (warehouseId: string) => `/warehouses/${warehouseId}/print-jobs`,
  runtimePrintJobAction: (warehouseId: string, jobId: string, action: 'retry' | 'cancel' | 'reassign' | 'reprint') => `/warehouses/${warehouseId}/print-jobs/${jobId}/${action}`,
  scanners: (warehouseId: string) => `/warehouses/${warehouseId}/scanners`,
  scanner: (warehouseId: string, scannerId: string) => `/warehouses/${warehouseId}/scanners/${scannerId}`,
  scannerTelemetry: (warehouseId: string, scannerId: string) => `/warehouses/${warehouseId}/scanners/${scannerId}/telemetry`,
  scannerScans: (warehouseId: string, scannerId: string) => `/warehouses/${warehouseId}/scanners/${scannerId}/scans`,
  scanResolve: (warehouseId: string) => `/warehouses/${warehouseId}/scans/resolve`,
  labelPreview: (warehouseId: string, templateReference: string) => `/warehouses/${warehouseId}/label-templates/${templateReference}/render-preview`,
  opsIntegrationRetry: (warehouseId: string, eventId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/events/${eventId}/retry`,
  opsReconciliationRuns: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/integrations/reconciliation-runs`,
  opsRules: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/configuration/rules`,
  opsRuleEvaluate: (warehouseId: string) => `/warehouses/${warehouseId}/operations-runtime/configuration/rules/evaluate`,
  carriers: () => '/carriers',
  carrierCredentials: (warehouseId: string) => `/warehouses/${warehouseId}/carriers/credentials`,
  carrierTrackingEvents: (warehouseId: string) => `/warehouses/${warehouseId}/carriers/tracking-events`,
  users: () => '/users',
};

function post<T>(path: string, body: MutationBody = {}, idempotencyKey?: string) {
  return apiRequest<T, MutationBody>(path, { method: 'POST', body, idempotencyKey });
}

function patch<T>(path: string, body: MutationBody = {}, idempotencyKey?: string) {
  return apiRequest<T, MutationBody>(path, { method: 'PATCH', body, idempotencyKey });
}

export function createWmsIdempotencyKey(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function get<T>(path: string, query?: QueryParams, options?: ReadOptions) {
  return apiRequest<T>(path, { ...options, query });
}

export function getHealth<T>(options?: ReadOptions) { return get<T>(endpoints.health(), undefined, options); }
export function getReadiness<T>(options?: ReadOptions) { return get<T>(endpoints.healthReady(), undefined, options); }
export function getStartupHealth<T>(options?: ReadOptions) { return get<T>(endpoints.healthStartup(), undefined, options); }
export function getReliabilityAlerts<T>(options?: ReadOptions) { return get<T>(endpoints.reliabilityAlerts(), undefined, options); }
export function getReliabilityAlertDeliveries<T>(options?: ReadOptions) { return get<T>(endpoints.reliabilityAlertDeliveries(), undefined, options); }
export function deliverReliabilityAlerts<T>() { return post<T>(endpoints.reliabilityAlertDeliver(), {}); }
export function getReliabilityIncidents<T>(options?: ReadOptions) { return get<T>(endpoints.reliabilityIncidents(), undefined, options); }
export function acknowledgeReliabilityIncident<T>(incidentKey: string, body: MutationBody = {}) { return post<T>(endpoints.reliabilityIncidentAcknowledge(incidentKey), body); }
export function resolveReliabilityIncident<T>(incidentKey: string, body: MutationBody = {}) { return post<T>(endpoints.reliabilityIncidentResolve(incidentKey), body); }
export function getReliabilityRetention<T>(options?: ReadOptions) { return get<T>(endpoints.reliabilityRetention(), undefined, options); }
export function runReliabilityRetention<T>(body: MutationBody = {}) { return post<T>(endpoints.reliabilityRetentionRun(), body); }
export function getReliabilityRecovery<T>(options?: ReadOptions) { return get<T>(endpoints.reliabilityRecovery(), undefined, options); }
export function refreshStartupPreflight<T>() { return post<T>(endpoints.reliabilityStartupPreflightRefresh(), {}); }
export function getMe<T>() { return apiRequest<T>(endpoints.me()); }
export function listProducts<T>(query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.products(), query, options); }
export function createProduct<T>(body: MutationBody) { return post<T>(endpoints.products(), body, `product-${String(body.code ?? createWmsIdempotencyKey('product'))}`); }
export function listSkus<T>(query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.skus(), query, options); }
export function createSku<T>(body: MutationBody) { return post<T>(endpoints.skus(), body, `sku-${String(body.code ?? createWmsIdempotencyKey('sku'))}`); }
export function listWarehouses<T>() { return apiRequest<T>(endpoints.warehouses()); }
export function listWarehouseLocations<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.locations(warehouseId), undefined, options); }
export function createWarehouseLocation<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.locations(warehouseId), body, `location-${String(body.code ?? createWmsIdempotencyKey('location'))}`); }
export function updateWarehouseLocation<T>(warehouseId: string, locationId: string, body: MutationBody) { return patch<T>(endpoints.location(warehouseId, locationId), body, createWmsIdempotencyKey(`location-update-${locationId}`)); }
export function suggestPutaway<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.putawaySuggest(warehouseId), body, createWmsIdempotencyKey(`putaway-suggest-${warehouseId}`)); }
export function createPutawayTask<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.putawayTasks(warehouseId), body, createWmsIdempotencyKey(`putaway-task-${warehouseId}`)); }
export function confirmPutawayTask<T>(warehouseId: string, taskId: string, body: MutationBody) { return post<T>(endpoints.putawayConfirmTask(warehouseId, taskId), body, createWmsIdempotencyKey(`putaway-confirm-${taskId}`)); }
export function listReturns<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.returns(warehouseId), undefined, options); }
export function createReturn<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.returns(warehouseId), body, `return-${String(body.rmaNumber ?? createWmsIdempotencyKey('return'))}`); }
export function receiveReturnLine<T>(warehouseId: string, returnId: string, lineId: string, body: MutationBody) { return post<T>(endpoints.returnLineReceive(warehouseId, returnId, lineId), body, createWmsIdempotencyKey(`return-receive-${lineId}`)); }
export function inspectReturnLine<T>(warehouseId: string, returnId: string, lineId: string, body: MutationBody) { return post<T>(endpoints.returnLineInspect(warehouseId, returnId, lineId), body, createWmsIdempotencyKey(`return-inspect-${lineId}`)); }
export function listQualityInspections<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.qualityInspections(warehouseId), undefined, options); }
export function createQualityInspection<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.qualityInspections(warehouseId), body, `quality-${String(body.inspectionNumber ?? createWmsIdempotencyKey('quality'))}`); }
export function completeQualityInspection<T>(warehouseId: string, inspectionId: string, body: MutationBody) { return post<T>(endpoints.qualityInspectionComplete(warehouseId, inspectionId), body, createWmsIdempotencyKey(`quality-complete-${inspectionId}`)); }
export function releaseQualityQuarantine<T>(warehouseId: string, quantId: string) { return post<T>(endpoints.qualityQuarantineRelease(warehouseId, quantId), {}, createWmsIdempotencyKey(`quality-release-${quantId}`)); }
export function listQualitySamplingRules<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.qualitySamplingRules(warehouseId), undefined, options); }
export function listCycleCountPlans<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.cycleCounts(warehouseId), undefined, options); }
export function createCycleCountPlan<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.cycleCounts(warehouseId), body, `cycle-count-${String(body.code ?? createWmsIdempotencyKey('cycle-count'))}`); }
export function releaseCycleCountPlan<T>(warehouseId: string, planId: string, body: MutationBody = {}) { return post<T>(endpoints.cycleCountRelease(warehouseId, planId), body, createWmsIdempotencyKey(`cycle-release-${planId}`)); }
export function listCycleCountTasks<T>(warehouseId: string, planId: string, options?: ReadOptions) { return get<T>(endpoints.cycleCountTasks(warehouseId, planId), undefined, options); }
export function submitCycleCountTask<T>(warehouseId: string, taskId: string, body: MutationBody) { return post<T>(endpoints.cycleCountTaskSubmit(warehouseId, taskId), body, createWmsIdempotencyKey(`cycle-submit-${taskId}`)); }
export function approveCycleCountTask<T>(warehouseId: string, taskId: string, body: MutationBody = {}) { return post<T>(endpoints.cycleCountTaskApprove(warehouseId, taskId), body, createWmsIdempotencyKey(`cycle-approve-${taskId}`)); }
export function getAnalyticsOverview<T>(warehouseId: string) { return apiRequest<T>(endpoints.analyticsOverview(warehouseId)); }
export function getControlTower<T>(warehouseId: string) { return apiRequest<T>(endpoints.controlTower(warehouseId)); }
export function listStockQuants<T>(warehouseId: string, query?: QueryParams) { return apiRequest<T>(endpoints.stockQuants(warehouseId), { query }); }
export function receiveInventoryStock<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.receiveStock(warehouseId), body, String(body.idempotencyKey ?? '')); }
export function moveInventoryStock<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.moveStock(warehouseId), body, String(body.idempotencyKey ?? '')); }
export function adjustInventoryStock<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.adjustStock(warehouseId), body, String(body.idempotencyKey ?? '')); }
export function listInboundShipments<T>(warehouseId: string, query?: QueryParams) { return apiRequest<T>(endpoints.inboundShipments(warehouseId), { query }); }
export function receiveInboundShipment<T>(warehouseId: string, shipmentId: string, body: MutationBody) { return post<T>(endpoints.receiveInbound(warehouseId, shipmentId), body, String(body.idempotencyKey ?? '')); }
export function listOutboundOrders<T>(warehouseId: string, query?: QueryParams) { return apiRequest<T>(endpoints.outboundOrders(warehouseId), { query }); }
export function allocateOutboundOrder<T>(warehouseId: string, orderId: string, body: MutationBody = {}) { return post<T>(endpoints.allocateOrder(warehouseId, orderId), body, `storage-allocate-${orderId}`); }
export function releasePicking<T>(warehouseId: string, orderId: string, body: MutationBody = {}) { return post<T>(endpoints.releasePicking(warehouseId, orderId), body, `storage-release-picking-${orderId}`); }
export function listTasks<T>(warehouseId: string, query?: QueryParams) { return apiRequest<T>(endpoints.warehouseTasks(warehouseId), { query }); }
export function claimNextWarehouseTask<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.claimNextTask(warehouseId), body, createWmsIdempotencyKey('storage-claim-next')); }
export function startWarehouseTask<T>(warehouseId: string, taskId: string, body: MutationBody = {}) { return post<T>(endpoints.startTask(warehouseId, taskId), body, `storage-start-task-${taskId}`); }
export function confirmWarehouseTask<T>(warehouseId: string, taskId: string, body: MutationBody = {}) { return post<T>(endpoints.confirmTask(warehouseId, taskId), body, `storage-confirm-task-${taskId}`); }
export function confirmPickTask<T>(warehouseId: string, taskId: string, body: MutationBody = {}) { return post<T>(endpoints.confirmPick(warehouseId, taskId), body, `storage-confirm-pick-${taskId}`); }
export function listPickWaves<T>(warehouseId: string, query?: QueryParams) { return apiRequest<T>(endpoints.pickWaves(warehouseId), { query }); }
export function releasePickWave<T>(warehouseId: string, waveId: string, body: MutationBody = { createMissingPickTasks: true }) { return post<T>(endpoints.releasePickWave(warehouseId, waveId), body, `storage-release-wave-${waveId}`); }
export function listPackingStations<T>(warehouseId: string) { return apiRequest<T>(endpoints.packingStations(warehouseId)); }
export function listShipments<T>(warehouseId: string, query?: QueryParams) { return apiRequest<T>(endpoints.shipments(warehouseId), { query }); }
export function createShipment<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.shipments(warehouseId), body, String(body.idempotencyKey ?? createWmsIdempotencyKey(`storage-create-shipment-${String(body.outboundOrderReference ?? 'shipment')}`))); }
export function addShipmentPackage<T>(warehouseId: string, shipmentId: string, body: MutationBody) { return post<T>(endpoints.shipmentPackages(warehouseId, shipmentId), body, createWmsIdempotencyKey(`storage-package-${shipmentId}`)); }
export function generateShipmentLabel<T>(warehouseId: string, shipmentId: string, body: MutationBody = {}) { return post<T>(endpoints.shipmentLabels(warehouseId, shipmentId), body, createWmsIdempotencyKey(`storage-label-${shipmentId}`)); }
export function stageShipment<T>(warehouseId: string, shipmentId: string, body: MutationBody = {}) { return post<T>(endpoints.stageShipment(warehouseId, shipmentId), body, createWmsIdempotencyKey(`storage-stage-${shipmentId}`)); }
export function shipShipment<T>(warehouseId: string, shipmentId: string, body: MutationBody = {}) { return post<T>(endpoints.shipShipment(warehouseId, shipmentId), body, createWmsIdempotencyKey(`storage-ship-${shipmentId}`)); }
export function getRfQueue<T>(warehouseId: string, query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.rfQueue(warehouseId), query, options); }
export function startRfTask<T>(warehouseId: string, taskId: string, body: MutationBody = {}) { return post<T>(endpoints.rfStartTask(warehouseId, taskId), body, `storage-rf-start-${taskId}`); }
export function scanRfSession<T>(warehouseId: string, sessionId: string, body: MutationBody = {}) { return post<T>(endpoints.rfScan(warehouseId, sessionId), body, createWmsIdempotencyKey(`storage-rf-scan-${sessionId}`)); }
export function resumeRfSession<T>(warehouseId: string, sessionId: string, body: MutationBody = {}) { return post<T>(endpoints.rfResumeSession(warehouseId, sessionId), body, createWmsIdempotencyKey(`storage-rf-resume-${sessionId}`)); }
export function cancelRfSession<T>(warehouseId: string, sessionId: string, body: MutationBody = {}) { return post<T>(endpoints.rfCancelSession(warehouseId, sessionId), body, createWmsIdempotencyKey(`storage-rf-cancel-${sessionId}`)); }
export function syncRfOfflineQueue<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.rfOfflineSync(warehouseId), body, createWmsIdempotencyKey(`rf-offline-sync-${warehouseId}`)); }
export function reportRfTaskException<T>(warehouseId: string, taskId: string, body: MutationBody = {}) { return post<T>(endpoints.rfTaskException(warehouseId, taskId), body, createWmsIdempotencyKey(`rf-exception-${taskId}`)); }

export function getOpsRfConsole<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.opsRfConsole(warehouseId), undefined, options); }
export function startOpsRfSession<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsRfSessions(warehouseId), body, createWmsIdempotencyKey(`ops-rf-session-${warehouseId}`)); }
export function submitOpsRfScan<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsRfScans(warehouseId), body, createWmsIdempotencyKey(`ops-rf-scan-${String(body.offlineId ?? 'live')}`)); }
export function replayOpsRfOfflineQueue<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsRfOfflineReplay(warehouseId), body, createWmsIdempotencyKey(`ops-rf-replay-${warehouseId}`)); }
export function reportOpsRfException<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsRfExceptions(warehouseId), body, createWmsIdempotencyKey(`ops-rf-exception-${warehouseId}`)); }

export function getOpsIntegrationCommandCenter<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.opsIntegrationCommandCenter(warehouseId), undefined, options); }
export function ingestOpsIntegrationEvent<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsIntegrationEvents(warehouseId), body, `ops-ingest-${String(body.connectorCode ?? 'connector')}-${String(body.externalId ?? createWmsIdempotencyKey('event'))}`); }
export function retryOpsIntegrationEvent<T>(warehouseId: string, eventId: string) { return post<T>(endpoints.opsIntegrationEventRetry(warehouseId, eventId), {}, createWmsIdempotencyKey(`ops-retry-${eventId}`)); }
export function applyOpsIntegrationEvent<T>(warehouseId: string, eventId: string, body: MutationBody = {}) { return post<T>(endpoints.opsIntegrationEventApply(warehouseId, eventId), body, createWmsIdempotencyKey(`ops-apply-${eventId}`)); }
export function runOpsReconciliation<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsIntegrationReconciliationRuns(warehouseId), body, createWmsIdempotencyKey(`ops-reconcile-${warehouseId}`)); }
export function testOpsPrintLabel<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsIntegrationPrintTest(warehouseId), body, createWmsIdempotencyKey(`ops-print-test-${warehouseId}`)); }

export function listOpsConfigurationRules<T>(warehouseId: string, query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.opsConfigurationRules(warehouseId), query, options); }
export function upsertOpsConfigurationRule<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsConfigurationRules(warehouseId), body, `ops-rule-${String(body.code ?? createWmsIdempotencyKey('ops-rule'))}`); }
export function evaluateOpsConfigurationRules<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsConfigurationRuleEvaluate(warehouseId), body, createWmsIdempotencyKey(`ops-rule-eval-${warehouseId}`)); }
export function getConfigurationTemplates<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.configurationTemplates(warehouseId), undefined, options); }
export function getConfigurationEffective<T>(warehouseId: string, query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.configurationEffective(warehouseId), query, options); }
export function listConfigurationRules<T>(warehouseId: string, query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.configurationRules(warehouseId), query, options); }
export function upsertConfigurationRule<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.configurationRules(warehouseId), body, `config-rule-${String(body.code ?? createWmsIdempotencyKey('config-rule'))}`); }
export function simulateConfigurationRule<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.configurationSimulate(warehouseId), body, createWmsIdempotencyKey(`config-sim-${warehouseId}`)); }
export function updateConfigurationRule<T>(warehouseId: string, ruleId: string, body: MutationBody = {}) { return patch<T>(endpoints.configurationRule(warehouseId, ruleId), body, createWmsIdempotencyKey(`config-rule-update-${ruleId}`)); }

export function listCarriers<T>() { return apiRequest<T>(endpoints.carriers()); }
export function listUsers<T>() { return apiRequest<T>(endpoints.users()); }
export function createUser<T>(body: MutationBody) { return post<T>(endpoints.users(), body, `storage-create-user-${String(body.email ?? createWmsIdempotencyKey('user'))}`); }

export function getWarehouseIntegrity<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.warehouseIntegrity(warehouseId), undefined, options); }
export function getRuntimeSnapshot<T>(options?: ReadOptions) { return get<T>(endpoints.observabilityRuntime(), undefined, options); }
export function listDeadLetterOutboxEvents<T>(query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.outboxDeadLetters(), query, options); }
export function requeueDeadLetterOutboxEvent<T>(eventId: string, body: MutationBody) { return post<T>(endpoints.outboxDeadLetterRequeue(eventId), body, `storage-requeue-${eventId}`); }

export function getPrintStations<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.printStations(warehouseId), undefined, options); }
export function listPrinters<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.printers(warehouseId), undefined, options); }
export function upsertPrinter<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.printers(warehouseId), body, `printer-${String(body.code ?? createWmsIdempotencyKey('printer'))}`); }
export function listPrintAgents<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.printAgents(warehouseId), undefined, options); }
export function upsertPrintAgent<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.printAgents(warehouseId), body, `print-agent-${String(body.code ?? createWmsIdempotencyKey('print-agent'))}`); }
export function listRuntimePrintJobs<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.runtimePrintJobs(warehouseId), undefined, options); }
export function createRuntimePrintJob<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.runtimePrintJobs(warehouseId), body, createWmsIdempotencyKey(`runtime-print-job-${warehouseId}`)); }
export function retryRuntimePrintJob<T>(warehouseId: string, jobId: string, body: MutationBody = {}) { return post<T>(endpoints.runtimePrintJobAction(warehouseId, jobId, 'retry'), body, createWmsIdempotencyKey(`print-retry-${jobId}`)); }
export function cancelRuntimePrintJob<T>(warehouseId: string, jobId: string, body: MutationBody = {}) { return post<T>(endpoints.runtimePrintJobAction(warehouseId, jobId, 'cancel'), body, createWmsIdempotencyKey(`print-cancel-${jobId}`)); }
export function reassignRuntimePrintJob<T>(warehouseId: string, jobId: string, body: MutationBody = {}) { return post<T>(endpoints.runtimePrintJobAction(warehouseId, jobId, 'reassign'), body, createWmsIdempotencyKey(`print-reassign-${jobId}`)); }
export function reprintRuntimePrintJob<T>(warehouseId: string, jobId: string, body: MutationBody = {}) { return post<T>(endpoints.runtimePrintJobAction(warehouseId, jobId, 'reprint'), body, createWmsIdempotencyKey(`print-reprint-${jobId}`)); }
export function listScanners<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.scanners(warehouseId), undefined, options); }
export function createScanner<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.scanners(warehouseId), body, `scanner-${String(body.code ?? createWmsIdempotencyKey('scanner'))}`); }
export function updateScanner<T>(warehouseId: string, scannerId: string, body: MutationBody) { return patch<T>(endpoints.scanner(warehouseId, scannerId), body, createWmsIdempotencyKey(`scanner-update-${scannerId}`)); }
export function updateScannerTelemetry<T>(warehouseId: string, scannerId: string, body: MutationBody) { return patch<T>(endpoints.scannerTelemetry(warehouseId, scannerId), body, createWmsIdempotencyKey(`scanner-telemetry-${scannerId}`)); }
export function logScannerScan<T>(warehouseId: string, scannerId: string, body: MutationBody) { return post<T>(endpoints.scannerScans(warehouseId, scannerId), body, createWmsIdempotencyKey(`scanner-scan-${scannerId}`)); }
export function resolveScan<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.scanResolve(warehouseId), body, createWmsIdempotencyKey(`scan-resolve-${warehouseId}`)); }
export function renderLabelPreview<T>(warehouseId: string, templateReference: string, body: MutationBody) { return post<T>(endpoints.labelPreview(warehouseId, templateReference), body, createWmsIdempotencyKey(`label-preview-${templateReference}`)); }

export function getOperationsRfConsole<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.opsRfConsole(warehouseId), undefined, options); }
export function startOperationsRfSession<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.opsRfSessions(warehouseId), body, createWmsIdempotencyKey(`ops-rf-session-${warehouseId}`)); }
export function submitOperationsRfScan<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.opsRfScans(warehouseId), body, createWmsIdempotencyKey(`ops-rf-scan-${String(body.deviceCode ?? 'device')}-${String(body.offlineId ?? 'live')}`)); }
export function replayOperationsRfOfflineQueue<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.opsRfOfflineReplay(warehouseId), body, createWmsIdempotencyKey(`ops-rf-replay-${String(body.deviceCode ?? 'device')}`)); }
export function reportOperationsRfException<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.opsRfExceptions(warehouseId), body, createWmsIdempotencyKey(`ops-rf-exception-${String(body.deviceCode ?? 'device')}`)); }
export function getOperationsIntegrationCommandCenter<T>(warehouseId: string, options?: ReadOptions) { return get<T>(endpoints.opsIntegrationCommandCenter(warehouseId), undefined, options); }
export function retryOperationsIntegrationEvent<T>(warehouseId: string, eventId: string) { return post<T>(endpoints.opsIntegrationRetry(warehouseId, eventId), {}, createWmsIdempotencyKey(`ops-integration-retry-${eventId}`)); }
export function runOperationsReconciliation<T>(warehouseId: string, body: MutationBody = {}) { return post<T>(endpoints.opsReconciliationRuns(warehouseId), body, createWmsIdempotencyKey(`ops-reconciliation-${warehouseId}`)); }
export function listOperationsRules<T>(warehouseId: string, query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.opsRules(warehouseId), query, options); }
export function upsertOperationsRule<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.opsRules(warehouseId), body, `ops-rule-${String(body.code ?? createWmsIdempotencyKey('ops-rule'))}`); }
export function evaluateOperationsRules<T>(warehouseId: string, body: MutationBody) { return post<T>(endpoints.opsRuleEvaluate(warehouseId), body, createWmsIdempotencyKey(`ops-rule-evaluate-${warehouseId}`)); }


export function getIntegrationOperationsSummary<T>(options?: ReadOptions) { return get<T>(endpoints.integrationOpsSummary(), undefined, options); }
export function listIntegrationEnterpriseDeadLetters<T>(query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.integrationEnterpriseDeadLetters(), query, options); }
export function replayIntegrationEnterpriseDeadLetter<T>(deadLetterId: string, body: MutationBody = {}) { return post<T>(endpoints.integrationEnterpriseReplayDeadLetter(deadLetterId), body, createWmsIdempotencyKey(`storage-integration-replay-${deadLetterId}`)); }
export function runIntegrationEnterpriseReconciliation<T>(body: MutationBody = {}) { return post<T>(endpoints.integrationEnterpriseReconciliationRun(), body, createWmsIdempotencyKey('storage-integration-reconcile')); }
export function getIntegrationEnterpriseReconciliationReport<T>(options?: ReadOptions) { return get<T>(endpoints.integrationEnterpriseReconciliationReport(), undefined, options); }
export function listAuditLogs<T>(query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.auditLogs(), query, options); }
export function exportAuditLogs<T>(query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.auditLogsExport(), query, options); }
export function getAuditLogManifest<T>(query?: QueryParams, options?: ReadOptions) { return get<T>(endpoints.auditLogsManifest(), query, options); }
