export const ProductCategoryStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductCategoryStatus = (typeof ProductCategoryStatus)[keyof typeof ProductCategoryStatus];

export const ProductUomKind = {
  EACH: 'EACH',
  CASE: 'CASE',
  PALLET: 'PALLET',
  WEIGHT: 'WEIGHT',
  VOLUME: 'VOLUME',
  LENGTH: 'LENGTH',
} as const;
export type ProductUomKind = (typeof ProductUomKind)[keyof typeof ProductUomKind];

export const SkuBarcodeType = {
  INTERNAL: 'INTERNAL',
  EAN13: 'EAN13',
  UPC: 'UPC',
  GTIN: 'GTIN',
  SUPPLIER: 'SUPPLIER',
  CLIENT: 'CLIENT',
} as const;
export type SkuBarcodeType = (typeof SkuBarcodeType)[keyof typeof SkuBarcodeType];

export const ProductDocumentType = {
  IMAGE: 'IMAGE',
  MSDS: 'MSDS',
  SPECIFICATION: 'SPECIFICATION',
  QUALITY_CERTIFICATE: 'QUALITY_CERTIFICATE',
  CUSTOMS: 'CUSTOMS',
  OTHER: 'OTHER',
} as const;
export type ProductDocumentType = (typeof ProductDocumentType)[keyof typeof ProductDocumentType];

export interface ProductCategoryResponse {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  status: ProductCategoryStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductCategoryLinkResponse {
  id: string;
  productId: string;
  categoryId: string;
  isPrimary: boolean;
  createdAt: Date;
}

export interface ProductUomResponse {
  id: string;
  code: string;
  name: string;
  kind: ProductUomKind;
  decimals: number;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductUomConversionResponse {
  id: string;
  fromUom: string;
  toUom: string;
  multiplier: string;
  productId: string | null;
  skuId: string | null;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkuBarcodeResponse {
  id: string;
  warehouseId: string | null;
  skuId: string;
  barcode: string;
  barcodeType: SkuBarcodeType;
  isPrimary: boolean;
  status: ProductCategoryStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkuStorageRequirementResponse {
  id: string;
  skuId: string;
  temperatureMinCelsius: number | null;
  temperatureMaxCelsius: number | null;
  fragile: boolean;
  hazardous: boolean;
  oversized: boolean;
  stackable: boolean;
  requirements: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkuPackagingLevelResponse {
  id: string;
  skuId: string;
  levelCode: string;
  uom: string;
  unitsPerLevel: number;
  parentLevelCode: string | null;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  volumeCm3: number | null;
  barcode: string | null;
  isDefault: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductClientOwnershipResponse {
  id: string;
  productId: string;
  clientId: string;
  externalArticleNumber: string | null;
  status: ProductCategoryStatus;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductDocumentMetadataResponse {
  id: string;
  productId: string;
  documentType: ProductDocumentType;
  title: string;
  uri: string;
  mimeType: string | null;
  checksumSha256: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}
