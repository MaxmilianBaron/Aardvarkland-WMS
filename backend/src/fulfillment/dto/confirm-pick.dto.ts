import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmPickDto {
  @ApiPropertyOptional({
    description: '3PL owner client id/code used to enforce restricted client access.',
    example: 'CLIENT_A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({
    description: 'Fallback outbound order id or order number when task context is not available.',
    example: 'SO-100001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderReference?: string;

  @ApiPropertyOptional({
    description: 'Fallback outbound line id or line number when task context is not available.',
    example: '1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lineReference?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    example: ['SN-0001'],
    description: 'Serials picked for this task/line. Required per picked unit when SKU metadata traceability.serialRequired is true.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional({ example: { scanner: 'SCAN-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-confirm-pick-task-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
