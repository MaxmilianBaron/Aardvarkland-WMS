import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RevokeRefreshTokenDto {
  @ApiPropertyOptional({ example: 'rt_...' })
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  revokeAll?: boolean;
}
