import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { AttachProductClientDto } from './dto/attach-product-client.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductDocumentDto } from './dto/create-product-document.dto';
import { CreateProductUomDto } from './dto/create-product-uom.dto';
import { CreateSkuBarcodeDto } from './dto/create-sku-barcode.dto';
import { CreateUomConversionDto } from './dto/create-uom-conversion.dto';
import { LinkProductCategoryDto } from './dto/link-product-category.dto';
import { UpsertSkuPackagingLevelDto } from './dto/upsert-sku-packaging-level.dto';
import { UpsertSkuStorageRequirementDto } from './dto/upsert-sku-storage-requirement.dto';
import {
  normalizeBarcode,
  normalizeMasterCode,
  normalizeStorageRequirement,
  validatePackagingHierarchy,
} from './product-master.helpers';
import {
  ProductCategoryLinkResponse,
  ProductCategoryResponse,
  ProductCategoryStatus,
  ProductClientOwnershipResponse,
  ProductDocumentMetadataResponse,
  ProductDocumentType,
  ProductUomConversionResponse,
  ProductUomKind,
  ProductUomResponse,
  SkuBarcodeResponse,
  SkuBarcodeType,
  SkuPackagingLevelResponse,
  SkuStorageRequirementResponse,
} from './product-master.types';

@Injectable()
export class ProductMasterService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<ProductCategoryResponse[]> {
    const rows = await this.query<ProductCategoryRow>(`SELECT * FROM product_categories ORDER BY code ASC`);
    return rows.map(toCategoryResponse);
  }

  async createCategory(
    dto: CreateProductCategoryDto,
    actor: AuthenticatedUser,
  ): Promise<ProductCategoryResponse> {
    const parent = dto.parentReference ? await this.resolveCategory(dto.parentReference) : null;
    const rows = await this.query<ProductCategoryRow>(
      `INSERT INTO product_categories (parent_id, code, name, status, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
       ON CONFLICT (code) DO UPDATE SET
         parent_id = EXCLUDED.parent_id,
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      parent?.id ?? null,
      normalizeMasterCode(dto.code),
      dto.name.trim(),
      dto.status ?? ProductCategoryStatus.ACTIVE,
      json(dto.metadata),
    );
    const category = requiredRow(rows, 'Product category was not created');
    await this.writeAudit(actor, 'product_category.upserted', 'product_category', category.id, null, {
      code: category.code,
      status: category.status,
    });
    return toCategoryResponse(category);
  }

  async linkProductCategory(
    productReference: string,
    dto: LinkProductCategoryDto,
    actor: AuthenticatedUser,
  ): Promise<ProductCategoryLinkResponse> {
    const product = await this.resolveProduct(productReference);
    const category = await this.resolveCategory(dto.categoryReference);
    if (dto.isPrimary) {
      await this.execute(
        `UPDATE product_category_links SET is_primary = false WHERE product_id = $1::uuid`,
        product.id,
      );
    }
    const rows = await this.query<ProductCategoryLinkRow>(
      `INSERT INTO product_category_links (product_id, category_id, is_primary)
       VALUES ($1::uuid, $2::uuid, $3)
       ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary = EXCLUDED.is_primary
       RETURNING *`,
      product.id,
      category.id,
      dto.isPrimary ?? false,
    );
    const link = requiredRow(rows, 'Product category link was not saved');
    await this.writeAudit(actor, 'product_category.linked', 'product_category_link', link.id, null, {
      productId: product.id,
      categoryId: category.id,
      isPrimary: link.is_primary,
    });
    return toCategoryLinkResponse(link);
  }

  async listProductCategories(productReference: string): Promise<ProductCategoryResponse[]> {
    const product = await this.resolveProduct(productReference);
    const rows = await this.query<ProductCategoryRow>(
      `SELECT c.* FROM product_categories c
       JOIN product_category_links l ON l.category_id = c.id
       WHERE l.product_id = $1::uuid
       ORDER BY l.is_primary DESC, c.code ASC`,
      product.id,
    );
    return rows.map(toCategoryResponse);
  }

  async listUoms(): Promise<ProductUomResponse[]> {
    const rows = await this.query<ProductUomRow>(`SELECT * FROM product_uoms ORDER BY code ASC`);
    return rows.map(toUomResponse);
  }

  async createUom(dto: CreateProductUomDto, actor: AuthenticatedUser): Promise<ProductUomResponse> {
    const rows = await this.query<ProductUomRow>(
      `INSERT INTO product_uoms (code, name, kind, decimals, is_active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         kind = EXCLUDED.kind,
         decimals = EXCLUDED.decimals,
         is_active = EXCLUDED.is_active,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      normalizeMasterCode(dto.code),
      dto.name.trim(),
      dto.kind ?? ProductUomKind.EACH,
      dto.decimals ?? 0,
      dto.isActive ?? true,
      json(dto.metadata),
    );
    const uom = requiredRow(rows, 'UoM was not created');
    await this.writeAudit(actor, 'product_uom.upserted', 'product_uom', uom.id, null, {
      code: uom.code,
      kind: uom.kind,
    });
    return toUomResponse(uom);
  }

  async createUomConversion(
    dto: CreateUomConversionDto,
    actor: AuthenticatedUser,
  ): Promise<ProductUomConversionResponse> {
    const product = dto.productReference ? await this.resolveProduct(dto.productReference) : null;
    const sku = dto.skuReference ? await this.resolveSku(dto.skuReference) : null;

    if (product && sku && sku.product_id !== product.id) {
      throw new ConflictException('SKU does not belong to the requested product.');
    }

    const rows = await this.query<ProductUomConversionRow>(
      `INSERT INTO product_uom_conversions
        (from_uom, to_uom, multiplier, product_id, sku_id, is_active, metadata)
       VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, $7::jsonb)
       ON CONFLICT (from_uom, to_uom, product_id, sku_id) DO UPDATE SET
         multiplier = EXCLUDED.multiplier,
         is_active = EXCLUDED.is_active,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      normalizeMasterCode(dto.fromUom),
      normalizeMasterCode(dto.toUom),
      dto.multiplier,
      product?.id ?? null,
      sku?.id ?? null,
      dto.isActive ?? true,
      json(dto.metadata),
    );
    const conversion = requiredRow(rows, 'UoM conversion was not created');
    await this.writeAudit(actor, 'product_uom_conversion.upserted', 'product_uom_conversion', conversion.id, null, {
      fromUom: conversion.from_uom,
      toUom: conversion.to_uom,
      multiplier: conversion.multiplier,
    });
    return toUomConversionResponse(conversion);
  }

  async listSkuBarcodes(skuReference: string): Promise<SkuBarcodeResponse[]> {
    const sku = await this.resolveSku(skuReference);
    const rows = await this.query<SkuBarcodeRow>(
      `SELECT * FROM sku_barcodes WHERE sku_id = $1::uuid ORDER BY is_primary DESC, barcode ASC`,
      sku.id,
    );
    return rows.map(toSkuBarcodeResponse);
  }

  async createSkuBarcode(
    skuReference: string,
    dto: CreateSkuBarcodeDto,
    actor: AuthenticatedUser,
  ): Promise<SkuBarcodeResponse> {
    const sku = await this.resolveSku(skuReference);
    const warehouse = dto.warehouseReference ? await this.resolveWarehouse(dto.warehouseReference) : null;
    const rows = await this.query<SkuBarcodeRow>(
      `INSERT INTO sku_barcodes
        (warehouse_id, sku_id, barcode, barcode_type, is_primary, status, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (sku_id, barcode) DO UPDATE SET
         warehouse_id = EXCLUDED.warehouse_id,
         barcode_type = EXCLUDED.barcode_type,
         is_primary = EXCLUDED.is_primary,
         status = EXCLUDED.status,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      warehouse?.id ?? null,
      sku.id,
      normalizeBarcode(dto.barcode),
      dto.barcodeType ?? SkuBarcodeType.INTERNAL,
      dto.isPrimary ?? false,
      dto.status ?? ProductCategoryStatus.ACTIVE,
      json(dto.metadata),
    );
    const barcode = requiredRow(rows, 'SKU barcode was not created');
    await this.writeAudit(actor, 'sku_barcode.upserted', 'sku_barcode', barcode.id, warehouse?.id ?? null, {
      skuId: sku.id,
      barcode: barcode.barcode,
      barcodeType: barcode.barcode_type,
    });
    return toSkuBarcodeResponse(barcode);
  }

  async upsertStorageRequirement(
    skuReference: string,
    dto: UpsertSkuStorageRequirementDto,
    actor: AuthenticatedUser,
  ): Promise<SkuStorageRequirementResponse> {
    const sku = await this.resolveSku(skuReference);
    const normalized = normalizeStorageRequirement(dto);
    const rows = await this.query<SkuStorageRequirementRow>(
      `INSERT INTO sku_storage_requirements
        (sku_id, temperature_min_celsius, temperature_max_celsius, fragile, hazardous, oversized, stackable, requirements)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (sku_id) DO UPDATE SET
         temperature_min_celsius = EXCLUDED.temperature_min_celsius,
         temperature_max_celsius = EXCLUDED.temperature_max_celsius,
         fragile = EXCLUDED.fragile,
         hazardous = EXCLUDED.hazardous,
         oversized = EXCLUDED.oversized,
         stackable = EXCLUDED.stackable,
         requirements = EXCLUDED.requirements,
         updated_at = now()
       RETURNING *`,
      sku.id,
      normalized.temperatureMinCelsius,
      normalized.temperatureMaxCelsius,
      normalized.fragile,
      normalized.hazardous,
      normalized.oversized,
      normalized.stackable,
      json(dto.requirements),
    );
    const requirement = requiredRow(rows, 'SKU storage requirement was not saved');
    await this.writeAudit(actor, 'sku_storage_requirement.upserted', 'sku_storage_requirement', requirement.id, null, {
      skuId: sku.id,
      fragile: requirement.fragile,
      hazardous: requirement.hazardous,
      oversized: requirement.oversized,
    });
    return toStorageRequirementResponse(requirement);
  }

  async listPackagingLevels(skuReference: string): Promise<SkuPackagingLevelResponse[]> {
    const sku = await this.resolveSku(skuReference);
    const rows = await this.query<SkuPackagingLevelRow>(
      `SELECT * FROM sku_packaging_levels WHERE sku_id = $1::uuid ORDER BY units_per_level ASC, level_code ASC`,
      sku.id,
    );
    return rows.map(toPackagingLevelResponse);
  }

  async upsertPackagingLevel(
    skuReference: string,
    dto: UpsertSkuPackagingLevelDto,
    actor: AuthenticatedUser,
  ): Promise<SkuPackagingLevelResponse> {
    const sku = await this.resolveSku(skuReference);
    const existing = await this.query<SkuPackagingLevelRow>(
      `SELECT * FROM sku_packaging_levels WHERE sku_id = $1::uuid`,
      sku.id,
    );
    validatePackagingHierarchy([
      ...existing
        .filter((level) => normalizeMasterCode(level.level_code) !== normalizeMasterCode(dto.levelCode))
        .map((level) => ({
          levelCode: level.level_code,
          unitsPerLevel: level.units_per_level,
          parentLevelCode: level.parent_level_code,
          isDefault: level.is_default,
        })),
      {
        levelCode: dto.levelCode,
        unitsPerLevel: dto.unitsPerLevel,
        parentLevelCode: dto.parentLevelCode,
        isDefault: dto.isDefault,
      },
    ]);

    if (dto.isDefault) {
      await this.execute(`UPDATE sku_packaging_levels SET is_default = false, updated_at = now() WHERE sku_id = $1::uuid`, sku.id);
    }

    const rows = await this.query<SkuPackagingLevelRow>(
      `INSERT INTO sku_packaging_levels
        (sku_id, level_code, uom, units_per_level, parent_level_code, weight_grams, length_mm, width_mm, height_mm, volume_cm3, barcode, is_default, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT (sku_id, level_code) DO UPDATE SET
         uom = EXCLUDED.uom,
         units_per_level = EXCLUDED.units_per_level,
         parent_level_code = EXCLUDED.parent_level_code,
         weight_grams = EXCLUDED.weight_grams,
         length_mm = EXCLUDED.length_mm,
         width_mm = EXCLUDED.width_mm,
         height_mm = EXCLUDED.height_mm,
         volume_cm3 = EXCLUDED.volume_cm3,
         barcode = EXCLUDED.barcode,
         is_default = EXCLUDED.is_default,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      sku.id,
      normalizeMasterCode(dto.levelCode),
      normalizeMasterCode(dto.uom),
      dto.unitsPerLevel,
      dto.parentLevelCode ? normalizeMasterCode(dto.parentLevelCode) : null,
      dto.weightGrams ?? null,
      dto.lengthMm ?? null,
      dto.widthMm ?? null,
      dto.heightMm ?? null,
      dto.volumeCm3 ?? deriveVolume(dto.lengthMm, dto.widthMm, dto.heightMm),
      dto.barcode ? normalizeBarcode(dto.barcode) : null,
      dto.isDefault ?? false,
      json(dto.metadata),
    );
    const level = requiredRow(rows, 'SKU packaging level was not saved');
    await this.writeAudit(actor, 'sku_packaging_level.upserted', 'sku_packaging_level', level.id, null, {
      skuId: sku.id,
      levelCode: level.level_code,
      unitsPerLevel: level.units_per_level,
    });
    return toPackagingLevelResponse(level);
  }

  async attachProductClient(
    productReference: string,
    dto: AttachProductClientDto,
    actor: AuthenticatedUser,
  ): Promise<ProductClientOwnershipResponse> {
    const product = await this.resolveProduct(productReference);
    const client = await this.resolveClient(dto.clientReference);
    const rows = await this.query<ProductClientOwnershipRow>(
      `INSERT INTO product_client_ownerships
        (product_id, client_id, external_article_number, status, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)
       ON CONFLICT (product_id, client_id) DO UPDATE SET
         external_article_number = EXCLUDED.external_article_number,
         status = EXCLUDED.status,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      product.id,
      client.id,
      normalizeOptionalString(dto.externalArticleNumber),
      dto.status ?? ProductCategoryStatus.ACTIVE,
      json(dto.metadata),
    );
    const ownership = requiredRow(rows, 'Product client ownership was not saved');
    await this.writeAudit(actor, 'product_client_ownership.upserted', 'product_client_ownership', ownership.id, null, {
      productId: product.id,
      clientId: client.id,
      externalArticleNumber: ownership.external_article_number,
    });
    return toProductClientOwnershipResponse(ownership);
  }

  async createProductDocument(
    productReference: string,
    dto: CreateProductDocumentDto,
    actor: AuthenticatedUser,
  ): Promise<ProductDocumentMetadataResponse> {
    const product = await this.resolveProduct(productReference);
    const rows = await this.query<ProductDocumentMetadataRow>(
      `INSERT INTO product_document_metadata
        (product_id, document_type, title, uri, mime_type, checksum_sha256, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      product.id,
      dto.documentType ?? ProductDocumentType.OTHER,
      dto.title.trim(),
      dto.uri.trim(),
      normalizeOptionalString(dto.mimeType),
      normalizeOptionalString(dto.checksumSha256),
      json(dto.metadata),
    );
    const document = requiredRow(rows, 'Product document metadata was not created');
    await this.writeAudit(actor, 'product_document_metadata.created', 'product_document_metadata', document.id, null, {
      productId: product.id,
      documentType: document.document_type,
      title: document.title,
    });
    return toProductDocumentResponse(document);
  }

  async listProductDocuments(productReference: string): Promise<ProductDocumentMetadataResponse[]> {
    const product = await this.resolveProduct(productReference);
    const rows = await this.query<ProductDocumentMetadataRow>(
      `SELECT * FROM product_document_metadata WHERE product_id = $1::uuid ORDER BY created_at DESC`,
      product.id,
    );
    return rows.map(toProductDocumentResponse);
  }

  private async resolveProduct(reference: string): Promise<ProductRow> {
    const rows = await this.query<ProductRow>(
      `SELECT id, code FROM products WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeMasterCode(reference),
    );
    const product = rows[0];
    if (!product) throw new NotFoundException('Product was not found');
    return product;
  }

  private async resolveSku(reference: string): Promise<SkuRow> {
    const rows = await this.query<SkuRow>(
      `SELECT id, code, product_id FROM skus WHERE id::text = $1 OR code = $2 OR barcode = $3 LIMIT 1`,
      reference,
      normalizeMasterCode(reference),
      reference.trim(),
    );
    const sku = rows[0];
    if (!sku) throw new NotFoundException('SKU was not found');
    return sku;
  }

  private async resolveWarehouse(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM warehouses WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeMasterCode(reference),
    );
    const warehouse = rows[0];
    if (!warehouse) throw new NotFoundException('Warehouse was not found');
    return warehouse;
  }

  private async resolveClient(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM wms_clients WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeMasterCode(reference),
    );
    const client = rows[0];
    if (!client) throw new NotFoundException('Client was not found');
    return client;
  }

  private async resolveCategory(reference: string): Promise<ProductCategoryRow> {
    const rows = await this.query<ProductCategoryRow>(
      `SELECT * FROM product_categories WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeMasterCode(reference),
    );
    const category = rows[0];
    if (!category) throw new NotFoundException('Product category was not found');
    return category;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    action: string,
    resourceType: string,
    resourceId: string,
    warehouseId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.execute(
      `INSERT INTO audit_logs (actor_user_id, warehouse_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)`,
      actor.id,
      warehouseId,
      action,
      resourceType,
      resourceId,
      json(metadata),
    );
  }

  private query<T>(query: string, ...values: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(query, ...values);
  }

  private execute(query: string, ...values: unknown[]): Promise<number> {
    return this.prisma.$executeRawUnsafe(query, ...values);
  }
}

function toCategoryResponse(row: ProductCategoryRow): ProductCategoryResponse {
  return {
    id: row.id,
    parentId: row.parent_id,
    code: row.code,
    name: row.name,
    status: row.status as ProductCategoryStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCategoryLinkResponse(row: ProductCategoryLinkRow): ProductCategoryLinkResponse {
  return {
    id: row.id,
    productId: row.product_id,
    categoryId: row.category_id,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}

function toUomResponse(row: ProductUomRow): ProductUomResponse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind as ProductUomKind,
    decimals: row.decimals,
    isActive: row.is_active,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUomConversionResponse(row: ProductUomConversionRow): ProductUomConversionResponse {
  return {
    id: row.id,
    fromUom: row.from_uom,
    toUom: row.to_uom,
    multiplier: String(row.multiplier),
    productId: row.product_id,
    skuId: row.sku_id,
    isActive: row.is_active,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSkuBarcodeResponse(row: SkuBarcodeRow): SkuBarcodeResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    skuId: row.sku_id,
    barcode: row.barcode,
    barcodeType: row.barcode_type as SkuBarcodeType,
    isPrimary: row.is_primary,
    status: row.status as ProductCategoryStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStorageRequirementResponse(row: SkuStorageRequirementRow): SkuStorageRequirementResponse {
  return {
    id: row.id,
    skuId: row.sku_id,
    temperatureMinCelsius: optionalNumber(row.temperature_min_celsius),
    temperatureMaxCelsius: optionalNumber(row.temperature_max_celsius),
    fragile: row.fragile,
    hazardous: row.hazardous,
    oversized: row.oversized,
    stackable: row.stackable,
    requirements: row.requirements,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPackagingLevelResponse(row: SkuPackagingLevelRow): SkuPackagingLevelResponse {
  return {
    id: row.id,
    skuId: row.sku_id,
    levelCode: row.level_code,
    uom: row.uom,
    unitsPerLevel: row.units_per_level,
    parentLevelCode: row.parent_level_code,
    weightGrams: row.weight_grams,
    lengthMm: row.length_mm,
    widthMm: row.width_mm,
    heightMm: row.height_mm,
    volumeCm3: row.volume_cm3,
    barcode: row.barcode,
    isDefault: row.is_default,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProductClientOwnershipResponse(row: ProductClientOwnershipRow): ProductClientOwnershipResponse {
  return {
    id: row.id,
    productId: row.product_id,
    clientId: row.client_id,
    externalArticleNumber: row.external_article_number,
    status: row.status as ProductCategoryStatus,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProductDocumentResponse(row: ProductDocumentMetadataRow): ProductDocumentMetadataResponse {
  return {
    id: row.id,
    productId: row.product_id,
    documentType: row.document_type as ProductDocumentType,
    title: row.title,
    uri: row.uri,
    mimeType: row.mime_type,
    checksumSha256: row.checksum_sha256,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requiredRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new ConflictException(message);
  return row;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function optionalNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function deriveVolume(lengthMm: number | undefined, widthMm: number | undefined, heightMm: number | undefined): number | null {
  if (lengthMm === undefined || widthMm === undefined || heightMm === undefined) return null;
  return Math.ceil((lengthMm * widthMm * heightMm) / 1000);
}

interface IdCodeRow {
  id: string;
  code: string;
}

type ProductRow = IdCodeRow;
interface SkuRow extends IdCodeRow {
  product_id: string;
}

interface TimestampedRow {
  id: string;
  created_at: Date;
  updated_at: Date;
}

interface ProductCategoryRow extends TimestampedRow {
  parent_id: string | null;
  code: string;
  name: string;
  status: string;
  metadata: unknown;
}

interface ProductCategoryLinkRow {
  id: string;
  product_id: string;
  category_id: string;
  is_primary: boolean;
  created_at: Date;
}

interface ProductUomRow extends TimestampedRow {
  code: string;
  name: string;
  kind: string;
  decimals: number;
  is_active: boolean;
  metadata: unknown;
}

interface ProductUomConversionRow extends TimestampedRow {
  from_uom: string;
  to_uom: string;
  multiplier: string | number;
  product_id: string | null;
  sku_id: string | null;
  is_active: boolean;
  metadata: unknown;
}

interface SkuBarcodeRow extends TimestampedRow {
  warehouse_id: string | null;
  sku_id: string;
  barcode: string;
  barcode_type: string;
  is_primary: boolean;
  status: string;
  metadata: unknown;
}

interface SkuStorageRequirementRow extends TimestampedRow {
  sku_id: string;
  temperature_min_celsius: number | string | null;
  temperature_max_celsius: number | string | null;
  fragile: boolean;
  hazardous: boolean;
  oversized: boolean;
  stackable: boolean;
  requirements: unknown;
}

interface SkuPackagingLevelRow extends TimestampedRow {
  sku_id: string;
  level_code: string;
  uom: string;
  units_per_level: number;
  parent_level_code: string | null;
  weight_grams: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  volume_cm3: number | null;
  barcode: string | null;
  is_default: boolean;
  metadata: unknown;
}

interface ProductClientOwnershipRow extends TimestampedRow {
  product_id: string;
  client_id: string;
  external_article_number: string | null;
  status: string;
  metadata: unknown;
}

interface ProductDocumentMetadataRow extends TimestampedRow {
  product_id: string;
  document_type: string;
  title: string;
  uri: string;
  mime_type: string | null;
  checksum_sha256: string | null;
  metadata: unknown;
}
