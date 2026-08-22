import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePackingStationDto {
  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({ example: 'Packing Station 01' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationReference?: string;

  @ApiPropertyOptional({ example: { printer: 'PACK-PRINTER-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
