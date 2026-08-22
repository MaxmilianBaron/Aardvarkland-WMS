import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveScanDto {
  @ApiProperty({ example: 'AARD1:SKU:MAIN:ABC123' })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  scannedValue!: string;

  @ApiPropertyOptional({ example: { source: 'rf-ui' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
