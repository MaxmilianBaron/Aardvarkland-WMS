import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignPickCartDto {
  @ApiPropertyOptional({ example: 'CART-01' })
  @IsString()
  @MaxLength(120)
  pickCartReference!: string;

  @ApiPropertyOptional({ example: 'user-id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedUserId?: string;
}
