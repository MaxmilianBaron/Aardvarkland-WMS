import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export enum WorkContextRfMode {
  DESKTOP = 'DESKTOP',
  MOBILE = 'MOBILE',
  TERMINAL = 'TERMINAL',
}

export class UpdateWorkContextDto {
  @ApiProperty({ example: 'MAIN' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  warehouseId!: string;

  @ApiPropertyOptional({ example: 'PICK-A', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  zone?: string | null;

  @ApiPropertyOptional({ example: 'SHIFT-A', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  shiftCode?: string | null;

  @ApiPropertyOptional({ enum: WorkContextRfMode, example: WorkContextRfMode.TERMINAL })
  @IsOptional()
  @IsEnum(WorkContextRfMode)
  rfMode?: WorkContextRfMode;

  @ApiPropertyOptional({ example: 'RF-MAIN-01', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  scannerDeviceReference?: string | null;

  @ApiPropertyOptional({ example: { source: 'account-menu' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
