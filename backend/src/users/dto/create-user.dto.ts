import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { MIN_PASSWORD_LENGTH, PASSWORD_POLICY_MESSAGE } from '../../auth/password-policy';

export const USER_ROLE_CODES = ['WAREHOUSE_WORKER', 'WAREHOUSE_MANAGER', 'WMS_ADMIN'] as const;
export type UserRoleCode = typeof USER_ROLE_CODES[number];

export class CreateUserDto {
  @ApiProperty({ example: 'operator@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Warehouse Operator' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @ApiProperty({ example: 'Use-A-Unique-Strong-Password-42!' })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(128)
  @Matches(/[a-z]/, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(/[A-Z]/, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(/\d/, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(/[^A-Za-z0-9]/, { message: PASSWORD_POLICY_MESSAGE })
  password!: string;

  @ApiPropertyOptional({ enum: USER_ROLE_CODES, example: 'WAREHOUSE_WORKER' })
  @IsOptional()
  @IsIn(USER_ROLE_CODES)
  roleCode?: UserRoleCode;

  @ApiPropertyOptional({ example: 'MAIN' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  warehouseCode?: string;
}
