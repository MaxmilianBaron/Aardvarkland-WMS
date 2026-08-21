import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertPrintAgentDto {
  @ApiProperty({ example: 'PACK-PC-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Packing PC 01' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'generated-token-with-at-least-32-characters' })
  @IsString()
  @MinLength(32)
  @MaxLength(240)
  token!: string;

  @ApiPropertyOptional({ example: '0.1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string;

  @ApiPropertyOptional({ example: 'PACK-PC-01' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  hostname?: string;

  @ApiPropertyOptional({ example: ['PACK-01', 'SHIP-01'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  printerCodes?: string[];

  @ApiPropertyOptional({ example: { room: 'Packing' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
