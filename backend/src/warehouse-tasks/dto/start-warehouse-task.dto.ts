import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartWarehouseTaskDto {
  @ApiPropertyOptional({ example: 'operator@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  assignedUserReference?: string;

  @ApiPropertyOptional({ example: { device: 'scanner-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-start-task-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
