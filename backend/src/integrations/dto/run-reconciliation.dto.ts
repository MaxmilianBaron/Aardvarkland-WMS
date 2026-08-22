import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunReconciliationDto {
  @ApiPropertyOptional({ example: 'ERP_MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalSystemReference?: string;

  @ApiPropertyOptional({ example: 'OUTBOUND_ORDER' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;

  @ApiPropertyOptional({ example: 'MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseReference?: string;

  @ApiPropertyOptional({ example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { requestedFrom: 'ops-center' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
