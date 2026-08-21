import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseCarrierManifestDto {
  @ApiPropertyOptional({ example: 'CARRIER_A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @ApiPropertyOptional({ example: 'STANDARD' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceLevel?: string;

  @ApiPropertyOptional({ example: { closedBy: 'end-of-day-job' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
