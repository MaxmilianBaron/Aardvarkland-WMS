import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReplayDeadLetterDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({ example: 'Credentials fixed; replaying from ops center.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ example: { replayedFrom: 'ops-center' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
