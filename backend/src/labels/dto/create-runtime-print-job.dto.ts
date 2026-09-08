import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRuntimePrintJobDto {
  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  printerCode?: string;

  @ApiPropertyOptional({ example: 'PACK-PC-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  agentCode?: string;

  @ApiPropertyOptional({ example: 'LOCATION-QR' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateCode?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  copies?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;

  @ApiPropertyOptional({ example: { code: 'AARD1:LOC:MAIN:A-01-01', title: 'A-01-01' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: {
      widthMm: 100,
      heightMm: 150,
      dpi: 203,
      fields: [{ type: 'qr', x: 6, y: 20, width: 30, height: 30, binding: 'code' }],
    },
  })
  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>;

  @ApiPropertyOptional({ example: '^XA^FO40,40^FDTest^FS^XZ' })
  @IsOptional()
  @IsString()
  @MaxLength(64000)
  renderedZpl?: string;

  @ApiPropertyOptional({ example: 'runtime-print-job-main-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
