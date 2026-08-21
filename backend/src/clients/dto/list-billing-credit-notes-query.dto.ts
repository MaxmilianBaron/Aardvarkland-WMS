import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { BillingCreditNoteStatus } from '../clients.types';

export class ListBillingCreditNotesQueryDto {
  @ApiPropertyOptional({ enum: BillingCreditNoteStatus })
  @IsOptional()
  @IsEnum(BillingCreditNoteStatus)
  status?: BillingCreditNoteStatus;

  @ApiPropertyOptional({ example: 'INV-CLIENT_A-2026-000001', description: 'Filter by invoice id or invoice number.' })
  @IsOptional()
  @IsString()
  invoiceReference?: string;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
