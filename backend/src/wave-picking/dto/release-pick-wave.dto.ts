import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReleasePickWaveDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  createMissingPickTasks?: boolean;

  @ApiPropertyOptional({ example: 'CART-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickCartReference?: string;
}
