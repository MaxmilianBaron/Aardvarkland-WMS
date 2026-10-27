import { useMemo, useState } from 'react';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { evaluateOperationsRules, listOperationsRules, upsertOperationsRule } from '../../core/api/wms';
import { useWorkspace } from '../../core/workspace/workspace';

interface RuntimeOperationRule { id: string; code: string; name: string; type: string; enabled: boolean; priority: number; scope: Record<string, unknown>; conditions: Record<string, unknown>; actions: Record<string, unknown>; notes?: string | null; updatedAt: string; }
interface RuntimeRuleEvaluation { warehouseId: string; evaluatedAt: string; context: Record<string, unknown>; matchedRules: RuntimeOperationRule[]; recommendedActions: Array<{ ruleCode: string; action: Record<string, unknown>; }>; }

const fallbackRules: RuntimeOperationRule[] = [];

function identity<T>(payload: unknown): T { return payload as T; }
function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
function stringify(value: unknown) { return JSON.stringify(value ?? {}, null, 2); }

const sampleRule = {
  code: 'CARRIER_RUSH_CARRIER_B_EXPRESS',
  name: 'Rush parcels route to express carrier',
  type: 'CARRIER_ROUTING',
  enabled: true,
  priority: 92,
  scope: { warehouse: 'MAIN' },
  conditions: { orderPriority: ['RUSH'], parcelClass: ['SMALL', 'MEDIUM'] },
  actions: { primaryCarrier: 'EXPRESS_CARRIER', serviceLevel: 'EXPRESS', createNextBestAction: true },
  notes: 'No-code rule created from Operations Rules UI.',
};

export function OperationsRulesPage() {
  const { warehouseId } = useWorkspace();
  const resource = useApiResource({ fallback: fallbackRules, loader: () => listOperationsRules<RuntimeOperationRule[]>(warehouseId), map: identity<RuntimeOperationRule[]>, dependencies: [warehouseId] });
  const mutation = useApiMutation();
  const [contextJson, setContextJson] = useState(stringify({ orderPriority: 'RUSH', destinationCountry: 'CZ', parcelClass: 'SMALL', skuVelocity: 'A', zone: 'FAST_PICK', clientTier: '3PL' }));
  const [evaluation, setEvaluation] = useState<RuntimeRuleEvaluation | null>(null);

  const groups = useMemo(() => {
    return resource.data.reduce<Record<string, RuntimeOperationRule[]>>((acc, rule) => {
      acc[rule.type] = acc[rule.type] ?? [];
      acc[rule.type].push(rule);
      return acc;
    }, {});
  }, [resource.data]);

  const evaluate = async () => {
    const result = await mutation.run('Rule evaluation', () => evaluateOperationsRules<RuntimeRuleEvaluation>(warehouseId, { context: safeJson(contextJson) }));
    if (result) setEvaluation(result);
  };

  const createSample = async () => {
    await mutation.run('Save sample rule', () => upsertOperationsRule<RuntimeOperationRule>(warehouseId, sampleRule));
    resource.refresh();
  };

  return (
    <div className="page-grid ops-runtime-page">
      <div className="span-12"><DataSourceBanner label="No-code rules runtime" resource={resource} /></div>

      <section className="runtime-hero span-12">
        <div>
          <p className="eyebrow">bez programátora · strategie · SLA · routing · billing</p>
          <h2>Configuration rules</h2>
          <p>Spravuj picking, putaway, replenishment, carrier routing, SLA a klientské billing rules jako datová pravidla místo hardcodu.</p>
        </div>
        <div className="runtime-hero__actions">
          <Badge tone="good">{resource.data.filter((rule) => rule.enabled).length} enabled</Badge>
          <Button type="button" tone="primary" onClick={evaluate} disabled={mutation.status === 'running'}>Evaluate context</Button>
        </div>
      </section>

      <Card title="Rule tester" eyebrow="simulate order / SKU / parcel context" className="span-5">
        <label className="json-editor-label">Context JSON<textarea className="json-textarea" value={contextJson} onChange={(event) => setContextJson(event.target.value)} /></label>
        <ActionStatus mutation={mutation} />
        {evaluation && (
          <div className="runtime-note">
            <strong>{evaluation.matchedRules.length} matched rules</strong>
            <p>{evaluation.recommendedActions.map((action) => action.ruleCode).join(', ') || 'No rule matched this context.'}</p>
          </div>
        )}
      </Card>

      <Card title="Recommended actions" eyebrow="what WMS would do" className="span-7">
        <div className="runtime-list">
          {(evaluation?.recommendedActions.length ? evaluation.recommendedActions : [{ ruleCode: 'Run evaluation', action: { hint: 'Use Evaluate context to preview operational decisions.' } }]).map((item) => (
            <article key={item.ruleCode}>
              <div><strong>{item.ruleCode}</strong><p>{stringify(item.action).replace(/[{}"\n]/g, ' ').replace(/\s+/g, ' ').trim()}</p></div>
              <Badge tone="good">action</Badge>
            </article>
          ))}
        </div>
      </Card>

      <div className="span-12 rule-group-grid">
        {Object.entries(groups).map(([type, rules]) => (
          <Card key={type} title={type.replaceAll('_', ' ')} eyebrow={`${rules.length} rules`} className="rule-group-card">
            <div className="rule-grid">
              {rules.map((rule) => (
                <article className="rule-card" key={rule.id || rule.code}>
                  <div className="rule-card__top">
                    <Badge tone={rule.enabled ? 'good' : 'neutral'}>{rule.enabled ? 'enabled' : 'off'}</Badge>
                    <span>priority {rule.priority}</span>
                  </div>
                  <h3>{rule.name}</h3>
                  <p>{rule.code}</p>
                  <div className="rule-card__mini">
                    <strong>IF</strong><code>{stringify(rule.conditions)}</code>
                    <strong>THEN</strong><code>{stringify(rule.actions)}</code>
                  </div>
                </article>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
