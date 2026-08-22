import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class FailWarehouseTaskDto {
  @ApiProperty({ example: 'Source location is empty' })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ example: { exceptionCode: 'EMPTY_BIN' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
