import assert from 'node:assert/strict';
import test from 'node:test';

import { RuntimeMetricsService } from '../src/observability/runtime-metrics.service';

test('frontend runtime events are redacted, retained, and summarized in runtime metrics', () => {
  const service = new RuntimeMetricsService();

  const event = service.recordFrontendEvent({
    type: 'api_failure',
    severity: 'error',
    route: '/rf',
    language: 'cs',
    roleId: 'WAREHOUSE_WORKER',
    appVersion: 'local',
    occurredAt: 'not-a-date',
    message: `Fetch failed\nwith stack detail ${'x'.repeat(700)}`,
    source: '/warehouses/MAIN/rf/queue',
    statusCode: 503.9,
    durationMs: 321.9,
    browserOnline: false,
    userAgent: `Aardvarkland Test ${'u'.repeat(300)}`,
  });

  assert.equal(event.type, 'api_failure');
  assert.equal(event.severity, 'error');
  assert.equal(event.statusCode, 503);
  assert.equal(event.durationMs, 321);
  assert.equal(event.browserOnline, false);
  assert.equal(event.message?.includes('\n'), false);
  assert.equal(event.message?.length, 500);
  assert.equal(event.userAgent?.length, 240);

  const snapshot = service.getRuntimeSnapshot();
  assert.equal(snapshot.frontend.totalEvents, 1);
  assert.equal(snapshot.frontend.recentErrors, 1);
  assert.equal(snapshot.frontend.countsByType.api_failure, 1);
  assert.equal(snapshot.frontend.countsBySeverity.error, 1);
  assert.equal(snapshot.frontend.recentEvents[0]?.id, event.id);

  const prometheus = service.renderPrometheusMetrics();
  assert.match(prometheus, /wms_frontend_runtime_events_total\{type="api_failure"\} 1/);
  assert.match(prometheus, /wms_frontend_recent_errors 1/);
});

test('frontend runtime event buffer keeps a bounded recent window', () => {
  const service = new RuntimeMetricsService();

  for (let index = 0; index < 230; index += 1) {
    service.recordFrontendEvent({
      type: index % 2 === 0 ? 'app_loaded' : 'js_error',
      severity: index % 2 === 0 ? 'info' : 'error',
      message: `event-${index}`,
    });
  }

  const snapshot = service.getRuntimeSnapshot();
  assert.equal(snapshot.frontend.totalEvents, 230);
  assert.equal(snapshot.frontend.recentEvents.length, 20);
  assert.equal(snapshot.frontend.recentEvents[0]?.message, 'event-229');
  assert.equal(snapshot.frontend.recentErrors, 100);
});
