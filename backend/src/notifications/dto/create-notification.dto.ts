import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationType } from '../notifications.types';

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationType, example: NotificationType.INFO })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ example: 'Inbound delay detected' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @ApiProperty({ example: 'Receiving lane RCV-01 has parcels waiting for more than 30 minutes.' })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({ example: { lane: 'RCV-01', severity: 'medium' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
