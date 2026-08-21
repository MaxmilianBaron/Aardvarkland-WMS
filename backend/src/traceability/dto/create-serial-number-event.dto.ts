import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSerialNumberEventDto {
  @ApiProperty({ example: 'RECEIVED' })
  @IsString()
  @MaxLength(80)
  eventType!: string;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromLocationReference?: string;

  @ApiPropertyOptional({ example: 'B-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toLocationReference?: string;

  @ApiPropertyOptional({ example: 'stock-quant-id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stockQuantId?: string;

  @ApiPropertyOptional({ example: 'INBOUND_SHIPMENT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceType?: string;

  @ApiPropertyOptional({ example: 'reference-id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceId?: string;

  @ApiPropertyOptional({ example: '2026-05-12T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
