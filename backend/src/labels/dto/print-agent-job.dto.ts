import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export class ClaimPrintJobDto {
  @ApiProperty({ example: 'PACK-PC-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  agentCode!: string;

  @ApiProperty({ example: 'generated-token-with-at-least-32-characters' })
  @IsString()
  @MinLength(32)
  @MaxLength(240)
  token!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;

  @ApiPropertyOptional({ example: '0.1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string;

  @ApiPropertyOptional({ example: 'PACK-PC-01' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  hostname?: string;

  @ApiPropertyOptional({ example: ['PACK-01', 'SHIP-01'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  printerCodes?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  acceptUnassignedJobs?: boolean;
}

export class ReportPrintJobResultDto {
  @ApiProperty({ example: 'PACK-PC-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  agentCode!: string;

  @ApiProperty({ example: 'generated-token-with-at-least-32-characters' })
  @IsString()
  @MinLength(32)
  @MaxLength(240)
  token!: string;

  @ApiProperty({ enum: ['PRINTING', 'PRINTED', 'FAILED', 'CANCELLED'], example: 'PRINTED' })
  @IsIn(['PRINTING', 'PRINTED', 'FAILED', 'CANCELLED'])
  status!: 'PRINTING' | 'PRINTED' | 'FAILED' | 'CANCELLED';

  @ApiPropertyOptional({ example: 'Printer timeout' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  errorMessage?: string;

  @ApiPropertyOptional({ example: { durationMs: 220 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
