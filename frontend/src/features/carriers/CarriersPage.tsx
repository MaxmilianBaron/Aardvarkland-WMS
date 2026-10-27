import { pickLanguage } from '../../core/i18n/i18n';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/StatusPill';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { useApiResource } from '../../core/api/useApiResource';
import { listCarriers } from '../../core/api/wms';
import { CarrierCardView, mapCarrierCards } from '../../core/api/view-models';
import { useWorkspace } from '../../core/workspace/workspace';

const emptyCarriers: CarrierCardView[] = [];

export function CarriersPage() {
  const { warehouseId, clientScope, language } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const resource = useApiResource({
    fallback: emptyCarriers,
    productionFallback: emptyCarriers,
    loader: () => listCarriers<unknown[]>(),
    map: mapCarrierCards,
    dependencies: [warehouseId],
  });
  const rows = resource.data;

  return (
    <div className="page-grid">
      <div className="span-12"><DataSourceBanner label={text.banner} resource={resource} /></div>
      <section className="wms-page-intro span-12">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <span>{clientScope}</span>
        </div>
      </section>

      <Card title={text.carriersTitle} eyebrow={text.carriersEyebrow} className="span-8">
        {rows.length ? (
          <div className="carrier-grid">
            {rows.map((carrier) => (
              <article key={carrier.name}>
                <div><strong>{carrier.name}</strong><StatusPill value={carrier.status} /></div>
                <span>{carrier.labels} {text.labelsToday}</span>
                <small>{carrier.incidents} {text.incidents}</small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title={text.emptyTitle} text={text.emptyText} />
        )}
      </Card>

      <Card title={text.operationsTitle} eyebrow={text.operationsEyebrow} className="span-4">
        <div className="metric-stack">
          <article><span>{text.connected}</span><strong>{rows.filter((carrier) => carrier.status === 'Connected').length}</strong></article>
          <article><span>{text.withIncident}</span><strong>{rows.filter((carrier) => carrier.incidents > 0).length}</strong></article>
          <article><span>{text.totalLabels}</span><strong>{rows.reduce((sum, carrier) => sum + carrier.labels, 0)}</strong></article>
        </div>
      </Card>
    </div>
  );
}

const czech = {
  banner: 'API dopravců',
  eyebrow: 'doprava · štítky',
  title: 'Doprava',
  readOnly: 'Pouze čtení',
  addCarrier: 'Přidat dopravce',
  carriersTitle: 'Dopravci',
  carriersEyebrow: 'stav a dnešní provoz',
  labelsToday: 'štítků dnes',
  incidents: 'incidentů',
  emptyTitle: 'Žádní dopravci',
  emptyText: 'Server zatím nevrátil žádné dopravce.',
  operationsTitle: 'Provozní stav',
  operationsEyebrow: 'bez technických tajemství',
  connected: 'Připojeno',
  withIncident: 'S incidentem',
  totalLabels: 'Štítků dnes',
  note: 'Vedoucí vidí provozní stav. Technické přístupy a API klíče nastavuje správce systému.',
};

const english = {
  banner: 'Carriers API',
  eyebrow: 'carriers · labels',
  title: 'Carriers',
  readOnly: 'Read only',
  addCarrier: 'Add carrier',
  carriersTitle: 'Carriers',
  carriersEyebrow: 'status and today operation',
  labelsToday: 'labels today',
  incidents: 'incidents',
  emptyTitle: 'No carriers',
  emptyText: 'The server has not returned any carriers yet.',
  operationsTitle: 'Operational status',
  operationsEyebrow: 'no technical secrets',
  connected: 'Connected',
  withIncident: 'With incident',
  totalLabels: 'Labels today',
  note: 'Managers see operational status. Technical credentials and API keys are handled by the system administrator.',
};

const ukrainian = {
  banner: 'API перевізників',
  eyebrow: 'доставка · етикетки',
  title: 'Доставка',
  readOnly: 'Лише читання',
  addCarrier: 'Додати перевізника',
  carriersTitle: 'Перевізники',
  carriersEyebrow: 'стан і сьогоднішня робота',
  labelsToday: 'етикеток сьогодні',
  incidents: 'інцидентів',
  emptyTitle: 'Немає перевізників',
  emptyText: 'Сервер поки не повернув жодних перевізників.',
  operationsTitle: 'Операційний стан',
  operationsEyebrow: 'без технічних секретів',
  connected: 'Підключено',
  withIncident: 'З інцидентом',
  totalLabels: 'Етикеток сьогодні',
  note: 'Керівник бачить операційний стан. Технічні доступи та API ключі налаштовує адміністратор системи.',
};
