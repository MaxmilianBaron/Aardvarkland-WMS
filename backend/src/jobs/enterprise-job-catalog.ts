import { RegisterJobInput } from './jobs.types';

export const ENTERPRISE_JOB_CATALOG: RegisterJobInput[] = [
  {
    name: 'automation-command-dispatch',
    enabled: true,
    description: 'Claim and dispatch queued WCS/MFS automation commands to devices.',
  },
  {
    name: 'webhook-delivery-worker',
    enabled: true,
    schedule: '*/2 * * * *',
    description: 'Deliver domain events to partner webhooks with retry and replay support.',
  },
  {
    name: 'yard-dwell-monitor',
    enabled: true,
    schedule: '*/15 * * * *',
    description: 'Detect trailers exceeding configured yard dwell and dock appointment SLAs.',
  },
  {
    name: 'cross-dock-opportunity-planner',
    enabled: true,
    schedule: '*/10 * * * *',
    description: 'Match inbound supply to outbound demand for flow-through and cross-dock moves.',
  },
  {
    name: 'vas-task-scheduler',
    enabled: true,
    schedule: '*/10 * * * *',
    description: 'Create and rebalance value-added service and kitting work queues.',
  },
  {
    name: 'carrier-status-sync',
    enabled: true,
    schedule: '*/15 * * * *',
    description: 'Poll carrier tracking APIs and normalize tracking events.',
  },
  {
    name: 'integration-dead-letter-retry',
    enabled: true,
    schedule: '*/5 * * * *',
    description: 'Retry eligible integration dead-letter entries.',
  },
  {
    name: 'label-generation-worker',
    enabled: true,
    description: 'Generate carrier labels asynchronously for high-volume shipping.',
  },
  {
    name: 'notification-delivery-worker',
    enabled: true,
    description: 'Deliver email/webhook/in-app notifications with retries.',
  },
  {
    name: 'stock-consistency-scan',
    enabled: true,
    schedule: '0 * * * *',
    description: 'Run inventory consistency checks and raise exceptions.',
  },
  {
    name: 'stock-balance-rebuild-preview',
    enabled: true,
    schedule: '30 2 * * *',
    description: 'Compare stock movement ledger with balance identity before rebuilds.',
  },
  {
    name: 'expiry-alert-scan',
    enabled: true,
    schedule: '0 6 * * *',
    description: 'Alert on SKU lots and quants approaching expiry.',
  },
  {
    name: 'stale-task-auto-close',
    enabled: true,
    schedule: '*/30 * * * *',
    description: 'Close stale operational tasks after configured grace windows.',
  },
  {
    name: 'reservation-expiry-release',
    enabled: true,
    schedule: '*/10 * * * *',
    description: 'Release expired reservations and restore available stock.',
  },
  {
    name: 'analytics-aggregation-worker',
    enabled: true,
    schedule: '*/20 * * * *',
    description: 'Aggregate WMS operational metrics for dashboards and billing.',
  },
  {
    name: 'backup-verification-worker',
    enabled: true,
    schedule: '0 4 * * *',
    description: 'Verify backup freshness and recoverability signals.',
  },
  {
    name: 'retention-cleanup-worker',
    enabled: true,
    schedule: '0 */6 * * *',
    description: 'Remove old terminal operational records according to configured retention windows.',
  },
];
