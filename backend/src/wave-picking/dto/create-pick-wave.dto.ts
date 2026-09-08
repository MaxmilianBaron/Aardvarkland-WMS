import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePickWaveDto {
  @ApiPropertyOptional({ example: 'WAVE-20260511-AM' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  waveNumber?: string;

  @ApiPropertyOptional({ example: 'BATCH' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  strategy?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;

  @ApiPropertyOptional({ example: 'CARRIER_A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @ApiPropertyOptional({ example: 'EXPRESS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceLevel?: string;

  @ApiPropertyOptional({ example: 'ZONE-A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  zone?: string;

  @ApiPropertyOptional({ example: '2026-05-11T18:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  cutoffAt?: string;

  @ApiPropertyOptional({ type: [String], example: ['SO-100001', 'SO-100002'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  outboundOrderReferences?: string[];

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxOrders?: number;


  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { planner: 'morning-cutoff' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
