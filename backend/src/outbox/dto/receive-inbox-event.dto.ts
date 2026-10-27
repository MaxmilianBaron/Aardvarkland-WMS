import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReceiveInboxEventDto {
  @ApiPropertyOptional({ example: 'ERP_MAIN' })
  @IsString()
  @MaxLength(80)
  sourceSystem!: string;

  @ApiPropertyOptional({ example: 'evt-100001' })
  @IsString()
  @MaxLength(160)
  externalEventId!: string;

  @ApiPropertyOptional({ example: 'ORDER_CREATED' })
  @IsString()
  @MaxLength(160)
  eventType!: string;

  @ApiPropertyOptional({ example: { orderNumber: 'ORD-100001' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { correlationId: 'abc' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, unknown>;

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
}
