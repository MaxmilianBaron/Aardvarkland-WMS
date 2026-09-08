import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RecallReportQueryDto {
  @ApiPropertyOptional({ example: 'LOT-2026-05-A' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  lotReference?: string;

  @ApiPropertyOptional({ example: 'SN-000123' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  serialNumber?: string;

  @ApiPropertyOptional({ example: 'SKU-ABC' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  skuReference?: string;

  @ApiPropertyOptional({ example: '22dd1ef0-5a33-4bd8-906f-efad35f9ddba' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ownerClientId?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
    return Boolean(value);
  })
  @IsBoolean()
  includeEvents?: boolean;

  @ApiPropertyOptional({ example: 500, default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}
