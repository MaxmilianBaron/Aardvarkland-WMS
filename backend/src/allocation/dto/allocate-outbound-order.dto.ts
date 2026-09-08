import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { AllocationStrategy } from '../allocation.types';

export class AllocateOutboundOrderDto {
  @ApiPropertyOptional({
    description: 'Optional user id to pre-assign generated PICK tasks.',
    example: 'db08851b-1714-4be2-93dc-99d18fd9649d',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedToUserId?: string;

  @ApiPropertyOptional({
    enum: AllocationStrategy,
    default: AllocationStrategy.FEFO,
    description: 'Allocation strategy: FEFO by expiry date, FIFO by oldest stock, or LIFO by newest stock.',
  })
  @IsOptional()
  @IsEnum(AllocationStrategy)
  allocationStrategy?: AllocationStrategy;

  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { wave: 'WAVE-1' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
