import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CheckIdempotencyDto {
  @ApiProperty({ example: 'ERP_MAIN' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  sourceSystem!: string;

  @ApiPropertyOptional({ example: 'ORDER-10001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalId?: string | null;

  @ApiProperty({ example: 'erp-order-10001-create' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @ApiProperty({ example: 'sha256:8f14e45fceea167a5a36dedd4bea2543' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  requestHash!: string;
}
