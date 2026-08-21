import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { ReservationStatus } from '../reservations.types';

export class ListReservationsQueryDto {
  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

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
    description: 'Limit reservations to resources owned by this 3PL client code/id.',
    example: 'CLIENT_A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

}
