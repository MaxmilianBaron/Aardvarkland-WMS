import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientSkuAliasDto {
  @ApiProperty({ example: 'CLIENT-SKU-123' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  clientSku!: string;

  @ApiPropertyOptional({ example: '8590000000012' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientBarcode?: string;

  @ApiPropertyOptional({ example: 'internal-sku-id-or-code' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({ example: 'Client-facing SKU description' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
