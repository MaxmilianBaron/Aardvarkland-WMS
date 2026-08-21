import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkInboxEventProcessedDto {
  @ApiPropertyOptional({ example: 'outbound_order' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  resourceType?: string;

  @ApiPropertyOptional({ example: 'resource-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  resourceId?: string;

  @ApiPropertyOptional({ example: { mappedOrderNumber: 'SO-100001' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
