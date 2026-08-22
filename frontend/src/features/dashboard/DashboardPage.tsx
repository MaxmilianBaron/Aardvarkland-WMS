import { pickLanguage } from '../../core/i18n/i18n';
import { RouteKey } from '../../app/navigation';
import { SystemStatusPanel } from '../../components/ops/SystemStatusPanel';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { useWorkspace, type Language, type WorkspaceMode } from '../../core/workspace/workspace';

interface RoleAction {
  title: string;
  detail: string;
  route: RouteKey;
  badge: string;
}

interface RoleHomeContent {
  title: string;
  quote: string;
  workTitle: string;
  workEyebrow: string;
  note: string;
  actions: RoleAction[];
  links: Array<{ label: string; route: RouteKey; detail: string }>;
}

function contentForMode(mode: WorkspaceMode, language: Language): RoleHomeContent {
  if (language === 'fr' || language === 'de' || language === 'es') {
    return pickLanguage(language, {
      cs: contentForMode(mode, 'cs'),
      en: contentForMode(mode, 'en'),
      ua: contentForMode(mode, 'ua'),
    });
  }
  if (language === 'ua') {
    if (mode === 'PRACOVNIK') {
      return {
        title: 'Чиста робоча зона для щоденної роботи.',
        quote: 'Скануй. Підтверджуй. Рухай роботу вперед.',
        workTitle: 'Робота',
        workEyebrow: 'завдання · сканування · пакування',
        note: 'Працівник бачить лише наступну роботу, сканування, контроль запасів і дозволений операційний друк.',
        actions: [
          { title: 'Відкрити сканування', detail: 'Локація, SKU, кількість і виняток.', route: '/rf', badge: 'RF' },
          { title: 'Показати завдання', detail: 'Черга роботи за пріоритетом.', route: '/tasks', badge: 'Завдання' },
          { title: 'Відкрити пакування', detail: 'Скан позицій і дозволений друк етикеток.', route: '/packing', badge: 'Пакування' },
        ],
        links: [
          { label: 'Приймання', route: '/inbound', detail: 'Прийняти товар на склад.' },
          { label: 'Запаси', route: '/inventory', detail: 'Знайти товар або локацію.' },
          { label: 'Принтери', route: '/print-stations', detail: 'Друк дозволених робочих етикеток.' },
        ],
      };
    }

    if (mode === 'SPRAVCE') {
      return {
        title: 'Адміністрування системи.',
        quote: 'Налаштовуй доступи. Контролюй інтеграції та друк.',
        workTitle: 'Адміністрування',
        workEyebrow: 'користувачі · інтеграції · принтери',
        note: 'Адміністратор керує користувачами, ролями, складами, інтеграціями, принтерами та безпекою системи.',
        actions: [
          { title: 'Керувати користувачами', detail: 'Створити працівників і керівників складу.', route: '/settings', badge: 'Користувачі' },
          { title: 'Перевірити інтеграції', detail: 'Стан підключень із сервера.', route: '/integrations', badge: 'API' },
          { title: 'Відкрити принтери', detail: 'Станції друку, етикетки та черга.', route: '/print-stations', badge: 'Друк' },
        ],
        links: [
          { label: 'Налаштування', route: '/settings', detail: 'Акаунт і користувачі.' },
          { label: 'Інтеграції', route: '/integrations', detail: 'Стан e-shop і API.' },
          { label: 'Принтери', route: '/print-stations', detail: 'Етикетки та повторний друк.' },
        ],
      };
    }

    return {
      title: 'Операції складу.',
      quote: 'Стеж за термінами. Вирішуй винятки. Тримай роботу в русі.',
      workTitle: 'Керування зміною',
      workEyebrow: 'замовлення · завдання · винятки',
      note: 'Керівник бачить операційний стан, чергу завдань, ризик доставки, друк і стан інтеграцій.',
      actions: [
        { title: 'Відкрити операції', detail: 'Терміни, винятки та стан зміни.', route: '/control-tower', badge: 'Операції' },
        { title: 'Перевірити замовлення', detail: 'Активна видача та ризик доставки.', route: '/outbound', badge: 'Замовлення' },
        { title: 'Керувати завданнями', detail: 'Черга роботи для команди.', route: '/tasks', badge: 'Завдання' },
      ],
      links: [
        { label: 'Приймання', route: '/inbound', detail: 'Робота на прийманні.' },
        { label: 'Принтери', route: '/print-stations', detail: 'Черга друку та повторний друк.' },
        { label: 'Інтеграції', route: '/integrations', detail: 'Стан підключень.' },
      ],
    };
  }

  if (language === 'en') {
    if (mode === 'PRACOVNIK') {
      return {
        title: 'A clean workspace for daily work.',
        quote: 'Scan. Confirm. Move the work forward.',
        workTitle: 'Work',
        workEyebrow: 'tasks · scanning · packing',
        note: 'Workers see only the next job, scan flow, stock lookup, and allowed operational printing.',
        actions: [
          { title: 'Open scanning', detail: 'Location, SKU, quantity, and exception flow.', route: '/rf', badge: 'RF' },
          { title: 'Show tasks', detail: 'Work queue by priority.', route: '/tasks', badge: 'Tasks' },
          { title: 'Open packing', detail: 'Scan items and print allowed labels.', route: '/packing', badge: 'Pack' },
        ],
        links: [
          { label: 'Receiving', route: '/inbound', detail: 'Receive goods into the warehouse.' },
          { label: 'Inventory', route: '/inventory', detail: 'Find stock or location.' },
          { label: 'Printers', route: '/print-stations', detail: 'Print allowed operational labels.' },
        ],
      };
    }

    if (mode === 'SPRAVCE') {
      return {
        title: 'System administration.',
        quote: 'Set access. Keep integrations and printing under control.',
        workTitle: 'Administration',
        workEyebrow: 'users · integrations · printers',
        note: 'Administrators manage users, roles, warehouses, integrations, printers, and system safety.',
        actions: [
          { title: 'Manage users', detail: 'Create workers and warehouse managers.', route: '/settings', badge: 'Users' },
          { title: 'Check integrations', detail: 'Connection status from the server.', route: '/integrations', badge: 'API' },
          { title: 'Open printers', detail: 'Print stations, labels, and queue.', route: '/print-stations', badge: 'Print' },
        ],
        links: [
          { label: 'Settings', route: '/settings', detail: 'Account and users.' },
          { label: 'Integrations', route: '/integrations', detail: 'Shop and API status.' },
          { label: 'Printers', route: '/print-stations', detail: 'Labels and reprints.' },
        ],
      };
    }

    return {
      title: 'Warehouse operations.',
      quote: 'Watch deadlines. Resolve exceptions. Keep work moving.',
      workTitle: 'Shift control',
      workEyebrow: 'orders · tasks · exceptions',
      note: 'Managers see operational status, task queues, shipping risk, printing, and integration health.',
      actions: [
        { title: 'Open operations', detail: 'Deadlines, exceptions, and shift status.', route: '/control-tower', badge: 'Ops' },
        { title: 'Check orders', detail: 'Active outbound work and shipping risk.', route: '/outbound', badge: 'Orders' },
        { title: 'Manage tasks', detail: 'Work queue for the team.', route: '/tasks', badge: 'Tasks' },
      ],
      links: [
        { label: 'Receiving', route: '/inbound', detail: 'Inbound work.' },
        { label: 'Printers', route: '/print-stations', detail: 'Print queue and reprints.' },
        { label: 'Integrations', route: '/integrations', detail: 'Connection health.' },
      ],
    };
  }

  if (mode === 'PRACOVNIK') {
    return {
      title: 'Pracovní plocha bez zbytečností.',
      quote: 'Skenuj. Potvrzuj. Posouvej práci dál.',
      workTitle: 'Práce',
      workEyebrow: 'úkoly · skenování · balení',
      note: 'Skladník vidí jen další práci, skenování, kontrolu zásob a povolený provozní tisk.',
      actions: [
        { title: 'Otevřít skenování', detail: 'Lokace, SKU, množství a výjimka.', route: '/rf', badge: 'RF' },
        { title: 'Zobrazit úkoly', detail: 'Fronta práce podle priority.', route: '/tasks', badge: 'Úkoly' },
        { title: 'Otevřít balení', detail: 'Sken položek a povolený tisk štítků.', route: '/packing', badge: 'Balení' },
      ],
      links: [
        { label: 'Příjem', route: '/inbound', detail: 'Přijmout zboží do skladu.' },
        { label: 'Zásoby', route: '/inventory', detail: 'Najít položku nebo lokaci.' },
        { label: 'Tiskárny', route: '/print-stations', detail: 'Tisk povolených provozních štítků.' },
      ],
    };
  }

  if (mode === 'SPRAVCE') {
    return {
      title: 'Správa systému.',
      quote: 'Nastav přístupy. Hlídej napojení a tisk.',
      workTitle: 'Administrace',
      workEyebrow: 'uživatelé · integrace · tiskárny',
      note: 'Správce řeší uživatele, role, sklady, integrace, tiskárny a bezpečný stav systému.',
      actions: [
        { title: 'Spravovat uživatele', detail: 'Vytvořit skladníka nebo vedoucího skladu.', route: '/settings', badge: 'Uživatelé' },
        { title: 'Zkontrolovat integrace', detail: 'Stav napojení ze serveru.', route: '/integrations', badge: 'API' },
        { title: 'Otevřít tiskárny', detail: 'Tiskové stanice, štítky a fronta.', route: '/print-stations', badge: 'Tisk' },
      ],
      links: [
        { label: 'Nastavení', route: '/settings', detail: 'Účet a uživatelé.' },
        { label: 'Integrace', route: '/integrations', detail: 'Stav e-shopu a API.' },
        { label: 'Tiskárny', route: '/print-stations', detail: 'Štítky a dotisk.' },
      ],
    };
  }

  return {
    title: 'Řízení skladu.',
    quote: 'Hlídej termíny. Řeš výjimky. Drž práci v pohybu.',
    workTitle: 'Řízení směny',
    workEyebrow: 'objednávky · úkoly · výjimky',
    note: 'Vedoucí skladu vidí provoz, frontu práce, riziko expedice, tisk a stav integrací.',
    actions: [
      { title: 'Otevřít provoz', detail: 'Termíny, výjimky a stav směny.', route: '/control-tower', badge: 'Provoz' },
      { title: 'Zkontrolovat objednávky', detail: 'Aktivní výdej a riziko expedice.', route: '/outbound', badge: 'Objednávky' },
      { title: 'Řídit úkoly', detail: 'Fronta práce pro tým.', route: '/tasks', badge: 'Úkoly' },
    ],
    links: [
      { label: 'Příjem', route: '/inbound', detail: 'Práce na příjmu.' },
      { label: 'Tiskárny', route: '/print-stations', detail: 'Fronta tisku a dotisky.' },
      { label: 'Integrace', route: '/integrations', detail: 'Stav napojení.' },
    ],
  };
}

export function DashboardPage() {
  const { roleProfile, warehouse, workspaceMode, language } = useWorkspace();
  const content = contentForMode(workspaceMode, language);
  const labels = pickLanguage(language, { cs: { context: 'Aktuální kontext', quick: 'Rychlé vstupy', shortest: 'nejkratší cesta', principle: 'Princip rozhraní', clean: 'čistý pohled podle role', system: 'Stav systému' }, en: { context: 'Current context', quick: 'Quick entries', shortest: 'shortest path', principle: 'Interface principle', clean: 'clean role view', system: 'System status' }, ua: { context: 'Поточний контекст', quick: 'Швидкі входи', shortest: 'найкоротший шлях', principle: 'Принцип інтерфейсу', clean: 'чистий вигляд за роллю', system: 'Стан системи' } });

  return (
    <div className="page-grid role-home">
      <section className="role-home-hero span-12" aria-label={roleProfile.workspaceLabel}>
        <p className="eyebrow">{roleProfile.workspaceLabel}</p>
        <h2>{content.title}</h2>
        <p className="role-home-quote">{content.quote}</p>
        <div className="role-home-meta" aria-label={labels.context}>
          <span>{warehouse.label}</span>
          <span>{roleProfile.label}</span>
        </div>
      </section>

      <Card title={content.workTitle} className="span-8">
        <div className="role-action-list">
          {content.actions.map((action) => (
            <a href={`#${action.route}`} className="role-action" key={action.title}>
              <Badge tone="neutral" compact>{action.badge}</Badge>
              <span>
                <strong>{action.title}</strong>
                <small>{action.detail}</small>
              </span>
            </a>
          ))}
        </div>
      </Card>

      <Card title={labels.quick} className="span-4">
        <div className="role-link-grid">
          {content.links.map((link) => (
            <a href={`#${link.route}`} key={link.label}>
              <strong>{link.label}</strong>
              <small>{link.detail}</small>
            </a>
          ))}
        </div>
      </Card>

      {(workspaceMode === 'SPRAVCE' || workspaceMode === 'ADMIN') && (
        <Card title={labels.system} className="span-12">
          <SystemStatusPanel />
        </Card>
      )}
    </div>
  );
}
