import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestPutawayDto {
  @ApiPropertyOptional({
    description: 'Source StockQuant id.',
    example: '74220478-2f74-4b82-8227-728ad6b5fef7',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  stockQuantReference?: string;

  @ApiPropertyOptional({
    description: 'SKU id, code, or barcode when stockQuantReference is omitted.',
    example: 'ABC-123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({ description: 'Source staging/bin location.', example: 'RCV-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromLocationReference?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 'LOT-2026-05' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  batch?: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiry?: string;
}
