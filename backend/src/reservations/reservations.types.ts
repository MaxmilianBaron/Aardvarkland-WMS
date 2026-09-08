import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ReservationStatus = {
  ACTIVE: 'ACTIVE',
  PICKED: 'PICKED',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
} as const;

export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export class ReservationResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  warehouseId!: string;

  @ApiPropertyOptional({ nullable: true })
  stockQuantId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reservedStockQuantId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  outboundOrderId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  outboundOrderLineId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  skuId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku!: string | null;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ enum: ReservationStatus, example: ReservationStatus.ACTIVE })
  status!: string;

  @ApiPropertyOptional({ nullable: true })
  createdByUserId!: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  metadata!: unknown;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ReservationListResponse {
  @ApiProperty({ type: [ReservationResponse] })
  reservations!: ReservationResponse[];
}
