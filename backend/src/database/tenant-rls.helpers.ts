export interface TenantRlsContext {
  clientId?: string | null;
  warehouseId?: string | null;
  disabled?: boolean;
}

export interface TenantRlsSqlClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}

export function normalizeTenantRlsContext(context: TenantRlsContext | undefined): TenantRlsContext {
  return {
    clientId: normalizeOptionalUuidLike(context?.clientId),
    warehouseId: normalizeOptionalUuidLike(context?.warehouseId),
    disabled: context?.disabled === true,
  };
}

export function hasTenantRlsScope(context: TenantRlsContext | undefined): boolean {
  const normalized = normalizeTenantRlsContext(context);

  return normalized.disabled === true || Boolean(normalized.clientId || normalized.warehouseId);
}

export function assertTenantRlsScope(context: TenantRlsContext | undefined): TenantRlsContext {
  const normalized = normalizeTenantRlsContext(context);

  if (!hasTenantRlsScope(normalized)) {
    throw new Error('Tenant RLS context is missing. Set clientId, warehouseId, or an explicit privileged disable flag.');
  }

  return normalized;
}

export async function applyTenantRlsContext(
  client: TenantRlsSqlClient,
  context: TenantRlsContext,
): Promise<void> {
  const normalized = normalizeTenantRlsContext(context);

  await setTenantConfig(client, 'app.rls_disabled', normalized.disabled ? '1' : '0');
  await setTenantConfig(client, 'app.current_client_id', normalized.clientId ?? '');
  await setTenantConfig(client, 'app.current_warehouse_id', normalized.warehouseId ?? '');
}

export async function disableTenantRlsForTransaction(client: TenantRlsSqlClient): Promise<void> {
  await setTenantConfig(client, 'app.rls_disabled', '1');
  await setTenantConfig(client, 'app.current_client_id', '');
  await setTenantConfig(client, 'app.current_warehouse_id', '');
}

export async function clearTenantRlsContext(client: TenantRlsSqlClient): Promise<void> {
  await setTenantConfig(client, 'app.rls_disabled', '0');
  await setTenantConfig(client, 'app.current_client_id', '');
  await setTenantConfig(client, 'app.current_warehouse_id', '');
}

async function setTenantConfig(
  client: TenantRlsSqlClient,
  key: 'app.rls_disabled' | 'app.current_client_id' | 'app.current_warehouse_id',
  value: string,
): Promise<void> {
  await client.$executeRaw`SELECT set_config(${key}, ${value}, true)`;
}

function normalizeOptionalUuidLike(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
