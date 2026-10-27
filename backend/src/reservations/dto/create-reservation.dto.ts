import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({
    description: 'StockQuant id. If the model has a code field, the code can be used too.',
    example: '74220478-2f74-4b82-8227-728ad6b5fef7',
  })
  @IsString()
  @MaxLength(120)
  stockQuantReference!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Outbound order id.',
    example: 'a1a58a52-45f6-4b07-a64a-1ad06e81bbf7',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  outboundOrderId?: string;

  @ApiPropertyOptional({
    description: 'Outbound order line id.',
    example: 'bda22e7d-1d83-4e86-b0af-5ff66d258a91',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  outboundOrderLineId?: string;

  @ApiPropertyOptional({
    description: '3PL owner/client reference. Can be a client code or id; metadata.ownerClientReference is also accepted.',
    example: 'CLIENT_A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { source: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
