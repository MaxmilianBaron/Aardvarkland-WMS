import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOperationalIncidentDto {
  @ApiPropertyOptional({ example: 'Checked by warehouse lead; printer agent restart in progress.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
