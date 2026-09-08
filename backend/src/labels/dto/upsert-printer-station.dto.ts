import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertPrinterStationDto {
  @ApiProperty({ example: 'PACK-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Packing station 01 printer' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ enum: ['TCP_9100', 'WINDOWS_RAW'], example: 'TCP_9100' })
  @IsOptional()
  @IsIn(['TCP_9100', 'WINDOWS_RAW'])
  protocol?: 'TCP_9100' | 'WINDOWS_RAW';

  @ApiPropertyOptional({ example: '192.168.1.50' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  host?: string;

  @ApiPropertyOptional({ example: 9100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ example: 'Zebra ZD421' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  windowsPrinterName?: string;

  @ApiPropertyOptional({ example: 203 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(150)
  @Max(600)
  dpi?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(300)
  labelWidthMm?: number;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(300)
  labelHeightMm?: number;

  @ApiPropertyOptional({ example: 'LOCATION-QR' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultTemplateCode?: string;

  @ApiPropertyOptional({ example: { zone: 'PACKING' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
