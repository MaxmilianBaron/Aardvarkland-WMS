import { pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';
import { FormEvent, useMemo, useState } from 'react';
import { ActionStatus } from '../../components/ops/ActionStatus';
import { DataSourceBanner } from '../../components/ops/DataSourceBanner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { createProduct, createSku, listProducts, listSkus } from '../../core/api/wms';
import { useApiMutation } from '../../core/api/useApiMutation';
import { useApiResource } from '../../core/api/useApiResource';
import { useWorkspace, type Language } from '../../core/workspace/workspace';

interface ProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  skuCount: number;
}

interface SkuRow {
  id: string;
  productCode: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
  weightGrams: number | null;
  status: string;
}

const emptyProducts: ProductRow[] = [];
const emptySkus: SkuRow[] = [];

export function ProductMasterPage() {
  const { language, can } = useWorkspace();
  const text = pickLanguage(language, { cs: czech, en: english, ua: ukrainian });
  const mutation = useApiMutation();
  const canManageProducts = can('product.manage');
  const [query, setQuery] = useState('');
  const [productForm, setProductForm] = useState({ code: '', name: '', description: '' });
  const [skuForm, setSkuForm] = useState({ productReference: '', code: '', name: '', barcode: '', uom: 'EA', weightGrams: '' });
  const productsResource = useApiResource<ProductRow[]>({
    fallback: emptyProducts,
    productionFallback: emptyProducts,
    loader: () => listProducts<unknown[]>(),
    map: mapProducts,
    dependencies: [],
  });
  const skusResource = useApiResource<SkuRow[]>({
    fallback: emptySkus,
    productionFallback: emptySkus,
    loader: () => listSkus<unknown[]>(),
    map: mapSkus,
    dependencies: [],
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return productsResource.data;
    return productsResource.data.filter((product) => `${product.code} ${product.name} ${product.description ?? ''}`.toLowerCase().includes(q));
  }, [productsResource.data, query]);

  const skuRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skusResource.data;
    return skusResource.data.filter((sku) => `${sku.code} ${sku.name} ${sku.productCode} ${sku.barcode ?? ''}`.toLowerCase().includes(q));
  }, [query, skusResource.data]);

  const productColumns: Column<ProductRow>[] = [
    { key: 'code', label: text.columns.code, render: (row) => <strong>{row.code}</strong> },
    { key: 'name', label: text.columns.name, render: (row) => <div><strong>{row.name}</strong><small>{row.description || text.noDescription}</small></div> },
    { key: 'skus', label: text.columns.skus, align: 'right', render: (row) => row.skuCount },
    { key: 'status', label: text.columns.status, render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'good' : 'warning'}>{productStatusLabel(row.status, language)}</Badge> },
  ];
  const skuColumns: Column<SkuRow>[] = [
    { key: 'code', label: 'SKU', render: (row) => <strong>{row.code}</strong> },
    { key: 'name', label: text.columns.name, render: (row) => <div><strong>{row.name}</strong><small>{row.productCode}</small></div> },
    { key: 'barcode', label: text.columns.barcode, render: (row) => row.barcode || text.notSet },
    { key: 'uom', label: text.columns.uom, render: (row) => row.uom },
    { key: 'weight', label: text.columns.weight, align: 'right', render: (row) => row.weightGrams === null ? text.notSet : `${row.weightGrams} g` },
  ];

  const refresh = () => {
    productsResource.refresh();
    skusResource.refresh();
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    const result = await mutation.run(text.actions.saveProduct, () => createProduct( {
      code: productForm.code,
      name: productForm.name,
      description: productForm.description || undefined,
      metadata: { source: 'storage-ui' },
    }));
    if (result) {
      const code = productForm.code.trim().toUpperCase();
      setProductForm({ code: '', name: '', description: '' });
      setSkuForm((form) => ({ ...form, productReference: form.productReference || code }));
      refresh();
    }
  };

  const saveSku = async (event: FormEvent) => {
    event.preventDefault();
    const weight = Number.parseInt(skuForm.weightGrams, 10);
    const result = await mutation.run(text.actions.saveSku, () => createSku({
      productReference: skuForm.productReference,
      code: skuForm.code,
      name: skuForm.name,
      barcode: skuForm.barcode || undefined,
      uom: skuForm.uom || 'EA',
      weightGrams: Number.isFinite(weight) && weight >= 0 ? weight : undefined,
      metadata: { source: 'storage-ui' },
    }));
    if (result) {
      setSkuForm((form) => ({ ...form, code: '', name: '', barcode: '', weightGrams: '' }));
      refresh();
    }
  };

  return (
    <div className="page-grid page-grid--tight">
      <section className="wms-page-intro span-12">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h2>{text.title}</h2>
          <span>{text.subtitle}</span>
        </div>
        <Button size="sm" type="button" onClick={refresh} disabled={productsResource.status === 'loading' || skusResource.status === 'loading'}>{text.refresh}</Button>
      </section>

      <div className="span-12"><DataSourceBanner label={text.banner} resource={productsResource} /></div>

      <Card
        title={text.products}
        eyebrow={text.productsEyebrow}
        className="span-7"
        action={<input className="search-input" data-testid="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} />}
      >
        <DataTable rows={rows} columns={productColumns} getRowKey={(row) => row.id || row.code} emptyTitle={text.emptyProductsTitle} emptyText={text.emptyProductsText} />
      </Card>

      <Card title={text.skus} eyebrow={text.skusEyebrow} className="span-5">
        <DataTable rows={skuRows} columns={skuColumns} getRowKey={(row) => row.id || row.code} emptyTitle={text.emptySkusTitle} emptyText={text.emptySkusText} />
      </Card>

      {canManageProducts && (
        <Card title={text.addProduct} className="span-6">
          <form className="stacked-form" onSubmit={saveProduct}>
            <label>{text.fields.code}<input data-testid="product-code" value={productForm.code} onChange={(event) => setProductForm((form) => ({ ...form, code: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.name}<input data-testid="product-name" value={productForm.name} onChange={(event) => setProductForm((form) => ({ ...form, name: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.description}<textarea data-testid="product-description" value={productForm.description} onChange={(event) => setProductForm((form) => ({ ...form, description: event.target.value }))} rows={3} /></label>
            <Button tone="primary" type="submit" disabled={mutation.status === 'running'}>{text.save}</Button>
          </form>
        </Card>
      )}

      {canManageProducts && (
        <Card title={text.addSku} className="span-6">
          <form className="stacked-form" onSubmit={saveSku}>
            <label>{text.fields.product}<input data-testid="sku-product-reference" value={skuForm.productReference} onChange={(event) => setSkuForm((form) => ({ ...form, productReference: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.code}<input data-testid="sku-code" value={skuForm.code} onChange={(event) => setSkuForm((form) => ({ ...form, code: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.name}<input data-testid="sku-name" value={skuForm.name} onChange={(event) => setSkuForm((form) => ({ ...form, name: event.target.value }))} autoComplete="off" required /></label>
            <label>{text.fields.barcode}<input data-testid="sku-barcode" value={skuForm.barcode} onChange={(event) => setSkuForm((form) => ({ ...form, barcode: event.target.value }))} autoComplete="off" /></label>
            <label>{text.fields.uom}<input data-testid="sku-uom" value={skuForm.uom} onChange={(event) => setSkuForm((form) => ({ ...form, uom: event.target.value }))} autoComplete="off" /></label>
            <label>{text.fields.weight}<input data-testid="sku-weight" type="number" min="0" value={skuForm.weightGrams} onChange={(event) => setSkuForm((form) => ({ ...form, weightGrams: event.target.value }))} /></label>
            <Button tone="primary" type="submit" disabled={mutation.status === 'running'}>{text.save}</Button>
          </form>
        </Card>
      )}

      {canManageProducts && <div className="span-12"><ActionStatus mutation={mutation} /></div>}
    </div>
  );
}

function mapProducts(payload: unknown): ProductRow[] {
  const rows = Array.isArray(payload) ? payload : array(record(payload)['data']);
  return rows.map((value) => {
    const row = record(value);
    return {
      id: stringValue(row['id'], stringValue(row['code'], '')),
      code: stringValue(row['code'], ''),
      name: stringValue(row['name'], ''),
      description: nullableString(row['description']),
      status: stringValue(row['status'], 'ACTIVE'),
      skuCount: array(row['skus']).length,
    };
  }).filter((product) => product.code);
}

function mapSkus(payload: unknown): SkuRow[] {
  const rows = Array.isArray(payload) ? payload : array(record(payload)['data']);
  return rows.map((value) => {
    const row = record(value);
    const product = record(row['product']);
    return {
      id: stringValue(row['id'], stringValue(row['code'], '')),
      productCode: stringValue(product['code'] ?? row['productCode'], ''),
      code: stringValue(row['code'], ''),
      name: stringValue(row['name'], ''),
      barcode: nullableString(row['barcode']),
      uom: stringValue(row['uom'], 'EA'),
      weightGrams: numberValue(row['weightGrams']),
      status: stringValue(row['status'], 'ACTIVE'),
    };
  }).filter((sku) => sku.code);
}

function productStatusLabel(value: string, language: Language) {
  const labels: Record<string, BaseTranslations<string>> = {
    ACTIVE: { cs: 'Aktivní', en: 'Active', ua: 'Активний' },
    BLOCKED: { cs: 'Blokováno', en: 'Blocked', ua: 'Заблоковано' },
    DISCONTINUED: { cs: 'Ukončeno', en: 'Discontinued', ua: 'Припинено' },
  };
  return labels[value] ? pickLanguage(language, labels[value]) : value;
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

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const czech = {
  eyebrow: 'kmenová data',
  title: 'Produkty a SKU',
  subtitle: 'Správa produktů, skladových kódů a čárových kódů.',
  banner: 'API produktů',
  refresh: 'Obnovit',
  products: 'Produkty',
  productsEyebrow: 'produktový katalog',
  skus: 'SKU',
  skusEyebrow: 'skladové položky',
  addProduct: 'Přidat produkt',
  addSku: 'Přidat SKU',
  save: 'Uložit',
  search: 'Hledat produkt, SKU nebo kód...',
  notSet: 'Nenastaveno',
  noDescription: 'Bez popisu',
  emptyProductsTitle: 'Žádné produkty',
  emptyProductsText: 'Zatím nejsou založené žádné produkty.',
  emptySkusTitle: 'Žádné SKU',
  emptySkusText: 'Zatím nejsou založené žádné skladové položky.',
  columns: { code: 'Kód', name: 'Název', skus: 'SKU', status: 'Stav', barcode: 'Čárový kód', uom: 'MJ', weight: 'Hmotnost' },
  fields: { product: 'Produkt', code: 'Kód', name: 'Název', description: 'Popis', barcode: 'Čárový kód', uom: 'MJ', weight: 'Hmotnost v gramech' },
  actions: { saveProduct: 'Uložit produkt', saveSku: 'Uložit SKU' },
};

const english = {
  eyebrow: 'master data',
  title: 'Products and SKUs',
  subtitle: 'Manage products, warehouse item codes, and barcodes.',
  banner: 'Products API',
  refresh: 'Refresh',
  products: 'Products',
  productsEyebrow: 'product catalog',
  skus: 'SKUs',
  skusEyebrow: 'warehouse items',
  addProduct: 'Add product',
  addSku: 'Add SKU',
  save: 'Save',
  search: 'Search product, SKU, or code...',
  notSet: 'Not set',
  noDescription: 'No description',
  emptyProductsTitle: 'No products',
  emptyProductsText: 'No products have been created yet.',
  emptySkusTitle: 'No SKUs',
  emptySkusText: 'No warehouse items have been created yet.',
  columns: { code: 'Code', name: 'Name', skus: 'SKUs', status: 'Status', barcode: 'Barcode', uom: 'UoM', weight: 'Weight' },
  fields: { product: 'Product', code: 'Code', name: 'Name', description: 'Description', barcode: 'Barcode', uom: 'UoM', weight: 'Weight in grams' },
  actions: { saveProduct: 'Save product', saveSku: 'Save SKU' },
};

const ukrainian = {
  eyebrow: 'довідкові дані',
  title: 'Продукти та SKU',
  subtitle: 'Керування продуктами, складськими кодами та штрихкодами.',
  banner: 'API продуктів',
  refresh: 'Оновити',
  products: 'Продукти',
  productsEyebrow: 'каталог продуктів',
  skus: 'SKU',
  skusEyebrow: 'складські позиції',
  addProduct: 'Додати продукт',
  addSku: 'Додати SKU',
  save: 'Зберегти',
  search: 'Шукати продукт, SKU або код...',
  notSet: 'Не налаштовано',
  noDescription: 'Без опису',
  emptyProductsTitle: 'Немає продуктів',
  emptyProductsText: 'Ще не створено жодного продукту.',
  emptySkusTitle: 'Немає SKU',
  emptySkusText: 'Ще не створено жодної складської позиції.',
  columns: { code: 'Код', name: 'Назва', skus: 'SKU', status: 'Стан', barcode: 'Штрихкод', uom: 'Од.', weight: 'Вага' },
  fields: { product: 'Продукт', code: 'Код', name: 'Назва', description: 'Опис', barcode: 'Штрихкод', uom: 'Од.', weight: 'Вага в грамах' },
  actions: { saveProduct: 'Зберегти продукт', saveSku: 'Зберегти SKU' },
};
