import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { LabelTemplateType } from '../labels.types';

export class CreateLabelTemplateDto {
  @ApiProperty({ example: 'PARCEL-ZPL-DEFAULT' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Default parcel ZPL label' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: LabelTemplateType, example: LabelTemplateType.PARCEL })
  @IsEnum(LabelTemplateType)
  type!: LabelTemplateType;

  @ApiProperty({
    example: '^XA^FO40,40^A0N,40,40^FD{{trackingNumber}}^FS^XZ',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64000)
  content!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { language: 'ZPL', size: '100x150mm' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
