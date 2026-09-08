import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkInboxEventFailedDto {
  @ApiProperty({ example: 'Payload cannot be mapped to an outbound order.' })
  @IsString()
  @MaxLength(1000)
  errorMessage!: string;

  @ApiProperty({ example: { parser: 'erp-v1' }, required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
