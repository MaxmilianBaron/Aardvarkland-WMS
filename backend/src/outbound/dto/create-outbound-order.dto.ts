import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { OutboundStatus } from '../outbound.types';

export class CreateOutboundOrderLineDto {
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  lineNumber?: string;

  @ApiProperty({ example: 'SKU-100001' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sku!: string;

  @ApiPropertyOptional({ example: 'Black hoodie L' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderedQuantity!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pickedQuantity?: number;

  @ApiPropertyOptional({
    description: 'Existing parcel id or tracking number in the same warehouse.',
    example: 'PKG-100001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  parcelReference?: string;

  @ApiPropertyOptional({ example: { wave: 'WAVE-1' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateOutboundOrderDto {
  @ApiProperty({ example: 'SO-100001' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  orderNumber!: string;

  @ApiPropertyOptional({ enum: OutboundStatus, example: OutboundStatus.CREATED })
  @IsOptional()
  @IsEnum(OutboundStatus)
  status?: OutboundStatus;

  @ApiPropertyOptional({ example: 'CUST-REF-42' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerReference?: string;

  @ApiPropertyOptional({ example: 'Jane Receiver' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientName?: string;

  @ApiPropertyOptional({ example: 'CARRIER_A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @ApiPropertyOptional({ example: 'EXPRESS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceLevel?: string;

  @ApiPropertyOptional({ example: '2026-05-11T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  shipBy?: string;


  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { source: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [CreateOutboundOrderLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOutboundOrderLineDto)
  lines?: CreateOutboundOrderLineDto[];
}
