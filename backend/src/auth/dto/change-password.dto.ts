import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_POLICY_MESSAGE } from '../password-policy';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Current-Password-42!' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword!: string;

  @ApiProperty({ example: 'New-Unique-Password-42!' })
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  @Matches(/[a-z]/, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(/[A-Z]/, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(/\d/, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(/[^A-Za-z0-9]/, { message: PASSWORD_POLICY_MESSAGE })
  newPassword!: string;
}
