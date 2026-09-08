import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { normalizeOffsetPagination } from '../common';
import { PrismaService } from '../database';
import { Prisma } from '../generated/prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateSkuDto } from './dto/create-sku.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ListSkusQueryDto } from './dto/list-skus-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import {
  ProductResponse,
  ProductSkuResponse,
  ProductStatus,
  SkuDimensionsResponse,
  SkuProductResponse,
  SkuResponse,
  SkuStatus,
} from './products.types';

const productInclude: ProductInclude = {
  skus: {
    orderBy: { code: 'asc' },
  },
};

const skuInclude: SkuInclude = {
  product: true,
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findProducts(query: ListProductsQueryDto): Promise<ProductResponse[]> {
    const search = normalizeSearch(query.search);
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });
    const products = await this.getClient().product.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: { code: 'asc' },
      take: page.take,
      skip: page.skip,
    });

    return products.map(toProductResponse);
  }

  async findProduct(productReference: string): Promise<ProductResponse> {
    const product = await this.resolveProduct(productReference);

    return toProductResponse(product);
  }

  async createProduct(dto: CreateProductDto, actor: AuthenticatedUser): Promise<ProductResponse> {
    try {
      const product = await this.getClient().product.create({
        data: {
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: normalizeNullableString(dto.description),
          status: dto.status ?? ProductStatus.ACTIVE,
          metadata: toJsonInput(dto.metadata),
        },
        include: productInclude,
      });

      await this.writeProductAudit(actor, 'product.created', product);

      return toProductResponse(product);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Product code already exists');
      }

      throw error;
    }
  }

  async updateProduct(
    productReference: string,
    dto: UpdateProductDto,
    actor: AuthenticatedUser,
  ): Promise<ProductResponse> {
    const existingProduct = await this.resolveProduct(productReference);
    const metadata = dto.metadata === undefined ? undefined : toJsonInput(dto.metadata);

    try {
      const product = await this.getClient().product.update({
        where: { id: existingProduct.id },
        data: {
          ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined
            ? {}
            : { description: normalizeNullableString(dto.description) }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(metadata === undefined ? {} : { metadata }),
        },
        include: productInclude,
      });

      await this.writeProductAudit(actor, 'product.updated', product);

      return toProductResponse(product);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Product code already exists');
      }

      throw error;
    }
  }

  async findSkus(query: ListSkusQueryDto): Promise<SkuResponse[]> {
    const search = normalizeSearch(query.search);
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });
    const productId = query.productReference
      ? (await this.resolveProduct(query.productReference)).id
      : undefined;
    const skus = await this.getClient().sku.findMany({
      where: {
        ...(productId === undefined ? {} : { productId }),
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: skuInclude,
      orderBy: { code: 'asc' },
      take: page.take,
      skip: page.skip,
    });

    return skus.map(toSkuResponse);
  }

  async findSku(skuReference: string): Promise<SkuResponse> {
    const sku = await this.resolveSku(skuReference);

    return toSkuResponse(sku);
  }

  async createSku(dto: CreateSkuDto, actor: AuthenticatedUser): Promise<SkuResponse> {
    const product = await this.resolveProduct(dto.productReference);

    try {
      const sku = await this.getClient().sku.create({
        data: {
          productId: product.id,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          barcode: normalizeNullableString(dto.barcode),
          uom: normalizeCode(dto.uom ?? 'EA'),
          weightGrams: dto.weightGrams,
          status: dto.status ?? SkuStatus.ACTIVE,
          metadata: buildSkuCreateMetadata(dto.metadata, dto.dimensions),
        },
        include: skuInclude,
      });

      await this.writeSkuAudit(actor, 'sku.created', sku);

      return toSkuResponse(sku);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('SKU code or barcode already exists');
      }

      throw error;
    }
  }

  async updateSku(
    skuReference: string,
    dto: UpdateSkuDto,
    actor: AuthenticatedUser,
  ): Promise<SkuResponse> {
    const existingSku = await this.resolveSku(skuReference);
    const productId = dto.productReference
      ? (await this.resolveProduct(dto.productReference)).id
      : undefined;

    try {
      const metadata = buildSkuUpdateMetadata(existingSku.metadata, dto.metadata, dto.dimensions);
      const sku = await this.getClient().sku.update({
        where: { id: existingSku.id },
        data: {
          ...(productId === undefined ? {} : { productId }),
          ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.barcode === undefined ? {} : { barcode: normalizeNullableString(dto.barcode) }),
          ...(dto.uom === undefined ? {} : { uom: normalizeCode(dto.uom) }),
          ...(dto.weightGrams === undefined ? {} : { weightGrams: dto.weightGrams }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(metadata === undefined ? {} : { metadata }),
        },
        include: skuInclude,
      });

      await this.writeSkuAudit(actor, 'sku.updated', sku);

      return toSkuResponse(sku);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('SKU code or barcode already exists');
      }

      throw error;
    }
  }

  private getClient(): ProductsPrismaClient {
    return this.prisma;
  }

  private async resolveProduct(productReference: string): Promise<ProductWithSkus> {
    const product = await this.getClient().product.findFirst({
      where: productReferenceWhere(productReference),
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Product was not found');
    }

    return product;
  }

  private async resolveSku(skuReference: string): Promise<SkuWithProduct> {
    const sku = await this.getClient().sku.findFirst({
      where: skuReferenceWhere(skuReference),
      include: skuInclude,
    });

    if (!sku) {
      throw new NotFoundException('SKU was not found');
    }

    return sku;
  }

  private async writeProductAudit(
    actor: AuthenticatedUser,
    action: string,
    product: ProductRecord,
  ): Promise<void> {
    await this.getClient().auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId: null,
        action,
        resourceType: 'product',
        resourceId: product.id,
        metadata: {
          code: product.code,
          status: product.status,
        },
      },
    });
  }

  private async writeSkuAudit(
    actor: AuthenticatedUser,
    action: string,
    sku: SkuRecord,
  ): Promise<void> {
    await this.getClient().auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId: null,
        action,
        resourceType: 'sku',
        resourceId: sku.id,
        metadata: {
          productId: sku.productId,
          code: sku.code,
          status: sku.status,
        },
      },
    });
  }
}

function toProductResponse(product: ProductWithSkus): ProductResponse {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    status: product.status,
    metadata: product.metadata,
    skus: product.skus.map(toProductSkuResponse),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toProductSkuResponse(sku: SkuRecord): ProductSkuResponse {
  return {
    id: sku.id,
    productId: sku.productId,
    code: sku.code,
    name: sku.name,
    barcode: sku.barcode,
    uom: sku.uom,
    weightGrams: sku.weightGrams,
    dimensions: readSkuDimensions(sku.metadata),
    metadata: sku.metadata,
    status: sku.status,
    createdAt: sku.createdAt,
    updatedAt: sku.updatedAt,
  };
}

function toSkuResponse(sku: SkuWithProduct): SkuResponse {
  return {
    id: sku.id,
    productId: sku.productId,
    code: sku.code,
    name: sku.name,
    barcode: sku.barcode,
    uom: sku.uom,
    weightGrams: sku.weightGrams,
    dimensions: readSkuDimensions(sku.metadata),
    metadata: sku.metadata,
    status: sku.status,
    product: toSkuProductResponse(sku.product),
    createdAt: sku.createdAt,
    updatedAt: sku.updatedAt,
  };
}

function toSkuProductResponse(product: ProductRecord): SkuProductResponse {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    status: product.status,
  };
}

function productReferenceWhere(reference: string): ProductWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function skuReferenceWhere(reference: string): SkuWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeSearch(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? undefined : normalized;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}


function buildSkuCreateMetadata(
  metadata: Record<string, unknown> | undefined,
  dimensions: SkuDimensionsInput | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  return toJsonInput(applySkuDimensions(metadata, dimensions));
}

function buildSkuUpdateMetadata(
  existingMetadata: unknown,
  metadata: Record<string, unknown> | null | undefined,
  dimensions: SkuDimensionsInput | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (metadata === undefined && dimensions === undefined) {
    return undefined;
  }

  const baseMetadata = metadata === undefined ? toRecordOrEmpty(existingMetadata) : metadata;

  if (dimensions === undefined) {
    return toJsonInput(baseMetadata);
  }

  return toJsonInput(applySkuDimensions(baseMetadata ?? {}, dimensions));
}

function applySkuDimensions(
  metadata: Record<string, unknown> | null | undefined,
  dimensions: SkuDimensionsInput | null | undefined,
): Record<string, unknown> | null | undefined {
  if (dimensions === undefined) {
    return metadata;
  }

  const nextMetadata = { ...(metadata ?? {}) };

  if (dimensions === null) {
    delete nextMetadata['dimensions'];
    return Object.keys(nextMetadata).length === 0 ? null : nextMetadata;
  }

  const normalizedDimensions = normalizeSkuDimensions(dimensions);

  if (!normalizedDimensions) {
    delete nextMetadata['dimensions'];
  } else {
    nextMetadata['dimensions'] = normalizedDimensions;
  }

  return nextMetadata;
}

function normalizeSkuDimensions(
  dimensions: SkuDimensionsInput,
): Record<string, number> | null {
  const lengthMm = toOptionalNonNegativeInteger(dimensions.lengthMm);
  const widthMm = toOptionalNonNegativeInteger(dimensions.widthMm);
  const heightMm = toOptionalNonNegativeInteger(dimensions.heightMm);
  const derivedVolumeCm3 =
    dimensions.volumeCm3 === undefined &&
    lengthMm !== undefined &&
    widthMm !== undefined &&
    heightMm !== undefined
      ? Math.ceil((lengthMm * widthMm * heightMm) / 1000)
      : undefined;
  const volumeCm3 = toOptionalNonNegativeInteger(dimensions.volumeCm3 ?? derivedVolumeCm3);
  const normalized: Record<string, number> = {};

  if (lengthMm !== undefined) normalized['lengthMm'] = lengthMm;
  if (widthMm !== undefined) normalized['widthMm'] = widthMm;
  if (heightMm !== undefined) normalized['heightMm'] = heightMm;
  if (volumeCm3 !== undefined) normalized['volumeCm3'] = volumeCm3;

  return Object.keys(normalized).length === 0 ? null : normalized;
}

function readSkuDimensions(metadata: unknown): SkuDimensionsResponse | null {
  const record = toRecordOrNull(metadata);
  const dimensions = toRecordOrNull(record?.['dimensions']);

  if (!dimensions) {
    return null;
  }

  const response: SkuDimensionsResponse = {
    lengthMm: readOptionalInteger(dimensions['lengthMm']),
    widthMm: readOptionalInteger(dimensions['widthMm']),
    heightMm: readOptionalInteger(dimensions['heightMm']),
    volumeCm3: readOptionalInteger(dimensions['volumeCm3']),
  };

  return Object.values(response).some((value) => value !== null) ? response : null;
}

function toRecordOrEmpty(value: unknown): Record<string, unknown> {
  return toRecordOrNull(value) ?? {};
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toOptionalNonNegativeInteger(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  return Math.max(normalized, 0);
}

function readOptionalInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(Math.trunc(value), 0);
  }

  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

interface ProductsPrismaClient {
  product: ProductDelegate;
  sku: SkuDelegate;
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

interface ProductDelegate {
  findMany(args: {
    where: ProductWhereInput;
    include: ProductInclude;
    orderBy: { code: 'asc' };
    take?: number;
    skip?: number;
  }): Promise<ProductWithSkus[]>;
  findFirst(args: {
    where: ProductWhereInput;
    include: ProductInclude;
  }): Promise<ProductWithSkus | null>;
  create(args: { data: ProductCreateInput; include: ProductInclude }): Promise<ProductWithSkus>;
  update(args: {
    where: { id: string };
    data: ProductUpdateInput;
    include: ProductInclude;
  }): Promise<ProductWithSkus>;
}

interface SkuDelegate {
  findMany(args: {
    where: SkuWhereInput;
    include: SkuInclude;
    orderBy: { code: 'asc' };
    take?: number;
    skip?: number;
  }): Promise<SkuWithProduct[]>;
  findFirst(args: { where: SkuWhereInput; include: SkuInclude }): Promise<SkuWithProduct | null>;
  create(args: { data: SkuCreateInput; include: SkuInclude }): Promise<SkuWithProduct>;
  update(args: {
    where: { id: string };
    data: SkuUpdateInput;
    include: SkuInclude;
  }): Promise<SkuWithProduct>;
}

type ProductWhereInput = Record<string, unknown>;
type SkuWhereInput = Record<string, unknown>;
type ProductJsonInput = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

interface SkuDimensionsInput {
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  volumeCm3?: number;
}

interface ProductInclude {
  skus: {
    orderBy: { code: 'asc' };
  };
}

interface SkuInclude {
  product: true;
}

interface ProductCreateInput {
  code: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  metadata?: ProductJsonInput;
}

interface ProductUpdateInput {
  code?: string;
  name?: string;
  description?: string | null;
  status?: ProductStatus;
  metadata?: ProductJsonInput;
}

interface SkuCreateInput {
  productId: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
  weightGrams?: number;
  status: SkuStatus;
  metadata?: ProductJsonInput;
}

interface SkuUpdateInput {
  productId?: string;
  code?: string;
  name?: string;
  barcode?: string | null;
  uom?: string;
  weightGrams?: number | null;
  status?: SkuStatus;
  metadata?: ProductJsonInput;
}

interface ProductRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface SkuRecord {
  id: string;
  productId: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
  weightGrams: number | null;
  metadata: unknown;
  status: SkuStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductWithSkus extends ProductRecord {
  skus: SkuRecord[];
}

interface SkuWithProduct extends SkuRecord {
  product: ProductRecord;
}
