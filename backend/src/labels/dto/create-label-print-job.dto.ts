import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateLabelPrintJobDto {
  @ApiProperty({
    description: 'Label template id or code within the same warehouse.',
    example: 'PARCEL-ZPL-DEFAULT',
  })
  @IsString()
  @MaxLength(80)
  templateReference!: string;

  @ApiPropertyOptional({ example: 'PACK-PRINTER-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  printerName?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  copies?: number;

  @ApiPropertyOptional({ example: { source: 'packing-station' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'parcel-label-main-p0001-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
