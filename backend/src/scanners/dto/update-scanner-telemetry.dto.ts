import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdateScannerTelemetryDto {
  @ApiPropertyOptional({ description: 'Last reported device battery level in percent.', example: 84, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number | null;

  @ApiPropertyOptional({ description: 'Last reported wireless signal strength in percent.', example: 72, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  signalStrength?: number | null;

  @ApiPropertyOptional({ example: 'TERMINAL', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  deviceMode?: string | null;

  @ApiPropertyOptional({ example: '1.0.0', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  appVersion?: string | null;

  @ApiPropertyOptional({ example: { source: 'rf-ui' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
