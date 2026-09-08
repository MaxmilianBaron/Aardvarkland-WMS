import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateScannerScanDto {
  @ApiProperty({ example: 'PKG-100001' })
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  value!: string;

  @ApiPropertyOptional({ example: 'CODE128' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  symbology?: string;

  @ApiPropertyOptional({ example: 'RECEIVE' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  operation?: string;

  @ApiPropertyOptional({ example: { deviceBattery: 83 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
