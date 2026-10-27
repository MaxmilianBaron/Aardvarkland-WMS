export const ProductStatus = {
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  DISCONTINUED: 'DISCONTINUED',
} as const;

export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const SkuStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type SkuStatus = (typeof SkuStatus)[keyof typeof SkuStatus];

export interface SkuDimensionsResponse {
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  volumeCm3: number | null;
}

export interface ProductSkuResponse {
  id: string;
  productId: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
  weightGrams: number | null;
  dimensions: SkuDimensionsResponse | null;
  metadata: unknown;
  status: SkuStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  metadata: unknown;
  skus: ProductSkuResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SkuProductResponse {
  id: string;
  code: string;
  name: string;
  status: ProductStatus;
}

export interface SkuResponse {
  id: string;
  productId: string;
  code: string;
  name: string;
  barcode: string | null;
  uom: string;
  weightGrams: number | null;
  dimensions: SkuDimensionsResponse | null;
  metadata: unknown;
  status: SkuStatus;
  product: SkuProductResponse;
  createdAt: Date;
  updatedAt: Date;
}
