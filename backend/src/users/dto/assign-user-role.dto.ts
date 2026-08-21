import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

import { USER_ROLE_CODES, UserRoleCode } from './create-user.dto';

export class AssignUserRoleDto {
  @ApiProperty({ enum: USER_ROLE_CODES, example: 'WAREHOUSE_WORKER' })
  @IsIn(USER_ROLE_CODES)
  roleCode!: UserRoleCode;

  @ApiProperty({ example: 'MAIN' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  warehouseCode!: string;
}
