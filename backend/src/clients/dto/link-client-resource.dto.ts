import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LinkClientResourceDto {
  @ApiProperty({ example: 'OUTBOUND_ORDER' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  resourceType!: string;

  @ApiProperty({ example: 'order-uuid-or-external-id' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  resourceId!: string;

  @ApiPropertyOptional({ example: 'SHOP-10001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalReference?: string;

  @ApiPropertyOptional({
    description: 'Allow moving an already-owned resource from another client to this client.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  allowOwnerTransfer?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes'].includes(value.toLowerCase());
  return Boolean(value);
}
