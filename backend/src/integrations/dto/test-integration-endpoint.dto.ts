import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TestIntegrationEndpointDto {
  @ApiPropertyOptional({ example: 'WMS_INTEGRATION_PING' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventType?: string;

  @ApiPropertyOptional({ example: '/health' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @ApiPropertyOptional({ example: { ping: true } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
