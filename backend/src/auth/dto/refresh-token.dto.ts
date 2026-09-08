import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'rt_...' })
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  refreshToken!: string;
}
