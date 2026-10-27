import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePutawayTaskDto {
  @ApiProperty({
    description: 'Source StockQuant id.',
    example: '74220478-2f74-4b82-8227-728ad6b5fef7',
  })
  @IsString()
  @MaxLength(120)
  stockQuantReference!: string;

  @ApiPropertyOptional({
    description: 'Target location id or code. If omitted, putaway suggestion is used.',
    example: 'A-01-01',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toLocationReference?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 'operator@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  assignedUserReference?: string;

  @ApiPropertyOptional({ example: { scanner: 'RF-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
