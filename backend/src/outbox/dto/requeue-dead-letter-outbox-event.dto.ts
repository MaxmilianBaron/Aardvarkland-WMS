import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RequeueDeadLetterOutboxEventDto {
  @ApiProperty({ example: 'Carrier outage resolved; replaying integration event after manual review.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ example: 30, minimum: 0, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400)
  availableInSeconds?: number;

  @ApiPropertyOptional({ example: true, description: 'Reset delivery attempts to zero before replaying the event.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  resetAttempts?: boolean;
}
