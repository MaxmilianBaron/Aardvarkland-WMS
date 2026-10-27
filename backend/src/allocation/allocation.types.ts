import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ReservationResponse } from '../reservations/reservations.types';

export const AllocationStrategy = {
  FEFO: 'FEFO',
  FIFO: 'FIFO',
  LIFO: 'LIFO',
} as const;

export type AllocationStrategy = (typeof AllocationStrategy)[keyof typeof AllocationStrategy];

export class AllocationLineResponse {
  @ApiProperty()
  outboundOrderLineId!: string;

  @ApiPropertyOptional({ nullable: true })
  lineNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku!: string | null;

  @ApiProperty({ example: 3 })
  orderedQuantity!: number;

  @ApiProperty({ example: 0 })
  pickedQuantity!: number;

  @ApiProperty({ example: 1 })
  alreadyReservedQuantity!: number;

  @ApiProperty({ example: 2 })
  allocatedQuantity!: number;

  @ApiProperty({ example: 0 })
  remainingQuantity!: number;
}

export class AllocationTaskResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;
}

export class AllocationMovementResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;
}

export class AllocationResponse {
  @ApiProperty()
  warehouseId!: string;

  @ApiProperty()
  outboundOrderId!: string;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [AllocationLineResponse] })
  lines!: AllocationLineResponse[];

  @ApiProperty({ type: [ReservationResponse] })
  reservations!: ReservationResponse[];

  @ApiProperty({ type: [AllocationTaskResponse] })
  tasks!: AllocationTaskResponse[];

  @ApiProperty({ type: [AllocationMovementResponse] })
  movements!: AllocationMovementResponse[];
}
