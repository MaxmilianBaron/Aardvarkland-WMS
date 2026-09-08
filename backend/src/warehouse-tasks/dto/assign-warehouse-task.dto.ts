import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignWarehouseTaskDto {
  @ApiPropertyOptional({ example: 'operator@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  assignedUserReference?: string;

  @ApiPropertyOptional({ example: { device: 'scanner-01', reason: 'manual assignment' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
