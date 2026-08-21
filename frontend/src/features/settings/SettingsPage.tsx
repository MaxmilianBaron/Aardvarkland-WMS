import { pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';
import { FormEvent, useMemo, useState } from 'react';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { createUser, listAuditLogs, listUsers } from '../../core/api/wms';
import { useWorkspace, type Language, type RoleId } from '../../core/workspace/workspace';

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  status: string;
  roles: Array<{ roleCode: RoleId | string; warehouseCode: string }>;
}

interface AuditRow {
  id: string;
  actor: string;
  warehouse: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

const emptyUsers: UserRow[] = [];
const emptyAudit: AuditRow[] = [];

export function SettingsPage() {
  const { role, warehouseId, language, can } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const canReadUsers = can('user.read');
  const canManageUsers = can('user.manage');
  const canReadAudit = can('audit.read');
  const creatableRoles = useMemo(() => getCreatableRoles(role), [role]);
  const users = useApiResource<UserRow[]>({
    fallback: emptyUsers,
    productionFallback: emptyUsers,
    enabled: canReadUsers,
    loader: () => listUsers<unknown[]>(),
    map: mapUsers,
    dependencies: [canReadUsers],
  });
  const mutation = useApiMutation();
  const auditLogs = useApiResource<AuditRow[]>({
    fallback: emptyAudit,
    productionFallback: emptyAudit,
    enabled: canReadAudit,
    loader: () => listAuditLogs<unknown[]>({ limit: 100 }),
    map: mapAuditLogs,
    dependencies: [canReadAudit],
  });
  const [displayName, setDisplayName] = useState('');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState<RoleId>(creatableRoles[0]?.value ?? 'WAREHOUSE_WORKER');

  const columns: Column<UserRow>[] = [
    { key: 'name', label: text.columns.name, render: (row) => <div><strong>{row.displayName}</strong><small>{row.email}</small></div> },
    { key: 'role', label: text.columns.role, render: (row) => row.roles.map((assignment) => roleLabel(assignment.roleCode, language)).join(', ') || '-' },
    { key: 'status', label: text.columns.status, render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'good' : 'warning'}>{statusLabel(row.status, language)}</Badge> },
  ];
  const auditColumns: Column<AuditRow>[] = [
    { key: 'created', label: text.audit.columns.created, render: (row) => formatDate(row.createdAt) },
    { key: 'actor', label: text.audit.columns.actor, render: (row) => row.actor || text.audit.systemActor },
    { key: 'warehouse', label: text.audit.columns.warehouse, render: (row) => row.warehouse || '-' },
    { key: 'action', label: text.audit.columns.action, render: (row) => <strong>{row.action}</strong> },
    { key: 'resource', label: text.audit.columns.resource, render: (row) => `${row.resourceType}${row.resourceId ? ` · ${row.resourceId}` : ''}` },
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!creatableRoles.some((item) => item.value === roleCode)) return;
    const email = toLoginEmail(loginName);
    const result = await mutation.run(text.createAction, () => createUser({
      email,
      displayName,
      password,
      roleCode,
      warehouseCode: warehouseId,
    }));
    if (result) {
      setDisplayName('');
      setLoginName('');
      setPassword('');
      users.refresh();
    }
  };

  return (
    <div className="page-grid">
      <section className="wms-page-intro span-12">
        <div>
          <h2>{text.title}</h2>
        </div>
      </section>

      <Card title={text.users.title} className="span-7">
        {!canManageUsers || creatableRoles.length === 0 ? (
          <p className="role-note">{text.users.noAccess}</p>
        ) : (
          <form className="settings-user-form" onSubmit={submit}>
            <label>{text.fields.name}<input data-testid="settings-user-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={120} required /></label>
            <label>{text.fields.login}<input data-testid="settings-user-login" value={loginName} onChange={(event) => setLoginName(event.target.value)} minLength={2} maxLength={320} required /></label>
            <label>{text.fields.password}<input data-testid="settings-user-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={12} maxLength={128} required /></label>
            <label>{text.fields.role}<select data-testid="settings-user-role" value={roleCode} onChange={(event) => setRoleCode(event.target.value as RoleId)}>{creatableRoles.map((item) => <option key={item.value} value={item.value}>{pickLanguage(language, item.label)}</option>)}</select></label>
            <Button tone="primary" type="submit" data-e2e-action="settings-create-user" disabled={mutation.status === 'running'}>{text.users.submit}</Button>
            <ActionStatus mutation={mutation} />
          </form>
        )}
      </Card>

      {role === 'WMS_ADMIN' && (
        <Card title={text.system.title} className="span-12">
          <div className="role-link-grid">
            {text.system.links.map((link) => (
              <a href={link.href} key={link.label}>
                <strong>{link.label}</strong>
              </a>
            ))}
          </div>
        </Card>
      )}

      {canReadUsers && (
        <Card
          title={text.users.listTitle}
          className="span-12"
          action={(
            <Button size="sm" type="button" onClick={users.refresh} disabled={users.status === 'loading'}>
              {text.users.refresh}
            </Button>
          )}
        >
          {users.status === 'error' && (
            <div className="inline-banner inline-banner--warning" role="alert">
              <span>{text.users.loadError}</span>
            </div>
          )}
          <DataTable rows={users.data} columns={columns} getRowKey={(row) => row.id} emptyTitle={text.users.emptyTitle} emptyText={text.users.emptyText} />
        </Card>
      )}

      {canReadAudit && (
        <Card
          title={text.audit.title}
          className="span-12"
          action={(
            <Button size="sm" type="button" onClick={auditLogs.refresh} disabled={auditLogs.status === 'loading'}>
              {text.audit.refresh}
            </Button>
          )}
        >
          {auditLogs.status === 'error' && (
            <div className="inline-banner inline-banner--warning" role="alert">
              <span>{text.audit.loadError}</span>
            </div>
          )}
          <DataTable rows={auditLogs.data} columns={auditColumns} getRowKey={(row) => row.id} emptyTitle={text.audit.emptyTitle} emptyText={text.audit.emptyText} />
        </Card>
      )}
    </div>
  );
}

function getCreatableRoles(role: RoleId) {
  if (role === 'WMS_ADMIN') {
    return [
      { value: 'WAREHOUSE_WORKER' as const, label: { cs: 'Skladník', en: 'Warehouse worker', ua: 'Працівник складу' } },
      { value: 'WAREHOUSE_MANAGER' as const, label: { cs: 'Vedoucí skladu', en: 'Warehouse manager', ua: 'Керівник складу' } },
      { value: 'WMS_ADMIN' as const, label: { cs: 'Správce systému', en: 'System administrator', ua: 'Системний адміністратор' } },
    ];
  }

  return [];
}

function mapUsers(payload: unknown): UserRow[] {
  const rows = Array.isArray(payload) ? payload : Array.isArray(record(payload)['data']) ? record(payload)['data'] as unknown[] : [];
  return rows.map((value) => {
    const row = record(value);
    return {
      id: stringValue(row['id'], stringValue(row['email'], Math.random().toString(36))),
      displayName: stringValue(row['displayName'], '-'),
      email: stringValue(row['email'], '-'),
      status: stringValue(row['status'], 'ACTIVE'),
      roles: array(row['roles']).map((assignment) => {
        const role = record(assignment);
        return {
          roleCode: stringValue(role['roleCode'], ''),
          warehouseCode: stringValue(role['warehouseCode'], ''),
        };
      }),
    };
  });
}

function mapAuditLogs(payload: unknown): AuditRow[] {
  const rows = Array.isArray(payload) ? payload : Array.isArray(record(payload)['data']) ? record(payload)['data'] as unknown[] : [];
  return rows.map((value) => {
    const row = record(value);
    return {
      id: stringValue(row['id'], Math.random().toString(36)),
      actor: stringValue(row['actorDisplayName'], stringValue(row['actorEmail'], '')),
      warehouse: stringValue(row['warehouseCode'], stringValue(row['warehouseName'], '')),
      action: stringValue(row['action'], '-'),
      resourceType: stringValue(row['resourceType'], '-'),
      resourceId: nullableString(row['resourceId']),
      createdAt: stringValue(row['createdAt'], ''),
    };
  });
}

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function toLoginEmail(value: string) {
  const trimmed = value.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@aardvarkland.local`;
}

function roleLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    WAREHOUSE_WORKER: { cs: 'Skladník', en: 'Warehouse worker', ua: 'Працівник складу' },
    WAREHOUSE_MANAGER: { cs: 'Vedoucí skladu', en: 'Warehouse manager', ua: 'Керівник складу' },
    WMS_ADMIN: { cs: 'Správce systému', en: 'System administrator', ua: 'Адміністратор системи' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
}

function statusLabel(value: string, language: Language) {
  return value === 'ACTIVE'
    ? pickLanguage(language, { cs: 'Aktivní', en: 'Active', ua: 'Активний' })
    : pickLanguage(language, { cs: 'Vypnuto', en: 'Disabled', ua: 'Вимкнено' });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

const czech = {
  title: 'Nastavení',
  subtitle: 'Správa uživatelů a rolí.',
  createAction: 'Vytvoření uživatele',
  users: {
    title: 'Nový uživatel',
    noAccess: 'Nemáte oprávnění vytvářet uživatele.',
    passwordPolicy: 'Heslo musí mít alespoň 12 znaků, velké písmeno, malé písmeno, číslo a symbol.',
    submit: 'Vytvořit uživatele',
    listTitle: 'Uživatelé',
    refresh: 'Obnovit',
    loadError: 'Uživatelé se nepodařilo načíst.',
    emptyTitle: 'Žádní uživatelé',
    emptyText: 'Zatím nejsou k dispozici žádní uživatelé.',
  },
  audit: {
    title: 'Auditní log',
    refresh: 'Obnovit',
    loadError: 'Auditní log se nepodařilo načíst.',
    emptyTitle: 'Zatím žádné záznamy',
    emptyText: 'Systém zatím nevrátil žádné auditní události.',
    systemActor: 'Systém',
    columns: { created: 'Čas', actor: 'Uživatel', warehouse: 'Sklad', action: 'Akce', resource: 'Objekt' },
  },
  system: {
    title: 'Systémová správa',
    links: [
      { label: 'Uživatelé a role', detail: 'Přidání skladníka nebo vedoucího podle oprávnění.', href: '#/settings' },
      { label: 'Stabilita backendu', detail: 'Alerty, readiness, startup kontroly a retence dat.', href: '#/reliability' },
      { label: 'Tiskárny a štítky', detail: 'Tiskové stanice, šablony a fronta tisku.', href: '#/print-stations' },
      { label: 'Integrace', detail: 'Stav napojení, chyby synchronizace a technické nastavení.', href: '#/integrations' },
    ],
  },
  fields: { name: 'Jméno', login: 'Přihlašovací jméno nebo e-mail', password: 'Dočasné heslo', role: 'Role' },
  columns: { name: 'Uživatel', role: 'Role', status: 'Stav' },
};

const english = {
  title: 'Settings',
  subtitle: 'User and role management.',
  createAction: 'User creation',
  users: {
    title: 'New user',
    noAccess: 'You do not have permission to create users.',
    passwordPolicy: 'The password must have at least 12 characters, uppercase, lowercase, number, and symbol.',
    submit: 'Create user',
    listTitle: 'Users',
    refresh: 'Refresh',
    loadError: 'Users could not be loaded.',
    emptyTitle: 'No users',
    emptyText: 'No users are available yet.',
  },
  audit: {
    title: 'Audit log',
    refresh: 'Refresh',
    loadError: 'Audit log could not be loaded.',
    emptyTitle: 'No records yet',
    emptyText: 'The system has not returned any audit events yet.',
    systemActor: 'System',
    columns: { created: 'Time', actor: 'User', warehouse: 'Warehouse', action: 'Action', resource: 'Object' },
  },
  system: {
    title: 'System administration',
    links: [
      { label: 'Users and roles', detail: 'Create workers or warehouse managers according to permissions.', href: '#/settings' },
      { label: 'Backend reliability', detail: 'Alerts, readiness, startup checks, and data retention.', href: '#/reliability' },
      { label: 'Printers and labels', detail: 'Print stations, templates, and print queue.', href: '#/print-stations' },
      { label: 'Integrations', detail: 'Connection status, sync errors, and technical settings.', href: '#/integrations' },
    ],
  },
  fields: { name: 'Name', login: 'Login name or email', password: 'Temporary password', role: 'Role' },
  columns: { name: 'User', role: 'Role', status: 'Status' },
};

const ukrainian = {
  title: 'Налаштування',
  subtitle: 'Керування користувачами та ролями.',
  createAction: 'Створення користувача',
  users: {
    title: 'Новий користувач',
    noAccess: 'У вас немає прав створювати користувачів.',
    passwordPolicy: 'Пароль має містити щонайменше 12 символів, велику і малу літеру, цифру та символ.',
    submit: 'Створити користувача',
    listTitle: 'Користувачі',
    refresh: 'Оновити',
    loadError: 'Не вдалося завантажити користувачів.',
    emptyTitle: 'Немає користувачів',
    emptyText: 'Поки немає доступних користувачів.',
  },
  audit: {
    title: 'Журнал аудиту',
    refresh: 'Оновити',
    loadError: 'Не вдалося завантажити журнал аудиту.',
    emptyTitle: 'Записів поки немає',
    emptyText: 'Система ще не повернула події аудиту.',
    systemActor: 'Система',
    columns: { created: 'Час', actor: 'Користувач', warehouse: 'Склад', action: 'Дія', resource: 'Об’єкт' },
  },
  system: {
    title: 'Системне адміністрування',
    links: [
      { label: 'Користувачі та ролі', detail: 'Створення працівника або керівника складу за правами.', href: '#/settings' },
      { label: 'Стабільність backend', detail: 'Алерти, readiness, startup перевірки та ретенція даних.', href: '#/reliability' },
      { label: 'Принтери та етикетки', detail: 'Станції друку, шаблони та черга друку.', href: '#/print-stations' },
      { label: 'Інтеграції', detail: 'Стан підключення, помилки синхронізації та технічні налаштування.', href: '#/integrations' },
    ],
  },
  fields: { name: 'Ім’я', login: 'Ім’я для входу або e-mail', password: 'Тимчасовий пароль', role: 'Роль' },
  columns: { name: 'Користувач', role: 'Роль', status: 'Стан' },
};
