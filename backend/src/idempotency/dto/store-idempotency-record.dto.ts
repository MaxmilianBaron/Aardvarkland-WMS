import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { IdempotencyRecordStatus } from '../idempotency.types';

export class StoreIdempotencyRecordDto {
  @ApiProperty({ example: 'ERP_MAIN' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  sourceSystem!: string;

  @ApiPropertyOptional({ example: 'ORDER-10001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalId?: string | null;

  @ApiProperty({ example: 'erp-order-10001-create' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @ApiProperty({ example: 'sha256:8f14e45fceea167a5a36dedd4bea2543' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  requestHash!: string;

  @ApiPropertyOptional({ example: { status: 'created', id: 'ORDER-10001' } })
  responseBody?: unknown;

  @ApiPropertyOptional({ example: 'outbound_order' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string | null;

  @ApiPropertyOptional({ example: 'b1b6c820-dfde-4a67-8c52-03b6d197af6b' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  resourceId?: string | null;

  @ApiPropertyOptional({ enum: Object.values(IdempotencyRecordStatus), example: 'COMPLETED' })
  @IsOptional()
  @IsIn(Object.values(IdempotencyRecordStatus))
  status?: IdempotencyRecordStatus;
}
