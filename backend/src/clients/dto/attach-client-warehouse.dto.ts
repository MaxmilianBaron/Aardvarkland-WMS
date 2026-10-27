import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AttachClientWarehouseDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'STANDARD_3PL' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultBillingProfile?: string;

  @ApiPropertyOptional({ example: 'WMS-CUST-CLIENT_A-MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
